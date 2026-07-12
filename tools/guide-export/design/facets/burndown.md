# Burndown facet design — Requisite→Gather resolution & coarse unwinding

Facet owner: burndown. Covers: the requisite DAG schema, item/supply-chain resolution
(recursive, never GE), coarse-bullet unwind procedure, timing placement, and integration
seams with greedy.js / enrich.py / GuideStep. Leaves: final step ORDERING to the
interleaving facet; visual/annotation rendering detail to the rendering facet; long-term
scheduling cadence to the scheduling facet.

---

## 1. MODEL

### 1.1 Requisite node kinds (from requisites.jsonl taxonomy, unchanged)

```
kind ∈ { level | item | gear | quest | access | unlock | activity | coarse }
timing ∈ { ahead-of-time | just-in-time | either }
```

The burndown adds one new kind that does NOT appear in requisites.jsonl:

```
kind = "produce"   — a crafting/cooking/brewing step that transforms consumed items
                     into output items. Leaf kind only for gather; produce can recurse.
```

And one new kind used internally during resolution:

```
kind = "gather"    — an in-world gather action (fish spot, mine node, farm patch, kill)
                     that produces items with no item inputs.
                     Existing steps.jsonl entries ARE these; we add metadata.
```

### 1.2 Step schema extensions (steps.jsonl)

Minimal additive fields. Every existing step can keep `null` for all new fields.

```jsonc
{
  // --- existing fields unchanged ---
  "id": "string",
  "label": "string",
  "detail": "string",
  "reqs": { "skills": {}, "tags": [] },
  "grants": { "skill_or_tag": value },
  "xp": {},
  "inv_used": 0,
  "inv_removes": [],
  "tags": [],
  "location": {},

  // --- burndown additions ---

  // One of: "train" | "quest" | "unlock" | "gather" | "produce" | "access" | "coarse"
  // "train" = existing skill-level steps. null means "train" (backward compat).
  "kind": "gather",

  // Items this step yields per single execution. Quantity is a real number
  // or the string "??" when rate is unknown (marks a placeholder).
  // Example: { "ranarr_weed": 6.5, "herb_seed_generic": 0.3 }
  // For gather steps: expected yield per trip or per action.
  // For produce steps: output per craft cycle.
  "produces": { "item_id": number_or_placeholder },

  // Items consumed per single execution.
  // For gather: consumables used (e.g., bait, arrows spent).
  // For produce: recipe inputs.
  // Example: { "ranarr_seed": 1, "ultracompost": 1 }
  "consumes": { "item_id": number_or_placeholder },

  // Scheduling hint carried from requisites.jsonl timing field.
  // Burndown uses this to decide phase placement.
  // null = infer from context.
  "timing": "ahead-of-time",

  // true = this step is a REPEATING background loop, not one-time.
  // Scheduler must track lifecycle (when supply is depleted, re-trigger).
  // Example: farm-run, birdhouse-reset, herb-harvest.
  "loop": false,

  // For coarse kind only: ordered list of step IDs this coarse node expands to.
  // The expansion is the granular plan; the coarse node is a placeholder until
  // the expansion is authored.
  "coarse_unwind": ["step_id_1", "step_id_2"],

  // Optional: which named supply chain this step participates in.
  // Purely informational for phase annotation.
  "supply_chain": "prayer-pot-supply"
}
```

### 1.3 Supply-chain manifest (new file: supply_chains.jsonl)

Each line is a named supply chain — a bundle of step IDs that collectively produce a
consumable. Used by enrich.py to annotate phases and by the interleaving facet to batch
background loops together.

```jsonc
{
  "id": "prayer-pot-supply",
  "label": "Prayer potion supply chain",
  "output_item": "prayer_potion_4",
  "output_per_cycle": "??",       // unknown until real rate measured; placeholder
  "steps": [
    "farm-ranarr-patch",          // gather: plant/harvest ranarr herb
    "gather-snape-grass",         // gather: pick snape grass
    "brew-prayer-potion",         // produce: Herblore 52, ranarr + snape grass → potion
    "setup-ultracompost",         // produce: 30 pineapples + volcanic ash → ultracompost
    "gather-volcanic-ash",        // gather: mine ash at Fossil Island
    "source-pineapples-charter"   // gather: obtain pineapples from Catherby charter
  ],
  "loop": true,
  "timing": "ahead-of-time",
  "prereq_quests": ["quest-bone-voyage", "quest-fairytale-1"],
  "prereq_skills": { "farming": 32, "herblore": 52 }
}
```

