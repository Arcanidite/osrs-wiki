# Consolidated guide-study — the interleaved requisite-burndown model

Synthesis of 15 supplemental-guide studies (706 requisites, retros in `retro.log`,
per-guide detail in `out/<slug>.md`). This is the design base for the reasoning wave.
Hard framing (from the requester): UNIFIED progression (no F2P/P2P split); everything
self-sourced by GATHERING/PRODUCTION (solo or group), never GE-bought; supplies staged
ahead-of-time or JIT; move past "train skill to N" and "do the pinnacle quest".

## The meta-model that emerged
A progression is a **requisite burndown**: each milestone decomposes into requisites
(item / level / unlock / access / quest / gear), each requisite resolves to an in-game
GATHERING or PRODUCTION activity, recursively, until everything roots in a doable action.
The planner's job is to **interleave** that burndown optimally — not to emit a flat list.

## 13 cross-guide interleaving patterns (with source)
1. **Requisite cascade / dependency-driven order** — satisfy prerequisites *before* claiming
   the unlock; naturally orders the plan. (dunkingoreos, mootrius-im)
2. **Solve supply before scaling demand** — 3-system foundation money→prayer→food gates all
   combat. (mootrius-im)
3. **Production perspective, not consumption** — AFK/efficiency tables assume stockpiles;
   INVERT them into gather/craft loops that feed the method. (afk-skilling)
4. **Background/passive loops on a cadence** — herb runs (~90min), birdhouses, kitten
   maturation, Grubby chest, agility marks, courier tasks; fire-and-forget WITH lifecycle
   tracking (seeds out, nests full). Run *during* active grinds at ~no real-time cost.
   (mootrius-farming, mootrius-im, zeah-locked, dunkingoreos)
5. **Alternation slots** — interleave active + AFK, main-task + background, to mitigate
   fatigue; "read ahead, find alternation slots." The sequencer must expose these slots.
   (mootrius-im)
6. **Zero-time XP embedding** — alch during smithing, bury bones during melee, magic during
   firemaking. Skill *ordering* matters more than leveling rate. (xerxes-f2p)
7. **Train-to-breakpoint, then defer** — train only to the level a gate needs, defer the
   intensive grind until a later prerequisite demands it. (dunkingoreos, multiquest-f2p)
8. **Slayer as the spine** — master level-gating (Mazchna→Nieve→Duradel); Turael-skip for
   task curation; slayer drops ARE the supply loop (herbs→potions, ammo, zenyte, gear);
   slayer runs alongside bosses to sustain consumables. (mootrius-slayer, bossing-ladder,
   mootrius-farming, melee-gear)
9. **Quest batching by hub/region** — cluster quests by location to compress travel;
   multi-phase quests resume per phase; pre-stage consumables before entry; gather quest
   materials during *unrelated* activities ahead of time (bones during hill giants →
   Demon Slayer). (multiquest-im, multiquest-f2p, dunkingoreos)
10. **Recurring maintenance loops** — consumable drains (Zulrah scales, revenant ether,
    prayer pots) are ONGOING, not one-time; drives batched-farm vs JIT choice. (melee-gear)
11. **Region-access gating (implicit)** — Shantay Pass → Port Sarim jail; Below Ice Mountain
    gates Knight's Sword; spawn zones must OVERLAP gathering zones to parallelize.
    (zeah-locked, multiquest-f2p)
12. **QP / diary as progression metric & anchor** — quest points as checkpoints (12/32 QP);
    Ardougne Easy Diary as an *anchor* around which phases collapse efficiency; Morytania
    Hard Diary deliberately follows farming setup. (speedrun, dunkingoreos, mootrius-im)
13. **Gear earned via the tier, not chased** — Barrows pieces accumulate, zenyte from slayer,
    BiS from raids; don't insert "buy gear" steps. (bossing-ladder)

## Steer-point taxonomy (the non-level, non-quest milestones the requester wants)
- **Access unlocks**: Fairy Rings, spirit-tree network, POH relocation cascade
  (Rimmington→Hosidius→Pollnivneach), region access, minigame hubs (Barbarian Assault).
- **QoL gear/outfits**: Graceful (run-energy breakpoint), Slayer helmet, carpenter outfit
  (Mahogany Homes cascade), Prospector, Angler.
- **Farming/supply infra**: ultracompost, birdhouses, seaweed, herb-patch network.
- **Progress metrics**: collection-log %, quest points, achievement-diary tiers, pet drops
  (passive milestone — never forced).
- **Combat spine**: slayer master unlocks, slayer points, gear-tier inflections (whip @85).

## Coarse items to UNWIND (55 flagged; recurring clusters)
RFD 6 subquests (each its own item/craft chain), Monkey Madness greegree 4-trip routing,
Desert Treasure safespots, combat-training routing (crabs vs slayer decision heuristic),
herblore recipe→secondary-ingredient chains, Turael-skip click sequence, banking/inventory
patterns, farm-run loops, gear-tier contents per stage, boss/raid ENTRY mechanics
(Warriors' Guild, Barrows, ToA, CoX), supply chains (farm→ranarr→prayer pot).

## Requisite stats
706 rows, 0 malformed. kind: quest 149 · level 141 · item 122 · activity 111 · unlock 68 ·
coarse 55 · gear 35 · access 16. timing: ahead-of-time 402 · either 166 · JIT 138.
Densest sources: dunkingoreos-early (163), zeah-locked (64), multiquest-f2p (61),
clog-skilling (56), completionism (55).

## Cautions for the reasoning wave (from gotchas.log)
- Several sources are index/checklist/meta ONLY (hints-tips, completionism, afk-skilling,
  clog-skilling, speedrun-meta) — no interleaving encoded; the model must INVENT sequencing,
  not extract it. Don't fabricate; mark gaps.
- Off-guide MANDATORY training exists (multiquest-f2p: Magic 10→33, Prayer 11→37 before
  Dragon Slayer I) — front-load into the burndown or it fails at a gate.
- Spawn/gather zone overlap is assumed implicitly — verify before claiming parallelization.
- Maintain the no-F2P/P2P-split continuum throughout.
