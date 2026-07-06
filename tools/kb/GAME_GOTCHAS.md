# Game Gotcha Ledger — OSRS

> Traps and corrections learned while building the whole-game option catalog. The domain-knowledge analog
> of the program's P-B gotcha ledger. Protocol: `PROGRESSION_ROUTER_BRIEF.md` §10.
>
> **Each entry names the trap, the why, and how to avoid it.** Append + annotate, never silently delete
> (`[STALE — game update YYYY-MM-DD / superseded by …]`). Agents extending the catalog read this first and
> append their findings on completion.

---

## [G-1] "Best method" is not a game fact — it's relative to what's available

- **Trap:** encoding a single method as *the* best (e.g. hardcoding the top XP/hr training spot).
- **Why it bites:** game modes like **Leagues** region-lock the account to a chosen subset of the map; the
  "best" method is frequently **not reachable**. An absolute makes the planner recommend the unreachable.
- **Avoid:** enumerate every option with where / how-unlocked / yield (brief §5.11); let the optimizer
  compute the best over the **available** set (§5.0/§5.12). Never store "best" — compute it.

## [G-2] objects.pack names are garbage — don't build object entries from it

- **Trap:** treating `objects.pack` (805 records) as presentable content. 793/805 names are
  `object_N` placeholders and the other 12 are binary junk (`ÿÿO…`); only `actions`/`tags` survived.
- **Why it bites:** generating object entry pages would mean inventing names — fabricated data.
- **Avoid:** wiki population skips objects entirely. Fix upstream name decoding in
  `Dump.java`/`extract_cache.py` (likely tied to the stale-XTEA/locations issue, see DEVLOG)
  before object entries exist.
- **source/stamp:** observed in cache extraction · 2026-07-06

## [G-3] NPC ids are variant-heavy — dedupe by (name, combat level) for display

- **Trap:** rendering one entry per NPC id; 12,076 ids collapse to ~4,451 names (3,522 attackable
  ids → 1,638 distinct monsters).
- **Why it bites:** entry lists look spammed with identical rows; but per-id deep links still
  matter (quest states reference specific variants).
- **Avoid:** group rows by (name, combat_level) and list variant ids inside the entry — what
  `assets/js/tools/db.js` does. Future drop-table/bestiary data should attach to the group,
  not one arbitrary id.
- **source/stamp:** cache extraction · 2026-07-06

<!-- Append new gotchas below. Template:
## [G-N] <short title>
- **Trap:** <the wrong assumption / mistake>
- **Why it bites:** <the consequence>
- **Avoid:** <the correction / how to do it right>
- **source/stamp:** <where learned · YYYY-MM-DD or game-update>
-->
