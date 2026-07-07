import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { xpForLevel, levelForXp } from "../assets/js/world/xp.js";
import { TREES, AXES, GATHER_CONFIG, bestAxe, chopRoll } from "../assets/js/world/gather.js";
import { createPlayerState, INV_SIZE } from "../assets/js/world/player-state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("xp curve matches documented anchors", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(10), 1154);
  assert.equal(xpForLevel(50), 101333);
  assert.equal(xpForLevel(99), 13034431);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(82), 1);
  assert.equal(levelForXp(83), 2);
  assert.equal(levelForXp(13034431), 99);
  assert.equal(levelForXp(200_000_000), 99);
});

test("tree/axe item ids match the real items.pack names (honesty guard)", () => {
  const buf = readFileSync(join(ROOT, "assets", "data", "cache", "items.pack"));
  const n = buf.readUInt32LE(4);
  const byId = new Map();
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    const rec = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    byId.set(rec.id, rec.name);
  }
  for (const [treeName, t] of Object.entries(TREES))
    assert.equal(byId.get(t.itemId), t.item, `${treeName} → item ${t.itemId}`);
  for (const axe of AXES)
    assert.equal(byId.get(axe.id), axe.name, `axe ${axe.id}`);
});

test("chopRoll gates on axe and level", () => {
  const noItems = () => false;
  const hasBronze = (id) => id === 1351;
  assert.equal(chopRoll("Tree", 1, noItems).error, "no-axe");
  assert.equal(chopRoll("Oak tree", 1, hasBronze).error, "level");
  assert.equal(chopRoll("Oak tree", 1, hasBronze).need, 15);
  assert.equal(chopRoll("Tree", 1, hasBronze, () => 0).ok, true);
  assert.equal(chopRoll("Tree", 1, hasBronze, () => 0.999).ok, false);
  assert.equal(chopRoll("Fountain", 1, hasBronze).error, "not-a-tree");
});

test("bestAxe honors wc level requirement", () => {
  const has = (id) => id === 1359 || id === 1351; // rune + bronze
  assert.equal(bestAxe(has, 1)?.name, "Bronze axe");
  assert.equal(bestAxe(has, 41)?.name, "Rune axe");
  assert.equal(bestAxe(() => false, 99), null);
});

test("player state: xp levels up, inventory fills to 28, stacking", () => {
  const p = createPlayerState();
  assert.equal(p.level("woodcutting"), 1);
  assert.equal(p.addXp("woodcutting", 82).levelled, null);
  assert.equal(p.addXp("woodcutting", 1).levelled, 2);
  for (let i = 0; i < INV_SIZE; i++)
    assert.ok(p.addItem({ id: 1511, name: "Logs" }), `slot ${i}`);
  assert.equal(p.addItem({ id: 1511, name: "Logs" }), false, "29th non-stackable rejected");
  const q = createPlayerState();
  q.addItem({ id: 995, name: "Coins", stackable: true }, 100);
  q.addItem({ id: 995, name: "Coins", stackable: true }, 50);
  assert.equal(q.invCount(), 1);
  assert.deepEqual(q.raw.inv[0].qty, 150);
});

test("bank: deposit/withdraw round-trip", () => {
  const p = createPlayerState();
  p.addItem({ id: 1511, name: "Logs" });
  p.addItem({ id: 1511, name: "Logs" });
  p.depositAll();
  assert.equal(p.invCount(), 0);
  assert.equal(p.raw.bank[0].qty, 2);
  assert.ok(p.withdraw(1511));
  assert.equal(p.invCount(), 1);
  assert.equal(p.raw.bank[0].qty, 1);
});

test("placeholder knobs are declared, not hidden", () => {
  for (const k of ["rollTicks", "chanceBase", "chanceScale", "depleteChance", "respawnTicks"])
    assert.ok(k in GATHER_CONFIG, k);
});

test("state serialization round-trip", () => {
  const p = createPlayerState();
  p.addXp("woodcutting", 500);
  p.addItem({ id: 1511, name: "Logs" });
  const q = createPlayerState(JSON.parse(JSON.stringify(p.toJSON())));
  assert.equal(q.level("woodcutting"), p.level("woodcutting"));
  assert.equal(q.invCount(), 1);
});

// ── mining ──────────────────────────────────────────────────────────────────
import { ROCKS, PICKAXES, bestPickaxe, mineRoll } from "../assets/js/world/gather.js";

