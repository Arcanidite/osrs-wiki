# Design: steer-point taxonomy (facet: steer)

Covers: non-level, non-pinnacle-quest milestones that drive phase structure.
Does NOT cover: supply-loop cadencing (supply facet), alternation-slot scheduling
(interleave facet), or depth-first requisite resolution (burndown facet).

---

## 1. MODEL

### 1a. New file: `assets/data/tools/steer_points.jsonl`

One steer-point node per line. Shape:

```jsonc
{
  "id": "steer-fairy-rings",           // string; "steer-" prefix by convention
  "label": "Fairy Rings",              // short display label
  "kind": "access",                    // enum — see §1b
  "unlock_condition": {                // what must be achieved to reach this steer-point
    "quests":  ["quest-fairytale-1"],  // step ids from steps.jsonl / goals.jsonl
    "skills":  {},                     // skill→level map (same shape as reqs.skills)
    "items":   [],                     // item name strings (for supply_infra steer-points)
    "unlocks": []                      // other steer_point ids that must precede this one
  },
  "grants": {
    "tags":       ["fairy-rings"],     // tags added to state; consumed by steps via reqs.tags
    "travel_hub": "fairy-rings"        // optional semantic label for the interleave facet
  },
  "downstream_acceleration": "Unlocks 11 fairy-ring destinations; collapses multi-region quest routing.",
  "anchor_weight": 0.9,                // float 0.0–1.0 (see §2 for threshold semantics)
  "timing": "ahead-of-time",           // ahead-of-time | jit | either
  "recurring": false                   // true = first-activation only; ongoing lifecycle owned by interleave facet
}
```

### 1b. `kind` taxonomy

| kind | what it covers | example ids |
|---|---|---|
| `access` | travel unlocks, region gates, minigame hubs | steer-fairy-rings, steer-spirit-tree, steer-poh-relocation, steer-ba-hub |
| `qol_gear` | outfit/equipment that changes movement or efficiency | steer-graceful, steer-slayer-helm, steer-carpenter-outfit, steer-prospector, steer-angler |
| `supply_infra` | farming/production setups that enable sustained self-supply | steer-ultracompost, steer-birdhouses, steer-seaweed-farm, steer-herb-patch-network |
| `progress_metric` | cumulative counters that serve as progression health checks | steer-ardougne-easy-diary, steer-morytania-hard-diary, steer-quest-cape-32qp, steer-clog-percent |
| `combat_spine` | slayer master step-ups, point-purchase unlocks, gear inflections | steer-nieve-unlock, steer-slayer-helm-unlock, steer-whip-85, steer-bigger-and-badder |

Pet drops are `progress_metric` with `anchor_weight: 0.0` — catalogued but never a phase boundary (RNG-gated; cannot be planned).

### 1c. Extensions to `steps.jsonl` nodes

Add one optional field to any step that directly achieves or materially advances a steer-point:

```jsonc
"steer_id": "steer-fairy-rings"   // nullable string; references steer_points.jsonl
```

Example: the Fairytale I quest step gets `"steer_id": "steer-fairy-rings"`. The Agility 60 step gets `"steer_id": "steer-graceful"`.

This creates a lightweight foreign-key relation: planner can group steps by steer_id to find "what advances toward this steer-point".

### 1d. Extensions to `goals.jsonl` nodes

Add one optional field:

```jsonc
"steer_points": ["steer-fairy-rings", "steer-graceful", "steer-ardougne-easy-diary"]
```

Lists which steer-points should appear as phase anchors when routing toward this goal. Allows goal-specific tuning without changing the global steer catalog.

### 1e. `GuideStep.java` additions

Add one nullable field:

```java
/**
 * Steer-point kind for special rendering ("access", "qol_gear", "supply_infra",
 * "progress_metric", "combat_spine"). Null on regular training/quest steps.
 * Used by the plugin to decorate steer-point steps differently in the panel.
 */
public String steerKind;
```

No structural change to the rendering pipeline. The plugin can render a different badge color or icon per kind without logic changes.

---

## 2. RULES / ALGORITHM

### 2a. anchor_weight semantics

| anchor_weight range | behavior |
|---|---|
| >= 0.8 | HARD boundary — always becomes its own named phase ("Toward <label>") |
| 0.5–0.79 | SOFT boundary — becomes a phase boundary only if it sits on the critical path of >= 2 downstream milestones |
| < 0.5 | WAYPOINT — emitted as an inline ★ step within the enclosing milestone's phase, not a new phase header |
| 0.0 | NEVER an anchor (pets) — may still be emitted as a passive-note step |

### 2b. Steer-point ordering relative to milestones

