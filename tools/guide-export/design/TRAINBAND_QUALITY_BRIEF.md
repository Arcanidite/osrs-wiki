# TRAINBAND QUALITY BRIEF — carry-forward for the next agent (self-contained)

Job 1 (route order) is LANDED: `node tools/guide-export/route_feasibility.mjs` = **0 faults**
on route-grand; `npm test` 93/93. This brief carries Job 2 forward: deepen the `train-*`
band content to TRAINING_META_ORDERING quality. Run in a FRESH context; everything needed
is in this file + the cited docs. Do not re-derive Job 1.

## State you inherit (verified 2026-07-14)
- route-grand.json: 372 steps, 0 INFEASIBLE-at-position, 82 train/synth bands — **100%
  already carry methods[] + subChecklist** (tenrich waves + skill+band fallback). The gap
  is QUALITY, not coverage.
- The checker (`route_feasibility.mjs`) now folds quest XP, credits rfd-* quests, credits
  synth-* SKILL conds, class-matches reqs.items. It is the standing gate: re-run after ANY
  sidecar/bake change; 0 faults or a written justification.
- Known residual (justified): route-corpus keeps 3 item faults (unlock-gwd, train-mm-tunnels)
  — it is the region-phased APPENDIX chain with no milestone episodes, so P10's demand_gate
  never runs there; the playable spine (grand) is the gated surface.

## The job — per-skill quality audit + deepen (one skill per agent, fable-tier)
Audit each skill's bands against `design/TRAINING_META_ORDERING.md` (the 1-99 method spine;
external = ORDER only, wiki = facts) and upgrade the sidecars where they fall short:
1. **methods[]** best-first per the spine (`methods[0]` = the row's own existing label —
   continuity, [normalize-s]); real xp_hr only when the cited page states it, else `"??"`;
   band xp recomputed from `Experience_table.s2` (cumulative(hi)−cumulative(lo); fixture xp
   is synthetic — never trust it; never interpolate between XP-table rows).
2. **subChecklist atoms** in player-direct voice with BETWEEN-STEP FLOW (arrive → withdraw
   loadout → collapsed action loop with until{} → transition), checkpoints at U1
   bank-loadout boundaries, hints[] from the closed enum, U8-reuse existing rows by id.
3. **Cross-skill deps** per §C-BURNDOWN (Magic Imbue before combo runes, 85 FM before
   infernal axe, 98 Cooking before cut-eat barb, …) — if a band's method needs a dep the
   route orders wrong, fix DATA (reqs/tags on the band row) and re-run the checker.

## Voice (PLAYER_DIRECT_GRANULAR.md §1 — calibrate every label)
- GOOD: "Chop willow trees at the SE corner of Draynor Village, dropping each full set
  (power-chop). Keep going until Woodcutting 45."
- BAD: "Train Woodcutting to 45."

## Hard mechanics (Registry, .claude/skills/directives-gathering/SKILL.md)
- Atom node shape: `{id,label,detail,kind,atom:{verb,target,count,cmp,until},reqs,grants,
  xp,inv_used,inv_removes,tags,location{region,zone,quest_gate,quest_phase},produces,
  consumes,timing,supply_chain,coarse_of,branch,hints[{type,target,value,note}],mapMarkers,
  refs,est_minutes}`; id = `<prefix>-<NN>-<verb>-<slug>`, `coarse_of` = the band step id.
- 17 verbs: talk-to walk-to teleport withdraw deposit buy sell kill gather produce use-on
  equip toggle plant harvest claim consume. 9 hint types: do-while dialogue toggle-state
  batch-size teleport-choice rng-variance keep-drop safespot contested-fallback. CLOSED —
  prior waves invented 8-9 hint types and had to be repaired ([tenrich-fishing/-smithing]).
- SIDECARS ONLY, never the route JSON: `assets/data/tools/train_methods.jsonl` (step_id →
  methods[]), `assets/data/tools/steps_oppgran.jsonl` + `coarse_expansions_oppgran.jsonl`
  (atoms + checkpoints{label,start}); the coarse row gains coarse_unwind + req_items via
  the consolidator only. Re-bake must reproduce everything.
- wikicli only (`tools/wiki-kb/wikicli`); title aliases: melee = one "Pay-to-play Melee
  training"; Slayer/Herblore/Farming drop the prefix; Runecraft KEEPS it; Blackjacking →
  "Thieving training". Coords ONLY from fetched `{{Map}}`/`{{NPC map}}` pins (LocLine
  coords are below the bar — [tenrich-defence]). Own words; gather/produce never GE;
  `"??"` over any guess. Read tools/wiki-kb/gotchas.log tail (tenrich-* entries) first —
  most skills already have a repair-pass precedent worth inheriting.

## Priority order (spine value; one agent per skill, short bursts)
melee att/str/def (NMZ/defensive-style gotchas already logged) → slayer (block/unlock
point-spend order is pure §A structure) → magic → prayer → ranged → agility/thieving →
artisan (§C) → gathering (§D).

## Land + validate (every burst)
`cd tools/guide-export && node plan-grand.mjs | python3 enrich.py > /home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json`
then `node route_feasibility.mjs` (must stay 0) + `npm test` (93/93). Commit both repos;
baseline re-pins are intentional acts noted in the commit message.
