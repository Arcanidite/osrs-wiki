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
import {
  TREES, ROCKS, GATHER_CONFIG, bestAxe, bestPickaxe, chopRoll, mineRoll,
} from "../world/gather.js";
import { createPlayerState } from "../world/player-state.js";

const SAVE_KEY = "osrs-world:v1";

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
  { name: "Varrock SE mine", x: 3285, y: 3365 },
];

const root = document.getElementById("world-root");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    <div class="wc-side">
      <div class="wc-side-tabs">
        <button class="wc-tab active" data-tab="inv">Inventory</button>
        <button class="wc-tab" data-tab="skills">Skills</button>
      </div>
      <div class="wc-side-body" data-panel="inv"></div>
      <div class="wc-side-body" data-panel="skills" hidden></div>
    </div>
    <div class="wc-bank" hidden></div>
    <div class="wc-log"></div>
    <p class="wc-help">Left-click: walk / default action · right-click: option menu (real cache
      actions) · WASD/arrows step · R run · C collision · O objects · 600 ms ticks.
      Doors open, trees chop (XP/levels/inventory), bank booths bank. Numbers that Jagex never
      published (success/respawn rates) are labelled placeholders — see page notes.</p>`;

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

  // actions shown for a loc — real cache list; open doors offer Close;
  // felled trees have no options until they respawn
  function menuActions(loc) {
    if (isDepleted(loc)) return [];
    const acts = (loc.def.actions ?? []).filter(Boolean);
    if (isDoor(loc) && openDoors.has(loc.key))
      return ["Close", ...acts.filter((a) => a !== "Open")];
    return acts;
  }

  // ── player / tick state ───────────────────────────────────────────────────
  const spawn = LANDMARKS[0];
  const player = { x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y };
  let path = [];
  let pending = null;    // {loc, action} — runs when we arrive next to it
  let gathering = null;  // {loc, treeName, nextRoll} — active skilling session
  let tick = 0;
  const keys = new Set();

  // ── simulation state (persisted) ─────────────────────────────────────────
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); } catch {}
  const state = createPlayerState(saved);
  // sandbox starting kit (bronze tools; granted once if absent everywhere)
  for (const kit of [{ id: 1351, name: "Bronze axe" }, { id: 1265, name: "Bronze pickaxe" }]) {
    const owned = state.hasItem(kit.id) || state.raw.bank.some((it) => it.id === kit.id);
    if (!owned) state.addItem(kit);
  }
  let dirty = !saved;
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.toJSON())); } catch {}
    dirty = false;
  };
  const depleted = new Map(); // loc.key -> respawn tick (session-local)

  const logEl = root.querySelector(".wc-log");
  function say(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    logEl.appendChild(div);
    while (logEl.children.length > 7) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── side panel (inventory / skills) ──────────────────────────────────────
  const invPanel = root.querySelector('[data-panel="inv"]');
  const skillsPanel = root.querySelector('[data-panel="skills"]');
  root.querySelectorAll(".wc-tab").forEach((b) =>
    b.addEventListener("click", () => {
      root.querySelectorAll(".wc-tab").forEach((x) => x.classList.toggle("active", x === b));
      invPanel.hidden = b.dataset.tab !== "inv";
      skillsPanel.hidden = b.dataset.tab !== "skills";
    }));

  function spriteSpan(id, name) {
    return `<span class="sri-sprite" data-item-id="${id}" title="${esc(name)}">${esc(name[0])}</span>`;
  }
  function renderPanels() {
    invPanel.innerHTML = `<div class="wc-inv-grid">` +
      state.raw.inv.map((it) =>
        `<span class="wc-inv-slot">${spriteSpan(it.id, it.name)}` +
        (it.qty > 1 ? `<span class="wc-qty">${it.qty}</span>` : "") + `</span>`).join("") +
      `</div><div class="wc-inv-count">${state.invCount()} / 28</div>`;
    const skills = Object.keys(state.raw.xp);
    skillsPanel.innerHTML = skills.length
      ? skills.map((sk) =>
          `<div class="wc-skill-row"><span>${esc(sk)}</span>` +
          `<b>${state.level(sk)}</b><i>${Math.floor(state.xp(sk)).toLocaleString()} xp</i></div>`).join("")
      : `<div class="wc-skill-row">No XP yet — chop a tree.</div>`;
    window.SpriteAtlas?.ready
      ? paintSprites()
      : (window.SpriteAtlas?.load(BASE),
         window.addEventListener("osrs-sprite-ready", paintSprites, { once: true }));
  }
  function paintSprites() {
    const a = window.SpriteAtlas;
    if (!a?.ready) return;
    root.querySelectorAll(".sri-sprite[data-item-id]").forEach((el) => {
      const css = a.css(+el.dataset.itemId);
      if (css) { el.style.background = css; el.textContent = ""; }
    });
  }

  // ── bank panel ────────────────────────────────────────────────────────────
  const bankEl = root.querySelector(".wc-bank");
  function renderBank() {
    if (bankEl.hidden) return;
    bankEl.innerHTML = `<div class="wc-bank-hd"><b>Bank</b>
        <button class="btn wc-bank-depall">Deposit all</button>
        <button class="btn wc-bank-close">✕</button></div>
      <div class="wc-bank-cols">
        <div><h3>Bank</h3>${state.raw.bank.map((it) =>
          `<button class="wc-bank-row" data-w="${it.id}">${spriteSpan(it.id, it.name)} ${esc(it.name)} × ${it.qty}</button>`).join("") || "<i>empty</i>"}</div>
        <div><h3>Inventory</h3>${state.raw.inv.map((it, i) =>
          `<button class="wc-bank-row" data-d="${it.id}">${spriteSpan(it.id, it.name)} ${esc(it.name)}${it.qty > 1 ? ` × ${it.qty}` : ""}</button>`).join("") || "<i>empty</i>"}</div>
      </div>`;
    bankEl.querySelector(".wc-bank-close").addEventListener("click", () => { bankEl.hidden = true; });
    bankEl.querySelector(".wc-bank-depall").addEventListener("click", () => {
      state.depositAll(); dirty = true; renderBank(); renderPanels();
    });
    bankEl.querySelectorAll("[data-d]").forEach((b) =>
      b.addEventListener("click", () => { state.deposit(+b.dataset.d); dirty = true; renderBank(); renderPanels(); }));
    bankEl.querySelectorAll("[data-w]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!state.withdraw(+b.dataset.w)) say("Your inventory is full.");
        dirty = true; renderBank(); renderPanels();
      }));
    paintSprites();
  }

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

  const isBank = (loc) =>
    /^Bank (booth|chest)/.test(loc.def.name) &&
    (loc.def.actions ?? []).some((a) => a === "Bank" || a === "Use");
  const isTree = (loc) => TREES[loc.def.name] != null;
  const isDepleted = (loc) => (depleted.get(loc.key) ?? 0) > tick;

  function performAction(loc, action) {
    if (isDoor(loc) && (action === "Open" || action === "Close")) {
      toggleDoor(loc);
      return;
    }
    if (isBank(loc) && (action === "Bank" || action === "Use")) {
      bankEl.hidden = false;
      renderBank();
      return;
    }
    if (isTree(loc) && action.startsWith("Chop")) {
      if (isDepleted(loc)) { say("The tree has been felled."); return; }
      const t = TREES[loc.def.name];
      const lvl = state.level("woodcutting");
      if (!bestAxe((id) => state.hasItem(id), lvl)) { say("You need an axe you can use to chop this tree."); return; }
      if (lvl < t.level) { say(`You need a Woodcutting level of ${t.level} to chop this tree.`); return; }
      gathering = { loc, kind: "tree", nextRoll: tick + GATHER_CONFIG.rollTicks };
      say("You swing your axe at the tree...");
      return;
    }
    if (ROCKS[loc.id] && action === "Mine") {
      if (isDepleted(loc)) { say("There is no ore currently available in this rock."); return; }
      const rock = ROCKS[loc.id];
      const lvl = state.level("mining");
      if (!bestPickaxe((id) => state.hasItem(id), lvl)) { say("You need a pickaxe you can use to mine this rock."); return; }
      if (lvl < rock.level) { say(`You need a Mining level of ${rock.level} to mine this rock.`); return; }
      gathering = { loc, kind: "rock", nextRoll: tick + GATHER_CONFIG.rollTicks };
      say("You swing your pickaxe at the rock...");
      return;
    }
    toast(`${action} ${loc.def.name} — not simulated yet (see BACKLOG [client:simulation])`);
  }

  function gatherTick() {
    if (!gathering) return;
    const { loc, kind } = gathering;
    if (!adjacentTo(loc) || isDepleted(loc)) { gathering = null; return; }
    if (tick < gathering.nextRoll) return;
    gathering.nextRoll = tick + GATHER_CONFIG.rollTicks;

    const skill = kind === "tree" ? "woodcutting" : "mining";
    const roll = kind === "tree"
      ? chopRoll(loc.def.name, state.level(skill), (id) => state.hasItem(id))
      : mineRoll(loc.id, state.level(skill), (id) => state.hasItem(id));
    if (roll.error) { gathering = null; return; }
    if (!roll.ok) return;
    const res = roll.tree ?? roll.rock;
    if (!state.addItem({ id: res.itemId, name: res.item })) {
      say("Your inventory is too full to hold any more.");
      gathering = null;
      return;
    }
    const skillLabel = skill[0].toUpperCase() + skill.slice(1);
    const { levelled } = state.addXp(skill, res.xp);
    say(`You get some ${res.item.toLowerCase()}. (+${res.xp} ${skillLabel} xp)`);
    if (levelled) say(`Your ${skillLabel} level is now ${levelled}.`);
    dirty = true;
    renderPanels();
    if (kind === "rock") {
      // standard rocks always deplete after one ore (documented); respawn sourced per ore
      depleted.set(loc.key, tick + res.respawnTicks);
      gathering = null;
    } else if (Math.random() < GATHER_CONFIG.depleteChance) {
      depleted.set(loc.key, tick + GATHER_CONFIG.respawnTicks);
      say("The tree falls.");
      gathering = null;
    }
  }

  function walkToLoc(loc, action) {
    // Goal set = every tile you could interact from: the footprint's adjacent
    // ring (walls/doors additionally: the tile itself + across the edge).
    // BFS picks the minimum-cost goal, so we stop at the NEAR side instead of
    // circling to whatever tile is closest to the object's centre.
    pending = { loc, action };
    const goals = [];
    if (loc.type <= 3) {
      goals.push({ x: loc.x, y: loc.y });
      for (const n of wallEdges(loc.type, loc.rot).neighbours)
        goals.push({ x: loc.x + n.dx, y: loc.y + n.dy });
    }
    for (let ox = -1; ox <= loc.w; ox++)
      for (let oy = -1; oy <= loc.h; oy++)
        if (ox === -1 || oy === -1 || ox === loc.w || oy === loc.h)
          goals.push({ x: loc.x + ox, y: loc.y + oy });
    path = findPath(flagsAt, player.x, player.y,
      loc.x + ((loc.w - 1) >> 1), loc.y + ((loc.h - 1) >> 1), { goals });
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
      path = []; pending = null; gathering = null;
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
    gatherTick();
    for (const [key, until] of depleted) if (until <= tick) depleted.delete(key);
    if (dirty && tick % 5 === 0) save();
    posEl.textContent = `(${player.x}, ${player.y}) · region ${regionAt(player.x, player.y)}`;
    tickEl.textContent = `tick ${tick}`;
  }
  let lastTick = performance.now();
  setInterval(() => { lastTick = performance.now(); doTick(); }, TICK_MS);

  // ── input ─────────────────────────────────────────────────────────────────
  const tileFromEvent = (e) => {
    // canvas attribute pixels ≠ CSS pixels when layout stretches the element —
    // scale event coords into the canvas's drawing space before tile math
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (canvas.width / r.width);
    const py = (e.clientY - r.top) * (canvas.height / r.height);
    const c = cam();
    return {
      x: Math.floor(c.x + (px - canvas.width / 2) / tilePx),
      y: Math.floor(c.y - (py - canvas.height / 2) / tilePx),
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
        rows.push({ label: `${esc(a)} <b>${esc(loc.def.name)}</b>`, run: () => walkToLoc(loc, a) });
    }
    rows.push({ label: "Walk here", run: () => { pending = null; path = findPath(flagsAt, player.x, player.y, t.x, t.y); } });
    rows.push({ label: "Cancel", run: () => {} });
    menuEl.innerHTML = `<div class="wc-menu-title">Choose Option</div>` +
      rows.map((r, i) =>
        `<button type="button" class="wc-menu-row" data-i="${i}">${r.label}</button>`).join("");
    menuEl.hidden = false;
    // position at the cursor, clamped inside the root so it stays choosable
    const rect = root.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    menuEl.style.left = `${Math.max(0, Math.min(e.clientX - rect.left, rect.width - mw - 2))}px`;
    menuEl.style.top = `${Math.max(0, Math.min(e.clientY - rect.top, rect.height - mh - 2))}px`;
    menuEl.querySelectorAll(".wc-menu-row").forEach((el) =>
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        rows[+el.dataset.i].run();
        hideMenu();
        canvas.focus();
      }));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menuEl.hidden && !menuEl.contains(e.target)) hideMenu();
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
  // scrolling over the game view must never move the page
  canvas.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
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
          ctx.strokeStyle = isDepleted(loc) ? "rgba(150,150,150,0.5)" : "rgba(255,213,74,0.8)";
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
  renderPanels();
  canvas.focus();
}

init();
