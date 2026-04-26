/**
 * Detection pipeline test — runs matchItems() from sprite.js via Node.js.
 *
 * Generates synthetic scenes by compositing known sprites onto a realistic
 * OSRS background, then asserts 100% correct attribution with no false positives.
 *
 * Usage:  node tools/test_detection.mjs
 */

import { createCanvas, loadImage, ImageData, Canvas } from "canvas";
import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

// ── Browser shims so sprite.js runs in Node ───────────────────────────────────

// OffscreenCanvas backed by node-canvas.
class OffscreenCanvas {
  constructor(w, h) { this._c = createCanvas(w, h); this.width = w; this.height = h; }
  getContext(type, opts) {
    const ctx = this._c.getContext(type, opts);
    // Expose getImageData returning plain {data,width,height} — same shape as browser.
    return ctx;
  }
  // convertToBlob not needed for matchItems path.
}

// ImageBitmap wraps a node-canvas Image and exposes width/height.
class ImageBitmap {
  constructor(img) { this._img = img; this.width = img.width; this.height = img.height; }
  close() {}
}

async function createImageBitmap(src) {
  if (src instanceof ImageBitmap) return src;
  // src is our Image shim — wrap it.
  return new ImageBitmap(src._img ?? src);
}

// OffscreenCanvas.getContext("2d").drawImage needs to accept our ImageBitmap.
// node-canvas drawImage already handles Image objects; we unwrap ours.
const _origDraw = Canvas.prototype.getContext;
// Patch drawImage on any 2d context returned by node-canvas to unwrap ImageBitmap.
function patchCtx(ctx) {
  const orig = ctx.drawImage.bind(ctx);
  ctx.drawImage = (src, ...args) => {
    if (src instanceof ImageBitmap)   return orig(src._img, ...args);
    if (src instanceof OffscreenCanvas) return orig(src._c, ...args);
    return orig(src, ...args);
  };
  return ctx;
}

// Image shim — sprite.js loadSheet uses `new Image(); img.src = ...`
// node-canvas's loadImage is async, so we simulate the sync-assign + onload pattern.
class Image {
  constructor() { this.onload = null; this.onerror = null; this.crossOrigin = null; }
  set src(url) {
    const file = path.join(ROOT, url.startsWith("/") ? url.slice(1) : url);
    loadImage(file).then(img => {
      this.width = img.width; this.height = img.height; this._img = img;
      if (this.onload) this.onload();
    }).catch(e => { if (this.onerror) this.onerror(e); });
  }
}

// Minimal sessionStorage / localStorage shims (no persistence needed for tests).
const _ss = new Map(), _ls = new Map();
const sessionStorage = {
  getItem: k => _ss.has(k) ? _ss.get(k) : null,
  setItem: (k, v) => _ss.set(k, v),
};
const localStorage = {
  getItem:  k     => _ls.has(k) ? _ls.get(k) : null,
  setItem:  (k,v) => _ls.set(k, v),
  key:      i     => [..._ls.keys()][i] ?? null,
  get length()    { return _ls.size; },
};

// fetch backed by local files — sprite.js only fetches relative paths starting with "/".
async function fetch(url) {
  const file = path.join(ROOT, url.startsWith("/") ? url.slice(1) : url);
  const buf  = readFileSync(file);
  return {
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json:        async () => JSON.parse(buf.toString()),
    blob:        async () => buf,   // unused for matchItems path
  };
}

// Worker is only used in cropSpritesAsync — not needed for matchItems path.
class Worker { constructor() {} postMessage() {} set onmessage(_) {} }
const URL_shim = { createObjectURL: () => "" };
const Blob_shim = class {};
class CustomEvent { constructor(t, o) { this.type = t; this.detail = o?.detail; } }

// Minimal window.
const window = {
  SpriteAtlas: null,
  _atlasFpPromise: null,
  addEventListener: () => {},
  dispatchEvent:    () => {},
};

// ── Load sprite.js into our shimmed environment ───────────────────────────────

const spriteSource = readFileSync(path.join(ROOT, "assets/js/sprite.js"), "utf8");

// Patch OffscreenCanvas.getContext to return a drawImage-patched context.
// We intercept the source to hook OffscreenCanvas getContext at the class level.
const patchedSource = spriteSource
  // Replace `new Worker(...)` path: Worker constructor does nothing, postMessage does nothing.
  // No source patching needed — the shims above are injected into the eval scope.
  + "\n; // end of sprite.js\n";

// Evaluate in a scope with all shims available.
const fn = new Function(
  "window", "sessionStorage", "localStorage", "fetch",
  "OffscreenCanvas", "createImageBitmap", "ImageBitmap",
  "Worker", "URL", "Blob", "CustomEvent", "Image",
  patchedSource,
);

// Patch OffscreenCanvas.prototype.getContext so drawImage unwraps ImageBitmap.
const OrigGetContext = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function(type, opts) {
  const ctx = this._c.getContext(type, opts);
  return patchCtx(ctx);
};

fn(window, sessionStorage, localStorage, fetch,
   OffscreenCanvas, createImageBitmap, ImageBitmap,
   Worker, URL_shim, Blob_shim, CustomEvent, Image);

