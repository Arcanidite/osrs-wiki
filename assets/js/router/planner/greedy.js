// Algorithm A — greedy best-first (the baseline route engine, extracted
// verbatim from the monolith). Pure and DOM-free: all context arrives via
// `env` — { graph, constraints, pinnedExclusions, manualQuestDone, now }.
// `now` exists so tests can generate deterministic synthetic-step ids.
//
// Pipeline (S7): load → burndownResolve → bank-split → routeMulti(greedy) →
//   weaveOverlays ‖ detach-overlays → hub_batches → topo_order →
//   insert_supply_steps → re-attach → phased_steps_with_steer → emit

import { normalizeReqs, reqQuals, toState, fromState, reqsSummary, syncQualEdges, isQuestStep } from "../model.js";
import { effectiveLevel } from "../graph.js";
import { weaveOverlays } from "./overlay.js";
import { burndownResolve } from "./burndown.js";
import {
  COST_MODEL_V2, SUPPLY_COST, QUEST_XP_COST, STEER_COST_DISCOUNT, STEER_HARD_THRESHOLD,
  STYLE_BASE_COST, EFFICIENT_NO_XP_COST, GP_MONEY_COST,
} from "./tuning.js";

class MinHeap {
  constructor() { this._h = []; }
  push(item, p) { this._h.push({ item, p }); this._up(this._h.length - 1); }
  pop() {
    const top = this._h[0], last = this._h.pop();
    if (this._h.length) { this._h[0] = last; this._down(0); }
    return top?.item;
  }
  get size() { return this._h.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._h[p].p <= this._h[i].p) break;
      [this._h[p], this._h[i]] = [this._h[i], this._h[p]]; i = p;
    }
  }
  _down(i) {
    const n = this._h.length;
    while (true) {
      let m = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._h[l].p < this._h[m].p) m = l;
      if (r < n && this._h[r].p < this._h[m].p) m = r;
      if (m === i) break;
      [this._h[m], this._h[i]] = [this._h[i], this._h[m]]; i = m;
    }
  }
}

// ctx: { completedIds: Set, freeSlots: number }
export function meetsReqs(env, step, state, ctx) {
  const { completedIds = new Set(), freeSlots = 28 } = ctx ?? {};
  if (!env.graph.satisfies(env.graph.edgesFrom("step:req", step.id), state)) return false;
  const r = step.reqs ?? {};
  if (r.inv_free && freeSlots < r.inv_free) return false;
  for (const cid of (r.constraints ?? [])) {
    const c = (env.constraints ?? []).find((x) => x.id === cid);
    if (!c) continue;
    if (c.type === "region_order" && c.before_step && !completedIds.has(c.before_step)) return false;
    if (c.type === "inv_free"     && c.slots       && freeSlots < c.slots)              return false;
  }
  return true;
}

// Lane M2 (MATERIALIZATION §1c) — v2 defaults false (COST_MODEL_V2, gated by
// env.tuning.costModelV2 in routeGoal below) so existing callers/tests that pass
// only (step, style) keep the pre-M2 ladder byte-identical.
export function costFor(step, style, v2 = false) {
  // Supply steps are mandatory prerequisites — assign near-zero cost so they
  // are always preferred when useful (S6/S3 hard rule: supply before bossing).
  if (step._supply) return SUPPLY_COST;
  // Quests with reward XP are the efficient-guide backbone: prefer them just
  // below supply so quest XP is banked before any grind (they are only pulled
  // when their XP still advances a needed skill — see isUseful). "quest primarily."
  if (isQuestStep(step) && Object.keys(step.xp ?? {}).length) return QUEST_XP_COST;
  return baseCost(step, style, v2) * steerDiscount(step, v2);
}

// Ordinal style-cost tier, OR (M2, v2 only) the cardinal wall-clock cost when
// est_minutes is actually sourced — "cardinal wall-clock value only enters where
// est_minutes is sourced ... degrades to the ordinal ladder when null" (§1c). No
// step in the current bank has a non-null est_minutes yet (S1: never estimated),
// so this branch is presently dormant even with v2 on — honest, not fabricated.
function baseCost(step, style, v2) {
  if (v2 && step.est_minutes != null) return step.est_minutes;
  const xpSum = Object.values(step.xp ?? {}).reduce((a, b) => a + b, 0);
  if (style === "efficient") return xpSum > 0 ? 1 / xpSum : EFFICIENT_NO_XP_COST;
  if (style === "afk")       return step.inv_used ?? STYLE_BASE_COST;
  if (style === "gp")        return (step.tags ?? []).includes("money") ? GP_MONEY_COST : STYLE_BASE_COST;
  return STYLE_BASE_COST;
}

