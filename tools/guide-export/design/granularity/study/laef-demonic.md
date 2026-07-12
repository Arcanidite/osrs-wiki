# Laef Demonic Pacts Starting Guide — Granularity Analysis

## Source
**Guide:** Leagues: Demonic pacts starting guide by Laef  
**Scope:** Universal progression path for Demonic Pacts League (April 15 - June 10, 2026)  
**Tiers Covered:** Tier II through IV + branching routes

---

## Tier II: Starting Out (Money and Early Hunter)
**Target:** 600 points, unlock first relic

### Activities (coarse grouping):
1. Complete opening tutorial and initial starter tasks
2. Train thieving from level 5 to 20
3. Cut gems to accumulate approximately 356,000 coins
4. Reach combined skill total level 100
5. Train hunter from 1 to 46 via random encounters
6. Acquire spade, impling jar, strange devices, dramen staff
7. Unlock access to Hunter Rumours
8. Select Endless Harvest as Tier I relic unlock

**Atomic decomposition example:**
- "Reach combined level 100" unwraps to: train thieving to 20, train hunter to 46, train other skills, verify total >= 100

---

## Tier III: Hunter Rumours and Wealthy Citizens
**Target:** 1220 points, unlock Karamja region, select Tier III relic

### Activities (coarse grouping):
1. Run agility course 666 times for progression points
2. Train thieving from level 34 to 66+
3. Complete "Death on the Isle" quest for region/ability unlock
4. Execute Stealing Valuables minigame repeatedly until coin/valuables target
5. Complete Hunter Rumours tasks (optional 50 total for extended coverage)
6. Gather blessed bone shards from Rumours (minimum ~650, max ~1600)
7. Unlock Karamja region via point accumulation
8. Select Map of Alacrity as Tier III relic

**Atomic decomposition example:**
- "Run agility course 666 times" → each repetition = click/jump sequence at course; no sub-steps; pure grind
- "Gather blessed bone shards ~650" → complete Rumour tasks until shards accumulate to target; exact count varies

---

## Tier IV: Prayer and High Alchemy
**Target:** 2600 points, unlock Tier IV relic

### Activities (coarse grouping):
1. Complete "The Ribbiting Tale of a Lily Pad Labour Dispute" quest
2. Train prayer from 5 to 50 via libation bowl bone burial
3. Train magic from 9 to 55 through combat and alchemy
4. Practice combat on dummies
5. Hunt blue dragons at Dragon Nest
6. Execute high alchemy transmutations (800 nature runes + 1500 air/water/earth/fire each)
7. Acquire house and perform construction tasks
8. Accumulate target point total (2600)
9. Select Butler's Bell as Tier IV relic

**Atomic decomposition example:**
- "Train prayer 5→50 via libation bowl" → locate libation bowl, click bury, repeat until level 50; no substeps
- "Alchemy 800+ transmutations" → cast high alchemy on item N times until count/points reach target
- "Hunt blue dragons at Dragon Nest" → navigate to location, engage dragons, collect loot, repeat until task complete

---

## Resource Requirements (Inventory Precision)

### Gathered/Produced:
- Blessed bone shards: 617–1600 (from Hunter Rumours, exact count task-dependent)
- Coins: accumulated via gem cutting (~356k Tier II) and stealing minigame
- Impling jars: collected for hunter training
- Runes: acquired via trade or production
  - 500 Mind runes, 500 Chaos
  - 800 Nature runes
  - 1500 each Air, Water, Earth, Fire
  - 100 Cosmic, 50 Death

### Equipment chain:
- Bronze/Adamant/Mithril armor (progressive upgrades)
- Elemental staves
- Anti-dragon shield
- Molds: amulet, ring (for crafting)

---

## Step Clustering and Progression Logic

### By Tier (Checkpoint Grouping):
- **Tier II checkpoint:** Tutorial → Thieving/Hunter groundwork → Initial unlock
- **Tier III checkpoint:** Agility grind + Thieving push + Regional quest + Bone gathering
- **Tier IV checkpoint:** Prayer/Magic training + Combat engagement + House mechanics + Final point push

### By Activity Type (Skill Clustering):
- **Gather loops:** Rumours, bone shards, impling jars (repeat until count)
- **Grind loops:** Agility course (exact reps: 666), alchemy casts (exact runes), theft repeats
- **Training blocks:** Thieving (multi-tier progression), Hunter (fixed endpoint per tier), Prayer (libation bowl endpoint), Magic (dual path: combat + alchemy)
- **Quest gating:** Death on the Isle (Tier III unlock), Ribbiting Tale (Tier IV unlock)

---

## Atomic Action Verbs Observed

1. **complete** — tutorials, quests, tasks
2. **train** — skills to target level (thieving, hunter, prayer, magic)
3. **grind** — agility course, rumours, theft repeats
4. **gather/collect** — bone shards, impling jars, items
5. **cut** — gems for currency
6. **steal** — valuables via minigame
7. **hunt/catch** — imps, blue dragons
8. **bury/libate** — bones via bowl for prayer XP
9. **alchemy** — transmute items with nature/elemental runes
10. **unlock** — regions, relics, abilities via point thresholds

---

## Granularity Assessment

**Score: 2–3 out of 5** (coarse to semi-atomic)

**Rationale:**
- Most steps group **multiple sub-activities** into a single bullet (e.g., "Thieving progression 5→20" omits location choices, quest vs. pickpocketing method, exact sequencing)
- **Grind loops** are identified by count (e.g., "666 jumps") but don't decompose clicking/animation cycles
- **Resource quantities** are specified or bounded (617–1600 shards) but don't lock exact item-by-item pickup sequences
- **Quest completion** is treated as atomic ("Death on the Isle") rather than unwound into dialogue steps
- **Training endpoints** are clear (level targets) but method selection is implicit (e.g., "prayer training" via libation bowl is only one choice among many)

**Faux Grain:** A single coarse step like "Train thieving 5→20" decomposes into: {choose training method, navigate to location, repeat action until level reaches target}. This is 3–5 sub-actions, not 1–2 click-level atomics.

---

## Next-Tier Branching

After Tier IV, route diverges into:
- **Skilling Route:** resource gathering emphasis
- **Combat Route:** Moons of Peril focus

Both converge on first region unlock and Fire Cape acquisition target.
