# SYNTHESIS — the unified interleaved requisite-burndown model

Reconciles the four facet designs (sequencer, background, burndown, steer) into ONE
implementable model over the existing system: `steps.jsonl`/`goals.jsonl` →
`greedy.js` (routeMulti) → `enrich.py` → `GuideStep.java` (guide-chain plugin).

Hard framing honored throughout: unified progression (no F2P/P2P split); everything
gathered/produced, never GE; ahead-of-time or JIT staging; steer-points past
level/pinnacle-quest framing; NO fabricated rates — `"??"` / null / named tuning
constants marked PLACEHOLDER only.

---

## 1. UNIFIED SCHEMA

The four facets proposed overlapping shapes. Reconciliation principle: **one field per
concept, owned by exactly one facet, everything additive and nullable** (every existing
row stays valid untouched).

### 1a. Dropped / renamed (the reconciliation itself)

| facet proposal | unified as | why |
|---|---|---|
| background `bg{}` descriptor | `slot{}` (sequencer's outer shape absorbs bg's payload) | one recurring-task descriptor, not two |
| burndown `loop: true` | derived: `slot.type == "background"` | boolean duplicated the slot type |
| background `bg.yields` | `produces` (burndown's) | one item-output vocabulary |
| background `side_yields` (agility marks) | `produces` with rate `"??"` on the train step | pattern-6 embed is just an output on an active step |
| background `scheduling_bias` | `timing` (burndown's, matches requisites.jsonl enum) | one enum: `ahead-of-time \| jit \| either` |
| burndown `loopIntervalMinutes` | `cadenceMinutes` (Java) / `slot.cadence_min` (JSONL) | one cadence field |
| background `backgroundTask` (Java bool) | `slotType` (Java String) | one discriminator |
| sequencer `embedsIntoPhase` (Java) | dropped — enrich resolves passive embeds into `passiveOverlays` labels on the HOST step | passive steps never render as their own card |
| sequencer `injectSlots` + background `weaveBackground` | ONE pass: `weaveOverlays()` in new `planner/overlay.js` | two post-greedy injectors would fight over anchors |

### 1b. steps.jsonl — unified node (all new fields optional, defaults shown)

```jsonc
{
  // ── existing, unchanged ──
  "id": "...", "label": "...", "detail": "...",
  "reqs": { "skills": {}, "tags": [], "inv_free": null, "constraints": [] },
  "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": [],
  "location": { "region": "...", "zone": "...", "quest_gate": null, "quest_phase": null },

  // ── burndown ──
  "kind": "train",              // "train"(default)|"quest"|"gather"|"produce"|"unlock"|"access"|"coarse"
  "produces": {},               // { item_slug: number | "??" } per execution
  "consumes": {},               // { item_slug: number | "??" } per execution
  "timing": null,               // "ahead-of-time"|"jit"|"either"|null (infer)
  "supply_chain": null,         // FK → supply_chains.jsonl
  "coarse_unwind": null,        // coarse kind only: ordered step-id list
  "known_drops": null,          // slayer/combat steps: item slugs (feeds slayer-seed hook)

  // ── sequencer + background (merged) ──
  "slot": null,                 // absent/null = primary active step
  // "slot": {
  //   "type": "background"|"passive"|"alternation",
  //   "cadence_min": 90,                    // null = one-shot / event-driven; PLACEHOLDER values flagged
  //   "embeds_into": ["smithing"],          // passive only: host-step tags
  //   "lifecycle": { "states": [...], "initial": "idle", "transitions": [...] },  // background only
  //   "setup_steps": [], "collect_steps": [],
  //   "supply_threshold_jit": { "prayer_potion_4": 50 }   // threshold values PLACEHOLDER
  // }
  "deferred_until": null,       // ["goal-id", "tag:bossing"] — hold from heap until triggered
  "hub": null,                  // geographic cluster key; matches location.region vocabulary
  "est_minutes": null,          // real-world minutes; null = DEFAULT_STEP_MIN (never fabricate)

  // ── steer ──
  "steer_id": null              // FK → steer_points.jsonl; step materially advances that steer-point
}
```

New `tags[]` vocabulary (S2): `"break"`, `"background"`, `"bg-setup"`, `"bg-collect"`,
`"supply-producer"`, `"banking"`, `"teleport"`.

### 1c. goals.jsonl — additions

```jsonc
{
  "id": "barrows", "label": "Barrows runs",
  "reqs": {
    "skills": { "attack": 60, "strength": 60, "defence": 60, "prayer": 43 },
    "items":  { "prayer_potion_4": 20, "food_monkfish": 14 },   // NEW — consumed by burndown.js ONLY (see S6)
    "quests": ["quest-priest-in-peril"]                          // NEW — resolved by burndown.js
  },
  "terminal": "unlock-barrows",
  "steer_points": ["steer-graceful", "steer-ardougne-easy-diary"]  // NEW — phase anchors for this goal
}
```

### 1d. New data files (all under `assets/data/tools/`)

**steer_points.jsonl** (steer facet, verbatim shape accepted):
`{id, label, kind: access|qol_gear|supply_infra|progress_metric|combat_spine,
unlock_condition:{quests,skills,items,unlocks}, grants:{tags,travel_hub},
downstream_acceleration, anchor_weight: 0.0–1.0, timing, recurring}` — one node per
diary TIER (S5). Pets: `anchor_weight: 0.0`, catalogued, never a boundary.

**supply_chains.jsonl** (burndown, verbatim): `{id, label, output_item,
output_per_cycle: "??", steps[], loop, timing, prereq_quests, prereq_skills}`.

**coarse_expansions.jsonl** (burndown, verbatim): `{coarse_id, name,
status: stub|partial|authored, steps[]}`.

**items.jsonl** — DEFERRED to Lane 5 (display labels only; `produces`/`consumes` slugs
are the contract; nothing blocks on it).

### 1e. GuideStep.java — final field set (union, reconciled)

```java
/** "background" | "passive" | "alternation" | null (normal step). Drives panel lane. */
public String slotType;
/** Real-world minutes between recurrences. Null = event-driven / one-shot. */
public Integer cadenceMinutes;
/** Background lifecycle state key; persisted via RuneLite config per step id. */
public String lifecycleState;
/** Pre-resolved LABELS of passive embeds active on this host step (badge render). */
public List<String> passiveOverlays;
/** Named supply chain this step belongs to; plugin groups as collapsible section. */
public String supplyChain;
/** Steer-point kind for badge decoration; null on regular steps. */
public String steerKind;
```

`ConditionType` gains **`RECURRING`**; `CompletionCondition` gains
`public int cadenceMinutes;` (see S4). No other Java changes.
**Note: VARBIT already exists** — access/diary steer auto-detection needs NO new
condition type, only varbit-id lookup (ids marked `"??"` until sourced).

### 1f. Field → owner → purpose

| field | owner facet | purpose |
|---|---|---|
| `kind, produces, consumes, timing, supply_chain, coarse_unwind, known_drops` | burndown | requisite DAG: items as edge weights on step arcs; coarse unwind registry |
| `slot{}` (type/cadence/embeds_into/lifecycle/setup/collect/threshold) | sequencer+background (merged) | overlay steps: what fires outside the greedy heap and when |
| `deferred_until` | sequencer | train-to-breakpoint then defer (pattern 7) |
| `hub` | sequencer | quest hub batching (pattern 9) |
| `est_minutes` | shared (S1) | wall-clock cadence math; null → DEFAULT_STEP_MIN |
| `steer_id` (steps), `steer_points` (goals) | steer | FK grouping steps under steer intent; goal-scoped anchor activation |
| `reqs.items`, `reqs.quests` (goals) | burndown | triggers supply resolution (never reaches greedy raw — S6) |
| Java `slotType/cadenceMinutes/lifecycleState` | sequencer+background | plugin loops-lane render + RECURRING re-arm |
| Java `passiveOverlays` | sequencer | zero-time embed badges (pattern 6) |
| Java `supplyChain` | burndown | collapsible supply grouping |
| Java `steerKind` | steer | badge/icon per steer kind |

---

## 2. UNIFIED PIPELINE

```
                    JS planner (assets/js/router/planner)
  steps.jsonl ─┐
  steer_points ┼─► P0 load ─► P1 burndownResolve ─► P2 bank split ─► P3 routeMulti ─► P4 weaveOverlays ─┐
  goals.jsonl ─┘        (goals.reqs.items/quests →    active vs      (greedy, existing  (bg setup +      │
  supply_chains          supply+bootstrap steps,      overlay banks;  + deferred_until   cadence chips +  │
                         demandSet, tag-bridge)       steer merged)   + demandSet)       passive/alt;     │
                                                                                        _anchor/_side)   │
                    ────────────────────────────────────────────────────────────────────────────────────┘
                    Python exporter (tools/guide-export/enrich.py)                                       │
   ┌─────────────────────────────────────────────────────────────────────────────────────────◄──────────┘
   ▼
  P5 detach overlays ─► P6 hub_batches ─► P7 topo_order ─► P8 insert_supply_steps ─► P9 re-attach ─► P10 phased_steps_with_steer ─► P11 emit
     (_anchor nodes       (BEFORE topo;     (+item grants,    (ahead-of-time bubble,     overlays        (merged_anchors: milestones      guide
      set aside)           topo = dep        additive, local   jit co-locate,            at anchors       + steer; phase_name() sole      JSON
                           guard — S7)       dict)             bootstrap-first)                           author of phase strings)
```

**Pass contract — what each reads/writes:**

| pass | reads | writes |
|---|---|---|
| P1 `burndownResolve` (new `planner/burndown.js`) | goals `reqs.items/quests`, steps `produces/consumes/kind/timing`, supply_chains | injected supply+bootstrap steps (`_supply`, `_supply_chain`), `env.demandSet`, sanitized goals (items→tag-bridge, S6) |
| P2 bank split (routeMulti head) | `slot.type`, `_steerPoint` merge from steer_points | `activeSteps` (null slot or alternation), `overlaySteps` (background/passive) |
| P3 `routeMulti` (existing + 3 hooks) | `deferred_until` + `env.activeGoalIds` + `env.demandSet`; `costFor` ×0.5 for `_steerPoint` w≥0.8 and 0.0001 for `_supply` | ordered `path` + synths + capstones (unchanged shape) |
| P4 `weaveOverlays` (new `planner/overlay.js`) | overlaySteps, `est_minutes` cumsum, `isBreak()`, lifecycle guards, `supply_threshold_jit` (planner-time stock=0 ⇒ conservative AOT) | injected `{_bg, _bg_lifecycle}` / `_alternation` nodes each with `_anchor: <step_id>, _side: before\|after`; `_passiveOverlays` annotations on hosts |
| P6 `hub_batches` | `hub`, quest tag | reordered reals (clusters contiguous at earliest member) |
| P7 `topo_order` | `reqs.skills` + NEW `reqs.tags`/item grants from `produces` (additive local dict) | valid play order; acts as dep guard after hub reorder |
| P8 `insert_supply_steps` | `timing`, `_supply_chain` | supply steps bubbled before earliest consumer (AOT) or co-located (JIT); bootstraps strictly before loop setup |
| P9 re-attach | `_anchor`/`_side` | overlay nodes pinned adjacent to their (possibly moved) anchor |
| P10 `phased_steps_with_steer` | milestones, active steer points (`goal.steer_points`), `anchor_weight`, `steer_met()` | `{step, phase}` records; phases from `phase_name()` ONLY (S3) |
| P11 emitters | all annotations | `_train_step` / `_milestone_step` / `_steer_step` / `_bg_step` / alternation card → guide JSON |

Web view consumes P4 output directly (chips/badges inline); guide export runs P5–P11.

---

## 3. SEAM RESOLUTIONS (S1–S10)

**S1 — est_minutes / AVG_STEP_MIN.** Field `est_minutes: number|null` on steps.jsonl.
Null means "unknown"; the planner substitutes `DEFAULT_STEP_MIN` from a new shared
tuning module `assets/js/router/planner/tuning.js` (exported const, value 30, comment
`// PLACEHOLDER — calibrate from measured runs`; overridable via `profile.tuning.defaultStepMin`),
mirrored as a `TUNING` dict at the top of enrich.py with a comment pairing the two.
Authors set `est_minutes` only from real measurements — never estimated prose. Cadence
math is cumulative wall-clock over the path (background's model), NOT step-index counting
(sequencer's AVG_STEP_MIN heuristic is retired).

**S2 — shared break definition.** A step is a break anchor iff `tags` contains `"break"`,
`"banking"`, `"teleport"`, or `"quest"` (quest handoff), OR the previous path step has a
different `location.region` (implicit region transition). One helper `isBreak(prev, step)`
lives in `overlay.js`; `weaveOverlays` is the ONLY injector (injectSlots and
weaveBackground are merged into it), so no second consumer can drift.

**S3 — phase-naming registry.** enrich.py is the sole author of phase strings via one
function: `phase_name(kind, label)` with kinds `toward → "Toward {label}"`,
`region → "Region: {label}"`, `supply → "Supply: {label}"`, `background → "Background loops"`,
`endgame → "Endgame & extras"`. The JS planner emits ZERO phase strings — only structured
annotations (`_bg`, `_steerPoint`, `_supply_chain`). Hub batches do NOT create phases;
they only reorder within phases. Thresholds `STEER_HARD_THRESHOLD = 0.8` /
`STEER_SOFT_THRESHOLD = 0.5` live in tuning.js + mirrored in enrich's TUNING dict.

**S4 — RECURRING condition.** Add enum value `RECURRING` to `ConditionType.java` and
`public int cadenceMinutes;` to `CompletionCondition.java`. Semantics: a step whose
conditions include RECURRING NEVER advances the main guide index; "completing" it
(collect/replant confirmed, or its VARBIT/ITEM_HELD sibling conditions fire) re-arms it
at `now + cadenceMinutes` and cycles `lifecycleState`. Persistence: RuneLite config keys
`guidechain.bg.<stepId>.nextFireEpochMs` and `.lifecycleState`, read at login.
**Implementer: the plugin (Lane 4)** — explicitly assigned so it doesn't fall between
sequencer and render. enrich emits RECURRING only for `slot.type=="background"` with
non-null `cadence_min`; event-driven background steps stay MANUAL.

**S5 — steer-point home + steer_id.** Steer-points live in a NEW `steer_points.jsonl`
(separate from goals: goals are greedy route targets, steer-points are enrich phase
anchors — different consumers, different lifecycle). goals.jsonl gets optional
`steer_points: []` to activate anchors per goal. steps.jsonl gets nullable `steer_id`
FK — the only link letting `phased_steps_with_steer` group steps by steer intent.
Diary tiers: one node per tier (60 nodes; clean per-tier anchor_weight).
progress_metric aggregates (clog %, QP totals): emitted as steps only when
`anchor_weight ≥ 0.5`; below that they surface solely in the plugin progress panel.

**S6 — produces/consumes + goals.reqs.items without breaking greedy.** Verified against
`model.js`: `reqQuals` maps only `skills`/`tags`/`atlas_items` — `reqs.items` is
**silently ignored today** (goalMet passes without them; no crash, silent under-planning).
Also `graph.coalesce` uses max-semantics (gte), which cannot ADD item counts across
repeated executions. Decision: **item quantities never enter greedy state.** All item
math (executions = ceil(qty/rate), recursion, cycles) stays inside `burndown.js`, which
(a) injects the resolved supply steps dep-first, (b) grants `tag:supply-<chain>` on each
chain's terminal produce step, and (c) rewrites the goal's `reqs.items` into
`reqs.tags: ["supply-<chain>", ...]` before greedy sees it. Until Lane 2 lands, a
one-line sanitize shim strips `reqs.items`/`reqs.quests` from goals at load so nothing
half-fires. enrich's `topo_order` applies produces additively in a local dict for
ordering validation only.

**S7 — canonical pass order.** Published in §2 and to be pasted as a header comment in
both greedy.js and enrich.py:
`load → burndownResolve → bank-split → routeMulti(greedy) → weaveOverlays ‖ detach-overlays → hub_batches → topo_order → insert_supply_steps → re-attach → phased_steps_with_steer → emit`.
Resolves sequencer OQ-5: `hub_batches` runs BEFORE `topo_order`, and topo (which emits
eligible steps in list order) is the dependency guard — a hub reorder that violates a dep
gets corrected by topo while keeping the cluster otherwise contiguous. Bootstrap gathers
order before loop setup structurally: burndown grants `tag:bootstrap-<chain>` from the
bootstrap step and puts it in the loop-setup step's `reqs.tags`, so topo enforces it —
no positional hack. Background weaving is post-greedy (P4) and survives enrich reordering
via `_anchor`/`_side` re-pinning (P9).

**S8 — deferred_until vs supply demand.** Rule: **hard requisites beat soft deferrals.**
`burndownResolve` returns `env.demandSet` — every step id on a supply-critical path for
any queued goal. `isDeferrable(step, env)` returns true immediately when
`env.demandSet.has(step.id)`, regardless of `deferred_until`; otherwise the defer holds
until a named goal is active or a `tag:` trigger has been emitted. deferred_until is an
efficiency preference; supply is a requisite.

**S9 — background step bank authoring.** Single owner: the content lane (Lane 5) authors
all background steps using the unified `slot{}` + `produces`/`consumes` schema — no
facet split (sequencer models the schema, burndown supplies the item vocabulary, one
author writes rows). Initial bank: `bg-farm-allotment`, `bg-herb-run`,
`bg-birdhouse-run`, `bg-kitten-mature` (one-shot; feeding = annotation, escalation:
annotation ×3 cycles → soft warning, never a hard interrupt), `bg-seaweed-run`,
`bg-grubby-chest` (event-driven, cadence null), plus `known_drops` arrays on slayer
steps (wires the pattern-8→pattern-4 slayer-seed feed hook). All yields `"??"`; cadence
values are named tuning placeholders. Courier tasks: `cadence_min: null` with
`// MEASURE IN LIVE GAMEPLAY`.

**S10 — coarse stub priority (28 stubs).** Author in this order — each unblocks the
widest downstream surface: 1) RFD subquest chain (blocks Barrows gloves), 2) prayer-pot
supply (blocks all PvM), 3) slayer-herb workflow (herblore self-sufficiency),
4) MM1 greegree routing (blocks RFD Awowogei), 5) combat-training routing heuristic
(crabs vs slayer), 6) gear-tier contents per stage, 7) boss/raid entry mechanics
(Warriors' Guild → Barrows → GWD), 8) herblore recipe→secondary chains, 9) farm-run
loop patterns, 10) banking/inventory patterns, 11) DT safespots, 12) Turael-skip
sequence. Confirmed: every unknown rate/attempt-count in expansions is `"??"` (stew RNG
explicitly so); `resolveRequisite` emits `synthCoarse` placeholders for anything still
stubbed, so the guide degrades honestly, never silently.

