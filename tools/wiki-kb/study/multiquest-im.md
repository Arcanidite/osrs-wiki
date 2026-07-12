# study:multiquest-im — Guide:Ironman Multiquest extraction

**Scope**: checklist grammar, breadcrumb patterns, template goldmines.  
**Source**: Guide:Ironman Multiquest (sections 1–2), plus breadcrumb pages fetched via wikicli.

---

## 1. Checklist Grammar

The guide wraps all steps in `{{Checklist|title=<hub-label>|...}}` blocks. Each hub label is a
location name ("Lumbridge", "Very early GP", "Early quest walking"). Within a block, every step
is one bullet. Observed shapes:

| Shape | Example (paraphrased) |
|---|---|
| Free pickup with container | "Pick up jug and knife in kitchen" |
| Bank op: deposit all, withdraw named list | "Bank deposit all, withdraw 10gp, ghostspeak (equip) and all food" |
| Buy block with "(edit)" annotation and cost | "Buy Shantay (edit): 5 ropes, 10 bronze bars... (14.7k GP)" |
| Multi-quest batch: start + complete | "Start and Complete [[Monk's Friend]], [[Clock Tower]], [[Hazeel Cult]]" |
| Single-phase quest verb: start / continue / complete | "Continue [[Biohazard]] until you need to go to Rimmington" |
| World-hop to refresh shop stock | "Sell 13x platelegs, hop once, sell 13 more (14.7k GP)" |
| Minigame teleport as transport hop | "Minigame teleport to Bounty Hunter → Regen energy with pool" |
| GP threshold checkpoint | "Sell 12x platelegs... (14.3k GP)" |
| Conditional skill warning | "Recruitment Drive — Might need more melee lvls" |
| Death exploit with confirmation | "Die, reclaim through death in Lumbridge (confirm in dialogue)" |
| Spirit tree / canoe transport chain | "Canoe to battlefield, take spirit tree to village, get pebble" |
| Deposit-box shorthand | "Buy and deposit box Pandemonium bar (edit): 5 beers, 26 wine..." |

Key observations:
- Quantities are always exact integers, never "some" or "a few".
- "(edit)" annotations flag items the guide author admits are not finalized — a signal for human review.
- Bank ops use "Bank deposit all, withdraw X, Y, Z" — deposit-all before withdraw avoids inventory overflow.
- "Start", "Continue", "Complete" as explicit phase verbs let a multi-session player resume mid-quest.
- Cost annotations in bold italics at end of step (e.g., "(14.7k GP)") accumulate a running balance check.

---

## 2. Breadcrumb Patterns

For each research question a guide-builder faces, these wiki page types answer it:

### Where is NPC X / what does NPC X sell?
**Page type**: NPC page (e.g., "Louie Legs")  
**Section**: "Stock" (section 1)  
**Template**: `{{StoreLine|name=Steel platelegs|stock=2|restock=900}}`  
→ yields: item name, base stock, restock rate in seconds.  
**Verified**: fetched Louie Legs, Shantay Pass Shop, Betty's Magic Emporium, Wydin's Food Store.

### What are the exact quest steps?
**Page type**: `<Quest>/Quick guide`  
**Section**: "Walkthrough" (usually section 2 or 3)  
**Template**: `{{Checklist|...}}` with `{{Chat option|1...|2...}}` inline  
→ yields: NPC names, chat dialogue paths, item interactions in order.  
**Verified**: Rune Mysteries/Quick guide, X Marks the Spot/Quick guide, Plague City/Quick guide, Tourist Trap/Quick guide.

### What quest requires which items?
**Page type**: `<Quest>/Quick guide` — section "Details"  
**Template**: `{{Quest details page|Quest Name}}` transcludes the infobox with requirements, items needed, quest point reward.

### Where is a location / what spawns there?
**Page type**: Location page (e.g., "Lumbridge")  
**Sections**: "Buildings and stores" (shop list), "Spawns" (free item pickup list)  
**Template**: `{{Plink|Jug}}` inline in spawn table; wiki table with Item / Spawns / Location columns  
→ yields: item spawn count, sub-location within area.  
**Verified**: fetched Lumbridge sections 5 and 9.

### How to reach a location via transport?
**Page type**: "Minigame teleport" — section "Destinations"  
**Template**: `{{Map|group=N|mapID=-1|x,y|mtype=square|...}}` per row  
→ yields: minigame name, tile coords of landing spot, requirement.  
**Also**: "Spirit tree" section 1 — named coordinates per tree location via `{{Map|x|y|type=maplink|mtype=pin|text=}}`.  
**Also**: "Canoe" section 2 — River Lum stations listed with NPC names.  
**Also**: "Fairy ring" section 3+ — `{{Fairycode|BIQ}}` codes with `{{Map|mapID=-1|x,y|mtype=pin}}` per ring.  
**Verified**: fetched Minigame teleport, Spirit tree, Canoe, Fairy ring.

---

## 3. Template Goldmines

| Template | Fields | Data it yields |
|---|---|---|
| `{{Checklist|title=<hub>|...}}` | title (optional), unnamed content | Hub-labeled checkbox list; `title` becomes section heading for a batch |
| `{{StoreLine|name=...|stock=N|restock=N|gemw=No}}` | name, stock, restock, gemw | Base stock count; restock rate (seconds); gemw=No means untradeable/no GE price |
| `{{StoreTableHead|sellmultiplier=N|buymultiplier=N|delta=N}}` | sell/buy multipliers, delta | Shop sell price = base × sellmultiplier/1000; restock delta |
| `{{Chat option|1...|2...}}` | sequential numbered choices | Exact dialogue path to select for quest progression |
| `{{Map|x=N|y=N|mtype=pin|mapID=N|text=...}}` | x, y (tile coords), mapID (dungeon), mtype, plane | Precise world tile pin; mapID=-1 means instanced/dungeon; mtype=pin vs square vs dot |
| `{{Map|type=maplink|mtype=pin|x,y}}` | positional args for coords | Inline clickable link to exact map square (no frame embed) |
| `{{Fairycode|ABC}}` | 3-letter code | Renders fairy ring code badge; pairs with Map template for location |
| `{{Quest details page|Name}}` | quest title | Transcludes full requirements/rewards infobox |
| `{{Plink|ItemName}}` | item name | Inline item icon + link; used in spawn tables |

---

## Notes

- The guide uses `(edit)` inline to mark unverified quantities — a guide-chain system should flag these for human review rather than treating them as authoritative.
- Steps that say "Die" exploit the Lumbridge respawn; the Death page confirms this is the P2P/ironman recovery pattern (respawn at home, reclaim items at gravestone or Death's Office).
- The guide does NOT use `{{Map}}` tiles for individual dig spots — it relies on the linked quest's quick guide which embeds gallery images. The quick guide's `{{Checklist}}` steps have enough landmark prose ("one tile west of the plant against the wall") to locate digs without pixel-exact coords.
- Shop stock numbers from `{{StoreLine}}` are base stock; the guide's buy quantities sometimes exceed base stock, making world-hopping mandatory (confirmed by "hop worlds to replenish stock" note in Goblin Diplomacy ironman section).
