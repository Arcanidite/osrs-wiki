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
// APPROXIMATIONS (labelled, config-tunable — not published by Jagex):
//   - NPC attack/defence equipment bonuses aren't in our extraction → 0
//   - NPC aggression/movement AI not modelled (fights happen in place)
//   - thieving/fishing success chances, NPC respawn times → SIM_CONFIG
//   - drop tables are server data → defeated NPCs drop nothing (never faked)

export const SIM_CONFIG = {
  npcRespawnTicks: 50,     // UNKNOWN placeholder (~30 s)
  thieveChanceBase: 0.7,   // UNKNOWN placeholder
  fishChanceBase: 0.4,     // UNKNOWN placeholder
  attackSpeedTicks: 4,     // unarmed weapon speed (sourced)
  hpRegenTicks: 100,       // 1 hp per minute (sourced)
};

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

// One melee swing. attacker/defender: {attack, strength, defence} levels.
// → { hit: bool, damage: int }
export function swing(attacker, defender, rng = Math.random) {
  const chance = hitChance(attackRoll(attacker.attack), defenceRoll(defender.defence));
  if (rng() >= chance) return { hit: false, damage: 0 };
  return { hit: true, damage: 1 + Math.floor(rng() * maxHit(attacker.strength)) };
}

// npcs.pack stats order verified in GAME_KB: [att, def, str, hp, ranged, magic]
export function npcCombatants(stats) {
  const [attack = 1, defence = 1, strength = 1, hitpoints = 1] = stats ?? [];
  return { attack, defence, strength, hitpoints };
}

export const PICKPOCKET = {
  "Man":   { level: 1, xp: 8, coins: 3, stunTicks: 8, stunDamage: 1 },
  "Woman": { level: 1, xp: 8, coins: 3, stunTicks: 8, stunDamage: 1 },
};

export const FISHING = {
  // fishing spots are NPCs; action → catch table (only sourced entries)
  "Net": { level: 1, xp: 10, item: "Raw shrimps", itemId: 317, tool: 303, toolName: "Small fishing net" },
};

export const COINS_ID = 995;
