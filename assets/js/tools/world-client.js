// World client — walk the real game world, top-down 2D, with the game's
// static collision and its interactable objects.
//
// Data (tools/openrs2_extract.py, OpenRS2 cache 2499, build 236):
//   map/<rid>.png.gz        terrain tiles, true coordinates
//   collision/<rid>.bin.gz  per-tile u16 collision flags
//   locs/<rid>.json.gz      interactable object placements (plane 0)
//   objects.pack            object defs: real names + cache action lists
//
// Interaction model, true to the cache: hovering shows "<default action>
// <name>" (first listed action = the game's left-click default); right-click
// opens the option menu with the object's real actions. Selecting an action
// walks you to the object (game BFS). Doors/gates (wall-type locs with an
// Open action) genuinely toggle passage — opening clears exactly the wall
// edges their closed state clips. Other actions report "not simulated"
// (BACKLOG [client:simulation]) — nothing is faked.

import {
  canStep, findPath, wallEdges, FULL, WALL_N, WALL_E, WALL_S, WALL_W,
} from "../world/collision.js";
import { readPack } from "../pack-reader.js";

const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
const DATA = `${BASE}/assets/data/cache`;
const REGION = 64;
const SRC_PX = 4;
const TICK_MS = 600;

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
  return new Response(res.body.pipeThrough(new DecompressionStream("gzip")));
}