// Compounding-unlock discount (§1c "what gets pulled forward" / SYNTHESIS P3): a
// step carrying a HARD steer point (_steerPoint merged at P2 bank-split below, by
// steer_id FK) halves its own cost so it's chosen ahead of equal-cost filler — every
// future minute is cheaper once it lands. Soft steer points (< STEER_HARD_THRESHOLD)
// get no discount here; they're a phasing concern (enrich.py phase_name), not a
// routing one.
function steerDiscount(step, v2) {
  if (!v2) return 1;
  const w = step._steerPoint?.anchor_weight;
  return typeof w === "number" && w >= STEER_HARD_THRESHOLD ? STEER_COST_DISCOUNT : 1;
}

// P2 bank split (M2) — join step.steer_id -> steer_points.jsonl record onto the
// step as _steerPoint, mirroring the existing _supply annotation pattern (SYNTHESIS
// P2 pass contract). Pure and unconditional (inert without v2: nothing else reads
// _steerPoint); a step whose steer_id doesn't resolve stays unannotated — honest
// MANUAL degrade, never an invented match.
function mergeSteerPoints(steps, steerPoints) {
  if (!steerPoints.length) return steps;
  const byId = new Map(steerPoints.map((sp) => [sp.id, sp]));
  return steps.map((s) => (s.steer_id && byId.has(s.steer_id)) ? { ...s, _steerPoint: byId.get(s.steer_id) } : s);
}

// A quest is "XP-useful" when its reward XP advances a skill still below the
// goal's target — the hook that lets quest rewards substitute for training.
// Gated to quests so training bands the XP already covers stay pruned (they
// lose usefulness via graph.progresses on the XP-boosted level).
function questXpUseful(step, state, targetEdges) {
  if (!isQuestStep(step)) return false;
  const xp = step.xp ?? {};
  return targetEdges.some(te => {
    if (!te.to.startsWith("skill:")) return false;
    const sk = te.to.slice(6);
    return xp[sk] > 0 && effectiveLevel(state, te.to) < (te.data?.value ?? 0);
  });
}

// S8 — deferred_until vs supply demand (Lane 3 sequencer). Hard requisites beat
// soft deferrals: a step whose id is in env.demandSet is never held, regardless
// of deferred_until. Otherwise the hold releases once a named goal in
// env.activeGoalIds is queued, or a tag: trigger has already been granted into
// state (state["tag:<name>"] — set by another step's grants, same vocabulary
// the S6 tag-bridge uses). A step with no deferred_until is never held.
export function isDeferrable(step, env, state) {
  const until = step.deferred_until;
  if (!until || !until.length) return true;
  if (env.demandSet?.has(step.id)) return true;
  return until.some((trigger) =>
    trigger.startsWith("tag:")
      ? state[`tag:${trigger.slice(4)}`] === true
      : env.activeGoalIds?.has(trigger) === true
  );
}

export function locationAccessible(step, completedIds, excluded, completedQuests) {
  const loc = step.location;
  if (!loc) return true;
  const region = loc.region ?? "global";
  if (region !== "global" && excluded.includes("region-" + region)) return false;
  if (loc.quest_gate && !completedIds.has(loc.quest_gate) && !completedQuests.has(loc.quest_gate)) return false;
  return true;
}

function isUseful(env, step, state, targetEdges, terminal, neededGates) {
  if (terminal && step.id === terminal) return true;
  if (neededGates?.has(step.id)) return true;
  // Supply-chain and quest-prereq steps are mandatory — treat as always-useful
  // when their own requirements are met (S8: demandSet overrides deferred_until).
  if (env.demandSet?.has(step.id)) return true;
  // Quest reward XP that still advances a needed skill makes the quest useful
  // (the quest-XP economy — lets quest completion substitute for training).
  if (questXpUseful(step, state, targetEdges)) return true;
  return env.graph.progresses(env.graph.edgesFrom("step:grant", step.id), targetEdges, state);
}

