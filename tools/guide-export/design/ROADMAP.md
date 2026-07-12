# ROADMAP — meta-orchestrator synthesis (2026-07-12)

One prioritized forward plan for the guide-chain ensemble, weighed against the full
directive corpus (hard rules, content model, granularity, structured-everything,
speedrun/efficiency, backend/plugins, SME/capture, fan-out discipline). Sources:
the six design docs under `tools/guide-export/design/`, the landed pipeline/data,
the plugin repo at `/home/lemon/runelite-guide-chain`, and the wiki-kb ledgers.
Verified against the working tree, not memory; `npm test` = 86/86 green at write time.

---

## 1. State of the ensemble

**Planner** (`assets/js/router/planner/{greedy,burndown,overlay,tuning}.js`, 1,047
lines). Done: SYNTHESIS Lanes 1–3 shipped — burndown supply resolution with
tag-bridge (S6), bank-split + weaveOverlays, steer phasing, defer/hub/passive/
alternation, quests-first-class (reward XP prunes covered training bands, ba2ce570),
M2 cost-model v2 constants named in `tuning.js`. Stubbed: `COST_MODEL_V2 = false`
(uncalibrated), `est_minutes` null everywhere so all cadence math runs on the
`DEFAULT_STEP_MIN = 30` placeholder (Lane 6 never started).

**Guide-export pipeline** (`tools/guide-export/enrich.py` 1,205 lines + 6
`plan-*.mjs`). Done: full P5–P11 (S7 order in the header comment), coarse-atom
injection with registry-stable checkpoint ids, universal refs/markers fill via
`step_refs.jsonl` sidecar, `media[]` pass-through, opt-in `methods[]` attach,
`xp_fold` effective-level parity with the router. Stubbed: NO loader exists yet for
`quest_expansions.jsonl` / `steps_quest_atoms.jsonl` (NORMALIZATION W0's quest-route
hookup) — the quest-sub-checklist path through enrich is designed, not built.

**Web view + plugin render** (`runelite-guide-chain/src/main/java/.../web/
WebFragments.java` 1,117 lines; `data/GuideStep.java` with hints/checkpoint/refs/
media/slotType/cadence/lifecycle/passiveOverlays/supplyChain/steerKind/methods).
Done: structured `referenceCard` (summary + typed fact blocks + `req_items`,
prose-notes fallback only), `appendMethodPicker` (1:many method rows supersede
prose detail), checkpoint dividers, frames gallery pane + media lightbox outside
the htmx swap zones, wiki-chip lightbox, two-way checklist, 5 fixture chains incl.
the route-grand Step-0→Endgame flagship (205 steps). Stubbed: MATERIALIZATION Lane
M3 gating — `store/PlanRow.java` has no `gate` field, no locked/available/done
derivation, no needs-chips, no offline manual-assumption toggles; step *detail*
panes still show `reqs` as cond-badges, not REQUISITES/REWARDS/START blocks
(NORMALIZATION §3d item 2 is only done for reference cards).

**wiki-kb + wikicli** (`tools/wiki-kb/`). Done: cached MediaWiki CLI with `--strip`
+ NOISEBENCH, ~1,550-blob manifest, idempotent `contrib.jsonl` (411 quest, 346
card-facts, 143 unlock, 125 train-methods, 96 diary, 90 minigame, 9 quest-expansion,
24 origin, …), queue + gotchas/retro logs that measurably transfer lessons between
waves (the [normalize-s]/[normalize-q] trap inheritance is visible in the log).
Stubbed: 79 `lane5:*` queue tickets + 57 contributor FLAGs (wrong quest rewards
incl. Nature Spirit/Swan Song/MM1, `setup-ultracompost` wrong on three axes,
herblore 52→38, unsourced prayer-43 gates) + the `consolidate-xp` pass all deferred.

