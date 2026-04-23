# OSRS Wiki — Feature Backlog

Tracking file for unimplemented requests. Each item has a semantic label in `[brackets]` for cross-referencing from todos and memory.

---

## Design: What the planner should be

The progression router is a **mutable plan editor**, not a one-shot generator. The user builds a plan by picking goals, the system proposes a valid ordered step sequence, and the user refines it — editing, inserting, removing, annotating. Nothing is immutable after generation.

### Mental model

```
Step bank (data source)          Plan editor (mutable canvas)
─────────────────────────        ───────────────────────────
steps.jsonl (preset steps)  →    Ordered list of steps,
goals.jsonl (preset goals)       each with a note field.
+ user-created custom steps      User can:
                                   • reorder steps (drag)
                                   • remove any step
                                   • insert from bank or freeform
                                   • edit label/detail/note on any step
                                 Auto-consolidation:
                                   • system re-runs route whenever
                                     goal queue changes
                                   • inserts/removals respected as
                                     pinned/manual overrides
```

### What "steps" are

Every node in the plan is a step. Goals, training milestones, custom inserts — all the same type. Schema:

```json
{
  "id":       "unique-string",
  "label":    "Human label",
  "detail":   "Optional longer description",
  "reqs":     {"skill": level},
  "grants":   {"skill": level},
  "xp":       {"skill": xp},
  "tags":     ["quest","combat","..."],
  "location": {"region": "...", "quest_gate": null},
  "_custom":  true          // present only on user-created steps
}
```

The distinction between "goal" (an objective for the router) and "step" (a unit of work) is purely semantic — goals are steps with a `terminal` field that the router targets. In the rendered plan all steps are numbered uniformly.

---

## [router:live-recompute] Live recompute on goal queue change

**What exists:** Route only updates when user explicitly clicks "Calculate Route". Adding/removing goals from the queue after a route is displayed does nothing to the route.

**What it should do:** Any mutation to the goal queue (add, remove, reorder) triggers an immediate recompute and re-render of the route, preserving step notes and any manually-pinned custom steps. The "Calculate Route" button becomes an explicit re-run fallback, not the only trigger.

**Status:** TODO

---

## [router:goal-edit] Inline edit of goal queue entries

**What exists:** Goals can be added and removed from the queue, and dragged to reorder. They cannot be edited after being added.

**What it should do:** Each goal card has an edit affordance (click label or pencil icon) that opens an inline form to modify label, skill requirements, and terminal step ID. Committing updates the goal in `goalQueue` and triggers recompute.

**Status:** TODO

---

## [router:uniform-steps] Uniform step numbering — no divider/milestone split

**What exists:** Steps are split into two visual tiers: numbered "real" steps and un-numbered "milestone" steps that appear only as mentions in a goal divider row. Goal dividers break the numbered sequence. Custom-inserted steps get a different accent color. The step numbering is not contiguous — it skips milestones.

**What it should do:** Every step in the plan is a numbered row. No invisible milestones. No goal-section dividers as separate list items (goal label can be a subtle inline badge on the first step of each goal group if desired, but the numbering is continuous). Custom steps look the same as preset steps. Step number = position in the ordered list, always contiguous.

**Status:** TODO

---

## [router:step-remove] Remove any step with optional recompute

**What exists:** No way to remove an individual step from the rendered route. The only way to change the route is to modify the goal queue and recalculate.

**What it should do:** Every rendered step has a remove (✕) button. Removing a step:
1. Splices it out of `currentPath`.
2. Adds its id to a `pinnedExclusions` set so the router won't re-insert it on next recompute.
3. Re-renders immediately.
4. If a subsequent recompute is triggered (goal queue change), the exclusion set is respected — the step stays gone unless explicitly cleared.

**Status:** TODO

---

## [router:step-bank] Step bank panel — browse and add steps

**What exists:** "Add preset goal" adds a goal-level objective. There is no way to browse individual steps and add them directly to the plan.