function routeGoal(env, steps, profile, goal, skills, completedIds, completedQuests, excluded, freeSlots) {
  const graph       = env.graph;
  const targetEdges = reqQuals(goal.reqs ?? {});
  const terminal    = goal.terminal ?? null;
  // Lane M2 gate — env.tuning.costModelV2 mirrors the runtime-override channel
  // overlay.js already uses for defaultStepMin; falls back to the tuning default
  // (DEFAULT-OFF) when unset.
  const costModelV2 = env.tuning?.costModelV2 ?? COST_MODEL_V2;
  const path        = [];
  let   state       = toState(skills);
  // Seed completed quests as quest:<id> so dependents' quest prereqs (reqs.quests)
  // resolve — quests done in an earlier goal / manualQuestDone carry over.
  for (const id of completedQuests) state[`quest:${id}`] = true;
  let   invFree     = freeSlots ?? 28;
  const remaining   = new Set(
    steps.map((s) => s.id).filter((id) => !completedIds.has(id) && !env.pinnedExclusions.has(id))
  );

  const ctx = () => ({ completedIds, freeSlots: invFree });

  const computeNeededGates = () => {
    const needed = new Set();
    const directlyUseful = (s) =>
      (terminal && s.id === terminal) ||
      // Supply/demand steps are always useful; propagate their quest gates too (S8).
      env.demandSet?.has(s.id) ||
      graph.progresses(graph.edgesFrom("step:grant", s.id), targetEdges, state);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of remaining) {
        const s = steps.find((x) => x.id === id);
        if (!s) continue;
        const gate = s.location?.quest_gate;
        if (gate && !needed.has(gate) && (directlyUseful(s) || needed.has(s.id))) {
          needed.add(gate); changed = true;
        }
      }
    }
    return needed;
  };

  const buildHeap = () => {
    const neededGates = computeNeededGates();
    const heap = new MinHeap();
    for (const id of remaining) {
      const step = steps.find((s) => s.id === id);
      if (!step || !meetsReqs(env, step, state, ctx())) continue;
      if (!locationAccessible(step, completedIds, excluded, completedQuests)) continue;
      if (!isDeferrable(step, env, state)) continue;
      if (!isUseful(env, step, state, targetEdges, terminal, neededGates)) continue;
      heap.push(step, costFor(step, profile.style, costModelV2));
    }
    return heap;
  };

  const goalMet = () =>
    graph.satisfies(targetEdges, state) && (!terminal || completedIds.has(terminal));

  let heap = buildHeap();
  while (heap.size > 0) {
    if (goalMet()) break;
    const best = heap.pop();
    if (!best || !remaining.has(best.id)) { heap = buildHeap(); continue; }
    path.push({ ...best, _goalLabel: goal.label, _reqs: goal.reqs });
    remaining.delete(best.id);
    completedIds.add(best.id);
    if ((best.tags ?? []).includes("quest")) completedQuests.add(best.id);
    state   = graph.coalesce(graph.edgesFrom("step:grant", best.id), state);
    invFree = Math.min(28, Math.max(0, invFree - (best.inv_used ?? 0) + (best.inv_removes?.length ?? 0)));
    heap    = buildHeap();
  }
  return { path, skills: fromState(state), completedIds, completedQuests, freeSlots: invFree };
}

// If the bank has no step that reaches a required skill level or tag,
// synthesize an honest placeholder step (the "no fabricated data" precedent).
export function synthFillGaps(env, path, goalReqs, finalSkills, allSkills) {
  const graph      = env.graph;
  const finalState = toState(finalSkills);
  const allState   = toState(allSkills);
  const maxGranted = (key) => path.reduce((mx, s) => {
    const e = graph.edge("step:grant", s.id, key);
    return e?.data?.cmp === "gte" ? Math.max(mx, e.data.value) : mx;
  }, -Infinity);

  const makeSynth = (id, label, reqs, grants) => {
    const s = { id, label, detail: "Synthetic step — no matching step found in bank.",
                reqs, grants, _custom: true, _synthetic: true, _goalLabel: path[0]?._goalLabel ?? "" };
    syncQualEdges(graph, [s]);
    return s;
  };

  const synths = [];

  Object.entries(goalReqs.skills ?? {}).forEach(([sk, needed]) => {
    // Effective level folds in quest reward XP — a skill covered by quest XP
    // needs no synth even though its training-floor level never reached `needed`.
    if (effectiveLevel(finalState, `skill:${sk}`) >= needed) return;
    const top     = maxGranted(`skill:${sk}`);
    const fromLvl = Math.max(
      top > -Infinity ? top : (allState[`skill:${sk}`] ?? 1),
      effectiveLevel(finalState, `skill:${sk}`)
    );
    if (fromLvl >= needed) return;
    synths.push(makeSynth(
      `synth-${sk}-${needed}-${env.now()}`,
      `Train ${sk.charAt(0).toUpperCase() + sk.slice(1)} ${fromLvl}→${needed}`,
      { skills: { [sk]: fromLvl } }, { [sk]: needed }
    ));
  });

  (goalReqs.tags ?? []).forEach((tag) => {
    if (finalState[`tag:${tag}`]) return;
    synths.push(makeSynth(
      `synth-tag-${tag}-${env.now()}`, `Obtain ${tag}`,
      { skills: {}, tags: [] }, { [tag]: true }
    ));
  });

  if (!synths.length) return path;
  const reqKey = (s) => Math.min(...Object.values(s.reqs?.skills ?? { _: 0 }));
  return [...path, ...synths].sort((a, b) => reqKey(a) - reqKey(b));
}

