// World client — walk the real game world, top-down 2D, with the game's
// static collision. Data comes from tools/openrs2_extract.py (OpenRS2 cache
// 2499, build 236): true-coordinate map tiles + per-tile collision flags
// (terrain block flags, wall edges, corners, object footprints).
//
// Movement is tick-true: 600 ms game ticks, 1 tile/tick walking, 2 running,
// click-to-walk uses the game-style BFS with no corner cutting
// (assets/js/world/collision.js — node-tested).
//
// Still missing (BACKLOG [client:*]): NPCs/objects rendered in the world and
// the simulation itself (server-side at Jagex; must be re-implemented from
// sourced mechanics, never guessed).

import { canStep, findPath, FULL, WALL_N, WALL_E, WALL_S, WALL_W } from "../world/collision.js";

const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
const MAP = `${BASE}/assets/data/cache/map`;
const COL = `${BASE}/assets/data/cache/collision`;
const REGION = 64;
const SRC_PX = 4;
const TICK_MS = 600;

// Well-known world coordinates (public game knowledge).
const LANDMARKS = [
  { name: "Lumbridge", x: 3222, y: 3218 },
  { name: "Varrock", x: 3212, y: 3424 },
  { name: "Grand Exchange", x: 3164, y: 3487 },
  { name: "Falador", x: 2965, y: 3380 },
  { name: "Draynor Village", x: 3093, y: 3244 },
  { name: "Al Kharid", x: 3293, y: 3186 },
  { name: "Ardougne", x: 2662, y: 3305 },
  { name: "Catherby", x: 2809, y: 3435 },
];

const root = document.getElementById("world-root");

async function gunzip(res) {
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream);
}

