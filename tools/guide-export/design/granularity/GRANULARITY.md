# GRANULARITY — atomic-step grammar + coarse-unwind rules (synthesis of 7 guide studies)

Synthesizes: faux (grain 4, target grain), b0aty-hcim (4), dunkingoreos (4), felkrane (3),
sonic-d1 (3), re-varlamore (2), laef-demonic (2). Extends SYNTHESIS.md — every field here is
additive-nullable on the unified schema; nothing existing breaks. Hard rules honored: no
fabricated rates (`"??"` everywhere unknown), gather/produce never GE, unified progression.

**"Faux grain" defined** (the convergent finding across all 7 studies): one atomic step =
ONE of {single NPC/object interaction · exact-count repetition · until-condition loop ·
persistent state toggle · one bank loadout}. NOT per-click (nobody unwinds "click ore, wait
3s" as separate steps — felkrane bundles it; faux/b0aty/dunkingoreos all stop at the
interaction+count level). Dialogue is atomic (7/7 guides: one talk-to = one step, never
per-line — laef "quest-atomic", felkrane "auto-advances", b0aty "no sub-dialogue parsing").
Repetition is NEVER unrolled: "666 laps" is one step with a count, not 666 steps.

---

## 1. ATOMIC-STEP GRAMMAR

### 1a. The `atom{}` field (new, nullable, on steps.jsonl)

Coarse/train rows keep `atom: null`. Atomic rows produced by unwinding carry:

```jsonc
"atom": {
  "verb": "gather",                 // canonical enum, table below
  "target": "ranarr_seed",          // one slug: item | npc | object | patch | setting
  "count": 30,                      // exact int | null (until-driven)
  "cmp": "eq",                      // "eq" (default) | "gte"  ← the "need N+" threshold form
  "until": null                     // exclusive with count:
                                    //   {"skill":{"attack":40}} | {"item":{"ranarr_seed":"??"}}
                                    //   | {"drop":"rune_axe"} | {"state":"quest-varbit:??"}
}
```

`verb` is the render/completion discriminator; `kind` stays the coarse *category*
(gather/produce/quest/unlock/access/train) so nothing downstream of burndown changes.

### 1b. Canonical verb taxonomy (union of all 7 studies, deduped to 16)

Aliases column = raw verbs observed in studies that collapse into the canonical verb.

| verb | aliases observed | label pattern | kind | produces/consumes | completion condition |
|---|---|---|---|---|---|
| `talk-to` | speak-to, start-quest, complete-quest dialogue, interact | "Talk to {NPC} ({purpose})" | quest | — | VARBIT (quest state, id `"??"`) else MANUAL |
| `walk-to` | navigate, travel, go-to, navigate-via-landmark | "Go to {zone} ({route note})" | access | — | MANUAL (region varbit where known `"??"`) |
| `teleport` | minigame-tele, fairy-ring, tele-to | "Teleport: {means} → {zone}" | access | consumes runes/charges N or `"??"` | MANUAL |
| `withdraw` | withdraw-named, retrieve, withdraw-from-slot | "Bank: withdraw {list w/ counts}" | access | — (loadout in detail) | MANUAL |
| `deposit` | deposit-named, bank, bank-haul | "Bank: deposit {list \| all}" | access | — | MANUAL |
| `buy` | buy-NPC, buy-N, charter-buy (non-GE only) | "Buy {N}× {item} from {vendor}" | gather | produces {item:N}, consumes {coins:`"??"`} | ITEM_HELD ≥ N |
| `sell` | sell-N-at-a-time, sell-1 | "Sell {item} at {shop} ({batch} at a time)" | produce | produces {coins:`"??"`}, consumes {item:N} | MANUAL |
| `kill` | kill-N, slay, defeat, attack-N-times | "Kill {N}× {creature}" / "Kill {creature} until {cond}" | gather | produces drops per `known_drops`, consumes food `"??"` | count→MANUAL; until-drop→ITEM_HELD; until-level→SKILL |
| `gather` | pick-N, mine, chop, fish-N, catch-N, collect, pickpocket, steal, loot | "{Gather-verb} {N}× {item} at {zone}" | gather | produces {item:N or `"??"`} | ITEM_HELD ≥ N; until-level→SKILL |
| `produce` | fletch, craft, smelt, cook, brew, mix, burn, spin, grind, make | "Make {N}× {output} ({input} → {output})" | produce | consumes exact, produces exact | ITEM_HELD ≥ N |
| `use-on` | use-X-on-Y, use-item-on-object, fill | "Use {item} on {object}" | produce/quest | per recipe | VARBIT `"??"` else MANUAL |
| `equip` | wear, wield | "Equip {item}" | access | — | MANUAL (equipment-container check: verify plugin support `"??"`) |
| `toggle` | toggle-relic, toggle-prayer, disable-setting, set-attack-style | "Toggle {setting} → {state}" | access | — | VARBIT where exposed `"??"` else MANUAL; state persists — see H `toggle-state` |
| `plant` / `harvest` | plant-seed, inspect-patch, rake | "Plant {seed} in {patch}" / "Harvest {patch}" | gather | consumes seed+compost, produces `"??"` | RECURRING (background lifecycle, per S4) |
| `claim` | redeem, unlock, select-relic, block(list)-set | "Claim {reward}" / "Set {choice}" | unlock | — | VARBIT `"??"` else MANUAL |
| `consume` | eat, drink, bury(-bones as action) | "Eat/Drink/Bury {item}" | produce | consumes {item:N} | MANUAL |