const SpriteAtlas = window.SpriteAtlas;

// ── Scene generation ──────────────────────────────────────────────────────────

const SLOT_W = 36, SLOT_H = 32;
const SCENE_BG = [73, 64, 52];   // real screenshot BG from loot.png / reward_chest.png

/**
 * Composite sprite RGBA tile onto a solid BG, return RGB canvas.
 * Mirrors the build_hist_index composite logic but for any BG.
 */
function compositeTile(tileData, w, h, bg) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = tileData[i*4+3] / 255;
    out[i*4]   = Math.round(tileData[i*4]   * a + bg[0] * (1 - a));
    out[i*4+1] = Math.round(tileData[i*4+1] * a + bg[1] * (1 - a));
    out[i*4+2] = Math.round(tileData[i*4+2] * a + bg[2] * (1 - a));
    out[i*4+3] = 255;
  }
  return out;
}

/**
 * Build a synthetic scene.
 * items: [{id, e}] where e = atlas entry {x,y,w,h}
 * Returns {canvas, placements: [{id, x, y}]}
 */
function makeScene(items, sheetCanvas, bg, cols, gap = 4) {
  const rows   = Math.ceil(items.length / cols);
  const W      = cols * SLOT_W + (cols + 1) * gap;
  const H      = rows * SLOT_H + (rows + 1) * gap;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // Fill BG.
  ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0, 0, W, H);

  const sheetCtx = sheetCanvas.getContext("2d");
  const placements = [];

  items.forEach(({ id, e }, idx) => {
    const col  = idx % cols;
    const row  = Math.floor(idx / cols);
    const x    = gap + col * (SLOT_W + gap);
    const y    = gap + row * (SLOT_H + gap);

    const tileData = sheetCtx.getImageData(e.x, e.y, SLOT_W, SLOT_H);
    const rgb      = compositeTile(tileData.data, SLOT_W, SLOT_H, bg);
    const imgData  = new ImageData(new Uint8ClampedArray(rgb), SLOT_W, SLOT_H);

    ctx.putImageData(imgData, x, y);
    placements.push({ id, x, y });
  });

  return { canvas, placements };
}

// ── Test runner ───────────────────────────────────────────────────────────────

/**
 * Build a map from each sprite ID to its pixel fingerprint (all 4-channel bytes).
 * Two IDs with the same fingerprint are visually identical duplicates.
 */
function buildDupeGroups(atlasRaw, sheetCanvas) {
  const ctx = sheetCanvas.getContext("2d");
  const fingerprint = (id) => {
    const e = atlasRaw[String(id)];
    if (!e) return null;
    return ctx.getImageData(e.x, e.y, 36, 32).data.join(",");
  };
  const fpMap = new Map();  // fingerprint → Set<id>
  for (const idStr of Object.keys(atlasRaw)) {
    const id = +idStr;
    const fp = fingerprint(id);
    if (!fp) continue;
    if (!fpMap.has(fp)) fpMap.set(fp, new Set());
    fpMap.get(fp).add(id);
  }
  // id → Set of all IDs sharing its fingerprint
  const result = new Map();
  for (const ids of fpMap.values()) {
    for (const id of ids) result.set(id, ids);
  }
  return result;
}

