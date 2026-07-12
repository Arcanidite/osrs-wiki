# MATERIALIZATION — requisite graph → the played checklist

How the burndown DAG becomes the single ordered checklist a player actually plays,
from STEP 0 (character creation) to endgame. Extends SYNTHESIS.md (pipeline P0–P11)
and GRANULARITY.md (§1–7b); every field referenced here already exists or is declared
additive-nullable there. Hard rules unchanged: no fabricated rates (`"??"` / named
PLACEHOLDER tuning only), gather/produce never GE, unified progression, overlay-only
plugin (no input injection).

Inputs consumed by this design: SYNTHESIS §2 pass contract, GRANULARITY §7/§7b
(action grain, equal-grade, cache-ids, capture hierarchy), EXTRAPOLATION §1 (the
145-item overarching checklist), the `origin:tutorial:01–24` + `origin:mainland:01–09`
contrib rows (STEP 0 seed), SME_NOTES §15 (capture harness P5 state).

---

## 1. THE MODEL — two layers, one linearization

A materialized checklist is **one total order chosen from a partial order, plus
recurrences woven into it at wall-clock anchors**. Keep the two layers distinct;
they have different correctness rules and different owners.

### 1a. Layer 1 — DAG edges (hard requisite gating; violating one breaks the game)

| edge type | carried by | enforced at |
|---|---|---|
| skill gate | `reqs.skills` (monotone gte) | greedy eligibility (P3) + `topo_order` (P7) |
| quest prereq | goals `reqs.quests` → `resolveQuest` (P1); `location.quest_gate`; quest tags | burndown injection (P1) + topo (P7) |
| item consumption | `consumes`/`produces` → executions math + tag-bridge (S6) | burndown (P1) + `insert_supply_steps` (P8) — item counts never enter greedy state |
| tag grant (bootstrap-before-loop, supply-terminal) | `grants tag:*` / `reqs.tags` | topo (P7) — structural, no positional hacks (S7) |
| constraints | `region_order`, `inv_free` | greedy `constraintsOk` |

These are the **partial order**. Any linearization that respects every edge is
*correct*; almost all of them are *bad*. Topo (P7) is the guard, never the chooser.

### 1b. Layer 2 — NON-DAG interleave (occurrences in time, not edges)

| pattern | carried by | placed by |
|---|---|---|
| background loops (farm/herb/birdhouse) | `slot.type=="background"`, `cadence_min`, lifecycle | `weaveOverlays` (P4) at the break anchor nearest wall-clock due time; re-pinned via `_anchor`/`_side` (P9); RECURRING in the plugin — never advances the main index (S4) |
| passive embeds (bury bones, alch-while) | `slot.type=="passive"`, `embeds_into` | resolved to `passiveOverlays` labels on the HOST step — never a card of their own |
| alternation (monotony break) | `slot.type=="alternation"` | alternation card over ≥3 same-region actives (Lane 3); honors the round-robin ~1hr-block philosophy |
| JIT supply | `timing:"jit"` | co-located immediately before earliest consumer (P8); `ahead-of-time` bubbles early |

Occurrences carry no ordering authority over the spine: a woven chip may never
reorder DAG steps (P9 re-pins overlays to their possibly-moved anchor, not the
reverse). Their own `reqs` are eligibility guards for the weave, nothing more.

### 1c. The chooser — speedrun / hyper-efficiency cost model

Objective: **minimize cumulative wall-clock to close all queued goals**, where
wall-clock is `est_minutes` cumsum with null → `DEFAULT_STEP_MIN` (tuning.js,
PLACEHOLDER 30 — calibrated in Lane 6, never estimated prose). The current ladder
in `greedy.js costFor` is the ordinal skeleton of this model:

```
_supply                     0.0001   hard requisite, always first when useful
quest with reward XP        0.001    quest XP banks before any grind (questXpUseful
                                     prunes training bands the XP covers — ba2ce570)
_steerPoint w ≥ 0.8         ×0.5     compounding unlock discount (SYNTHESIS P3)
style costs (efficient/afk/gp)  1/xpSum · inv_used · money-tag
```

The ladder is deliberately **ordinal, not cardinal**, wherever minutes are
unmeasured: we rank (supply < quest-XP < steered < plain train) rather than invent
a number. Cardinal wall-clock value only enters where `est_minutes` is sourced —
that is the M2 lane below, and it degrades to the ordinal ladder when null.

**What gets pulled forward** — anything whose unlock *compounds* (pays a dividend
on every subsequent minute):

- **Teleports / access** (home tele is free from minute 0; Ardougne cloak, fairy
  rings): every future traversal is cheaper. Steer `anchor_weight` is the knob.
