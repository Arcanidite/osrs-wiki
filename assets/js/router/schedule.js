// Anti-monotony time model — mirror of tools/guide-export/schedule.py for the
// web view. Pure: xp curve + rate bands -> hours-per-step + abysmal detection.
// Streamline a grind while fast; a step whose per-level time is abysmal is a
// round-robin candidate (see progression-philosophy).
export const ABYSMAL_HOURS_PER_LEVEL = 1.0;
const DEFAULT_RATE = 30000;
const MAX_LEVEL = 99;

let RATES = {};
export async function loadRates(base = "/assets/data/tools") {
  RATES = await fetch(`${base}/rates.json`).then((r) => r.json()).catch(() => ({}));
}

const XP = buildXpTable();
function buildXpTable() {
  const table = [0, 0];
  let total = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    total += Math.floor(level + 300 * 2 ** (level / 7));
    table.push(Math.floor(total / 4));
  }
  return table;
}

export const xpAt = (level) => XP[Math.max(1, Math.min(MAX_LEVEL, level))];

export function rateAt(skill, level) {
  for (const band of RATES[skill] ?? []) {
    if (level < band.upto) return band.xp_hr;
  }
  return DEFAULT_RATE;
}

const grantLevel = (step, skill) => (step.grants ?? {})[skill] ?? 1;

export function hoursForStep(step) {
  let hours = 0;
  for (const [skill, amount] of Object.entries(step.xp ?? {})) {
    hours += amount / rateAt(skill, grantLevel(step, skill));
  }
  return hours;
}

export function isAbysmal(step) {
  return Object.entries(step.grants ?? {}).some(([skill, level]) =>
    (xpAt(level) - xpAt(level - 1)) / rateAt(skill, level) >= ABYSMAL_HOURS_PER_LEVEL);
}