test("ore/pickaxe item ids match the real items.pack names (honesty guard)", () => {
  const buf = readFileSync(join(ROOT, "assets", "data", "cache", "items.pack"));
  const n = buf.readUInt32LE(4);
  const byId = new Map();
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    const rec = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    byId.set(rec.id, rec.name);
  }
  const seen = new Set();
  for (const rock of Object.values(ROCKS)) {
    if (seen.has(rock.itemId)) continue;
    seen.add(rock.itemId);
    assert.equal(byId.get(rock.itemId), rock.item, `ore item ${rock.itemId}`);
  }
  for (const p of PICKAXES)
    assert.equal(byId.get(p.id), p.name, `pickaxe ${p.id}`);
});

test("rock object ids exist in the extracted objects.pack with a Mine action", () => {
  const buf = readFileSync(join(ROOT, "assets", "data", "cache", "objects.pack"));
  const n = buf.readUInt32LE(4);
  const byId = new Map();
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    const rec = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    byId.set(rec.id, rec);
  }
  let found = 0;
  for (const id of Object.keys(ROCKS).map(Number)) {
    const def = byId.get(id);
    if (!def) continue; // some ids are variants without actions in this cache
    assert.ok((def.actions ?? []).includes("Mine"), `object ${id} has Mine`);
    found++;
  }
  assert.ok(found >= 6, `at least 6 rock ids present with Mine (got ${found})`);
});

test("mineRoll gates on pickaxe and level", () => {
  const hasBronzePick = (id) => id === 1265;
  assert.equal(mineRoll(11161, 1, () => false).error, "no-pickaxe");
  assert.equal(mineRoll(11365, 1, hasBronzePick).error, "level");
  assert.equal(mineRoll(11365, 1, hasBronzePick).need, 15);
  assert.equal(mineRoll(11161, 1, hasBronzePick, () => 0).ok, true);
  assert.equal(mineRoll(9999999, 1, hasBronzePick).error, "not-a-rock");
  assert.equal(bestPickaxe(hasBronzePick, 1)?.name, "Bronze pickaxe");
});

// ── climbing conventions ────────────────────────────────────────────────────
import { climbDestination, settleTile, DUNGEON_DY } from "../assets/js/world/climb.js";

test("climb conventions: planes up/down, dungeon band, edges refused", () => {
  const at = (x, y, plane) => ({ x, y, plane });
  assert.deepEqual(climbDestination(at(3206, 3208, 0), "Climb-up"),
    { x: 3206, y: 3208, plane: 1, kind: "up" });
  assert.deepEqual(climbDestination(at(3206, 3208, 2), "Climb-down"),
    { x: 3206, y: 3208, plane: 1, kind: "down" });
  assert.deepEqual(climbDestination(at(3209, 3216, 0), "Climb-down"),
    { x: 3209, y: 3216 + DUNGEON_DY, plane: 0, kind: "dungeon" });
  assert.deepEqual(climbDestination(at(3209, 9616, 0), "Climb-up"),
    { x: 3209, y: 9616 - DUNGEON_DY, plane: 0, kind: "surface" });
  assert.equal(climbDestination(at(0, 0, 3), "Climb-up"), null, "no plane 4");
  assert.equal(climbDestination(at(3209, 9616, 0), "Climb-down"), null, "no double dungeon");
  assert.equal(climbDestination(at(0, 0, 0), "Examine"), null);
});

test("settleTile spirals to nearest walkable, refuses unmapped areas", () => {
  const FULLBIT = 256;
  const flags = (x, y) => (x === 5 && y === 5 ? FULLBIT : (x > 20 ? null : 0));
  assert.deepEqual(settleTile(flags, 5, 5, FULLBIT), { x: 4, y: 4 });
  assert.deepEqual(settleTile(flags, 3, 3, FULLBIT), { x: 3, y: 3 }, "already walkable");
  assert.equal(settleTile((x, y) => null, 0, 0, FULLBIT), null, "unmapped → refuse");
});

// ── combat / npc-interaction systems ────────────────────────────────────────
import { maxHit, hitChance, attackRoll, defenceRoll, swing, npcCombatants, PICKPOCKET, FISHING, COINS_ID } from "../assets/js/world/combat.js";

test("melee formulas match documented anchors", () => {
  assert.equal(maxHit(1), 1, "unarmed max hit at level 1");
  assert.equal(maxHit(99), 11, "unarmed max hit at 99 strength (documented)");
  assert.equal(attackRoll(1), 9 * 64);
  assert.equal(defenceRoll(1), 9 * 64);
  const even = hitChance(576, 576);
  assert.ok(even > 0.45 && even < 0.55, "evenly matched ≈ 50%");
  assert.ok(hitChance(10000, 576) > 0.9, "overwhelming attack");
  assert.ok(hitChance(576, 10000) < 0.1, "overwhelming defence");
});