- **Graceful / run infrastructure**: run energy retention discounts every walking
  minute afterward — hence steer-graceful (0.85) lands before the diary (1.0) in
  the SYNTHESIS §5 trace.
- **Quest reward XP**: a lump that deletes whole training bands (the planner
  credits it; covered bands lose usefulness and drop out).
- **Supply loop *setups***: a RECURRING loop planted at time `t` yields
  `floor((T−t)/cadence)` harvests by time `T` — earliest eligible planting strictly
  dominates. This is why `bg-farm-allotment` setup goes at the FIRST break anchor
  it is eligible for, not when its output is first demanded.

**What defers** — anything that compounds nothing before it is needed:

- `deferred_until` holds (40→60 combat until a goal or demandSet releases it — S8:
  hard requisites beat soft deferrals).
- progress_metric steer points with `anchor_weight < 0.5` (panel-only, never steps).
- `branch{optional:true}` enrichment; pets (`anchor_weight: 0.0`).
- Training past the next breakpoint any queued gate needs (thieving to exactly 5
  in the §5 trace, nothing more).

**Tie-breaks** — a deterministic ladder so plans are regression-diffable
(Lane 1's byte-identical verify depends on it). When two eligible steps tie:

1. `env.demandSet` membership (hard requisite) wins;
2. `costFor` ladder above;
3. hub co-location (P6 clusters at earliest member; checkpoint contiguity per
   228afa99 keeps expansion atoms adjacent);
4. stable authored order (registry `steps[]` / steps.jsonl file order).

No randomness anywhere. Same inputs ⇒ same checklist, always.

### 1d. STEP 0 — the origin:* seed (character creation → first mainland hour)

The chain now starts before the first steps.jsonl row: the 33 `origin:*` contrib
rows are the grounded seed for the earliest checklist segment.

- **Tutorial Island is pure DAG** — the instructor sequence is fixed by the island;
  zero routing freedom, so it materializes verbatim as an ordered expansion
  (`coarse_id: origin-tutorial`, one row per contrib key for ref lineage, atoms
  from the contrib `atoms[]`). Character creation happens live in the starting
  house (origin:tutorial:01) and is free to redo later — the efficient line spends
  zero time on it. The **one lasting choice** is the Gielinor Guide experience
  answer (02 ↔ 23: Adventure Paths + mainland spawn) — modeled as a `claim` atom
  with a `dialogue` hint, not a branch (both answers complete the row).
- **Settings/controls rows (04–06)** are `toggle` atoms with `toggle-state` /
  `dialogue` hints (spacebar-continue, number-key options — the only wiki-grounded
  speedrun technique on the island per the 03 disclosure row; everything beyond
  stays `"??"`, honestly).
- **Mainland arrival (origin:mainland:01–09)**: exit via Lumbridge Home Teleport
  (no level, no runes, ~30 min cooldown); travel budget is *walking only* for the
  first hour (07) — the cost model must price early steps with zero teleport
  vocabulary. The one shop gate is the Lumbridge General Store spade (02, named
  vendor, non-GE). Opener ordering (08, own-synthesis, grounded per-quest
  startmap): castle-local pair (Cook's Assistant + Sheep Shearer) → Restless Ghost
  → X Marks the Spot's Draynor leg folding into the westward walk — feeding
  EXTRAPOLATION §1 items 1–10 without a discontinuity.
- The 09 row's gap flag (no Xerxes/DunkingOreos notes) stays attached as a step
  note: the ordering is wiki-grounded but community-override-eligible.

From this seed the materialized checklist is CONTIGUOUS: origin-tutorial atoms →
origin-mainland first hour → EXTRAPOLATION Bootstrap phase (ctr-01 chickens…) with
no gap and no overlap (origin:mainland:03 Cook's Assistant IS EXTRAPOLATION item 3
— the origin row enriches the existing step id, never duplicates it).

---

## 2. GATING SEMANTICS — locked / available / done

One stored state (the check), three derived render states. Derivation lives in
**GuideStore only** (single authority); WebFragments, PanelOverlay, and overlays
all render from it.

### 2a. Derivation

```
done      = checkState (user tick, or auto-fire: step's completion conditions all
            met per ConditionEvaluator — existing advance behavior, unchanged)
available = not done AND every hard requisite (§1a edge into this step) satisfied
            by the current requisite-state snapshot
locked    = not done AND ≥1 unmet hard requisite
```

Additive shape: PlanRow gains nullable `gate: {state: "locked"|"available",
unmet: ["thieving ≥ 38", "quest-priest-in-peril", …]}` — null means "no gating
data" and renders exactly as today (zero churn for existing guides).

### 2b. Requisite-state sources

| client | source | mechanism |
|---|---|---|
| connected | varbits (quest/diary state), SKILL (CharacterSnapshot), ITEM_HELD, REGION | existing `ConditionEvaluator` → `liveConditionsFor`; the connected/offline badge already renders in the web view |
| offline / web-only | manual toggles | the same requisites render as tickable assumptions ("I have Thieving 38"), persisted with the plan state |

Reconnection rule: live values WIN for display; manual assumptions are kept, and a
disagreement renders as a visible discrepancy chip — never silently overwritten in
either direction. Varbit ids still unsourced stay `"??"` → that requisite degrades
to MANUAL (same honesty bar as synthCoarse).

### 2c. Invariants preserved

- **Equal-grade rule (GRANULARITY §7)** — locked/available/done are *render states
  of equal-rank items*, never a classing. A locked item renders at the same rank,
  dimmed, with a "needs: {first unmet}" chip. It is never hidden, never indented,
  never made a child. `PHASE:`/`CHKPT:` remain labels only.
- **Two-way check state unchanged** — markDone/uncheck (`back`) keep working both
  directions. Unchecking never cascades (user authority). A **locked item CAN be
  manually checked**: the gate is advisory display, not enforcement — the account
  may hold out-of-band progress the model can't see. Checking a locked item logs
  nothing and blocks nothing.
- **RECURRING steps** never enter done via the main index (S4): their "done" is a
  banked-stock threshold (`until.item`), rendered as the loop's stock chip.

---

## 3. INCREMENTS — three lanes, sequenced after SYNTHESIS Lanes 3/4

Lane 3 (sequencer: greedy.js/overlay.js/enrich hub+alternation) and Lane 4
(plugin: GuideStep/ConditionType/panel) are in flight. The lanes below either
touch disjoint files or are explicitly sequenced AFTER the conflicting lane lands.

### Lane M1 — origin materialization (STEP 0 content; no code, no conflicts)
- **Files**: `assets/data/tools/steps.jsonl` (append `origin-tutorial-01..24` +
  `origin-mainland-01..09` rows: one row per contrib key, `atom{}` from `atoms[]`,
  `refs[]` copied from contrib `refs[]` — pass-through already shipped 79b46062;
  ids `ori-t-NN-<verb>-<slug>` / `ori-m-NN-…` per U10);
  `assets/data/tools/coarse_expansions.jsonl` (+`origin-tutorial`,
  `origin-mainland-hour1` registries with `checkpoints[]`).
- **Mapping rule**: contrib rows are study-shaped (`key/refs/atoms/notes`), NOT
  step-shaped — the mapping is explicit: atoms[] → `atom{}` + detail; notes →
  detail tail; refs → refs[]; quest openers that already exist as steps
  (quest-cooks-assistant …) get *enriched*, never duplicated.
- **Verify**: jsonl lint (atom.verb ∈ §1b enum, hints type ∈ §4 enum); every
  `refs[].slug` resolves in `tools/wiki-kb/manifest.jsonl`; `plan.mjs` from an
  empty profile emits origin rows first and contiguously; existing routes with
  tutorial-complete profiles byte-identical (regression diff).

### Lane M2 — linearizer cost model v2 (wall-clock value; after Lane 3's greedy edits)
- **Files**: `assets/js/router/planner/tuning.js` (named constants only:
  `STEER_COST_DISCOUNT = 0.5` lifted from the P3 contract, `SUPPLY_COST`,
  `QUEST_XP_COST` — moving the magic numbers out of costFor; any new weight is a
  PLACEHOLDER const with a calibration comment); `greedy.js` (`costFor` reads
  tuning; adds est_minutes-aware cardinal cost ONLY when minutes are sourced,
  ordinal ladder otherwise); `tools/guide-export/enrich.py` (TUNING mirror).
- **Verify**: corpus regression — `plan-corpus.mjs` + `plan.mjs` output diff
  against golden fixtures before/after (order changes must be explainable by a
  named constant, cited in the commit); grep guard: no bare numeric weight
  outside tuning.js.

### Lane M3 — gating state surface (after Lane 4 lands; same plugin files)
- **Files**: `runelite-guide-chain` `GuideStore.java` (gate derivation from step
  reqs + live conditions; manual requisite toggles + persistence when offline),
  `PlanRow.java` (+`gate`), `WebFragments.java` (locked render + needs-chip +
  discrepancy chip), `PanelOverlay.java` (dimmed row + chip).
- **Verify**: standalone `GuideWebMain` fixture — a step with an unmet SKILL
  renders locked with the chip; manually checking a locked step works and
  persists; disconnect → manual toggles appear; reconnect with a disagreeing live
  value → discrepancy chip, no silent overwrite; uncheck (back) leaves downstream
  check states untouched. Sideload check per Lane 4's `-ea` recipe.

Lane F1 (frames gallery) is named and specified in `FRAMES_GALLERY.md`.
