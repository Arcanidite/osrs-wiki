// Cache database browser — renders item/NPC entries client-side straight from
// the RuneLite cache packs (assets/data/cache/*.pack). Every entry is
// deep-linkable via location.hash (#<id>). Page presets arrive on #db-root:
//   data-db-kind   "items" | "npcs"
//   data-db-filter JSON preset filter (see FILTERS below)
// Honesty rule: only fields present in the cache are rendered.
import { readPack } from "../pack-reader.js";

const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
const root = document.getElementById("db-root");
const PAGE = 150;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// NPC stats array order verified against known monsters (Zulrah, Hill Giant,
// Goblin — see tools/kb/GAME_KB.md): [attack, defence, strength, hitpoints, ranged, magic]
const NPC_STATS = ["Attack", "Defence", "Strength", "Hitpoints", "Ranged", "Magic"];

const KINDS = {
  items: {
    pack: "/assets/data/cache/items.pack",
    match(rec, f, q) {
      if (f.slot && !f.slot.includes(rec.slot)) return false;
      if (f.nameSuffix && !rec.name.toLowerCase().endsWith(f.nameSuffix)) return false;
      if (f.questItem && !rec.quest_item) return false;
      if (f.equipable != null && rec.equipable !== f.equipable) return false;
      if (f.members === "f2p" && rec.members) return false;
      if (f.members === "members" && !rec.members) return false;
      if (f.tradeable && !rec.tradeable) return false;
      if (f.hasReqs && !rec.reqs) return false;
      return !q || rec.name.toLowerCase().includes(q);
    },
    sorts: {
      name: (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
      id: (a, b) => a.id - b.id,
      "req level": (a, b) => maxReq(b) - maxReq(a) || a.name.localeCompare(b.name),
    },
    row(rec) {
      const badges = [
        rec.slot ? tag(rec.slot) : "",
        rec.members ? tag("members") : tag("F2P"),
        rec.quest_item ? tag("quest") : "",
        rec.tradeable ? tag("tradeable") : "",
        rec.reqs ? tag(reqStr(rec.reqs)) : "",
      ].join("");
      return `<a class="db-row" href="#${rec.id}">
        <span class="sri-sprite" data-item-id="${rec.id}">${esc(rec.name[0])}</span>
        <span class="db-row-main"><span class="db-row-name">${esc(rec.name)}</span>
          <span class="db-row-sub">${esc(rec.examine ?? "")}</span></span>
        <span class="db-row-badges">${badges}</span></a>`;
    },
    detail(rec) {
      const rows = [
        ["ID", rec.id], ["Name", rec.name], ["Examine", rec.examine],
        ["Slot", rec.slot], ["Equipable", yn(rec.equipable)],
        ["Members", yn(rec.members)], ["Tradeable", yn(rec.tradeable)],
        ["Stackable", yn(rec.stackable)], ["Quest item", yn(rec.quest_item)],
        ["Skill requirements", rec.reqs ? reqStr(rec.reqs) : "none"],
      ];
      return `<div class="db-detail-hd">
          <span class="sri-sprite" data-item-id="${rec.id}">${esc(rec.name[0])}</span>
          <h2>${esc(rec.name)}</h2></div>
        ${fieldTable(rows)}`;
    },
    facets: `
      <select data-f="slot"><option value="">any slot</option>
        ${["head","cape","neck","ammo","weapon","2h","shield","body","legs","hands","feet","ring"]
          .map((s) => `<option>${s}</option>`).join("")}</select>
      <select data-f="members"><option value="">F2P + members</option>
        <option value="f2p">F2P only</option><option value="members">members only</option></select>
      <label><input type="checkbox" data-f="hasReqs"> has skill reqs</label>
      <label><input type="checkbox" data-f="tradeable"> tradeable</label>`,
  },

  npcs: {
    pack: "/assets/data/cache/npcs.pack",
    match(rec, f, q) {
      if (f.attackable && !(rec.actions ?? []).includes("Attack")) return false;
      if (f.cbMin != null && rec.combat_level < f.cbMin) return false;
      if (f.cbMax != null && rec.combat_level > f.cbMax) return false;
      if (f.action && !(rec.actions ?? []).includes(f.action)) return false;
      return !q || rec.name.toLowerCase().includes(q);
    },
    sorts: {
      combat: (a, b) => b.combat_level - a.combat_level || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name) || a.combat_level - b.combat_level,
      id: (a, b) => a.id - b.id,
    },
    // group cache variants (same name + combat level) into one row
    group(recs) {
      const seen = new Map();
      for (const r of recs) {
        const key = `${r.name}\x1f${r.combat_level}`;
        const g = seen.get(key);
        if (g) g._variants.push(r.id);
        else seen.set(key, { ...r, _variants: [r.id] });
      }
      return [...seen.values()];
    },
    row(rec) {
      const hp = rec.stats?.[3];
      const badges = [
        rec.combat_level > 0 ? tag(`combat ${rec.combat_level}`) : "",
        hp > 1 ? tag(`${hp} HP`) : "",
        ...(rec.actions ?? []).slice(0, 3).map(tag),
        rec._variants.length > 1 ? tag(`${rec._variants.length} variants`) : "",
      ].join("");
      return `<a class="db-row" href="#${rec.id}">
        <span class="db-row-main"><span class="db-row-name">${esc(rec.name)}</span></span>
        <span class="db-row-badges">${badges}</span></a>`;
    },
    detail(rec) {
      const rows = [
        ["ID", rec.id], ["Name", rec.name],
        ["Combat level", rec.combat_level || "non-combat"],
        ["Actions", (rec.actions ?? []).join(", ") || "none"],
        ["Tags", (rec.tags ?? []).join(", ") || "—"],
        ["Variant IDs", rec._variants?.join(", ") ?? rec.id],
      ];
      const stats = rec.stats
        ? `<h3>Combat stats</h3><table class="data-table"><thead><tr>
            ${NPC_STATS.map((s) => `<th>${s}</th>`).join("")}</tr></thead>
            <tbody><tr>${rec.stats.map((v) => `<td>${v}</td>`).join("")}</tr></tbody></table>`
        : "";
      return `<div class="db-detail-hd"><h2>${esc(rec.name)}</h2></div>
        ${fieldTable(rows)}${stats}`;
    },
    facets: `
      <label><input type="checkbox" data-f="attackable"> attackable</label>
      <select data-f="action"><option value="">any action</option>
        ${["Talk-to","Attack","Trade","Pickpocket","Bank","Collect","Charter"]
          .map((a) => `<option>${a}</option>`).join("")}</select>`,
  },
};

