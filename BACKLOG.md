# OSRS Wiki — Feature Backlog

Tracking file for unimplemented requests. Each item has a semantic label in `[brackets]` for cross-referencing from todos and memory.

---

## [router:region-tagbox] Region exclude as tag combobox

**Status:** DONE ✓ — `.region-tagbox` combobox with tag chips; `excludedRegions[]` state; persisted in profile + plan

---

## [router:step-bank-as-queue] Step bank is the goal queue source; no separate bank in route panel

**Status:** DONE ✓ — bank moved to left panel, lists allGoals + allSteps; "Add" pushes to goalQueue; bank removed from route output section

---

## [router:no-drag] Goal queue non-draggable

**Status:** DONE ✓ — drag handle, `wireDrag`, and drag CSS removed

---

## [router:constraint-validation] Constraint workflow validation as hard gates

**Status:** DONE ✓ — `meetsReqs` enforces `region_order.before_step`, `inv_free` constraint slots; `routeGoal` tracks `freeSlots` across steps

---

## [sprite:asset-cache] Atlas + pack cached in sessionStorage; CSS string cached in-memory Map

**Status:** DONE ✓

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

**Status:** DONE ✓ (appends to end; cursor-position insert is a future enhancement)

---

## [router:step-edit] Inline edit of any step in the rendered plan

**What exists:** Steps render label + detail as static text with a note textarea below. Label and detail cannot be changed after the route generates.

**What it should do:** Clicking the label or detail of any step activates an inline edit mode (input fields). Committing updates `currentPath` in place. Applies to both preset and custom steps — label is always editable, detail is always editable, reqs/grants editable on custom steps. Does not trigger a full recompute (the user chose to override).

**Status:** DONE ✓ — dblclick edits label/detail on all steps; ✎ button on custom steps opens reqs/grants editor

---

## [router:quest-state] Quest completion state checkbox per step

Quest-tagged steps in the route output should render a checkbox. Checking it marks the quest complete, updates `completedQuests` state, and triggers a re-route from that checkpoint forward.

**Status:** DONE ✓

---

## [sprite:page-integration] Wire SpriteAtlas into catalog and item pages

`assets/js/sprite.js` is implemented but not yet included in any page layout or wired into the catalog grid.

**Status:** DONE ✓ — sprite.js loaded in node/tool layouts; catalog.js hydrates `.sri-sprite[data-item-id]` placeholders after SpriteAtlas.load(); item entries in catalog.json carry `item_id` field

---

## [cache:locations] locations.pack — blocked on fresh XTEA keys

Extraction pipeline is in place. Location data remains empty until fresh XTEA keys are available.

**Status:** BLOCKED — resume when fresh keys available.

---

## [router:plan-filter] Route plan step filter + tab pane navigation

Filter bar above the route output to show/hide steps by state: all, completed, incomplete, focal (user-starred). Tab pane wraps the route panel so multiple plans can be open simultaneously as named tabs — switching tabs swaps the active `currentPath` + goal queue context without navigating away. Each tab is independently editable and persists its own state.

**Status:** DONE ✓ — `planTabs[]` + `activeTabIdx`; `saveToTab`/`loadFromTab` swap full plan state on tab click; `renderTabBar` injects `.rt-tab-btn` elements; dblclick renames tab; `＋` adds new tab; filter bar with All/Incomplete/Complete/Focal buttons; `★` focal star per step; `applyStepFilter` hides rows by CSS class/data attr

---

## [router:step-form-reqs-ui] Req/grant editor — labeled containers with skill sprite icons

In the unified step creation form (`buildStepForm`), reqs and grants each live in their own labeled container (e.g. "Requirements" / "Grants") rather than sharing a row. Each container uses a flex-row wrapping layout. Skill selects are replaced with sprite-icon pills: skill icon (from the item sprite atlas or a dedicated skills spritesheet) + level input + remove button. Visual distinction between req (red-tinted) and grant (green-tinted) pill groups makes the form self-documenting at a glance.

**Status:** DONE ✓ — `makeSkillPill(sk,lvl,tint)` + `readSkillPills(el)` shared by `buildStepForm` and `wireStepEditBtn`; labeled req (red) / grant (green) `.ins-skill-section` containers; letter-badge icon (no spritesheet dependency); same pill UI in inline insert and custom step editor

---

## [router:dep-guard] Dependency order enforcement — block invalid reorders and deletes

