# BACKEND REPLAY — service-as-source-of-truth + observation ledger + arrow-waypoint plugin

Design only (no code in this change). Unifies the PROVEN thin-client pattern
(overlay-bridge v1, `tools/overlay-bridge/PROTOCOL.md`; BF helper live end-to-end)
with the PROVEN media-capture engine (rev-236 proto-server + scenario runner +
oracle, `scenario-capture/SME_NOTES.md` §15-21) so the guide-chain plugin is fed
by a backend service, the service keeps an ordered/deduped ledger of everything
the client showed, and that ledger replays into the capture engine for checklist
reference extraction. An arrow-waypoint augmentation (Quest-Helper-verbatim
rendering) lets the SME queue observations the user is guided to produce.

HARD RULES (every section inherits these):
- Overlay/highlight ONLY. The system never injects input, never clicks, never
  automates the game. Waypoints guide the USER; the user performs every action.
- No real credentials anywhere. The capture engine runs loopback-only with dummy
  accounts; the live bridge runs on the localhost/WG trust boundary only.
- Thin client + restartable service. All logic changes are service restarts /
  hot-reloads. The RuneLite client is never relaunched for a logic change.
- Loopback/offline harness for anything replayed; the live client is the user's.

```
                 ┌────────────────────────────  live side  ───────────────────────────┐
  RuneLite ──────┤ overlay-bridge plugin (thin: extract + render, v2)                  │
  (user's box)   │   ▲ render directives (checklist, highlights, QH arrows, lines)     │
                 │   ▼ state/events/discovered (subscription-driven, seq-ordered)      │
                 └───────────────┬──────────────────────────────────────────────────---┘
                                 │ newline-JSON over TCP (v1 transport, unchanged)
                 ┌───────────────▼──────────────  service (this host)  ────────────────┐
                 │ guide-replay service (Python asyncio, hot-reload, restartable)      │
                 │  policy modules: guide-chain feed · observe queue · (BF policy)     │
                 │  reachability gate (quests+skills+items → can-do frontier)          │
                 │  OBSERVATION LEDGER (append-only, deduped, value-grouped, ordered)  │
                 └───────────────┬──────────────────────────────────────────────────---┘
                                 │ ledger2scenario (offline compiler)
                 ┌───────────────▼──────────────  offline side  ────────────────────────┐
                 │ rev-236 capture engine: run_scenario.py → proto-server state         │
                 │ injection → Xvfb client → captioned frames/gifs → oracle → manifest  │
                 │ → FRAMES_GALLERY media[] / checklist reference values                │
                 └──────────────────────────────────────────────────────────────────---─┘
```

---

## 1. SERVICE-AS-SOURCE-OF-TRUTH — feeding the guide-chain plugin

### 1a. One plugin, one service, policy modules

Decision: do NOT stand up a second plugin or a second port per domain. The
overlay-bridge plugin (already live: `TechDevGroup/runelite-overlay-bridge` →
`osrs-overlay-service`, WG-direct `10.66.0.1:43599`) is the single thin client;
the service hosts multiple **policy modules** (`policy_bf.py`, `policy_guide.py`,
`policy_observe.py`), each hot-reloaded on mtime like `policy_bf` today. v1's
"second domain = another port" note is superseded: one socket avoids plugin
config churn, and the modules share one state stream + one ledger. Subscriptions
are the UNION of what active modules request; directives are the concatenation
of what they emit (each module tags its directives with a `src` field so the
debug panel can attribute them).

The thick guide-chain plugin (v0.3.x, `runelite-guide-chain/`) is superseded the
same way the monolith BF helper was: its `GuideManager`/`ConditionEvaluator`
logic moves into `policy_guide.py`; its overlays are replaced by bridge
directives; its sidebar `PluginPanel` is grafted later as a thin renderer of a
`panel` directive (Lane G note). Never both enabled at once (double-draw rule,
same as BF monolith retirement).

### 1b. Protocol v2 (additive extension of overlay-bridge v1)

Transport, lifecycle, `ttlTicks` fail-safe, seq-echo, unknown-kind-ignored: all
unchanged from `tools/overlay-bridge/PROTOCOL.md`. v2 is additive only — a v1
plugin against a v2 service degrades gracefully (unknown directives ignored;
unrequested state absent). Port discipline unchanged: service binds host
`127.0.0.1,10.66.0.1:43599` (43594 is the game/proto-server port — collision
gotcha already logged).

