#!/usr/bin/env node
// state_scan.mjs — STATE-EMITTER sibling to route_feasibility.mjs (STATE_CONSOLIDATION.md
// §2/§5). Reuses that file's bank-join + skill/quest/unlock engine (imported, not
// duplicated — one source of truth) and ADDS the inventory/equipped/bank-stock model so
// each step can be annotated with the state it LEAVES the player in (`state_after`).
//
// STATE MODEL (additive on top of route_feasibility's {skills,xp,quests,items,unlocks}):
//   inv   — Map<item, {qty:number, approx:boolean}>  the 28-slot loadout at this point.
//   worn  — Set<item>                                equipped gear.
//   bank  — Map<item, {qty:number, approx:boolean}>  staged/produced stock, off the 28.
// Transitions ARE the atoms (STATE_CONSOLIDATION.md §2): withdraw(bank→inv) ·
// equip(inv→worn) · gather/kill/buy(inv+ via produces) · produce/use-on/consume/sell
// (inv Δ via consumes/produces) · deposit(inv→bank) · teleport/plant(inv− via consumes) ·
// harvest(inv+ via produces). Steps with no atom{} (most coarse train-*/quest-* rows) fall
// back to the row's own top-level produces{}/consumes{} generically — same data, no verb
// to special-case.
//
// HONEST-DEGRADATION LIMITATIONS (documented, not hidden — "??" over guesses, project
// hard rule):
//   * A `raw` value that is not a number (the "??" placeholder used everywhere quantities
//     are unmeasured) marks that item `approx: true` — displayed by NAME ONLY, never a
//     fabricated count. Once an item is touched by any approx op it stays approx for the
//     rest of the walk (a real count could still exist upstream; we never claim one).
//   * `withdraw`/`deposit` atoms whose `target` is a generic "<x>-loadout" label (the
//     bank-setup atoms of GRANULARITY U1) have NO itemized list in structured data — the
//     itemization lives only in the row's prose `detail`. Those emit ONE symbolic
//     `loadout:<target>` inv entry. Slot-overflow flags are therefore a LOWER BOUND when a
//     loadout placeholder is present (real usage could be higher) — every such step is
//     called out separately in the overflow report, never silently folded into the count.
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

const qtyOf = raw => typeof raw === 'number' ? raw : null;

function bump(map, item, raw, sign) {
  if (!item) return;
  const cur = map.get(item) || { qty: 0, approx: false };
  const numeric = typeof raw === 'number';
  const approx = cur.approx || !numeric;
  const qty = cur.qty + (numeric ? raw : 1) * sign;
  if (qty <= 0 && !approx) { map.delete(item); return; }
  map.set(item, { qty: Math.max(qty, approx ? cur.qty : 0), approx });
}
const invAdd = (s, item, raw) => bump(s.inv, item, raw, 1);
const invRemove = (s, item, raw) => bump(s.inv, item, raw, -1);
const bankAdd = (s, item, raw) => bump(s.bank, item, raw, 1);
const bankRemove = (s, item, raw) => bump(s.bank, item, raw, -1);
const isLoadoutLabel = t => !!t && /(-|_)loadout$/.test(t);

function doWithdraw(state, step, atom) {
  const explicit = Object.entries(step.consumes || {});
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
  // only; see file header. One symbolic slot placeholder, never a guessed item list.
  invAdd(state, `loadout:${target || '??'}`, null);
}
function doDeposit(state, step, atom) {
  const target = atom.target;
  if (target && !isLoadoutLabel(target)) {
    const held = state.inv.get(target);
    if (held) { invRemove(state, target, held.approx ? null : held.qty); bankAdd(state, target, held.approx ? null : held.qty); }
    return;
  }
  // "Bank: deposit all" — move every non-placeholder held item to bank.
  for (const [item, v] of [...state.inv.entries()]) {
    if (item.startsWith('loadout:')) continue;
    invRemove(state, item, v.approx ? null : v.qty);
    bankAdd(state, item, v.approx ? null : v.qty);
  }
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
  // no atom{} at all (coarse train-*/quest-* rows) — apply the row's own produces/consumes.
  for (const [item, raw] of Object.entries(step.consumes || {})) invRemove(state, item, raw);
  for (const [item, raw] of Object.entries(step.produces || {})) invAdd(state, item, raw);
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
function slotCount(state) { return state.inv.size; }

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
console.log(`slot-overflow (inv distinct-items > ${SLOT_CAP}, unflagged = clean): ${overflows.length}`);
for (const o of overflows.slice(0, 30)) console.log(`  [${o.i}] ${o.id} — ${o.slots} distinct items held`);
console.log(`loadout-placeholder steps (itemization lives in prose only — slot count is a LOWER BOUND here): ${loadoutSteps.length}`);
for (const l of loadoutSteps.slice(0, 20)) console.log(`  [${l.i}] ${l.id} — ${l.target}`);
process.exit(overflows.length ? 1 : 0);
