# gap-idspace-01 — measured id-space split, root-caused (Lane B)

Resolves `tools/guide-export/design/gap_tasks.jsonl`'s `gap-idspace-01`. Read
`CONSOLIDATION.md` §3/§5/§7 first — this is the measurement + fix that lane
called for.

## Measured, before any fix

route-grand.json (215 steps) carries 89 quest/rfd steps. `quest_expansions.jsonl`
(the `quest_atoms` registry, keyed off `steps_quests.jsonl`'s 189 long ids)
and `coarse_expansions_oppgran.jsonl` (the `granular` registry, 123 coarse
ids, short-id-compatible) partition grand's 89 quest steps as:

| bucket | count | ids |
|---|---|---|
| covered by `quest_atoms` only | 0 | — |
| covered by `granular`/oppgran only | 17 | quest-mm, quest-dt, quest-fairytale-1, quest-tale-of-arrav, quest-nature-spirit, quest-priest-in-peril, quest-druidic-ritual, quest-lost-city, quest-the-feud, quest-tai-bwo, quest-bone-voyage, quest-swan-song, quest-cooks-assistant, quest-family-crest, quest-rum-deal, quest-shadow-storm, quest-big-chompy |
| covered by both (granular renders, per enrich.py's old check-order) | 62 | the long-id quests (e.g. quest-sheep-herder, quest-dragon-slayer-i, ...) |
| covered by neither | 10 | rfd-intro, rfd-goblins, rfd-mountain-dwarf, rfd-pirate-pete, rfd-evil-dave, rfd-skrach, rfd-sir-amik, rfd-awowogei, rfd-finale, quest-rfd-start |

Total with a sub-checklist (either mechanism): 79/89 — matches task #9's
documented number.

**Root cause, per id, not assumed:** `quest_expansions.jsonl`'s 188 entries
are 100% keyed by `steps_quests.jsonl`'s long-slug ids (verified: zero string
overlap with the 27 `steps.jsonl` short ids). None of the 27 short ids has a
long-id **twin** — the near-miss candidates that DO exist in
`steps_quests.jsonl` (`quest-monkey-madness-ii`,
`quest-desert-treasure-ii-the-fallen-empire`, `quest-fairytale-ii-cure-a-queen`,
`quest-goblin-diplomacy`, `quest-dwarf-cannon`, `quest-pirates-treasure`,
`quest-recipe-for-disaster-freeing-the-lumbridge-guide`) are each a
**different real-world quest** (sequels / different RFD chapter / different
goblin quest), not this id's twin under another slug — confirmed by title,
not guessed. So the split is not a renaming/aliasing problem; it's that
`consolidate_quest_atoms.py`'s parent lookup (`steps_quests.jsonl` only)
never had a path to accept a short id at all.

The 10-quest **coverage gap** (89−79) is a **different, unrelated fact**: all
10 are RFD chapters with **zero atoms in either registry** — not an id-space
bug, a genuine content gap (nobody has ever authored a granular OR quest_atoms
walkthrough for RFD's chapters). See `quest_id_map.jsonl`'s
`needs_new_expansion:true` rows.

## The fix (additive, no id renamed/deleted)

1. `tools/consolidate_quest_atoms.py`: parent-row lookup now falls back to
   `steps.jsonl`'s own quest-/rfd- rows when a `quest_id` has no
   `steps_quests.jsonl` entry (new `load_parents()`, additive — every
   existing long-id parent resolution is untouched).
2. `tools/reconcile_quest_idspace.py` (new): emits
   `assets/data/tools/quest_id_map.jsonl` (27 rows, the classification this
   task's ledger contract specifies) + `gapfix:idmap:<short-id>` /
   `gapfix:idmap:depth-queue` contributions, AND mechanically re-registers
   the 17 short ids that already have real, cited `steps_oppgran.jsonl`
   atoms into the `questatoms:<short-id>` contrib shape (content/refs copied
   through unchanged; only the already-catalogued verb/hint enum drift —
   go-to→walk-to, search→gather, use→use-on, operate→toggle, 9 hand-verified
   per-atom overrides, non-enum hints folded into detail — is fixed in
   transit, per gap-enum-01's already-designed remap table).
3. `enrich.py`: `quest_atoms` now attaches BEFORE `granular` (was the
   reverse) — the higher-citation bank renders when both exist; `granular`
   stays live as the true fallback for non-quest coarse ids (train-*/synth-*),
   not deleted.

## Measured, after the fix

`quest_atoms` **alone** (granular registry hypothetically absent) now covers
79/89 — up from 0/89 alone (62 were masked by check-order, 17 had no
quest_atoms entry at all). `granular`'s oppgran fallback is **redundant, not
load-bearing**, for every quest it used to carry alone (only-granular bucket
is now 0). The 10 rfd-*/quest-rfd-start ids remain the true ceiling for a
reconciliation-only pass — closing them requires new wiki-researched content
(dispatched separately as gap-rfd-01/02 GENERATE work; see this file's git
history / DEVLOG for whether that landed in the same pass).

**Hard guard held**: 79/89 did not regress at any point (verified: zero ids
moved from "covered" to "uncovered"; all 79 changes are `content-changed`,
i.e. same coverage, different — now-correctly-attributed — source bank).
