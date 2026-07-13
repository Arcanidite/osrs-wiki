# OPPORTUNISTIC_GRANULARITY — Faux-grain unwinding + lookahead weaving (design + fan-out)

Serves the directive: route-grand (character creation → endgame) must read like
"Guide:Leagues: Faux starting guide" (action-narration grain) and
"Guide:Ironman Multiquest" (interleave + while-here opportunism). Two levers:
(A) GRANULARIZE every generalized step into atom{}-grain sequences;
(B) OPPORTUNISTIC LOOKAHEAD — source downstream requisites at the earliest
already-in-position route moment, never a dedicated detour later.

Extends (never reinvents): `granularity/GRANULARITY.md` (atom{}/hints[]/
checkpoints[]/branch{}, U1–U10, §7 action grain, §7b cache-id binding) and
`SYNTHESIS.md` (requisite-burndown, P0–P11 pipeline, overlay weaving,
insert_supply_steps). A concurrent ROADMAP.md owns the broad roadmap; this doc
owns only the concrete granular + opportunistic design and its fan-out.

Structure extracted from the exemplars, never their prose (own-words hard rule).
What the exemplars prove, in our vocabulary:
- Faux: one bullet = one atom (interaction / exact-count / until-loop / toggle /
  bank loadout) — exactly GRANULARITY's "Faux grain"; counts are exact or
  threshold ("14+"); sell/buy batching and keep-drop policy ride as hints.