**subscribe additions (service → plugin):**
```jsonc
{"t":"subscribe","proto":2,
 "skills":["attack","strength","magic","agility"],   // NEW: level+xp per named skill
 "events":[ ...v1 kinds...,
   "varbitChanged","varpChanged",                    // delta events (id, old, new)
   "itemContainerChanged",                           // containerId + full item list
   "widgetLoaded","widgetClosed",                    // group id
   "objectSpawned","objectDespawned",                // id + loc (subscribed ids or "*")
   "npcSpawned","npcDespawned",
   "groundItemSpawned",
   "interactingChanged","chatMessage"],
 "spawnScope":"subscribed"|"all"                     // "all" only while an observation is armed
}
```

**event framing (plugin → service) — the ordering contract:** every event row
carries `tick` plus `idx`, the plugin's monotonic dispatch counter within that
tick, assigned in the order RuneLite fires the callbacks on the client thread:

```jsonc
{"t":"event","name":"varbitChanged","tick":T,"idx":3,"id":5357,"old":0,"new":42000}
{"t":"event","name":"itemContainerChanged","tick":T,"idx":4,"container":93,
 "items":[{"slot":0,"id":1739,"qty":1}, ...]}
{"t":"event","name":"widgetLoaded","tick":T,"idx":5,"group":270}
```

Why this suffices as the packet-order proxy: RuneLite dispatches
`VarbitChanged`/`ItemContainerChanged`/`WidgetLoaded` DURING server-packet
processing on the client thread, so within a tick the callback order follows the
order the gamestate packets were applied. `(session_epoch, tick, idx)` is
therefore the synchronous order key the ledger preserves (§2). Ordering
confidence is per-kind, not uniform: scene spawn events can batch on region
load — the ledger marks those rows `order:"tick"` (tick-accurate) vs
`order:"exact"` (dispatch-accurate); consumers that need strict causality use
only `exact` rows.

**one-shot probes (service → plugin → service):** keeps the per-tick payload
small while letting the service pull a full reveal when one matters:
```jsonc
{"t":"widgetDump","group":270}                        // service asks once
{"t":"widgetTree","group":270,"tick":T,"idx":9,       // plugin replies once
 "children":[{"child":5,"type":"text","text":"What would you like to make?",
              "bounds":{"x":..,"y":..,"w":..,"h":..},"itemId":null,"opts":["Continue"]}, ...]}
{"t":"snapshot"}                                      // full perception dump on demand
{"t":"perception", ...idempotent deduped snapshot per thin-client addendum...}
```
`snapshot`/`perception` is issued on every (re)connect — it is the ledger's
baseline row set for a session (idempotent by design: same world state → same
snapshot → zero new ledger rows).

**directive additions (service → plugin) — the guide-chain feed:**
```jsonc
{"kind":"panel","src":"guide","title":"Chill Ironman — step 12/58",
 "rows":[{"id":"train-attack-10","label":"Train Attack 1→10","state":"done"},
         {"id":"train-attack-30","label":"Train Attack 10→30","state":"active",
          "detail":"Cows east of Lumbridge. Drop bones? No — bury."},
         {"id":"quest-cooks","label":"Cook's Assistant","state":"pending"}]}
{"kind":"worldArrow","plane":0,"x":3253,"y":3266,"color":"#00ff88"}   // v1 kind, QH-verbatim render (§4)
{"kind":"minimapArrow","plane":0,"x":3253,"y":3266,"color":"#00ff88"} // NEW (§4)
{"kind":"worldMapArrow","x":3253,"y":3266,"plane":0,"label":"Cows"}   // NEW (§4)
{"kind":"worldLine","color":"#00ff88","points":[[3222,3218,0],[3230,3240,0],[3253,3266,0]]} // NEW (§4)
```
Plus the existing v1 vocabulary (tile/object/npc/invSlot/invItem/bankItem/
widget/text/menuHint + Predicted ghosts) for step highlights — the guide-chain
`highlightTarget` types (OBJECT/NPC/ITEM/WIDGET/TILE, `schema/guide.schema.json`)
map 1:1 onto v1 directive kinds; `mapMarkers` map onto `worldMapArrow`.

