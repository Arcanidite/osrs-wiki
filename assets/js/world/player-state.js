// Player state — skills XP, 28-slot inventory, bank. Pure and node-tested;
// the client persists it via the injected storage (localStorage in browser).
import { levelForXp } from "./xp.js";

export const INV_SIZE = 28;

export function createPlayerState(saved) {
  const s = {
    xp: {},                 // skill -> xp
    inv: [],                // [{id, name, qty, stackable}] max 28 slots
    bank: [],               // [{id, name, qty}] (bank always stacks)
    ...(saved ?? {}),
  };

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

    toJSON() { return { xp: s.xp, inv: s.inv, bank: s.bank }; },
  };
  return api;
}