function runTest(name, placements, matchResults, dupeGroups) {
  const expectedIds = new Set(placements.map(p => p.id));
  // Expand expected set to include all pixel-identical duplicates.
  const acceptIds = new Set();
  for (const id of expectedIds) {
    const dupes = dupeGroups?.get(id);
    if (dupes) for (const d of dupes) acceptIds.add(d);
    else acceptIds.add(id);
  }
  // Each expected ID is satisfied if any duplicate was found.
  const satisfied = new Set([...expectedIds].filter(id => {
    const dupes = dupeGroups?.get(id) ?? new Set([id]);
    return [...dupes].some(d => matchResults.some(r => r.id === d));
  }));
  const foundIds = new Set(matchResults.map(r => r.id));
  const missed = [...expectedIds].filter(id => !satisfied.has(id));
  const extra  = [...foundIds].filter(id => !acceptIds.has(id));
  const ok     = missed.length === 0 && extra.length === 0;

  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  for (const r of [...matchResults].sort((a, b) => a.id - b.id)) {
    const tag = acceptIds.has(r.id) ? "✓" : "✗ FALSE POSITIVE";
    console.log(`         id=${String(r.id).padStart(6)}  ncc=${r.score.toFixed(4)}  ${tag}`);
  }
  if (missed.length) console.log(`         MISSED: ${missed}`);
  return ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading SpriteAtlas ...");
  await SpriteAtlas.load("/");
  await SpriteAtlas.loadHistIndex("/");
  // _sheetBitmap is set in a floating .then() inside load() — wait for it.
  await new Promise(r => setTimeout(r, 200));
  console.log("  Atlas + histogram index ready.");

  // Load sheet canvas for tile extraction in scene generation.
  const sheetImg    = await loadImage(path.join(ROOT, "assets/data/cache/sprites/items.png"));
  const sheetCanvas = createCanvas(sheetImg.width, sheetImg.height);
  patchCtx(sheetCanvas.getContext("2d")).drawImage(sheetImg, 0, 0);

  // Pick a stable set of items for synthetic tests (seeded selection).
  const atlasRaw = JSON.parse(readFileSync(path.join(ROOT, "assets/data/cache/sprites/items-atlas.json"), "utf8"));
  const eligible = Object.entries(atlasRaw)
    .filter(([, e]) => e.w === SLOT_W && e.h === SLOT_H)
    .map(([id, e]) => ({ id: +id, e }));

  // Build duplicate groups (pixel-identical sprites) for test assertions.
  console.log("Building duplicate sprite groups ...");
  const dupeGroups = buildDupeGroups(atlasRaw, sheetCanvas);
  console.log(`  done.`);

  // Deterministic shuffle via simple LCG seeded at 42.
  let seed = 42;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  const shuffled = [...eligible].sort(() => rand() - 0.5);

  // Sanity: single known item (abyssal whip 4151) should score 1.0.
  {
    const e   = atlasRaw["4151"];
    const td  = sheetCanvas.getContext("2d").getImageData(e.x, e.y, SLOT_W, SLOT_H);
    const sc  = createCanvas(SLOT_W, SLOT_H);
    const ctx = sc.getContext("2d");
    ctx.fillStyle = `rgb(${SCENE_BG})`;
    ctx.fillRect(0, 0, SLOT_W, SLOT_H);
    const out = new Uint8ClampedArray(SLOT_W * SLOT_H * 4);
    for (let i = 0; i < SLOT_W * SLOT_H; i++) {
      const a = td.data[i*4+3] / 255;
      out[i*4]   = Math.round(td.data[i*4]   * a + SCENE_BG[0] * (1-a));
      out[i*4+1] = Math.round(td.data[i*4+1] * a + SCENE_BG[1] * (1-a));
      out[i*4+2] = Math.round(td.data[i*4+2] * a + SCENE_BG[2] * (1-a));
      out[i*4+3] = 255;
    }
    ctx.putImageData(new ImageData(out, SLOT_W, SLOT_H), 0, 0);
    const hits = await SpriteAtlas.matchItems(ctx.getImageData(0, 0, SLOT_W, SLOT_H), { bg: SCENE_BG });
    console.log("  Sanity (abyssal whip 4151):", hits[0] ?? "NO HIT");
  }

  const results = [];

  // Test 1: 4×5 grid, 20 items, standard BG.
  {
    const items = shuffled.slice(0, 20);
    const { canvas, placements } = makeScene(items, sheetCanvas, SCENE_BG, 4);
    const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const hits    = await SpriteAtlas.matchItems(imgData, { bg: SCENE_BG });
    results.push(runTest("4×5 grid  (20 items, standard BG)", placements, hits, dupeGroups));
  }

  // Test 2: shifted BG ±8.
  {
    const shiftedBg = SCENE_BG.map(c => Math.min(255, Math.max(0, c + 8)));
    const items     = shuffled.slice(20, 32);
    const { canvas, placements } = makeScene(items, sheetCanvas, shiftedBg, 4);
    const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const hits    = await SpriteAtlas.matchItems(imgData, { bg: shiftedBg });
    results.push(runTest(`shifted BG [${shiftedBg}]  (12 items)`, placements, hits, dupeGroups));
  }

  // Test 3: 5 items in a sparse single row.
  {
    const items = shuffled.slice(32, 37);
    const { canvas, placements } = makeScene(items, sheetCanvas, SCENE_BG, 5, 20);
    const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const hits    = await SpriteAtlas.matchItems(imgData, { bg: SCENE_BG });
    results.push(runTest("sparse row  (5 items, 20px gap)", placements, hits, dupeGroups));
  }

  // Real samples — print results, no assertion on IDs (ground truth not encoded).
  const samples = [
    path.join(__dirname, "loot.png"),
    path.join(__dirname, "reward_chest.png"),
    path.join(ROOT, "items/samples/inventory paste example.png"),
    path.join(ROOT, "items/samples/image.png"),
  ];
  console.log("\nReal sample results (inspect manually):");
  for (const p of samples) {
    if (!existsSync(p)) continue;
    const img     = await loadImage(p);
    const canvas  = createCanvas(img.width, img.height);
    patchCtx(canvas.getContext("2d")).drawImage(img, 0, 0);
    const imgData = canvas.getContext("2d").getImageData(0, 0, img.width, img.height);
    const hits    = await SpriteAtlas.matchItems(imgData);
    const pack    = SpriteAtlas.entry ? null : null;
    console.log(`  ${path.basename(p)}  →  ${hits.length} hits`);
    for (const h of [...hits].sort((a, b) => b.score - a.score)) {
      const entry = SpriteAtlas.entry(h.id);
      console.log(`    id=${String(h.id).padStart(6)}  ncc=${h.score.toFixed(4)}  ${entry?.name ?? "(unknown)"}`);
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Synthetic: ${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
  console.log("All assertions passed.");
}

main().catch(e => { console.error(e); process.exit(1); });
