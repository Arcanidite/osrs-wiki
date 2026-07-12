# OSRS Wiki — Dev KB

Running log of features, integrations, and decisions. Add an entry when something non-obvious is added.

---

## Structure

| Path | Purpose |
|---|---|
| `_data/catalog.json` | Content registry — entries, categories, API source |
| `_data/site.yml` | Site-level config (name, tagline, logo, api_endpoint) |
| `_data/nav.yml` | Nav links |
| `assets/js/catalog.js` | Runtime hydration — fetches catalog, binds to DOM |
| `assets/css/main.css` | Base styles |
| `_layouts/default.html` | Shell layout |
| `_includes/catalog-grid.html` | Entry grid partial, accepts `source` override |
| `_includes/header.html` | Nav + search bar |

---

## Links

- **Repo**: https://github.com/Arcanidite/osrs-wiki
- **Pages**: https://arcanidite.github.io/osrs-wiki/

---

## Features

### 2026-04-22 — Initial scaffold
- Jekyll + GitHub Pages (minima base, `github-pages` gem)
- Headless/data-driven: all content sourced from `_data/` or a live API endpoint — nothing baked into HTML
- `catalog.js` fetches at runtime, hydrates categories, entry grid, and search
- To point at a live API: set `api_endpoint` in `_data/site.yml` — the JS picks it up automatically
- Nav populates from `_data/nav.yml`; search filters live against catalog entries client-side

---

### 2026-04-22 — Cache extraction pipeline

**Binary pack format** (`tools/pack.py`): `OSRP` magic + N×12B offset index + JSON blobs. O(1) binary search by id via mmap. No per-entry loose files.

**Extracted data** (`tools/extract_cache.py`):
- `items.pack` — 13,667 items (from osrsbox `items-cache.json`): name, slug, members, tradeable, stackable, equipable, slot, skill reqs, examine
- `npcs.pack` — 12,076 NPCs (via `Dump.java` → live cache): name, combat level, interactable, actions, tags, stats, params
- `objects.pack` — 805 interactable objects: name, actions, tags (bank/shop/craft/travel/unlock/gather), supports_items, wall_or_door, params
- `locations.pack` — placed object/NPC locations per region (requires valid XTEA keys; currently empty pending key refresh)

**Sprite atlas** (`assets/data/cache/sprites/`):
- `items.png` — 28,744 item icons packed into a single PNG spritesheet (13MB)
- `items-atlas.json` — `{itemId: {x, y, w, h}}` atlas for CSS/canvas sprite extraction

**Map tile chunks** (`assets/data/cache/map/`):
- 1,150 region PNG tiles (256×256 at 4px/tile = 64×64 OSRS tiles), gzip-compressed per region
- `manifest.json` — `{regionId: {bx, by}}` manifest; client fetches this first, then pulls chunks on demand
- Terrain-only (no XTEA needed); object placement overlay requires `locations.pack`

**RuneLite cache jar patch** (`runelight-spaces/runelite/cache/`):
- `Dump.java` — new CLI entry point: `Dump <cache-path> <npcs|objects|locations|maptiles> [xtea-json]`
- `RegionLoader.java` — patched to look up archives by `regionId * 2` (live Jagex dat2 format uses sequential numeric IDs, not Djb2 name hashes)
- `logback.xml` — silences SLF4J noise so stdout is clean JSON

**Constraint**: live Jagex `.dat2` cache stores MAPS archives without name hashes (format 6, `named=false`). XTEA keys sourced from `~/.runelite/cache/xtea.json` (March 9 snapshot) are stale vs April 15 cache; object locations remain empty until keys are refreshed via RuneLite session auth.

---

### 2026-07-06 — Progression Router P0: monolith → modules + headless test harness

Rebuild phase P0 of `PROGRESSION_ROUTER_BRIEF.md` (§8): behavior-preserving extraction of the 2,837-line
`assets/js/tools/progression-router.js` into `assets/js/router/` ES modules.

