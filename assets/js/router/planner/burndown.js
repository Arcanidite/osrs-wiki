// burndown.js — P1 requisite→gather burndown engine.
//
// Pipeline position: P1 (after load, before bank-split).
// Pass contract: reads goals reqs.items/reqs.quests, steps produces/consumes/kind/
//   timing/supply_chain, supply_chains, coarse_expansions.
// Writes: injectedSteps (_supply/_supply_chain/_bootstrap flags),
//   env.demandSet (supply-critical step ids, S8), sanitizedGoals (S6 tag-bridge).
//
// S6 hard rule: item quantities NEVER enter greedy state.
//   Item math stays internal. Terminal produce step gets grants:{supply-<chain>:true}.
//   Goal reqs.items → reqs.tags:["supply-<chain>"] before greedy sees it.
//
// S7 bootstrap ordering: synthBootstrapGather grants tag:bootstrap-<chain>.
//   Loop-setup steps carry reqs.tags:["bootstrap-<chain>"] so topo_order in
//   enrich.py enforces bootstrap-before-loop structurally, not positionally.
//
// Herblore↔herb-farm cycle (known pattern, S10 §2):
//   Terminal produce step (brew-prayer-potion) needs herblore training.
//   Herblore training consumes guam herbs.
//   Guam comes from a loop step (farm-herb-patch-guam) in the same chain.
//   Resolution: emit one-time bootstrap guam gather before the loop is established.
//   The loop step carries reqs.tags:["bootstrap-<chain>"] so topo enforces order.
//   Cycle logged to stderr and gotchas array (caller may inspect via getGotchas()).

const _gotchas = [];

export function getGotchas() {
  return [..._gotchas];
}

function logGotcha(msg) {
  _gotchas.push(msg);
  process.stderr.write(msg + "\n");
}

// ── Synthesizers ─────────────────────────────────────────────────────────────

// One-time bootstrap gather emitted before the loop step is set up.
// Grants tag:bootstrap-<chainId> so topo can enforce bootstrap-before-loop.
function synthBootstrapGather(itemId, chainId) {
  const tag = `bootstrap-${chainId}`;
  return {
    id: `bootstrap-gather-${itemId}-${chainId}`,
    label: `Gather ${itemId.replace(/_/g, " ")} (bootstrap — one-time)`,
    detail: `One-time low-tier gather before the ${chainId} supply loop is established. ` +
            `Use drops (Hill Giants, slayer tasks) or NPC spawns. ` +
            `No rates known — "??" until measured.`,
    kind: "gather",
    reqs: { skills: {}, tags: [] },
    grants: { [tag]: true },
    tags: ["supply-producer", tag],
    produces: { [itemId]: "??" },
    consumes: {},
    timing: "ahead-of-time",
    supply_chain: chainId,
    _supply: true,
    _supply_chain: chainId,
    _synthetic: true,
    _bootstrap: true,
  };
}

// Placeholder for items with no registered source.
function synthGather(itemId, chainId) {
  return {
    id: `synth-gather-${itemId}`,
    label: `Obtain ${itemId.replace(/_/g, " ")}`,
    detail: `Source not yet catalogued for item: ${itemId}. Verify in-game non-GE source.`,
    kind: "gather",
    reqs: { skills: {}, tags: [] },
    grants: {},
    produces: { [itemId]: "??" },
    consumes: {},
    timing: "ahead-of-time",
    supply_chain: chainId ?? null,
    tags: ["supply-producer"],
    _supply: true,
    _supply_chain: chainId ?? null,
    _synthetic: true,
  };
}

// Placeholder for unresolvable coarse nodes.
function synthCoarse(coarseId) {
  return {
    id: `synth-coarse-${coarseId}`,
    label: `${coarseId} (stub — not yet expanded)`,
    detail: "Coarse step not yet expanded to granular steps. Treat as a manual milestone.",
    kind: "coarse",
    reqs: { skills: {}, tags: [] },
    grants: {},
    tags: [],
    _supply: false,
    _synthetic: true,
    _stub: true,
  };
}

// ── Internal resolution helpers ───────────────────────────────────────────────

// Find the chain source step that produces itemId (within a named chain).
function findChainSource(itemId, stepsById, chainId) {
  for (const s of stepsById.values()) {
    if (s.supply_chain === chainId && Object.prototype.hasOwnProperty.call(s.produces ?? {}, itemId)) {
      return s;
    }
  }
  return null;
}