### 1.4 Coarse expansion registry (new file: coarse_expansions.jsonl)

Maps each coarse node name to its expanded step list. This is the AUTHORITATIVE
granularity target — every `coarse` node in requisites.jsonl must eventually have an
entry here. Entries with `status: "stub"` are known gaps.

```jsonc
{
  "coarse_id": "rfd-subquests",
  "name": "RFD subquest completion (6 quests)",
  "status": "authored",       // "stub" | "authored" | "partial"
  "steps": [
    "rfd-intro",
    "rfd-goblins",
    "rfd-mountain-dwarf",
    "rfd-pirate-pete",
    "rfd-evil-dave",
    "rfd-skrach",
    "rfd-sir-amik",
    "rfd-awowogei",
    "rfd-finale"
  ]
}
```

### 1.5 Item catalogue (new file: items.jsonl)

Items are NOT steps. They are the commodity edges between gather/produce steps. This
catalogue is the shared vocabulary for `produces` / `consumes` fields.

```jsonc
{
  "id": "ranarr_weed",
  "label": "Ranarr weed (cleaned)",
  "stack": true,
  "primary_source": "farm-ranarr-patch",
  "secondary_sources": ["slayer-drop-ranarr"],
  "notes": "Main farming herb for prayer potions."
}
```

---

## 2. ALGORITHM

### 2.1 Core: resolveRequisite(req, context) → step[]

The output is an ORDERED list of steps. Order is dependency-first (all prerequisites
before the step that needs them). Duplicates are collapsed by ID (first occurrence wins).