When the user attempts to drag-reorder a step to a position where its `reqs` would be unmet (or where a downstream step's reqs would be broken), the system rejects the drop and shows a toast — no silent invalid state. Same guard applies to step removal: if a step is a prerequisite for a later step still in the plan, the remove is blocked with a toast naming the dependent step(s). No action that creates an unresolvable dependency chain is permitted.

**Status:** DONE ✓ — `seqInvalids(trial)` pre-validates reorder/remove; toast on block; currentPath only mutated on valid trial

---

## [router:req-highlight] Req badge hover highlights + focus-scroll to prerequisite step

Hovering a `req` badge on a step highlights the step(s) in the route that satisfy that requirement (CSS `[data-grants-skill]` attribute selector driven — no JS event listeners needed for the highlight itself). Clicking the badge smooth-scrolls to the earliest satisfying step and briefly pulses it. Inset box-shadow used for the highlight to avoid layout shift.

**Implementation note:** steps emit `data-grants-skill="attack strength …"` attributes; req badges emit `data-req-skill="attack"`. CSS `:has()` + attribute selector drives the highlight purely in CSS. JS only for the scroll-to behavior on click.

**Status:** DONE ✓ — `data-grants-skill` on `<li>`, `data-req-skill` on req badge; CSS `:has()` per-skill highlight rules; `wireReqScroll` handles click scroll + `req-pulse` animation

---

## [router:step-complete-toggle] Per-step completion toggle — ergonomic placement under step number

Every step (not just quests) gets a completion toggle. Visually: a transient check/cross icon directly below the step number circle, shown on hover or when checked — rendered as an SVG or HTML entity, toggled via CSS `:checked` state on a visually-hidden checkbox. Removes the separate inline `Mark complete` label. Checked state applies `step-done` class (line-through, muted) without triggering a recompute.

**Status:** DONE ✓ — `.step-num-wrap` label wraps hidden `.step-done-cb` + `.step-done-icon` (✓); CSS `:has(:checked)` shows icon; `step-done` class on `<li>` strikes title; quest steps still trigger recompute via `manualQuestDone`

---

## [router:git-versioning] LocalStorage plan versioning — git-object model with diffing

Auto-save every plan mutation to localStorage using a git-inspired object store: content-addressed blobs (SHA-1 or xxHash of serialised state), commit objects (blob pointer + parent hash + timestamp), HEAD ref per plan. Enables undo/redo, diff between versions, and branch-style plan variants without re-implementing persistence logic in plain JS. Evaluate a WASM-compiled libgit2 or isomorphic-git running entirely in the browser as the storage backend — no server required. Validate locally (Node REPL or browser devtools) before wiring into the router UI.

**Status:** TODO

---

## [router:insert-prereq-inject] Auto-inject synthetic prereq steps on custom insert

**What exists:** When a custom step is inserted with `reqs.skills` entries, the seq-dot may go red if the cumulative skill state at that position doesn't satisfy the req. No remediation happens automatically.

**What it should do:** On commit of a custom insert, simulate cumulative skill state at `afterIdx`. For each req skill not yet satisfied at that position, auto-insert a synthetic prereq step immediately before the inserted step — `{ id: "custom-prereq-${skill}-${ts}", label: "Train ${skill} to ${level}", grants: { [skill]: level }, _custom: true }`. Each synthetic step is also pushed to `pinnedInserts` with the same anchor chain so recomputes respect it. The user can edit or remove synthetic steps like any other custom step. No manual intervention needed to fix seq-dot red.

**Status:** TODO

---

## [ui:step-num-wrap-gap] `.step-num-wrap` gap + done-icon states

**Status:** DONE ✓ — `gap: 0.5rem`, `font-size: 1rem`, `data-state` driven ○/◐/✓ icon (`2b4132c`)

---

## [layout:sidebar-isolation] Sidebar panels as isolated collapsible containers

**Status:** DONE ✓ — each panel is `<section class="sidebar-panel">` with `.sidebar-panel-hd` collapse toggle; burger collapses full sidebar via `.sidebar-collapsed` class

---

## [layout:rt-plans-own-container] Saved plans panel above the tool panel, not in the main flow

**Status:** DONE ✓ — `#sp-plans` in sidebar above main; save-plan form removed

---

## [router:auto-save-plan] Plans auto-saved on mutation; no explicit save step

**Status:** DONE ✓ — `upsertActivePlan()` called from `recompute()` on non-empty path; no save button (`7ecb921`)

---

## [router:plan-list-redesign] Plan list: steps-done metric, View/Remove actions

**Status:** DONE ✓ — step count bubble, View/Remove buttons, tab-reuse on View (`20f3c0b`)

---

## [router:sticky-plan-bar] Sticky bar across top of plan step container per tab

**Status:** DONE ✓ — `renderRouteBar` simplified to sticky name input + step count; Update/Delete removed (`ea20aee`)

---

## [router:filter-hidden-css] Step filter visibility driven by CSS `[hidden]` attribute

**Status:** DONE ✓ — `.route-step[hidden] { display: none; }` rule present; `applyStepFilter` sets `li.hidden`

---

## [router:tab-drag-sort] Tabs sortable via drag

**Status:** DONE ✓ — `draggable=true` on tab buttons; drop reorders `planTabs[]`, identity-tracks `activeTabIdx` (`fe2a3f4`)

---

## [router:tag-grants] Tag-based grants and reqs on steps

**Status:** DONE ✓ — `applyGrants` accumulates `true`-valued entries into `_tags`; `meetsReqs` validates `r.tags` against `_tags`; `+ tag` pill button in step form (`47106ef`)

---

## [router:goal-queue-in-tab] Goal queue as tab-scoped section, not sidebar

**Status:** DONE ✓ — `#rt-goal-queue-wrap` in main `#router-output`; sidebar has Stats + Step Bank + Plans only

---

## [router:tabname-plan-bound] Tab names bound to plan names

**Status:** DONE ✓ — `loadFromTab` syncs name from plan; dblclick rename writes back to plan; `loadPlan` updates tab name (`ec1cc01`)

---

## [router:view-opens-new-tab] View plan always opens in a new tab, not the current one

**Status:** DONE ✓ — `else` branch now pushes `makeTab` + sets `activeTabIdx` before `loadPlan` (`a138bbb`)

---

## [router:rename-syncs-tab] Renaming a plan syncs tab label immediately

**Status:** DONE ✓ — inline rename `commit` finds tab by `activePlanIdx`, updates `planTabs[n].name`, calls `renderTabBar()` (`a138bbb`)

---

## [router:seq-dot-as-border] Replace seq-dot with green border on step-num circle

The `.step-seq-dot` valid/invalid indicator should be replaced with a colored border on the step-num circle itself: green border when valid, red border (or no border) when invalid. Remove the separate dot element from the step HTML and CSS.

**Status:** TODO

---

## [router:complete-implies-prereqs] Checking a step complete marks upstream prereqs complete too

When the user checks a step as complete, any earlier steps in the route whose `grants` satisfy this step's `reqs` should also be considered complete (visually `step-done`) without requiring the user to manually check them. If a downstream step is already checked complete, its prereqs are implicitly satisfied for display purposes — no recompute triggered, purely visual propagation.

**Status:** TODO

---

## [router:filter-hides-insert-rows] Hide insert rows adjacent to filtered-out steps

When a filter is active, `.route-insert-row` elements adjacent to hidden `.route-step` entries are still visible. The fix: hide insert rows entirely during any active filter (show only when filter is `all`). The insert affordance only makes sense in the unfiltered view — filtering is for reading, not editing.

**Status:** TODO

---

## Completed

- `[router:step-grid-layout]` — `.route-step` grid `2rem 1fr auto auto`; `step-actions` 4th column for remove/edit buttons ✓ (pending commit)
- `[router:quest-done-style]` — green inset left-border shadow + green step-num on quest-done ✓ (pending commit)
- `[router:full-skill-coverage]` — `SKILL_ORDER` canonical 23-skill list; `deriveSkills()` always returns full set; 138 steps across all skills with milestone sub-steps; 27 goals in goals.jsonl ✓ (pending commit)
- `[profile:skill-grid]` — 3-col compact grid, abbreviated labels with title tooltip, CSS `#rt-skill-grid` ✓ (pending commit)
- `[req:schema]` — extended step `reqs` schema: `{skills, items, equipment, inv_free, constraints}`, backward-compat normalizer in router ✓ (pending commit)
- `[req:data]` — `train-mm-tunnels`, `unlock-barrows`, `unlock-gwd` migrated to structured reqs ✓ (pending commit)
- `[req:constraints]` — `constraints.jsonl`: 20 entries covering equipment, inv_item, inv_free, item_on_item, item_on_object, object_interact, region_order, graph_ref types ✓ (pending commit)
- `[req:router]` — `normalizeReqs`, extended `meetsReqs`, `constraintBadges` renderer (eq/itm/inv/constraint badges) ✓ (pending commit)
- `[router:quest-state]` — quest checkbox per step, `manualQuestDone` Set seeds router, recompute on check ✓ (pending commit)
- `[router:step-bank]` — collapsible panel, filter by label/tag, Add appends to plan ✓ (pending commit)
- `[router:step-edit]` — dblclick label/detail all steps; ✎ opens reqs/grants form on custom steps ✓ (pending commit)
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
- `[sprite:asset-cache]` — sessionStorage atlas+pack; in-memory CSS Map in SpriteAtlas.css() ✓ (pending commit)
- `[router:region-tagbox]` — region exclude tagbox combobox ✓ (pending commit)
- `[router:step-bank-as-queue]` — bank in left panel, adds to goalQueue ✓ (pending commit)
- `[router:no-drag]` — goal queue drag removed ✓ (pending commit)
- `[router:constraint-validation]` — region_order + inv_free as hard router gates ✓ (pending commit)
- `[sprite:page-integration]` — sprite.js in node/tool layouts; catalog.js hydrates item sprites via SpriteAtlas; `item_id` on catalog item entries ✓ (pending commit)
- `[sprite:atlas]` — `sprite.js` module ✓ (`94bd463`)
- `[cache:sprites]` — `items.png` + `items-atlas.json` ✓ (`e442afd`)
- `[cache:maptiles]` — 1,150 region chunks + manifest ✓ (`e442afd`)
- `[cache:items-npcs-objects]` — `.pack` files extracted ✓ (`e442afd`)
