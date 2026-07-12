# GAP ANALYSIS — produced result vs directed spec (final QA pass, 2026-07-12)

Method: every STATUS below was verified against the live tree TODAY (post-consolidation,
fixtures regenerated 19:50–20:00), not inherited from prior claims. Evidence cites the
exact file + the measured count/grep/sample. `npm test`: **91/91 green** (baseline grew
from 86; suite passes). Fixture set inspected: `route-{grand,quests,p2p,corpus,origin}.json`
+ `manifest.json` in `/home/lemon/runelite-guide-chain/src/main/resources/fixtures/`.

Verdict shape: 6 FULLY-MET · 12 PARTIAL · 4 MISSING · 0 REGRESSED.

---

## 1. SPEC LEDGER

| # | Directive (from inception) | STATUS | Evidence (inspected, not assumed) | Gap in one line |
|---|---|---|---|---|
| D1 | Wiki = source of truth: every step/item/quest mention cites refs[] viewable in a lightbox | PARTIAL | route-grand top-level refs 196/213 (missing = chkpt/synth/opp-stub ids); grand subChecklist atoms **416/1569 (26%) cited** vs route-quests atoms 5180/5180 (100%); steps_oppgran.jsonl: 1154/1570 rows have NO refs[]; `/wiki/page` route + delegated wiki-lightbox handler exist (WebFragments.java:669) | The flagship's oppgran-sourced sub-checklists are 74% uncited |
| D2 | Own words only — no copied wiki prose/dialogue | PARTIAL | 8-gram scan of 80 random steps_quest_atoms rows vs their cited blobs: **7/80 (~9%) carry ≥8-word verbatim wiki phrases** (e.g. q-sins-of-the-father-08 "talk to veliaf in the slepe church graveyard"; q-kings-ransom-25 "choose the round purple box second from the") | ~9% of quest atoms need own-words rewrites |
| D3 | No fabricated rates/quantities — "??" or named placeholder | PARTIAL | gotchas.log:32 `[training]`: train-*/ctr-* xp fields are synthetic copy-pasted constants, still live in ALL fixtures (no consolidate-xp run; no consolidate_xp*.py in tools/); est_minutes honest (26 null / 0 fabricated); xp_hr in train_methods sourced-or-"??" (spot-checked) | Known-wrong synthetic xp numbers ship un-marked instead of "??" |
| D4 | Requisite-burndown: items = produces/consumes edges, staged AOT/JIT | FULLY-MET | burndown.js + supply_chains.jsonl live; route-grand carries the pps-* chain (6 steps), bootstrap-*, setup-ultracompost, tag-bridge synth steps; backprop-spike run (exit 0) resolves 15 demands over 17 indexed source items | — |
| D5 | Gather/produce, NEVER GE-buying | PARTIAL | Live leaks in shipped fixtures: `quest-imp-catcher` detail "buy on GE or kill imps" (route-grand + route-quests); `train-firemaking-30` detail + methods[0] "Oak logs from GE or Draynor oaks" (all 4 chains); firemaking 15/50/75/99 methods locate log supply at "Grand Exchange (east side)" with no gather source (steps.jsonl:58-62, train_methods.jsonl:42-44). Counter-evidence of discipline elsewhere: oppgran mints explicit gather-not-GE alternates (sheep-shearer, gertrudes-cat, imp-catcher atom) | ~4 GE-sourcing leaks shipped despite the alternates existing |
| D6 | Unified progression — no F2P/P2P split | PARTIAL | manifest.json: 4 chains; "P2P Bossing Focus" persists (Reference category, honest "still absorbs" description); `f2p-early-game.json` (13.8KB) still on disk though unreferenced; route-p2p has **42 steps unique vs grand** (stale band cuts); `milestone-barrows` contradiction LIVE (p2p 15 conds vs grand 10); quest order agreement grand∩quests LCS 51/89 | Consolidation stopped at CHAIN_CONSOLIDATION §4 step 2 of 6 |
| D7 | Quest details → equal-grade sub-checklists | PARTIAL | steps_quest_atoms.jsonl: 5190 atoms / 188 quests, quest_expansions 188 authored, coarse_unwind set on 188/189 steps_quests rows (arch-alliance excluded, removed quest); route-quests renders 187/215 quest subChecklists; route-grand **79/89** — 10 missing are ALL RFD subquests (rfd-* + quest-rfd-start), which live only in steps.jsonl's short-id space with no expansion in either bank | RFD 10 + the 27-id short-space quests have no expansion path |
| D8 | Skills → 1:many method pickers w/ wiki breadcrumbs | FULLY-MET | train_methods.jsonl 125 rows / 392 methods; attached grand 49, quests 73, p2p 63, corpus 125 (all four plan-*.mjs set train_methods:true — verified in source); `appendMethodPicker` renders (WebFragments.java:920, :416) | — (content-quality FLAGs remain, see D3/D5) |
| D9 | Reference cards → structured requisite/reward/start blocks | PARTIAL | catalog.jsonl 346 rows: summary 346, facts 346, req_items 256, start 264, length 264; ReferenceEntry.java has summary/facts/req_items but **NO start/length fields** — both catalog fields silently dropped at Gson parse; renderer prefers blocks over notes | start/length produced but never deserialized/rendered |
| D10 | Requisite/pre-req info as first-class blocks on STEP detail | MISSING | WebFragments.java renders step reqs solely as `cond-badge` (line 310); no REQUISITES/REWARDS/START fragment; GuideStep.java has **no req_items field** though route-grand carries req_items on 55 steps and route-quests on 160 | Fixture data exists; plugin drops it; no block render |
| D11 | Faux grain full route (Step 0 → endgame reads as atoms, not "train X / do quest Y") | PARTIAL | route-grand 213 steps: 122 subChecklists (79 quest + 43 train), 24 ori-* atoms, 54 checkpoint headers, 94 top-level atoms, 5 branch{} steps; remaining monoliths: 10 RFD quest cards + synth-* bands (8, refs-less); plus junk artifact `synth-tag-_quest_progression_anchor_unreachable-1` ("Obtain _quest_progression_anchor_unreachable", MANUAL) shipped at phase "Toward Barrows runs" | RFD + synth residue still coarse; one raw internal artifact is player-visible |
| D12 | GRANULARITY grammar conformance (17-verb enum, closed hint enum, U1–U10) | PARTIAL | steps_quest_atoms: verbs 100% canonical, hints have **471 entries outside the closed enum** ('note' 321, 'branch' 76, 'verb-gap' 40, 'item' 17, …); steps_oppgran: **68 atoms with non-canon verbs** (go-to 35, operate 15, use 10, search 8) + 21 non-enum hints; steps.jsonl: fully conformant | Both atom banks drift from the closed grammars; no lint gate ran |
| D13 | Opportunistic lookahead (back-prop, earliest in-position collection) | PARTIAL | backprop.js + enrich.py P8 weave landed; route-grand has 5 paysOff weaves + 5 opp-stub fallbacks (verified in fixture); spike re-run TODAY: **4 residual source-after-consumer faults** (volcanic_ash, coins@pps-04, ranarr_seed, raw_monkfish) + 7 no-window demands (food×2, ranarr_weed, guam_seed, compost, prayer_potion_4) from unsourced zones | Faults unfixed; no-window items lack sourced zones; weave only on grand |
| D14 | One SYSTEM: spine + lens filters, not N drifting chains | PARTIAL | Lens.java (FULL/QUESTS/ORIGIN/MILESTONES/TRAINING) + GuideStore.selectLensById + segmented control + "N woven steps hidden" divider all landed; manifest pruned to 4 chains; BUT spine routes only **89 of 215** routable quests (superset absorption §4 steps 3–5 not done); route-origin.json still shipped though no manifest entry references it | Lens layer done; spine-superset absorption + fixture prune not done |
| D15 | Requisite gating visible: locked/available/done + needs-chips | MISSING | PlanRow.java: full file read — fields are globalIndex/guideId/guideName/key/step/status only, **no gate{}**; GuideStore has no derivation; no manual-assumption toggles | MATERIALIZATION Lane M3 designed, zero code |
| D16 | Speedrun cost model calibrated (wall-clock chooser) | MISSING | tuning.js: `COST_MODEL_V2 = false`, `DEFAULT_STEP_MIN = 30` placeholder; steps.jsonl: 0 numeric est_minutes | Ordinal ladder only; Lane 6/C never started (gated on telemetry) |
| D17 | DAG/non-DAG interleave (bg loops, passive embeds, alternation, JIT) | FULLY-MET | route-grand: slotType 1 (bg-farm-allotment), passiveOverlays on 17 steps, lifecycleState 1; route-p2p: 2 alternation cards + steerKind 2; insert_supply_steps + re-pin verified in enrich.py header order | — |
| D18 | Frames as step resources + side gallery + lightbox | FULLY-MET | GuideMedia.java + `/media/` + `/fragments/gallery/` routes in GuideWebServer (grep-verified); media[] with state{} provenance on 8 grand steps; 18 content-addressed media dirs | — (breadth is D19) |
| D19 | Steps "extensively filled" with frame resources | PARTIAL | 8/213 grand steps carry media; 6/312 quests, 2/31 origin; capture engine (scenario-capture, rev-236) proven but Lane-S world-file injection unbuilt | ~4% coverage vs "extensively filled" |
| D20 | All content in scope: quests+diaries+miniquests+raids+minigames+gear | PARTIAL | Quests: 215/216 routable (manifest claims match: route-quests 215 quest steps); reference catalog: 216 quest + 48 diary + 44 unlock + 38 minigame cards; steer_points.jsonl **18 nodes** (vs ~60 designed diary-tier catalog); raids = one `milestone-raids-cox` terminal, no raid-prep/entry sub-checklist; no diary-task step rows routed | Diaries/raids/minigames are cards + milestones, not routed granular content |
| D21 | Backend replay (protocol v2, arrows, ledger, feed, replay seam, gate, queue) | MISSING | tools/overlay-bridge/ contains ONLY PROTOCOL.md; find for policy_*.py / *ledger* across both repos: zero hits | All 7 lanes designed-not-built (by explicit sequencing) |
| D22 | Overlay/highlight only — never automate input | FULLY-MET | grep Robot/sendKeys/dispatchKey/mousePress/invokeMenuAction over plugin src: **0 hits**; renders are HTML fragments + RuneLite overlays only | — |

