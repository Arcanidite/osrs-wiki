# Game Knowledge Base — OSRS

> Durable, **sourced**, **versioned** game facts backing the Progression Router's whole-game option catalog.
> Protocol: `PROGRESSION_ROUTER_BRIEF.md` §10. The **structured** half of each fact lives in
> `assets/data/tools/*.jsonl` (machine-readable, drives the tool); this file holds the **narrative +
> source + caveat**, cross-referenced by option `id`.

## Rules (enforced)

1. **Source every fact** — `source` (OSRS Wiki URL / cache-extraction / in-game observation) + a **stamp**
   (date or game-update version). No source ⇒ it's a **placeholder**, labelled `unknown`/`estimated`, never
   asserted as fact.
2. **Never encode "best" as a fact.** Method superiority is *relative* to the available set (brief §5.0).
   Record an option's yield + a rate placeholder, not "the best way."
3. **Append + annotate, never delete.** Superseded facts get `[STALE — game update YYYY-MM-DD / superseded
   by …]`. History is context.
4. **Capture on contact.** Adding/verifying an option, learning a prereq → append here before the task is
   done. A data-table row without a KB source line is incomplete.
5. **Split durable vs relative.** Durable fact → KB + JSONL. Method-relative claim → option yield/rate.
   Optimization outcome ("best route given this lock") → computed, never stored.

---

## Mechanics (routing-relevant invariants)

<!-- e.g. "Skill levels are cumulative; for a set of goals only the MAX required level of each skill matters."
     Add sourced, stamped entries below. -->

### NPC stats array order (npcs.pack)
- **Fact:** `stats` in `npcs.pack` is `[attack, defence, strength, hitpoints, ranged, magic]`.
- **source:** RuneLite cache decode order, cross-verified against publicly known monster stats —
  Zulrah `[1,300,1,500,300,300]` (HP 500, Def 300, Mage/Range 300, Att/Str 1), Hill Giant
  `[18,26,22,35,1,1]`, Goblin `[3,4,1,12,1,1]` · **stamp:** 2026-07-06 (cache snapshot 2026-04).
- **caveat:** filler value is `1` (or `stats` absent); a `1` does not mean "verified level 1".

### Cache pack contents (what the wiki database pages render)
- **items.pack** — 13,667 items: name, slug, members, tradeable, stackable, equipable, slot
  (12 slots; 4,791 equipable), skill `reqs` (1,992 items), quest_item flag (2,302), examine text.
- **npcs.pack** — 12,076 NPCs: name, combat_level (4,152 > 0; 3,522 with an Attack action),
  actions, action-derived tags, stats. Variant-heavy: 3,522 attackable ids ≙ 1,638 distinct
  (name, combat level) monsters.
- **Skill-cape baseline:** every skill has ~36 level-99 equipment unlocks (skill capes + variants).
  Real cache data, not an artifact.
- **source:** `tools/extract_cache.py` over osrsbox items-cache + live cache dump · **stamp:** 2026-07-06.

### Woodcutting (drives /play gathering + future router options)
- **Facts (sourced, OSRS Wiki · stamp 2026-07-07):** log XP/level per tree — Tree/Dead tree →
  Logs lvl 1 / 25 xp; Oak 15 / 37.5; Willow 30 / 67.5; Teak 35 / 85; Maple 45 / 100; Mahogany
  50 / 125; Yew 60 / 175; Magic 75 / 250. Axe Woodcutting reqs: bronze/iron 1, steel 6, black 11,
  mithril 21, adamant 31, rune 41, dragon 61. XP curve per the documented formula
  (anchors: lvl 2 = 83 xp, lvl 99 = 13,034,431 xp). Item ids cross-checked against `items.pack`
  by `tests/simulation.test.js` — the table cannot silently drift from the cache.
- **Placeholders (NOT game facts):** per-roll success chance model, roll cadence, depletion odds,
  respawn time — Jagex has never published these; they live in `GATHER_CONFIG`
  (`assets/js/world/gather.js`), labelled, user-tunable, never asserted as real rates.

