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

const BANKS = [
  'assets/data/tools/steps.jsonl',
  'assets/data/tools/steps_oppgran.jsonl',
  'assets/data/tools/steps_quests.jsonl',
  'assets/data/tools/steps_quest_atoms.jsonl',
].map(p => '/home/lemon/osrs-wiki/' + p);

function loadBank() {
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
const routeIds = () => (JSON.parse(fs.readFileSync(ROUTE, 'utf8')).steps || []).map(s => s.id);

// grants.skills OR grants{skill:lvl}; the band's atom.until.skill also grants that level
function skillGrants(step) {
  const g = step.grants || {};
  const out = { ...(g.skills || {}) };
  if (!g.skills) for (const [k, v] of Object.entries(g)) if (typeof v === 'number') out[k] = v;
  const until = step.atom && step.atom.until && step.atom.until.skill;
  if (until) for (const [k, v] of Object.entries(until)) out[k] = Math.max(out[k] || 0, v);
  return out;
}
function apply(state, step) {
  for (const [sk, lvl] of Object.entries(skillGrants(step)))
    if (typeof lvl === 'number') state.skills[sk] = Math.max(state.skills[sk] || 1, lvl);
  const isQuest = step.kind === 'quest' || (step.id || '').startsWith('quest-');
  if (isQuest) {
    const qid = (step.coarse_of || '').startsWith('quest-') ? step.coarse_of
      : (step.id || '').startsWith('quest-') ? step.id : null;
    if (qid) state.quests.add(qid);
  }
  for (const q of (step.grants && step.grants.quests) || []) state.quests.add(q);
  for (const it of Object.keys(step.produces || {})) state.items.add(it);
  for (const t of (step.grants && step.grants.tags) || []) state.unlocks.add(t);
  for (const t of step.tags || []) if (/unlock|access|gate/i.test(t)) state.unlocks.add(t);
}
function unmetReqs(state, step) {
  const u = [], r = step.reqs || {};
  for (const [sk, lvl] of Object.entries(r.skills || {}))
    if ((state.skills[sk] || 1) < lvl) u.push(`skill ${sk} ≥ ${lvl} (have ${state.skills[sk] || 1})`);
  for (const q of r.quests || []) if (!state.quests.has(q)) u.push(`quest ${q} not done`);
  for (const it of r.items || []) { const n = typeof it === 'string' ? it : it.item; if (n && !state.items.has(n)) u.push(`item ${n} not held`); }
  return u;
}

const bank = loadBank();
const ids = routeIds();
const state = { skills: {}, quests: new Set(), items: new Set(), unlocks: new Set() };
const faults = [];
let inBank = 0;
for (let i = 0; i < ids.length; i++) {
  const step = bank.get(ids[i]);
  if (AT && ids[i] === AT) {
    console.log(`state ACCUMULATED before [${i}] ${AT}:`);
    console.log('  skills:', JSON.stringify(state.skills));
    console.log('  quests:', state.quests.size, '| items:', state.items.size, '| unlocks:', [...state.unlocks].slice(0, 12));
    if (step) { const u = unmetReqs(state, step); console.log('  VERDICT:', u.length ? 'INFEASIBLE — ' + u.join('; ') : 'FEASIBLE'); }
    else console.log('  (step not in requisite bank — synthetic/checkpoint)');
    process.exit(0);
  }
  if (!step) continue;
  inBank++;
  const u = unmetReqs(state, step);
  if (u.length) faults.push({ i, id: ids[i], unmet: u });
  apply(state, step);
}

if (JSON_OUT) { console.log(JSON.stringify({ total: ids.length, inBank, faults }, null, 1)); process.exit(faults.length ? 1 : 0); }
console.log(`route ${ROUTE.split('/').pop()}: ${ids.length} steps | ${inBank} have requisites in bank | INFEASIBLE-at-position: ${faults.length}`);
console.log(`accumulated by end: ${Object.keys(state.skills).length} skills, ${state.quests.size} quests, ${state.items.size} item-types`);
console.log('\n=== FAULTS (step requires something the accumulated state lacks at its position) ===');
for (const f of faults.slice(0, 50)) console.log(`  [${f.i}] ${f.id}\n        NEED: ${f.unmet.join('; ')}`);
if (faults.length > 50) console.log(`  ... +${faults.length - 50} more`);
process.exit(faults.length ? 1 : 0);