---

## 2. GAP DEEP-DIVES (each PARTIAL/MISSING row)

**D1 — oppgran citation hole.** Produced: two sub-checklist banks. questatoms
(consolidate_quest_atoms.py) enforced refs — 5190/5190 cited. oppgran
(consolidate_oppgran_atoms.py) did not — 1154/1570 rows are refs-less, and because
plan-grand.mjs prefers `granular` (oppgran) over `quest_atoms` (see its task-#9 header
comment), the FLAGSHIP renders the uncited bank on the 62 quests where both exist. Root
cause: W3 oppgran waves prioritized grain over citation and no refs-lint gated the
consolidator. Cheapest close: prefer questatoms wherever the expansion exists (62
overlap quests), backfill the rest.

**D2 — own-words leakage.** 9% sampled verbatim ≥8-gram overlap concentrated in
questatoms details that paraphrase quick-guide walkthrough lines too closely. Root
cause: normalize-q briefs said "own words" but no mechanical post-check existed. The
same 8-gram scanner used in this audit is the classify tool.

**D3 — synthetic xp.** The [training] gotcha documents that bands starting above level 1
carry one reused placeholder constant. The NORMALIZATION W0 recompute
(Experience_table.s2, cumulative(hi)−cumulative(lo)) was specified but never executed —
no consolidator script exists. Wrong numbers in a hyper-efficiency router are worse than
"??": they silently steer ordering.