### Mining (drives /play gathering + future router options)
- **Facts (sourced, OSRS Wiki rock pages · stamp 2026-07-07):** rock object ids — copper
  11161/10943/10079, tin 11361/11360, iron 11365/11364/42833/36203, coal 11367/11366/36204 —
  **validated against extracted placements at known mine sites** (SE Varrock mine shows exactly
  these iron/copper ids at the real coordinates). Level/XP: copper & tin 1 / 17.5, iron 15 / 35,
  coal 30 / 50. Respawns: copper/tin 2.4 s, iron 5.4 s, coal 30 s. Standard rocks always deplete
  after one ore. Pickaxe reqs: bronze/iron 1, steel 6, mithril 21, adamant 31, rune 41, dragon 61.
  Ore/pickaxe item ids test-guarded against `items.pack`.
- **Placeholder:** per-roll success chance (same labelled `GATHER_CONFIG` model as woodcutting).

### NPC spawn points (npc-spawns/)
- **Fact:** NPC spawn coordinates are server-side data (not in the game client cache); the authoritative
  community dataset is `NPCList_OSRS.json` from `github.com/mejrs/data_osrs`. Each record carries
  `id` (NPC id), `x`/`y` (world coordinates), and `p` (plane 0-3). The dataset is bucketed into
  per-region gzip files under `assets/data/cache/npc-spawns/` using
  `rid = ((x>>6)<<8)|(y>>6)`, `localX = x&63`, `localY = y&63`, matching the world client region
  formula. Each file holds `[[npcId, localX, localY], ...]`; plane 0 is `<rid>.json.gz`, planes 1-3
  are `<rid>.<plane>.json.gz`.
- **Counts (build 2026-07-07):** source records 24,110 → kept 18,888 / dropped 5,222
  (1,346 distinct NPC ids absent from npcs.pack, i.e. server-only or removed ids);
  1,075 region-plane files across 1,076 total files (including manifest.json); total 4.3 MB on disk.
- **Validation — Lumbridge (region 12850, rx=50 ry=50):** 129 plane-0 spawns confirmed; names
  include Hans, Cook, Woodsman tutor, Ironman tutor, Melee/Ranged/Magic/Prayer combat tutors,
  Father Aereck, Lumbridge Guide, Man, Woman, Goblin, Rat, Cow, Sheep — all resolving correctly
  against npcs.pack. World coordinates land in the valid OSRS range (x 1024–4200, y 2400–12800).
- **source:** `https://raw.githubusercontent.com/mejrs/data_osrs/master/NPCList_OSRS.json` ·
  **stamp:** 2026-07-07 · **tool:** `tools/build_npc_spawns.py`
- **caveat:** spawn data is community-maintained (reverse-engineered / crowdsourced), not
  cache-extracted. It may drift from the live game after updates that add, relocate, or remove
  NPC spawns. Treat as a best-effort approximation; re-run `build_npc_spawns.py` against a
  refreshed source after major game updates.

### Equipment bonuses (equipment.pack)
- **Fact:** per-item equipment bonuses (attack_stab/slash/crush/magic/ranged, defence_×5,
  melee_strength, ranged_strength, magic_damage, prayer) and the 12 gear slots
  (head/cape/neck/ammo/weapon/body/shield/legs/hands/feet/ring/2h) come from the osrsbox-db
  community database; values are copied into `assets/data/cache/equipment.pack` EXACTLY as
  sourced — no inflation, no invented defaults.
- **Counts (build 2026-07-07):** source 24,735 items → kept 2,229 / dropped 22,506
  (20,850 not equipable or no equipment block; 1,607 name-mismatch vs items.pack — wiki
  disambiguation suffixes like "(Unpoisoned)"; 49 ids absent from items.pack; 0 bad slots).
  Every kept record's id+name is test-guarded against `items.pack`
  (`tests/simulation.test.js` id-honesty-guard).
- **source:** `https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-complete.json` ·
  **stamp:** 2026-07-07 · **tool:** `tools/build_equipment.py`
