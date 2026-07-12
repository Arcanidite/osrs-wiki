// Shared planner tuning constants.
// Mirrored in tools/guide-export/enrich.py (TUNING dict).
// Values marked PLACEHOLDER must be calibrated from measured runs — never estimate.

// Default wall-clock minutes per step when est_minutes is null.
// PLACEHOLDER — calibrate from measured session telemetry (Lane 6).
export const DEFAULT_STEP_MIN = 30;

// Steer-point anchor_weight thresholds (S3).
// Hard boundary: always creates a named "Toward <label>" phase.
export const STEER_HARD_THRESHOLD = 0.8;
// Soft boundary: becomes a phase only on the critical path of >=2 downstream milestones.
export const STEER_SOFT_THRESHOLD = 0.5;

// ── Lane M2 — linearizer cost-model v2 (MATERIALIZATION.md §1c / Lane M2) ──

// DEFAULT-OFF gate. The steer-point compounding discount and the est_minutes-aware
// cardinal cost (below) only engage when this — or its runtime override
// `env.tuning.costModelV2` (same override channel overlay.js already uses for
// defaultStepMin) — is true. Off, `costFor` is byte-identical to the pre-M2 ladder,
// so the pinned baseline (tests/fixtures/baseline-routes.json, owned by Lane F1 this
// cycle) never drifts until the model is calibrated and explicitly opted into.
export const COST_MODEL_V2 = false;

// costFor ladder (MATERIALIZATION §1c) — named so no bare numeric weight lives in
// greedy.js. Ordinal skeleton: SUPPLY_COST < QUEST_XP_COST < (STEER_COST_DISCOUNT ×
// style/cardinal tier) < plain style/cardinal tier.
// Supply steps are a hard requisite — always first when useful (S6/S3).
export const SUPPLY_COST = 0.0001;
// Quest reward XP banks before any grind (questXpUseful prunes covered training).
export const QUEST_XP_COST = 0.001;
// Compounding-unlock discount (SYNTHESIS P3 contract): a step tagged with a hard
// steer point (anchor_weight >= STEER_HARD_THRESHOLD) halves its own cost, pulling
// it ahead of equal-cost filler — MATERIALIZATION §1c "what gets pulled forward."
export const STEER_COST_DISCOUNT = 0.5;

// Bottom-rung style-cost tier (baseline semantics, unchanged — just named per house
// convention: no bare numeric weight outside tuning.js).
export const STYLE_BASE_COST      = 1;    // balanced default; gp non-money; afk inv_used fallback
export const EFFICIENT_NO_XP_COST = 100;  // "efficient" style, zero-xp step penalty
export const GP_MONEY_COST        = 0.5;  // "gp" style, tags include "money"
