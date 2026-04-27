(function () {
  "use strict";
  const KEY = "osrs-graph:v1";
  let _c = null;

  const _g = () => {
    if (_c) return _c;
    try { _c = JSON.parse(localStorage.getItem(KEY) ?? '{"n":{},"e":{}}'); }
    catch { _c = { n: {}, e: {} }; }
    return _c;
  };
  const _w = () => { try { localStorage.setItem(KEY, JSON.stringify(_c)); } catch {} };

  // Unit separator (U+001F) avoids key collisions with arbitrary type/id values.
  const nk = (t, id) => `${t}\x1f${id}`;
  const ek = (t, f, to) => `${t}\x1f${f}\x1f${to}`;

  window.DAL = {
    node(type, id)          { return _g().n[nk(type, id)] ?? null; },
    upsert(type, id, data)  { _g().n[nk(type, id)] = { type, id, data }; _w(); },
    remove(type, id)        { delete _g().n[nk(type, id)]; _w(); },

    query({ type, filter } = {}) {
      return Object.values(_g().n)
        .filter(n => !type   || n.type === type)
        .filter(n => !filter || filter(n.data, n));
    },

    edge(type, from, to)          { return _g().e[ek(type, from, to)] ?? null; },
    link(type, from, to, data)    { _g().e[ek(type, from, to)] = { type, from, to, data: data ?? null }; _w(); },
    unlink(type, from, to)        { delete _g().e[ek(type, from, to)]; _w(); },
    edgesFrom(type, from)         { return Object.values(_g().e).filter(e => e.type === type && e.from === from); },
    edgesTo(type, to)             { return Object.values(_g().e).filter(e => e.type === type && e.to === to); },
    unlinkAll(type, from)         {
      const g = _g(), pfx = `${type}\x1f${from}\x1f`;
      Object.keys(g.e).forEach(k => { if (k.startsWith(pfx)) delete g.e[k]; });
      _w();
    },

    invalidate() { _c = null; },
  };
})();
