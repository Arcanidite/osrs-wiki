// NPC wander AI. Pure and node-tested.
//
// SOURCED (OSRS Wiki "Non-player character" / community server research,
// stamp 2026-07-07): ambient NPCs wander a bounded area around their spawn
// point and never leave it; wandering respects the same static collision as
// players. Step cadence is server data Jagex never published:
//   WANDER_RADIUS 5      RSPS-derived (rsmod@fa13b3f NpcTypeBuilder.kt
//                        DEFAULT_WANDER_RANGE=5; 2004scape's per-npc
//                        wanderrange corpus peaks at 3) — approximation;
//                        real per-npc ranges exist and aren't modelled
//   WANDER_STEP_TICKS 3  (~1.8 s between steps — UNKNOWN placeholder cadence)
//   WANDER_RETRY_TICKS 2 (retry delay after a blocked/refused step)
import { canStep } from "./collision.js";

export const WANDER_RADIUS = 5;      // RSPS-derived default (see header)
export const WANDER_STEP_TICKS = 3;  // UNKNOWN placeholder (~1.8 s cadence)
export const WANDER_RETRY_TICKS = 2; // UNKNOWN placeholder

// One wander attempt for npc {x, y, spawnX, spawnY}: pick a random direction
// (dx, dy ∈ {-1, 0, 1}, not both 0); the step must stay within WANDER_RADIUS
// (Chebyshev) of the spawn point and pass collision.
// → {x, y} new position, or null (refused: no move this attempt)
export function npcWanderStep(npc, flagsAt, rng = Math.random) {
  const dx = Math.floor(rng() * 3) - 1;
  const dy = Math.floor(rng() * 3) - 1;
  if (!dx && !dy) return null;
  const nx = npc.x + dx, ny = npc.y + dy;
  const sx = npc.spawnX ?? npc.x, sy = npc.spawnY ?? npc.y;
  if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) > WANDER_RADIUS) return null;
  if (!canStep(flagsAt, npc.x, npc.y, dx, dy)) return null;
  return { x: nx, y: ny };
}
