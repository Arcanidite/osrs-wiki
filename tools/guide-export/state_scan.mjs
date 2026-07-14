#!/usr/bin/env node
// state_scan.mjs — STATE-EMITTER sibling to route_feasibility.mjs (STATE_CONSOLIDATION.md
// §2/§5). Reuses that file's bank-join + skill/quest/unlock engine (imported, not
// duplicated — one source of truth) and ADDS the inventory/equipped/bank-stock model so
// each step can be annotated with the state it LEAVES the player in (`state_after`).
//
// STATE MODEL (additive on top of route_feasibility's {skills,xp,quests,items,unlocks}):
//   inv   — Map<item, {qty:number, approx:boolean}>  the 28-slot loadout SINCE THE LAST
//           BANK TRIP ONLY (STATE_CONSOLIDATION §2b) — never the route's whole history.
//   worn  — Set<item>                                equipped gear.
//   bank  — Map<item, {qty:number, approx:boolean}>  staged/produced stock, off the 28.
// Transitions ARE the atoms (STATE_CONSOLIDATION.md §2/§2b):
//   * withdraw(bank→inv) is a BANK-TRIP BOUNDARY — "you banked before withdrawing", so it
//     first moves everything still held from the PRIOR loadout to bank (depositAll), THEN
//     sets inv to the new loadout. This is what makes inv a real segmented-by-trip loadout
//     instead of a monotonically-growing pile (the v1 bug this file was rewritten to fix).
//   * deposit(inv→bank) moves one named held item, or — for a loadout-suffixed/category
//     target with no matching held item ("everything", "combat-loadout", loot-dump labels)
//     — the whole current loadout (depositAll), since GRANULARITY atoms don't itemize
//     those categories either. A deposit atom carrying its own `consumes{}` (e.g. Dominic's
//     coffer coin fees) SPENDS those items instead (removed, never banked — they left the
//     game, not the inventory).
//   * equip(inv→worn) — unchanged; worn gear never returns to bank in this model (no
//     `unequip` verb in the closed 17-verb enum), a known, documented gap.
//   * gather/kill/buy/produce/use-on/consume/sell/teleport/plant/harvest (inv Δ via
//     produces{}/consumes{}) — same for steps with no atom{} at all (coarse train-*/
//     quest-* rows falling back to their own top-level produces{}/consumes{}).
//   * XP/point pseudo-resources (produces/consumes keys like `attack_xp`, `slayer_points`,
//     `prayer_points`, `kudos` — reward-XP and minigame-point bookkeeping the granular
//     atoms carry alongside real items) are NEVER physical inventory items and are
//     excluded from inv/bank modeling entirely (see NON_ITEM_KEY) — the v1 bug let these
//     leak into the inv list as fake "70 attack_xp"-style entries.
//
// HONEST-DEGRADATION LIMITATIONS (documented, not hidden — "??" over guesses, project
// hard rule):
//   * A `raw` value that is not a number (the "??" placeholder used everywhere quantities
//     are unmeasured) marks that item `approx: true` — displayed by NAME ONLY, never a
//     fabricated count. Once an item is touched by any approx op it stays approx for the
//     rest of the walk (a real count could still exist upstream; we never claim one) —
//     UNTIL a bank trip (withdraw/deposit-all) clears it for real (depositAll forcibly
//     removes every held entry, approx or not — a bank trip is a hard boundary).
//   * `withdraw`/`deposit` atoms whose `target` is a generic "<x>-loadout" label (the
//     bank-setup atoms of GRANULARITY U1) have NO itemized list in structured data — the
//     itemization lives only in the row's prose `detail` (free text like "Withdraw: coins
//     (charter fare + 30 pineapples...), Digsite pendant..."). Parsing that prose into item
//     slugs would fabricate names the wiki/data never structurally stated (own-words/no-
//     fabrication hard rule) — so this resolves to the literal "??" tuning placeholder
//     instead, NEVER an opaque "loadout:X" pseudo-item.
//   * Stackability is read from the item key where the data encodes it structurally (a
//     `coins` special-case — currency is always stackable, a foundational game-engine rule,
//     not a per-item guess — and any `*_noted` suffix, since noted items always stack).
//     Every other item defaults to NON-stackable for slot-counting (the majority case for
//     ore/logs/fish/bars/unfinished-potions) — a real per-item stackable/noted flag from
//     the wiki infobox would sharpen this, but is out of this pass's scope; the effect is
//     conservative (flags real overflows rather than hiding them, per §2b "never silently
//     overflow" — a false-positive flag is auditable, a false negative is not).
//   * Equipped gear does not consume an inventory slot (matches live-game behavior).
//
// Usage:
//   node state_scan.mjs [route.json]                    # full walk → summary + overflow report
//   node state_scan.mjs [route.json] --at <id>           # full state_after AT this step
//   node state_scan.mjs [route.json] --json              # machine-readable {steps:[{id,state_after}]}
//   node state_scan.mjs [route.json] --emit <out.jsonl>  # write the sidecar enrich.py attaches
import fs from 'node:fs';
import {
  loadBank, routeSteps, condGrants, effLevel, apply, unmetReqs, newState, isQuest, skillGrants,
} from './route_feasibility.mjs';