### 1c. How the guide feed works (policy_guide.py)

- Loads guide JSON from the git `guides` branch raw URLs (+ local override files)
  — data-driven, exactly the guide-chain plan; the planner (`plan.mjs`/`enrich.py`)
  stays the ordering authority upstream.
- Evaluates `completionConditions` (QUEST/VARBIT/SKILL/ITEM_HELD/REGION/MANUAL)
  against the live state stream — the ConditionEvaluator port. Auto-advance
  emits a fresh `panel` + the next step's highlight/arrow directives.
- Persists progression (`~/.local/state/guide-service/progress.json`) so a
  service restart resumes mid-checklist; the plugin needs nothing (it re-hellos,
  gets a snapshot request, then the current render).
- The step atom id currently active is stamped onto every ledger row (§2) —
  this is what later binds captured values back to checklist steps.

---

## 2. THE OBSERVATION LEDGER — idempotent, deduped, value-grouped, order-preserving

The service maintains one append-only ledger of "what the client showed",
keyed by the entity-kb key namespace (`scenario-capture/entity-kb/SCHEMA.md`:
`item:<id>` / `obj:<id>` / `npc:<id>` / `if:<group>:<child>` / `varbit:<id>`),
derived from the subscription stream. This is the bridge between the live (or
replayed) client and the capture engine: user issues an event → server responds
→ the client-side deltas (which ARE the applied gamestate packets, §1b) reveal
the values → the ledger records them once, in order, attributed to their cause.

### 2a. Storage: two append-only files + derived indices

**`values.jsonl` — the dedupe.** One row per DISTINCT (key, vhash). The full
payload lives here exactly once, no matter how many times the client re-shows it:
```jsonc
{"key":"if:270:5","kind":"widget","vhash":"9f3ac2e01b44",
 "value":{"type":"text","text":"What would you like to make?","opts":["Continue"],
          "bounds":{"w":486,"h":42},"itemId":null},
 "first_seq":[3,12841,5],"session":"s2026-07-12a","profile":"p:sha1-8",
 "rev":236,"order":"exact"}
```
`vhash` = sha1-12 of the canonical (sorted-key, bounds-stripped-of-position)
value JSON. Positional jitter (canvas x/y) is excluded from the hash so a widget
re-opened at a different window size is still the same value; bounds w/h stay in.

