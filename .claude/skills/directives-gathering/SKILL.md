---
name: directives-gathering
description: This skill should be used BEFORE issuing directives to subagents or orchestrating any multi-agent fan-out / Workflow on the osrs-wiki + guide-chain project — i.e. whenever you are about to "fan out agents", "run a workflow", "compose granular checklist content", "enrich training methods / quest atoms", "wire wiki-grounded data", or write a subagent brief that composes/researches project content. It centralizes THIS project's conventions + gotchas: it makes you GATHER them (with provenance) from the repo before prompting, MEMORIALIZE anything new, and ASSEMBLE grounded, self-carrying, fable-tier directives — so briefs are never loose and don't dilute by the time a subagent executes.
version: 0.1.0
---

# Directives Gathering — ground every orchestration in our conventions

**Why this exists.** Multi-hop briefs get watered down: directive → workflow → subagent →
output loses intent at each hop, and lower-tier models flatten specific conventions back into
generic labels. This skill is the CENTRAL place for "how we do things here." Invoke it before
you orchestrate, follow the loop, and augment its registry when you learn something new.

## When to fire
- Before any `Workflow` or fan-out of `Agent` calls that COMPOSE or RESEARCH project content
  (checklist content, training methods, quest/skill atoms, captures, routes, reference cards).
- Before writing a subagent brief that must obey our data grammar / wiki rules.
- When the user says "fan out agents", "orchestrate", "compose the granular steps", "enrich X".
- NOT needed for a trivial one-shot edit with no subagent and no data-grammar surface.

## The loop (do all six, in order)
1. **Scope** the domain (training methods? quest atoms? capture? routes? consolidation?).
2. **Gather** the convention sources for that domain from §Sources — actually READ them, don't
   paraphrase from memory. Note the section/line each rule comes from.
3. **Provenance** — for every directive you will issue, know its source. If you can't cite it,
   you haven't gathered it; go back to step 2.
4. **Memorialize** — if the gather surfaced a NEW convention/gotcha: add it to the relevant
   design doc, write/append a memory, AND augment this skill (§Sources + §Registry below).
5. **Assemble** the directives per §Assembly — self-carrying, closed-enum-exact, fable-tier.
6. **Orchestrate** — dispatch the grounded fan-out. Have composing agents emit a retro block
   (design-retros.log style) so the synthesizer inherits intent.

## Sources — the requisites to gather (paths relative to repo root `osrs-wiki/`)
Read the ones your domain touches; when in doubt read more, not fewer.
- **Hard rules:** `CLAUDE.md` (wiki=SoT via wikicli, own-words, gather-not-GE, unified
  progression, overlay-only; the fan-out discipline).
- **Data grammar:** `tools/guide-export/design/granularity/GRANULARITY.md` — §1 `atom{}` +
  17-verb enum, §2 unwind rules U1–U10, §3 checkpoints, §4 `hints[]` closed enum, §5 fully
  worked atoms (the template to imitate).
- **Model:** `design/SYNTHESIS.md` (unified step node §1b, requisite-burndown).
- **Normalization (prose→structured):** `design/NORMALIZATION.md` — §1a is the EXACT sidecar
  machinery training/quest enrichment must reuse (never hand-edit fixtures).
- **Opportunistic weave:** `design/OPPORTUNISTIC_GRANULARITY.md`; **consolidation:**
  `design/CHAIN_CONSOLIDATION.md`, `design/CONSOLIDATION.md`.
