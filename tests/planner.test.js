import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { plan } from "../assets/js/router/planner/index.js";
import { routeMulti, costFor } from "../assets/js/router/planner/greedy.js";
import { toState, reqQuals } from "../assets/js/router/model.js";
import { loadFixtures, makeEnv, freshProfile, queueGoal } from "./helpers.js";
import { scenarios, runScenario } from "./generate-fixtures.js";

const data = loadFixtures();
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "baseline-routes.json");

test("baseline parity: routes match the pinned fixture (npm run fixtures to re-pin intentionally)", () => {
  const pinned = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const current = scenarios(data).map((sc) => runScenario(data, sc));
  assert.deepEqual(current, pinned);
});

test("every goal yields its capstone, in queue order", () => {
  const goals = data.goals.slice(0, 6).map(queueGoal);
  const path = routeMulti(goals, data.steps, freshProfile(), makeEnv(data));
  const capstones = path.filter((s) => s._capstone).map((s) => s.id);
  assert.deepEqual(capstones, goals.map((g) => `capstone-${g.id}`));
});

test("goal reqs are satisfied by cumulative state at each capstone", () => {
  const goals = data.goals.map(queueGoal);
  const env = makeEnv(data);
  const path = routeMulti(goals, data.steps, freshProfile(), env);
  let state = toState(freshProfile().skills);
  for (const step of path) {
    if (step._capstone) {
      const target = reqQuals(step.reqs ?? {});
      assert.ok(env.graph.satisfies(target, state), `capstone ${step.id} reqs unmet`);
    } else {
      state = env.graph.coalesce(env.graph.edgesFrom("step:grant", step.id), state);
    }
  }
});