- `router/graph.js` — node/edge graph + monotone cmp registry (`gte`/`has`), **absorbed `assets/js/dal.js`**
  (deleted; nothing else consumed `window.DAL`). Storage-injectable: browser uses the same `osrs-graph:v1`
  localStorage payload (existing saves carry over), tests use in-memory. Editor still exposes `window.DAL`.
- `router/model.js` — state vectors (`toState`/`fromState`), req/grant → qual-edge compilation, `syncQualEdges`.
- `router/planner/greedy.js` — Algorithm A extracted verbatim, pure/DOM-free; context via `env`
  (`graph`, `constraints`, `pinnedExclusions`, `manualQuestDone`, injectable `now` for deterministic synth ids).
- `router/planner/index.js` — the §5.2 planner seam: `plan(goals, steps, profile, env, config) → {path, diagnostics}`.
- `router/load.js`, `router/persist.js` — JSONL parse/fetch; graph-backed plan/notes/tags store.
- `router/editor/index.js` — all DOM/wiring, derived from the monolith by **mechanical code-motion**
  (script deleted moved ranges, patched 3 call sites) to guarantee parity. Entry point stays
  `assets/js/tools/progression-router.js` (now a module shim); `tool.html` loads `tool_script` with
  `type="module"` and no longer includes `dal.js`.
- `tests/` — 23 Node tests (`npm test`, node:test, zero deps): cmp monotonicity, model round-trips,
  planner invariants (capstones, goal satisfaction, region exclusion, pins, honest synth placeholders,
  determinism), and **pinned baseline route fixtures** over the real JSONL
  (`tests/fixtures/baseline-routes.json`; re-pin intentionally via `npm run fixtures`).
- Verified in headless Chromium (Playwright shell): boot renders 23 skills + 165 bank entries; adding a
  bank goal computes an 11-step route through the new module chain; no console errors.

---

### 2026-07-06 — Wiki populated from cache packs (items/NPCs databases + skill content)

`tools/build_wiki_from_cache.py` (idempotent; reruns `build.py`) populates topics/entries from the
RuneLite cache extraction — nothing hand-invented, every page carries a source/stamp line.

- **Entry databases, client-rendered from the packs themselves** (`assets/js/pack-reader.js` OSRP
  reader + `assets/js/tools/db.js` browser: search, facets, sort, chunked list, hash-routed detail
  `#<id>` so every entry is deep-linkable):
  - `/items/all` (13,667 items, sprite icons), `/items/equipment/<slot>` ×12, `/items/weapons`,
    `/items/armour`, `/items/runes`, `/items/quest-items`
  - `/combat/bestiary` (3,522 attackable ids grouped → 1,638 monsters; verified stats labels, see
    GAME_KB), `/combat/monsters/lvl-*` ×5 brackets, `/npcs` (all 12,076)
- **Skill pages** — all 23 exist; each has an SSR equipment-unlock table from items.pack reqs
  (e.g. Attack 503, Defence 989, Ranged 539) + training steps from `steps.jsonl`. Hand summaries preserved.
- **Graph-driven**: 40 generated nodes/edges appended to `graph.json` (`meta.generated`), nav/sitemap/
  search/catalog regenerated via `build.py`; hubs (`/items`, `/skills`, `/combat/monsters`,
  `/items/equipment`) rebuilt with counts.
- **Header search deep-searches the packs** (lazy-loaded on 3+ chars) — "game database" result group
  links into the db pages (`assets/js/catalog.js`).