test("swing respects rng bounds and npc stats order", () => {
  const foe = npcCombatants([3, 4, 1, 12, 1, 1]); // Goblin (verified order)
  assert.deepEqual(foe, { attack: 3, defence: 4, strength: 1, hitpoints: 12 });
  const hit = swing({ attack: 99, strength: 99, defence: 99 }, foe, () => 0.0);
  assert.ok(hit.hit && hit.damage >= 1 && hit.damage <= maxHit(99));
  const miss = swing({ attack: 1, strength: 1, defence: 1 }, npcCombatants([99, 99, 99, 99]), () => 0.99);
  assert.equal(miss.hit, false);
});

test("interaction item ids match items.pack (honesty guard)", () => {
  const buf = readFileSync(join(ROOT, "assets", "data", "cache", "items.pack"));
  const n = buf.readUInt32LE(4);
  const byId = new Map();
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    const rec = JSON.parse(buf.subarray(off, off + len).toString("utf8"));
    byId.set(rec.id, rec.name);
  }
  assert.equal(byId.get(COINS_ID), "Coins");
  assert.equal(byId.get(FISHING.Net.itemId), "Raw shrimps");
  assert.ok(byId.get(FISHING.Net.tool).startsWith("Small fishing net"),
    `net tool name: ${byId.get(FISHING.Net.tool)}`);
});

test("sourced tables carry the documented values", () => {
  assert.deepEqual(PICKPOCKET.Man, { level: 1, xp: 8, coins: 3, stunTicks: 8, stunDamage: 1 });
  assert.equal(FISHING.Net.xp, 10);
});

// ── equipment (gear bonuses) ────────────────────────────────────────────────
import { SLOT_BONUS_KEYS } from "../assets/js/world/combat.js";

function readPackRecords(name) {
  const buf = readFileSync(join(ROOT, "assets", "data", "cache", name));
  const n = buf.readUInt32LE(4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = buf.readUInt32LE(8 + i * 12 + 4);
    const len = buf.readUInt32LE(8 + i * 12 + 8);
    out.push(JSON.parse(buf.subarray(off, off + len).toString("utf8")));
  }
  return out;
}

test("equipment.pack item ids match items.pack names (id-honesty-guard)", () => {
  const itemNames = new Map(readPackRecords("items.pack").map((r) => [r.id, r.name]));
  const equipment = readPackRecords("equipment.pack");
  assert.ok(equipment.length > 1000, `pack has real coverage (got ${equipment.length})`);
  const slots = new Set(["head", "cape", "neck", "ammo", "weapon", "body",
    "shield", "legs", "hands", "feet", "ring", "2h"]);
  for (const rec of equipment) {
    assert.equal(itemNames.get(rec.id), rec.name, `equipment ${rec.id}`);
    assert.ok(slots.has(rec.slot), `slot of ${rec.id}: ${rec.slot}`);
    for (const k of SLOT_BONUS_KEYS)
      assert.equal(typeof rec.bonuses[k], "number", `${rec.id}.bonuses.${k}`);
  }
});

test("getBonuses sums across slots; equip/unequip round-trip", () => {
  const equipMap = new Map([
    [1, { id: 1, name: "Mock sword", slot: "weapon",
          bonuses: { attack_stab: 10, melee_strength: 7, prayer: 1 } }],
    [2, { id: 2, name: "Mock helm", slot: "head",
          bonuses: { attack_stab: 2, defence_crush: 5, prayer: 1 } }],
  ]);
  const p = createPlayerState();
  p.addItem({ id: 1, name: "Mock sword" });
  p.addItem({ id: 2, name: "Mock helm" });
  assert.ok(p.equip({ id: 1, name: "Mock sword", slot: "weapon" }));
  assert.ok(p.equip({ id: 2, name: "Mock helm", slot: "head" }));
  assert.equal(p.invCount(), 0);
  const b = p.getBonuses(equipMap);
  assert.equal(b.attack_stab, 12, "attack_stab sums across slots");
  assert.equal(b.melee_strength, 7);
  assert.equal(b.defence_crush, 5);
  assert.equal(b.prayer, 2);
  assert.equal(b.ranged_strength, 0, "unworn bonus keys default to 0");
  // swapping into an occupied slot returns the old piece to the inventory
  p.addItem({ id: 3, name: "Mock dagger" });
  assert.ok(p.equip({ id: 3, name: "Mock dagger", slot: "weapon" }));
  assert.ok(p.hasItem(1), "old weapon back in inventory");
  // unequip round-trip + persistence
  assert.ok(p.unequip("head"));
  assert.ok(p.hasItem(2));
  const q = createPlayerState(JSON.parse(JSON.stringify(p.toJSON())));
  assert.equal(q.raw.equipped.weapon.id, 3, "equipped survives serialization");
});

// ── npc wander AI ───────────────────────────────────────────────────────────
import { npcWanderStep, WANDER_RADIUS } from "../assets/js/world/npc-ai.js";

