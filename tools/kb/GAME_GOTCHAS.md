# Game Gotcha Ledger — OSRS

> Traps and corrections learned while building the whole-game option catalog. The domain-knowledge analog
> of the program's P-B gotcha ledger. Protocol: `PROGRESSION_ROUTER_BRIEF.md` §10.
>
> **Each entry names the trap, the why, and how to avoid it.** Append + annotate, never silently delete
> (`[STALE — game update YYYY-MM-DD / superseded by …]`). Agents extending the catalog read this first and
> append their findings on completion.

---

## [G-1] "Best method" is not a game fact — it's relative to what's available

- **Trap:** encoding a single method as *the* best (e.g. hardcoding the top XP/hr training spot).
- **Why it bites:** game modes like **Leagues** region-lock the account to a chosen subset of the map; the
  "best" method is frequently **not reachable**. An absolute makes the planner recommend the unreachable.
- **Avoid:** enumerate every option with where / how-unlocked / yield (brief §5.11); let the optimizer
  compute the best over the **available** set (§5.0/§5.12). Never store "best" — compute it.

## [G-2] objects.pack names are garbage — don't build object entries from it
> **[STALE — superseded 2026-07-07]** `tools/openrs2_extract.py` decodes object configs
> directly from the OpenRS2 cache (2499); `objects.pack` is regenerated with real names,
> sizes and clip data. The trap below documents the old Dump.java output.

- **Trap:** treating `objects.pack` (805 records) as presentable content. 793/805 names are
  `object_N` placeholders and the other 12 are binary junk (`ÿÿO…`); only `actions`/`tags` survived.
- **Why it bites:** generating object entry pages would mean inventing names — fabricated data.
- **Avoid:** wiki population skips objects entirely. Fix upstream name decoding in
  `Dump.java`/`extract_cache.py` (likely tied to the stale-XTEA/locations issue, see DEVLOG)
  before object entries exist.
- **source/stamp:** observed in cache extraction · 2026-07-06

## [G-3] NPC ids are variant-heavy — dedupe by (name, combat level) for display

- **Trap:** rendering one entry per NPC id; 12,076 ids collapse to ~4,451 names (3,522 attackable
  ids → 1,638 distinct monsters).
- **Why it bites:** entry lists look spammed with identical rows; but per-id deep links still
  matter (quest states reference specific variants).
- **Avoid:** group rows by (name, combat_level) and list variant ids inside the entry — what
  `assets/js/tools/db.js` does. Future drop-table/bestiary data should attach to the group,
  not one arbitrary id.
- **source/stamp:** cache extraction · 2026-07-06

## [G-4] Map-dump region ids don't match live OSRS region numbering
> **[STALE — superseded 2026-07-07]** the map + collision set is re-extracted from OpenRS2
> cache 2499 with **real** region ids/coordinates (index-5 ref table is properly named;
> `m/l{x}_{y}` hashes resolve). The trap below documents the old sequential-id dump only.

- **Trap:** treating `assets/data/cache/map/manifest.json` region ids / bx,by as live OSRS world
  coordinates (e.g. expecting Lumbridge at region 12850 — absent; dump ids run 1936–8359, rx ≤ 32).
- **Why it bites:** any cross-reference against OSRS Wiki coordinates or the router's region model
  will point at the wrong place; the dump's id space comes from the sequential-archive patch in
  `RegionLoader.java`, not from real (rx<<8|ry) region ids.
- **Avoid:** the dump is **internally coherent** (neighbouring ids stitch into continuous terrain —
  verified visually 2026-07-06), so treat manifest bx/by as a self-contained coordinate space, which
  is what `/play` does. Re-derive the true mapping only when re-extracting with fixed region naming.
  Also: 218/1150 tiles are flat ocean; tiles are terrain-only (no walls/objects rendered).
- **source/stamp:** cache extraction + visual stitch verification · 2026-07-06

## [G-5] RSPS data is revision-bound — validate every id, bind shop npcs by verified id

