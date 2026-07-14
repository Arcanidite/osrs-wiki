# ACHIEVEMENT DIARIES — first-class granular cornerstones

Diaries (Easy/Medium/Hard/Elite per region) are major QoL cornerstones — their rewards are
COMPOUNDING QoL payoffs (teleports, XP lamps, run-energy, method/access unlocks, better
drops). They must be first-class granular checklist entries with the SAME rigor as quests —
not implicit `reqs`. Mirror the quest sidecar machinery (NORMALIZATION §1a); reuse, don't
reinvent.

## 1. Model (parallels quest_expansions / steps_quest_atoms)
- **`assets/data/tools/diary_expansions.jsonl`** — one row per region+tier:
  `{coarse_id:"diary-<region>-<tier>", name, status, steps:[atom ids], checkpoints:[{label,start}]}`.
- **`assets/data/tools/steps_diary_atoms.jsonl`** — one faux-grain atom per diary TASK, in the
  unified node shape, player-direct voice ("Pickpocket a Master Farmer in Draynor", "Cut a
  magic tree", "Enter the Fremennik Slayer dungeon"), with `reqs` (skills/quests/items/access),
  `refs` (the Diary page + the task's own page), coords ONLY from `{{Map}}` pins.
- **Tier-completion** = a coarse milestone step that GRANTS the reward and is a QoL-unlock
  **steer-point** (`anchor_weight`) — it joins the opportunistic weave as a compounding payoff
  (Explorer's ring 2 [Lumbridge Medium] → run-energy + free low-alch every trip after; Ardougne
  cloak → unlimited Ardougne teleports; Fremennik → better slayer; Karamja gloves → …).

## 2. Ordering / opportunistic (OPPORTUNISTIC §2-epoch)
- Diary TASKS interleave with training/quests — most are done IN-POSITION while you're already
  training that skill or doing an overlapping quest. The weave sources each task at its earliest
  in-position window (never a dedicated diary-only trip when the task was passable earlier).
- The tier REWARD is a spine QoL-milestone; fetch tiers EARLY where the reward multiplies the
  rest of the run. Prioritise by reward value (Ardougne · Lumbridge · Varrock · Fremennik ·
  Kandarin high-value; Karamja gloves for slayer; Morytania for ecto/bonecrusher).
- Requisite-gate: a tier's task reqs + its own skill/quest gates must be feasible
  (`route_feasibility` = 0) before the tier-completion lands.

## 3. Rigor (identical to quests/training)
Atom node shape + 17-verb / 9-hint closed enums; player-direct voice (PLAYER_DIRECT_GRANULAR);
wikicli-grounded (the Achievement Diary page per region + each task's page); own-words;
gather/produce never GE; `"??"` over guesses; `state_after` tracked; sidecars only, re-bake
reproduces; feasibility 0.

## 4. Scope + lane
12 regions × 4 tiers ≈ 48 tier-rows, each several tasks. Sequential subtasks (no workflow),
one region (all 4 tiers) or one tier-cluster per burst, wikicli-grounded, wired via the diary
sidecars, gated by `route_feasibility`. The reward-milestones register as QoL steer-points so
the opportunistic weave pulls high-value tiers forward.
