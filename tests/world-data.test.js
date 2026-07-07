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

// ── object locations + door passage (real Lumbridge data) ──────────────────
import { wallEdges } from "../assets/js/world/collision.js";

const LOCS = join(ROOT, "assets", "data", "cache", "locs");
const OBJECTS_PACK = join(ROOT, "assets", "data", "cache", "objects.pack");

function readObjectsPack() {
  const buf = readFileSync(OBJECTS_PACK);
  const n = buf.readUInt32LE(4);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    const rec = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    out.set(rec.id, rec);
  }
  return out;
}

test("Lumbridge loc feed: real named objects with cache actions", () => {
  const locs = JSON.parse(gunzipSync(readFileSync(join(LOCS, "12850.json.gz"))).toString());
  const defs = readObjectsPack();
  assert.ok(locs.length > 50, `expected >50 locs, got ${locs.length}`);
  const names = new Set(locs.map(([id]) => defs.get(id)?.name));
  for (const expected of ["Tree", "Door", "Large door"])
    assert.ok(names.has(expected), `${expected} placed in Lumbridge`);
  for (const [id] of locs)
    assert.ok((defs.get(id)?.actions ?? []).some(Boolean), `object ${id} has actions`);
});

test("doors: extractor wall flags match wallEdges(), clearing them opens passage", () => {
  const locs = JSON.parse(gunzipSync(readFileSync(join(LOCS, "12850.json.gz"))).toString());
  const defs = readObjectsPack();
  const doors = locs.filter(([id, type]) =>
    type <= 3 && (defs.get(id)?.actions ?? []).includes("Open"));
  assert.ok(doors.length >= 5, `expected >=5 doors/gates, got ${doors.length}`);

  const cleared = new Map();
  const openFlags = (x, y) => {
    const f = flagsAt(x, y);
    if (f == null) return null;
    return f & ~(cleared.get(`${x},${y}`) ?? 0);
  };

  let verified = 0;
  for (const [id, type, rot, lx, ly] of doors) {
    if (type === 1 || type === 3) continue; // corner pillars: no edge passage
    const x = 3200 + lx, y = 3200 + ly;
    const { own, neighbours } = wallEdges(type, rot);
    const f = flagsAt(x, y);
    assert.equal(f & own, own,
      `collision grid carries the door's wall bits at (${x},${y}) type ${type} rot ${rot}`);
    // pick the edge direction and confirm passage flips when cleared
    const n = neighbours[0];
    if (flagsAt(x + n.dx, y + n.dy) == null) continue;
    const before = canStep(openFlags, x, y, n.dx, n.dy);
    cleared.set(`${x},${y}`, own);
    cleared.set(`${x + n.dx},${y + n.dy}`, n.mask);
    const after = canStep(openFlags, x, y, n.dx, n.dy);
    cleared.clear();
    if (!before && after) verified++;
  }
  assert.ok(verified >= 3, `door passage flip verified on ${verified} doors`);
});