**`order.jsonl` — the synchronous order.** One thin row per state TRANSITION
(key's current vhash changed), append-only, never rewritten:
```jsonc
{"seq":[3,12841,5],            // [session_epoch, tick, idx] — total order
 "key":"if:270:5","vhash":"9f3ac2e01b44",
 "cause":{"seq":[3,12841,2],"event":"menuOptionClicked",
          "option":"Smelt","targetKey":"obj:24009","opIndex":1}|null,
 "step":"train-smithing-20"|null}
```

**Derived, regenerable (never authoritative):**
- `dedup.idx` — (key,vhash) → first_seq. The idempotency check.
- `groups/` — per-key VALUE GROUPS: for each key, the distinct vhashes in
  first-appearance order, each with its occurrence seq list + count. This is the
  "deduped items grouped by value" view: `group("if:270")` = every distinct
  state the smelting interface was ever seen in; `group("npc:3316")` = every
  distinct reveal (spawn loc set, option text) of the chicken.
- `last.state` — key → current vhash (the fold accumulator).

### 2b. The ingest fold (idempotence)

Pure fold over the incoming stream, per event:
1. Normalize event → zero or more `(key, value)` observations (mapping table:
   `itemContainerChanged(93)` → one `inv` composite row + per-item `item:<id>`
   rows; `widgetTree` → per-child `if:<g>:<c>` rows; `varbitChanged` →
   `varbit:<id>`; spawns → `npc:/obj:<id>` with loc; `chatMessage(GAMEMESSAGE)`
   → `chat:<sha1>` — game messages are values too, e.g. "You feel you have
   gained a level").
2. `vhash(value)`; if `last.state[key] == vhash` → drop (no transition).
3. If `(key,vhash)` unseen → append to `values.jsonl`.
4. Append transition to `order.jsonl`; update `last.state`.
5. Cause attribution: if a `menuOptionClicked` (or other user event) occurred
   within the attribution window — same tick or the previous 2 ticks, nearest
   wins — stamp it as `cause` with its seq. Ambiguous (two user events in
   window) → `cause.confidence:"ambiguous"`; none → null.

Consequences: reconnect + snapshot replays the same world → steps 2/3 drop
everything → ZERO new rows (idempotent fetch). Replaying a recorded session
file through the fold is a no-op the second time. The fold is deterministic, so
`order.jsonl` + `values.jsonl` fully regenerate every index.

### 2c. Query API (service-local HTTP, 127.0.0.1)

- `GET /ledger/group?key=if:270` → the value group (distinct values, ordered).
- `GET /ledger/window?from=3.12841.0&to=3.12900.0` → ordered transition slice
  with values joined — the replay extraction unit (§3).
- `GET /ledger/cause?event_seq=…` → all transitions attributed to a user event
  (the "what did that click reveal" query — the SME's primary probe).
- `GET /ledger/step?id=train-smithing-20` → everything observed while that
  checklist atom was active.

---

## 3. REPLAY INTO THE CAPTURE ENGINE — ledger → scenario → frames

Goal: any scene/UI the user (or a recorded session) produced can be
reconstructed on the rev-236 proto-server so `spike/scenario/run_scenario.py`
captures it deterministically — checklist reference frames without ever
touching a live account for capture.

### 3a. The compiler: `ledger2scenario.py` (offline, service repo)

Input: a ledger window (typically `GET /ledger/cause` around one interaction,
padded to quiescence = 4 ticks with no attributed transitions). Output: a
scenario JSON per `SCENARIO_FORMAT.md`, world block projected as:

| ledger rows in window                | scenario field                          |
|--------------------------------------|-----------------------------------------|
| player pos (state at window start)    | `world.player {x,y,plane}` + `spawn_region` |
| `npc:<id>` rows with loc              | `world.npcs [{id,x,y}]`                 |
| `obj:<id>` rows with loc              | `world.objects [{id,x,y,plane,rot}]`    |
| `item:*` via inv composite (pre-window last state) | `world.inventory [{id,qty,slot}]` |
| `varbit:*` last values (pre-window)   | `world.varbits {id:value}`              |
| `if:*` rows (groups opened in window) | `world.interfaces [{group, texts:{child:...}}]` — NEW field |
| window's `step`                       | `source_step`                           |
| `step` → steps.jsonl `refs[]`         | `expectations[].wiki_ref`               |
| window keys (cache ids)               | `expectations[].entity_ids`             |

Beats: one per DISPLAY transition group (consecutive transitions sharing a
cause) — caption from the cause (`"Click Smelt on the furnace → smelting
interface opens"`, own words template, never game dialogue), `capture:"frame"`;
a trailing `gif` beat when the window includes animation events. `state_hash`
already covers `world` — the manifest row ties the frame to the exact injected
state, satisfying the FRAMES_GALLERY provenance bar (media never ships without
the producing state).

### 3b. The injection seam (what exists / what extends)

Exists today (proven, P11-P13): `run_scenario.py` → env `SPAWN_REGION`,
`PLAYER_XY`, `SEND_PLAYER_INFO`, `WORLD_NPCS` → `serve.py` → `World` seam →
RebuildLogin(34, GPI-first) + PlayerInfo(54) + IF_OPENTOP(67, root 548) +
SET_NPC_UPDATE_ORIGIN(40)/NPC_INFO_SMALL_V5(64).

Extensions (Lane S), replacing env creep with one file — `run_scenario.py
--world world.json` (env vars kept as overrides for the existing scenarios):
- `WORLD_OBJECTS` → zone-update LOC add packet (injected objects beyond the
  cache's own locs; region-native objects already render from the local cache).
- `INVENTORY` → container-update full packet (inv 93; bank 95 later).
- `VARBITS` → VARP_SMALL=56 / VARP_LARGE=95 (v236 ids already confirmed in
  SME_NOTES §21b — trust only the rsprox v236 `GameServerProtId` list).
- `INTERFACES` → IF_OPENSUB + IF_SETTEXT bursts after IF_OPENTOP (the §21f
  "remaining niceties" — this is where UI replay lands).

Method discipline (the P6→P11 lesson, load-bearing): every packet here is a
**rsprox-real-traffic LOOKUP, not deep RE** — take the v236 decoder from
`scenario-capture/rsprox-probe`, mirror its read order, prove with an offline
decoder-sim test first (`spike/server/tests/test_*_236.py` pattern), only then
boot the client. Each packet is a bounded, independently-shippable increment;
UI replay degrades gracefully (a scenario whose `interfaces` can't render yet
still captures the world scene, and the oracle honestly fails the UI beat).

### 3c. What replay is FOR (the extraction loop)

1. SME needs a reference (widget text, option label, scene appearance) for a
   checklist step → it is either already in the ledger (a past reveal — just
   read `values.jsonl`, no capture needed) or needs frames.
2. Frames needed → `ledger2scenario` compiles the window → `run_scenario.py`
   runs it → oracle-gated captioned frames/gifs land in
   `spike/scenario/out/<id>/` + manifest.
3. Handoff manifest (the P12 `gallery-out/step_media.jsonl` pattern) binds
   frames to steps → `enrich.py` attaches `media[]` → FRAMES_GALLERY.
   Text/value extraction (option strings, interface text) comes from the ledger
   DIRECTLY — frames are for the visual tier; the ledger is the value tier.

---

## 4. ARROW-WAYPOINT AUGMENTATION — Quest-Helper-verbatim rendering + the observe loop's front end

### 4a. The exact Quest Helper mechanism (replicate, do not reinvent)

Verified from `Zoinkwiz/quest-helper` source (BSD-2-Clause — port with
attribution headers; re-verify LICENSE at port time). The render path is:

- **Overlay host:** `QuestHelperWorldArrowOverlay` — `OverlayPosition.DYNAMIC`,
  `OverlayLayer.ABOVE_SCENE`; per frame it delegates to the active step's
  `makeWorldArrowOverlayHint(graphics, plugin)` (in `DetailedQuestStep`).
- **Scene arrow:** `DetailedQuestStep.renderArrow` computes the target tile's
  canvas poly (`Perspective.getCanvasTilePoly`), takes the poly-bounds centroid
  `(startX, startY)`, and calls
  `DirectionArrow.drawWorldArrow(Graphics2D, Color, int startX, int startY)`
  (`com/questhelper/steps/overlay/DirectionArrow.java`): a vertical shaft from
  `(startX, startY-13)` down to the centroid with a 5×4 head, 9px stroke, black
  outline + colored fill, drawn on a ~50% duty cycle
  (`currentRender < MAX_RENDER_SIZE/2`) for the characteristic flash.
- **Minimap arrow:** `DirectionArrow.renderMinimapArrow(...)` — target in local
  scene: `Perspective.localToMinimap` point, arrow drawn `(x, y-18)→(x, y-8)`;
  target distant: `atan2(dy, dx)` from player toward goal, arrow clamped
  55-65px out from the player's minimap icon (`createMinimapDirectionArrow`).
- **World-map arrow:** `QuestPerspective.mapWorldPointToGraphicsPoint` for the
  widget-space point; `DirectionArrow.renderWorldMapArrow(mapViewArea,
  drawPoint, mapPoint)` — when the target clamps outside the map view, the
  arrow rotates to the nearest of 8 compass headings pointing at it.
- **Path lines:** `WorldLines.drawLinesOnWorld` (scene),
  `WorldLines.createMinimapLines`, `WorldLines.createWorldMapLines` over a
  `List<WorldPoint>`.

Port destination: a `qh/` render package inside the overlay-bridge plugin —
`DirectionArrow`, `WorldLines`, and the needed `QuestPerspective` translation
methods, ported verbatim (geometry, offsets, duty cycle, clamps). The plugin
maps directive kinds → these renderers each frame:

| directive        | QH mechanism invoked                                        |
|------------------|-------------------------------------------------------------|
| `worldArrow`     | `DirectionArrow.drawWorldArrow` at the tile poly centroid    |
| `minimapArrow`   | `renderMinimapArrow` (near/far forms as above)               |
| `worldMapArrow`  | `renderWorldMapArrow` + `mapWorldPointToGraphicsPoint`       |
| `worldLine`      | `WorldLines.drawLinesOnWorld` + minimap + world-map variants |

The service names WorldPoints only; ALL geometry stays client-side (v1 rule:
the service never sees pixels). We do NOT use the client's native hint arrow
(`client.setHintArrow`) — QH draws its own, and so do we (composable: several
arrows/lines at once, our colors, no fight over the single native slot).

### 4b. The observation queue (policy_observe.py) — SME queues, user walks, system captures

The SME (or an agent lane) enqueues observation NEEDS; the service arms the
reachable ones as waypoints; the user — playing normally, clicking for
themself — produces the reveal; the ledger's cause attribution closes the loop
autonomously. Queue rows (append-only jsonl, same discipline as wiki-kb queues):

```jsonc
{"id":"obs:if270-smelting-options","state":"queued",   // queued|armed|captured|blocked|expired
 "need":"widget-values",                               // widget-values|frame|option-verify|loc-verify
 "key":"if:270",                                       // entity-kb key wanted
 "via":{"family":"OPLOC","opIndex":1,"targetKey":"obj:24009",
        "place":[3227,3254,0],"note":"Click Smelt on Lumbridge furnace"},
 "step":"train-smithing-20","wiki_ref":"Smelting","priority":40,
 "reach":null,                                          // gate verdict, filled by §4c
 "captured":{"cause_seq":null,"window":null}}
```

Lifecycle:
1. **queued → armed:** the reachability gate (§4c) passes AND the observation
   fits the user's current context (same region or on the current step's
   natural path — the queue never yanks the user across the map for a low
   priority row). Arming emits: `worldLine` path (planner/nav route to
   `via.place`), `worldArrow` + `minimapArrow` + `worldMapArrow` at the
   destination, an `object`/`npc` highlight on the target, an optional
   `menuHint` tinting the named option, and a `panel` row
   `"Observe: Click Smelt on the furnace"`. Highlight-only — arming changes
   pixels, never inputs.
2. **armed → captured:** the ledger fold sees a user event matching `via`
   (event family + option index + targetKey) and attributes display transitions
   to it → the row completes with `cause_seq` + window bounds; directives for
   it are withdrawn next render. The values are ALREADY in the ledger — capture
   is a byproduct of the user's own play. §3 replay is then available on demand.
3. **armed → expired:** N minutes without the event → back to queued (user
   declined/wandered; never nag-loop the same arrow).
4. **queued → blocked:** gate fails → `reach` records the unmet requirement and
   the FRONTIER (§4c); the frontier's requisite atoms are surfaced instead.

### 4c. The reachability gate

Inputs — the live state vector the service already holds: skills (v2
subscription), quest state (service-owned quest→varp/varbit completion table
over `assets/data/tools/quests.jsonl` req graph), items (inv/equip/bank
containers), player position.

`gate(via, state) → reachable | blocked(frontier)`:
1. **Requirement check:** `req_skills` / `req_quests` / `req_items` on the
   interaction row + the target's entity-kb gates (`morph_varbit`, interface
   `varbit_gate`) — an NPC/object that morphs away under the user's varbit
   state is unreachable no matter the geography.
2. **Navigation check:** region-graph BFS from the player's region to
   `via.place`'s region over entity-kb `nav:transport:*` rows, each transport
   edge filtered by ITS `req_items`/`req_quests`/`req_skills` against the state
   vector. v0 is region/zone-granular (coarse but safe: false-blocked beats
   false-reachable); tile-exact comes when the blurite/pathfinder port (SME P3:
   port-off-JVM verdict) lands — the gate's interface takes a pluggable
   `route(src, dst, state) → path|None` so the upgrade is a swap.
3. **Blocked → frontier:** map each unmet requirement to its producing atoms —
   `req_quests` → quests.jsonl nodes, `req_skills` → training atoms,
   `req_items` → produces-edges in the burndown graph — recurse until the set
   of atoms the user CAN do now is non-empty; order that set with the planner
   (`plan.mjs` / routeMulti seam). This is the directive's "if not reachable,
   restrict to requisite elements the user CAN do now": the queue re-targets
   the frontier, so the user is always walking toward the observation even
   when the observation itself is gated.

The gate is also what keeps arming honest: values get "primed/armed for
extraction" only along paths the user's real account state supports — no arrow
ever points at content the user can't act on.

---

## 5. PHASED BUILD PLAN — 7 disjoint lanes, least-risk-first

Each lane owns its files/seams; no two lanes edit the same file. Order is by
risk (pure-contract and pure-render first, the loop that needs everything last).
Every lane lands with its own offline test before any live-client exposure.

| # | Lane | Deliverable | Files / seams (owned) | Depends on | Risk |
|---|------|-------------|------------------------|------------|------|
| 1 | **P — protocol v2** | subscribe additions (skills, delta events, spawnScope), event `idx` ordering, `widgetDump`/`widgetTree`, `snapshot`/`perception`, new directive kinds registered (panel, minimapArrow, worldMapArrow, worldLine) | `tools/overlay-bridge/PROTOCOL.md` (v2 section); bridge plugin: extraction + event emitters + directive parser stubs | — | LOW: additive; v1 clients unaffected (unknown-kind rule) |
| 2 | **A — QH-verbatim arrows** | `qh/` package in the bridge plugin: DirectionArrow, WorldLines, QuestPerspective ports (BSD-2 attribution); directive→renderer mapping | bridge plugin `qh/*` + overlay classes | P (kind names only) | LOW: pure client render; test = static directive script over loopback, eyeball vs quest-helper side-by-side |
| 3 | **L — service ledger** | ingest fold + `values.jsonl`/`order.jsonl` + derived indices + query API; session record/replay files | service repo: `ledger.py`, `normalize.py`, `store/`, `tests/test_fold.py` (recorded-stream fixtures; idempotence = replay twice, assert zero new rows) | P (event shapes) | LOW: pure fold, fully offline-testable |
| 4 | **G — guide feed** | `policy_guide.py`: guide JSON from git branch + overrides, condition evaluation, panel/highlight/arrow directive stream, progress persistence, step-id stamping into the ledger | service repo `policy_guide.py`, `progress.json`; retires guide-chain v0.3 in-plugin logic (never co-enabled) | P, L, A | MED: first live policy; mitigated by BF-policy precedent (same shape, proven) |
| 5 | **S — replay seam** | `ledger2scenario.py` compiler; `run_scenario.py --world world.json`; proto-server packets: LOC add, container update, VARP_SMALL 56/VARP_LARGE 95, IF_OPENSUB/IF_SETTEXT | service repo `ledger2scenario.py`; `spike/scenario/run_scenario.py` (world-file arg); `spike/server/src/osrs_proto/net/gameproto.py` + `server.py` + `tests/test_*_236.py` | L (windows) | MED: packet work — but each packet is a bounded rsprox lookup w/ decoder-sim proof (P9-P11 method); UI beats degrade honestly via the oracle |
| 6 | **R — reachability gate** | `gate()` + region-graph nav + frontier decomposition + planner re-order hook; pluggable `route()` for the future pathfinder port | service repo `reach.py`, quest-varbit table `data/quest_state.json`; reads quests.jsonl + entity-kb nav rows | L (state vector) | MED: data-gated (entity-kb transport coverage); coarse-granular v0 is safe-by-construction |
| 7 | **O — observation queue + SME loop** | `policy_observe.py`: queue jsonl, arming (arrow/line/panel directives), cause-attribution auto-complete, expiry, frontier re-targeting, handoff manifest to §3 | service repo `policy_observe.py`, `queue/observations.jsonl`, `gallery-out/` handoff | P, A, L, G, R (S for frame handoff only) | HIGH: the full loop; last, when every seam below it is proven |

Cross-lane invariants (restated once, enforced everywhere): overlay-only /
no input injection; no real credentials (capture engine = dummy accounts on
loopback; ledger stores `profile` as a hash, never a name); restart the
service, never the client; every new packet/protocol claim proven offline
(decoder-sim / fold-replay / static-directive test) before a live client sees it.

Open questions (tracked, non-blocking):
- Event-order fidelity audit (Lane L acceptance): instrument a live session,
  verify per-kind `exact` vs `tick` ordering labels against a rsprox capture of
  the same session on the offline harness.
- Bank-value capture depth: bank container events only fire with the bank open —
  ledger groups for `item:*@bank` will be sparse; predicted-layout persistence
  (v1 `discovered`) already covers rendering, extraction may not need more.
- Interface replay depth: IF_SETTEXT covers text; item/model children may need
  more ops — scope per-observation, never speculatively.
- Sidebar PluginPanel graft (thin renderer of `panel`) — after G stabilizes.
