// Graph store + monotone qualifier cmp registry.
// Extracted from assets/js/dal.js — same node/edge model and localStorage
// payload format ("osrs-graph:v1"), now storage-injectable so the planner
// can run headless (Node tests use the in-memory default).

import { xpForLevel, levelForXp } from "../world/xp.js";

// Unit separator (U+001F) avoids key collisions with arbitrary type/id values.
const nk = (t, id) => `${t}\x1f${id}`;
const ek = (t, f, to) => `${t}\x1f${f}\x1f${to}`;

// Qualifier cmp registry — extend here to add new constraint types.
// Each entry: { satisfies(cur, val), coalesce(cur, val), progresses(cur, grantVal, targetVal) }
// All comparators are monotone (state only ever rises / turns on); the
// planner's delete-free assumptions depend on this — keep new cmps monotone.
const _cmp = {
  gte: {
    satisfies:  (cur, val) => (cur ?? 0) >= val,
    coalesce:   (cur, val) => Math.max(cur ?? 0, val),
    progresses: (cur, gv, tv) => gv > (cur ?? 0) && gv <= tv,
  },
  has: {
    satisfies:  (cur)      => cur === true,
    coalesce:   ()         => true,
    progresses: (cur)      => cur !== true,
  },
  // Additive XP accumulator (monotone-rising). Used by quest reward XP:
  // `xp:<skill>` sums the reward XP of every completed quest. Skill-level
  // reads (skill:<skill> gte) fold this XP in via effectiveLevel(), so a
  // quest's XP reward prunes the training bands it already covers.
  add: {
    satisfies:  (cur, val) => (cur ?? 0) >= val,
    coalesce:   (cur, val) => (cur ?? 0) + val,
    progresses: (cur, gv)  => gv > 0,
  },
};

// Effective level for a `skill:<sk>` state key: the training-floor level
// raised by any accumulated quest reward XP (`xp:<sk>`). Pure — the read-side
// bridge between the level economy (training) and the XP economy (quests).
// baseLevel's own XP is the floor; quest XP stacks on top of wherever training
// left the skill, so a quest never double-credits toward its own prereq.
export function effectiveLevel(state, skillKey) {
  const base = state[skillKey] ?? 1;
  if (!skillKey.startsWith("skill:")) return base;
  const xp = state["xp:" + skillKey.slice(6)] ?? 0;
  if (!xp) return base;
  const eff = levelForXp(xpForLevel(base) + xp);
  return eff > base ? eff : base;
}

// Read a state value with XP-boost applied to skill keys (identity otherwise).
function effRead(state, to) {
  return to.startsWith("skill:") ? effectiveLevel(state, to) : state[to];
}

// In-memory storage — default for headless/test use.
export function memoryStorage() {
  let data = null;
  return { load: () => data, save: (d) => { data = d; } };
}

// Browser storage — same key/format dal.js used, so existing saves carry over.
export function localStorageAdapter(key = "osrs-graph:v1") {
  return {
    load() {
      try { return JSON.parse(localStorage.getItem(key) ?? "null"); }
      catch { return null; }
    },
    save(d) {
      try { localStorage.setItem(key, JSON.stringify(d)); } catch {}
    },
  };
}

export function createGraph(storage = memoryStorage()) {
  let _c = null;

  const _g = () => {
    if (_c) return _c;
    _c = storage.load() ?? { n: {}, e: {} };
    return _c;
  };
  const _w = () => storage.save(_c);

  return {
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

    // Qualifier queries — dispatch through _cmp registry, open to new types.
    // Skill-key reads are XP-boosted via effRead so completed-quest XP counts.
    satisfies(edges, state) {
      return edges.every(({ to, data: { cmp, value } = {} }) =>
        _cmp[cmp]?.satisfies(effRead(state, to), value) ?? false
      );
    },
    coalesce(edges, state) {
      const next = { ...state };
      edges.forEach(({ to, data: { cmp, value } = {} }) => {
        if (_cmp[cmp]) next[to] = _cmp[cmp].coalesce(next[to], value);
      });
      return next;
    },
    progresses(grantEdges, targetEdges, state) {
      return grantEdges.some(ge => {
        const te = targetEdges.find(e => e.to === ge.to);
        if (!te) return false;
        const { cmp, value: gv } = ge.data ?? {};
        return _cmp[cmp]?.progresses(effRead(state, ge.to), gv, te.data?.value) ?? false;
      });
    },

    invalidate() { _c = null; },
  };
}
