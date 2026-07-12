# study:faux — Faux starting guide checklist granularity extraction

Source: Guide:Leagues: Faux starting guide (Demonic Pacts League)
Agent: faux | Date: 2026-07-12

---

## 1. Checklist grammar

The guide wraps each part in `{{Checklist|...}}` inside `<div class="mw-collapsible">`.
Every bullet (`*`) is exactly one player action. The atomic grain is:

**Shape of one step:** `[optional toggle/equip state] [verb] [target NPC/item/object] [quantity or threshold] [parenthetical constraint or warning]`

Paraphrased examples (own words, <=12 words each):

1. Sell cakes one at a time; need 260+ gp total.
2. Buy exactly 1 Knife, 1 Chisel, 1 Spade, 2 Bird snares.
3. Pickpocket citizen until Thieving reaches level 5.
4. Deposit all; withdraw coins, Dramen staff, jugs of wine.
5. Toggle autobank OFF before claiming Endless Harvest relic.
6. Make 10 Molten glass; blow all into oil lamps for level 20 Crafting.
7. Mine 50 mithril ore; mine extra iron until level 55 first.
8. Safespot Gemstone Crab with steel mace until it burrows (5 defence needed).
9. Catch 50 implings in Puro-Puro (camp one young-impling spawn).
10. Defeat 3 chickens within 6 seconds; prep each to low HP first.

Key micro-patterns observed:
- **Threshold notation**: "need 260+ gp", "need 14+", "stay until 45 logs banked"
- **Sell-quantity economics**: "Sell 1 CAKE AT A TIME (not 5, 10, or 50)" — store buy-price is tier-dependent
- **Conditional branches with skip labels**: "(Can skip if not Woodsman)"
- **Toggle states inline**: "*Endless Harvest toggle autobank on*" mid-step
- **Level target in same bullet**: "shrimp fish until 10+ Fishing" or "get at least 5 defence"
- **Bank withdraw list as checklist item**: lists specific items to take out, not just "bank"
- **Red color warnings** via `{{Colour|Red|...}}` signal economy-critical steps (inventory coin count matters)

---

## 2. Breadcrumb patterns

For each question a guide-builder faces, the linked page type that answers it:

### Q: Where is NPC or landmark X?
**Answer page type**: Location page (e.g., Civitas illa Fortis, Aldarin)
- Section "Transportation" lists every travel method in
- Section "Shops" lists every shop by wikilink
- Inline `{{Map|...x:NNNN,y:NNNN...}}` gives tile coordinates
- Verified: Civitas illa Fortis Shops section lists 11 named shops with wikilinks

### Q: How do I get from A to B?
**Answer page type**: Transport network pages
- **Quetzal Transport System** page: Locations table with `{{Map|x:NNNN,y:NNNN|mtype=pin}}` for all 14 landing sites (6 built by default, 8 unbuilt)
- **Fairy ring** page: Combinations sections keyed by letter pair; each row has `{{Fairycode|code}}` + `{{Map|mapID=-1|...|x,y|mtype=pin}}` + Points of Interest column
- Individual location pages list their transport options in Transportation section (e.g., Aldarin: "Fairy Ring CKQ" confirmed)
- Verified: Aldarin page Transportation section shows `{{Fairycode|CKQ}}`; Quetzal Transport System shows x:1389,y:2899 for Aldarin

