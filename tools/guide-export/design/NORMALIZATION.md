# NORMALIZATION — prose surfaces → structured, stepwise, reference-linked data

Design only (2026-07-12). Execution workflows fan out over
`normalization_tasks.jsonl` (sibling file, one row per cordoned task).
Standing hard rules inherited unchanged: additive-nullable schema (every existing
row stays valid untouched), wiki is the single source of truth via `wikicli`,
`"??"` for every unsourced number, own-words text only, gather-not-GE, no
automation. Grammar reused, never re-invented: GRANULARITY.md §1 `atom{}` +
16-verb enum, §3 checkpoints, §4 `hints[]`, SYNTHESIS.md §1b unified step node,
coarse_expansions' registry+checkpoint model.

---

## 0. AUDIT — the four non-normalized surfaces

| # | surface | file | rows | failure mode today |
|---|---------|------|------|--------------------|
| 1 | quest steps | `assets/data/tools/steps_quests.jsonl` (+ `quest_db.jsonl` notes) | 189 | one step per quest with a wall-of-prose `detail` (e.g. The Grand Tree: ~15 sub-actions crammed into one paragraph); no ordered sub-checklist, no per-action refs |
| 2 | skill training | `assets/data/tools/steps.jsonl` `train-*` (125 rows, 23 skills) + `synth-*` referenced by `step_refs.jsonl` | 125 | single sloppy `detail` ("Chickens in Lumbridge"); no method options, no per-method reqs/refs; xp fields known-synthetic (gotcha `[training]`) |
| 3 | reference cards | `runelite-guide-chain/src/main/resources/reference/catalog.jsonl` (346 rows; built by `tools/gen_reference_catalog.py` from quest_db + contrib `minigamedb:`/`unlockdb:`) | 346 | `notes` is a prose blob; `start`/`length` dropped by the builder; `reqs.items` are parenthetical strings; card renders "info in a paragraph" |
| 4 | requisite blocks | steps + cards (render: `WebFragments.java` `cond-badge` / `summarizeRefJson`) | — | prereqs surface as badge afterthoughts; item requirements live only inside prose |

Pipeline context: `steps_quests.jsonl` + `goals_quests.jsonl` merge additively at
plan time (`plan-quests.mjs`) → planner → `enrich.py` → `route-*.json` fixtures →
plugin/web. `enrich.py` already injects coarse atoms + checkpoint headers from
`coarse_expansions.jsonl` (`_inject_coarse_atoms`, `_checkpoint_step`,
registry-stable `chkpt-<coarse>-<N>` ids). **We reuse exactly that machinery for
quest sub-checklists** — zero new planner concepts.

---

## 1. TARGET MODEL (all additive-nullable)

### 1a. Surface 1 — quest sub-checklists (mirror of the coarse model)

Two NEW sibling data files (keeps `steps.jsonl`/`coarse_expansions.jsonl` and the
byte-identical-route guarantees of `plan-quests.mjs` untouched):

**`assets/data/tools/quest_expansions.jsonl`** — same shape as
`coarse_expansions.jsonl`; `coarse_id` == the existing `steps_quests.jsonl` row id:

```jsonl
{"coarse_id": "quest-the-grand-tree", "name": "The Grand Tree sub-checklist",
 "status": "authored",
 "steps": ["q-the-grand-tree-01-talk-to-king-narnode", "q-the-grand-tree-02-talk-to-hazelmere", "..."],
 "checkpoints": [{"label": "Gnome Stronghold: the bark sample", "start": "q-the-grand-tree-01-talk-to-king-narnode"},
                 {"label": "Karamja: the Ship Yard", "start": "q-the-grand-tree-08-walk-to-shipyard"}]}
```

**`assets/data/tools/steps_quest_atoms.jsonl`** — atom rows in the unified
steps.jsonl node shape (SYNTHESIS §1b), one per action, EQUAL-GRADE (never
parent/child; grouping is checkpoint labels only, per GRANULARITY §7):