export function routeMulti(goals, steps, profile, env) {
  env = {
    pinnedExclusions: new Set(),
    manualQuestDone:  new Set(),
    constraints:      [],
    now:              Date.now,
    ...env,
  };
  let skills          = { ...profile.skills };
  let completedIds    = new Set([...env.manualQuestDone]);
  let completedQuests = new Set([...env.manualQuestDone]);
  const excluded      = profile.excludeRegions ?? [];
  let freeSlots       = 28;

  // P1 burndownResolve — resolve goal item/quest reqs into supply+bootstrap steps
  // before bank-split. Returns injected supply steps, sanitized goals (S6 tag-bridge),
  // and demandSet (S8: supply-critical ids that override deferred_until).
  const { injectedSteps, sanitizedGoals, demandSet } = burndownResolve(
    goals,
    steps,
    env.supplyChains ?? [],
    env.coarseExpansions ?? []
  );

  // Sync injected supply steps into the graph so greedy can qualify them.
  if (injectedSteps.length) syncQualEdges(env.graph, injectedSteps);

  // Merge injected supply steps into the full step pool (supply steps first for
  // dep-ordering; dedup by id so original steps aren't duplicated if burndown
  // re-wraps a step that already exists in the bank).
  const injectedIds = new Set(injectedSteps.map((s) => s.id));
  const mergedSteps = [
    ...injectedSteps,
    ...steps.filter((s) => !injectedIds.has(s.id)),
  ];

  // Expose demandSet on env so overlay.js / sequencer (Lane 3) can access it (S8).
  env.demandSet = demandSet;

  // S8 — every goal queued in this routeMulti call is "active" for deferred_until
  // purposes (all goals here are simultaneously queued, not routed in isolation).
  env.activeGoalIds = new Set(sanitizedGoals.map((g) => g.id));

  // P2 bank split (M2) — merge _steerPoint onto matching steps (steer_id FK ->
  // env.steerPoints, i.e. steer_points.jsonl) before the active/overlay split, per
  // the SYNTHESIS P2 pass contract. Unconditional and inert without costModelV2
  // (see costFor's steerDiscount) — costs stay untouched either way.
  const steeredSteps = mergeSteerPoints(mergedSteps, env.steerPoints ?? []);

  // P2 bank split — exclude slot-typed steps (background/passive) from the greedy heap;
  // they are woven back in by weaveOverlays (P4) after routing.
  const activeSteps  = steeredSteps.filter((s) => !s.slot || s.slot.type === "alternation");
  const overlaySteps = steeredSteps.filter((s) => s.slot && s.slot.type !== "alternation");

  const path = sanitizedGoals.flatMap((goal) => {
    const skillsAtGoalStart = { ...skills };
    const r = routeGoal(env, activeSteps, profile, goal, skills, completedIds, completedQuests, excluded, freeSlots);
    skills          = r.skills;
    completedIds    = r.completedIds;
    completedQuests = r.completedQuests;
    freeSlots       = r.freeSlots;

    const filled = synthFillGaps(env, r.path, normalizeReqs(goal.reqs), r.skills, skillsAtGoalStart);
    const synthSteps = filled.filter((s) => s._synthetic);
    skills = fromState(synthSteps.reduce(
      (st, s) => env.graph.coalesce(env.graph.edgesFrom("step:grant", s.id), st),
      toState(r.skills)
    ));

    const capstone = {
      id:         `capstone-${goal.id}`,
      label:      goal.label,
      detail:     reqsSummary(goal.reqs),
      reqs:       goal.reqs ?? {},
      grants:     goal.grants ?? {},
      tags:       ["capstone"],
      _goalLabel: goal.label,
      _capstone:  true,
    };
    return [...filled, capstone];
  });

  // P4 weaveOverlays — inject background/passive overlay steps at break anchors.
  return weaveOverlays(path, overlaySteps, { ...env, profile });
}