Deliberately NOT verbs (they are **hints**, §4, per faux "keep-1 drop-rest" and dunkingoreos
keeper-lists): drop/keep policy, safespot positioning, spacebar-dialogue, style rotation,
do-while multitasking, batch-size. A verb changes world/inventory state toward the goal; a
hint changes *how* you execute the verb. `perform` (emote) and league `block`-style
persistent choices fold into `claim`/`toggle`.

Completion-condition names map to the plugin's existing `ConditionType` set (SYNTHESIS §1e/S4:
VARBIT, ITEM_HELD, MANUAL exist; RECURRING added by Lane 4; SKILL = the existing level
condition — verify exact enum name). Any verb whose varbit is unsourced degrades to MANUAL
tick-off — honest degradation, same principle as `synthCoarse`.

---

## 2. UNWIND RULES (coarse → ordered Faux-grain atoms)

How `unwindCoarse` (burndown.js, Lane 2) + a content author expand one
`coarse_expansions.jsonl` entry. Order inside an expansion is carried by the registry's
`steps[]` array — atoms need NO tag-plumbing between each other (topo only guards
cross-coarse deps).

- **U1 — checkpoint framing.** Every expansion is a sequence of *checkpoints* (§3). A
  checkpoint opens with exactly one bank-setup atom (`withdraw` whose detail lists the full
  loadout = union of `consumes` of the checkpoint's atoms + tools) or an explicit
  `no-bank` note in the first atom's detail. It closes at the next `deposit`/`withdraw` or
  at a turn-in `talk-to`. Grounding: b0aty's 200+ "Bank N" boundaries, faux's
  buy-batch→make-batch→deposit cycles, re-varlamore's pre-banking, dunkingoreos' inventory
  snapshots — 4/7 guides organize on exactly this boundary.
- **U2 — exact quantities, threshold form.** Counts come from consumes/produces math
  (executions = ceil(need/rate), rates `"??"` until sourced). RNG-sourced counts use
  `cmp:"gte"` ("14+ cakes", "20+ bones") plus an `rng-variance` hint. Never a bare prose
  range: bounded ranges live in `until.item` with `"??"` and a hint note.
- **U3 — gather/produce, never GE.** Vendor buys are `buy` atoms (gather kind) with a named
  non-GE vendor; unknown vendor = `"??"` in detail, step still emits.
- **U4 — repetition collapses.** Loops emit ONE atom with `count` or `until`; per-iteration
  banking ("mine→bank→repeat until 273") stays inside the atom's detail, not as N steps
  (felkrane observation: banking cycles are implicit in "mine N ore").
- **U5 — dialogue is atomic.** One `talk-to` per NPC per quest-state change. Option routing
  ("pick option 1, then Osman") is a `dialogue` hint, never sub-steps.
- **U6 — travel atoms only at zone transitions.** Same-zone movement folds into the action
  atom's detail (felkrane bundles withdraw+walk+click; sonic-d1 emits navigate only between
  region checkpoints). A `teleport` atom appears when a means-choice exists →
  `teleport-choice` hint.
