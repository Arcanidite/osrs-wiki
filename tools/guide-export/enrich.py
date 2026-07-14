#!/usr/bin/env python3
"""Enrich a progression-router plan into a guide-chain guide JSON.

Reads a plan (from plan.mjs) on stdin, enriches each step with render metadata,
and emits a guide-chain guide {id,name,description,steps[]} on stdout.

Pipeline (S7): load -> burndownResolve -> bank-split -> routeMulti(greedy) ->
  weaveOverlays -> detach-overlays -> hub_batches -> topo_order ->
  insert_supply_steps -> re-attach -> phased_steps_with_steer -> emit
hub_batches runs BEFORE topo_order (S7 resolves sequencer OQ-5): topo is the
dependency guard, so a hub reorder that violates a dep (skill/tag/quest) gets
corrected by topo while the cluster otherwise stays contiguous.

This is the keystone JOIN: router abstract plan (predicate reqs/grants) -> the
plugin's render schema (instruction prose + highlights/markers + auto-advance
completion conditions). Two mechanical pieces here:
  * topological ORDER — the greedy planner emits the step SET cost-first, not in
    prerequisite order, so we re-order by simulating skill state (a step is
    emittable once its skill reqs are met), yielding a valid play order.
  * grant -> completionCondition — reaching a granted skill level is the step's
    natural auto-advance (SKILL >= level).
Location -> map marker + a representative training-NPC highlight via catalog.json.
"""
import json
import re
import sys
from pathlib import Path

from backprop import build_source_index, collect_demands, backprop_collection_plan

# Opportunistic-lookahead weave (OPPORTUNISTIC_GRANULARITY.md §2b): P8 label
# for the always-skippable fallback stub paired with every re-pinned opp node.
OPP_FALLBACK_LABEL = "Skip if already gathered"

# Tuning constants — mirrored from assets/js/router/planner/tuning.js (S1, S3).
# Update both files together when calibrating.
TUNING = {
    "DEFAULT_STEP_MIN":        30,    # PLACEHOLDER — calibrate from measured runs
    "STEER_HARD_THRESHOLD":   0.8,   # anchor_weight >= this → always its own phase
    "STEER_SOFT_THRESHOLD":   0.5,   # anchor_weight >= this → phase if on critical path
}

SKILL_ENUM = {  # router skill key -> net.runelite.api.Skill enum constant
    "attack": "ATTACK", "strength": "STRENGTH", "defence": "DEFENCE", "ranged": "RANGED",
    "prayer": "PRAYER", "magic": "MAGIC", "runecraft": "RUNECRAFT", "construction": "CONSTRUCTION",
    "hitpoints": "HITPOINTS", "agility": "AGILITY", "herblore": "HERBLORE", "thieving": "THIEVING",
    "crafting": "CRAFTING", "fletching": "FLETCHING", "slayer": "SLAYER", "hunter": "HUNTER",
    "mining": "MINING", "smithing": "SMITHING", "fishing": "FISHING", "cooking": "COOKING",
    "firemaking": "FIREMAKING", "woodcutting": "WOODCUTTING", "farming": "FARMING",
}


def skill_cond(skill, level):
    return {"type": "SKILL", "skill": SKILL_ENUM.get(skill, skill.upper()), "level": int(level)}


# XP curve — ported verbatim from assets/js/world/xp.js (same anchors: 83xp->2,
# 13,034,431xp->99). quest-chain fix: topo_order/phased_steps previously tracked
# only trained skill FLOORS (state[skill] via grants), never quest reward XP —
# invisible on routes with few quest-to-quest chains (P2P/corpus), but the real
# router (graph.js effectiveLevel) DOES fold quest XP into effective skill level,
# so a route that only becomes satisfiable through that folding (quest-progression,
# where reqs.quests chains run deep) got stuck mid-walk and fell back to an
# unordered dump of the remainder. _effective_lvl below re-derives the same fold
# these three re-simulation passes need to stay in fidelity parity with the planner.
_MAX_LEVEL = 99


def _build_xp_table():
    table = [0, 0]
    points = 0
    for lvl in range(1, _MAX_LEVEL):
        points += int(lvl + 300 * (2 ** (lvl / 7)))
        table.append(int(points / 4))
    return table


_XP_TABLE = _build_xp_table()


def _xp_for_level(level):
    return _XP_TABLE[max(1, min(_MAX_LEVEL, int(level)))]


def _level_for_xp(xp):
    lvl = 1
    while lvl < _MAX_LEVEL and xp >= _XP_TABLE[lvl + 1]:
        lvl += 1
    return lvl


def _make_effective_lvl(state, lvl):
    """Return a fn(skill_key) -> level, folding accumulated state['xp:<skill>']
    on top of the trained floor lvl(skill_key), mirroring model.js effectiveLevel."""
    def effective(k):
        base = lvl(k)
        xp = state.get(f"xp:{k}", 0)
        if not xp:
            return base
        eff = _level_for_xp(_xp_for_level(base) + xp)
        return eff if eff > base else base
    return effective


def _accumulate_quest_xp(state, step):
    """Fold a completed quest step's reward XP into state['xp:<skill>'] (additive,
    same accumulator semantics as graph.js's 'add' cmp / model.js syncQualEdges)."""
    if not _is_quest(step):
        return
    for sk, amt in (step.get("xp") or {}).items():
        if isinstance(amt, (int, float)) and amt > 0 and sk in SKILL_ENUM:
            state[f"xp:{sk}"] = state.get(f"xp:{sk}", 0) + amt


# S3 — phase_name(): sole author of phase strings in this pipeline.
# JS planner emits zero phase strings; only enrich.py produces them via this function.
def phase_name(kind, label):
    """Return a canonical phase string for the given kind and label.
    Kinds: toward | region | supply | background | endgame
    """
    if kind == "toward":
        return f"Toward {label}"
    if kind == "region":
        return f"Region: {label}"
    if kind == "supply":
        return f"Supply: {label}"
    if kind == "background":
        return "Background loops"
    if kind == "endgame":
        return "Endgame & extras"
    return label  # fallback: pass-through


def topo_order(steps, xp_fold=False):
    """Valid play order: emit a step once its skill reqs, tag reqs AND quest deps
    are met. Produces/grants applied additively (local dict only — ordering guard,
    not planner state).
    S7: tag reqs from reqs.tags checked against state tag:* keys, enabling bootstrap-before-loop
    ordering (supply loop steps carry reqs.tags:['bootstrap-<chain>']).
    Lane 3: also tracks quest:<id> completion (own id, self-granted on emit) so
    reqs.quests AND location.quest_gate are enforced here too — this is what makes
    topo the real dep guard after hub_batches reorders a quest cluster (S7); on
    the pre-Lane-3 input (greedy's own order) this is always already satisfied, a
    no-op, since greedy itself never emits a gated quest before its gate.

    quest-chain fix — xp_fold (default False, OFF): when a route's inter-quest
    reqs.quests chains run deep (quest-progression), a step's real playability
    depends on quest-reward XP folded into its effective skill level (graph.js
    effectiveLevel), same as the live planner — without that fold this re-
    simulation can get stuck (no remaining step's plain skill floor ever clears)
    and falls back to an UNORDERED dump of the rest, silently losing the very
    quest-order guarantee this function exists for. Folding XP unconditionally
    changes P2P/corpus phase placement too (verified against the pinned
    fixtures — same total steps, different pass each step is admitted on), so
    it stays opt-in: only the quest-progression payload (plan-quests.mjs) sets
    goal.xp_fold, keeping route-p2p.json/route-corpus.json byte-identical."""
    state, remaining, ordered = {}, list(steps), []
    lvl = lambda k: state.get(k, 1)
    eff = _make_effective_lvl(state, lvl) if xp_fold else lvl
    has_tag = lambda t: state.get(f"tag:{t}", False)
    quest_done = lambda qid: state.get(f"quest:{qid}", False)
    while remaining:
        progressed = False
        for s in list(remaining):
            skill_reqs = (s.get("reqs") or {}).get("skills", {}) or {}
            tag_reqs   = (s.get("reqs") or {}).get("tags",   []) or []
            quest_reqs = (s.get("reqs") or {}).get("quests", []) or []
            gate       = (s.get("location") or {}).get("quest_gate")
            skills_ok  = all(eff(k) >= v for k, v in skill_reqs.items())
            tags_ok    = all(has_tag(t) for t in tag_reqs)
            quests_ok  = all(quest_done(q) for q in quest_reqs)
            gate_ok    = quest_done(gate) if gate else True
            if skills_ok and tags_ok and quests_ok and gate_ok:
                ordered.append(s)
                # Apply grants: boolean tags + skill levels. bool FIRST —
                # isinstance(True, int) is True in Python, so the numeric
                # branch silently swallowed every tag grant ({"has-x": true}
                # became a level-1 "skill"), leaving the S7 tag-bridge
                # UNENFORCED in this re-simulation: tag-gated supply steps
                # (setup-ultracompost → farm-ranarr-patch → brew-prayer-potion
                # cascade) could never become ready and always fell into the
                # unordered-dump fallback at the route's tail. Measured on
                # route-grand via route_feasibility.mjs (unlock-barrows/gwd
                # 140+ steps before their potion producers).
                for k, v in (s.get("grants") or {}).items():
                    if v is True:
                        state[f"tag:{k}"] = True
                    elif isinstance(v, (int, float)):
                        state[k] = max(lvl(k), v)
                # Apply produces additively (S7 — local ordering guard only)
                for k, v in (s.get("produces") or {}).items():
                    if isinstance(v, (int, float)):
                        state[k] = state.get(k, 0) + v
                if _is_quest(s):
                    state[f"quest:{s['id']}"] = True
                    if xp_fold:
                        _accumulate_quest_xp(state, s)
                remaining.remove(s)
                progressed = True
        if not progressed:               # unmet dep -> append remainder verbatim
            ordered.extend(remaining)
            break
    return ordered


# P6 — hub_batches: cluster steps sharing a `hub` key contiguously, anchored at
# the position of the cluster's EARLIEST member. Relative order is preserved
# both within each cluster and among untouched steps — S7 relies on this
# stability so the following topo_order pass only has to correct genuine
# dependency violations the move introduces (e.g. a member whose skill reqs
# aren't met at the new, earlier position), not reinvent order from scratch.
# Steps without a `hub` pass straight through untouched.
def hub_batches(steps):
    first_idx, clusters = {}, {}
    for i, s in enumerate(steps):
        h = s.get("hub")
        if not h:
            continue
        first_idx.setdefault(h, i)
        clusters.setdefault(h, []).append(s)

    result, flushed = [], set()
    for i, s in enumerate(steps):
        h = s.get("hub")
        if not h:
            result.append(s)
            continue
        if h in flushed or i != first_idx[h]:
            continue                     # already flushed, or not the earliest member yet
        result.extend(clusters[h])
        flushed.add(h)
    return result


