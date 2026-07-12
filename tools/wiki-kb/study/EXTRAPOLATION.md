# EXTRAPOLATION — the overarching checklist + wave-3 pre-scoping (W2 fable extrapolator)

Derived from: contrib.jsonl (161 entries — 123/123 route-p2p steps enriched + 5 travel
references + 33 study patterns, consolidation complete per `## consolidate retro`),
manifest.jsonl (299 blobs), queue.jsonl (78 pending `lane5:*` tickets + 2 `coord-fix:*`
+ 1 `consolidate-xp:*`), route-p2p.json (123 steps), SYNTHESIS.md, GRANULARITY.md.

Conventions in this file:
- **Every numbered item is an EQUAL-GRADE checklist item.** Finer-scaffolded items sit
  inline at the same rank as coarse ones; `PHASE:` / `CHKPT:` lines are labels only,
  never parents (GRANULARITY §7 equal-grade rule).
- `refs:` = manifest.jsonl slugs that ground the item (already fetched — compound, never
  re-fetch). `(GAP)` = item the current chain lacks (detailed in §2). `UNGROUNDED` = no
  fetched page grounds the item yet; content is a placeholder pending its §3 wave-3 scope.
- Ordering: route-p2p emission order is the spine; gap items are inserted at the position
  their prerequisite edges imply. Insert positions of GAP items are extrapolated (the
  wiki grounds the *dependency*, not the *slot*).

---

## 1. THE OVERARCHING CHECKLIST

### PHASE: Bootstrap — combat spine + first quests (CHKPT combat-training-routing 0–1)

1. Kill chickens until Attack 10 at Lumbridge farm; bury every bone, keep feathers — `ctr-01-kill-chickens` — refs: Chicken, Pay-to-play_Melee_training.s5
2. Kill cows until Strength 20 east of Lumbridge; bank cowhides, loot coins for the scimitar fund — `ctr-02-kill-cows` — refs: Cow
3. Quest: Cook's Assistant — `quest-cooks-assistant` — refs: Cook's_Assistant_Quick_guide.s1/.s2/.s3, Cook's_Assistant.s1/.s9
4. Quest: RFD — Another Cook's Quest (banquet unlock) — `rfd-intro` — refs: Recipe_for_Disaster_Another_Cook's_Quest.s1/.s4
5. (GAP) Quest: The Restless Ghost — gates Nature Spirit → Fairytale I → Swan Song chain — UNGROUNDED (page not fetched; PROPOSED-ID quest-restless-ghost already minted in contrib)
6. (GAP) Quest: Rune Mysteries — hard gate on Ardougne Easy diary task 1 — refs: Rune_Mysteries_Quick_guide.s2
7. (GAP) Quest: Goblin Diplomacy — hard gate on rfd-goblins — refs: Goblin_Diplomacy_Quick_guide.s3 (fetched, unmined; PROPOSED-ID quest-goblin-diplomacy minted)
8. Buy the best scimitar your Attack allows from Zeke (Al Kharid, 10-coin gate toll) — `ctr-03-buy-scimitar` — refs: Zeke's_Superior_Scimitars.s1, Zeke, Al_Kharid.s1
9. Equip the scimitar — `ctr-04-equip-scimitar` — refs: Scimitar.s2, Bronze_scimitar, Iron_scimitar, Steel_scimitar, Mithril_scimitar
10. Train Prayer to 22 burying bones banked from the combat spine — `train-prayer-22` — refs: Pay-to-play_Prayer_training.s1 (real delta 5,624 xp; fixture 4,470 flagged)

### PHASE: Early skilling spread (Lumbridge/Draynor hub, no-bank checkpoints)