```jsonl
{"id": "q-the-grand-tree-01-talk-to-king-narnode",
 "label": "Talk to King Narnode Shareen (start quest)",
 "detail": "Grand Tree ground floor. Take the translation book and bark sample.",
 "kind": "quest",
 "atom": {"verb": "talk-to", "target": "king_narnode_shareen", "count": null, "cmp": "eq", "until": null},
 "reqs": {"skills": {}}, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [],
 "tags": ["quest"], "location": {"region": "kandarin", "zone": "tree-gnome-stronghold", "quest_gate": "quest-the-grand-tree", "quest_phase": "during"},
 "consumes": {}, "produces": {},
 "coarse_of": "quest-the-grand-tree",
 "hints": [{"type": "dialogue", "target": null, "value": "??", "note": null}],
 "mapMarkers": [{"x": 2465, "y": 3496, "plane": 0, "label": "Grand Tree, ground floor"}],
 "refs": [{"title": "The Grand Tree/Quick guide", "slug": "The_Grand_Tree_Quick_guide.s2", "url": "https://oldschool.runescape.wiki/w/The_Grand_Tree/Quick_guide"}]}
```

Rules (inherit GRANULARITY §1/§2 verbatim): verbs from the closed 17-entry enum
(`talk-to walk-to teleport withdraw deposit buy sell kill gather produce use-on
equip toggle plant harvest claim consume`); dialogue atomic (one talk-to per
quest-state change, option routing = `dialogue` hint); repetition collapses to
`count`/`until`; travel atoms only at zone transitions; mid-quest gear/item
needs as `consumes`/`reqs`; coords ONLY from fetched `{{Map}}`/`{{NPC map}}`
pins; anything unsourced `"??"`. Checkpoint labels = own-words renames of the
quick guide's own walkthrough subsection headers.

The parent `steps_quests.jsonl` row is finally touched ONLY by the consolidator:
it gains `"coarse_unwind": [atom ids]` (field already reserved by SYNTHESIS §1b)
and `"req_items"` (§1d). Its `detail` prose stays as fallback for un-expanded
quests; render prefers the sub-checklist when `coarse_unwind` is non-null.

### 1b. Surface 2 — skill training `methods[]`

New sidecar **`assets/data/tools/train_methods.jsonl`** — one row per existing
`train-*` (later `synth-*`) step; consolidator also attaches `methods[]` onto the
steps.jsonl row itself (additive field, pass-through in enrich like `hints`):

```jsonl
{"step_id": "train-attack-60",
 "methods": [
   {"method": "Slayer tasks (Mazchna → Vannaka)", "location": "task-dependent", "level_band": "40-60",
    "members": true, "xp_hr": "??",
    "reqs": {"skills": {}, "quests": [], "items": ["best scimitar for level"]},
    "refs": [{"title": "Slayer training", "slug": "Slayer_training.s3", "url": "https://oldschool.runescape.wiki/w/Slayer_training"}],
    "notes": "banks Slayer levels with the same hours"},
   {"method": "Hill Giants", "location": "Edgeville Dungeon", "level_band": "40-60",
    "members": false, "xp_hr": "??",
    "reqs": {"skills": {}, "quests": [], "items": ["brass key"]},
    "refs": [{"title": "Pay-to-play Melee training", "slug": "Pay-to-play_Melee_training.s13", "url": "https://oldschool.runescape.wiki/w/Pay-to-play_Melee_training"}],
    "notes": "big bones drop — Prayer xp side-benefit"}
 ]}
```

Rules: `methods[0]` MUST be the method the row's current `label`/`detail` names
(render continuity — existing text becomes redundant, not contradicted). 2–4
options per band, each with its own wiki breadcrumb (page + section slug that
exists in `manifest.jsonl`). `xp_hr` only when the page itself states a rate —
else `"??"`; `members` from the page's own statement else `"??"`. The player
picks; the planner keeps treating the row as one band step (methods are render
data, not planner branches — `branch{}` stays reserved for routing alternatives).

