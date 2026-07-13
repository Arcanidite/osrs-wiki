# PLAYER-DIRECT GRANULAR — how we compose checklist content

**The rule of this doc:** every checklist item is a concrete action the player performs,
written as if you are sitting next to them telling them exactly what to do next. Not a
summary. Not a label. The item **is** the intricate task. Extends
[GRANULARITY.md](granularity/GRANULARITY.md) (the faux-grain atom grammar) with the VOICE,
the BETWEEN-STEP FLOW, and the anti-dilution briefing discipline. Hard rules stand: wiki =
source of truth via wikicli, own words, gather/produce never GE, unified progression,
`"??"` over any fabricated number.

## 0. Why this doc exists

Multi-hop briefs get **watered down**: a directive → workflow → subagent → output loses
intent at each hop, and lower-tier models flatten "guide the player through the exact
actions" back into "train skill to X." Two defenses: (a) this doc is the canonical
approach every composing agent reads; (b) briefs must be **self-carrying** — they inline
the voice rule, a GOOD/BAD pair, and a fully-filled example, and they run on **fable-tier**
models. Never assume a lower tier will reconstruct the intent from field names.

## 1. The voice — direct player guidance

- Second-person imperative, concrete: *"Withdraw 27 iron ore and 27 coal, run to the west
  Varrock anvil, and smith iron platebodies until 45."* Not *"Train Smithing to 45."*
- The checklist item names the **action, the place, the quantity, and the how** — never
  "get supplies" (which supplies? from where? how many?), never "go to X" (by what means?
  what route?), never "train Y" (doing what, exactly, and where?).
- If a human reading the item still has to ask "okay, but what do I actually click?", it is
  not done.

**GOOD vs BAD (calibrate every item against this):**

| BAD (coarse label) | GOOD (player-direct granular) |
|---|---|
| Train Woodcutting to 45 | Chop willow trees at the SE corner of Draynor Village, dropping each full set of logs (power-chop). Keep going until Woodcutting 45. |
| Train Firemaking to 50 | Light your maple logs in a row on the road just west of Varrock west bank — step one tile west after each light so you never stand in the fire. Continue to 50. |
| Go to Wintertodt | From 50, bank your logs and take the minigame teleport to Wintertodt (Zeah). Bring an axe, knife, tinderbox, and food. Each round: fletch bruma roots into kindling, feed the brazier, relight it when it dies, heal at the sprites; bank the reward crates between rounds. |
| Get planks for Construction | Chop mahogany logs by the Farming Guild with a log basket, and cast Plank Make on them as you go (trains Magic too); take the filled basket to a sawmill only if you're out of nature runes. |

## 2. The three layers — all player-direct

1. **Method choice** (`methods[]`, pick-one at each band): the concrete options with the
   exact spot + bank proximity, xp/hr (cited or `"??"`), members flag, and the trade-off
   (fastest vs afk vs minigame vs 2-skill combined). Each option is itself a real
   instruction, not a name.
2. **The action loop** (atoms): the repeated action, **collapsed** into one atom + an
   until-condition (`gather willow_logs until woodcutting:45`), with the HOW in `hints[]`
   (drop/bank/burn, best worlds, combined-method, tick-manip, style).
3. **The between-step flow** (§3) — the connective actions so the loops are not islands.

## 3. Between-step flow — investigate this; it is usually the missing half

Between any two action blocks, author what the player literally does to get from one to the
next. These are first-class atoms, not prose glue:

- **TRAVEL** — the *means* (teleport / spell / item / run) **and** the route by landmarks.
  → `teleport` or `walk-to` atom. ("Cast Varrock Teleport, run north to the anvil.")
- **BANK loadout** — the exact withdraw list for the next block. → `withdraw` atom,
  itemized. ("Withdraw 26 gold bars and a goldsmith gauntlet loadout.")
- **SETUP / prep** — fill vials, make a knife, grab a tinderbox, prep a cannon. →
  `produce`/`withdraw` atoms.
- **RESUPPLY** — when the loop eats something (food, seeds, feathers, bait), *where* and
  *how* to restock, gather/produce (never GE). → `gather`/`produce` atom.

A finished training block reads as one continuous flow: **arrive → bank the loadout → run
the action loop → when the band ends, travel + rebank into the next.** Checkpoints (U1
bank-loadout boundaries) frame these transitions.

## 4. Grammar (from GRANULARITY.md — do not re-derive)

Faux-grain atoms: `{verb ∈ 16-verb taxonomy, target, count|null, cmp, until}`. **Repetition
collapses** (one atom + until, never unrolled). Drop/keep/bank/worlds/combined/style are
**hints[]**, not atoms. `U8` **reuse** an existing steps.jsonl gather/produce row by id
before authoring a new one. Atom id = `<prefix>-<NN>-<verb>-<slug>`, `coarse_of` FK to the
band step. Completion is implied by the atom (until.skill→SKILL, count/until.item→ITEM_HELD,
farm/trap run→RECURRING).

## 5. Grounding (unchanged hard rules + the traps that bite)

wikicli only (cached; never scrape). `search` the page title first — the alias traps:
melee = one "Pay-to-play Melee training" page; Slayer/Herblore/Farming drop the "Pay-to-play"
prefix; **Runecraft keeps it**; Blackjacking→Thieving training. XP: recompute band xp from
`Experience_table.s2` (the fixture xp is synthetic/wrong); method xp/hr from the page's own
cited rate or `"??"` (never interpolate between XP-table rows). Continuity: `methods[0]` =
the row's own existing label. Own words; gather/produce never GE; members flags accurate.

