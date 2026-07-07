// OSRS experience curve — the publicly documented formula (OSRS Wiki,
// "Experience"): cumulative XP for level L sums floor(ℓ + 300·2^(ℓ/7)) over
// ℓ = 1..L-1, divided by 4 (floored). Pure; node-tested against the
// well-known anchor values (83 xp → 2, 13,034,431 xp → 99).

const MAX_LEVEL = 99;

const TABLE = (() => {
  const xp = [0, 0]; // index = level; levels start at 1 (0 unused)
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    xp[lvl + 1] = Math.floor(points / 4);
  }
  return xp;
})();

export function xpForLevel(level) {
  return TABLE[Math.max(1, Math.min(MAX_LEVEL, level))];
}

export function levelForXp(xp) {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= TABLE[lvl + 1]) lvl++;
  return lvl;
}
