# Sequencer design — interleaving / ordering engine

Facet owner: sequencer. Covers patterns 1, 2, 4, 5, 6, 7, 9 from CONSOLIDATED.md.
Designed as a concrete extension to `assets/js/router/planner/greedy.js` and
`tools/guide-export/enrich.py`, with a minimal schema addition to `steps.jsonl`
and `GuideStep.java`.

---

## 1. THE MODEL — new fields and node types

### 1a. `slot` object on every step in steps.jsonl

Add an optional `slot` key. Absence means the step is a primary active task.

```jsonc
// Example: herb run
{
  "id": "bg-herb-run",
  "label": "Herb run (all patches)",
  "slot": {
    "type": "background",     // "background" | "passive" | "alternation" | null
    "cadence_min": 90,        // real-world minutes between executions; null = one-shot
    "cost_min": 5,            // real-world minutes of active attention per execution
    "embeds_into": null       // only used for type:"passive"
  },
  ...
}

// Example: High Level Alchemy during smithing
{
  "id": "embed-alch-during-smithing",
  "label": "High Alch during Smithing",
  "slot": {
    "type": "passive",
    "cadence_min": null,
    "cost_min": 0,
    "embeds_into": ["smithing", "melee"]  // tag names of host steps
  },
  "reqs": { "skills": { "magic": 55 } },
  "grants": {},   // grants no level — XP only; zero synthetic completion signal
  "xp": { "magic": 0 },  // rate unknown — placeholder per hard constraint
  ...
}
```

**Slot type semantics:**

| type | greedy handles? | injectSlots handles? | render |
|---|---|---|---|
| `null` | yes — primary task | no | normal step card |
| `"background"` | no — excluded from main path | yes — cadence insertion | non-blocking reminder chip |
| `"passive"` | no — excluded from main path | yes — overlay annotation | inline badge on host step |
| `"alternation"` | yes — normal candidate | yes — inserts marker after qualifying run | alternation break card |

**Rationale:** Keeping `background` and `passive` steps out of the greedy heap avoids them consuming heap slots that should go to goal-critical steps. The greedy heap is for primary task ordering; overlays are injected post-hoc.

### 1b. `deferred_until` on steps.jsonl

```jsonc
{
  "id": "train-attack-60",
  "deferred_until": ["quest-dragon-slayer", "tag:bossing"],
  ...
}
```

If `deferred_until` is non-empty, the step is excluded from the greedy heap until at
least one of the named goal IDs appears in the active goal list OR a step with a
matching tag has been emitted. This makes breakpoint-then-defer explicit.

If omitted or empty: step is always eligible once reqs are met (current behavior).

### 1c. `hub` on quest steps

```jsonc
{
  "id": "quest-romeo-juliet",
  "hub": "varrock",
  ...
}
```

Signals to the episode builder that this quest belongs to a geographic cluster.
Value matches region names already in `location.region`.

### 1d. GuideStep.java additions

```java
/**
 * Slot type for this step: "background", "passive", "alternation", or null.
 * Controls how the guide-chain plugin renders the step in the overlay panel.
 * - "background": non-blocking reminder chip; auto-dismisses after cadenceMinutes.
 * - "passive": inline badge on the host step; no separate card.
 * - "alternation": break-card suggesting the player swap tasks; manual-advance.
 * - null / absent: normal active step card.
 */
public String slotType;

/**
 * For slotType=="background": how many real-world minutes before the next
 * check-in reminder fires. Null if the background loop is one-shot.
 */
public Integer cadenceMinutes;

/**
 * For slotType=="passive": the phase label of the host step this passive
 * overlay attaches to. The plugin renders it as a badge on that step's card
 * rather than its own card.
 */
public String embedsIntoPhase;
```

---

## 2. THE RULES / ALGORITHM

### 2a. greedy.js extension: `injectSlots`

The greedy's `routeMulti` loop is unchanged. After assembling the full flat path from
all goals, pass it through a new `injectSlots` function before returning.

