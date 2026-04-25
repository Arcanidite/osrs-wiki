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
 */
(function (root) {
  const ATLAS_PATH = "/assets/data/cache/sprites/items-atlas.json";
  const SHEET_PATH = "/assets/data/cache/sprites/items.png";
  const PACK_PATH  = "/assets/data/cache/items.pack";
  const SS_ATLAS   = "osrs-sprite-atlas";
  const SS_PACK    = "osrs-sprite-pack";
  const LS_PFX     = "osrs-sprite-";   // localStorage key per item: osrs-sprite-{id}

  let _base     = "";
  let _atlas    = null;   // {id: {x,y,w,h}}
  let _byId     = null;   // {id: packRecord}
  let _byName   = null;   // {"lowercase name": packRecord}
  let _promise  = null;
  let _cssCache = new Map(); // itemId → css string, in-memory

  // ── Session cache helpers ──────────────────────────────────────────────────
  function ssGet(key) {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function ssSet(key, val) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* quota exceeded — skip */ }
  }

  // ── Pack reader ────────────────────────────────────────────────────────────
  // Binary format: "OSRP" + 4B count + N×12B index (id:4LE, offset:4LE, len:4LE) + JSON blobs

  async function readPack(url) {
    const cached = ssGet(SS_PACK);
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
    ssSet(SS_PACK, result);
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
  };

  root.SpriteAtlas = SpriteAtlas;
})(window);
