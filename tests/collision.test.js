import test from "node:test";
import assert from "node:assert/strict";
import {
  WALL_N, WALL_E, WALL_S, WALL_W, CORNER_NE, CORNER_SW, FULL,
  canStep, findPath,
} from "../assets/js/world/collision.js";

// tiny grid helper: map "x,y" -> flags; everything else open ground
const grid = (cells) => (x, y) => cells[`${x},${y}`] ?? 0;

test("open ground: all 8 steps allowed", () => {
  const get = grid({});
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])
    assert.ok(canStep(get, 5, 5, dx, dy), `step ${dx},${dy}`);
});

test("full block stops entry from every side", () => {
  const get = grid({ "5,5": FULL });
  assert.equal(canStep(get, 4, 5, 1, 0), false);
  assert.equal(canStep(get, 6, 5, -1, 0), false);
  assert.equal(canStep(get, 5, 4, 0, 1), false);
  assert.equal(canStep(get, 4, 4, 1, 1), false);
});

test("wall edge blocks both directions across it (mirrored flags)", () => {
  // wall on north edge of (5,5) — build mirrors WALL_S onto (5,6)
  const get = grid({ "5,5": WALL_N, "5,6": WALL_S });
  assert.equal(canStep(get, 5, 5, 0, 1), false, "cannot step north through wall");
  assert.equal(canStep(get, 5, 6, 0, -1), false, "cannot step south through wall");
  assert.ok(canStep(get, 5, 5, 1, 0), "east unaffected");
});

test("no diagonal corner cutting around a wall", () => {
  // wall on north edge of (5,5): NE diagonal from (5,5) must be blocked
  // because the L-route via north crosses the wall and the other L-route
  // re-enters through the same edge corner.
  const get = grid({ "5,5": WALL_N, "5,6": WALL_S });
  assert.equal(canStep(get, 5, 5, 1, 1), false);
  assert.equal(canStep(get, 6, 6, -1, -1), false, "reverse diagonal equally blocked");
});

test("diagonal blocked when either flanking tile is full", () => {
  const get = grid({ "6,5": FULL });
  assert.equal(canStep(get, 5, 5, 1, 1), false, "east flank full");
  assert.ok(canStep(get, 5, 5, -1, 1), "unaffected diagonal fine");
});

test("corner pillar flags block only the diagonal", () => {
  const get = grid({ "5,5": CORNER_NE, "6,6": CORNER_SW });
  assert.equal(canStep(get, 5, 5, 1, 1), false);
  assert.ok(canStep(get, 5, 5, 1, 0));
  assert.ok(canStep(get, 5, 5, 0, 1));
});

test("unloaded tiles (null) are impassable", () => {
  const get = (x, y) => (x > 10 ? null : 0);
  assert.equal(canStep(get, 10, 5, 1, 0), false);
  assert.ok(canStep(get, 9, 5, 1, 0));
});

test("findPath: straight line on open ground", () => {
  const path = findPath(grid({}), 0, 0, 5, 5);
  assert.equal(path.length, 5, "diagonal shortest path");
  assert.deepEqual(path[4], { x: 5, y: 5 });
});

test("findPath: routes around a wall segment", () => {
  // vertical wall of FULL tiles at x=3, y in [-2..2], gap nowhere near — must go around
  const cells = {};
  for (let y = -2; y <= 2; y++) cells[`3,${y}`] = FULL;
  const path = findPath(grid(cells), 0, 0, 6, 0);
  assert.ok(path.length > 6, "detour is longer than straight line");
  assert.deepEqual(path[path.length - 1], { x: 6, y: 0 });
  for (const p of path) assert.notEqual(grid(cells)(p.x, p.y) & FULL, FULL, "never enters wall");
});

test("findPath: unreachable target → nearest approach tile", () => {
  // target sealed inside a full ring
  const cells = {};
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      if (dx || dy) cells[`${10 + dx},${10 + dy}`] = FULL;
  const path = findPath(grid(cells), 0, 10, 10, 10);
  assert.ok(path.length > 0);
  const end = path[path.length - 1];
  assert.equal(Math.max(Math.abs(end.x - 10), Math.abs(end.y - 10)), 2, "stops adjacent to the ring");
});

test("findPath: never cuts corners en route", () => {
  const cells = { "1,1": FULL };
  const path = findPath(grid(cells), 0, 0, 2, 2);
  // must not step diagonally past (1,1)'s corner in a way canStep forbids
  let cur = { x: 0, y: 0 };
  for (const p of path) {
    assert.ok(canStep(grid(cells), cur.x, cur.y, p.x - cur.x, p.y - cur.y),
      `illegal step ${JSON.stringify(cur)} -> ${JSON.stringify(p)}`);
    cur = p;
  }
});

test("multi-goal BFS stops at the NEAR side of an object instead of circling", () => {
  // 3x3 full block at (10..12, 10..12); player approaches from the west.
  const cells = {};
  for (let x = 10; x <= 12; x++) for (let y = 10; y <= 12; y++) cells[`${x},${y}`] = FULL;
  const goals = [];
  for (let ox = -1; ox <= 3; ox++)
    for (let oy = -1; oy <= 3; oy++)
      if (ox === -1 || oy === -1 || ox === 3 || oy === 3)
        goals.push({ x: 10 + ox, y: 10 + oy });
  const path = findPath(grid(cells), 5, 11, 11, 11, { goals });
  const end = path[path.length - 1];
  assert.deepEqual(end, { x: 9, y: 11 }, "stops on the west ring tile");
  assert.equal(path.length, 4, "no detour around the block");
});

test("multi-goal BFS: door reachable only from the far side routes there", () => {
  // wall segment: FULL columns at x=3 except a 'door tile' gap at (3,0) whose
  // west edge is walled — goals are both sides of the door edge.
  const cells = { "3,0": WALL_W, "2,0": WALL_E };
  for (let y = -3; y <= 3; y++) if (y !== 0) cells[`3,${y}`] = FULL;
  const goals = [{ x: 3, y: 0 }, { x: 2, y: 0 }];
  const path = findPath(grid(cells), 0, 0, 3, 0, { goals });
  const end = path[path.length - 1];
  assert.deepEqual(end, { x: 2, y: 0 }, "stops on the near side of the door edge");
});