// Dep-first: for a given step, resolve its consumed items before emitting the step.
// visitedItems: Set of item_ids currently being recursively resolved (VISITED cycle guard).
// emitted: Set of step_ids already output (global dedup).
// goalId: OPPORTUNISTIC_GRANULARITY §2a.1 — the queued goal this resolution serves,
//   stamped onto each injected step's _payoff so P8's backward-propagation sweep can
//   reuse the demand edge burndown already computes instead of it being discarded.
function resolveStepDeps(step, stepsById, chainId, visitedItems, emitted, demandSet, goalId) {
  const out = [];
  for (const consumedItem of Object.keys(step.consumes ?? {})) {
    if (visitedItems.has(consumedItem)) {
      // VISITED cycle detected at item level.
      const bId = `bootstrap-gather-${consumedItem}-${chainId}`;
      if (!emitted.has(bId)) {
        const bootstrap = synthBootstrapGather(consumedItem, chainId);
        bootstrap._payoff = { consumer: step.id, goal: goalId, item: consumedItem };
        logGotcha(
          `[lane2] VISITED cycle-break: item "${consumedItem}" is in-flight while resolving ` +
          `"${step.id}" in chain "${chainId}"; emitting one-time bootstrap gather`
        );
        out.push(bootstrap);
        emitted.add(bId);
        demandSet.add(bId);
      }
      continue;
    }

    const source = findChainSource(consumedItem, stepsById, chainId);
    if (!source || emitted.has(source.id)) continue;

    visitedItems.add(consumedItem);
    const depSteps = resolveStepDeps(source, stepsById, chainId, visitedItems, emitted, demandSet, goalId);
    out.push(...depSteps);
    visitedItems.delete(consumedItem);

    if (!emitted.has(source.id)) {
      out.push({
        ...source, _supply: true, _supply_chain: chainId,
        _payoff: { consumer: step.id, goal: goalId, item: consumedItem },
      });
      emitted.add(source.id);
      demandSet.add(source.id);
    }
  }
  return out;
}

