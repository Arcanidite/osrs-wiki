// Regenerate the pinned baseline routes: `npm run fixtures`.
// Only rerun this when a planner behavior change is INTENDED — the whole point
// of the fixture is to catch unintended drift from the extracted baseline.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "../assets/js/router/planner/index.js";
import { loadFixtures, makeEnv, freshProfile, leveledProfile, queueGoal } from "./helpers.js";

export function scenarios(data) {
  const goalById = Object.fromEntries(data.goals.map((g) => [g.id, g]));
  const pick = (ids) => ids.map((id) => queueGoal(goalById[id]));
  const goalIds = data.goals.map((g) => g.id);
  return [
    {
      name: "fresh account, single quest goal (first goal in bank)",
      profile: freshProfile(),
      goals: pick(goalIds.slice(0, 1)),
    },
    {
      name: "fresh account, first five goals, xp-efficient",
      profile: freshProfile("efficient"),
      goals: pick(goalIds.slice(0, 5)),
    },
    {
      name: "fresh account, ALL goals in bank order",
      profile: freshProfile(),
      goals: pick(goalIds),
    },
    {
      name: "level-50 account, first five goals, wilderness excluded",
      profile: leveledProfile(50, "balanced", ["region-wilderness"]),
      goals: pick(goalIds.slice(0, 5)),
    },
    {
      name: "level-50 account, all goals, gp style",
      profile: leveledProfile(50, "gp"),
      goals: pick(goalIds),
    },
  ];
}

export function runScenario(data, sc) {
  const env = makeEnv(data); // fresh graph + deterministic now() per scenario
  const { path, diagnostics } = plan(sc.goals, data.steps, sc.profile, env);
  return {
    name: sc.name,
    algorithm: diagnostics.algorithm,
    stepIds: path.map((s) => s.id),
    stepLabels: path.map((s) => s.label),
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = loadFixtures();
  const out = scenarios(data).map((sc) => runScenario(data, sc));
  const dest = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "baseline-routes.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${dest}: ${out.length} scenarios, ${out.reduce((n, s) => n + s.stepIds.length, 0)} total steps`);
}
