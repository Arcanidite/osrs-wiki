// Gathering (woodcutting) data + rules.
//
// SOURCED (OSRS Wiki, stamp 2026-07-07): tree → log item, Woodcutting level
// requirement, XP per log; axe tiers and their Woodcutting requirements.
// Item ids are cross-checked against the real items.pack by a node test —
// if an id stopped matching its name, the test fails rather than lie.
//
// PLACEHOLDERS (explicitly not sourced — Jagex has never published exact
// rates; every knob lives in GATHER_CONFIG and is labelled): per-roll success
// chance model, roll cadence, depletion odds, respawn time. Tuning these does
// not touch the sourced facts above.

export const TREES = {
  // objectName: { item, itemId, level, xp }
  "Tree":          { item: "Logs",          itemId: 1511, level: 1,  xp: 25 },
  "Dead tree":     { item: "Logs",          itemId: 1511, level: 1,  xp: 25 },
  "Evergreen tree":{ item: "Logs",          itemId: 1511, level: 1,  xp: 25 },
  "Dying tree":    { item: "Logs",          itemId: 1511, level: 1,  xp: 25 },
  "Oak tree":      { item: "Oak logs",      itemId: 1521, level: 15, xp: 37.5 },
  "Oak":           { item: "Oak logs",      itemId: 1521, level: 15, xp: 37.5 },
  "Willow tree":   { item: "Willow logs",   itemId: 1519, level: 30, xp: 67.5 },
  "Willow":        { item: "Willow logs",   itemId: 1519, level: 30, xp: 67.5 },
  "Teak tree":     { item: "Teak logs",     itemId: 6333, level: 35, xp: 85 },
  "Maple tree":    { item: "Maple logs",    itemId: 1517, level: 45, xp: 100 },
  "Mahogany tree": { item: "Mahogany logs", itemId: 6332, level: 50, xp: 125 },
  "Yew tree":      { item: "Yew logs",      itemId: 1515, level: 60, xp: 175 },
  "Yew":           { item: "Yew logs",      itemId: 1515, level: 60, xp: 175 },
  "Magic tree":    { item: "Magic logs",    itemId: 1513, level: 75, xp: 250 },
};

// best first; level = Woodcutting level required to use
export const AXES = [
  { id: 6739, name: "Dragon axe",  level: 61 },
  { id: 1359, name: "Rune axe",    level: 41 },
  { id: 1357, name: "Adamant axe", level: 31 },
  { id: 1355, name: "Mithril axe", level: 21 },
  { id: 1361, name: "Black axe",   level: 11 },
  { id: 1353, name: "Steel axe",   level: 6 },
  { id: 1349, name: "Iron axe",    level: 1 },
  { id: 1351, name: "Bronze axe",  level: 1 },
];

// ── PLACEHOLDER knobs — estimates, not game data. See tools/kb/GAME_KB.md. ──
export const GATHER_CONFIG = {
  rollTicks: 3,          // attempt cadence in game ticks (UNKNOWN — placeholder)
  chanceBase: 0.25,      // per-roll success floor at the required level (UNKNOWN)
  chanceScale: 0.6,      // extra chance spread across levels above req (UNKNOWN)
  depleteChance: 0.125,  // odds the tree falls per log (UNKNOWN; 1/8 scaffold)
  respawnTicks: 50,      // 30 s at 600 ms ticks (UNKNOWN — placeholder)
};

export function bestAxe(hasItem, wcLevel) {
  for (const axe of AXES) {
    if (wcLevel >= axe.level && hasItem(axe.id)) return axe;
  }
  return null;
}

// One gathering roll. rng: () => [0,1). Returns { ok } or { error }.
export function chopRoll(treeName, wcLevel, hasItem, rng = Math.random) {
  const tree = TREES[treeName];
  if (!tree) return { error: "not-a-tree" };
  if (!bestAxe(hasItem, wcLevel)) return { error: "no-axe" };
  if (wcLevel < tree.level)
    return { error: "level", need: tree.level };
  const over = Math.min(1, (wcLevel - tree.level) / 98);
  const chance = Math.min(0.95, GATHER_CONFIG.chanceBase + GATHER_CONFIG.chanceScale * over);
  return { ok: rng() < chance, tree };
}

// ── Mining ───────────────────────────────────────────────────────────────────
// SOURCED (OSRS Wiki rock pages, stamp 2026-07-07): rock object ids (validated
// against extracted placements at known mine sites, e.g. SE Varrock), Mining
// level reqs, XP per ore, respawn times. Rocks always deplete after one ore
// (standard rocks — documented behaviour). Ore/pickaxe item ids are
// cross-checked against items.pack by tests. Per-roll success chance remains
// a labelled placeholder (same model/knobs as GATHER_CONFIG).

export const ROCKS = (() => {
  const ores = [
    { ids: [11161, 10943, 10079], item: "Copper ore", itemId: 436, level: 1,  xp: 17.5, respawnTicks: 4 },
    { ids: [11361, 11360],        item: "Tin ore",    itemId: 438, level: 1,  xp: 17.5, respawnTicks: 4 },
    { ids: [11365, 11364, 42833, 36203], item: "Iron ore", itemId: 440, level: 15, xp: 35, respawnTicks: 9 },
    { ids: [11367, 11366, 36204], item: "Coal",       itemId: 453, level: 30, xp: 50, respawnTicks: 50 },
  ];
  const byId = {};
  for (const o of ores) for (const id of o.ids) byId[id] = o;
  return byId;
})();

export const PICKAXES = [
  { id: 11920, name: "Dragon pickaxe",  level: 61 },
  { id: 1275,  name: "Rune pickaxe",    level: 41 },
  { id: 1271,  name: "Adamant pickaxe", level: 31 },
  { id: 1273,  name: "Mithril pickaxe", level: 21 },
  { id: 1269,  name: "Steel pickaxe",   level: 6 },
  { id: 1267,  name: "Iron pickaxe",    level: 1 },
  { id: 1265,  name: "Bronze pickaxe",  level: 1 },
];

export function bestPickaxe(hasItem, miningLevel) {
  for (const p of PICKAXES) {
    if (miningLevel >= p.level && hasItem(p.id)) return p;
  }
  return null;
}

export function mineRoll(rockObjectId, miningLevel, hasItem, rng = Math.random) {
  const rock = ROCKS[rockObjectId];
  if (!rock) return { error: "not-a-rock" };
  if (!bestPickaxe(hasItem, miningLevel)) return { error: "no-pickaxe" };
  if (miningLevel < rock.level) return { error: "level", need: rock.level };
  const over = Math.min(1, (miningLevel - rock.level) / 98);
  const chance = Math.min(0.95, GATHER_CONFIG.chanceBase + GATHER_CONFIG.chanceScale * over);
  return { ok: rng() < chance, rock };
}