```python
VISITED = set()          # global per-resolution call to detect cycles
EMITTED = set()          # de-duplicate across the full resolved step list

def resolveRequisite(req, context):
    """
    req: a ReqNode {kind, name/id, quantity, timing, ...}
    context: {
        available_skills: {skill: level},
        completed_quests: set[quest_id],
        timing_mode: "ahead-of-time" | "jit" | "either",
    }
    returns: flat ordered list of step objects (dep-first)
    """
    if req.kind == "level":
        return resolveLevel(req, context)

    if req.kind in ("item", "gear"):
        return resolveItem(req.item_id, req.quantity or 1, context)

    if req.kind == "quest":
        return resolveQuest(req.quest_id, context)

    if req.kind in ("access", "unlock"):
        return resolveAccess(req.unlock_id, context)

    if req.kind == "activity":
        # Activity nodes describe ongoing work (e.g., "slayer training").
        # They are already steps; just emit if not already emitted.
        step = STEPS_BANK.get(req.step_id)
        return [step] if step and step.id not in EMITTED else []

    if req.kind == "coarse":
        return unwindCoarse(req.name, context)

    return []  # unknown kind — synthesizer must reconcile


def resolveItem(item_id, qty, context):
    """
    Find gather or produce steps that self-source item_id.
    Recurse on their consumes dependencies.
    """
    if item_id in VISITED:
        # Cycle detected (e.g., compost needs herb run, herb run needs compost).
        # Break by returning a PLACEHOLDER gather step and logging a gotcha.
        return [synthPlaceholder(item_id, "cycle-break")]

    VISITED.add(item_id)

    # Find candidate source steps
    sources = [s for s in STEPS_BANK.values()
               if item_id in (s.produces or {})]

    if not sources:
        # No step produces this item — emit synthetic gather with unknown rate
        step = synthGather(item_id, qty)
        VISITED.discard(item_id)
        return [step]

    # Source selection heuristics (in priority order):
    #   1. Prefer steps already in EMITTED (reuse existing gather)
    #   2. Prefer background/loop steps when timing == "ahead-of-time"
    #   3. Prefer steps whose prereq_skills are already met
    #   4. Prefer steps closer to the beginning of the required phase
    best = pickSource(sources, context)

    # Calculate how many executions of `best` are needed to yield `qty`
    rate = best.produces.get(item_id, "??")
    executions = ceilDiv(qty, rate) if rate != "??" else "??"

    # Recurse on the source step's own item inputs
    prereqs = []
    for (consumed_item, amt) in (best.consumes or {}).items():
        needed = (amt * executions) if executions != "??" else "??"
        child_req = ReqNode(kind="item", item_id=consumed_item, quantity=needed,
                            timing=best.timing)
        prereqs.extend(resolveRequisite(child_req, context))

    # Recurse on skill prerequisites of the source step
    for (skill, level) in (best.reqs.skills or {}).items():
        if context.available_skills.get(skill, 1) < level:
            prereqs.extend(resolveLevel(ReqNode(kind="level", skill=skill, level=level), context))

    # Recurse on quest gates
    if best.location and best.location.quest_gate:
        if best.location.quest_gate not in context.completed_quests:
            prereqs.extend(resolveQuest(best.location.quest_gate, context))

    VISITED.discard(item_id)

    out = prereqs
    if best.id not in EMITTED:
        out.append(best)
        EMITTED.add(best.id)
    return dedupe(out)


def resolveLevel(req, context):
    """
    Levels already handled by greedy.js. Return the relevant training steps
    from STEPS_BANK, filtered by meetsReqs against current context skills.
    This is primarily a passthrough — greedy.js owns skill training.
    """
    skill, needed = req.skill, req.level
    current = context.available_skills.get(skill, 1)
    if current >= needed:
        return []
    # Find training steps that advance this skill
    candidates = [s for s in STEPS_BANK.values()
                  if skill in (s.grants or {}) and s.grants[skill] <= needed]
    return sorted(candidates, key=lambda s: s.reqs.skills.get(skill, 1))


def resolveQuest(quest_id, context):
    """
    Quests have item requisites + skill prereqs + sub-quests.
    Look up the quest step; recurse on its own reqs block.
    """
    step = STEPS_BANK.get(quest_id)
    if not step:
        return [synthQuest(quest_id)]
    if step.id in EMITTED:
        return []

    prereqs = []
    # Recurse on skill requirements
    for (skill, level) in (step.reqs.skills or {}).items():
        if context.available_skills.get(skill, 1) < level:
            prereqs.extend(resolveLevel(ReqNode(kind="level", skill=skill, level=level), context))
    # Recurse on item requirements
    for (item_id, qty) in (step.reqs.items or {}).items():
        prereqs.extend(resolveItem(item_id, qty, context))
    # Recurse on quest prerequisites
    for (prereq_quest_id) in (step.reqs.quests or []):
        if prereq_quest_id not in context.completed_quests:
            prereqs.extend(resolveQuest(prereq_quest_id, context))

    prereqs.append(step)
    EMITTED.add(step.id)
    return dedupe(prereqs)


def unwindCoarse(name, context):
    """
    Look up the coarse expansion registry.
    If expansion is stubbed, emit a placeholder coarse step.
    If authored, resolve each sub-step recursively.
    """
    expansion = COARSE_EXPANSIONS.get(name)
    if not expansion or expansion.status == "stub":
        return [synthCoarse(name)]

    out = []
    for step_id in expansion.steps:
        step = STEPS_BANK.get(step_id)
        if step:
            out.extend(resolveRequisite(reqFromStep(step), context))
        else:
            out.append(synthCoarse(step_id))
    return dedupe(out)
```

### 2.2 Cycle handling

Cycles occur when A produces B, and B is needed to produce A (e.g., ultracompost needs
pineapples; pineapple sourcing needs a travel unlock that needs prayer potions that need
ultracompost). Resolution:

1. On cycle detection, emit the innermost dependency as a `synthPlaceholder` with
   `_cycle_break: true`.
2. Log to gotchas.log: `[burndown] cycle detected: {item_a} → ... → {item_a}`.
3. The synthesizer must manually break the cycle by ordering one side "bootstrap" (a
   one-time ahead-of-time acquisition using an alternate non-cyclic source).

### 2.3 Timing placement

After the flat step list is resolved, enrich.py applies timing placement:

```
for each step in resolved_steps:
    if step.timing == "ahead-of-time":
        insert before the EARLIEST consuming step's phase
    elif step.timing == "just-in-time":
        insert at the same phase as the consuming step
    elif step.timing == "either":
        default to "ahead-of-time" unless the consuming step is low-phase
    if step.loop == true:
        mark for lifecycle tracking (re-schedule when supply depletes)
```

### 2.4 Supply quantity projection

