# CONSOLIDATION — scoping refresh: what's shipped, what's left, proven-disjoint lanes

**This is not a fresh design.** `tools/guide-export/design/CHAIN_CONSOLIDATION.md`
(committed 10da19f1, this branch) already proved the model — spine + predicate lenses —
and its migration steps 1–2 are **already shipped** in the plugin repo
(`/home/lemon/runelite-guide-chain`, branch `feat/burndown-web-lane1`, commits `86c4ba3`,
`932a528`). This doc (a) maps EXACTLY what's live today vs what CHAIN_CONSOLIDATION.md
called for, (b) re-measures the superset gap with fresh numbers (route-grand grew
205→213 steps since that doc; the gap did NOT shrink — see §2), (c) adds one risk
CHAIN_CONSOLIDATION.md didn't have: the quest id-space split (task #9) that the user
flagged, and (d) carves the remaining work (steps 3–6 of that doc's §4) into
proven-disjoint lanes. Read CHAIN_CONSOLIDATION.md §2/§3 first — the unified model
(spine + lenses) is not re-litigated here.

## 1. Current-state map (what's actually live, cited)

**Three chain-selection surfaces, all reading one list.** All three resolve through
`GuideStore.chains()` / `activeChainId()`, kept in sync by
`GuideChainPlugin.java:114-121` — shrinking the manifest fixes all three at once, no
divergent logic to reconcile:
- RuneLite config panel: `GuideChainConfig.java:50-57`, `selectedChain` int index.
- Web combo box: `WebFragments.java:125-145` (`chainsFragment`) — the literal
  `<select name="chain">` the user is calling "solo under a combo box".
- Library page: `WebFragments.java:597-644` (`libraryFragment`/`appendLibraryCategories`),
  cards grouped by `ChainEntry.category` ("Progression" / "Reference").

**Lens layer — ALREADY SHIPPED, additive.** `store/Lens.java` (enum: `FULL, QUESTS,
ORIGIN, MILESTONES, TRAINING`, predicates ported verbatim from `lens-spike.mjs`),
`GuideStore.java:79-81,288-316` (`activeLensId`/`selectLensById`, global `doneSteps`/
`skippedSteps` untouched by lens choice), `WebFragments.java:147-167`
(`lensFragment`, segmented control), `WebFragments.java:200-271` (`planFragment` filters
rows through `store.activeLens()`, flushes elided runs as one "N woven steps hidden ·
show all" li — `flushHiddenRun`). `GuideWebServer.java:198-202` wires
`POST /actions/select-lens`. This is CHAIN_CONSOLIDATION.md §2/§3's design, verbatim,
live. **What it does NOT do**: replace the other manifest entries. The lens control
filters whichever chain is currently loaded; quest-progression/p2p-progression are
still independently-routed spines, not lens-views of grand. The Lens UI sits ON TOP OF
the old dropdown, not instead of it — this gap is exactly the user's complaint.

**Manifest today** (`/home/lemon/runelite-guide-chain/src/main/resources/fixtures/manifest.json`,
4 entries — canonical location per CLAUDE.md; a stale untracked copy also exists at
`osrs-wiki/runelite-guide-chain/` on branch `main`, out of scope, not touched):

| id | category | guides | steps |
|---|---|---|---|
| `full-progression` | Progression | route-grand.json | 213 |
| `quest-progression` | Reference | route-quests.json | 312 |
| `p2p-progression` | Reference | route-p2p.json | 125 |
| `full-corpus` | Reference | route-corpus.json | 188 |

`route-origin.json` (31 steps) and `f2p-early-game.json` (19 steps) are **files on disk
but already unreferenced** in the manifest — a prior pass already actioned
CHAIN_CONSOLIDATION.md's origin-drop; they're dead weight to delete, not a UI concern.

## 2. Superset gap — fresh numbers (RUN-PROVEN)

`node tools/guide-export/spikes/consolidation-overlap.mjs` (new, read-only spike;
reads the canonical `/home/lemon/runelite-guide-chain` fixtures, same convention as
`lens-spike.mjs`). Full output below; same methodology as CHAIN_CONSOLIDATION.md §1
(id-set diff + content-signature divergence check):

```
route-grand |steps| = 213   (was 205 when CHAIN_CONSOLIDATION.md was written)

chain            |steps|  ∩grand  unique  divergent  subset%
route-quests         312     152     160          0    48.7%
route-p2p             125      83      42          1    66.4%
route-corpus          188     101      87          0    53.7%
route-origin           31      31       0          0   100.0%
f2p-early-game          19       0      19          0     0.0%

grand ∩ route-quests   : 152 of 213 grand steps (71.4%)
grand ∩ route-p2p      :  83 of 213 grand steps (39.0%)
grand ∩ route-corpus   : 101 of 213 grand steps (47.4%)
grand ∩ route-origin   :  31 of 213 grand steps (14.6%)

route-p2p divergent (1): milestone-barrows
route-p2p unique-step kind breakdown: {"train":15,"synth":20,"steer":2,"alternation":2,"milestone":2,"unlock":1}
```

**Reading — the gap is UNCHANGED since CHAIN_CONSOLIDATION.md**, not shrunk: every
∩grand count (152/83/101/31) is byte-identical to the prior measurement despite
route-grand growing 8 steps in the interim. That growth (task #9's `granular:true`
keep, subChecklist attachments — see §3) was internal-only; none of it touched the
goal set, so CHAIN_CONSOLIDATION.md §4 steps 3–4 (absorption) have **not started**.
This is a useful negative result: it confirms the remaining lane plan (§5) is scoping
real, undone work, not re-deriving something already fixed.

- **route-quests** (160 unique, 0 divergent): the 216-quest superset vs grand's
  load-bearing quest-spine subset. Zero divergence means grand's copies of the 152
  shared quest ids already match content-for-content — absorbing the rest is pure
  addition, no reconciliation fight.
- **route-p2p** (42 unique, 1 divergent): identical composition to CHAIN_CONSOLIDATION.md's
  measurement — 35 stale training-band artifacts (train/synth/alternation, a parallel
  bake's different burndown cut) + 7 real content gaps (`steer-ardougne-easy-diary,
  steer-graceful, milestone-quest-mm, milestone-quest-dt, unlock-gwd,
  alternation-train-attack-30, alternation-cook-monkfish`) + the `milestone-barrows`
  condition-set contradiction (p2p asserts 15 SKILL conditions, grand asserts 10).
- **route-corpus** (87 unique, 53.7% subset): different axis (topo/region order, coverage
  ledger) — confirmed still NOT a lens candidate, stays a separate Reference entry.
- **route-origin**: 0 unique, already fully absorbed — matches its manifest removal.
- **f2p-early-game**: 0% overlap, wholly disjoint legacy demo, unreferenced — delete.

## 3. NEW risk vs CHAIN_CONSOLIDATION.md: the quest id-space split (task #9)

`plan-grand.mjs:167-173` keeps `granular:true` with this comment: dropping it
regressed route-grand's quest sub-checklist coverage **79→62**, because `quest_atoms`
(the `steps_quests.jsonl`-keyed long-id mechanism) doesn't cover quest ids grand routes
via the short id space (`steps.jsonl`, e.g. `quest-dt`, `quest-mm`) — **the two id-spaces
only partially overlap**. Both mechanisms run today (granular's `coarse_expansions_oppgran`
short-id fallback + `quest_atoms`'s long-id attach); `gap_tasks.jsonl`'s `gap-idspace-01`
is the still-open classification task to reconcile them (verified: no `gapfix:idmap:*`
contribution exists yet — the gap is real and unactioned, not stale).

**Why this matters for absorption, not just today's coverage**: `GuideStore.java:84-85`
keeps `doneSteps`/`skippedSteps` as **global `Set<String>` keyed by step id, not
namespaced per chain**. A quest completed under `quest-progression`'s long-id copy today
does **not** mark done the same real-world quest's short-id copy on `route-grand` — two
independent completion states for one quest, silently. This is itself evidence FOR
consolidation (today's split state is already confusing), but it means:

- **Lane A's quest-cape absorption (§5, step A2) must not ship before Lane B's
  id-space reconciliation**, or the same regression pattern repeats at 216-quest scale
  instead of 89 — quest-cape's ~160 additional quest steps would inherit whichever
  id-space they're authored under, and if that's the long-id space (`steps_quests.jsonl`,
  same as `quest-progression`'s own bake), grand's short-id-space quests
  (`quest-dt`/`quest-mm`, already on the spine via plan-grand's merged step banks) and
  the newly-absorbed long-id quests would coexist as two disjoint id families on the
  SAME spine — the Quests lens would show both, but the sub-checklist attach mechanism
  (`granular` vs `quest_atoms`) would silently cover only one family per step, same
  failure shape as task #9, just bigger.
- **Any absorption step must re-measure sub-checklist coverage (not just step-id
  presence)** before/after — "unique→0" on the overlap spike is necessary but not
  sufficient; the quest_atoms/granular coverage ratio (today 79/89, or 89/89 with both
  mechanisms) must not regress at the new, larger quest count.

## 4. What each dropdown entry becomes

| Entry today | Category | Becomes |
|---|---|---|
| `full-progression` (route-grand) | Progression | **Stays** — the one spine. |
| `quest-progression` (route-quests) | Reference | **Dissolves** into the Quests lens once Lane A (§5, gated by Lane B) absorbs its 160 uniques. `plan-quests.mjs` stays as a generator/regression comparator (CHAIN_CONSOLIDATION.md §4 step 5's explicit caution), not a shipped chain. |
| `p2p-progression` (route-p2p) | Reference | **Dissolves** into the spine + Milestones lens once Lane A absorbs its 7 real uniques and resolves `milestone-barrows` to the planner's single burndown answer (do not hand-pick 10 vs 15 conditions). `plan-multi.mjs` stays as the generator (it's also `plan-grand.mjs`'s own default-goal reference for the P2P goal ids to add). |
| `full-corpus` (route-corpus) | Reference | **Stays**, but demoted out of the primary chain-picker — different axis (coverage ledger, not a progression), so once the other two dissolve it's the ONLY entry left besides Full Progression. At that point the top `<select>` combo box has exactly 2 options; recommend retiring it entirely (§6) and reaching Corpus only via the Library page, which already groups by category and already renders it as a card. |
| `route-origin.json` file | — (unreferenced) | **Delete.** Already fully absorbed (0 unique, §2); its manifest entry was already pruned in a prior pass. |
| `f2p-early-game.json` file | — (unreferenced) | **Delete.** 0% overlap with grand, unreferenced, name itself violates the no-F2P/P2P-split rule (CLAUDE.md hard rule + CHAIN_CONSOLIDATION.md §4 step 5's own note). |

## 5. Absorption plan (extends CHAIN_CONSOLIDATION.md §4 steps 3–4 with the id-space gate)

- **A1 — Absorb p2p's real uniques** (independent, can start immediately): extend
  `plan-grand.mjs`'s `DEFAULT_GOALS` (`["goal-early-game", "goal-quest-spine", "barrows",
  "gwd", "raids-cox"]`) with the P2P milestone goals it lacks — `quest-dt`, `quest-mm`
  (already `plan-multi.mjs`'s own `DEFAULT_GOALS`), plus the Ardougne-easy/graceful
  steer points. Re-bake route-grand; re-run `consolidation-overlap.mjs` asserting
  route-p2p unique→0 and divergent→0 (this also collapses the `milestone-barrows`
  contradiction to whichever condition set the planner's single burndown emits — do
  NOT hand-pick between the 10/15-condition sets). One-file change
  (`plan-grand.mjs`), per its own header's reuse contract.
- **B — Id-space reconciliation** (independent of A1, same files as the currently-open
  `gap-idspace-01` classification task): map `steps.jsonl` short quest ids ↔
  `steps_quests.jsonl` long quest ids so `quest_atoms` alone gives full sub-checklist
  coverage without leaning on `granular`'s short-id fallback. Re-verify current
  coverage (79/89 today) does not regress and ideally reaches 89/89 on today's quest
  set BEFORE quest-cape's ~127 additional quests (216 − 89 already-covered) are added
  in A2 — proves the mechanism scales before scaling it.
- **A2 — Absorb the quest cape as an explicit epilogue** (gated on B): concat the
  quest-cape residue after `raids-cox` (same explicit-placement trick the origin prefix
  uses at the front — sidesteps `_difficulty`'s episode-sort, which would otherwise
  demote CoX from the anchor spot). Re-run the overlap spike asserting route-quests
  unique→0, AND re-verify quest sub-checklist coverage on the new full quest count
  (§3's "necessary but not sufficient" caution).
- **Order**: A1 and B are disjoint — parallel-safe today. A2 depends on B (not on A1;
  A1/A2 can also run either order relative to each other, both only depend on B for A2
  specifically, per the id-space argument in §3).

## 6. Dropdown UX — selection becomes lens-choice over one spine

Post-absorption, `manifest.json` shrinks to 2 entries (`full-progression`,
`full-corpus`) exactly as CHAIN_CONSOLIDATION.md §4 step 5 specifies. Because all three
selection surfaces (§1) read the same `chains()` list, this alone collapses the config
panel and Library page automatically. The one surface that still needs an explicit
edit: **retire the web `<select>` combo box** (`WebFragments.chainsFragment`,
`WebFragments.java:125-145`) — with only 2 entries and one of them (Corpus) being a
different axis rather than a sibling progression, a combo box is no longer the right
control (this is the literal shape of the user's complaint: "a solo under a combo box
option" — with 2 items left, one of which isn't even a progression choice, the combo
box itself is the stale artifact). Replace with: the Lens segmented control as the
PRIMARY navigation (already shipped), plus a single "Full Corpus (reference) →" link
next to it that opens Corpus via the existing Library route
(`libraryFragment`/`appendLibraryCategories`, unchanged). `GuideChainConfig.selectedChain`
(RuneLite panel) can stay as a 2-value toggle or fold into the same link — flagged as
an open call for whoever builds Lane C, not decided here (avoids scope creep beyond
what was asked).

## 7. Proven-disjoint lane plan

| Lane | Owns | Depends on | Proof-gate |
|---|---|---|---|
| **A1** — p2p absorption | `tools/guide-export/plan-grand.mjs` only | none | `npm test` (91/91 baseline, note re-pin as intentional); `node tools/guide-export/spikes/consolidation-overlap.mjs` shows route-p2p unique=0, divergent=0 |
| **B** — id-space reconciliation | quest id mapping (new table/script) + `steps_quests.jsonl`/`quest_expansions.jsonl` (additive keys only) — resolves `gap_tasks.jsonl`'s `gap-idspace-01` | none | quest sub-checklist coverage measured before/after, must not regress below 79/89; ideally 89/89 |
| **A2** — quest-cape epilogue | `plan-grand.mjs` only | **B** | `npm test` green; overlap spike shows route-quests unique=0; sub-checklist coverage re-measured on the new full count (§3) |
| **C** — manifest + web UI prune | `runelite-guide-chain/src/main/resources/fixtures/manifest.json`, `WebFragments.java` (`chainsFragment` retirement), delete `route-p2p.json`/`route-quests.json`/`route-origin.json`/`f2p-early-game.json` from the shipped fixtures (keep `plan-multi.mjs`/`plan-quests.mjs`/`plan-origin.mjs` as generators/comparators per CHAIN_CONSOLIDATION.md §4 step 5) | **A1 + A2** both at unique=0 | no Java test suite exists in this repo (`src/test` absent) — proof-gate is `./gradlew build` (compile) + manual drive via `GuideWebMain` standalone entrypoint, visually confirm the combo box is gone / reduced and the Lens control + Library link work |
| **D** — drift gate | promote `consolidation-overlap.mjs` (or fold into `lens-spike.mjs`) into a checked-in regression assertion wired to `npm test`, asserting comparator-bake uniques stay 0 (CHAIN_CONSOLIDATION.md §4 step 6) | **A1 + A2** (assertions only pass post-absorption) | `npm test` includes the new assertion and stays green |

Parallelism: **A1 ‖ B** today. **A2** waits on **B** only. **C** waits on **A1 + A2**
both proving unique=0. **D** can be authored any time but only goes green after **A1 +
A2** ship — land it disabled/pending or immediately after C.

## 8. Risks (CHAIN_CONSOLIDATION.md §5, reconfirmed + one addition)

All of CHAIN_CONSOLIDATION.md §5's risks stand unchanged (filtered-out requisites
mitigated by the "N woven steps hidden" affordance — verified still live,
`WebFragments.java:263-271`; id-prefix coupling in `Lens.java`'s predicates; step-4
episode surgery touching `plan-grand.mjs`'s documented sort rationale). This pass adds:

- **Global doneSteps id-collision risk (§3, new)**: because completion state is one
  global `Set<String>` keyed by step id (`GuideStore.java:84-85`), if A1/A2's absorption
  ever lands a step under a NEW id that represents the same real-world quest/action a
  user already completed under an OLD id (from `quest-progression`/`p2p-progression`
  while those still existed), that user's progress silently doesn't carry over. Not
  fixable in the design layer — a migration note for whoever ships Lane C (best-effort:
  if any id renames happen during absorption, keep the OLD id as the canonical one
  rather than minting a new one, so existing local `doneSteps` entries stay valid).
- **Coverage regression re-confirmed possible, not just historical**: task #9's 79→62
  regression happened from a single flag flip (`granular:true` → unintended drop). Lane
  B/A2 touch the exact same coverage mechanism at 2.4x the quest count — §3's
  "necessary but not sufficient" measurement discipline is the concrete mitigation.
- **route-grand's 205→213 growth was silent on this axis (confirms baseline, not a new
  risk)**: the 8 new steps didn't change any overlap number in §2, meaning no
  absorption work happened accidentally in the interim — the lane plan above is scoping
  real, current, undone work.

## 9. Discipline note

Read + design + spike only this pass. No live fixture, planner, or plugin file was
modified. The one artifact this pass writes is
`tools/guide-export/spikes/consolidation-overlap.mjs` (new, read-only measurement
script, mirrors `lens-spike.mjs`'s pattern) plus this doc. `npm test`: 91/91,
unchanged, confirmed by running it (not just cited from DEVLOG).
