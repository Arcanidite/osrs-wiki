# Background / Passive-Loop Scheduler — design facet

Facet owner: **background** (cadence-scheduled fire-and-forget tasks + lifecycle tracking).
System baseline: `steps.jsonl` / `goals.jsonl` → `greedy.js` → `enrich.py` → `GuideStep.java`.

---

## 1. THE MODEL — schema additions

### 1a. New step fields in `steps.jsonl`

All existing step fields remain unchanged. Background steps add an optional `bg` object:

```jsonc
{
  "id": "bg-herb-run",
  "label": "Herb run",
  "detail": "Plant ranarr with ultracompost at all unlocked patches; harvest previous run.",
  "reqs": {
    "skills": { "farming": 32 },
    "unlocks": ["ultracompost", "patch-network-min2"]
  },
  "grants": { "farming_xp_per_run": "CONFIGURABLE" },
  "tags": ["background", "farming", "supply"],
  "location": { "region": "global", "zone": null },

  // NEW: background task descriptor
  "bg": {
    "cadence_min": 90,              // real-time minutes per cycle; null = event-driven only
    "scheduling_bias": "ahead-of-time", // "ahead-of-time" | "jit" | "either"
    "lifecycle_states": ["idle", "seeds_planted", "growing", "harvestable"],
    "initial_state": "idle",
    "transitions": [
      { "from": "idle",          "to": "seeds_planted", "trigger": "step:plant-herbs" },
      { "from": "seeds_planted", "to": "growing",       "trigger": "timer:cadence_min" },
      { "from": "growing",       "to": "harvestable",   "trigger": "timer:cadence_min" },
      { "from": "harvestable",   "to": "idle",          "trigger": "step:harvest-herbs" }
    ],
    "yields": {
      "grimy_ranarr":  { "per_patch": "CONFIGURABLE", "unit": "noted" },
      "grimy_irit":    { "per_patch": "CONFIGURABLE", "unit": "noted" },
      "bird_nests_bonus": false
    },
    "supply_threshold_jit": {      // switch to JIT when stock < threshold
      "prayer_potion_4": 50        // fire herb run when pot stock < 50 (configurable)
    },
    "setup_steps": ["plant-herbs"],
    "collect_steps": ["harvest-herbs"]
  }
}
```

Catalog of confirmed background tasks (each gets its own entry in `steps.jsonl`):

| id | cadence_min | bias | lifecycle anchor |
|----|-------------|------|-----------------|
| `bg-herb-run` | 90 | ahead-of-time | seeds_planted → harvestable |
| `bg-birdhouse-run` | 50 | either | houses_set → nests_full |
| `bg-kitten-mature` | ~120 | ahead-of-time | kitten → adult_cat (one-shot) |
| `bg-grubby-chest` | event-driven | jit | null (PvM loop, no timer) |
| `bg-courier-tasks` | 10–15 | either | task_ready → delivered |
| `bg-agility-marks` | null | either | yield-annotation (see §1b) |

CONFIGURABLE placeholders mark unknowns; do not fabricate rates.

### 1b. Agility marks — yield annotation (not a background task)

Marks of grace accumulate *during* any rooftop agility session, not on a cadence. Model them as a `side_yield` on existing agility training steps rather than a separate background task:

```jsonc
// addition to existing train-agility-* steps
"side_yields": [
  { "item": "mark_of_grace", "rate_per_hour": "CONFIGURABLE", "accumulates": true }
]
```

This is a zero-time embed (pattern 6), not a cadence loop.

### 1c. New tags for `tags[]` array

- `"background"` — step is a cadence loop, not a foreground progression step
- `"bg-setup"` — one of the `setup_steps` substeps (plant, place houses)
- `"bg-collect"` — one of the `collect_steps` substeps (harvest, collect nests)
- `"supply-producer"` — step produces items that feed a named supply chain

---

## 2. RULES / ALGORITHM

### Rule 0 — Background task eligibility check

Before inserting any background task into the timeline:
```
fn is_eligible(bg_step, state, completedIds):
    if not meetsReqs(bg_step.reqs, state): return false
    if bg_step.lifecycle_state != "idle" and
       bg_step.lifecycle_state != "harvestable": return false
    return true
```

### Rule 1 — Setup injection (ahead-of-time bias)

At plan generation time, after `routeMulti` emits the ordered foreground path:

```
fn inject_background_setups(path, bg_steps, state):
    for each bg_step with scheduling_bias in ["ahead-of-time", "either"]:
        if not is_eligible(bg_step, state): continue
        # Find the earliest foreground step that is a natural travel break
        # (quest handoff, banking, teleport, region transition)
        anchor = first_break_step(path, starting_at=0)
        insert BEFORE anchor:
            { ...bg_step, _bg_phase: "background", _bg_lifecycle: "setup" }
        mark bg_step.lifecycle_state = "seeds_planted" / "houses_set" (etc.)
        record bg_step.fire_at = wall_clock_estimate(anchor) + bg_step.cadence_min
```