We avoid fabricating rates. Where `produces` is `"??"`, quantity is `"??"` and the
guide emits: *"Gather [N or a stockpile of] X — exact rate unknown, adjust as you go."*

Where rates ARE known (from requisites.jsonl `obtain` field annotations), encode them
directly in the step `produces` field. The synthesizer documents these as configurable
placeholders (`RATE_RANARR_PER_RUN = 6.5` in a config block) so players can tune them.

---

## 3. INTEGRATION

### 3.1 steps.jsonl additions

Add `kind`, `produces`, `consumes`, `timing`, `loop`, `supply_chain`, `coarse_unwind`
to each step that the burndown facet authors. Existing steps without these fields default:
- `kind` → `"train"` (skill training)
- `produces` → `{}` (no item output)
- `consumes` → `{}` (no item input)
- `timing` → `null` (let enrich.py infer)
- `loop` → `false`

No existing step field is changed. This is purely additive.

### 3.2 goals.jsonl additions

Goals currently only gate on `reqs.skills`. Add:

```jsonc
{
  "id": "barrows",
  "label": "Barrows runs",
  "reqs": {
    "skills": { "attack": 60, "strength": 60, "defence": 60, "prayer": 43 },
    "items": { "prayer_potion_4": 20, "food_monkfish": 14 },  // NEW: item reqs
    "quests": ["quest-priest-in-peril"]                        // NEW: quest tags
  },
  "terminal": "unlock-barrows"
}
```

`reqs.items` triggers burndown resolution: the planner resolves supply chains for all
item requirements before admitting the goal as reachable.

### 3.3 greedy.js integration

Two extension points in `routeGoal`:

**A) meetsReqs extension** — supply gating. Add item-req check:

```js
// After existing skill + inventory checks:
const itemReqs = (step.reqs ?? {}).items ?? {};
for (const [itemId, needed] of Object.entries(itemReqs)) {
  if ((state[`item:${itemId}`] ?? 0) < needed) return false;
}
```

State keys for items follow the same pattern as skills: `item:prayer_potion_4`.

**B) Supply step injection** — before routeMulti returns, call burndown resolver:

```js
// NEW: inject supply-chain steps for goals that have item_reqs
const supplySteps = burndownResolve(goals, steps, state);  // new module
const allSteps = dedupeById([...supplySteps, ...steps]);
```

`burndownResolve` is a new `burndown.js` module that:
1. Iterates `goals[*].reqs.items`
2. For each item req, finds the supply chain steps
3. Returns them tagged `_supply: true` and `_supply_chain: "chain-id"`
4. Does NOT re-run greedy routing — supply steps are injected as prerequisites

**C) costFor extension** — supply steps are free-cost (they're mandatory, not optional):

```js
if ((step.tags ?? []).includes("supply")) return 0.0001;
```

### 3.4 enrich.py integration

**A) `topo_order` extension** — extend to also apply item grants:

```python
for k, v in (s.get("produces") or {}).items():
    state[f"item:{k}"] = state.get(f"item:{k}", 0) + (v if v != "??" else 0)
```

**B) `phased_steps` extension** — supply chain steps get annotated with the supply
chain name as their phase prefix if no other phase is set:

```python
if step.get("supply_chain"):
    phase = f"Supply: {step['supply_chain'].replace('-', ' ').title()}"
```

**C) Loop step annotation** — loop steps get a `MANUAL` completion condition plus
lifecycle metadata:

```python
if step.get("loop"):
    conds = [{"type": "MANUAL", "label": "Cycle complete — reset when supply is low."}]
```

**D) New `enrich_supply` pass** — called before `phased_steps`. Inserts all
`_supply: true` steps into the correct phase slot relative to their consuming goal:

```python
def insert_supply_steps(ordered, supply_steps):
    """
    For each supply step, find the earliest step in `ordered` that requires its output.
    Insert the supply step (and its chain) immediately before that consuming step's phase.
    Ahead-of-time steps bubble to the phase before; JIT steps co-locate.
    """
```

### 3.5 GuideStep.java additions

