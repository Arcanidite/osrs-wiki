// Drive the progression-router planner over the QUEST DATABASE chain — a
// separate, additive sibling to plan-multi.mjs. Loads steps_quests.jsonl
// (one router step per quest_db quest/miniquest row, minted by the
// quest-chain builder) ALONGSIDE the existing steps.jsonl, and routes a
// goal from goals_quests.jsonl (goal-quest-cape by default) via the same
// routeMulti() the P2P chain uses.
//
// Deliberately does NOT touch assets/data/tools/goals.jsonl or steps.jsonl —
// both steps_quests.jsonl and goals_quests.jsonl are new sibling files, kept
// out of loadFixtures()'s fixed file list so the existing P2P/corpus routes
// and the "ALL goals in bank order" baseline-parity test (tests/planner.test.js)
// stay byte-identical to before this chain existed.
//
// Usage: node tools/guide-export/plan-quests.mjs [--id ID] [--label L] goalA goalB ...
//   defaults to goal-quest-cape (the full quest-cape chain) if none are given.
import { loadFixtures, readData, makeEnv, freshProfile, queueGoal } from "../../tests/helpers.js";
import { routeMulti } from "../../assets/js/router/planner/greedy.js";
import { burndownResolve } from "../../assets/js/router/planner/burndown.js";

const DEFAULT_GOALS = ["goal-quest-cape"];

function parseArgs(argv) {
  const opts = { id: "quests", label: "Quest Progression", ids: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id") { opts.id = argv[++i]; continue; }
    if (argv[i] === "--label") { opts.label = argv[++i]; continue; }
    opts.ids.push(argv[i]);
  }
  if (opts.ids.length === 0) opts.ids = DEFAULT_GOALS;
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const data = loadFixtures();

// Merge in the quest-chain sibling files. steps_quests.jsonl carries only the
// NEW quest steps (ids not already present in steps.jsonl); quests already
// wired into the P2P chain keep their existing steps.jsonl id and are reused,
// not duplicated (see the quest-chain builder's override map).
const questSteps = readData("steps_quests");
const questGoals = readData("goals_quests");
const mergedSteps = [...data.steps, ...questSteps];

const byId = new Map([...data.goals, ...questGoals].map((g) => [g.id, g]));
const goals = opts.ids.map((id) => byId.get(id)).filter(Boolean);
if (goals.length === 0) {
  console.error("no goals matched:", opts.ids.join(", "), "\navailable:", [...byId.keys()].join(", "));
  process.exit(1);
}

// Deferred-band unlock trick (documented gotcha, no router-file edits):
// a handful of late P2P training steps (train-attack-60/70, train-strength-99, ...)
// carry deferred_until:["barrows"|"gwd"|"raids-cox"|"goal-99-attack"|"goal-99-strength"]
// so the P2P guide doesn't recommend them until the player is chasing that specific
// bossing/skill milestone (greedy.js isDeferrable — env.activeGoalIds gate). A pure
// quest goal never queues those milestones, so those bands stay held even though
// several quests (e.g. RFD finale: Attack/Strength/Defence 65) genuinely need them.
// routeMulti() unconditionally sets env.activeGoalIds = the queued goals' own ids
// (greedy.js, not editable here), so we queue trivial same-id "trigger" goals
// (empty reqs -> contribute nothing but their own id to activeGoalIds and a single
// inert capstone) alongside the real quest goal. Their capstones are stripped below.
const DEFERRAL_TRIGGERS = ["barrows", "gwd", "raids-cox", "goal-99-attack", "goal-99-strength"];
const triggerGoals = DEFERRAL_TRIGGERS.map((id) => ({
  id, label: `(trigger) ${id}`, reqs: {}, grants: {}, terminal: null,
}));

const questGoalIds = new Set(goals.map((g) => g.id));
const queued = [...triggerGoals, ...goals.map((g) => queueGoal(g))];
const env = makeEnv({ ...data, steps: mergedSteps });
const rawPath = routeMulti(queued, mergedSteps, freshProfile(), env);

// Strip the trigger goals' own inert capstones (they never route any real steps —
// empty reqs are satisfied before the heap ever builds); keep everything else,
// including any capstone belonging to a real requested goal.
const path = rawPath.filter((s) => !(s._capstone && !questGoalIds.has(s.id.replace(/^capstone-/, ""))));

// Run burndown separately to get sanitized goals (with supply tag-bridge applied),
// same pattern as plan-multi.mjs. Only the real quest goal(s) feed the output —
// the trigger goals are pure routing plumbing, never surfaced as milestones.
const { sanitizedGoals } = burndownResolve(
  queued, mergedSteps, data.supplyChains ?? [], data.coarseExpansions ?? []
);
const sanitizedById = new Map(sanitizedGoals.map((g) => [g.id, g]));

const covered = {
  id: opts.id,
  label: opts.label,
  // enrich.py opt-in flag (see its topo_order/phased_steps docstrings): the
  // quest chain's deep reqs.quests dependencies only resolve through quest-
  // reward-XP-folded effective skill levels, same as the live planner (graph.js
  // effectiveLevel) — plain-floor re-simulation gets stuck and silently drops
  // to an unordered dump. Scoped to this payload only so route-p2p.json /
  // route-corpus.json stay byte-identical (xp_fold defaults False elsewhere).
  xp_fold: true,
  goals: goals.map((g) => {
    const san = sanitizedById.get(g.id) ?? g;
    return { id: g.id, label: g.label, reqs: san.reqs || g.reqs || {},
             steer_points: g.steer_points || [] };
  }),
};
process.stdout.write(JSON.stringify({ goal: covered, path }, null, 1));
