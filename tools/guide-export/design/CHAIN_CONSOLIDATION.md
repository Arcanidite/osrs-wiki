# CHAIN CONSOLIDATION — one spine, lenses instead of parallel baked chains

**Problem.** The plugin's chain dropdown offers 5 independently-baked fixtures
(`manifest.json` in `runelite-guide-chain/src/main/resources/fixtures/`). Four of them
claim to be progression routes; each is a separate `plan-*.mjs` bake that drifts on its
own schedule. The data below proves three of them are subsets or stale views of
`route-grand` (the Step 0 → endgame spine). The fix is a SYSTEM: one spine + lenses
(predicates over fields the spine's steps already carry), not N drifting checklists.

Verdict up front: **route-origin is a pure view (100 % subset, 0 divergence).
route-p2p is 66 % subset and its "unique" steps are almost all stale training-band
artifacts of a parallel bake. route-quests shares every one of grand's 89 quest steps
but the two bakes disagree on their ORDER (57 % LCS agreement) — two parallel truths
for the same progression. route-corpus is genuinely different (coverage appendix) and
stays.**

## 1. Overlap analysis (DATA-PROVEN)

Step-id set comparison of each baked chain against `route-grand` (205 steps).
*divergent* = same id, different user-facing content (instruction / detail /
completionConditions). *stale(u+d)* = unique-to-chain + divergent = rows the spine
either superseded or contradicts.

```
route-grand |steps| = 205   route-corpus |steps| = 188

chain          |steps|  ∩grand  unique divergent stale(u+d)  subset%
--------------------------------------------------------------------
route-p2p          125      83      42         1         43    66.4%
route-quests       312     152     160         0        160    48.7%
route-origin        31      31       0         0          0   100.0%

grand ∩ route-p2p     :   83 of 205 grand steps (40.5%)
grand ∩ route-quests  :  152 of 205 grand steps (74.1%)
grand ∩ route-origin  :   31 of 205 grand steps (15.1%)

corpus ∩ grand = 101 of 188 corpus / 205 grand
```

**route-p2p's 42 "unique" steps decompose as** `{synth: 20, train: 15, steer: 2,
alternation: 2, milestone: 2, unlock: 1}` — 35 of 42 are training bands from a bake
whose burndown consolidated differently than grand's. Same skill, different band cuts:

```
band-drift check (p2p-unique train/synth vs grand bands for same skill):
  p2p:train-attack-10        grand-bands[attack]: ['train-attack-60', 'train-attack-70', 'synth-attack-75-4']
  p2p:train-attack-30        grand-bands[attack]: ['train-attack-60', 'train-attack-70', 'synth-attack-75-4']
  p2p:train-attack-40        grand-bands[attack]: ['train-attack-60', 'train-attack-70', 'synth-attack-75-4']
  p2p:synth-attack-43-4      grand-bands[attack]: ['train-attack-60', 'train-attack-70', 'synth-attack-75-4']
  p2p:train-cooking-20       grand-bands[cooking]: ['train-cooking-40', 'train-cooking-58', 'train-cooking-74']
  p2p:train-prayer-22        grand-bands[prayer]:  ['train-prayer-43', 'train-prayer-52', 'train-prayer-74']
```

The 7 non-band uniques are REAL content grand's goal set lacks (to absorb, §4):
`steer-ardougne-easy-diary, steer-graceful, milestone-quest-mm, milestone-quest-dt,
unlock-gwd, alternation-train-attack-30, alternation-cook-monkfish`.

**The 1 divergent step is a live contradiction** — the same milestone with two truths:

```
milestone-barrows completionConditions
  p2p  : ATT60 STR60 DEF60 PRAYER43 CRAFTING40 WOODCUT36 FARM32 THIEV38 MINING22
         HERB52 MAGIC66 COOK62 FISH62 FIREMAKING42 SMITHING45          (15 conds)
  grand: ATT60 STR60 DEF60 PRAYER43 THIEV38 MINING22 FARM32 HERB52
         FISH62 COOK62                                                 (10 conds)