```pseudocode
function steer_sort_key(node):
    // Lower key = earlier in route
    if is_steer_point(node):
        max_skill = max(node.unlock_condition.skills.values(), default=0)
        quest_count = len(node.unlock_condition.quests)
        return (max_skill, quest_count, -node.anchor_weight)
    else:  // milestone
        return (_difficulty(node), 0, 0)

// Insert steer-points ahead of any milestone whose critical-path steps
// reference a tag this steer-point grants:
function precedes_milestone(steer_pt, milestone, steps):
    steer_tags = set(steer_pt.grants.tags)
    for step in steps_needed_for(milestone, steps):
        if any(t in steer_tags for t in step.reqs.get("tags", [])):
            return True
        if step.location.get("travel_hub") in steer_tags:
            return True
    return False

function merged_anchors(milestones, steer_points, steps, goal_steer_ids):
    active_steers = [sp for sp in steer_points if sp.id in goal_steer_ids]
    all_anchors = milestones + active_steers
    // Sort: steer-points that precede a milestone come before it
    // Tie-break: steer_sort_key
    return topological_sort(all_anchors,
        edge_fn=lambda a,b: is_steer_point(a) and precedes_milestone(a, b, steps),
        key_fn=steer_sort_key)
```

### 2c. Phase emission (extends enrich.py `phased_steps`)

```pseudocode
function phased_steps_with_steer(ordered, milestones, steer_points, goal):
    goal_steer_ids = set(goal.get("steer_points", []))
    all_anchors = merged_anchors(milestones, steer_points, ordered, goal_steer_ids)
    remaining, state, out = list(ordered), {}, []

    for anchor in all_anchors:
        if is_steer_point(anchor) and anchor.anchor_weight >= 0.8:
            phase = f"Toward {anchor.label}"
            while not steer_met(anchor, state):
                step = take_advancing(anchor, remaining, state)
                        or take_any_ready(remaining, state)
                if step is None: break
                apply_grants(step, state)
                out.append({"step": step, "phase": phase})
            out.append({"steer": anchor, "phase": phase})
        elif is_steer_point(anchor) and anchor.anchor_weight < 0.8:
            // waypoint — inject inline when met rather than as a phase header
            // enrich.py defers to interleave facet for placement; emit as WAYPOINT type
            out.append({"steer": anchor, "phase": current_phase, "waypoint": True})
        else:
            // existing milestone logic (unchanged)
            phase = f"Toward {anchor.label}"
            target = _skill_reqs(anchor)
            while not met(target, state):
                step = take_advancing_skill(target, remaining, state)
                        or take_any_ready(remaining, state)
                if step is None: break
                apply_grants(step, state)
                out.append({"step": step, "phase": phase})
            out.append({"milestone": anchor, "phase": phase})

    for step in remaining:
        out.append({"step": step, "phase": "Endgame & extras"})
    return out
```

### 2d. steer_met predicate

```pseudocode
function steer_met(steer_pt, state):
    cond = steer_pt.unlock_condition
    // skill check
    if any(state.skills.get(sk, 1) < lvl for sk, lvl in cond.skills.items()):
        return False
    // quest check (quest step completedIds)
    if any(q not in state.completed_ids for q in cond.quests):
        return False
    // prerequisite steer-point check
    if any(dep not in state.completed_steers for dep in cond.unlocks):
        return False
    return True
```

---

## 3. INTEGRATION

### 3a. greedy.js

**New graph edge type:** `step:steer` — emitted from a steer-point node's `grants.tags` to
any step that lists a matching tag in its `reqs.tags`.

**`isUseful()` extension:** A steer-point step is useful if any remaining step in `remaining`
has a `reqs.tags` entry that is in `steer_pt.grants.tags`.

```js
// Add to isUseful():
if (step._steerPoint) {
  const grantedTags = new Set(step.grants?.tags ?? []);
  return [...remaining].some(id => {
    const s = stepsById.get(id);
    return (s?.reqs?.tags ?? []).some(t => grantedTags.has(t));
  });
}
```

**`locationAccessible()` extension:** No change needed. Steer-point steps encode their own
`location` if they have one (e.g., birdhouses → Fossil Island region gate).

**`costFor()` extension:** Steer-points with `anchor_weight >= 0.8` get cost multiplied by
`0.5` (prioritized like quest steps) so the greedy algo pulls them forward when eligible.

**`routeMulti()` extension:** Steer-points from `steer_points.jsonl` are merged into the
`steps` array before routing, tagged `_steerPoint: true`. After routing, they survive into
the path and are recognized by enrich.py.

### 3b. enrich.py

1. Load `steer_points.jsonl` at startup alongside steps + goals.
2. Pass `steer_points` list into `phased_steps_with_steer()` (new function replacing `phased_steps()`).
3. New emitter function `_steer_step(steer_pt, phase, waypoint=False)`:

```python
def _steer_step(steer_pt, phase, waypoint=False):
    cond = steer_pt.get("unlock_condition", {})
    # Completion condition: MANUAL for access/qol unlocks that can't be
    # auto-detected by skill level. Use skill_cond only if a skill level
    # is the sole gate.
    skill_reqs = cond.get("skills", {})
    conds = [skill_cond(k, v) for k, v in skill_reqs.items()] or [{"type": "MANUAL"}]
    prefix = "⬡" if waypoint else "★"  # waypoint = lighter visual weight
    return {
        "id": "steer-" + steer_pt["id"],
        "phase": phase,
        "steerKind": steer_pt["kind"],
        "instruction": f"{prefix} {steer_pt['label']}",
        "detail": steer_pt.get("downstream_acceleration", ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": conds,
    }
```

4. `MILESTONE_NOTE` dict extended with steer-point narrative entries.

### 3c. GuideStep.java

Add `steerKind` field only (see §1e). No logic changes. The plugin uses it for rendering only.

### 3d. Seams with other facets

| seam | owned by | steer's responsibility |
|---|---|---|
| supply_infra node content (ultracompost recipe, birdhouse materials) | supply facet | steer defines the steer_point wrapper + anchor_weight; supply defines the step nodes that achieve it |
| passive loop recurrence (birdhouses every 90min, herb runs) | interleave facet | steer marks `"recurring": true` on those steer-points; lifecycle scheduling deferred to interleave |
| depth-first unlock_condition resolution | burndown facet | steer provides the catalog; burndown treats `unlock_condition.quests` as requisite nodes to resolve |
| GuideStep rendering decoration | plugin/render layer | steer provides `steerKind`; plugin decides badge/icon per kind |

---

## 4. WORKED EXAMPLE — Ardougne Easy Diary as anchor (pattern 12)

Six steer-points, all active on a route toward a mid-game Barrows goal:

### Steer-point nodes (abbreviated)

```jsonc
{"id":"steer-fairy-rings","label":"Fairy Rings","kind":"access",
 "unlock_condition":{"quests":["quest-fairytale-1"]},"grants":{"tags":["fairy-rings"]},
 "downstream_acceleration":"11 destinations; collapses multi-region quest routing.",
 "anchor_weight":0.9,"timing":"ahead-of-time","recurring":false}

{"id":"steer-graceful","label":"Graceful outfit","kind":"qol_gear",
 "unlock_condition":{"skills":{"agility":60},"items":["260 marks of grace"]},
 "grants":{"tags":["graceful"]},
 "downstream_acceleration":"~67% run-energy retention at zero weight; compresses all future travel.",
 "anchor_weight":0.85,"timing":"ahead-of-time","recurring":false}

{"id":"steer-birdhouses","label":"Birdhouse runs","kind":"supply_infra",
 "unlock_condition":{"quests":["quest-bone-voyage"],"skills":{"crafting":5}},
 "grants":{"tags":["birdhouse-infra"]},
 "downstream_acceleration":"Passive bird nests every 50 min; seed supply without slayer dependency.",
 "anchor_weight":0.7,"timing":"ahead-of-time","recurring":true}

{"id":"steer-ultracompost","label":"Ultracompost","kind":"supply_infra",
 "unlock_condition":{"items":["30 pineapples","volcanic ash"],"quests":["quest-bone-voyage"]},
 "grants":{"tags":["ultracompost"]},
 "downstream_acceleration":"10+ herbs guaranteed per patch (vs ~5); gates herb-run viability.",
 "anchor_weight":0.8,"timing":"ahead-of-time","recurring":false}

{"id":"steer-ardougne-easy-diary","label":"Ardougne Easy Diary","kind":"progress_metric",
 "unlock_condition":{"quests":["quest-sheep-shearer","quest-clock-tower","quest-biohazard"],
                     "skills":{"fishing":15,"cooking":15}},
 "grants":{"tags":["ardougne-easy-diary","ardougne-cloak"]},
 "downstream_acceleration":"Cloak 1 teleport to Ardougne; Kandarin efficiency stacks with Fairy Rings + Graceful.",
 "anchor_weight":1.0,"timing":"ahead-of-time","recurring":false}

{"id":"steer-nieve","label":"Nieve (Combat 85)","kind":"combat_spine",
 "unlock_condition":{"skills":{"hitpoints":85}},
 "grants":{"tags":["slayer-master-nieve"]},
 "downstream_acceleration":"Broader task pool (Abyssal demons, Drakes); more points per task → Slayer helm sooner.",
 "anchor_weight":0.85,"timing":"ahead-of-time","recurring":false}
```

### Anchor ordering result