### 1c. Surface 3 — reference cards: structured blocks, no prose

`quest_db.jsonl` rows (and contrib `minigamedb:`/`unlockdb:` rows) gain, additively:

```jsonc
"summary": "Help King Narnode expose Glough's black-demon plot under the Grand Tree.",  // ≤160 chars, objective, one sentence
"facts": [                                    // typed, objective; closed label enum below
  {"label": "boss",         "value": "Black demon (level 172), safespottable at the daconia rocks"},
  {"label": "kills",        "value": "Black demon (172)"},
  {"label": "required-for", "value": "Monkey Madness I, The Eyes of Glouphrie"},
  {"label": "hazard",       "value": "level 53 jogres en route to the Ship Yard"}
],
"req_items": [                                // structured mirror of reqs.items prose strings
  {"name": "coins", "qty": 1000, "note": "only if you previously refused Femi", "optional": true}
]
```

`facts[].label` closed enum: `overview | boss | kills | combat | start | length |
difficulty | unlock | required-for | hazard | mechanics | xp-note | items-note |
removed | caveat`. `notes` prose is retained untouched (additive rule) but
becomes a fallback; the card builder and renders prefer `summary`+`facts`.

**`gen_reference_catalog.py` (consolidator change, execution phase):** carry
`start`, `length`, `summary`, `facts`, `req_items` through to `catalog.jsonl`;
row shape becomes `{id, kind, name, reqs, req_items, rewards, start, length,
summary, facts, refs, notes}`. `ReferenceEntry.java` gains the matching nullable
fields (unknown-field-safe Gson, no migration).

### 1d. Surface 4 — requisite / prereq blocks

**No new derived field.** The block is a RENDER of data that must exist
structured: `reqs.skills` + `reqs.quests` (already structured on steps and
cards) + `req_items` (new, §1c — emitted for BOTH the quest_db row and its
matching `steps_quests` row by the same FIX task, since both hold the same
prose) + `consumes` on atoms. Data completeness is delivered by tracks R and S;
the prominent REQUISITES/REWARDS/START block layout itself is a FOLLOW-ON
web-render task (§3d) — flagged, not designed here.

---

## 2. CONTRIBUTION SCHEMAS (what micro-agents emit)

Micro-agents NEVER write repo data files — they `wikicli contribute` keyed rows
(idempotent, first-seen wins); the consolidator materializes. Three kinds:

**`questatoms:<quest-slug>`** (kind `quest-expansion`) — one per quest:

```jsonc
{"key": "questatoms:the-grand-tree", "kind": "quest-expansion", "quest_id": "quest-the-grand-tree",
 "checkpoints": [{"label": "...", "start_idx": 0}, ...],
 "atoms": [{"idx": 0, "verb": "talk-to", "target": "king_narnode_shareen",
            "label": "...", "detail": "...", "count": null, "cmp": "eq", "until": null,
            "reqs": null, "consumes": {}, "produces": {},
            "coords": [{"x": 2465, "y": 3496, "plane": 0, "label": "..."}],
            "refs": [{"title": "...", "slug": "<manifest slug>", "url": "..."}],
            "hints": []}, ...],
 "refs": [/* page-level */], "notes": "flags/caveats only"}
```

Agents use local `idx`; the consolidator mints final ids
`q-<quest-slug>-<NN>-<verb>-<target-slug>` (no global id knowledge needed in the
cordon — same reasoning as the `[consolidate]` chkpt-id gotcha).

**`methods:<step_id>`** (kind `train-methods`) — one per band row, e.g.
`methods:train-attack-60`: `{key, kind, step_id, methods: [/* §1b shape */],
refs, notes}`.

