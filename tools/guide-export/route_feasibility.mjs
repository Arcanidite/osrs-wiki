#!/usr/bin/env node
// route_feasibility.mjs — STATE-FEASIBILITY checker for the ordered route.
//
// The consulting tool the composer/orderer calls to answer: "given the state the player
// has ACCUMULATED by this point in the checklist, is the next hypothesized step actually
// doable?" It joins the ordered route (route-*.json, whose fixture strips reqs/grants) with
// the steps.jsonl requisite BANK (which has reqs/grants), walks the route forward
// accumulating prefix state (skills / quests / items / unlocks), and flags every step whose
// reqs are NOT satisfied where it lands. Catches ordering faults like the prayer-pot supply
// chain front-loaded before Herblore/Thieving/Farming or even character creation exist.
//
// MODEL PARITY (extended as the planner model grew — each rule mirrors a shipped planner
// semantic, verified against the code it cites; none is a relaxation invented here):
//   * QUEST-XP FOLD — quest reward XP raises effective skill levels (graph.js
//     effectiveLevel / enrich.py _make_effective_lvl; ba2ce570 made greedy PRUNE training
//     bands covered by quest XP, so plain grant-floors alone under-model every route that
//     leans on reward XP — the pruned band never exists to grant the level).
//   * QUEST CREDIT BY KIND — a step is a quest iff kind=="quest" or tags include "quest"
//     (model.js isQuestStep); its completion key is coarse_of (expansion member) else its
//     own id. The old id-prefix test missed rfd-* chapter rows entirely.
//   * SYNTH-BAND GRANTS — planner-synthesized steps (synth-<skill>-<lvl>-<n>) exist only
//     per-route, never in a bank; their fixture completionConditions SKILL entries ARE
//     their grants (enrich.py _train_step derives conds from grants — same data, other
//     direction), so bankless route steps contribute those levels.
//   * ITEM CLASSES — bank reqs.items name item CLASSES ("food", "prayer_potion") while
//     produces{} keys are concrete slugs ("food_monkfish", "prayer_potion_4"); a produced
//     key satisfies a class when equal or prefixed "<class>_" (the slug convention
//     supply_chains.jsonl output_item rows follow).
//
// Usage:
//   node route_feasibility.mjs [route.json]              # audit whole route → fault report
//   node route_feasibility.mjs [route.json] --at <id>    # state available at a step + verdict
//   node route_feasibility.mjs [route.json] --json       # machine-readable faults
import fs from 'node:fs';

const ROUTE = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : '/home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json';
const AT = (i => i >= 0 ? process.argv[i + 1] : null)(process.argv.indexOf('--at'));
const JSON_OUT = process.argv.includes('--json');

// steps_origin.jsonl added (state-consolidation pass, 2026-07-14): the
// character-creation/Tutorial-Island prefix (ori-t-*) lives in its own
// sidecar (plan-origin.mjs) and was never joined here, so those ~24 steps
// silently fell into the bankless/synthetic path (condGrants-only, no
// reqs/produces/consumes checked). They're all reqs:{} in practice so this
// adds coverage without introducing faults — verified empirically (still 0).
export const BANKS = [
  'assets/data/tools/steps.jsonl',
  'assets/data/tools/steps_oppgran.jsonl',
  'assets/data/tools/steps_quests.jsonl',
  'assets/data/tools/steps_quest_atoms.jsonl',
  'assets/data/tools/steps_origin.jsonl',
].map(p => '/home/lemon/osrs-wiki/' + p);

export function loadBank() {
  const bank = new Map();
  for (const f of BANKS) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (r.id && !bank.has(r.id)) bank.set(r.id, r);
    }
  }
  return bank;
}
export const routeSteps = (route = ROUTE) => JSON.parse(fs.readFileSync(route, 'utf8')).steps || [];

// XP curve — same anchors as assets/js/world/xp.js / enrich.py _build_xp_table.
export const MAX_LEVEL = 99;
export const XP_TABLE = (() => {
  const t = [0, 0]; let pts = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    pts += Math.floor(lvl + 300 * 2 ** (lvl / 7));
    t.push(Math.floor(pts / 4));
  }
  return t;
})();
export const xpForLevel = l => XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, l | 0))];
export function levelForXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= XP_TABLE[l + 1]) l++;
  return l;
}