const tag = (t) => `<span class="db-tag">${esc(t)}</span>`;
const yn = (v) => (v ? "yes" : "no");
const reqStr = (reqs) => Object.entries(reqs).map(([k, v]) => `${k} ${v}`).join(", ");
const maxReq = (r) => (r.reqs ? Math.max(...Object.values(r.reqs)) : 0);
const fieldTable = (rows) =>
  `<table class="data-table db-fields"><tbody>${rows
    .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v ?? "—")}</td></tr>`).join("")}</tbody></table>`;

async function init() {
  if (!root) return;
  const kindName = root.dataset.dbKind;
  const kind = KINDS[kindName];
  if (!kind) return;
  const preset = JSON.parse(root.dataset.dbFilter || "{}");

  root.innerHTML = `<p class="db-loading">Loading ${kindName} database…</p>`;
  let all;
  try {
    all = await readPack(BASE + kind.pack);
  } catch (e) {
    root.innerHTML = `<p class="db-error">Failed to load database: ${esc(e.message)}</p>`;
    return;
  }
  if (kind.group) all = kind.group(all);
  const byId = new Map(all.map((r) => [r.id, r]));
  // variant ids resolve to their group row
  if (kindName === "npcs") for (const r of all) for (const v of r._variants) byId.set(v, r);

  const sortNames = Object.keys(kind.sorts);
  root.innerHTML = `
    <div class="db-toolbar">
      <input type="search" class="db-search" placeholder="Filter by name…">
      ${kind.facets}
      <select class="db-sort">${sortNames.map((s) => `<option>${s}</option>`).join("")}</select>
      <span class="db-count"></span>
    </div>
    <div class="db-detail" hidden></div>
    <div class="db-list"></div>
    <button class="db-more btn" hidden>Show more</button>`;

  const listEl = root.querySelector(".db-list");
  const moreEl = root.querySelector(".db-more");
  const countEl = root.querySelector(".db-count");
  const detailEl = root.querySelector(".db-detail");
  const searchEl = root.querySelector(".db-search");
  const sortEl = root.querySelector(".db-sort");

  const uiFilter = () => {
    const f = { ...preset };
    root.querySelectorAll("[data-f]").forEach((el) => {
      const k = el.dataset.f;
      if (el.type === "checkbox") { if (el.checked) f[k] = true; }
      else if (el.value) f[k] = k === "slot" ? [el.value] : el.value;
    });
    return f;
  };

  let matched = [], shown = 0;
  const renderChunk = () => {
    const chunk = matched.slice(shown, shown + PAGE);
    listEl.insertAdjacentHTML("beforeend", chunk.map((r) => kind.row(r)).join(""));
    shown += chunk.length;
    moreEl.hidden = shown >= matched.length;
    moreEl.textContent = `Show more (${(matched.length - shown).toLocaleString()} remaining)`;
    hydrateSprites();
  };

  const apply = () => {
    const q = searchEl.value.trim().toLowerCase();
    const f = uiFilter();
    matched = all.filter((r) => kind.match(r, f, q));
    matched.sort(kind.sorts[sortEl.value]);
    countEl.textContent = `${matched.length.toLocaleString()} entries`;
    listEl.innerHTML = "";
    shown = 0;
    renderChunk();
  };

  const showDetail = () => {
    const id = parseInt(location.hash.slice(1), 10);
    const rec = byId.get(id);
    if (!rec) { detailEl.hidden = true; return; }
    detailEl.innerHTML = kind.detail(rec) +
      `<button class="db-detail-close btn btn-ghost">✕ close</button>`;
    detailEl.hidden = false;
    detailEl.querySelector(".db-detail-close").addEventListener("click", () => {
      history.replaceState(null, "", location.pathname + location.search);
      detailEl.hidden = true;
    });
    hydrateSprites();
    detailEl.scrollIntoView({ block: "nearest" });
  };

  function hydrateSprites() {
    if (kindName !== "items") return;
    const a = window.SpriteAtlas;
    const paint = () => root.querySelectorAll(".sri-sprite[data-item-id]").forEach((el) => {
      const css = a.css(+el.dataset.itemId);
      if (css) { el.style.background = css; el.textContent = ""; }
    });
    if (a?.ready) paint();
    else {
      a?.load(BASE);
      window.addEventListener("osrs-sprite-ready", paint, { once: true });
    }
  }

  searchEl.addEventListener("input", apply);
  sortEl.addEventListener("change", apply);
  root.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", apply));
  window.addEventListener("hashchange", showDetail);
  moreEl.addEventListener("click", renderChunk);

  apply();
  if (location.hash) showDetail();
}

init();