---

## 4. PHASED BUILD PLAN — disjoint lanes

Lane order: 1 → (2 ‖ 4) → 3 → 5 → 6. Files listed are the complete touch-set per lane
(disjoint except steps.jsonl rows, which are append/annotate-only and non-conflicting).

### Lane 1 — THIN VERTICAL SLICE: steer phasing + one background loop, web-visible
Least schema churn; no Java changes; visible in the router web view same-day.
- **Files**: NEW `assets/data/tools/steer_points.jsonl` (the 6 nodes from steer §4);
  `assets/data/tools/steps.jsonl` (add `steer_id` to ~8 existing steps: agility → steer-graceful,
  fairytale chain → steer-fairy-rings, etc.; append ONE background row `bg-farm-allotment`
  with unified `slot{}`); NEW `assets/js/router/planner/tuning.js` (DEFAULT_STEP_MIN,
  STEER_HARD_THRESHOLD, STEER_SOFT_THRESHOLD); NEW `assets/js/router/planner/overlay.js`
  (`weaveOverlays` minimal: bg setup at first break + cadence chips by est_minutes cumsum,
  `_anchor`/`_side` on every injected node, `isBreak()`); `assets/js/router/planner/greedy.js`
  (routeMulti: 3-line bank split excluding slot-typed steps from the heap; call weaveOverlays;
  goal sanitize shim stripping `reqs.items`/`reqs.quests`); `tools/guide-export/enrich.py`
  (`phase_name()` registry, load steer_points, `phased_steps_with_steer` hard-anchors-only,
  `_steer_step` + `_bg_step` emitters, P5/P9 detach/re-attach).
