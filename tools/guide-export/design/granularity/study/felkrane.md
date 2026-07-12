# Demonic Pacts: Felkrane Starter Route — Granularity Analysis

## Overview
- **476 total steps** across 6,330 progression points (Leagues task list)
- **6 major regions**: Civitas, Aldarin, Tal Teklan, Auburnvale, Karamja, Brimhaven
- **7 activity clusters**: Commerce (buy/sell), Resource gathering (mine/fish/chop), Crafting/smithing, Combat training (safespotting, range/melee), Questing, Hunter training, Herblore/farming cycles
- **Granularity range**: Atomic single-click (1/5) to coarse multi-hour bundles (2-3/5)

## Representative Step Breakdowns

### Example 1: Commerce Sequence (Moderate Granularity)
**Coarse:** "Mine 20 silver at Tal Teklan gemstone spot, bank, smelt into bars"

**Atomic unwinding:**
1. Withdraw best pickaxe + bucket of water
2. Walk northeast to gemstone spot
3. Click silver ore vein
4. Wait for ore (~5s per ore, × 20)
5. Bank ore when inventory full
6. Return to furnace
7. Use ore on furnace to smelt into bar (× 20)
8. Bank bars

**Inventory constraint:** Forces 2–3 banking trips for 20 ore; tight timings on pickup/drop cycles

---

### Example 2: Hunter Training (High Coarse-to-Atomic Ratio)
**Coarse:** "Complete 'Hunter Rumors' miniquest until 57 hunter"

**Atomic unwinding:**
1. Accept hunter rumor task at Hunter Guild
2. Walk to specified region (varies per rumor)
3. Catch specified creature type (e.g., tropical wagtails, snowy knights)
4. Repeat catch-and-drop cycles until quantity reached
5. Return to NPC, verify completion
6. Repeat from step 1 until hunter level 57 reached

**Quantity precision:** Step specifies "15 tropical wagtails" but doesn't state catch rate or trap success %; requires trial until implicit requirement met

---

### Example 3: Crafting Loop (Fine-Grained Atomicity)
**Coarse:** "Fletch 100 sets headless arrows from oak logs"

**Atomic unwinding:**
1. Withdraw 100 oak logs + knife
2. Click knife in inventory
3. Click logs (creates arrow shafts, batches of 15 per action ~3s)
4. Repeat until 100 arrowshafts created (≈7 actions)
5. Click arrow shaft with feathers (headless arrow batches, ~3s per 15)
6. Repeat until 100 headless arrows complete (≈7 actions)
7. Bank or drop completed arrows

**Click precision:** Each "fletch" action is a single inventory-menu click; batches reduce total actions but each batch is atomic

---

### Example 4: Combat Training (Obstacle-Heavy)
**Coarse:** "Safespot tree spirits until obtaining rune axe"

**Atomic unwinding:**
1. Walk to Auburnvale fairy ring (BKQ)
2. Equip staff of fire + chaos runes
3. Walk to tree spirit location
4. Identify safespot tiles (must stand behind obstacle blocking melee reach)
5. Click tree spirit to attack
6. Cast offensive spells (fire blast) each tick (~1.2s per cast)
7. Heal with food when HP < 30%
8. Wait for tree spirit death
9. Loot rune axe, repeat from step 5 until drop obtained
10. Bank axe, equip defensive gear

**Obstacle:** No stated drop rate; "until obtained" implies repeated attempts with unknown quantity; safespotting requires spatial awareness (not just click)

---

### Example 5: Multi-Step Quest Progression
**Coarse:** "Complete 'Meat and Greet' quest line"

**Atomic unwinding:**
1. Withdraw: gold, bucket milk, potato, combat equipment
2. Purchase 15 pineapples, tyras helm
3. Equip helm
4. Talk to NPC, trigger quest start
5. Walk to quest location (Ortus Farm)
6. Kill rat (small combat encounter, ≤5 hits)
7. Kill thief (small combat encounter)
8. Walk to Ortus Farm interior
9. Deposit pineapples in compost bin
10. Use churn to make butter (single use-X-on-Y action)
11. Make buttered potato (inventory combine)
12. Pickpocket master farmer for seeds
13. Progress through quest dialogue/triggers (walk to waypoint, auto-advance)
14. Complete Colosseum wave (sustained combat, ≥5 enemies)
15. Talk to gladiator, finish quest

**Quest gating:** Steps 4, 13, 15 are dialogue/trigger-based, not click-exact; combat steps (6–7, 14) contain variable enemy counts

---

## Granularity Patterns

### Ultra-Fine (5/5 — Single Click)
- "Drink one jug of wine" (single inventory use)
- "Equip dramen staff" (single equipment slot click)
- "Talk to NPC" (single dialogue click)
- "Scatter ashes at altar" (single interaction)

### Fine (4/5 — Single Short Action Sequence, <30s)
- "Mine 1 gold rock" (click, wait, pickup)
- "Fletch 1 willow shortbow (u)" (2–3 inventory clicks, ~5s)
- "Make 1 pizza base" (1–2 assembly actions)
- "Kill 1 cow, keep cowhide" (combat + loot pickup)