```java
/**
 * If this step is part of a named supply chain (e.g. "prayer-pot-supply"),
 * the chain id goes here. Plugin can group/highlight supply-chain steps
 * as a collapsible sub-section. Null = not a supply step.
 */
public String supplyChain;

/**
 * True if this is a repeating background loop (farm run, birdhouse reset, etc.).
 * Plugin renders loop steps differently (recurring badge, lifecycle indicator).
 */
public boolean loop;

/**
 * For loop steps: the expected re-trigger interval in minutes.
 * -1 = unknown / configurable.
 */
public int loopIntervalMinutes;
```

No other GuideStep fields change.

### 3.6 Seams with other facets

| Seam | This facet produces | Other facet consumes |
|------|--------------------|-----------------------|
| **interleaving** | Flat dep-ordered step list (supply steps tagged) | Decides WHERE in the plan background loops fire, alternation slots, cadence |
| **scheduling** | Loop steps with `loop: true`, `loopIntervalMinutes` | Decides WHEN to re-trigger loops (e.g., every 90min farm-run cadence) |
| **rendering** | `supplyChain` and `loop` fields on GuideStep | Decides how to visually collapse/group supply chain steps in the plugin panel |
| **greedy.js** | `burndown.js` module exporting `burndownResolve()` | routeMulti calls it as pre-pass; does NOT change routing logic |
| **enrich.py** | `insert_supply_steps()` function | enrich pipeline calls it before `phased_steps()` |

**Synthesizer must reconcile**:
1. The interleaving facet decides SLOT; burndown decides WHAT. These must agree on the
   `timing` field semantics — the synthesizer must align both facets on the same enum.
2. The scheduling facet decides cadence intervals; burndown uses `"??"` placeholders.
   Synthesizer must decide where real rates come from (config file vs. wiki data).
3. The rendering facet owns GuideStep display; burndown adds `supplyChain` and `loop`.
   The synthesizer must ensure the rendering facet does not ignore these fields.

---

## 4. WORKED EXAMPLES

### Example A: "Prayer potion supply" — full burndown to gatherable roots

**Goal**: Player needs a sustained prayer potion supply for Barrows and above.

**Resolution trace** (dep-first, each line = one resolved step):

```
resolveItem("prayer_potion_4", qty=20, timing="ahead-of-time")
│
├── resolveLevel(herblore, 52)
│   └── STEPS: train-herblore-3 (Druidic Ritual unlock)
│           → train-herblore-15 (guam + eye of newt → attack potions)
│           → train-herblore-38 (ranarr + snape grass → ... but wait, not yet)
│           → train-herblore-52 (ranarr potions — this IS the step we're feeding)
│   NOTE: herblore training itself consumes herbs; the herb supply chain is bootstrapped
│         before the training target, not after. The cycle-break is: early training
│         uses lower herbs (guam, tarromin, harralander) sourced before Farming 32.
│
├── resolveItem("ranarr_weed", qty=20, timing="ahead-of-time")
│   │
│   ├── resolveQuest("quest-fairytale-1")   ← herb patch unlock
│   │   ├── resolveQuest("quest-lost-city")
│   │   │   └── STEP: quest-lost-city (no item reqs)
│   │   ├── resolveQuest("quest-nature-spirit")
│   │   │   └── STEP: quest-nature-spirit (no item reqs)
│   │   └── STEP: quest-fairytale-1
│   │
│   ├── resolveQuest("quest-bone-voyage")   ← Fossil Island (ultracompost ash)
│   │   └── [Fossil Island prereq chain — abbreviated]
│   │   └── STEP: quest-bone-voyage
│   │
│   ├── resolveLevel(farming, 32)
│   │   └── STEPS: [quest XP route: Forgettable Tale → Garden of Tranquillity →
│   │              Garden of Death] or skill training to 32
│   │
│   ├── resolveItem("ranarr_seed", qty=20, timing="either")
│   │   └── SOURCE: slayer-drop-herb-seed (passive during slayer training)
│   │   └── STEP: slayer-training (existing step, tagged supply_chain)
│   │   NOTE: rate="??" — player adjusts based on task count
│   │
│   ├── resolveItem("ultracompost", qty=20, timing="ahead-of-time")
│   │   ├── resolveItem("pineapple", qty=600, timing="ahead-of-time")
│   │   │   └── SOURCE: source-pineapples-charter (Catherby docks, non-GE)
│   │   │   └── STEP: gather-pineapples-catherby-charter
│   │   │   NOTE: produces: { pineapple: 100 }, executions: 6
│   │   │
│   │   ├── resolveItem("volcanic_ash", qty=600, timing="either")
│   │   │   └── SOURCE: gather-volcanic-ash-fossil-island
│   │   │   └── requires: quest-bone-voyage (already resolved above — deduped)
│   │   │   └── STEP: gather-volcanic-ash-fossil-island (loop: true, timing: either)
│   │   │
│   │   └── STEP: produce-ultracompost (30 pineapples + 15 ash → bucket ultracompost)
│   │         loop: true, timing: ahead-of-time
│   │
│   └── STEP: farm-ranarr-patch (plant ranarr seed + ultracompost → harvest ~6.5 ranarr)
│         loop: true, timing: either, supply_chain: "prayer-pot-supply"
│
├── resolveItem("snape_grass", qty=20, timing="just-in-time")
│   └── SOURCE: gather-snape-grass-waterbirth
│   └── STEP: gather-snape-grass-waterbirth
│         location: waterbirth-island, no quest gate
│
└── STEP: brew-prayer-potion (ranarr + snape_grass → prayer_potion_4)
      kind: produce, reqs: { skills: { herblore: 52 } }
      consumes: { ranarr_weed: 1, snape_grass: 1 }
      produces: { prayer_potion_4: 1 }
      supply_chain: "prayer-pot-supply"
```

