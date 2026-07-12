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
