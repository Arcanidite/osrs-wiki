// World client — walk the real extracted map, top-down 2D, standalone.
//
// What this is: a canvas client over the RuneLite cache map dump
// (assets/data/cache/map/*.png.gz — 1,150 regions, 64×64 tiles at 4px/tile,
// terrain-only). Movement follows documented OSRS tick mechanics: one game
// tick = 600 ms; walking covers 1 tile/tick, running 2 tiles/tick
// (source: OSRS Wiki "Game tick", 2026-07-06).
//
// What this is NOT (honesty ledger — see BACKLOG [client:*]):
//   - no collision: the dump has no tile movement flags, so walls/water don't block
//   - no NPCs/objects in the world: locations.pack is empty (stale XTEA keys)
//   - no game simulation: combat/quests/drops live on Jagex servers, not in
//     RuneLite or the cache — they cannot be extracted, only re-implemented

const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
const MAP = `${BASE}/assets/data/cache/map`;
const REGION_TILES = 64;    // tiles per region side
const SRC_PX = 4;           // px per tile in the dump PNGs
const TICK_MS = 600;        // OSRS game tick
const WALK = 1, RUN = 2;    // tiles per tick

// Center-of-region spawn points, ranked by terrain detail in the dump.
const LANDMARKS = [
  { rid: 3614, x: 928,  y: 1952 },
  { rid: 3230, x: 800,  y: 10144 },
  { rid: 4635, x: 1184, y: 1760 },
  { rid: 7195, x: 1824, y: 1760 },
  { rid: 3096, x: 800,  y: 1568 },
  { rid: 4374, x: 1120, y: 1440 },
  { rid: 3357, x: 864,  y: 1888 },
  { rid: 3483, x: 864,  y: 9952 },
];

const root = document.getElementById("world-root");

