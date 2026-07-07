// Integration tests over the REAL emitted collision data (Lumbridge, 12850+
// neighbours) — pins that movement rules + extracted flags behave like the
// game's geography: water blocks, walls detour, approach stops on the bank.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FULL, canStep, findPath } from "../assets/js/world/collision.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COL = join(ROOT, "assets", "data", "cache", "collision");

const grids = new Map();
function grid(rid) {
  if (!grids.has(rid)) {
    try {
      const buf = gunzipSync(readFileSync(join(COL, `${rid}.bin.gz`)));
      grids.set(rid, new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2));
    } catch {
      grids.set(rid, null);
    }
  }
  return grids.get(rid);
}
const flagsAt = (x, y) => {
  const g = grid(((x >> 6) << 8) | (y >> 6));
  return g ? g[(y & 63) * 64 + (x & 63)] : null;
};

test("Lumbridge spawn tile is walkable, river tiles are blocked", () => {
  assert.equal(flagsAt(3222, 3218) & FULL, 0, "spawn (3222,3218) must be open");
  // find the River Lum: scan east of the castle at spawn latitude for a FULL run
  let waterX = -1;
  for (let x = 3230; x < 3260; x++) {
    if ((flagsAt(x, 3222) & FULL) && (flagsAt(x + 1, 3222) & FULL)) { waterX = x; break; }
  }
  assert.ok(waterX > 0, "River Lum found east of the castle");
});

test("pathing into the river stops on the bank (approach), never crossing water", () => {
  let waterX = -1;
  for (let x = 3230; x < 3260; x++) {
    if ((flagsAt(x, 3222) & FULL) && (flagsAt(x + 1, 3222) & FULL)) { waterX = x; break; }
  }
  const path = findPath(flagsAt, 3222, 3218, waterX + 1, 3222);
  assert.ok(path.length > 0, "some approach path exists");
  for (const p of path) {
    assert.equal(flagsAt(p.x, p.y) & FULL, 0, `path enters blocked tile (${p.x},${p.y})`);
  }
  const end = path[path.length - 1];
  assert.notDeepEqual([end.x, end.y], [waterX + 1, 3222], "must not stand in the river");
});

test("every step of a cross-town path is legal per canStep", () => {
  // Lumbridge spawn → general store area, forced around castle geometry
  const path = findPath(flagsAt, 3222, 3218, 3212, 3246);
  assert.ok(path.length >= Math.max(10, 0), "path found");
  let cur = { x: 3222, y: 3218 };
  for (const p of path) {
    assert.ok(canStep(flagsAt, cur.x, cur.y, p.x - cur.x, p.y - cur.y),
      `illegal step (${cur.x},${cur.y}) -> (${p.x},${p.y})`);
    cur = p;
  }
});

test("castle walls actually block: interior unreachable in a tiny window", () => {
  // pick a wall-edged tile ring: walking straight through any wall edge fails
  let tested = 0;
  for (let x = 3200; x < 3230 && tested < 20; x++) {
    for (let y = 3200; y < 3230 && tested < 20; y++) {
      const f = flagsAt(x, y);
      if (!f || !(f & 15)) continue; // needs a wall edge
      if (f & 1) assert.equal(canStep(flagsAt, x, y, 0, 1), false, `N wall at (${x},${y})`);
      if (f & 2) assert.equal(canStep(flagsAt, x, y, 1, 0), false, `E wall at (${x},${y})`);
      if (f & 4) assert.equal(canStep(flagsAt, x, y, 0, -1), false, `S wall at (${x},${y})`);
      if (f & 8) assert.equal(canStep(flagsAt, x, y, -1, 0), false, `W wall at (${x},${y})`);
      tested++;
    }
  }
  assert.ok(tested >= 10, `found ${tested} walled tiles to test`);
});

test("collision data exists for the whole emitted region set", () => {
  const manifest = JSON.parse(readFileSync(join(COL, "manifest.json"), "utf8"));
  const rids = Object.keys(manifest.regions);
  assert.ok(rids.length > 2500, `expected >2500 regions, got ${rids.length}`);
  // spot-load a sample for integrity
  for (const rid of rids.filter((_, i) => i % 500 === 0)) {
    const g = grid(+rid);
    assert.ok(g && g.length === 4096, `region ${rid} grid intact`);
  }
});