**Final ordered step list** (deduplicated, dep-first):
1. quest-lost-city
2. quest-nature-spirit
3. quest-fairytale-1
4. quest-bone-voyage
5. train-herblore-3 (Druidic Ritual)
6. train-farming-32 (via quest XP chain)
7. slayer-training (passive seed source; loop, existing step)
8. gather-pineapples-catherby-charter (ahead-of-time, one-time stockpile)
9. gather-volcanic-ash-fossil-island (loop, during patch cycle downtime)
10. produce-ultracompost (loop, feed compost bins ahead-of-time)
11. farm-ranarr-patch (loop, 90min cadence)
12. gather-snape-grass-waterbirth (JIT, batch before brewing session)
13. train-herblore-52 (consume lower herbs to reach level)
14. brew-prayer-potion (loop, triggered when ranarr + snape_grass stockpiled)

**Phase annotation** (timing placement by enrich.py):
- Steps 1–6: Phase "Toward herb infrastructure"
- Steps 7–11: Phase "Supply: Prayer Pot Supply" (ahead-of-time background)
- Steps 12–14: Interleaved into the phase where prayer potions are first consumed
  (e.g., "Toward Barrows")

---

### Example B: "Complete Recipe for Disaster" — coarse unwind to granular steps

**Goal**: `coarse: "RFD subquest completion (6 quests)"` expands to:

**Step 1 — RFD Introduction** (no item chain)
```
STEP: rfd-intro
  reqs: { quests: ["quest-cooks-assistant"] }
  item_reqs: {}
  grants: { tag: "rfd-started" }
```

**Step 2 — RFD Goblins (Wartface & Bentnoze)**
```
resolveItem("orange_goblin_mail") → craft/dye goblin mail orange
  ├── resolveItem("goblin_mail") → loot from goblins (gather-goblin-mail, loop: false)
  ├── resolveItem("orange_dye")
  │   ├── resolveItem("red_dye")
  │   │   ├── resolveItem("redberries", 3)
  │   │   │   └── SOURCE: pickpocket HAM members OR pick from redberry bush (no quest)
  │   │   └── STEP: craft-red-dye-aggie (Aggie, Draynor, costs 5gp from combat drops)
  │   └── resolveItem("yellow_dye")
  │       ├── resolveItem("onion", 2) → pick from onion patch north of Rimmington
  │       └── STEP: craft-yellow-dye-aggie
  └── STEP: craft-orange-dye (red + yellow via Aggie)

STEP: rfd-goblins (feed orange/blue/brown goblin mail to goblins)
  reqs: { quests: ["rfd-intro"] }
```

