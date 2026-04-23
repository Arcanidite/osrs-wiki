(function () {
  const BASE        = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
  const STEPS_URL   = BASE + "/assets/data/tools/steps.jsonl";
  const GOALS_URL   = BASE + "/assets/data/tools/goals.jsonl";
  const REGIONS_URL = BASE + "/assets/data/tools/regions.jsonl";
  const STORE_PROFILE    = "osrs-router-profile";
  const STORE_PLANS      = "osrs-router-plans";
  const STORE_GOALS      = "osrs-router-goals";
  const STORE_ACTIVE     = "osrs-router-active";
  const STORE_STEP_NOTES = "osrs-step-notes";  // {stepId: noteText}

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadJsonl(url) {
    const text = await fetch(url).then((r) => r.text());
    return text.trim().split("\n").map((l) => JSON.parse(l));
  }

  function deriveSkills(steps) {
    return [...new Set(steps.flatMap((s) => [
      ...Object.keys(s.reqs  ?? {}),
      ...Object.keys(s.grants ?? {}),
    ]))].sort();
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  const store = {
    profile:     () => JSON.parse(localStorage.getItem(STORE_PROFILE) ?? "{}"),
    saveProfile: (p) => localStorage.setItem(STORE_PROFILE, JSON.stringify(p)),

    plans:       () => JSON.parse(localStorage.getItem(STORE_PLANS) ?? "[]"),
    savePlan: (plan) => {
      const plans = store.plans();
      plans.push(plan);
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
      return plans.length - 1;
    },
    updatePlan: (idx, plan) => {
      const plans = store.plans();
      plans[idx] = plan;
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
    },
    deletePlan: (idx) => {
      const plans = store.plans();
      plans.splice(idx, 1);
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
    },

    goals:      () => JSON.parse(localStorage.getItem(STORE_GOALS)  ?? "[]"),
    saveGoals:  (g) => localStorage.setItem(STORE_GOALS,  JSON.stringify(g)),

    active:     () => JSON.parse(localStorage.getItem(STORE_ACTIVE) ?? "null"),
    saveActive: (p) => localStorage.setItem(STORE_ACTIVE, JSON.stringify(p)),

    // Per-step notes: read all, write one, clear all
    stepNotes:      ()           => JSON.parse(localStorage.getItem(STORE_STEP_NOTES) ?? "{}"),
    saveStepNote:   (id, text)   => {
      const notes = store.stepNotes();
      if (text.trim()) notes[id] = text.trim();
      else delete notes[id];
      localStorage.setItem(STORE_STEP_NOTES, JSON.stringify(notes));
    },
    applyStepNotes: (notesMap)   => localStorage.setItem(STORE_STEP_NOTES, JSON.stringify(notesMap ?? {})),
    clearStepNotes: ()           => localStorage.removeItem(STORE_STEP_NOTES),
  };

  // ── Active plan index (which saved plan is currently loaded) ──────────────
  // -1 means unsaved route; >=0 means a saved plan slot
  let activePlanIdx = -1;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    inputs:     () => document.querySelectorAll("#router-inputs input, #router-inputs select"),
    skillInput: (sk) => $(`rt-${sk}`),
    skillGrid:  () => $("rt-skill-grid"),
    style:      () => $("rt-style"),
    calcBtn:    () => $("rt-calculate"),
    resetBtn:   () => $("rt-reset"),
    empty:      () => $("rt-empty"),
    steps:      () => $("rt-steps"),
    saveStatus: () => $("rt-save-status"),
    planName:   () => $("rt-plan-name"),
    planDesc:   () => $("rt-plan-desc"),
    saveBtn:    () => $("rt-save-plan"),
    planList:   () => $("rt-plan-list"),
    noPlans:    () => $("rt-no-plans"),
    goalQueue:  () => $("rt-goal-queue"),
    noGoals:    () => $("rt-no-goals"),
    presetSel:  () => $("rt-preset-select"),
    addPreset:  () => $("rt-add-preset"),
    cgLabel:    () => $("cg-label"),
    cgTerminal: () => $("cg-terminal"),
    cgReqs:     () => $("cg-reqs"),
    cgAddReq:   () => $("cg-add-req"),
    cgSubmit:   () => $("cg-submit"),
    routeBar:   () => $("rt-route-bar"),
  };

  // ── Skill grid ────────────────────────────────────────────────────────────
  function buildSkillGrid(skills) {
    const grid = els.skillGrid();
    if (!grid) return;
    grid.innerHTML = skills.map((sk) => `
      <div class="form-group">
        <label for="rt-${sk}">${sk.charAt(0).toUpperCase() + sk.slice(1)}</label>
        <input type="number" id="rt-${sk}" min="1" max="99" value="1">
      </div>
    `).join("");
  }

  function buildRegionExcludes(regions) {
    const container = $("rt-region-excludes");
    if (!container) return;
    container.innerHTML = regions.map((r) => `
      <label class="region-exclude-item">
        <input type="checkbox" value="region-${r.id}"> ${r.label}
      </label>
    `).join("");
  }

  function buildPresetSelect(presets) {
    const sel = els.presetSel();
    if (!sel) return;
    sel.innerHTML = `<option value="">Add preset goal…</option>` +
      presets.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  function readExcludedRegions() {
    return Array.from(document.querySelectorAll("#rt-region-excludes input:checked")).map((el) => el.value);
  }

  function readProfile(skills) {
    return {
      skills: skills.reduce((acc, sk) => {
        acc[sk] = parseInt(els.skillInput(sk)?.value ?? 1, 10) || 1;
        return acc;
      }, {}),
      style:          els.style()?.value ?? "balanced",
      excludeRegions: readExcludedRegions(),
    };
  }

  function applyProfile(p, skills) {
    skills.forEach((sk) => {
      const el = els.skillInput(sk);
      if (el && p.skills?.[sk]) el.value = p.skills[sk];
    });
    if (p.style && els.style()) els.style().value = p.style;
    if (p.excludeRegions?.length) {
      document.querySelectorAll("#rt-region-excludes input").forEach((el) => {
        el.checked = p.excludeRegions.includes(el.value);
      });
    }
  }

  // ── Goal queue ────────────────────────────────────────────────────────────
  let goalQueue = [];

  function reqsSummary(reqs) {
    return Object.entries(reqs ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`).join(", ") || "no skill reqs";
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
      li.draggable = true;
      li.dataset.idx = i;
      li.innerHTML = `
        <span class="goal-card-handle" aria-hidden="true">⠿</span>
        <span class="goal-card-body">
          <span class="goal-card-label">${goal.label}</span>
          <span class="goal-card-reqs">${reqsSummary(goal.reqs)}</span>
        </span>
        <button class="btn btn-ghost goal-card-remove" data-idx="${i}" title="Remove">✕</button>
      `;
      ul.appendChild(li);
    });
    wireDrag(ul);
    ul.querySelectorAll(".goal-card-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        goalQueue.splice(+btn.dataset.idx, 1);
        store.saveGoals(goalQueue);
        renderGoalQueue();
      });
    });
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  function wireDrag(ul) {
    let dragIdx = null;
    ul.querySelectorAll(".goal-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        dragIdx = +card.dataset.idx;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        ul.querySelectorAll(".goal-card").forEach((c) => c.classList.remove("drag-over"));
        card.classList.add("drag-over");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const dropIdx = +card.dataset.idx;
        card.classList.remove("drag-over");
        if (dragIdx === null || dragIdx === dropIdx) return;
        const [moved] = goalQueue.splice(dragIdx, 1);
        goalQueue.splice(dropIdx, 0, moved);
        store.saveGoals(goalQueue);
        renderGoalQueue();
      });
    });
  }

  // ── Custom goal form ──────────────────────────────────────────────────────
  function addReqRow(skills) {
    const container = els.cgReqs();
    if (!container) return;
    const row = document.createElement("div");
    row.className = "cg-req-row";
    row.innerHTML = `
      <select class="cg-req-skill">
        ${skills.map((sk) => `<option value="${sk}">${sk.charAt(0).toUpperCase() + sk.slice(1)}</option>`).join("")}
      </select>
      <input type="number" class="cg-req-level" min="1" max="99" value="1" style="width:4rem">
      <button class="btn btn-ghost cg-req-remove" style="font-size:var(--fs-xs);padding:2px var(--sp-q)">✕</button>
    `;
    row.querySelector(".cg-req-remove").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  function readCustomGoal() {
    const label = els.cgLabel()?.value.trim();
    if (!label) return null;
    const reqs = {};
    els.cgReqs()?.querySelectorAll(".cg-req-row").forEach((row) => {
      const sk  = row.querySelector(".cg-req-skill")?.value;
      const lvl = parseInt(row.querySelector(".cg-req-level")?.value ?? 1, 10);
      if (sk && lvl > 1) reqs[sk] = lvl;
    });
    return {
      id:       `custom-${Date.now()}`,
      label,
      reqs,
      terminal: els.cgTerminal()?.value.trim() || null,
    };
  }

  function clearCustomForm() {
    if (els.cgLabel())    els.cgLabel().value    = "";
    if (els.cgTerminal()) els.cgTerminal().value = "";
    if (els.cgReqs())     els.cgReqs().innerHTML  = "";
  }

  // ── Routing ───────────────────────────────────────────────────────────────
  function meetsReqs(reqs, skills) {
    return Object.entries(reqs ?? {}).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl);
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

  function locationAccessible(step, completedIds, excludedRegions, completedQuests) {
    const loc = step.location;
    if (!loc) return true;
    const region = loc.region ?? "global";
    if (region !== "global" && excludedRegions.includes("region-" + region)) return false;
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

  // ── Min-heap ──────────────────────────────────────────────────────────────
  class MinHeap {
    constructor() { this._h = []; }
    push(item, priority) {
      this._h.push({ item, priority });
      this._bubbleUp(this._h.length - 1);
    }
    pop() {
      const top = this._h[0];
      const last = this._h.pop();
      if (this._h.length) { this._h[0] = last; this._siftDown(0); }
      return top?.item;
    }
    get size() { return this._h.length; }
    _bubbleUp(i) {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this._h[p].priority <= this._h[i].priority) break;
        [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
        i = p;
      }
    }
    _siftDown(i) {
      const n = this._h.length;
      while (true) {
        let min = i, l = 2*i+1, r = 2*i+2;
        if (l < n && this._h[l].priority < this._h[min].priority) min = l;
        if (r < n && this._h[r].priority < this._h[min].priority) min = r;
        if (min === i) break;
        [this._h[min], this._h[i]] = [this._h[i], this._h[min]];
        i = min;
      }
    }
  }

  function routeGoal(steps, profile, goal, skills, completedIds, completedQuests) {
    const target   = goal.reqs ?? {};
    const terminal = goal.terminal ?? null;
    const excluded = profile.excludeRegions ?? [];
    const path     = [];
    const remaining = new Set(steps.map((s) => s.id).filter((id) => !completedIds.has(id)));

    const eligible = () => {
      const heap = new MinHeap();
      for (const id of remaining) {
        const step = steps.find((s) => s.id === id);
        if (!step) continue;
        if (!meetsReqs(step.reqs, skills)) continue;
        if (!locationAccessible(step, completedIds, excluded, completedQuests)) continue;
        if (!isUseful(step, skills, target, terminal)) continue;
        heap.push(step, costFor(step, profile.style));
      }
      return heap;
    };

    let heap = eligible();
    while (heap.size > 0) {
      const allMet       = Object.entries(target).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl);
      const terminalDone = !terminal || completedIds.has(terminal);
      if (allMet && terminalDone) break;

      const best = heap.pop();
      if (!best) break;
      if (!remaining.has(best.id)) { heap = eligible(); continue; }

      path.push({ ...best, _goalLabel: goal.label, _reqs: goal.reqs });
      remaining.delete(best.id);
      completedIds.add(best.id);
      if ((best.tags ?? []).includes("quest")) completedQuests.add(best.id);
      skills = applyGrants(best.grants, skills);
      heap = eligible();
    }

    return { path, skills, completedIds, completedQuests };
  }

  function globalCeiling(goals) {
    return goals.reduce((ceil, goal) => {
      Object.entries(goal.reqs ?? {}).forEach(([sk, lvl]) => {
        if (lvl > (ceil[sk] ?? 0)) ceil[sk] = lvl;
      });
      return ceil;
    }, {});
  }

  function markOpportunities(path, allSteps, goals) {
    const laterGoalIds = new Set(goals.map((g) => g.terminal).filter(Boolean));
    const laterReqs    = goals.slice(1).flatMap((g) => Object.keys(g.reqs ?? {}));

    return path.map((step) => {
      const region = step.location?.region;
      if (!region || region === "global") return step;

      const opportunistic = allSteps.filter((s) =>
        s.location?.region === region &&
        !path.some((p) => p.id === s.id) &&
        (laterGoalIds.has(s.id) || laterReqs.includes(Object.keys(s.grants ?? {})[0]))
      );

      return opportunistic.length
        ? { ...step, _opportunities: opportunistic.map((s) => s.label) }
        : step;
    });
  }

  function routeMulti(goals, steps, profile) {
    const ceiling       = globalCeiling(goals);
    let skills          = { ...profile.skills };
    let completedIds    = new Set();
    let completedQuests = new Set();

    const fullPath = goals.flatMap((goal) => {
      const result = routeGoal(steps, profile, goal, skills, completedIds, completedQuests);
      skills          = result.skills;
      completedIds    = result.completedIds;
      completedQuests = result.completedQuests;
      return result.path.map((step) => {
        const grants = Object.entries(step.grants ?? {});
        const isMilestone = grants.length > 0 && grants.every(([sk, lvl]) =>
          (ceiling[sk] ?? 0) > lvl
        );
        return { ...step, _isMilestone: isMilestone };
      });
    });

    return markOpportunities(fullPath, steps, goals);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function xpBadge(xp) {
    const total = Object.values(xp ?? {}).reduce((a, b) => a + b, 0);
    return total ? `<span class="step-badge xp">+${total.toLocaleString()} xp</span>` : "";
  }

  function invBadge(step) {
    return step.inv_used ? `<span class="step-badge inv">${step.inv_used} inv slots</span>` : "";
  }

  function reqBadge(reqs) {
    const parts = Object.entries(reqs ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`);
    return parts.length ? `<span class="step-badge req">Req: ${parts.join(", ")}</span>` : "";
  }

  function locationBadge(step) {
    const loc = step.location;
    if (!loc || loc.region === "global" || !loc.region) return "";
    const zone  = loc.zone ? ` / ${loc.zone.replace(/-/g, " ")}` : "";
    const label = loc.region.replace(/-/g, " ") + zone;
    const gate  = loc.quest_gate ? ` · after ${loc.quest_gate.replace(/-/g, " ")}` : "";
    return `<span class="step-badge loc" title="Location">${label}${gate}</span>`;
  }

  function opportunityBadge(step) {
    if (!step._opportunities?.length) return "";
    return `<span class="step-badge opp" title="${step._opportunities.join(", ")}">+${step._opportunities.length} nearby</span>`;
  }

  function goalDividerHtml(goal) {
    const targets = Object.entries(goal._reqs ?? {})
      .map(([sk, lvl]) => `${sk.charAt(0).toUpperCase() + sk.slice(1)} ${lvl}`)
      .join(" · ");
    const targetsHtml = targets ? `<span class="route-goal-targets">${targets}</span>` : "";
    return `<li class="route-goal-divider">${goal._goalLabel}${targetsHtml}</li>`;
  }

  // Insert-step row rendered between steps
  function insertRowHtml(afterIdx) {
    return `<li class="route-insert-row" data-after="${afterIdx}">
      <button class="btn btn-ghost insert-step-btn" data-after="${afterIdx}" title="Insert step here">+ insert step</button>
    </li>`;
  }

  // Inline insert form — replaces the insert row on click
  function buildInsertForm(_afterIdx, onCommit, onCancel) {
    const li = document.createElement("li");
    li.className = "route-insert-form";
    li.innerHTML = `
      <input class="ins-label" type="text" placeholder="Step label" style="flex:1">
      <input class="ins-detail" type="text" placeholder="Detail (optional)" style="flex:2">
      <button class="btn btn-primary ins-add">Add</button>
      <button class="btn btn-ghost ins-cancel">Cancel</button>
    `;
    li.querySelector(".ins-add").addEventListener("click", () => {
      const label = li.querySelector(".ins-label").value.trim();
      if (!label) return;
      onCommit({
        id:       `custom-insert-${Date.now()}`,
        label,
        detail:   li.querySelector(".ins-detail").value.trim(),
        _custom:  true,
        _goalLabel: "",
        _reqs: {},
      });
    });
    li.querySelector(".ins-cancel").addEventListener("click", onCancel);
    return li;
  }

  // ── Step-note binding ─────────────────────────────────────────────────────
  // Called after renderSteps injects HTML — wires textarea persistence per step id.
  function wireStepNotes(container, notes) {
    container.querySelectorAll(".step-note").forEach((ta) => {
      const id = ta.dataset.stepId;
      if (notes[id]) ta.value = notes[id];
      ta.addEventListener("input", () => {
        store.saveStepNote(id, ta.value);
        // keep active plan's stepNotes in sync if a plan is loaded
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

  // ── Route bar (above route output, only when route is displayed) ──────────
  function renderRouteBar(path) {
    const bar = els.routeBar();
    if (!bar) return;
    bar.hidden = !path.length;
    if (!path.length) return;

    const isLoaded = activePlanIdx >= 0;
    const plans    = store.plans();
    const planName = isLoaded ? plans[activePlanIdx]?.name ?? "" : "";

    bar.innerHTML = `
      <span class="route-bar-name">
        ${isLoaded
          ? `<input class="route-name-input" type="text" value="${escHtml(planName)}" title="Rename plan">`
          : `<span class="route-bar-label">Unsaved route</span>`
        }
      </span>
      <span class="route-bar-actions">
        ${isLoaded ? `<button class="btn btn-ghost rbar-update">Update plan</button>` : ""}
        ${isLoaded ? `<button class="btn btn-ghost rbar-delete" style="color:#c00">Delete plan</button>` : ""}
      </span>
    `;

    if (isLoaded) {
      const nameInput = bar.querySelector(".route-name-input");
      nameInput?.addEventListener("change", () => {
        const plans = store.plans();
        if (plans[activePlanIdx]) {
          plans[activePlanIdx].name = nameInput.value.trim() || plans[activePlanIdx].name;
          store.updatePlan(activePlanIdx, plans[activePlanIdx]);
          store.saveActive(plans[activePlanIdx]);
          renderPlans();
        }
      });

      bar.querySelector(".rbar-update")?.addEventListener("click", () => {
        const last = window._routerLastPath;
        if (!last?.path?.length) return;
        const plans = store.plans();
        if (!plans[activePlanIdx]) return;
        const updated = {
          ...plans[activePlanIdx],
          goals:     last.goals,
          style:     last.profile.style,
          skills:    last.profile.skills,
          steps:     last.path,
          stepNotes: store.stepNotes(),
          date:      new Date().toLocaleDateString(),
        };
        store.updatePlan(activePlanIdx, updated);
        store.saveActive(updated);
        renderPlans();
        renderRouteBar(last.path);
      });

      bar.querySelector(".rbar-delete")?.addEventListener("click", () => {
        store.deletePlan(activePlanIdx);
        store.saveActive(null);
        activePlanIdx = -1;
        renderPlans();
        renderRouteBar([]);
        els.empty().hidden = false;
        els.empty().textContent = "Plan deleted.";
        els.steps().hidden = true;
      });
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Current path state (for insert mutations) ─────────────────────────────
  let currentPath = [];

  function renderSteps(path) {
    currentPath = path;
    const stepsEl = els.steps();
    const emptyEl = els.empty();
    if (!path.length) {
      emptyEl.hidden = false;
      stepsEl.hidden = true;
      emptyEl.textContent = "No route found for these inputs. Try adjusting your goals or stats.";
      renderRouteBar([]);
      return;
    }
    emptyEl.hidden = true;
    stepsEl.hidden = false;

    const notes = store.stepNotes();
    let stepNum  = 0;
    let lastGoal = null;
    const milestonesByGoal = path.reduce((acc, step) => {
      if (step._isMilestone) (acc[step._goalLabel] ??= []).push(step.label);
      return acc;
    }, {});

    const rows = [];
    path.forEach((step, i) => {
      if (step._goalLabel !== lastGoal) {
        lastGoal = step._goalLabel;
        rows.push(goalDividerHtml(step));
        const mentions = milestonesByGoal[step._goalLabel];
        if (mentions?.length) {
          rows.push(`<li class="route-milestone-mentions">Along the way: ${mentions.join(", ")}</li>`);
        }
      }

      if (step._isMilestone) return;

      stepNum++;
      const noteVal = escHtml(notes[step.id] ?? "");
      rows.push(`<li class="route-step${step._custom ? " route-step-custom" : ""}" data-step-idx="${i}">
        <span class="step-num">${stepNum}</span>
        <span class="step-body">
          <span class="step-title">${escHtml(step.label)}</span>
          <span class="step-detail">${escHtml(step.detail ?? "")}</span>
          <textarea class="step-note" data-step-id="${escHtml(step.id)}" rows="1"
            placeholder="Add a note…">${noteVal}</textarea>
        </span>
        <span class="step-meta">
          ${locationBadge(step)}
          ${opportunityBadge(step)}
          ${xpBadge(step.xp)}
          ${invBadge(step)}
          ${reqBadge(step.reqs)}
        </span>
      </li>`);

      // Insert row after every non-milestone step
      rows.push(insertRowHtml(i));
    });

    stepsEl.innerHTML = rows.join("");

    wireStepNotes(stepsEl, notes);
    wireInsertRows(stepsEl, path);
    renderRouteBar(path);
  }

  // Wire insert-step affordances
  function wireInsertRows(stepsEl, path) {
    stepsEl.querySelectorAll(".insert-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const afterIdx = +btn.dataset.after;
        const row = btn.closest(".route-insert-row");
        const form = buildInsertForm(
          afterIdx,
          (newStep) => {
            // splice into currentPath and re-render
            currentPath = [
              ...currentPath.slice(0, afterIdx + 1),
              newStep,
              ...currentPath.slice(afterIdx + 1),
            ];
            if (window._routerLastPath) window._routerLastPath.path = currentPath;
            renderSteps(currentPath);
          },
          () => {
            // cancel: restore insert row
            row.outerHTML = insertRowHtml(afterIdx);
            wireInsertRows(stepsEl, path);
          }
        );
        row.replaceWith(form);
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
          <span class="step-detail">${plan.goals?.length ?? 1} goal(s) · Style: ${plan.style} · Saved ${plan.date}</span>
          ${plan.desc ? `<span class="plan-notes">${escHtml(plan.desc)}</span>` : ""}
        </span>
        <span class="step-meta plan-actions">
          <button class="btn btn-ghost plan-action-btn" data-load="${i}">Load</button>
          <button class="btn btn-ghost plan-action-btn plan-delete" data-delete="${i}">Delete</button>
        </span>
      </li>
    `).join("");

    // Inline rename: click the title span → becomes input
    list.querySelectorAll(".plan-list-name").forEach((span) => {
      span.addEventListener("click", () => {
        const idx   = +span.dataset.planIdx;
        const input = document.createElement("input");
        input.className = "plan-rename-input";
        input.type      = "text";
        input.value     = plans[idx].name;
        span.replaceWith(input);
        input.focus();
        input.select();
        const commit = () => {
          const name = input.value.trim() || plans[idx].name;
          const updated = { ...plans[idx], name };
          store.updatePlan(idx, updated);
          if (activePlanIdx === idx) store.saveActive(updated);
          renderPlans();
          if (activePlanIdx === idx) renderRouteBar(currentPath);
        };
        input.addEventListener("blur",    commit);
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
        if (activePlanIdx === idx) {
          activePlanIdx = -1;
          store.saveActive(null);
        } else if (activePlanIdx > idx) {
          activePlanIdx--;
        }
        renderPlans();
        if (window._routerLastPath) renderRouteBar(currentPath);
      });
    });
  }

  let skillNames = [];

  function loadPlan(plan, idx) {
    activePlanIdx = idx ?? -1;
    applyProfile({ skills: plan.skills, style: plan.style }, skillNames);
    if (plan.goals) {
      goalQueue = plan.goals;
      store.saveGoals(goalQueue);
      renderGoalQueue();
    }
    if (els.planName()) els.planName().value = plan.name;
    if (els.planDesc()) els.planDesc().value = plan.desc ?? "";
    // Restore per-step notes from plan snapshot
    store.applyStepNotes(plan.stepNotes ?? {});
    renderSteps(plan.steps);
    window._routerLastPath = { path: plan.steps, profile: { skills: plan.skills, style: plan.style }, goals: plan.goals ?? [] };
    store.saveActive(plan);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    let steps, presets, regions;
    try {
      [steps, presets, regions] = await Promise.all([
        loadJsonl(STEPS_URL),
        loadJsonl(GOALS_URL),
        loadJsonl(REGIONS_URL),
      ]);
    } catch { return; }

    skillNames = deriveSkills(steps);

    buildSkillGrid(skillNames);
    buildPresetSelect(presets);
    buildRegionExcludes(regions);

    const saved = store.profile();
    if (Object.keys(saved).length) applyProfile(saved, skillNames);

    goalQueue = store.goals();
    renderGoalQueue();

    // Autoload last active plan
    const active = store.active();
    if (active?.steps?.length) {
      const plans = store.plans();
      const idx   = plans.findIndex((p) => p.name === active.name && p.date === active.date);
      loadPlan(active, idx);
    }

    els.inputs().forEach((el) => {
      el.addEventListener("change", () => {
        store.saveProfile(readProfile(skillNames));
        const status = els.saveStatus();
        if (status) status.hidden = false;
      });
    });

    els.addPreset()?.addEventListener("click", () => {
      const key    = els.presetSel()?.value;
      const preset = presets.find((p) => p.id === key);
      if (!preset) return;
      goalQueue.push({ id: preset.id, label: preset.label, reqs: preset.reqs, terminal: preset.terminal });
      store.saveGoals(goalQueue);
      renderGoalQueue();
      if (els.presetSel()) els.presetSel().value = "";
    });

    els.cgAddReq()?.addEventListener("click", () => addReqRow(skillNames));

    els.cgSubmit()?.addEventListener("click", () => {
      const goal = readCustomGoal();
      if (!goal) return;
      goalQueue.push(goal);
      store.saveGoals(goalQueue);
      renderGoalQueue();
      clearCustomForm();
    });

    els.calcBtn()?.addEventListener("click", () => {
      if (!goalQueue.length) {
        els.empty().hidden = false;
        els.empty().textContent = "Add at least one goal to your queue.";
        els.steps().hidden = true;
        return;
      }
      const profile = readProfile(skillNames);
      const path    = routeMulti(goalQueue, steps, profile);
      activePlanIdx = -1;  // fresh route is unsaved
      renderSteps(path);
      window._routerLastPath = { path, profile, goals: goalQueue };
    });

    els.resetBtn()?.addEventListener("click", () => {
      skillNames.forEach((sk) => { const el = els.skillInput(sk); if (el) el.value = 1; });
      if (els.style()) els.style().value = "balanced";
      goalQueue = [];
      activePlanIdx = -1;
      store.saveGoals(goalQueue);
      store.saveActive(null);
      store.clearStepNotes();
      renderGoalQueue();
      els.empty().hidden = false;
      els.empty().textContent = "Add goals to your queue and click Calculate Route.";
      els.steps().hidden = true;
      currentPath = [];
      renderRouteBar([]);
      localStorage.removeItem(STORE_PROFILE);
      if (els.saveStatus()) els.saveStatus().hidden = true;
    });

    els.saveBtn()?.addEventListener("click", () => {
      const last = window._routerLastPath;
      if (!last?.path?.length) return;
      const name = els.planName()?.value.trim() || `Plan ${store.plans().length + 1}`;
      const desc = els.planDesc()?.value.trim() ?? "";
      const plan = {
        name,
        desc,
        goals:     last.goals,
        style:     last.profile.style,
        skills:    last.profile.skills,
        steps:     last.path,
        stepNotes: store.stepNotes(),
        date:      new Date().toLocaleDateString(),
      };
      activePlanIdx = store.savePlan(plan);
      store.saveActive(plan);
      if (els.planName()) els.planName().value = "";
      if (els.planDesc()) els.planDesc().value = "";
      renderPlans();
      renderRouteBar(last.path);
    });

    renderPlans();
  }

  init();
})();