- **Objects skipped on purpose**: cache object names are garbage (GAME_GOTCHAS G-2) — no fabricated entries.
- CSS: `.data-table`, `.db-*`, `.hub-count`, `.data-source` appended to `main.css`.
- Verified headless: items db + detail (#4151 → Abyssal whip), bestiary + Zulrah variants/stats,
  deep search groups. Router tests unaffected (23/23).

---

### 2026-07-06 — Standalone top-down 2D world client (`/play`)

> **[REVERTED 2026-07-07]** — undeployed per the fidelity gate (BACKLOG `[client:fidelity-gate]`):
> the game client only ships when gameplay-true to the real game. Terrain-walking without
> collision/spawns/simulation doesn't meet that bar. Code preserved in git history (`620cce5`);
> the G-4 map findings and `[client:*]` backlog items remain valid.

Walk the real extracted map in the browser — no server, tick-accurate movement.

- `assets/js/tools/world-client.js` + `play/index.html`: canvas client streaming the map dump
  (`assets/data/cache/map/*.png.gz`, gunzipped in-browser via DecompressionStream, LRU bitmap
  cache), nearest-neighbour retro scaling (×2/×4/×8 of the 4 px/tile source). Click-to-walk
  (Bresenham path) + WASD, camera lerp between ticks, procedural avatar, landmark jump (debug),
  coords/tick HUD. Movement is tick-true: 600 ms/tick, 1 tile walk / 2 run (OSRS Wiki "Game tick").
- **Scope honesty (page says so too):** terrain only. No collision (dump lacks tile flags —
  BACKLOG `[client:collision-flags]`), no world NPC/object placement (`locations.pack` empty until
  XTEA refresh — `[client:locations-spawns]`), and no extracted game logic — combat/quests/drops are
  server-side at Jagex, absent from RuneLite/cache by design; gameplay systems must be re-implemented
  from sourced formulas (`[client:simulation]`).
- **Map-dump finding (GAME_GOTCHAS G-4):** dump region ids (1936–8359) are *not* live OSRS region
  ids — sequential-archive artifact — but the space is internally coherent (neighbours stitch into
  continuous terrain; verified visually). `/play` treats manifest bx/by as its own world space.
  218/1150 tiles are flat ocean.
- Verified headless: spawn (928, 1952), click walked exactly 6 tiles east across ticks, terrain
  renders (screenshot). CSS `.wc-*` appended to `main.css`; `world-client` node added to graph nav.

---

### 2026-07-07 — Real collision + `/play` restored (OpenRS2 extraction pipeline)

Collision gate item done: the world client is back, with the game's actual static clipping.

**New extraction pipeline — `tools/openrs2_extract.py`** (pure Python, no Java/Windows deps):
fetches the OSRS cache per-group from the public OpenRS2 archive (pinned **cache 2499, build 236,
2026-03-18**) with its published XTEA keys; HTTP responses cached in `tools/.openrs2-cache/` (ignored).
Implements js5 containers (gzip/bzip2 + XTEA), index-255 reference tables (djb2-named groups —
so **real region ids**, superseding the garbled sequential-id dump; G-4 stale), multi-file config
groups, and decoders for terrain (u16-opcode format incl. the extra-plane trailer some regions
carry), locations, object/underlay/overlay configs. Format notes learned empirically, each validated
by exact stream consumption across all 60,805 object defs: op78/79 carry a retain byte in this rev;
op93 = two u24s; op95/96 = u8. Known-object checks: Tree (1276) 2×2 "Chop down", Bank booth (10583).

**Collision** (`assets/data/cache/collision/<rid>.bin.gz`, u16/tile, y-major): terrain block flags
with the bridge plane-shift rule, wall edge flags by loc type/rotation **mirrored onto neighbours**,
corner-pillar flags, diagonal walls, object footprints (rotated sizeX/sizeY) honoring each object's
`interactType`, clipped floor decorations; cross-region spills handled on a world grid.
2,868 regions emitted (309 lack usable location keys → terrain-only there).
**Map tiles** re-rendered in true coordinates from underlay/overlay colours (flat retro palette).
**objects.pack** regenerated: 16,412 named interactable objects (was 805 garbage-named; G-2 stale).

**Client** (`/play` restored): `assets/js/world/collision.js` — pure movement/pathfinding module
implementing the game rules (edge/corner checks, no diagonal corner-cutting, W-E-S-N-diagonals BFS
with nearest-approach fallback) — plus `world-client.js` streaming map+collision regions, tick-true
movement (600 ms; 1 walk / 2 run), collision debug overlay (C), landmark travel.

**Verified:** 39/39 node tests — 11 synthetic movement-rule tests + 5 integration tests over the
real Lumbridge data (spawn walkable, River Lum blocks, approach stops on bank, cross-town path
every-step-legal, castle wall edges block straight passage, 2,868-region manifest integrity);
headless browser walk: spawn (3222,3218) → click-east lands (3227,3218) exactly; collision overlay
screenshot matches the real castle/river layout.

---

### 2026-07-07 — Interactable objects live on `/play`: real menus, real doors

- **Data:** `tools/openrs2_extract.py --locs` emits `assets/data/cache/locs/<rid>.json.gz` —
  57,130 plane-0 placements of objects that carry cache actions (`[[id, loc_type, rot, lx, ly]]`),
  1,355 regions. `objects.pack` now preserves the full 5-slot action array in cache order
  (first action = the game's default left-click option).
- **Client interaction model** (`world-client.js`): hover shows the game-style
  "<em>default action</em> Name (/ n more)" text; right-click opens a Choose Option menu listing
  the object's real cache actions + Walk here; selecting an action BFS-walks the player to the
  object (footprints are clipped, so the approach lands adjacent naturally).
  **Doors/gates open for real:** wall-type locs with an Open action toggle passage by clearing
  exactly the wall edges their closed state clips (`wallEdges()` in `assets/js/world/collision.js`
  mirrors the extractor's mapping; consistency is pinned by a test over the real Lumbridge grid —
  the collision data carries precisely the predicted bits, and clearing them flips `canStep`).
  Open doors render green; menu/hover flip to Close. All other actions walk to the object and
  report "not simulated yet" — no faked outcomes.
- **Verified:** 41/41 tests (loc feed integrity, door-passage flip on real doors); headless UI
  smoke on the real Lumbridge Door (3226,3214): hover "Open Door" → menu ["Open Door", "Walk here",
  "Cancel"] → click walks adjacent and opens → hover "Close Door"; screenshot confirms markers +
  open-door rendering.
- NPC spawns remain outside the cache (server-side); tracked in `[client:locations-spawns]`.

---

### 2026-07-07 — `/play` actions perform: woodcutting, banking, inventory/skills

Context-menu fix + first simulated systems (menu rows are real buttons chosen on click;
hit-testing scales CSS→canvas px so hover/click tiles are exact; main.css links cache-busted).

- **Simulation modules** (pure, node-tested): `assets/js/world/xp.js` (documented XP curve,
  anchor-tested: 83 → lvl 2, 13,034,431 → lvl 99), `gather.js` (sourced tree/axe tables — see
  GAME_KB "Woodcutting"; the four unpublished rates are labelled `GATHER_CONFIG` placeholders),
  `player-state.js` (28-slot inventory w/ stacking, bank, xp/levels, serialization).
- **Client**: chop sessions run on game ticks (walk-to via BFS, axe + level gating with real
  requirements, logs+XP on success, level-up messages, tree depletion/respawn state, felled trees
  lose their menu until respawn), bank booths/chests open a working deposit/withdraw panel,
  side panel with Inventory (sprite icons) / Skills tabs, message log, state persisted to
  localStorage (`osrs-world:v1`; bronze-axe sandbox starting kit).
- **Honesty guard in CI**: `tests/simulation.test.js` verifies every tree/axe item id against the
  real `items.pack` name — the tables cannot silently drift from the cache. 49/49 tests.
- Verified headless: hover "Chop down Tree / 1 more" → click → walked to the real tree at
  (3217,3231) → "You get some logs. (+25 Woodcutting xp)" → inventory 2/28.

---

### 2026-07-07 — Navigation approach fix, wheel capture, Mining

- **Multi-goal pathfinding** (`collision.js findPath` gains `opts.goals`): interactions now
  target *every* tile adjacent to the object footprint (walls/doors: both sides of the edge);
  BFS explores by increasing cost so the first goal reached is the minimum-cost one — the player
  stops at the **near side** instead of circling to whatever tile was closest to the object's
  centre. Test-pinned (near-side stop, no-detour length, far-side-only door routing).
- **Wheel capture:** scrolling over the canvas no longer scrolls the page.
- **Mining shipped:** copper/tin/iron/coal. Rock object ids sourced from OSRS Wiki rock pages
  and cross-validated against extracted placements at real mine sites (SE Varrock shows exactly
  the sourced iron/copper ids); level reqs/XP/respawns sourced; standard rocks deplete after one
  ore (documented). Ore + pickaxe item ids test-guarded against `items.pack`; rock ids checked
  against `objects.pack` Mine actions. Starting kit gains a bronze pickaxe; "Varrock SE mine"
  landmark added. Per-roll success chance remains the labelled `GATHER_CONFIG` placeholder.
- Verified headless: travel → hover "Mine Iron rocks" → click walks to the rock → authentic
  level gate ("You need a Mining level of 15") at Mining 1. 55/55 tests.

---

### 2026-07-07 — Vertical movement: planes 0–3 + underground; climb actions live

- **Multi-plane extraction** (`openrs2_extract.py`): per-plane collision worlds (bridge flag
  shifts a tile's content down one plane at every level), per-plane interactable locs
  (74,007 across 2,238 region-planes), per-plane map tiles — empty upper planes skipped
  (+3,222 upper sheets). Renderer reworked to 64×64 + NEAREST resize (~16× faster). Plane-0
  filenames unchanged; upper planes are `<rid>.<z>.*`; manifest lists planes per region.
- **Climb conventions** (`assets/js/world/climb.js`, tested): exact climb destinations are
  server-side data, so we use the documented coordinate conventions — same tile plane ±1 for
  stairs/ladders, the standard ±6,400-tile offset for trapdoors/dungeons — and settle on the
  nearest walkable mapped tile; unmapped destinations refuse. Client is fully plane-aware
  (region/loc/door caches keyed by plane, HUD shows floor/underground).
- **Validation:** headless round-trip — "Climb-down Trapdoor" in the Lumbridge kitchen at
  (3209,3216) lands at (3208,9615) in region 12950, the *real mapped cellar*, with the real exit
  Ladder adjacent; "Climb-up Ladder" returns to the surface at (3208,3215). The ±6400 convention
  drops precisely into real dungeon content. 56/56 tests.

---

### 2026-07-07 — NPCs in the world; climb variants + passage transports resolved

- **NPC spawns** (agent-datamined under the KB protocol, fetchstrip noise discipline):
  `tools/build_npc_spawns.py` ingests the community dataset behind the OSRS Wiki world map
  (`mejrs/data_osrs` `NPCList_OSRS.json` — spawn coords are server-side, not cache data),
  validates every id against `npcs.pack` (18,888 kept / 5,222 dropped as absent from this cache
  snapshot), and emits per-region/plane `assets/data/cache/npc-spawns/*.json.gz` (1,075 buckets,
  4.3 MB). Lumbridge validation: Hans, Cook, the tutors, Father Aereck et al. resolve at the
  right tiles. Sourced + caveated in GAME_KB ("NPC spawn points").
- **Client NPC layer:** yellow spawn markers (minimap colour convention), hover
  "<action> Name (level-X)", right-click menus with each NPC's real cache actions, click walks
  adjacent; interactions themselves (dialogue/combat/thieving) honestly report unsimulated.
- **Climb variants resolved:** generic "Climb" opens the game's up/down choice when both exist;
  "Top-floor"/"Bottom-floor" jump to the highest mapped floor / ground; cave/tunnel/passage
  transports (Enter/Exit/Go-through/Crawl-through/…) reuse the documented dungeon-band convention.
- Verified headless: hover "Talk-to Man (level-2)" beside Lumbridge spawn; menu rows
  [Talk-to, Attack, Pickpocket, Walk here, Cancel]. 56/56 tests.

---

### 2026-07-07 — All remaining "not simulated" interactions implemented

`assets/js/world/combat.js` (pure, tested) + client wiring. Every previously-stubbed action now
has a concrete system; only server-side *datasets* (not verbs) remain outstanding.

- **Combat (Attack):** documented melee formulas — max hit `floor(0.5 + effStr·(bonus+64)/640)`
  (anchors tested: 1 at str 1, 11 unarmed at 99), accuracy roll ratio, 4-tick unarmed speed,
  4×damage style XP + 1.33×damage Hitpoints XP; real NPC stats via the verified stats order;
  HP pool (start Hitpoints 10 = 1,154 xp, 1 hp/min regen), NPC death → grayed marker + respawn
  (placeholder timer), player death → Lumbridge respawn. **No drops — drop tables are server data.**
  Labelled approximations: gear bonuses 0 (not extracted), no NPC movement AI, SIM_CONFIG knobs.
- **Pickpocket:** sourced Man/Woman table (lvl 1, 8 xp, 3 coins; fail = ~5 s stun + 1 damage);
  unsourced NPCs refuse rather than guess loot.
- **Fishing:** Net spots → Raw shrimps, lvl 1, 10 xp (net in starting kit); other methods
  refuse pending sourced tables.
- **Prayer:** altars restore points to Prayer level. **Search:** the documented default
  "nothing of interest" (yield tables are server data). **Read / Talk-to / Trade:** dialogue
  frame stating scripts/stock are server-side and unsourced. **Bankers/Deposit boxes** open the
  bank; **full-block gates (types 9-11)** open/close their footprint clipping.
- Vitals (HP/Prayer) persist and render in the Skills panel; stuns block movement; moving breaks
  combat. Item-id honesty guards extended (Coins/Raw shrimps/net). 60/60 tests.

---

### 2026-07-07 — Gear bonuses, drop tables, NPC wander; shops honestly blocked

Three sourced systems + one honest refusal. 69/69 tests.

- **Gear (equipment.pack):** `tools/build_equipment.py` over osrsbox-db `items-complete.json`
  — 2,229 equipable items kept (id+name cross-validated against items.pack; 1,607 name-drift +
  49 missing-id records dropped, reasons printed). 14 bonus fields copied exactly as sourced.
  `swing()` grew `{attBonus, strBonus}` opts (backward-compatible); player-state grew
  `equipped`/`equip`/`unequip`/`getBonuses`; client has an Equipment tab + Equip option on
  inventory items, and combat uses worn stab attack + melee strength.
- **Drops (drops.pack):** `tools/build_drops.py` over osrsbox-db `monsters-complete.json` —
  2,086 npcs / 58,375 entries kept (npc ids validated against npcs.pack; item id+name against
  items.pack; 8,297 name-drift entries dropped). Rarities are the source's floats, untouched.
  Kills roll the table → ground items (red dots, Take, 200-tick despawn); npcs without a
  sourced table log "No sourced drop table" and drop nothing.
- **NPC wander (npc-ai.js):** pure `npcWanderStep` — random 8-dir step, Chebyshev ≤ 5 of
  spawn, collision-checked; client moves viewport-local npcs every ~3 ticks, dead/fighting
  npcs stand still, respawns land at spawn. Radius/cadence are labelled placeholders
  (unpublished server data).
- **Shops:** NO sourced dataset exists — osrsbox-db `shops.json` (404), mejrs/data_osrs (no
  shop file in the repo listing), other candidates 404. Trade dialogue + /play notes + BACKLOG
  now state the gap explicitly instead of inventing stock. (KB no-fabrication protocol.)

---

### 2026-07-07 — RSPS repos approved as data sources: shops live, params sourced

Directive: OSRS private-server codebases + RuneLite may be mined for DATA (never code, never
dialogue), cited repo+commit+path, labelled "RSPS-derived approximation", ids validated
against our packs. 71/71 tests.

- **Shops (shops.pack + Trade UI):** Apollo (rev 377) `shops.plugin.kts` DSL parsed for the
  five starter cities → 19 shops / 166 stock entries (values from osrsbox `cost`; 1 ambiguous
  'Cape' entry dropped). Bindings by OSRS npc NAME validated in npcs.pack; the Varrock
  Swordshop pair (2884/2885) bound by id after spawn-coordinate verification (same names as
  general-store keepers — GOTCHAS G-5). Buy/sell UI with Apollo's value multipliers and
  rsmod's restockCycles=100 drift; unsourced shops still refuse honestly.
- **Sim params:** npcRespawnTicks 50→100 (rsmod DEFAULT_RESPAWN_RATE, 2004scape corroborates);
  flat thieve/fish chance knobs replaced by the documented low/high level interpolation
  (`statRandomChance`) with 2004scape's Man/Woman 180/240 and shrimps 48/256 pairs — both
  files' XP values independently corroborate our wiki-sourced 8/10 xp. WANDER_RADIUS 5 label
  upgraded to RSPS-derived (rsmod default). Wiki-vs-2004scape stun conflict recorded (G-6,
  wiki wins). Still UNKNOWN: wander cadence, GATHER_CONFIG rates (2004scape has per-tree/axe
  low/high woodcutting tables — future upgrade candidate).
- **Drop tables for osrsbox's 914 missing npcs: skipped (not cheap).** 2004scape's tables are
  RuneScript control flow (`data/src/scripts/drop tables/scripts/*.rs2`), keyed by 2004-era
  script names; rsmod content has none. Zenyte source: no public repo found (GitHub search).
- Checked and empty: osrsbox shops.json (404), mejrs/data_osrs (no shop file),
  Tomm0017/rsmod (engine-only shops), rsmod content (1 shop, used for restock only).

---

### 2026-07-07 — Quest Order endpoint (Quest Helper mining)

**What & why.** New tool at `/tools/quest-order`: the user's "walk the quest list top-to-bottom,
see what I *can* do, then what I *should* do next" workflow, made interactive.

**Sourcing (all real, nothing fabricated).** Mined the RuneLite **Quest Helper** plugin
(`Zoinkwiz/quest-helper`) + RuneLite `Quest.java`:
- **Order** = OSRS Wiki *Optimal quest guide*, read verbatim from `OptimalQuestGuide.java`.
  Key finding: Quest Helper does NOT compute an order — `sortOptimalOrder()` sorts by index in
  a hand-curated `ImmutableList`. So the order is a *curated recommendation, not a solved
  optimum* — surfaced as such on the page and in GOTCHAS **[G-7]**.
- **Requirements** from each helper's `getGeneralRequirements()` start-gate only (skills, prereq
  quests, quest points, combat). Step-level item/varbit reqs excluded on purpose; quests whose
  gate we can't fully read statically are flagged `req_partial` (43/272) — GOTCHAS **[G-8]**.
- **Leagues** region tags from `LeagueQuestRegions.java` (207/272) → region-lock aware gating
  (a quest is reachable only if all its regions are unlocked; enforces "best is relative", G-1).

**Pieces.** `tools/build_quests.py` (extractor) → `assets/data/tools/quests.jsonl` (272 quests,
260 in guide order, 0 dangling prereq refs). `tools/quest-order/index.html` +
`assets/js/tools/quest-order.js` (vanilla ES module, localStorage state, done/can-do/blocked/
region-locked per your stats, "your next quest" highlight). Registered via `graph.json` →
`build.py` (regenerates nav/sitemap/catalog; hand-authored tool page preserved).

**Honest gaps (deferred, not faked):** per-quest QP/XP *rewards* and durations are not included.

---

<!-- Add entries below as features are built out -->

### 2026-07-12 — W2 consolidation: wiki refs universal on route-p2p/route-corpus

**What.** Merged all 128 W2 scrambler contributions (`tools/wiki-kb/contrib.jsonl`) into
`assets/data/tools/steps.jsonl` per the BRIEFING §C contract: refs[] (manifest-validated,
slug-deduped), atom{}/hints[] onto rows lacking them, wiki `{{Map}}` coords → row
`mapMarkers` (bad-marker plague pins replaced, e.g. train-thieving-20's "Lumbridge cows").
New `assets/data/tools/step_refs.jsonl` sidecar carries refs/markers for emitted ids that
are not steps.jsonl rows (milestone-*, steer-*, synth-*, chkpt-*, planner bg/bootstrap).
93 uncovered rows got consolidator-derived refs (17 pages fetched: 6 skill-training guides,
Nightmare Zone, Maniacal monkey, 5 quest pages, 5 RFD subpages).

**enrich.py.** (1) checkpoint header ids are now REGISTRY-stable
(`chkpt-<coarse>-<idx in coarse_expansions checkpoints[]>`) instead of per-route emission
order — the same id names the same checkpoint in every route; (2) row-level mapMarkers
override catalog zone pins; (3) universal by-id refs/markers fill pass so milestone/steer/
bg/checkpoint emitters no longer drop refs.

**Result.** steps-with-refs 123/123 (route-p2p), 186/186 (route-corpus); zero refs outside
`manifest.jsonl`; `npm test` 73/73 (no baseline re-pin — step sets unchanged).

**Deferred to Lane 5 (79 `lane5:*` queue tickets).** PROPOSED-ID row minting (would
renumber synth-* ids and orphan this pass's synth-keyed refs; several proposals carry
contributor-flagged ASSUMED prereqs), the consolidate-xp systematic xp corrections, and
57 contribution FLAGs (wrong quest rewards incl. Nature Spirit/Swan Song/MM1, unlock-gwd
Strength-OR-Agility gate, setup-ultracompost recipe wrong on three axes, unsourced
prayer-43 gates, supply_chains herblore 52→38 root-cause for both synth-tag placeholders).

## 2026-07-12 — Wiki-grounded guide-chain: full arc shipped

Ultracode session. Everything below committed across osrs-wiki + runelite-guide-chain and deployed live to the box (http://127.0.0.1:7780/).

**Chains (4, selectable):** Step 0 → Early Game (character creation → Tutorial Island → first quests, action grain), P2P Progression (milestone episodes + supply chains), Quest Progression (312 steps, 215/216 quests prereq-ordered), Full Corpus appendix.

**Data:** quest_db.jsonl = 264 wiki-cited rows (191/191 quests, 48/48 diaries, 25 miniquests); reference catalog = 318 entries (+minigames/unlocks); ~557-item classify census. Every route step carries wiki refs[].

**Web:** wiki citation chips → persistent local-blob lightbox (self-served; wiki blocks iframes); two-way checklist toggle (never one-way); coverage index; Library + Reference directories (kind tabs, search); frames gallery with REAL rev-236 in-world scenario captures (chickens/cows/Master Farmer); sticky detail; scroll-yank fixed.

**Planner:** interleaved requisite-burndown (items = produces/consumes edges); Lane 1 steer phasing, Lane 2 burndown+supply chains, Lane 3 sequencer (defer/hub/passive/alternation), Lane 4 plugin RECURRING+panel parity, M2 speedrun cost-model (flag), F1 gallery, quests-first-class (reward XP prunes bands), granularity atom{}/hints[]/checkpoints[]/branch{}. Design in tools/guide-export/design/{SYNTHESIS,granularity/GRANULARITY,MATERIALIZATION,FRAMES_GALLERY}.md.

**Capture harness (scenario-capture/):** rev-236 proto-server + rsprox-referenced protocol (RebuildLogin GPI-first, PlayerInfo op54, IF_OPENTOP, NPC spawn) → in-world scenario render WORKS, oracle-verified, captioned frames+gif per scenario. Off-JVM authored; no real creds. SME_NOTES.md.

**Tooling/discipline:** wikicli (cached MediaWiki API, --strip, idempotent ledgers) + NOISEBENCH; .claude/agents/{wiki-researcher,noise-calibrator}; CLAUDE.md; fan-out discipline (classify-first micro-bursts, bash-write-only, read-ledger-first, canonical-trigger retros).