**Step 3 — RFD Mountain Dwarf**
```
resolveItem("kel-se-stew") → spiced stew (Cooking 25 + 4 types of spice)
  ├── resolveItem("spice", 4 types) → steal from spice stall OR captain redbeard
  ├── resolveItem("cooked_stew") → cook raw stew (bowl + potato + onion + meat + water)
  │   ├── resolveItem("raw_potato") → dig from potato field (no req)
  │   ├── resolveItem("bowl") → buy from general store (non-GE NPC vendor)
  │   └── resolveItem("cooked_beef") → cook raw beef from cow kill
  └── STEP: brew-spiced-stew-kel-se (5 attempts avg; RNG — rate: "??")

NOTE: This is the stew RNG mechanic. Steps emit: "Spice stew with one type until
all boosts land (average ?? attempts). Have extra spices prepared."

STEP: rfd-mountain-dwarf
  reqs: { quests: ["rfd-intro"], skills: { cooking: 25 } }
  item_reqs: { kel_se_stew: 1 }
```

**Step 4 — RFD Pirate Pete** (minigame-locked)
```
NOTE: This subquest is minigame-locked (Recipe for Disaster portal). Cannot be
gathered before starting. Steps must happen INSIDE the minigame instance.

resolveItem("cooked_crabclaw_fishcake")
  → fish raw crab/eel inside the Mogre area (minigame-gated gather)
  → cook on range inside the area

STEP: rfd-pirate-pete-minigame
  reqs: { quests: ["rfd-intro", "quest-rum-deal"], skills: { fishing: 53, cooking: 31 } }
  kind: "quest"
  NOTE: item gathering is INTERNAL to the minigame; no ahead-of-time staging possible
```

**Step 5 — RFD Evil Dave**
```
resolveItem("spicy-stew-evil-dave")
  ├── resolveItem("spice-red", 5) → brown spice, loot from Stronghold or spice stall
  ├── resolveItem("normal_stew") → same as RFD Mountain Dwarf stew chain (deduped)
  └── STEP: brew-evil-dave-stew (5 doses of correct spice type; RNG, rate: "??")

STEP: rfd-evil-dave
  reqs: { quests: ["rfd-intro", "quest-shadow-storm"], skills: { magic: 59, cooking: 25 } }
  item_reqs: { evil_dave_stew: 1 }
```

**Step 6 — RFD Skrach Uglogwee**
```
resolveItem("cooked_jubbly")
  ├── resolveItem("raw_jubbly") 
  │   ├── resolveItem("ogre_bellows") → buy from Rantz or find in Feldip Hills
  │   ├── resolveItem("ogre_bait") → combine swamp paste + chompy feather
  │   └── STEP: hunt-jubbly-bird (Hunter 41 required; spawn near Rantz)
  └── STEP: cook-jubbly (Cooking 41; cook on Rantz's fire specifically)

STEP: rfd-skrach
  reqs: { quests: ["rfd-intro", "quest-big-chompy"], skills: { hunter: 41, cooking: 41 } }
```

**Step 7 — RFD Sir Amik Varze**
```
resolveItem("creme-brulee-supreme")
  ├── resolveItem("vanilla-pod") → pick from Karamja jungle (no quest gate)
  ├── resolveItem("bucket-of-cream") → milk POH dairy cow (Construction req) OR buy
  │   NOTE: POH dairy cow requires dairy churn + Construction. Non-GE source verified.
  ├── resolveItem("egg") → kill chickens (existing training step; deduped)
  └── STEP: cook-creme-brulee (Cooking 70 + ice cream machine)
NOTE: ice gloves required during this subquest boss phase. Source: kill Ice Queen.
STEP: kill-ice-queen (quest: Heroic shield or open access; no quest gate but deep dungeon)

STEP: rfd-sir-amik
  reqs: { quests: ["rfd-intro", "quest-cooks-assistant", "quest-family-crest"],
          skills: { cooking: 70 } }
  item_reqs: { creme_brulee_supreme: 1, ice_gloves: 1 }
```

**Step 8 — RFD Awowogei** (greegree chain)
```
resolveItem("greegrees", 4 variants) → Monkey Madness I
  → Already a full quest chain. Expand via resolveQuest("quest-mm1")
  NOTE: Monkey Madness I itself is a 4-trip dungeon. Its coarse entry is:
    coarse: "Monkey Madness I greegree routing"
    unwind:
      1. trip-1: talisman + monkey bones (zombie monkey, Ape Atoll dungeon)
      2. trip-2: talisman + monkey bones (gorilla)
      3. trip-3: talisman + monkey bones (bearded gorilla)
      4. trip-4: talisman + monkey bones (skeleton)
      5. Zooknock crafts each greegree: costs 1 talisman + 1 bone per type
    Skeleton Key dungeon sequence: {room order is game-fixed; author note only}.

STEP: rfd-awowogei
  reqs: { quests: ["quest-mm1"] }
  item_reqs: { greegree_zombie: 1, greegree_gorilla: 1, greegree_bearded: 1,
               greegree_skeleton: 1, cooked_snake: 1 }
  NOTE: cooked snake → kill jungle snake on Ape Atoll → cook on fire
```

