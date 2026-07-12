#!/usr/bin/env python3
"""Enrich a progression-router plan into a guide-chain guide JSON.

Reads a plan (from plan.mjs) on stdin, enriches each step with render metadata,
and emits a guide-chain guide {id,name,description,steps[]} on stdout.

Pipeline (S7): load → burndownResolve → bank-split → routeMulti(greedy) →
  weaveOverlays ‖ detach-overlays → hub_batches → topo_order →
  insert_supply_steps → re-attach → phased_steps_with_steer → emit

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


def topo_order(steps):
    """Valid play order: emit a step once its skill reqs AND tag reqs are met.
    Produces/grants applied additively (local dict only — ordering guard, not planner state).
    S7: tag reqs from reqs.tags checked against state tag:* keys, enabling bootstrap-before-loop
    ordering (supply loop steps carry reqs.tags:['bootstrap-<chain>'])."""
    state, remaining, ordered = {}, list(steps), []
    lvl = lambda k: state.get(k, 1)
    has_tag = lambda t: state.get(f"tag:{t}", False)
    while remaining:
        progressed = False
        for s in list(remaining):
            skill_reqs = (s.get("reqs") or {}).get("skills", {}) or {}
            tag_reqs   = (s.get("reqs") or {}).get("tags",   []) or []
            skills_ok = all(lvl(k) >= v for k, v in skill_reqs.items())
            tags_ok   = all(has_tag(t) for t in tag_reqs)
            if skills_ok and tags_ok:
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
                remaining.remove(s)
                progressed = True
        if not progressed:               # unmet dep -> append remainder verbatim
            ordered.extend(remaining)
            break
    return ordered


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


# P5 — detach overlay nodes (_bg: True) from path before hub/topo reordering.
# Returns (clean_path, overlay_list) where overlay_list items are
# {anchor_id, side, node} tuples.
def detach_overlays(path):
    clean = []
    overlays = []
    for step in path:
        if step.get("_bg"):
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


def phased_steps(ordered, milestones):
    """Segment steps into tight milestone episodes. Milestones are taken easiest
    first; each episode pulls exactly the not-yet-emitted training that advances
    toward its skill reqs, then emits the milestone as the episode's capstone.
    Steps no milestone needs fall into a trailing 'Endgame & extras' phase."""
    ms = sorted(milestones, key=_difficulty)
    remaining, state, out = list(ordered), {}, []
    lvl = lambda k: state.get(k, 1)

    def apply(step):
        for k, v in (step.get("grants") or {}).items():
            if isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)

    def met(reqs):
        return all(lvl(k) >= v for k, v in reqs.items())

    def ready(step):
        return met(_skill_reqs(step))

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
            step = take(lambda s: advances(s, target)) or take(lambda s: True)
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

    def apply_step(step):
        for k, v in (step.get("grants") or {}).items():
            if isinstance(v, (int, float)):
                state[k] = max(lvl(k), v)
            elif v is True:
                state[f"tag:{k}"] = True

    def ready(step):
        reqs = _skill_reqs(step)
        tag_reqs = (step.get("reqs") or {}).get("tags", []) or []
        return (all(lvl(k) >= v for k, v in reqs.items()) and
                all(has_tag(t) for t in tag_reqs))

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


def _train_step(step, phase, zones, checkpoint=None):
    cat = zones.get((step.get("location") or {}).get("zone"))
    conds = [skill_cond(k, v) for k, v in (step.get("grants") or {}).items() if k in SKILL_ENUM]
    out = {
        "id": step["id"],
        "phase": phase,
        "instruction": task_instruction(step),
        "detail": step.get("detail", ""),
        "highlights": [{"type": "NPC", "id": cat["npc"]}] if cat and cat.get("npc") else [],
        "mapMarkers": [{"x": cat["x"], "y": cat["y"], "plane": cat.get("plane", 0),
                        "label": cat.get("label")}] if cat else [],
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
    return {
        "id": "milestone-" + milestone["id"],
        "phase": phase,
        "instruction": f"★ {milestone['label']}",
        "detail": note,
        "highlights": [], "mapMarkers": [],
        "completionConditions": [skill_cond(k, v) for k, v in reqs.items()] or [{"type": "MANUAL"}],
    }


def _steer_step(steer_pt, phase, waypoint=False):
    """Emit a steer-point card. Lane 1: skill-based or MANUAL completion.
    Waypoint (anchor_weight < 0.8) uses lighter visual prefix."""
    cond = steer_pt.get("unlock_condition", {})
    skill_reqs = cond.get("skills", {})
    conds = [skill_cond(k, v) for k, v in skill_reqs.items()] or [{"type": "MANUAL"}]
    prefix = "⬡" if waypoint else "★"
    return {
        "id": steer_pt["id"],  # id already carries the "steer-" prefix
        "phase": phase,
        "steerKind": steer_pt["kind"],
        "instruction": f"{prefix} {steer_pt['label']}",
        "detail": steer_pt.get("downstream_acceleration", ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": conds,
    }


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


def _inject_coarse_atoms(ordered, coarse_expansions, atoms_by_id):
    """Post-plan injection: for authored expansions whose atoms are absent from
    the ordered list, append the missing atoms so they flow through topo_order.
    This is the 'unwind via coarse_expansions' path (GRANULARITY §6 Lane 2 note).
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
    return topo_order(list(ordered) + to_inject)


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
           coarse_expansions=None, atoms_by_id=None):
    goal = plan["goal"]
    zones = catalog.get("zones", {})
    reals = [s for s in plan["path"] if not s.get("_capstone")]
    milestones = goal.get("goals", []) or []

    # P5 — detach overlay nodes before hub/topo reordering.
    clean, overlays = detach_overlays(reals)

    # P7 — topo_order (hub_batches is Lane 3+; here topo is the dep guard).
    ordered = topo_order(clean)

    # Inject atoms from authored coarse_expansions not already in the plan.
    # Handles the 'unwind via coarse_expansions' path (ctr-* combat atoms).
    ordered = _inject_coarse_atoms(ordered, coarse_expansions, atoms_by_id)

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
    # coarse_id lookup for _checkpoint_step id generation
    step_to_coarse = {}
    cp_counter = {}
    for exp in (coarse_expansions or []):
        if exp.get("status") != "authored":
            continue
        cid = exp["coarse_id"]
        for cp in exp.get("checkpoints", []):
            step_to_coarse[cp["start"]] = cid

    if not milestones:
        # Corpus/appendix: phase by region.
        steps_out = []
        emitted_checkpoints = set()
        for s in ordered_with_overlays:
            sid = s.get("id", "")
            phase = phase_name("background", "") if s.get("_bg") else (
                s.get("_supply_phase") or _region_phase(s) if s.get("_supply") else _region_phase(s)
            )
            # Emit checkpoint header before first step of each checkpoint group
            if sid in checkpoint_start and sid not in emitted_checkpoints:
                cp_label = checkpoint_start[sid]
                coarse_id = step_to_coarse.get(sid, "unknown")
                cp_idx = cp_counter.get(coarse_id, 0)
                cp_counter[coarse_id] = cp_idx + 1
                steps_out.append(_checkpoint_step(cp_label, phase, coarse_id, cp_idx))
                emitted_checkpoints.add(sid)
            cp = checkpoint_member.get(sid)
            if s.get("_bg"):
                steps_out.append(_bg_step(s, phase, zones))
            elif s.get("_supply"):
                steps_out.append(_train_step(s, s.get("_supply_phase") or _region_phase(s), zones, checkpoint=cp))
            else:
                steps_out.append(_train_step(s, _region_phase(s), zones, checkpoint=cp))
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
            phased = phased_steps(ordered_with_overlays, milestones)

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
            else:
                sid = e["step"].get("id", "")
                phase = e["phase"]
                # Emit checkpoint header record before first step of each checkpoint group
                if sid in checkpoint_start and sid not in emitted_checkpoints:
                    cp_label = checkpoint_start[sid]
                    coarse_id = step_to_coarse.get(sid, "unknown")
                    cp_idx = cp_counter.get(coarse_id, 0)
                    cp_counter[coarse_id] = cp_idx + 1
                    steps.append(_checkpoint_step(cp_label, phase, coarse_id, cp_idx))
                    emitted_checkpoints.add(sid)
                cp = checkpoint_member.get(sid)
                steps.append(_train_step(e["step"], phase, zones, checkpoint=cp))

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

    json.dump(
        enrich(payload, catalog, steer_points, supply_chains,
               coarse_expansions=coarse_expansions, atoms_by_id=atoms_by_id),
        sys.stdout, indent=2
    )


if __name__ == "__main__":
    main()
