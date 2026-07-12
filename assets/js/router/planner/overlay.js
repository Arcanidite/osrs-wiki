// overlay.js — post-greedy overlay weaving (S2, S7).
// Single injector: merges injectSlots + weaveBackground into ONE pass so no
// two injectors fight over anchors.
//
// Pipeline position: P4 (after routeMulti greedy, before enrich detach).
// Pass contract: reads overlaySteps (slot-typed), est_minutes cumsum, isBreak(),
// lifecycle guards, supply_threshold_jit (planner-time stock=0 => conservative
// AOT); writes injected {_bg, _bg_lifecycle} / {_alternation} nodes each with
// _anchor:<stepId> + _side:before|after, and _passiveOverlays annotations on
// ACTIVE host steps (Lane 3 — never on bg chips).

import { DEFAULT_STEP_MIN } from "./tuning.js";

const BREAK_TAGS = new Set(["break", "banking", "teleport", "quest"]);

// 3+ consecutive same-region ACTIVE steps get one alternation card (Lane 3
// sequencer pattern) — a round-robin hint that the run's order is free.
const ALTERNATION_MIN_RUN = 3;

// S2 — canonical break predicate. Lives here; weaveOverlays is the only consumer.
// A step is a break anchor iff:
//   - its tags include "break", "banking", "teleport", or "quest", OR
//   - its location.region differs from the previous step's (implicit region transition).
export function isBreak(prev, step) {
  if ((step.tags ?? []).some((t) => BREAK_TAGS.has(t))) return true;
  const prevRegion = prev?.location?.region;
  const stepRegion = step?.location?.region;
  if (
    prevRegion && stepRegion &&
    prevRegion !== "global" && stepRegion !== "global" &&
    prevRegion !== stepRegion
  ) return true;
  return false;
}

// Lifecycle guards (S9 slot.lifecycle) — derive the transition from the step's
// OWN declared `states` (an ordered, wrapping cycle when `transitions` is empty
// — content hasn't spelled out explicit edges yet) instead of inventing a label
// outside the declared vocabulary. No declared states -> null (MANUAL, honest).
function nextLifecycleState(states, current) {
  if (!states || !states.length) return null;
  const idx = states.indexOf(current);
  if (idx === -1) return states[0];
  return states[(idx + 1) % states.length];
}

// P4 planner-time JIT threshold (S9 slot.supply_threshold_jit): the plugin
// (Lane 6) reads live ItemManager bank stock; the planner has no such signal
// and must not invent one. Conservative rule: model stock as always 0, i.e.
// always below any positive threshold, so a JIT-threshold background step
// checks at EVERY eligible break instead of waiting on a cadence timer the
// planner can't evaluate for real (conservative AOT). Cadence-only steps still
// gate on cumMinutes >= nextFireMin.
function isCheckDue(bg, state, cumMinutes) {
  if (bg.slot?.supply_threshold_jit) return true;
  return bg.slot?.cadence_min != null && state.nextFireMin != null && cumMinutes >= state.nextFireMin;
}

// Lane 3 — passive embeds_into: annotate every ACTIVE host step whose tags
// intersect a passive step's slot.embeds_into with a zero-time _passiveOverlays
// badge. Bg chips are structurally skipped (never a host — sequencer OQ-6), so
// the badge always lands on a real ACTIVE step carrying the tag. Returns a NEW
// array (never mutates the shared step objects from steps.jsonl — routeMulti
// may run repeatedly over the same bank in tests/the web view).
function resolvePassiveOverlays(result, overlaySteps) {
  const passives = (overlaySteps ?? []).filter((s) => s.slot?.type === "passive");
  if (!passives.length) return result;

  return result.map((host) => {
    if (host._bg) return host; // never badge a chip
    const labels = passives
      .filter((p) => (p.slot?.embeds_into ?? []).some((t) => (host.tags ?? []).includes(t)))
      .map((p) => p.label);
    if (!labels.length) return host;
    return { ...host, _passiveOverlays: [...(host._passiveOverlays ?? []), ...labels] };
  });
}

// Lane 3 — alternation markers: 3+ consecutive same-region ACTIVE steps (a bg
// chip or a region change breaks the run) get one alternation card pinned
// _anchor/_side:"before" the run's first member — same detach/reattach
// contract as _bg nodes (P5/P9), so a later hub reorder keeps the card pinned.
function injectAlternationMarkers(result) {
  const markers = [];
  let i = 0;
  while (i < result.length) {
    const region = result[i]._bg ? null : result[i].location?.region;
    let j = i + 1;
    if (region && region !== "global") {
      while (j < result.length && !result[j]._bg && result[j].location?.region === region) j++;
    }
    if (j - i >= ALTERNATION_MIN_RUN) {
      markers.push({
        id: `alternation-${result[i].id}`,
        label: `Rotate: ${region}`,
        location: { region },
        _alternation: true,
        _alternation_members: result.slice(i, j).map((s) => s.id),
        _anchor: result[i].id,
        _side: "before",
      });
    }
    i = j;
  }
  if (!markers.length) return result;

  const beforeAnchor = new Map(markers.map((m) => [m._anchor, m]));
  const out = [];
  for (const step of result) {
    if (beforeAnchor.has(step.id)) out.push(beforeAnchor.get(step.id));
    out.push(step);
  }
  return out;
}