async function init() {
  if (!root) return;
  if (typeof DecompressionStream === "undefined") {
    root.innerHTML = "<p>This browser lacks DecompressionStream (needed to read the gzipped map chunks).</p>";
    return;
  }
  const manifest = await fetch(`${MAP}/manifest.json`).then((r) => r.json());
  // region lookup by base-coords key "bx,by"
  const byBase = new Map(Object.entries(manifest).map(([rid, v]) => [`${v.bx},${v.by}`, rid]));

  root.innerHTML = `
    <div class="wc-hud">
      <span class="wc-pos"></span>
      <label><input type="checkbox" class="wc-run"> run (2 tiles/tick)</label>
      <span class="wc-zoom">zoom
        <button data-z="2">×2</button><button data-z="4" class="active">×4</button><button data-z="8">×8</button>
      </span>
      <select class="wc-landmark">
        <option value="">jump to region… (debug)</option>
        ${LANDMARKS.map((l) => `<option value="${l.x},${l.y}">region ${l.rid} (${l.x}, ${l.y})</option>`).join("")}
      </select>
      <span class="wc-tick"></span>
    </div>
    <canvas class="wc-canvas" tabindex="0"></canvas>
    <p class="wc-help">Click to walk · WASD/arrows to step · toggle run · 600 ms game ticks.
      Terrain only — collision, NPCs and objects need data the current dump doesn't have (see page notes).</p>`;

  const canvas = root.querySelector(".wc-canvas");
  const ctx = canvas.getContext("2d");
  const posEl = root.querySelector(".wc-pos");
  const tickEl = root.querySelector(".wc-tick");
  const runEl = root.querySelector(".wc-run");

  let tilePx = 16; // ×4 zoom of 4px source
  const fit = () => {
    canvas.width = root.clientWidth;
    canvas.height = Math.max(420, Math.round(window.innerHeight * 0.62));
  };
  fit();
  window.addEventListener("resize", () => { fit(); });

  // ── region bitmap cache (LRU) ─────────────────────────────────────────────
  const bitmaps = new Map(); // rid -> ImageBitmap | "loading" | "missing"
  const lru = [];
  async function loadRegion(rid) {
    if (bitmaps.has(rid)) return;
    bitmaps.set(rid, "loading");
    try {
      const res = await fetch(`${MAP}/${rid}.png.gz`);
      if (!res.ok) throw new Error(String(res.status));
      const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      const blob = await new Response(stream).blob();
      const bmp = await createImageBitmap(blob);
      bitmaps.set(rid, bmp);
      lru.push(rid);
      if (lru.length > 80) {
        const old = lru.shift();
        const b = bitmaps.get(old);
        if (b instanceof ImageBitmap) b.close();
        bitmaps.delete(old);
      }
    } catch {
      bitmaps.set(rid, "missing");
    }
  }

  // ── player / tick state ───────────────────────────────────────────────────
  const spawn = LANDMARKS[0];
  const player = { x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y }; // px/py = previous tick (for lerp)
  let path = [];          // queued tiles
  let tick = 0;
  const keys = new Set();

  function bresenham(x0, y0, x1, y1) {
    const out = [];
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      out.push({ x, y });
    }
    return out;
  }

  function doTick() {
    tick++;
    player.px = player.x; player.py = player.y;
    const speed = runEl.checked ? RUN : WALK;
    // keyboard steering overrides queued path
    const kdx = (keys.has("d") || keys.has("arrowright")) - (keys.has("a") || keys.has("arrowleft"));
    const kdy = (keys.has("w") || keys.has("arrowup")) - (keys.has("s") || keys.has("arrowdown"));
    if (kdx || kdy) {
      path = [];
      player.x += kdx * speed;
      player.y += kdy * speed;
    } else {
      for (let i = 0; i < speed && path.length; i++) {
        const next = path.shift();
        player.x = next.x; player.y = next.y;
      }
    }
    posEl.textContent = `(${player.x}, ${player.y})`;
    tickEl.textContent = `tick ${tick}`;
  }
  let lastTick = performance.now();
  setInterval(() => { lastTick = performance.now(); doTick(); }, TICK_MS);

  // ── input ─────────────────────────────────────────────────────────────────
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const wx = Math.floor(cam().x + (e.clientX - r.left - canvas.width / 2) / tilePx);
    const wy = Math.floor(cam().y - (e.clientY - r.top - canvas.height / 2) / tilePx);
    path = bresenham(player.x, player.y, wx, wy);
    canvas.focus();
  });
  canvas.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "r") { runEl.checked = !runEl.checked; e.preventDefault(); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      keys.add(k); e.preventDefault();
    }
  });
  canvas.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("blur", () => keys.clear());
  root.querySelectorAll(".wc-zoom button").forEach((b) =>
    b.addEventListener("click", () => {
      tilePx = SRC_PX * +b.dataset.z;
      root.querySelectorAll(".wc-zoom button").forEach((x) => x.classList.toggle("active", x === b));
    }));
  root.querySelector(".wc-landmark").addEventListener("change", (e) => {
    if (!e.target.value) return;
    const [x, y] = e.target.value.split(",").map(Number);
    player.x = player.px = x; player.y = player.py = y;
    path = [];
    e.target.value = "";
  });

  // ── render ────────────────────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const cam = () => {
    const t = Math.min(1, (performance.now() - lastTick) / TICK_MS);
    return { x: lerp(player.px, player.x, t) + 0.5, y: lerp(player.py, player.y, t) + 0.5 };
  };

  function draw() {
    const c = cam();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1e2a38"; // void
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const halfW = canvas.width / 2 / tilePx, halfH = canvas.height / 2 / tilePx;
    const rx0 = Math.floor((c.x - halfW) / REGION_TILES) * REGION_TILES;
    const ry0 = Math.floor((c.y - halfH) / REGION_TILES) * REGION_TILES;
    for (let bx = rx0; bx < c.x + halfW; bx += REGION_TILES) {
      for (let by = ry0; by < c.y + halfH; by += REGION_TILES) {
        const rid = byBase.get(`${bx},${by}`);
        if (!rid) continue;
        const bmp = bitmaps.get(rid);
        if (bmp === undefined) loadRegion(rid);
        if (!(bmp instanceof ImageBitmap)) continue;
        // region top-left pixel is world (bx, by+64); screen y grows downward
        const sx = (bx - c.x) * tilePx + canvas.width / 2;
        const sy = (c.y - (by + REGION_TILES)) * tilePx + canvas.height / 2;
        ctx.drawImage(bmp, sx, sy, REGION_TILES * tilePx, REGION_TILES * tilePx);
      }
    }

    // destination marker
    const dest = path[path.length - 1];
    if (dest) {
      const dx = (dest.x - c.x) * tilePx + canvas.width / 2;
      const dy = (c.y - dest.y) * tilePx + canvas.height / 2 - tilePx;
      ctx.strokeStyle = "#ffd54a";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx + 1, dy + 1, tilePx - 2, tilePx - 2);
    }

    // player avatar — simple retro figure, drawn procedurally (UI, not game data)
    const psx = canvas.width / 2, psy = canvas.height / 2;
    const s = tilePx / 16;
    const moving = path.length || keys.size;
    const bob = moving ? Math.sin(performance.now() / 90) * 1.5 * s : 0;
    ctx.fillStyle = "#00000055";
    ctx.beginPath();
    ctx.ellipse(psx, psy + 6 * s, 5 * s, 2.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d2c1e"; // boots
    ctx.fillRect(psx - 3 * s, psy + 2 * s + bob, 2.4 * s, 3 * s);
    ctx.fillRect(psx + 0.6 * s, psy + 2 * s - bob, 2.4 * s, 3 * s);
    ctx.fillStyle = "#2f5f9e"; // torso
    ctx.fillRect(psx - 3.6 * s, psy - 4 * s, 7.2 * s, 6.4 * s);
    ctx.fillStyle = "#e0b089"; // head
    ctx.fillRect(psx - 2.4 * s, psy - 9 * s, 4.8 * s, 4.8 * s);
    ctx.fillStyle = "#6b4a2b"; // hair
    ctx.fillRect(psx - 2.4 * s, psy - 9.6 * s, 4.8 * s, 1.6 * s);

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  canvas.focus();
}

init();