```js
// Pseudocode — pure, no DOM, receives same `env` as routeMulti

export function injectSlots(path, allSteps, env) {
  const bgSteps  = allSteps.filter(s => s.slot?.type === "background");
  const pasSteps = allSteps.filter(s => s.slot?.type === "passive");

  const bgActive = new Map();   // step_id -> { step, nextFireIndex }
  const pasActive = new Set();  // step_id for passive overlays in progress

  let state = toState(env.initialSkills ?? {});
  const result = [];

  for (let i = 0; i < path.length; i++) {
    const primary = path[i];

    // ── 1. Unlock new background loops ─────────────────────────────────────
    for (const bg of bgSteps) {
      if (bgActive.has(bg.id)) continue;
      if (!meetsReqs(env, bg, state, {})) continue;
      bgActive.set(bg.id, { step: bg, nextFireIndex: i });
    }

    // ── 2. Fire background reminders that are due ──────────────────────────
    for (const [id, entry] of bgActive) {
      if (i >= entry.nextFireIndex) {
        result.push(makeBgReminder(entry.step, i));  // see below
        const stepsPerCadence = Math.round(
          (entry.step.slot.cadence_min ?? 90) / AVG_STEP_MIN
        );
        entry.nextFireIndex = i + stepsPerCadence;
      }
    }

    // ── 3. Unlock new passive overlays ────────────────────────────────────
    for (const pas of pasSteps) {
      if (pasActive.has(pas.id)) continue;
      if (!meetsReqs(env, pas, state, {})) continue;
      pasActive.add(pas.id);
    }

    // ── 4. Annotate the primary step with active passive overlays ─────────
    const activePassives = [...pasActive].map(id =>
      pasSteps.find(s => s.id === id)
    ).filter(s =>
      (s.slot.embeds_into ?? []).some(tag =>
        (primary.tags ?? []).includes(tag)
      )
    );

    const annotated = activePassives.length
      ? { ...primary, _passiveOverlays: activePassives.map(s => s.id) }
      : primary;

    // ── 5. Mark alternation break opportunity ────────────────────────────
    //    Insert after any run of ≥2 consecutive "active" steps in the same
    //    region, if the next queued step is also same-region active.
    if (shouldInsertAlternationBreak(result, primary, path[i+1])) {
      result.push(makeAlternationMarker(primary, env.now()));
    }

    result.push(annotated);
    state = env.graph.coalesce(
      env.graph.edgesFrom("step:grant", primary.id), state
    );
  }

  return result;
}

// AVG_STEP_MIN: configurable placeholder (unknown without real timing data).
const AVG_STEP_MIN = 30; // placeholder — replace with measured median

function makeBgReminder(bgStep, atIndex) {
  return {
    id:           `bg-reminder-${bgStep.id}-${atIndex}`,
    label:        bgStep.label,
    _bgReminder:  true,
    _bgStepId:    bgStep.id,
    slot:         bgStep.slot,
    tags:         ["background"],
    reqs:         bgStep.reqs ?? {},
    grants:       {},
    location:     bgStep.location ?? null,
  };
}

function makeAlternationMarker(afterStep, now) {
  return {
    id:              `alt-break-${now()}`,
    label:           "Alternation break",
    detail:          "Consider swapping to a background or AFK task before continuing.",
    _alternation:    true,
    tags:            ["alternation"],
    reqs:            {},
    grants:          {},
  };
}

function shouldInsertAlternationBreak(emitted, current, next) {
  // Insert if: the last 3+ emitted steps are all active+same-region and the
  // next step is also active. This surfaces the "read-ahead alternation slot"
  // pattern from mootrius-im without hard-coding a timer.
  const active  = s => !s._bgReminder && !s._alternation && !s.slot?.type;
  const region  = s => s.location?.region ?? "global";
  const recent  = emitted.slice(-3).filter(active);
  if (recent.length < 3) return false;
  if (!active(current) || !active(next ?? {})) return false;
  const r = region(current);
  return recent.every(s => region(s) === r) && region(next ?? {}) === r;
}
```

