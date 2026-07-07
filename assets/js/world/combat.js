// Combat + NPC-interaction systems. Pure, node-tested.
//
// SOURCED (OSRS Wiki, stamp 2026-07-07):
//   - melee max hit:  floor(0.5 + effectiveStr · (strBonus+64) / 640),
//     effective level = level + 8 (no style/prayer bonuses modelled yet)
//   - accuracy: attack roll A = effAtt·(attBonus+64), defence roll D =
//     effDef·(defBonus+64); hit chance = A > D ? 1 − (D+2)/(2(A+1)) : A/(2(D+1))
//   - XP: 4 × damage to the style skill, 1.33 × damage to Hitpoints
//   - unarmed attack speed 4 ticks; new accounts start at Hitpoints 10 (1,154 xp)
//   - pickpocketing Man/Woman: level 1, 8 Thieving xp, 3 coins; failure stuns
//     ~5 s and deals 1 damage
//   - fishing (small net): level 1, Raw shrimps, 10 Fishing xp
//   - altars restore prayer points to full (max = Prayer level)
//   - most searchable scenery yields nothing ("nothing of interest") — specific
//     search tables are server data and are NOT modelled
// RSPS-DERIVED (data only, cited per knob — approximations; server emulations
// vary from live):
//   - npc respawn default, pickpocket/net-fishing success low/high pairs, and
//     the documented stat_random level interpolation (see statRandomChance)
// APPROXIMATIONS (labelled, config-tunable — not published by Jagex):
//   - NPC attack/defence equipment bonuses aren't in our extraction → 0
//   - NPC aggression not modelled (wander is: assets/js/world/npc-ai.js)
//   - drop tables: sourced per-npc via drops.pack (osrsbox); unsourced npcs
//     drop nothing (never faked)

export const SIM_CONFIG = {
  // RSPS-derived (rsmod@fa13b3f NpcTypeBuilder.kt DEFAULT_RESPAWN_RATE=100;
  // corroborated by 2004scape@647886c modal npc respawnrate=100) — approximation
  npcRespawnTicks: 100,
  attackSpeedTicks: 4,     // unarmed weapon speed (sourced)
  hpRegenTicks: 100,       // 1 hp per minute (sourced)
};

// Jagex's documented low/high success interpolation: chance rises linearly
// with level from (low+1)/256 at 1 to (high+1)/256 at 99. Formula per the
// 2004scape engine STAT_RANDOM opcode (data/formula only; widely documented).
export function statRandomChance(level, low, high) {
  const value = Math.floor((low * (99 - level)) / 98)
    + Math.floor((high * (level - 1)) / 98) + 1;
  return Math.min(value, 256) / 256;
}

const eff = (level) => level + 8;

export function maxHit(strLevel, strBonus = 0) {
  return Math.floor(0.5 + (eff(strLevel) * (strBonus + 64)) / 640);
}

export function attackRoll(attLevel, attBonus = 0) {
  return eff(attLevel) * (attBonus + 64);
}

export function defenceRoll(defLevel, defBonus = 0) {
  return eff(defLevel) * (defBonus + 64);
}

export function hitChance(atk, def) {
  return atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1));
}

// Equipment bonus fields, in equipment.pack order (source: osrsbox-db
// items-complete.json equipment block · stamp 2026-07-07).
export const SLOT_BONUS_KEYS = [
  "attack_stab", "attack_slash", "attack_crush", "attack_magic", "attack_ranged",
  "defence_stab", "defence_slash", "defence_crush", "defence_magic", "defence_ranged",
  "melee_strength", "ranged_strength", "magic_damage", "prayer",
];

// One melee swing. attacker/defender: {attack, strength, defence} levels.
// opts: {attBonus, strBonus} — summed gear bonuses (default 0 = unarmed,
// keeping the pre-gear call sites working unchanged).
// → { hit: bool, damage: int }
export function swing(attacker, defender, rng = Math.random, opts = {}) {
  const { attBonus = 0, strBonus = 0 } = opts;
  const chance = hitChance(attackRoll(attacker.attack, attBonus), defenceRoll(defender.defence));
  if (rng() >= chance) return { hit: false, damage: 0 };
  return { hit: true, damage: 1 + Math.floor(rng() * maxHit(attacker.strength, strBonus)) };
}

// npcs.pack stats order verified in GAME_KB: [att, def, str, hp, ranged, magic]
export function npcCombatants(stats) {
  const [attack = 1, defence = 1, strength = 1, hitpoints = 1] = stats ?? [];
  return { attack, defence, strength, hitpoints };
}

// successLow/High: RSPS-derived (2004scape@647886c pickpocket.dbrow
// success_chance 180,240 for man/woman) — approximation. stunTicks 8 keeps the
// wiki ~5 s value (2004scape says 13; conflict recorded in GAME_GOTCHAS G-6).
export const PICKPOCKET = {
  "Man":   { level: 1, xp: 8, coins: 3, stunTicks: 8, stunDamage: 1, successLow: 180, successHigh: 240 },
  "Woman": { level: 1, xp: 8, coins: 3, stunTicks: 8, stunDamage: 1, successLow: 180, successHigh: 240 },
};

export const FISHING = {
  // fishing spots are NPCs; action → catch table (only sourced entries)
  // successLow/High: RSPS-derived (2004scape@647886c fishing_struct_shrimps
  // success_low 48 / success_high 256; its productexp 100 = 10 xp matches the
  // wiki value we already carry) — approximation
  "Net": { level: 1, xp: 10, item: "Raw shrimps", itemId: 317, tool: 303, toolName: "Small fishing net",
           successLow: 48, successHigh: 256 },
};

export const COINS_ID = 995;
