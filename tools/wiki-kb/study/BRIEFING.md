# BRIEFING — W2 domain-scrambler fan-out (route-p2p enrichment)

Deliverable of the fable briefing pass. Six domain scramblers each receive: Part A verbatim
+ their one Part B brief + Part C. Work inventory = ALL 123 steps of
`runelite-guide-chain/src/main/resources/fixtures/route-p2p.json`, partitioned with no
orphans and no overlaps (counts: quests 19, items+banking 8, travel+tiles 7,
training-methods 68, npcs+shops 9, background-loops 12 = 123).

---

## A. SHARED PREAMBLE (paste verbatim into every scrambler prompt)

You are one of six domain scramblers enriching route-p2p (the P2P progression chain). Work
ONLY the step ids listed in your brief.

**wikicli** (`CLI=/home/lemon/osrs-wiki/tools/wiki-kb/wikicli`): Bash returns no stdout —
redirect every command to a file, then Read the file
(`$CLI sections "Page" > /tmp/$AGENT/s.out 2>&1`). `get` caches wikitext to
`tools/wiki-kb/blobs/<slug>[.sN].wiki` — Read the blob, never stdout; the blob name is in
your redirect log and in `manifest.jsonl`. Per page: `sections` first, then
`get "Page" --section N` (full pages are 40%+ template noise; targeted sections ~25%;
section counts lie — byte size is the density signal). While reading blobs skip
`{{Infobox…}}`, `[[File:…]]`, `==Changes==`, galleries. The signal is wikilinks plus these
templates: `{{Checklist}}` (one bullet = one player action),
`{{Quest details|requirements=|items=|kills=}}`, `{{Chat option|1…|2…}}`,
`{{Map|x=|y=|plane=}}` (coords also appear as bare `x,y` and `x:N,y:N`),
`{{Fairycode|ABC}}`, `{{StoreLine|name=|stock=|restock=|gemw=}}`,
`{{StoreTableHead|sellmultiplier=|buymultiplier=}}`, `{{SCP|skill|level}}`.

**Discipline (idempotent):** Before starting, grep `contrib.jsonl` and `queue.jsonl` for
your domain prefix — resume, never duplicate. Per step:
`queue add "<domain>:<step_id>"` → `queue claim` → fetch/read → `contribute '<json>'` →
`queue done`. `contribute` silently skips keys already present and never overwrites — get
it right the first time. JSON with apostrophes: write it to a file and
`contribute "$(cat file)"`.

**Contribution schema** (one per owned step):
`{"key":"<domain>:<step_id>","kind":"enrich","step_id":"...","refs":[{"title":"...","slug":"...","url":"..."}],"atoms":[…GRANULARITY atom rows…],"coords":[{"x":0,"y":0,"label":"…"}],"notes":"…"}`
refs are MANDATORY on every contribution; every `slug` must exist in `manifest.jsonl` (you
actually fetched the page) and `title` must match the manifest title character-for-character
— apostrophes and capitalization cause silent failures.

**Feedback loop (required):** `$CLI feedback "…"` on every CLI friction; append process
traps to `gotchas.log`; finish with `## <agent> retro` (≤12 lines) in `retro.log`.

**Hard rules:** (1) The wiki is the ONLY source of truth — every number, coordinate, NPC,
and level cites a fetched page; nothing from memory. (2) Own words — never copy guide
prose. (3) No fabricated numbers — unknown stays `"??"`. (4) Non-GE sourcing only: gather,
drop, spawn, or named vendor; if a step's detail says "buy from GE", contribute the non-GE
replacement. (5) Unified progression — one chain; no F2P/P2P split, no ironman fork.

---

## B. SIX DOMAIN BRIEFS

Shared conventions for all briefs:

- **Key prefix** = the domain slug shown in each brief title (`quests:`, `items:`,
  `travel:`, `training:`, `npcs:`, `bg:`).
