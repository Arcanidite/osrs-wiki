#!/usr/bin/env node
// order_audit.mjs — STATE_CONSOLIDATION.md §1 heap/quicksort ideal-order scan. A
// consulting/audit tool (not a planner change): confirms the shipped route reads as a
// priority-queue pop from the feasible frontier — `unlock/QoL compounding payoff >
// unblocks-most-downstream > efficiency > in-position proximity` — by finding steps that
// SAT READY (reqs satisfied by accumulated state) for many positions before they were
// actually scheduled. Reports deviation CANDIDATES for human triage against known
// scaffolding (demand_gate/anchor-pins/pin_prefix) — never silently reorders (the ordering
// agent owns the planner).
//
// State is monotonic (skills/quests/items/unlocks only accumulate — route_feasibility's own
// invariant, gate = 0 faults), so readiness, once true, stays true: one forward pass finds
// the FIRST position each bank step's reqs clear (readyAt), independent of when the route
// actually schedules it (takenAt). gap = takenAt - readyAt.
//
// Usage: node order_audit.mjs [route.json] [--min-gap N] [--top N]
import { loadBank, routeSteps, apply, unmetReqs, newState } from './route_feasibility.mjs';

const argv = process.argv.slice(2);
const ROUTE = argv[0] && !argv[0].startsWith('--')
  ? argv[0]
  : '/home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json';
const MIN_GAP = Number((i => i >= 0 ? argv[i + 1] : 20)(argv.indexOf('--min-gap')));
const TOP = Number((i => i >= 0 ? argv[i + 1] : 40)(argv.indexOf('--top')));

const bank = loadBank();
const steps = routeSteps(ROUTE);
const takenAt = new Map();
steps.forEach((s, i) => { if (!takenAt.has(s.id)) takenAt.set(s.id, i); });

const isQoL = row => {
  const kind = row.kind, tags = row.tags || [];
  return kind === 'quest' || kind === 'unlock' || tags.includes('quest')
    || tags.includes('unlock') || tags.includes('access') || tags.includes('diary');
};

// Downstream-unblock proxy: how many OTHER in-route bank steps name this step's id in
// their own reqs.quests (concrete, structured — the only cheap fan-out signal available).
const unblockCount = new Map();
for (const [id, row] of bank) {
  if (!takenAt.has(id)) continue;
  for (const q of (row.reqs && row.reqs.quests) || []) {
    unblockCount.set(q, (unblockCount.get(q) || 0) + 1);
  }
}

const pending = new Set([...takenAt.keys()].filter(id => bank.has(id)));
const readyAt = new Map();
const frontierAt = []; // frontierAt[i] = ids ready-and-not-yet-taken AT position i (before applying i)
const state = newState();
for (let i = 0; i < steps.length; i++) {
  const nowReady = [];
  for (const id of pending) {
    const row = bank.get(id);
    if (!unmetReqs(state, row).length) { readyAt.set(id, i); nowReady.push(id); }
  }
  for (const id of nowReady) pending.delete(id);
  frontierAt.push([...readyAt.keys()].filter(id => takenAt.get(id) > i));
  const row = bank.get(steps[i].id);
  if (row) apply(state, row);
}

// Ready-but-delayed report.
const gaps = [];
for (const [id, ra] of readyAt) {
  const ta = takenAt.get(id);
  const gap = ta - ra;
  if (gap >= MIN_GAP) gaps.push({ id, readyAt: ra, takenAt: ta, gap, qol: isQoL(bank.get(id)), unblocks: unblockCount.get(id) || 0 });
}
gaps.sort((a, b) => b.gap - a.gap);

console.log(`order_audit ${ROUTE.split('/').pop()}: ${steps.length} steps, ${bank.size} bank rows, ${takenAt.size} taken`);
console.log(`ready-but-delayed (gap >= ${MIN_GAP}): ${gaps.length} candidates (QoL/unlock-tagged shown first)`);
const qolGaps = gaps.filter(g => g.qol);
const otherGaps = gaps.filter(g => !g.qol);
console.log(`  QoL/unlock: ${qolGaps.length} | other (train/gather/supply): ${otherGaps.length}`);
console.log('\n=== TOP QoL/unlock gaps (criterion #1 — compounding payoff sitting idle) ===');
for (const g of qolGaps.slice(0, TOP))
  console.log(`  ${g.id}: ready@${g.readyAt} taken@${g.takenAt} gap=${g.gap} unblocks=${g.unblocks}`);
console.log(`\n=== TOP other gaps (train/gather/supply — often intentional JIT/scaffolding) ===`);
for (const g of otherGaps.slice(0, Math.min(TOP, 20)))
  console.log(`  ${g.id}: ready@${g.readyAt} taken@${g.takenAt} gap=${g.gap} unblocks=${g.unblocks}`);

// Frontier-size summary (proximity signal: how much choice existed at each position).
const avgFrontier = frontierAt.reduce((a, f) => a + f.length, 0) / frontierAt.length;
const maxFrontier = Math.max(...frontierAt.map(f => f.length));
console.log(`\nfrontier size: avg=${avgFrontier.toFixed(1)} max=${maxFrontier} (choice available at each position — high = many valid next-steps, ordering is a real pick not a forced line)`);
