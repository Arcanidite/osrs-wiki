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