- **Meta exemplars (external — STRUCTURE + research-priority ONLY, NOT citable):**
  `design/META_EXEMPLARS.md` — macroefficient-ironman goal-variants (well-rounded-maxing /
  CG-rush / UIM as lenses over one spine) + a wiki-research priority queue for
  moneymakers/afk/PvM/CG. HARD BOUNDARY: never scrape/copy/cite the external guides (pastebins,
  docs, YT, Discord); they set STRUCTURE, the wiki sets FACTS. (Tamibro's UIM guide is the one
  exception — it's wiki-hosted, so citable.)
- **Voice + conventions-with-provenance:** `design/PLAYER_DIRECT_GRANULAR.md` (§7 is the cited
  convention registry; keep it and this skill in sync).
- **Training ordering (STRUCTURE, wiki-grounds facts):** `design/TRAINING_META_ORDERING.md` —
  the community 1-99 per-skill method spine + cross-skill dependency seeds; the ordering the
  fine-grained training breakdown follows (external → order only, wiki sets facts).
- **State-annotated consolidation:** `design/STATE_CONSOLIDATION.md` — the ideal step-0→endgame
  heap/quicksort scan, per-step `state_after` (skills/inventory/gear/bank + item states),
  requisite inventory/gear/bank management, and the player-POV MICRO-gotchas category
  (`tools/wiki-kb/micro_gotchas.log`). Verify state via `route_feasibility.mjs` + wiki + calc.
- **Gotchas (quote verbatim to agents):** `tools/wiki-kb/gotchas.log`,
  `design/design-retros.log`, `tools/wiki-kb/GAME_GOTCHAS.md`, `tools/wiki-kb/GAME_KB.md`.
- **Memories:** player-direct-granular, guide-burndown-model, opportunistic-granularity,
  subagent-dispatch-prefs, no-effort-hedging, coding-conventions, guide-chain-session-2026-07-12.

## Assembly — what a grounded brief must contain
- **Self-carrying:** inline the rule + a GOOD/BAD pair + one fully-filled example in the exact
  output shape. Never rely on "read doc X" alone; also point to the doc for depth.
- **Closed enums exact:** the 17 verbs and 9 hint types are fixed sets — quote them; don't let
  an agent invent members.
- **Reuse the machinery:** name the sidecar files to edit (e.g. `train_methods.jsonl`,
  `steps_oppgran.jsonl` + `coarse_expansions_oppgran.jsonl`) — never the route JSON.
- **Grounding:** wikicli only + the live title-alias/xp/coord gotchas quoted; own-words;
  gather-not-GE; `"??"` over any guess.
- **Tier:** fable for composing/synthesis agents (lower tiers dilute the voice); one
  skill/domain per agent (deep, not wide); receipts to files, data to files.
- **Player-direct voice** (for checklist content): items ARE the intricate action, phrased as
  direct player guidance — see PLAYER_DIRECT_GRANULAR.md §1.

## Registry — the load-bearing conventions in brief (augment as you learn)
- **Atom node shape** (GRANULARITY §5, NORMALIZATION §1a): `{id,label,detail,kind,atom:{verb,
  target,count,cmp,until},reqs,grants,xp,inv_used,inv_removes,tags,location{region,zone,
  quest_gate,quest_phase},produces,consumes,timing,supply_chain,coarse_of,branch,
  hints[{type,target,value,note}],mapMarkers,refs,est_minutes}`.
- **17 verbs:** talk-to walk-to teleport withdraw deposit buy sell kill gather produce use-on
  equip toggle plant harvest claim consume.
- **9 hint types:** do-while dialogue toggle-state batch-size teleport-choice rng-variance
  keep-drop safespot contested-fallback (advice only — removing all hints leaves step
  completable).
- **Unwind (GRANULARITY §2):** U4 repetition collapses to one atom+count/until; U5 dialogue
  atomic; U6 travel atoms only at zone transitions; U8 reuse existing rows by id; U1 checkpoint
  = bank-loadout boundary; U10 id = `<prefix>-<NN>-<verb>-<slug>` + `coarse_of` FK.
- **Attach model:** methods on skill+band via `train_methods.jsonl` (goal.train_methods);
  equal-grade atom subChecklist via oppgran sidecars (goal.granular); coarse row stays anchor,
  gains `coarse_unwind`+`req_items`; re-bake reproduces.
- **wikicli traps:** search title first — melee=one "Pay-to-play Melee training";
  Slayer/Herblore/Farming drop the prefix; Runecraft keeps it; Blackjacking→Thieving. Fixture
  xp is synthetic → recompute from `Experience_table.s2`. Coords only from `{{Map}}` pins.
- **Checkpoint ids** are registry-stable `chkpt-<coarse>-<N>` (index in checkpoints[], not
  emission order); labels = own-words renames of the wiki walkthrough headers.
- **Opportunistic weave = SPINE-ONLY, QoL/unlock payoffs** (OPPORTUNISTIC_GRANULARITY.md
  §2-epoch): the route is a speedrun spine, not a grind log. Back-prop demand horizon =
  QoL/unlock milestones (goals/steer-points w/ `anchor_weight`) + their ordered
  **fox/hen/feed** requisite chains, sourced at the EARLIEST in-position window; `_payoff`
  carries `kind`(qol-unlock|ordered-requisite) / `epoch`(spine) / `compounds`; `paysOff.at`
  names the COMPOUNDING benefit ("fairy rings — every trip after"), not a one-shot consumer.
  **Loot/grind epochs (Barrows/GWD/raids) own self-contained intra-epoch supply loops —
  NEVER back-propagate their consumables (food/brews/pots) onto the spine.** (barrows-ACCESS
  = spine milestone; barrows-loot GRINDING = separate epoch.)

## Consulting tools (run these to VALIDATE, don't eyeball)
- **State-feasibility gate:** `node tools/guide-export/route_feasibility.mjs [route.json]` —
  joins the ordered route with the steps.jsonl requisite bank, accumulates prefix state
  (skills/quests/items/unlocks), and flags every step whose reqs aren't met where it lands.
  `--at <id>` prints the state available at a step + its verdict; `--json` for machine parse.
  ANY ordering/breakdown work MUST end with this at 0 faults (or documented-acceptable). It is
  how "is the hypothesized next step doable given the computed state" gets answered — never by
  eye. Cross-check calculated values (band xp) against `Experience_table.s2`, facts against the
  wiki (wikicli). Extend it (new checks: item-math, quest-varbit gates) as the model grows.

## Augmenting this skill
When a wave teaches you a durable convention or gotcha: (1) add/adjust it in §Registry, (2) add
the source to §Sources if new, (3) mirror it into the relevant design doc + a memory. Keep
`PLAYER_DIRECT_GRANULAR.md` §7 and this §Registry in sync — they are the two faces of the same
central record.
