# STATE-ANNOTATED CONSOLIDATION — the ideal step-0→endgame scan

Extends [PLAYER_DIRECT_GRANULAR.md](PLAYER_DIRECT_GRANULAR.md) + the `route_feasibility.mjs`
gate. Beyond "is the next step doable" — SIMULATE the account state forward and annotate each
step with the state it produces, so the checklist is a stateful walkthrough, not a list.

## 1. The scan — heap/quicksort ideal ordering
Frame ordering as a PRIORITY-QUEUE scan from step 0 to endgame. At each point: from the
FRONTIER of feasible steps (reqs met by accumulated state — `route_feasibility`), pop the
next by priority key —
`unlock/QoL compounding payoff  >  unblocks the most downstream  >  efficiency (xp/hr, gp/hr)
>  in-position proximity (no re-travel)` — advance the simulated state, repeat. The popped
sequence IS the ideal order (the greedy/burndown made explicit as a heap-scan). Gate: after,
`route_feasibility → 0 faults`. Ties/branches use `branch{}` (GRANULARITY §3c).

## 2. State model — `state_after` per step (additive-nullable)
Each step carries the state it LEAVES the player in:
- `skills`: {skill: level} accumulated.
- `inventory`: the expected 28-slot loadout here (key items + counts + STATE — noted/unnoted,
  cleaned-vs-grimy, charged, (un)finished potion) — driven by withdraw/gather/produce/consume.
- `equipped`: gear worn (weapon/shield/armor/rings/ammo) — driven by `equip`.
- `bank`: the relevant staged/produced stock + counts — driven by deposit/produce.
- `unlocks`: quests done · diaries · access · teleports · spellbook.
Transitions ARE the atoms: withdraw(bank→inv) · equip(inv→worn) · gather/kill(inv+) ·
produce/consume(inv Δ) · deposit(inv→bank). The simulator applies them → `state_after`.

## 3. Requisite inventory/gear/bank management (first-class)
Per interaction specify: the LOADOUT to withdraw (exact inventory for the block, within the
28-slot budget — food/potion/tool/space arithmetic), the gear to equip, what stays banked,
and item STATES. Bank org + inventory-slot budget are real constraints the guide must honor
(e.g. "27 iron ore + goldsmith gauntlets equipped"; "keep 1 slot for the pickaxe").

## 4. Micro-gotchas (PLAYER POV) — record to `tools/wiki-kb/micro_gotchas.log`
The "how the game actually handles this" details a player needs, distinct from wiki-fact
gotchas: inventory-full handling (drop vs bank vs stop), noted-item handling, stacking,
cleaned-vs-grimy/(un)finished states, 3-tick/1-tick timing + the tick pattern, click-order for
`use-X-on-Y`, drop-vs-bank-vs-burn policy, teleport-charge budgeting, run-energy/stamina,
prayer-flicking, aggression-reset, world-hop for hotspots. Each: one line, own-words, wiki- or
mechanic-grounded, `"??"` if unsure.

## 5. Tooling
Extend `route_feasibility.mjs` (or a sibling `state_scan.mjs`) to EMIT `state_after`
per step (skills already accumulate; add inventory/equipped/bank via the atom transitions).
Consolidation VERIFIES each step against wiki (wikicli) + calculated values (xp from
`Experience_table.s2`; gp/xp from the cost model) + the state simulator — never by eye —
and writes the annotations back through the SIDECARS (never hand-edit route JSON).

## 6. Conventions honored
Wiki=SoT via wikicli; own-words; gather-not-GE; `"??"` over guesses; atom node shape + 17-verb
/ 9-hint closed enums; sidecar attach (NORMALIZATION §1a); opportunistic weave = spine-only QoL
payoffs (OPPORTUNISTIC §2-epoch); every claim provenance-cited. End every wave with a retro
(design-retros.log) + its gotchas (micro_gotchas.log / gotchas.log).
