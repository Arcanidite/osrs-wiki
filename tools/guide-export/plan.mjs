// Drive the real progression-router planner (greedy) for one goal and emit the
// ordered plan (array of step objects) as JSON on stdout. Assembly mirrors the
// planner tests (tests/helpers.js): load JSONL -> createGraph+syncQualEdges ->
// routeMulti. Usage: node tools/guide-export/plan.mjs <goalId>
import { loadFixtures, makeEnv, freshProfile, queueGoal } from "../../tests/helpers.js";
import { routeMulti } from "../../assets/js/router/planner/greedy.js";

const data = loadFixtures();
const goalId = process.argv[2] || data.goals[0].id;
const goal = data.goals.find((g) => g.id === goalId);
if (!goal) { console.error("goal not found:", goalId, "\navailable:", data.goals.map((g) => g.id).join(", ")); process.exit(1); }
const path = routeMulti([queueGoal(goal)], data.steps, freshProfile(), makeEnv(data));
process.stdout.write(JSON.stringify({ goal: { id: goal.id, label: goal.label }, path }, null, 1));
