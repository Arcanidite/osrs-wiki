// backprop.test.js — unit coverage for the opportunistic-lookahead engine
// (OPPORTUNISTIC_GRANULARITY.md §2). Synthetic, deterministic routes (no
// fixture dependency) exercising exactly the two acceptance shapes the
// design calls out: a demand with an early in-window source weaves at that
// window, and a demand with no in-position source stays honestly unresolved.
// Full pipeline wiring (P8 placement + fallback stub emission) is Python-side
// (tools/guide-export/backprop.py, enrich.py's insert_supply_steps) and is
// gated by the route-grand regeneration + diff review, not by this suite.
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSourceIndex, collectDemands, accumulateSkills, backpropCollectionPlan,
} from "../assets/js/router/planner/backprop.js";

// route: [0] train fishing at the barbarian-village zone (grants fishing 20)
//        [1] an unrelated quest step, ALSO at barbarian-village (in-position, capable)
//        [2] the combat step that consumes food, elsewhere
const inWindowRoute = [
  { id: "train-fishing-20", location: { zone: "barbarian-village" }, grants: { fishing: 20 }, produces: {} },
  { id: "quest-at-village", location: { zone: "barbarian-village" }, grants: {}, produces: {} },
  { id: "ctr-05-kill-x", location: { zone: "elsewhere" }, grants: {}, consumes: { food: 1 } },
];
const foodBank = [
  { id: "gather-food-village", location: { zone: "barbarian-village" },
    reqs: { skills: { fishing: 20 } }, produces: { food: "??" } },
];

test("backprop: an early in-window source weaves at the earliest in-position node", () => {
  const sourceIndex = buildSourceIndex(foodBank);
  const demands = collectDemands(inWindowRoute, []);
  const plans = backpropCollectionPlan(inWindowRoute, demands, sourceIndex, accumulateSkills(inWindowRoute));
  const plan = plans.find((p) => p.item === "food");
  assert.equal(plan.verdict, "earliest-window");
  // The backward sweep OVERWRITES on every still-earlier qualifying node (§2,
  // step 2: "the LAST candidate written while walking backward IS the
  // EARLIEST in route order"), so the walk keeps matching all the way to
  // node [0] (also in-zone, and it's the very node that grants the fishing
  // 20 the source needs) — that is the reported window, not [1].
  assert.equal(plan.collectAtId, "train-fishing-20");
  assert.equal(plan.viaSource, "gather-food-village");
  assert.equal(plan.sourceAfterConsumer, false);
});

test("backprop: a no-window demand (no in-position source before the consumer) is honestly unresolved", () => {
  const route = [
    { id: "somewhere-else", location: { zone: "unrelated-zone" }, grants: {}, produces: {} },
    { id: "consumer-step", location: { zone: "consumer-zone" }, grants: {}, consumes: { volcanic_ash: 1 } },
  ];
  // Only source for volcanic_ash is zoned somewhere the route never visits
  // before the consumer — no candidate window should ever be recorded.
  const bank = [
    { id: "gather-ash-elsewhere", location: { zone: "never-visited" }, reqs: {}, produces: { volcanic_ash: "??" } },
  ];
  const sourceIndex = buildSourceIndex(bank);
  const demands = collectDemands(route, []);
  const plans = backpropCollectionPlan(route, demands, sourceIndex, accumulateSkills(route));
  const plan = plans.find((p) => p.item === "volcanic_ash");
  assert.equal(plan.verdict, "no-window");
  assert.equal(plan.collectAtId, null);
});

test("backprop: an already-in-position source reports already-earliest, not a weave", () => {
  const route = [
    { id: "gather-here", location: { zone: "same-zone" }, grants: {}, produces: { snape_grass: "??" }, reqs: {} },
    { id: "filler", location: { zone: "same-zone" }, grants: {}, produces: {} },
    { id: "brew-here", location: { zone: "same-zone" }, grants: {}, consumes: { snape_grass: 1 } },
  ];
  const bank = [route[0]];
  const sourceIndex = buildSourceIndex(bank);
  const demands = collectDemands(route, []);
  const plans = backpropCollectionPlan(route, demands, sourceIndex, accumulateSkills(route));
  const plan = plans.find((p) => p.item === "snape_grass");
  assert.equal(plan.verdict, "already-earliest");
});

test("backprop: a source scheduled after its consumer is flagged, not silently reordered", () => {
  const route = [
    { id: "consumer-first", location: { zone: "z" }, grants: {}, consumes: { ranarr_seed: 1 } },
    { id: "gather-late", location: { zone: "z" }, grants: {}, produces: { ranarr_seed: "??" }, reqs: {} },
  ];
  const bank = [route[1]];
  const sourceIndex = buildSourceIndex(bank);
  const demands = collectDemands(route, []);
  const plans = backpropCollectionPlan(route, demands, sourceIndex, accumulateSkills(route));
  const plan = plans.find((p) => p.item === "ranarr_seed");
  assert.equal(plan.verdict, "no-window"); // no in-position node PRECEDES the consumer
  assert.equal(plan.sourceAfterConsumer, true); // but the fault is surfaced, not hidden
});

test("backprop: a goal-level (horizon) demand weaves at an earlier in-position node (RUN-PROVEN food_monkfish shape)", () => {
  // Mirrors the design doc's own captured spike result: barrows' horizon
  // demand for food_monkfish resolves to the earlier Catherby cooking-training
  // node, not a dedicated later trip to the source step itself.
  const trainStep = { id: "train-cooking-74", location: { zone: "catherby" }, grants: { cooking: 74 }, produces: {} };
  const unrelatedStep = { id: "unrelated-step", location: { zone: "elsewhere" }, grants: {}, produces: {} };
  const cookStep = { id: "cook-monkfish", location: { zone: "catherby" }, reqs: { skills: { cooking: 62 } }, produces: { food_monkfish: "??" } };
  const route = [trainStep, unrelatedStep, cookStep];
  const goals = [{ id: "barrows", reqs: { items: { food_monkfish: 14 } } }];
  // Only the real producer is in the bank (buildSourceIndex reads the STEPS
  // BANK, not the whole route — the other route nodes are plain training/quest
  // rows that happen to occupy the same zone).
  const sourceIndex = buildSourceIndex([cookStep]);
  const demands = collectDemands(route, goals);
  const plans = backpropCollectionPlan(route, demands, sourceIndex, accumulateSkills(route));
  const plan = plans.find((p) => p.item === "food_monkfish" && p.consumerId === "barrows");
  assert.equal(plan.verdict, "earliest-window");
  assert.equal(plan.collectAtId, "train-cooking-74");
  assert.equal(plan.viaSource, "cook-monkfish");
});
