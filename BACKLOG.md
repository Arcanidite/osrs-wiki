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

## [router:synthetic-prereqs] Synthetic prerequisite steps when router can't satisfy a goal req

**What exists:** `routeGoal` only selects from `allSteps`. If no step in the bank grants a required skill level or tag, the router silently falls short — the capstone renders with a red seq-dot and no steps bridge the gap. Same issue on custom inserts: inserting a step with an unmet skill req leaves the seq-dot red with no remediation.

**What it should do:**

1. **Post-route gap fill (goals):** After `routeGoal` returns, compare the final skill state against `goal.reqs.skills`. For each skill `sk` where `finalSkills[sk] < required[sk]`, and no step in the returned path already grants enough of `sk`, synthesise a training step: `{ id: "synth-${sk}-${lvl}-${ts}", label: "Train ${skill} to ${lvl}", detail: "Synthetic — no matching step found in bank", grants: { [sk]: lvl }, reqs: { skills: { [sk]: currentLvl } }, _custom: true, _synthetic: true }`. Insert it just before the capstone. For tag reqs not satisfied, synthesise a tag-grant step similarly.

2. **Continuity from existing plan steps:** Before synthesising, check whether an existing step in the current `path` already grants the skill at a lower level. If so, the synthetic step's req should chain from that grant level (not from the profile baseline), and its label should reflect the delta (e.g. "Train Fishing 58→75").

3. **Custom insert gap fill:** On commit of a custom insert (`ins-add` handler), simulate cumulative skill state at `afterIdx` by replaying `applyGrants` across `currentPath.slice(0, afterIdx + 1)`. For each req skill in the inserted step not satisfied at that position, auto-insert a synthetic prereq step immediately before the inserted step. Push it to `pinnedInserts` with anchor chained to the previous step. Same for tag reqs.

4. **Synthetic steps are editable/removable** like any custom step — same ✕ and ✎ affordances. `_synthetic: true` flag is the only distinction.

**Status:** DONE ✓ — `synthFillGaps` covers points 1+2 (maxGranted chain, delta labels); `synthPrereqs` covers point 3 (skillsAtPos replay, pinnedInserts push); `_synthetic` flag present; ✕/✎ affordances via `_custom: true`

---

## [router:capstone-locked] Capstone steps locked — unremovable unless final dep step removed

**What exists:** Capstone steps render with a ✕ remove button like every other step. Removing them silently deletes the goal marker with no guard.

**What it should do:** Capstone steps cannot be individually removed. The ✕ button should be absent or disabled on capstone rows. The only way to remove a capstone is to remove its goal from the goal queue (which already clears it on recompute). The capstone is cosmetically tied to the final step of its dependency chain — it should render immediately after the last non-capstone step with the same `_goalLabel`.

**Status:** DONE ✓ — ✕ button omitted from capstone rows; only ⟳ fill-gap shown when invalid (`f45f727`)

---

## [router:synth-ordering] Synthetic steps generated out of order after goal queue mutations

**What exists:** `synthFillGaps` appends synths before the last element of the goal's sub-path. When a goal is removed and recompute fires, stale synthetic steps from `pinnedInserts` or leftover path state can appear out of sequence (e.g. `40→58` following `58→75` fishing).

**What it should do:** Synthetic steps must be sorted by their `reqs.skills` value ascending before insertion so the dependency chain reads correctly. Additionally, when a goal is removed from the queue, any synthetic steps in `pinnedInserts` whose `_goalLabel` matches the removed goal must be purged alongside its capstone/custom steps.

**Status:** DONE ✓ — `synthFillGaps` sorts by `reqKey` (min skill ascending) before return; `wireCapstoneFill` sorts synths before splice; goal-remove handler purges `pinnedInserts` by `_goalLabel` (`6a35d05`)

---

## [router:insert-prereq-inject] Auto-inject synthetic prereq steps on custom insert

**What exists:** When a custom step is inserted with `reqs.skills` entries, the seq-dot may go red if the cumulative skill state at that position doesn't satisfy the req. No remediation happens automatically.

**What it should do:** Superseded by `[router:synthetic-prereqs]` which covers both goal routing and custom inserts in one pass.

**Status:** SUPERSEDED → see [router:synthetic-prereqs]

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

**Status:** DONE ✓ — `data-valid` attr on `.step-num`; `box-shadow: 0 0 0 2px` green/red; dot span removed (`a62d912`)

---

## [router:complete-implies-prereqs] Checking a step complete marks upstream prereqs complete too

**Status:** DONE ✓ — `markStepDone` helper; checking step N propagates `markStepDone(true)` to all unchecked steps with lower `data-step-idx` (`a62d912`)

---

## [router:filter-hides-insert-rows] Hide insert rows adjacent to filtered-out steps

**Status:** DONE ✓ — `applyStepFilter` sets `r.hidden = isFiltered` on all `.route-insert-row` when filter !== `all` (`a62d912`)

---

## [router:plan-list-done-count] Plan list done count doesn't reflect checked steps

The `X / total` metric in the plan list item is computed from `plan.steps` at save time and never updates as the user checks steps off in the active route. The done count should be derived live from the DOM (count `.route-step.step-done` in `#rt-steps`) when the active plan is rendered, and update after every step toggle.

**Status:** DONE ✓ — `renderPlans()` called from step-done change handler (L1707); reads `.route-step.step-done` live from `#rt-steps` DOM for active plan

---

## [router:insert-ui-matches-goal-queue] Insert step UI matches goal queue card structure