**D5 — GE leaks.** Three shapes: (a) quest-imp-catcher's parent detail actively
recommends "buy on GE" while its own oppgran sub-atom models the imp-drop gather — the
fallback prose contradicts the hard rule its child obeys; (b) train-firemaking-30
methods[0] NAMES GE as log source; (c) firemaking bands' method rows locate supply at
the GE with no gather alternative modeled. Root cause: track-S mined training pages
as-written; the smithing task proved the rule ("GE-buying option dropped per
gather-not-GE") but firemaking's worker didn't inherit that trigger.

**D6/D14 — consolidation stopped mid-plan.** CHAIN_CONSOLIDATION's own §4: step 1 (spike)
and step 2 (lens layer) are DONE and verified here; steps 3 (absorb p2p's 7 real
uniques — measured today still 42 total uniques incl. stale bands), 4 (quest-cape
epilogue → spine superset; grand still routes 89/215 quests), 5 (prune fixtures —
route-origin.json + f2p-early-game.json still on disk), 6 (drift gate test) are NOT
done. The milestone-barrows two-truths contradiction (15 vs 10 conditions) ships today.

**D7 — quest id-space fracture (the capped-at-79 mystery, answered).** Two disjoint
quest id spaces exist: steps.jsonl holds 27 spine quests as short ids (quest-mm,
quest-dt, quest-priest-in-peril, all 10 RFD…); steps_quests.jsonl holds the other 189
as full slugs. questatoms covers exactly the 188 long-slug quests; oppgran covers 79
route-grand ids (62 long + 17 short) — union leaves the 10 RFD steps with no expansion
in ANY bank (verified: grand quest ids in neither = the 10 RFD ids). route-grand's 79
is therefore the oppgran ceiling, and route-quests' 28 uncovered = 27 short-id quests +
arch-alliance. Root cause: plan-grand merges both banks but the granularization fan-outs
partitioned on file, not on the union id space.

**D9/D10 — render parity.** Producers finished ahead of renders: catalog start/length
(264 rows each) die at ReferenceEntry (no fields); step req_items (55 grand/160 quests)
die at GuideStep (no field); `branch{}` (5 grand steps) and p2p's `alternationMembers`
have no Java fields either. The REQUISITES/REWARDS/START step-detail block
(NORMALIZATION §3d-2) was explicitly deferred and remains cond-badges.

**D11 — residue.** The RFD arc renders as 10 one-card monoliths inside an otherwise
granular flagship; 8 synth-* bands are refs-less auto-synthesized fillers; and one raw
internal token (`synth-tag-_quest_progression_anchor_unreachable-1`, instruction "Obtain
_quest_progression_anchor_unreachable") is shipped to players — a planner artifact that
should have been resolved or suppressed at emit.

**D12 — grammar drift.** questatoms consolidator accepted free-form hint types (including
40 'verb-gap' hints — agents flagging verbs they couldn't fit, good honesty, wrong
channel) and oppgran accepted 4 non-canon verbs. GRANULARITY §6's three lint checks were
specified but no linter is checked in.

**D13 — faults + windows.** The weave works (5 paysOff on grand, each with a fallback
stub). Remaining: 4 source-after-consumer route faults are DATA faults (bank ordering
puts producer after consumer — e.g. ranarr_seed source at a later index than
farm-ranarr-patch) the design says to fix in data, never silently reorder; 7 no-window
demands trace to unsourced zones/opp{} (the og-o1/o2 grounding track never ran to
completion). paysOff coverage: grand-only, by goal-gating design — quests/p2p flags off.

**D15 — gating.** Nothing beyond design. This is the single largest visible-behavior gap
for "requisite gating visible": today no row tells the player it is locked or why.

**D16 — calibration.** Blocked-by-design on measurement (Lane B ledger or manual runs);
correctly deferred, listed for completeness.

**D19 — frames breadth.** F1 machinery healthy; captures cover the ctr/pps/ori arc only.
Lane-S (world-file injection: LOC add, container, VARP, IF_OPENSUB) unbuilt keeps
interface/mid-quest states uncapturable.

**D20 — content breadth.** Diaries exist as 48 cards + 3 steer nodes with tasks
unrouted; raids as one CoX milestone (no prep checklist, no entry mechanics — S10 stub
#7 registry row only); minigames cards-only. steer_points 18/~60 designed.

**D21 — backend.** Sequenced last on purpose; PROTOCOL.md is now committed (was the
untracked-file risk), everything else design-only.

---

## 3. CROSS-CUTTING INTEGRITY

**Hard-rule violations found:**
1. **GE-buying leaked** (rule: gather/produce never GE): quest-imp-catcher detail
   (route-grand + route-quests), train-firemaking-30 detail + methods[0], firemaking
   15/50/75/99 GE-located log methods. ~4 distinct leak sites; the rest of the 155
   GE mentions across data are negations, geography ("west of the Grand Exchange"), or
   explicit gather-not-GE alternates (verified per-file with negation-context sweep).
2. **Fabricated-numbers bar bent, flagged**: synthetic train-* xp constants (known-wrong,
   documented in gotchas.log:32) ship un-marked in all fixtures. est_minutes/xp_hr/rates
   otherwise honest ("??" discipline visible throughout the atom banks).
3. **Own-words bent**: ~9% of sampled quest atoms carry ≥8-word verbatim wiki phrases.
4. **No F2P/P2P structural split** (progression is unified; membership never gates the
   spine) — but the "P2P Bossing Focus" residual chain + on-disk f2p-early-game.json keep
   split-flavored surfaces alive. No overlay/automation violation (grep clean). No HTML
   scraping found (wikicli-only refs; slugs match manifest pattern).

**Consistency findings:**
- Fixtures do NOT agree: subChecklists in grand (oppgran-preferred) + quests
  (questatoms) only; p2p/corpus render quest monoliths although the banks cover them
  (plan-multi/plan-corpus lack quest_atoms/granular flags). paysOff exists only on grand.
  milestone-barrows contradiction between p2p and grand. Two truths for quest ORDER
  (LCS 51/89) until spine absorption.
- Render exists for: subChecklist, methods, paysOff, hints, checkpoint, refs, media,
  lens, facts/summary/req_items (cards). Render MISSING for produced fields: step-level
  req_items, branch{}, alternationMembers, card start/length, top-level atom{} (label
  carries the content, low harm).
- Orphaned/dead mechanisms: f2p-early-game.json (unreferenced, name violates no-split);
  route-origin.json (fixture shipped, zero manifest entries reference it — Origin lens
  replaced it); dual granularization mechanisms overlapping on 62 quests (oppgran wins
  on grand, questatoms is the cited/conformant bank — this duplication is itself a gap);
  `synth-tag-_quest_progression_anchor_unreachable-1` artifact step.

---

## 4. PRIORITIZED GAP-CLOSING PLAN (ranked by player-facing impact)

Task rows (cordoned, idempotent-keyed) live in `gap_tasks.jsonl` beside this file.

**Lane 1 — HARD-RULE PURGE (D5, D11 artifact; FIX; ~½ day; disjoint: data files only).**
GE leaks + the unreachable-anchor artifact are integrity bugs on the most-read surfaces.
Brief sketch: one sonnet worker; scope = steps_quests.jsonl imp-catcher row,
steps.jsonl:58-62 + train_methods.jsonl:42-44 firemaking rows, enrich emit-guard for
`_unreachable` synth tags; re-run negation-context GE sweep as the gate; regen fixtures;
ledger key `gapfix:ge:<row-id>`. Rank #1: literal hard-rule text.

**Lane 2 — QUEST ID-SPACE UNIFICATION + RFD (D7, D14; CLASSIFY→GENERATE→BUILD; ~2 days).**
Unifies the two quest id spaces (mapping table short-id ↔ slug), mints questatoms
expansions for the 10 RFD subquests + the 17 short-id-only quests, makes quest_atoms
alone cover all 89 grand quests, then retires oppgran-preference on the 62 overlap
quests (instant refs-100% there, closing most of D1). Classify-first: one haiku probe
emits the id-mapping + coverage matrix; sonnet workers atomize RFD from the RFD chapter
pages (one get per chapter per the [quests] gotcha); builder wires the preference flip
behind the existing flags with byte-diff gates. Disjoint from Lanes 1/3/4.

**Lane 3 — SPINE SUPERSET + PRUNE (D6, D14; BUILD; ~1-2 days; plan-*.mjs + fixtures).**
CHAIN_CONSOLIDATION §4 steps 3–5: absorb p2p's 7 real uniques (goal-set extension),
concat quest-cape epilogue, assert p2p/quests uniques→0 with the overlap spike promoted
to a checked-in gate (step 6), prune p2p/origin fixtures + delete f2p-early-game.json,
resolve milestone-barrows to the single burndown answer. Large intentional re-pin,
noted in commit. After this the dropdown is truly one system.

**Lane 4 — RENDER PARITY (D9, D10, D15; BUILD; ~2 days; plugin repo only).**
(a) M3 gating: PlanRow.gate{state,unmet[]} derived in GuideStore, dimmed+needs-chip,
manual assumptions offline, discrepancy chip (verify list verbatim from
MATERIALIZATION §Lane M3); (b) REQUISITES/REWARDS/START block on step detail from
reqs/req_items/consumes, cond-badge demoted; (c) ReferenceEntry +start/+length,
GuideStep +req_items/+branch. Three coordinated touches on WebFragments; all additive.

**Lane 5 — CITATION + OWN-WORDS SWEEP (D1, D2; CLASSIFY→FIX; ~1 day + waves).**
Classify-first: run the 8-gram overlap scanner over ALL 5190 questatoms + 416 cited
oppgran atoms (mechanical, zero fetches) → ranked rewrite queue; refs-backfill for
oppgran atoms surviving Lane 2's preference flip. Sonnet workers rewrite flagged
details own-words (labels stay imperative), key `gapfix:ownwords:<atom-id>`.

**Lane 6 — DATA TRUTH BURN (D3, D12, D13-data, D20-steer; FIX; classify-first; 2-3 waves).**
consolidate-xp (mechanical, Experience_table.s2 already cached); enum-conformance lint +
remap (471 hint-type drifts to closed enum, 68 oppgran verbs); fix the 4
source-after-consumer bank orderings; ground the 7 no-window items' zones/opp{} (o-track
completion) so backprop weaves them; 57 FLAGs + 79 lane5 tickets; steer catalog 18→~60
diary tiers. All contribute-then-consolidate, never direct edits from cordons.

**Lane 7 — FRAMES BREADTH + LANE-S (D19; GENERATE/BUILD; steady-state; separate repo).**
First 20 media-less route-grand steps with world-only scenes → scenarios → captures →
media[]; Lane-S world-file injection built packet-at-a-time offline.

**Lane 8 — CONTENT BREADTH: raids/diaries granular (D20; GENERATE; after Lane 2).**
CoX/Barrows/GWD entry+prep expansions (S10 stub #7), diary-task sub-checklists reusing
the questatoms machinery keyed off the 48 diary cards.

**Lane 9 — BACKEND P/A/L then G/R/O (D21; BUILD; separate repos)** and
**Lane 10 — CALIBRATION (D16; after Lane 9's ledger)** — unchanged from ROADMAP,
sequenced last; nothing player-facing degrades while they wait.

Disjointness: Lanes 1/2/6 share steps-data files — append/annotate only, schedule
consolidator runs apart; Lane 4 owns the plugin repo; Lanes 3 owns plan-*.mjs+fixtures
(regen after 1/2 land to avoid double re-pins); 5 is ledger-only until its consolidator
run; 7/9 live in other repos entirely.
