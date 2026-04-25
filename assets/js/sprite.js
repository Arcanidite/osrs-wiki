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
  const LS_SHEET   = "osrs-sprite-sheet-dataurl";

  let _base       = "";
  let _atlas      = null;   // {id: {x,y,w,h}}
  let _sheet      = null;   // HTMLImageElement
  let _sheetUrl   = null;   // data URL used in css() — never a network path
  let _byId       = null;   // {id: packRecord}
  let _byName     = null;   // {"lowercase name": packRecord}
  let _promise = null;
  let _cssCache = new Map(); // itemId → CSS string, in-memory only

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

  function loadImage(src) {
    const cached = localStorage.getItem(LS_SHEET);
    const dataUrl = cached ?? null;
    const fromUrl = (url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    if (dataUrl) return fromUrl(dataUrl).then((img) => { _sheetUrl = dataUrl; return img; });
    return fromUrl(src).then((img) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      const url = c.toDataURL("image/png");
      try { localStorage.setItem(LS_SHEET, url); } catch { /* quota — skip cache */ }
      _sheetUrl = url;
      return img;
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const SpriteAtlas = {
    /** Load atlas, spritesheet, and item pack. Call once per page. */
    load(base) {
      if (_promise) return _promise;
      _base = base ?? "";
      _promise = Promise.all([
        fetchAtlas(_base + ATLAS_PATH),
        loadImage(_base + SHEET_PATH),
        readPack(_base + PACK_PATH),
      ]).then(([atlas, sheet, pack]) => {
        _atlas  = atlas;
        _sheet  = sheet;
        _byId   = pack;
        _byName = Object.values(pack).reduce((m, rec) => {
          if (rec.name) m[rec.name.toLowerCase()] = rec;
          if (rec.slug) m[rec.slug] = rec;
          return m;
        }, {});
      });
      return _promise;
    },

    /** Draw item icon onto a 2D canvas context at (dx, dy). */
    draw(ctx, itemId, dx, dy) {
      if (!_atlas || !_sheet) return;
      const e = _atlas[itemId] ?? _atlas[String(itemId)];
      if (!e) return;
      ctx.drawImage(_sheet, e.x, e.y, e.w, e.h, dx, dy, e.w, e.h);
    },

    /** CSS background shorthand for use with a sized container. */
    css(itemId) {
      if (!_atlas || !_sheet) return "";
      const key = +itemId;
      if (_cssCache.has(key)) return _cssCache.get(key);
      const e = _atlas[itemId] ?? _atlas[String(itemId)];
      if (!e) return "";
      const val = `url('${_sheetUrl}') -${e.x}px -${e.y}px / ${_sheet.naturalWidth}px ${_sheet.naturalHeight}px no-repeat`;
      _cssCache.set(key, val);
      return val;
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
    get ready() { return _atlas !== null && _sheet !== null; },
  };

  root.SpriteAtlas = SpriteAtlas;
})(window);