**Step 9 — RFD Finale**
```
resolveLevel(attack, 65) + resolveLevel(strength, 65) + resolveLevel(defence, 65)
  → existing training steps (deduped from earlier combat training)

resolveItem("food-for-finale", qty=14)
  → resolveItem("shark") or resolveItem("monkfish")
  → gather-fish-monkfish (Fishing 62) or gather-fish-shark (Fishing 76)
  → cook

resolveItem("prayer_potion_4", qty=4)
  → already resolved in Example A (deduped)

STEP: rfd-finale (defeat 6 escalating bosses; manual completion condition)
  reqs: { quests: ["rfd-goblins","rfd-mountain-dwarf","rfd-pirate-pete",
                   "rfd-evil-dave","rfd-skrach","rfd-sir-amik","rfd-awowogei"],
          skills: { attack: 65, strength: 65, defence: 65 } }
  item_reqs: { food: 14, prayer_potion_4: 4 }
```

**Unwind summary**: "RFD subquest completion (6 quests)" expands to 9 quest steps +
~30 gather/produce/train steps. Key bottlenecks:
- RFD Sir Amik: Cooking 70 is the hardest skill gate (longest training block).
- RFD Awowogei: Monkey Madness I is the longest quest chain prerequisite.
- RFD Pirate Pete: minigame-locked; no ahead-of-time staging. Must be handled in sequence.
- RFD Evil Dave + Mountain Dwarf: stew RNG is unbounded. Player must prepare extra spices.

---

## 5. OPEN QUESTIONS FOR THE SYNTHESIZER

1. **Rate placeholders**: Multiple `produces` fields are marked `"??"`. The synthesizer
   must decide: (a) pull from a rate-config file players can tune, or (b) mark with
   in-guide tooltip "adjust quantity based on your farm yield." Both are viable; pick one
   and apply consistently across all facets.

2. **Supply cycle vs. train cycle ordering**: Herblore training (to reach 52) consumes
   herbs. The herb farm loop also produces herbs for training. This is a bootstrapping
   dependency: the burndown breaks it by emitting early training herbs as a one-time
   gather (e.g., 50 guam from Hill Giants during combat training). The interleaving facet
   must honor this bootstrap step's ordering — it MUST come before farm-run loop setup.

3. **Stew RNG steps**: RFD Mountain Dwarf and Evil Dave have unbounded RNG outcomes.
   The burndown emits steps with `rate: "??"` and a player note. The scheduling facet
   must decide how to handle open-ended retries in the schedule (infinite loop vs. timeout).

4. **Coarse stubs**: 28 of 55 coarse nodes remain status=stub. The synthesizer must
   prioritize which get authored first. Recommended priority: RFD chain (blocks Barrows
   gloves), prayer-pot supply (blocks all PvM), slayer-herb workflow (blocks herblore
   self-sufficiency), MM I greegree routing (blocks RFD Awowogei).

5. **Item req field on goals.jsonl**: The new `reqs.items` field on goals is not yet
   understood by greedy.js beyond the extension proposed above. The synthesizer must
   confirm greedy.js does not fail on goals with `reqs.items` before the `burndown.js`
   module is wired in.

6. **Seam with interleaving facet on background loop slots**: The burndown marks steps
   `loop: true` but does not specify WHERE in the active grind they fire. The interleaving
   facet owns those "alternation slots." The synthesizer must define the contract: does
   the interleaving facet READ `loop: true` and assign slots, or does burndown output
   explicit `insert_after: "step_id"` hints?

7. **Cycle break bootstrap sources**: The prayer-pot / ultracompost bootstrap requires
   a one-time pineapple acquisition from Catherby charter (not GE). The synthesizer must
   confirm this is still a valid non-GE source in the current OSRS game. If removed,
   alternate source needed (pineapple spawns on Karamja, ~12 per visit).
