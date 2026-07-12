# QUEST_COVERAGE — questdb/diarydb substrate census (coverage4/finalize, 2026-07-12)

Substrate: `assets/data/tools/quest_db.jsonl`, rebuilt this pass from all `questdb:`/`diarydb:`
rows in `tools/wiki-kb/contrib.jsonl` (dedup last-wins, sorted by kind then id).
**264 rows = 216 quest-kind + 48 diary-kind.**

## Headline

- **Quests with questdb rows: 191 / 197** (directive denominator). The 216 quest-kind rows
  break down as 191 real quests + 25 miniquests (24 match the classify miniquest census;
  the 25th, `vale-totems`, is a post-classify miniquest release contributed under `questdb:`).
- **Diary tiers covered: 48 / 48.** Complete — `ardougne-easy` (the last gap) landed via
  depth:19-final-misc-late.

## Census reconciliation (honest denominator note)

- The directive fixes total quests at **197**. Our own `classify:*` census has **191** quest
  titles, and **every one of the 191 now has a questdb row** (191/191 against classify).
  The 6-title delta (197−191) remains unaccounted-for census drift — likely post-classify
  releases — and **cannot be named from current contrib data**; a future classify refresh
  should re-run the quest-list DPL pages to name them.
- Matching note: questdb ids drop apostrophes and use `&`→`and` (e.g. `cooks-assistant`,
  `romeo-and-juliet`); a handful of ids are Title_Case_With_Underscores. Reconciliation must
  normalize both sides (lowercase, strip apostrophes, `&`→`and`, non-alnum→`-`) or it
  reports ~39 false gaps. `classify:Romeo___Juliet` has `title: null` (the `&` was eaten by
  key-slugging) — it is Romeo & Juliet and IS covered.

## Honest gaps

- **Named quest gaps: 0.** All 44 gaps from coverage3 (the wave3/depth backlog cohort) were
  closed by depth:17-final-core-prereqs, depth:18-final-rfd-chain, and
  depth:19-final-misc-late.
- **Unnamed gaps: 6** (the 197−191 census drift above). These are the only quests without
  rows, and only a classify refresh can identify them.
- **Diary gaps: 0.**

## Queue action

- Nothing left to enqueue from the named backlog; `depth:next` derivatives are exhausted for
  quests/diaries. The single actionable follow-up is a **classify refresh** to name the
  6-title drift, then (if real) a final depth burst for those titles.