def _opp_fallback_stub(item, consumer, source_step):
    """optional:true skip-stub paired with an opportunistic re-pin (GRANULARITY
    §3c branch{}): shares alt_group with its opp node so skipping the early
    grab never blocks the consumer — U9's "skip degrades to today's dedicated-
    supply behavior" guarantee. No completion-relevant fields beyond MANUAL:
    the stub is pure enrichment, safe to render or ignore."""
    label_item = item.replace("_", " ")
    return {
        "id": f"opp-stub-{item}-{consumer}",
        "label": f"{OPP_FALLBACK_LABEL}: {label_item}",
        "detail": f"Already gathered while at \"{source_step.get('label', label_item)}\" "
                  "earlier in the route — nothing further to do here.",
        "kind": "access",
        "reqs": {"skills": {}}, "grants": {}, "tags": [],
        "branch": {"alt_group": f"opp-{item}-{consumer}", "when": {}, "optional": True},
        "_opportunistic_stub": True,
        # P10 anchor pin (demand_gate routes): stubs re-detach before phased_steps
        # and re-attach at the consumer, same as their opp node — see _detach_pinned.
        "_opp_anchor": consumer, "_opp_side": "before",
    }


def _weave_opportunistic(ordered, steps_bank, oppgran_rows, xp_fold):
    """P8 opportunistic placement scan (OPPORTUNISTIC_GRANULARITY.md §2b): run
    the backprop sweep (backprop.py, a port of the RUN-PROVEN backprop.js — see
    that module's own docstring for why P8 ports rather than shells JS in) over
    the route as topo_order (P7) left it, then for each "earliest-window" plan
    re-pin the source step at its collection node via the SAME _anchor/_side
    detach-reattach contract P5/P9 already use for overlay nodes, paired with
    an always-skippable fallback stub before the consumer. "already-earliest"/
    "no-window" plans are untouched — byte-identical fallback. sourceAfter-
    Consumer faults are returned for the caller to print as lint, NEVER
    silently reordered (a route/data fault to fix upstream, not paper over).
    topo_order is re-run afterward as the mandatory requisite-order guard.
    Returns (new_ordered, fault_plans[]).
    """
    by_id = {s["id"]: s for s in ordered if s.get("id")}
    source_index = build_source_index(steps_bank, oppgran_rows)
    proposed_by_id = {
        row["proposed_row"]["id"]: row["proposed_row"]
        for row in (oppgran_rows or []) if row.get("proposed_row")
    }
    plans = backprop_collection_plan(ordered, collect_demands(ordered), source_index)
    faults = [p for p in plans if p.get("source_after_consumer")]

    candidates = [
        p for p in plans
        if p["verdict"] == "earliest-window" and p.get("via_source") and p.get("collect_at_id")
        and (p["via_source"] in by_id or p["via_source"] in proposed_by_id)
    ]
    candidate_source_ids = {p["via_source"] for p in candidates}
    # Anchor-stability guard: never anchor a moving node onto another node this
    # same batch is also moving (rare, but the collect-at node must be stable).
    weaves = [p for p in candidates if p["collect_at_id"] not in candidate_source_ids]
    if not weaves:
        return ordered, faults

    # One gather action can pay off several downstream consumers (e.g. one
    # "fish trout" step covers both a combat band's food AND a later one's).
    # Insert the PHYSICAL node exactly once — id uniqueness matters to the
    # plugin's override/completion tracking — at its earliest collection
    # window; every consumer still gets its own skip-stub.
    weaves_by_source = {}
    for p in weaves:
        weaves_by_source.setdefault(p["via_source"], []).append(p)
    for group in weaves_by_source.values():
        group.sort(key=lambda p: p["collect_at_idx"])

    repinned_ids = {sid for sid in weaves_by_source if sid in by_id}
    base = [s for s in ordered if s.get("id") not in repinned_ids]

    overlays = []
    for source_id, group in weaves_by_source.items():
        earliest = group[0]
        item = earliest["item"]
        source_step = {**(by_id.get(source_id) or proposed_by_id[source_id])}
        source_step.update({
            "_supply": True, "_supply_chain": source_step.get("_supply_chain") or source_step.get("supply_chain"),
            "_opportunistic": True,
            "paysOff": {"at": earliest["consumer_id"], "item": item},
            # P10 anchor pin (demand_gate routes): keeps the P8-chosen collection
            # window through phased_steps' re-pick — OPPORTUNISTIC_GRANULARITY §2b's
            # documented positional-promise gap, closed by _detach_pinned/_reattach_phased.
            "_opp_anchor": earliest["collect_at_id"], "_opp_side": "after",
        })
        overlays.append({"anchor_id": earliest["collect_at_id"], "side": "after", "node": source_step})
        for plan in group:
            consumer = plan["consumer_id"]
            if consumer in by_id:  # horizon (goal-level) demands have no route node to anchor a stub to
                overlays.append({"anchor_id": consumer, "side": "before",
                                  "node": _opp_fallback_stub(item, consumer, source_step)})

    return topo_order(reattach_overlays(base, overlays), xp_fold=xp_fold), faults


# P8 — insert_supply_steps: (1) opportunistic placement scan, gated by
# `opportunistic` (default False → byte-identical for every route that
# doesn't opt in); (2) annotate remaining AOT/"either"-timing supply steps
# with their Supply: phase label so phased_steps_with_steer can group them
# under the Supply: <chain> phase before their consuming milestone. JIT supply
# steps (and now opportunistically re-pinned ones — same co-location idea)
# stay unannotated so they render inline wherever they landed.
def insert_supply_steps(ordered, supply_chains, opportunistic=False,
                         steps_bank=None, oppgran_rows=None, xp_fold=False):
    """P8: Annotate supply steps with Supply: phase label.
    AOT/either-timing steps → _supply_phase = phase_name("supply", chain_label).
    JIT steps → no annotation (stays in consumer's milestone phase).
    Bootstrap steps → always AOT, get _supply_phase like other AOT supply steps.
    opportunistic=True (goal-gated, additive): runs the backprop weave first
    (see _weave_opportunistic); sourceAfterConsumer faults print as lint.
    """
    if opportunistic and steps_bank is not None:
        ordered, faults = _weave_opportunistic(ordered, steps_bank, oppgran_rows, xp_fold)
        for f in faults:
            print(f"[og-w2 lint] source-after-consumer: \"{f['item']}\" needed by "
                  f"{f['consumer_id']} but its bank source \"{f['via_source']}\" is scheduled "
                  "later in the route — data fault, not auto-reordered.", file=sys.stderr)

    chain_label = {c["id"]: c["label"] for c in (supply_chains or [])}
    result = []
    for step in ordered:
        chain_id = step.get("_supply_chain") or step.get("supply_chain")
        if chain_id and step.get("_supply") and not step.get("_opportunistic"):
            timing = step.get("timing")
            # JIT steps co-locate with their consumer; everything else is supply-phase
            if timing != "jit":
                label = chain_label.get(chain_id, chain_id.replace("-", " ").title())
                step = {**step, "_supply_phase": phase_name("supply", label)}
        result.append(step)
    return result


# Factual, own-words note on what each milestone unlocks — the "why" that turns a
# quest capstone into a real task rather than an arbitrary requirements checkpoint.
MILESTONE_NOTE = {
    "quest-mm":   "Monkey Madness I — unlocks the dragon scimitar and a major combat step up.",
    "quest-dt":   "Desert Treasure — unlocks the Ancient Magicks spellbook.",
    "barrows":    "Barrows — a repeatable brothers run for Barrows gear and steady mid-game money.",
    "gwd":        "God Wars Dungeon — access to the four god bosses and their unique drops.",
    "raids-cox":  "Chambers of Xeric — the first raid; endgame gear like the twisted bow.",
}


def task_instruction(step):
    """Task-frame a label: 'Train Attack 10→30' → 'Train Attack to 30' (drop the
    arbitrary start number — the guide reads as tasks, not skill bands)."""
    label = step.get("label", step["id"])
    m = re.match(r"^(.*?)(\d+)\s*(?:→|->)\s*(\d+)\s*$", label)
    return f"{m.group(1)}to {m.group(3)}".strip() if m else label


def _skill_reqs(entry):
    return (entry.get("reqs") or {}).get("skills", {}) or {}


def _difficulty(milestone):
    reqs = _skill_reqs(milestone)
    return (max(reqs.values()) if reqs else 0, sum(reqs.values()))


# P5 — detach overlay nodes (_bg: True, or Lane 3 _alternation: True) from path
# before hub/topo reordering. Returns (clean_path, overlay_list) where
# overlay_list items are {anchor_id, side, node} tuples.
def detach_overlays(path):
    clean = []
    overlays = []
    for step in path:
        if step.get("_bg") or step.get("_alternation"):
            overlays.append({
                "anchor_id": step.get("_anchor"),
                "side": step.get("_side", "before"),
                "node": step,
            })
        else:
            clean.append(step)
    return clean, overlays


# P9 — re-attach overlay nodes adjacent to their (possibly reordered) anchors.
# Overlays with _side:"before" are inserted immediately before the anchor;
# _side:"after" immediately after.
def reattach_overlays(path, overlays):
    if not overlays:
        return path
    # Build index: anchor_id -> list of (side, node) sorted: "before" first
    by_anchor = {}
    for ov in overlays:
        aid = ov["anchor_id"]
        by_anchor.setdefault(aid, {"before": [], "after": []})
        by_anchor[aid][ov["side"]].append(ov["node"])

    result = []
    for step in path:
        sid = step.get("id")
        if sid in by_anchor:
            result.extend(by_anchor[sid]["before"])
        result.append(step)
        if sid in by_anchor:
            result.extend(by_anchor[sid]["after"])
    # Orphaned overlays (anchor not found): append at end
    anchored = set(by_anchor.keys())
    for ov in overlays:
        if ov["anchor_id"] not in anchored:
            result.append(ov["node"])
    return result


# P10a (demand_gate routes only) — re-detach every anchor-pinned node before
# phased_steps' from-scratch re-pick: P5 overlay nodes (_bg/_alternation, pinned
# via _anchor/_side) AND P8 opportunistic re-pins + their skip-stubs (pinned via
# _opp_anchor/_opp_side, stamped in _weave_opportunistic). phased_steps has no
# concept of "P4/P8 already chose this exact position"; letting it re-pick these
# nodes is exactly OPPORTUNISTIC_GRANULARITY §2b's documented positional-promise
# gap (measured on route-grand: a compost gather drifted to step 7, before
# character creation). The nodes ride around P10 and re-attach at their anchors
# in the PHASED output via _reattach_phased, inheriting the anchor's phase.
def _detach_pinned(path):
    clean, pinned = [], []
    for step in path:
        if step.get("_opportunistic") or step.get("_opportunistic_stub"):
            anchor, side = step.get("_opp_anchor"), step.get("_opp_side", "after")
        elif step.get("_bg") or step.get("_alternation"):
            anchor, side = step.get("_anchor"), step.get("_side", "before")
        else:
            anchor = None
        if not anchor:
            clean.append(step)
            continue
        pinned.append({"anchor_id": anchor, "side": side, "node": step})
    return clean, pinned