`first_break_step` prefers steps with `tags` containing `"banking"`, `"teleport"`, or `"quest-handoff"`. Falls back to the step with highest `inv_removes` count (natural inventory dump).

### Rule 2 — Cadence interrupt injection

For every bg step with `cadence_min != null` that has been set up:

```
fn inject_cadence_interrupts(path, bg_steps, step_durations):
    for each active bg_step:
        t_due = bg_step.fire_at
        # Find the foreground step whose estimated start time is closest to t_due
        # within a ±10min window
        window = steps_in_window(path, t_due - 10, t_due + 10)
        best = first step in window that is a natural break (see Rule 1)
        if best found:
            insert BEFORE best:
                { type: "bg-collect", bg_ref: bg_step.id,
                  instruction: "Collect [herb patches / birdhouses] — timer ready.",
                  _bg_lifecycle: "collect" }
            insert AFTER best (if replanting):
                { type: "bg-setup", bg_ref: bg_step.id,
                  instruction: "Replant [patches / birdhouses] for next cycle.",
                  _bg_lifecycle: "setup" }
            bg_step.fire_at += bg_step.cadence_min
        else:
            # No break window — annotate nearest step with bg_overdue flag,
            # surface in plugin UI as a nudge not a blocker
            nearest.annotations.push({ bg_overdue: bg_step.id })
```

### Rule 3 — JIT supply-threshold override

Runs continuously alongside the cadence check:

```
fn check_supply_threshold(bg_step, current_stock):
    for (item, threshold) in bg_step.supply_threshold_jit:
        if current_stock[item] < threshold:
            # Escalate: insert collect + replant immediately at next break
            # regardless of cadence timer
            bg_step.jit_escalated = true
            inject at next break_step
```

In the plugin runtime (not planner time), `current_stock` is read from the bank via RuneLite's `ItemManager`. At planner time this defaults to 0 (assume depleted), which produces maximally conservative ahead-of-time scheduling.

### Rule 4 — Lifecycle guards (prevent invalid state transitions)

Before inserting any bg step substep:
```
fn lifecycle_guard(bg_step, substep_type):
    if substep_type == "bg-setup" and
       bg_step.lifecycle_state not in ["idle", "harvestable"]: SKIP
    if substep_type == "bg-collect" and
       bg_step.lifecycle_state not in ["harvestable", "nests_full"]: SKIP
```

This prevents double-planting or harvesting bare patches.

### Rule 5 — Slayer-seed feed loop (pattern 8 integration)

After any foreground slayer task completes:
```
fn slayer_seed_hook(slayer_step_result, bg_herb_run):
    seeds_dropped = slayer_step_result.known_drops.filter(tag="seed")
    if seeds_dropped and bg_herb_run.lifecycle_state == "idle":
        inject bg_herb_run setup step at next banking break
        # seeds going into bank → patches going in → virtuous cycle
```

This wires pattern 8 (slayer as spine) into pattern 4 (background cadence) at the planner level.

### Rule 6 — Kitten maturation (one-shot, not cyclic)

Kitten is a one-shot background task with a ~120-min timer and periodic feeding requirement:
```
bg-kitten-mature:
    cadence_min: null        # not cyclic
    one_shot: true
    feeding_cadence_min: 15  # feed raw fish every ~15min (CHECK-IN annotation, not blocker)
    lifecycle: kitten → adolescent → adult_cat
    prereq: quest "Ratcatchers" not yet done
    terminal_grant: { "adult_cat": true }
```

The feeding check-in inserts non-blocking annotations on foreground steps every ~15min rather than hard interrupts.

---

## 3. INTEGRATION

### 3a. `greedy.js` — minimal changes

`routeMulti` currently returns a flat ordered path. Add one post-processing pass:

```js
// After routeMulti returns `path`, call:
export function weaveBackground(path, bgSteps, profile, env) {
  // 1. Collect eligible background tasks given state at start
  const eligible = bgSteps.filter(b => bgEligible(b, profile.skills));
  // 2. Apply Rule 1: inject setup steps
  const withSetup = injectSetups(path, eligible, env);
  // 3. Apply Rule 2: inject cadence interrupts (uses estimated step durations)
  const withInterrupts = injectCadenceInterrupts(withSetup, eligible, env);
  return withInterrupts;
}
```

`bgSteps` is loaded from `steps.jsonl` where `tags.includes("background")`.

`injectSetups` and `injectCadenceInterrupts` do NOT alter step ordering for foreground steps — they only insert new `{_bg: true}` steps between existing entries.

