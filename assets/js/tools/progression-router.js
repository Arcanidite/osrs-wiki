(function () {
  const BASE        = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
  const STEPS_URL   = BASE + "/assets/data/tools/steps.jsonl";
  const GOALS_URL   = BASE + "/assets/data/tools/goals.jsonl";
  const REGIONS_URL      = BASE + "/assets/data/tools/regions.jsonl";
  const CONSTRAINTS_URL  = BASE + "/assets/data/tools/constraints.jsonl";
  const STORE_PROFILE    = "osrs-router-profile";
  const STORE_PLANS      = "osrs-router-plans";
  const STORE_GOALS      = "osrs-router-goals";
  const STORE_ACTIVE     = "osrs-router-active";
  const STORE_STEP_NOTES    = "osrs-step-notes";
  const STORE_CUSTOM_GOALS  = "osrs-router-custom-goals";
  const STORE_TAGS          = "osrs-router-tags";

  // ── Data ──────────────────────────────────────────────────────────────────
  async function loadJsonl(url) {
    const text = await fetch(url).then((r) => r.text());
    return text.trim().split("\n").map((l) => JSON.parse(l));
  }

  const SKILL_ORDER = [
    "attack","strength","defence","hitpoints","ranged","prayer","magic",
    "cooking","woodcutting","fletching","fishing","firemaking","crafting",
    "smithing","mining","herblore","agility","thieving","slayer",
    "farming","runecraft","hunter","construction",
  ];
  function deriveSkills() {
    return SKILL_ORDER;
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  const store = {
    profile:      ()      => JSON.parse(localStorage.getItem(STORE_PROFILE) ?? "{}"),
    saveProfile:  (p)     => localStorage.setItem(STORE_PROFILE, JSON.stringify(p)),

    plans:        ()      => JSON.parse(localStorage.getItem(STORE_PLANS) ?? "[]"),
    savePlan:     (plan)  => {
      const plans = store.plans(); plans.push(plan);
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
      return plans.length - 1;
    },
    updatePlan:   (i, p)  => {
      const plans = store.plans(); plans[i] = p;
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
    },
    deletePlan:   (i)     => {
      const plans = store.plans(); plans.splice(i, 1);
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
    },

    goals:        ()      => JSON.parse(localStorage.getItem(STORE_GOALS)  ?? "[]"),
    saveGoals:    (g)     => localStorage.setItem(STORE_GOALS,  JSON.stringify(g)),

    active:       ()      => JSON.parse(localStorage.getItem(STORE_ACTIVE) ?? "null"),
    saveActive:   (p)     => localStorage.setItem(STORE_ACTIVE, JSON.stringify(p)),

    stepNotes:    ()      => JSON.parse(localStorage.getItem(STORE_STEP_NOTES) ?? "{}"),
    saveStepNote: (id, t) => {
      const n = store.stepNotes();
      if (t.trim()) n[id] = t.trim(); else delete n[id];
      localStorage.setItem(STORE_STEP_NOTES, JSON.stringify(n));
    },
    applyNotes:   (m)     => localStorage.setItem(STORE_STEP_NOTES, JSON.stringify(m ?? {})),
    clearNotes:   ()      => localStorage.removeItem(STORE_STEP_NOTES),

    customGoals:      ()  => JSON.parse(localStorage.getItem(STORE_CUSTOM_GOALS) ?? "[]"),
    saveCustomGoals:  (g) => localStorage.setItem(STORE_CUSTOM_GOALS, JSON.stringify(g)),

    tags:      () => new Set(JSON.parse(localStorage.getItem(STORE_TAGS) ?? "[]")),
    saveTags:  (s) => localStorage.setItem(STORE_TAGS, JSON.stringify([...s].sort())),
  };

  // ── Mutable plan state ────────────────────────────────────────────────────
  let currentPath      = [];
  let pinnedExclusions = new Set();
  let pinnedInserts    = [];
  let manualQuestDone  = new Set();
  let manualStepDone   = new Set();
  let activePlanIdx    = -1;
  let goalQueue        = [];
  let customGoals      = [];
  let knownTags        = new Set();
  let skillNames       = [];
  let excludedRegions  = [];

  // ── Tab state ─────────────────────────────────────────────────────────────
  let planTabs     = [];   // [{id, name, path, goalQueue, pinnedExclusions, pinnedInserts, manualQuestDone, focalSteps, activePlanIdx}]
  let activeTabIdx = 0;
  let activeFilter = "all";  // all | incomplete | complete | focal

  function makeTab(name) {
    return { id: Date.now() + Math.random(), name, path: [], goalQueue: [], pinnedExclusions: new Set(), pinnedInserts: [], manualQuestDone: new Set(), manualStepDone: new Set(), focalSteps: new Set(), activePlanIdx: -1 };
  }
  function saveToTab() {
    const t = planTabs[activeTabIdx];
    if (!t) return;
    t.path = currentPath; t.goalQueue = [...goalQueue];
    t.pinnedExclusions = pinnedExclusions; t.pinnedInserts = [...pinnedInserts];
    t.manualQuestDone = manualQuestDone; t.manualStepDone = manualStepDone; t.activePlanIdx = activePlanIdx;
  }
  function loadFromTab(idx) {
    const t = planTabs[idx];
    if (!t) return;
    currentPath = t.path; goalQueue = [...t.goalQueue];
    pinnedExclusions = t.pinnedExclusions; pinnedInserts = [...t.pinnedInserts];
    manualQuestDone = t.manualQuestDone; manualStepDone = t.manualStepDone; activePlanIdx = t.activePlanIdx;
    activeTabIdx = idx;
    if (t.activePlanIdx >= 0) {
      const p = store.plans()[t.activePlanIdx];
      if (p) t.name = p.name;
    }
  }
  function renderTabBar() {
    const bar = $("rt-tab-bar");
    if (!bar) return;
    const newBtn = bar.querySelector(".rt-tab-new");
    [...bar.querySelectorAll(".rt-tab-btn")].forEach((b) => b.remove());
    let dragFrom = -1;
    planTabs.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.className = "rt-tab-btn" + (i === activeTabIdx ? " active" : "");
      btn.textContent = t.name || `Plan ${i + 1}`;
      btn.title = "Double-click to rename";
      btn.draggable = true;
      btn.dataset.tabIdx = i;
      btn.addEventListener("click", () => {
        if (i === activeTabIdx) return;
        saveToTab();
        loadFromTab(i);
        renderTabBar();
        renderGoalQueue();
        renderSteps(currentPath);
      });
      btn.addEventListener("dblclick", () => {
        const name = window.prompt("Tab name:", t.name || `Plan ${i + 1}`);
        if (name !== null) {
          planTabs[i].name = name.trim() || `Plan ${i + 1}`;
          renderTabBar();
          const pi = planTabs[i].activePlanIdx;
          if (pi >= 0) {
            const updated = { ...store.plans()[pi], name: planTabs[i].name };
            store.updatePlan(pi, updated);
            store.saveActive(updated);
            renderPlans();
          }
        }
      });
      btn.addEventListener("dragstart", () => { dragFrom = i; btn.classList.add("tab-drag-ghost"); });
      btn.addEventListener("dragend",   () => btn.classList.remove("tab-drag-ghost"));
      btn.addEventListener("dragover",  (e) => e.preventDefault());
      btn.addEventListener("drop", () => {
        if (dragFrom < 0 || dragFrom === i) { dragFrom = -1; return; }
        const activeId = planTabs[activeTabIdx]?.id;
        const moved = planTabs.splice(dragFrom, 1)[0];
        planTabs.splice(i, 0, moved);
        activeTabIdx = planTabs.findIndex((t) => t.id === activeId);
        dragFrom = -1;
        renderTabBar();
      });
      bar.insertBefore(btn, newBtn);
    });
  }

  // Cached data from JSONL — available after init
  let allSteps       = [];
  let allGoals       = [];
  let allRegions     = [];
  let allConstraints = [];   // {id, type, ...} — constraints.jsonl

  // ── DOM ───────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    inputs:    () => document.querySelectorAll("#router-inputs input[id^='rt-'], #router-inputs select"),
    skillInput:(sk) => $(`rt-${sk}`),
    skillGrid: () => $("rt-skill-grid"),
    style:     () => $("rt-style"),
    empty:     () => $("rt-empty"),
    steps:     () => $("rt-steps"),
    saveStatus:() => $("rt-save-status"),
    planList:  () => $("rt-plan-list"),
    noPlans:   () => $("rt-no-plans"),
    goalQueue: () => $("rt-goal-queue"),
    noGoals:   () => $("rt-no-goals"),
    routeBar:  () => $("rt-route-bar"),
  };

  function escHtml(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  // Short display labels for the 3-col compact grid
  const SKILL_ABBR = {
    attack:"Atk", strength:"Str", defence:"Def", hitpoints:"HP", prayer:"Pray",
    magic:"Mage", ranged:"Rng", slayer:"Slay", cooking:"Cook", firemaking:"FM",
    thieving:"Thiev", crafting:"Craft", smithing:"Smith", mining:"Mine",
    woodcutting:"WC", fishing:"Fish", fletching:"Fletch", herblore:"Herb",
    agility:"Agil", runecraft:"RC", construction:"Con", farming:"Farm",
    hunter:"Hunt",
  };
  function skillLabel(sk) { return SKILL_ABBR[sk] ?? (sk.charAt(0).toUpperCase() + sk.slice(1)); }

  function buildSkillGrid(skills) {
    const grid = els.skillGrid();
    if (!grid) return;
    grid.innerHTML = skills.map((sk) => `
      <div class="form-group">
        <label for="rt-${sk}" title="${sk.charAt(0).toUpperCase() + sk.slice(1)}">${skillLabel(sk)}</label>
        <input type="number" id="rt-${sk}" min="1" max="99" value="1">
      </div>`).join("");
  }

  // ── Region tag combobox ───────────────────────────────────────────────────
  function buildRegionTagbox(regions) {
    const input    = $("rt-region-input");
    const dropdown = $("rt-region-dropdown");
    if (!input || !dropdown) return;

    const showDropdown = (q) => {
      const hits = regions.filter((r) =>
        r.label.toLowerCase().includes(q) && !excludedRegions.includes(r.id)
      );
      if (!hits.length) { dropdown.hidden = true; return; }
      dropdown.innerHTML = hits.map((r) =>
        `<li class="rtb-option" data-id="${r.id}">${escHtml(r.label)}</li>`
      ).join("");
      dropdown.hidden = false;
      dropdown.querySelectorAll(".rtb-option").forEach((li) => {
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          addRegionTag(r => r.id === li.dataset.id, regions);
          input.value = "";
          dropdown.hidden = true;
        });
      });
    };

    input.addEventListener("input", () => showDropdown(input.value.trim().toLowerCase()));
    input.addEventListener("blur",  () => setTimeout(() => { dropdown.hidden = true; }, 150));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = dropdown.querySelector(".rtb-option");
        if (first) { addRegionTag((r) => r.id === first.dataset.id, regions); input.value = ""; dropdown.hidden = true; }
      } else if (e.key === "Escape") {
        dropdown.hidden = true;
      }
    });
  }

  function addRegionTag(pred, regions) {
    const r = regions.find(pred);
    if (!r || excludedRegions.includes(r.id)) return;
    excludedRegions.push(r.id);
    renderRegionTags(regions);
    store.saveProfile(readProfile());
    if (currentPath.length) recompute();
  }

  function renderRegionTags(regions) {
    const container = $("rt-region-tags");
    if (!container) return;
    container.innerHTML = excludedRegions.map((id) => {
      const r = regions.find((x) => x.id === id);
      return `<span class="rtb-tag">${escHtml(r?.label ?? id)}<button class="rtb-tag-rm" data-id="${id}" aria-label="Remove">✕</button></span>`;
    }).join("");
    container.querySelectorAll(".rtb-tag-rm").forEach((btn) => {
      btn.addEventListener("click", () => {
        excludedRegions = excludedRegions.filter((id) => id !== btn.dataset.id);
        renderRegionTags(regions);
        store.saveProfile(readProfile());
        if (currentPath.length) recompute();
      });
    });
  }

  function readProfile() {
    return {
      skills: skillNames.reduce((acc, sk) => {
        acc[sk] = parseInt(els.skillInput(sk)?.value ?? 1, 10) || 1;
        return acc;
      }, {}),
      style:          els.style()?.value ?? "balanced",
      excludeRegions: excludedRegions.map((id) => "region-" + id),
    };
  }

  function applyProfile(p, regions) {
    skillNames.forEach((sk) => {
      const el = els.skillInput(sk);
      if (el && p.skills?.[sk]) el.value = p.skills[sk];
    });
    if (p.style && els.style()) els.style().value = p.style;
    if (p.excludeRegions?.length) {
      excludedRegions = p.excludeRegions.map((v) => v.replace(/^region-/, ""));
      if (regions?.length) renderRegionTags(regions);
    }
  }

  // ── Goal queue ────────────────────────────────────────────────────────────
  function reqsSummary(reqs) {
    const r     = normalizeReqs(reqs);
    const parts = Object.entries(r.skills ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`);
    (r.tags ?? []).forEach((t) => parts.push(`[${t}]`));
    return parts.join(", ") || "no reqs";
  }

  function renderGoalQueue() {
    const ul   = els.goalQueue();
    const none = els.noGoals();
    if (!ul) return;
    ul.innerHTML = "";
    none.hidden = !!goalQueue.length;

    goalQueue.forEach((goal, i) => {
      const li = document.createElement("li");
      li.className = "goal-card";
      li.dataset.idx = i;
      li.innerHTML = `
        <span class="goal-card-body">
          <span class="goal-card-label">${escHtml(goal.label)}</span>
          <span class="goal-card-reqs">Requires: ${reqsSummary(goal.reqs)}</span>
        </span>
        <span class="goal-card-btns">
          <button class="btn btn-ghost goal-card-edit" data-idx="${i}" title="Edit">✎</button>
          <button class="btn btn-ghost goal-card-remove" data-idx="${i}" title="Remove">✕</button>
        </span>`;
      ul.appendChild(li);
    });

    ul.querySelectorAll(".goal-card-edit").forEach((btn) => {
      btn.addEventListener("click", () => openGoalEditor(+btn.dataset.idx));
    });
    ul.querySelectorAll(".goal-card-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const removed = goalQueue[+btn.dataset.idx];
        pinnedInserts = pinnedInserts.filter((p) =>
          p.step._goalLabel !== removed.label && p.step.id !== `capstone-${removed.id}`
        );
        goalQueue.splice(+btn.dataset.idx, 1);
        store.saveGoals(goalQueue);
        renderGoalQueue();
        recompute();
      });
    });
  }

  function collectGrantedTags() {
    return [...knownTags].sort();
  }

  function mergeTags(iterable) {
    let changed = false;
    for (const t of iterable) { if (t && !knownTags.has(t)) { knownTags.add(t); changed = true; } }
    if (changed) store.saveTags(knownTags);
  }

  function scoreTag(query, tag) {
    const q = query.toLowerCase(), t = tag.toLowerCase();
    const si = t.indexOf(q);
    if (si !== -1) {
      const indices = Array.from({ length: q.length }, (_, i) => si + i);
      return { score: 1 + q.length / t.length, serial: true, indices };
    }
    const matched = [];
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { matched.push(i); qi++; }
    }
    if (qi < q.length) return { score: 0, serial: false, indices: [] };
    const hasRun = matched.some((v, i) => i > 0 && v === matched[i - 1] + 1);
    if (!hasRun) return { score: 0, serial: false, indices: [] };
    const union = new Set([...q, ...t]).size;
    return { score: matched.length / union, serial: false, indices: matched };
  }

  function rankTags(query, candidates) {
    return candidates
      .map((tag) => ({ tag, ...scoreTag(query, tag) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (b.serial ? 1 : 0) - (a.serial ? 1 : 0));
  }

  function highlightTag(tag, indices, serial, opts = { maxGap: 1 }) {
    const esc = (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : c;
    if (serial && indices.length) {
      const pre  = [...tag.slice(0, indices[0])].map(esc).join("");
      const mid  = [...tag.slice(indices[0], indices[indices.length - 1] + 1)].map(esc).join("");
      const post = [...tag.slice(indices[indices.length - 1] + 1)].map(esc).join("");
      return `${pre}<mark class="rtb-hl-serial">${mid}</mark>${post}`;
    }
    if (!indices.length) return [...tag].map(esc).join("");
    const chars = [...tag];
    const set   = new Set(indices);
    const { maxGap = 1 } = opts;
    // Build contiguous runs: extend run across gaps of only space chars (≤ maxGap).
    // Runs shorter than 2 matched chars are discarded as noise.
    const runs = [];
    let run = null;
    for (let i = 0; i < chars.length; i++) {
      if (set.has(i)) {
        if (!run) run = { start: i, end: i, matched: 1 };
        else { run.end = i; run.matched++; }
      } else if (run) {
        const gap    = i - run.end;
        const onlySpace = chars.slice(run.end + 1, i + 1).every((c) => c === " ");
        if (gap <= maxGap && onlySpace) {
          // space-only gap within tolerance — extend run
        } else {
          if (run.matched >= 2) runs.push({ start: run.start, end: run.end });
          run = null;
        }
      }
    }
    if (run && run.matched >= 2) runs.push({ start: run.start, end: run.end });
    if (!runs.length) return chars.map(esc).join("");
    let out = "", pos = 0;
    for (const { start, end } of runs) {
      out += chars.slice(pos, start).map(esc).join("");
      out += `<mark class="rtb-hl-fuzzy">${chars.slice(start, end + 1).map(esc).join("")}</mark>`;
      pos = end + 1;
    }
    out += chars.slice(pos).map(esc).join("");
    return out;
  }

  function makeTagReqBox(initialTags) {
    const box      = document.createElement("div");
    box.className  = "region-tagbox";
    const tagsSpan = document.createElement("span");
    tagsSpan.className = "rtb-tags";
    const input    = document.createElement("input");
    input.className = "rtb-input"; input.type = "text"; input.placeholder = "tag…";
    const dropdown = document.createElement("ul");
    dropdown.className = "rtb-dropdown"; dropdown.hidden = true;
    box.append(tagsSpan, input, dropdown);

    const addTag = (tag) => {
      const t = tag.trim();
      if (!t) return;
      const span = document.createElement("span");
      span.className = "rtb-tag"; span.dataset.tag = t; span.tabIndex = 0;
      const rm = document.createElement("button");
      rm.className = "rtb-tag-rm"; rm.textContent = "✕"; rm.setAttribute("aria-label", "Remove");
      rm.addEventListener("click", () => span.remove());
      span.addEventListener("keydown", (e) => {
        if (e.key === "Delete" || e.key === "Backspace") { span.remove(); input.focus(); }
      });
      span.append(t, rm);
      tagsSpan.appendChild(span);
    };

    const renderOption = (r, q) => {
      const li = document.createElement("li");
      li.className = "rtb-option";
      li.dataset.tag = r.tag;
      li.innerHTML = q ? highlightTag(r.tag, r.indices, r.serial) : escHtml(r.tag);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addTag(li.dataset.tag);
        input.value = "";
        dropdown.hidden = true;
      });
      return li;
    };

    const showDropdown = (q) => {
      const current = new Set([...tagsSpan.querySelectorAll(".rtb-tag[data-tag]")].map((s) => s.dataset.tag));
      const pool = collectGrantedTags().filter((t) => !current.has(t));
      const results = q
        ? rankTags(q, pool)
        : pool.map((tag) => ({ tag, score: 0, serial: false, indices: [] })).sort((a, b) => a.tag.length - b.tag.length);
      if (!results.length) { dropdown.hidden = true; return; }
      dropdown.innerHTML = "";
      results.forEach((r) => dropdown.appendChild(renderOption(r, q)));
      dropdown.hidden = false;
    };

    let activeIdx = -1;
    const setActive = (idx) => {
      const opts = [...dropdown.querySelectorAll(".rtb-option")];
      opts.forEach((o, i) => o.classList.toggle("rtb-option--active", i === idx));
      activeIdx = idx;
    };

    input.addEventListener("input", () => { activeIdx = -1; showDropdown(input.value.trim()); });
    input.addEventListener("blur",  () => setTimeout(() => { if (input.value.trim()) { addTag(input.value.trim()); input.value = ""; } dropdown.hidden = true; activeIdx = -1; }, 150));
    input.addEventListener("keydown", (e) => {
      const opts = [...dropdown.querySelectorAll(".rtb-option")];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIdx + 1, opts.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIdx - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const active = activeIdx >= 0 ? opts[activeIdx] : null;
        if (active) { addTag(active.dataset.tag); input.value = ""; dropdown.hidden = true; activeIdx = -1; }
        else if (input.value.trim()) { addTag(input.value.trim()); input.value = ""; dropdown.hidden = true; }
      } else if (e.key === "Escape") {
        dropdown.hidden = true; activeIdx = -1;
      } else if (e.key === "Backspace" && input.value === "") {
        const last = tagsSpan.querySelector(".rtb-tag:last-of-type");
        if (last) last.remove();
      }
    });

    initialTags.forEach(addTag);

    box.readTags = () => [...tagsSpan.querySelectorAll(".rtb-tag[data-tag]")].map((s) => s.dataset.tag);
    return box;
  }

  // Inline editor for an existing goal card
  function openGoalEditor(idx) {
    const ul = els.goalQueue();
    const card = ul?.querySelector(`.goal-card[data-idx="${idx}"]`);
    if (!card) return;
    const goal = goalQueue[idx];

    const form = document.createElement("li");
    form.className = "goal-edit-form";
    form.innerHTML = `
      <div class="goal-edit-row">
        <input class="ge-label" type="text" value="${escHtml(goal.label)}" placeholder="Goal label">
        <input class="ge-terminal" type="text" value="${escHtml(goal.terminal ?? "")}" placeholder="Terminal step id (opt)">
      </div>
      <div class="ins-skill-section ins-skill-section--req">
        <div class="ins-skill-header">
          <span class="ins-skill-title req">Requirements</span>
          <button class="btn btn-ghost ge-add-req">+ skill</button>
        </div>
        <div class="ge-reqs"></div>
        <div class="ge-tag-reqs-wrap"></div>
      </div>
      <div class="ins-skill-section ins-skill-section--grant">
        <div class="ins-skill-header">
          <span class="ins-skill-title grant">Grants</span>
          <button class="btn btn-ghost ge-add-grant">+ skill</button>
        </div>
        <div class="ins-skill-pills ge-grants"></div>
        <div class="ge-tag-grants-wrap"></div>
      </div>
      <div class="goal-edit-actions">
        <button class="btn btn-primary ge-save">Save</button>
        <button class="btn btn-ghost ge-cancel">Cancel</button>
      </div>`;

    const reqsContainer  = form.querySelector(".ge-reqs");
    const grantsWrap     = form.querySelector(".ge-grants");
    const tagBox         = makeTagReqBox(normalizeReqs(goal.reqs).tags ?? []);
    form.querySelector(".ge-tag-reqs-wrap").appendChild(tagBox);

    Object.entries(normalizeReqs(goal.reqs).skills ?? {}).forEach(([sk, lvl]) => appendReqRow(reqsContainer, sk, lvl));
    const existingGrants = goal.grants ?? {};
    const tagGrantBox    = makeTagReqBox(Object.entries(existingGrants).filter(([, v]) => v === true).map(([k]) => k));
    tagGrantBox.classList.add("region-tagbox--grant");
    form.querySelector(".ge-tag-grants-wrap").appendChild(tagGrantBox);
    Object.entries(existingGrants).forEach(([k, v]) => {
      if (typeof v === "number") grantsWrap.appendChild(makeSkillPill(k, v, "grant"));
    });

    form.querySelector(".ge-add-req").addEventListener("click", () => appendReqRow(reqsContainer));
    form.querySelector(".ge-add-grant").addEventListener("click", () => grantsWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));

    form.querySelector(".ge-cancel").addEventListener("click", () => form.replaceWith(card));
    form.querySelector(".ge-save").addEventListener("click", () => {
      const label = form.querySelector(".ge-label").value.trim();
      if (!label) return;
      const reqs = { skills: {}, tags: [] };
      reqsContainer.querySelectorAll(".ge-req-row").forEach((row) => {
        const sk  = row.querySelector(".ge-req-skill").value;
        const lvl = parseInt(row.querySelector(".ge-req-level").value, 10);
        if (sk && lvl > 1) reqs.skills[sk] = lvl;
      });
      reqs.tags = tagBox.readTags();
      const grants = readSkillPills(grantsWrap);
      tagGrantBox.readTags().forEach((t) => { grants[t] = true; });
      mergeTags(reqs.tags);
      mergeTags(Object.keys(grants).filter((k) => grants[k] === true));
      goalQueue[idx] = { ...goal, label, reqs, grants, terminal: form.querySelector(".ge-terminal").value.trim() || null };
      store.saveGoals(goalQueue);
      renderGoalQueue();
      renderStepBank();
      recompute();
    });

    card.replaceWith(form);
  }

  function openCustomGoalForm() {
    const list = $("rt-bank-list");
    if (!list || list.querySelector(".custom-goal-form")) return;

    const form = document.createElement("li");
    form.className = "custom-goal-form goal-edit-form";
    form.innerHTML = `
      <div class="goal-edit-row">
        <input class="cg-label" type="text" placeholder="Goal label">
      </div>
      <div class="ins-skill-section ins-skill-section--req">
        <div class="ins-skill-header">
          <span class="ins-skill-title req">Requirements</span>
          <button class="btn btn-ghost cg-add-req">+ skill</button>
        </div>
        <div class="cg-reqs"></div>
        <div class="cg-tag-reqs-wrap"></div>
      </div>
      <div class="ins-skill-section ins-skill-section--grant">
        <div class="ins-skill-header">
          <span class="ins-skill-title grant">Grants</span>
          <button class="btn btn-ghost cg-add-grant">+ skill</button>
        </div>
        <div class="ins-skill-pills cg-grants"></div>
        <div class="cg-tag-grants-wrap"></div>
      </div>
      <div class="goal-edit-actions">
        <button class="btn btn-primary cg-save">Save</button>
        <button class="btn btn-ghost cg-cancel">Cancel</button>
      </div>`;

    const reqsContainer = form.querySelector(".cg-reqs");
    const grantsWrap    = form.querySelector(".cg-grants");
    const tagBox        = makeTagReqBox([]);
    form.querySelector(".cg-tag-reqs-wrap").appendChild(tagBox);
    const tagGrantBox   = makeTagReqBox([]);
    tagGrantBox.classList.add("region-tagbox--grant");
    form.querySelector(".cg-tag-grants-wrap").appendChild(tagGrantBox);

    form.querySelector(".cg-add-req").addEventListener("click", () => appendReqRow(reqsContainer));
    form.querySelector(".cg-add-grant").addEventListener("click", () => grantsWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));

    form.querySelector(".cg-cancel").addEventListener("click", () => { form.remove(); renderStepBank(); });
    form.querySelector(".cg-save").addEventListener("click", () => {
      const label = form.querySelector(".cg-label").value.trim();
      if (!label) return;
      const reqs = { skills: {}, tags: [] };
      reqsContainer.querySelectorAll(".ge-req-row").forEach((row) => {
        const sk  = row.querySelector(".ge-req-skill").value;
        const lvl = parseInt(row.querySelector(".ge-req-level").value, 10);
        if (sk && lvl > 1) reqs.skills[sk] = lvl;
      });
      reqs.tags = tagBox.readTags();
      const grants = readSkillPills(grantsWrap);
      tagGrantBox.readTags().forEach((t) => { grants[t] = true; });
      mergeTags(reqs.tags);
      mergeTags(Object.keys(grants).filter((k) => grants[k] === true));
      customGoals.push({ id: "custom-goal-" + Date.now(), label, reqs, grants, terminal: null });
      store.saveCustomGoals(customGoals);
      renderStepBank();
    });

    list.prepend(form);
  }

  function appendReqRow(container, skill, level) {
    const row = document.createElement("div");
    row.className = "ge-req-row";
    row.innerHTML = `
      <select class="ge-req-skill">
        ${skillNames.map((sk) => `<option value="${sk}"${sk === skill ? " selected" : ""}>${sk}</option>`).join("")}
      </select>
      <input class="ge-req-level" type="number" min="1" max="99" value="${level ?? 1}" style="width:3.5rem">
      <button class="btn btn-ghost ge-req-rm" style="font-size:var(--fs-xs);padding:1px var(--sp-q)">✕</button>`;
    row.querySelector(".ge-req-rm").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  // ── Routing ───────────────────────────────────────────────────────────────
  // Normalize legacy flat {skill:lvl} shape to structured shape
  function normalizeReqs(reqs) {
    if (!reqs || typeof reqs !== "object") return { skills: {} };
    if (reqs.skills !== undefined || reqs.items !== undefined ||
        reqs.equipment !== undefined || reqs.inv_free !== undefined ||
        reqs.constraints !== undefined) return { ...reqs, tags: reqs.tags ?? [] };
    return { skills: reqs, tags: [] };   // legacy flat form
  }

  // ctx: { completedIds: Set, freeSlots: number }
  function meetsReqs(reqs, skills, ctx) {
    const r = normalizeReqs(reqs);
    const { completedIds = new Set(), freeSlots = 28 } = ctx ?? {};

    if (!Object.entries(r.skills ?? {}).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl)) return false;

    if (r.inv_free && freeSlots < r.inv_free) return false;

    for (const cid of (r.constraints ?? [])) {
      const c = allConstraints.find((x) => x.id === cid);
      if (!c) continue;
      if (c.type === "region_order" && c.before_step && !completedIds.has(c.before_step)) return false;
      if (c.type === "inv_free"     && c.slots       && freeSlots < c.slots)              return false;
    }
    const grantedTags = new Set(skills._tags ?? []);
    if (!(r.tags ?? []).every((t) => grantedTags.has(t))) return false;
    return true;
  }

  function applyGrants(grants, skills) {
    const next = { ...skills };
    const tags = new Set(next._tags ?? []);
    Object.entries(grants ?? {}).forEach(([k, v]) => {
      if (v === true) tags.add(k);
      else if (typeof v === "number" && v > (next[k] ?? 1)) next[k] = v;
    });
    next._tags = [...tags];
    return next;
  }

  function costFor(step, style) {
    const xpSum = Object.values(step.xp ?? {}).reduce((a, b) => a + b, 0);
    if (style === "efficient") return xpSum > 0 ? 1 / xpSum : 100;
    if (style === "afk")       return step.inv_used ?? 1;
    if (style === "gp")        return (step.tags ?? []).includes("money") ? 0.5 : 1;
    return 1;
  }

  function locationAccessible(step, completedIds, excluded, completedQuests) {
    const loc = step.location;
    if (!loc) return true;
    const region = loc.region ?? "global";
    if (region !== "global" && excluded.includes("region-" + region)) return false;
    if (loc.quest_gate && !completedIds.has(loc.quest_gate) && !completedQuests.has(loc.quest_gate)) return false;
    return true;
  }

  function isUseful(step, skills, target, terminal, grantedTags, neededGates) {
    if (terminal && step.id === terminal) return true;
    if (neededGates?.has(step.id)) return true;
    const targetSkills = target.skills ?? target;
    const targetTags   = new Set(target.tags ?? []);
    if ([...targetTags].some((t) => !grantedTags.has(t) && (step.grants ?? {})[t] === true)) return true;
    return Object.entries(step.grants ?? {}).some(([sk, lvl]) =>
      (targetSkills[sk] ?? 0) > 0 && lvl > (skills[sk] ?? 1) && lvl <= (targetSkills[sk] ?? 0)
    );
  }

  class MinHeap {
    constructor() { this._h = []; }
    push(item, p) { this._h.push({ item, p }); this._up(this._h.length - 1); }
    pop() {
      const top = this._h[0], last = this._h.pop();
      if (this._h.length) { this._h[0] = last; this._down(0); }
      return top?.item;
    }
    get size() { return this._h.length; }
    _up(i) {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this._h[p].p <= this._h[i].p) break;
        [this._h[p], this._h[i]] = [this._h[i], this._h[p]]; i = p;
      }
    }
    _down(i) {
      const n = this._h.length;
      while (true) {
        let m = i, l = 2*i+1, r = 2*i+2;
        if (l < n && this._h[l].p < this._h[m].p) m = l;
        if (r < n && this._h[r].p < this._h[m].p) m = r;
        if (m === i) break;
        [this._h[m], this._h[i]] = [this._h[i], this._h[m]]; i = m;
      }
    }
  }

  function routeGoal(steps, profile, goal, skills, completedIds, completedQuests, excluded, freeSlots) {
    const normTarget  = normalizeReqs(goal.reqs ?? {});
    const targetSkills = normTarget.skills ?? {};
    const targetTags   = normTarget.tags ?? [];
    const terminal    = goal.terminal ?? null;
    const path        = [];
    let   invFree     = freeSlots ?? 28;
    let   grantedTags = new Set();
    const remaining   = new Set(
      steps.map((s) => s.id).filter((id) => !completedIds.has(id) && !pinnedExclusions.has(id))
    );

    const ctx = () => ({ completedIds, freeSlots: invFree });

    // Quest/unlock steps are only useful if they gate a step we actually need.
    // Recompute transitively: a gate is needed if it unlocks a needed step or another needed gate.
    const computeNeededGates = () => {
      const needed = new Set();
      const directlyUseful = (s) => {
        const tSkills = targetSkills;
        const tTags   = new Set(targetTags);
        if (terminal && s.id === terminal) return true;
        if ([...tTags].some((t) => !grantedTags.has(t) && (s.grants ?? {})[t] === true)) return true;
        return Object.entries(s.grants ?? {}).some(([sk, lvl]) =>
          (tSkills[sk] ?? 0) > 0 && lvl > (skills[sk] ?? 1) && lvl <= (tSkills[sk] ?? 0)
        );
      };
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of remaining) {
          const s = steps.find((x) => x.id === id);
          if (!s) continue;
          const gate = s.location?.quest_gate;
          if (gate && !needed.has(gate) && (directlyUseful(s) || needed.has(s.id))) {
            needed.add(gate); changed = true;
          }
        }
      }
      return needed;
    };

    const buildHeap = () => {
      const neededGates = computeNeededGates();
      const heap = new MinHeap();
      for (const id of remaining) {
        const step = steps.find((s) => s.id === id);
        if (!step || !meetsReqs(step.reqs, skills, ctx())) continue;
        if (!locationAccessible(step, completedIds, excluded, completedQuests)) continue;
        if (!isUseful(step, skills, { skills: targetSkills, tags: targetTags }, terminal, grantedTags, neededGates)) continue;
        heap.push(step, costFor(step, profile.style));
      }
      return heap;
    };

    const goalMet = () =>
      Object.entries(targetSkills).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl) &&
      targetTags.every((t) => grantedTags.has(t)) &&
      (!terminal || completedIds.has(terminal));

    let heap = buildHeap();
    while (heap.size > 0) {
      if (goalMet()) break;

      const best = heap.pop();
      if (!best || !remaining.has(best.id)) { heap = buildHeap(); continue; }

      path.push({ ...best, _goalLabel: goal.label, _reqs: goal.reqs });
      remaining.delete(best.id);
      completedIds.add(best.id);
      if ((best.tags ?? []).includes("quest")) completedQuests.add(best.id);
      Object.entries(best.grants ?? {}).forEach(([k, v]) => { if (v === true) grantedTags.add(k); });
      skills  = applyGrants(best.grants, skills);
      // Items consumed free up inv slots; items acquired consume them
      invFree = Math.min(28, Math.max(0, invFree - (best.inv_used ?? 0) + (best.inv_removes?.length ?? 0)));
      heap    = buildHeap();
    }
    return { path, skills, completedIds, completedQuests, freeSlots: invFree };
  }

  function synthFillGaps(path, goalReqs, finalSkills, allSkills) {
    const grantedTags = path.reduce((acc, s) => {
      Object.entries(s.grants ?? {}).forEach(([k, v]) => { if (v === true) acc.add(k); });
      return acc;
    }, new Set());

    const maxGranted = (sk) => path.reduce((mx, s) => {
      const v = (s.grants ?? {})[sk];
      return typeof v === "number" ? Math.max(mx, v) : mx;
    }, -Infinity);

    const synths = [];

    Object.entries(goalReqs.skills ?? {}).forEach(([sk, needed]) => {
      if ((finalSkills[sk] ?? 1) >= needed) return;
      const top = maxGranted(sk);
      const fromLvl = top > -Infinity ? top : (allSkills[sk] ?? 1);
      if (fromLvl >= needed) return;
      synths.push({
        id:         `synth-${sk}-${needed}-${Date.now()}`,
        label:      `Train ${sk.charAt(0).toUpperCase() + sk.slice(1)} ${fromLvl}→${needed}`,
        detail:     "Synthetic step — no matching step found in bank.",
        reqs:       { skills: { [sk]: fromLvl } },
        grants:     { [sk]: needed },
        _custom:    true,
        _synthetic: true,
        _goalLabel: path[0]?._goalLabel ?? "",
      });
    });

    (goalReqs.tags ?? []).forEach((tag) => {
      if (grantedTags.has(tag)) return;
      synths.push({
        id:         `synth-tag-${tag}-${Date.now()}`,
        label:      `Obtain ${tag}`,
        detail:     "Synthetic step — no matching step found in bank.",
        reqs:       { skills: {}, tags: [] },
        grants:     { [tag]: true },
        _custom:    true,
        _synthetic: true,
        _goalLabel: path[0]?._goalLabel ?? "",
      });
    });

    if (!synths.length) return path;
    const reqKey = (s) => Math.min(...Object.values(s.reqs?.skills ?? { _: 0 }));
    return [...path, ...synths].sort((a, b) => reqKey(a) - reqKey(b));
  }

  function routeMulti(goals, steps, profile) {
    let skills          = { ...profile.skills };
    let completedIds    = new Set([...manualQuestDone]);
    let completedQuests = new Set([...manualQuestDone]);
    const excluded      = profile.excludeRegions ?? [];
    let freeSlots       = 28;

    return goals.flatMap((goal) => {
      const skillsAtGoalStart = { ...skills };
      const r = routeGoal(steps, profile, goal, skills, completedIds, completedQuests, excluded, freeSlots);
      skills          = r.skills;
      completedIds    = r.completedIds;
      completedQuests = r.completedQuests;
      freeSlots       = r.freeSlots;

      const filled = synthFillGaps(r.path, normalizeReqs(goal.reqs), r.skills, skillsAtGoalStart);
      // re-apply grants from synthetic steps so downstream goals see them
      const synthSteps = filled.filter((s) => s._synthetic);
      skills = synthSteps.reduce((sk, s) => applyGrants(s.grants, sk), r.skills);

      const capstone = {
        id:         `capstone-${goal.id}`,
        label:      goal.label,
        detail:     reqsSummary(goal.reqs),
        reqs:       goal.reqs ?? {},
        grants:     goal.grants ?? {},
        tags:       ["capstone"],
        _goalLabel: goal.label,
        _capstone:  true,
      };
      return [...filled, capstone];
    });
  }

  // Apply pinnedInserts: splice user-inserted custom steps back into a freshly
  // computed path based on their anchor (the step id they were inserted after).
  function applyPinnedInserts(path) {
    let result = [...path];
    pinnedInserts.forEach(({ anchor, step }) => {
      if (result.some((s) => s.id === step.id)) return; // already present
      const anchorIdx = anchor === "start" ? -1 : result.findIndex((s) => s.id === anchor);
      result.splice(anchorIdx + 1, 0, step);
    });
    return result;
  }

  // ── Recompute: run route from current goal queue + profile, apply pins ────
  function upsertActivePlan(path, profile) {
    const plans = store.plans();
    const name  = activePlanIdx >= 0 ? (plans[activePlanIdx]?.name ?? `Route ${plans.length + 1}`) : `Route ${plans.length + 1}`;
    const plan  = {
      name, goals: goalQueue, style: profile.style,
      skills: profile.skills, excludeRegions: profile.excludeRegions,
      steps: path, stepNotes: store.stepNotes(),
      pinnedInserts, date: new Date().toLocaleDateString(),
      focalSteps: [...(planTabs[activeTabIdx]?.focalSteps ?? [])],
    };
    if (activePlanIdx >= 0 && plans[activePlanIdx]) {
      store.updatePlan(activePlanIdx, plan);
    } else {
      activePlanIdx = store.savePlan(plan);
    }
    store.saveActive(plan);
    if (planTabs[activeTabIdx]) { planTabs[activeTabIdx].name = name; planTabs[activeTabIdx].activePlanIdx = activePlanIdx; }
    renderTabBar();
    renderPlans();
  }

  function recompute() {
    if (!goalQueue.length) return;
    const profile  = readProfile();
    const computed = routeMulti(goalQueue, allSteps, profile);
    const path     = applyPinnedInserts(computed);
    currentPath    = path;
    window._routerLastPath = { path, profile, goals: goalQueue };
    if (path.length) upsertActivePlan(path, profile);
    renderSteps(path);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function xpBadge(xp) {
    const t = Object.values(xp ?? {}).reduce((a, b) => a + b, 0);
    return t ? `<span class="step-badge xp">+${t.toLocaleString()} xp</span>` : "";
  }
  function invBadge(step) {
    return step.inv_used ? `<span class="step-badge inv">${step.inv_used} inv slots</span>` : "";
  }
  function reqBadge(reqs) {
    const r = normalizeReqs(reqs);
    const entries = Object.entries(r.skills ?? {});
    if (!entries.length) return "";
    const skills = entries.map(([sk]) => sk).join(" ");
    const parts  = entries.map(([sk, lvl]) => `${skillLabel(sk)} ${lvl}`);
    return `<span class="step-badge req" data-req-skill="${escHtml(skills)}">Req: ${parts.join(", ")}</span>`;
  }
  function constraintBadges(reqs) {
    const r = normalizeReqs(reqs);
    const out = [];
    (r.equipment ?? []).forEach(({ item, slot, optional }) =>
      out.push(`<span class="step-badge eq" title="${optional ? "optional" : "required"}">${slot}: ${item.replace(/_/g," ")}${optional ? "?" : ""}</span>`)
    );
    (r.items ?? []).forEach((item) =>
      out.push(`<span class="step-badge itm">${item.replace(/_/g," ")}</span>`)
    );
    if (r.inv_free)
      out.push(`<span class="step-badge inv">${r.inv_free} free slots</span>`);
    (r.constraints ?? []).forEach((cid) => {
      const c = allConstraints.find((x) => x.id === cid);
      if (!c) return;
      const icon = { region_order:"📍", item_on_item:"🔗", item_on_object:"🔗",
                     object_interact:"⚙", graph_ref:"◈", equipment:"🛡", inventory_item:"🎒", inv_free:"📦" }[c.type] ?? "·";
      out.push(`<span class="step-badge constraint" title="${escHtml(c.label)}">${icon}</span>`);
    });
    return out.join("");
  }
  function locationBadge(step) {
    const loc = step.location;
    if (!loc || loc.region === "global" || !loc.region) return "";
    const zone  = loc.zone  ? ` / ${loc.zone.replace(/-/g," ")}` : "";
    const label = loc.region.replace(/-/g," ") + zone;
    const gate  = loc.quest_gate ? ` · after ${loc.quest_gate.replace(/-/g," ")}` : "";
    return `<span class="step-badge loc">${escHtml(label + gate)}</span>`;
  }
  function goalBadge(step) {
    return step._goalLabel
      ? `<span class="step-badge goal-lbl" title="Goal">${escHtml(step._goalLabel)}</span>`
      : "";
  }

  // ── Toast notification ───────────────────────────────────────────────────
  function showToast(msg) {
    let t = $("rt-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "rt-toast"; t.className = "rt-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("rt-toast--show");
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove("rt-toast--show"), 3200);
  }

  function synthPrereqs(step, skillsAtPos) {
    const nr      = normalizeReqs(step.reqs);
    const synths  = [];

    Object.entries(nr.skills ?? {}).forEach(([sk, needed]) => {
      if ((skillsAtPos[sk] ?? 1) >= needed) return;
      const fromLvl = skillsAtPos[sk] ?? 1;
      synths.push({
        id:         `synth-${sk}-${needed}-${Date.now()}`,
        label:      `Train ${sk.charAt(0).toUpperCase() + sk.slice(1)} ${fromLvl}→${needed}`,
        detail:     "Synthetic step — no matching step found in bank.",
        reqs:       { skills: { [sk]: fromLvl } },
        grants:     { [sk]: needed },
        _custom:    true,
        _synthetic: true,
        _goalLabel: step._goalLabel ?? "",
      });
    });

    (nr.tags ?? []).forEach((tag) => {
      const granted = currentPath.slice(0, currentPath.indexOf(step) + 1)
        .some((s) => (s.grants ?? {})[tag] === true);
      if (granted) return;
      synths.push({
        id:         `synth-tag-${tag}-${Date.now()}`,
        label:      `Obtain ${tag}`,
        detail:     "Synthetic step — no matching step found in bank.",
        reqs:       { skills: {}, tags: [] },
        grants:     { [tag]: true },
        _custom:    true,
        _synthetic: true,
        _goalLabel: step._goalLabel ?? "",
      });
    });

    return synths;
  }

  // ── Unified step creation form (inline insert + bank new-step) ────────────
  function buildStepForm(opts) {
    const { afterIdx = -1, onCommit, onCancel } = opts;

    const li = document.createElement("li");
    li.className = "goal-card ins-step-card";

    function showCard() {
      li.innerHTML = `
        <span class="goal-card-body">
          <span class="goal-card-label ins-card-label">New step</span>
          <span class="goal-card-reqs"></span>
        </span>
        <span class="goal-card-btns">
          <button class="btn btn-ghost ins-card-edit" title="Configure step">✎</button>
          <button class="btn btn-ghost ins-card-cancel" title="Cancel">✕</button>
        </span>`;
      li.querySelector(".ins-card-edit").addEventListener("click", showForm);
      li.querySelector(".goal-card-body").addEventListener("click", showForm);
      li.querySelector(".ins-card-cancel").addEventListener("click", (e) => {
        e.stopPropagation();
        if (onCancel) onCancel();
      });
    }

    function showForm() {
      li.innerHTML = `
        <div class="ins-step-body">
          <input class="ins-label" type="text" placeholder="Step label…">
          <input class="ins-detail" type="text" placeholder="Detail (optional)">
        </div>
        <div class="ins-skill-section ins-skill-section--req">
          <div class="ins-skill-header">
            <span class="ins-skill-title req">Requirements</span>
            <button class="btn btn-ghost ins-add-req">+ skill</button>
          </div>
          <div class="ins-skill-pills ins-reqs"></div>
          <div class="ins-tag-reqs-wrap"></div>
        </div>
        <div class="ins-skill-section ins-skill-section--grant">
          <div class="ins-skill-header">
            <span class="ins-skill-title grant">Grants</span>
            <button class="btn btn-ghost ins-add-grant">+ skill</button>
          </div>
          <div class="ins-skill-pills ins-grants"></div>
          <div class="ins-tag-grants-wrap"></div>
        </div>
        <div class="goal-edit-actions">
          <button class="btn btn-primary ins-add">Add</button>
          <button class="btn btn-ghost ins-cancel">Cancel</button>
        </div>`;

      const reqWrap   = li.querySelector(".ins-reqs");
      const grantWrap = li.querySelector(".ins-grants");
      const tagBox    = makeTagReqBox([]);
      li.querySelector(".ins-tag-reqs-wrap").appendChild(tagBox);

      const tagGrantBox = makeTagReqBox([]);
      tagGrantBox.classList.add("region-tagbox--grant");
      li.querySelector(".ins-tag-grants-wrap").appendChild(tagGrantBox);

      li.querySelector(".ins-add-req").addEventListener("click", () => reqWrap.appendChild(makeSkillPill(skillNames[0], 1, "req")));
      li.querySelector(".ins-add-grant").addEventListener("click", () => grantWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));
      li.querySelector(".ins-cancel").addEventListener("click", showCard);
      li.querySelector(".ins-add").addEventListener("click", () => {
        const label = li.querySelector(".ins-label").value.trim();
        if (!label) return;
        const anchorStep = afterIdx >= 0 ? currentPath[afterIdx] : null;
        const grants = (() => {
          const g = readSkillPills(grantWrap);
          tagGrantBox.readTags().forEach((t) => { g[t] = true; });
          return g;
        })();
        const step = {
          id:         `custom-${Date.now()}`,
          label,
          detail:     li.querySelector(".ins-detail").value.trim(),
          reqs:       { skills: readSkillPills(reqWrap), tags: tagBox.readTags() },
          grants,
          _custom:    true,
          _goalLabel: anchorStep?._goalLabel ?? "",
          _reqs:      {},
        };
        mergeTags(step.reqs.tags ?? []);
        mergeTags(Object.keys(step.grants).filter((k) => step.grants[k] === true));
        const baseSkills  = window._routerLastPath?.profile?.skills ?? {};
        const skillsAtPos = currentPath.slice(0, afterIdx + 1)
          .reduce((sk, s) => applyGrants(s.grants, sk), { ...baseSkills });
        const prereqs = synthPrereqs(step, skillsAtPos);
        let insertAt = afterIdx;
        prereqs.forEach((pre) => {
          const preAnchor = insertAt >= 0 ? currentPath[insertAt]?.id ?? "start" : "start";
          pinnedInserts.push({ anchor: preAnchor, step: pre });
          currentPath.splice(insertAt + 1, 0, pre);
          insertAt++;
        });
        pinnedInserts.push({ anchor: anchorStep?.id ?? "start", step });
        onCommit(step, insertAt);
      });
    }

    showCard();
    return li;
  }

  // Insert row between steps
  function insertRowHtml(afterIdx) {
    return `<li class="route-insert-row" data-after="${afterIdx}">
      <button class="btn btn-ghost insert-step-btn" data-after="${afterIdx}">+ insert</button>
    </li>`;
  }

  function wireStepNotes(container) {
    const notes = store.stepNotes();
    container.querySelectorAll(".step-note").forEach((ta) => {
      const id = ta.dataset.stepId;
      if (notes[id]) ta.value = notes[id];
      ta.addEventListener("input", () => {
        store.saveStepNote(id, ta.value);
        if (activePlanIdx >= 0) {
          const plans = store.plans();
          if (plans[activePlanIdx]) {
            plans[activePlanIdx].stepNotes = store.stepNotes();
            store.updatePlan(activePlanIdx, plans[activePlanIdx]);
          }
        }
      });
    });
  }

  // Inline step label/detail editor — does NOT trigger recompute (user override)
  function wireStepEdit(container) {
    container.querySelectorAll(".step-title, .step-detail").forEach((el) => {
      el.addEventListener("dblclick", () => {
        const isTitle = el.classList.contains("step-title");
        const input = document.createElement("input");
        input.type  = "text";
        input.value = el.textContent;
        input.className = isTitle ? "step-title-edit" : "step-detail-edit";
        el.replaceWith(input);
        input.focus();
        input.select();
        const commit = () => {
          const stepLi = input.closest(".route-step");
          const idx    = stepLi ? +stepLi.dataset.stepIdx : -1;
          const val    = input.value.trim();
          if (idx >= 0 && val) {
            currentPath[idx] = { ...currentPath[idx], [isTitle ? "label" : "detail"]: val };
            if (window._routerLastPath) window._routerLastPath.path = currentPath;
          }
          const span = document.createElement("span");
          span.className = el.className;
          span.textContent = val || el.textContent;
          input.replaceWith(span);
          wireStepEdit(container);
        };
        input.addEventListener("blur",    commit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
      });
    });
  }

  // ── Route bar ─────────────────────────────────────────────────────────────
  function renderRouteBar(path) {
    const bar = els.routeBar();
    if (!bar) return;
    bar.hidden = !path.length;
    if (!path.length) return;

    const plans = store.plans();
    const name  = activePlanIdx >= 0 ? (plans[activePlanIdx]?.name ?? "Route") : "Route";

    bar.innerHTML = `
      <input class="route-name-input" type="text" value="${escHtml(name)}" title="Rename plan">
      <span class="route-bar-count">${path.length} step${path.length !== 1 ? "s" : ""}</span>`;

    bar.querySelector(".route-name-input")?.addEventListener("change", (e) => {
      const trimmed = e.target.value.trim();
      if (!trimmed || activePlanIdx < 0) return;
      const p = store.plans()[activePlanIdx];
      if (!p) return;
      const updated = { ...p, name: trimmed };
      store.updatePlan(activePlanIdx, updated);
      store.saveActive(updated);
      if (planTabs[activeTabIdx]) planTabs[activeTabIdx].name = trimmed;
      renderTabBar();
      renderPlans();
    });
  }

  function renderSteps(path) {
    currentPath = path;
    const stepsEl = els.steps();
    const emptyEl = els.empty();
    if (!path.length) {
      emptyEl.hidden = false; stepsEl.hidden = true;
      emptyEl.textContent = "No route found. Adjust your goals or stats.";
      renderRouteBar([]); return;
    }
    emptyEl.hidden = true; stepsEl.hidden = false;

    // Render insert row before step 0 as well
    const rows = [insertRowHtml(-1)];

    // Pre-compute cumulative skill state to flag invalid steps
    let cumSkills = { ...readProfile().skills };
    const seqValid = path.map((step) => {
      const r = normalizeReqs(step.reqs);
      const valid = Object.entries(r.skills ?? {}).every(([sk, lvl]) => (cumSkills[sk] ?? 1) >= lvl);
      cumSkills = applyGrants(step.grants, cumSkills);
      return valid;
    });

    const tab = planTabs[activeTabIdx];
    path.forEach((step, i) => {
      const isQuest   = (step.tags ?? []).includes("quest");
      const questDone = manualQuestDone.has(step.id);
      const stepDone  = questDone || manualStepDone.has(step.id);
      const isFocal   = tab?.focalSteps?.has(step.id);
      const valid     = seqValid[i];
      const grantSkills = Object.keys(normalizeReqs(step.grants).skills ?? {}).join(" ");
      const grantAttr   = grantSkills ? ` data-grants-skill="${escHtml(grantSkills)}"` : "";
      const focalAttr   = isFocal ? ' data-focal="1"' : "";
      rows.push(`<li class="route-step${stepDone ? " step-done" : ""}${step._capstone ? " step-capstone" : ""}${valid ? "" : " step-seq-invalid"}${isFocal ? " step-focal" : ""}" data-step-idx="${i}" draggable="true"${grantAttr}${focalAttr}>
        <span class="step-drag-handle" title="Drag to reorder">⠿</span>
        <label class="step-num-wrap">
          <input type="checkbox" class="step-done-cb" data-step-id="${escHtml(step.id)}"${isQuest ? ' data-is-quest="1"' : ""}${stepDone ? " checked" : ""}>
          <span class="step-num" data-valid="${valid}">${i + 1}</span>
          <span class="step-done-icon" aria-hidden="true" data-state="${stepDone ? 'complete' : 'incomplete'}">${stepDone ? '✓' : '○'}</span>
        </label>
        <span class="step-body">
          <span class="step-title">${escHtml(step.label)}</span>
          <span class="step-detail">${escHtml(step.detail ?? "")}</span>
          <textarea class="step-note" data-step-id="${escHtml(step.id)}" placeholder="Add a note…"></textarea>
        </span>
        <span class="step-meta">
          ${goalBadge(step)}
          ${locationBadge(step)}
          ${xpBadge(step.xp)}
          ${invBadge(step)}
          ${reqBadge(step.reqs)}
          ${constraintBadges(step.reqs)}
        </span>
        <span class="step-actions">
          <button class="btn btn-ghost step-focal-btn${isFocal ? " focal-on" : ""}" data-step-idx="${i}" title="Mark focal">★</button>
          ${step._custom ? `<button class="btn btn-ghost step-edit-btn" data-step-idx="${i}" title="Edit step">✎</button>` : ""}
          ${step._capstone ? "" : `<button class="btn btn-ghost step-remove-btn" data-step-idx="${i}" title="Remove step">✕</button>`}
        </span>
      </li>`);
      rows.push(insertRowHtml(i));
    });

    stepsEl.innerHTML = rows.join("");

    wireStepNotes(stepsEl);
    wireStepEdit(stepsEl);
    wireInsertRows(stepsEl);
    wireStepRemove(stepsEl);
    wireStepDoneToggles(stepsEl);
    wireStepEditBtn(stepsEl);
    wireDragSort(stepsEl);
    wireReqScroll(stepsEl);
    wireFocalBtns(stepsEl);
    applyStepFilter(stepsEl, activeFilter);
    const fb = $("rt-filter-bar");
    if (fb) fb.hidden = !path.length;
    renderRouteBar(path);
  }

  function applyStepFilter(stepsEl, filter) {
    const isFiltered = filter !== "all";
    stepsEl.querySelectorAll(".route-insert-row").forEach((r) => { r.hidden = isFiltered; });
    stepsEl.querySelectorAll(".route-step[data-step-idx]").forEach((li) => {
      const done  = li.classList.contains("step-done");
      const focal = li.dataset.focal === "1";
      li.hidden = filter === "complete"   ? !done
                : filter === "incomplete" ? done
                : filter === "focal"      ? !focal
                : false;
    });
  }

  function wireFilterBar() {
    const bar = $("rt-filter-bar");
    if (!bar) return;
    bar.querySelectorAll(".rt-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        bar.querySelectorAll(".rt-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        applyStepFilter(els.steps(), activeFilter);
      });
    });
  }

  function wireFocalBtns(stepsEl) {
    const tab = planTabs[activeTabIdx];
    stepsEl.querySelectorAll(".step-focal-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx  = +btn.dataset.stepIdx;
        const step = currentPath[idx];
        if (!step || !tab) return;
        const li = btn.closest(".route-step");
        if (tab.focalSteps.has(step.id)) {
          tab.focalSteps.delete(step.id);
          btn.classList.remove("focal-on");
          li.classList.remove("step-focal");
          delete li.dataset.focal;
        } else {
          tab.focalSteps.add(step.id);
          btn.classList.add("focal-on");
          li.classList.add("step-focal");
          li.dataset.focal = "1";
        }
        if (activeFilter === "focal") applyStepFilter(stepsEl, activeFilter);
        if (activePlanIdx >= 0) {
          const plans = store.plans();
          if (plans[activePlanIdx]) {
            plans[activePlanIdx].focalSteps = [...tab.focalSteps];
            store.updatePlan(activePlanIdx, plans[activePlanIdx]);
            store.saveActive(plans[activePlanIdx]);
          }
        }
      });
    });
  }

  function wireReqScroll(stepsEl) {
    stepsEl.querySelectorAll(".step-badge[data-req-skill]").forEach((badge) => {
      badge.addEventListener("click", () => {
        const skills = badge.dataset.reqSkill.split(" ");
        const target = stepsEl.querySelector(
          skills.map((sk) => `[data-grants-skill~="${sk}"]`).join(",")
        );
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("req-pulse");
        target.addEventListener("animationend", () => target.classList.remove("req-pulse"), { once: true });
      });
    });
  }

  function wireInsertRows(stepsEl) {
    stepsEl.querySelectorAll(".insert-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const afterIdx = +btn.dataset.after;
        const row = btn.closest(".route-insert-row");
        const form = buildStepForm({
          afterIdx,
          onCommit: (step, idx) => {
            currentPath = [
              ...currentPath.slice(0, idx + 1),
              step,
              ...currentPath.slice(idx + 1),
            ];
            if (window._routerLastPath) window._routerLastPath.path = currentPath;
            renderSteps(currentPath);
          },
          onCancel: () => {
            const fresh = document.createElement("li");
            fresh.className = "route-insert-row";
            fresh.dataset.after = afterIdx;
            fresh.innerHTML = `<button class="btn btn-ghost insert-step-btn" data-after="${afterIdx}">+ insert</button>`;
            form.replaceWith(fresh);
            wireInsertRows(stepsEl);
          },
        });
        row.replaceWith(form);
      });
    });
  }

  function seqInvalids(path) {
    let cs = { ...readProfile().skills };
    return path.reduce((acc, s) => {
      const r = normalizeReqs(s.reqs);
      if (!Object.entries(r.skills ?? {}).every(([sk, lvl]) => (cs[sk] ?? 1) >= lvl)) acc.push(s.label);
      cs = applyGrants(s.grants, cs);
      return acc;
    }, []);
  }

  function wireDragSort(stepsEl) {
    let dragIdx = -1;
    stepsEl.querySelectorAll(".route-step[draggable]").forEach((li) => {
      li.addEventListener("dragstart", (e) => {
        dragIdx = +li.dataset.stepIdx;
        e.dataTransfer.effectAllowed = "move";
        li.classList.add("drag-ghost");
      });
      li.addEventListener("dragend", () => li.classList.remove("drag-ghost"));
      li.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const dropIdx = +li.dataset.stepIdx;
        if (dragIdx < 0 || dragIdx === dropIdx) { dragIdx = -1; return; }
        const trial = [...currentPath];
        const [moved] = trial.splice(dragIdx, 1);
        trial.splice(dropIdx, 0, moved);
        const invalids = seqInvalids(trial);
        if (invalids.length) {
          showToast(`Can't reorder: req not met for ${invalids.slice(0, 2).join(", ")}`);
          dragIdx = -1; return;
        }
        currentPath = trial;
        pinnedInserts = pinnedInserts.map((p) =>
          p.step.id === moved.id
            ? { ...p, anchor: dropIdx > 0 ? (currentPath[dropIdx - 1]?.id ?? "start") : "start" }
            : p
        );
        if (window._routerLastPath) window._routerLastPath.path = currentPath;
        renderSteps(currentPath);
        dragIdx = -1;
      });
    });
  }

  function wireStepRemove(stepsEl) {
    stepsEl.querySelectorAll(".step-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx  = +btn.dataset.stepIdx;
        const step = currentPath[idx];
        if (!step) return;
        if (step._capstone) { showToast("Remove the goal from the queue to remove its capstone."); return; }
        const trial = currentPath.filter((_, j) => j !== idx);
        const invalids = seqInvalids(trial);
        if (invalids.length) {
          showToast(`Can't remove: downstream step requires it (${invalids.slice(0, 2).join(", ")})`);
          return;
        }
        if (!step._custom) pinnedExclusions.add(step.id);
        pinnedInserts = pinnedInserts.filter((p) => p.step.id !== step.id);
        currentPath = trial;
        if (window._routerLastPath) window._routerLastPath.path = currentPath;
        renderSteps(currentPath);
      });
    });
  }

  function markStepDone(li, done) {
    const icon = li.querySelector(".step-done-icon");
    const cb   = li.querySelector(".step-done-cb");
    if (done) {
      li.classList.add("step-done");
      if (icon) { icon.dataset.state = "complete"; icon.textContent = "✓"; }
      if (cb) cb.checked = true;
    } else {
      li.classList.remove("step-done");
      if (icon) { icon.dataset.state = "incomplete"; icon.textContent = "○"; }
      if (cb) cb.checked = false;
    }
  }

  function propagatePrereqsDone(container, fromIdx) {
    // Collect skills/tags needed by steps at fromIdx and above that are already marked done.
    // Walk backwards; mark a step done only if it grants something in the needed set.
    const needed = new Set();
    const addReqs = (step) => {
      const r = normalizeReqs(step?.reqs);
      Object.keys(r.skills ?? {}).forEach((sk) => needed.add(sk));
      (r.tags ?? []).forEach((t) => needed.add(t));
    };
    // Seed from the checked step itself and any already-done downstream steps.
    const liItems = [...container.querySelectorAll(".route-step[data-step-idx]")]
      .sort((a, b) => +a.dataset.stepIdx - +b.dataset.stepIdx);
    liItems.filter((li) => +li.dataset.stepIdx >= fromIdx || li.classList.contains("step-done"))
      .forEach((li) => addReqs(currentPath[+li.dataset.stepIdx]));

    // Walk backwards from fromIdx-1, propagating.
    [...liItems].reverse().forEach((li) => {
      const i = +li.dataset.stepIdx;
      if (i >= fromIdx || li.classList.contains("step-done")) return;
      const step   = currentPath[i];
      const grants = step?.grants ?? {};
      const grantsSkills = Object.entries(grants).filter(([, v]) => typeof v === "number").map(([k]) => k);
      const grantsTags   = Object.entries(grants).filter(([, v]) => v === true).map(([k]) => k);
      if ([...grantsSkills, ...grantsTags].some((g) => needed.has(g))) {
        markStepDone(li, true);
        if (currentPath[i]?.id) manualStepDone.add(currentPath[i].id);
        addReqs(step);
      }
    });
  }

  function wireStepDoneToggles(container) {
    container.querySelectorAll(".step-done-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const { stepId, isQuest } = cb.dataset;
        const li  = cb.closest(".route-step");
        const idx = +li.dataset.stepIdx;
        if (cb.checked) {
          markStepDone(li, true);
          propagatePrereqsDone(container, idx);
          if (isQuest) manualQuestDone.add(stepId);
          else manualStepDone.add(stepId);
        } else {
          markStepDone(li, false);
          if (isQuest) manualQuestDone.delete(stepId);
          else manualStepDone.delete(stepId);
        }
        if (isQuest) recompute();
        else renderPlans();
      });
    });
  }

  function makeSkillPill(sk, lvl, tint) {
    const pill = document.createElement("span");
    pill.className = `ins-skill-pill ins-skill-pill--${tint}`;
    const icon = document.createElement("span");
    icon.className = "ins-skill-icon";
    icon.textContent = sk.charAt(0).toUpperCase();
    const sel = document.createElement("select");
    sel.className = "ins-pill-sk";
    skillNames.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = skillLabel(s);
      if (s === sk) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => { icon.textContent = sel.value.charAt(0).toUpperCase(); });
    const input = document.createElement("input");
    input.type = "number"; input.className = "ins-pill-lvl"; input.min = 1; input.max = 99; input.value = lvl ?? 1;
    const rm = document.createElement("button");
    rm.className = "btn btn-ghost ins-pill-rm"; rm.textContent = "✕";
    rm.addEventListener("click", () => pill.remove());
    pill.append(icon, sel, input, rm);
    return pill;
  }

  function readSkillPills(container) {
    return Object.fromEntries(
      [...container.querySelectorAll(".ins-skill-pill")].map((p) => [
        p.querySelector(".ins-pill-sk").value, +p.querySelector(".ins-pill-lvl").value,
      ])
    );
  }

  function wireStepEditBtn(container) {
    container.querySelectorAll(".step-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx  = +btn.dataset.stepIdx;
        const step = currentPath[idx];
        if (!step?._custom) return;
        const li = btn.closest(".route-step");

        const reqs   = normalizeReqs(step.reqs);
        const grants = step.grants ?? {};

        const form = document.createElement("div");
        form.className = "step-edit-form";
        form.innerHTML = `
          <div class="sef-row">
            <input class="sef-label"  type="text" value="${escHtml(step.label)}"       placeholder="Label">
            <input class="sef-detail" type="text" value="${escHtml(step.detail ?? "")}" placeholder="Detail">
          </div>
          <div class="ins-skill-section ins-skill-section--req">
            <div class="ins-skill-header">
              <span class="ins-skill-title req">Requirements</span>
              <button class="btn btn-ghost sef-add-req">+ add</button>
            </div>
            <div class="ins-skill-pills sef-reqs"></div>
          </div>
          <div class="ins-skill-section ins-skill-section--grant">
            <div class="ins-skill-header">
              <span class="ins-skill-title grant">Grants</span>
              <button class="btn btn-ghost sef-add-grant">+ add</button>
            </div>
            <div class="ins-skill-pills sef-grants"></div>
          </div>
          <div class="sef-actions">
            <button class="btn btn-primary sef-commit">Save</button>
            <button class="btn btn-ghost sef-cancel">Cancel</button>
          </div>`;

        const reqWrap   = form.querySelector(".sef-reqs");
        const grantWrap = form.querySelector(".sef-grants");
        Object.entries(reqs.skills ?? {}).forEach(([sk, lvl]) => reqWrap.appendChild(makeSkillPill(sk, lvl, "req")));
        Object.entries(grants).forEach(([sk, lvl]) => grantWrap.appendChild(makeSkillPill(sk, lvl, "grant")));

        form.querySelector(".sef-add-req").addEventListener("click",   () => reqWrap.appendChild(makeSkillPill(skillNames[0], 1, "req")));
        form.querySelector(".sef-add-grant").addEventListener("click", () => grantWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));

        form.querySelector(".sef-commit").addEventListener("click", () => {
          const label  = form.querySelector(".sef-label").value.trim()  || step.label;
          const detail = form.querySelector(".sef-detail").value.trim() || "";
          currentPath[idx] = { ...step, label, detail,
            reqs:   { skills: readSkillPills(reqWrap) },
            grants: readSkillPills(grantWrap) };
          if (window._routerLastPath) window._routerLastPath.path = currentPath;
          renderSteps(currentPath);
        });
        form.querySelector(".sef-cancel").addEventListener("click", () => renderSteps(currentPath));

        li.replaceWith(form);
      });
    });
  }

  // ── Step bank ─────────────────────────────────────────────────────────────
  // Bank shows allSteps (individual steps) + allGoals (preset goal bundles).
  // Adding from bank pushes into goalQueue, not currentPath.
  function flattenEntry(entry) {
    const fields = [];
    if (entry.label)  fields.push({ field: "label",  text: entry.label });
    if (entry.detail) fields.push({ field: "detail", text: entry.detail });
    if (entry.id)     fields.push({ field: "id",     text: entry.id });
    (entry.tags ?? []).forEach((t) => fields.push({ field: "tag", text: t }));
    const nr = normalizeReqs(entry.reqs);
    Object.entries(nr.skills ?? {}).forEach(([sk, lvl]) =>
      fields.push({ field: "req", text: `${sk} ${lvl}` })
    );
    (nr.tags ?? []).forEach((t) => fields.push({ field: "req", text: t }));
    Object.entries(entry.grants ?? {}).forEach(([k, v]) => {
      if (typeof v === "number") fields.push({ field: "grant", text: `${k} ${v}` });
      else if (v === true)       fields.push({ field: "grant", text: k });
    });
    if (entry.location?.region) fields.push({ field: "loc", text: entry.location.region });
    if (entry.location?.quest_gate) fields.push({ field: "quest", text: entry.location.quest_gate });
    return fields;
  }

  function scoreBankEntry(query, entry) {
    if (!query) return { score: 0, matches: [] };
    const fields = flattenEntry(entry);
    const matches = [];
    let best = 0;
    fields.forEach(({ field, text }) => {
      const r = scoreTag(query, text);
      if (r.score > 0) {
        matches.push({ field, text, ...r });
        if (r.score > best) best = r.score;
      }
    });
    return { score: best, matches };
  }

  function renderStepBank() {
    const list   = $("rt-bank-list");
    const filter = $("rt-bank-filter");
    if (!list) return;
    const q = (filter?.value ?? "").trim();

    const customEntries = customGoals.map((g) => ({ ...g, _bankType: "custom-goal" }));
    const goalEntries   = allGoals.map((g) => ({ ...g, _bankType: "goal" }));
    const stepEntries   = allSteps.map((s) => ({ ...s, _bankType: "step" }));
    const pool = [...customEntries, ...goalEntries, ...stepEntries];

    let ranked;
    if (!q) {
      ranked = pool.map((s) => ({ entry: s, score: 0, matches: [] }));
    } else {
      ranked = pool
        .map((s) => ({ entry: s, ...scoreBankEntry(q, s) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
    }

    const alreadyQueued = new Set(goalQueue.map((g) => g.id));

    const existingForm = list.querySelector(".custom-goal-form");
    list.innerHTML = "";
    if (existingForm) list.appendChild(existingForm);

    ranked.forEach(({ entry: s, matches }) => {
      const li = document.createElement("li");
      li.className = "route-step bank-step";
      li.dataset.stepId = s.id;

      const body = document.createElement("span");
      body.className = "step-body";

      const titleEl = document.createElement("span");
      titleEl.className = "step-title";
      const labelMatch = matches.find((m) => m.field === "label");
      titleEl.innerHTML = labelMatch ? highlightTag(s.label, labelMatch.indices, labelMatch.serial) : escHtml(s.label);
      body.appendChild(titleEl);

      if (s.detail) {
        const detailEl = document.createElement("span");
        detailEl.className = "step-detail";
        const detailMatch = matches.find((m) => m.field === "detail");
        detailEl.innerHTML = detailMatch ? highlightTag(s.detail, detailMatch.indices, detailMatch.serial) : escHtml(s.detail);
        body.appendChild(detailEl);
      }

      matches.filter((m) => !["label","detail"].includes(m.field)).forEach((m) => {
        const ctx = document.createElement("span");
        ctx.className = `step-detail bank-match-ctx bank-match-${m.field}`;
        ctx.innerHTML = `<em>${m.field}:</em> ${highlightTag(m.text, m.indices, m.serial)}`;
        body.appendChild(ctx);
      });

      li.appendChild(body);

      const meta = document.createElement("span");
      meta.className = "step-meta";

      (s.tags ?? []).forEach((t) => {
        const badge = document.createElement("span");
        badge.className = "step-badge";
        badge.textContent = t;
        meta.appendChild(badge);
      });

      if (s._bankType === "goal") {
        const b = document.createElement("span");
        b.className = "step-badge goal-lbl"; b.textContent = "goal";
        meta.appendChild(b);
      } else if (s._bankType === "custom-goal") {
        const tags = (s.tags ?? []).length
          ? s.tags
          : Object.entries(s.grants ?? {}).filter(([, v]) => v === true).map(([k]) => k);
        if (tags.length) {
          tags.forEach((t) => {
            const b = document.createElement("span");
            b.className = "step-badge bank-custom-lbl"; b.textContent = t;
            meta.appendChild(b);
          });
        } else {
          const b = document.createElement("span");
          b.className = "step-badge bank-custom-lbl"; b.textContent = "custom";
          meta.appendChild(b);
        }
      }

      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-ghost bank-add-btn";
      addBtn.dataset.stepId = s.id;
      if (alreadyQueued.has(s.id)) {
        addBtn.disabled = true;
        addBtn.title = "Already in plan route";
        addBtn.textContent = "＋";
      } else {
        addBtn.title = "Add to goal queue";
        addBtn.textContent = "＋";
      }
      meta.appendChild(addBtn);

      if (s._bankType === "custom-goal") {
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-ghost bank-del-btn";
        delBtn.dataset.stepId = s.id;
        delBtn.title = "Delete custom goal";
        delBtn.textContent = "✕";
        delBtn.style.color = "var(--danger, #c00)";
        meta.appendChild(delBtn);
      }

      li.appendChild(meta);
      list.appendChild(li);
    });

    list.querySelectorAll(".bank-add-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = pool.find((s) => s.id === btn.dataset.stepId);
        if (!entry) return;
        const qEntry = (entry._bankType === "goal" || entry._bankType === "custom-goal")
          ? { id: entry.id, label: entry.label, reqs: entry.reqs ?? {}, grants: entry.grants ?? {}, terminal: entry.terminal ?? null }
          : { id: entry.id, label: entry.label, reqs: normalizeReqs(entry.reqs).skills ?? {}, terminal: entry.id };
        goalQueue.push(qEntry);
        store.saveGoals(goalQueue);
        mergeTags(Object.entries(qEntry.grants ?? {}).filter(([, v]) => v === true).map(([k]) => k));
        renderGoalQueue();
        renderStepBank();
        recompute();
      });
    });

    list.querySelectorAll(".bank-del-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = customGoals.findIndex((g) => g.id === btn.dataset.stepId);
        if (idx === -1) return;
        customGoals.splice(idx, 1);
        store.saveCustomGoals(customGoals);
        renderStepBank();
      });
    });
  }

  // ── Plan list ─────────────────────────────────────────────────────────────
  function renderPlans() {
    const plans = store.plans();
    const list  = els.planList();
    const none  = els.noPlans();
    if (!list) return;
    if (!plans.length) { list.innerHTML = ""; none.hidden = false; return; }
    none.hidden = true;

    list.innerHTML = plans.map((plan, i) => {
      const total = plan.steps?.length ?? 0;
      const done  = i === activePlanIdx
        ? ($("rt-steps")?.querySelectorAll(".route-step.step-done").length ?? 0)
        : 0;
      return `
      <li class="route-step plan-list-item" data-plan-idx="${i}">
        <span class="step-num" style="background:var(--gold)" title="${total} steps">${done} / ${total}</span>
        <span class="step-body">
          <span class="plan-list-name" data-plan-idx="${i}">${escHtml(plan.name)}</span>
          <span class="step-detail">${plan.goals?.length ?? 1} goal(s) · ${plan.date}</span>
        </span>
        <span class="step-meta plan-actions">
          <button class="btn btn-ghost plan-action-btn" data-view="${i}">View</button>
          <button class="btn btn-ghost plan-action-btn plan-delete" data-delete="${i}">Remove</button>
        </span>
      </li>`;
    }).join("");

    list.querySelectorAll(".plan-list-name").forEach((span) => {
      span.addEventListener("click", () => {
        const idx   = +span.dataset.planIdx;
        const input = document.createElement("input");
        input.className = "plan-rename-input";
        input.type = "text"; input.value = plans[idx].name;
        span.replaceWith(input); input.focus(); input.select();
        const commit = () => {
          const name = input.value.trim() || plans[idx].name;
          const updated = { ...plans[idx], name };
          store.updatePlan(idx, updated);
          if (activePlanIdx === idx) { store.saveActive(updated); renderRouteBar(currentPath); }
          const tabWithPlan = planTabs.findIndex((t) => t.activePlanIdx === idx);
          if (tabWithPlan >= 0) { planTabs[tabWithPlan].name = name; renderTabBar(); }
          renderPlans();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
      });
    });

    list.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx   = +btn.dataset.view;
        const fresh = store.plans();
        const plan  = fresh[idx];
        if (!plan) return;
        const existing = planTabs.findIndex((t) => t.activePlanIdx === idx);
        if (existing >= 0) {
          saveToTab();
          loadFromTab(existing);
          renderTabBar();
          renderGoalQueue();
          renderSteps(currentPath);
        } else {
          saveToTab();
          const tab = makeTab(plan.name);
          tab.activePlanIdx = idx;
          planTabs.push(tab);
          activeTabIdx = planTabs.length - 1;
          loadPlan(plan, idx);
          renderGoalQueue();
        }
      });
    });
    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.delete;
        store.deletePlan(idx);
        const removedTabIdx = planTabs.findIndex((t) => t.activePlanIdx === idx);
        if (removedTabIdx !== -1) planTabs.splice(removedTabIdx, 1);
        planTabs.forEach((t) => { if (t.activePlanIdx > idx) t.activePlanIdx--; });
        if (removedTabIdx !== -1) {
          activeTabIdx = Math.max(0, Math.min(activeTabIdx, planTabs.length - 1));
          if (planTabs.length > 0) {
            const nextTab = planTabs[activeTabIdx];
            activePlanIdx = nextTab.activePlanIdx ?? -1;
            goalQueue = nextTab.goalQueue ?? [];
            currentPath = nextTab.path ?? [];
            pinnedInserts = nextTab.pinnedInserts ?? [];
          } else {
            activePlanIdx = -1;
            store.saveActive(null);
          }
        } else {
          if (activePlanIdx === idx) { activePlanIdx = -1; store.saveActive(null); }
          else if (activePlanIdx > idx) activePlanIdx--;
        }
        renderTabBar();
        renderPlans();
        renderGoalQueue();
        renderSteps(currentPath);
        renderRouteBar(currentPath);
      });
    });
  }

  function loadPlan(plan, idx) {
    activePlanIdx    = idx ?? -1;
    pinnedExclusions = new Set();
    manualQuestDone  = new Set();
    manualStepDone   = new Set();
    pinnedInserts    = (plan.pinnedInserts ?? []);
    applyProfile({ skills: plan.skills, style: plan.style, excludeRegions: plan.excludeRegions ?? [] }, allRegions);
    if (plan.goals) {
      goalQueue = plan.goals;
      store.saveGoals(goalQueue);
      renderGoalQueue();
    }
    store.applyNotes(plan.stepNotes ?? {});
    currentPath = plan.steps;
    if (planTabs[activeTabIdx]) {
      planTabs[activeTabIdx].name = plan.name;
      planTabs[activeTabIdx].activePlanIdx = activePlanIdx;
      planTabs[activeTabIdx].focalSteps = new Set(plan.focalSteps ?? []);
    }
    renderTabBar();
    renderSteps(plan.steps);
    window._routerLastPath = { path: plan.steps, profile: { skills: plan.skills, style: plan.style }, goals: plan.goals ?? [] };
    store.saveActive(plan);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    try {
      [allSteps, allGoals, allRegions, allConstraints] = await Promise.all([
        loadJsonl(STEPS_URL),
        loadJsonl(GOALS_URL),
        loadJsonl(REGIONS_URL),
        loadJsonl(CONSTRAINTS_URL),
      ]);
    } catch { return; }

    skillNames = deriveSkills();
    buildSkillGrid(skillNames);
    buildRegionTagbox(allRegions);
    renderStepBank();
    $("rt-bank-filter")?.addEventListener("input", renderStepBank);
    $("rt-new-goal-btn")?.addEventListener("click", openCustomGoalForm);

    // ── Tabs bootstrap ────────────────────────────────────────────────────────
    planTabs = [makeTab("Plan 1")];
    activeTabIdx = 0;
    renderTabBar();
    wireFilterBar();
    $("rt-tab-new")?.addEventListener("click", () => {
      saveToTab();
      planTabs.push(makeTab(`Plan ${planTabs.length + 1}`));
      loadFromTab(planTabs.length - 1);
      goalQueue = []; currentPath = []; pinnedExclusions = new Set(); pinnedInserts = []; manualQuestDone = new Set(); manualStepDone = new Set(); activePlanIdx = -1;
      renderTabBar();
      renderGoalQueue();
      renderSteps([]);
    });

    $("rt-sidebar-burger")?.addEventListener("click", () => {
      const row = $("rt-tool-row");
      const collapsed = row.classList.toggle("sidebar-collapsed");
      $("rt-sidebar-burger").textContent = collapsed ? "▶" : "◀";
    });

    document.querySelectorAll(".sidebar-collapse-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const body = $(btn.dataset.target);
        if (!body) return;
        const hidden = body.classList.toggle("sidebar-panel-body--collapsed");
        btn.textContent = hidden ? "▸" : "▾";
      });
    });

    const saved = store.profile();
    if (Object.keys(saved).length) applyProfile(saved, allRegions);

    customGoals = store.customGoals();
    knownTags = store.tags();
    const extractTags = (obj) => {
      const r = normalizeReqs(obj.reqs);
      (r.tags ?? []).forEach((t) => knownTags.add(t));
      Object.entries(obj.grants ?? {}).forEach(([k, v]) => { if (v === true) knownTags.add(k); });
      (obj.tags ?? []).forEach((t) => knownTags.add(t));
    };
    [...allSteps, ...allGoals].forEach(extractTags);
    [...customGoals, ...store.goals()].forEach(extractTags);
    store.plans().forEach((p) => (p.steps ?? []).forEach(extractTags));
    store.saveTags(knownTags);
    goalQueue = store.goals();
    renderGoalQueue();

    const active = store.active();
    if (active?.steps?.length) {
      const idx = store.plans().findIndex((p) => p.name === active.name && p.date === active.date);
      const plan = idx >= 0 ? store.plans()[idx] : active;
      loadPlan(plan, idx);
    }

    els.inputs().forEach((el) => {
      el.addEventListener("change", () => {
        store.saveProfile(readProfile());
        const s = els.saveStatus(); if (s) s.hidden = false;
        // Recompute on style/skill change if route is active
        if (currentPath.length) recompute();
      });
    });


    renderPlans();
  }

  init();
})();
