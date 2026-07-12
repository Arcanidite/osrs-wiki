# B0aty HCIM Guide V3 — Granularity Analysis

## Guide Identity
- **Title**: B0aty HCIM Guide V3
- **URL**: https://oldschool.runescape.wiki/w/Guide:B0aty_HCIM_Guide_V3
- **Scope**: Song of the Elves endpoint with 70 Herblore requirement; ~20 episodes spanning 200+ banking locations
- **Target**: Ironman/HCIM progression roadmap using macroquesting and integrated skill cycles

---

## Granularity Structure

### Atomic Unit Definition
**Finest grain: single-action operations**
- Talk to one NPC (dialogue branch)
- Withdraw one item or stack from bank
- Click one object at one location
- Kill N creatures (exact count specified)
- Use item on object/NPC (one interaction)
- Toggle one prayer/interface element
- Plant one seed in one farming patch

### Example Atomic Steps (own words, ≤12 words)
1. Disable experience drop notifications in settings
2. Speak to Father Aereck; initiate Restless Ghost quest
3. Collect bones: 20+ across Lumbridge locations
4. Withdraw Law runes; teleport to Seers Lodge
5. Plant maple tree sapling in Farming Guild patch
6. Attack blue dragon 20 times using water blast
7. Interact with NPC to advance quest dialogue state
8. Defeat Foreman at Grand Tree entrance; gather drops
9. Retrieve 14 mithril claws from bank slot
10. Flinch-combat black knight using safespot positioning

---

## Step Grouping Pattern

**Primary clustering mechanism: Sequential Banking**
- Guide designates "Bank 1" through "Bank 104B" as inventory swap points
- Each bank represents ~1–5 related atomic actions bundled before next withdrawal
- Allows player to work through one inventory until depletion, then progress

**Secondary clusters:**
1. **Quest chains** — Multi-quest macroquesting (e.g., Restless Ghost + Rune Mysteries + Vampyre Slayer in parallel)
2. **Skill training blocks** — Concentrated XP phases (Tithe Farm 70–80 laps; Brimhaven Agility spike-jumping)
3. **Resource cycles** — Repeating farm runs, birdhouse maintenance, seaweed farming
4. **Combat encounters** — Boss safespots (Tree Spirit, Black Knight Titan, Hespori)
5. **Diary tasks** — Named achievement checklists (e.g., Lumbridge Easy: 15 specific actions)

---

## Unwind Examples: Coarse → Atomic

### Example 1: "Complete Waterfall Quest"
**Coarse intent**: Finish Waterfall dungeon and claim Glarials Amulet/Urn

**Atomic decomposition**:
- Navigate to Waterfall Dungeon north of Baxtorian Falls
- Enter dungeon; descend to floor 2
- Locate Tree Spirit boss area
- Position behind mushroom plant (safespot)
- Attack Tree Spirit with ranged until death
- Loot amulet and urn from drops
- Exit dungeon; return to Baxtorian Falls surface
- Proceed to next quest step

### Example 2: "Establish Farming Rotation Post-Episode 2"
**Coarse intent**: Manage 7 farming patches on weekly cycle with specific crops

**Atomic decomposition**:
- Withdraw teleport rune (Kourend teleport)
- Activate teleport; arrive at Farming Guild
- Inspect plant slot status at Guild patch
- Rake weeds (if present)
- Withdraw irit seed + compost from seedbox
- Plant irit seed; water with compost
- Bank remaining seeds at guild
- Activate CIR Fairy Ring (east of Kourend)
- Teleport to Farming Guild
- Repeat plant/water for 6 additional patches in sequence (Hosidius, Catherby, Ardougne, Falador, Morytania, Varlamore)
- Record expected harvest time on calendar

### Example 3: "Grind 70 Smithing via Giants Foundry (731,000 XP)"
**Coarse intent**: Complete mould-sequencing minigame repeatedly to accumulate enough XP

**Atomic decomposition**:
- Withdraw 14 mithril claws from bank
- Withdraw 7 battleaxes/warhammers
- Equip inventory space for Giants Foundry minigame
- Travel to Giants Foundry location
- Enter minigame interface
- Select mould type 1 (Flamberge Blade) from available sequence
- Place item 1 (mithril claw) into mould slot A
- Place item 2 (battleaxe) into mould slot B
- Wait for forge to complete (timed action)
- Collect bar/reward from output
- Repeat mould placement sequence 14 cycles (resource burn)
- Receive XP and bar reward
- Check XP progress counter
- If XP < 731,000: return to bank; repeat cycle
- If XP ≥ 731,000: stop; proceed to next quest

---

## Verb Taxonomy (Atomic Actions)

**Interaction verbs:**
- withdraw (from bank, exact slot)
- talk-to / speak-to (NPC dialogue)
- click (object, interface element)
- use-on (item + object interaction)
- toggle (prayer, setting, interface)

**Locomotion verbs:**
- teleport (via rune to destination)
- walk-to (location on map)
- climb (stairs, obstacles)
- descend (dungeon levels)
- navigate-to (area)

**Combat verbs:**
- kill-N (creature, exact count)
- attack (creature, positioning)
- safespot (boss via obstacle placement)
- flinch (NPC using tile-switching)
- cast (spell on target)
- bury (bones for prayer XP)