## 6. Briefing discipline (for whoever dispatches the fan-out)

- **Model:** fable for every composing agent (research + synthesis). Lower tiers flatten the
  voice.
- **Self-carrying prompt:** inline (a) the voice rule, (b) one GOOD/BAD pair, (c) one fully
  filled band example in the exact output shape. Do not rely on a reference chain.
- **One skill (or tight cluster) per agent**, so the agent goes deep, not wide.
- **Receipts to files:** data lives in `${scratch}/methods/<skill>.json`; agents return a
  one-line receipt. Append wiki quirks to a shared `gotchas.log`.
- **Retro discipline** (design-retros.log): each composing agent ends with a compact
  block — *load-bearing decision*, *deferred to consolidator*, *consolidator MUST-NOT-MISS*
  — so the fable synthesis inherits intent instead of re-deriving it.

## 7. CONVENTIONS + PROVENANCE — the exact mechanism (cited, not loose)

Gathered from the repo before issuing directives; every convention below is sourced so
briefs quote the real rule, not a paraphrase.

**7a. Training enrichment reuses EXISTING machinery — do NOT invent, do NOT hand-edit
fixtures** (NORMALIZATION.md §0 audit row 2 "skill training", §1a "we reuse exactly that
machinery"; enrich.py `_inject_coarse_atoms`/`_checkpoint_step`):
- `methods[]` attach on **skill+band** (never on id) from the sidecar
  `tools/guide-export/train_methods.jsonl`, behind `goal.train_methods` (enrich.py ~L1121
  "attach on skill+band, never on id").
- Granular atoms attach as an **equal-grade** `subChecklist` (NEVER parent/child — grouping
  is checkpoint labels only) via the oppgran sidecars `steps_oppgran.jsonl` +
  `coarse_expansions_oppgran.jsonl`, behind `goal.granular`, ATTACH model: the coarse
  `train-*` row stays the routing/grant anchor; atoms hang beneath (NORMALIZATION §1a,
  guide-chain-session memory). The parent coarse row gains `coarse_unwind:[atom ids]` +
  `req_items`; its `detail` prose stays as un-expanded fallback.
- A re-bake (`plan-grand.mjs | enrich.py`) must reproduce it → edit SIDECARS, never the
  route JSON.

**7b. The atom node shape is fixed** (GRANULARITY.md §5 worked examples + NORMALIZATION §1a +
SYNTHESIS §1b unified node). Full field set, all additive-nullable:
`{id, label, detail, kind, atom:{verb,target,count,cmp,until}, reqs, grants, xp, inv_used,
inv_removes, tags, location:{region,zone,quest_gate,quest_phase}, produces, consumes, timing,
supply_chain, coarse_of, branch, hints:[{type,target,value,note}], mapMarkers, refs,
est_minutes}`. `label` = the player-direct action; `detail` = concrete how; `kind:"train"`.

**7c. Closed enums — never expand:**
- verbs (17, GRANULARITY §1b): talk-to walk-to teleport withdraw deposit buy sell kill
  gather produce use-on equip toggle plant harvest claim consume.
- `hints[].type` (9, GRANULARITY §4): do-while, dialogue, toggle-state, batch-size,
  teleport-choice, rng-variance, keep-drop, safespot, contested-fallback. Hints are advice
  only — removing every hint must leave a still-completable step.

**7d. Between-step flow is already modeled — as atoms** (GRANULARITY §5a worked example):
the pps chain interleaves `withdraw`/`walk-to`/`buy` atoms (`pps-01-withdraw-compost-run`,
`pps-03-withdraw-herb-run`, `pps-04-source-vials`) AROUND the loop cores, framed by
checkpoints. So travel/bank/setup/resupply = first-class atoms, not prose. **U8 reuse**:
6 of 12 pps rows are existing steps.jsonl ids reused as loop cores — reference by id, don't
re-author.

**7e. Checkpoints** (GRANULARITY §3a; NORMALIZATION §1a): `coarse_expansions_oppgran.jsonl`
rows carry `checkpoints:[{label,start:<atom-id>}]`; enrich mints **registry-stable**
`chkpt-<coarse>-<N>` ids (index = position in the checkpoints[] array — NOT emission order;
gotcha `[consolidate]`). Checkpoint labels = own-words renames of the wiki walkthrough's own
subsection headers.

**7f. Grounding gotchas** (tools/wiki-kb/gotchas.log — quote these to the agents):
- `[training]` title-alias: `search` first — melee = one "Pay-to-play Melee training";
  Slayer/Herblore/Farming drop the "Pay-to-play" prefix; `[consolidate]` Runecraft KEEPS it;
  `[npcs]` Blackjacking→"Thieving training".
- `[training]` xp fixture fields are synthetic/wrong for non-level-1 bands → recompute band
  xp from `Experience_table.s2` (cumulative(hi)−cumulative(lo)); method xp/hr from the page's
  cited rate or `"??"`; `[normalize-s]` never interpolate between XP-table rows.
- `[training]` monster combat stats live in section 0 (lead) — `sections` won't list it, use
  full `get --strip`; `[normalize-s]` nested sections — check `sections` byte sizes before
  spending get-budget on children; `[normalize-s]` continuity: `methods[0]` = the row's own
  label, cite pre-existing refs if the live page was rewritten.
- Coords ONLY from fetched `{{Map}}`/`{{NPC map}}` pins (NORMALIZATION §1a); else `"??"`.

**7g. Tier + anti-dilution** (this session's user directive): fable models for all composing
agents (lower tiers flatten the voice); briefs self-carry the voice rule + a GOOD/BAD pair +
a filled §5-shape example; one skill per agent.