# P10b — mirror of reattach_overlays for the phased {step|milestone|steer, phase}
# entry shape. Orphans (anchor absent from the phased output) append at the tail
# in the endgame phase — visible, never silently dropped.
def _reattach_phased(phased, pinned):
    if not pinned:
        return phased
    by_anchor = {}
    for ov in pinned:
        slot = by_anchor.setdefault(ov["anchor_id"], {"before": [], "after": []})
        slot[ov["side"]].append(ov["node"])
    result, attached = [], set()
    for entry in phased:
        sid = entry["step"].get("id") if "step" in entry else None
        slot = by_anchor.get(sid)
        if slot:
            attached.add(sid)
            result.extend({"step": n, "phase": entry["phase"]} for n in slot["before"])
        result.append(entry)
        if slot:
            result.extend({"step": n, "phase": entry["phase"]} for n in slot["after"])
    endgame = phase_name("endgame", "")
    result.extend({"step": ov["node"], "phase": endgame}
                  for ov in pinned if ov["anchor_id"] not in attached)
    return result


def phased_steps(ordered, milestones, xp_fold=False, quest_first=None,
                 demand_gate=False, anchored_nodes=None, chain_order=None):
    """Segment steps into tight milestone episodes. Milestones are taken easiest
    first; each episode pulls exactly the not-yet-emitted training that advances
    toward its skill reqs, then emits the milestone as the episode's capstone.
    Steps no milestone needs fall into a trailing 'Endgame & extras' phase.

    demand_gate (opt-in, default False → byte-identical for every existing
    caller; only plan-grand.mjs sets goal.demand_gate) — the OPPORTUNISTIC
    §2-epoch placement contract, mechanized: a supply loop belongs where its
    producer's reqs AND a downstream consumer's demand both exist, never
    front-loaded. Three effects, all inside this re-pick only:
      * SUPPLY DEMAND-HOLD — a _supply/supply_chain step is not ready() until
        the episode of the first milestone whose reqs.tags carries
        supply-<chain> (the S6 tag-bridge burndown.js already writes). Without
        this, zero-req scaffolding (pps-* withdraws/deposits) wins the
        supply-priority tier in the very first episode — the measured
        "making prayer potions on step 11" fault.
      * REQS.ITEMS GATE — a step's reqs.items classes ("food",
        "prayer_potion") must be covered by accumulated produces{} keys
        (class match: key == name or key startswith name+"_", the
        supply_chains.jsonl output_item slug convention). Holds
        unlock-barrows/unlock-gwd behind brew-prayer-potion/cook-monkfish.
        Greedy never sees item state (S6); this re-pick is where play order
        is finalized, so it is where the edge must hold.
      * ORDERED ENDGAME DRAIN — the trailing remainder is drained through the
        same ready()-gated take() loop (all demand epochs open) instead of a
        verbatim array dump, so producer→consumer edges hold in the tail too.
    Steps stamped _pin_prefix (plan-grand's origin prefix) always win the
    take() priority chain — the route's bootstrap block precedes everything;
    stamp-driven, so routes without stamps are untouched.

    quest-chain fix: ready() previously checked only skill reqs, so this local
    re-pick could pull a step ahead of its own reqs.quests/location.quest_gate
    prereq even though topo_order (P7, upstream) already established a valid
    order — invisible on routes with few/no inter-quest reqs.quests edges (P2P,
    corpus), but a real ordering violation once a route chains many quests
    (quest-progression). Mirrors topo_order's own quest_done tracking so this
    re-pick can never invert what topo_order guaranteed. The reqs.quests/gate
    check itself is unconditional (safe — verified byte-identical against the
    pinned P2P/corpus fixtures); xp_fold (default False, see topo_order's
    docstring) additionally folds quest-reward XP into the skill portion, and
    stays opt-in for the same fixture-parity reason.

    [topo-quality] quest_first (default None → matches xp_fold, the exact
    pre-fix combined behavior) is a SEPARATE opt-in, decoupled from xp_fold's
    readiness-folding effect: xp_fold broadens which steps ready() considers
    playable (no position/priority change — take() still scans `remaining` in
    array order for the first ready match), while quest_first changes SELECTION
    PRIORITY (a position-blind hunt for the first ready QUEST, ahead of
    whatever's earliest-in-array). A route can want the former (fewer steps
    stuck in the trailing 'Endgame & extras' catch-all because their reqs are
    only satisfiable via quest-reward XP) WITHOUT the latter (which can reach
    past a deliberately-first block, e.g. an origin/Tutorial-Island prefix —
    see plan-grand.mjs's own xp_fold:false rationale). Every existing caller
    passes quest_first=None, so it inherits xp_fold exactly as before this fix."""
    quest_first = xp_fold if quest_first is None else bool(quest_first)
    ms = sorted(milestones, key=_difficulty)
    remaining, state, out = list(ordered), {}, []
    lvl = lambda k: state.get(k, 1)
    # demand_gate state: chain → index of the FIRST milestone (episode order)
    # whose reqs.tags demands supply-<chain>; produced{} keys accumulated for
    # the reqs.items class gate; epoch[0] = current episode index.
    chain_of = lambda s: s.get("_supply_chain") or s.get("supply_chain")
    demand_epoch = {}
    if demand_gate:
        for mi, m in enumerate(ms):
            for tag in ((m.get("reqs") or {}).get("tags", []) or []):
                if tag.startswith("supply-"):
                    demand_epoch.setdefault(tag[len("supply-"):], mi)
    produced, epoch = set(), [0]
    emitted_ids = set()
    remaining_ids = {s.get("id") for s in remaining}
    step_by_id = {s.get("id"): s for s in remaining}

    def held(step):
        if not demand_gate:
            return False
        chain = chain_of(step)
        if not chain:
            return False
        if chain in demand_epoch and epoch[0] < demand_epoch[chain]:
            return True
        # Chain-registry queue (supply_chains.jsonl steps[] order): a member is
        # takeable only once every earlier registry member has emitted, AND the
        # next present member's own core reqs already clear. Without the first
        # half, zero-req scaffolding (pps-05 withdraw-brew, pps-06 deposit-
        # potions) outruns the skill-gated loop cores by 100+ steps — the
        # "bank the potions before brewing them" detachment; without the
        # second, the registry HEAD (pps-01 withdraw-compost-run) leads the
        # block by the same margin because nothing precedes it. Members absent
        # from the route are skipped; unregistered members (synth bootstraps)
        # are always queue-eligible (their tag grants already order them).
        order = (chain_order or {}).get(chain)
        sid = step.get("id")
        if not order or sid not in order:
            return False
        my_idx = order[sid]
        if any(oid != sid and oidx < my_idx and oid not in emitted_ids
               and oid in remaining_ids
               for oid, oidx in order.items()):
            return True
        # Pairwise wait applies ONLY to pure scaffolding (no grants, no
        # produces — bank withdraws/deposits): a producer must stay exempt or
        # producer→consumer pairs deadlock (gather-volcanic-ash would wait on
        # setup-ultracompost, whose core needs volcanic ash's own tag grant).
        if (step.get("grants") or {}) or (step.get("produces") or {}):
            return False
        nxt = min(((oidx, oid) for oid, oidx in order.items()
                   if oidx > my_idx and oid in remaining_ids), default=None)
        return bool(nxt) and not core_ok(step_by_id[nxt[1]])

    def items_ok(step):
        if not demand_gate:
            return True
        names = [it if isinstance(it, str) else (it or {}).get("item")
                 for it in ((step.get("reqs") or {}).get("items", []) or [])]
        return all(any(k == n or k.startswith(n + "_") for k in produced)
                   for n in names if n)
    # eff() folds accumulated quest-reward XP on top of the trained floor —
    # used ONLY for per-step readiness (below), matching graph.js effRead, so a
    # step whose bank-side reqs.skills is only reachable via quest XP (not pure
    # training) is still judged playable in the right relative order. met(target)
    # (the milestone-episode completion check) deliberately keeps plain lvl() —
    # unchanged from before this fix — so existing routes stay byte-identical.
    eff = _make_effective_lvl(state, lvl) if xp_fold else lvl
    quest_done = lambda qid: state.get(f"quest:{qid}", False)
    # task #8 fix — has_tag was missing entirely from this function (present in
    # topo_order AND phased_steps_with_steer, but never ported here): a
    # reqs.tags gate (the S7 bootstrap-<chain>/tag-bridge ordering mechanism —
    # burndown.js's own docstring, "topo enforces order") was silently NOT
    # enforced by this re-simulation, so P10 could re-pick a tag-gated step
    # ahead of the step that grants its tag even though P7 topo_order (upstream)
    # already guaranteed the correct order — same invisible-until-a-route-
    # actually-exercises-it shape as the reqs.quests/location.quest_gate fix
    # this function's own docstring already documents above.
    has_tag = lambda t: state.get(f"tag:{t}", False)

    def apply(step):
        # bool BEFORE numeric — isinstance(True, int) is True; see topo_order's
        # tag-grant comment for the measured fault this dispatch order fixes.
        for k, v in (step.get("grants") or {}).items():
            if v is True:
                state[f"tag:{k}"] = True
            elif isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)
        produced.update((step.get("produces") or {}).keys())
        if _is_quest(step):
            state[f"quest:{step['id']}"] = True
            if xp_fold:
                _accumulate_quest_xp(state, step)
        # P10a-detached nodes (_detach_pinned) re-attach at this anchor AFTER
        # the re-pick — their grants/produces must still enter THIS simulation's
        # state at the anchor's own emission point, or a downstream reqs.items
        # consumer (unlock-barrows needing cook-monkfish's food_monkfish) can
        # never clear its gate.
        for node in (anchored_nodes or {}).get(step.get("id"), []):
            emitted_ids.add(node.get("id"))
            apply(node)

    def met(reqs):
        return all(lvl(k) >= v for k, v in reqs.items())

    def core_ok(step):
        """Readiness minus the demand-gate queue — skills/tags/quests/gate +
        the reqs.items class gate. held() consults this for the NEXT chain
        member (never the queue itself, so no recursion)."""
        quest_reqs = (step.get("reqs") or {}).get("quests", []) or []
        tag_reqs = (step.get("reqs") or {}).get("tags", []) or []
        gate = (step.get("location") or {}).get("quest_gate")
        skill_reqs = _skill_reqs(step)
        return (all(eff(k) >= v for k, v in skill_reqs.items())
                and all(has_tag(t) for t in tag_reqs)
                and all(quest_done(q) for q in quest_reqs)
                and (quest_done(gate) if gate else True)
                and items_ok(step))

    def ready(step):
        return core_ok(step) and not held(step)

    def advances(step, target):
        grants = step.get("grants") or {}
        return any(k in target and lvl(k) < target[k] for k in grants)

    def take(pred):
        step = next((s for s in remaining if ready(s) and pred(s)), None)
        if step is None:
            return None
        remaining.remove(step)
        remaining_ids.discard(step.get("id"))
        emitted_ids.add(step.get("id"))
        apply(step)
        return step

    # _pin_prefix (stamp-driven, no flag): the route's mandated opening block
    # (plan-grand's Tutorial Island origin prefix) outranks every other pick —
    # priority preds (advances/supply) used to reach PAST it, putting "kill
    # chickens" and bank-withdraw scaffolding before character creation.
    pin_pred = lambda s: bool(s.get("_pin_prefix"))
    supply_or_opp_pred = lambda s: bool(s.get("_opportunistic")) or bool(s.get("_supply"))

    for mi, m in enumerate(ms):
        epoch[0] = mi
        phase, target = phase_name("toward", m["label"]), _skill_reqs(m)
        while not met(target):
            # quest-chain fix (quest_first-gated, same fixture-parity reasoning as
            # above): quest steps never carry a `grants` skill entry (their reward
            # is `xp`, not a level floor — see model.js), so advances() can never
            # select one; a single broad-union milestone target (quest-progression)
            # then has generic training out-prioritize every ready quest, front-
            # loading the whole route with training instead of leading with the
            # earliest playable quests (Cook's Assistant/Restless Ghost-grade).
            # Pulling any ready quest first restores the expected quest-forward
            # narrative; falls back to training exactly when no quest is unlocked.
            quest_first_pred = (lambda s: _is_quest(s)) if quest_first else (lambda s: False)
            # P10 positional-promise fix (task #8): a P8-woven opportunistic node
            # (_opportunistic, re-pinned at its in-position collection window —
            # OPPORTUNISTIC_GRANULARITY.md §2b) never carries a `grants` skill
            # entry either (it's a gather/produce step, not training), so it can
            # ONLY ever land via the position-blind catch-all below, same failure
            # shape as the quest case above — this local re-pick has no concept
            # of "P8 already chose this exact position for a reason" and can
            # silently drift it away from its anchor once ready() only clears
            # deep in some LATER milestone's loop while an unrelated, earlier-
            # ready, non-opportunistic step wins the catch-all first. Prioritizing
            # a ready opportunistic node over generic catch-all filler preserves
            # its earlier array position (P8's placement) whenever it's already
            # eligible, closing the gap for the common case; it is NOT a full fix
            # — two-or-more simultaneously-ready opportunistic nodes still race on
            # plain array order, and one gated on a quest this milestone's target
            # never needs can still be deferred past steps that logically follow
            # it. Residual gap documented, not silently papered over. Widened
            # (still task #8) to cover PLAIN `_supply` steps too, not just P8's
            # opportunistic re-pins — a burndown-injected supply/bootstrap step
            # (setup-ultracompost, farm-ranarr-patch, ...) has the exact same
            # empty-`grants` shape and the exact same catch-all-only fate, and
            # P3 (greedy, costFor) already treats `_supply` as "near-zero cost,
            # pick ASAP once useful" — this mirrors that priority one level
            # below quest/advances instead of leaving supply chains to win or
            # lose the catch-all lottery against whatever else is ready.
            step = (take(pin_pred) or take(quest_first_pred)
                    or take(lambda s: advances(s, target))
                    or take(supply_or_opp_pred) or take(lambda s: True))
            if step is None:
                break                         # unmet prereq — capstone anyway
            out.append({"step": step, "phase": phase})
        out.append({"milestone": m, "phase": phase})
    endgame = phase_name("endgame", "")
    if demand_gate:
        # Ordered drain: all demand epochs open; keep pulling ready steps so the
        # tail honors producer→consumer edges instead of dumping array order.
        epoch[0] = len(ms)
        while remaining:
            step = take(pin_pred) or take(supply_or_opp_pred) or take(lambda s: True)
            if step is None:
                break                         # genuinely stuck residue — dump below, visible
            out.append({"step": step, "phase": endgame})
    for step in remaining:
        out.append({"step": step, "phase": endgame})
    return out


