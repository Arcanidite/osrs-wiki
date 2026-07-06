// Planner seam (brief §5.2) — every algorithm implements
//   plan(goals, steps, profile, env, config) -> { path, diagnostics }
// env: { graph, constraints, pinnedExclusions, manualQuestDone, now }
// P0 ships greedy only (baseline parity); topo/astar/beam/ilp land behind
// config.algorithm in later phases. "auto" resolves to the best available.

import { routeMulti } from "./greedy.js";

export function plan(goals, steps, profile, env, config = {}) {
  const requested = config.algorithm ?? "auto";
  // Only greedy is implemented so far — everything resolves to it.
  const path = routeMulti(goals, steps, profile, env);
  return {
    path,
    diagnostics: { algorithm: "greedy", requested },
  };
}