- Multiquest: quests are PHASE-SPLIT on location boundaries ("progress X until
  you must go to Y"), legs open with a bank loadout that unions requisites for
  every downstream consumer passing through that region, and while-in-position
  actions for LATER quests are woven into the current activity ("during quest A,
  gather item-for-quest-C nearby"). That weave is lever (B).

## 0. Current state (measured 2026-07-12)

- `assets/data/tools/steps.jsonl`: 181 rows; 87 carry atom{}; 125 are `train-*`
  (mostly atomless "Train X N→M" one-liners); 18 `quest-*` (mostly monoliths).
- `route-grand.json` (guide-chain fixture): 205 steps. Already at target grain:
  24 `ori-*` tutorial atoms, `pps-*`/`ctr-*`/`rfd-*` expansions, 11 `chkpt-*`
  headers. Gap: **67 quest monoliths** ("Complete X" one-card), **43 train
  steps** (13 atomless; 30 have a single kill-until atom but no Faux sequence
  around it), travel implicit in prose, `produces{}` does not survive into the
  fixture (opportunism must be resolved in-pipeline, keyed on steps.jsonl ids).
- `enrich.py insert_supply_steps` (P8) is today ANNOTATE-ONLY (`_supply_phase`
  label); positioning comes from burndown injection order + topo. The
  opportunistic placement scan below is the first pass that actually moves
  supply steps — a real extension, not a rename.
- `overlay.js weaveOverlays` (P4) is the single injector: bg setup/chips at
  `isBreak()` anchors, `_anchor`/`_side` pins surviving enrich reorders (P5/P9).
- `burndown.js` resolves goals `reqs.items/quests` → injected supply steps +
  `demandSet`; it KNOWS each producer's consumer at resolve time and currently
  discards that edge. Keeping it is the cheapest new data in this design.

## 1. GRAIN TARGET — before/after per generalized step class

Target grain is GRANULARITY §1a/§7 unchanged: one atom = one interaction /
exact-count / until-loop / toggle / bank-loadout; repetition never unrolled
(U4); dialogue atomic (U5); travel atoms only at zone transitions (U6). All
counts sourced or `"??"`; every atom cites refs[]; ids per U10
(`<prefix>-<NN>-<verb>-<slug>`, `coarse_of` FK).

### 1a. Class TRAIN-BAND (43 route steps; worst offender)

Before (verbatim current row):
```jsonc
{"id": "train-strength-60", "instruction": "Train Strength to 60",
 "detail": "Hill Giants or Flesh Crawlers. Unlocks rune scimitar use.",
 "atom": {"verb": "kill", "target": "moss_giant", "until": {"skill": {"strength": 60}}}}
```
After — a ctr-style sequence (checkpoint per U1, branch per U9); the band
becomes `coarse_of: "train-strength-60"` atoms:
```jsonl
{"id": "tsb-01-withdraw-giant-loadout", "label": "Bank: withdraw Hill Giant loadout", "detail": "Withdraw: brass key (?? — sourcing step if not owned), food ??×, best scimitar equipped.", "kind": "access", "atom": {"verb": "withdraw", "target": "hill-giant-loadout", "count": null, "cmp": "eq", "until": null}, "coarse_of": "train-strength-60", "branch": {"alt_group": "str60-site", "when": {"tags": []}, "optional": false}, "refs": ["??"]}
{"id": "tsb-02-walk-edgeville-dungeon", "label": "Go to Edgeville Dungeon (Hill Giant room)", "detail": "Entrance + room tile ?? from wiki {{Map}}.", "kind": "access", "atom": {"verb": "walk-to", "target": "edgeville_dungeon_hill_giants", "count": null, "cmp": "eq", "until": null}, "coarse_of": "train-strength-60", "branch": {"alt_group": "str60-site", "when": {"tags": []}, "optional": false}}
{"id": "tsb-03-kill-hill-giants", "label": "Kill Hill Giants until Strength 60", "detail": "Bury big bones as they drop; limpwurt roots bank-worthy (payoff: strength potions, ??).", "kind": "train", "atom": {"verb": "kill", "target": "hill_giant", "count": null, "cmp": "eq", "until": {"skill": {"strength": 60}}}, "produces": {"big_bones": "??", "limpwurt_root": "??"}, "coarse_of": "train-strength-60", "hints": [{"type": "keep-drop", "target": null, "value": "keep:big-bones,limpwurt;drop:rest", "note": null}, {"type": "contested-fallback", "target": null, "value": "hop-worlds", "note": null}]}
```
(plus the mirrored `str60-site` alternative: Flesh Crawlers reuse of
`ctr-06-stronghold-crawlers`, per U8 reuse-before-authoring.) Every `"??"` is a
wave-3 wiki task, never a guess. XP columns recomputed from Experience_table.s2
per the [training] gotcha — fixture xp fields are known-bad placeholders.

### 1b. Class QUEST-MONOLITH (67 route steps)

Before: `{"id": "quest-sheep-shearer", "instruction": "Complete Sheep Shearer",
"detail": "... Fastest route is simply buying 20 balls of wool (tradeable) ..."}`
— one card, and its detail even recommends a market buy (gather-not-GE
violation; classify wave flags these as FIX rows).

After — the Multiquest lever: PHASE-SPLIT on location boundaries, one atom per
NPC/state change (U5), pre-reqs expected to be pre-staged by lever (B):
```jsonl
{"id": "qss-01-talk-fred-start", "label": "Talk to Fred the Farmer (start Sheep Shearer)", "kind": "quest", "atom": {"verb": "talk-to", "target": "fred_the_farmer", "count": null, "cmp": "eq", "until": {"state": "quest-varbit:??"}}, "coarse_of": "quest-sheep-shearer", "location": {"region": "misthalin", "zone": "lumbridge-farm", "quest_gate": null, "quest_phase": "sheep-shearer:started"}}
{"id": "qss-02-gather-shear-sheep", "label": "Shear 20 sheep in Fred's pen", "kind": "gather", "atom": {"verb": "gather", "target": "wool", "count": 20, "cmp": "gte", "until": null}, "produces": {"wool": 20}, "coarse_of": "quest-sheep-shearer", "hints": [{"type": "rng-variance", "target": "wool", "value": "??", "note": "Sheep can fail to give wool; keep shearing."}]}
{"id": "qss-03-produce-spin-wool", "label": "Spin 20 wool at the Lumbridge Castle wheel", "kind": "produce", "atom": {"verb": "produce", "target": "ball_of_wool", "count": 20, "cmp": "gte", "until": null}, "consumes": {"wool": 20}, "produces": {"ball_of_wool": 20}, "coarse_of": "quest-sheep-shearer"}
{"id": "qss-04-talk-fred-turnin", "label": "Talk to Fred the Farmer (hand in 20 balls of wool)", "kind": "quest", "atom": {"verb": "talk-to", "target": "fred_the_farmer", "count": null, "cmp": "eq", "until": {"state": "quest-varbit:??"}}, "consumes": {"ball_of_wool": 20}, "coarse_of": "quest-sheep-shearer"}
```
Multi-region quests split into phases keyed on `location.quest_phase`
(existing nullable field — the "progress until you must go to X" boundary),
one checkpoint per region leg (U1). Ground truth per the [quests] gotchas:
main page Details section for reqs/start, /Quick guide Walkthrough
{{Checklist}} for step structure; never the Quick guide Details stub.

### 1c. Class TRAVEL/NAVIGATION (implicit today)

Before: travel hides in prose ("Al Kharid gate toll 10 coins" inside ctr-03).
After (U6 — atoms only at zone transitions, coords from wiki {{Map}} pins):
```jsonl
{"id": "trv-NN-walk-al-kharid-gate", "label": "Go to Al Kharid (through the toll gate)", "kind": "access", "atom": {"verb": "walk-to", "target": "al_kharid_gate", "count": null, "cmp": "eq", "until": null}, "consumes": {"coins": 10}, "hints": [{"type": "teleport-choice", "target": "al-kharid", "value": "walk-gate,lumbridge-tele??", "note": "Toll waived after Prince Ali Rescue."}]}
```
Same-zone movement stays inside the action atom's detail (U6). Both {{Map}}
coordinate formats exist (bare `x,y` and `x:N,y:N` — [faux] gotcha); parsers
and workers must handle both; unpinned tiles are `"??"`, never invented (§7b).

### 1d. Class SUPPLY-GATHER (mostly at grain already)

pps-* rows are the template. Remaining work is U2 threshold-form counts
(`cmp:"gte"` + `until.item`), named non-GE vendors (U3, `links` → NPC page →
Stock section per the [npcs] gotchas), and refs[] backfill. No new grammar.

## 2. OPPORTUNISTIC-LOOKAHEAD MODEL — back-propagation is the heart

Not a forward "while here, maybe grab stuff" heuristic. The principled model is
a demand-driven BACKWARD dataflow over the ordered route:

1. **Horizon demands.** Every downstream stage/milestone on the horizon
   contributes its requisite set — route-node consumes{} pinned at the
   consumer's position, plus queued goals' reqs.items pinned at the horizon.
2. **Backward propagation.** One sweep from the route's end toward Step 0
   carries the live demand set. At each earlier node, if the player is already
   IN-POSITION (zone/hub window; quest-phase v2) and CAPABLE (prefix-accumulated
   skill state) to source a still-unmet downstream requisite, that node is a
   candidate collection point. The last candidate written while walking
   backward is the EARLIEST in route order — collect there and the player
   never re-navigates to somewhere opportunity already existed.
3. **Source resolution.** WHERE a requisite is collectable comes from the wiki
   (wikicli, cached) consolidated into our data: steps.jsonl produces/consumes
   edges, contrib.jsonl item-source rows, quest_db-style research. Gather/
   produce, never GE. Unknown source/zone/qty = `"??"` → an honest "no-window"
   verdict, never a guessed weave.

This is the Multiquest structural pattern ("during quest A, gather what quest C
needs — it's right there") generalized over the burndown demand graph. Split of
labor: **back-prop decides WHERE; the existing weaver inserts.** It extends —
never reinvents — burndown.js (produces/consumes edges, supply resolution,
demandSet), overlay.js (break-anchored weaving contract), and enrich.py
insert_supply_steps (the insertion pass).

### 2-proof. LANDED + RUN-PROVEN: `assets/js/router/planner/backprop.js`

The propagation engine is implemented (buildSourceIndex / collectDemands /
accumulateSkills / backpropCollectionPlan — one backward sweep, verdicts
`earliest-window | already-earliest | no-window` + a free `sourceAfterConsumer`
route-fault flag). Spike: `tools/guide-export/spikes/backprop-spike.mjs` joins
route-grand's 205 ordered ids with the steps.jsonl bank and the barrows goal,
then runs the sweep. Actual captured output (2026-07-12, exit 0):

```
route-grand: 205 steps | demands: 15 | sources indexed: 17 items
pineapple        needed by [30] setup-ultracompost
  already-earliest (source at [29] is the window)
volcanic_ash     needed by [30] setup-ultracompost
  no-window  !! source scheduled AFTER consumer
ranarr_seed      needed by [163] farm-ranarr-patch
  no-window  !! source scheduled AFTER consumer
snape_grass      needed by [195] brew-prayer-potion
  already-earliest (source at [34] is the window)
coins            needed by [198] ctr-03-buy-scimitar
  already-earliest (source at [53] is the window)
food_monkfish    needed by horizon barrows
  earliest-window -> collect at [149] train-cooking-74 (source now at [173])
```

Read of the proof: the engine back-propagated the barrows horizon demand
`food_monkfish` to node [149] (`train-cooking-74`, already in-position at the
Catherby range with Cooking capability accumulated) — 24 route positions
earlier than today's dedicated source at [173]. It also surfaced four REAL
route-order faults (`ranarr_seed` sourced at [170] AFTER its consumer at
[163]; same shape for volcanic_ash/raw_monkfish/coins) and honestly returned
`no-window` for zone-less or unsourced items — exactly the wave-1/wave-3 data
gaps the fan-out fills. `npm test`: 86/86 green, zero baseline shifts (new
module is not yet wired into any pass; the spike is analysis-only).

### 2a. Data (all additive-nullable)

1. **`_payoff` — KEEP the demand edge burndown already computes.**
   `burndown.js resolveStepDeps/resolveChain/burndownResolve` learn, for every
   injected supply step, which step/goal consumes its output — and drop it.
   Change (~10 lines): stamp `_payoff: {consumer: "<step-id>", goal:
   "<goal-id>", item: "<slug>"}` on each injected supply step alongside the
   existing `_supply`/`_supply_chain` annotations.
2. **`opp{}` on steps.jsonl (authored, nullable) — the in-position trigger.**
   ```jsonc
   "opp": {
     "zones": ["lumbridge", "lumbridge-farm"],   // where this action is executable
     "hubs": [],                                  // OR hub-level match (P6 vocabulary)
     "quest_phase": null,                         // v2: fire during a quest leg ("during A, do R")
     "min_skills": {}                             // capability floor beyond reqs (usually empty)
   }
   ```
   Default when absent: derived from the row's own `location.zone`/`hub` — so
   most gather rows need NO authoring. Authored `opp{}` is only for actions
   executable somewhere OTHER than their home zone, or quest-phase-window
   sources (v2). Trigger predicate = zone/hub intersection with the route
   node's location, AND `ready()` (skills/tags accumulated at that node).
3. **Emitted render fields** (fixture, additive, unknown-field-safe):
   `"paysOff": {"at": "<consumer label or milestone>", "item": "<slug>"}` on
   the woven step; Java `GuideStep` gains `public GuidePayoff paysOff;`
   (`String at; String item;`). Skippable-pair plumbing reuses `branch{}` §3c —
   nothing new in the plugin beyond one field.

### 2b. Algorithm — wire backprop plans into two existing seams, no new pass

The sweep itself is landed (§2-proof). What remains is INSERTION, and it reuses
the existing machinery verbatim:

**Extend P8 (`enrich.py insert_supply_steps`) to consume backprop plans** —
P8 is today annotate-only, so this is the pass's first real move. Port of the
same sweep (or a JS pre-pass whose plans ride the export JSON):
```
plans = backpropCollectionPlan(ordered, collectDemands(ordered, goals),
                               buildSourceIndex(bank), accumulateSkills(ordered))
for each plan with verdict "earliest-window":
    S = the plan's source step (viaSource), N = ordered[plan.collectAtIdx]
    detach S; re-pin with _anchor: N.id, _side: "after",
    _opportunistic: true          # same detach/reattach contract as P5/P9
    emit fallback stub S' co-located JIT before the consumer:
        branch: {alt_group: "opp-<item>-<consumer>", optional: true}
        same ITEM_HELD condition as S  → auto-satisfies if S was done
"already-earliest" / "no-window" plans: leave S exactly where today's
behavior puts it (byte-identical fallback). sourceAfterConsumer flags are
lint output — a route fault to fix in data, never silently reordered.
Then re-run topo_order over the result (the same reorder-guard trick
hub_batches already relies on — P7 is the dependency guard).
```
The opp node and its fallback stub share an `alt_group` (GRANULARITY §3c);
the opp node is listed first (preference), the stub is `optional: true` so
skipping the opportunity never blocks the chain — the ITEM_HELD condition on
the stub self-completes when the early gather happened.

**Known gap — P10 `phased_steps` can lose an opp node's positional promise**
(task #8 spike, route-grand): P8 re-pins a node at its `collectAtIdx` in
`ordered_with_overlays`, but P10 (`phased_steps`) runs a SEPARATE from-scratch
re-simulation over that array afterward, grouping steps per-milestone via
`take(quest_first) or take(advances(target)) or take(True)`. An opp node's
`grants` is empty (it's a gather/produce step, not training) so it can never
match `advances()` — it only ever surfaces via the position-blind catch-all,
`next(s for s in remaining if ready(s))`. If ITS OWN `ready()` (skill/tag/
quest/gate) doesn't clear until deep into a LATER milestone's loop, while an
unrelated non-opportunistic step sitting earlier in `remaining` clears sooner,
P10 picks that other step first — silently drifting the opp node away from
the anchor P8 chose, potentially even past its own consumer (a "look — the
`_anchor` didn't crash, the wrong node just won the position" bug, not a
crash). Mitigation landed: `take()` gained an `opp_pred` tier between
`advances()` and the plain catch-all, so a ready opp node always wins over
generic filler — this closes the common case (the node's `ready()` gate
clears around the same time as the steps it would otherwise lose to). It is
NOT a full fix: two-or-more simultaneously-ready opp nodes still tie-break on
plain array order, and an opp node gated on a quest no active milestone's
target needs can still be deferred arbitrarily long. A full fix would need
P10 to track each opp node's intended anchor-adjacency directly (e.g. pull it
immediately once `ready()`, ahead of even `advances()`/`quest_first`, the
instant its anchor is emitted) rather than treating it as one more flavor of
catch-all filler — left as a documented follow-up since it enlarges P10's own
contract, not a `take()`-ordering tweak.

**Extend P4 (`overlay.js weaveOverlays`) — opportunity chips at breaks
(v2, optional).** Recurring/partial sources ("while banking here, also top up
N× X") behave exactly like bg cadence chips: the existing `isBreak()` anchor
walk gains a pending-opportunity check reusing the bgState pattern. v1 ships
the P8 scan only; P4 chips land later with the same `_anchor`/`_side` contract.

**Skip/out-level rule.** An opportunistic node is prunable when (a) a later
step's `produces` covers the same demand in bulk, (b) its branch alternative
auto-completed, or (c) the consumer got removed from the route — the scan
simply never places what has no `_payoff`. Mirror of U9; the stub's
`optional: true` carries the never-blocks guarantee.

### 2c. Render — how it reads

Checklist line stays an ordinary equal-grade atom (§7 equal-grade rule):
`Milk the dairy cow (1× bucket of milk)` with a breadcrumb chip
`↷ pays off at: Plague City` (from `paysOff`), and the detail carries an
own-words note ("you are already at the Lumbridge cattle field for Strength
training; this saves a return trip"). Fallback stub renders as
`Skip if already gathered: bucket of milk` inside the consumer's leg. Web view:
small breadcrumb badge; plugin: chip under the card, overlay-only.

**Worked example (grounded in SYNTHESIS §5's own resolution).** Goal chain
demands `bucket_of_milk` for Plague City (consumer: `quest-plague-city`, leg in
Ardougne). The route passes `ctr-02-kill-cows` (east Lumbridge cattle field —
dairy cows in the same pen, tile `"??"`). Scan finds N = ctr-02 long before the
Ardougne leg → weave `gather-milk-cow` after ctr-02 with
`paysOff: {at: "Plague City", item: "bucket_of_milk"}`, plus an optional stub
before the Plague City checkpoint. One bucket carried or banked — the
banking hint follows U1's next checkpoint boundary.

## 3. INVARIANTS (restated + specific)

1. **Wiki = single source of truth** via `tools/wiki-kb/wikicli` (cached
   MediaWiki API); never HTML scraping; every atom/opp row cites refs[] whose
   slugs exist in manifest.jsonl (title-redirect + `.sN` traps per gotchas.log).
2. **Own words only** — structure/model extracted from exemplars; never copied
   prose or game dialogue.
3. **Gather/produce, never GE** — opportunistic sources are gather/produce/
   named non-GE vendor only; classify flags existing GE-shaped details as FIX.
4. **Unified progression** — no F2P/P2P split.
5. **Overlay/highlight only** — narration grain never becomes input automation
   (§7's rule: the USER performs every input).
6. **No fabricated coords/rates/quantities** — `"??"` or a named tuning
   placeholder; §7b source-of-truth order (wiki → cache-id → simulated capture).
7. **Opportunistic weaving never breaks topo/requisite gating** — placement
   gated by `ready()` at N, never past the consumer, post-scan `topo_order`
   re-run is the guard; burndown demandSet semantics (S8) unchanged.
8. **Always skippable** — every opp node pairs with an `optional: true`
   ITEM_HELD fallback stub via `branch{}`; skipping degrades to today's
   dedicated-supply behavior, never a broken chain.
9. **Additive-nullable schema only** — `opp{}`, `_payoff`, `paysOff` follow the
   SYNTHESIS §1 rule: every existing row/fixture stays valid untouched.
10. **Baseline re-pins are intentional acts** — `npm test` planner suite stays
    green; route-grand diffs reviewed, noted in the commit.

## 4. FAN-OUT PLAN (classify-first, cordoned bursts)

Discipline per CLAUDE.md: Bash write-only for subagents (`cmd > out 2>&1`,
Read back); self-contained briefs; agents read gotchas.log + existing contrib
keys BEFORE starting, append their own after; one-line receipts, data in
ledgers; short synchronous bursts. Tier map: haiku probes (~2.2k-token
directives), sonnet workers, fable consolidation. Task manifest:
`tools/guide-export/design/opportunistic_tasks.jsonl` (one row per micro-agent).

### Wave 1 — CLASSIFY (6 haiku probes, parallel, no deep dives, no new fetches)
- `og-c1..c4`: route-grand steps sliced by index — [1..52] (`milestone-goal-
  early-game`..`quest-a-souls-bane`), [53..104] (`quest-death-plateau`..
  `rfd-intro`), [105..156] (`quest-fishing-contest`..`quest-the-giant-dwarf`),
  [157..205] (`quest-the-hand-in-the-sand`..`milestone-raids-cox`). Per step:
  `{step_id, grain_class: atomic|train-band|quest-monolith|travel-implicit|
  supply-ok|header, unwind_rules: [U-refs], ge_violation: bool, has_refs: bool}`.
- `og-c5` opportunity surface: grep-only over steps.jsonl produces/consumes +
  goals reqs.items + supply_chains — rows `{item, consumers[], source_step?,
  source_zone?}` with `"??"` where unsourced.
- `og-c6` exemplar patterns: mine the two CACHED exemplar blobs for
  opportunistic-structure instances (during-X-do-Y / buy-batch-for-later /
  pickup-en-route), own-words rows keyed `oppgran:pattern:<n>`.

### Wave 2 — PRIORITIZE (1 sonnet)
Consume wave-1 rows; cross-diff against existing contrib keys (`questdb:*`,
`quests:*`, steps.jsonl ids — the [prioritize]/[enqueue3] duplicate-work
gotchas); emit ranked depth queue `oppgran:depth:NN` (earliest route segments
first — grain quality compounds downstream), each bundle ≤12 step ids, and an
opportunity shortlist (items with a real in-position window before consumer).

### Wave 3 — GENERATE (sonnet workers, cordoned; scope = explicit id lists)
- G-track (`og-g1..g6` quest bundles in route order, `og-g7..g9` train bundles,
  `og-g10` travel pass): atomize per §1 recipes; contribute rows keyed
  `oppgran:atoms:<step_id>` (never edit steps.jsonl directly — consolidation
  applies); wikicli fetches per the [quests]/[training] gotcha playbook.
- O-track (`og-o1..o2`): ground the opportunity shortlist — source zone/tile/
  vendor/quantity via wikicli; rows keyed `oppgran:opp:<item>@<zone>` with
  `{item, source_step|PROPOSED-ID, trigger: {zones/hubs}, payoff_consumer, refs}`.

### Wave 4 — CONSOLIDATE + WEAVE (sonnet builders, fable review)
- `og-w1` data consolidation: apply contributions → steps.jsonl +
  coarse_expansions.jsonl; lint (atom.verb ∈ §1b enum, hints.type ∈ §4 enum,
  checkpoint starts resolve, refs-vs-manifest slug check, bare-number grep).
- `og-w2` code: burndown `_payoff` stamp + wire the LANDED backprop.js plans
  (§2-proof) into enrich P8 (placement + fallback stubs) + `paysOff` emit +
  GuideStep field; planner suite green. Wave 1/3 feed the engine directly:
  og-c5's demand/source rows and og-o1/o2's grounded triggers become
  buildSourceIndex input (opp{} zones/hubs/min_skills), turning today's
  honest no-window verdicts into real earliest-window weaves.
- `og-w3` verify: re-export route-grand; diff vs baseline; every moved supply
  step justified by a `_payoff`+window pair; re-pin baselines intentionally.

Ledger keys are idempotent on `key` in contrib.jsonl (`wikicli contribute`);
queue discipline add/claim/done on `oppgran:*` keys. Left/right scope bounds
per agent live in the manifest rows — no agent hunts for its slice.

## 5. Verification gates

- Wave-1 output is exhaustive: 205 classify rows, zero deep dives, zero new
  API fetches (exemplar blobs + steps.jsonl are on disk).
- Wave-3 atoms: every count sourced-or-`"??"`; every refs[] slug greps in
  manifest.jsonl; no wiki prose copied (spot-check against blobs).
- Wave-4: `npm test` green; `plan-multi.mjs | enrich.py` emits valid JSON;
  opportunistic nodes each have `_payoff` + in-window anchor + optional stub;
  topo re-run clean; route-grand baseline diff reviewed and re-pinned as an
  intentional act.
