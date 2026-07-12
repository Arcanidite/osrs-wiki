// Quest Order tool — walk the recommended quest order, gated by your stats.
//
// Data: /assets/data/tools/quests.jsonl (built by tools/build_quests.py from the
// Quest Helper plugin + OSRS Wiki Optimal Quest Guide). The order is a curated
// recommendation, NOT a computed optimum — the page says so plainly. This module
// only answers "can I do this yet?" by checking extracted entry requirements
// against your stats, and surfaces your next available quest in guide order.
//
// No fabricated data: durations/xp are not invented here. Requirement rows that
// Quest Helper encodes in ways we can't statically read are flagged (req_partial).

const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
const KEY = "osrs-quest-order:v1";

const SKILLS = [
  "attack", "strength", "defence", "ranged", "prayer", "magic", "runecraft",
  "hitpoints", "crafting", "mining", "smithing", "fishing", "cooking",
  "firemaking", "woodcutting", "agility", "herblore", "thieving", "fletching",
  "slayer", "farming", "construction", "hunter",
];
const REGIONS = [
  "misthalin", "karamja", "asgarnia", "kandarin", "morytania", "desert",
  "tirannwn", "fremennik", "kourend", "wilderness", "varlamore",
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── state ────────────────────────────────────────────────────────────────
function loadState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { s = {}; }
  return {
    skills: s.skills || {},
    done: new Set(s.done || []),
    qp: s.qp ?? 0,
    combat: s.combat ?? null,
    regions: new Set(s.regions || []),
  };
}
function saveState(st) {
  localStorage.setItem(KEY, JSON.stringify({
    skills: st.skills, done: [...st.done], qp: st.qp, combat: st.combat, regions: [...st.regions],
  }));
}

// ── requirement evaluation ─────────────────────────────────────────────────
// Returns { status, unmet:[{kind,label,ok}], regionLocked }.
function evaluate(q, st, byId) {
  const unmet = [];
  for (const [sk, lv] of Object.entries(q.req_skills || {})) {
    const have = st.skills[sk] || 1;
    unmet.push({ kind: "skill", label: `${cap(sk)} ${lv}`, ok: have >= lv });
  }
  for (const pid of q.req_quests || []) {
    const pq = byId.get(pid);
    unmet.push({ kind: "quest", id: pid, label: pq ? pq.name : pid, ok: st.done.has(pid) });
  }
  if (q.req_quest_points) unmet.push({ kind: "qp", label: `${q.req_quest_points} QP`, ok: (st.qp || 0) >= q.req_quest_points });
  if (q.req_combat && st.combat != null) unmet.push({ kind: "combat", label: `Combat ${q.req_combat}`, ok: st.combat >= q.req_combat });

  const regionLocked = st.regions.size > 0 && (q.league_regions || []).some((r) => !st.regions.has(r));
  const missing = unmet.filter((u) => !u.ok);

  let status;
  if (st.done.has(q.id)) status = "done";
  else if (regionLocked) status = "locked";
  else if (missing.length === 0) status = "cando";
  else status = "blocked";
  return { status, unmet, regionLocked };
}

// ── rendering ───────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);
let QUESTS = [], BYID = new Map(), STATE = loadState();
let FILTER = "all", SEARCH = "";

function reqChip(u) {
  const cls = u.ok ? "qo-met" : "qo-unmet";
  if (u.kind === "quest") {
    return `<a class="qo-chip ${cls}" href="#q-${u.id}" data-jump="${u.id}" title="prerequisite quest">${u.label}</a>`;
  }
  return `<span class="qo-chip ${cls}">${u.label}</span>`;
}

function questRow(q, ev, nextId) {
  const badges = [];
  if (q.type) badges.push(`<span class="qo-badge qo-type-${(q.type || "").toLowerCase()}">${q.type}</span>`);
  if (q.difficulty) badges.push(`<span class="qo-badge qo-diff">${cap((q.difficulty || "").toLowerCase())}</span>`);
  if (q.req_partial) badges.push(`<span class="qo-warn" title="${q.req_note || "extra entry requirements not captured"}">⚠</span>`);

  const pill = {
    done: `<span class="qo-pill qo-done">Done</span>`,
    cando: q.id === nextId ? `<span class="qo-pill qo-next">Do next ★</span>` : `<span class="qo-pill qo-can">Can do</span>`,
    blocked: `<span class="qo-pill qo-blocked">Blocked</span>`,
    locked: `<span class="qo-pill qo-locked">Locked</span>`,
  }[ev.status];

  const reqs = ev.unmet.length
    ? `<div class="qo-reqs">${ev.unmet.map(reqChip).join("")}</div>`
    : `<div class="qo-reqs qo-muted">No entry requirements recorded${q.req_note === "no getGeneralRequirements()" ? "" : ""}</div>`;

  const regions = (q.league_regions || []).length
    ? `<div class="qo-regions qo-muted">Regions: ${q.league_regions.map(cap).join(", ")}</div>` : "";

  const rank = q.order_rank != null ? `#${q.order_rank + 1}` : "—";
  return `<li class="qo-item qo-s-${ev.status}" id="q-${q.id}">
    <label class="qo-check"><input type="checkbox" data-done="${q.id}" ${STATE.done.has(q.id) ? "checked" : ""}></label>
    <div class="qo-body">
      <div class="qo-head"><span class="qo-rank">${rank}</span>
        <span class="qo-name">${q.name}</span> ${badges.join(" ")} ${pill}</div>
      ${reqs}${regions}
    </div></li>`;
}