- **atoms[]** rows follow GRANULARITY.md §1: `{"verb","target","count","cmp","until"}` with
  the 16-verb enum; execution advice goes in `hints[]` rows (`{"type","target","value","note"}`,
  9-type enum §4), packed inside the same atoms[] entry as `{"atom":{…},"hints":[…]}` when both apply.
- **coords[]**: every coordinate must come from a `{{Map}}` template in a fetched blob.
  Many route steps carry a copy-pasted bogus marker — `Lumbridge cows (3259,3266)` /
  NPC 397 appears on smithing, mining, woodcutting, RFD and quest steps. If your step's
  marker is wrong, contribute the correct pin; say `FLAG: bad-marker` in notes.
- **notes** are machine-scanned: prefix discrepancies `FLAG:`, cross-domain pointers
  `XREF: <other-domain>:<step_id>`, proposed new steps.jsonl rows `PROPOSED-ID: <id>`.
- **Done criteria (all domains):** every owned step id appears in `contrib.jsonl` with key
  `<domain>:<step_id>`, OR sits in `queue.jsonl` as
  `queue add "<domain>:<step_id>" '{"note":"blocked: <reason>"}'`. No third state. Then
  feedback + gotchas + retro.

### B1. quests — 19 steps (`quests:`)

**(i) Inventory:** `quest-priest-in-peril`, `quest-nature-spirit`, `quest-druidic-ritual`,
`quest-bone-voyage`, `quest-tale-of-arrav`, `quest-cooks-assistant`, `quest-fairytale-1`,
`quest-the-feud`, `quest-lost-city`, `quest-swan-song`, `quest-mm`, `quest-dt`,
`quest-rfd-start`, `rfd-intro`, `rfd-goblins`, `rfd-mountain-dwarf`, `rfd-awowogei`,
`milestone-quest-mm`, `milestone-quest-dt`.

**(ii) Pages/sections:** For each quest fetch `<Quest>/Quick guide`: `sections` first, then
the **Details** section (`{{Quest details|requirements=|items=|recommended=|kills=|start=|startmap=}}`
— prereq quest chain, exact items with substitution notes, start NPC + coords) and the
**Walkthrough** section (`{{Checklist}}` bullets, `{{Chat option}}` dialogue routing,
`{{Map}}` tiles). If a number looks off, diff against the base quest page Walkthrough
(proven identical content, multiquest-im study). RFD subquests live under
`Recipe for Disaster/<subquest>` subpages (e.g. `/Freeing the Mountain Dwarf`,
`/Freeing King Awowogei`, `/Another Cook's Quest` for `rfd-intro`); fetch the subpage, not
the umbrella page. `quest-tale-of-arrav`'s instruction says "Tale of the Righteous" — fetch
that page and `FLAG:` the id/name mismatch. For `milestone-quest-mm`/`milestone-quest-dt`
verify the milestone's skill-gate completionConditions against the quest's
requirements/recommended block, and verify every existing `quest-xp` hint value (e.g.
Priest in Peril "prayer +1406") against the quest Rewards section — `FLAG:` wrong values.

**(iii) Contribution shape:**
```json
{"key":"quests:quest-druidic-ritual","kind":"enrich","step_id":"quest-druidic-ritual",
 "refs":[{"title":"Druidic Ritual/Quick guide","slug":"Druidic_Ritual_Quick_guide","url":"https://oldschool.runescape.wiki/w/Druidic_Ritual/Quick_guide"}],
 "atoms":[{"atom":{"verb":"talk-to","target":"kaqemeex","count":null,"cmp":"eq","until":{"state":"quest-varbit:??"}},
           "hints":[{"type":"dialogue","target":"kaqemeex","value":"1","note":"start option"}]}],
 "coords":[{"x":2925,"y":3486,"label":"Kaqemeex (start)"}],
 "notes":"reqs: none; items: none; reward herblore +250 verified. XREF: npcs:… if a shop item is needed."}
```
Atoms stay quest-grain (U5: one talk-to per state change; option routing is a `dialogue`
hint, never sub-steps). Start-pin coords mandatory; per-clue tiles only where the
Walkthrough gives `{{Map}}`.

