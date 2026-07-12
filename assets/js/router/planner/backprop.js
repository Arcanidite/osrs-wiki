// backprop.js — backward requisite-demand propagation (the opportunistic-lookahead core).
//
// Design: tools/guide-export/design/OPPORTUNISTIC_GRANULARITY.md §2.
// Pipeline seat: demand ANALYSIS for P8 — this module decides WHERE a downstream
// requisite is collectable earliest; the existing weaver machinery (enrich.py
// insert_supply_steps + the _anchor/_side detach/reattach contract, P5/P9) does
// the insertion. It extends — never replaces — burndown.js's produces/consumes
// edges and overlay.js's break-anchored weaving.
//
// Dataflow (demand-driven, backward over the ordered route):
//   1. Horizon demands: every consumes{} on a route node + every queued goal's
//      reqs.items form the demand set, each pinned to its consumer position.
//   2. One BACKWARD sweep from the route's end carries the live demand set;
//      at each earlier node, if the player is in-position for a still-unmet
//      downstream requisite (zone/hub window) and capable (prefix-accumulated
//      skill state), the node is recorded as a candidate collection point.
//      The last candidate written while walking backward IS the earliest in
//      route order — sourcing there means never re-navigating later.
//   3. Sources come from the steps bank's produces{} edges (+ authored opp{}
//      trigger overrides). Unknown zone/qty stays "??" — never guessed; a
//      zone-less source honestly yields "no-window".
//
// Verdicts per demand:
//   "earliest-window"        window found earlier than the source's current slot
//   "already-earliest"       source already sits at its earliest in-position node
//   "no-window"              no in-position node precedes the consumer (fallback:
//                            today's dedicated supply placement, unchanged)
//   + flag source_after_consumer: the bank ordering puts the producer AFTER its
//     consumer — a real route fault this analysis surfaces for free.

const GLOBAL_ZONE = "global";
const HORIZON = Number.MAX_SAFE_INTEGER; // consumer position for goal-level demands

// ── Source index ──────────────────────────────────────────────────────────────
// item slug -> [{ stepId, zones[], hubs[], minSkills{} }] from every bank step
// with produces{}; authored opp{} widens/overrides the derived window (§2a).
export function buildSourceIndex(bankSteps) {
  const index = new Map();
  for (const step of bankSteps) addSources(index, step);
  return index;
}

function addSources(index, step) {
  const produced = Object.keys(step.produces ?? {});
  if (!produced.length) return;
  const zone = step.location?.zone;
  const zones = step.opp?.zones ?? (zone && zone !== GLOBAL_ZONE ? [zone] : []);
  const hubs = step.opp?.hubs ?? (step.hub ? [step.hub] : []);
  const minSkills = { ...(step.reqs?.skills ?? {}), ...(step.opp?.min_skills ?? {}) };
  const entry = { stepId: step.id, zones, hubs, minSkills };
  for (const item of produced) {
    if (!index.has(item)) index.set(item, []);
    index.get(item).push(entry);
  }
}

// ── Demand set ────────────────────────────────────────────────────────────────
// Route consumes{} → positioned demands; goal reqs.items → horizon demands.
export function collectDemands(route, goals) {
  const demands = [];
  route.forEach((step, i) => {
    for (const [item, qty] of Object.entries(step.consumes ?? {}))
      demands.push({ item, qty, consumerId: step.id, consumerIdx: i });
  });
  for (const goal of goals ?? []) {
    for (const [item, qty] of Object.entries(goal.reqs?.items ?? {}))
      demands.push({ item, qty, consumerId: goal.id, consumerIdx: HORIZON });
  }
  return demands;
}

// ── Capability state ──────────────────────────────────────────────────────────
// Prefix pass: skill maxima accumulated from grants{} up to and including i.
export function accumulateSkills(route) {
  const prefix = [];
  const state = {};
  for (const step of route) {
    for (const [skill, lvl] of Object.entries(step.grants ?? {}))
      state[skill] = Math.max(state[skill] ?? 1, lvl);
    prefix.push({ ...state });
  }
  return prefix;
}

function meetsSkills(skillsAt, minSkills) {
  return Object.entries(minSkills).every(([sk, lvl]) => (skillsAt[sk] ?? 1) >= lvl);
}

function inPosition(node, source) {
  const zone = node.location?.zone;
  if (zone && source.zones.includes(zone)) return true;
  if (node.hub && source.hubs.includes(node.hub)) return true;
  return false;
}

// ── Backward sweep ────────────────────────────────────────────────────────────
function updatePlanAtNode(plan, node, i, skillsAt) {
  if (i >= plan.consumerIdx) return; // demand not yet live this far downstream
  const source = plan.sources.find((s) => inPosition(node, s) && meetsSkills(skillsAt, s.minSkills));
  if (!source) return;
  plan.collectAtIdx = i; // backward walk: last write = earliest in route order
  plan.collectAtId = node.id;
  plan.viaSource = source.stepId;
}

function finalizeVerdict(plan, positionOf) {
  const chosen = plan.viaSource ?? plan.sources[0]?.stepId;
  const srcIdx = chosen != null ? positionOf.get(chosen) ?? null : null;
  plan.sourceIdx = srcIdx;
  plan.sourceAfterConsumer = srcIdx != null && srcIdx > plan.consumerIdx;
  if (plan.collectAtIdx == null) { plan.verdict = "no-window"; return; }
  if (srcIdx != null && srcIdx <= plan.collectAtIdx) { plan.verdict = "already-earliest"; return; }
  plan.verdict = "earliest-window";
}

// backpropCollectionPlan(route, demands, sourceIndex[, prefixSkills]) -> plans[]
// route: ordered steps.jsonl-shaped rows (the planner's pre-emission view).
// Each returned plan: { item, qty, consumerId, consumerIdx, collectAtIdx,
//   collectAtId, viaSource, sourceIdx, sourceAfterConsumer, verdict }.
export function backpropCollectionPlan(route, demands, sourceIndex, prefixSkills) {
  const skills = prefixSkills ?? accumulateSkills(route);
  const positionOf = new Map(route.map((s, i) => [s.id, i]));
  const plans = demands.map((d) => ({
    ...d,
    sources: sourceIndex.get(d.item) ?? [],
    collectAtIdx: null,
    collectAtId: null,
    viaSource: null,
  }));
  for (let i = route.length - 1; i >= 0; i--) {
    for (const plan of plans) updatePlanAtNode(plan, route[i], i, skills[i]);
  }
  for (const plan of plans) finalizeVerdict(plan, positionOf);
  return plans;
}