**`cardfacts:<kind>:<id>`** (kind `card-facts`) — one per catalog-source row,
e.g. `cardfacts:quest:The_Grand_Tree`, `cardfacts:diary:ardougne-easy`,
`cardfacts:unlock:angler-outfit`:

```jsonc
{"key": "cardfacts:quest:The_Grand_Tree", "kind": "card-facts",
 "card_id": "The_Grand_Tree", "card_kind": "quest",
 "summary": "...", "facts": [{"label": "...", "value": "..."}],
 "req_items": [{"name": "...", "qty": 1, "note": null, "optional": false}],
 "steps_quests_id": "quest-the-grand-tree",   // null for diary/minigame/unlock
 "refs": [/* copied VERBATIM from the source row — FIX tasks fetch nothing, mint no slugs */],
 "notes": ""}
```

---

## 3. FAN-OUT PLAN — cordoned tracks

Failure mode being engineered out: an agent burning 80k tokens rediscovering
context to do 2k tokens of work. Every micro-prompt is SELF-CONTAINED: it embeds
(a) the exact scope ids + exact wiki page titles, (b) one verbatim grep command
to pull its held rows (bounded, no hunting), (c) the full extraction spec +
output schema + contribute key, (d) the discipline block (write-only Bash,
task-unique /tmp dir, queue claim/done, own-words, `"??"`, manifest-slug
citation, gotcha/retro logging). Fetch budgets are stated per task; overrun =
log a gotcha and ship what's bounded.

| track | kind | surface | partition | tasks |
|-------|------|---------|-----------|-------|
| R `card-facts` | **FIX** | 3 + 4 | quest_db all 264 rows in bundles of 20 (the removed Architectural Alliance keeps its card, gains a `removed` fact); contrib unlock/minigame 82 rows in bundles of 20 | 19 |
| S `skill-methods` | **GENERATE** | 2 | one task per training page (20 tasks / 23 skills — attack/strength/defence/hitpoints share the melee page task, which also owns `train-att-str-stronghold`, `train-mm-tunnels`, `train-nmz`) | 20 |
| Q `quest-subchecklist` | **GENERATE** | 1 | 188 quests bundled by region (from `quests.jsonl` `league_regions`, fuzzy-joined; misses → `misc`), difficulty-weighted bin-packing (novice=1 … grandmaster=8, capacity 10, max 6 quests/bundle); `quest-architectural-alliance` excluded (removed from game — no live sub-checklist) | 54 |

Total: **93 cordoned tasks across 3 tracks** (see `normalization_tasks.jsonl`).

FIX vs GENERATE reasoning: track R restructures prose we already hold
(quest_db `notes`/`items[]`, contrib notes) — **zero wiki fetches allowed**;
ambiguity → `"??"` + a `caveat` fact, never a fetch. Tracks S and Q need
wiki-grounded NEW data (method tables per level band; walkthrough-order atoms,
coords, option text) — GENERATE, though the blob cache (1,546 manifest entries;
quick guides + all training pages largely pre-fetched by depth/consolidation
passes) makes many gets free cache hits.

### 3a. Micro-prompt template — track R (FIX)

```
You are card-facts normalizer <TASK_ID>. FIX task: restructure held prose — you make ZERO wiki fetches (wikicli use is LIMITED to queue/contribute/feedback).
SCOPE (<N> rows in <SOURCE_FILE>): <ID LIST>.
Pull your rows with exactly: grep -F <patterns> <SOURCE_FILE> > $OUT/rows.jsonl  — then Read $OUT/rows.jsonl. Do not read anything else.
For each row emit ONE contribution (schema + key format + closed facts-label enum embedded here …). summary ≤160 chars, objective voice, no advice. Every fact objective + checkable against the held text; numbers you cannot see in the held text = "??". Parse reqs.items strings into req_items {name, qty, note, optional}. For kind=quest rows also set steps_quests_id (quest-<slug> if that id exists in steps_quests.jsonl — check with one grep). Copy refs[] VERBATIM from the source row.
Discipline: OUT=/tmp/<TASK_ID>; Bash is write-only (redirect, then Read). CLI=…/wikicli: queue add+claim "<TASK_ID>" first, contribute --file per row, queue done last. Own words. No repo file edits, no commits. Gotchas → one line "[normalize-r] …" appended to tools/wiki-kb/gotchas.log; finale "## <TASK_ID> retro" (≤12 lines) → tools/wiki-kb/retro.log.
```