`meetsReqs` already handles `reqs.skills`; extend it to handle `reqs.unlocks` (checked against `completedIds`).

**Key invariant**: background steps never block foreground step emission. If no break window is found, the cadence interrupt becomes a non-blocking annotation.

### 3b. `enrich.py` — enriching background steps

Add a new enrichment branch alongside `_train_step` and `_milestone_step`:

```python
def _bg_step(step, phase):
    bg = step.get("bg", {})
    return {
        "id": step["id"],
        "phase": phase,                     # "Background loops" (a floating phase)
        "instruction": step.get("label"),
        "detail": step.get("detail", ""),
        "highlights": [],
        "mapMarkers": [],
        "completionConditions": [{"type": "MANUAL"}],  # player confirms done
        # new fields (see §3c):
        "backgroundTask": True,
        "cadenceMinutes": bg.get("cadence_min"),
        "lifecycleState": bg.get("initial_state"),
    }
```

`phased_steps()` must be extended to recognize `_bg: True` steps and assign them to a dedicated `"Background loops"` phase rather than the active milestone phase. This phase renders in a separate panel lane, not inline with the milestone episode spine.

### 3c. `GuideStep.java` — new fields

```java
/**
 * True when this step is a cadence-driven background loop rather than a
 * foreground progression step. The plugin renders it in a secondary "loops"
 * panel, fires it on cadence, and re-arms it after completion.
 */
public boolean backgroundTask;

/**
 * Cadence in real-world minutes. Non-null only when backgroundTask is true.
 * Null means the task fires on event (JIT) rather than on a fixed timer.
 */
public Integer cadenceMinutes;

/**
 * Current lifecycle state key ("idle", "seeds_planted", "growing",
 * "harvestable", etc.). Persisted between sessions via RuneLite config.
 * Only meaningful when backgroundTask is true.
 */
public String lifecycleState;
```

The plugin's step-advance logic must check `backgroundTask` and, when true, NOT advance the main guide index. Instead it marks the bg step complete and schedules re-arm at `now + cadenceMinutes`.

### 3d. Seams the synthesizer must reconcile

| Seam | Background owns | Peer facet owns | Resolution needed |
|------|----------------|-----------------|-------------------|
| Inventory budget | bg setup/collect steps consume/free slots | active-combat (slayer) steps track `inv_used` / `inv_removes` | Background steps must declare `inv_used` (seeds, tools) so greedy's `invFree` tracking stays valid |
| Break-step identification | needs break anchor to inject near | active-loop / quest facets define step structure | Agree on a `"break"` tag or `location.is_break: true` field that background can query |
| Slayer seed yields | reads slayer task result for seeds | slayer/active-combat facet models slayer drops | Expose a `known_drops[]` array on slayer steps; background reads it |
| Foreground step duration estimates | needed for cadence window math | no facet owns real-time duration yet | Either add `est_minutes` to steps.jsonl (all facets benefit) or treat all cadence windows as ±10min fuzzy |
| Birdhouse wood-tier prereq | bg declares `reqs.skills.woodcutting: N` | active-training facet routes WC leveling | Standard skill req — no conflict, just make sure bg step prereqs are declared accurately so greedy honors them |
| Lifecycle state persistence | GuideStep.lifecycleState | plugin config system | A config key per bg step id, written on each transition, read on client login |

---

## 4. WORKED EXAMPLE — mid-game session (farming/birdhouse/slayer-feed loops)

**Player state**: Farming 32, WC 47 (teak birdhouses), Slayer 50 (assigned Moss Giants), Herblore 26, ultracompost available, patches: Falador + Kourend + Ardougne (3 active), birdhouses: Fossil Island.

**Generated timeline** (excerpt from `weaveBackground` output):