### 2b. greedy.js extension: `deferred_until` filtering

In `buildHeap` inside `routeGoal`, extend the existing `isUseful` guard:

```js
// Add inside the for-loop of buildHeap, after the existing isUseful check:
if (!isDeferrable(step, env.activeGoalIds ?? new Set())) continue;
```

```js
export function isDeferrable(step, activeGoalIds) {
  const du = step.deferred_until ?? [];
  if (!du.length) return true;   // no constraint — always eligible
  // Allow if any named goal is active
  for (const ref of du) {
    if (ref.startsWith("tag:")) {
      // tag-triggered defer: always allow once the tag is in completedTags
      // (checked separately by caller — caller must pass completedTags)
      continue;
    }
    if (activeGoalIds.has(ref)) return true;
  }
  return false;  // none matched — hold back
}
```

`env.activeGoalIds` = the set of `goal.id` values in the current `goals` array passed to `routeMulti`.

### 2c. greedy.js extension: `routeMulti` wiring

```js
export function routeMulti(goals, steps, profile, env) {
  env = {
    pinnedExclusions: new Set(),
    manualQuestDone:  new Set(),
    constraints:      [],
    now:              Date.now,
    initialSkills:    profile.skills,
    activeGoalIds:    new Set(goals.map(g => g.id)),
    ...env,
  };

  // --- existing per-goal loop unchanged ---
  // (skills, completedIds, completedQuests, freeSlots carried forward)
  const rawPath = goals.flatMap((goal) => { /* ...existing logic... */ });

  // ── NEW: inject background/passive/alternation overlays ──────────────────
  // Separate background/passive steps from the planning bank so greedy never
  // sees them; the greedy bank is passed through as-is.
  const activeSteps = steps.filter(s => !s.slot?.type
    || s.slot.type === "alternation");  // alternation stays in greedy
  const overlaySteps = steps.filter(s =>
    s.slot?.type === "background" || s.slot?.type === "passive");

  return injectSlots(rawPath, overlaySteps, env);
}
```

Note: the existing `steps` argument to `routeGoal` must be filtered to
`activeSteps` so background/passive steps never enter the heap.

### 2d. enrich.py extension: quest hub batching

Extend `phased_steps` with a pre-pass that groups hub quests before milestone
segmentation:

```python
def hub_batches(steps):
    """Return steps with quest hub steps sorted into contiguous hub groups.
    Non-hub steps retain their original order.
    Only reorders; does not remove or duplicate steps."""
    from collections import defaultdict
    hub_map = defaultdict(list)
    others  = []
    for s in steps:
        h = s.get("hub")
        if h and (s.get("tags") or []).count("quest"):
            hub_map[h].append(s)
        else:
            others.append(s)

    # Merge: insert hub group at the position of its earliest member
    positions = {s["id"]: i for i, s in enumerate(steps)}
    merged = list(steps)  # copy
    for hub, qs in hub_map.items():
        if len(qs) < 2:
            continue  # single quest in hub — not worth batching
        first_pos = min(positions[q["id"]] for q in qs)
        # remove hub quests from wherever they are, re-insert block at first_pos
        merged = [s for s in merged if s["id"] not in {q["id"] for q in qs}]
        merged[first_pos:first_pos] = sorted(qs, key=lambda q: positions[q["id"]])
    return merged


def phased_steps(ordered, milestones):
    # NEW: pre-pass — cluster hub quests
    ordered = hub_batches(ordered)
    # ... rest of existing phased_steps unchanged ...
```

Extend `_train_step` to emit `slotType` and `cadenceMinutes`:

```python
def _train_step(step, phase, zones):
    cat   = zones.get((step.get("location") or {}).get("zone"))
    conds = [skill_cond(k, v) for k, v in (step.get("grants") or {}).items() if k in SKILL_ENUM]
    slot  = step.get("slot") or {}

    # Background steps auto-advance via RECURRING condition type
    if slot.get("type") == "background" and slot.get("cadence_min"):
        conds = [{"type": "RECURRING", "cadenceMinutes": slot["cadence_min"]}]

    base = {
        "id":                   step["id"],
        "phase":                phase,
        "instruction":          task_instruction(step),
        "detail":               step.get("detail", ""),
        "highlights":           [{"type": "NPC", "id": cat["npc"]}] if cat and cat.get("npc") else [],
        "mapMarkers":           [{"x": cat["x"], "y": cat["y"], "plane": cat.get("plane", 0),
                                  "label": cat.get("label")}] if cat else [],
        "completionConditions": conds or [{"type": "MANUAL"}],
    }
    if slot.get("type"):
        base["slotType"]        = slot["type"]
    if slot.get("cadence_min"):
        base["cadenceMinutes"]  = slot["cadence_min"]
    if step.get("_passiveOverlays"):
        base["passiveOverlays"] = step["_passiveOverlays"]
    return base
```

Add alternation-marker step handling in `phased_steps` output loop:

```python
# In the final assembly loop of enrich():
for e in enriched_path:
    if e.get("_alternation"):
        steps_out.append({
            "id":                   e["id"],
            "phase":                current_phase,
            "instruction":         "Take a break — swap to a background task.",
            "detail":              "Alternation slot: switch to herb run, birdhouses, or AFK skill now.",
            "slotType":            "alternation",
            "highlights":          [],
            "mapMarkers":          [],
            "completionConditions": [{"type": "MANUAL"}],
        })
    elif e.get("_bgReminder"):
        steps_out.append(_background_reminder(e, current_phase))
    else:
        steps_out.append(_train_step(e, current_phase, zones))
```

---

## 3. INTEGRATION — seams and reconciliation

### greedy.js seams

| seam | what this facet writes | what the synthesizer must reconcile |
|---|---|---|
| `env.activeGoalIds` | Set of goal IDs for `deferred_until` filtering | supply-chain facet may add goals dynamically; synthesizer must keep set live |
| `env.initialSkills` | passed through from `profile.skills` | no conflict |
| step `slot` field | filters steps into active vs overlay banks | supply-chain facet needs to know overlay steps aren't in main heap — don't re-add them |
| `injectSlots` return shape | path with `_bgReminder`, `_alternation`, `_passiveOverlays` annotations | render facet must handle these synthetic step shapes |
| `AVG_STEP_MIN` constant | placeholder `30` | should be replaced with a real median from timed runs — mark `// PLACEHOLDER` |

### enrich.py seams

| seam | what this facet writes | reconciliation |
|---|---|---|
| `hub_batches` pre-pass | reorders quest steps in `ordered` | phase names from `phased_steps` will reflect hub clusters; render facet gets a "Hub: Varrock" phase header automatically because hub region → `_region_phase` |
| `slotType` on output steps | "background" / "passive" / "alternation" / absent | GuideStep.java must deserialize this field; render facet owns how it displays |
| `cadenceMinutes` on output steps | integer minutes or absent | GuideStep.java needs the field; render facet uses it for timer chips |
| `passiveOverlays` on output steps | list of step IDs | render facet resolves to label strings; synthesizer must ensure referenced passive step IDs survive into guide JSON |
| new `RECURRING` completionCondition type | `{"type": "RECURRING", "cadenceMinutes": N}` | GuideStep plugin must handle this condition type; currently only SKILL / MANUAL known |

### GuideStep.java seams

Minimum new fields: `slotType` (String), `cadenceMinutes` (Integer), `embedsIntoPhase` (String).
`passiveOverlays` (List<String>) is optional — the render facet can look up label by ID.

The `RECURRING` completion condition requires a new `ConditionType` enum value in
the plugin. The render facet must implement the timer logic — this sequencer facet
only specifies the data contract.

