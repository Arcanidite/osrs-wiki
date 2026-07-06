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

<!-- Add entries below as features are built out -->