### 3b. Micro-prompt template — track S (GENERATE)

```
You are skill-methods normalizer <TASK_ID> for <SKILL>. GENERATE task: mine the wiki training guide into per-band method options.
HELD ROWS: grep '"id": "train-<skill>-' /home/lemon/osrs-wiki/assets/data/tools/steps.jsonl > $OUT/rows.jsonl — these bands (reqs→grants) are FIXED; you enumerate methods per band, you do not re-band.
WIKI TARGET: "<EXACT PAGE TITLE>" (title-alias traps pre-resolved: melee stats share "Pay-to-play Melee training"; Herblore/Farming/Slayer/Thieving/Agility/Hunter/Construction/Fletching drop the prefix; Runecraft KEEPS it). $CLI sections "<title>" first; get --section N --strip only the level-band sections you need (budget ≤6 gets; most are manifest cache hits). Grep manifest.jsonl for the actual recorded title before citing (redirect trap).
Per band emit methods[] (schema embedded …): methods[0] = the method the row's current label/detail names; 2–4 total; xp_hr ONLY if the page states it, else "??"; members from the page else "??"; each method carries its own {title, slug (exact section-suffixed manifest slug), url} ref. reqs from the page's own stated gates only.
Contribute one row per band: key "methods:<step_id>". Do NOT touch xp fields (known-synthetic; fixed by a separate consolidator pass).
Discipline: [same block as track R, prefix "[normalize-s]"].
```

### 3c. Micro-prompt template — track Q (GENERATE)

```
You are quest-atomizer <TASK_ID>. GENERATE task: turn each quest's wall-of-prose into an ordered, equal-grade sub-checklist of atoms.
SCOPE (<N> quests): <quest_id → main page title → quick-guide title table embedded>.
HELD ROW per quest: grep -F '"id": "<quest_id>"' /home/lemon/osrs-wiki/assets/data/tools/steps_quests.jsonl > $OUT/<slug>.json — its detail prose is a CROSS-CHECK, never the source; reqs/xp/rewards are NOT your job (already structured in quest_db).
FETCH per quest (budget ≤5 gets, most cached): $CLI sections "<Quest>/Quick guide" → get its Walkthrough section(s) --strip. Known traps (inherit, do not rediscover): Quick-guide Details+Rewards H2s are transclusion stubs ({{Quest details page}}/{{Quest rewards page}}) — never fetch them; no /Quick guide page (sections 404s or byte-identical to main) → use the MAIN page's Walkthrough sections; grep the fetched text for "{{Quest details page" to detect stubs (byte size lies); grep manifest.jsonl for the actual title before citing (redirect/apostrophe/&-title traps); RFD chapters: one get --section 1 pulls the whole chapter.
EMIT one contribution per quest, key "questatoms:<slug>" (schema embedded …): ordered atoms at Faux grain — ONE of {single NPC/object interaction | exact-count repetition | until-loop | state toggle | one bank loadout} per atom; verb ∈ {talk-to walk-to teleport withdraw deposit buy sell kill gather produce use-on equip toggle plant harvest claim consume}; dialogue atomic (option routing = "dialogue" hint, value = the exact option text); repetition collapses to count/until; travel atoms only at zone transitions; mid-quest items as consumes/reqs on the atom that uses them; label ≤80 chars imperative; detail ≤2 sentences own words; coords ONLY from {{Map}}/{{NPC map}} pins in the fetched text (surface x 1000–4400, y 2200–3900; dungeons y+6400 up to ~10500; instanced y 4000–6500 — outside → recheck, don't "fix"); checkpoints = own-words renames of the walkthrough's own subsection headers, start_idx pointing into your atoms. Unknowns "??" — never fabricate a coordinate, count, or option text.
Discipline: [same block, prefix "[normalize-q]", plus: /tmp dir MUST be /tmp/<TASK_ID> (shared-/tmp collision trap)].
```