```

**route-quests**: all 80 of grand's `quest-*` ids ⊆ the quest chain's 206 (grand
deliberately carries only the load-bearing spine; plan-grand.mjs's header documents
excluding `goal-quest-cape` for episode-sort reasons). But on the 89 shared
quest/rfd steps the two bakes disagree on order:

```
shared quest ids: 89  LCS(grand-order, quests-order): 51  (57% order agreement)
first divergence at position 0: grand=quest-priest-in-peril  quests-chain=quest-cooks-assistant
```

**route-origin**: 31/31 ids in grand, 0 divergent, order preserved (§6). It is already
nothing but a view. **route-corpus** shares only 101/188 with grand and is
region/topo-ordered, not route-ordered — a different axis (coverage of everything the
system knows), not a competing progression.

## 2. Unified-system model — spine + lenses

**Spine** = `route-grand`: the single unified progression (Step 0 → endgame), assembled
by `plan-grand.mjs` (origin DAG prefix concat + routeMulti over the ordered goal set,
see its header + SYNTHESIS.md). Spine order is the canonical order; there is exactly
one bake.

**Lens** = a pure predicate over one spine step, using only fields every grand step
already carries (`id`, `checkpoint`, `completionConditions`) — no new hand-labeling.
Measured on today's route-grand (spike, §6):

| Lens | Predicate (over step `s`) | steps | Replaces |
|---|---|---|---|
| Full | `true` (identity) | 205 | Full Progression entry |
| Quests | `/^(quest\|rfd)-/.test(s.id)` | 89 | Quest Progression |
| Origin | `/^(ori\|chkpt-origin)-/.test(s.id)` | 27 | Step 0 → Early Game |
| Milestones | `/^milestone-/.test(s.id) \|\| s.checkpoint != null` | 59 | P2P Progression's skeleton role |
| Training | any `completionConditions[].type === "SKILL"` | 58 | (new: the band view) |

Notes:
- **"P2P Progression" dissolves — deliberately.** Unified progression means there is no
  membership split to select; the chain's identity was 83 shared steps + 35 stale bands
  + 7 goal-set gaps. Its navigational value (capstone skeleton) is the Milestones lens;
  its content value is the spine itself once §4 step 3 absorbs the 7 real uniques.
- **Origin lens** is Tutorial Island proper (27). route-origin's other 4 rows are the
  Lumbridge opener quests (`quest-cooks-assistant, quest-sheep-shearer,
  quest-the-restless-ghost, quest-x-marks-the-spot`) — they belong to the Quests lens;
  a step may be visible under several lenses, that is the point of lenses. (Alternative
  considered: milestone-delimited segment `milestone-goal-early-game` → next
  `milestone-goal-*`, which also captures the woven prayer-pot supply steps; rejected
  for v1 — prefix predicate is simpler and exactly matches the shipped origin view.)
- **Lens ≠ chain**: progression state (checked steps, auto-advance, conditions) is
  evaluated over the FULL spine, keyed by step id. A lens only filters what the plan
  list shows. Toggling lenses can never lose or fork progress — that is the property
  the 5-fixture setup structurally lacked.
- **Corpus stays a separate Reference entry** (not a lens): different membership
  (87 steps not on the spine), different order axis (topo/region), different job
  (coverage/enrichment ledger — the appendix, per its manifest description).
- Hardening (post-v1, optional): `enrich.py` can stamp bake-time provenance
  (`lens_tags` from goal attribution) so predicates stop depending on id-prefix
  conventions. Automatic at bake time — still no hand labels.

## 3. Selector → system UX

Today (`WebFragments.chainsFragment`, ~line 124): `<select name="chain">` POSTs
`/actions/select-chain` → `GuideStore.selectChainById` swaps the whole loaded fixture.

Target: the topbar `#chains` div renders **one title ("Full Progression") + a
segmented lens control** — All | Quests | Origin | Milestones | Training — over the
single loaded spine:

```java
// WebFragments.chainsFragment() successor (sketch)
String lensFragment() {
    StringBuilder sb = new StringBuilder("<nav class=\"lenses\">");
    for (Lens l : Lens.values()) {                      // lookup table, no if-ladder
        boolean on = l.id.equals(store.activeLensId());
        sb.append("<button class=\"btn lens").append(on ? " lens-on" : "")
          .append("\" hx-post=\"/actions/select-lens\" hx-vals='{\"lens\":\"")
          .append(l.id).append("\"}' hx-target=\"#plan\">").append(l.name)
          .append("</button>");
    }
    return sb.append("</nav>").toString();
}
```

Store change (`GuideStore`): `state.activeChainId` stays (progression vs corpus,
picked from the Library) and gains `state.activeLensId` (default `full`) +
`selectLensById(String)` + a `Lens` enum whose predicates mirror §2 (`GuideStep`
already deserializes `id`, `checkpoint`, `completionConditions`). `plan()` keeps
building PlanRows over the full spine; `planFragment` filters rows through the active
lens and renders a small "· N woven steps hidden ·" divider where a contiguous run was
filtered out, so requisite steps between two lens steps stay one click away
(`hx-vals lens=full`, scroll-to-id). Phase/checkpoint dividers render as today.
`/fragments/step/current`, auto-advance, metrics: untouched — they read spine state.
Library cards for the retired chains become lens deep-links (select progression chain +
POST the lens).

## 4. Migration + prune plan (each step independently shippable, test-green)

1. **DONE (this doc)** — lens predicates proven read-only:
   `tools/guide-export/spikes/lens-spike.mjs` (§6). No wired changes; `npm test` 86/86.
2. **Plugin lens layer, additive** — `Lens` enum + `activeLensId` +
   `/actions/select-lens` + segmented control; chain dropdown still present and
   functional. Ship, verify by driving the web view.
