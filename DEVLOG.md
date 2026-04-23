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

<!-- Add entries below as features are built out -->
