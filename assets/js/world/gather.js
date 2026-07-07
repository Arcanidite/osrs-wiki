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