# P10 — steer_met predicate: has the steer-point's skill conditions been reached?
# Lane 1: skill-only check (quests/items deferred to burndown Lane 2+).
def steer_met(steer_pt, state):
    cond = steer_pt.get("unlock_condition", {})
    skills = cond.get("skills", {})
    lvl = lambda k: state.get(k, 1)
    return all(lvl(k) >= v for k, v in skills.items())


# P10 — phased_steps_with_steer: replaces phased_steps when goal has steer_points.
# Hard anchors (anchor_weight >= STEER_HARD_THRESHOLD) always create a named phase.
# Lane 1: hard anchors only; soft/waypoints deferred to Lane 3+.
def phased_steps_with_steer(ordered, milestones, all_steer_points, goal_steer_ids):
    hard_threshold = TUNING["STEER_HARD_THRESHOLD"]

    steer_by_id = {sp["id"]: sp for sp in all_steer_points}
    active_steers = [
        steer_by_id[sid]
        for sid in goal_steer_ids
        if sid in steer_by_id and steer_by_id[sid]["anchor_weight"] >= hard_threshold
    ]

    # Build merged_anchors: steer-points interleaved with milestones.
    # Ordering heuristic: steer-points sorted by max-skill-req first, then
    # milestones in difficulty order. A steer-point whose skills are subsumed
    # by an earlier milestone is placed before that milestone.
    def steer_sort_key(sp):
        cond_skills = sp.get("unlock_condition", {}).get("skills", {})
        return (max(cond_skills.values()) if cond_skills else 0, -sp["anchor_weight"])

    sorted_steers = sorted(active_steers, key=steer_sort_key)
    sorted_milestones = sorted(milestones, key=_difficulty)

    # Merge: insert each steer-point before the first milestone whose difficulty
    # exceeds the steer-point's max skill requirement.
    def steer_max_skill(sp):
        skills = sp.get("unlock_condition", {}).get("skills", {})
        return max(skills.values()) if skills else 0

    merged = []
    ms_iter = iter(sorted_milestones)
    ms_queue = list(sorted_milestones)
    ms_consumed = 0

    # Simple merge: iterate steers and milestones in interleaved order
    si, mi = 0, 0
    while si < len(sorted_steers) or mi < len(sorted_milestones):
        if si < len(sorted_steers) and mi < len(sorted_milestones):
            sp = sorted_steers[si]
            m = sorted_milestones[mi]
            sp_max = steer_max_skill(sp)
            m_max_skill = max(_skill_reqs(m).values()) if _skill_reqs(m) else 0
            # Steer-point goes first if its skill requirement is lower
            if sp_max <= m_max_skill:
                merged.append(("steer", sp))
                si += 1
            else:
                merged.append(("milestone", m))
                mi += 1
        elif si < len(sorted_steers):
            merged.append(("steer", sorted_steers[si]))
            si += 1
        else:
            merged.append(("milestone", sorted_milestones[mi]))
            mi += 1

    remaining = list(ordered)
    state = {}
    out = []
    lvl = lambda k: state.get(k, 1)
    has_tag = lambda t: state.get(f"tag:{t}", False)
    quest_done = lambda qid: state.get(f"quest:{qid}", False)

    def apply_step(step):
        # bool BEFORE numeric — see topo_order's tag-grant comment.
        for k, v in (step.get("grants") or {}).items():
            if v is True:
                state[f"tag:{k}"] = True
            elif isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)
        if _is_quest(step):
            state[f"quest:{step['id']}"] = True

    # quest-chain fix (mirrors phased_steps and topo_order, see phased_steps'
    # docstring): ready() must also honor reqs.quests/location.quest_gate, or
    # this local re-pick can invert an order topo_order already guaranteed.
    # Deliberately NOT folding quest-reward XP here (unlike phased_steps) — this
    # function is only reached when a goal declares steer_points (the P2P/barrows
    # route), and folding XP into its skill readiness changed which steps land in
    # which milestone episode (verified against the pinned P2P fixture). The
    # quest-progression route never has steer_points, so it never runs this path;
    # topo_order's XP fold is what keeps IT ordering-valid upstream regardless.
    def ready(step):
        reqs = _skill_reqs(step)
        tag_reqs = (step.get("reqs") or {}).get("tags", []) or []
        quest_reqs = (step.get("reqs") or {}).get("quests", []) or []
        gate = (step.get("location") or {}).get("quest_gate")
        return (all(lvl(k) >= v for k, v in reqs.items()) and
                all(has_tag(t) for t in tag_reqs) and
                all(quest_done(q) for q in quest_reqs) and
                (quest_done(gate) if gate else True))

    def advances_skills(step, target_skills):
        grants = step.get("grants") or {}
        return any(k in target_skills and lvl(k) < target_skills[k] for k in grants)

    def advances_steer(step, sp):
        # A step advances toward a steer-point if it has a matching steer_id
        # or its grants help meet the unlock_condition skills.
        if step.get("steer_id") == sp["id"]:
            return True
        cond_skills = sp.get("unlock_condition", {}).get("skills", {})
        return advances_skills(step, cond_skills)

    def take(pred):
        step = next((s for s in remaining if ready(s) and pred(s)), None)
        if step is None:
            return None
        remaining.remove(step)
        apply_step(step)
        return step

    # P8 supply phases: collect supply steps grouped by chain_id.
    # They are emitted just before the first milestone whose reqs.tags includes
    # supply-<chain>, creating a "Supply: <chain-label>" phase block.
    # chain_id -> {"phase": phase_str, "steps": [step, ...]}
    supply_by_chain = {}
    non_supply = []
    for step in remaining:
        sp_phase = step.get("_supply_phase")
        chain_id = step.get("_supply_chain") or step.get("supply_chain")
        if sp_phase and chain_id:
            if chain_id not in supply_by_chain:
                supply_by_chain[chain_id] = {"phase": sp_phase, "steps": []}
            supply_by_chain[chain_id]["steps"].append(step)
        else:
            non_supply.append(step)
    remaining = non_supply

    # Steer-points only claim steps that materially advance them (steer_id match
    # or their unlock skills); they NEVER drain unrelated steps. A steer-point the
    # route doesn't train folds its card into the next milestone episode, so the
    # milestone-driven episodes stay tight.
    pending_steer = []
    for kind, anchor in merged:
        if kind == "steer":
            sp = anchor
            phase = phase_name("toward", sp["label"])
            pulled = []
            while not steer_met(sp, state):
                step = take(lambda s, _sp=sp: advances_steer(s, _sp))
                if step is None:
                    break
                pulled.append(step)
            if pulled:
                for step in pulled:
                    out.append({"step": step, "phase": phase})
                out.append({"steer": sp, "phase": phase})
            else:
                pending_steer.append(sp)     # defer card to the next milestone phase
            continue

        m = anchor
        phase = phase_name("toward", m["label"])
        target = _skill_reqs(m)

        # P8: emit supply phases for any supply-<chain> tags this milestone requires.
        # This creates "Supply: <chain>" phase blocks immediately before the
        # milestone's training steps, before greedy has consumed those supply steps.
        # Also pulls JIT supply steps for the same chain from remaining (they were
        # separated before milestone processing since they lack _supply_phase).
        for tag in ((m.get("reqs") or {}).get("tags", []) or []):
            if tag.startswith("supply-"):
                chain_id = tag[len("supply-"):]
                if chain_id in supply_by_chain:
                    entry = supply_by_chain.pop(chain_id)
                    phase_str = entry["phase"]
                    for sup_step in entry["steps"]:
                        apply_step(sup_step)
                        out.append({"step": sup_step, "phase": phase_str})
                    # Also pull JIT supply steps for this chain from remaining.
                    # JIT steps weren't annotated with _supply_phase but belong here.
                    jit_steps = [s for s in remaining
                                 if (s.get("_supply_chain") or s.get("supply_chain")) == chain_id
                                 and ready(s)]
                    for jit in jit_steps:
                        remaining.remove(jit)
                        apply_step(jit)
                        out.append({"step": jit, "phase": phase_str})

        met = lambda: all(lvl(k) >= v for k, v in target.items())
        while not met():
            step = take(lambda s, _t=target: advances_skills(s, _t)) or take(lambda s: True)
            if step is None:
                break
            out.append({"step": step, "phase": phase})
        for sp in pending_steer:             # steer-points achieved alongside this milestone
            out.append({"steer": sp, "phase": phase})
        pending_steer = []
        out.append({"milestone": m, "phase": phase})

    endgame = phase_name("endgame", "")
    # Any supply phases not yet emitted (no matching milestone) → endgame section.
    for entry in supply_by_chain.values():
        for sup_step in entry["steps"]:
            apply_step(sup_step)
            out.append({"step": sup_step, "phase": entry["phase"]})
    for sp in pending_steer:
        out.append({"steer": sp, "phase": endgame})
    for step in remaining:
        out.append({"step": step, "phase": endgame})

    return out


