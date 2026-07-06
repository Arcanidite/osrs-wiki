// OSRP pack reader (ES module) — fetch + parse the binary cache packs.
// Format (tools/pack.py): "OSRP" + u32 count + N×(id u32, offset u32, len u32) + JSON blobs.
const _cache = new Map(); // url -> Promise<records[]>

export function readPack(url) {
  if (_cache.has(url)) return _cache.get(url);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`pack fetch ${r.status}: ${url}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const view = new DataView(buf);
      const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      if (magic !== "OSRP") throw new Error("Not an OSRP pack: " + url);
      const n = view.getUint32(4, true);
      const dec = new TextDecoder();
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const base = 8 + i * 12;
        const offset = view.getUint32(base + 4, true);
        const length = view.getUint32(base + 8, true);
        out[i] = JSON.parse(dec.decode(new Uint8Array(buf, offset, length)));
      }
      return out;
    });
  _cache.set(url, p);
  return p;
}