### Q: Where to buy item Z without Grand Exchange?
**Answer page type**: Shop page (e.g., Fortis General Store, Toci's Gem Store)
- `{{StoreTableHead|sellmultiplier=N|buymultiplier=N|delta=N}}` gives pricing ratios
- `{{StoreLine|name=item|stock=N|restock=N}}` gives each stocked item, default stock, restock time
- Verified: Fortis General Store has sellmultiplier=1300 (player buys at 130% base), buymultiplier=400 (store buys player's items at 40% base)
- Verified: Toci's Gem Store stocks uncut sapphire (3), emerald (2), ruby (1) with sellmultiplier=1000 and buymultiplier=700 — guide's "buy uncut, cut, sell at 7x" maps to buymultiplier=700

### Q: What does a task require (skill level / items)?
**Answer page type**: Task Reference section (same guide page) via `{{DPLTaskRow}}`
- Field `s={{SCP|skill|level|link=yes}}` = skill prerequisite gate
- Field `other=` = items needed (e.g., `other={{Coins|1000}}`, `other=[[Big fishing net]]`)
- Field `tier=easy/medium/hard/elite` = point tier
- Field `region=` = area unlock required
- Field `pactTask=yes` = demonic pact required for task

---

## 3. Template goldmines

### {{Checklist|...}}
Wraps an unordered list; each `*` bullet is one discrete player action. Renders as an interactive tick-off list on the wiki. The guide nests these inside `<div class="mw-collapsible">` per part.

### {{DPLTaskRow|name|description|s=|other=|tier=|region=|pactTask=|id=}}
The task reference structure. Fields:
- `name` — display name of the task
- `description` — full task requirement in plain English
- `s={{SCP|skill|level}}` — skill level gate
- `other=` — free text; items, coins, special conditions
- `tier=easy|medium|hard|elite` — point value tier
- `region=General|Varlamore|Karamja|...` — area unlock required
- `pactTask=yes` — requires demonic pact
- `id=` — numeric task ID (can be used for deep-linking)

### {{SCP|skill|level|link=yes}}
Skill Check Prerequisite. Yields exact skill name + minimum level. Used inline in DPLTaskRow `s=` field and occasionally in checklist notes.

### {{StoreLine|name=|stock=|restock=|gemw=}}
One stock row for a shop page. Yields item name, starting stock, restock timer in seconds. `gemw=no` suppresses GE price lookup.

### {{StoreTableHead|sellmultiplier=|buymultiplier=|delta=|...}}
Shop pricing header. `sellmultiplier` = price player pays (% of base), `buymultiplier` = price store pays player (% of base). These yield the exact GP economics the guide references ("1 at a time is 7x GP").

### {{Map|mapID=|title=|x,y or x:N,y:N|mtype=pin|height=|width=}}
Embeds an in-wiki map tile with a pin at exact world tile coordinates. Two coordinate formats seen: bare `x,y` (fairy ring page) and named `x:NNNN,y:NNNN` (Quetzal page). The `title=` field is the label shown. `mtype=pin` places a map marker.

### {{Fairycode|code}}
Renders a styled fairy ring code (3 letters). Used both inline in body text and as a table cell value in the Combinations tables. Cross-referencing code + Map template in the same row gives: code → exact tile location.

### {{Colour|Red|...}}
Not a data template but a signal template. Red-coloured text in guide steps marks economy-critical rules (e.g., "Don't buy more than mentioned because the amount of coins in your inventory matters"). These become hard constraints in a guide step, not soft tips.

### {{DiarySkillStats|...}}
End-of-guide skill level summary. Each named parameter is `Skill=level` e.g. `Hunter=91`, `Crafting=70`. Shows what levels the guide expects you to reach — useful for planning prerequisite checks in a guide-chain.

---

## 4. Verified breadcrumb traversals

1. Guide mentions "Fairy ring to Aldarin (CKQ)" → fetched Aldarin page → Transportation section confirms `{{Fairycode|CKQ}}`; also fetched Aldarin fairy ring page which shows `{{Fairycode|ckq}} (6 tiles) after completion of Children of the Sun`
2. Guide mentions "Fortis General Store" → fetched store page → `{{StoreLine|name=Knife|stock=5}}` confirms Knife sold there; `{{StoreTableHead|sellmultiplier=1300}}` explains the economics
3. Guide mentions "bird to Auburnvale" → fetched Quetzal Transport System → Locations table shows Auburnvale at x:1410,y:3363 as a built-by-default stop
4. Guide references buying gems at "Toci's Gem Store" → fetched store → `{{StoreLine|name=Uncut sapphire|stock=3}}` and `buymultiplier=700` confirms guide's "7x GP" claim when selling back cut gems

---

## 5. Notable observations

- The guide's sell-one-at-a-time instruction ("Sell 1 CAKE AT A TIME, not 5 or 10") is not explained by the guide itself — the store page's `sellmultiplier`/`buymultiplier` fields explain why (store buy price degrades as stock fills; selling one at a time before restock maintains maximum buy price)
- Quantity thresholds ("need 260+ gp", "stay until 45 logs banked") represent intermediate resource gates, not final goals — these are the tightest atomic granularity the guide achieves
- Toggle states (autobank on/off for relic Endless Harvest) appear inline within other action steps, never as standalone steps — a guide renderer needs to handle embedded state changes
- Conditional branches use parenthetical skip labels with relic names, not separate guide paths — "(Can skip if not Woodsman)" is the granularity of branching
- The Task Reference section with `{{DPLTaskRow}}` effectively acts as a structured index of every task covered, cross-referencing the prose checklist steps