def _step_markers(step, cat):
    """Row-level mapMarkers (wiki-sourced {{Map}} pins from consolidation) override
    the catalog zone's representative pin; fall back to the zone pin."""
    own = step.get("mapMarkers") or []
    if own:
        return [{"x": m["x"], "y": m["y"], "plane": m.get("plane", 0),
                 "label": m.get("label")} for m in own]
    if cat:
        return [{"x": cat["x"], "y": cat["y"], "plane": cat.get("plane", 0),
                 "label": cat.get("label")}]
    return []


def _train_step(step, phase, zones, checkpoint=None):
    cat = zones.get((step.get("location") or {}).get("zone"))
    conds = [skill_cond(k, v) for k, v in (step.get("grants") or {}).items() if k in SKILL_ENUM]
    out = {
        "id": step["id"],
        "phase": phase,
        "instruction": task_instruction(step),
        "detail": step.get("detail", ""),
        "highlights": [{"type": "NPC", "id": cat["npc"]}] if cat and cat.get("npc") else [],
        "mapMarkers": _step_markers(step, cat),
        "completionConditions": conds or [{"type": "MANUAL"}],
    }
    # Pass-through granularity fields (nullable; existing routes unaffected)
    if step.get("atom") is not None:
        out["atom"] = step["atom"]
    if step.get("hints"):
        out["hints"] = step["hints"]
    if step.get("coarse_of"):
        out["coarse_of"] = step["coarse_of"]
    if checkpoint is not None:
        out["checkpoint"] = checkpoint
    if step.get("refs"):
        out["refs"] = step["refs"]
    # NORMALIZATION §1d — structured item requirements (req_items[], the mirror
    # of the reqs.items prose strings) pass through verbatim so the REQUISITES
    # block render has data, not paragraphs. Only steps_quests rows carry them
    # today; absent field = byte-identical output (same pattern as refs/media).
    if step.get("req_items"):
        out["req_items"] = step["req_items"]
    # FRAMES_GALLERY §2 — captured frames/gifs pass through verbatim (same pattern as refs).
    if step.get("media"):
        out["media"] = step["media"]
    # Lane 3 — passiveOverlays: zero-time embed badges resolved onto this ACTIVE
    # host by overlay.js (P4). Never present on a _bg chip — weaveOverlays never
    # annotates one (sequencer OQ-6).
    if step.get("_passiveOverlays"):
        out["passiveOverlays"] = step["_passiveOverlays"]
    # OPPORTUNISTIC_GRANULARITY §2a.3 — paysOff breadcrumb on a re-pinned opp
    # node ("↷ pays off at: <consumer>"); GuideStep.paysOff (guide-chain repo),
    # additive-nullable, unknown-field-safe if the plugin hasn't picked it up
    # yet.
    if step.get("paysOff"):
        out["paysOff"] = step["paysOff"]
    # branch{} emits ONLY for the opportunistic fallback stub (§3c) — several
    # existing bank rows (e.g. pps-04-source-vials, ctr-final alt_group) ALSO
    # carry branch{} for the unrelated coarse-atom alt_group selection
    # (_select_branch_drops); that field was never emitted before this change
    # and must stay that way for byte-identical output on every pinned route.
    if step.get("_opportunistic_stub") and step.get("branch"):
        out["branch"] = step["branch"]
    # Quest reward XP — the efficiency lever. The planner credits it toward skill
    # progression (pruning covered training); surface it as a chip so the route
    # shows the payoff of doing the quest instead of grinding.
    if _is_quest(step) and step.get("xp"):
        rewards = ", ".join(f"{sk} +{int(amt)}"
                            for sk, amt in step["xp"].items()
                            if isinstance(amt, (int, float)) and amt > 0)
        if rewards:
            out["hints"] = list(out.get("hints") or []) + [
                {"type": "quest-xp", "target": None, "value": rewards,
                 "note": "Quest reward XP — counts toward your skills, replacing that much training."}
            ]
    return out


def _is_quest(step):
    """Quest steps carry the 'quest' tag or kind (mirrors model.js isQuestStep)."""
    return "quest" in (step.get("tags") or []) or step.get("kind") == "quest"


def _milestone_step(milestone, phase):
    reqs = _skill_reqs(milestone)
    note = MILESTONE_NOTE.get(milestone["id"], f"Requirements met — start {milestone['label']}.")
    out = {
        "id": "milestone-" + milestone["id"],
        "phase": phase,
        "instruction": f"★ {milestone['label']}",
        "detail": note,
        "highlights": [], "mapMarkers": [],
        "completionConditions": [skill_cond(k, v) for k, v in reqs.items()] or [{"type": "MANUAL"}],
    }
    if milestone.get("refs"):
        out["refs"] = milestone["refs"]
    return out


