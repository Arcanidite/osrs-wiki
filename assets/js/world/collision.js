// Collision + movement rules for the world client. Pure and DOM-free
// (node-tested in tests/collision.test.js).
//
// Tile flags (u16, produced by tools/openrs2_extract.py from the real cache):
// wall edges are mirrored onto both neighbouring tiles at build time, corner
// flags come from pillar/corner wall locs, FULL covers terrain-blocked tiles,
// diagonal walls, object footprints and clipped floor decorations.
//
// Movement semantics follow the game's static clipping rules for a 1×1
// entity: cardinal steps check the shared edge; diagonal steps additionally
// require both L-shaped cardinal routes to be clear (no corner cutting).

export const WALL_N = 1, WALL_E = 2, WALL_S = 4, WALL_W = 8;
export const CORNER_NE = 16, CORNER_SE = 32, CORNER_SW = 64, CORNER_NW = 128;
export const FULL = 256;

// `get(x, y)` returns the tile's flag word, or null when the tile's region
// isn't loaded — unloaded ground is treated as impassable.
const flags = (get, x, y) => {
  const f = get(x, y);
  return f == null ? FULL : f;
};

const blocked = (get, x, y) => (flags(get, x, y) & FULL) !== 0;

function canCardinal(get, x, y, dx, dy) {
  const [ownWall, destWall] =
    dx === 1 ? [WALL_E, WALL_W] :
    dx === -1 ? [WALL_W, WALL_E] :
    dy === 1 ? [WALL_N, WALL_S] : [WALL_S, WALL_N];
  if (flags(get, x, y) & ownWall) return false;
  const dest = flags(get, x + dx, y + dy);
  return (dest & (FULL | destWall)) === 0;
}

export function canStep(get, x, y, dx, dy) {
  if (!dx && !dy) return false;
  if (dx && dy) {
    const [ownCorner, destCorner] =
      dx === 1 && dy === 1 ? [CORNER_NE, CORNER_SW] :
      dx === 1 && dy === -1 ? [CORNER_SE, CORNER_NW] :
      dx === -1 && dy === -1 ? [CORNER_SW, CORNER_NE] : [CORNER_NW, CORNER_SE];
    if (flags(get, x, y) & ownCorner) return false;
    if (flags(get, x + dx, y + dy) & destCorner) return false;
    if (blocked(get, x + dx, y + dy)) return false;
    // both L-routes must be walkable: via (x+dx, y) and via (x, y+dy)
    return (
      canCardinal(get, x, y, dx, 0) && canCardinal(get, x + dx, y, 0, dy) &&
      canCardinal(get, x, y, 0, dy) && canCardinal(get, x, y + dy, dx, 0)
    );
  }
  return canCardinal(get, x, y, dx, dy);
}

// Wall-loc edge mapping — mirrors the extractor's collision builder
// (tools/openrs2_extract.py wall_flags). Used by the client to toggle door
// passage: opening a door clears exactly the edges its closed state set.
// → { own: mask on the loc tile, neighbours: [{dx, dy, mask}] }
export function wallEdges(locType, rot) {
  if (locType === 0 || locType === 2) {
    const sides = {
      0: [WALL_W, { dx: -1, dy: 0, mask: WALL_E }],
      1: [WALL_N, { dx: 0, dy: 1, mask: WALL_S }],
      2: [WALL_E, { dx: 1, dy: 0, mask: WALL_W }],
      3: [WALL_S, { dx: 0, dy: -1, mask: WALL_N }],
    };
    let own = sides[rot][0];
    const neighbours = [sides[rot][1]];
    if (locType === 2) {
      const r2 = (rot + 1) & 3;
      own |= sides[r2][0];
      neighbours.push(sides[r2][1]);
    }
    return { own, neighbours };
  }
  if (locType === 1 || locType === 3) {
    const corners = {
      0: [CORNER_NW, { dx: -1, dy: 1, mask: CORNER_SE }],
      1: [CORNER_NE, { dx: 1, dy: 1, mask: CORNER_SW }],
      2: [CORNER_SE, { dx: 1, dy: -1, mask: CORNER_NW }],
      3: [CORNER_SW, { dx: -1, dy: -1, mask: CORNER_NE }],
    };
    return { own: corners[rot][0], neighbours: [corners[rot][1]] };
  }
  return { own: 0, neighbours: [] };
}

// The game's checked directions, in its evaluation order.
const DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],        // W E S N
  [-1, -1], [1, -1], [-1, 1], [1, 1],      // SW SE NW NE
];

// BFS over a bounded window (the game searches a 128×128 area). Returns the
// tile path (excluding start); when the target is unreachable, routes to the
// nearest reachable tile to the target (approach behaviour).
export function findPath(get, sx, sy, tx, ty, { window: win = 128, maxLen = 4096 } = {}) {
  const half = win >> 1;
  const x0 = sx - half, y0 = sy - half;
  const inWin = (x, y) => x >= x0 && x < x0 + win && y >= y0 && y < y0 + win;
  if (!inWin(tx, ty)) {
    // clamp target into the search window edge
    tx = Math.max(x0, Math.min(x0 + win - 1, tx));
    ty = Math.max(y0, Math.min(y0 + win - 1, ty));
  }
  const idx = (x, y) => (y - y0) * win + (x - x0);
  const prev = new Int32Array(win * win).fill(-1);
  const seen = new Uint8Array(win * win);
  seen[idx(sx, sy)] = 1;
  let queue = [[sx, sy]];
  let best = [sx, sy];
  const dist = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty));
  let bestDist = dist(sx, sy);

  while (queue.length) {
    const next = [];
    for (const [x, y] of queue) {
      if (x === tx && y === ty) { best = [x, y]; queue = []; break; }
      const d = dist(x, y);
      if (d < bestDist) { bestDist = d; best = [x, y]; }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inWin(nx, ny) || seen[idx(nx, ny)]) continue;
        if (!canStep(get, x, y, dx, dy)) continue;
        seen[idx(nx, ny)] = 1;
        prev[idx(nx, ny)] = idx(x, y);
        next.push([nx, ny]);
      }
    }
    if (!queue.length) break;
    queue = next;
  }

  // reconstruct to `best` (target if reached, else nearest approach)
  const path = [];
  let ci = idx(best[0], best[1]);
  const si = idx(sx, sy);
  while (ci !== si && ci !== -1) {
    const x = x0 + (ci % win), y = y0 + Math.floor(ci / win);
    path.push({ x, y });
    ci = prev[ci];
    if (path.length > maxLen) return [];
  }
  path.reverse();
  return path;
}