// grants.skills OR grants{skill:lvl}; the band's atom.until.skill also grants that level
export function skillGrants(step) {
  const g = step.grants || {};
  const out = { ...(g.skills || {}) };
  if (!g.skills) for (const [k, v] of Object.entries(g)) if (typeof v === 'number') out[k] = v;
  const until = step.atom && step.atom.until && step.atom.until.skill;
  if (until) for (const [k, v] of Object.entries(until)) out[k] = Math.max(out[k] || 0, v);
  return out;
}
// Bankless (per-route synthesized) steps: SKILL completionConditions are the fixture-side
// mirror of grants (enrich.py _train_step) — the only requisite data such a step has.
export function condGrants(routeStep) {
  const out = {};
  for (const c of routeStep.completionConditions || [])
    if (c.type === 'SKILL' && c.skill && typeof c.level === 'number')
      out[c.skill.toLowerCase()] = c.level;
  return out;
}
export const isQuest = step => (step.tags || []).includes('quest') || step.kind === 'quest';
export function effLevel(state, sk) {
  const base = state.skills[sk] || 1;
  const xp = state.xp[sk] || 0;
  if (!xp) return base;
  return Math.max(base, levelForXp(xpForLevel(base) + xp));
}
export const itemHeld = (state, cls) =>
  [...state.items].some(k => k === cls || k.startsWith(cls + '_'));

export function apply(state, step) {
  for (const [sk, lvl] of Object.entries(skillGrants(step)))
    if (typeof lvl === 'number') state.skills[sk] = Math.max(state.skills[sk] || 1, lvl);
  if (isQuest(step)) {
    state.quests.add(step.coarse_of || step.id);
    for (const [sk, amt] of Object.entries(step.xp || {}))
      if (typeof amt === 'number' && amt > 0) state.xp[sk] = (state.xp[sk] || 0) + amt;
  }
  for (const q of (step.grants && step.grants.quests) || []) state.quests.add(q);
  for (const it of Object.keys(step.produces || {})) state.items.add(it);
  for (const t of (step.grants && step.grants.tags) || []) state.unlocks.add(t);
  for (const t of step.tags || []) if (/unlock|access|gate/i.test(t)) state.unlocks.add(t);
}
export function unmetReqs(state, step) {
  const u = [], r = step.reqs || {};
  for (const [sk, lvl] of Object.entries(r.skills || {})) {
    const eff = effLevel(state, sk);
    if (eff < lvl) u.push(`skill ${sk} ≥ ${lvl} (have ${eff})`);
  }
  for (const q of r.quests || []) if (!state.quests.has(q)) u.push(`quest ${q} not done`);
  for (const it of r.items || []) { const n = typeof it === 'string' ? it : it.item; if (n && !itemHeld(state, n)) u.push(`item ${n} not held`); }
  return u;
}
export const newState = () => ({ skills: {}, xp: {}, quests: new Set(), items: new Set(), unlocks: new Set() });

// CLI entrypoint — guarded so state_scan.mjs (and any other importer) can
// reuse every helper above without triggering this script's own stdout/exit.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const bank = loadBank();
  const steps = routeSteps();
  const state = newState();
  const faults = [];
  let inBank = 0;
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i].id;
    const step = bank.get(id);
    if (AT && id === AT) {
      console.log(`state ACCUMULATED before [${i}] ${AT}:`);
      const eff = Object.fromEntries(Object.keys({ ...state.skills, ...state.xp })
        .map(k => [k, effLevel(state, k)]));
      console.log('  skills (effective, quest XP folded):', JSON.stringify(eff));
      console.log('  quests:', state.quests.size, '| items:', state.items.size, '| unlocks:', [...state.unlocks].slice(0, 12));
      if (step) { const u = unmetReqs(state, step); console.log('  VERDICT:', u.length ? 'INFEASIBLE — ' + u.join('; ') : 'FEASIBLE'); }
      else console.log('  (step not in requisite bank — synthetic/checkpoint; SKILL conds credit as grants)');
      process.exit(0);
    }
    if (!step) {
      for (const [sk, lvl] of Object.entries(condGrants(steps[i])))
        state.skills[sk] = Math.max(state.skills[sk] || 1, lvl);
      continue;
    }
    inBank++;
    const u = unmetReqs(state, step);
    if (u.length) faults.push({ i, id, unmet: u });
    apply(state, step);
  }

  if (JSON_OUT) { console.log(JSON.stringify({ total: steps.length, inBank, faults }, null, 1)); process.exit(faults.length ? 1 : 0); }
  console.log(`route ${ROUTE.split('/').pop()}: ${steps.length} steps | ${inBank} have requisites in bank | INFEASIBLE-at-position: ${faults.length}`);
  console.log(`accumulated by end: ${Object.keys(state.skills).length} skills, ${state.quests.size} quests, ${state.items.size} item-types`);
  console.log('\n=== FAULTS (step requires something the accumulated state lacks at its position) ===');
  for (const f of faults.slice(0, 50)) console.log(`  [${f.i}] ${f.id}\n        NEED: ${f.unmet.join('; ')}`);
  if (faults.length > 50) console.log(`  ... +${faults.length - 50} more`);
  process.exit(faults.length ? 1 : 0);
}