**Normalization (card-facts + skill-methods + quest atoms)**. Done: track R —
346 card-facts rows contributed, 326/346 catalog rows structured, rendered as typed
blocks (committed, 987471d); track S — 125/125 `methods:train-*` rows → 392
wiki-cited methods in `assets/data/tools/train_methods.jsonl`, attached + rendered
on route-grand (43 steps, e7ee3a4). Stubbed: track Q (quest sub-checklists) is the
open front — 9/188 `questatoms:*` contributions exist (asgarnia bundles, traps
already logged), 0 consolidated, no `consolidate_quest_atoms.py`, no enrich hookup,
no render preference; 54 dispatch-ready briefs sit in
`design/normalization_tasks.jsonl`. Enablement drift: `plan-quests.mjs` and
`plan-corpus.mjs` both set `train_methods: true` but `route-quests.json` was never
regenerated (0 methods) and the regenerated `route-corpus.json` (125 methods) is
uncommitted; `plan-multi.mjs` (route-p2p) has no flag.

**SME capture engine** (`/home/lemon/scenario-capture/`). Done: rev-236 proto-server
+ scenario runner + oracle, in-world renders proven, 18 content-addressed media
dirs, F1 gallery shipped end-to-end (8 route-grand steps carry real frames with
mandatory `state{}` provenance). Stubbed: breadth (8/205 flagship steps have media);
Lane-S world-file injection (`--world world.json`: LOC add, container update,
VARP 56/95, IF_OPENSUB/IF_SETTEXT) designed in BACKEND_REPLAY §3b, not built.

**Backend-replay design** (`design/BACKEND_REPLAY.md` + `tools/overlay-bridge/
PROTOCOL.md` v1). Done: design only — 7 lanes (P protocol v2, A QH-verbatim arrows,
L observation ledger, G guide feed, S replay seam, R reachability gate, O observe
queue), grounded in the proven BF-helper thin-client pattern and the entity-kb key
namespace. Stubbed: all 7 lanes unbuilt; PROTOCOL.md itself is untracked in git.

**Adjacent landed surface**: `tools/quest-order/` + `assets/data/tools/quests.jsonl`
(272 quests, Quest-Helper-mined order + reqs + league regions, honest G-7/G-8
caveats) — player-facing, feeds the reachability gate later; currently untracked.

---

## 2. Gap ledger

