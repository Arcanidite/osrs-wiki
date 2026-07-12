// Shared test helpers — load the real JSONL data as fixtures and build a
// planner env the same way the editor does (in-memory graph, qual edges synced).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonl } from "../assets/js/router/load.js";
import { createGraph } from "../assets/js/router/graph.js";
import { syncQualEdges, SKILL_ORDER } from "../assets/js/router/model.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "assets", "data", "tools");

export function readData(name) {
  return parseJsonl(readFileSync(join(DATA, `${name}.jsonl`), "utf8"));
}

export function loadFixtures() {
  const tryRead = (name) => {
    try { return readData(name); } catch { return []; }
  };
  return {
    steps:             readData("steps"),
    goals:             readData("goals"),
    regions:           readData("regions"),
    constraints:       readData("constraints"),
    supplyChains:      tryRead("supply_chains"),
    coarseExpansions:  tryRead("coarse_expansions"),
    steerPoints:       tryRead("steer_points"),
  };
}

// Deterministic replacement for Date.now() so synthetic-step ids are stable.
export function counterNow(start = 1) {
  let n = start;
  return () => n++;
}

export function makeEnv({ steps, constraints, supplyChains = [], coarseExpansions = [], steerPoints = [] }, overrides = {}) {
  const graph = createGraph();
  syncQualEdges(graph, steps);
  return {
    graph,
    constraints,
    supplyChains,
    coarseExpansions,
    steerPoints,
    pinnedExclusions: new Set(),
    manualQuestDone:  new Set(),
    now: counterNow(),
    ...overrides,
  };
}

export function freshProfile(style = "balanced", excludeRegions = []) {
  const skills = Object.fromEntries(SKILL_ORDER.map((sk) => [sk, 1]));
  return { skills, style, excludeRegions };
}

export function leveledProfile(level, style = "balanced", excludeRegions = []) {
  const skills = Object.fromEntries(SKILL_ORDER.map((sk) => [sk, level]));
  return { skills, style, excludeRegions };
}

// Mirror of the editor's bank-add mapping: a goals.jsonl entry queued as-is.
export function queueGoal(g) {
  return { id: g.id, label: g.label, reqs: g.reqs ?? {}, grants: g.grants ?? {}, terminal: g.terminal ?? null };
}
