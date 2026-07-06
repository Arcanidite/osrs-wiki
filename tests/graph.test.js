import test from "node:test";
import assert from "node:assert/strict";
import { createGraph, memoryStorage } from "../assets/js/router/graph.js";

test("node CRUD + query", () => {
  const g = createGraph();
  g.upsert("step", "a", { label: "A" });
  g.upsert("step", "b", { label: "B" });
  g.upsert("meta", "profile", { style: "balanced" });
  assert.equal(g.node("step", "a").data.label, "A");
  assert.equal(g.node("step", "missing"), null);
  assert.equal(g.query({ type: "step" }).length, 2);
  assert.equal(g.query({ type: "step", filter: (d) => d.label === "B" }).length, 1);
  g.remove("step", "a");
  assert.equal(g.node("step", "a"), null);
});

test("edge CRUD + unlinkAll", () => {
  const g = createGraph();
  g.link("step:req", "s1", "skill:attack", { cmp: "gte", value: 10 });
  g.link("step:req", "s1", "tag:member",   { cmp: "has" });
  g.link("step:req", "s2", "skill:attack", { cmp: "gte", value: 5 });
  assert.equal(g.edgesFrom("step:req", "s1").length, 2);
  assert.equal(g.edgesTo("step:req", "skill:attack").length, 2);
  assert.equal(g.edge("step:req", "s1", "tag:member").data.cmp, "has");
  g.unlinkAll("step:req", "s1");
  assert.equal(g.edgesFrom("step:req", "s1").length, 0);
  assert.equal(g.edgesFrom("step:req", "s2").length, 1);
});

test("gte cmp: satisfies / coalesce / progresses are monotone", () => {
  const g = createGraph();
  g.link("step:req", "s", "skill:attack", { cmp: "gte", value: 30 });
  const reqs = g.edgesFrom("step:req", "s");

  assert.equal(g.satisfies(reqs, { "skill:attack": 29 }), false);
  assert.equal(g.satisfies(reqs, { "skill:attack": 30 }), true);
  assert.equal(g.satisfies(reqs, {}), false); // missing treated as 0

  g.link("step:grant", "s", "skill:attack", { cmp: "gte", value: 20 });
  const grants = g.edgesFrom("step:grant", "s");
  // coalesce is max-merge: a lower grant never lowers state
  assert.equal(g.coalesce(grants, { "skill:attack": 50 })["skill:attack"], 50);
  assert.equal(g.coalesce(grants, { "skill:attack": 10 })["skill:attack"], 20);

  // progresses: grant must raise current toward (not past) the target
  const target = [{ to: "skill:attack", data: { cmp: "gte", value: 30 } }];
  assert.equal(g.progresses(grants, target, { "skill:attack": 10 }), true);
  assert.equal(g.progresses(grants, target, { "skill:attack": 25 }), false); // 20 ≤ 25, no progress
  assert.equal(g.progresses([{ to: "skill:attack", data: { cmp: "gte", value: 99 } }], target, {}), false); // overshoots target
});

test("has cmp: satisfies / coalesce / progresses", () => {
  const g = createGraph();
  const reqs = [{ to: "tag:member", data: { cmp: "has" } }];
  assert.equal(g.satisfies(reqs, {}), false);
  assert.equal(g.satisfies(reqs, { "tag:member": true }), true);
  assert.equal(g.coalesce(reqs, {})["tag:member"], true);
  assert.equal(g.progresses(reqs, reqs, {}), true);
  assert.equal(g.progresses(reqs, reqs, { "tag:member": true }), false);
});

test("unknown cmp fails closed", () => {
  const g = createGraph();
  assert.equal(g.satisfies([{ to: "x", data: { cmp: "nope", value: 1 } }], { x: 99 }), false);
});

test("storage round-trip: writes persist through the adapter", () => {
  const storage = memoryStorage();
  const g1 = createGraph(storage);
  g1.upsert("meta", "goals", [{ id: "g1" }]);
  g1.link("step:req", "s", "skill:magic", { cmp: "gte", value: 50 });

  const g2 = createGraph(storage); // fresh instance, same backing store
  assert.equal(g2.node("meta", "goals").data[0].id, "g1");
  assert.equal(g2.edgesFrom("step:req", "s").length, 1);
});
