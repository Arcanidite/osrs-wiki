# Faux Starting Guide: Granularity Analysis

## Guide Context
- League: Demonic Pacts (April 15 - June 10, 2026)
- Target: 3,300+ points, 181 tasks
- Scope: Early-game progression from Varlamore → Karamja

---

## Part 1: Starting Out in Varlamore — Granularity Breakdown

### Thieving & Commerce Flow
**Coarse intent:** "Gather starting capital and core items"

**Atomic decomposition:**
1. Pickpocket citizen → reach level 5 Thieving (single action, cumulative)
2. Steal 14+ cakes from Bazaar stall (repeated pickpocket action, count explicit)
3. Sell cakes to Fortis General Store one-at-a-time (not bulk; sequential)
4. Withdraw coins, verify 260+ gp available
5. Buy knife (1)
6. Buy chisel (1)
7. Buy spade (1)
8. Buy bird snares (2)
9. Buy pink skirt
10. Buy brown apron
11. Buy red cape

**Granularity observation:** Each item is a separate shop interaction. Selling "one-at-a-time" is explicitly sequential (efficiency constraint). No bulk actions.

---

### Glassblowing Cycle
**Coarse intent:** "Reach 20 Crafting via glassblowing"

**Atomic decomposition:**
1. Travel to Fortis Colosseum
2. Talk to Gladiator (NPC interaction)
3. Talk to Port master (NPC interaction)
4. Buy 10 Bucket of sand
5. Buy 10 Soda ash
6. Buy Glassblowing pipe
7. Make 10 Molten glass at furnace
8. Deposit molten glass
9. Buy 10 Bucket of sand (repeat)
10. Buy 10 Soda ash (repeat)
11. Make 10 Molten glass (repeat)
12. Blow 10 molten glass into oil lamps (reaches 20 Crafting)

**Granularity observation:** Multi-cycle pattern. Each cycle is: buy-batch → make-batch → deposit. Counts are exact (10/10/10). No approximations.

---

### Farming & Herbalism Tasks
**Coarse intent:** "Complete low-level farming/herbalism interactions"

**Atomic decomposition:**
1. Pick 6 Cabbage (drop after pick)
2. Kill 1 Chicken, collect bone
3. Sit emote by Stolen cabbage patch
4. Pick Sweetcorn (drop after pick)
5. Feed bone to Molossus
6. Pick 1 Onion (eat after pick)
7. Pick 6 Wheat (keep 1, drop 5)
8. Make Flour at windmill
9. Pick 6 Potatoes (drop after pick)
10. Buy Rake from Harminia
11. Rake Flower patch
12. Milk Buffalo
13. Shear 1 Alpaca

**Granularity observation:** Each plant interaction is atomic: pick-X, drop-X, keep-1. Inventory slots matter. Drop/keep actions are explicit. Kill-count is exact (1 Chicken).

---

## Part 2: Zanaris, Aldarin & Gem Cutting

### Gem Cutting Money-Making Loop
**Coarse intent:** "Accumulate 50k gp via gem cutting multiplier"

**Atomic decomposition:**
1. Deposit all items at Aldarin bank
2. Withdraw coins
3. Buy uncut Sapphire (batch size not specified; scale to budget)
4. Cut Sapphire (one-at-a-time; 7x GP multiplier vs bulk)
5. Sell cut Sapphire
6. Repeat: Buy → Cut → Sell
7. Upgrade to Emeralds when affordable
8. Upgrade to Rubies when affordable
9. Target 50k gp threshold
10. Buy 3 Sapphire, 3 Emerald, 3 Ruby for later (stockpile)

**Granularity observation:** "Cut one-at-a-time" is explicit (not fast-alch spam). Multiplier advantage (7x) is the efficiency driver. No bulk cutting. Stockpile quantity is exact (3 each).

---

### Fishing & Treasure Tasks
**Coarse intent:** "Gather fishing artifacts and consumables"

**Atomic decomposition:**
1. Fish at pond until obtaining Casket (1)
2. Continue fishing until obtaining Old boot (1)
3. Continue fishing until obtaining House key (1; drop rate 1/10 noted)
4. Buy 1 Cup of tea at bar
5. Buy 1 Moon-lite at bar
6. Buy 1 Stew at bar
7. Buy 1 Jug of wine at bar
8. Drink Moon-lite (consume)
9. Drink Jug of wine (consume)

**Granularity observation:** Fishing is not a count; specific drops must be acquired. Drop rates acknowledged (house key 1/10). Consumable actions are explicit verbs: drink.

---

## Part 3: Auburnvale, Tal Teklan & Skilling

### Woodcutting & Forestry Multi-Stage Progression
**Coarse intent:** "Progress Woodcutting to 48, Fletcher to 55+ via relic synergy"

**Atomic decomposition (if Endless Harvest relic active):**
1. Chop dead tree near river, toggle Endless Harvest OFF until banking 45 logs
2. Toggle Endless Harvest ON
3. Chop oak until banking 60 logs
4. Burn 1 log
5. Fletch 1 shortbow from oak
6. Fletch 25 oak arrow stocks
7. Decorate Oak totem (consume 5 oaks)
8. Chop willow until burning 100 (burn task complete)
9. Bank 56 Willow logs
10. Fletch 1 willow shortbow
11. Fletch 50 willow longbows
12. Decorate Willow totem (consume 5 willows)
13. Fletch 1,000 arrow shafts from remaining oaks/willows (cumulative)
14. Chop 50 Maple logs
15. Burn 25 Maple logs
16. Bank 25 Maple logs
17. Fletch 25 Maple longbows

