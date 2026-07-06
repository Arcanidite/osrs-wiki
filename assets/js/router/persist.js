// Persistence — plans/tabs/notes/profile stored through the graph
// (localStorage-backed in the browser, in-memory under test).

// Plans store steps as slim refs: preset steps → {id} only; custom/synthetic/
// capstone steps keep all fields. Reconstructed on load via expandSteps().
export function slimSteps(steps) {
  return (steps ?? []).map((s) =>
    (s._custom || s._synthetic || s._capstone) ? s : { id: s.id }
  );
}

export function expandSteps(slim, allSteps) {
  const idx = Object.fromEntries((allSteps ?? []).map((s) => [s.id, s]));
  return (slim ?? []).map((s) =>
    (s._custom || s._synthetic || s._capstone || Object.keys(s).length > 1)
      ? s
      : (idx[s.id] ?? s)
  );
}

export function slimPlan(plan) {
  return { ...plan, steps: slimSteps(plan.steps) };
}

export function createStore(graph) {
  const d = () => graph;
  const planOrder = () => d().node("meta", "plan:order")?.data ?? [];
  const savePlanOrder = (ids) => d().upsert("meta", "plan:order", ids);

  const store = {
    profile:     () => d().node("meta", "profile")?.data ?? {},
    saveProfile: (p) => d().upsert("meta", "profile", p),

    plans: () => planOrder().map(id => d().node("plan", id)?.data).filter(Boolean),
    savePlan: (plan) => {
      const order = planOrder();
      const id = `plan:${Date.now()}`;
      d().upsert("plan", id, slimPlan(plan));
      order.push(id);
      savePlanOrder(order);
      return order.length - 1;
    },
    updatePlan: (i, p) => {
      const id = planOrder()[i];
      if (id) d().upsert("plan", id, slimPlan(p));
    },
    deletePlan: (i) => {
      const order = planOrder();
      const id = order[i];
      if (!id) return;
      d().remove("plan", id);
      order.splice(i, 1);
      savePlanOrder(order);
    },

    goals:     () => d().node("meta", "goals")?.data ?? [],
    saveGoals: (g) => d().upsert("meta", "goals", g),

    active:     () => d().node("meta", "active")?.data ?? null,
    saveActive: (p) => p ? d().upsert("meta", "active", slimPlan(p)) : d().remove("meta", "active"),

    stepNotes:    () => d().node("meta", "step-notes")?.data ?? {},
    saveStepNote: (id, t) => {
      const n = store.stepNotes();
      if (t.trim()) n[id] = t.trim(); else delete n[id];
      d().upsert("meta", "step-notes", n);
    },
    applyNotes: (m) => d().upsert("meta", "step-notes", m ?? {}),
    clearNotes: () => d().remove("meta", "step-notes"),

    customGoals:     () => d().node("meta", "custom-goals")?.data ?? [],
    saveCustomGoals: (g) => d().upsert("meta", "custom-goals", g),

    tags:     () => new Set(d().node("meta", "tags")?.data ?? []),
    saveTags: (s) => d().upsert("meta", "tags", [...s].sort()),

    loadouts: () => Object.fromEntries(
      d().query({ type: "loadout" }).map(n => [n.id, n.data.rows])
    ),
    saveLoadout: (id, rows) => rows?.length
      ? d().upsert("loadout", id, { rows })
      : d().remove("loadout", id),
  };
  return store;
}