const argv = process.argv.slice(2);
const ROUTE = argv[0] && !argv[0].startsWith('--')
  ? argv[0]
  : '/home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json';
const AT = (i => i >= 0 ? argv[i + 1] : null)(argv.indexOf('--at'));
const JSON_OUT = argv.includes('--json');
const EMIT = (i => i >= 0 ? argv[i + 1] : null)(argv.indexOf('--emit'));
const SLOT_CAP = 28;

// Reward-XP / minigame-point pseudo-resources that ride along in produces{}/consumes{}
// maps alongside real items — never physical, never inventory (file header). `_xp` is a
// closed suffix convention every skill-xp key follows; the rest are the concrete named
// point-currencies the corpus carries today.
const NON_ITEM_RESOURCES = new Set(['slayer_points', 'carpenter_points', 'nmz_points', 'prayer_points', 'kudos']);
const isNonItemKey = k => /_xp$/.test(k) || NON_ITEM_RESOURCES.has(k);
const physicalEntries = map => Object.entries(map || {}).filter(([k]) => !isNonItemKey(k));

// Slot-counting stackability (file header LIMITATIONS): read structurally from the item
// key, never guessed. `coins` is the one foundational always-stackable case; `*_noted`
// is a data-encoded suffix convention (noted items always stack).
const isStackableForSlot = item => item === 'coins' || /_noted$/.test(item);

function bump(map, item, raw, sign) {
  if (!item) return;
  const cur = map.get(item);
  if (sign < 0 && !cur) return; // can't remove what isn't held — never conjure a phantom entry
  const base = cur || { qty: 0, approx: false };
  const numeric = typeof raw === 'number';
  const approx = base.approx || !numeric;
  const qty = base.qty + (numeric ? raw : 1) * sign;
  if (qty <= 0 && !approx) { map.delete(item); return; }
  map.set(item, { qty: Math.max(qty, approx ? base.qty : 0), approx });
}
const invAdd = (s, item, raw) => bump(s.inv, item, raw, 1);
const invRemove = (s, item, raw) => bump(s.inv, item, raw, -1);
const bankAdd = (s, item, raw) => bump(s.bank, item, raw, 1);
const bankRemove = (s, item, raw) => bump(s.bank, item, raw, -1);
const isLoadoutLabel = t => !!t && /(-|_)loadout$/.test(t);

/** Forcibly moves one held inv entry to bank (approx or not) — a bank trip is a hard boundary, unlike a partial per-atom `invRemove`. */
function moveInvToBank(state, item) {
  const held = state.inv.get(item);
  if (!held) return;
  state.inv.delete(item);
  const cur = state.bank.get(item) || { qty: 0, approx: false };
  const approx = cur.approx || held.approx;
  state.bank.set(item, { qty: approx ? Math.max(cur.qty, held.qty) : cur.qty + held.qty, approx });
}
/** "You banked before withdrawing" (STATE_CONSOLIDATION §2b) — everything still held moves to bank. The `??` loadout placeholder was never really "held," so it's simply dropped. */
function depositAll(state) {
  for (const item of [...state.inv.keys()]) {
    if (item === '??') { state.inv.delete(item); continue; }
    moveInvToBank(state, item);
  }
}