**Granularity observation:** Relic toggle is a state-machine action. Counts are granular: burn-1, fletch-1, fletch-25, decorate-5, fletch-1000. Each count is explicit, not approximate. Multi-stage progression gated by skill level.

---

### Hunter Contract Blocking Strategy (46-91 Hunter)
**Coarse intent:** "Efficiently reach 91 Hunter via contract optimization"

**Atomic decomposition (Adept 46-72):**
1. Access Hunter menu settings
2. Toggle OFF "Back to Back" setting
3. Obtain task from Cervus
4. Obtain task from Ornus
5. Speak to Gilman, select "Block Snowy knight"
6. Speak to Cervus, select "Block Pyre fox"
7. Use Ornus contract as primary
8. Focus exclusively on Embertailed jerboa tasks from Ornus
9. Complete 10 rumours → unlock Whistle Blueprint
10. Continue to 72 Hunter

**Expert Level (72-75):**
1. Obtain task from Aco
2. If assigned Sunlight antelope: catch 25, then obtain task from Teco
3. Focus only on Red chinchompa tasks

**Master Level (75+) Blocklist:**
1. Speak to Gilman, select "Block Snowy knight"
2. Speak to Cervus, select "Block Sunlight moth"
3. Speak to Ornus, select "Block Pyre fox"
4. Speak to Aco, select "Block Sunlight antelope"
5. Speak to Teco (default Red chinchompa)
6. Estimate 3.5 hours to 99 Hunter

**Granularity observation:** Each NPC block is one atomic action. Focus directives are state changes (not repeated actions). Rumour counter is a threshold trigger (10 = unlock). Level gates are hard boundaries (46, 72, 75, 91).

---

## Part 4: Karamja Unlock & Diary Completion

### TzHaar Combat Strategy
**Coarse intent:** "Gather TzHaar items and complete combat tasks"

**Atomic decomposition:**
1. Travel to Karamja Volcano
2. Enter Mor Ul Rek (TzHaar area)
3. Safespot any TzHaar with water spells (positioning constraint)
4. Withdraw food, axe, slayer staff
5. Kill Snake near Fruit tree patch
6. Enter Brimhaven Dungeon
7. Safespot Black demon (positioning constraint)

**Granularity observation:** Safespot actions are combat positioning, not kills per se. No kill counts specified (open-ended). Food/supplies are prerequisites (inventory management). NPC interactions (enter dungeon) are atomic.

---

### Tai Bwo Wannai Cleanup
**Coarse intent:** "Progress quest via jungle clearing and gathering"

**Atomic decomposition:**
1. League menu teleport to Karamja
2. Travel south to Tai Bwo Wannai
3. Buy Machete from general store
4. Speak to Murcaily (initiate quest)
5. Cut Dense Jungle until fully depleted (single zone clear)
6. Travel south
7. Catch Karambwanji (gathering action)

**Granularity observation:** Jungle depletion is zone-based (fully depleted = one action). Catching is gathering (no count specified, implies repeatable). NPC initiation is talk-to.

---

## Efficiency Patterns Identified

1. **Sequential vs. Bulk**: "Sell cakes one-at-a-time" and "Cut gems one-at-a-time" are efficiency directives (not bulk actions).
2. **Relic Toggle State**: Endless Harvest relic is toggled ON/OFF to control log banking.
3. **Positioning Constraints**: Safespot, spawn-camp, wait-for-NPC-to-pass (Ent trail).
4. **Conditional Branches**: "Skip if under 17 Hunter" (level gate); "If assigned Sunlight antelope: catch 25 then get task from Teco" (conditional task chain).
5. **Exact Counts**: No approximations; 666 hops, 150 arrows, 3 gems of each type.
6. **Inventory Gating**: Drop after pick, keep 1, deposit/withdraw named items.
7. **Blocklist Strategy**: NPC blocks are persistent (once set, continue unless changed).
8. **Threshold Triggers**: 10 rumours → unlock blueprint; 50k gp → upgrade to next gem tier.

---

## Skill Progression Gates

| Skill | Target | Trigger | Atomic Gate |
|-------|--------|---------|-------------|
| Thieving | 5 | Pickpocket citizen | First kill |
| Thieving | 36 | Pickpocket Farmer | Coin pouch collection (28) |
| Woodcutting | 15 | Chop tree | Banking 15+ logs |
| Woodcutting | 48 | Chop oak/willow/maple | Banking 60+56+50 logs |
| Fishing | 10+ | Fish shrimp (EH toggle off) | Banking several raw shrimp |
| Fishing | 37 | Bait fish, net fish, big net fish | Progression through species |
| Hunter | 46 | Complete Adept tasks | Access Adept contract pool |
| Hunter | 72 | Complete Adept tasks | Unlock Expert pool |
| Hunter | 91 | Complete Master tasks | Milestone checkpoint |
| Crafting | 20 | Blow glass | Oil lamp crafting |
| Crafting | 70 | Cut gems | Banking ~400k gp via multiplier |

---

## Granularity Score: 4.5 / 5 (Single-Click Atomic)

**Rationale:**
- Nearly all steps are one action (click NPC, cast spell, kill-N, catch-N, fletch-N)
- Exact quantities mandate specific repetition counts (not approximated)
- Inventory operations (deposit/withdraw/drop) are explicit, not inferred
- State machines (toggle Endless Harvest, set blocklists) are one-time atomic
- Conditional branches gate progression by level or relic choice
- No ambiguous "grind until X" directives; counts are measurable

**Caveats:**
- Some fishing/gathering tasks lack counts ("fish until obtaining drop")
- Safespot positioning is described but not pixel-precise
- Multi-action chains (e.g., "complete cleanup quest") require sub-step inference
- Relic choice (Endless Harvest vs. others) branches the entire arc differently