- **Lands**: phases anchored on steer-points ("Toward Graceful outfit", "Toward Ardougne
  Easy Diary") + background chips woven into the plan, in the web view and in exported
  guide JSON (`steerKind`/`slotType` present; plugin ignores unknown JSON fields safely).
- **Verify**: route Barrows in the web view — steer phases + allotment chips appear at
  break anchors; `plan.mjs | enrich.py` emits valid guide JSON; existing routes without
  steer_points byte-identical (regression diff).

### Lane 2 — burndown core (requisite→gather resolution)
- **Files**: NEW `assets/js/router/planner/burndown.js` (`resolveRequisite`/`resolveItem`/
  `resolveQuest`/`unwindCoarse`, VISITED cycle-break + gotcha log, demandSet, tag-bridge
  per S6); NEW `assets/data/tools/supply_chains.jsonl` (prayer-pot chain first); NEW
  `assets/data/tools/coarse_expansions.jsonl` (RFD authored, rest stubs); steps.jsonl
  (`kind/produces/consumes/timing/supply_chain` on gather/produce rows it authors);
  goals.jsonl (`reqs.items`/`reqs.quests` on barrows); greedy.js (`costFor` supply
  0.0001; replace sanitize shim with burndown wiring); enrich.py (`topo_order` item
  grants, `insert_supply_steps`, `Supply:` phase kind).
- **Lands**: goals with item reqs resolve to gathered roots dep-first; bootstrap-before-loop
  enforced via `tag:bootstrap-<chain>`.
- **Verify**: prayer-pot trace reproduces burndown §4 Example A's 14-step dep-first list;
  herblore/herb cycle logs the cycle-break gotcha and emits the one-time guam gather first.

### Lane 3 — sequencer full (defer, hubs, passive, alternation)
- **Files**: greedy.js (`isDeferrable` + `env.activeGoalIds` + demandSet override);
  overlay.js (passive `embeds_into` annotation, alternation markers, lifecycle guards,
  planner-time JIT threshold with stock=0); steps.jsonl (`deferred_until` on 40→60+
  combat rows, `hub` on quest rows, `est_minutes` where measured, passive rows
  `embed-bury-bones`, `embed-alch-smithing`); enrich.py (`hub_batches` BEFORE topo,
  alternation card emitter, `passiveOverlays` label resolution).
- **Verify**: unit test — two dependent quests in one hub stay dep-ordered after
  hub_batches+topo; `train-attack-60` held until Dragon Slayer queued, released when a
  supply chain demands combat; passive badge lands on host cards only, falls back to
  nearest ACTIVE host when the natural host is a bg chip (sequencer OQ-6: never badge a chip).

### Lane 4 — plugin (runs parallel with Lane 2)
- **Files**: `GuideStep.java` (§1e six fields), `ConditionType.java` (+RECURRING),
  `CompletionCondition.java` (+cadenceMinutes), step-advance logic (slotType=="background"
  never advances main index; re-arm at now+cadence; config persistence keys per S4),
  panel (loops lane, steerKind badges, passiveOverlays badges, supplyChain collapse).
- **Verify**: sideload via launcher `settings.json` jvmArguments `-ea` (per project
  memory); load a Lane-1 guide JSON; confirm RECURRING chip re-arms and lifecycleState
  survives relog; main index unaffected by bg completion. Overlay-only rendering — no
  input injection (project hard rules).

### Lane 5 — content (after 2+3 stabilize the schema)
- **Files**: steps.jsonl (full bg bank per S9, `known_drops` on slayer rows, steer_id
  backfill); steer_points.jsonl (diary tiers ×15 areas, combat-spine, supply-infra
  catalog); coarse_expansions.jsonl (S10 order); optional items.jsonl (labels).
- **Verify**: jsonl lint (0 malformed); every `steer_id`/`supply_chain`/`coarse_unwind`
  FK resolves; zero numeric rates without a source annotation (grep for bare numbers in
  produces — must be sourced or `"??"`).

### Lane 6 — runtime JIT + calibration (last)
- **Files**: plugin (ItemManager bank-stock reads feeding `supply_threshold_jit`
  escalation; kitten escalation policy per S9); tuning.js/enrich TUNING (replace
  DEFAULT_STEP_MIN with measured median; fill `est_minutes` from session telemetry);
  courier cadence measured live.
- **Verify**: low prayer-pot stock triggers a JIT herb-run chip ahead of cadence;
  cadence chips land within one break-window of real timer readiness.

---

## 5. WORKED EXAMPLE — fresh account → ★ Ardougne Easy Diary (all four facets)

Queued goal: `barrows` with `steer_points: ["steer-graceful", "steer-ardougne-easy-diary"]`.
Trace shown up to the first hard steer anchor (weight 1.0). Placeholders marked.

**P1 burndown** — `steer-ardougne-easy-diary.unlock_condition` names quests
{clock-tower, biohazard} + skills {fishing 15, cooking 15, thieving 5 (cake-stall task)}.
`resolveQuest(quest-biohazard)` → `resolveQuest(quest-plague-city)` → item roots, all
gathered/produced, never GE:
```
resolveItem(bucket_of_milk)   → gather: milk a dairy cow (Lumbridge)          rate n/a
resolveItem(chocolate_dust)   → produce: grind chocolate bar (knife)
  └─ resolveItem(chocolate_bar) → gather: food-shop NPC vendor, coins from combat drops
                                  (vendor id "??" — verify non-GE source)
resolveItem(snape_grass)      → gather: Mudskipper Point spawns (qty 2)
resolveItem(dwellberries)     → gather: McGrubor's Wood bush
resolveItem(rope)             → produce: 4 balls of wool → Ned (Draynor)
  └─ resolveItem(ball_of_wool) → gather: shear sheep → spin at Lumbridge wheel
```
Bootstrap rule visible: wool gather (`tag:bootstrap` grant) topo-orders before Ned's
rope produce step. demandSet = {these gather/produce steps + fishing-15 + thieving-5}.

**P3 greedy + defer (sequencer)** — `train-fishing-15` emits (breakpoint the diary
needs); `train-fishing-62` carries `deferred_until: ["barrows"]`… barrows IS queued, so
S8's soft trigger would release it — but its cost keeps it behind diary-critical steps;
when the later barrows leg demands `food_monkfish`, demandSet hard-confirms it. Thieving
trained to exactly 5, nothing more. Combat 40/40 breakpoint steps emit for survivability;
40→60 held (`deferred_until` unsatisfied until the barrows combat leg).

**P4 weaveOverlays (background)** — at the first break anchor (banking in Draynor during
the wool/rope leg), `bg-farm-allotment` is eligible (Farming 1): inject
`BG-SETUP "Plant potato allotment" (_anchor: gather-wool, _side: after)`; lifecycle
idle→seeds_planted; `fire_at = cumsum(est_minutes) + cadence_min` (cadence PLACEHOLDER
in tuning). Chips then fire at each break nearest their wall-clock due time — one lands
on the Ardougne teleport-less walk break before the quest batch. Passive
`embed-bury-bones` annotates the combat-40 steps (zero-time Prayer XP badge).

**P6 hub_batches (sequencer)** — `hub: "ardougne"` on quest-plague-city, quest-biohazard,
quest-clock-tower clusters them contiguously at Plague City's position; P7 topo keeps
Plague City → Biohazard dep order inside the cluster. One trip west, three quests.

**P10 steer phasing (steer)** — `merged_anchors` puts steer-graceful (0.85) before
steer-ardougne-easy-diary (1.0) — Graceful's run-energy retention feeds the diary's
run-heavy task cluster. Phases emitted (all via `phase_name()`):
```
Toward Graceful outfit        agility 40→60 + marks (produces: mark_of_grace "??")   ★ closes
Toward Ardougne Easy Diary    gather roots (milk/choc/snape/dwellberries/wool→rope)
                              [bg chip] check allotment            ← cadence fire
                              fishing→15 · thieving→5 · cooking→15
                              [alternation card]                   ← 3 same-region actives
                              Plague City → Biohazard → Clock Tower   (hub batch)
                              diary task run (cake stall, essence teleport, …)
                              ★ Ardougne Easy Diary                ← steer card
```
The ★ card: `steerKind: "progress_metric"`, completion via existing **VARBIT** condition
(diary-complete varbit id `"??"` until sourced; MANUAL fallback meanwhile), detail =
`downstream_acceleration` ("Cloak 1 teleport… stacks with Graceful"). From here the
barrows leg inherits the cloak + Graceful + a running allotment loop that upgrades to
`bg-herb-run` at Farming 32 — feeding the prayer-pot chain Lane 2 resolved.

All four facets cooperated: burndown (Plague City items → gathered roots, bootstrap
wool-before-rope), sequencer (hub batch, fishing/thieving breakpoints + deferral,
alternation), background (allotment loop on cadence with lifecycle), steer (diary as the
1.0 anchor collapsing the phase). No rate was invented: mark/vendor/varbit unknowns are
`"??"`; cadence and step-time defaults are named tuning placeholders.