- **caveat:** osrsbox-db is community-maintained and its item names carry wiki disambiguation
  suffixes our cache snapshot lacks — those items are DROPPED rather than fuzzily matched, so
  coverage is conservative (2,229 of ~4,791 equipable cache items). Combat currently applies
  only stab attack + melee strength (melee model); the other 12 bonus fields are stored and
  summed but await ranged/magic combat models.

### NPC drop tables (drops.pack)
- **Fact:** drop tables are server-side data; the sourced community dataset is osrsbox-db
  `monsters-complete.json` (per-npc `drops[{id, name, quantity, noted, rarity}]`, rarity a
  float probability where 1 = always, 1/128 = 0.0078125). Emitted to
  `assets/data/cache/drops.pack` as `{id: npcId, drops: [{itemId, itemName, qtyMin, qtyMax,
  rarity, stackable, noted}]}` — quantity ranges "1-5" parsed to min/max, rarity kept exactly
  as sourced, stackable taken from items.pack (cache fact).
- **Counts (build 2026-07-07):** source 3,000 monsters → kept 2,086 npcs / 58,375 drop
  entries; dropped 914 npcs (271 ids absent from npcs.pack, 643 with no valid drops) and
  8,300 entries (8,297 item-name mismatch — same wiki-suffix drift as equipment, 3 bad
  quantity, 0 bad rarity, 0 missing item ids).
- **Validation:** every npc id checked against npcs.pack, every drop's item id+name against
  items.pack at build time; test suite re-samples both guards plus 0 < rarity ≤ 1 and
  qtyMin ≤ qtyMax on every run. Spot-check: Goblin (3029) → Bones @ 1.0, Coins tiers,
  Hammer 0.117 — matches the public wiki table.
- **source:** `https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json` ·
  **stamp:** 2026-07-07 · **tool:** `tools/build_drops.py`
- **caveat:** community-scraped from the wiki; rare-drop-table nesting and multi-roll kills
  (`rolls` field) are NOT modelled — the client rolls each entry independently once per kill,
  which slightly misstates yield for multi-roll bosses. NPCs without a table drop nothing and
  say so (never faked).

### NPC wander AI (npc-ai.js)
- **Fact (sourced, OSRS Wiki "Non-player character" · stamp 2026-07-07):** ambient NPCs wander
  a bounded area around their fixed spawn point and never leave it; movement respects the same
  static collision as players; NPCs engaged in combat stop wandering; respawns occur at the
  spawn point.
- **PLACEHOLDERS (labelled, NOT game facts):** exact wander radius, step cadence, and direction
  distribution are unpublished server data. Our model — Chebyshev ≤ 5 tiles of spawn, one
  random 8-direction step every ~3 ticks (retry 2 on refusal), viewport-only simulation —
  lives in `assets/js/world/npc-ai.js` (`WANDER_RADIUS`, `WANDER_STEP_TICKS`,
  `WANDER_RETRY_TICKS`), each labelled UNKNOWN placeholder.
- **caveat:** aggression, chasing, and per-npc wander ranges (some NPCs are stationary by
  design, e.g. shopkeepers behind counters) are not modelled — every ambient NPC wanders
  uniformly.

### Shop stock (NOT sourced — refused)
- **Fact:** shop stock/prices are server-side; NO public sourced dataset exists as of
  2026-07-07 — checked osrsbox-db `docs/shops.json` (404), `data/shops/shops.json` (404),
  mejrs/data_osrs repo listing (no shop file), other GitHub candidates (404). Trade therefore
  opens an honest dialogue naming the gap (BACKLOG: wiki-derived shops.json) instead of an
  invented stock list.
- **stamp:** 2026-07-07

## Facts by option `id`

<!-- One entry per catalogued option. Template:
### <option-id>  · <label>
- **kind:** skilling | quest | minigame | diary | boss | shop | transport | unlock | attraction
- **yields:** <what it gives — xp/grants/reward>
- **where:** <region / zone>
- **unlock:** <prerequisites>
- **source:** <wiki URL / cache-extract / observation> · **stamp:** <YYYY-MM-DD or game-update>
- **notes/caveats:** <anything relative, uncertain, or placeholder>
-->