11. Fishing 20 — shrimp/anchovies at Draynor or Lumbridge Swamp — `train-fishing-20` — refs: Pay-to-play_Fishing_training.s1
12. Cooking 20 — cook the catch on a range — `train-cooking-20` — refs: Pay-to-play_Cooking_training.s3
13. Woodcutting 15 — regular trees — `train-woodcutting-15` — refs: Pay-to-play_Woodcutting_training.s4
14. Firemaking 15 — line-light normal logs — `train-firemaking-15` — refs: Pay-to-play_Firemaking_training.s3
15. Mining 15 — copper/tin (Lumbridge swamp mine) — `train-mining-15` — refs: Pay-to-play_Mining_training.s8, East_Lumbridge_Swamp_mine, Lumbridge_Swamp.s3
16. Smithing 15 — bronze bars + anvil work — `train-smithing-15` — refs: Pay-to-play_Smithing_training.s3
17. Crafting 20 — leather from banked cowhides via the tanner (non-GE rewrite of the fixture's "buy hides from GE") — `train-crafting-20` — refs: Pay-to-play_Crafting_training.s3, Tanner, Cow
18. Thieving 20 — pickpocket Men/Women at Lumbridge or Edgeville (marker fixed to real Man LocLine pins) — `train-thieving-20` — refs: Man.s1/.s3/.s4/.s6/.s11/.s12
19. Magic 25 — early band; 1–21 is quest/combat-cast xp, Low Alch from 21 — `train-magic-25` — refs: Pay-to-play_Magic_training.s5 (pre-21 method UNGROUNDED)
20. Woodcutting 30 — oaks east of Draynor bank (lvl-26 jail guards patrol) — `train-woodcutting-30` — refs: Pay-to-play_Woodcutting_training.s5/.s18

### PHASE: Combat 20s→40s (CHKPT combat-training-routing 2)

21. Kill barbarians until Att/Str/Def 30, rotating styles; restock trout from the adjacent spot+fire — `ctr-05-kill-barbarians` — refs: Barbarian, Pay-to-play_Fishing_training.s4
22. Defence 30 rides the same spine (cows/goblins fallback) — `train-defence-30` — refs: Cow
23. Stronghold of Security level 2: Flesh Crawlers until 40/40/40; claim floor coin rewards — `ctr-06-stronghold-crawlers` — refs: Flesh_Crawler, Stronghold_of_Security.s3/.s7
24. Attack 40 / Defence 40 close-out (Barbarians/Stronghold; corrected delta 23,861 xp) — `train-attack-40`, `train-defence-40` — refs: Barbarian, Experience_table.s2
25. (GAP) Gear stop: re-buy scimitar tier at each Attack breakpoint; past mithril the non-GE source is the Zanaris scimitar shop (post-Lost City) — refs: Zeke's_Superior_Scimitars.s1, Zanaris.s4 (Jukat stock UNGROUNDED)

### PHASE: Morytania + Herblore unlock quests

26. Quest: Priest in Peril (Morytania access; Prayer +1,406 verified) — `quest-priest-in-peril` — refs: Priest_in_Peril_Quick_guide.s1/.s6, Priest_in_Peril.s1/.s7
27. Quest: Nature Spirit (reqs PiP + Restless Ghost; rewards Crafting +3000/Def +2000/HP +2000 — NOT prayer, fixture corrected) — `quest-nature-spirit` — refs: Nature_Spirit_Quick_guide.s1/.s6, Nature_Spirit.s1/.s7
28. Quest: Druidic Ritual (Herblore unlock; Kaqemeex start 2926,3484) — `quest-druidic-ritual` — refs: Druidic_Ritual_Quick_guide.s1/.s2/.s3, Druidic_Ritual.s1/.s6
29. Herblore 10 — clean grimy guam — `train-herblore-10` — refs: Grimy_guam_leaf, Pay-to-play_Herblore_training.s2
30. Quest: The Feud (Thieving 30 exact; Thieving +15,000 verified) — `quest-the-feud` — refs: The_Feud_Quick_guide.s1/.s11, The_Feud.s1/.s8

### PHASE: Farming infrastructure + prayer-pot supply (CHKPT prayer-pot-supply-coarse 0–3)

31. Farming 17 — potato/onion/cabbage allotments with compost; RECURRING at banking breaks — `train-farming-17`, `bg-farm-allotment-setup` — refs: Pay-to-play_Farming_training.s4/.s5, Allotment_patch, Allotment_patch_Patches.s1, Allotment_patch_Seeds.s1
32. Bootstrap gather: guam weed/seeds before the loop exists (one-time, non-GE; dynamic drop-source template degrades to the literal spawn found) — `bootstrap-gather-guam_weed-prayer-pot-supply` — refs: Guam_seed.s2/.s3, Grimy_guam_leaf.s3
33. Guam herb-patch loop (early Herblore feed, ~80 min cadence) — `farm-herb-patch-guam` — refs: Herb_patch, Herb_patch_Seeds.s1
34. Thieving 38 — H.A.M. members (hideout pinned) — `train-thieving-38` — refs: H.A.M._member.s1/.s4/.s5/.s7/.s8, H.A.M._Hideout.s1/.s2/.s3/.s6
35. Pickpocket Master Farmer for ranarr seeds (Draynor pin corrected to 3080,3250; any of 8+ spawns works) — `pps-02-steal-ranarr-seeds` — refs: Master_Farmer.s1/.s3/.s4/.s5/.s12
36. (GAP) Quest: The Dig Site — gates Bone Voyage (with 100 Kudos) AND Desert Treasure — UNGROUNDED (PROPOSED-ID quest-dig-site minted)
37. (GAP) Reach 100 Kudos — Bone Voyage gate; threshold currently unmodeled in reqs schema — UNGROUNDED
38. Quest: Bone Voyage (Fossil Island unlock; zero xp reward verified) — `quest-bone-voyage` — refs: Bone_Voyage_Quick_guide.s1/.s7, Bone_Voyage.s1/.s7
39. Mining 22 (real row to replace synth-mining-22-8; PROPOSED train-mining-22) then mine volcanic ash at the Fossil Island ash piles during farm-run downtime — `gather-volcanic-ash` — refs: Volcanic_ash(.s1/.s3/.s6/.s7), Fossil_Island_Volcano(.s1), Fossil_Island.s1/.s2/.s3, Pay-to-play_Mining_training.s9
40. Buy pineapples from a Trader Crewmember (charter dock; 15 base stock, restock 1/100s — wait cycles or hop docks; "~100/visit" fixture claim corrected) — `source-pineapples-charter` — refs: Trader_Crewmember.s1/.s3, Charter_ship.s1, Pineapple.s4
41. Make ultracompost — CORRECTED recipe: 15 supercompostable items + 25 ash per regular bin (30+50 for the Big Compost Bin), or 2 ash directly per bucket of supercompost — `setup-ultracompost` — refs: Ultracompost.s1/.s2, Compost_bin.s1/.s3
42. Bank: withdraw compost-run loadout (coins + transport; nearest real bin to the Ectofuntus zone label is 3610,3522 "west of Port Phasmatys") — `pps-01-withdraw-compost-run` — refs: Compost_bin.s3
43. Quest: Lost City (Crafting 31 + Woodcutting 36 verified; WC 36 = PROPOSED train-woodcutting-36 replacing synth) — `quest-lost-city` — refs: Lost_City_Quick_guide.s1/.s3, Lost_City.s1/.s6
44. Quest: Fairytale I — Growing Pains (herb patches unlock; farming:17 req is NOT wiki-sourced, flagged) — `quest-fairytale-1` — refs: Fairytale_I_-_Growing_Pains_Quick_guide.s1/.s7, Fairytale_I_-_Growing_Pains.s1/.s9
45. (GAP) Fairytale II — partial completion to unlock fairy rings (prereq chain grounded on the Fairy ring page; quest page itself unfetched) — refs: Fairy_ring.s1 — quest walkthrough UNGROUNDED
46. Fairy rings available — full code→tile table captured (55 active codes) — travel reference — refs: Fairy_ring.s1/.s3/.s4/.s5, Aldarin_fairy_ring
47. Bank: withdraw herb-run loadout; all four teleport-per-patch claims verified (Explorer's ring→Falador, Camelot→Catherby, cloak→Ardougne, Xeric's→Hosidius) — `pps-03-withdraw-herb-run` — refs: Allotment_patch_Patches.s1, Herb_patch
48. Ranarr herb-run RECURRING loop (~80 min; yield "??" until measured) — `farm-ranarr-patch` — refs: Herb_patch, Herb_patch_Seeds.s1, Ranarr_weed.s1
49. Herblore 38 — attack/strength/stat-restore potions from gathered secondaries (non-GE rewrite) — `train-herblore-38` — refs: Pay-to-play_Herblore_training.s2/.s6, Strength_potion.s3
50. Gather snape grass (Waterbirth/Mudskipper spawns; JIT before brew sessions) — `gather-snape-grass` — refs: Snape_grass.s2/.s5/.s7
51. Stock vials of water — Jatix vendor packs or self-fill free at any water source — `pps-04-source-vials` — refs: Jatix's_Herblore_Shop(.s1), Vial_pack.s1/.s2, Vial_of_water.s1/.s4/.s5
52. Bank: withdraw brew loadout; clean grimy ranarr (Hb 25) + mix unf (Hb 30) en route — `pps-05-withdraw-brew` — refs: Ranarr_weed.s1, Ranarr_potion_(unf).s1
53. Brew prayer potions — CORRECTED gate Herblore 38 (not 52); base output is a 3-dose potion (4-dose only via chemistry/alchemist amulets) — `brew-prayer-potion` — refs: Prayer_potion.s1/.s2/.s4
54. Bank: deposit prayer potions until the active goal's demand is met (e.g. Barrows ~20), else the loop keeps firing — `pps-06-deposit-potions` — refs: Prayer_potion.s2/.s4

### PHASE: Mid skills + economy

55. Magic 43 — Superheat Item from 43 (53 xp/cast, passive Smithing xp) — `train-magic-43` — refs: Pay-to-play_Magic_training.s11
56. Smithing 30 — iron: mine at Al Kharid mine (non-GE rewrite) — `train-smithing-30` — refs: Al_Kharid_mine(.s1), Pay-to-play_Smithing_training.s3
57. Smithing 40 — steel; iron platebody→steel warhammer ladder closes 1→40 at exactly 37,224 xp — `train-smithing-40` — refs: Pay-to-play_Smithing_training.s3/.s7
58. Smithing 45 (PROPOSED train-smithing-45 replacing synth-smithing-45-13; Swan Song gate) — refs: Pay-to-play_Smithing_training.s7
59. Crafting 40 — cut gems (sapphire@20→emerald@27→ruby@34→diamond@43), gems mined non-GE — `train-crafting-40` — refs: Pay-to-play_Crafting_training.s4
60. Fishing 40 — fly fishing at Barbarian Village (3-tick viable to 58) — `train-fishing-40` — refs: Pay-to-play_Fishing_training.s4
61. Cooking 40 — cook trout/salmon on the permanent fire beside the spots — `train-cooking-40` — refs: Pay-to-play_Cooking_training.s3/.s4
62. Firemaking 30 — chop oaks yourself (non-GE rewrite) — `train-firemaking-30` — refs: Pay-to-play_Firemaking_training.s3, Pay-to-play_Woodcutting_training.s5
63. Firemaking 50 — corrected ladder Willow 30–35 → Teak 35–42 → Arctic pine 42–45 → Maple 45–50 (DT gate) — `train-firemaking-50` — refs: Pay-to-play_Firemaking_training.s3
64. Magic 55 — High Alchemy (65 xp/cast from 55) — `train-magic-55` — refs: Pay-to-play_Magic_training.s14
65. (GAP) Alch-fodder + nature-rune supply loop, non-GE (what do we alch, where do natures come from — smithed items? drops?) — Runecraft_training fetched but unmined — UNGROUNDED
66. Herblore 52 (PROPOSED train-herblore-52 replacing synth-herblore-52-9) — refs: Pay-to-play_Herblore_training.s6
67. Farming 32 (PROPOSED train-farming-32 replacing synth-farming-32-7; ranarr plantable) — refs: Pay-to-play_Farming_training.s4/.s5
68. Fishing 58 / Cooking 58 — lobsters (classic method; lobster-band xp uncited, no fabricated numbers) — `train-fishing-58`, `train-cooking-58` — refs: Pay-to-play_Fishing_training.s4 (partial), Burn_level.s2/.s4

### PHASE: Kandarin infrastructure — agility, graceful, diary

69. Rooftop agility ladder toward 260 marks of grace (Draynor 10+ grounded; mid-ladder courses Al Kharid/Varrock/Canifis/Falador/Seers' UNGROUNDED individually) — `steer-graceful` ladder — refs: Draynor_Village_Rooftop_Course.s0/.s1, Ardougne_Rooftop_Course.s0, Rooftop_Agility_Course.s2, Agility_training, Marks_of_grace.s1/.s9
70. Buy + equip full graceful — exactly 260 marks, no Agility-level purchase gate (agility:60 in steer_points flagged as unsourced) — refs: Graceful_outfit.s1
71. (GAP) Quest: Plague City — refs: Plague_City_Quick_guide.s2 (fetched, unmined)
72. (GAP) Quest: Biohazard — the real Ardougne Easy task-6 gate — UNGROUNDED (page not fetched)
73. Ardougne Easy Diary — real gates are Rune Mysteries + Biohazard + Thieving 5 (steer_points unlock_condition corrected; Sheep Shearer/Clock Tower/fishing/cooking gates do not exist) — `steer-ardougne-easy-diary` — refs: Ardougne_Diary.s2/.s3
74. Claim Ardougne cloak 1 (unlimited monastery teleport + 2,500-xp lamp) — refs: Ardougne_Diary.s3

### PHASE: Combat 40s→60s + routing branch (CHKPT combat-training-routing 3)

75. Routing branch (pick one): Sand Crabs on the Hosidius coast (default when Zeah open) OR early Slayer Turael→Mazchna — until 50/50/50 — `ctr-07a-sand-crabs` / ctr-07b — refs: Sand_Crab, Slayer_training.s2
76. Slayer 10 en route on branch B (PROPOSED train-slayer-10 replacing synth-slayer-10-3) — refs: Slayer_training.s2
77. Attack 60 / Strength 60 — Moss giants (wiki's documented 40–60 method; fixture's "Hill Giants" unsupported, corrected delta 236,518 xp) — `train-attack-60`, `train-strength-60` — refs: Pay-to-play_Melee_training.s13, Experience_table.s2
78. Defence 60 — same spine — `train-defence-60` — refs: Pay-to-play_Melee_training.s13
79. Attack 43 gear breakpoint (PROPOSED train-attack-43 replacing synth-attack-43-4; adamant tier + scimitar re-buy) — refs: Pay-to-play_Melee_training.s10, Scimitar.s2
80. Ranged 30 — chickens/cows with shortbow; arrow supply from banked feathers (fletching loop is a §2 gap) — `train-ranged-30` — refs: Pay-to-play_Ranged_training.s9
81. Ranged 40 — crabs per wiki (fixture's "Ogresses or Experiments" unverified) — `train-ranged-40` — refs: Pay-to-play_Ranged_training.s9
82. Ranged 55 — crabs remain viable to 70 (chinning needs Hunter — §2 gap) — `train-ranged-55` — refs: Pay-to-play_Ranged_training.s9
83. Ranged 70 — crabs/cannon (dwarf multicannon method documented separately) — `train-ranged-70` — refs: Pay-to-play_Ranged_training.s9/.s4

### PHASE: Gnome chain → Monkey Madness I

84. (GAP) Quest: Tree Gnome Village — MM1 prerequisite, untracked — UNGROUNDED (PROPOSED-ID quest-tree-gnome-village implied by quests:quest-mm flag)
85. (GAP) Quest: The Grand Tree — MM1 prerequisite, untracked — UNGROUNDED (PROPOSED-ID quest-grand-tree minted)
86. Quest: Monkey Madness I — no wiki skill gate (43/43 is a designed boss-readiness proxy, documented as such); reward is a CHOICE split (35k/35k + 20k/20k, never 35k×4 — fixture corrected) — `quest-mm`, `milestone-quest-mm` — refs: Monkey_Madness_I_Quick_guide.s1/.s11, Monkey_Madness_I.s1/.s20
87. (GAP) Gear stop: buy + equip dragon scimitar (Ape Atoll shop, post-MM1) — UNGROUNDED (Daga's shop page not fetched)
88. Maniacal monkey tunnels available for later burst/chin training — refs: Maniacal_monkey (fetched, unmined)

### PHASE: Desert Treasure chain

89. (GAP) Quest: The Tourist Trap — DT prerequisite — refs: The_Tourist_Trap_Quick_guide.s2 (fetched, unmined)
90. (GAP) Quest: Temple of Ikov — DT prerequisite — UNGROUNDED
91. (GAP) Quests: Death Plateau → Troll Stronghold — DT prerequisite AND the GWD quest gate (defeat Dad) — UNGROUNDED
92. (GAP) Quest: Waterfall Quest — DT prerequisite (big early combat xp, no combat reqs) — UNGROUNDED
93. Thieving 53 — blackjack Bearded Pollnivnian bandits (level 45 band; briefing's Menaphite Thug is level 65 — corrected; PROPOSED replacement for synth-thieving-53-2) — refs: Blackjacking.s1/.s11, Pollnivnian_bandit.s1/.s4/.s6/.s7, Menaphite_thug.s4
94. Quest: Desert Treasure I — reqs verified exact (Magic 50, Thieving 53, Slayer 10, Firemaking 50); Magic +20,006.9 — `quest-dt`, `milestone-quest-dt` — refs: Desert_Treasure_I_Quick_guide.s1/.s9, Desert_Treasure_I.s1/.s34
95. Ancient Magicks unlocked — switch books for burst training — refs: Desert_Treasure_I.s34
96. Magic 50 (PROPOSED train-magic-50 replacing synth-magic-50-1) / Magic 66 (PROPOSED train-magic-66; Smoke Burst from 62 post-DT) — refs: Pay-to-play_Magic_training.s14/.s17
97. Magic 70 — Ice Burst at multi-combat crab spots or Maniacal monkeys — `train-magic-70` — refs: Pay-to-play_Magic_training.s17, Maniacal_monkey

### PHASE: Swan Song chain → monkfish supply

98. (GAP) Reach 100 Quest Points — Swan Song hard gate, unmodeled in reqs schema — UNGROUNDED (Quest points page not fetched)
99. (GAP) Quest: One Small Favour — Swan Song prerequisite — UNGROUNDED
100. (GAP) Quests: Jungle Potion → Shilo Village — Swan Song prerequisites — UNGROUNDED
101. (GAP) Quest: Garden of Tranquillity — Swan Song prerequisite — UNGROUNDED
102. (GAP) Quest: Creature of Fenkenstrain — Swan Song prerequisite (needs PiP + Restless Ghost, already in chain) — UNGROUNDED
103. Fishing 62 (PROPOSED train-fishing-62 replacing synth-fishing-62-12) — refs: Pay-to-play_Fishing_training.s4 (partial)
104. Cooking 62 (PROPOSED train-cooking-62 replacing synth-cooking-62-11) — refs: Pay-to-play_Cooking_training.s4/.s8, Burn_level.s2/.s4
105. Quest: Swan Song — skill reqs verified exact (Mag 66/Cook 62/Fish 62/FM 42/Craft 40/Smith 45); rewards CORRECTED to Magic +15k, Prayer +10k, Fishing +50k — `quest-swan-song` — refs: Swan_Song_Quick_guide.s1/.s9, Swan_Song.s1/.s11
106. Monkfish gather loop at Piscatoris (Fishing 62 + Swan Song, both verified) — `gather-monkfish` — refs: Piscatoris_Fishing_Colony(.s1/.s4), Fishing_spot_(Piscatoris_Fishing_Colony)
107. Cook monkfish for the PvM food bank (burn-stop vs gauntlets per burn-level table) — `cook-monkfish` — refs: Monkfish.s1/.s2, Raw_monkfish.s1/.s2, Burn_level.s2/.s4

### PHASE: RFD burndown (Barrows-gloves requisite — ALL 10 subquests, not 4)

108. RFD: Freeing the Goblin generals (needs Goblin Diplomacy — item 7; dye sourcing via Aggie; start-pin still "??", no Map template on subpage) — `rfd-goblins` — refs: Recipe_for_Disaster_Freeing_the_Goblin_generals.s1/.s3
109. (GAP) Quest: Fishing Contest — White Wolf Mountain tunnel access for the Mountain Dwarf subquest — UNGROUNDED (PROPOSED-ID quest-fishing-contest minted)
110. RFD: Freeing the Mountain Dwarf — CORRECTED walkthrough: Asgoldian ales (coin in each Asgarnian ale) for Rohak → dwarven rock cake, cooled; the fixture's "spiced stew" detail was fabricated — `rfd-mountain-dwarf` — refs: Recipe_for_Disaster_Freeing_the_Mountain_Dwarf.s1/.s3
111. Cooking 70 + Agility 48 — the real (unenforced) Awowogei gates — refs: Recipe_for_Disaster_Freeing_King_Awowogei.s1
112. RFD: Freeing King Awowogei (rewards CORRECTED to Cooking +10k AND Agility +10k) — `rfd-awowogei` — refs: Recipe_for_Disaster_Freeing_King_Awowogei.s1/.s9
113. (GAP) RFD: Freeing Pirate Pete — refs: Recipe_for_Disaster_Freeing_Pirate_Pete (fetched, unmined)
114. (GAP) RFD: Freeing the Lumbridge Guide — UNGROUNDED (only RFD subpage NOT in manifest)
115. (GAP) RFD: Freeing Evil Dave — refs: Recipe_for_Disaster_Freeing_Evil_Dave (fetched, unmined)
116. (GAP) RFD: Freeing Skrach Uglogwee — refs: Recipe_for_Disaster_Freeing_Skrach_Uglogwee, Big_Chompy_Bird_Hunting (both fetched, unmined)
117. (GAP) RFD: Freeing Sir Amik Varze — refs: Recipe_for_Disaster_Freeing_Sir_Amik_Varze (fetched, unmined)
118. (GAP) RFD prerequisite quests for 113–117 — Family Crest, Tai Bwo Wannai Trio, Rum Deal, Shadow of the Storm fetched and unmined; further prereqs per those blobs — refs: Family_Crest, Tai_Bwo_Wannai_Trio, Rum_Deal, Shadow_of_the_Storm — remainder UNGROUNDED
119. (GAP) RFD: Defeating the Culinaromancer → Barrows gloves (the fixture's claim that the 4-subquest subset grants gloves is false — full chest needs all 10 + final fight) — `quest-rfd-start` correction — refs: Recipe_for_Disaster_Defeating_the_Culinaromancer, Recipe_for_Disaster.s1/.s6

### PHASE: Prayer to Piety + bones supply

120. Prayer 43 — big bones / altar (corrected delta 44,715 xp) — `train-prayer-43` — refs: Pay-to-play_Prayer_training.s4
121. (GAP) Bones supply loop, non-GE — where the big/dragon bones physically come from at rate (drops from moss giants band, later blue dragons?) — UNGROUNDED
122. (GAP) Altar branch: gilded altar (Construction 75 — whole Construction ladder untracked) vs Ectofuntus vs Chaos Temple — refs: Construction_training (fetched, unmined), Ectofuntus, Chaos_Temple_(hut).s1 — branch decision UNGROUNDED
123. Prayer 52 — dragon bones at 350% altar rate (72→252 xp) — `train-prayer-52` — refs: Pay-to-play_Prayer_training.s4
124. Prayer 74 — Piety prep (Defence 70 pairing consistent) — `train-prayer-74` — refs: Pay-to-play_Prayer_training.s4

### PHASE: Barrows

125. (GAP) Miniquest: His Faithful Servants — the ACTUAL crypt-digging gate (with PiP), missing from the chain entirely — UNGROUNDED
126. Stock the Barrows loadout: prayer potions + monkfish to goal demand (items 53–54, 106–107) — `synth-tag-supply-*` PROPOSED rows — refs: Prayer_potion.s4, Monkfish.s1
127. Unlock Barrows — real gates: Priest in Peril + His Faithful Servants started; the 60/60/60/43 reqs are unsourced efficiency numbers (recommend → `recommended` field) — `unlock-barrows` — refs: Barrows.s0/.s2/.s3
128. Milestone: first Barrows runs (repeatable gear + GP) — `milestone-barrows` — refs: Barrows.s2
129. (GAP) Barrows rotation/strategy specifics (brother order, kill methods per loadout) — Strategies section not fetched — UNGROUNDED

### PHASE: 70s combat + God Wars

130. Attack 70 / Strength 70 / Defence 70 — NMZ Normal Rumble is the wiki's documented band method (corrected delta 463,885 xp; fixture monsters unverified) — `train-attack-70`, `train-strength-70`, `train-defence-70` — refs: Pay-to-play_Melee_training.s6/.s7, Nightmare_Zone (fetched, unmined)
131. (GAP) NMZ entry requirements (quest-point/boss-quest gates for Normal Rumble) — page fetched, unmined — refs: Nightmare_Zone
132. Attack/Strength/Defence/Ranged/Magic 75 (PROPOSED train-*-75 rows replacing the five synth-*-75 placeholders) — refs: Pay-to-play_Melee_training.s6/.s7, Pay-to-play_Ranged_training.s9, Pay-to-play_Magic_training.s17
133. Unlock God Wars Dungeon — CORRECTED gates: Strength 60 OR Agility 60 (branch, not flat AND); partial Troll Stronghold (item 91) or Easy CA; rope first entry; climbing boots unless Trollheim tele (Magic 61 + Eadgar's Ruse); prayer:43 req unsourced — `unlock-gwd` — refs: God_Wars_Dungeon.s0/.s1
134. Milestone: God Wars bosses — `milestone-gwd` — refs: God_Wars_Dungeon.s1
135. (GAP) Whip/upgrade gear path past dragon tier — "equips whip" at Attack 70 implies Slayer 85 grind or drop-trade, unresolved for a self-sufficient chain — UNGROUNDED

### PHASE: Zeah → Chambers of Xeric

136. Quest: X Marks the Spot — refs: X_Marks_the_Spot_Quick_guide.s1/.s2 (fetched; currently only a study ref, untracked as a step)
137. Quest: Client of Kourend — refs: Client_of_Kourend_Quick_guide.s2, Client_of_Kourend.s1/.s2 (fetched; untracked as a step)
138. Quest: Tale of the Righteous — RENAME from quest-tale-of-arrav ("Tale of Arrav" does not exist); reqs Strength 16 + Mining 10 + items 136–137; reward is 8,000 COINS not xp — refs: Tale_of_the_Righteous_Quick_guide.s1/.s3, Tale_of_the_Righteous.s1/.s7
139. Milestone: Chambers of Xeric — no hard entry gate on the page (team 1–100); raid-readiness stats/gear live in unfetched Recommended sections — `milestone-raids-cox` — refs: Chambers_of_Xeric.s0/.s1 — readiness spec UNGROUNDED

### PHASE: Cross-cutting background loops (RECURRING; sit at rank, fire at break anchors)

140. Allotment loop at every banking break (item 31 setup) — `bg-farm-allotment-setup` — refs: Allotment_patch_Patches.s1
141. Herb-run loop guam→ranarr on ~80 min cadence (items 33, 48) — refs: Herb_patch
142. Compost/ash replenishment loop (items 39–42) — refs: Volcanic_ash.s1, Compost_bin.s3
143. Monkfish stocking loop once 106 unlocks — refs: Piscatoris_Fishing_Colony.s1
144. (GAP) Feather→arrow fletching loop for the Ranged ladder (Fletching untracked as a skill anywhere in the chain) — refs: Fletching_training (fetched, unmined) — loop design UNGROUNDED
145. (GAP) Alch-fodder + rune replenishment loop (item 65) — refs: Runecraft_training (fetched, unmined) — UNGROUNDED

Checklist count: **145 items** (123-step chain compressed where one wiki fact grounds a
multi-id band, e.g. chkpt headers ride their opening atom; 36 items are (GAP) insertions).

---

## 2. GAP SCAFFOLD — what route-p2p lacks vs the checklist

"in manifest ✓" = grounding page already fetched (compound — extract, do NOT re-fetch).
"fetch" = page needed. All PROPOSED-IDs below that already exist in contrib.jsonl are
marked (minted); the 78 pending `lane5:*` tickets cover the data-fix merge side.

| # | gap | grounding page(s) | manifest? |
|---|---|---|---|
| G1 | Untracked Misthalin prereq quests: Restless Ghost (minted), Goblin Diplomacy (minted), Rune Mysteries | The Restless Ghost/Quick guide — fetch; Goblin_Diplomacy_Quick_guide.s3 ✓; Rune_Mysteries_Quick_guide.s2 ✓ | partial |
| G2 | DT prerequisite chain unenforced: Dig Site (minted), Temple of Ikov, Tourist Trap, Death Plateau + Troll Stronghold, Waterfall Quest | The_Tourist_Trap_Quick_guide.s2 ✓; fetch the other four /Quick guides | partial |
| G3 | Swan Song prerequisite chain + 100 QP threshold unmodeled: One Small Favour, Shilo Village + Jungle Potion, Garden of Tranquillity, Creature of Fenkenstrain, Quest points page | all five — fetch; Swan_Song.s1 ✓ names them | no (anchor ✓) |
| G4 | MM1 prerequisites untracked: Tree Gnome Village, The Grand Tree (minted) | both /Quick guides — fetch; Monkey_Madness_I.s1 ✓ names them | no (anchor ✓) |
| G5 | RFD is 4/10 subquests; Barrows-gloves claim false. Missing: Pirate Pete, Lumbridge Guide, Evil Dave, Skrach Uglogwee, Sir Amik Varze, Culinaromancer + their prereq quests; Fishing Contest (minted) for the Dwarf tunnel | Recipe_for_Disaster_Freeing_Pirate_Pete ✓, _Evil_Dave ✓, _Skrach_Uglogwee ✓, _Sir_Amik_Varze ✓, _Defeating_the_Culinaromancer ✓, Family_Crest ✓, Tai_Bwo_Wannai_Trio ✓, Rum_Deal ✓, Shadow_of_the_Storm ✓, Big_Chompy_Bird_Hunting ✓ — all unmined; fetch Freeing the Lumbridge Guide + Fishing Contest/Quick guide | mostly ✓ unmined |
| G6 | Barrows real gate missing: His Faithful Servants miniquest; strategy/rotation unspecced | fetch His Faithful Servants; Barrows Strategies section; Barrows.s0/.s2/.s3 ✓ | partial |
| G7 | GWD gate wrong shape: Troll Stronghold quest_gate absent, Str-60-OR-Agi-60 branch, boots/rope logistics | God_Wars_Dungeon.s0/.s1 ✓ (grounded); Troll Stronghold + Death Plateau — fetch (shared with G2) | partial |
| G8 | CoX readiness + Zeah quest steps untracked: X Marks the Spot, Client of Kourend as steps; tale-of-arrav rename (minted); recommended-stats sections | X_Marks_the_Spot_Quick_guide ✓, Client_of_Kourend(+QG) ✓, Tale_of_the_Righteous ✓; fetch Chambers of Xeric Recommended/Items sections | mostly ✓ |
| G9 | Gear-stop ladder past mithril scimitar: rune scimitar (Zanaris shop), dragon scimitar (Ape Atoll), rune armour, green d'hide, whip question at Att 70 | Zanaris.s4 ✓ (shop list); fetch Jukat/Daga's Scimitar Smithy + item pages for wield gates | partial |
| G10 | Consumable supply loops absent: arrows/fletching, nature+law runes / alch fodder, bones for Prayer 43→74, gp beyond early loot | Fletching_training ✓, Runecraft_training ✓, Hunter_training ✓, Construction_training ✓, Ectofuntus ✓, Chaos_Temple_(hut).s1 ✓ — all unmined; fetch bone-source pages (e.g. Blue dragon) as needed | mostly ✓ unmined |
| G11 | Agility ladder mid-courses ungrounded (10→60 between Draynor and Ardougne); Biohazard + Plague City untracked as steps for the diary | Draynor/Ardougne course pages ✓, Rooftop_Agility_Course.s2 ✓, Agility_training ✓, Plague_City_Quick_guide.s2 ✓; fetch Biohazard/Quick guide + Varrock/Canifis/Falador/Seers' course pages | partial |
| G12 | Data-fix backlog (no fetch needed — already grounded + ticketed): systematic cumulative-vs-delta xp errors (consolidate-xp ticket), ultracompost recipe, Herblore 38, prayer_potion_3, MM1 reward-choice, Nature Spirit/Swan Song/Awowogei rewards, unlock-barrows/gwd req reshapes, 2 coord-fix tickets, 78 lane5 PROPOSED-ID mints | all grounded in contrib.jsonl refs | ✓ (no wave-3 fetch) |

---

## 3. WAVE-3 SCOPES — 8 synergy bundles (queued as `wave3:*`)

Partition principle: bundles share pages, regions, or templates — NOT one agent per gap.
Each queue entry payload is the self-contained brief: `targets` (step-ids/checklist items),
`fetch` (new pages), `have` (manifest slugs to reuse — never re-fetch), `prefix`
(contribution key prefix). Discipline per BRIEFING.md Part A applies verbatim (schema,
refs mandatory, own words, non-GE, `"??"` for unknowns, queue add→claim→contribute→done).

1. **wave3:dt-gwd-gates** (G2+G7) — one Troll Stronghold/Death Plateau fetch serves both the DT prereq chain and the GWD quest gate. Prefix `w3-dtgwd:`.
2. **wave3:qp-spine-swansong** (G3+G1 remainder) — Swan Song's five prereq quests + Restless Ghost + QP-threshold modeling; Restless Ghost feeds Creature of Fenkenstrain directly. Prefix `w3-qp:`.
3. **wave3:gnome-mm1-gear** (G4+G9) — Gnome Stronghold quests + the scimitar ladder (Zanaris/Ape Atoll shops share the quest unlock context). Prefix `w3-gnome:`.
4. **wave3:rfd-completion** (G5) — mine the 10 already-fetched RFD/prereq blobs, fetch the 2 missing pages, produce the full 10-subquest burndown. Prefix `w3-rfd:`.
5. **wave3:morytania-prayer-pvm** (G6 + G10 bones/altar) — His Faithful Servants + Barrows strategy + bones/altar branch share the Morytania region and the Prayer consumer. Prefix `w3-mory:`.
6. **wave3:agility-diary-kandarin** (G11) — Biohazard + rooftop ladder + graceful math; one region, one steer pair. Prefix `w3-agi:`.
7. **wave3:consumable-loops** (G10 remainder + checklist 144–145) — fletching/runes/alch-fodder loops from the four already-fetched training pages; shares the `slot{}`/RECURRING template family with bg domain. Prefix `w3-loops:`.
8. **wave3:cox-zeah-readiness** (G8) — Zeah quest steps from fetched blobs + CoX recommended sections + NMZ entry reqs (Nightmare_Zone blob, same "unmined big page" template). Prefix `w3-cox:`.

Queue payloads (authoritative copies live in queue.jsonl; §1 item numbers refer to this file).
