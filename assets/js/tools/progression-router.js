(function () {
  const BASE = document.querySelector("[data-baseurl]")?.dataset.baseurl ?? "";
  const STEPS_URL = BASE + "/assets/data/tools/steps.jsonl";
  const STORE_PROFILE = "osrs-router-profile";
  const STORE_PLANS   = "osrs-router-plans";

  // ── Goal definitions ──────────────────────────────────────────────────────
  // Each goal declares the terminal reqs the router must satisfy.
  const GOALS = {
    "quest-dt":  { reqs: { magic: 50, thieving: 53, slayer: 10, firemaking: 50 }, terminal: "quest-dt" },
    "quest-mm":  { reqs: { attack: 43, defence: 43 }, terminal: "quest-mm" },
    "barrows":   { reqs: { attack: 60, strength: 60, defence: 60, prayer: 43 }, terminal: "unlock-barrows" },
    "gwd":       { reqs: { strength: 60, prayer: 43 }, terminal: "unlock-gwd" },
    "raids-cox": { reqs: { attack: 75, strength: 75, defence: 75, ranged: 75, magic: 75, prayer: 74 }, terminal: "unlock-cox" },
  };

  // ── Persistence ───────────────────────────────────────────────────────────
  const store = {
    profile: () => JSON.parse(localStorage.getItem(STORE_PROFILE) ?? "{}"),
    saveProfile: (p) => localStorage.setItem(STORE_PROFILE, JSON.stringify(p)),
    plans: () => JSON.parse(localStorage.getItem(STORE_PLANS) ?? "[]"),
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
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const els = {
    inputs:     () => document.querySelectorAll("#router-inputs input, #router-inputs select"),
    skillInput: (sk) => document.getElementById(`rt-${sk}`),
    goal:       () => document.getElementById("rt-goal"),
    style:      () => document.getElementById("rt-style"),
    calcBtn:    () => document.getElementById("rt-calculate"),
    resetBtn:   () => document.getElementById("rt-reset"),
    empty:      () => document.getElementById("rt-empty"),
    steps:      () => document.getElementById("rt-steps"),
    saveStatus: () => document.getElementById("rt-save-status"),
    planName:   () => document.getElementById("rt-plan-name"),
    saveBtn:    () => document.getElementById("rt-save-plan"),
    planList:   () => document.getElementById("rt-plan-list"),
    noPlans:    () => document.getElementById("rt-no-plans"),
  };

  const SKILLS = ["attack","strength","defence","ranged","magic","prayer"];

  // ── Profile read/write ────────────────────────────────────────────────────
  function readExcludedRegions() {
    return Array.from(
      document.querySelectorAll("#rt-region-excludes input:checked")
    ).map((el) => el.value);
  }

  function readProfile() {
    return {
      skills: SKILLS.reduce((acc, sk) => {
        acc[sk] = parseInt(els.skillInput(sk)?.value ?? 1, 10) || 1;
        return acc;
      }, {}),
      goal:            els.goal()?.value  ?? "",
      style:           els.style()?.value ?? "balanced",
      excludeRegions:  readExcludedRegions(),
    };
  }

  function applyProfile(p) {
    SKILLS.forEach((sk) => {
      const el = els.skillInput(sk);
      if (el && p.skills?.[sk]) el.value = p.skills[sk];
    });
    if (p.goal  && els.goal())  els.goal().value  = p.goal;
    if (p.style && els.style()) els.style().value = p.style;
    if (p.excludeRegions?.length) {
      document.querySelectorAll("#rt-region-excludes input").forEach((el) => {
        el.checked = p.excludeRegions.includes(el.value);
      });
    }
  }

  // ── Graph / Dijkstra ──────────────────────────────────────────────────────
  function meetsReqs(reqs, skills) {
    return Object.entries(reqs).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl);
  }

  function applyGrants(grants, skills) {
    const next = { ...skills };
    Object.entries(grants).forEach(([sk, lvl]) => { if (lvl > (next[sk] ?? 1)) next[sk] = lvl; });
    return next;
  }

  function costFor(step, style) {
    const xpSum = Object.values(step.xp ?? {}).reduce((a, b) => a + b, 0);
    if (style === "efficient") return xpSum > 0 ? 1 / xpSum : 100;
    if (style === "afk") return step.inv_used ?? 1;
    if (style === "gp") return (step.tags ?? []).includes("money") ? 0.5 : 1;
    return 1;
  }

  // Returns true if this step's location is accessible given completed path
  // and excluded regions.
  function locationAccessible(step, completedIds, excludedRegions) {
    const loc = step.location;
    if (!loc) return true;

    const region = loc.region ?? "global";
    if (region !== "global" && excludedRegions.includes("region-" + region)) return false;

    // quest_gate: step requires a quest to be completed first
    if (loc.quest_gate && !completedIds.has(loc.quest_gate)) return false;

    return true;
  }

  function route(steps, profile, goalDef) {
    const target = goalDef.reqs;
    const terminal = goalDef.terminal;
    const excluded = profile.excludeRegions ?? [];

    const skills = { ...profile.skills };
    const path = [];
    const completedIds = new Set();
    const remaining = new Set(steps.map((s) => s.id));

    let changed = true;
    while (changed) {
      changed = false;
      const allReqsMet = Object.entries(target).every(([sk, lvl]) => (skills[sk] ?? 1) >= lvl);
      const terminalDone = completedIds.has(terminal);
      if (allReqsMet && terminalDone) break;

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
      path.push(best);
      remaining.delete(best.id);
      completedIds.add(best.id);
      Object.assign(skills, applyGrants(best.grants, skills));
      changed = true;
    }

    return path;
  }

  function isUseful(step, skills, target, terminal, completedIds) {
    if (step.id === terminal) return true;
    // unlock steps that gate later useful steps (quest gates)
    if ((step.tags ?? []).includes("unlock") || (step.tags ?? []).includes("quest")) return true;
    return Object.entries(step.grants ?? {}).some(([sk, lvl]) =>
      (target[sk] ?? 0) > 0 && lvl > (skills[sk] ?? 1) && lvl <= (target[sk] ?? 0)
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function xpBadge(xp) {
    const total = Object.values(xp ?? {}).reduce((a, b) => a + b, 0);
    if (!total) return "";
    return `<span class="step-badge xp">+${total.toLocaleString()} xp</span>`;
  }

  function invBadge(step) {
    if (!step.inv_used) return "";
    return `<span class="step-badge inv">${step.inv_used} inv slots</span>`;
  }

  function reqBadge(reqs) {
    const parts = Object.entries(reqs ?? {}).map(([sk, lvl]) => `${sk} ${lvl}`);
    if (!parts.length) return "";
    return `<span class="step-badge req">Req: ${parts.join(", ")}</span>`;
  }

  function locationBadge(step) {
    const loc = step.location;
    if (!loc || loc.region === "global" || !loc.region) return "";
    const zone = loc.zone ? ` / ${loc.zone.replace(/-/g, " ")}` : "";
    const label = loc.region.replace(/-/g, " ") + zone;
    const gate = loc.quest_gate ? ` · after ${loc.quest_gate.replace(/-/g, " ")}` : "";
    return `<span class="step-badge loc" title="Location">${label}${gate}</span>`;
  }

  function renderSteps(path) {
    const stepsEl = els.steps();
    const emptyEl = els.empty();
    if (!path.length) {
      emptyEl.hidden = false;
      stepsEl.hidden = true;
      emptyEl.textContent = "No route found for these inputs. Try adjusting your goal or stats.";
      return;
    }
    emptyEl.hidden = true;
    stepsEl.hidden = false;
    stepsEl.innerHTML = path.map((step, i) => `
      <li class="route-step">
        <span class="step-num">${i + 1}</span>
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
      </li>
    `).join("");
  }

  function renderPlans() {
    const plans = store.plans();
    const list = els.planList();
    const none = els.noPlans();
    if (!plans.length) { list.innerHTML = ""; none.hidden = false; return; }
    none.hidden = true;
    list.innerHTML = plans.map((plan, i) => `
      <li class="route-step">
        <span class="step-num" style="background: var(--gold)">${plan.steps.length}</span>
        <span class="step-body">
          <span class="step-title">${plan.name}</span>
          <span class="step-detail">Goal: ${plan.goal} · Style: ${plan.style} · Saved ${plan.date}</span>
        </span>
        <span class="step-meta">
          <button class="btn btn-ghost" style="font-size:var(--fs-xs); padding: 2px var(--sp-q)" data-load="${i}">Load</button>
          <button class="btn btn-ghost" style="font-size:var(--fs-xs); padding: 2px var(--sp-q); color:#c00" data-delete="${i}">Delete</button>
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

  function loadPlan(plan) {
    applyProfile({ skills: plan.skills, goal: plan.goal, style: plan.style });
    renderSteps(plan.steps);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    // restore saved profile
    const saved = store.profile();
    if (Object.keys(saved).length) applyProfile(saved);

    // auto-save profile on any input change
    els.inputs().forEach((el) => {
      el.addEventListener("change", () => {
        store.saveProfile(readProfile());
        const status = els.saveStatus();
        if (status) status.hidden = false;
      });
    });

    // load steps data
    let steps = [];
    try {
      const text = await fetch(STEPS_URL).then((r) => r.text());
      steps = text.trim().split("\n").map((l) => JSON.parse(l));
    } catch { return; }

    // calculate
    els.calcBtn()?.addEventListener("click", () => {
      const profile = readProfile();
      const goalDef = GOALS[profile.goal];
      if (!goalDef) {
        els.empty().hidden = false;
        els.empty().textContent = "Please select a goal.";
        els.steps().hidden = true;
        return;
      }
      const path = route(steps, profile, goalDef);
      renderSteps(path);
      window._routerLastPath = { path, profile };
    });

    // reset
    els.resetBtn()?.addEventListener("click", () => {
      SKILLS.forEach((sk) => { const el = els.skillInput(sk); if (el) el.value = 1; });
      els.goal().value  = "";
      els.style().value = "balanced";
      els.empty().hidden = false;
      els.empty().textContent = "Set your stats and goal, then click Calculate Route.";
      els.steps().hidden = true;
      localStorage.removeItem(STORE_PROFILE);
      els.saveStatus().hidden = true;
    });

    // save plan
    els.saveBtn()?.addEventListener("click", () => {
      const last = window._routerLastPath;
      if (!last?.path?.length) return;
      const name = els.planName()?.value.trim() || `Plan ${store.plans().length + 1}`;
      store.savePlan({
        name,
        goal: last.profile.goal,
        style: last.profile.style,
        skills: last.profile.skills,
        steps: last.path,
        date: new Date().toLocaleDateString(),
      });
      if (els.planName()) els.planName().value = "";
      renderPlans();
    });

    renderPlans();
  }

  init();
})();
