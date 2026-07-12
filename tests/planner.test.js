import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { plan } from "../assets/js/router/planner/index.js";
import { routeMulti, costFor, isDeferrable } from "../assets/js/router/planner/greedy.js";
import { weaveOverlays } from "../assets/js/router/planner/overlay.js";
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

// ── Lane 3 — sequencer full (S8 deferred_until, overlay.js passive/alternation) ──

test("isDeferrable: demandSet hard-overrides deferred_until (S8)", () => {
  const step = { id: "s1", deferred_until: ["some-goal-never-queued"] };
  const held      = { activeGoalIds: new Set(), demandSet: new Set() };
  const demanded  = { activeGoalIds: new Set(), demandSet: new Set(["s1"]) };
  assert.equal(isDeferrable(step, held, {}), false, "no trigger satisfied -> held");
  assert.equal(isDeferrable(step, demanded, {}), true, "demandSet beats an unmet deferral");
});

test("isDeferrable: no deferred_until never holds; tag: trigger reads granted state", () => {
  assert.equal(isDeferrable({ id: "s2" }, { activeGoalIds: new Set() }, {}), true);
  const tagStep = { id: "s3", deferred_until: ["tag:bossing"] };
  assert.equal(isDeferrable(tagStep, { activeGoalIds: new Set() }, {}), false, "tag not yet granted -> held");
  assert.equal(isDeferrable(tagStep, { activeGoalIds: new Set() }, { "tag:bossing": true }), true, "tag granted -> released");
});

test("deferred_until holds a step until its named trigger goal is queued (S8)", () => {
  const steps = [
    { id: "deferred-goal-step", label: "Deferred until later-goal queued", reqs: { skills: {} },
      grants: { attack: 60 }, xp: { attack: 1000 }, tags: ["combat"], deferred_until: ["later-goal"] },
  ];
  const goalA = { id: "goal-a", label: "A", reqs: { skills: { attack: 60 } }, grants: {}, terminal: null };

  const held = routeMulti([goalA], steps, freshProfile(), makeEnv({ steps }));
  assert.ok(!held.some((s) => s.id === "deferred-goal-step"), "step stays held while its trigger goal isn't queued");

  const laterGoal = { id: "later-goal", label: "Later", reqs: { skills: { attack: 60 } }, grants: {}, terminal: null };
  const released = routeMulti([goalA, laterGoal], steps, freshProfile(), makeEnv({ steps }));
  assert.ok(released.some((s) => s.id === "deferred-goal-step"), "step releases once its trigger goal is queued (whole batch is 'active')");
});

test("deferred_until: tag: trigger releases only after that tag is actually granted (S8)", () => {
  const steps = [
    { id: "grant-bossing", label: "Unlock bossing access", reqs: { skills: {} }, grants: { bossing: true }, tags: [] },
    { id: "deferred-tag-step", label: "Deferred tag-gated training", reqs: { skills: {} },
      grants: { attack: 50 }, xp: { attack: 1000 }, tags: ["combat"], deferred_until: ["tag:bossing"] },
  ];
  const goals = [{ id: "g", label: "G", reqs: { skills: { attack: 50 }, tags: ["bossing"] }, grants: {}, terminal: null }];
  const path = routeMulti(goals, steps, freshProfile(), makeEnv({ steps }));
  const ids = path.map((s) => s.id);
  assert.ok(ids.includes("grant-bossing"), "trigger step routed");
  assert.ok(ids.includes("deferred-tag-step"), "deferred step released once its tag trigger fired");
  assert.ok(ids.indexOf("grant-bossing") < ids.indexOf("deferred-tag-step"), "release only ever happens after the trigger, never before");
});

test("weaveOverlays: 3+ consecutive same-region actives get one alternation card, pinned before the run", () => {
  const step = (id, region) => ({ id, label: id, tags: [], location: { region } });
  const path = [step("a", "zone1"), step("b", "zone1"), step("c", "zone1"), step("d", "zone2")];
  // No slot-typed steps in the bank at all — alternation must NOT depend on overlaySteps.
  const result = weaveOverlays(path, [], makeEnv({ steps: [] }));
  const marker = result.find((s) => s._alternation);
  assert.ok(marker, "alternation card injected for the 3-run");
  assert.deepEqual(marker._alternation_members, ["a", "b", "c"]);
  assert.equal(result.indexOf(marker), result.indexOf(result.find((s) => s.id === "a")) - 1, "card sits immediately before the run");
  assert.equal(result.filter((s) => s._alternation).length, 1, "the 1-member zone2 tail never gets a card");
});

test("weaveOverlays: passive embeds_into badges ACTIVE hosts by tag, never a bg chip", () => {
  const passive = { id: "embed-x", label: "Zero-time embed", slot: { type: "passive", embeds_into: ["combat"] } };
  // bg's OWN tags deliberately overlap "combat" — proves the chip is skipped
  // structurally (never a host), not merely because tags happen not to match.
  const bg = { id: "bg-x", label: "Loop", tags: ["background", "combat"], reqs: { skills: {} },
               slot: { type: "background", cadence_min: null, lifecycle: { states: ["idle"], initial: "idle" } } };
  const breakStep = { id: "break-1", label: "Bank", tags: ["banking"], location: { region: "r" } };
  const host = { id: "train-x", label: "Train", tags: ["combat"], location: { region: "r" } };
  const result = weaveOverlays([breakStep, host], [passive, bg], makeEnv({ steps: [] }));
  const chip = result.find((s) => s._bg);
  assert.ok(chip, "bg setup chip was injected at the break");
  assert.ok(!chip._passiveOverlays, "bg chip never receives a passive badge even though its tags match embeds_into");
  const badgedHost = result.find((s) => s.id === "train-x");
  assert.deepEqual(badgedHost._passiveOverlays, ["Zero-time embed"]);
});