3. **Absorb p2p's real uniques into the spine** — extend `plan-grand.mjs`'s goal set
   with the P2P milestone goals it lacks (`quest-dt`, `quest-mm`, the Ardougne-easy /
   graceful steers per plan-multi.mjs's DEFAULT_GOALS); re-bake route-grand; re-run the
   overlap script asserting route-p2p unique → 0 and divergent → 0 (this also collapses
   the milestone-barrows contradiction to the planner's single burndown answer — do NOT
   hand-pick between the 15/10 condition sets). Fixture re-pin = intentional, note in
   commit.
4. **Absorb the quest cape as an explicit epilogue** — plan-grand.mjs's header excludes
   `goal-quest-cape` because `_difficulty` episode-sort would demote CoX from the
   anchor spot. Instead of letting it sort, CONCAT the remaining quest-cape residue
   after `raids-cox` (same explicit-placement trick the origin prefix already uses at
   the front). Spine becomes a true superset (~365 steps); route-quests unique → 0;
   the Quests lens now IS the full quest progression, in one canonical order.
5. **Prune the manifest** — `manifest.json` drops the `p2p-progression`,
   `quest-progression`, `origin-early` chain entries (2 remain: Full Progression +
   Full Corpus). Delete the retired fixtures + the unreferenced legacy
   `f2p-early-game.json` (its very name violates the no-split rule; it is not in the
   manifest). **Keep `plan-multi.mjs`, `plan-quests.mjs`, `plan-origin.mjs`** — they
   are the spine's assembly inputs/goal-set definitions and the overlap script's
   regression comparators, not shippable chains.
6. **Drift gate (Lane E tie-in)** — ROADMAP already flags "no check that fixtures match
   their generators". Promote the §1 overlap script into a checked-in spike/test that
   asserts uniques = 0 against any comparator bakes kept for regression.

Steps 2 and 3–4 are disjoint (Java plugin vs mjs pipeline) and can land in either
order; 5 requires 3+4; 6 any time after 5's shape is fixed.

## 5. Invariants + risks

Invariants (restated, non-negotiable):
- **Unified progression — no F2P/P2P split.** The consolidation enforces this
  structurally: there is no membership-flavored chain left to select.
- **Wiki = single source of truth** — all content via `tools/wiki-kb/wikicli` (cached
  MediaWiki API, never HTML scraping), cited via `refs[]`; no assertions from memory;
  `"??"` beats a guess (grand still carries `quest-varbit:??` placeholders — keep them
  until researched).
- **Own words only**; **overlay/highlight only** — lenses filter a checklist, they
  never automate input.
- **Gather/produce, never GE-buy** in routes.
- `npm test` stays 86/86 green at every migration step; fixture/baseline re-pins are
  intentional acts noted in the commit.

Named drift found (evidence for the drift gate, all verbatim in §1):
- `milestone-barrows`: p2p asserts 5 extra SKILL conditions (CRAFTING 40,
  WOODCUTTING 36, MAGIC 66, FIREMAKING 42, SMITHING 45) that grand's bake dropped.
- `train-attack-10/30/40`, `synth-attack-43-4`, `train-cooking-20`, `train-prayer-22`
  (+ 29 more train/synth rows): superseded band cuts still shipping in route-p2p.
- Quest ORDER disagreement: 57 % LCS between the two bakes' shared 89 quests, diverging
  at position 0.

Risks:
- **Filtered-out requisites**: a Quests-lens user can reach a quest whose woven
  training/supply steps are hidden. Mitigated by spine-global auto-advance + the
  "N woven steps hidden" affordance (§3); the lens list never re-orders, only elides.
- **Id-prefix coupling**: predicates lean on `quest-`/`ori-`/`milestone-` naming.
  Cheap now, correct today (proven §6); harden via bake-time `lens_tags` (§2) if
  prefixes ever wobble.
- **Step-4 episode surgery** touches plan-grand.mjs's documented sort rationale — keep
  its header's reasoning updated, and expect a large intentional route-grand re-pin.
- A concurrent granularity wave edits step sources; this design touched none of them
  (fixtures read-only; deliverables are this doc + the spike).

## 6. RUN-PROVEN — lens prototype over the real spine

`node tools/guide-export/spikes/lens-spike.mjs` (read-only over the baked fixtures):

```
spine: route-grand — 205 steps

lens quests     →  89 steps  [quest-priest-in-peril, quest-nature-spirit, quest-tale-of-arrav … quest-the-dig-site, quest-watchtower]
lens origin     →  27 steps  [chkpt-origin-tutorial-0, ori-t-01-claim-character-creation, chkpt-origin-tutorial-1 … ori-m-01-claim-world-chat-unlock, ori-m-02-buy-spade]
lens milestones →  59 steps  [milestone-goal-early-game, chkpt-origin-tutorial-0, ori-t-01-claim-character-creation … milestone-goal-quest-spine, milestone-raids-cox]
lens training   →  58 steps  [ctr-02-kill-cows, ctr-05-kill-barbarians, train-strength-60 … milestone-goal-quest-spine, milestone-raids-cox]

— verification against the baked standalone chains —
quests lens ⊆ route-quests: 89/89 ids present, order-preserving: false
origin lens ⊆ route-origin: 27/27 ids present, order-preserving: true
route-origin steps NOT in origin lens (4): quest-cooks-assistant, quest-sheep-shearer, quest-the-restless-ghost, quest-x-marks-the-spot
```

Reading: the Origin lens reproduces the shipped Step 0 view exactly (order-preserving,
4 opener quests intentionally under the Quests lens instead). The Quests lens covers
100 % of the spine's quest content; `order-preserving: false` against route-quests is
not a lens defect — it is §1's proof that two parallel bakes emit two orders, i.e. the
disease this design removes. After §4 step 4 the spine order is the only order.
`npm test`: 86 pass / 0 fail (suite untouched).