function passesFilter(q, ev) {
  if (SEARCH && !q.name.toLowerCase().includes(SEARCH)) return false;
  switch (FILTER) {
    case "cando": return ev.status === "cando";
    case "blocked": return ev.status === "blocked" || ev.status === "locked";
    case "done": return ev.status === "done";
    case "unranked": return q.order_rank == null;
    default: return true;
  }
}

function render() {
  const evals = QUESTS.map((q) => [q, evaluate(q, STATE, BYID)]);
  const next = evals.find(([q, ev]) => ev.status === "cando");
  const nextId = next ? next[0].id : null;

  // summary + next bar
  const n = { done: 0, cando: 0, blocked: 0, locked: 0 };
  evals.forEach(([, ev]) => { n[ev.status]++; });
  el("qo-summary").innerHTML =
    `<span class="qo-met">${n.done} done</span> · <span class="qo-can-t">${n.cando} can do now</span> · ` +
    `<span class="qo-blk-t">${n.blocked} blocked</span>${n.locked ? ` · <span class="qo-lck-t">${n.locked} region-locked</span>` : ""} · ${QUESTS.length} total`;

  const nb = el("qo-nextbar");
  if (next) {
    nb.hidden = false;
    nb.innerHTML = `<strong>Your next quest:</strong> ${next[0].name} <span class="qo-muted">(${next[0].order_rank != null ? "#" + (next[0].order_rank + 1) + " in the guide" : "not in guide"})</span>`;
  } else nb.hidden = true;

  el("qo-list").innerHTML = evals
    .filter(([q, ev]) => passesFilter(q, ev))
    .map(([q, ev]) => questRow(q, ev, nextId)).join("");
}

// ── controls ────────────────────────────────────────────────────────────────
function buildControls() {
  el("qo-skill-grid").innerHTML = SKILLS.map((sk) =>
    `<label class="qo-skill"><span>${cap(sk).slice(0, 4)}</span>
      <input type="number" min="1" max="99" data-skill="${sk}" value="${STATE.skills[sk] || 1}"></label>`).join("");
  el("qo-region-grid").innerHTML = REGIONS.map((r) =>
    `<label class="qo-region"><input type="checkbox" data-region="${r}" ${STATE.regions.has(r) ? "checked" : ""}> ${cap(r)}</label>`).join("");
  el("qo-qp").value = STATE.qp || 0;
  el("qo-combat").value = STATE.combat ?? "";
}

function wire() {
  el("qo-inputs").addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.skill) STATE.skills[t.dataset.skill] = Math.max(1, Math.min(99, +t.value || 1));
    else if (t.id === "qo-qp") STATE.qp = Math.max(0, +t.value || 0);
    else if (t.id === "qo-combat") STATE.combat = t.value === "" ? null : Math.max(3, +t.value || 3);
    else if (t.dataset.region) { t.checked ? STATE.regions.add(t.dataset.region) : STATE.regions.delete(t.dataset.region); }
    else return;
    saveState(STATE); render();
  });
  el("qo-reset").addEventListener("click", () => {
    if (!confirm("Reset all stats and quest progress?")) return;
    STATE = { skills: {}, done: new Set(), qp: 0, combat: null, regions: new Set() };
    saveState(STATE); buildControls(); render();
  });
  el("qo-list").addEventListener("change", (e) => {
    const id = e.target.dataset.done;
    if (!id) return;
    e.target.checked ? STATE.done.add(id) : STATE.done.delete(id);
    saveState(STATE); render();
  });
  el("qo-list").addEventListener("click", (e) => {
    const jump = e.target.dataset.jump;
    if (jump) { const row = el(`q-${jump}`); if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); row.classList.add("qo-flash"); setTimeout(() => row.classList.remove("qo-flash"), 1200); } }
  });
  el("qo-filter-bar").addEventListener("click", (e) => {
    if (!e.target.dataset.filter) return;
    FILTER = e.target.dataset.filter;
    [...el("qo-filter-bar").querySelectorAll(".qo-filter-btn")].forEach((b) => b.classList.toggle("active", b === e.target));
    render();
  });
  el("qo-search").addEventListener("input", (e) => { SEARCH = e.target.value.trim().toLowerCase(); render(); });
}