| Capability (directive) | Status | Owning file(s) |
|---|---|---|
| Interleaved requisite-burndown (items = produce/consume edges, gather-not-GE) | LANDED | `assets/js/router/planner/burndown.js`, `supply_chains.jsonl` |
| Milestone/steer episodes, no arbitrary level phases | LANDED | `steer_points.jsonl` (18 nodes), `enrich.py phase_name()` |
| Faux-grain atoms / hints / checkpoints / branch | LANDED (grammar + partial content) | `design/granularity/GRANULARITY.md`, `steps.jsonl`, `coarse_expansions.jsonl` (14 rows vs 28 S10 stubs) |
| Step 0 → endgame flagship chain, DAG/non-DAG interleave | LANDED | `plan-grand.mjs`, `fixtures/route-grand.json` (205 steps) |
| Quest details → equal-grade sub-checklists (structured-everything #1) | PARTIAL (9/188 contributed, 0 consolidated, no code path) | `NORMALIZATION.md` track Q, `normalization_tasks.jsonl`, `contrib.jsonl questatoms:*` |
| Skills → 1:many method pickers with wiki breadcrumbs | LANDED data + render; PARTIAL enablement (grand 43 ✓, corpus 125 uncommitted, quests fixture stale, p2p off) | `train_methods.jsonl`, `enrich.py`, `WebFragments.appendMethodPicker` |
| Reference cards → structured objective blocks | LANDED (326/346) | `gen_reference_catalog.py`, `reference/catalog.jsonl`, `ReferenceEntry.java`, `WebFragments.referenceCard` |
| Requisite gating: locked/available/done + needs-chips + manual assumptions | DESIGNED-NOT-BUILT | `MATERIALIZATION.md` §2/Lane M3; `PlanRow.java`, `GuideStore.java` |
| REQUISITES/REWARDS/START blocks on step detail | NOT-STARTED (cards done, steps not) | `NORMALIZATION.md` §3d-2, `WebFragments.java` |
| Speedrun cost model (wall-clock chooser) | PARTIAL (flagged off, uncalibrated) | `tuning.js COST_MODEL_V2`, `greedy.js costFor` |
| est_minutes calibration / measured rates | NOT-STARTED (Lane 6) | `tuning.js`, `enrich.py TUNING` |
| Wiki chip + lightbox on every mention | LANDED (web); plugin panel = thumbnails + refs | `WebFragments.java`, `app.js`, `WikiPageStore.java` |
| Frames as step resources + side gallery/lightbox | LANDED (F1); PARTIAL breadth (8/205) | `FRAMES_GALLERY.md`, `GuideMedia.java`, `MediaStore.java` |
| SME capture "extensively filled" + interface/inventory/varbit replay | PARTIAL engine / DESIGNED-NOT-BUILT Lane S | `/home/lemon/scenario-capture/`, `BACKEND_REPLAY.md` §3b |
| Backend service source-of-truth + protocol v2 (thin plugin) | DESIGNED-NOT-BUILT (v1 proven for BF) | `BACKEND_REPLAY.md` Lane P, `tools/overlay-bridge/PROTOCOL.md` |
| Observation ledger (idempotent, deduped, value-grouped, ordered by cache id) | DESIGNED-NOT-BUILT | `BACKEND_REPLAY.md` §2 (Lane L) |
| QH-verbatim arrow-waypoint rendering | DESIGNED-NOT-BUILT | `BACKEND_REPLAY.md` §4a (Lane A) |
| Reachability-gated observation queue (SME queues, user's clicks capture) | DESIGNED-NOT-BUILT | `BACKEND_REPLAY.md` §4b/4c (Lanes R, O) |
| Action-grain narration lines + cache-id binding (north star) | NOT-STARTED (atoms are the current floor; icon-by-id store exists) | `GRANULARITY.md` §7/§7b, `icons/IconStore.java` |
| Data-accuracy backlog (FLAGs, consolidate-xp, S10 coarse stubs, diary-tier steer catalog) | PARTIAL/NOT-STARTED | `tools/wiki-kb/queue.jsonl` (79 `lane5:*`), `DEVLOG.md` 2026-07-12 W2 entry |
| Unified progression, quests/diaries/miniquests/raids first-class | LANDED (215/216 quests routable; diaries in quest_db + steer; raids in p2p) | `quest_db.jsonl`, `plan-quests.mjs`, `manifest.json` |

---

## 3. Prioritized roadmap

Ranked by player-facing checklist clarity → breadth → infra. Lanes marked ‖ can run
concurrently (disjoint files per the fan-out discipline).

### Lane 0 — LAND THE TREE (hygiene gate, do first, hours)
- **Goal**: commit the substantial uncommitted state on `guide-export-pipeline`
  (osrs-wiki: `enrich.py`, `steps.jsonl`, `quests.jsonl` + quest-order tool +
  `build_quests.py`, `tools/overlay-bridge/PROTOCOL.md`, kb ledgers, `rates.json`
  move to `assets/data/tools/`) and in the plugin repo (regenerated
  `route-corpus.json`). Decide the fate of the stray untracked
  `osrs-wiki/runelite-guide-chain/` build dir (gitignore or remove — it shadows the
  real repo and will confuse future agents).
- **Why now**: every lane below forks from this state; uncommitted work is
  un-inheritable by subagents and one `git clean` from gone.
- **Brief sketch**: single sonnet worker, no fan-out. "Commit the working tree in
  reviewable slices (data / pipeline / tools / kb-ledgers), note the baseline
  status (npm test 86/86), gitignore the nested build dir." No wiki work.
- **Disjoint**: blocks nothing after the first hour; everything else waits on it.

### Lane Q — QUEST SUB-CHECKLISTS AT SCALE (the flagship lane)
- **Goal**: all 188 quests render as ordered, equal-grade, wiki-cited atom
  checklists with checkpoint headers; prose `detail` demoted to fallback.
- **Why now**: the single biggest violation of the structured-everything directive
  ("quest details → sub-checklists, equal grade, not detail-text") on the most
  player-visited surface (route-quests 312 steps, route-grand quest spine). All
  machinery exists: enrich already injects coarse atoms + checkpoints; 9 questatoms
  contributions prove the extraction spec; 54 briefs are pre-interpolated in
  `design/normalization_tasks.jsonl`; the [normalize-q] gotchas (quick-guide
  transclusion stubs, parent-section-pulls-children, {{Map}} line/polygon handling,
  never-unroll repetition, per-task /tmp dirs) are already minted.
- **Brief sketch**: (a) one sonnet builder: `tools/consolidate_quest_atoms.py`
  (contrib `questatoms:*` → mint `q-<slug>-NN-<verb>-<target>` ids → write
  `steps_quest_atoms.jsonl` + `quest_expansions.jsonl` → set `coarse_unwind` on
  `steps_quests.jsonl` rows; lint: verb ∈ closed enum, checkpoint start resolves,
  coord envelope, slug-in-manifest) + the W0 enrich/plan-quests hookup behind a
  goal flag (`quest_atoms: true`) so untouched routes stay byte-identical —
  regression-diff route-p2p/corpus as the gate. (b) then track-Q fan-out per
  NORMALIZATION §3c, waves of ~15 sonnet workers off the ready-made briefs,
  consolidate + lint per wave, retro mints next-wave triggers. (c) one render pass:
  quest detail pane prefers the sub-checklist (reuse the existing
  `checkpoint-divider` pattern — reuse, don't fork, per §4d-1).
- **Effort**: consolidator+hookup ≈ 1 builder-day; 54 tasks ≈ 4 waves; render ≈ ½ day.
- **Disjoint ‖**: runs parallel with Lanes E, M3 (different files; render step
  coordinates on `WebFragments.java` with M3 — land in either order, both additive).

### Lane E — STRUCTURED-RENDER PARITY SWEEP (cheap breadth, do immediately ‖ Q)
- **Goal**: the structured surfaces that already exist reach every chain: set
  `train_methods: true` in `plan-multi.mjs`, regenerate + commit route-quests /
  route-p2p / route-corpus fixtures; add REQUISITES/REWARDS/START blocks to *step*
  detail panes (NORMALIZATION §3d-2 — data already structured in `reqs`/`req_items`/
  `consumes`; `cond-badge` demotes to supplement).
- **Why now**: highest clarity-per-effort in the whole ledger — the picker is
  built, tested, byte-safe, and 118 training steps on the two biggest chains still
  render sloppy prose. Serves "skills → method pickers" + "requisite info as
  first-class blocks".
- **Brief sketch**: one sonnet worker. "Flip the flag, regenerate fixtures via
  `plan-*.mjs | enrich.py`, diff-verify only `methods[]` (+ ordering-neutral) rows
  changed, commit both repos; then add the step-detail requisite block fragment
  mirroring `referenceCard`'s block layout." Verify with the standalone
  `GuideWebMain`.
- **Effort**: flag+regen ≈ 1 hour; requisite blocks ≈ ½ day.
- **Disjoint ‖**: Q (data files), D (kb), F (capture). Coordinates on
  `WebFragments.java` with Q's render step and M3.

### Lane M3 — REQUISITE GATING SURFACE (locked / available / done)
- **Goal**: MATERIALIZATION §2 shipped — `PlanRow.gate {state, unmet[]}` derived in
  `GuideStore` only; locked items render dimmed at equal rank with a "needs: …"
  chip; offline manual-assumption toggles; reconnect discrepancy chip, never a
  silent overwrite; locked items stay manually checkable (advisory, not enforcement).
- **Why now**: this is "checklist materialization with requisite gating" from the
  speedrun directive — the checklist finally *knows* what you can do next, which is
  the router's whole promise made visible per-row.
- **Brief sketch**: one sonnet builder in the plugin repo. Files exactly per
  MATERIALIZATION Lane M3 (`GuideStore.java`, `PlanRow.java`, `WebFragments.java`,
  `PanelOverlay`/panel). Verify list is already written in the design doc —
  reuse it verbatim as the acceptance block; sideload via the `-ea`
  jvmArguments recipe.
- **Effort**: ~1–2 builder-days.
- **Disjoint ‖**: Q fan-out, E's fixture regen, D, F. Shares `WebFragments.java`
  with E/Q render steps — sequence those three touches, everything else parallel.

### Lane D — DATA-ACCURACY BURN (precision directive; classify-first)
- **Goal**: burn the 79 `lane5:*` tickets + 57 FLAGs + `consolidate-xp` (train-*
  xp fields are known-synthetic) + continue S10 coarse stubs (14/28 registry rows
  exist) + diary-tier steer catalog (18/≈60 designed nodes).
- **Why now**: "precise accurate steps" — several *wrong* values are live (quest
  rewards, ultracompost recipe, herblore gate) and hyper-efficiency routing amplifies
  data errors into wrong orderings.
- **Brief sketch**: classify-first burst — one haiku probe wave classifies the 79
  tickets + 57 FLAGs into {mechanical-fix, needs-wiki-fetch, needs-design-call},
  a prioritizer ranks by how many route steps each error touches, sonnet workers
  fix downstream in cordoned bundles (contribute-then-consolidate, never direct
  repo edits from the cordon). `consolidate-xp` is one mechanical consolidator run
  off `Experience_table.s2` (already specified in NORMALIZATION W0).
- **Effort**: 1 probe wave + 2–3 worker waves.
- **Disjoint ‖**: everything except Q's consolidator (both write `steps.jsonl` —
  append/annotate-only keeps them mergeable, but schedule consolidation runs apart).

### Lane F — FRAMES BREADTH + REPLAY SEAM (capture engine keeps rolling)
- **Goal**: (a) extend scenario capture across the route-grand spine (origin +
  bootstrap + early-quest arcs first — the steps new players actually look at)
  toward "steps extensively filled with frame resources"; (b) build BACKEND_REPLAY
  Lane S: `run_scenario.py --world world.json` + LOC-add / container-update /
  VARP 56/95 / IF_OPENSUB+IF_SETTEXT packets, each proven by decoder-sim test
  before any client boot (the P6→P11 rsprox-lookup discipline).
- **Why now**: F1's gallery + lightbox are built and hungry; 8/205 steps covered.
  Lane S is also the long pole for ledger replay later — building it now means the
  backend lanes land onto a proven injection seam.
- **Brief sketch**: two agents. Capture-breadth worker: "pick the first 20
  route-grand steps lacking media whose scenes are world-only (no interface
  replay), author scenarios, run oracle-gated captures, emit the `step_media.jsonl`
  handoff, attach via enrich `media[]`, content-addressed per FRAMES_GALLERY §1."
  Lane-S builder: one packet at a time, `tests/test_*_236.py` pattern, offline only.
- **Effort**: capture waves are steady-state background; Lane S ≈ 2–4 builder-days.
- **Disjoint ‖**: fully — separate repo (`/home/lemon/scenario-capture/`).

### Lane B — BACKEND REPLAY, LANES P → A → L (then G → R → O)
- **Goal**: the thin-client future: protocol v2 (additive), QH-verbatim arrow
  package, observation ledger — the three LOW-risk lanes from BACKEND_REPLAY §5 —
  then the guide-feed policy (retiring in-plugin logic, never co-enabled), the
  reachability gate (feeds on `quests.jsonl` — already mined), and the observation
  queue last.
- **Why now** (and not sooner): it serves the backend/plugins + SME directives, but
  nothing player-facing degrades while it waits, and its design explicitly orders
  itself least-risk-first. Start P/A/L once Lanes Q/E/M3 are moving — they are
  entirely disjoint repos.
- **Brief sketch**: per-lane builders exactly as scoped in BACKEND_REPLAY §5's
  table (each lane owns its files; offline test before live exposure: static
  directive script for A, fold-replay-twice-zero-rows for L). Lane G's brief must
  state the double-draw rule and that the guide-chain *web view* survives the
  migration (GuideWebServer stays until the panel-directive graft).
- **Effort**: P+A+L ≈ 1 builder-week combined; G/R/O a second phase.
- **Disjoint ‖**: everything in osrs-wiki; touches bridge-plugin + service repos only.

### Lane C — CALIBRATION (last, needs measurement)
- **Goal**: measured `est_minutes` on high-traffic steps, replace
  `DEFAULT_STEP_MIN` placeholder, flip `COST_MODEL_V2` on with an intentional,
  commit-noted baseline re-pin; courier/bg cadences measured.
- **Why now**: it is the only lane gated on *telemetry*, and Lane B's ledger (step
  id stamped on every row) is precisely the measurement instrument — sequencing it
  after B turns "never estimate" from a constraint into a data feed.
- **Brief sketch**: consolidator reads ledger step-window durations → writes
  `est_minutes` where sourced → regression-diff explains every order change by a
  named constant.
- **Effort**: small code, long data-gathering tail.
- **Disjoint**: depends on B (or manual measured runs as a stopgap).

---

## 4. Cross-cutting risks & invariants

**Hard rules — every lane's brief must restate the ones it can touch:**
1. Wiki = single source of truth via `tools/wiki-kb/wikicli` (cached MediaWiki
   API); never HTML scraping; every assertion carries `refs[]`.
2. Own words only — never copy wiki/guide prose or game dialogue (captions,
   labels, details, checkpoint names included).
3. Gather/produce, never GE-buying, for all item sourcing.
4. Unified progression — no F2P/P2P split.
5. Overlay/highlight only — never automate game input; arming an observation
   changes pixels, never inputs.
6. No real Jagex credentials; loopback/offline harness only; the user's Windows
   box + live client are OFF LIMITS for capture/testing.
7. No fabricated rates/quantities/coords/option-text — `"??"` or a named
   PLACEHOLDER tuning constant beats a guess; honest degradation (synthCoarse,
   MANUAL fallback, "capture pending") over invented precision.
8. Botting-adjacent resources are DATA-only (RSPS mining = data, never code/dialogue,
   cited repo+commit+path).
9. Fan-out discipline: self-contained brief files; Bash write-only for subagents
   (redirect → Read); append-only idempotent ledgers; read gotchas.log + existing
   keys BEFORE starting; classify-first micro-bursts; retros mint the canonical
   trigger; haiku probes / sonnet workers / fable synthesis; `npm test` stays
   green — baseline re-pins are intentional acts noted in the commit.
10. Additive-nullable schema evolution + byte-safety: every new attach is opt-in
    per goal flag (the `train_methods`/`xp_fold`/`COST_MODEL_V2` pattern) and
    proves untouched routes byte-identical.

**Drift spotted (design docs vs shipped code) — fix or annotate, don't let it fester:**
- *Plan-flag vs fixture drift*: `plan-quests.mjs` sets `train_methods: true` but
  `route-quests.json` predates the flag (0 methods); regenerated `route-corpus.json`
  is uncommitted. There is no check that fixtures match their generators — Lane E
  should add a regen-and-diff step to the verify skill or CI note.
- *NORMALIZATION.md §0/§4d staleness*: track Q is listed as fully open but 9
  questatoms rows exist; the "WebFragments concurrent edit in flight" flag is
  resolved (edits landed). Annotate the doc when Lane Q starts (append, never delete).
- *Verb-enum count*: GRANULARITY §1b says 16 verbs, NORMALIZATION §1a says a
  "closed 17-entry enum" (plant/harvest counted apart). The consolidator lint must
  pin ONE canonical list; recommend the 17-entry spelled-out list since it is what
  track-Q agents were briefed with.
- *Two futures for the plugin*: the guide-chain plugin is actively growing
  (web render, gallery, picker) while BACKEND_REPLAY declares its logic superseded
  by `policy_guide.py`. This is sequenced, not contradictory — but Lane B's G brief
  must state what survives (GuideWebServer/WebFragments web view, fixtures) and
  what migrates (GuideManager/ConditionEvaluator), or two agents will build the
  same logic in both places.
- *steer_points.jsonl is 18 nodes* vs the designed per-tier diary catalog (~60
  nodes, SYNTHESIS S5) — phases are anchored on a thin catalog; Lane D owns the fill.
- *Known-synthetic xp fields* on train-* rows (gotcha `[training]`) remain live in
  routed fixtures until Lane D's consolidate-xp — any efficiency claims made from
  xp deltas are placeholder-grade until then.
- *Untracked load-bearing files*: `tools/overlay-bridge/PROTOCOL.md` (the v2 design
  extends a doc git doesn't hold) and the quest-order tool — Lane 0 closes this.
- *`normalization_tasks.jsonl` (440KB) embeds grep paths/budgets frozen 2026-07-12*
  — briefs older than the data they grep are a classic stale-cordon trap; the
  track-Q dispatcher should re-validate a sample brief per wave before fan-out.