def _steer_step(steer_pt, phase, waypoint=False):
    """Emit a steer-point card. Lane 1: skill-based or MANUAL completion.
    Waypoint (anchor_weight < 0.8) uses lighter visual prefix."""
    cond = steer_pt.get("unlock_condition", {})
    skill_reqs = cond.get("skills", {})
    conds = [skill_cond(k, v) for k, v in skill_reqs.items()] or [{"type": "MANUAL"}]
    prefix = "⬡" if waypoint else "★"
    out = {
        "id": steer_pt["id"],  # id already carries the "steer-" prefix
        "phase": phase,
        "steerKind": steer_pt["kind"],
        "instruction": f"{prefix} {steer_pt['label']}",
        "detail": steer_pt.get("downstream_acceleration", ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": conds,
    }
    if steer_pt.get("refs"):
        out["refs"] = steer_pt["refs"]
    return out


def _checkpoint_step(label, phase, coarse_id, idx):
    """Emit a checkpoint group-header record (same emitter pattern as _steer_step).
    Visible in the plan list as a collapsible group header; styled as checkpoint-divider
    in the web view. The `checkpoint` field is the rendering key for WebFragments."""
    return {
        "id": f"chkpt-{coarse_id}-{idx}",
        "phase": phase,
        "instruction": f"⧆ {label}",
        "detail": "",
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": [{"type": "MANUAL"}],
        "checkpoint": label,
    }


def _bg_step(step, phase, zones):
    """Emit a background overlay step card (slot.type == "background").
    slotType drives the plugin's loops-lane panel."""
    slot = step.get("slot") or {}
    cadence = slot.get("cadence_min")
    lifecycle = step.get("_bg_lifecycle", "")
    conds = [{"type": "MANUAL"}]
    # Use RECURRING condition when cadence is set (Lane 4 plugin implements it)
    if cadence is not None:
        conds = [{"type": "RECURRING", "cadenceMinutes": int(cadence)}]
    return {
        "id": step["id"],
        "phase": phase,
        "slotType": "background",
        "cadenceMinutes": int(cadence) if cadence is not None else None,
        "lifecycleState": lifecycle or None,
        "instruction": task_instruction(step),
        "detail": step.get("detail", ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": conds,
    }


def _alternation_step(step, phase):
    """Emit an alternation-card divider record (Lane 3; same marker pattern as
    _checkpoint_step): 3+ consecutive same-region active steps overlay.js found
    that can be done in any order — a round-robin hint, not a forced sequence.
    slotType:"alternation" (GuideStep.java union field, §1e) drives rendering;
    plugin ignores unknown fields safely so alternationMembers is a safe extra."""
    label = step.get("label", "Rotate tasks")
    return {
        "id": step["id"],
        "phase": phase,
        "slotType": "alternation",
        "instruction": f"⇄ {label}",
        "detail": "These steps are all in the same area — any order works.",
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": [{"type": "MANUAL"}],
        "alternationMembers": step.get("_alternation_members", []),
    }


def _region_phase(step):
    region = (step.get("location") or {}).get("region")
    return phase_name("region", region.replace("-", " ").title()) if region else "General training"


def _build_checkpoint_index(coarse_expansions):
    """Build two lookup maps from coarse_expansions checkpoints.
    Returns:
      checkpoint_start: {step_id → checkpoint_label} — only the first step of each checkpoint
      checkpoint_member: {step_id → checkpoint_label} — all steps in each checkpoint
    """
    checkpoint_start = {}
    checkpoint_member = {}
    for exp in (coarse_expansions or []):
        if exp.get("status") != "authored":
            continue
        steps_in_exp = exp.get("steps", [])
        checkpoints = exp.get("checkpoints", [])
        if not checkpoints:
            continue
        # Map checkpoint start → label; then propagate label to all steps until next checkpoint
        cp_starts = {cp["start"]: cp["label"] for cp in checkpoints}
        current_label = None
        for sid in steps_in_exp:
            if sid in cp_starts:
                current_label = cp_starts[sid]
                checkpoint_start[sid] = current_label
            if current_label:
                checkpoint_member[sid] = current_label
    return checkpoint_start, checkpoint_member


def _inject_coarse_atoms(ordered, coarse_expansions, atoms_by_id, xp_fold=False):
    """Post-plan injection: for authored expansions whose atoms are absent from
    the ordered list, append the missing atoms so they flow through topo_order.
    This is the 'unwind via coarse_expansions' path (GRANULARITY §6 Lane 2 note).

    [topo-quality] xp_fold must mirror the CALLER's own topo_order xp_fold
    setting, not silently default to False: this function re-runs topo_order
    from a blank state over `ordered` (an already-resolved, possibly XP-fold-
    dependent sequence) + the newly-injected atoms. Diagnosed empirically
    (temp instrumented copy, deleted after use): on route-quests (xp_fold True
    upstream), re-simulating the combined 303-item list under the OLD
    default (xp_fold=False here) made ~all of the already-validly-ordered 289
    items look blocked again (their readiness depended on quest-reward-XP-
    folded effective levels), collapsing into topo_order's unordered-dump
    fallback (200/303, 66% — exactly the ratio measured in gotchas.log's
    grand-chain retro). Re-validated: the FIRST topo_order pass alone (proper
    xp_fold) already produces zero req-order violations for route-quests: the
    fallback was entirely an artifact of THIS second, un-folded re-invocation,
    not a genuine deadlock. Passing xp_fold through eliminates it.
    """
    if not coarse_expansions or not atoms_by_id:
        return ordered
    ordered_ids = {s.get("id") for s in ordered}
    to_inject = []
    for exp in coarse_expansions:
        if exp.get("status") != "authored":
            continue
        exp_step_ids = exp.get("steps", [])
        if not exp_step_ids:
            continue
        # Check if ANY atom from this expansion is already present
        if any(sid in ordered_ids for sid in exp_step_ids):
            continue
        # None present → inject all available atoms for this expansion
        for sid in exp_step_ids:
            if sid in atoms_by_id and sid not in ordered_ids:
                to_inject.append(atoms_by_id[sid])
                ordered_ids.add(sid)
    if not to_inject:
        return ordered
    return topo_order(list(ordered) + to_inject, xp_fold=xp_fold)


def _select_branch_drops(coarse_expansions, atoms_by_id):
    """branch{} selection (GRANULARITY U9): for each alt_group keep the FIRST member
    in registry order (= preference; empty `when` is always eligible — full when-gating
    is Lane 3), drop the rest. Returns the set of atom ids to remove."""
    seen, drop = set(), set()
    for exp in (coarse_expansions or []):
        for sid in exp.get("steps", []):
            branch = ((atoms_by_id or {}).get(sid) or {}).get("branch") or {}
            group = branch.get("alt_group")
            if not group:
                continue
            drop.add(sid) if group in seen else seen.add(group)
    return drop


def _coalesce_checkpoints(steps, checkpoint_member):
    """Keep steps sharing a checkpoint contiguous (stable, first-appearance block order).
    A later member is pulled up next to its block's current last member so the checkpoint
    header renders once; non-members keep their relative position.

    task #8 fix: `steps` (ordered_with_overlays) is ALREADY a topologically valid
    order by this point — P7 topo_order plus the S7 tag-bridge mechanism (grant a
    tag from a source step, require it on a consumer) guarantee every reqs.skills/
    tags/quests/location.quest_gate dependency is satisfied in route position
    order. A blind "pull the later member up next to the first" is a PURE
    render-contiguity move with no dependency awareness — it can silently drag a
    step past something it depends on (e.g. two DIFFERENT checkpoint groups
    within the same supply chain, where group B's first-seen member happens to
    sit earlier in the array than group A's, even though a member of B needs a
    member of A's grants). Caught empirically on route-grand's prayer-pot-supply
    chain: pulling brew-prayer-potion into the "Secondaries + brew" cluster
    dragged it ahead of farm-ranarr-patch's "Herb-run loop" cluster, resurrecting
    a source-after-consumer fault P7/P8 had already fixed. Guard: before pulling
    a member up, re-check its OWN ready() gate against the grants state the
    (result-so-far) prefix up to the target position actually establishes; if
    the pull would place it somewhere its own reqs aren't yet met, leave it at
    its natural (later, topo-correct) position instead — a checkpoint header
    rendering twice is cosmetic, a dependency violation is not."""
    if not checkpoint_member:
        return steps

    result, block_end = [], {}

    def state_before(pos):
        state = {}
        for s in result[:pos]:
            # bool BEFORE numeric — see topo_order's tag-grant comment.
            for k, v in (s.get("grants") or {}).items():
                if v is True:
                    state[f"tag:{k}"] = True
                elif isinstance(v, (int, float)):
                    state[k] = max(state.get(k, 1), v)
            if _is_quest(s):
                state[f"quest:{s['id']}"] = True
        return state

    def ready_at(step, pos):
        state = state_before(pos)
        lvl = lambda k: state.get(k, 1)
        skill_reqs = _skill_reqs(step)
        tag_reqs = (step.get("reqs") or {}).get("tags", []) or []
        quest_reqs = (step.get("reqs") or {}).get("quests", []) or []
        gate = (step.get("location") or {}).get("quest_gate")
        return (all(lvl(k) >= v for k, v in skill_reqs.items())
                and all(state.get(f"tag:{t}", False) for t in tag_reqs)
                and all(state.get(f"quest:{q}", False) for q in quest_reqs)
                and (state.get(f"quest:{gate}", False) if gate else True))

    for s in steps:
        cp = checkpoint_member.get(s.get("id"))
        if cp is None or cp not in block_end:
            result.append(s)
            if cp is not None:
                block_end[cp] = len(result) - 1
            continue
        pos = block_end[cp] + 1
        if not ready_at(s, pos):
            result.append(s)
            continue
        result.insert(pos, s)
        block_end = {k: (v + 1 if v >= pos and k != cp else v) for k, v in block_end.items()}
        block_end[cp] = pos
    return result


# Planner-synthesized training band ids: synth-<skill>-<level>-<counter>. The
# counter is per-route (deterministic within a route, different across routes),
# so methods attach for these matches on skill+band, never on id.
_SYNTH_ID_RE = re.compile(r"^synth-([a-z]+)-(\d+)-\d+$")


def enrich(plan, catalog, steer_points, supply_chains=None,
           coarse_expansions=None, atoms_by_id=None, extra_by_id=None,
           steps_bank=None, oppgran_opp_rows=None, methods_by_skill=None,
           subchecklists_by_skill=None):
    goal = plan["goal"]
    zones = catalog.get("zones", {})
    reals = [s for s in plan["path"] if not s.get("_capstone")]
    milestones = goal.get("goals", []) or []
    # quest-chain fix — opt-in XP fold (see topo_order's docstring). Only the
    # quest-progression payload (plan-quests.mjs) sets goal.xp_fold; every
    # other caller gets xp_fold=False, the exact pre-fix behavior.
    xp_fold = bool(goal.get("xp_fold"))

    # Skill-methods picker: attach train_methods.jsonl methods[] onto the
    # matching train-* steps (see main()'s extra_by_id merge + the attach loop
    # below). Opt-in per route (default OFF → byte-identical for every pinned
    # fixture); only training-heavy chains (grand) set goal.train_methods:true.
    train_methods = bool(goal.get("train_methods"))

    # Opportunistic-granularity sub-checklist (W3 Faux-grain atoms, ATTACH not
    # flat-injection — see main()'s extra_by_id merge + the attach loop below,
    # and the granular sub-checklist render on the plugin side). The coarse
    # step (quest-*/train-*) stays the routing/grant anchor; its atoms attach
    # underneath as subChecklist{atoms,checkpoints}. Opt-in per route (default
    # OFF → byte-identical for every pinned fixture); only plan-grand.mjs sets
    # goal.granular:true so far.
    granular = bool(goal.get("granular"))

    # OPPORTUNISTIC_GRANULARITY §2b — opportunistic-lookahead P8 weave. Opt-in
    # per route (default OFF → byte-identical for every pinned fixture); only
    # plan-grand.mjs sets goal.opportunistic:true so far.
    opportunistic = bool(goal.get("opportunistic"))

    # OPPORTUNISTIC_GRANULARITY §2-epoch — demand-gated placement in P10 (see
    # phased_steps' docstring: supply demand-hold + reqs.items gate + ordered
    # endgame drain + P10a/P10b anchor-pin round-trip). Opt-in per route
    # (default OFF → byte-identical); only plan-grand.mjs sets goal.demand_gate.
    demand_gate = bool(goal.get("demand_gate"))

    # NORMALIZATION §1a — quest sub-checklists (questatoms fan-out, consolidated
    # into quest_expansions.jsonl + steps_quest_atoms.jsonl). ATTACH model, same
    # reasoning as `granular` above: 5k+ equal-grade atoms flat-injected would
    # reorder every pinned route, so the quest step stays the routing/grant
    # anchor and its atoms attach underneath as subChecklist{atoms,checkpoints}.
    # Opt-in per route (default OFF → byte-identical); plan-quests.mjs and
    # plan-grand.mjs set goal.quest_atoms:true.
    quest_atoms = bool(goal.get("quest_atoms"))

    # [topo-quality] topo_xp_fold: a SEPARATE, additive opt-in knob for
    # topo_order's own XP fold, decoupled from xp_fold (which also flips on
    # phased_steps' quest_first / phased_steps_with_steer's advances_steer —
    # both position-blind scans of `remaining`, see grand-chain retro). A
    # route can need topo-level folding (shrinks topo_order's unordered-dump
    # fallback — a step's real playability often depends on quest-reward XP
    # folded into effective skill level) WITHOUT wanting quest_first/
    # advances_steer active (e.g. plan-grand.mjs's origin-prefix-must-open-
    # first requirement, which quest_first breaks by reaching past the prefix
    # for the first ready quest). Defaults to xp_fold itself, so every
    # existing caller is byte-identical (p2p/corpus/origin: False either way;
    # quests: True either way, already what it needs). Only plan-grand.mjs
    # sets goal.topo_xp_fold explicitly, independent of its own xp_fold:false.
    topo_xp_fold = goal.get("topo_xp_fold")
    topo_xp_fold = xp_fold if topo_xp_fold is None else bool(topo_xp_fold)

    # [topo-quality] phase_xp_fold: mirrors topo_xp_fold's decoupling, but for
    # phased_steps' own readiness fold (see phased_steps' quest_first docstring).
    # phased_steps(xp_fold=phase_xp_fold, quest_first=xp_fold): readiness folding
    # (fewer steps stuck in the trailing "Endgame & extras" catch-all because
    # topo_order (upstream) now resolves their order via quest-XP-folded
    # effective levels but phased_steps' OWN local re-simulation still judged
    # them un-ready under plain floors) is controlled by phase_xp_fold; the
    # quest_first PRIORITY scan (the one that breaks an origin-prefix — see
    # plan-grand.mjs) stays tied to the original goal-level xp_fold, unchanged.
    # Defaults to xp_fold itself, so every existing caller is byte-identical.
    phase_xp_fold = goal.get("phase_xp_fold")
    phase_xp_fold = xp_fold if phase_xp_fold is None else bool(phase_xp_fold)

    # origin-chain fix (Lane M1, additive opt-in, same pattern as xp_fold
    # above): _inject_coarse_atoms/_select_branch_drops/_build_checkpoint_index
    # all scan EVERY authored coarse_expansions entry unconditionally — fine
    # for route-p2p/route-corpus/route-quests (their path already contains
    # the full steps.jsonl corpus, so "any(sid in ordered_ids)" short-circuits
    # every unrelated coarse), but a small standalone route (route-origin,
    # 28 steps) contains NONE of e.g. prayer-pot-supply-coarse's ids, so that
    # unconditional scan wrongly injects unrelated supply/combat atoms into
    # it. goal.coarse_ids (default None → unchanged behavior for every
    # existing caller) scopes coarse_expansions to a named allow-list.
    coarse_ids = goal.get("coarse_ids")
    if coarse_ids is not None:
        coarse_expansions = [e for e in (coarse_expansions or []) if e.get("coarse_id") in coarse_ids]

    # P5 — detach overlay nodes before hub/topo reordering.
    clean, overlays = detach_overlays(reals)

    # P6 — hub_batches BEFORE P7 topo_order (S7): cluster quest hubs contiguous
    # at their earliest member; topo is the dependency guard that corrects any
    # skill/tag/quest violation the move introduces.
    batched = hub_batches(clean)

    # P7 — topo_order. Uses topo_xp_fold (decoupled from phased_steps' xp_fold —
    # see the topo_xp_fold comment above).
    ordered = topo_order(batched, xp_fold=topo_xp_fold)

    # Inject atoms from authored coarse_expansions not already in the plan.
    # Handles the 'unwind via coarse_expansions' path (ctr-* combat atoms).
    # [topo-quality] xp_fold propagated (was silently False) — see
    # _inject_coarse_atoms' own docstring for the empirically-measured bug
    # this fixes.
    ordered = _inject_coarse_atoms(ordered, coarse_expansions, atoms_by_id, xp_fold=topo_xp_fold)

    # branch{} selection: keep one member per alt_group (crabs XOR slayer, etc.).
    branch_drops = _select_branch_drops(coarse_expansions, atoms_by_id)
    if branch_drops:
        ordered = [s for s in ordered if s.get("id") not in branch_drops]

    # P8 — insert_supply_steps: opportunistic placement scan (goal-gated) +
    # annotate remaining AOT supply steps with their Supply: phase label.
    ordered = insert_supply_steps(
        ordered, supply_chains or [], opportunistic=opportunistic,
        steps_bank=steps_bank, oppgran_rows=oppgran_opp_rows, xp_fold=topo_xp_fold,
    )

    # P9 — re-attach overlay nodes adjacent to their (possibly reordered) anchors.
    ordered_with_overlays = reattach_overlays(ordered, overlays)

    # Build checkpoint index from authored expansions (used in both paths below).
    checkpoint_start, checkpoint_member = _build_checkpoint_index(coarse_expansions)
    # Keep checkpoint members contiguous so each header renders exactly once.
    ordered_with_overlays = _coalesce_checkpoints(ordered_with_overlays, checkpoint_member)
    # Registry-stable checkpoint ids: index each checkpoint by its position in the
    # expansion's checkpoints[] list (registry order), NOT emission order — so
    # chkpt-<coarse>-<idx> names the same checkpoint in every route (p2p, corpus, …)
    # and by-id enrichment (refs sidecar, contributions) can target it.
    step_to_cp = {}
    for exp in (coarse_expansions or []):
        if exp.get("status") != "authored":
            continue
        cid = exp["coarse_id"]
        for idx, cp in enumerate(exp.get("checkpoints", [])):
            step_to_cp[cp["start"]] = (cid, idx)

    if not milestones:
        # Corpus/appendix: phase by region.
        steps_out = []
        emitted_checkpoints = set()
        for s in ordered_with_overlays:
            sid = s.get("id", "")
            if s.get("_bg"):
                phase = phase_name("background", "")
            elif s.get("_alternation"):
                phase = _region_phase(s)
            elif s.get("_supply"):
                phase = s.get("_supply_phase") or _region_phase(s)
            else:
                phase = _region_phase(s)
            # Emit checkpoint header before first step of each checkpoint group
            if sid in checkpoint_start and sid not in emitted_checkpoints:
                cp_label = checkpoint_start[sid]
                coarse_id, cp_idx = step_to_cp.get(sid, ("unknown", 0))
                steps_out.append(_checkpoint_step(cp_label, phase, coarse_id, cp_idx))
                emitted_checkpoints.add(sid)
            cp = checkpoint_member.get(sid)
            if s.get("_bg"):
                steps_out.append(_bg_step(s, phase, zones))
            elif s.get("_alternation"):
                steps_out.append(_alternation_step(s, phase))
            elif s.get("_supply"):
                steps_out.append(_train_step(s, phase, zones, checkpoint=cp))
            else:
                steps_out.append(_train_step(s, phase, zones, checkpoint=cp))
        steps = steps_out
    else:
        # P10 — phased_steps_with_steer or phased_steps.
        goal_steer_ids = goal.get("steer_points", [])
        # Collect steer_points from individual goal entries if available.
        if not goal_steer_ids:
            goal_steer_ids = []
            for g in milestones:
                goal_steer_ids.extend(g.get("steer_points", []))

        if goal_steer_ids:
            phased = phased_steps_with_steer(
                ordered_with_overlays, milestones, steer_points, goal_steer_ids
            )
        elif demand_gate:
            # P10a/P10b — anchor-pinned nodes ride around the re-pick (see
            # _detach_pinned); phased_steps runs demand-gated on the rest.
            base, pinned = _detach_pinned(ordered_with_overlays)
            anchored = {}
            for ov in pinned:
                anchored.setdefault(ov["anchor_id"], []).append(ov["node"])
            chain_order = {c["id"]: {sid: i for i, sid in enumerate(c.get("steps", []))}
                           for c in (supply_chains or [])}
            phased = phased_steps(base, milestones, xp_fold=phase_xp_fold,
                                  quest_first=xp_fold, demand_gate=True,
                                  anchored_nodes=anchored, chain_order=chain_order)
            phased = _reattach_phased(phased, pinned)
        else:
            phased = phased_steps(ordered_with_overlays, milestones,
                                   xp_fold=phase_xp_fold, quest_first=xp_fold)

        # P11 — emit each record, injecting checkpoint headers before first atom of each group.
        steps = []
        emitted_checkpoints = set()
        for e in phased:
            if "steer" in e:
                steps.append(_steer_step(e["steer"], e["phase"]))
            elif "milestone" in e:
                steps.append(_milestone_step(e["milestone"], e["phase"]))
            elif e["step"].get("_bg"):
                steps.append(_bg_step(e["step"], e["phase"], zones))
            elif e["step"].get("_alternation"):
                steps.append(_alternation_step(e["step"], e["phase"]))
            else:
                sid = e["step"].get("id", "")
                phase = e["phase"]
                # Emit checkpoint header record before first step of each checkpoint group
                if sid in checkpoint_start and sid not in emitted_checkpoints:
                    cp_label = checkpoint_start[sid]
                    coarse_id, cp_idx = step_to_cp.get(sid, ("unknown", 0))
                    steps.append(_checkpoint_step(cp_label, phase, coarse_id, cp_idx))
                    emitted_checkpoints.add(sid)
                cp = checkpoint_member.get(sid)
                steps.append(_train_step(e["step"], phase, zones, checkpoint=cp))

    # UNIVERSAL refs (consolidation contract §C): every emitted step carries refs[].
    # Emitters that have no native refs field (milestone/steer/bg/checkpoint records
    # and planner-synthesized steps) are filled from the by-id map built in main()
    # (steps.jsonl rows + the step_refs.jsonl sidecar). Same for empty mapMarkers.
    for s in steps:
        extra = (extra_by_id or {}).get(s.get("id"))
        if not extra:
            continue
        if not s.get("refs") and extra.get("refs"):
            s["refs"] = extra["refs"]
        if not s.get("mapMarkers") and extra.get("mapMarkers"):
            s["mapMarkers"] = [{**m, "plane": m.get("plane", 0)}
                               for m in extra["mapMarkers"]]
        if train_methods and not s.get("methods") and extra.get("methods"):
            s["methods"] = extra["methods"]
        # Lane B (CONSOLIDATION.md §5/§7, gap-idspace-01): quest_atoms checked
        # FIRST — it's the higher-citation bank (100% refs vs oppgran's
        # partial coverage) and, post-reconciliation, covers every quest
        # granular used to cover alone (see reconcile_quest_idspace.py +
        # consolidate_quest_atoms.py's steps.jsonl short-id parent fallback).
        # granular stays as the true fallback for anything quest_atoms
        # doesn't (yet) reach — redundant for quests, not deleted; still
        # load-bearing for non-quest coarse ids (train-*/synth-* etc, which
        # quest_atoms never touches).
        if quest_atoms and not s.get("subChecklist") and extra.get("questChecklist"):
            s["subChecklist"] = extra["questChecklist"]
        if granular and not s.get("subChecklist") and extra.get("subChecklist"):
            s["subChecklist"] = extra["subChecklist"]

    # Skill+band fallback for planner-SYNTHESIZED training steps: their ids
    # (synth-<skill>-<level>-<n>) carry a per-route counter suffix, so the
    # by-id train_methods.jsonl merge above can never reach them. Match the
    # band instead: smallest train-<skill>-<to> with to >= level, else the
    # skill's top band. Same opt-in flag as the by-id attach.
    if train_methods and methods_by_skill:
        for s in steps:
            if s.get("methods"):
                continue
            m = _SYNTH_ID_RE.match(s.get("id") or "")
            if not m:
                continue
            bands = methods_by_skill.get(m.group(1))
            if not bands:
                continue
            level = int(m.group(2))
            band = next((b for to, b in bands if to >= level), bands[-1][1])
            s["methods"] = band

    # Same skill+band fallback for the granular sub-checklist (tenrich wave):
    # a synth-<skill>-<level>-<n> training step renders the nearest authored
    # band's atoms — the atoms' own until{skill:level} caps may name the
    # band's target rather than the synth level, which is honest (the loop is
    # the same; the stop point is the step's completionCondition). Gated on
    # the same `granular` opt-in as the by-id attach.
    if granular and subchecklists_by_skill:
        for s in steps:
            if s.get("subChecklist"):
                continue
            m = _SYNTH_ID_RE.match(s.get("id") or "")
            if not m:
                continue
            bands = subchecklists_by_skill.get(m.group(1))
            if not bands:
                continue
            level = int(m.group(2))
            s["subChecklist"] = next((b for to, b in bands if to >= level), bands[-1][1])

    return {
        "id": "route-" + goal["id"],
        "name": f"{goal['label']} — Milestone Route",
        "description": f"Prerequisite route for {goal['label']}, segmented into milestone "
                       "episodes by the progression-router planner. Each phase closes on a "
                       "quest/unlock capstone rather than an arbitrary skill number.",
        "steps": steps,
    }


MODE_NOTE = {
    "streamline": "Focused grind while the levels are still fast.",
    "rotate": "Rotation block — swapped in at ~1h to break the abysmal grind (see progression-philosophy).",
}


def block_step(b):
    return {
        "id": f"{b['skill']}-{b['from']}-{b['to']}",
        "instruction": f"Train {b['skill'].title()} to {b['to']} (~{b['hours']}h).",
        "detail": MODE_NOTE.get(b["mode"], ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": [skill_cond(b["skill"], b["to"])],
    }


def enrich_schedule(scheduled):
    goal = scheduled["goal"]
    steps = [block_step(b) for b in scheduled["blocks"]]
    steps.append({
        "id": f"steer-{goal['id']}",
        "instruction": f"Steer point — {goal['label']} reached.",
        "detail": "A milestone/unlock moment: re-decide your next goal from here.",
        "highlights": [], "mapMarkers": [], "completionConditions": [{"type": "MANUAL"}],
    })
    return {
        "id": "route-" + goal["id"],
        "name": f"{goal['label']} — Scheduled Route",
        "description": "Streamlined then round-robin-paced route from the progression-router "
                       "planner + anti-monotony scheduler.",
        "steps": steps,
    }


def load_steer_points(data_dir):
    """Load steer_points.jsonl if present; return empty list if missing."""
    path = data_dir / "steer_points.jsonl"
    if not path.exists():
        return []
    from assets.js.router.load import parseJsonl  # not available in Python; use manual parse
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(l) for l in lines if l.strip()]


def _load_jsonl(path):
    """Load a .jsonl file; return empty list if missing."""
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


# Render-relevant fields for a subChecklist atom (GRANULARITY atom{} ATTACH
# model). label carries through as the atom's own instruction text (mirrors
# _train_step's instruction field); "id"/"kind" are always non-empty.
_SUBCHECKLIST_ATOM_FIELDS = ("id", "label", "detail", "atom", "hints", "refs",
                             "produces", "consumes", "location", "kind",
                             "mapMarkers")


def _project_subchecklist_atom(row):
    """Project a steps_oppgran.jsonl atom row down to the render-relevant
    subChecklist shape, dropping fields that are empty/defaulted on that row
    (e.g. no refs authored yet, no location) so the payload stays small."""
    return {k: row[k] for k in _SUBCHECKLIST_ATOM_FIELDS if row.get(k)}


def main():
    payload = json.load(sys.stdin)
    if "blocks" in payload:                        # scheduled input (schedule.py)
        json.dump(enrich_schedule(payload), sys.stdout, indent=2)
        return
    catalog = json.loads((Path(__file__).parent / "catalog.json").read_text())

    # Load data files from tools data directory.
    data_dir = Path(__file__).parent.parent.parent / "assets" / "data" / "tools"
    steer_points      = _load_jsonl(data_dir / "steer_points.jsonl")
    supply_chains     = _load_jsonl(data_dir / "supply_chains.jsonl")
    coarse_expansions = _load_jsonl(data_dir / "coarse_expansions.jsonl")
    # Build atoms_by_id from steps.jsonl so _inject_coarse_atoms can look up atoms.
    raw_steps   = _load_jsonl(data_dir / "steps.jsonl")
    atoms_by_id = {s["id"]: s for s in raw_steps if s.get("coarse_of")}

    # By-id refs/markers map: steps.jsonl rows first, then the step_refs.jsonl
    # sidecar (wiki refs for emitted ids that are NOT steps.jsonl rows: milestone-*,
    # steer-*, chkpt-*, synth-* and planner-synthesized bg/bootstrap steps).
    extra_by_id = {}
    for s in raw_steps:
        if s.get("refs") or s.get("mapMarkers"):
            extra_by_id[s["id"]] = {"refs": s.get("refs"), "mapMarkers": s.get("mapMarkers")}
    for r in _load_jsonl(data_dir / "step_refs.jsonl"):
        extra_by_id[r["id"]] = {"refs": r.get("refs"), "mapMarkers": r.get("mapMarkers")}

    # Skill-methods picker data (train_methods.jsonl, minted by
    # consolidate_train_methods.py from the normalizer ledger). Merged by step
    # id; attached only when a goal opts in via train_methods:true (see enrich).
    # Absent file or flag off = every fixture byte-identical. methods_by_skill
    # ({skill: [(to_level, methods)] sorted by to_level}) additionally serves
    # the synth-<skill>-<level>-<n> band-match fallback (see enrich).
    methods_by_skill = {}
    methods_file = data_dir / "train_methods.jsonl"
    if methods_file.exists():
        for r in _load_jsonl(methods_file):
            sid = r.get("step_id")
            if not sid:
                continue
            extra_by_id.setdefault(sid, {})["methods"] = r.get("methods")
            band = re.match(r"^train-([a-z]+)-(\d+)$", sid)
            if band:
                methods_by_skill.setdefault(band.group(1), []).append(
                    (int(band.group(2)), r.get("methods")))
        for bands in methods_by_skill.values():
            bands.sort(key=lambda b: b[0])

    # Opportunistic-granularity sub-checklist data (steps_oppgran.jsonl atom
    # rows + coarse_expansions_oppgran.jsonl checkpoints, minted by W3). ATTACH
    # model: grouped by coarse_id (NOT flat-injected — _inject_coarse_atoms
    # above is untouched), merged onto the matching coarse step's extra as
    # subChecklist{atoms,checkpoints}; attached only when a goal opts in via
    # granular:true (see enrich). Absent sidecar or flag off = every fixture
    # byte-identical. Atom order follows each expansion's own `steps` list
    # (same ordering contract _inject_coarse_atoms/_select_branch_drops use).
    # U8 reuse fallback (tenrich wave): an expansion's steps[] may reference an
    # atom that lives in steps.jsonl rather than the oppgran sidecar (pointer
    # stubs like ctr-01-kill-chickens, external supply reuses like
    # pps-02-steal-ranarr-seeds) — resolve those from steps.jsonl so the reuse
    # renders instead of silently dropping out of the sub-checklist. Sidecar
    # wins on id collision (it carries the corrected/enriched copy).
    # methods_by_skill's shape is mirrored by subchecklists_by_skill for the
    # synth-<skill>-<level>-<n> band-match fallback (see enrich).
    oppgran_by_id = {r["id"]: r for r in _load_jsonl(data_dir / "steps_oppgran.jsonl")}
    steps_by_id = {s["id"]: s for s in raw_steps}
    subchecklists_by_skill = {}
    for exp in _load_jsonl(data_dir / "coarse_expansions_oppgran.jsonl"):
        cid = exp.get("coarse_id")
        atoms = [_project_subchecklist_atom(oppgran_by_id.get(sid) or steps_by_id[sid])
                 for sid in exp.get("steps", [])
                 if sid in oppgran_by_id or sid in steps_by_id]
        if not cid or not atoms:
            continue
        checklist = {"atoms": atoms, "checkpoints": exp.get("checkpoints", [])}
        extra_by_id.setdefault(cid, {})["subChecklist"] = checklist
        band = re.match(r"^train-([a-z]+)-(\d+)$", cid)
        if band:
            subchecklists_by_skill.setdefault(band.group(1), []).append(
                (int(band.group(2)), checklist))
    for bands in subchecklists_by_skill.values():
        bands.sort(key=lambda b: b[0])

    # NORMALIZATION §1a — quest sub-checklist data (steps_quest_atoms.jsonl atom
    # rows + quest_expansions.jsonl registry, minted by consolidate_quest_atoms.py
    # from the questatoms fan-out). Same ATTACH model as oppgran above, kept in
    # its own extra slot (questChecklist) so the two opt-in flags stay
    # independent; attached as subChecklist only when a goal sets
    # quest_atoms:true (see enrich). Absent files or flag off = byte-identical.
    quest_atoms_by_id = {r["id"]: r for r in _load_jsonl(data_dir / "steps_quest_atoms.jsonl")}
    for exp in _load_jsonl(data_dir / "quest_expansions.jsonl"):
        cid = exp.get("coarse_id")
        atoms = [_project_subchecklist_atom(quest_atoms_by_id[sid])
                 for sid in exp.get("steps", []) if sid in quest_atoms_by_id]
        if cid and atoms:
            extra_by_id.setdefault(cid, {})["questChecklist"] = {
                "atoms": atoms,
                "checkpoints": exp.get("checkpoints", []),
            }

    # OPPORTUNISTIC_GRANULARITY §2/§4 O-track — wiki-grounded opportunity rows
    # (oppgran:opp:<item>@<zone> keys, contrib.jsonl idempotent ledger) feed
    # backprop.py's source index alongside steps.jsonl's own produces{} edges.
    # Absent ledger or flag off (opportunistic:false) = every fixture byte-identical.
    contrib_path = Path(__file__).parent.parent / "wiki-kb" / "contrib.jsonl"
    oppgran_opp_rows = [r for r in _load_jsonl(contrib_path)
                         if r.get("key", "").startswith("oppgran:opp:")]

    json.dump(
        enrich(payload, catalog, steer_points, supply_chains,
               coarse_expansions=coarse_expansions, atoms_by_id=atoms_by_id,
               extra_by_id=extra_by_id, steps_bank=raw_steps,
               oppgran_opp_rows=oppgran_opp_rows,
               methods_by_skill=methods_by_skill,
               subchecklists_by_skill=subchecklists_by_skill),
        sys.stdout, indent=2
    )


if __name__ == "__main__":
    main()