---

## 4. WORKED EXAMPLE — first ~2 hours, fresh account

Goals queued: `{cook-assistant, sheep-shearer, romeo-juliet, quest-rune-mysteries}`,
skills all 1, no completedIds, Lumbridge/Misthalin accessible.

Background steps available (slot.type=="background"):
- `bg-farm-allotment` (Farming 1→5 cadence 10min, unlocks at reqs:{})
- `bg-herb-run` (cadence 90min, unlocks at reqs:{farming:17})
- `bg-birdhouse-run` (cadence 50min, unlocks at reqs:{crafting:5, hunter:9})

Passive overlays available (slot.type=="passive"):
- `embed-bury-bones` (embeds_into:["melee","combat"], reqs:{})
- `embed-alch-smithing` (embeds_into:["smithing"], reqs:{magic:55})

**Step-by-step trace:**

```
i=0  greedy emits: train-attack-10  (lumbridge-farm chickens)
     injectSlots: unlock bg-farm-allotment (reqs met), nextFireIndex=0
                  fire bg-farm-allotment reminder → insert chip: "Plant potato allotment"
                  unlock embed-bury-bones (reqs met)
                  annotate: _passiveOverlays:["embed-bury-bones"]
     result: [bg-reminder:farm-allotment, train-attack-10+overlay:bury-bones]

i=1  greedy emits: train-strength-10  (lumbridge-farm)
     injectSlots: bg-farm-allotment nextFireIndex = 0 + round(10/30)=0 → already past,
                  but nextFireIndex now = 1 + 0 = 1, so fires again at i=1?
                  → adjust: nextFireIndex = i + max(1, round(cadence/AVG_STEP_MIN))
                     round(10/30)=0 → use 1 → nextFireIndex = 1
                  fire at i=1: bg-reminder chip "Check potato allotment (harvest/replant)"
                  annotate train-strength-10 with bury-bones overlay
     result: [..., bg-reminder:farm-check, train-strength-10+overlay]

i=2  greedy emits: quest-cook-assistant
     hub="lumbridge" — no hub clustering needed (only 1 lumbridge quest in set)
     no bg due yet (farm nextFireIndex=2; yes — fire)
     insert bg-reminder: "Harvest potato allotment, replant onions"
     result: [..., bg-reminder, quest-cook-assistant]
     → phase = "Toward Cook's Assistant"

i=3  greedy emits: quest-sheep-shearer  (lumbridge/misthalin)
     shouldInsertAlternationBreak: last 3 emitted = [train-attack-10, train-strength-10, quest-cook-assistant]
       all region=misthalin; current=misthalin; next=quest-romeo-juliet region=misthalin
       → 3 consecutive same-region active steps → insert alternation marker
     result: [..., alt-break, quest-sheep-shearer]
     → phase = "Lumbridge Hub"

i=4  greedy emits: quest-romeo-juliet  (region=varrock)
     hub="varrock" — hub_batches would cluster this with any other varrock quests
     In this set: only romeo-juliet is varrock → no batch needed
     → phase = "Varrock visit"

i=5  greedy emits: quest-rune-mysteries  (region=varrock, hub=varrock)
     hub="varrock" — same hub as romeo-juliet; hub_batches placed them contiguously
     bg-farm nextFireIndex fires → reminder chip
     result: [..., bg-reminder, quest-rune-mysteries]
     → phase = "Varrock visit" (same hub, same phase)

State after i=5:
  completedIds: {quest-cook-assistant, quest-sheep-shearer, quest-romeo-juliet, quest-rune-mysteries}
  bg active: farm-allotment (cadence 10min)
  passive active: embed-bury-bones (all combat)
  Farming 1→17 still not granted (train-farming-17 not yet emitted) → herb run still locked
```

**Episode map output (what enrich.py produces):**

