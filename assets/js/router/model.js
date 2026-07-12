// State model, predicates, req/grant compilation to qualifier edges.
// Pure and DOM-free — shared by the planner (headless) and the editor.

export const SKILL_ORDER = [
  "attack","strength","defence","hitpoints","ranged","prayer","magic",
  "cooking","woodcutting","fletching","fishing","firemaking","crafting",
  "smithing","mining","herblore","agility","thieving","slayer",
  "farming","runecraft","hunter","construction",
];

export function deriveSkills() {
  return SKILL_ORDER;
}

export function normalizeReqs(reqs) {
  if (!reqs || typeof reqs !== "object") return { skills: {} };
  return { ...reqs, tags: reqs.tags ?? [] };
}

// Predicate: is this step a quest? Quests carry the "quest" tag or kind.
export function isQuestStep(step) {
  return (step?.tags ?? []).includes("quest") || step?.kind === "quest";
}

// Qual edge builders — map step reqs/grants to typed qualifier edges
export function reqQuals(reqs) {
  const r = normalizeReqs(reqs), q = [];
  Object.entries(r.skills ?? {}).forEach(([sk, lvl]) => q.push({ to: `skill:${sk}`, data: { cmp: "gte", value: lvl } }));
  (r.tags ?? []).forEach(t => q.push({ to: `tag:${t}`, data: { cmp: "has" } }));
  // Quest prerequisites — subquests/supplemental quests gate as first-class reqs.
  // Satisfied when the prereq quest is completed (grants quest:<id>, see syncQualEdges).
  (r.quests ?? []).forEach(id => q.push({ to: `quest:${id}`, data: { cmp: "has" } }));
  (r.atlas_items ?? []).forEach(({ id, name }) => q.push({ to: `item:${id}`, data: { cmp: "has", label: name } }));
  return q;
}

export function grantQuals(grants) {
  const q = [];
  Object.entries(grants ?? {}).forEach(([k, v]) => {
    if (typeof v === "number") q.push({ to: `skill:${k}`, data: { cmp: "gte", value: v } });
    else if (v === true)       q.push({ to: `tag:${k}`,   data: { cmp: "has" } });
  });
  (grants?.atlas_items ?? []).forEach(({ id }) => q.push({ to: `item:${id}`, data: { cmp: "has" } }));
  return q;
}

// Routing state: flat qual-keyed object { "skill:attack": 70, "tag:member": true,
//   "item:123": true, "xp:attack": 35000, "quest:quest-mm": true }
export function toState(skills) {
  const s = {};
  Object.entries(skills).forEach(([k, v]) => {
    if      (k === "_tags")         (v ?? []).forEach(t  => { s[`tag:${t}`]   = true; });
    else if (k === "_items")        (v ?? []).forEach(id => { s[`item:${id}`]  = true; });
    else if (k === "_quests")       (v ?? []).forEach(id => { s[`quest:${id}`] = true; });
    else if (k === "_xp")           Object.entries(v ?? {}).forEach(([sk, xp]) => { s[`xp:${sk}`] = xp; });
    else if (typeof v === "number") s[`skill:${k}`] = v;
  });
  return s;
}

export function fromState(state) {
  const sk = {}, tags = [], items = [], quests = [], xp = {};
  Object.entries(state).forEach(([k, v]) => {
    if      (k.startsWith("skill:")) sk[k.slice(6)] = v;
    else if (k.startsWith("tag:"))   tags.push(k.slice(4));
    else if (k.startsWith("item:"))  items.push(k.slice(5));
    else if (k.startsWith("quest:")) quests.push(k.slice(6));
    else if (k.startsWith("xp:"))    xp[k.slice(3)] = v;
  });
  sk._tags = tags; sk._items = items; sk._quests = quests; sk._xp = xp;
  return sk;
}

export function reqsSummary(reqs) {
  const r     = normalizeReqs(reqs);
  const parts = Object.entries(r.skills ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`);
  (r.tags ?? []).forEach((t) => parts.push(`[${t}]`));
  return parts.join(", ") || "no reqs";
}

// Sync a step's reqs/grants into the graph as step:req / step:grant qual edges.
// Quest steps additionally grant quest:<self> (satisfies dependents' quest prereqs)
// and additive xp:<skill> edges from their reward XP (the quest-XP economy —
// credited toward skill progression so quest rewards prune dead-weight training).
export function syncQualEdges(graph, steps) {
  steps.forEach(s => {
    graph.unlinkAll("step:req",   s.id);
    graph.unlinkAll("step:grant", s.id);
    reqQuals(s.reqs).forEach(({ to, data })     => graph.link("step:req",   s.id, to, data));
    grantQuals(s.grants).forEach(({ to, data }) => graph.link("step:grant", s.id, to, data));
    if (isQuestStep(s)) {
      graph.link("step:grant", s.id, `quest:${s.id}`, { cmp: "has" });
      Object.entries(s.xp ?? {}).forEach(([sk, amt]) => {
        if (typeof amt === "number" && amt > 0 && SKILL_ORDER.includes(sk)) {
          graph.link("step:grant", s.id, `xp:${sk}`, { cmp: "add", value: amt });
        }
      });
    }
  });
}
