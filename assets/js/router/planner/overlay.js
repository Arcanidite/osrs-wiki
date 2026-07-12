// overlay.js — post-greedy overlay weaving (S2, S7).
// Single injector: merges injectSlots + weaveBackground into ONE pass so no
// two injectors fight over anchors.
//
// Pipeline position: P4 (after routeMulti greedy, before enrich detach).
// Pass contract: reads overlaySteps (slot-typed), est_minutes cumsum, isBreak();
// writes injected {_bg, _bg_lifecycle} nodes each with _anchor:<stepId> + _side:before|after.

import { DEFAULT_STEP_MIN } from "./tuning.js";

const BREAK_TAGS = new Set(["break", "banking", "teleport", "quest"]);

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

// P4 — weaveOverlays(path, overlaySteps, env) minimal Lane 1 implementation.
//
// Background steps:
//   - Setup injected (_side:"before") at the first isBreak() anchor where the
//     step is eligible (no skill reqs unmet).
//   - Cadence chips injected at subsequent break anchors where the cumulative
//     wall-clock (est_minutes sum) >= nextFire threshold.
//     If cadence_min is null (event-driven), only setup is ever injected.
//
// Every injected node carries: _anchor:<anchorStepId>, _side:"before"|"after",
// _bg:true, _bg_lifecycle:<state-transition-label>.
//
// env.tuning.defaultStepMin overrides DEFAULT_STEP_MIN at runtime.
export function weaveOverlays(path, overlaySteps, env) {
  if (!overlaySteps || overlaySteps.length === 0) return path;

  const stepMin = env?.tuning?.defaultStepMin ?? DEFAULT_STEP_MIN;

  // Per-bg state: { setupDone, nextFireMin }
  const bgState = new Map(
    overlaySteps
      .filter((s) => s.slot?.type === "background")
      .map((s) => [s.id, { setupDone: false, nextFireMin: null }])
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
          result.push({
            ...bg,
            id: `${bg.id}-setup`,
            label: `Set up: ${bg.label}`,
            _anchor: step.id,
            _side: "before",
            _bg: true,
            _bg_lifecycle: `${bg.slot?.lifecycle?.initial ?? "idle"}->active`,
          });
          state.setupDone = true;
          state.nextFireMin =
            bg.slot?.cadence_min != null ? cumMinutes + bg.slot.cadence_min : null;
        } else if (
          bg.slot?.cadence_min != null &&
          state.nextFireMin != null &&
          cumMinutes >= state.nextFireMin
        ) {
          // Inject cadence chip before the break step.
          result.push({
            ...bg,
            id: `${bg.id}-chip-${Math.floor(cumMinutes)}`,
            label: `Check: ${bg.label}`,
            _anchor: step.id,
            _side: "before",
            _bg: true,
            _bg_lifecycle: "collect->replant",
          });
          state.nextFireMin = cumMinutes + bg.slot.cadence_min;
        }
      }
    }

    result.push(step);
    cumMinutes += step.est_minutes ?? stepMin;
    prev = step;
  }

  return result;
}