test("no duplicate non-synthetic steps across the whole multi-goal route", () => {
  const goals = data.goals.map(queueGoal);
  const path = routeMulti(goals, data.steps, freshProfile(), makeEnv(data));
  const ids = path.filter((s) => !s._synthetic && !s._capstone).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("excluded regions never appear in the route", () => {
  const goals = data.goals.map(queueGoal);
  const excluded = data.regions.map((r) => r.id);
  for (const region of excluded) {
    const profile = freshProfile("balanced", [`region-${region}`]);
    const path = routeMulti(goals, data.steps, profile, makeEnv(data));
    const offenders = path.filter((s) => s.location?.region === region);
    assert.deepEqual(offenders.map((s) => s.id), [], `region ${region} leaked into route`);
  }
});

test("pinned exclusions are honored (excluded step replaced or gap-filled)", () => {
  const goals = data.goals.slice(0, 3).map(queueGoal);
  const base = routeMulti(goals, data.steps, freshProfile(), makeEnv(data));
  const firstPreset = base.find((s) => !s._synthetic && !s._capstone);
  if (!firstPreset) return; // nothing to exclude
  const env = makeEnv(data, { pinnedExclusions: new Set([firstPreset.id]) });
  const rerouted = routeMulti(goals, data.steps, freshProfile(), env);
  assert.ok(!rerouted.some((s) => s.id === firstPreset.id), "excluded step reappeared");
});

test("manualQuestDone seeds completion (quest not re-routed)", () => {
  const quests = data.steps.filter((s) => (s.tags ?? []).includes("quest"));
  if (!quests.length) return;
  const goals = data.goals.map(queueGoal);
  const base = routeMulti(goals, data.steps, freshProfile(), makeEnv(data));
  const routedQuest = base.find((s) => (s.tags ?? []).includes("quest"));
  if (!routedQuest) return;
  const env = makeEnv(data, { manualQuestDone: new Set([routedQuest.id]) });
  const rerouted = routeMulti(goals, data.steps, freshProfile(), env);
  assert.ok(!rerouted.some((s) => s.id === routedQuest.id), "done quest was re-routed");
});

test("unsatisfiable req produces an honest synthetic placeholder, never silence", () => {
  // hitpoints tops out below 99 in the current bank, so a synth is guaranteed
  const goals = [{ id: "impossible", label: "Impossible", reqs: { skills: { hitpoints: 99 }, tags: ["made-up-tag"] }, grants: {}, terminal: null }];
  const path = routeMulti(goals, data.steps, freshProfile(), makeEnv(data));
  const synths = path.filter((s) => s._synthetic);
  assert.ok(synths.some((s) => s.label.startsWith("Train Hitpoints")), "missing skill synth");
  assert.ok(synths.some((s) => s.label === "Obtain made-up-tag"), "missing tag synth");
  assert.ok(synths.every((s) => s.detail.includes("Synthetic step")), "synths must self-identify");
});

test("costFor styles (baseline semantics)", () => {
  const xpStep = { xp: { attack: 1000 } };
  assert.equal(costFor(xpStep, "efficient"), 1 / 1000);
  assert.equal(costFor({}, "efficient"), 100);
  assert.equal(costFor({ inv_used: 7 }, "afk"), 7);
  assert.equal(costFor({ tags: ["money"] }, "gp"), 0.5);
  assert.equal(costFor({ tags: [] }, "gp"), 1);
  assert.equal(costFor(xpStep, "balanced"), 1);
});

test("quest reward XP is credited toward skill level, pruning covered training", () => {
  // A quest granting ~level-40 worth of Attack XP should cover an Attack-30 goal
  // outright: the quest is routed and no train-attack band is grinded.
  const steps = [
    { id: "q-xp-dump", label: "XP dump quest", kind: "quest", tags: ["quest"],
      reqs: { skills: {} }, grants: {}, xp: { attack: 35000 } },
    { id: "train-attack-10", label: "Train Attack 1→10", reqs: { skills: {} }, grants: { attack: 10 }, xp: { attack: 1154 }, tags: ["combat"] },
    { id: "train-attack-30", label: "Train Attack 10→30", reqs: { skills: { attack: 10 } }, grants: { attack: 30 }, xp: { attack: 12321 }, tags: ["combat"] },
  ];
  const goals = [{ id: "atk30", label: "Attack 30", reqs: { skills: { attack: 30 } }, grants: {}, terminal: null }];
  const path = routeMulti(goals, steps, freshProfile(), makeEnv({ steps }));
  const ids = path.map((s) => s.id);
  assert.ok(ids.includes("q-xp-dump"), "the XP-reward quest is routed");
  assert.ok(!ids.some((id) => id.startsWith("train-attack")), "quest XP pruned the dead-weight Attack training");
  assert.ok(!path.some((s) => s._synthetic), "goal met by real steps, no synth fill");
});

test("quest prerequisites gate ordering (reqs.quests)", () => {
  // Quest B requires quest A; the route must place A before B.
  const steps = [
    { id: "q-a", label: "Quest A", kind: "quest", tags: ["quest"], reqs: { skills: {} }, grants: {}, xp: { cooking: 5000 } },
    { id: "q-b", label: "Quest B", kind: "quest", tags: ["quest"], reqs: { skills: {}, quests: ["q-a"] }, grants: {}, xp: { cooking: 5000 } },
  ];
  const goals = [{ id: "cook40", label: "Cooking 40", reqs: { skills: { cooking: 40 } }, grants: {}, terminal: "q-b" }];
  const path = routeMulti(goals, steps, freshProfile(), makeEnv({ steps })).filter((s) => !s._capstone);
  const ids = path.map((s) => s.id);
  assert.ok(ids.indexOf("q-a") >= 0 && ids.indexOf("q-b") >= 0, "both quests routed");
  assert.ok(ids.indexOf("q-a") < ids.indexOf("q-b"), "prerequisite quest A precedes B");
});

test("planner seam returns diagnostics", () => {
  const goals = data.goals.slice(0, 1).map(queueGoal);
  const { path, diagnostics } = plan(goals, data.steps, freshProfile(), makeEnv(data), { algorithm: "auto" });
  assert.ok(Array.isArray(path) && path.length > 0);
  assert.equal(diagnostics.algorithm, "greedy");
  assert.equal(diagnostics.requested, "auto");
});

test("determinism: same inputs → identical route", () => {
  const goals = data.goals.map(queueGoal);
  const a = routeMulti(goals, data.steps, freshProfile("efficient"), makeEnv(data)).map((s) => s.id);
  const b = routeMulti(goals, data.steps, freshProfile("efficient"), makeEnv(data)).map((s) => s.id);
  assert.deepEqual(a, b);
});