---

## 4. EXECUTION ORDER + SEAMS

```
W0  consolidator prep (code, one workflow, no fan-out)
    ├─ enrich.py/plan-quests.mjs: load quest_expansions.jsonl + steps_quest_atoms.jsonl and feed them
    │  through the EXISTING coarse path (_inject_coarse_atoms/_build_checkpoint_index) for the quests
    │  route only — additive, other routes byte-identical
    ├─ gen_reference_catalog.py: carry start/length/summary/facts/req_items (§1c)
    └─ train-* xp recompute from Experience_table.s2 (mechanical; gotcha [training])
W1  track R fan-out (FIX, no fetches, fastest)   ──►  consolidate-R:
       quest_db rows += summary/facts/req_items; steps_quests rows += req_items;
       regen catalog.jsonl; lint (label enum, summary length, refs untouched)
W2  track S fan-out (GENERATE, 20 tasks)         ──►  consolidate-S:
       write train_methods.jsonl; attach methods[] to steps.jsonl train rows;
       lint (methods[0] continuity, slug-in-manifest, xp_hr sourced-or-??)
W3  track Q fan-out (GENERATE, 54 tasks in waves of ~15)  ──►  consolidate-Q per wave:
       mint atom ids; write steps_quest_atoms.jsonl + quest_expansions.jsonl;
       set coarse_unwind on steps_quests rows; lint (verb enum, checkpoint start_idx
       resolves, coord envelope, slug-in-manifest, no bare fabricated numbers)
```

W1/W2/W3 are cordon-disjoint (different files, different contribute key
namespaces) and MAY run concurrently; the listed order is cheapest-first. The
consolidator is one repeatable script per track (contrib.jsonl → data files),
idempotent, re-runnable after every wave.

### 4d. FOLLOW-ON (listed, deferred — not designed here)

Web/plugin render work, **flagged: `WebFragments.java` has a concurrent edit in
flight — these tasks must rebase on it, do not start from this doc's snapshot**:

1. Sub-checklist render: quest detail pane renders `coarse_unwind` atoms as a
   checklist with `checkpoint-divider` group headers (both patterns already
   exist for coarse atoms in plan view — reuse, don't fork).
2. REQUISITES / REWARDS / START blocks: reference cards + step detail render
   labeled blocks from `reqs`/`req_items`/`rewards`/`start`/`facts` instead of
   `truncate(notes, 220)`; `cond-badge` demotes to a supplement of the block.
3. Method options: train-step detail renders `methods[]` as pickable option
   rows with per-method reqs + wiki breadcrumb chips.
4. Plugin mirrors: `GuideStep`/`ReferenceEntry` additive fields (methods,
   facts, summary, start, req_items) — unknown-field-safe, no migration.

---

## 5. TASK MANIFEST

`normalization_tasks.jsonl` (sibling file): **93 rows**, one per cordoned task —
`{id, track, kind: "FIX"|"GENERATE", scope: {…ids/pages…}, micro_prompt}` —
generated from the live data (quest bundles difficulty-weighted and grouped by
`quests.jsonl` league region; fuzzy-join misses → `misc` band, 47 quests, mostly
miniquests). Every `micro_prompt` is fully interpolated and dispatch-ready
(3.0–4.8k chars ≈ 0.8–1.3k tokens); contribute keys make every task safely
re-runnable and every collision a silent no-op. Task id scheme:
`norm-r-questdb-NN` / `norm-r-contrib-NN` / `norm-s-<skill>` /
`norm-q-<region>-NN`.