**Resource verbs:**
- collect / gather (items at location)
- bank (deposit items)
- plant (seed in patch)
- fish-until (skill level)
- fletch-until (skill level)
- burn (logs for firemaking)
- cut (tree, herb, wood)
- mine (ore, exact quantity)
- alch (item for magic XP)

**Progression verbs:**
- complete-quest (turn in to NPC)
- unlock (teleport, area access)
- craft-at (facility like Giants Foundry)
- quest-complete (end dialogue chain)
- loot (item drop after combat)

---

## Granularity Assessment

**Scoring: 3.5–4 out of 5**
(5 = single-click atomic; 1 = coarse campaign-level)

**Rationale:**
- Guide designates 200+ "Bank" swap points, indicating fine-grained inventory management awareness
- Each bank bundled with 1–5 related atomic actions (e.g., "Bank 5: withdraw items for Shield of Arrav quest")
- Explicit NPC names, locations, and exact quantities (454 feathers, 20 blue dragons, 70+ bones)
- Combat strategies specify safespot technique names and positioning (flinching, mushroom obstacle behind Tree Spirit)
- Skill training blocks aggregate multiple reps of one action (80 Tithe Farm laps, 14 mithril claws in Giants Foundry) into single "step"
- Farm rotation specifies 7 patches in sequence + patch-specific crops (maples, irits, cacti)
- **Missing**: Exact click-count per interaction, exact server-to-inventory time estimates, pixel-perfect coordinate guides

**Conclusion**: Guide is **medium-atomic** — coarse players see "Bank 1→Bank 104B" progression, but decomposing each bank yields 2–5 atomic player actions. Supports both "macro" and "micro" play styles.

---

## Banking Structure Example

**Banks 1–24 (Episode 1: Starting Out to Waterfall Quest)**
- Bank 1: Disable notifications, begin Restless Ghost dialogue
- Bank 2–4: Collect runes, perform Agility training (5), cut arrowshafts
- Banks 5–10: Execute quest chain (Shield of Arrav dialogue + book search)
- Banks 11–15: Gather resources (garlic, cheese, molten glass 100 soda ash + 100 sand)
- Banks 20–24: Waterfall Quest combat (Tree Spirit safespot); claim Glarials items

Each bank represents a **withdrawal-to-depletion cycle**, with 1–3 discrete locations and 2–5 atomic actions per location.

---

## Key Findings for OSRS Progression Planner

1. **Macroquesting integration**: Guide overlaps multiple quests (Restless Ghost + Rune Mysteries + Vampyre Slayer) to reuse travel and item collections—not atomic per quest, but atomic per **bank state**.

2. **Skill cycles embed into quest blocks**: Agility training at Draynor (Bank 2) occurs while awaiting dialogue resets. Thieving at Lumbridge/Ardougne cake stalls (Bank 28) precedes Fremennik Trials access.

3. **Farming as continuous background**: Patch runs are **not** grouped into discrete banks; instead, guide notes "whenever you withdraw gear for the next step, perform a farm run." This creates a **semi-atomic loop** (check patch, plant, teleport) that repeats every 1–2 banks.

4. **Resource stockpiles specify exact counts**: 1,200 nature runes, 500 law runes, 5,300+ feathers, 70+ bones. No "approximately" language; guide assumes deterministic resource gathering.

5. **Combat safespot names are atomic**: "Black Knight Titan flinching," "Tree Spirit mushroom," "Hespori protect magic prayer" — each combat maneuver is a reusable atomic pattern.

6. **Granularity bottleneck: Herblore farming**
   - Guide explicitly states: "You will probably finish every step and still lack 70 Herblore."
   - Medium Contracts + herb runs are **mandatory low-granularity padding** to hit final boss requirement.
   - This forces the planner to backfill herb gathering as a **non-atomic loop** (run medium contract → plant herb → advance other steps in parallel).

---

## Implications for Guide-Chain Plugin

**Recommend encoding B0aty HCIM at 3.5–4 granularity:**
- Each "Bank" state = one UI checkpoint (show current bank#, inventory slot recipe, next 2–3 locations)
- Expand "Bank N" on click to show ordered atomic actions (talk-to, kill-N, collect, click) with location pins
- Display farm cycle as **semi-detached side-loop** (every 1–2 banks, trigger farm check reminder)
- Color-code resource stockpiles (e.g., highlight if < 500 law runes after bank withdrawal)
- Treat Herblore as **dynamic bottleneck counter** (show XP gap to 70 after every bank, suggest contract runs if trailing)
- Combat safespot patterns as **bookmarked technique templates** (flinch, cage capture, blast spell positioning)

**Planner unwind depth: 2–3 levels**
1. Coarse: "Episode 2: Banks 25–75"
2. Medium: "Bank 37: Blackjacking to 50 Thieving"
3. Atomic: "Withdraw blackjack + armor → walk to Yanille rough house → interact with NPC → repeat until 50"

---

## Metadata

- **Granularity slug**: b0aty-hcim
- **Analyzed date**: 2026-07-12
- **Episode scope**: 1–3 (Banks 1–104B; Song of the Elves endpoint partial)
- **Excluded**: Episodes 4–20 (post-SotE content deferred)
- **Atom count**: ~500+ (estimated across 200+ banks, 2–5 atoms per bank)