// Fully resolve a supply chain dep-first from its terminal produce step.
// Terminal step gets grants:{supply-<chainId>:true} for the S6 tag-bridge.
// Herblore↔herb-farm cycle emits a bootstrap gather before any loop step.
// goalId: OPPORTUNISTIC_GRANULARITY §2a.1 — see resolveStepDeps' own note.
function resolveChain(chain, stepsById, emitted, demandSet, goalId) {
  const chainId = chain.id;
  const visitedItems = new Set();
  const out = [];

  // Find terminal step (produces chain.output_item).
  const terminalId = chain.steps.find((id) => {
    const s = stepsById.get(id);
    return s && Object.prototype.hasOwnProperty.call(s.produces ?? {}, chain.output_item);
  });

  // ── Herblore↔herb-farm bootstrap cycle detection ──────────────────────────
  // If the terminal step needs herblore training AND any loop step in the chain
  // produces guam_weed, herblore training would normally consume those guam herbs
  // — but the farm loop hasn't been bootstrapped yet. Emit a one-time bootstrap
  // gather before the loop step. The loop step's reqs.tags:["bootstrap-<chain>"]
  // enforces structural ordering in enrich.py topo_order (S7).
  const terminalStep = terminalId ? stepsById.get(terminalId) : null;
  if (terminalStep && ((terminalStep.reqs?.skills?.herblore ?? 0) > 0)) {
    const herbLoopStep = chain.steps
      .map((id) => stepsById.get(id))
      .filter(Boolean)
      .find((s) => s.loop === true && Object.prototype.hasOwnProperty.call(s.produces ?? {}, "guam_weed"));

    if (herbLoopStep) {
      const bootstrapId = `bootstrap-gather-guam_weed-${chainId}`;
      if (!emitted.has(bootstrapId)) {
        const bootstrap = synthBootstrapGather("guam_weed", chainId);
        bootstrap._payoff = { consumer: herbLoopStep.id, goal: goalId, item: "guam_weed" };
        out.push(bootstrap);
        emitted.add(bootstrapId);
        demandSet.add(bootstrapId);
        logGotcha(
          `[lane2] herblore-herb-farm cycle: chain "${chainId}", terminal step "${terminalStep.id}" ` +
          `needs herblore training that consumes guam; loop step "${herbLoopStep.id}" produces guam; ` +
          `emitting one-time bootstrap guam gather before loop setup ` +
          `(loop step has reqs.tags:["bootstrap-${chainId}"] → topo enforces order)`
        );
      }
    }
  }

  // ── Dep-first traversal from the terminal step ────────────────────────────
  const processedIds = new Set();

  function processStep(stepId) {
    const step = stepsById.get(stepId);
    if (!step || processedIds.has(stepId)) return;
    processedIds.add(stepId);

    // Resolve all dependencies of this step before emitting it
    const deps = resolveStepDeps(step, stepsById, chainId, visitedItems, emitted, demandSet, goalId);
    out.push(...deps);

    if (!emitted.has(stepId)) {
      // Terminal step's output IS the goal's requested item — its consumer is the
      // goal itself (§2a.1); non-terminal chain steps have no single-item consumer
      // known at this point, so they stay unstamped (additive/optional field).
      const payoff = stepId === terminalId
        ? { consumer: goalId, goal: goalId, item: chain.output_item }
        : null;
      out.push({ ...step, _supply: true, _supply_chain: chainId, ...(payoff ? { _payoff: payoff } : {}) });
      emitted.add(stepId);
      demandSet.add(stepId);
    }
  }

  // Start from terminal (dep-first guarantees inputs precede outputs)
  if (terminalId) processStep(terminalId);

  // Remaining chain steps not reachable from terminal (e.g. standalone loop steps)
  for (const stepId of chain.steps) {
    if (!processedIds.has(stepId)) processStep(stepId);
  }

  // ── Tag-bridge: grant supply-<chain> on the terminal produce step ─────────
  if (terminalId) {
    const idx = out.findIndex((s) => s.id === terminalId);
    if (idx >= 0) {
      const tagId = `supply-${chainId}`;
      const s = out[idx];
      out[idx] = {
        ...s,
        tags: [...(s.tags ?? []), tagId],
        grants: { ...(s.grants ?? {}), [tagId]: true },
      };
    }
  }

  return out;
}

// Resolve quest step and its prereq quests dep-first.
function resolveQuest(questId, stepsById, emitted, demandSet) {
  const step = stepsById.get(questId);
  if (!step) return [synthCoarse(questId)];
  if (emitted.has(step.id)) return [];

  const out = [];

  for (const prereqId of (step.reqs?.quests ?? [])) {
    // resolveQuest deduplicates internally via emitted; push results directly.
    out.push(...resolveQuest(prereqId, stepsById, emitted, demandSet));
  }

  if (!emitted.has(step.id)) {
    out.push(step);
    emitted.add(step.id);
    demandSet.add(step.id);
  }

  return out;
}