**What it should do:** A collapsible "Step bank" panel lists all steps from `steps.jsonl` (filterable by label/tag). Each entry has an "Add to plan" button that appends the step to `currentPath` (or inserts at a cursor position) and triggers recompute-consolidation. Custom steps can also be created here instead of only via the inline insert form.

**Status:** TODO

---

## [router:step-edit] Inline edit of any step in the rendered plan

**What exists:** Steps render label + detail as static text with a note textarea below. Label and detail cannot be changed after the route generates.

**What it should do:** Clicking the label or detail of any step activates an inline edit mode (input fields). Committing updates `currentPath` in place. Applies to both preset and custom steps — label is always editable, detail is always editable, reqs/grants editable on custom steps. Does not trigger a full recompute (the user chose to override).

**Status:** TODO

---

## [router:quest-state] Quest completion state checkbox per step

Quest-tagged steps in the route output should render a checkbox. Checking it marks the quest complete, updates `completedQuests` state, and triggers a re-route from that checkpoint forward.

**Status:** TODO — quest state tracking added to router logic but no UI checkpoint yet.

---

## [sprite:page-integration] Wire SpriteAtlas into catalog and item pages

`assets/js/sprite.js` is implemented but not yet included in any page layout or wired into the catalog grid.

**Status:** TODO

---

## [cache:locations] locations.pack — blocked on fresh XTEA keys

Extraction pipeline is in place. Location data remains empty until fresh XTEA keys are available.

**Status:** BLOCKED — resume when fresh keys available.

---

## Completed

- `[profile:skill-grid]` — 3-col compact grid, abbreviated labels with title tooltip, CSS `#rt-skill-grid` ✓ (pending commit)
- `[req:schema]` — extended step `reqs` schema: `{skills, items, equipment, inv_free, constraints}`, backward-compat normalizer in router ✓ (pending commit)
- `[req:data]` — `train-mm-tunnels`, `unlock-barrows`, `unlock-gwd` migrated to structured reqs ✓ (pending commit)
- `[req:constraints]` — `constraints.jsonl`: 20 entries covering equipment, inv_item, inv_free, item_on_item, item_on_object, object_interact, region_order, graph_ref types ✓ (pending commit)
- `[req:router]` — `normalizeReqs`, extended `meetsReqs`, `constraintBadges` renderer (eq/itm/inv/constraint badges) ✓ (pending commit)
- `[router:live-recompute]` — goal queue mutations + stat changes trigger recompute ✓ (`41f3af3`)
- `[router:goal-edit]` — inline goal card editor ✓ (`41f3af3`)
- `[router:uniform-steps]` — contiguous numbering, goal badge inline ✓ (`41f3af3`)
- `[router:step-remove]` — ✕ per step, `pinnedExclusions` set ✓ (`41f3af3`)
- `[router:step-notes]` — per-step note textarea, `osrs-step-notes` localStorage, serialised into plan ✓ (`a0743d0`)
- `[router:step-insert]` — inline insert form between steps, splices into `currentPath` ✓ (`a0743d0`)
- `[router:plan-crud]` — route bar with rename/update/delete for loaded plan ✓ (`a0743d0`)
- `[router:plan-list-edit]` — plan list inline rename ✓ (`a0743d0`)
- `[router:dijkstra]` — Dijkstra min-heap routing ✓ (`94bd463`)
- `[router:quest-gate-logic]` — `completedQuests` set, `quest_gate` gating ✓ (`94bd463`)
- `[router:opportunistic]` — `markOpportunities` region-chaining hints ✓ (`94bd463`)
- `[router:autoload]` — `STORE_ACTIVE` autoload on init ✓ (`94bd463`)
- `[router:plan-actions-grid]` — equal-width Load/Delete via CSS grid ✓ (`94bd463`)
- `[sprite:atlas]` — `sprite.js` module ✓ (`94bd463`)
- `[cache:sprites]` — `items.png` + `items-atlas.json` ✓ (`e442afd`)
- `[cache:maptiles]` — 1,150 region chunks + manifest ✓ (`e442afd`)
- `[cache:items-npcs-objects]` — `.pack` files extracted ✓ (`e442afd`)