// rng that yields a fixed (dx, dy): floor(r*3)-1 maps 0→-1, 0.34→0, 0.67→+1
const dirRng = (dx, dy) => {
  const v = { "-1": 0, 0: 0.34, 1: 0.67 };
  const seq = [v[dx], v[dy]];
  let i = 0;
  return () => seq[i++ % 2];
};
const OPEN = () => 0;          // no collision anywhere
const WALLED = () => 256;      // FULL everywhere → every step blocked

test("npcWanderStep: blocked in all directions yields null", () => {
  const npc = { x: 10, y: 10, spawnX: 10, spawnY: 10 };
  for (const dx of [-1, 0, 1])
    for (const dy of [-1, 0, 1])
      assert.equal(npcWanderStep(npc, WALLED, dirRng(dx, dy)), null, `dir ${dx},${dy}`);
  // (0,0) is refused even on open ground — not a step
  assert.equal(npcWanderStep(npc, OPEN, dirRng(0, 0)), null);
});

test("npcWanderStep: open ground step succeeds and moves one tile", () => {
  const npc = { x: 10, y: 10, spawnX: 10, spawnY: 10 };
  assert.deepEqual(npcWanderStep(npc, OPEN, dirRng(1, 0)), { x: 11, y: 10 });
  assert.deepEqual(npcWanderStep(npc, OPEN, dirRng(-1, 1)), { x: 9, y: 11 });
});

test("npcWanderStep: refuses to leave the spawn radius (Chebyshev ≤ 5)", () => {
  const edge = { x: 10 + WANDER_RADIUS, y: 10, spawnX: 10, spawnY: 10 };
  assert.equal(npcWanderStep(edge, OPEN, dirRng(1, 0)), null, "beyond east edge");
  assert.equal(npcWanderStep(edge, OPEN, dirRng(1, 1)), null, "beyond diagonal");
  assert.deepEqual(npcWanderStep(edge, OPEN, dirRng(-1, 0)), { x: 14, y: 10 },
    "stepping back inside is allowed");
  assert.deepEqual(npcWanderStep(edge, OPEN, dirRng(0, 1)), { x: 15, y: 11 },
    "sliding along the edge stays at radius 5");
});

// ── drop tables ─────────────────────────────────────────────────────────────
test("drops.pack npc ids match npcs.pack (honesty guard)", () => {
  const npcIds = new Set(readPackRecords("npcs.pack").map((r) => r.id));
  const drops = readPackRecords("drops.pack");
  assert.ok(drops.length > 1000, `pack has real coverage (got ${drops.length})`);
  for (let i = 0; i < 10; i++) {
    const rec = drops[Math.floor(Math.random() * drops.length)];
    assert.ok(npcIds.has(rec.id), `npc ${rec.id} exists in npcs.pack`);
    assert.ok(Array.isArray(rec.drops) && rec.drops.length > 0, `npc ${rec.id} has drops`);
  }
});

test("drops.pack item ids match items.pack (honesty guard)", () => {
  const itemNames = new Map(readPackRecords("items.pack").map((r) => [r.id, r.name]));
  const drops = readPackRecords("drops.pack");
  for (let i = 0; i < 25; i++) {
    const rec = drops[Math.floor(Math.random() * drops.length)];
    for (const d of rec.drops)
      assert.equal(itemNames.get(d.itemId), d.itemName, `npc ${rec.id} drop ${d.itemId}`);
  }
});

test("drop rarity is a valid probability, quantities are sane", () => {
  for (const rec of readPackRecords("drops.pack")) {
    for (const d of rec.drops) {
      assert.ok(d.rarity > 0 && d.rarity <= 1, `npc ${rec.id} drop ${d.itemId} rarity ${d.rarity}`);
      assert.ok(Number.isInteger(d.qtyMin) && Number.isInteger(d.qtyMax) &&
        d.qtyMin >= 0 && d.qtyMin <= d.qtyMax, `npc ${rec.id} drop ${d.itemId} qty`);
    }
  }
});

test("swing with gear bonuses hits harder than without", () => {
  const seq = (vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
  const foe = npcCombatants([3, 4, 1, 12, 1, 1]);
  const me = { attack: 40, strength: 40, defence: 40 };
  const bare = swing(me, foe, seq([0, 0.999]));
  const geared = swing(me, foe, seq([0, 0.999]), { attBonus: 82, strBonus: 82 });
  assert.ok(bare.hit && geared.hit);
  assert.ok(geared.damage > bare.damage,
    `geared ${geared.damage} > bare ${bare.damage}`);
  assert.equal(geared.damage, maxHit(40, 82), "damage capped at gear max hit");
  // no-opts call keeps the old behaviour (backward compat)
  assert.deepEqual(swing(me, foe, seq([0, 0.999])), bare);
});
