/**
 * SpriteAtlas — item icon renderer backed by the generated spritesheet + atlas.
 *
 * Usage:
 *   await SpriteAtlas.load(baseUrl);
 *   SpriteAtlas.draw(ctx, 4151, dx, dy);          // onto canvas 2d context
 *   SpriteAtlas.css(4151);                         // CSS background shorthand string
 *   SpriteAtlas.entry(4151);                       // full pack record for item
 *   SpriteAtlas.byName("abyssal whip");            // record by name (lowercase)
 *   SpriteAtlas.search("whip");                    // array of matching records
 *
 * Screenshot detection (colour-histogram, scale-invariant):
 *   await SpriteAtlas.loadHistIndex(baseUrl);      // load items-hist.pack once
 *   const hits = SpriteAtlas.detectItems(imageData, { bg }); // [{itemId,score,col,row}, ...]
 */
(function (root) {
  const ATLAS_PATH = "/assets/data/cache/sprites/items-atlas.json";
  const SHEET_PATH = "/assets/data/cache/sprites/items.png";
  const PACK_PATH  = "/assets/data/cache/items.pack";
  const SS_ATLAS     = "osrs-sprite-atlas";
  const SS_PACK      = "osrs-sprite-pack";
  const SS_HIST_PACK = "osrs-hist-pack";
  const LS_PFX     = "osrs-sprite-";   // localStorage key per item: osrs-sprite-{id}

  let _base     = "";
  let _atlas       = null;   // {id: {x,y,w,h}}
  let _byId        = null;   // {id: packRecord}
  let _byName      = null;   // {"lowercase name": packRecord}
  let _promise     = null;
  let _cssCache    = new Map(); // itemId → css string, in-memory
  let _sheetBitmap = null;      // ImageBitmap of the full spritesheet, for NCC matching

  // ── Session cache helpers ──────────────────────────────────────────────────
  function ssGet(key) {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function ssSet(key, val) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* quota exceeded — skip */ }
  }

  // ── Pack reader ────────────────────────────────────────────────────────────
  // Binary format: "OSRP" + 4B count + N×12B index (id:4LE, offset:4LE, len:4LE) + JSON blobs

  async function readPack(url, cacheKey) {
    const key    = cacheKey ?? SS_PACK;
    const cached = ssGet(key);
    if (cached) return cached;
    const buf  = await fetch(url).then((r) => r.arrayBuffer());
    const view = new DataView(buf);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== "OSRP") throw new Error("Not an OSRP pack: " + url);
    const count  = view.getInt32(4, true);
    const dec    = new TextDecoder();
    const result = {};
    for (let i = 0; i < count; i++) {
      const base   = 8 + i * 12;
      const id     = view.getInt32(base,     true);
      const offset = view.getInt32(base + 4, true);
      const len    = view.getInt32(base + 8, true);
      const rec    = JSON.parse(dec.decode(new Uint8Array(buf, offset, len)));
      result[id]   = rec;
    }
    ssSet(key, result);
    return result;
  }

  async function fetchAtlas(url) {
    const cached = ssGet(SS_ATLAS);
    if (cached) return cached;
    const atlas = await fetch(url).then((r) => r.json());
    ssSet(SS_ATLAS, atlas);
    return atlas;
  }

  function cropSpritesAsync(atlas, img) {
    const uncached = Object.entries(atlas).filter(([id]) => !localStorage.getItem(LS_PFX + id));
    if (!uncached.length) { return; }
    let remaining = uncached.length;
    createImageBitmap(img).then((bitmap) => {
      const src = `
        self.onmessage = ({ data: { bitmap, entries } }) => {
          entries.forEach(([id, e]) => {
            const oc = new OffscreenCanvas(e.w, e.h);
            oc.getContext("2d").drawImage(bitmap, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
            oc.convertToBlob({ type: "image/png" }).then((blob) => {
              const fr = new FileReader();
              fr.onload = () => self.postMessage({ id, dataUrl: fr.result });
              fr.readAsDataURL(blob);
            });
          });
        };
      `;
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = ({ data: { id, dataUrl } }) => {
        try { localStorage.setItem(LS_PFX + id, dataUrl); } catch { /* quota */ }
        _cssCache.delete(+id);
        window.dispatchEvent(new CustomEvent("osrs-sprite-ready", { detail: { id: +id, dataUrl } }));
        window._atlasFpPromise = null;
        SpriteAtlas.invalidateBuckets();
        if (--remaining === 0) { worker.terminate(); }
      };
      worker.postMessage({ bitmap, entries: uncached }, [bitmap]);
    });
  }

  function loadSheet(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ── Multi-anchor cross fingerprint ────────────────────────────────────────
  //
  // Each sprite gets 6 anchors placed at the 2/5 offset within each third of
  // the icon (upper-left, upper-center, upper-right, mid-left, mid-center, mid-right).
  // Each anchor stores 4 cross tiers as independent checksums:
  //   tier 0: 1×1  — the single center pixel         [r,g,b,n]
  //   tier 1: 3×3  — the 8 border pixels of a 3×3    [r,g,b,n]
  //   tier 2: 5×5  — the 16 border pixels of a 5×5   [r,g,b,n]
  //   tier 3: 7×7  — the 24 border pixels of a 7×7   [r,g,b,n]
  // Only opaque pixels (alpha >= 16) count. Stored as Int32Array, 16 values per anchor.
  // Buckets are keyed by tier-0 (center pixel) of each anchor — 6 entries per sprite.

  const FP_TIERS = 4;          // tier 0..3  → cross size 1,3,5,7
  const FP_ANCHOR_COLS = 3;
  const FP_ANCHOR_ROWS = 2;
  const FP_ANCHORS = FP_ANCHOR_COLS * FP_ANCHOR_ROWS;  // 6
  const FP_VALUES  = FP_TIERS * 4;   // [r,g,b,n] × 4 tiers per anchor

  // Compute anchor positions: 2/5 into each column/row third of the icon.
  function anchorPositions(slotW, slotH) {
    const pos = [];
    for (let row = 0; row < FP_ANCHOR_ROWS; row++) {
      for (let col = 0; col < FP_ANCHOR_COLS; col++) {
        const x = Math.round((col + 0.4) * slotW / FP_ANCHOR_COLS);
        const y = Math.round((row + 0.4) * slotH / FP_ANCHOR_ROWS);
        pos.push(x, y);
      }
    }
    return pos; // flat [x0,y0, x1,y1, ...]
  }

  // Build cross-tier checksums for one anchor at (ax, ay) in an RGBA pixel buffer.
  // Returns 16 Int32 values [r,g,b,n] × 4 tiers, written into out[] at offset.
  function buildAnchorTiers(pixels, slotW, slotH, ax, ay, out, offset) {
    for (let t = 0; t < FP_TIERS; t++) {
      const half = t; // cross extends ±t from center; tier 0 = center only
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== half) continue; // border only
          const x = ax + dx, y = ay + dy;
          if (x < 0 || y < 0 || x >= slotW || y >= slotH) continue;
          const i = (y * slotW + x) * 4;
          if (pixels[i + 3] < 16) continue;
          sr += pixels[i]; sg += pixels[i+1]; sb += pixels[i+2]; n++;
        }
      }
      const base = offset + t * 4;
      out[base] = sr; out[base+1] = sg; out[base+2] = sb; out[base+3] = n;
    }
  }

  // Bucket key: 5 bits/channel from a raw RGB triple.
  const bucketKey = (r, g, b) => (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);

  // Load one localStorage sprite → {id, anchors, anchorPos, pixels} or null.
  //   anchors:   Int32Array, FP_ANCHORS × FP_VALUES entries
  //   anchorPos: flat [x,y,...] for each anchor (6 pairs)
  //   pixels:    Uint8Array, slotW × slotH × 4
  async function loadEntry(key, slotW, slotH) {
    const url = localStorage.getItem(key);
    if (!url) return null;
    const id = key.slice(LS_PFX.length);
    try {
      const bmp = await createImageBitmap(await fetch(url).then(r => r.blob()));
      const oc  = new OffscreenCanvas(slotW, slotH);
      const ctx = oc.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const raw       = ctx.getImageData(0, 0, slotW, slotH).data;
      const anchorPos = anchorPositions(slotW, slotH);
      const anchors   = new Int32Array(FP_ANCHORS * FP_VALUES);
      for (let a = 0; a < FP_ANCHORS; a++) {
        buildAnchorTiers(raw, slotW, slotH, anchorPos[a*2], anchorPos[a*2+1], anchors, a * FP_VALUES);
      }
      return { id, anchors, anchorPos, pixels: new Uint8Array(raw.buffer) };
    } catch { return null; }
  }

  let _bucketsPromise = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  const SpriteAtlas = {
    /** Load atlas, spritesheet, and item pack. Call once per page. */
    load(base) {
      if (_promise) return _promise;
      _base = base ?? "";
      _promise = Promise.all([
        fetchAtlas(_base + ATLAS_PATH),
        loadSheet(_base + SHEET_PATH),
        readPack(_base + PACK_PATH),
      ]).then(([atlas, sheet, pack]) => {
        _atlas  = atlas;
        _byId   = pack;
        _byName = Object.values(pack).reduce((m, rec) => {
          if (rec.name) m[rec.name.toLowerCase()] = rec;
          if (rec.slug) m[rec.slug] = rec;
          return m;
        }, {});
        createImageBitmap(sheet).then(bmp => { _sheetBitmap = bmp; });
        cropSpritesAsync(atlas, sheet);
      });
      return _promise;
    },

    /** Draw item icon onto a 2D canvas context at (dx, dy). */
    draw(ctx, itemId, dx, dy) {
      if (!_atlas) return;
      const e = _atlas[itemId] ?? _atlas[String(itemId)];
      if (!e) return;
      const dataUrl = localStorage.getItem(LS_PFX + itemId);
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, dx, dy);
      img.src = dataUrl;
    },

    /** CSS background for a sized container — data URL from localStorage only, empty string if not yet cached. */
    css(itemId) {
      if (!_atlas) return "";
      const key = +itemId;
      if (_cssCache.has(key)) return _cssCache.get(key);
      const dataUrl = localStorage.getItem(LS_PFX + key);
      if (dataUrl) {
        const val = `url('${dataUrl}') no-repeat center / contain`;
        _cssCache.set(key, val);
        return val;
      }
      return "";
    },

    /** Sprite dimensions {w, h} from the atlas, or null if not found. */
    dims(itemId) {
      const e = _atlas?.[itemId] ?? _atlas?.[String(itemId)];
      return e ? { w: e.w, h: e.h } : null;
    },

    /** Full pack record for an item by numeric ID. */
    entry(itemId) {
      return _byId?.[itemId] ?? _byId?.[String(itemId)] ?? null;
    },

    /** Pack record lookup by lowercase name or slug. */
    byName(name) {
      return _byName?.[name.toLowerCase()] ?? null;
    },

    /** All records whose name contains the query string (case-insensitive). */
    search(query) {
      if (!_byName) return [];
      const q = query.toLowerCase();
      return Object.values(_byId ?? {}).filter((r) => r.name?.toLowerCase().includes(q));
    },

    /** True once load() has resolved. */
    get ready() { return _atlas !== null && _byId !== null; },

    /**
     * Build (or return cached) a bucket map for pixel-matching uploads.
     * Map<bucketKey, [{id, anchorIdx, anchors, anchorPos, pixels}]>
     * slotW/slotH default to 36×32 (inventory slot size used by the router).
     */
    buildBuckets(slotW = 36, slotH = 32) {
      if (_bucketsPromise) return _bucketsPromise;
      _bucketsPromise = (async () => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(LS_PFX) && k !== SS_ATLAS && k !== SS_PACK) keys.push(k);
        }
        const BATCH = 64;
        const entries = [];
        for (let i = 0; i < keys.length; i += BATCH) {
          const batch = await Promise.all(keys.slice(i, i + BATCH).map(k => loadEntry(k, slotW, slotH)));
          batch.forEach(e => { if (e) entries.push(e); });
        }
        // One bucket entry per anchor per sprite, keyed by that anchor's tier-0 pixel.
        // Bucket value: { id, anchorIdx, anchors, anchorPos, pixels }
        const map = new Map();
        for (const e of entries) {
          for (let a = 0; a < FP_ANCHORS; a++) {
            const base = a * FP_VALUES;
            if (e.anchors[base + 3] === 0) continue; // anchor center transparent
            const k = bucketKey(e.anchors[base], e.anchors[base+1], e.anchors[base+2]);
            let bucket = map.get(k);
            if (!bucket) { bucket = []; map.set(k, bucket); }
            bucket.push({ id: e.id, anchorIdx: a, anchors: e.anchors, anchorPos: e.anchorPos, pixels: e.pixels });
          }
        }
        return map;
      })();
      return _bucketsPromise;
    },

    /** Invalidate the bucket cache (called when new sprites are stored). */
    invalidateBuckets() { _bucketsPromise = null; },

    /** Fingerprint constants needed by the scan worker. */
    get fpConsts() {
      return { FP_TIERS, FP_ANCHORS, FP_VALUES, FP_ANCHOR_COLS, FP_ANCHOR_ROWS };
    },

    // ── Histogram-based screenshot detection ────────────────────────────────
    //
    // Scale-invariant item detection using a colour-histogram index.
    // Works on any screenshot layout — inventory, bank, equipment, loose items.
    // No grid assumption. Uses a sliding SLOT_W×SLOT_H window at half-slot
    // stride, matches each window by histogram overlap, then NMS deduplicates.
    //
    // Index: items-hist.pack (built at site build time). Each entry stores
    // (r5,g5,b5,count) tuples — colours quantised to 5 bits/channel, lower
    // 65% of sprite only (upper 35% excluded to skip stack-count overlays).

    /** Load the histogram index from items-hist.pack. Call once per base URL. */
    loadHistIndex(base) {
      if (_histPromise) return _histPromise;
      _histPromise = readPack((base ?? _base) + HIST_PACK_PATH, SS_HIST_PACK).then((pack) => {
        _histEntries = {};
        _histBuckets = new Map();
        // Sort ascending so canonical (lowest) IDs are inserted first per bucket.
        const ids = Object.keys(pack).map(Number).sort((a, b) => a - b);
        for (const id of ids) {
          const hist = pack[id]?.hist;
          if (!hist || !hist.length) continue;
          let total = 0;
          const counts = new Map();
          for (const [r, g, b, n] of hist) {
            const k = r | (g << 5) | (b << 10);
            counts.set(k, (counts.get(k) ?? 0) + n);
            total += n;
          }
          if (total < 5) continue;
          _histEntries[id] = { id, counts, total };
          for (const k of counts.keys()) {
            let bucket = _histBuckets.get(k);
            if (!bucket) { bucket = []; _histBuckets.set(k, bucket); }
            bucket.push(id);
          }
        }
      });
      return _histPromise;
    },

    /**
     * Detect all items in an ImageData (e.g. from canvas.getImageData).
     *
     * Slides a SLOT_W×SLOT_H window across the full image at SLOT_W/2 stride.
     * No grid or layout assumed — works on inventory, bank, equipment, mixed.
     *
     * Returns [{id, score, x, y}, ...] deduplicated by NMS, sorted by score desc.
     *
     * Options:
     *   bg        — [r,g,b] override; estimated from corners if omitted
     *   minScore  — overlap threshold (default 0.60)
     *   nmsRadius — suppression radius in px (default SLOT_W)
     */
    detectItems(imageData, opts = {}) {
      if (!_histEntries) throw new Error("call loadHistIndex() and await it first");
      const { width: W, height: H, data: px } = imageData;
      const minScore  = opts.minScore  ?? 0.60;
      const nmsRadius = opts.nmsRadius ?? HIST_SLOT_W;
      const BG_DEV_SQ = 225;   // 15² — skip pixels within L2=15 of BG

      const [bgR, bgG, bgB] = opts.bg ?? _cornerBg(px, W, H);

      // Slide window at half-slot stride; collect best (score, id) per position.
      const stride = HIST_SLOT_W >> 1;
      const raw = [];   // {id, score, x, y}

      for (let wy = 0; wy <= H - HIST_SLOT_H; wy += stride) {
        for (let wx = 0; wx <= W - HIST_SLOT_W; wx += stride) {
          // Build histogram for this window.
          const qHist = new Map();
          let nonBgPx = 0;
          for (let dy = 0; dy < HIST_SLOT_H; dy++) {
            for (let dx = 0; dx < HIST_SLOT_W; dx++) {
              const i  = ((wy + dy) * W + (wx + dx)) * 4;
              const dr = px[i] - bgR, dg = px[i+1] - bgG, db = px[i+2] - bgB;
              if (dr*dr + dg*dg + db*db <= BG_DEV_SQ) continue;
              nonBgPx++;
              const k = (px[i] >> 3) | ((px[i+1] >> 3) << 5) | ((px[i+2] >> 3) << 10);
              qHist.set(k, (qHist.get(k) ?? 0) + 1);
            }
          }
          if (nonBgPx < 10) continue;

          // Candidate set via bucket lookup.
          const candidates = new Set();
          for (const k of qHist.keys()) {
            const b = _histBuckets.get(k);
            if (b) for (const id of b) candidates.add(id);
          }
          if (!candidates.size) continue;

          // Score; tie-break to lowest id (canonical before LMS/variants).
          let bestScore = 0, bestId = -1;
          for (const id of candidates) {
            const ref = _histEntries[id];
            if (!ref) continue;
            let overlap = 0;
            for (const [k, n] of ref.counts) overlap += Math.min(qHist.get(k) ?? 0, n);
            const score = overlap / ref.total;
            if (score > bestScore || (score === bestScore && (bestId < 0 || id < bestId))) {
              bestScore = score; bestId = id;
            }
          }
          if (bestScore >= minScore) raw.push({ id: bestId, score: bestScore, x: wx, y: wy });
        }
      }

      // NMS: keep highest-score hit per neighbourhood, deduplicate same id.
      raw.sort((a, b) => b.score - a.score);
      const kept = [], seenId = new Set();
      for (const h of raw) {
        if (seenId.has(h.id)) continue;
        if (kept.some(k => Math.abs(k.x - h.x) < nmsRadius && Math.abs(k.y - h.y) < nmsRadius)) continue;
        kept.push(h);
        seenId.add(h.id);
      }
      return kept;
    },

    /**
     * Exact-match item detection via NCC against spritesheet tiles.
     *
     * Uses histogram as a fast candidate pre-filter per window, then verifies
     * each candidate with normalised cross-correlation against the actual sprite
     * pixels (alpha-masked). Returns [{id, score, x, y}] sorted score desc.
     *
     * score === 1.0 means pixel-perfect match. Anything >= nccMin is returned.
     *
     * Options:
     *   bg      — [r,g,b] BG override; estimated from corners if omitted
     *   nccMin  — minimum NCC to accept a match (default 0.85)
     *   topK    — max histogram candidates to NCC-verify per window (default 5)
     */
    async matchItems(imageData, opts = {}) {
      if (!_histEntries || !_sheetBitmap || !_atlas) throw new Error("atlas not ready");
      const { width: W, height: H, data: px } = imageData;
      const nccMin = opts.nccMin ?? 0.85;
      const topK   = opts.topK   ?? 5;
      const BG_DEV_SQ = 225;

      const [bgR, bgG, bgB] = opts.bg ?? _cornerBg(px, W, H);

      // Draw full sheet once into an OffscreenCanvas for tile access.
      const sheetOC  = new OffscreenCanvas(_sheetBitmap.width, _sheetBitmap.height);
      const sheetCtx = sheetOC.getContext("2d");
      sheetCtx.drawImage(_sheetBitmap, 0, 0);

      const tileOC  = new OffscreenCanvas(HIST_SLOT_W, HIST_SLOT_H);
      const tileCtx = tileOC.getContext("2d");

      // Precompute per-sprite mean/std over alpha-masked pixels for NCC denominator.
      const spriteStats = new Map(); // id → {mu, sigma, alphaMask: Uint8Array, rgb: Float32Array}
      const getSpriteStats = (id) => {
        if (spriteStats.has(id)) return spriteStats.get(id);
        const e = _atlas[id] ?? _atlas[String(id)];
        if (!e || e.w !== HIST_SLOT_W || e.h !== HIST_SLOT_H) return null;
        tileCtx.clearRect(0, 0, HIST_SLOT_W, HIST_SLOT_H);
        tileCtx.drawImage(sheetOC, e.x, e.y, HIST_SLOT_W, HIST_SLOT_H, 0, 0, HIST_SLOT_W, HIST_SLOT_H);
        const td = tileCtx.getImageData(0, 0, HIST_SLOT_W, HIST_SLOT_H).data;
        const n  = HIST_SLOT_W * HIST_SLOT_H;
        const rgb  = new Float32Array(n * 3);
        const mask = new Uint8Array(n);
        let sum = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
          const opaque = td[i*4+3] >= 128;
          mask[i] = opaque ? 1 : 0;
          if (!opaque) continue;
          const lum = 0.299*td[i*4] + 0.587*td[i*4+1] + 0.114*td[i*4+2];
          rgb[i*3] = td[i*4]; rgb[i*3+1] = td[i*4+1]; rgb[i*3+2] = td[i*4+2];
          sum += lum; cnt++;
        }
        if (cnt < 10) return null;
        const mu = sum / cnt;
        let vsum = 0;
        for (let i = 0; i < n; i++) {
          if (!mask[i]) continue;
          const lum = 0.299*rgb[i*3] + 0.587*rgb[i*3+1] + 0.114*rgb[i*3+2];
          vsum += (lum - mu) ** 2;
        }
        const sigma = Math.sqrt(vsum / cnt);
        const stats = { mu, sigma, mask, rgb, cnt };
        spriteStats.set(id, stats);
        return stats;
      };

      const stride = HIST_SLOT_W >> 1;
      const raw = [];

      for (let wy = 0; wy <= H - HIST_SLOT_H; wy += stride) {
        for (let wx = 0; wx <= W - HIST_SLOT_W; wx += stride) {
          // Build query histogram and luminance buffer for this window.
          const qHist = new Map();
          const qLum  = new Float32Array(HIST_SLOT_W * HIST_SLOT_H);
          let nonBgPx = 0, qSum = 0;
          for (let dy = 0; dy < HIST_SLOT_H; dy++) {
            for (let dx = 0; dx < HIST_SLOT_W; dx++) {
              const pi = ((wy + dy) * W + (wx + dx)) * 4;
              const dr = px[pi]-bgR, dg = px[pi+1]-bgG, db = px[pi+2]-bgB;
              const isBg = dr*dr + dg*dg + db*db <= BG_DEV_SQ;
              const lum  = 0.299*px[pi] + 0.587*px[pi+1] + 0.114*px[pi+2];
              qLum[dy * HIST_SLOT_W + dx] = lum;
              if (isBg) continue;
              nonBgPx++;
              qSum += lum;
              const k = (px[pi]>>3) | ((px[pi+1]>>3)<<5) | ((px[pi+2]>>3)<<10);
              qHist.set(k, (qHist.get(k) ?? 0) + 1);
            }
          }
          if (nonBgPx < 10) continue;

          // Histogram pre-filter: top-K candidates by overlap score.
          const candidates = new Set();
          for (const k of qHist.keys()) {
            const b = _histBuckets.get(k);
            if (b) for (const id of b) candidates.add(id);
          }
          if (!candidates.size) continue;

          const scored = [];
          for (const id of candidates) {
            const ref = _histEntries[id];
            if (!ref) continue;
            let overlap = 0;
            for (const [k, n] of ref.counts) overlap += Math.min(qHist.get(k) ?? 0, n);
            scored.push([overlap / ref.total, id]);
          }
          scored.sort((a, b) => b[0] - a[0]);
          const topCands = scored.slice(0, topK).map(([, id]) => id);

          // NCC verification against actual sprite pixels.
          let bestNcc = -1, bestId = -1;
          for (const id of topCands) {
            const s = getSpriteStats(id);
            if (!s || s.sigma < 1) continue;
            const qMu = qSum / s.cnt;   // mean over sprite's masked region
            let num = 0, qVar = 0;
            for (let i = 0; i < HIST_SLOT_W * HIST_SLOT_H; i++) {
              if (!s.mask[i]) continue;
              const qv = qLum[i] - qMu;
              const sv = 0.299*s.rgb[i*3] + 0.587*s.rgb[i*3+1] + 0.114*s.rgb[i*3+2] - s.mu;
              num  += qv * sv;
              qVar += qv * qv;
            }
            const ncc = num / (Math.sqrt(qVar) * s.sigma * s.cnt);
            if (ncc > bestNcc || (ncc === bestNcc && (bestId < 0 || id < bestId))) {
              bestNcc = ncc; bestId = id;
            }
          }
          if (bestNcc >= nccMin) raw.push({ id: bestId, score: bestNcc, x: wx, y: wy });
        }
      }

      // NMS: highest NCC per neighbourhood, one result per id.
      raw.sort((a, b) => b.score - a.score);
      const kept = [], seenId = new Set();
      for (const h of raw) {
        if (seenId.has(h.id)) continue;
        if (kept.some(k => Math.abs(k.x-h.x) < HIST_SLOT_W && Math.abs(k.y-h.y) < HIST_SLOT_H)) continue;
        kept.push(h);
        seenId.add(h.id);
      }
      return kept;
    },
  };

  // ── Histogram detection state ──────────────────────────────────────────────
  const HIST_PACK_PATH = "/assets/data/cache/items-hist.pack";
  const HIST_SLOT_W    = 36;
  const HIST_SLOT_H    = 32;
  let _histPromise = null;
  let _histEntries = null;   // {id: {id, counts: Map<k,n>, total}}
  let _histBuckets = null;   // Map<k, id[]>

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _cornerBg(px, W, H) {
    const freq = new Map();
    const sample = (x, y) => {
      const i = (y * W + x) * 4;
      const k = (px[i] << 16) | (px[i+1] << 8) | px[i+2];
      freq.set(k, (freq.get(k) ?? 0) + 1);
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      sample(x, y); sample(W-1-x, y); sample(x, H-1-y); sample(W-1-x, H-1-y);
    }
    let best = 0, bestK = 0;
    for (const [k, n] of freq) if (n > best) { best = n; bestK = k; }
    return [(bestK >> 16) & 0xff, (bestK >> 8) & 0xff, bestK & 0xff];
  }

  root.SpriteAtlas = SpriteAtlas;
})(window);
