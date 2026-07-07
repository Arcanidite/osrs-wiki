// Vertical movement conventions — pure, node-tested.
//
// The cache stores WHERE climbable objects are and their real actions, but
// each object's exact destination is server-side data. We use the game's
// documented coordinate conventions instead (labelled as such on /play):
//   - upper floors are planes 1–3 at the same (x, y); stairs/ladders move
//     one plane up/down at the object's tile
//   - underground areas are mapped 6,400 tiles north of their surface
//     location (the standard dungeon band), so trapdoors/cellar ladders on
//     the ground floor go to (x, y + 6400) and climbing up from a dungeon
//     returns to (x, y − 6400)
// Destinations still settle onto the nearest walkable mapped tile; if the
// target area has no map/collision data we refuse rather than guess.

export const DUNGEON_DY = 6400;
export const MAX_PLANE = 3;

export function isClimbAction(action) {
  return action === "Climb-up" || action === "Climb-down";
}

export function climbDestination({ x, y, plane }, action) {
  const underground = y >= DUNGEON_DY;
  if (action === "Climb-up") {
    if (plane === 0 && underground) return { x, y: y - DUNGEON_DY, plane: 0, kind: "surface" };
    if (plane < MAX_PLANE) return { x, y, plane: plane + 1, kind: "up" };
    return null;
  }
  if (action === "Climb-down") {
    if (plane === 0) {
      if (underground) return null; // no second underground band
      return { x, y: y + DUNGEON_DY, plane: 0, kind: "dungeon" };
    }
    return { x, y, plane: plane - 1, kind: "down" };
  }
  return null;
}

// Spiral outward from (x, y) to the nearest walkable tile. `flags(x, y)` may
// return null for unmapped/unloaded tiles. Returns {x, y} or null.
export function settleTile(flags, x, y, fullBit, radius = 6) {
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const f = flags(x + dx, y + dy);
        if (f != null && (f & fullBit) === 0) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}