async function init() {
  if (!root) return;
  if (typeof DecompressionStream === "undefined") {
    root.innerHTML = "<p>This browser lacks DecompressionStream (needed for the map data).</p>";
    return;
  }
  const manifest = await fetch(`${MAP}/manifest.json`).then((r) => r.json());
  const regionAt = (x, y) => ((x >> 6) << 8) | (y >> 6);

  root.innerHTML = `
    <div class="wc-hud">
      <span class="wc-pos"></span>
      <label><input type="checkbox" class="wc-run"> run</label>
      <label><input type="checkbox" class="wc-col"> show collision</label>
      <span class="wc-zoom">zoom
        <button data-z="2">×2</button><button data-z="4" class="active">×4</button><button data-z="8">×8</button>
      </span>
      <select class="wc-landmark">
        <option value="">travel to…</option>
        ${LANDMARKS.map((l) => `<option value="${l.x},${l.y}">${l.name}</option>`).join("")}
      </select>
      <span class="wc-tick"></span>
    </div>
    <canvas class="wc-canvas" tabindex="0"></canvas>
    <p class="wc-help">Click to walk (blocked by real walls/water/objects) · WASD/arrows to step ·
      R toggles run · C toggles collision overlay · 600 ms game ticks.</p>`;

  const canvas = root.querySelector(".wc-canvas");
  const ctx = canvas.getContext("2d");
  const posEl = root.querySelector(".wc-pos");
  const tickEl = root.querySelector(".wc-tick");
  const runEl = root.querySelector(".wc-run");
  const colEl = root.querySelector(".wc-col");

  let tilePx = 16;
  const fit = () => {
    canvas.width = root.clientWidth;
    canvas.height = Math.max(420, Math.round(window.innerHeight * 0.62));
  };
  fit();
  window.addEventListener("resize", fit);

  // ── region data (bitmaps + collision grids), LRU-capped ─────────────────
  const bitmaps = new Map();   // rid -> ImageBitmap | "loading" | "missing"
  const grids = new Map();     // rid -> Uint16Array | "loading" | "missing"
  const lru = [];
  const evict = () => {
    while (lru.length > 100) {
      const rid = lru.shift();
      const b = bitmaps.get(rid);
      if (b instanceof ImageBitmap) b.close();
      bitmaps.delete(rid);
      grids.delete(rid);
    }
  };
  async function loadRegion(rid) {
    if (bitmaps.has(rid) || !(rid in manifest)) return;
    bitmaps.set(rid, "loading");
    grids.set(rid, "loading");
    try {
      const [imgRes, colRes] = await Promise.all([
        fetch(`${MAP}/${rid}.png.gz`), fetch(`${COL}/${rid}.bin.gz`),
      ]);
      if (!imgRes.ok || !colRes.ok) throw new Error("missing");
      const [blob, buf] = await Promise.all([
        gunzip(imgRes).then((r) => r.blob()),
        gunzip(colRes).then((r) => r.arrayBuffer()),
      ]);
      bitmaps.set(rid, await createImageBitmap(blob));
      grids.set(rid, new Uint16Array(buf));
      lru.push(rid);
      evict();
    } catch {
      bitmaps.set(rid, "missing");
      grids.set(rid, "missing");
    }
  }

  // flags getter for the collision module: null while region not loaded
  const flagsAt = (x, y) => {
    const g = grids.get(regionAt(x, y));
    if (!(g instanceof Uint16Array)) return null;
    return g[(y & 63) * REGION + (x & 63)];
  };

  // ── player / tick state ───────────────────────────────────────────────────
  const spawn = LANDMARKS[0];
  const player = { x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y };
  let path = [];
  let tick = 0;
  const keys = new Set();

  const KEY_DIRS = {
    w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
  };

  function doTick() {
    tick++;
    player.px = player.x; player.py = player.y;
    const speed = runEl.checked ? 2 : 1;
    let kdx = 0, kdy = 0;
    for (const k of keys) {
      const d = KEY_DIRS[k];
      if (d) { kdx += d[0]; kdy += d[1]; }
    }
    kdx = Math.sign(kdx); kdy = Math.sign(kdy);
    if (kdx || kdy) {
      path = [];
      for (let i = 0; i < speed; i++) {
        if (canStep(flagsAt, player.x, player.y, kdx, kdy)) {
          player.x += kdx; player.y += kdy;
        } else if (kdx && kdy) {
          // slide along whichever axis is open (game-like wall sliding)
          if (canStep(flagsAt, player.x, player.y, kdx, 0)) player.x += kdx;
          else if (canStep(flagsAt, player.x, player.y, 0, kdy)) player.y += kdy;
        }
      }
    } else {
      for (let i = 0; i < speed && path.length; i++) {
        const next = path[0];
        // re-validate each step (regions may have loaded since pathing)
        if (canStep(flagsAt, player.x, player.y, next.x - player.x, next.y - player.y)) {
          path.shift();
          player.x = next.x; player.y = next.y;
        } else {
          const dest = path[path.length - 1];
          path = findPath(flagsAt, player.x, player.y, dest.x, dest.y);
          break;
        }
      }
    }
    posEl.textContent = `(${player.x}, ${player.y}) · region ${regionAt(player.x, player.y)}`;
    tickEl.textContent = `tick ${tick}`;
  }
  let lastTick = performance.now();
  setInterval(() => { lastTick = performance.now(); doTick(); }, TICK_MS);

  // ── input ─────────────────────────────────────────────────────────────────
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const c = cam();
    const wx = Math.floor(c.x + (e.clientX - r.left - canvas.width / 2) / tilePx);
    const wy = Math.floor(c.y - (e.clientY - r.top - canvas.height / 2) / tilePx);
    path = findPath(flagsAt, player.x, player.y, wx, wy);
    canvas.focus();
  });
  canvas.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "r") { runEl.checked = !runEl.checked; e.preventDefault(); return; }
    if (k === "c") { colEl.checked = !colEl.checked; e.preventDefault(); return; }
    if (KEY_DIRS[k]) { keys.add(k); e.preventDefault(); }
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
    canvas.focus();
  });

  // ── render ────────────────────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const cam = () => {
    const t = Math.min(1, (performance.now() - lastTick) / TICK_MS);
    return { x: lerp(player.px, player.x, t) + 0.5, y: lerp(player.py, player.y, t) + 0.5 };
  };

  function drawCollision(c) {
    const halfW = canvas.width / 2 / tilePx, halfH = canvas.height / 2 / tilePx;
    const x0 = Math.floor(c.x - halfW), x1 = Math.ceil(c.x + halfW);
    const y0 = Math.floor(c.y - halfH), y1 = Math.ceil(c.y + halfH);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const f = flagsAt(x, y);
        if (!f) continue;
        const sx = (x - c.x) * tilePx + canvas.width / 2;
        const sy = (c.y - y - 1) * tilePx + canvas.height / 2;
        if (f & FULL) {
          ctx.fillStyle = "rgba(220,50,50,0.35)";
          ctx.fillRect(sx, sy, tilePx, tilePx);
        }
        ctx.fillStyle = "rgba(255,120,0,0.9)";
        const t = Math.max(1, tilePx / 8);
        if (f & WALL_N) ctx.fillRect(sx, sy, tilePx, t);
        if (f & WALL_S) ctx.fillRect(sx, sy + tilePx - t, tilePx, t);
        if (f & WALL_W) ctx.fillRect(sx, sy, t, tilePx);
        if (f & WALL_E) ctx.fillRect(sx + tilePx - t, sy, t, tilePx);
      }
    }
  }

  function draw() {
    const c = cam();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1e2a38";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const halfW = canvas.width / 2 / tilePx, halfH = canvas.height / 2 / tilePx;
    const rx0 = Math.floor((c.x - halfW) / REGION) * REGION;
    const ry0 = Math.floor((c.y - halfH) / REGION) * REGION;
    for (let bx = rx0; bx < c.x + halfW; bx += REGION) {
      for (let by = ry0; by < c.y + halfH; by += REGION) {
        const rid = ((bx >> 6) << 8) | (by >> 6);
        const bmp = bitmaps.get(rid);
        if (bmp === undefined) loadRegion(rid);
        if (!(bmp instanceof ImageBitmap)) continue;
        const sx = (bx - c.x) * tilePx + canvas.width / 2;
        const sy = (c.y - (by + REGION)) * tilePx + canvas.height / 2;
        ctx.drawImage(bmp, sx, sy, REGION * tilePx, REGION * tilePx);
      }
    }

    if (colEl.checked) drawCollision(c);

    const dest = path[path.length - 1];
    if (dest) {
      const dx = (dest.x - c.x) * tilePx + canvas.width / 2;
      const dy = (c.y - dest.y - 1) * tilePx + canvas.height / 2;
      ctx.strokeStyle = "#ffd54a";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx + 1, dy + 1, tilePx - 2, tilePx - 2);
    }

    // avatar (procedural retro figure — presentation only)
    const psx = canvas.width / 2, psy = canvas.height / 2;
    const s = tilePx / 16;
    const moving = path.length || keys.size;
    const bob = moving ? Math.sin(performance.now() / 90) * 1.5 * s : 0;
    ctx.fillStyle = "#00000055";
    ctx.beginPath();
    ctx.ellipse(psx, psy + 6 * s, 5 * s, 2.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d2c1e";
    ctx.fillRect(psx - 3 * s, psy + 2 * s + bob, 2.4 * s, 3 * s);
    ctx.fillRect(psx + 0.6 * s, psy + 2 * s - bob, 2.4 * s, 3 * s);
    ctx.fillStyle = "#2f5f9e";
    ctx.fillRect(psx - 3.6 * s, psy - 4 * s, 7.2 * s, 6.4 * s);
    ctx.fillStyle = "#e0b089";
    ctx.fillRect(psx - 2.4 * s, psy - 9 * s, 4.8 * s, 4.8 * s);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(psx - 2.4 * s, psy - 9.6 * s, 4.8 * s, 1.6 * s);

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  canvas.focus();
}

init();