// ── styles (scoped, self-contained) ─────────────────────────────────────────
function injectStyles() {
  const css = `
  .qo-note{background:var(--panel,#f5f3ee);border:1px solid var(--border,#d8d2c4);border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:.85rem;line-height:1.5}
  .qo-warn{color:#b8860b;font-weight:bold;cursor:help}
  .tool-row#qo-tool-row{display:flex;gap:16px;align-items:flex-start}
  .qo-sidebar{flex:0 0 260px}.qo-main{flex:1;min-width:0}
  .qo-skill-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
  .qo-skill{display:flex;flex-direction:column;font-size:.65rem}
  .qo-skill input,.qo-field input{width:100%;box-sizing:border-box;padding:2px 4px;font-size:.8rem}
  .qo-field{margin-top:8px;display:flex;flex-direction:column;font-size:.75rem;gap:2px}
  .qo-region-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:.75rem}
  .qo-region{display:flex;align-items:center;gap:4px}
  .qo-filter-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
  .qo-filter-btn{border:1px solid var(--border,#ccc);background:transparent;border-radius:6px;padding:3px 10px;font-size:.78rem;cursor:pointer}
  .qo-filter-btn.active{background:var(--accent,#8a6d3b);color:#fff;border-color:var(--accent,#8a6d3b)}
  #qo-search{margin-left:auto;padding:3px 8px;font-size:.8rem;min-width:160px}
  .qo-summary{font-size:.8rem;margin-bottom:8px;color:var(--muted,#777)}
  .qo-nextbar{background:#eaf6ea;border:1px solid #bcdcbc;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.9rem}
  .qo-list{list-style:none;padding:0;margin:0}
  .qo-item{display:flex;gap:8px;padding:8px 6px;border-bottom:1px solid var(--border,#eee)}
  .qo-item.qo-s-done{opacity:.55}.qo-item.qo-s-locked{opacity:.7}
  .qo-check{padding-top:2px}.qo-body{flex:1;min-width:0}
  .qo-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .qo-rank{color:var(--muted,#999);font-size:.72rem;min-width:34px}
  .qo-name{font-weight:600}
  .qo-badge{font-size:.62rem;padding:1px 6px;border-radius:4px;border:1px solid var(--border,#ccc)}
  .qo-type-f2p{background:#eef6ee}.qo-type-p2p{background:#f6eeee}
  .qo-diff{background:#f0f0f5;color:#555}
  .qo-pill{font-size:.66rem;padding:2px 8px;border-radius:10px;font-weight:600;margin-left:auto}
  .qo-done{background:#dfe7df;color:#3a5a3a}.qo-can{background:#dff0df;color:#1f6b1f}
  .qo-next{background:#2e7d32;color:#fff}.qo-blocked{background:#f6e2e2;color:#9a3b3b}
  .qo-locked{background:#e9e4d6;color:#7a6a3a}
  .qo-reqs{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}
  .qo-chip{font-size:.68rem;padding:1px 7px;border-radius:10px;text-decoration:none}
  .qo-met{background:#e2f0e2;color:#2b6b2b}.qo-unmet{background:#f6e2e2;color:#9a3b3b}
  a.qo-chip.qo-unmet:hover,a.qo-chip.qo-met:hover{text-decoration:underline}
  .qo-regions{font-size:.68rem;margin-top:3px}
  .qo-flash{animation:qoflash 1.2s ease}
  @keyframes qoflash{0%,100%{background:transparent}30%{background:#fff3c4}}
  .qo-can-t{color:#1f6b1f}.qo-blk-t{color:#9a3b3b}.qo-lck-t{color:#7a6a3a}
  @media(max-width:760px){.tool-row#qo-tool-row{flex-direction:column}.qo-sidebar{flex:none;width:100%}}`;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

// ── boot ────────────────────────────────────────────────────────────────────
async function main() {
  injectStyles();
  buildControls();
  wire();
  try {
    const text = await fetch(`${BASE}/assets/data/tools/quests.jsonl`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    QUESTS = text.trim().split("\n").map((l) => JSON.parse(l));
    BYID = new Map(QUESTS.map((q) => [q.id, q]));
    el("qo-loading").hidden = true;
    render();
  } catch (e) {
    el("qo-loading").textContent = `Failed to load quest data: ${e.message}`;
  }
}
main();