function doWithdraw(state, step, atom) {
  depositAll(state); // bank-trip boundary — clears the PRIOR loadout first
  const explicit = physicalEntries(step.consumes);
  if (explicit.length) {
    for (const [item, raw] of explicit) { invAdd(state, item, raw); bankRemove(state, item, raw); }
    return;
  }
  const target = atom.target;
  if (target && !isLoadoutLabel(target)) {
    const raw = typeof atom.count === 'number' ? atom.count : null;
    invAdd(state, target, raw); bankRemove(state, target, raw);
    return;
  }
  // Generic bank-setup loadout (GRANULARITY U1) — itemization lives in prose `detail`
  // only; see file header. The honest tuning placeholder, never a guessed item list or
  // an opaque "loadout:X" pseudo-item.
  invAdd(state, '??', null);
}
function doDeposit(state, step, atom) {
  // A deposit atom carrying its own consumes{} SPENDS those items (e.g. Dominic's coffer
  // coin fee) — they leave the game, not the inventory, so remove-only, never bank.
  const spend = physicalEntries(step.consumes);
  if (spend.length) {
    for (const [item, raw] of spend) invRemove(state, item, raw);
    return;
  }
  const target = atom.target;
  if (target && !isLoadoutLabel(target) && state.inv.has(target)) {
    moveInvToBank(state, target);
    return;
  }
  // Loadout-suffixed target, or a category/loot-dump label with no matching held item
  // ("everything", "combat-loadout", "barbarian_loot", ...) — GRANULARITY atoms don't
  // itemize these either, so the closest honest model is "bank the whole current loadout."
  depositAll(state);
}
function doEquip(state, step, atom) {
  const target = atom.target;
  if (!target) return;
  state.worn.add(target);
  if (state.inv.has(target)) invRemove(state, target, 1);
}
function applyInventory(state, step) {
  const atom = step.atom;
  const verb = atom && atom.verb;
  if (verb === 'withdraw') return doWithdraw(state, step, atom);
  if (verb === 'deposit') return doDeposit(state, step, atom);
  if (verb === 'equip') return doEquip(state, step, atom);
  // Generic verb (gather/kill/buy/produce/use-on/consume/sell/teleport/plant/harvest) OR
  // no atom{} at all (coarse train-*/quest-* rows) — apply the row's own produces/consumes,
  // excluding XP/point pseudo-resources (never physical, see NON_ITEM_RESOURCES).
  // `timing:"ahead-of-time"` supply-chain producers (7 rows corpus-wide — pineapple/
  // volcanic-ash/ultracompost/monkfish/ranarr-seed stockpiling) route to BANK, not the
  // active 28-slot loadout: their own `detail` prose says so explicitly ("ahead-of-time
  // stockpile before herb runs") — they represent staged stock built up over unspecified
  // background time, never literally carried, matching the opportunistic-weave rule that
  // background supply loops stay off the spine's held inventory.
  const [add, remove] = step.timing === 'ahead-of-time' ? [bankAdd, bankRemove] : [invAdd, invRemove];
  for (const [item, raw] of physicalEntries(step.consumes)) remove(state, item, raw);
  for (const [item, raw] of physicalEntries(step.produces)) add(state, item, raw);
}

function fmtEntry([item, v]) {
  if (v.approx) return item;
  return v.qty === 1 ? item : `${v.qty}x ${item}`;
}
function fmtMap(map, cap = 20) {
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const shown = entries.slice(0, cap).map(fmtEntry);
  return entries.length > cap ? [...shown, `+${entries.length - cap} more`] : shown;
}
/** Slots one inv entry occupies: 1 for a stackable/noted item or an unmeasured (approx) qty, else its own count (STATE_CONSOLIDATION §2b). */
function entrySlots([item, v]) {
  if (item === '??' || v.approx || isStackableForSlot(item)) return 1;
  return Math.max(1, v.qty);
}
function slotCount(state) {
  let n = 0;
  for (const entry of state.inv.entries()) n += entrySlots(entry);
  return n;
}