- **U7 — farm/trap runs stay semi-atomic.** One atom per *run* with the ordered patch/trap
  route in detail + RECURRING condition (b0aty "farm-cycle-semi-detached": runs interleave
  with banks, never serialized into them).
- **U8 — reuse before authoring.** If an existing steps.jsonl row is already at usable grain
  (e.g., `source-pineapples-charter`, `brew-prayer-potion`), the expansion references its id
  directly; new atoms wrap it (setup/travel/turn-in). Least churn, one source of truth.
- **U9 — branches attach at checkpoint granularity** via `branch{}` (§3c): relic-toggle
  alternates (faux Endless Harvest), routing heuristics (crabs vs slayer), fallbacks
  (dunkingoreos "if no necklace drops, craft up to 10"). `optional: true` branches never
  block the chain.
- **U10 — ids and lineage.** Atom id = `<prefix>-<NN>-<verb>-<slug>` where prefix is a
  documented short form of `coarse_id` (`pps-` = prayer-pot-supply-coarse, `ctr-` =
  combat-training-routing). Each atom carries `"coarse_of": "<coarse_id>"` (nullable FK) so
  enrich can re-collapse for the overview lane. The coarse row's `coarse_unwind` mirrors the
  registry `steps[]` (SYNTHESIS §1b already reserves it).

---

## 3. GROUPING — how atoms roll up

```
atom  ─►  checkpoint  ─►  coarse item (part)  ─►  hub / region-cluster  ─►  phase (steer anchor)
      U1 bank-loadout      coarse_of FK            existing `hub` field       existing phase_name()
      boundary             (re-collapse unit)      (P6 hub_batches)           (P10, unchanged)
```

- **3a. Checkpoint (NEW, warranted).** The one grouping level our system lacks and 4/7
  guides use as their primary unit. Represent WITHOUT changing the flat `steps[]` contract:
  `coarse_expansions.jsonl` rows gain optional `"checkpoints": [{"label": "...", "start":
  "<step-id>"}]` — boundary markers into the flat list. enrich emits `_checkpoint` group
  headers; the plugin renders a collapsible sub-list with the loadout summary as the header
  subtitle; web view renders an indented group. Zero churn for consumers that ignore it.
- **3b. Part / region-cluster.** A multi-region coarse item (RFD, combat arc) simply orders
  its checkpoints by region; the existing `hub` field on member atoms lets P6 batch a
  checkpoint alongside unrelated same-hub quest steps. No new mechanism.
- **3c. Optional/alt branches.** New nullable `branch{}` on steps:

```jsonc
"branch": {
  "alt_group": "ctr-final",     // atoms sharing alt_group are mutually exclusive; unwind
                                // emits the first whose `when` is satisfied (list order = preference)
  "when": {"skills": {}, "tags": [], "quests": []},   // eligibility, same vocab as reqs
  "optional": false             // true = pure enrichment; skipping never blocks completion
}
```

  Phases/steer are untouched: steer anchors group *phases*, checkpoints group *atoms inside
  one card*. The overview lane keeps showing the coarse card; expanding it reveals
  checkpoints (this is exactly the two-altitude render the granularity-2 guides
  (laef, re-varlamore) prove is readable, with faux grain underneath on demand).

---

## 4. EFFICIENCY ANNOTATION MODEL — `hints[]`

New nullable array on steps.jsonl; enrich passes through verbatim; Java gets
`public List<GuideHint> hints;` with `String type; String target; String value; String note;`
(render: small chips under the step card; overlay-only, never input-driving).

```jsonc
"hints": [ { "type": "...", "target": null, "value": null, "note": "..." } ]
```

Closed `type` enum (each grounded in an observed pattern):

