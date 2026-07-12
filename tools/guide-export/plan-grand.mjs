// Drive the CAPSTONE chain — one continuous "Step 0 -> Endgame" route: character
// creation, Tutorial Island, the early Lumbridge quests, the quest-progression
// spine, and the P2P bossing milestones (Barrows / GWD / CoX), as a single
// interleaved checklist. Additive sibling to plan.mjs/plan-multi.mjs/
// plan-quests.mjs/plan-origin.mjs/plan-corpus.mjs — reuses their exact assembly,
// touches none of their source files.
//
// Two-part construction (mirrors why plan-origin.mjs never calls routeMulti):
//   1. ORIGIN PREFIX — Tutorial Island -> Lumbridge arrival (steps_origin.jsonl,
//      24 rows) is a pure DAG with EVERY row carrying reqs:{} and grants:{}, so
//      routeMulti has zero cost-based incentive to ever pick them (nothing
//      "requires" clicking through Tutorial Island). Concatenating them at the
//      FRONT of the plan's `path` array is what actually guarantees they open
//      the route: enrich.py's topo_order (P7) admits every zero-req step on its
//      very first pass, appending admissible steps in their CURRENT array order
//      (see topo_order's `for s in list(remaining)` loop) — so "first in array"
//      -> "first in the emitted order" for an all-zero-req block. This is the
//      same reuse-not-duplicate mapping plan-origin.mjs documents (the 4 opener
//      quests keep their steps.jsonl/steps_quests.jsonl id, not re-authored).
//   2. ROUTED CHAIN — routeMulti over the ordered goal set [goal-early-game,
//      goal-quest-spine, barrows, gwd, raids-cox] on the merged step corpus
//      (steps.jsonl + steps_quests.jsonl, deduped by id — no id collisions
//      today, but steps.jsonl rows win ties defensively, same precedence
//      plan-quests.mjs/plan-origin.mjs use). goal-early-game is queued (not just
//      decorative): it's what forces quest-sheep-shearer/quest-the-restless-ghost/
//      quest-x-marks-the-spot into the routed set — goal-quest-spine's own
//      reqs.quests only happens to include quest-cooks-assistant, not the other
//      three openers.
//
// goal-quest-cape vs goal-quest-spine (SUBSET, documented per the build brief's
// own escape hatch: "a converging honest subset beats a broken superset"):
// goal-quest-cape's reqs.skills union tops out at Thieving/Hunter/Smithing 99
// (driven by its own 216-quest reqs.quests set, not by anything Barrows/GWD/CoX
// need) — _difficulty in enrich.py's phased_steps sorts milestones by
// (max skill req, sum), so including quest-cape would place ITS episode after
// raids-cox's (max skill 75), ending the "Full Progression" route on the quest-
// cape capstone instead of Chambers of Xeric — the actual endgame anchor asked
// for. goal-quest-spine's reqs.skills top out at 74 (Cooking) < raids-cox's 75
// (Attack/Strength/Defence/Ranged), so the spine's episode sorts BEFORE CoX's —
// early_game -> gwd -> barrows -> quest_spine -> raids-cox, ending at CoX as
// intended. Swapping in quest-cape is a one-line change (DEFAULT_GOALS below)
// if a future pass wants the full 216-quest superset and a different ending.
//
// Usage: node tools/guide-export/plan-grand.mjs
import { loadFixtures, readData, makeEnv, freshProfile, queueGoal } from "../../tests/helpers.js";
import { routeMulti } from "../../assets/js/router/planner/greedy.js";
import { burndownResolve } from "../../assets/js/router/planner/burndown.js";

const DEFAULT_GOALS = ["goal-early-game", "goal-quest-spine", "barrows", "gwd", "raids-cox"];

const data = loadFixtures();
const questSteps = readData("steps_quests");
const originSteps = readData("steps_origin");
const questGoals = readData("goals_quests");
const originGoals = readData("goals_origin");

// Merge the three step banks, dedup by id (steps.jsonl wins, then steps_quests,
// then steps_origin — same precedence plan-quests.mjs/plan-origin.mjs already
// establish for the overlapping id space; verified empty overlap today across
// all three banks, kept defensive for when that changes).
const stepById = new Map();
for (const s of [...data.steps, ...questSteps, ...originSteps]) {
  if (!stepById.has(s.id)) stepById.set(s.id, s);
}
const mergedSteps = [...stepById.values()];

const byId = new Map([...data.goals, ...questGoals, ...originGoals].map((g) => [g.id, g]));
const goals = DEFAULT_GOALS.map((id) => byId.get(id)).filter(Boolean);
if (goals.length !== DEFAULT_GOALS.length) {
  console.error("plan-grand: missing goal ids:",
    DEFAULT_GOALS.filter((id) => !byId.has(id)));
  process.exit(1);
}

// No DEFERRAL_TRIGGERS hack needed (unlike plan-quests.mjs's standalone quest-
// cape route): barrows/gwd/raids-cox are queued here for REAL, so routeMulti's
// own env.activeGoalIds = {queued goal ids} (S8, greedy.js) already unlocks the
// train-attack/strength/defence-60/70/80 deferred_until bands those milestones'
// own skill reqs need. goal-99-attack/goal-99-strength triggers are likewise
// unnecessary: neither quest-spine (max Attack/Strength 70) nor raids-cox
// (75) ever reaches the 99 band.
const queued = goals.map((g) => queueGoal(g));
const env = makeEnv({ ...data, steps: mergedSteps });
const routedPath = routeMulti(queued, mergedSteps, freshProfile(), env);