// Snapshot the bits state_after needs to diff against, BEFORE apply()/applyInventory().
function preSnapshot(state, step) {
  const skillKeys = new Set(Object.keys(skillGrants(step)));
  if (isQuest(step)) for (const sk of Object.keys(step.xp || {})) skillKeys.add(sk);
  const before = {};
  for (const sk of skillKeys) before[sk] = effLevel(state, sk);
  return { skillKeys, before, unlocks: new Set(state.unlocks), hadQuest: step && (step.coarse_of || step.id) ? state.quests.has(step.coarse_of || step.id) : true };
}
function diffState(state, step, pre) {
  const skills_delta = {};
  for (const sk of pre.skillKeys) {
    const after = effLevel(state, sk);
    if (after !== pre.before[sk]) skills_delta[sk] = after;
  }
  const unlocks_new = [...state.unlocks].filter(u => !pre.unlocks.has(u));
  const out = {
    skills_delta,
    inv: fmtMap(state.inv),
    worn: [...state.worn],
    bank: fmtMap(state.bank),
    unlocks_new,
  };
  if (isQuest(step) && !pre.hadQuest) out.quest_done = step.coarse_of || step.id;
  const slots = slotCount(state);
  out.inv_slots = slots;
  if (slots > SLOT_CAP) out.overflow = true;
  return out;
}

function scan(route) {
  const bank = loadBank();
  const steps = routeSteps(route);
  const state = { ...newState(), inv: new Map(), worn: new Set(), bank: new Map() };
  const perStep = [];
  const overflows = [];
  const loadoutSteps = [];
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i].id;
    const step = bank.get(id);
    if (!step) {
      // Bankless/synthetic (milestone-*, chkpt-*, synth-*, bootstrap-*, opp-stub-*) — same
      // fallback as route_feasibility: only SKILL completionConditions move state.
      for (const [sk, lvl] of Object.entries(condGrants(steps[i])))
        state.skills[sk] = Math.max(state.skills[sk] || 1, lvl);
      perStep.push({ id, state_after: { skills_delta: {}, inv: fmtMap(state.inv), worn: [...state.worn], bank: fmtMap(state.bank), unlocks_new: [], inv_slots: slotCount(state), synthetic: true } });
      continue;
    }
    const pre = preSnapshot(state, step);
    apply(state, step);
    applyInventory(state, step);
    const state_after = diffState(state, step, pre);
    if (state_after.overflow) overflows.push({ i, id, slots: state_after.inv_slots });
    if (step.atom && (step.atom.verb === 'withdraw' || step.atom.verb === 'deposit') && isLoadoutLabel(step.atom.target))
      loadoutSteps.push({ i, id, target: step.atom.target });
    perStep.push({ id, state_after });
  }
  return { steps, perStep, overflows, loadoutSteps };
}

const { steps, perStep, overflows, loadoutSteps } = scan(ROUTE);

if (AT) {
  const idx = steps.findIndex(s => s.id === AT);
  if (idx < 0) { console.log(`id ${AT} not found in route`); process.exit(1); }
  console.log(`state_after [${idx}] ${AT}:`);
  console.log(JSON.stringify(perStep[idx].state_after, null, 1));
  process.exit(0);
}

if (EMIT) {
  const lines = perStep.map(p => JSON.stringify({ id: p.id, state_after: p.state_after }));
  fs.writeFileSync(EMIT, lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} state_after rows -> ${EMIT}`);
  console.log(`slot-overflow flags: ${overflows.length} | loadout-placeholder steps (lower-bound slots): ${loadoutSteps.length}`);
  process.exit(0);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ total: steps.length, overflows, loadoutSteps, steps: perStep }, null, 1));
  process.exit(overflows.length ? 1 : 0);
}

console.log(`state_scan ${ROUTE.split('/').pop()}: ${steps.length} steps annotated`);
console.log(`slot-overflow (inv slots > ${SLOT_CAP}, unflagged = clean): ${overflows.length}`);
for (const o of overflows.slice(0, 30)) console.log(`  [${o.i}] ${o.id} — ${o.slots} inv slots held`);
console.log(`loadout-placeholder steps (itemization lives in prose only — slot count is a LOWER BOUND here): ${loadoutSteps.length}`);
for (const l of loadoutSteps.slice(0, 20)) console.log(`  [${l.i}] ${l.id} — ${l.target}`);
process.exit(overflows.length ? 1 : 0);
