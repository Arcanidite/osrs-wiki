// Drive the progression-router planner over MANY goals at once → one ordered,
// prereq-satisfying P2P route. Same assembly as plan.mjs (loadFixtures ->
// routeMulti) but queues every goal id passed on argv, so a single plan covers
// the whole members milestone set rather than one quest.
//
// Usage: node tools/guide-export/plan-multi.mjs [--id ID] [--label L] goalA goalB ...
//   defaults to the P2P milestone goals if none are given.
import { loadFixtures, makeEnv, freshProfile, queueGoal } from "../../tests/helpers.js";
import { routeMulti } from "../../assets/js/router/planner/greedy.js";
import { burndownResolve } from "../../assets/js/router/planner/burndown.js";

const DEFAULT_GOALS = ["quest-dt", "quest-mm", "barrows", "gwd", "raids-cox"];

function parseArgs(argv) {
  const opts = { id: "p2p", label: "P2P Progression", ids: [] };
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
const byId = new Map(data.goals.map((g) => [g.id, g]));
const goals = opts.ids.map((id) => byId.get(id)).filter(Boolean);
if (goals.length === 0) {
  console.error("no goals matched:", opts.ids.join(", "), "\navailable:", data.goals.map((g) => g.id).join(", "));
  process.exit(1);
}

const queued = goals.map((g) => queueGoal(g));
const env = makeEnv(data);
const path = routeMulti(queued, data.steps, freshProfile(), env);

// Run burndown separately to get sanitized goals (with supply tag-bridge applied).
// These sanitized goals carry reqs.tags:["supply-<chain>"] so enrich.py can
// emit "Supply: <chain>" phases before the consuming milestone (S6).
const { sanitizedGoals } = burndownResolve(
  queued, data.steps, data.supplyChains ?? [], data.coarseExpansions ?? []
);
const sanitizedById = new Map(sanitizedGoals.map((g) => [g.id, g]));

// Carry each milestone's skill reqs through so enrich.py can segment the route
// into episodes — a phase closes when a milestone's requirements are first met.
const covered = {
  id: opts.id,
  label: opts.label,
  // steer_points threaded through so enrich.py can activate phase anchors per goal.
  // reqs uses sanitized version (with supply tags) so enrich.py sees tag-bridge.
  goals: goals.map((g) => {
    const san = sanitizedById.get(g.id) ?? g;
    return { id: g.id, label: g.label, reqs: san.reqs || g.reqs || {},
             steer_points: g.steer_points || [] };
  }),
};
process.stdout.write(JSON.stringify({ goal: covered, path }, null, 1));