| type | meaning | value shape | study grounding |
|---|---|---|---|
| `do-while` | multitask during host activity | host tag | dunkingoreos "fletch 1005 arrows while running laps" |
| `dialogue` | spacebar-skip / exact option routing | option text | dunkingoreos option callouts; felkrane auto-advance |
| `toggle-state` | persistent state that gates behavior; re-shown until reverted | `"on"\|"off"\|style` | faux Endless Harvest OFF→ON; b0aty prayer toggles |
| `batch-size` | act N-at-a-time for price/xp multiplier | int as string | faux sell-1-at-a-time, cut-1-at-a-time |
| `teleport-choice` | ranked transport options | csv of means, prefer first | re-varlamore digsite-pendant pre-positioning |
| `rng-variance` | completion count is a distribution | `"??"` or sourced rate | faux house key "1/10"; RFD stew `"??"` |
| `keep-drop` | loot policy | `keep:a,b;drop:rest` | faux "keep 1 drop 5"; dunkingoreos keeper lists |
| `safespot` | positioning/prayer recipe | tile/landmark text | b0aty mushroom/flinch patterns; dunkingoreos "behind rock + protect missiles" |
| `contested-fallback` | hotspot may be occupied; alternate | alt zone/step id | re-varlamore "skip if hotspot occupied" |