Precedence analysis:
- fairy-rings precedes most milestones (all quest steps use fairy ring travel)
- graceful precedes ardougne-easy-diary (diary tasks involve heavy running)
- birdhouses + ultracompost precede ardougne-easy-diary (herb farming needed for diary tasks)
- ardougne-easy-diary (anchor_weight 1.0) is the canonical episode boundary
- nieve follows the diary (combat 85 requires training that diary prereqs feed into)

Resulting phase headers for a Barrows goal:

```
Phase 1 — "Toward Fairy Rings"
  steps: Lost City → Nature Spirit → Fairytale I
  closes: ★ Fairy Rings

Phase 2 — "Toward Graceful outfit"
  steps: Agility 40 (Draynor rooftop) → Agility 60 (Falador/Seers rooftop) + marks accumulation
  closes: ★ Graceful outfit

Phase 3 — "Toward Birdhouse runs"   [anchor_weight 0.7 — promoted because supply_infra precedes ultracompost]
  steps: Bone Voyage prerequisites → Bone Voyage
  closes: ★ Birdhouse runs (first activation; recurring loop handed to interleave facet)

Phase 4 — "Toward Ultracompost"
  steps: pineapple stockpile (farming + cooking) → volcanic ash gathering (mining on Fossil Island)
  closes: ★ Ultracompost

Phase 5 — "Toward Ardougne Easy Diary"   [THE ANCHOR]
  steps: Sheep Shearer → Clock Tower → Biohazard → Fishing 15 → Cooking 15 + diary tasks
  closes: ★ Ardougne Easy Diary
  NOTE: this phase is the efficiency collapse point from pattern 12 — all subsequent
        Kandarin content benefits from the cloak teleport stacking with fairy rings + graceful

Phase 6 — "Toward Nieve (Combat 85)"
  steps: combat training blocks to 85 hitpoints (via slayer or crabs)
  closes: ★ Nieve unlocked

Phase 7 — "Toward Barrows"
  (existing milestone logic; benefits from all 6 steer-points already active)
```

What each steer-point unlocks/accelerates in the route:
- fairy-rings: removes walking legs from quest batching; Slayer master cycling becomes same-session
- graceful: run-energy no longer a pacing constraint in phase 5 cluster (11 tasks in one region)
- birdhouses: passive bird nests arrive during phases 4–7; herb seed pressure removed from slayer loop
- ultracompost: herb patches yield enough ranarr for prayer pots before Barrows entry
- ardougne-easy-diary: Ardougne Cloak 1 compresses phases 5→7 travel to near-zero; canonical anchor
- nieve: 5–10 Slayer points per task (vs 2–3 from Mazchna); Slayer helm unlockable within 40 tasks

---

## 5. OPEN QUESTIONS for the fable synthesizer

**OQ-1 (node location):** Goals already encode some steer-points (e.g., a diary could be a goal in goals.jsonl). Keeping steer_points.jsonl separate maintains clean separation but requires the planner to merge two node types. Alternative: extend goals.jsonl with `anchor_weight` and `kind`. The synthesizer must pick one canonical home and publish it.

**OQ-2 (non-detectable completion):** Access unlocks (Fairy Rings, POH relocation, spirit tree) cannot be auto-detected via the RuneLite SKILL API. These steps require `completionConditions: [{"type":"MANUAL"}]` unless the plugin gains VARBIT or VARPLAYER checking. The synthesizer must rule: add VARBIT condition type to the completion schema, or accept that access-kind steer steps are always MANUAL.

**OQ-3 (anchor_weight threshold calibration):** The 0.8 hard-boundary threshold is a design choice that interacts with how many phases the interleave facet is willing to schedule. If interleave imposes a max-phase-count constraint, anchor_weight thresholds need a shared constant. Synthesizer: publish `STEER_HARD_THRESHOLD` in a shared config location.

**OQ-4 (recurring supply_infra lifecycle):** steer-points with `"recurring": true` (birdhouses, herb runs) are one-shot in GuideStep (step advances on first activation). The guide will never re-surface them. The interleave facet must own the re-entry representation (cadence steps, background loop tracking). Synthesizer: confirm this division of ownership; steer will not define recurring-step shapes.

**OQ-5 (diary tiers):** Each diary area has 4 tiers (Easy/Medium/Hard/Elite). Whether this produces 4 steer-point nodes per area or one node with a `tier` parameter affects catalog size (15 areas × 4 = 60 nodes). The synthesizer must decide the shape; steer proposes separate nodes (cleaner anchor_weight per tier) but defers the call.

**OQ-6 (progress_metric vs. goal):** Collection-log % and quest-point checkpoints are progress_metric steer-points. They don't map cleanly to a single step or quest — they're aggregate counters. The burndown facet must decide whether these become synthetic "checkpoint" steps with MANUAL conditions, or whether they're skipped in the step-by-step guide and only surface in the plugin's progress panel. Synthesizer: rule on whether aggregate metrics appear in the step list at all.