// Unwind a coarse expansion to its granular steps (stub-safe).
export function unwindCoarse(coarseId, coarseExpansions, stepsById, emitted, demandSet) {
  const expansion = (coarseExpansions ?? []).find((e) => e.coarse_id === coarseId);
  if (!expansion || expansion.status === "stub") {
    return [synthCoarse(coarseId)];
  }

  const out = [];
  for (const stepId of expansion.steps ?? []) {
    const step = stepsById.get(stepId);
    if (!step) {
      out.push(synthCoarse(stepId));
    } else if (!emitted.has(stepId)) {
      out.push(step);
      emitted.add(stepId);
      demandSet.add(stepId);
    }
  }
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

// P1 burndownResolve — called by routeMulti before bank-split.
//
// For each goal with reqs.items or reqs.quests:
//   - finds matching supply chains for each item
//   - resolves supply+bootstrap steps dep-first
//   - grants tag:supply-<chain> on terminal produce step
//   - rewrites goal reqs.items → reqs.tags:["supply-<chain>"] (S6)
//   - adds quest-req step ids to demandSet (S8)
//   - goals without item/quest reqs pass through unchanged (regression safety)
//
// Returns { injectedSteps, sanitizedGoals, demandSet }
export function burndownResolve(goals, steps, supplyChains, coarseExpansions) {
  const stepsById = new Map(steps.map((s) => [s.id, s]));
  const chainByOutputItem = new Map((supplyChains ?? []).map((c) => [c.output_item, c]));

  const injected = [];          // ordered supply/bootstrap steps
  const emitted = new Set();    // step ids (global dedup)
  const demandSet = new Set();  // S8: supply-critical step ids
  const sanitizedGoals = [];

  for (const goal of goals) {
    const reqs = goal.reqs ?? {};
    const itemReqs = reqs.items ?? {};
    const questReqs = reqs.quests ?? [];

    const hasItemReqs = Object.keys(itemReqs).length > 0;
    const hasQuestReqs = questReqs.length > 0;

    // No item/quest reqs → pass through unchanged (regression guard).
    if (!hasItemReqs && !hasQuestReqs) {
      sanitizedGoals.push(goal);
      continue;
    }

    const earnedTags = [];

    // Supply chain skill reqs collected here; merged into sanitized goal so
    // routeGoal knows to train those skills (enabling meetsReqs for supply steps).
    const supplySkillReqs = {};

    // ── Resolve each item requirement via its supply chain ──────────────────
    for (const [itemId] of Object.entries(itemReqs)) {
      const chain = chainByOutputItem.get(itemId);
      if (!chain) {
        // No registered chain — emit a synthetic placeholder gather. Consumer is
        // the goal itself (§2a.1): no chain step stands between this item and
        // the goal's own reqs.items entry.
        const synth = synthGather(itemId, null);
        synth._payoff = { consumer: goal.id, goal: goal.id, item: itemId };
        if (!emitted.has(synth.id)) {
          injected.push(synth);
          emitted.add(synth.id);
          demandSet.add(synth.id);
        }
        continue;
      }

      // Chain prereq quests must resolve before any chain step.
      // resolveQuest deduplicates internally via emitted; push results directly.
      for (const preqQuestId of (chain.prereq_quests ?? [])) {
        const qSteps = resolveQuest(preqQuestId, stepsById, emitted, demandSet);
        injected.push(...qSteps);
        // Collect skill reqs from quest prereq steps too.
        for (const s of qSteps) {
          for (const [sk, lvl] of Object.entries(s.reqs?.skills ?? {})) {
            supplySkillReqs[sk] = Math.max(supplySkillReqs[sk] ?? 0, lvl);
          }
        }
      }

      // Dep-first chain step resolution.
      // resolveChain deduplicates internally via emitted; push results directly.
      const chainSteps = resolveChain(chain, stepsById, emitted, demandSet, goal.id);
      injected.push(...chainSteps);

      // Collect the highest skill level required by any step in this chain.
      // This is merged into the sanitized goal's reqs.skills so routeGoal knows
      // to train herblore 52 / farming 32 / etc. before supply steps are attempted.
      for (const s of chainSteps) {
        for (const [sk, lvl] of Object.entries(s.reqs?.skills ?? {})) {
          supplySkillReqs[sk] = Math.max(supplySkillReqs[sk] ?? 0, lvl);
        }
      }

      earnedTags.push(`supply-${chain.id}`);
    }

    // ── Resolve quest requirements → demandSet (greedy handles via quest_gate) ──
    for (const questId of questReqs) {
      const qSteps = resolveQuest(questId, stepsById, emitted, demandSet);
      // Quest steps feed demandSet only; do NOT inject them as supply steps
      // since greedy will pick them up naturally via quest_gate linkage.
      for (const s of qSteps) demandSet.add(s.id);
    }

    // ── S6 tag-bridge: rewrite reqs.items → reqs.tags ───────────────────────
    // Merge supply chain skill reqs into the goal's skill reqs (take max per skill)
    // so routeGoal trains the required levels and supply steps can pass meetsReqs.
    const { items: _i, quests: _q, ...restReqs } = reqs;
    const mergedSkills = { ...restReqs.skills };
    for (const [sk, lvl] of Object.entries(supplySkillReqs)) {
      mergedSkills[sk] = Math.max(mergedSkills[sk] ?? 0, lvl);
    }
    sanitizedGoals.push({
      ...goal,
      reqs: {
        ...restReqs,
        skills: mergedSkills,
        tags: [...(restReqs.tags ?? []), ...earnedTags],
      },
    });
  }

  return { injectedSteps: injected, sanitizedGoals, demandSet };
}