The inline insert form (`buildStepForm`) should use the same card/pill UI as goal queue entries — same layout, same interaction pattern (click to expand, same label+detail fields, same reqs/grants pills). The goal queue CRUD flow is the established pattern; the insert form should not be a divergent UI.

**Status:** DONE ✓ — `buildStepForm` uses `goal-card ins-step-card` + `goal-card-body`/`goal-card-btns`; click-to-expand via `showCard→showForm`; same skill-pill + tag-req-box pattern as `openGoalEditor`

---

## [router:goal-queue-grants-and-tags] Goal queue entries support grants + tag reqs; tag reuse panel

**Status:** DONE ✓ — `openGoalEditor` has grants (skill/tag pills) + tag reqs; `collectGrantedTags()` builds reuse panel from `currentPath`+`goalQueue`; `reqsSummary` shows tags as `[tag]` (`849837c`)

---

## [router:insert-cancel-no-parent] Insert card cancel button throws NoModificationAllowedError

**Status:** DONE ✓ — `onCancel` now creates a fresh `<li>` and calls `form.replaceWith(fresh)` instead of mutating the detached `row.outerHTML` (`168f20f`)

---

## [router:remove-calculate-reset] Remove Calculate Route and Reset buttons

**Status:** DONE ✓ — buttons removed from HTML, `els.calcBtn`/`els.resetBtn` and their handlers removed from JS (`168f20f`)

---

## [router:insert-step-body-title-style] Insert form title/detail inputs styled like step-body elements

**Status:** DONE ✓ — `.ins-label`/`.ins-detail` CSS matches `.step-title`/`.step-detail`; wrapped in `.ins-step-body` flex column (`638838c`)

---

## [router:tag-req-non-skill] Tag req fields support non-skill requisites (quests, items, custom tags)

**Status:** DONE ✓ — `makeTagReqBox` tagbox in all three forms; `knownTags` localStorage pool; `mergeTags` on save; `scoreTag`/`rankTags`/`highlightTag` fuzzy+Jaccard ranking with serial/fuzzy highlight; backspace removes last pill; pills focusable + Delete removes (`a27cb84`, `d25232f`, `4acc02f`)

---

## [router:tag-picker-persistent-source] Tag dropdown sources from persistent localStorage pool, not DOM

**Status:** DONE ✓ — `STORE_TAGS` + `store.tags()`/`store.saveTags()`; `knownTags` Set seeded from all jsonl + saved plans + goals on init; `collectGrantedTags()` returns `[...knownTags].sort()`; no DOM scraping (`a27cb84`)

---

## [router:step-done-persists] Non-quest step done state persists across recomputes

**Status:** DONE ✓ — `manualStepDone` Set mirrors `manualQuestDone`; saved/loaded per tab; restored in `renderSteps`; `propagatePrereqsDone` registers auto-propagated steps (`828476c`)

---

## [router:custom-goals-bank] User-created goals in Step Bank

**Status:** DONE ✓ — `＋ New goal` button; `openCustomGoalForm()` inline form reusing all editor helpers; `customGoals[]` + `STORE_CUSTOM_GOALS`; custom badge + ✕ delete in bank list (`ceff58c`)

---

## [router:item-req-grant-pipeline] Item req/grant fields with atlas icons + tag filter

Req and grant sections in step/goal forms should support items (not just skills/tags). Items have: name, icon (from sprite atlas as data-blob), source attribution tags, description, related items. The item picker uses the same tag-filter approach as tags but ranks by name, source tags, reqs, related items. Items display icon + name in the picker dropdown (no full metadata, just enough to identify). Pill display shows icon inline.

**Status:** TODO

---

## [router:item-image-upload] Inventory image upload → slot analysis → loadout JSON

User can upload or paste an image. System analyzes imagedata against the sprite atlas to identify item candidates per inventory/equipment slot by position. User confirms/corrects each slot's item by name/id. Result stored as JSON array (position + item id). Steps can have an attached loadout image with a lightbox showing per-slot metadata and icon grid.

**Status:** TODO

---

## [router:step-bank-tag-recompute] Step bank inserts don't update tag pool until page refresh

When a step bank item is added to the route, its granted tags are not immediately available in the tag picker / reuse panel — they appear only after a full page reload re-seeds `knownTags` from localStorage. Every step bank add (and any other mutation that introduces new grants) must call `collectGrantedTags()` (or equivalent tag-pool rebuild) and re-render the tag reuse panel immediately, without requiring a reload.

**Status:** DONE ✓ — bank-add handler calls `mergeTags` + `store.saveTags`; tag reuse panel rebuilt on next `openGoalEditor`/`buildStepForm` open (`5d0a26e`)

---

## [router:fuzzy-match-contiguous] Fuzzy match highlights contiguous spans only; configurable gap allowance

The bank search fuzzy highlighter currently matches individual characters scattered across the full text (including spaces), producing visually misleading highlights like `tr<mark>a</mark>in-hun<mark>t</mark><mark>e</mark>r-4<mark>3</mark>`. Matches must be **contiguous character runs** — a sequence of consecutive matched characters emits a single `<mark>` span. A configurable `maxGap` (default `1`) allows up to N space characters between two runs before they are treated as separate spans (bridging broken compound words). Non-space gaps of any size terminate the current span. The pattern should use an options object (`{ maxGap: 1 }`) so future callers can adjust tolerance without touching match logic.

**Status:** DONE ✓ — `highlightTag` builds contiguous runs with `maxGap` space-only bridge; `scoreTag` gates fuzzy on ≥2 contiguous matched chars; `{ maxGap: 1 }` opts param (`5d0a26e`, `8758d1c`)

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
