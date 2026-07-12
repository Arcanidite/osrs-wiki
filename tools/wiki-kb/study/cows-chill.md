# Study: Cow's Chill Ironman Guide to Priff+

Source: Guide:Cow's Chill Ironman Guide to Priff+
Sections fetched: 1-9 (all 10 top-level sections)
Linked pages fetched: Ferox Enclave, Lumbridge General Store, Fortunato, X Marks the Spot/Quick guide, Boots of lightness, Chaos Temple (hut), Fairy ring, Draynor Seed Market

---

## Checklist Grammar

The atomic step unit is one {{Checklist|title=Section N|...}} block, which corresponds to a single physical sub-trip: bank, equip, travel, act, return. Each block has three micro-patterns:

1. **Bank withdraw list** — names every item with quantity before movement begins.
   Example: withdraw Knife, Jug of Water, Bronze Axe, Tinderbox, Leather Gloves, 5 wines, 1 log.

2. **Quest progress milestone** — not "complete quest" but "progress X until you have spoken with NPC Y" or "until you've obtained item Z". Lets two or three quests be interleaved across one sub-trip without restating travel.
   Example: Progress Restless Ghost until you get the Ghostspeak Amulet.

3. **Shop purchase list** — exact quantities per item from a named shop, in a sub-bullet block.
   Example: Buy from Lumbridge General Store: Spade, Hammer, Chisel.

4. **XP threshold guard** — pins an exact XP or level target.
   Example: Steal additional cakes until 12,449 Thieving XP. Expected 52 Agility — if not, run Al-Kharid laps.

5. **Tile coordinate pin** — {{Map}} template inline within a step, carries x/y/plane for an exact map tile.
   Example: {{Map|x=3148|y=3177|plane=0|r=4|mtype=square}}.

6. **Passive concurrent task** — prefixed "Passive -", states unlock condition and long-horizon target.
   Example: Passive — Wilderness Agility to 72. Won't need until later, no rush.

7. **Toggle / equipment state** — "Keep these on whenever questing" for Boots of Lightness; explicit equip/remove notes bound to the step.

8. **Level-gated route divergence** — "If you don't have X, do Y first", inline without forking the guide into a separate track.
   Example: If you don't have GP, do more Wildy Agility (best) or craft Earth/Air Battlestaves.

9. **Drop/destroy instruction** — explicit about consumables not to bank, to reduce future clutter.
   Example: Destroy the lamp. Discard Chocolate Cakes.

10. **World-hop acquisition** — quantities achievable per world noted inline.
    Example: 80 Air Rune Packs (10 per world).

---

## Breadcrumb Patterns

| Research question | Page type followed | What it yields |
|---|---|---|
| How do I reach location X? | Location page → Transportation section | Lists all teleport methods (ring of dueling, minigame tele, waka canoe, etc.) |
| Where does NPC / shop sell item Y? | Shop page → Stock section with {{StoreLine}} rows | Item name, default stock quantity, restock rate per minute |
| What exact steps does quest Z need? | Quest/Quick guide subpage → Walkthrough {{Checklist}} | Ordered steps, exact dig tiles, required items, dialog choices |
| Where does item spawn (non-GE)? | Item page → Obtaining section | Spawn dungeon, required tools, respawn time, world-hop viability |
| What quests unlock fairy rings? | Fairy ring page → Using fairy rings section | Full prerequisite quest chain + complete alphabetical code→destination table |
| What are precise tile coordinates? | {{Map}} template inline in guide step | x/y/plane fields, no page hop needed |
| What multiplier does a shop use? | Shop page → {{StoreTableHead|sellmultiplier=...|buymultiplier=...}} | Buy/sell price multipliers and delta (stock recovery speed) |

### Verified breadcrumbs (CLI-followed):

1. **Ferox Enclave** — Transportation section lists ring of dueling, Minigame Teleport to Last Man Standing / Clan Wars, Castle Wars exit (F2P), waka canoe 57 WC. Guide references "Clan Wars minigame tele" without further explanation; this page fills the gap.

2. **Boots of lightness** — Obtaining section confirms cellar of Temple of Ikov dungeon, no quest required, needs light source + slash weapon, 60s respawn, world-hop method. Also lists Perdu buyback price.

3. **Fortunato** — Stock section: 5 Jugs of Wine, stock 5, restock 1500. Guide says "Buy 26 Jugs of Wine from Fortunato" — the restock rate explains why world-hopping is implied at this scale.

4. **X Marks the Spot/Quick guide** — Walkthrough section uses its own {{Checklist}} with exact relative dig descriptions and gallery image references per clue. The /Quick guide subpage has tighter signal than the main quest page.

5. **Fairy ring** — Using fairy rings section lists six prerequisite quests; Combinations section gives the full three-letter code table. The guide pre-stages all six prerequisite quests in the correct order before unlocking.

---

## Template Goldmines

| Template | Fields | What it yields for guide steps |
|---|---|---|
| `{{Checklist\|title=Section N\|...}}` | title (string), bullet content | Container for one sub-trip's ordered step list; ** = sub-step nesting up to 3 levels |
| `{{Map\|name=...\|x=...\|y=...\|plane=...\|r=...\|mapID=...\|mtype=...}}` | x, y (tile coords), plane (floor), r (radius), mtype (shape) | Inline tile pin — exact coordinate without leaving the checklist |
| `{{StoreLine\|name=...\|stock=...\|restock=...}}` | name, stock (default qty), restock (rate/min) | Per-item shop inventory row; world-hop math derivable from stock + restock |
| `{{StoreTableHead\|sellmultiplier=...\|buymultiplier=...\|delta=...}}` | sellmultiplier, buymultiplier, delta | Shop price multipliers and stock recovery speed |
| `{{Youtube\|videoID}}` | videoID | Inline video reference attached to a specific training phase within a checklist block |
| `{{Quest details page\|quest}}` | quest name | Infobox with skill requirements, items needed, quest points — sourced from /Quick guide Details section |
| `{{StoreLine\|gemw=No}}` | gemw flag | Marks items not on GE (ironman-relevant: must obtain from shop/drop/spawn) |

---

## Structural Observations

**Section hierarchy**: The guide has 10 H2 sections (major phases: Tutorial Island, Wintertodt Prep, Birdhouses/Guardians, MTA, Questing, Barrows Gloves/Dragon Defender, Song of the Elves, PVM Route, End-Game PVM). Within each H2 there are typically 2-4 {{Checklist}} blocks, each numbered sequentially (Section 1 through Section 24+). The guide author never resets the section counter — a single global sequence number runs the entire multi-hundred-hour route.

**Gear interleave**: Equipment upgrades are embedded as sub-bullets of the quest/activity that provides access to them, not as separate gear sections. This creates a natural "do X, which unlocks item Y" chain without a separate gear planning stage.

**No F2P/P2P split**: The guide assumes membership throughout. No branching by account type.

**Route alternative annotation**: When a step has a viable alternative, it appears as a ** sub-bullet immediately below, introduced with "Alternative is..." or "You may also...". The primary path is always the top-level bullet.
