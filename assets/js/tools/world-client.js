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
import { climbDestination, isClimbAction, settleTile } from "../world/climb.js";
import {
  SIM_CONFIG, swing, npcCombatants, PICKPOCKET, FISHING, COINS_ID,
} from "../world/combat.js";

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
  const [manifest, objectDefs, npcDefs, equipMap, dropsMap] = await Promise.all([
    fetch(`${DATA}/map/manifest.json`).then((r) => r.json()),
    readPack(`${DATA}/objects.pack`).then((recs) => new Map(recs.map((r) => [r.id, r]))),
    readPack(`${DATA}/npcs.pack`).then((recs) => new Map(recs.map((r) => [r.id, r]))),
    readPack(`${DATA}/equipment.pack`).then((recs) => new Map(recs.map((r) => [r.id, r]))),
    readPack(`${DATA}/drops.pack`).then((recs) => new Map(recs.map((r) => [r.id, r.drops]))),
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
        <button class="wc-tab" data-tab="equip">Equipment</button>
        <button class="wc-tab" data-tab="skills">Skills</button>
      </div>
      <div class="wc-side-body" data-panel="inv"></div>
      <div class="wc-side-body" data-panel="equip" hidden></div>
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
  const regionLocs = new Map();  // "rid:plane" -> loc[]
  const locByTile = new Map();   // "plane:x,y" -> loc (footprint-expanded)
  const regionNpcs = new Map();  // "rid:plane" -> npc[] (static spawn points)
  const npcByTile = new Map();   // "plane:x,y" -> npc
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
        locByTile.set(`${loc.plane}:${loc.x + ox},${loc.y + oy}`, loc);
  }
  const locAt = (x, y) => locByTile.get(`${player.plane}:${x},${y}`);
  const npcAt = (x, y) => npcByTile.get(`${player.plane}:${x},${y}`);
  // NPC as a pseudo-loc so the walk/arrive machinery applies unchanged
  const npcTarget = (n) => ({
    x: n.x, y: n.y, w: 1, h: 1, type: 10, def: n.def, _npc: true, _npcRef: n,
    plane: n.plane, key: `npc:${n.id}:${n.x}:${n.y}:${n.plane}`,
  });

  async function loadRegion(rid, plane) {
    const rk = `${rid}:${plane}`;
    if (bitmaps.has(rk) || !(rid in manifest)) return;
    if (plane > 0 && !(manifest[rid].planes ?? [0]).includes(plane)) {
      // no upper-floor data here: void render, fully blocked
      bitmaps.set(rk, "missing");
      grids.set(rk, "missing");
      return;
    }
    bitmaps.set(rk, "loading");
    grids.set(rk, "loading");
    const sfx = plane === 0 ? "" : `.${plane}`;
    try {
      const [imgRes, colRes, locRes, npcRes] = await Promise.all([
        fetch(`${DATA}/map/${rid}${sfx}.png.gz`),
        fetch(`${DATA}/collision/${rid}${sfx}.bin.gz`),
        fetch(`${DATA}/locs/${rid}${sfx}.json.gz`),
        fetch(`${DATA}/npc-spawns/${rid}${sfx}.json.gz`),
      ]);
      if (!imgRes.ok || !colRes.ok) throw new Error("missing");
      const [blob, buf, locsRaw, npcsRaw] = await Promise.all([
        gunzip(imgRes).then((r) => r.blob()),
        gunzip(colRes).then((r) => r.arrayBuffer()),
        locRes.ok ? gunzip(locRes).then((r) => r.json()) : [],
        npcRes.ok ? gunzip(npcRes).then((r) => r.json()).catch(() => []) : [],
      ]);
      bitmaps.set(rk, await createImageBitmap(blob));
      grids.set(rk, new Uint16Array(buf));
      const bx = (rid >> 8) << 6, by = (rid & 255) << 6;
      const locs = locsRaw
        .filter(([id]) => objectDefs.has(id))
        .map(([id, type, rot, lx, ly]) => ({
          id, type, rot, x: bx + lx, y: by + ly, plane,
          def: objectDefs.get(id), key: `${rk}:${id}:${lx}:${ly}`,
        }));
      locs.forEach(indexLoc);
      regionLocs.set(rk, locs);
      const npcs = npcsRaw
        .filter(([id]) => npcDefs.has(id))
        .map(([id, lx, ly]) => ({ id, x: bx + lx, y: by + ly, plane, def: npcDefs.get(id) }));
      for (const n of npcs) npcByTile.set(`${plane}:${n.x},${n.y}`, n);
      regionNpcs.set(rk, npcs);
      lru.push(rk);
      while (lru.length > 100) {
        const old = lru.shift();
        const b = bitmaps.get(old);
        if (b instanceof ImageBitmap) b.close();
        bitmaps.delete(old);
        grids.delete(old);
        for (const l of regionLocs.get(old) ?? [])
          for (let ox = 0; ox < l.w; ox++)
            for (let oy = 0; oy < l.h; oy++)
              locByTile.delete(`${l.plane}:${l.x + ox},${l.y + oy}`);
        regionLocs.delete(old);
        for (const n of regionNpcs.get(old) ?? [])
          npcByTile.delete(`${n.plane}:${n.x},${n.y}`);
        regionNpcs.delete(old);
      }
    } catch {
      bitmaps.set(rk, "missing");
      grids.set(rk, "missing");
    }
  }

  // ── door state: passage overrides on top of static collision ────────────
  const openDoors = new Map(); // loc.key -> [{x, y, mask}] cleared edges
  const cleared = new Map();   // "x,y" -> mask

  const flagsAt = (x, y) => {
    const g = grids.get(`${regionAt(x, y)}:${player.plane}`);
    if (!(g instanceof Uint16Array)) return null;
    let f = g[(y & 63) * REGION + (x & 63)];
    const c = cleared.get(`${player.plane}:${x},${y}`);
    if (c) f &= ~c;
    return f;
  };

  const isDoor = (loc) =>
    loc.type <= 3 && (loc.def.actions ?? []).some((a) => a === "Open" || a === "Close");

  function toggleDoor(loc) {
    if (openDoors.has(loc.key)) {
      for (const e of openDoors.get(loc.key)) {
        const k = `${loc.plane}:${e.x},${e.y}`;
        cleared.set(k, (cleared.get(k) ?? 0) & ~e.mask);
      }
      openDoors.delete(loc.key);
      return "Close";
    }
    const { own, neighbours } = wallEdges(loc.type, loc.rot);
    const edges = [{ x: loc.x, y: loc.y, mask: own }];
    for (const n of neighbours) edges.push({ x: loc.x + n.dx, y: loc.y + n.dy, mask: n.mask });
    for (const e of edges) {
      const k = `${loc.plane}:${e.x},${e.y}`;
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
  const player = { x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y, plane: 0 };
  let path = [];
  let pending = null;    // {loc, action} — runs when we arrive next to it
  let gathering = null;  // {loc, kind, nextRoll} — active skilling session
  let climbing = null;   // destination awaiting region data to settle onto
  let tick = 0;
  const keys = new Set();

  function teleport(x, y, plane) {
    player.x = player.px = x;
    player.y = player.py = y;
    player.plane = plane;
    path = []; pending = null; gathering = null;
  }

  // ── simulation state (persisted) ─────────────────────────────────────────
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); } catch {}
  const state = createPlayerState(saved);
  // sandbox starting kit (bronze tools + net; granted once if absent everywhere)
  for (const kit of [{ id: 1351, name: "Bronze axe" }, { id: 1265, name: "Bronze pickaxe" },
                     { id: 303, name: "Small fishing net" }]) {
    const owned = state.hasItem(kit.id) || state.raw.bank.some((it) => it.id === kit.id);
    if (!owned) state.addItem(kit);
  }
  let dirty = !saved;
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.toJSON())); } catch {}
    dirty = false;
  };
  const depleted = new Map(); // loc.key -> respawn tick (session-local)
  // new accounts start at Hitpoints 10 (sourced); hp/prayer pools persist
  if (!state.raw.xp.hitpoints) { state.raw.xp.hitpoints = 1154; dirty = true; }
  if (state.raw.hp == null) state.raw.hp = state.level("hitpoints");
  if (state.raw.prayer == null) state.raw.prayer = state.level("prayer");
  const npcState = new Map(); // npc key -> {hp, deadUntil} (session-local)
  let combat = null;          // {npc, key, nextSwing}
  let stunnedUntil = 0;
  const npcKey = (n) => `${n.id}:${n.x}:${n.y}:${n.plane}`;
  const npcHp = (n) => {
    const k = npcKey(n);
    if (!npcState.has(k)) npcState.set(k, { hp: npcCombatants(n.def.stats).hitpoints, deadUntil: 0 });
    return npcState.get(k);
  };
  const npcDead = (n) => npcHp(n).deadUntil > tick;

  // ── ground items (sourced drop tables, drops.pack) ───────────────────────
  const GROUND_DESPAWN_TICKS = 200; // ≈2 min at 600 ms/tick (game convention)
  let groundItems = [];  // [{x, y, plane, id, name, qty, stackable, despawnTick}]
  let pickup = null;     // ground item we're walking to take
  const groundAt = (x, y) =>
    groundItems.find((g) => g.plane === player.plane && g.x === x && g.y === y);

  function rollDrops(npc) {
    const table = dropsMap.get(npc.id);
    if (!table) {
      say(`No sourced drop table for ${npc.def.name} (${npc.id}) — nothing is invented.`);
      return;
    }
    for (const d of table) {
      if (Math.random() >= d.rarity) continue;
      const qty = d.qtyMin + Math.floor(Math.random() * (d.qtyMax - d.qtyMin + 1));
      groundItems.push({
        x: npc.x, y: npc.y, plane: npc.plane, id: d.itemId, name: d.itemName,
        qty, stackable: d.stackable || d.noted, despawnTick: tick + GROUND_DESPAWN_TICKS,
      });
    }
  }

  function pickupTick() {
    if (!pickup) return;
    if (!groundItems.includes(pickup)) { pickup = null; return; } // despawned
    if (player.x !== pickup.x || player.y !== pickup.y || player.plane !== pickup.plane) {
      if (!path.length) pickup = null; // couldn't reach it
      return;
    }
    if (!state.addItem({ id: pickup.id, name: pickup.name, stackable: pickup.stackable }, pickup.qty)) {
      say("Your inventory is too full.");
    } else {
      say(`You take the ${pickup.name.toLowerCase()}${pickup.qty > 1 ? ` × ${pickup.qty}` : ""}.`);
      groundItems = groundItems.filter((g) => g !== pickup);
      dirty = true;
      renderPanels();
    }
    pickup = null;
  }

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
  const equipPanel = root.querySelector('[data-panel="equip"]');
  const skillsPanel = root.querySelector('[data-panel="skills"]');
  root.querySelectorAll(".wc-tab").forEach((b) =>
    b.addEventListener("click", () => {
      root.querySelectorAll(".wc-tab").forEach((x) => x.classList.toggle("active", x === b));
      root.querySelectorAll(".wc-side-body").forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    }));

  function spriteSpan(id, name) {
    return `<span class="sri-sprite" data-item-id="${id}" title="${esc(name)}">${esc(name[0])}</span>`;
  }
  const EQUIP_SLOTS = ["head", "cape", "neck", "ammo", "weapon", "2h", "body", "shield", "legs", "hands", "feet", "ring"];
  function renderPanels() {
    invPanel.innerHTML = `<div class="wc-inv-grid">` +
      state.raw.inv.map((it, i) =>
        `<span class="wc-inv-slot${equipMap.has(it.id) ? " wc-equipable" : ""}" data-i="${i}">` +
        `${spriteSpan(it.id, it.name)}` +
        (it.qty > 1 ? `<span class="wc-qty">${it.qty}</span>` : "") + `</span>`).join("") +
      `</div><div class="wc-inv-count">${state.invCount()} / 28</div>`;
    // click an equippable inventory item → "Equip" option (real slot from equipment.pack)
    invPanel.querySelectorAll(".wc-inv-slot.wc-equipable").forEach((el) =>
      el.addEventListener("click", () => {
        const it = state.raw.inv[+el.dataset.i];
        const rec = it && equipMap.get(it.id);
        if (!rec) return;
        menuEl.innerHTML = `<div class="wc-menu-title">Choose Option</div>
          <button type="button" class="wc-menu-row" data-eq>Equip <b>${esc(it.name)}</b></button>
          <button type="button" class="wc-menu-row" data-no>Cancel</button>`;
        const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
        menuEl.style.left = `${Math.max(0, r.left - rr.left - 60)}px`;
        menuEl.style.top = `${r.bottom - rr.top + 2}px`;
        menuEl.hidden = false;
        menuEl.querySelector("[data-eq]").addEventListener("click", () => {
          hideMenu();
          if (state.equip({ id: it.id, name: it.name, slot: rec.slot })) {
            say(`You equip the ${it.name.toLowerCase()}.`);
            dirty = true;
            renderPanels();
          }
        });
        menuEl.querySelector("[data-no]").addEventListener("click", hideMenu);
      }));
    equipPanel.innerHTML = EQUIP_SLOTS.map((slot) => {
      const worn = state.raw.equipped[slot];
      return `<div class="wc-skill-row wc-equip-row"><span>${esc(slot)}</span>` +
        (worn
          ? `<b>${spriteSpan(worn.id, worn.name)} ${esc(worn.name)}</b>` +
            `<i><button class="btn wc-unequip" data-slot="${esc(slot)}">Unequip</button></i>`
          : `<b class="wc-equip-empty">empty</b><i></i>`) + `</div>`;
    }).join("") + (() => {
      const b = state.getBonuses(equipMap);
      return `<div class="wc-equip-bonuses"><i>Att (stab) ${b.attack_stab} · Str ${b.melee_strength} · ` +
        `Def (stab/slash/crush) ${b.defence_stab}/${b.defence_slash}/${b.defence_crush} · Prayer ${b.prayer}</i></div>`;
    })();
    equipPanel.querySelectorAll(".wc-unequip").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!state.unequip(btn.dataset.slot)) { say("Your inventory is too full."); return; }
        dirty = true;
        renderPanels();
      }));
    const vitals = `<div class="wc-skill-row"><span>Hitpoints</span>` +
      `<b>${state.raw.hp} / ${state.level("hitpoints")}</b><i></i></div>` +
      `<div class="wc-skill-row"><span>Prayer pts</span>` +
      `<b>${state.raw.prayer} / ${state.level("prayer")}</b><i></i></div>`;
    const skills = Object.keys(state.raw.xp);
    skillsPanel.innerHTML = vitals + (skills.length ? "" : "")
      + skills.map((sk) =>
          `<div class="wc-skill-row"><span>${esc(sk)}</span>` +
          `<b>${state.level(sk)}</b><i>${Math.floor(state.xp(sk)).toLocaleString()} xp</i></div>`).join("");
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

  const TRANSPORT_ACTIONS = new Set(
    ["Enter", "Exit", "Go-through", "Crawl-through", "Climb-through", "Climb-into", "Climb-out"]);
  const caveLike = (loc) =>
    /cave|tunnel|hole|entrance|crevice|crack|passage|trapdoor|stairs/i.test(loc.def.name);

  function startClimb(dest, msg) {
    if (!dest) { say("It doesn't lead anywhere from here."); return; }
    climbing = { ...dest, tries: 0 };
    say(msg);
  }

  function chooseClimb(up, down) {
    menuEl.innerHTML = `<div class="wc-menu-title">Climb up or down?</div>
      <button type="button" class="wc-menu-row" data-c="up">Climb up</button>
      <button type="button" class="wc-menu-row" data-c="down">Climb down</button>`;
    menuEl.style.left = "40%";
    menuEl.style.top = "35%";
    menuEl.hidden = false;
    menuEl.querySelectorAll(".wc-menu-row").forEach((b) =>
      b.addEventListener("click", () => {
        hideMenu();
        startClimb(b.dataset.c === "up" ? up : down, "You climb...");
      }));
  }

  const isBank = (loc) =>
    /^Bank (booth|chest)/.test(loc.def.name) &&
    (loc.def.actions ?? []).some((a) => a === "Bank" || a === "Use");
  const isTree = (loc) => TREES[loc.def.name] != null;
  const isDepleted = (loc) => (depleted.get(loc.key) ?? 0) > tick;

  function dialogue(name, lines) {
    menuEl.innerHTML = `<div class="wc-menu-title">${esc(name)}</div>` +
      lines.map((l) => `<div class="wc-menu-row wc-dialogue-line">${esc(l)}</div>`).join("") +
      `<button type="button" class="wc-menu-row"><b>Continue</b></button>`;
    menuEl.style.left = "25%";
    menuEl.style.top = "30%";
    menuEl.hidden = false;
    menuEl.querySelector("button").addEventListener("click", hideMenu);
  }

  function performNpcAction(npc, action) {
    const name = npc.def.name;
    if (npcDead(npc)) { say("They're not here right now."); return; }
    if (action === "Attack") {
      if (!(npc.def.actions ?? []).includes("Attack")) return;
      combat = { npc, key: npcKey(npc), nextSwing: tick };
      say(`You attack the ${name.toLowerCase()}...`);
      return;
    }
    if (action === "Pickpocket") {
      const p = PICKPOCKET[name];
      if (!p) { say(`Pickpocket data for ${name} isn't sourced yet — refusing to guess loot.`); return; }
      if (state.level("thieving") < p.level) { say(`You need level ${p.level} Thieving.`); return; }
      if (Math.random() < SIM_CONFIG.thieveChanceBase) {
        state.addItem({ id: COINS_ID, name: "Coins", stackable: true }, p.coins);
        const { levelled } = state.addXp("thieving", p.xp);
        say(`You pick the ${name.toLowerCase()}'s pocket. (+${p.xp} Thieving xp, ${p.coins} coins)`);
        if (levelled) say(`Your Thieving level is now ${levelled}.`);
      } else {
        stunnedUntil = tick + p.stunTicks;
        state.raw.hp = Math.max(0, state.raw.hp - p.stunDamage);
        say(`You fail to pick the pocket — you've been stunned!`);
        checkDeath();
      }
      dirty = true;
      renderPanels();
      return;
    }
    if (["Net", "Bait", "Lure", "Cage", "Harpoon", "Small Net", "Big Net"].includes(action)) {
      const fkind = FISHING[action];
      if (!fkind) { say(`${action} fishing needs gear/catch data not yet sourced.`); return; }
      if (!state.hasItem(fkind.tool)) { say(`You need a ${fkind.toolName.toLowerCase()} to fish here.`); return; }
      if (state.level("fishing") < fkind.level) { say(`You need level ${fkind.level} Fishing.`); return; }
      gathering = { loc: npcTarget(npc), kind: "fish", fkind, nextRoll: tick + GATHER_CONFIG.rollTicks };
      say("You cast out your net...");
      return;
    }
    if (action === "Bank" || action === "Collect") {
      bankEl.hidden = false;
      renderBank();
      return;
    }
    if (action === "Talk-to") {
      const extra = (npc.def.actions ?? []).includes("Bank")
        ? "(As a banker, their Bank option works.)"
        : "";
      dialogue(name, [
        "Dialogue scripts live on the game servers and aren't part of any",
        "extracted data — so nothing is invented here.", extra].filter(Boolean));
      return;
    }
    if (action === "Trade") {
      dialogue(name, [
        "Shop stock and prices are server-side data that hasn't been",
        "sourced yet — trading opens once a sourced stock table exists."]);
      return;
    }
    toast(`${action} ${name} — no sourced mechanic for this yet`);
  }

  function checkDeath() {
    if (state.raw.hp > 0) return;
    say("Oh dear, you are dead! You respawn in Lumbridge.");
    state.raw.hp = state.level("hitpoints");
    combat = null; gathering = null;
    teleport(3222, 3218, 0);
    dirty = true;
  }

  function combatTick() {
    if (!combat) return;
    const { npc } = combat;
    if (!adjacentTo(npcTarget(npc)) || npcDead(npc)) { combat = null; return; }
    if (tick < combat.nextSwing) return;
    combat.nextSwing = tick + SIM_CONFIG.attackSpeedTicks;
    const me = { attack: state.level("attack"), strength: state.level("strength"), defence: state.level("defence") };
    const foe = npcCombatants(npc.def.stats);
    const st = npcHp(npc);
    // player swing — sourced formulas over worn-gear bonuses (equipment.pack,
    // stab attack + melee strength; NPC gear bonuses aren't extracted → 0)
    const bon = state.getBonuses(equipMap);
    const mine = swing(me, foe, Math.random, { attBonus: bon.attack_stab, strBonus: bon.melee_strength });
    st.hp -= mine.damage;
    say(mine.hit ? `You hit ${mine.damage}.` : "You miss.");
    if (mine.damage) {
      const { levelled } = state.addXp("attack", 4 * mine.damage);
      state.addXp("hitpoints", Math.floor(1.33 * mine.damage * 100) / 100);
      if (levelled) say(`Your Attack level is now ${levelled}.`);
    }
    if (st.hp <= 0) {
      st.deadUntil = tick + SIM_CONFIG.npcRespawnTicks;
      say(`The ${npc.def.name.toLowerCase()} dies.`);
      rollDrops(npc);
      combat = null;
      dirty = true;
      renderPanels();
      return;
    }
    // retaliation
    const theirs = swing(foe, me);
    if (theirs.hit) {
      state.raw.hp = Math.max(0, state.raw.hp - theirs.damage);
      say(`The ${npc.def.name.toLowerCase()} hits you for ${theirs.damage}.`);
      checkDeath();
    }
    dirty = true;
    renderPanels();
  }

  function performAction(loc, action) {
    if (loc._npc) {
      performNpcAction(loc._npcRef, action);
      return;
    }
    if (action === "Search") {
      // the documented default for searchable scenery; specific yields are
      // server data and never guessed
      say(`You search the ${loc.def.name.toLowerCase()} but find nothing of interest.`);
      return;
    }
    if (action === "Pray" || action === "Pray-at") {
      state.raw.prayer = state.level("prayer");
      say("You recharge your Prayer points.");
      dirty = true;
      renderPanels();
      return;
    }
    if (action === "Read") {
      dialogue(loc.def.name, [
        "The text on this is stored server-side and hasn't been extracted —",
        "nothing is invented here."]);
      return;
    }
    if ((action === "Open" || action === "Close") && loc.type >= 9 && loc.type <= 11) {
      // full-block gates/doors: toggle the footprint's FULL clipping
      const k = loc.key;
      const tiles = [];
      for (let ox = 0; ox < loc.w; ox++)
        for (let oy = 0; oy < loc.h; oy++)
          tiles.push({ x: loc.x + ox, y: loc.y + oy, mask: FULL });
      if (openDoors.has(k)) {
        for (const e of openDoors.get(k)) {
          const ck = `${loc.plane}:${e.x},${e.y}`;
          cleared.set(ck, (cleared.get(ck) ?? 0) & ~e.mask);
        }
        openDoors.delete(k);
      } else {
        for (const e of tiles) {
          const ck = `${loc.plane}:${e.x},${e.y}`;
          cleared.set(ck, (cleared.get(ck) ?? 0) | e.mask);
        }
        openDoors.set(k, tiles);
      }
      return;
    }
    if (action === "Deposit") {
      bankEl.hidden = false;
      renderBank();
      return;
    }
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
    if (isClimbAction(action)) {
      startClimb(climbDestination(player, action), action === "Climb-up" ? "You climb up..." : "You climb down...");
      return;
    }
    if (action === "Climb") {
      // generic Climb: the game asks which way — offer both when both exist
      const up = climbDestination(player, "Climb-up");
      const down = climbDestination(player, "Climb-down");
      if (up && down) { chooseClimb(up, down); return; }
      startClimb(up ?? down, "You climb...");
      return;
    }
    if (action === "Top-floor" || action === "Bottom-floor") {
      const planes = manifest[regionAt(player.x, player.y)]?.planes ?? [0];
      const target = action === "Top-floor" ? Math.max(...planes) : 0;
      if (target === player.plane) { say("You are already there."); return; }
      startClimb({ x: player.x, y: player.y, plane: target }, "You take the staircase...");
      return;
    }
    if (TRANSPORT_ACTIONS.has(action) && caveLike(loc)) {
      // passage transports use the same documented dungeon-band convention
      const dest = player.y >= 6400
        ? { x: player.x, y: player.y - 6400, plane: 0 }
        : { x: player.x, y: player.y + 6400, plane: 0 };
      startClimb(dest, "You go through...");
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

    const skill = kind === "tree" ? "woodcutting" : kind === "fish" ? "fishing" : "mining";
    const roll = kind === "tree"
      ? chopRoll(loc.def.name, state.level(skill), (id) => state.hasItem(id))
      : kind === "fish"
        ? { ok: Math.random() < SIM_CONFIG.fishChanceBase, fish: gathering.fkind }
        : mineRoll(loc.id, state.level(skill), (id) => state.hasItem(id));
    if (roll.error) { gathering = null; return; }
    if (!roll.ok) return;
    const res = roll.tree ?? roll.rock ?? roll.fish;
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
    pickup = null;
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
    if (tick < stunnedUntil) { kdx = 0; kdy = 0; path = []; }
    if (kdx || kdy) {
      path = []; pending = null; gathering = null; combat = null; pickup = null;
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
    if (tick < stunnedUntil) { posEl.textContent += ""; }
    gatherTick();
    combatTick();
    climbTick();
    pickupTick();
    if (groundItems.length) groundItems = groundItems.filter((g) => g.despawnTick > tick);
    if (tick % SIM_CONFIG.hpRegenTicks === 0 && state.raw.hp < state.level("hitpoints")) {
      state.raw.hp++;
      dirty = true;
      renderPanels();
    }
    for (const [key, until] of depleted) if (until <= tick) depleted.delete(key);
    if (dirty && tick % 5 === 0) save();
    const floor = player.plane > 0 ? ` · floor ${player.plane}`
      : player.y >= 6400 ? " · underground" : "";
    posEl.textContent = `(${player.x}, ${player.y}) · region ${regionAt(player.x, player.y)}${floor}`;
    tickEl.textContent = `tick ${tick}`;
  }

  function climbTick() {
    if (!climbing) return;
    const { x, y, plane } = climbing;
    const rk = `${regionAt(x, y)}:${plane}`;
    const g = grids.get(rk);
    if (g === undefined || g === "loading") {
      loadRegion(regionAt(x, y), plane);
      if (++climbing.tries > 20) { climbing = null; say("That way isn't mapped; staying put."); }
      return;
    }
    climbing = null;
    if (!(g instanceof Uint16Array)) { say("That way isn't mapped; staying put."); return; }
    const flags = (tx, ty) => {
      const gg = grids.get(`${regionAt(tx, ty)}:${plane}`);
      return gg instanceof Uint16Array ? gg[(ty & 63) * REGION + (tx & 63)] : null;
    };
    const spot = settleTile(flags, x, y, FULL);
    if (!spot) { say("There's nowhere to stand over there."); return; }
    teleport(spot.x, spot.y, plane);
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
    const npc = npcAt(hoverTile.x, hoverTile.y);
    const loc = locAt(hoverTile.x, hoverTile.y);
    const gi = groundAt(hoverTile.x, hoverTile.y);
    if (npc && !npcDead(npc)) {
      const acts = (npc.def.actions ?? []).filter(Boolean);
      const lvl = npc.def.combat_level > 0 ? ` (level-${npc.def.combat_level})` : "";
      hoverEl.textContent = `${acts[0] ?? ""} ${npc.def.name}${lvl}`;
    } else if (gi) {
      hoverEl.textContent = `Take ${gi.name}`;
    } else if (loc) {
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
    const npc = npcAt(t.x, t.y);
    if (npc && !npcDead(npc) && objEl.checked) {
      const acts = (npc.def.actions ?? []).filter(Boolean);
      if (acts.length) { walkToLoc(npcTarget(npc), acts[0]); canvas.focus(); return; }
    }
    const gi = groundAt(t.x, t.y);
    if (gi) {
      pickup = gi; pending = null; gathering = null;
      path = findPath(flagsAt, player.x, player.y, gi.x, gi.y);
      canvas.focus();
      return;
    }
    const loc = locAt(t.x, t.y);
    if (loc && objEl.checked) {
      const acts = menuActions(loc);
      if (acts.length) { walkToLoc(loc, acts[0]); canvas.focus(); return; }
    }
    pending = null;
    pickup = null;
    path = findPath(flagsAt, player.x, player.y, t.x, t.y);
    canvas.focus();
  });

  function hideMenu() { menuEl.hidden = true; menuEl.innerHTML = ""; }

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const t = tileFromEvent(e);
    const loc = locAt(t.x, t.y);
    const rows = [];
    const npc = npcAt(t.x, t.y);
    if (npc && objEl.checked) {
      const lvl = npc.def.combat_level > 0 ? ` (level-${npc.def.combat_level})` : "";
      for (const a of (npc.def.actions ?? []).filter(Boolean))
        rows.push({ label: `${esc(a)} <b>${esc(npc.def.name)}${lvl}</b>`, run: () => walkToLoc(npcTarget(npc), a) });
    }
    const gi = groundAt(t.x, t.y);
    if (gi) {
      rows.push({ label: `Take <b>${esc(gi.name)}</b>`, run: () => {
        pickup = gi; pending = null; gathering = null;
        path = findPath(flagsAt, player.x, player.y, gi.x, gi.y);
      } });
    }
    if (loc && objEl.checked) {
      for (const a of menuActions(loc))
        rows.push({ label: `${esc(a)} <b>${esc(loc.def.name)}</b>`, run: () => walkToLoc(loc, a) });
    }
    rows.push({ label: "Walk here", run: () => { pending = null; pickup = null; path = findPath(flagsAt, player.x, player.y, t.x, t.y); } });
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
    teleport(x, y, 0);
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
    for (const [, locs] of regionLocs) {
      if (!Array.isArray(locs)) continue;
      for (const loc of locs) {
        if (loc.plane !== player.plane) continue;
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
        const bmp = bitmaps.get(`${rid}:${player.plane}`);
        if (bmp === undefined) loadRegion(rid, player.plane);
        if (!(bmp instanceof ImageBitmap)) continue;
        const sx = (bx - c.x) * tilePx + canvas.width / 2;
        const sy = (c.y - (by + REGION)) * tilePx + canvas.height / 2;
        ctx.drawImage(bmp, sx, sy, REGION * tilePx, REGION * tilePx);
      }
    }

    if (objEl.checked) drawLocs(c);
    if (objEl.checked) {
      ctx.fillStyle = "#f5e642";
      for (const [, npcs] of regionNpcs) {
        if (!Array.isArray(npcs)) continue;
        for (const n of npcs) {
          if (n.plane !== player.plane) continue;
          const [sx, sy] = toScreen(c, n.x, n.y);
          if (sx < -tilePx || sy < -tilePx || sx > canvas.width || sy > canvas.height) continue;
          ctx.fillStyle = npcDead(n) ? "rgba(150,150,150,0.5)" : "#f5e642";
          ctx.fillRect(sx + tilePx / 2 - tilePx / 6, sy + tilePx / 2 - tilePx / 6, tilePx / 3, tilePx / 3);
        }
      }
    }

    // ground items: small red dot at tile centre (minimap item convention)
    for (const g of groundItems) {
      if (g.plane !== player.plane) continue;
      const [sx, sy] = toScreen(c, g.x, g.y);
      if (sx < -tilePx || sy < -tilePx || sx > canvas.width || sy > canvas.height) continue;
      const d = Math.max(2, tilePx / 8);
      ctx.fillStyle = "#e33232";
      ctx.fillRect(sx + tilePx / 2 - d / 2, sy + tilePx / 2 - d / 2, d, d);
    }

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
