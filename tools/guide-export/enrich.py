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
                # Apply grants: skill levels + boolean tags
                for k, v in (s.get("grants") or {}).items():
                    if isinstance(v, (int, float)):
                        state[k] = max(lvl(k), v)
                    elif v is True:
                        state[f"tag:{k}"] = True
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


# P8 — insert_supply_steps: annotate supply steps with their Supply: phase label.
# AOT and "either"-timing supply steps get _supply_phase set so phased_steps_with_steer
# can group them under the Supply: <chain> phase before their consuming milestone.
# JIT supply steps are left unannotated — they co-locate in the consumer's phase.
def insert_supply_steps(ordered, supply_chains):
    """P8: Annotate supply steps with Supply: phase label.
    AOT/either-timing steps → _supply_phase = phase_name("supply", chain_label).
    JIT steps → no annotation (stays in consumer's milestone phase).
    Bootstrap steps → always AOT, get _supply_phase like other AOT supply steps.
    """
    chain_label = {c["id"]: c["label"] for c in (supply_chains or [])}
    result = []
    for step in ordered:
        chain_id = step.get("_supply_chain") or step.get("supply_chain")
        if chain_id and step.get("_supply"):
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


def phased_steps(ordered, milestones, xp_fold=False, quest_first=None):
    """Segment steps into tight milestone episodes. Milestones are taken easiest
    first; each episode pulls exactly the not-yet-emitted training that advances
    toward its skill reqs, then emits the milestone as the episode's capstone.
    Steps no milestone needs fall into a trailing 'Endgame & extras' phase.

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
    # eff() folds accumulated quest-reward XP on top of the trained floor —
    # used ONLY for per-step readiness (below), matching graph.js effRead, so a
    # step whose bank-side reqs.skills is only reachable via quest XP (not pure
    # training) is still judged playable in the right relative order. met(target)
    # (the milestone-episode completion check) deliberately keeps plain lvl() —
    # unchanged from before this fix — so existing routes stay byte-identical.
    eff = _make_effective_lvl(state, lvl) if xp_fold else lvl
    quest_done = lambda qid: state.get(f"quest:{qid}", False)

    def apply(step):
        for k, v in (step.get("grants") or {}).items():
            if isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)
        if _is_quest(step):
            state[f"quest:{step['id']}"] = True
            if xp_fold:
                _accumulate_quest_xp(state, step)

    def met(reqs):
        return all(lvl(k) >= v for k, v in reqs.items())

    def ready(step):
        quest_reqs = (step.get("reqs") or {}).get("quests", []) or []
        gate = (step.get("location") or {}).get("quest_gate")
        skill_reqs = _skill_reqs(step)
        return (all(eff(k) >= v for k, v in skill_reqs.items())
                and all(quest_done(q) for q in quest_reqs)
                and (quest_done(gate) if gate else True))

    def advances(step, target):
        grants = step.get("grants") or {}
        return any(k in target and lvl(k) < target[k] for k in grants)

    def take(pred):
        step = next((s for s in remaining if ready(s) and pred(s)), None)
        if step is None:
            return None
        remaining.remove(step)
        apply(step)
        return step

    for m in ms:
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
            step = take(quest_first_pred) or take(lambda s: advances(s, target)) or take(lambda s: True)
            if step is None:
                break                         # unmet prereq — capstone anyway
            out.append({"step": step, "phase": phase})
        out.append({"milestone": m, "phase": phase})
    for step in remaining:
        out.append({"step": step, "phase": phase_name("endgame", "")})
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
        for k, v in (step.get("grants") or {}).items():
            if isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)
            elif v is True:
                state[f"tag:{k}"] = True
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
    # FRAMES_GALLERY §2 — captured frames/gifs pass through verbatim (same pattern as refs).
    if step.get("media"):
        out["media"] = step["media"]
    # Lane 3 — passiveOverlays: zero-time embed badges resolved onto this ACTIVE
    # host by overlay.js (P4). Never present on a _bg chip — weaveOverlays never
    # annotates one (sequencer OQ-6).
    if step.get("_passiveOverlays"):
        out["passiveOverlays"] = step["_passiveOverlays"]
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
    header renders once; non-members keep their relative position."""
    if not checkpoint_member:
        return steps
    result, block_end = [], {}
    for s in steps:
        cp = checkpoint_member.get(s.get("id"))
        if cp is None or cp not in block_end:
            result.append(s)
            if cp is not None:
                block_end[cp] = len(result) - 1
            continue
        pos = block_end[cp] + 1
        result.insert(pos, s)
        block_end = {k: (v + 1 if v >= pos and k != cp else v) for k, v in block_end.items()}
        block_end[cp] = pos
    return result


def enrich(plan, catalog, steer_points, supply_chains=None,
           coarse_expansions=None, atoms_by_id=None, extra_by_id=None):
    goal = plan["goal"]
    zones = catalog.get("zones", {})
    reals = [s for s in plan["path"] if not s.get("_capstone")]
    milestones = goal.get("goals", []) or []
    # quest-chain fix — opt-in XP fold (see topo_order's docstring). Only the
    # quest-progression payload (plan-quests.mjs) sets goal.xp_fold; every
    # other caller gets xp_fold=False, the exact pre-fix behavior.
    xp_fold = bool(goal.get("xp_fold"))

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

    # P8 — insert_supply_steps: annotate AOT supply steps with Supply: phase label.
    ordered = insert_supply_steps(ordered, supply_chains or [])

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

    json.dump(
        enrich(payload, catalog, steer_points, supply_chains,
               coarse_expansions=coarse_expansions, atoms_by_id=atoms_by_id,
               extra_by_id=extra_by_id),
        sys.stdout, indent=2
    )


if __name__ == "__main__":
    main()