**(iv) Done:** all 19 contributed or queued-blocked; every quest-xp hint verified or flagged.

### B2. items+banking — 8 steps (`items:`)

**(i) Inventory:** `pps-05-withdraw-brew`, `pps-06-deposit-potions`, `brew-prayer-potion`,
`gather-snape-grass`, `chkpt-prayer-pot-supply-coarse-0`, `cook-monkfish`,
`synth-tag-supply-prayer-pot-supply-14`, `synth-tag-supply-food-monkfish-supply-15`.

**(ii) Pages/sections:** `Prayer potion` → Creation section (`{{Recipe}}`: exact Herblore
level, xp, ingredients — the chain asserts Herblore 52 on `brew-prayer-potion`; verify and
`FLAG:` if the wiki differs). `Grimy ranarr weed` (clean level/xp), `Ranarr potion (unf)`.
`Snape grass` → Obtaining (Waterbirth spawn count, respawn time, world-hop viability —
Boots-of-lightness pattern from cows-chill study). `Raw monkfish` + `Monkfish` → cooking
level 62, burn-stop levels with/without cooking gauntlets (verify the step's "92 / 68"
claim). `Vial of water` → Obtaining (pack sizes; vendor detail is `XREF: npcs:pps-04-source-vials`).
For the two `synth-tag-supply-*` steps: they are planner placeholders for the supply
chains; contribute the chain's demand math (inputs per potion / per monkfish trip, all
counts sourced or `"??"`) and a `PROPOSED-ID:` replacement row per GRANULARITY §5a. For
`chkpt-prayer-pot-supply-coarse-0` contribute the checkpoint's loadout summary (union of
member consumes) as notes + refs.

**(iii) Contribution shape:** as schema; atoms are `withdraw`/`deposit`/`produce` rows —
e.g. `{"verb":"produce","target":"prayer_potion_4","count":null,"cmp":"gte","until":{"item":{"prayer_potion_4":"??"}}}`
with `batch-size`/`do-while` hints. Fill existing `"??"`s ONLY when a fetched page states
the number; cite it.

**(iv) Done:** all 8 contributed or queued-blocked; brew level verified-or-flagged; both
synth-tags carry PROPOSED-ID rows.

### B3. travel+tiles — 7 steps (`travel:`)

**(i) Inventory:** `steer-ardougne-easy-diary`, `steer-graceful`, `unlock-barrows`,
`unlock-gwd`, `milestone-gwd`, `milestone-barrows`, `milestone-raids-cox`.