// P4 — weaveOverlays(path, overlaySteps, env).
//
// Background steps:
//   - Setup injected (_side:"before") at the first isBreak() anchor where the
//     step is eligible (no skill reqs unmet).
//   - Cadence/JIT-threshold chips injected at subsequent break anchors (S9;
//     see isCheckDue). If cadence_min is null and no supply_threshold_jit is
//     set (event-driven), only setup is ever injected.
// Passive steps (Lane 3): never their own card — resolvePassiveOverlays badges
// the matching ACTIVE host steps after the main pass.
// Alternation cards (Lane 3): injectAlternationMarkers scans the finished
// result for 3+ consecutive same-region actives.
//
// Every injected bg/alternation node carries: _anchor:<anchorStepId>,
// _side:"before"|"after", so P5/P9 in enrich.py can re-pin it after reordering.
//
// env.tuning.defaultStepMin overrides DEFAULT_STEP_MIN at runtime.
export function weaveOverlays(path, overlaySteps, env) {
  // Lane 3: alternation markers and passive badges don't depend on overlaySteps
  // existing at all, so an empty/absent overlay bank must NOT short-circuit the
  // whole pass — only the background-chip loop below has anything to skip.
  overlaySteps = overlaySteps ?? [];

  const stepMin = env?.tuning?.defaultStepMin ?? DEFAULT_STEP_MIN;

  // Per-bg state: { setupDone, nextFireMin, lifecycleState }
  const bgState = new Map(
    overlaySteps
      .filter((s) => s.slot?.type === "background")
      .map((s) => [s.id, {
        setupDone: false,
        nextFireMin: null,
        lifecycleState: s.slot?.lifecycle?.initial ?? null,
      }])
  );

  const result = [];
  let cumMinutes = 0;
  let prev = null;

  for (const step of path) {
    const atBreak = isBreak(prev, step);

    if (atBreak) {
      // Walk overlay steps eligible at this break.
      for (const bg of overlaySteps) {
        if (bg.slot?.type !== "background") continue;
        const state = bgState.get(bg.id);
        if (!state) continue;

        // Eligibility: no skill reqs unmet (using path-accumulated grants is
        // Lane 3's job; Lane 1 uses zero-skill baseline since bg-farm-allotment
        // has no skill requirements).
        const bgSkills = (bg.reqs?.skills) ?? {};
        const profileSkills = env?.profile?.skills ?? {};
        const eligible = Object.entries(bgSkills).every(
          ([sk, lvl]) => (profileSkills[sk] ?? 1) >= lvl
        );
        if (!eligible) continue;

        if (!state.setupDone) {
          // Inject setup before the break step.
          const states = bg.slot?.lifecycle?.states;
          const from = state.lifecycleState;
          const to = nextLifecycleState(states, from);
          result.push({
            ...bg,
            id: `${bg.id}-setup`,
            label: `Set up: ${bg.label}`,
            _anchor: step.id,
            _side: "before",
            _bg: true,
            _bg_lifecycle: to ? `${from}->${to}` : null,
          });
          state.setupDone = true;
          state.lifecycleState = to ?? from;
          state.nextFireMin =
            bg.slot?.cadence_min != null ? cumMinutes + bg.slot.cadence_min : null;
        } else if (isCheckDue(bg, state, cumMinutes)) {
          // Inject cadence/JIT-threshold chip before the break step.
          const states = bg.slot?.lifecycle?.states;
          const from = state.lifecycleState;
          const to = nextLifecycleState(states, from);
          result.push({
            ...bg,
            id: `${bg.id}-chip-${Math.floor(cumMinutes)}`,
            label: `Check: ${bg.label}`,
            _anchor: step.id,
            _side: "before",
            _bg: true,
            _bg_lifecycle: to ? `${from}->${to}` : null,
          });
          state.lifecycleState = to ?? from;
          state.nextFireMin =
            bg.slot?.cadence_min != null ? cumMinutes + bg.slot.cadence_min : state.nextFireMin;
        }
      }
    }

    result.push(step);
    cumMinutes += step.est_minutes ?? stepMin;
    prev = step;
  }

  return injectAlternationMarkers(resolvePassiveOverlays(result, overlaySteps));
}
