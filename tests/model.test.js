import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReqs, reqQuals, grantQuals, toState, fromState, reqsSummary, syncQualEdges,
} from "../assets/js/router/model.js";
import { createGraph } from "../assets/js/router/graph.js";
import { loadFixtures } from "./helpers.js";

test("toState / fromState round-trip", () => {
  const skills = { attack: 40, magic: 55, _tags: ["member"], _items: ["4151"] };
  const state = toState(skills);
  assert.deepEqual(state, {
    "skill:attack": 40, "skill:magic": 55, "tag:member": true, "item:4151": true,
  });
  assert.deepEqual(fromState(state), skills);
});

test("reqQuals compiles skills, tags, atlas_items to typed qual edges", () => {
  const q = reqQuals({
    skills: { thieving: 53 },
    tags: ["member"],
    atlas_items: [{ id: 4151, name: "Abyssal whip" }],
  });
  assert.deepEqual(q, [
    { to: "skill:thieving", data: { cmp: "gte", value: 53 } },
    { to: "tag:member",     data: { cmp: "has" } },
    { to: "item:4151",      data: { cmp: "has", label: "Abyssal whip" } },
  ]);
});

test("grantQuals: numbers→gte, true→has, atlas_items→has", () => {
  const q = grantQuals({ attack: 10, money: true, atlas_items: [{ id: 995 }] });
  assert.deepEqual(q, [
    { to: "skill:attack", data: { cmp: "gte", value: 10 } },
    { to: "tag:money",    data: { cmp: "has" } },
    { to: "item:995",     data: { cmp: "has" } },
  ]);
});

test("normalizeReqs tolerates null/garbage", () => {
  assert.deepEqual(normalizeReqs(null), { skills: {} });
  assert.deepEqual(normalizeReqs("x"), { skills: {} });
  assert.deepEqual(normalizeReqs({ skills: { magic: 3 } }).tags, []);
});

test("reqsSummary", () => {
  assert.equal(reqsSummary({ skills: { magic: 50 }, tags: ["member"] }), "magic 50, [member]");
  assert.equal(reqsSummary({}), "no reqs");
});

test("syncQualEdges over the real step bank produces edges for every step with reqs/grants", () => {
  const { steps } = loadFixtures();
  const graph = createGraph();
  syncQualEdges(graph, steps);
  for (const s of steps) {
    assert.equal(graph.edgesFrom("step:req", s.id).length,   reqQuals(s.reqs).length,   `reqs of ${s.id}`);
    assert.equal(graph.edgesFrom("step:grant", s.id).length, grantQuals(s.grants).length, `grants of ${s.id}`);
  }
  // re-sync is idempotent (unlinkAll before link)
  syncQualEdges(graph, steps);
  const first = steps[0];
  assert.equal(graph.edgesFrom("step:req", first.id).length, reqQuals(first.reqs).length);
});
