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
  const STORE_STEP_NOTES = "osrs-step-notes";

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
  };

  // ── Mutable plan state ────────────────────────────────────────────────────
  // currentPath: the live ordered step list shown in the route panel.
  // pinnedExclusions: step ids the user has manually removed — router won't re-add them.
  // pinnedInserts: user-inserted custom steps, spliced back in after every recompute
  //   by their anchor (the id of the step they were inserted after, or "start").
  let currentPath      = [];
  let pinnedExclusions = new Set();
  let pinnedInserts    = [];   // [{anchor: stepId|"start", step: {...}}]
  let manualQuestDone  = new Set(); // quest ids checked off by user
  let activePlanIdx    = -1;
  let goalQueue        = [];
  let skillNames       = [];
  let excludedRegions  = [];   // string ids, driven by region tagbox

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
    calcBtn:   () => $("rt-calculate"),
    resetBtn:  () => $("rt-reset"),
    empty:     () => $("rt-empty"),
    steps:     () => $("rt-steps"),
    saveStatus:() => $("rt-save-status"),
    planName:  () => $("rt-plan-name"),
    planDesc:  () => $("rt-plan-desc"),
    saveBtn:   () => $("rt-save-plan"),
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
    const parts = Object.entries(reqs ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`);
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
          <span class="goal-card-reqs">${reqsSummary(goal.reqs)}</span>
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
        goalQueue.splice(+btn.dataset.idx, 1);
        store.saveGoals(goalQueue);
        renderGoalQueue();
        recompute();
      });
    });
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
      <div class="ge-reqs" id="ge-reqs-${idx}"></div>
      <div class="goal-edit-actions">
        <button class="btn btn-ghost ge-add-req" style="font-size:var(--fs-xs)">+ req</button>
        <button class="btn btn-primary ge-save">Save</button>
        <button class="btn btn-ghost ge-cancel">Cancel</button>
      </div>`;

    const reqsContainer = form.querySelector(`#ge-reqs-${idx}`);
    Object.entries(goal.reqs ?? {}).forEach(([sk, lvl]) => appendReqRow(reqsContainer, sk, lvl));

    form.querySelector(".ge-add-req").addEventListener("click", () => appendReqRow(reqsContainer));
    form.querySelector(".ge-cancel").addEventListener("click", () => {
      form.replaceWith(card);
    });
    form.querySelector(".ge-save").addEventListener("click", () => {
      const label = form.querySelector(".ge-label").value.trim();
      if (!label) return;
      const reqs = {};
      reqsContainer.querySelectorAll(".ge-req-row").forEach((row) => {
        const sk  = row.querySelector(".ge-req-skill").value;
        const lvl = parseInt(row.querySelector(".ge-req-level").value, 10);
        if (sk && lvl > 1) reqs[sk] = lvl;
      });
      goalQueue[idx] = {
        ...goal,
        label,
        reqs,
        terminal: form.querySelector(".ge-terminal").value.trim() || null,
      };
      store.saveGoals(goalQueue);
      renderGoalQueue();
      recompute();
    });

    card.replaceWith(form);
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
        reqs.constraints !== undefined) return reqs;
    return { skills: reqs };   // legacy flat form
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
    return true;
  }

  function applyGrants(grants, skills) {
    const next = { ...skills };
    Object.entries(grants ?? {}).forEach(([sk, lvl]) => { if (lvl > (next[sk] ?? 1)) next[sk] = lvl; });
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

  function isUseful(step, skills, target, terminal) {
    if (terminal && step.id === terminal) return true;
    if ((step.tags ?? []).includes("unlock") || (step.tags ?? []).includes("quest")) return true;
    return Object.entries(step.grants ?? {}).some(([sk, lvl]) =>
      (target[sk] ?? 0) > 0 && lvl > (skills[sk] ?? 1) && lvl <= (target[sk] ?? 0)
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
    const target    = goal.reqs ?? {};
    const terminal  = goal.terminal ?? null;
    const path      = [];
    let   invFree   = freeSlots ?? 28;
    const remaining = new Set(
      steps.map((s) => s.id).filter((id) => !completedIds.has(id) && !pinnedExclusions.has(id))
    );

    const ctx = () => ({ completedIds, freeSlots: invFree });

    const buildHeap = () => {
      const heap = new MinHeap();
      for (const id of remaining) {
        const step = steps.find((s) => s.id === id);
        if (!step || !meetsReqs(step.reqs, skills, ctx())) continue;
        if (!locationAccessible(step, completedIds, excluded, completedQuests)) continue;
        if (!isUseful(step, skills, target, terminal)) continue;
        heap.push(step, costFor(step, profile.style));
      }
      return heap;
    };

    let heap = buildHeap();
    while (heap.size > 0) {
      if (Object.entries(target).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl) &&
          (!terminal || completedIds.has(terminal))) break;

      const best = heap.pop();
      if (!best || !remaining.has(best.id)) { heap = buildHeap(); continue; }

      path.push({ ...best, _goalLabel: goal.label, _reqs: goal.reqs });
      remaining.delete(best.id);
      completedIds.add(best.id);
      if ((best.tags ?? []).includes("quest")) completedQuests.add(best.id);
      skills  = applyGrants(best.grants, skills);
      // Items consumed free up inv slots; items acquired consume them
      invFree = Math.min(28, Math.max(0, invFree - (best.inv_used ?? 0) + (best.inv_removes?.length ?? 0)));
      heap    = buildHeap();
    }
    return { path, skills, completedIds, completedQuests, freeSlots: invFree };
  }

  function routeMulti(goals, steps, profile) {
    let skills          = { ...profile.skills };
    let completedIds    = new Set([...manualQuestDone]);
    let completedQuests = new Set([...manualQuestDone]);
    const excluded      = profile.excludeRegions ?? [];
    let freeSlots       = 28;

    return goals.flatMap((goal) => {
      const r = routeGoal(steps, profile, goal, skills, completedIds, completedQuests, excluded, freeSlots);
      skills          = r.skills;
      completedIds    = r.completedIds;
      completedQuests = r.completedQuests;
      freeSlots       = r.freeSlots;
      return r.path;
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
  function recompute() {
    if (!goalQueue.length) return;
    const profile  = readProfile();
    const computed = routeMulti(goalQueue, allSteps, profile);
    const path     = applyPinnedInserts(computed);
    currentPath    = path;
    window._routerLastPath = { path, profile, goals: goalQueue };
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
    const parts = Object.entries(r.skills ?? {}).map(([sk, lvl]) => `${skillLabel(sk)} ${lvl}`);
    return parts.length ? `<span class="step-badge req">Req: ${parts.join(", ")}</span>` : "";
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

  // ── Unified step creation form (inline insert + bank new-step) ────────────
  // opts: { afterIdx?: number, asGoal?: bool, onCommit(step, afterIdx), onCancel() }
  function buildStepForm(opts) {
    const { afterIdx = -1, onCommit, onCancel } = opts;
    const li = document.createElement("li");
    li.className = "route-insert-form";
    const skillOpts = skillNames.map((sk) =>
      `<option value="${sk}">${skillLabel(sk)}</option>`).join("");
    li.innerHTML = `
      <div class="ins-row">
        <input class="ins-label"  type="text" placeholder="Step label">
        <input class="ins-detail" type="text" placeholder="Detail (optional)">
      </div>
      <div class="ins-row ins-req-row" style="display:none">
        <span class="ins-reqs"></span>
        <button class="btn btn-ghost ins-add-req" style="font-size:var(--fs-xs)">+ req</button>
        <span class="ins-grants-wrap">
          <span class="ins-grants"></span>
          <button class="btn btn-ghost ins-add-grant" style="font-size:var(--fs-xs)">+ grant</button>
        </span>
      </div>
      <div class="ins-row">
        <button class="btn btn-ghost ins-toggle-adv" style="font-size:var(--fs-xs)">reqs/grants ▸</button>
        <button class="btn btn-primary ins-add">Add</button>
        <button class="btn btn-ghost ins-cancel">Cancel</button>
      </div>`;

    const reqWrap   = li.querySelector(".ins-reqs");
    const grantWrap = li.querySelector(".ins-grants");
    const advRow    = li.querySelector(".ins-req-row");
    let advOpen = false;

    const addPair = (container) => {
      const span = document.createElement("span");
      span.className = "sef-pair";
      span.innerHTML = `<select class="sef-sk">${skillOpts}</select><input type="number" class="sef-lvl" min="1" max="99" value="1"><button class="btn btn-ghost sef-rm">✕</button>`;
      span.querySelector(".sef-rm").addEventListener("click", () => span.remove());
      container.appendChild(span);
    };

    li.querySelector(".ins-toggle-adv").addEventListener("click", () => {
      advOpen = !advOpen;
      advRow.style.display = advOpen ? "flex" : "none";
      li.querySelector(".ins-toggle-adv").textContent = advOpen ? "reqs/grants ▾" : "reqs/grants ▸";
    });
    li.querySelector(".ins-add-req").addEventListener("click",   () => addPair(reqWrap));
    li.querySelector(".ins-add-grant").addEventListener("click", () => addPair(grantWrap));

    const readPairs = (el) => Object.fromEntries(
      [...el.querySelectorAll(".sef-pair")].map((p) => [
        p.querySelector(".sef-sk").value, +p.querySelector(".sef-lvl").value,
      ])
    );

    li.querySelector(".ins-add").addEventListener("click", () => {
      const label = li.querySelector(".ins-label").value.trim();
      if (!label) return;
      const anchorStep = afterIdx >= 0 ? currentPath[afterIdx] : null;
      const step = {
        id:         `custom-${Date.now()}`,
        label,
        detail:     li.querySelector(".ins-detail").value.trim(),
        reqs:       { skills: readPairs(reqWrap) },
        grants:     readPairs(grantWrap),
        _custom:    true,
        _goalLabel: anchorStep?._goalLabel ?? "",
        _reqs:      {},
      };
      pinnedInserts.push({ anchor: anchorStep?.id ?? "start", step });
      onCommit(step, afterIdx);
    });
    li.querySelector(".ins-cancel").addEventListener("click", onCancel);
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

    const isLoaded = activePlanIdx >= 0;
    const plans    = store.plans();
    const name     = isLoaded ? (plans[activePlanIdx]?.name ?? "") : "";

    bar.innerHTML = `
      <span class="route-bar-name">
        ${isLoaded
          ? `<input class="route-name-input" type="text" value="${escHtml(name)}" title="Rename plan">`
          : `<span class="route-bar-label">Unsaved route</span>`}
      </span>
      <span class="route-bar-actions">
        ${isLoaded ? `<button class="btn btn-ghost rbar-update">Update plan</button>` : ""}
        ${isLoaded ? `<button class="btn btn-ghost rbar-delete" style="color:#c00">Delete plan</button>` : ""}
      </span>`;

    if (isLoaded) {
      bar.querySelector(".route-name-input")?.addEventListener("change", (e) => {
        const p = store.plans()[activePlanIdx];
        if (!p) return;
        const updated = { ...p, name: e.target.value.trim() || p.name };
        store.updatePlan(activePlanIdx, updated);
        store.saveActive(updated);
        renderPlans();
      });
      bar.querySelector(".rbar-update")?.addEventListener("click", () => {
        const last = window._routerLastPath;
        if (!last?.path?.length) return;
        const p = store.plans()[activePlanIdx];
        if (!p) return;
        const updated = { ...p, goals: last.goals, style: last.profile.style,
          skills: last.profile.skills, steps: last.path, stepNotes: store.stepNotes(),
          date: new Date().toLocaleDateString() };
        store.updatePlan(activePlanIdx, updated);
        store.saveActive(updated);
        renderPlans(); renderRouteBar(last.path);
      });
      bar.querySelector(".rbar-delete")?.addEventListener("click", () => {
        store.deletePlan(activePlanIdx);
        store.saveActive(null);
        activePlanIdx = -1;
        renderPlans(); renderRouteBar([]);
        els.empty().hidden = false;
        els.empty().textContent = "Plan deleted.";
        els.steps().hidden = true;
        currentPath = [];
      });
    }
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

    path.forEach((step, i) => {
      const isQuest  = (step.tags ?? []).includes("quest");
      const questDone = manualQuestDone.has(step.id);
      const valid    = seqValid[i];
      rows.push(`<li class="route-step${questDone ? " quest-done" : ""}${valid ? "" : " step-seq-invalid"}" data-step-idx="${i}" draggable="true">
        <span class="step-drag-handle" title="Drag to reorder">⠿</span>
        <span class="step-num">${i + 1}</span>
        <span class="step-body">
          <span class="step-title">${escHtml(step.label)}</span>
          <span class="step-detail">${escHtml(step.detail ?? "")}</span>
          ${isQuest ? `<label class="quest-done-label"><input type="checkbox" class="quest-done-cb" data-step-id="${escHtml(step.id)}"${questDone ? " checked" : ""}> Mark complete</label>` : ""}
          <textarea class="step-note" data-step-id="${escHtml(step.id)}" rows="1" placeholder="Add a note…"></textarea>
        </span>
        <span class="step-meta">
          <span class="step-seq-dot${valid ? " valid" : " invalid"}" title="${valid ? "Requirements met" : "Requirements not met at this position"}"></span>
          ${goalBadge(step)}
          ${locationBadge(step)}
          ${xpBadge(step.xp)}
          ${invBadge(step)}
          ${reqBadge(step.reqs)}
          ${constraintBadges(step.reqs)}
        </span>
        <span class="step-actions">
          ${step._custom ? `<button class="btn btn-ghost step-edit-btn" data-step-idx="${i}" title="Edit step">✎</button>` : ""}
          <button class="btn btn-ghost step-remove-btn" data-step-idx="${i}" title="Remove step">✕</button>
        </span>
      </li>`);
      rows.push(insertRowHtml(i));
    });

    stepsEl.innerHTML = rows.join("");

    wireStepNotes(stepsEl);
    wireStepEdit(stepsEl);
    wireInsertRows(stepsEl);
    wireStepRemove(stepsEl);
    wireQuestCheckboxes(stepsEl);
    wireStepEditBtn(stepsEl);
    wireDragSort(stepsEl);
    renderRouteBar(path);
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
          onCancel: () => { row.outerHTML = insertRowHtml(afterIdx); wireInsertRows(stepsEl); },
        });
        row.replaceWith(form);
      });
    });
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
        if (dragIdx < 0 || dragIdx === dropIdx) return;
        const moved = currentPath.splice(dragIdx, 1)[0];
        currentPath.splice(dropIdx, 0, moved);
        // Update pinned insert anchors for the moved step
        pinnedInserts = pinnedInserts.map((p) =>
          p.step.id === moved.id
            ? { ...p, anchor: dropIdx > 0 ? (currentPath[dropIdx - 1]?.id ?? "start") : "start" }
            : p
        );
        if (window._routerLastPath) window._routerLastPath.path = currentPath;
        const invalids = [];
        let cs = { ...readProfile().skills };
        currentPath.forEach((s) => {
          const r = normalizeReqs(s.reqs);
          if (!Object.entries(r.skills ?? {}).every(([sk, lvl]) => (cs[sk] ?? 1) >= lvl)) invalids.push(s.label);
          cs = applyGrants(s.grants, cs);
        });
        renderSteps(currentPath);
        if (invalids.length) showToast(`Req not met at current position: ${invalids.slice(0, 3).join(", ")}`);
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
        // Add to exclusions so recompute won't re-insert it
        if (!step._custom) pinnedExclusions.add(step.id);
        // Remove from pinned inserts if it was one
        pinnedInserts = pinnedInserts.filter((p) => p.step.id !== step.id);
        currentPath.splice(idx, 1);
        if (window._routerLastPath) window._routerLastPath.path = currentPath;
        renderSteps(currentPath);
      });
    });
  }

  function wireQuestCheckboxes(container) {
    container.querySelectorAll(".quest-done-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.stepId;
        cb.checked ? manualQuestDone.add(id) : manualQuestDone.delete(id);
        recompute();
      });
    });
  }

  function wireStepEditBtn(container) {
    container.querySelectorAll(".step-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx  = +btn.dataset.stepIdx;
        const step = currentPath[idx];
        if (!step?._custom) return;
        const li = btn.closest(".route-step");

        const skillOpts = skillNames.map((sk) =>
          `<option value="${sk}">${skillLabel(sk)}</option>`).join("");
        const reqs   = normalizeReqs(step.reqs);
        const grants = step.grants ?? {};
        const reqPairs   = Object.entries(reqs.skills   ?? {});
        const grantPairs = Object.entries(grants);

        const form = document.createElement("div");
        form.className = "step-edit-form";
        form.innerHTML = `
          <div class="sef-row">
            <input class="sef-label"  type="text" value="${escHtml(step.label)}"       placeholder="Label">
            <input class="sef-detail" type="text" value="${escHtml(step.detail ?? "")}" placeholder="Detail">
          </div>
          <div class="sef-section">Reqs
            <div class="sef-reqs">${reqPairs.map(([,lvl]) =>
              `<span class="sef-pair"><select class="sef-sk">${skillOpts}</select><input type="number" class="sef-lvl" min="1" max="99" value="${lvl}"><button class="btn btn-ghost sef-rm">✕</button></span>`
            ).join("")}</div>
            <button class="btn btn-ghost sef-add-req">+ req</button>
          </div>
          <div class="sef-section">Grants
            <div class="sef-grants">${grantPairs.map(([,lvl]) =>
              `<span class="sef-pair"><select class="sef-sk">${skillOpts}</select><input type="number" class="sef-lvl" min="1" max="99" value="${lvl}"><button class="btn btn-ghost sef-rm">✕</button></span>`
            ).join("")}</div>
            <button class="btn btn-ghost sef-add-grant">+ grant</button>
          </div>
          <div class="sef-actions">
            <button class="btn btn-primary sef-commit">Save</button>
            <button class="btn btn-ghost sef-cancel">Cancel</button>
          </div>`;

        // Pre-select skill values
        const pairEls = (sel) => form.querySelectorAll(sel + " .sef-pair");
        const setSk = (pairEl, sk) => { const s = pairEl.querySelector(".sef-sk"); if (s) s.value = sk; };
        pairEls(".sef-reqs").forEach((p, i)   => setSk(p, reqPairs[i]?.[0]   ?? skillNames[0]));
        pairEls(".sef-grants").forEach((p, i) => setSk(p, grantPairs[i]?.[0] ?? skillNames[0]));

        const addRow = (container) => {
          const span = document.createElement("span");
          span.className = "sef-pair";
          span.innerHTML = `<select class="sef-sk">${skillOpts}</select><input type="number" class="sef-lvl" min="1" max="99" value="1"><button class="btn btn-ghost sef-rm">✕</button>`;
          span.querySelector(".sef-rm").addEventListener("click", () => span.remove());
          container.appendChild(span);
        };

        form.querySelectorAll(".sef-rm").forEach((b) => b.addEventListener("click", () => b.closest(".sef-pair").remove()));
        form.querySelector(".sef-add-req").addEventListener("click",   () => addRow(form.querySelector(".sef-reqs")));
        form.querySelector(".sef-add-grant").addEventListener("click", () => addRow(form.querySelector(".sef-grants")));

        const readPairs = (sel) => Object.fromEntries(
          [...form.querySelectorAll(sel + " .sef-pair")].map((p) => [
            p.querySelector(".sef-sk").value, +p.querySelector(".sef-lvl").value,
          ])
        );

        form.querySelector(".sef-commit").addEventListener("click", () => {
          const label  = form.querySelector(".sef-label").value.trim()  || step.label;
          const detail = form.querySelector(".sef-detail").value.trim() || "";
          currentPath[idx] = { ...step, label, detail,
            reqs:   { skills: readPairs(".sef-reqs") },
            grants: readPairs(".sef-grants") };
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
  function renderStepBank() {
    const list   = $("rt-bank-list");
    const filter = $("rt-bank-filter");
    if (!list) return;
    const q = (filter?.value ?? "").toLowerCase();

    // Goals appear first as "goal" entries, then individual steps
    const goalEntries = allGoals.map((g) => ({ ...g, _bankType: "goal" }));
    const stepEntries = allSteps.map((s) => ({ ...s, _bankType: "step" }));
    const pool = [...goalEntries, ...stepEntries];

    const visible = pool.filter((s) =>
      !q || s.label.toLowerCase().includes(q) || (s.tags ?? []).some((t) => t.includes(q))
    );

    const alreadyQueued = new Set(goalQueue.map((g) => g.id));

    list.innerHTML = visible.map((s) => `
      <li class="route-step bank-step" data-step-id="${escHtml(s.id)}">
        <span class="step-body">
          <span class="step-title">${escHtml(s.label)}</span>
          ${s.detail ? `<span class="step-detail">${escHtml(s.detail)}</span>` : ""}
        </span>
        <span class="step-meta">
          ${(s.tags ?? []).map((t) => `<span class="step-badge">${t}</span>`).join("")}
          ${s._bankType === "goal" ? `<span class="step-badge goal-lbl">goal</span>` : ""}
          <button class="btn btn-ghost bank-add-btn" data-step-id="${escHtml(s.id)}"${alreadyQueued.has(s.id) ? " disabled" : ""}>
            ${alreadyQueued.has(s.id) ? "Added" : "Add"}
          </button>
        </span>
      </li>`).join("");

    list.querySelectorAll(".bank-add-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = pool.find((s) => s.id === btn.dataset.stepId);
        if (!entry) return;
        const qEntry = entry._bankType === "goal"
          ? { id: entry.id, label: entry.label, reqs: entry.reqs ?? {}, terminal: entry.terminal ?? null }
          : { id: entry.id, label: entry.label, reqs: normalizeReqs(entry.reqs).skills ?? {}, terminal: entry.id };
        goalQueue.push(qEntry);
        store.saveGoals(goalQueue);
        renderGoalQueue();
        renderStepBank();
        recompute();
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

    list.innerHTML = plans.map((plan, i) => `
      <li class="route-step plan-list-item" data-plan-idx="${i}">
        <span class="step-num" style="background:var(--gold)">${plan.steps.length}</span>
        <span class="step-body">
          <span class="plan-list-name" data-plan-idx="${i}">${escHtml(plan.name)}</span>
          <span class="step-detail">${plan.goals?.length ?? 1} goal(s) · ${plan.style} · ${plan.date}</span>
          ${plan.desc ? `<span class="plan-notes">${escHtml(plan.desc)}</span>` : ""}
        </span>
        <span class="step-meta plan-actions">
          <button class="btn btn-ghost plan-action-btn" data-load="${i}">Load</button>
          <button class="btn btn-ghost plan-action-btn plan-delete" data-delete="${i}">Delete</button>
        </span>
      </li>`).join("");

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
          renderPlans();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
      });
    });

    list.querySelectorAll("[data-load]").forEach((btn) => {
      btn.addEventListener("click", () => loadPlan(plans[+btn.dataset.load], +btn.dataset.load));
    });
    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.delete;
        store.deletePlan(idx);
        if (activePlanIdx === idx) { activePlanIdx = -1; store.saveActive(null); }
        else if (activePlanIdx > idx) activePlanIdx--;
        renderPlans();
        renderRouteBar(currentPath);
      });
    });
  }

  function loadPlan(plan, idx) {
    activePlanIdx    = idx ?? -1;
    pinnedExclusions = new Set();
    manualQuestDone  = new Set();
    pinnedInserts    = (plan.pinnedInserts ?? []);
    applyProfile({ skills: plan.skills, style: plan.style, excludeRegions: plan.excludeRegions ?? [] }, allRegions);
    if (plan.goals) {
      goalQueue = plan.goals;
      store.saveGoals(goalQueue);
      renderGoalQueue();
    }
    if (els.planName()) els.planName().value = plan.name;
    if (els.planDesc()) els.planDesc().value = plan.desc ?? "";
    store.applyNotes(plan.stepNotes ?? {});
    currentPath = plan.steps;
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

    const saved = store.profile();
    if (Object.keys(saved).length) applyProfile(saved, allRegions);

    goalQueue = store.goals();
    renderGoalQueue();

    const active = store.active();
    if (active?.steps?.length) {
      const idx = store.plans().findIndex((p) => p.name === active.name && p.date === active.date);
      loadPlan(active, idx);
    }

    els.inputs().forEach((el) => {
      el.addEventListener("change", () => {
        store.saveProfile(readProfile());
        const s = els.saveStatus(); if (s) s.hidden = false;
        // Recompute on style/skill change if route is active
        if (currentPath.length) recompute();
      });
    });

    els.calcBtn()?.addEventListener("click", () => {
      if (!goalQueue.length) {
        els.empty().hidden = false;
        els.empty().textContent = "Add at least one goal to your queue.";
        els.steps().hidden = true; return;
      }
      pinnedExclusions = new Set();
      pinnedInserts    = [];
      manualQuestDone  = new Set();
      activePlanIdx    = -1;
      recompute();
    });

    els.resetBtn()?.addEventListener("click", () => {
      skillNames.forEach((sk) => { const el = els.skillInput(sk); if (el) el.value = 1; });
      if (els.style()) els.style().value = "balanced";
      goalQueue = []; activePlanIdx = -1; excludedRegions = [];
      pinnedExclusions = new Set(); pinnedInserts = []; currentPath = []; manualQuestDone = new Set();
      store.saveGoals(goalQueue); store.saveActive(null); store.clearNotes();
      renderGoalQueue();
      renderRegionTags(allRegions);
      renderStepBank();
      els.empty().hidden = false;
      els.empty().textContent = "Add goals to your queue and click Calculate Route.";
      els.steps().hidden = true;
      renderRouteBar([]);
      localStorage.removeItem(STORE_PROFILE);
      const s = els.saveStatus(); if (s) s.hidden = true;
    });

    els.saveBtn()?.addEventListener("click", () => {
      const last = window._routerLastPath;
      if (!last?.path?.length) return;
      const name = els.planName()?.value.trim() || `Plan ${store.plans().length + 1}`;
      const desc = els.planDesc()?.value.trim() ?? "";
      const plan = {
        name, desc,
        goals:          last.goals,
        style:          last.profile.style,
        skills:         last.profile.skills,
        excludeRegions: last.profile.excludeRegions,
        steps:          last.path,
        stepNotes:      store.stepNotes(),
        pinnedInserts:  pinnedInserts,
        date:           new Date().toLocaleDateString(),
      };
      activePlanIdx = store.savePlan(plan);
      store.saveActive(plan);
      if (els.planName()) els.planName().value = "";
      if (els.planDesc()) els.planDesc().value = "";
      renderPlans(); renderRouteBar(last.path);
    });

    renderPlans();
  }

  init();
})();