```
[phase: Background loops]  ─────────────────────────────────────────── T+0:00
  BG-SETUP: "Plant ranarr at Falador, Kourend, and Ardougne patches with
             ultracompost. (3 patches; carries 9 seeds + 3 buckets compost)"
  → lifecycle: idle → seeds_planted; fire_at = T+90min
  inv_used: 12 slots (seeds + compost + spade + trowel)

[phase: Toward Slayer 60]  ─────────────────────────────────────────── T+0:05
  STEP: "Travel to Canifis and speak to Mazchna for a Moss Giant task"
  STEP: "Kill Moss Giants (Varrock Sewers). ~27 per task."
    side_yields: ranarr seeds (avg CONFIGURABLE per task), big bones
    known_drops: ["ranarr_seed", "irit_seed", "big_bones", "coins"]

[annotation on STEP above]  ────────────────────────────────────────── T+0:50
  BG-COLLECT: "Birdhouse timer ready (50 min). Run to Fossil Island, collect
               nests, reset teak birdhouses. (Fairy Ring: A-K-Q → Fossil Island)"
  → lifecycle: houses_set → nests_full → houses_set; fire_at += 50min
  BG-SETUP: (replant houses inline)

[phase: Background loops — cadence interrupt] ──────────────────────── T+1:30
  BG-COLLECT: "Herb patches ready (90 min). Teleport Ardougne → Falador → Kourend.
               Harvest ranarr, clean, bank. Replant with ranarr + ultracompost."
  → lifecycle: harvestable → idle → seeds_planted; fire_at = T+3:00
  NOTE: slayer task may have dropped ranarr seeds — check seed pouch; use for replant.

  BG-COLLECT: "Second birdhouse cycle ready (T+1:40). Collect nests."

[phase: Toward Slayer 60]  ─────────────────────────────────────────── T+1:45
  STEP: "Complete second Moss Giant task or switch to Slayer master Nieve (Cb 85+)"

[phase: Background loops — supply threshold trigger] ───────────────── T+2:15
  (if prayer_potion_4 stock < 50):
  BG-ESCALATED: "Prayer pot stock low — run herb patches JIT even though cadence
                 not due. Harvest grimy ranarr, brew prayer pots (Herblore 38)."
  → Rule 3 override; fire_at reset to T+2:15 + 90min

[phase: Toward Slayer 60]  ─────────────────────────────────────────── T+2:20 …
  STEP: "Continue slayer. Seeds from drops refill the next herb cycle automatically."
```

**Supply loop trace (patterns 3, 8, 10)**:
- Pattern 3 (production perspective): Herb patches → grimy ranarr → prayer pots. Tracked via `bg-herb-run.yields` feeding into a `brew-prayer-pots` step that has `reqs: { items: [grimy_ranarr] }`.
- Pattern 8 (slayer as spine): Moss Giant task drops ranarr/irit seeds → known_drops hook triggers bg-herb-run setup at next banking break → closes the seed → patch → pot → slayer cycle.
- Pattern 10 (recurring maintenance): Prayer pots are depleted per session at an estimated rate (CONFIGURABLE). `supply_threshold_jit.prayer_potion_4 = 50` is the JIT escalation trigger; this rate should be calibrated per player, not hardcoded.

---

## 5. OPEN QUESTIONS for the fable synthesizer

**OQ-1 — Break-anchor coordination**: Multiple facets need to inject steps at "natural breaks" (banking, teleport, quest handoff). No shared definition of a break step exists yet. Synthesizer must define `tags: ["break"]` or `location.is_break: true` as a first-class concept so all facets can query the same signal without collision.

**OQ-2 — Estimated step durations**: Cadence window math (±10min around `fire_at`) requires foreground step duration estimates. None exist in `steps.jsonl`. Either add `est_minutes: N` as a new field (trivially useful to all facets, CONFIGURABLE for unknowns) or accept ±10min fuzzy matching as permanent. Recommend the field; background cannot schedule without it.

**OQ-3 — Inventory budget across bg ↔ active-combat**: Background setup steps consume real inventory slots (seeds, tools, compost). `greedy.js` tracks `invFree` per foreground step. If a bg setup step fires in the middle of a slayer task (28-slot inventory already near full), the inject will silently produce an invalid plan. The synthesizer must decide: (a) background steps pre-empt inventory budget and foreground must accommodate, or (b) background steps defer until `invFree >= bg.inv_used`. Recommend (b): add `bg_inv_req` to `meetsReqs` check for background injections.

**OQ-4 — Who owns birdhouse wood routing**: Background declares `reqs.skills.woodcutting: 47` for teak birdhouses, but routing WC to 47 is a foreground active-training concern. This is fine as a standard skill req — greedy handles it — but the active-training facet must not *defer* WC beyond the point where bg-birdhouse-run's prereqs are needed. Flag for cross-facet dependency ordering.

**OQ-5 — Kitten feeding cadence vs blocker policy**: The 15-min kitten feeding check-in is non-blocking (annotation), but if the player ignores it long enough, the kitten runs away (game mechanic). Should the plugin escalate the annotation to a hard interrupt after N missed cycles? Background facet proposes: annotation for first 3 cycles, soft warning at 4th, but does not own the escalation policy — that belongs to a "lifecycle urgency" concern the synthesizer should define globally.

**OQ-6 — Courier task cadence is speculative**: zeah-locked source flags courier task cadence as "~10-15 min" and notes the actual tick rate is unknown. Do not bake in a number. Background model stores this as `cadence_min: null, scheduling_bias: "either"` with a comment `// MEASURE IN LIVE GAMEPLAY` until real data is available. Synthesizer should flag this as a known gap.