```
Phase: "Toward Cook's Assistant"
  [background] Plant potato allotment                ← bg-reminder chip
  [active+passive] Train Attack 1→10                 ← bury-bones badge
  [active+passive] Train Strength 1→10               ← bury-bones badge
  [background] Check potato allotment (replant)      ← bg-reminder chip
  [active] Cook's Assistant                          ← normal quest card
  [capstone] ★ Cook's Assistant complete

Phase: "Lumbridge Hub"
  [alternation] Alternation break — swap to farm run or AFK task
  [active] Sheep Shearer

Phase: "Varrock visit"
  [active] Romeo and Juliet
  [background] Check potato allotment                ← bg-reminder
  [active] Rune Mysteries

Phase: "Combat training — Misthalin" (next goal: Dragon Slayer I prep)
  [active+passive] Train Attack 10→30, Strength 10→30
    deferred_until: [] — eligible (no deferred_until set on these steps)
  [active+passive] Train Defence 10→30
  ...breakpoint at 40/40/40 (deferred_until for 40→60 = ["quest-dragon-slayer"])
  [background] Farm allotment reminders continue throughout
```

**Key ordering effects demonstrated:**
- Chickens at lumbridge-farm gather eggs for Cook's Assistant — quest items gathered
  *during* combat training (pattern 9: quest materials during unrelated activities).
- Bone burying during combat = zero-time Prayer XP (pattern 6).
- Farm allotment cadence fires during every 2–3 steps (pattern 4: background on cadence).
- Attack/Strength 40→60 deferred until Dragon Slayer I is in active goals (pattern 7).
- Varrock quests cluster via hub_batches (pattern 9).
- Alternation marker after 3 consecutive misthalin active steps (pattern 5).

---

## 5. OPEN QUESTIONS for the fable synthesizer

**OQ-1 (AVG_STEP_MIN placeholder):** The background cadence injection uses
`AVG_STEP_MIN = 30` to convert real-world minutes to step-index intervals.
This number drives when reminder chips appear. It needs empirical calibration or
a per-step `est_min` field. Until then, all background timing is approximate.
The synthesizer must decide where this constant lives (profile? step field?).

**OQ-2 (RECURRING condition type):** The `RECURRING` completionCondition type is
new. The render facet must add it to `ConditionType.java` and wire a timer in the
plugin. The sequencer only defines the data contract. Synthesizer must assign this
to the render facet — don't let it fall between chairs.

**OQ-3 (background step bank location):** Background steps (herb runs, birdhouses)
don't currently exist in `steps.jsonl` — the bank only has training steps and
quest steps. These need to be authored. The supply-chain facet may own the
slot.embeds_into passive steps; the sequencer facet owns the slot.type="background"
steps. The synthesizer must assign authoring responsibility and prevent duplication.

**OQ-4 (deferred_until + supply-chain interaction):** A step like `train-attack-60`
deferred until `quest-dragon-slayer` must not be held back if the supply-chain
facet determines the player needs combat levels earlier for food self-sufficiency.
The synthesizer must define priority: deferred_until vs supply-chain demand signals.

**OQ-5 (hub_batches and topo_order interaction):** `hub_batches` reorders within
`ordered` (already topo-sorted). If two hub quests have a dependency between them,
hub reordering could violate topological order. The synthesizer should either:
(a) run hub_batches before topo_order, not after, or (b) add a dep-check guard
inside hub_batches. Currently unresolved.

**OQ-6 (passive overlay visibility):** Zero-time passive embeds annotate the host
step with `_passiveOverlays`. If the host step is a *background reminder chip* (not
a normal active step), the overlay has no host. The synthesizer must define fallback
rendering for passive overlays whose host is a background chip.

**OQ-7 (episode naming collision):** `phased_steps` names phases "Toward X" for
milestones and `_region_phase` names them "Region: X" for corpus mode.
`hub_batches` implicitly creates "Region: Varrock" phases. There is no phase-naming
contract between this facet and the supply-chain facet, which may also emit phases.
The synthesizer must define a canonical phase-naming registry.
