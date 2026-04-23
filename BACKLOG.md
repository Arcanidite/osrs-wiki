# OSRS Wiki — Feature Backlog

Tracking file for unimplemented requests. Each item has a semantic label in `[brackets]` for cross-referencing from todos and memory.

---

## [router:step-notes] Per-step inline notes on rendered route

Each route step in the output should have an editable note field directly on the rendered `<li>`. Notes are stored in `localStorage` keyed by step id (`osrs-step-notes`), survive plan saves and reloads, and are included when saving a plan (serialised into `plan.stepNotes`). When a plan is loaded the notes are restored.

**Status:** DONE ✓ (commit after `94bd463`)

---

## [router:step-insert] Ad-hoc step insertion between route steps

An "Insert step" affordance between each pair of adjacent route steps. Opens an inline form (label + detail) and splices a custom step into the rendered path at that position. Inserted steps carry `_custom: true` and are persisted in `plan.steps` on save.

**Status:** DONE ✓ (commit after `94bd463`)

---

## [router:plan-crud] In-route plan CRUD (rename, delete, update)

When a plan is loaded and displayed in the route panel, provide:
- **Rename** — edit the plan name directly in the route header (updates localStorage entry in-place by plan index).
- **Update** — "Update saved plan" button replaces the stored plan with the current route state (same index).
- **Delete** — delete the current plan from localStorage without leaving the route output.

**Status:** DONE ✓ (commit after `94bd463`)

---

## [router:plan-list-edit] Plan list inline rename

Each saved plan card in the Saved Plans list should support inline rename: click the title → becomes an `<input>`, blur/Enter saves the new name back to localStorage.

**Status:** DONE ✓ (commit after `94bd463`)

---

## [router:quest-state] Quest completion state checkbox per step

Quest-tagged steps in the route output should render a checkbox. Checking it marks the quest complete, updates `completedQuests` state, and triggers a re-route from that checkpoint forward. This is the "user checks off completed quests, system recomputes position" mechanic from the original spec.

**Status:** TODO — quest state tracking added to router logic but no UI checkbox yet.

---

## [sprite:page-integration] Wire SpriteAtlas into catalog and item pages

`assets/js/sprite.js` is implemented but not yet included in any page layout or wired into the catalog grid. Item entries in the catalog should show their icon via `SpriteAtlas.css(itemId)`.

**Status:** TODO

---

## [cache:locations] locations.pack — blocked on fresh XTEA keys

Extraction pipeline is in place (`extract_cache.py --xtea`). Location data remains empty until fresh XTEA keys are available (requires RuneLite session auth or a new key snapshot). Region-level object placement overlay on the map view depends on this.

**Status:** BLOCKED — resume when fresh keys available.

---

## Completed

- `[router:dijkstra]` — Dijkstra min-heap routing replacing greedy scan ✓ (`94bd463`)
- `[router:quest-gate-logic]` — `completedQuests` set in routing, `quest_gate` gating in `locationAccessible` ✓ (`94bd463`)
- `[router:opportunistic]` — `markOpportunities` region-chaining hints with `opp` badge ✓ (`94bd463`)
- `[router:autoload]` — `STORE_ACTIVE` autoload on init ✓ (`94bd463`)
- `[router:plan-id-fix]` — `rt-plan-notes` → `rt-plan-desc` id fix ✓ (`94bd463`)
- `[router:plan-actions-grid]` — equal-width Load/Delete via CSS grid ✓ (`94bd463`)
- `[sprite:atlas]` — `sprite.js` module: `draw`, `css`, `entry`, `byName`, `search` ✓ (`94bd463`)
- `[cache:sprites]` — `items.png` spritesheet + `items-atlas.json` generated ✓ (`e442afd`)
- `[cache:maptiles]` — 1,150 region PNG chunks + `manifest.json` ✓ (`e442afd`)
- `[cache:items-npcs-objects]` — `items.pack`, `npcs.pack`, `objects.pack` extracted ✓ (`e442afd`)