### Moderate (3/5 — Bundled Multi-Minute Task, 1–5 min)
- "Mine 20 silver ore at Tal Teklan" (20 ore × 3–5s each, bank cycles)
- "Craft 100 pastry dough" (100 dough ÷ 15 per batch ≈ 7 batches × ~5s each)
- "Catch 15 tropical wagtails" (repeat net-trap cycles, ~2–3 min including failures)
- "Smith 16 bronze arrowtips" (16 arrowheads × 2–3s each, plus smelting prerequisite)

### Coarse (2/5 — Long Sequence, 5–30 min per step, needs decomposition)
- "Fletch 100 willow longbows (u), decorate 25 totems with them" (fletching + totem placement, ~20 min)
- "Mine 273 iron ore at Cam Torum, bank 2–3 times" (implied multiple return trips, ~25 min)
- "Fish and cook until 65 fishing" (no catch rate stated; unclear start level; "until" is open-ended)
- "Complete 'Vale Totems' until 55 fletching" (multiple cycles of log chop → fletch → place, level-dependent duration)

### Ultra-Coarse (1/5 — Multi-Hour Goal, Heavy Decomposition Needed)
- "Hunter Rumors miniquest loop until 72 hunter" (10+ separate region trips, catch-rate variance, ≥2 hours)
- "Complete Karamja and Brimhaven diary chains" (50+ micro-tasks bundled; no explicit sub-task list)
- "Safespot Amoxliatl until obtaining pendant" (drop-rate unknown; implied multi-kill loop)

---

## Atomic Action Verbs Observed

1. **Movement:** walk-to, travel, teleport, fairy-ring, quetzal, climb, swing-rope, take-cart, jump
2. **Banking:** withdraw, bank, deposit
3. **Combat:** kill-N, safespot, equip-weapon, cast-spell, auto-retaliate, attack-click
4. **Gathering:** mine-N, fish-N, chop-N, catch-N, steal-from, pick-N, dig
5. **Crafting:** fletch, smith, craft, make-X, use-X-on-Y, string, decorate
6. **Commerce:** buy, purchase, sell, pay-fee
7. **Herblore:** clean, mix-potion, crush, drink
8. **Inventory:** drop, pick-up, open-pouch, equip, unequip, use-item
9. **Quest/NPC:** talk-to, speak-with, start-quest, complete-quest, activate-altar, progress-dialogue
10. **Agriculture:** plant, harvest, rake, compost, water
11. **Consumption:** eat, drink, bury, scatter

---

## Ordering & Efficiency Observations

### Inventory Management (Hard Constraint)
- Many tasks explicitly note "drop and pick up N items" to manage 28-slot inventory
- Example: Step 23 "Locate stolen cabbage, sit nearby" is purely an inventory-dump waypoint; sitting triggers no NPC dialogue or benefit (observed as inventory prep for next region)

### Travel Bundling
- **Quetzal ferry** (teleport) is primary fast-travel; overland walk is fallback when out of range
- Steps that "quetzal to [region]" are single click once at location, but imply prior arrival at ferry

### Banking Cycles (Implicit Substeps)
- Mining 273 ore requires 2–3 separate mine → bank → repeat loops
- Guide states "273 iron ore" but doesn't explicit sub-step "bank at ore: 90" → continue
- Implies player must deduce inventory-full trigger

### Level Gating (Uncertainty in Quantity)
- "Fish and cook until 65 fishing" assumes starting level (not stated)
- "Mine 20 silver and 3+ clay" gives exact count for silver, "3+" range for clay (no precision)
- "Catch implings until 36 hunter and 200 caught" — does this mean 200 total impling catches, or 200 unique types? (Ambiguity suggests need for micro-guide or experiential trial)

### Combat Safespotting (Skill-Dependent)
- "Safespot tree spirits" requires spatial awareness and client knowledge of obstacle placement; not a single click
- Actual atomic breakdown: position-check + attack-click + heal-click (repeating)
- Success rate is ~100% if safespot identified correctly, but location knowledge is prerequisite

---

## Summary: Faux Grain Assessment

| Aspect | Granularity | Notes |
|--------|-------------|-------|
| **Finest atomic unit** | **Single click or 1–2s action** (equip, talk, drink, attack) | Corresponds to RuneLite or in-game UI single interaction |
| **Most common step level** | **2–5 minute bundles** | Moderate; requires sub-decomposition for <1-min atomicity |
| **Longest coarse bundle** | **Hunter Rumors chain (~2+ hours)** | Multi-region, open-ended catch/drop cycles; no explicit sub-goals |
| **Precision** | **Exact counts for combat/quest drops; ranges for gathering** | "273 iron" (precise) vs "fish until 65" (level-dependent) |
| **Inventory awareness** | **Assumed but not explicitly taught** | Guide mentions drop/pick cycles but doesn't detail when to trigger banking |
| **Travel optimization** | **Quetzal > fairy ring > overland walk (by guide order)** | Implies fast-travel pathfinding is implicit player knowledge |
| **Overall score** | **2–3 / 5** | Mix of atomic fine-grained tasks and coarse progression goals; suitable for progression planner that unwinds further |