Rule: hints are execution *advice* — removing every hint must leave a still-completable
step. Anything completion-relevant belongs in `atom`/`reqs`/`consumes`, never in a hint.
`toggle-state` is the one stateful hint: the plugin keeps its chip visible on subsequent
steps until a later step/hint reverts it (mirrors faux's OFF…ON bracket).

---

## 5. APPLY IT — two coarse items fully unwound

Data flags noticed while authoring (verify, don't trust silently): existing
`brew-prayer-potion` says Herblore 52 / produces `prayer_potion_4` (wiki-check: level and
base dose `"??"` — keep the FK/slug for goal compatibility, flag for Lane 5);
`setup-ultracompost` says 30 pineapples + 15 ash per bin (bin capacity / ash count `"??"` —
atoms below inherit the row's numbers so the chain stays internally consistent).

### 5a. `prayer-pot-supply-coarse` (blocks all PvM — S10 priority #2)

New steps.jsonl rows (atoms; existing rows `source-pineapples-charter`,
`gather-volcanic-ash`, `setup-ultracompost`, `farm-ranarr-patch`, `gather-snape-grass`,
`brew-prayer-potion` are reused per U8):

```jsonl
{"id": "pps-01-withdraw-compost-run", "label": "Bank: withdraw compost-run loadout", "detail": "Withdraw: coins (charter fare + 30 pineapples, total ??), Digsite pendant or Fossil Island transport (??). No other inventory needed — pineapples and ash fill en route.", "kind": "access", "atom": {"verb": "withdraw", "target": "compost-run-loadout", "count": null, "cmp": "eq", "until": null}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["banking", "supply-producer"], "location": {"region": "global", "zone": null, "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "timing": "ahead-of-time", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "hints": [{"type": "teleport-choice", "target": "fossil-island", "value": "digsite-pendant,barge", "note": "Keep a charged pendant banked separately for repeat runs."}], "est_minutes": null}
{"id": "pps-02-steal-ranarr-seeds", "label": "Pickpocket Master Farmers until ranarr seeds banked", "detail": "Master Farmer at Draynor market. Keep herb seeds, drop junk seeds. Need one ranarr seed per patch per planned run (patches: Falador, Catherby, Ardougne, Hosidius + Farming Guild if unlocked). Seed rate: ??", "kind": "gather", "atom": {"verb": "gather", "target": "ranarr_seed", "count": null, "cmp": "gte", "until": {"item": {"ranarr_seed": "??"}}}, "reqs": {"skills": {"thieving": 38}}, "grants": {}, "xp": {"thieving": 0}, "inv_used": 0, "inv_removes": [], "tags": ["skilling", "thieving", "supply-producer"], "location": {"region": "misthalin", "zone": "draynor", "quest_gate": null, "quest_phase": null}, "produces": {"ranarr_seed": "??"}, "consumes": {}, "timing": "ahead-of-time", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "hints": [{"type": "rng-variance", "target": "ranarr_seed", "value": "??", "note": "Seed table is random; bank each ranarr immediately (HC habit)."}, {"type": "keep-drop", "target": null, "value": "keep:herb-seeds;drop:junk-seeds", "note": null}], "est_minutes": null}
{"id": "pps-03-withdraw-herb-run", "label": "Bank: withdraw herb-run loadout", "detail": "Withdraw: seed dibber, spade, rake, magic secateurs if owned (optional), N ranarr seeds + N ultracompost (N = patch count), run teleports (Explorer's ring → Falador patch ??, Camelot → Catherby, Ardougne cloak/tele, Xeric's talisman → Hosidius ??).", "kind": "access", "atom": {"verb": "withdraw", "target": "herb-run-loadout", "count": null, "cmp": "eq", "until": null}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["banking", "supply-producer"], "location": {"region": "global", "zone": null, "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "timing": "either", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "hints": [{"type": "teleport-choice", "target": "herb-patches", "value": "explorers-ring,camelot,ardougne-cloak,xerics-talisman", "note": "Route order = list order; skip any patch whose teleport is locked."}], "est_minutes": null}
{"id": "pps-04-source-vials", "label": "Stock vials of water (non-GE)", "detail": "Buy vial-of-water packs from a herblore shop vendor (vendor ?? — verify non-GE source) OR blow vials from molten glass (Crafting 33) and fill at a fountain. One vial per potion.", "kind": "gather", "atom": {"verb": "buy", "target": "vial_of_water", "count": null, "cmp": "gte", "until": {"item": {"vial_of_water": "??"}}}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["supply-producer"], "location": {"region": "global", "zone": null, "quest_gate": null, "quest_phase": null}, "produces": {"vial_of_water": "??"}, "consumes": {"coins": "??"}, "timing": "jit", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "branch": {"alt_group": "pps-vials", "when": {}, "optional": false}, "hints": [], "est_minutes": null}
{"id": "pps-05-withdraw-brew", "label": "Bank: withdraw brewing loadout", "detail": "Withdraw: 14 grimy ranarr + 14 vials of water (clean-then-unf in one sitting; two half-inventories per load). Snape grass stays banked until the unf potions are made.", "kind": "access", "atom": {"verb": "withdraw", "target": "brew-loadout", "count": null, "cmp": "eq", "until": null}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["banking", "supply-producer"], "location": {"region": "global", "zone": null, "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "timing": "jit", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "hints": [{"type": "batch-size", "target": "herb-cleaning", "value": "14", "note": "Clean while walking to the bank — zero-time embed."}, {"type": "do-while", "target": "walking", "value": null, "note": "Herb cleaning and unf-mixing are click-paced; pair with bank-adjacent idle."}], "est_minutes": null}
{"id": "pps-06-deposit-potions", "label": "Bank: deposit prayer potions (stock check)", "detail": "Deposit all prayer potions. Chain is 'done' for now when banked stock meets the active goal's demand (e.g., barrows: 20× prayer_potion_4 per SYNTHESIS goals example); otherwise the RECURRING herb-run loop keeps firing.", "kind": "access", "atom": {"verb": "deposit", "target": "prayer_potion_4", "count": null, "cmp": "gte", "until": {"item": {"prayer_potion_4": "??"}}}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["banking", "supply-producer"], "location": {"region": "global", "zone": null, "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "timing": "jit", "supply_chain": "prayer-pot-supply", "coarse_of": "prayer-pot-supply-coarse", "hints": [], "est_minutes": null}
```

Updated `coarse_expansions.jsonl` row (steps stay a flat ordered list; checkpoints are
boundary markers per §3a):

```jsonl
{"coarse_id": "prayer-pot-supply-coarse", "name": "Prayer potion supply chain (blocks all PvM)", "status": "authored", "steps": ["pps-01-withdraw-compost-run", "source-pineapples-charter", "gather-volcanic-ash", "setup-ultracompost", "pps-02-steal-ranarr-seeds", "pps-03-withdraw-herb-run", "farm-ranarr-patch", "pps-04-source-vials", "gather-snape-grass", "pps-05-withdraw-brew", "brew-prayer-potion", "pps-06-deposit-potions"], "checkpoints": [{"label": "Ultracompost stock (ahead-of-time)", "start": "pps-01-withdraw-compost-run"}, {"label": "Ranarr seeds (gather, N+)", "start": "pps-02-steal-ranarr-seeds"}, {"label": "Herb-run loop (background, RECURRING)", "start": "pps-03-withdraw-herb-run"}, {"label": "Secondaries + brew (JIT)", "start": "pps-04-source-vials"}]}
```

Note the mix (U8): 6 existing rows reused as loop cores, 6 new atoms supplying the
bank-setup, threshold, and turn-in scaffolding the studies show around every loop.
`farm-ranarr-patch` keeps its RECURRING/background semantics — the checkpoint just anchors
its setup; `gather-snape-grass` count follows banked ranarr stock (threshold in its
existing `until`-style detail, `cmp:"gte"` when it gains an `atom{}` in Lane 5).

### 5b. `combat-training-routing` (early combat training, 1 → mid-40s + routing branch)

New steps.jsonl rows:

```jsonl
{"id": "ctr-01-kill-chickens", "label": "Kill chickens until Attack 10 (Lumbridge farm)", "detail": "No food needed. Rotate style per level chunk if desired (see toggle hint). Keep feathers (stack), bury every bone on the spot.", "kind": "train", "atom": {"verb": "kill", "target": "chicken", "count": null, "cmp": "eq", "until": {"skill": {"attack": 10}}}, "reqs": {"skills": {}}, "grants": {"attack": 10}, "xp": {"attack": 1154}, "inv_used": 0, "inv_removes": [], "tags": ["combat", "melee"], "location": {"region": "misthalin", "zone": "lumbridge-farm", "quest_gate": null, "quest_phase": null}, "produces": {"feather": "??", "bones": "??"}, "consumes": {}, "coarse_of": "combat-training-routing", "hints": [{"type": "toggle-state", "target": "attack-style", "value": "accurate", "note": "Set style to match the stat being trained; revisit each checkpoint."}, {"type": "keep-drop", "target": null, "value": "keep:feather,bones;drop:raw-chicken", "note": "Bury bones as they drop — free Prayer toward 22 Protect Item."}], "est_minutes": null}
{"id": "ctr-02-kill-cows", "label": "Kill cows until Strength 20 (east Lumbridge)", "detail": "Loot coins from nearby goblins/men opportunistically for the scimitar fund (amount ??). Cowhides optional: bank a stack for early Crafting if passing Al Kharid bank anyway.", "kind": "train", "atom": {"verb": "kill", "target": "cow", "count": null, "cmp": "eq", "until": {"skill": {"strength": 20}}}, "reqs": {"skills": {"attack": 10}}, "grants": {"strength": 20}, "xp": {"strength": 4470}, "inv_used": 0, "inv_removes": [], "tags": ["combat", "melee"], "location": {"region": "misthalin", "zone": "lumbridge", "quest_gate": null, "quest_phase": null}, "produces": {"cowhide": "??", "bones": "??", "coins": "??"}, "consumes": {}, "coarse_of": "combat-training-routing", "hints": [{"type": "toggle-state", "target": "attack-style", "value": "aggressive", "note": null}, {"type": "keep-drop", "target": null, "value": "keep:cowhide,bones;drop:raw-beef", "note": "Cowhide branch is optional — skip if inventory churn slows kills."}], "est_minutes": null}
{"id": "ctr-03-buy-scimitar", "label": "Buy best available scimitar (Zeke, Al Kharid)", "detail": "Al Kharid gate toll 10 coins (free after Prince Ali Rescue). Buy the best scimitar your Attack level allows from Zeke's shop (stock tiers ?? — verify top tier). Re-visit at each Attack breakpoint.", "kind": "gather", "atom": {"verb": "buy", "target": "scimitar_best_tier", "count": 1, "cmp": "eq", "until": null}, "reqs": {"skills": {"attack": 5}}, "grants": {}, "xp": {}, "inv_used": 1, "inv_removes": [], "tags": ["gear"], "location": {"region": "kharidian-desert", "zone": "al-kharid", "quest_gate": null, "quest_phase": null}, "produces": {"scimitar_best_tier": 1}, "consumes": {"coins": "??"}, "coarse_of": "combat-training-routing", "hints": [{"type": "dialogue", "target": "al-kharid-gate", "value": "pay-toll", "note": "10-coin toll; Prince Ali Rescue removes it permanently if already done."}], "est_minutes": null}
{"id": "ctr-04-equip-scimitar", "label": "Equip scimitar", "detail": "Wield the new scimitar before returning to training.", "kind": "access", "atom": {"verb": "equip", "target": "scimitar_best_tier", "count": 1, "cmp": "eq", "until": null}, "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [], "tags": ["gear"], "location": {"region": "kharidian-desert", "zone": "al-kharid", "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "coarse_of": "combat-training-routing", "hints": [], "est_minutes": null}
{"id": "ctr-05-kill-barbarians", "label": "Kill barbarians until Att/Str/Def 30 (Barbarian Village)", "detail": "Rotate styles: Attack →30, then Strength →30, then Defence →30. Light food from Barbarian Village fishing spot + range if needed (count ??).", "kind": "train", "atom": {"verb": "kill", "target": "barbarian", "count": null, "cmp": "eq", "until": {"skill": {"attack": 30, "strength": 30, "defence": 30}}}, "reqs": {"skills": {"attack": 20, "strength": 20}}, "grants": {"attack": 30, "strength": 30, "defence": 30}, "xp": {"attack": 8942, "strength": 8942, "defence": 12321}, "inv_used": 2, "inv_removes": ["food"], "tags": ["combat", "melee"], "location": {"region": "misthalin", "zone": "barbarian-village", "quest_gate": null, "quest_phase": null}, "produces": {"bones": "??"}, "consumes": {"food": "??"}, "coarse_of": "combat-training-routing", "hints": [{"type": "toggle-state", "target": "attack-style", "value": "rotate-per-30", "note": "One style toggle per sub-goal; the chip stays until changed."}, {"type": "do-while", "target": "fishing", "value": null, "note": "Trout/salmon spot + range are adjacent — restock food between kill sets."}], "est_minutes": null}
{"id": "ctr-06-stronghold-crawlers", "label": "Kill Flesh Crawlers until 40/40/40 (Stronghold level 2)", "detail": "Enter Stronghold of Security (Barbarian Village hole), answer security-question doors, descend to level 2. Crawlers aggro and hit low — near-AFK, no food cost at these stats. Claim the coin rewards on each floor while passing.", "kind": "train", "atom": {"verb": "kill", "target": "flesh_crawler", "count": null, "cmp": "eq", "until": {"skill": {"attack": 40, "strength": 40, "defence": 40}}}, "reqs": {"skills": {"attack": 30, "strength": 30, "defence": 30}}, "grants": {"attack": 40, "strength": 40, "defence": 40}, "xp": {"attack": 28027, "strength": 28027, "defence": 28027}, "inv_used": 0, "inv_removes": [], "tags": ["combat", "melee"], "location": {"region": "misthalin", "zone": "stronghold-of-security", "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {}, "coarse_of": "combat-training-routing", "hints": [{"type": "dialogue", "target": "security-doors", "value": "answer-questions", "note": "Doors ask account-security questions; any correct answer opens."}, {"type": "safespot", "target": "flesh-crawlers", "value": "stand-in-pack", "note": "Let aggro stack; re-aggro resets on floor exit/re-entry."}, {"type": "contested-fallback", "target": null, "value": "hop-worlds", "note": "Room contested → hop; spawn clusters are identical across worlds."}], "est_minutes": null}
{"id": "ctr-07a-sand-crabs", "label": "Kill Sand Crabs until 50/50/50 (Hosidius shore)", "detail": "Routing branch A (default when Zeah access is open): AFK crab spots on the Hosidius coast. Reset aggro by running two spots away and back (~10s). Minimal food (??).", "kind": "train", "atom": {"verb": "kill", "target": "sand_crab", "count": null, "cmp": "eq", "until": {"skill": {"attack": 50, "strength": 50, "defence": 50}}}, "reqs": {"skills": {"attack": 40, "strength": 40, "defence": 40}}, "grants": {"attack": 50, "strength": 50, "defence": 50}, "xp": {"attack": 73084, "strength": 73084, "defence": 73084}, "inv_used": 1, "inv_removes": ["food"], "tags": ["combat", "melee", "afk"], "location": {"region": "zeah", "zone": "hosidius", "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {"food": "??"}, "coarse_of": "combat-training-routing", "branch": {"alt_group": "ctr-final", "when": {"tags": []}, "optional": false}, "hints": [{"type": "contested-fallback", "target": "crab-spots", "value": "hop-or-walk-west", "note": "Crab spots are the classic contested hotspot — hop before walking."}, {"type": "do-while", "target": "afk", "value": null, "note": "Aggro window ~10 min then reset run — pair with low-attention tasks."}], "est_minutes": null}
{"id": "ctr-07b-early-slayer", "label": "Slayer tasks until 50/50/50 (Turael → Mazchna)", "detail": "Routing branch B (pick when you want Slayer progress banked with the same hours): tasks from Turael at Burthorpe, graduate to Mazchna at combat 20. Same melee endpoint as branch A, plus Slayer levels toward later gear/tasks.", "kind": "train", "atom": {"verb": "kill", "target": "slayer_task", "count": null, "cmp": "eq", "until": {"skill": {"attack": 50, "strength": 50, "defence": 50}}}, "reqs": {"skills": {"attack": 40, "strength": 40, "defence": 40}}, "grants": {"attack": 50, "strength": 50, "defence": 50, "slayer": 20}, "xp": {"attack": 73084, "strength": 73084, "defence": 73084, "slayer": 4470}, "inv_used": 2, "inv_removes": ["food"], "tags": ["combat", "melee", "slayer"], "location": {"region": "asgarnia", "zone": "burthorpe", "quest_gate": null, "quest_phase": null}, "produces": {}, "consumes": {"food": "??"}, "coarse_of": "combat-training-routing", "branch": {"alt_group": "ctr-final", "when": {"tags": []}, "optional": false}, "hints": [{"type": "rng-variance", "target": "task-assignment", "value": "??", "note": "Task rolls vary; skip-cost is zero at Turael tier — reroll bad tasks by re-asking."}], "est_minutes": null}
```

Updated `coarse_expansions.jsonl` row:

```jsonl
{"coarse_id": "combat-training-routing", "name": "Combat training routing heuristic (crabs vs slayer)", "status": "authored", "steps": ["ctr-01-kill-chickens", "ctr-02-kill-cows", "ctr-03-buy-scimitar", "ctr-04-equip-scimitar", "ctr-05-kill-barbarians", "ctr-06-stronghold-crawlers", "ctr-07a-sand-crabs", "ctr-07b-early-slayer"], "checkpoints": [{"label": "Bootstrap: chickens → cows (no bank)", "start": "ctr-01-kill-chickens"}, {"label": "Gear stop: Al Kharid scimitar", "start": "ctr-03-buy-scimitar"}, {"label": "30s → 40s: barbarians + Stronghold", "start": "ctr-05-kill-barbarians"}, {"label": "Routing branch: crabs vs slayer (pick one)", "start": "ctr-07a-sand-crabs"}]}
```

The `alt_group: "ctr-final"` pair is the routing heuristic itself: unwind emits 07a when
its `when` is met (list order = preference; Lane 5 can tighten `when` to
`tags:["region-zeah"]` once region tags exist), else 07b; a profile override can force
either. XP columns reuse the deltas already established by the existing `train-*` rows
(same level maths, no new rates invented); all drop/food/coin quantities are `"??"`.

---

## 6. BUILD-LANE NOTE (least churn)

Everything lands inside the existing SYNTHESIS lanes — no new lane, no pass-order change:

- **Lane 2 (burndown.js `unwindCoarse`)**: already planned to expand `coarse_unwind` in
  registry order. Only addition: honor `branch{}` (emit first eligible per `alt_group`,
  skip unmet `optional`) — ~15 lines. `atom{}`/`hints[]`/`checkpoints[]` need NO planner
  logic; they're pass-through data.
- **enrich.py**: two small additions — carry `atom`, `hints`, `coarse_of` onto emitted
  steps; read `checkpoints[]` and emit `_checkpoint` header records between the affected
  steps (same emitter pattern as `_steer_step`). P6–P10 untouched: atoms of one checkpoint
  share `hub`/region so hub_batches keeps them contiguous, and registry order + existing
  `reqs` keep topo valid.
- **Lane 4 (plugin)**: `GuideStep` gains `List<GuideHint> hints` + `String checkpoint`
  (group header text) — additive JSON, unknown-field-safe like Lane 1. Completion wiring
  reuses existing ConditionTypes per §1b; unsourced varbits stay MANUAL.
- **Lane 5 (content)**: authors the remaining S10 stubs with this grammar; the lint gains
  three checks — every `atom.verb` ∈ §1b enum, every `hints[].type` ∈ §4 enum, every
  `checkpoints[].start` resolves into its own `steps[]`, plus the standing bare-number
  grep (produces/consumes must be sourced or `"??"`).
- **Web view**: renders checkpoints as indents and hints as chips from the same
  pass-through fields; zero planner coupling.

Grammar-first payoff: the 10 remaining coarse stubs now have a mechanical recipe (U1–U10)
instead of a blank page, and every future guide-source study can be diffed against one
verb table instead of re-derived.
