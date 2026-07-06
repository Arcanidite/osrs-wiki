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

<!-- Append new gotchas below. Template:
## [G-N] <short title>
- **Trap:** <the wrong assumption / mistake>
- **Why it bites:** <the consequence>
- **Avoid:** <the correction / how to do it right>
- **source/stamp:** <where learned · YYYY-MM-DD or game-update>
-->