**(ii) Pages/sections:** `Ardougne Diary` → Easy tasks (each task = `{{SCP}}` gate + items)
and Rewards (cloak 1 teleport) — verify the steer's completionConditions cover the real
task gates. `Graceful outfit` (marks cost per piece + full-set total) + `Marks of grace` +
the rooftop course pages for the 1→60 ladder (course coords via `{{Map}}`; mark rates
`"??"` unless the wiki states them). `Barrows` → Getting there / Location (Morytania
routes; fairy ring + Mort'ton). `God Wars Dungeon` → Getting there (Trollheim
route, rope/boot requirements, coords). `Chambers of Xeric` → Location/Getting there (Mount
Quidamortem routes, mine cart, Lovakengj). Transport reference pages (several already
blobbed — check `manifest.jsonl` before re-fetching): `Fairy ring` Combinations,
`Spirit tree` s1, `Canoe` s2, `Minigame teleport` Destinations, `Quetzal Transport System`
Locations. Contribute each as a shared reference:
`{"key":"travel:ref-<slug>","kind":"reference","step_id":null,"refs":[…],"coords":[…],"notes":"code→tile table"}`.
Safety-net duty: you are the coordinate authority — if while working you notice another
domain's step with a bogus marker, `queue add "coord-fix:<step_id>"` with the correct pin
in the note (do NOT contribute on steps you don't own).

**(iii) Contribution shape:** as schema; atoms are `teleport`/`walk-to` rows with
`teleport-choice` hints (ranked means, list order = preference, per GRANULARITY §4).
coords[] carry one labelled pin per landing site / course start / entrance.

**(iv) Done:** all 7 contributed or queued-blocked; the 5 transport reference contributions
present; any coord-fix tickets filed.

### B4. training-methods — 68 steps (`training:`)

**(i) Inventory (batch by skill — one training page feeds a whole ladder):**
- Melee: `train-attack-10`, `train-attack-30`, `train-attack-40`, `train-attack-60`,
  `train-attack-70`, `train-strength-60`, `train-strength-70`, `train-defence-30`,
  `train-defence-40`, `train-defence-60`, `train-defence-70`, `synth-attack-43-4`,
  `synth-attack-75-16`, `synth-strength-75-17`, `synth-defence-43-5`, `synth-defence-75-18`.
- Combat atoms + headers: `ctr-01-kill-chickens`, `ctr-02-kill-cows`,
  `ctr-05-kill-barbarians`, `ctr-06-stronghold-crawlers`, `ctr-07a-sand-crabs`,
  `chkpt-combat-training-routing-0`, `chkpt-combat-training-routing-1`,
  `chkpt-combat-training-routing-2`.
- Ranged: `train-ranged-30`, `train-ranged-40`, `train-ranged-55`, `train-ranged-70`,
  `synth-ranged-75-19`.
- Magic: `train-magic-25`, `train-magic-43`, `train-magic-55`, `train-magic-70`,
  `synth-magic-50-1`, `synth-magic-66-10`, `synth-magic-75-20`.
- Prayer: `train-prayer-22`, `train-prayer-43`, `train-prayer-52`, `train-prayer-74`.
- Cooking: `train-cooking-20`, `train-cooking-40`, `train-cooking-58`, `synth-cooking-62-11`.
- Fishing: `train-fishing-20`, `train-fishing-40`, `train-fishing-58`, `synth-fishing-62-12`.
- Firemaking: `train-firemaking-15`, `train-firemaking-30`, `train-firemaking-50`.
- Woodcutting: `train-woodcutting-15`, `train-woodcutting-30`, `synth-woodcutting-36-6`.
- Crafting: `train-crafting-20`, `train-crafting-40`.
- Smithing: `train-smithing-15`, `train-smithing-30`, `train-smithing-40`, `synth-smithing-45-13`.
- Mining: `train-mining-15`, `synth-mining-22-8`.
- Herblore: `train-herblore-10`, `train-herblore-38`, `synth-herblore-52-9`.
- Farming: `train-farming-17`, `synth-farming-32-7` (method only; loops are `XREF: bg:`).
- Slayer: `synth-slayer-10-3`.

**(ii) Pages/sections:** `Pay-to-play <Skill> training` per skill → `sections`, then the
level-band sections covering your targets (e.g. "Levels 1–20", "Levels 40–58"). Verify each
step's claimed method sits in the right band; contribute the wiki's method (own words) with
xp/level facts cited. Kill-based steps additionally fetch the monster page (`Chicken`,
`Cow`, `Barbarian`, `Flesh Crawler`, `Sand Crab`, `Stronghold of Security` for doors and
floor rewards) for combat level, hitpoints, aggro mechanics, notable drops. NON-GE
REWRITES (hard rule 4) — these details currently violate sourcing; contribute
replacements: `train-crafting-20` ("buy hides from GE" → cowhides from cows + tanner),
`train-firemaking-30` ("oak logs from GE" → chop oaks), `train-smithing-30` ("buy from GE
or mine" → mine), `train-herblore-38` ("buy secondaries from GE" → gathered/vendor
secondaries; `XREF: npcs:`/`bg:`). `synth-*` steps are planner gaps: contribute the
method for that band + `PROPOSED-ID:` so a real bank row can replace the synthetic. The
five `ctr-*` atoms already carry atom{}/hints[] — verify every claim, fill `"??"` only
with cited numbers (Zeke stock tiers belong to `npcs:`, leave `XREF:`). Checkpoint headers
(`chkpt-…-0/1/2`): contribute the checkpoint's loadout/no-bank summary.

**(iii) Contribution shape:** as schema; every train step gets one atom row —
`{"verb":"kill|gather|produce","target":"<slug>","count":null,"cmp":"eq","until":{"skill":{"<skill>":N}}}`
plus hints (`toggle-state` attack style, `keep-drop`, `safespot`, `contested-fallback`,
`do-while`). coords[] = the training spot pin from the training/monster page (fix the
bad-marker plague — most of it lives in your inventory).

**(iv) Done:** all 68 contributed or queued-blocked; the 4 GE-violating details have
replacement notes; every synth step carries a PROPOSED-ID.

### B5. npcs+shops — 9 steps (`npcs:`)

**(i) Inventory:** `ctr-03-buy-scimitar`, `ctr-04-equip-scimitar`,
`chkpt-combat-training-routing-3`, `pps-02-steal-ranarr-seeds`, `pps-04-source-vials`,
`source-pineapples-charter`, `train-thieving-20`, `train-thieving-38`, `synth-thieving-53-2`.

**(ii) Pages/sections:** Shop pages → Stock section: extract every `{{StoreLine|name=|stock=|restock=|gemw=}}`
row + the `{{StoreTableHead|sellmultiplier=|buymultiplier=|delta=}}` header; derive safe
single-visit buy quantity and world-hop math (stock/restock-seconds) in notes.
`Zeke's Superior Scimitars` — resolves ctr-03's "stock tiers ??" (top tier, prices);
`Al-Kharid` gate toll + `Prince Ali Rescue` exemption for the dialogue hint.
`Master Farmer` — pickpocket level, seed-table facts for pps-02 (ranarr rate only if the
wiki states it, else `"??"` stays). Vial vendors for pps-04: herblore shops (e.g.
`Jatix's Herblore Shop`) — confirm a named non-GE vendor sells vial-of-water packs, price,
stock; that resolves the step's "vendor ??". `Charter ship`/Catherby trader stock for
`source-pineapples-charter` (verify "~100 per visit", price). Thieving NPCs:
`Man (NPC)`/pickpocket tables for train-thieving-20; `H.A.M. member` (level, loot,
hideout coords) for train-thieving-38; `Blackjacking` + `Menaphite thug` for
synth-thieving-53-2 (gate = The Feud, `XREF: quests:quest-the-feud`; contribute
`PROPOSED-ID:` replacement). `ctr-04-equip-scimitar`: trivial equip atom — confirm wield
level per scimitar tier from the item page. Checkpoint header `chkpt-…-3`: gear-stop
summary (toll coins + scimitar cost).

**(iii) Contribution shape:** as schema; atoms are `buy`/`gather`(pickpocket)/`equip` rows,
e.g. `{"verb":"buy","target":"vial_of_water","count":null,"cmp":"gte","until":{"item":{"vial_of_water":"??"}}}`
with `rng-variance`/`dialogue` hints. Every price/stock/restock number cited from the
StoreLine blob; refs to the shop page mandatory.

**(iv) Done:** all 9 contributed or queued-blocked; ctr-03 tiers and pps-04 vendor
resolved-or-flagged; world-hop math present for every buy over base stock.

### B6. background-loops — 12 steps (`bg:`)

**(i) Inventory:** `bg-farm-allotment-setup`, `farm-ranarr-patch`, `farm-herb-patch-guam`,
`pps-01-withdraw-compost-run`, `pps-03-withdraw-herb-run`, `gather-volcanic-ash`,
`setup-ultracompost`, `gather-monkfish`, `bootstrap-gather-guam_weed-prayer-pot-supply`,
`chkpt-prayer-pot-supply-coarse-1`, `chkpt-prayer-pot-supply-coarse-2`,
`chkpt-prayer-pot-supply-coarse-3`.

**(ii) Pages/sections:** `Herb patch` — every patch location with `{{Map}}` coords
(Falador, Catherby, Ardougne, Hosidius, Farming Guild), disease-free notes; that grounds
pps-03's route and farm-ranarr/guam coords. `Ranarr seed`/`Ranarr weed` — Farming level,
growth time (verify "~80 minutes"), yield mechanics (verify "~6.5 per run" or demote to
`"??"`). `Guam seed` for the guam loop + `bootstrap-gather-guam_weed…` (Obtaining: drop
sources, spawns — non-GE). `Compost bin` + `Ultracompost` — exact recipe quantities per
bin; the chain asserts 30 pineapples + 15 volcanic ash — verify BOTH and `FLAG:`
discrepancies. `Volcanic ash` → Obtaining (Fossil Island ash piles, Mining level —
`XREF: training:synth-mining-22-8`; coords). `Allotment patch` — locations/seeds for
bg-farm-allotment-setup (RECURRING at banking breaks). `Monkfish`/`Piscatoris Fishing
Colony` — Fishing 62 + Swan Song gate (`XREF: quests:quest-swan-song`), spot coords, for
gather-monkfish. Teleport-per-patch claims on pps-03 (Explorer's ring, Camelot, Ardougne
cloak, Xeric's talisman) — verify each lands by its patch (`XREF: travel:` refs).
Checkpoint headers 1/2/3: loadout summary + cadence for their loop.

**(iii) Contribution shape:** as schema; atoms are `plant`/`harvest`/`gather`/`withdraw`
rows with RECURRING semantics preserved (U7: one atom per run, ordered patch route in
detail — never serialize runs into steps). Hints: `teleport-choice` (patch route order),
`do-while` (loops fill downtime), `rng-variance` (yield). Notes must state sourced cadence
(growth ticks/minutes) per loop.

**(iv) Done:** all 12 contributed or queued-blocked; ultracompost recipe and ranarr
growth/yield verified-or-flagged; every patch in the pps-03 route has a cited coord.

---

## C. CONSOLIDATION CONTRACT — what W2's final fable agent does with contrib.jsonl

Scramblers' output is consumed EXACTLY like this; shape violations get quarantined, not
fixed for you.

1. **Ingest.** Read `tools/wiki-kb/contrib.jsonl`; keep kinds `enrich` (keyed
   `<domain>:<step_id>`) and `reference` (`travel:ref-*`). Group enrich by `step_id`.
2. **Validate refs.** Every `refs[].slug` must exist in `manifest.jsonl` AND `title` must
   match the manifest title exactly. Any bad ref ⇒ the whole contribution is quarantined to
   `queue add "consolidate-fix:<key>"` and NOT merged.
3. **Lint.** `atom.verb` ∈ GRANULARITY §1b 16-verb enum; `hints[].type` ∈ §4 9-type enum;
   no bare number unbacked by a ref or `"??"`; merged text greps clean of `GE`/`Grand
   Exchange` sourcing; coords within plausible world range; step_id ∈ route-p2p ∪
   steps.jsonl.
4. **Dedupe.** First contribution per key wins (contribute is append-only); later
   duplicates are logged, never merged. The partition means one owner per step — a second
   domain writing another's step_id is itself a lint failure.
5. **Merge.** `refs[]` → `refs[]` on the route-p2p step (and matching steps.jsonl row),
   deduped by slug. `atoms[]` → `atom{}`/`hints[]`/`branch{}` fields per GRANULARITY;
   existing `"??"` values are replaced only when the contribution cites a ref for the
   number. `coords[]` → `mapMarkers[{x,y,plane,label}]`, replacing flagged bad markers.
   `PROPOSED-ID:` rows become NEW steps.jsonl rows so the planner stops emitting the
   matching `synth-*` placeholders. `FLAG:`/`XREF:` notes become queue tickets for Lane 5
   and DEVLOG entries.
6. **Re-emit.** Run the guide-export enrich pipeline; checkpoint-contiguity and branch{}
   selection checks (already in the pipeline) must pass; regenerated
   `route-p2p.json`/`steps.jsonl` are the deliverable, plus a consolidation retro in
   `retro.log`.

Practical upshot for scramblers: a contribution with clean refs, enum-valid atoms, cited
numbers, and prefixed notes merges untouched; anything else costs a round-trip.