- **Trap:** treating RSPS (private-server) repo data as OSRS-current: Apollo targets rev 377
  (2006), 2004scape targets 2004 — their npc ids (e.g. Apollo's Shop keeper 524) do NOT match
  OSRS npcs.pack ids, and item names drift ("Cape", "Waterskin" fill-states). Also: one OSRS
  npc NAME can serve different shops — "Shop keeper"/"Shop assistant" run every general store
  AND the Varrock Swordshop.
- **Why it bites:** binding shops by RSPS npc id points at the wrong (or no) OSRS npc; binding
  by name alone would open the general store inside the Varrock swordshop.
- **Avoid:** discard RSPS npc ids entirely; bind by OSRS npc NAME validated against npcs.pack
  (Trade action required), and where names collide, disambiguate with our own spawn data
  (swordshop pair 2884/2885 verified by spawn coordinates at the swordshop building). Unresolved
  names (Thessalia's "Cape") are dropped, never remapped by guesswork. Where osrsbox/wiki data
  also exists, it wins — RSPS fills gaps only, labelled "RSPS-derived approximation".
- **source/stamp:** Apollo@87553a8 shop DSL extraction · 2026-07-07

## [G-6] Wiki vs 2004scape conflicts — wiki wins, record the loser

- **Trap:** silently averaging or swapping in RSPS values where a wiki-sourced value already
  exists. Example: pickpocket-failure stun — OSRS Wiki says ~5 s (8 ticks, what we ship);
  2004scape's `pickpocket.dbrow` says `stun_ticks,13` (7.8 s, 2004-era).
- **Why it bites:** 2004scape emulates 2004 RuneScape; OSRS rebalanced many rates. Mixing
  eras produces numbers that match neither game.
- **Avoid:** wiki/osrsbox values always win; RSPS fills gaps only. When both exist and
  disagree, keep the wiki value and record the conflict here. Current conflicts:
  stun_ticks 8 (wiki, shipped) vs 13 (2004scape) — xp/coins/level agree across sources.
  Also note 2004scape stores XP ×10 (`experience,80` = 8 xp).
- **source/stamp:** 2004scape@647886c vs OSRS Wiki · 2026-07-07

## [G-7] Quest Helper's "optimal order" is a curated list, not a computed optimum

- **Trap:** assuming the recommended quest order is produced by an algorithm you
  can re-derive or "improve" by tuning weights. `QuestOrders.sortOptimalOrder()`
  just sorts quests by their index in a hardcoded `ImmutableList` in
  `OptimalQuestGuide.java`; that list is transcribed verbatim from the OSRS Wiki
  "Optimal quest guide". No cost model, no search — it's a human-maintained
  recommendation that minimises back-tracking and keeps prereq chains intact.
- **Why it bites:** presenting it as "the computed best route" is a fabricated
  claim (violates the no-fabrication rule) AND is wrong under region-locks —
  "best" is relative to what's reachable (see [G-1]). A region-locked Leagues
  account frequently can't follow the list at all.
- **Avoid:** carry the order as a *sourced recommendation* (label + link to the
  wiki guide), and compute doability/next-quest against the player's actual
  stats + unlocked regions. The `tools/quest-order/` endpoint does this: order
  from the guide, gating from extracted requirements, region-lock aware.
  There is a separate `IronmanOptimalQuestGuide.java` (ironman order) — also curated.
- **source/stamp:** quest-helper@Zoinkwiz OptimalQuestGuide.java / QuestOrders.java · 2026-07-07

## [G-8] Quest entry requirements ≠ everything the quest needs; extract only the start-gate

- **Trap:** scraping every `SkillRequirement`/`ItemRequirement` in a quest helper
  file to build "requirements". Those include step-level needs (an item to bring,
  a skill to use mid-quest) — regexing the whole file overstates the entry bar.
- **Why it bites:** a quest would look blocked when you can actually start it; the
  "can I do this yet?" gate becomes wrong. Also: some quests encode entry gates as
  varbit/sub-quest states (e.g. MMII needs an RFD sub-quest via VarbitRequirement,
  DSI needs 32 quest points) that a naive skill/quest scan misses entirely.
- **Avoid:** scope extraction to `getGeneralRequirements()` (the canonical start
  gate), resolve one level of local field refs, and FLAG (`req_partial`) any quest
  whose gate includes varbit/item/complex requirements we couldn't statically read
  — never silently present a partial gate as complete. `build_quests.py` does this;
  43/272 quests are flagged partial. Enum constants also aren't file-ordered — two
  quests sit before `COOKS_ASSISTANT`, so anchor parsing on the enum declaration,
  not a presumed first entry.
- **source/stamp:** tools/build_quests.py extraction · 2026-07-07

<!-- Append new gotchas below. Template:
## [G-N] <short title>
- **Trap:** <the wrong assumption / mistake>
- **Why it bites:** <the consequence>
- **Avoid:** <the correction / how to do it right>
- **source/stamp:** <where learned · YYYY-MM-DD or game-update>
-->
