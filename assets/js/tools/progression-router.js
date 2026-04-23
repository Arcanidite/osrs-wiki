(function () {
  const BASE      = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
  const STEPS_URL   = BASE + "/assets/data/tools/steps.jsonl";
  const GOALS_URL   = BASE + "/assets/data/tools/goals.jsonl";
  const REGIONS_URL = BASE + "/assets/data/tools/regions.jsonl";
  const STORE_PROFILE = "osrs-router-profile";
  const STORE_PLANS   = "osrs-router-plans";
  const STORE_GOALS   = "osrs-router-goals";

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadJsonl(url) {
    const text = await fetch(url).then((r) => r.text());
    return text.trim().split("\n").map((l) => JSON.parse(l));
  }

  // Derive the full skill set from the union of reqs/grants keys in steps.
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
    },
    deletePlan: (idx) => {
      const plans = store.plans();
      plans.splice(idx, 1);
      localStorage.setItem(STORE_PLANS, JSON.stringify(plans));
    },
    goals:     () => JSON.parse(localStorage.getItem(STORE_GOALS) ?? "[]"),
    saveGoals: (goals) => localStorage.setItem(STORE_GOALS, JSON.stringify(goals)),
  };

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
    planNotes:  () => $("rt-plan-notes"),
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
  };

  // ── Skill grid (built from data, not hardcoded) ───────────────────────────
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

  // ── Region excludes (built from regions data) ────────────────────────────
  function buildRegionExcludes(regions) {
    const container = $("rt-region-excludes");
    if (!container) return;
    container.innerHTML = regions.map((r) => `
      <label class="region-exclude-item">
        <input type="checkbox" value="region-${r.id}"> ${r.label}
      </label>
    `).join("");
  }

  // ── Preset select (built from goals data) ─────────────────────────────────
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

  function locationAccessible(step, completedIds, excludedRegions) {
    const loc = step.location;
    if (!loc) return true;
    const region = loc.region ?? "global";
    if (region !== "global" && excludedRegions.includes("region-" + region)) return false;
    if (loc.quest_gate && !completedIds.has(loc.quest_gate)) return false;
    return true;
  }

  function isUseful(step, skills, target, terminal, completedIds) {
    if (terminal && step.id === terminal) return true;
    if ((step.tags ?? []).includes("unlock") || (step.tags ?? []).includes("quest")) return true;
    return Object.entries(step.grants ?? {}).some(([sk, lvl]) =>
      (target[sk] ?? 0) > 0 && lvl > (skills[sk] ?? 1) && lvl <= (target[sk] ?? 0)
    );
  }

  function routeGoal(steps, profile, goal, skills, completedIds) {
    const target   = goal.reqs ?? {};
    const terminal = goal.terminal ?? null;
    const excluded = profile.excludeRegions ?? [];
    const path     = [];
    const remaining = new Set(steps.map((s) => s.id).filter((id) => !completedIds.has(id)));

    let changed = true;
    while (changed) {
      changed = false;
      const allMet       = Object.entries(target).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl);
      const terminalDone = !terminal || completedIds.has(terminal);
      if (allMet && terminalDone) break;

      let best = null, bestCost = Infinity;
      for (const id of remaining) {
        const step = steps.find((s) => s.id === id);
        if (!step) continue;
        if (!meetsReqs(step.reqs, skills)) continue;
        if (!locationAccessible(step, completedIds, excluded)) continue;
        if (!isUseful(step, skills, target, terminal, completedIds)) continue;
        const cost = costFor(step, profile.style);
        if (cost < bestCost) { bestCost = cost; best = step; }
      }
      if (!best) break;
      path.push({ ...best, _goalLabel: goal.label, _reqs: goal.reqs });
      remaining.delete(best.id);
      completedIds.add(best.id);
      skills = applyGrants(best.grants, skills);
      changed = true;
    }

    return { path, skills, completedIds };
  }

  // Per-skill max level required across all goals — used to suppress intermediate milestones.
  function globalCeiling(goals) {
    return goals.reduce((ceil, goal) => {
      Object.entries(goal.reqs ?? {}).forEach(([sk, lvl]) => {
        if (lvl > (ceil[sk] ?? 0)) ceil[sk] = lvl;
      });
      return ceil;
    }, {});
  }

  function routeMulti(goals, steps, profile) {
    const ceiling    = globalCeiling(goals);
    let skills       = { ...profile.skills };
    let completedIds = new Set();
    return goals.flatMap((goal) => {
      const result = routeGoal(steps, profile, goal, skills, completedIds);
      skills       = result.skills;
      completedIds = result.completedIds;
      // Tag steps whose every skill grant is superseded by a higher ceiling entry
      // as milestones — they'll show as mentions in the divider, not numbered steps.
      return result.path.map((step) => {
        const grants = Object.entries(step.grants ?? {});
        const isMilestone = grants.length > 0 && grants.every(([sk, lvl]) =>
          (ceiling[sk] ?? 0) > lvl
        );
        return { ...step, _isMilestone: isMilestone };
      });
    });
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

  function goalDividerHtml(goal) {
    const targets = Object.entries(goal._reqs ?? {})
      .map(([sk, lvl]) => `${sk.charAt(0).toUpperCase() + sk.slice(1)} ${lvl}`)
      .join(" · ");
    const targetsHtml = targets
      ? `<span class="route-goal-targets">${targets}</span>`
      : "";
    return `<li class="route-goal-divider">${goal._goalLabel}${targetsHtml}</li>`;
  }

  function renderSteps(path) {
    const stepsEl = els.steps();
    const emptyEl = els.empty();
    if (!path.length) {
      emptyEl.hidden = false;
      stepsEl.hidden = true;
      emptyEl.textContent = "No route found for these inputs. Try adjusting your goals or stats.";
      return;
    }
    emptyEl.hidden = true;
    stepsEl.hidden = false;

    let stepNum   = 0;
    let lastGoal  = null;
    // Collect milestones per goal label for mention rendering
    const milestonesByGoal = path.reduce((acc, step) => {
      if (step._isMilestone) (acc[step._goalLabel] ??= []).push(step.label);
      return acc;
    }, {});

    stepsEl.innerHTML = path.map((step) => {
      const parts = [];

      if (step._goalLabel !== lastGoal) {
        lastGoal = step._goalLabel;
        parts.push(goalDividerHtml(step));
        const mentions = milestonesByGoal[step._goalLabel];
        if (mentions?.length) {
          parts.push(`<li class="route-milestone-mentions">Along the way: ${mentions.join(", ")}</li>`);
        }
      }

      if (step._isMilestone) return parts.join("");

      stepNum++;
      parts.push(`<li class="route-step">
        <span class="step-num">${stepNum}</span>
        <span class="step-body">
          <span class="step-title">${step.label}</span>
          <span class="step-detail">${step.detail ?? ""}</span>
        </span>
        <span class="step-meta">
          ${locationBadge(step)}
          ${xpBadge(step.xp)}
          ${invBadge(step)}
          ${reqBadge(step.reqs)}
        </span>
      </li>`);
      return parts.join("");
    }).join("");
  }

  function renderPlans() {
    const plans = store.plans();
    const list  = els.planList();
    const none  = els.noPlans();
    if (!plans.length) { list.innerHTML = ""; none.hidden = false; return; }
    none.hidden = true;
    list.innerHTML = plans.map((plan, i) => `
      <li class="route-step">
        <span class="step-num" style="background:var(--gold)">${plan.steps.length}</span>
        <span class="step-body">
          <span class="step-title">${plan.name}</span>
          <span class="step-detail">${plan.goals?.length ?? 1} goal(s) · Style: ${plan.style} · Saved ${plan.date}</span>
          ${plan.notes ? `<span class="plan-notes">${plan.notes}</span>` : ""}
        </span>
        <span class="step-meta">
          <button class="btn btn-ghost" style="font-size:var(--fs-xs);padding:2px var(--sp-q)" data-load="${i}">Load</button>
          <button class="btn btn-ghost" style="font-size:var(--fs-xs);padding:2px var(--sp-q);color:#c00" data-delete="${i}">Delete</button>
        </span>
      </li>
    `).join("");

    list.querySelectorAll("[data-load]").forEach((btn) => {
      btn.addEventListener("click", () => loadPlan(plans[+btn.dataset.load]));
    });
    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => { store.deletePlan(+btn.dataset.delete); renderPlans(); });
    });
  }

  // skill name list captured in closure after init resolves
  let skillNames = [];

  function loadPlan(plan) {
    applyProfile({ skills: plan.skills, style: plan.style }, skillNames);
    if (plan.goals) {
      goalQueue = plan.goals;
      store.saveGoals(goalQueue);
      renderGoalQueue();
    }
    if (els.planName())  els.planName().value  = plan.name;
    if (els.planNotes()) els.planNotes().value = plan.notes ?? "";
    renderSteps(plan.steps);
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
      renderSteps(path);
      window._routerLastPath = { path, profile, goals: goalQueue };
    });

    els.resetBtn()?.addEventListener("click", () => {
      skillNames.forEach((sk) => { const el = els.skillInput(sk); if (el) el.value = 1; });
      if (els.style()) els.style().value = "balanced";
      goalQueue = [];
      store.saveGoals(goalQueue);
      renderGoalQueue();
      els.empty().hidden = false;
      els.empty().textContent = "Add goals to your queue and click Calculate Route.";
      els.steps().hidden = true;
      localStorage.removeItem(STORE_PROFILE);
      if (els.saveStatus()) els.saveStatus().hidden = true;
    });

    els.saveBtn()?.addEventListener("click", () => {
      const last = window._routerLastPath;
      if (!last?.path?.length) return;
      const name  = els.planName()?.value.trim() || `Plan ${store.plans().length + 1}`;
      const notes = els.planNotes()?.value.trim() ?? "";
      store.savePlan({
        name,
        notes,
        goals:  last.goals,
        style:  last.profile.style,
        skills: last.profile.skills,
        steps:  last.path,
        date:   new Date().toLocaleDateString(),
      });
      if (els.planName())  els.planName().value  = "";
      if (els.planNotes()) els.planNotes().value = "";
      renderPlans();
    });

    renderPlans();
  }

  init();
})();
