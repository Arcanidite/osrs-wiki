// Player state — skills XP, 28-slot inventory, bank. Pure and node-tested;
// the client persists it via the injected storage (localStorage in browser).
import { levelForXp } from "./xp.js";
import { SLOT_BONUS_KEYS } from "./combat.js";

export const INV_SIZE = 28;

export function createPlayerState(saved) {
  const s = {
    xp: {},                 // skill -> xp
    inv: [],                // [{id, name, qty, stackable}] max 28 slots
    bank: [],               // [{id, name, qty}] (bank always stacks)
    equipped: {},           // slot -> {id, name} (slots per equipment.pack)
    ...(saved ?? {}),
  };
  if (!s.equipped) s.equipped = {}; // older saves predate gear

  const api = {
    raw: s,

    level(skill) { return levelForXp(s.xp[skill] ?? 0); },
    xp(skill) { return s.xp[skill] ?? 0; },

    // → { levelled: newLevel | null }
    addXp(skill, amount) {
      const before = api.level(skill);
      s.xp[skill] = (s.xp[skill] ?? 0) + amount;
      const after = api.level(skill);
      return { levelled: after > before ? after : null };
    },

    hasItem(id) {
      return s.inv.some((it) => it.id === id);
    },
    invCount() {
      return s.inv.length;
    },
    // → true if it fit
    addItem({ id, name, stackable = false }, qty = 1) {
      if (stackable) {
        const slot = s.inv.find((it) => it.id === id);
        if (slot) { slot.qty += qty; return true; }
      }
      if (s.inv.length >= INV_SIZE) return false;
      s.inv.push({ id, name, qty, stackable });
      return true;
    },
    removeItem(id, qty = 1) {
      const i = s.inv.findIndex((it) => it.id === id);
      if (i === -1) return false;
      const slot = s.inv[i];
      if (slot.stackable && slot.qty > qty) { slot.qty -= qty; return true; }
      s.inv.splice(i, 1);
      return true;
    },

    // Move an inventory item into its gear slot; anything already worn there
    // returns to the inventory (the vacated slot guarantees it fits).
    // item: {id, name, slot} — slot from equipment.pack. → true if equipped
    equip({ id, name, slot }) {
      if (!slot) return false;
      const i = s.inv.findIndex((it) => it.id === id);
      if (i === -1) return false;
      s.inv.splice(i, 1);
      const prev = s.equipped[slot];
      s.equipped[slot] = { id, name };
      if (prev) s.inv.push({ id: prev.id, name: prev.name, qty: 1, stackable: false });
      return true;
    },
    // → true if it moved back to the inventory (false: nothing worn / inv full)
    unequip(slot) {
      const worn = s.equipped[slot];
      if (!worn) return false;
      if (!api.addItem({ id: worn.id, name: worn.name })) return false;
      delete s.equipped[slot];
      return true;
    },
    // Sum every bonus field across worn gear. equipmentMap: Map<id, record>
    // from equipment.pack. → {attack_stab, ..., prayer} (all keys, 0 default)
    getBonuses(equipmentMap) {
      const total = {};
      for (const k of SLOT_BONUS_KEYS) total[k] = 0;
      for (const worn of Object.values(s.equipped)) {
        const rec = equipmentMap?.get(worn.id);
        if (!rec?.bonuses) continue;
        for (const k of SLOT_BONUS_KEYS) total[k] += rec.bonuses[k] ?? 0;
      }
      return total;
    },

    deposit(id) {
      const i = s.inv.findIndex((it) => it.id === id);
      if (i === -1) return false;
      const slot = s.inv[i];
      const b = s.bank.find((it) => it.id === id);
      if (b) b.qty += slot.qty;
      else s.bank.push({ id: slot.id, name: slot.name, qty: slot.qty });
      s.inv.splice(i, 1);
      return true;
    },
    depositAll() {
      while (s.inv.length) api.deposit(s.inv[0].id);
    },
    withdraw(id, { stackable = false } = {}) {
      const b = s.bank.find((it) => it.id === id);
      if (!b) return false;
      if (!api.addItem({ id: b.id, name: b.name, stackable }, 1)) return false;
      b.qty -= 1;
      if (b.qty <= 0) s.bank.splice(s.bank.indexOf(b), 1);
      return true;
    },

    toJSON() { return { xp: s.xp, inv: s.inv, bank: s.bank, equipped: s.equipped, hp: s.hp, prayer: s.prayer }; },
  };
  return api;
}
