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

## 2b. INVENTORY REALISM (v1 state_scan was naive — accumulated "ever produced"; FIX)
The first `state_scan` treated `inventory` as a monotonically-growing SET of everything ever
produced/withdrawn — so by step 363 (Rum Deal) it lists 70× pineapple + bones + every loadout,
which is nonsense. The model MUST be a real OSRS inventory, not a cumulative pile:
- **28-slot cap.** Inventory holds ≤28 slots. Non-stackables take 1 slot each; STACKABLES
  (coins, runes, ammo, feathers, and any NOTED item) occupy ONE slot regardless of count. Track
  each item's `noted` flag (banknotes stack) and `stackable` property (from the wiki item infobox).
- **Add AND remove.** withdraw(bank→inv) · gather/produce/buy(inv+) · consume/sell/use-on(inv−)
  · deposit(inv→bank) · equip(inv→worn). A consumed/deposited/equipped item LEAVES inventory.
  When a band ends and you bank, inventory empties to the next loadout — it does NOT carry the
  whole route's history forward.
- **Three distinct containers:** `inventory` (≤28, current loadout only), `equipped` (worn gear
  slots), `bank` (unbounded staged stock). An item lives in exactly one. `loadout:<name>`
  placeholders must be ITEMIZED (resolve the withdraw atom's actual items) or shown as `"??"`,
  never as opaque pseudo-items in the inventory list.
- **Overflow is a signal:** if adds exceed 28 the model FLAGS it (a real design fault to fix in
  the route, e.g. "drop/bank here"), never silently overflows.
The `state_after.inventory` shown per step = ONLY what the player realistically holds THEN.

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

## 7. CHECKLIST UI — sub-atoms must be TICKABLE (not prose steps)
The subChecklist currently renders as prose "steps." Each atom must be a CHECKABLE leaf: a
checkbox + persisted checked-state (mirror the main step's done-state in `gc-state`), so the
player ticks individual micro-actions and sees sub-progress (e.g. "3/5 done"). Checkpoints are
group headers; the atoms beneath them are the checkable items. Methods[] pick-one stays a
radio-style pick. Overlay-only, no game input; reuse the existing done/skip persistence path.

## 6. Conventions honored
Wiki=SoT via wikicli; own-words; gather-not-GE; `"??"` over guesses; atom node shape + 17-verb
/ 9-hint closed enums; sidecar attach (NORMALIZATION §1a); opportunistic weave = spine-only QoL
payoffs (OPPORTUNISTIC §2-epoch); every claim provenance-cited. End every wave with a retro
(design-retros.log) + its gotchas (micro_gotchas.log / gotchas.log).