async function init() {
  if (!root) return;
  if (typeof DecompressionStream === "undefined") {
    root.innerHTML = "<p>This browser lacks DecompressionStream (needed for the map data).</p>";
    return;
  }
  const [manifest, objectDefs] = await Promise.all([
    fetch(`${DATA}/map/manifest.json`).then((r) => r.json()),
    readPack(`${DATA}/objects.pack`).then((recs) => new Map(recs.map((r) => [r.id, r]))),
  ]);
  const regionAt = (x, y) => ((x >> 6) << 8) | (y >> 6);

  root.innerHTML = `
    <div class="wc-hud">
      <span class="wc-pos"></span>
      <span class="wc-hover"></span>
      <label><input type="checkbox" class="wc-run"> run</label>
      <label><input type="checkbox" class="wc-col"> collision</label>
      <label><input type="checkbox" class="wc-obj" checked> objects</label>
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
    <div class="wc-menu" hidden></div>
    <div class="wc-toast" hidden></div>
    <p class="wc-help">Left-click: walk / default action · right-click: option menu (real cache
      actions) · WASD/arrows step · R run · C collision · O objects · 600 ms ticks.</p>`;

  const canvas = root.querySelector(".wc-canvas");
  const ctx = canvas.getContext("2d");
  const posEl = root.querySelector(".wc-pos");
  const hoverEl = root.querySelector(".wc-hover");
  const tickEl = root.querySelector(".wc-tick");
  const runEl = root.querySelector(".wc-run");
  const colEl = root.querySelector(".wc-col");
  const objEl = root.querySelector(".wc-obj");
  const menuEl = root.querySelector(".wc-menu");
  const toastEl = root.querySelector(".wc-toast");

  let tilePx = 16;
  const fit = () => {
    canvas.width = root.clientWidth;
    canvas.height = Math.max(420, Math.round(window.innerHeight * 0.62));
  };
  fit();
  window.addEventListener("resize", fit);

  // ── region data (bitmaps + collision + locs), LRU-capped ────────────────
  const bitmaps = new Map();
  const grids = new Map();
  const regionLocs = new Map();  // rid -> loc[] ; loc = {id,type,rot,x,y,def,key}
  const locByTile = new Map();   // "x,y" -> loc (footprint-expanded)
  const lru = [];

  function indexLoc(loc) {
    const d = loc.def;
    let sx = 1, sy = 1;
    if (loc.type === 10 || loc.type === 11) {
      sx = d.sizeX; sy = d.sizeY;
      if (loc.rot === 1 || loc.rot === 3) [sx, sy] = [sy, sx];
    }
    loc.w = sx; loc.h = sy;
    for (let ox = 0; ox < sx; ox++)
      for (let oy = 0; oy < sy; oy++)
        locByTile.set(`${loc.x + ox},${loc.y + oy}`, loc);
  }

  async function loadRegion(rid) {
    if (bitmaps.has(rid) || !(rid in manifest)) return;
    bitmaps.set(rid, "loading");
    grids.set(rid, "loading");
    try {
      const [imgRes, colRes, locRes] = await Promise.all([
        fetch(`${DATA}/map/${rid}.png.gz`),
        fetch(`${DATA}/collision/${rid}.bin.gz`),
        fetch(`${DATA}/locs/${rid}.json.gz`),
      ]);
      if (!imgRes.ok || !colRes.ok) throw new Error("missing");
      const [blob, buf, locsRaw] = await Promise.all([
        gunzip(imgRes).then((r) => r.blob()),
        gunzip(colRes).then((r) => r.arrayBuffer()),
        locRes.ok ? gunzip(locRes).then((r) => r.json()) : [],
      ]);
      bitmaps.set(rid, await createImageBitmap(blob));
      grids.set(rid, new Uint16Array(buf));
      const bx = (rid >> 8) << 6, by = (rid & 255) << 6;
      const locs = locsRaw
        .filter(([id]) => objectDefs.has(id))
        .map(([id, type, rot, lx, ly]) => ({
          id, type, rot, x: bx + lx, y: by + ly,
          def: objectDefs.get(id), key: `${rid}:${id}:${lx}:${ly}`,
        }));
      locs.forEach(indexLoc);
      regionLocs.set(rid, locs);
      lru.push(rid);
      while (lru.length > 100) {
        const old = lru.shift();
        const b = bitmaps.get(old);
        if (b instanceof ImageBitmap) b.close();
        bitmaps.delete(old);
        grids.delete(old);
        for (const l of regionLocs.get(old) ?? [])
          for (let ox = 0; ox < l.w; ox++)
            for (let oy = 0; oy < l.h; oy++)
              locByTile.delete(`${l.x + ox},${l.y + oy}`);
        regionLocs.delete(old);
      }
    } catch {
      bitmaps.set(rid, "missing");
      grids.set(rid, "missing");
    }
  }

  // ── door state: passage overrides on top of static collision ────────────
  const openDoors = new Map(); // loc.key -> [{x, y, mask}] cleared edges
  const cleared = new Map();   // "x,y" -> mask

  const flagsAt = (x, y) => {
    const g = grids.get(regionAt(x, y));
    if (!(g instanceof Uint16Array)) return null;
    let f = g[(y & 63) * REGION + (x & 63)];
    const c = cleared.get(`${x},${y}`);
    if (c) f &= ~c;
    return f;
  };

  const isDoor = (loc) =>
    loc.type <= 3 && (loc.def.actions ?? []).some((a) => a === "Open" || a === "Close");

  function toggleDoor(loc) {
    if (openDoors.has(loc.key)) {
      for (const e of openDoors.get(loc.key)) {
        const k = `${e.x},${e.y}`;
        cleared.set(k, (cleared.get(k) ?? 0) & ~e.mask);
      }
      openDoors.delete(loc.key);
      return "Close";
    }
    const { own, neighbours } = wallEdges(loc.type, loc.rot);
    const edges = [{ x: loc.x, y: loc.y, mask: own }];
    for (const n of neighbours) edges.push({ x: loc.x + n.dx, y: loc.y + n.dy, mask: n.mask });
    for (const e of edges) {
      const k = `${e.x},${e.y}`;
      cleared.set(k, (cleared.get(k) ?? 0) | e.mask);
    }
    openDoors.set(loc.key, edges);
    return "Open";
  }

  // actions shown for a loc — real cache list; open doors offer Close
  function menuActions(loc) {
    const acts = (loc.def.actions ?? []).filter(Boolean);
    if (isDoor(loc) && openDoors.has(loc.key))
      return ["Close", ...acts.filter((a) => a !== "Open")];
    return acts;
  }

  // ── player / tick state ───────────────────────────────────────────────────
  const spawn = LANDMARKS[0];
  const player = { x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y };
  let path = [];
  let pending = null;  // {loc, action} — runs when we arrive next to it
  let tick = 0;
  const keys = new Set();

  const KEY_DIRS = {
    w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
  };

  const adjacentTo = (loc) => {
    // on the loc's own tile, or within its footprint ring (Chebyshev 1)
    const dx = player.x - Math.max(loc.x, Math.min(player.x, loc.x + loc.w - 1));
    const dy = player.y - Math.max(loc.y, Math.min(player.y, loc.y + loc.h - 1));
    return Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
  };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function performAction(loc, action) {
    if (isDoor(loc) && (action === "Open" || action === "Close")) {
      toggleDoor(loc);
      return;
    }
    toast(`${action} ${loc.def.name} — not simulated yet (see BACKLOG [client:simulation])`);
  }

  function walkToLoc(loc, action) {
    // Path toward the object; footprints are FULL so BFS approach lands on
    // the nearest open adjacent tile. Doors' own tiles are walkable targets.
    pending = { loc, action };
    path = findPath(flagsAt, player.x, player.y,
      loc.x + ((loc.w - 1) >> 1), loc.y + ((loc.h - 1) >> 1));
  }

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
      path = []; pending = null;
      for (let i = 0; i < speed; i++) {
        if (canStep(flagsAt, player.x, player.y, kdx, kdy)) {
          player.x += kdx; player.y += kdy;
        } else if (kdx && kdy) {
          if (canStep(flagsAt, player.x, player.y, kdx, 0)) player.x += kdx;
          else if (canStep(flagsAt, player.x, player.y, 0, kdy)) player.y += kdy;
        }
      }
    } else {
      for (let i = 0; i < speed && path.length; i++) {
        const next = path[0];
        if (canStep(flagsAt, player.x, player.y, next.x - player.x, next.y - player.y)) {
          path.shift();
          player.x = next.x; player.y = next.y;
        } else {
          const dest = path[path.length - 1];
          path = findPath(flagsAt, player.x, player.y, dest.x, dest.y);
          break;
        }
      }
      if (pending && (adjacentTo(pending.loc) || !path.length)) {
        const p = pending;
        pending = null;
        path = [];
        if (adjacentTo(p.loc)) performAction(p.loc, p.action);
        else toast(`I can't reach that.`);
      }
    }
    posEl.textContent = `(${player.x}, ${player.y}) · region ${regionAt(player.x, player.y)}`;
    tickEl.textContent = `tick ${tick}`;
  }
  let lastTick = performance.now();
  setInterval(() => { lastTick = performance.now(); doTick(); }, TICK_MS);

  // ── input ─────────────────────────────────────────────────────────────────
  const tileFromEvent = (e) => {
    const r = canvas.getBoundingClientRect();
    const c = cam();
    return {
      x: Math.floor(c.x + (e.clientX - r.left - canvas.width / 2) / tilePx),
      y: Math.floor(c.y - (e.clientY - r.top - canvas.height / 2) / tilePx),
    };
  };

  let hoverTile = null;
  canvas.addEventListener("mousemove", (e) => {
    hoverTile = tileFromEvent(e);
    const loc = locByTile.get(`${hoverTile.x},${hoverTile.y}`);
    if (loc) {
      const acts = menuActions(loc);
      hoverEl.textContent = `${acts[0] ?? ""} ${loc.def.name}` +
        (acts.length > 1 ? ` / ${acts.length - 1} more` : "");
    } else {
      hoverEl.textContent = "";
    }
  });

  canvas.addEventListener("click", (e) => {
    hideMenu();
    const t = tileFromEvent(e);
    const loc = locByTile.get(`${t.x},${t.y}`);
    if (loc && objEl.checked) {
      const acts = menuActions(loc);
      if (acts.length) { walkToLoc(loc, acts[0]); canvas.focus(); return; }
    }
    pending = null;
    path = findPath(flagsAt, player.x, player.y, t.x, t.y);
    canvas.focus();
  });

  function hideMenu() { menuEl.hidden = true; menuEl.innerHTML = ""; }

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const t = tileFromEvent(e);
    const loc = locByTile.get(`${t.x},${t.y}`);
    const rows = [];
    if (loc && objEl.checked) {
      for (const a of menuActions(loc))
        rows.push({ label: `${a} <b>${loc.def.name}</b>`, run: () => walkToLoc(loc, a) });
    }
    rows.push({ label: "Walk here", run: () => { pending = null; path = findPath(flagsAt, player.x, player.y, t.x, t.y); } });
    rows.push({ label: "Cancel", run: () => {} });
    menuEl.innerHTML = `<div class="wc-menu-title">Choose Option</div>` +
      rows.map((r, i) => `<div class="wc-menu-row" data-i="${i}">${r.label}</div>`).join("");
    const rect = root.getBoundingClientRect();
    menuEl.style.left = `${e.clientX - rect.left}px`;
    menuEl.style.top = `${e.clientY - rect.top}px`;
    menuEl.hidden = false;
    menuEl.querySelectorAll(".wc-menu-row").forEach((el) =>
      el.addEventListener("mousedown", () => { rows[+el.dataset.i].run(); hideMenu(); }));
  });
  document.addEventListener("mousedown", (e) => {
    if (!menuEl.contains(e.target)) hideMenu();
  });

  canvas.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "r") { runEl.checked = !runEl.checked; e.preventDefault(); return; }
    if (k === "c") { colEl.checked = !colEl.checked; e.preventDefault(); return; }
    if (k === "o") { objEl.checked = !objEl.checked; e.preventDefault(); return; }
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
    path = []; pending = null;
    e.target.value = "";
    canvas.focus();
  });

  // ── render ────────────────────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const cam = () => {
    const t = Math.min(1, (performance.now() - lastTick) / TICK_MS);
    return { x: lerp(player.px, player.x, t) + 0.5, y: lerp(player.py, player.y, t) + 0.5 };
  };
  const toScreen = (c, x, y) => [
    (x - c.x) * tilePx + canvas.width / 2,
    (c.y - y - 1) * tilePx + canvas.height / 2,
  ];

  function drawLocs(c) {
    for (const [rid, locs] of regionLocs) {
      if (!Array.isArray(locs)) continue;
      for (const loc of locs) {
        const [sx, sy] = toScreen(c, loc.x, loc.y + loc.h - 1);
        const w = loc.w * tilePx, h = loc.h * tilePx;
        if (sx + w < 0 || sy + h < 0 || sx > canvas.width || sy > canvas.height) continue;
        if (loc.type <= 3) {
          // wall-attached (doors/gates): draw the edge; green when open
          const open = openDoors.has(loc.key);
          ctx.fillStyle = open ? "rgba(80,200,90,0.9)" : "rgba(150,90,40,0.95)";
          const t = Math.max(2, tilePx / 6);
          const { own } = wallEdges(loc.type, loc.rot);
          if (own & WALL_N) ctx.fillRect(sx, sy, tilePx, t);
          if (own & WALL_S) ctx.fillRect(sx, sy + tilePx - t, tilePx, t);
          if (own & WALL_W) ctx.fillRect(sx, sy, t, tilePx);
          if (own & WALL_E) ctx.fillRect(sx + tilePx - t, sy, t, tilePx);
          if (!(own & 15)) ctx.fillRect(sx, sy, t, t); // corner pillars
        } else {
          ctx.strokeStyle = "rgba(255,213,74,0.8)";
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 1.5, sy + 1.5, w - 3, h - 3);
        }
      }
    }
  }

  function drawCollision(c) {
    const halfW = canvas.width / 2 / tilePx, halfH = canvas.height / 2 / tilePx;
    for (let x = Math.floor(c.x - halfW); x <= Math.ceil(c.x + halfW); x++) {
      for (let y = Math.floor(c.y - halfH); y <= Math.ceil(c.y + halfH); y++) {
        const f = flagsAt(x, y);
        if (!f) continue;
        const [sx, sy] = toScreen(c, x, y);
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

    if (objEl.checked) drawLocs(c);
    if (colEl.checked) drawCollision(c);

    const dest = path[path.length - 1];
    if (dest) {
      const [dx, dy] = toScreen(c, dest.x, dest.y);
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
