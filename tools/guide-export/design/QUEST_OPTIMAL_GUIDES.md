# QUEST OPTIMAL GUIDES — optimal step-by-step quest walkthroughs + optimal-play tips

## Goal
Upgrade quest content (`steps_quest_atoms.jsonl`, ~188 quests) to OPTIMAL step-by-step
walkthroughs — the *efficient* completion route per quest (pre-staged items, minimal trips,
the exact interaction order) + optimal-play tips — same rigor as everything else. DEEPEN the
existing quest atoms; don't duplicate.

## The lean fan-out (fable orchestrates + delegates; CLAUDE.md fan-out discipline)
Keep the effort LEAN — terse agentic spawning, direct succinct seams:
- **FABLE ORCHESTRATOR** owns the wave: classify → delegate → consolidate. It does NOT compose
  content itself.
- **CLASSIFY-FIRST (one burst):** enumerate quests, prioritise (route position · QoL reward ·
  xp reward), map each to its wiki `/Quick guide` page. Emit a ranked queue to a file.
- **TERSE workers (sonnet; haiku for shallow probes) — one quest (or a tight batch) each:** a
  SELF-CONTAINED, LEAN brief (no stdin; ~2k-token directive). Compose the optimal walkthrough
  atoms + tips, wiki-grounded, WRITE to `${scratch}/quests/<id>.json`, return a ONE-LINE
  receipt. **Data lives in files (succinct seams), never in context.** Bash write-only.
- **SHORT SYNCHRONOUS BURSTS**, not a monolith; each burst's rows feed the next.
- **FABLE consolidation** → the quest sidecars.

## Content per quest
- **Optimal walkthrough:** the efficient route as faux-grain atoms (talk-to/gather/produce/
  use-on/travel), player-direct voice, item PRE-STAGING (withdraw the full quest loadout up
  front — one bank trip), exact interaction order, minimal back-and-forth.
- **Optimal-play tips:** `hints[]` (dialogue-skip, item shortcuts, teleport-choice, safespot,
  order tricks) + notable REWARDS (xp lamps, unlocks) as QoL-payoff milestones for the weave.
- Reqs/refs from the wiki: main `Details` for reqs/start, `/Quick guide` Checklist for step
  structure, `{{Map}}` for coords; own-words; gather-not-GE; `"??"` over guesses.

## Rigor
Atom node shape + 17-verb / 9-hint closed enums; player-direct voice (PLAYER_DIRECT_GRANULAR);
quest sidecars (`quest_expansions` + `steps_quest_atoms`); `state_after` tracked;
`route_feasibility` = 0; re-bake reproduces. Retro + gotchas per burst.

## Also — "other optimal play/tips"
Beyond quests: general optimal-play tips (efficient methods, QoL unlocks, meta) woven as
`hints[]` / a reference-tips surface, wiki-grounded — a parallel terse worker set.