// Origin prefix, verbatim steps_origin.jsonl order (already the correct
// Tutorial Island instructor sequence -> Lumbridge arrival, mirrors plan-
// origin.mjs's ORDER constant minus the 4 quest openers, which arrive via
// routedPath instead so they carry the SAME single copy other chains reuse).
const path = [...originSteps, ...routedPath];

// Run burndown separately to get sanitized goals (with supply tag-bridge
// applied), same pattern as plan-multi.mjs/plan-quests.mjs. goal-early-game
// carries no steer_points/skills so its episode header is a zero-content
// capstone (Tutorial Island grants no skill levels) — see DEVLOG/gotchas for
// the phase-boundary note this produces (origin content lands inside the NEXT
// milestone's episode, not its own; step ORDER is unaffected either way).
const { sanitizedGoals } = burndownResolve(
  queued, mergedSteps, data.supplyChains ?? [], data.coarseExpansions ?? []
);
const sanitizedById = new Map(sanitizedGoals.map((g) => [g.id, g]));

const covered = {
  id: "grand",
  label: "Full Progression (Step 0 → Endgame)",
  // xp_fold LEFT FALSE — the one deliberate divergence from plan-quests.mjs,
  // and empirically verified, not assumed. Tried xp_fold:true first (matching
  // plan-quests.mjs's own rationale for its deep reqs.quests chain): it does
  // shrink topo_order's Python-side re-simulation deadlock a little (see next
  // paragraph) but it ALSO turns on phased_steps' `quest_first` picker for
  // every milestone episode (enrich.py: "quest_first = (lambda s: _is_quest(s))
  // if xp_fold else (lambda s: False)"). quest_first's take() hunts the ENTIRE
  // `remaining` list for the first ready quest with NO position preference, so
  // it reaches straight past the origin prefix's 24 zero-req rows to grab
  // quest-priest-in-peril the instant the first real milestone episode (Toward
  // GWD) opens — verified: route opened with milestone-goal-early-game, then
  // quest-priest-in-peril, THEN Tutorial Island. With xp_fold off, quest_first
  // is inert and the episode's plain take(True) catch-all just picks the
  // earliest-position ready step each time — which IS the origin prefix, in
  // order, since it's first in the array (see the ORIGIN PREFIX note above)
  // and every row there is trivially ready(). "Opens at Tutorial Island" is
  // the harder, non-negotiable requirement, so this chain ships xp_fold:false.
  //
  // Consequence, reported not hidden: enrich.py's topo_order (P7) still can't
  // fully re-derive this route's order either way — it hits its own documented
  // "no remaining step's plain skill floor ever clears -> unordered dump"
  // fallback partway through (~half the real steps land in that fallback,
  // preserving whatever order routeMulti's JS-side effectiveLevel-aware router
  // already gave them, just without Python-side re-validation). This is NOT
  // novel to this driver — the SAME fallback already fires on the shipped
  // route-quests.json (200/303 steps, a WORSE ratio) and route-p2p.json (both
  // xp_fold:false already); it is an inherited enrich.py limitation, not
  // something plan-grand.mjs introduces or that additive-only permits fixing
  // here. Verified downstream effect: 0 goal-quests.jsonl chain breaks, a
  // small number (see DEVLOG/gotchas) of reqs.quests/quest_gate/skill spot-
  // check misses, concentrated in the fallback-dumped tail — same class of
  // gap already accepted in the two existing fixtures that share this engine.
  //
  // coarse_ids intentionally left unset (default, full unconditional
  // coarse_expansions scan): route-grand's path already contains ids from
  // every authored coarse group (origin-tutorial/origin-mainland-hour1 via the
  // origin prefix, prayer-pot-supply-coarse/etc. via the routed P2P/quest
  // content) so the same "any(sid in ordered_ids)" short-circuit that lets
  // route-p2p/route-corpus/route-quests leave it unset applies here too.
  xp_fold: false,
  // steer_points deliberately dropped too (barrows normally carries steer-
  // graceful/steer-ardougne-easy-diary — see route-p2p.json's own "Toward
  // Ardougne Easy Diary" phase for that waypoint-card UX). Carrying them
  // through flips enrich.py onto phased_steps_with_steer, whose
  // advances_steer() take() has the SAME position-blind hunt-through-
  // `remaining` behavior as quest_first above (verified: it also pulled
  // quest-priest-in-peril + the steer card ahead of the origin prefix). Same
  // call as xp_fold: opening at Tutorial Island wins; this chain has no
  // steer-point waypoint cards as a result — a real, reported trade-off.
  goals: goals.map((g) => {
    const san = sanitizedById.get(g.id) ?? g;
    return { id: g.id, label: g.label, reqs: san.reqs || g.reqs || {}, steer_points: [] };
  }),
};
process.stdout.write(JSON.stringify({ goal: covered, path }, null, 1));
