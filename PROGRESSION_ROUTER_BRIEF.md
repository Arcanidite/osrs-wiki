# Progression Router — Build Brief (for an implementing agent)

> **What this is.** A self-contained specification an agent can build from. It captures the existing
> `Arcanidite/osrs-wiki` **Progression Router** tool *as it is today*, then specifies a cleaner,
> better-organized rebuild — with a **substantially more comprehensive route-optimization engine**.
>
> **Source of truth for the baseline:** `Arcanidite/osrs-wiki` (public), Jekyll site served at
> `https://arcanidite.github.io/osrs-wiki/`. Tool lives at `/tools/progression-router/`; engine at
> `assets/js/tools/progression-router.js` (~2,837 lines); graph layer at `assets/js/dal.js`; data under
> `assets/data/tools/*.jsonl`.
>
> **Two hard rules from the requester, non-negotiable:**
> 1. **No fabricated datapoints.** Never invent time-to-complete, XP rates, GP/hr, or any metric "for
>    the sake of it." If a number is not sourced from real data, it is a **configurable placeholder**,
>    labelled as an estimate, never asserted as fact.
> 2. **Unknowns get a default, not a lie.** Where a duration is unknown, use an explicit
>    `UNKNOWN`-typed placeholder default that the user can configure later at compute time. The
>    optimizer must be fully parameterized by this config so re-costing with better numbers is free.

---

## 1. Purpose & mental model

The Progression Router is a **mutable plan editor**, not a one-shot generator. The user assembles a set
of **goals** (objectives — quests, skill levels, unlocks, gear). The system computes a **valid, ordered
sequence of steps** that satisfies every goal's prerequisites, honoring constraints (skill reqs, quest
gates, region access, inventory). The user then **refines** the plan — reorder, insert, remove, pin,
annotate, mark done — and the system re-routes around those manual overrides.

```
Goals (targets)              Route engine                 Plan (mutable, ordered)
──────────────               ────────────                 ───────────────────────
quests / skill caps    →     satisfy all prereqs    →     numbered step list
gear / unlocks               at minimum cost              + notes, focal marks,
+ user custom goals          (cost model = §5)            done-state, pins, tabs
```

**Core invariant:** every node in a plan is a *step*. A "goal" is just a step with a `terminal` marker
that the router targets. Goals and steps share one schema; they render uniformly as a numbered list.

---

## 2. Current architecture (faithful capture of the baseline)

Build the rebuild on this understanding; do not regress these behaviors.

### 2.1 Stack & shell
- **Static Jekyll site**, `theme: minima`, `baseurl: /osrs-wiki`. GitHub Pages. No server, no build step
  beyond Jekyll. All logic is client-side vanilla JS (no framework, no bundler).
- Tool page `tools/progression-router/index.html` is a `layout: tool` Jekyll page that lays out the
  panels and includes `progression-router.js`. `data-baseurl` on an element feeds the JS its fetch root.
- **Data is fetched at runtime** as JSONL from `assets/data/tools/{steps,goals,constraints,regions}.jsonl`.

### 2.2 The DAL (`assets/js/dal.js`) — a tiny localStorage graph
- A node/edge store persisted to `localStorage` under key `osrs-graph:v1`. Nodes `{type,id,data}`,
  edges `{type,from,to,data}`. Keyed with a `\x1f` unit separator.
- **Qualifier `cmp` registry** — the extensibility seam. Each comparator implements:
  - `satisfies(cur, val)` — does current state meet this requirement?
  - `coalesce(cur, val)` — apply a grant to state (monotone merge).
  - `progresses(cur, grantVal, targetVal)` — does this grant move state toward a target?
  - Shipped comparators: **`gte`** (skill levels — `cur >= val`, `max` merge) and **`has`** (tags/items —
    boolean presence). **Both are monotone** (state only ever increases / turns on). This monotonicity
    is load-bearing for the optimization work in §5 — preserve it.
- Query helpers: `satisfies(edges,state)` (all reqs met), `coalesce(edges,state)` (apply all grants),
  `progresses(grantEdges,targetEdges,state)` (any grant advances any target).

### 2.3 Routing state representation
- **Flat qual-keyed state object:** `{ "skill:attack": 70, "tag:member": true, "item:4151": true }`.
- `toState(skills)` / `fromState(state)` convert between the profile's `{skill: level, _tags, _items}`
  and the flat form. Step reqs/grants are compiled to typed **qualifier edges** (`reqQuals`/`grantQuals`)
  and synced into the DAL as `step:req` / `step:grant` edges (`syncQualEdges`).

### 2.4 The current route algorithm (this is the part being upgraded)
`routeMulti(goals, steps, profile)` → for each goal in queue order, `routeGoal(...)`:

- Maintains `state` (skill/tag/item vector), `completedIds`, `completedQuests`, `freeSlots` (inv, cap 28),
  carried **forward across goals** so earlier work counts for later goals.
- **`computeNeededGates()`** — fixpoint pass: find every `quest_gate` transitively required to reach any
  directly-useful step or the terminal.
- **`buildHeap()`** — over all remaining steps, keep those that (a) `meetsReqs` (skill/tag/item reqs +
  `inv_free` + `region_order.before_step` constraints), (b) `locationAccessible` (region not excluded,
  quest gate satisfied), (c) `isUseful` (grants progress toward the target, or is the terminal, or is a
  needed gate). Push each with priority `costFor(step, style)`.
- **Greedy best-first loop:** pop cheapest, append to path, apply grants (`coalesce`), decrement inv,
  rebuild heap, repeat until `goalMet()` (target satisfied AND terminal completed) or heap empties.
- **`costFor(step, style)`** — the *entire* cost model today, and it is **not time**:
  - `efficient` → `1/xpSum` (favor high-XP steps)
  - `afk` → `inv_used`
  - `gp` → `0.5` if tagged `money` else `1`
  - `balanced`/default → `1` (i.e. fewest steps)
- **`synthFillGaps(...)`** — if the bank has no step that reaches a required skill level or tag, it
  **synthesizes** a placeholder step (`Train {skill} {from}→{to}`, marked `_synthetic`, detail:
  "Synthetic step — no matching step found in bank."). **This is the existing precedent for honest
  placeholders — extend this pattern, don't remove it.**
- After each goal, a **capstone** node (`_capstone`) is appended marking goal completion.

**Known limitations of the baseline (the reason for the rebuild):**
- **No time model.** "Efficiency" is a proxy (`1/xp`, step count), never estimated duration.
- **Greedy, not optimal, and not even locally justified** — a min-cost-per-step heap gives no global
  guarantee; goal *order* is fixed by queue position and never optimized.
- **Per-goal sequencing ignores cross-goal structure** beyond carrying state forward (it does not, e.g.,
  reorder goals to share prerequisite work or unlock shortcuts earlier).
- **Skill monotonicity is under-exploited:** to satisfy many goals you only need the **max** required
  level of each skill, but the greedy walk rediscovers this per goal.

### 2.5 UI / editor behaviors present today (preserve in rebuild)
- **Profile panel:** per-skill current levels (24 skills), a `style` selector, region-exclusion tag
  combobox (fuzzy-ranked, chip-based).
- **Goal queue** (left "step bank"): add preset goals/steps or author **custom goals / capstones**
  with a req/grant editor (skill pills, tag combobox with fuzzy highlight, item picker backed by a
  sprite atlas). Goal cards are **edit/remove**; **the goal queue itself is intentionally non-draggable**
  (BACKLOG `[router:no-drag]`) — order the queue by add order; routing derives sequence.
- **Route output (plan):** numbered steps with req/grant qualifier chips, XP/inv/location/constraint
  badges. Per-step: **notes**, **focal ★** marking, **done** toggle (with prereq-done propagation),
  inline **edit**, **remove**, **insert** (freeform or from bank), **gap-fill**, **loadout** analysis.
  **The plan step list *is* drag-sortable** (`wireDragSort`) — distinct from the non-draggable goal
  queue. Manual edits become **pins** (`pinnedInserts` / `pinnedExclusions`) that survive re-routing.
- **Plan tabs:** multiple named plans, drag-reorderable tabs, each with independent goal queue + pins +
  focal set. **Filters:** all / incomplete / complete / focal.
- **Plans list:** save/load/rename/delete named plans. State persisted through the DAL to localStorage.
  Plans store steps **slim** (preset steps → `{id}` refs; custom/synthetic/capstone keep full fields),
  rehydrated on load.

### 2.6 Data schemas (real, current)
Counts today: **138 steps, 27 goals, 19 constraints, 7 regions**.

```jsonc
// steps.jsonl
{ "id":"train-attack-10", "label":"Train Attack 1→10",
  "detail":"Chickens in Lumbridge. No food needed, fast kills.",
  "reqs":{ "skills":{}, "tags":[], "atlas_items":[], "inv_free":0, "constraints":[] },
  "grants":{ "attack":10 },              // skill→level | tag:true | atlas_items:[]
  "xp":{ "attack":1154 },                // REAL data — XP amounts are sourced
  "inv_used":0, "inv_removes":[],
  "tags":["combat","melee"],
  "location":{ "region":"misthalin", "zone":"lumbridge-farm",
               "quest_gate":null, "quest_phase":null } }

// goals.jsonl  — a goal is a step with a `terminal`
{ "id":"quest-dt", "label":"Desert Treasure",
  "reqs":{ "skills":{ "magic":50,"thieving":53,"slayer":10,"firemaking":50 } },
  "terminal":"quest-dt" }

// constraints.jsonl  — referenced by step.reqs.constraints[]
{ "id":"c:equip-rune-plate", "type":"equipment", "label":"Equip rune platebody",
  "item":"rune_platebody", "slot":"body", "optional":false }
// other types seen: region_order{before_step}, inv_free{slots},
//   item_on_item, item_on_object, object_interact, graph_ref, inventory_item

// regions.jsonl
{ "id":"wilderness", "label":"Wilderness" }
```

> **Note what is and isn't in the data.** `xp` is **real** (sourced amounts). There is **no** duration,
> no XP/hr, no GP/hr, no travel-time anywhere in the data. The 138 steps are a **seed, not whole-game
> coverage**, and region/unlock are only partially modeled. §4 handles the missing metrics honestly; §5.0–
> 5.12 handle the "enumerate the whole game, optimize over what's available" reframe; §10 is the protocol
> for growing the knowledge base as we learn.

---

## 3. Goals of the rebuild

1. **Same product, cleaner separation.** Split the monolithic `progression-router.js` into clear
   modules: **data-load**, **graph/DAL**, **planner/optimizer** (pure, headless, testable), **state
   model**, **view/render**, **persistence**. The planner must be runnable with zero DOM (Node-testable).
2. **A real, pluggable optimization engine** (§5) with multiple selectable algorithms and a
   **parameterized cost/time model** (§4) — this is the headline improvement.
3. **Honest costing** (§4): estimates are labelled, unknowns are configurable defaults, real data is
   never overwritten with fabrications.
4. **Preserve every editor behavior** in §2.5 (mutable plan, pins, tabs, notes, focal, done, filters,
   custom goals, item/tag pickers).
5. **Keep it a static, dependency-light GitHub Pages site.** Vanilla JS, no server. Any optimizer that
   needs heavier compute must degrade gracefully to a client-feasible default.

---

## 4. The cost / time model (honest by construction)

The optimizer minimizes a **scalar objective** over a plan. That objective is computed by a
**parameterized `CostModel`** so the *same* plan can be re-costed under different assumptions without
re-planning. This is where the "no fabricated datapoints" rule is enforced mechanically.

### 4.1 Duration is a *derived estimate*, resolved by a priority ladder
For each step, `estimateDuration(step, config)` returns `{ seconds, source, confidence }` where
`source ∈ {explicit, xp_rate, flat_default}` and `confidence ∈ {measured, estimated, unknown}`:

1. **`explicit`** — if a step ever carries a real, sourced `est_seconds` field, use it
   (`confidence: measured`). *No such field exists in the data today; do not invent one.*
2. **`xp_rate`** — if the step has `xp`, `seconds = Σ_skill xp[skill] / rate(skill, method, config)`.
   Rates come from `config.xpRates` and default to a single **`config.xpRates.__unknown__`**
   placeholder (`confidence: estimated`). Rates are **user-configurable** per skill and per method/tag.
3. **`flat_default`** — steps with neither explicit duration nor XP (e.g. a quest, a travel step) get
   `config.flatStepSeconds` (`confidence: unknown`). **This is a placeholder, surfaced as such.**

> **The placeholder default is a single named constant, not a sprinkling of guesses.** e.g.
> `config.flatStepSeconds = UNKNOWN_STEP_SECONDS` and `config.xpRates.__unknown__ = UNKNOWN_XP_RATE`.
> Pick round, obviously-placeholder sentinel values, and **flag them in the UI** ("est.", a `~` prefix,
> or a confidence dot). They exist so totals render *something*; they never claim to be true.

### 4.2 The config object (all optimizer knobs live here, all overridable)
```jsonc
{
  "objective": "time",             // time | steps | xp | gp | custom
  "xpRates": {                     // xp per hour, per skill; user-editable
    "__unknown__": UNKNOWN_XP_RATE,// PLACEHOLDER default for any unlisted skill
    "attack": null                 // null ⇒ fall back to __unknown__ (never fabricate)
    // methods override: keyed by tag, e.g. "slayer:nmz" — optional
  },
  "flatStepSeconds": UNKNOWN_STEP_SECONDS,   // PLACEHOLDER for xp-less steps
  "travelSeconds": UNKNOWN_TRAVEL_SECONDS,   // PLACEHOLDER per region change (optional term)
  "membersOnly": true,
  "excludeRegions": [],
  "algorithm": "auto",             // §5 — greedy | topo | dijkstra | ilp | beam | auto
  "weights": { "time":1, "travel":0, "steps":0 }  // for the composite objective
}
```
- **Every field has a safe default and is user-editable** (a "Costing" panel in the UI). Changing a rate
  or the algorithm **re-costs / re-plans** live.
- **Real data (`xp`, `reqs`, `grants`) is read-only to the optimizer.** The config only supplies the
  *rates and placeholders* that turn real data into an estimate. The optimizer must never write derived
  estimates back into the data files.

### 4.3 What the objective actually sums
`planCost(plan, config) = Σ estimateDuration(step).seconds  [+ travel term  + custom weights]`.
Surface, per plan and per goal: **total estimated time**, a **confidence breakdown** (how much of the
total is `measured` vs `estimated` vs `unknown`), and per-step estimate chips. A plan that is 80%
`unknown`-confidence must *say so*, so the user knows the number is a scaffold awaiting real rates.

---

## 5. The optimization engine (the comprehensive part)

### 5.0 Governing stance: NO ABSOLUTES — optimize over what is *available*

**The catalog never encodes "the best way to do X."** It enumerates *every* option with **where** it is,
**how** it is unlocked, and **what** it yields. "Best" is a **computed** property of the currently-available
option set, never a stored fact. This is the load-bearing requirement behind the requester's ask and behind
the game mode **Leagues** (which **region-locks** an account to a chosen subset of the map): if the
globally-"optimal" method is locked out, the planner must construct the best route from **whatever is
actually reachable** — not fall back to an assumed global optimum that isn't available.

- **Availability is a filter over the option set**, supplied by an **availability profile** (§5.12):
  membership (F2P/P2P), Leagues region lock, ironman/mode, and unlocks already held. The optimizer ranks the
  **available** options by the CostModel (§4) and routes; remove the "best method is X" assumption entirely.
- **Same optimizer, swap the profile.** The main-game route and the Leagues route are the *same* algorithm
  over a *different* availability filter. No method is privileged in code or data.

### 5.1 Problem statement (precise)
Given: a start **state** `s0` (skill vector + owned tags/items), a set of **goals** each expressed as a
conjunction of target predicates (`skill:x >= L`, `tag:y`, `item:z`, and/or a `terminal` step that must
appear), and a library of **steps** where each step has **preconditions** (same predicate language +
`inv_free` + ordering constraints + region/quest gating) and **effects** (monotone grants) and a
**cost** (§4). Find an **ordered sequence of steps** that makes every goal's predicates true, respects
all constraints, and **minimizes total cost**.

**Structural facts that make this tractable (exploit them):**
- **Monotone / delete-free.** Grants only raise skills and turn flags on; nothing is ever undone
  (`gte`=max, `has`=true). So this is a **delete-free planning problem** — the class where relaxed-plan
  heuristics are exact on the relaxation and greedy methods are near-optimal.
- **Skills decompose.** Because levels are cumulative and only the **maximum** required level of each
  skill across all goals matters, the *amount* of training per skill is fixed independent of ordering:
  `train(skill) = xp(startLevel → max_required_level)`. Ordering of training only matters for
  **unlocking gated content** (a quest that needs level L, a region, an item). Use this to avoid
  re-deriving training per goal.
- **Discrete milestones form a precedence DAG.** Quests/diaries/unlocks have prerequisites (skills,
  items, other quests) → a partial order. Sequencing them is a **topological ordering** problem with an
  objective, not a search from scratch.

### 5.2 Pluggable planner interface (build this seam first)
```
Planner: (goals, steps, state, constraints, costModel, config) -> { path, diagnostics }
```
All algorithms below implement the same interface and are selectable via `config.algorithm`. `auto`
picks based on instance size/shape (see 5.9). Ship at least **greedy** (baseline parity) and **one
optimal-for-structure** method; the rest are staged.

### 5.3 Algorithm A — Greedy best-first (baseline, keep for parity & speed)
The current approach, but re-costed against the real `CostModel` (§4) instead of `1/xp`. Fast, always
available, no optimality guarantee. Use as the **fallback** and as the seed/upper-bound for better
algorithms. Fixes to make over the baseline: cost = estimated time; tie-break deterministically; expose
why each step was chosen (diagnostics).

### 5.4 Algorithm B — Layered topological planner (recommended default)
Exploits 5.1's structure directly:
1. **Requirement closure.** From the goal predicates, transitively pull in every prerequisite (skills to
   levels, gated quests, required items) → the closed set of **mandatory milestones** + the **max level
   per skill**.
2. **Build a precedence DAG** over milestones (edges = "A must precede B" from quest gates, region
   order, item-on-object chains, `region_order.before_step`).
3. **Insert training as schedulable work** sized by XP (only up to each skill's max-required level),
   with edges into the milestones that gate on it.
4. **Topologically sort with a cost-aware tie-break** — among ready nodes, pick by a heuristic
   (earliest-unlock, least-time-first, or "unlock the most downstream work"). Optionally do a small
   **critical-path** pass to prioritize the chain that bounds total time.
This is deterministic, near-instant, and near-optimal for the skills-are-monotone structure. It is the
recommended `auto` default for typical instances.

### 5.5 Algorithm C — Uniform-cost / Dijkstra / A* over macro-states
For instances where step choice genuinely interacts (alternative methods, shared unlocks with different
costs), search the **state graph**: node = reachable state (compress: skill vector + owned flags),
edge = applying an eligible step with cost = estimated time. Dijkstra gives an **optimal** step multiset
to reach a goal state; **A\*** with an **admissible relaxed-plan heuristic** (h+ from delete-free
relaxation — cheap here *because* the domain is already delete-free) prunes hard. Cap the frontier and
fall back to greedy on blow-up. This is the "provably efficient route" option.

### 5.6 Algorithm D — Exact optimization (ILP / CP), optional/offline
Encode as a **mixed-integer / constraint program**: binary "step chosen" + ordering vars, precedence
constraints, "reach max level per skill" covering constraints, objective = Σ time. Solve with a
JS-friendly solver (e.g. an LP/MILP wasm lib) or export for an offline solver. **Optional** — gated
behind a "prove optimal" action, not the default (a Pages site can't assume heavy solve budgets). Use it
to *validate* that B/C are within X% of optimal on the real dataset.

### 5.7 Algorithm E — Beam / k-best (for the editor's "alternatives" UX)
A width-`k` beam over 5.5's state graph yields the **top-k routes**, not just one — powering an
"alternative plans" affordance and letting the user compare a faster-but-grindier route vs a
fewer-steps route. Cheap, anytime, and pairs naturally with the mutable editor.

### 5.8 Goal-ordering optimization (cross-goal, the baseline skips this)
The queue order should be an **input, not a constraint**, unless the user pins it. Offer:
- **Free order** — optimizer chooses the goal interleaving that minimizes total cost (the natural output
  of B/C, which don't need a fixed goal order).
- **Respect queue order** — current behavior (pinned).
- **Partial pins** — user pins some goals' relative order; optimizer fills the rest.
Because prerequisites are shared, free-ordering can cut total time meaningfully (train a skill once to
the global max; do a shortcut-unlocking quest early).

### 5.9 `auto` selection policy
- Small/DAG-shaped instance (few dozen milestones, clean precedence) → **B (topological)**.
- Method choice / alternative-route interaction present → **C (A\*)**, frontier-capped.
- Blow-up or timeout → **A (greedy)** fallback, flagged in diagnostics.
- `D` only on explicit "prove optimal"; `E` only when the UI requests alternatives.

### 5.10 Diagnostics & explainability (required)
Every plan carries a `diagnostics` object: which algorithm ran, why each step is present (which
goal/gate it serves), the confidence breakdown (§4.3), any **synthesized placeholder** steps
(`synthFillGaps` lineage), and any goal that could **not** be satisfied (missing step in the bank →
surface loudly, never silently drop — mirrors the repo's "fail loud" ethos).

---

### 5.11 The whole-game option catalog (data model for §5.0)

Generalize the current `step` into an **option**: any XP source, reward source, attraction, or unlock, from
**anywhere in the game**. Every option answers *what / where / how-unlocked / what-it-yields*:

```jsonc
{
  "id": "...", "label": "...",
  "kind": "skilling | quest | minigame | diary | boss | shop | transport | unlock | attraction",
  "yields": {                       // WHAT it gives
    "xp":     { "skill": amount },  // REAL when sourced; absent if none
    "grants": { "skill": level, "tag:x": true, "item:id": true }, // unlocks/rewards
    "gp":     null                  // placeholder-only unless sourced (§4)
  },
  "where":  { "region": "...", "zone": "...", "coords": null },   // WHERE (region is load-bearing)
  "unlock": {                       // HOW it is reached — the prerequisite set
    "skills": { "skill": level }, "quests": [...], "items": [...],
    "diaries": [...], "access": [...]     // e.g. "members", "region:kandarin"
  },
  "rate":   { "value": null, "source": "unknown", "confidence": "unknown" } // §4 — never fabricated
}
```

- **Categories to cover (breadth is the ambition):** skilling methods (multiple per skill, spread across
  regions and level bands), quests, minigames, achievement diaries, boss/monster kills, shops, transport &
  access unlocks, and **attractions** (fixed-location facilities — altars, anvils, ranges, banks, farming
  patches — that *enable or boost* activities). An attraction is an option whose "yield" is *access/boost*,
  not XP directly.
- **Region + unlock form a graph.** Each option's `where.region` + `unlock` are edges; the availability
  predicate (§5.12) is evaluated over this graph transitively.
- **Whole-game coverage, sourced honestly.** The current 138 steps are a seed, **not** whole-game coverage,
  and are not yet systematically region/unlock-modeled. Source breadth from the **OSRS Wiki** (canonical)
  and the repo's existing **RuneLite cache-extraction pipeline** (already produces items/npcs/objects/
  locations packs — see `DEVLOG.md`). Yields that aren't sourced (rates, GP/hr) stay §4 placeholders; never
  invent them to fill the table.

### 5.12 Availability-relative optimization (Leagues / region-lock)

**Availability profile** — an input to every planner call:
```jsonc
{ "mode": "main | leagues | ironman",
  "members": true,
  "regions": { "locked": true, "allowed": ["kandarin","asgarnia", ...] },  // Leagues: pick K, rest locked
  "held": { "quests": [...], "items": [...], "unlocks": [...] } }          // what the account already has
```
- **An option is available iff** its `where.region` ∈ allowed **and** its `unlock` prereqs are themselves
  available/achievable within the allowed set. This is **transitive**: a quest that requires a locked region
  is unavailable, and everything gated behind it cascades to unavailable.
- The planner (§5.2–5.10) runs **unchanged** over the filtered option set. Leagues = set
  `regions.locked=true` with the chosen `allowed` list; main game = `locked=false`. Membership/mode are
  additional filters, not separate code paths.
- **Fail loud on unreachable goals** (§5.10): if a goal can't be satisfied under the lock, surface **which
  prerequisite is region/unlock-locked** and why — never silently drop or substitute a locked "best."
- **UI:** generalize the existing region-*exclusion* combobox into a region **inclusion lock** (pick the
  allowed regions) plus membership/mode toggles. Exclusion remains a special case of the same filter.

### 5.13 Start-anywhere, preference-weighted, milestone-aware scheduling (2026-07-10 addendum)

Refines §5.8 with three requirements from live use:

1. **Start from any character sheet.** The profile is never assumed fresh: the planner input is the
   *current* state vector (skills/quests/items/unlocks), and requirement closure (§5.4) subtracts what
   is already satisfied. Concretely for the RuneLite guide-chain plugin: the plugin exports the live
   character sheet (skills, quest states via the client API) → the planner plans the *remainder* →
   emits a guide-chain JSON. No guide is a fixed list; every guide is a plan computed from "here."

2. **Preference weighting without bum-rushing (weighted completion time).** The user marks focus
   goals with weights `w_g ≥ 1`. Objective becomes **weighted flowtime**:
   `minimize Σ_g w_g · t_complete(g)` (t from the §4 CostModel). This is the classic scheduling form
   whose optimum *naturally interleaves*: shared prerequisites and cheap en-route work still schedule
   early when they reduce weighted completion, and focus goals pull forward only where the marginal
   delay to everything else is justified. A per-goal **tunnel slider** maps to `w_g → ∞` ("really
   really want it"), which degenerates to strict-priority routing. Queue order (§5.8) becomes just a
   weight preset.

3. **Milestone/QoL value, computed not stored (§5.0 applies).** The option catalog (§5.11) tags
   unlock options (transport, diaries, graceful-tier QoL, bank/route shorteners, higher-order
   milestones) — but their *value* is never a stored score: an unlock's value = **time saved on the
   remainder of this plan if taken now** (re-cost the residual plan with vs. without it). The planner
   surfaces "detour worth it" steps when `time_saved · horizon > detour_cost`. This is what replaces
   brute-force "train X to Z": the schedule spreads across skills/quests/unlocks because the objective
   rewards unlocks that compound, not levels for their own sake. Diagnostics (§5.10) must show each
   scheduled step's contribution (which goal-weights and which computed unlock savings placed it).

Guidance shape stays a DAG with ready-set choice (§5.4); "cyclic" daily/repeatable options enter the
catalog as repeatable options costed per §4, never as hardcoded loops.

### 5.14 Opportunistic + pre-emptive scheduling (2026-07-10 addendum)

Two locality principles the scheduler must honor, both **computed per-plan, never stored** (§5.0):

1. **Opportunistic interleaving (spatial locality — "while you're here").** Plan simulation tracks the
   player's location through the sequence (options carry `where`, §5.11; travel term, §4.2). At each
   point, steps from *later* in the plan — or cheap catalog options not strictly required — are
   candidates for early execution when the **marginal cost while nearby** (Δtravel + step time) beats
   their cost at their currently-scheduled position. Classic cheapest-insertion over the route: the
   plan clusters errands by place, instead of revisiting regions because the goal order said so.

2. **Pre-emptive acquisition (temporal ripeness — "while the time is ripe").** Just-in-time is the
   *worst* default. Every prerequisite has a **scheduling window** [first available → first needed];
   place it at the **minimum-marginal-cost point** in that window, not the latest: buy future supplies
   during the shop visit you're already making, bank-batch materials for three later steps in one
   withdrawal, do the 2-minute detour prerequisite now because the plan already routes past its door.
   Batching is the same rule applied to sets: combine window-overlapping same-place prerequisites into
   one visit when the combined marginal cost is lower.

Interaction with §5.13: opportunistic/pre-emptive placements must still respect weighted flowtime —
an errand cluster that meaningfully delays a heavily-weighted focus goal is rejected unless its
computed savings outweigh the weighted delay. Diagnostics (§5.10) must annotate every displaced step:
"scheduled early: you pass through Varrock at step 12 (saves ~N travel)" — zero-ambiguity guidance
downstream (guide-chain plugin) depends on these explanations rendering as plain instructions.

## 6. Module layout (target)

```
assets/js/
  router/
    graph.js                 # node/edge graph + monotone cmp registry (P0: absorbed dal.js;
                             #   storage-injectable — localStorage in browser, in-memory in tests)
    load.js                  # fetch + parse JSONL; validate schemas; surface bad rows loudly
    model.js                 # state, predicates, req/grant compilation to qual-edges
    cost.js                  # CostModel: estimateDuration ladder + config (§4). PURE.
    planner/
      index.js               # Planner interface + `auto` dispatch (§5.2, §5.9)
      greedy.js              # Algorithm A
      topo.js                # Algorithm B (default)
      astar.js               # Algorithm C (+ relaxed-plan heuristic)
      ilp.js                 # Algorithm D (optional, lazy-loaded)
      beam.js                # Algorithm E (k-best)
      diagnostics.js         # explainability payloads
    editor/                  # DOM/render/wiring — everything in §2.5
    persist.js               # graph-backed plans/tabs/notes/pins (slim/expand)
tests/                       # headless: planner correctness, cost ladder, monotonicity, parity
```

> **As-built note (P0, 2026-07-06):** the original plan kept `assets/js/dal.js`; in practice nothing but
> the router consumed `window.DAL`, so the graph + cmp registry moved wholesale into `router/graph.js`
> as an ES module (`createGraph(storage)`) and `dal.js` was deleted. The browser instance uses the same
> `osrs-graph:v1` localStorage payload, so existing user saves carry over; the editor still exposes the
> instance as `window.DAL` for console debugging.
**Hard separation:** `cost.js` and everything under `planner/` are **pure and DOM-free**, unit-tested in
Node against the real `*.jsonl` fixtures. The editor imports the planner, never the reverse.

---

## 7. Acceptance criteria

1. **Parity.** Given the existing 138 steps / 27 goals, the greedy planner (A) reproduces the baseline's
   step sets for the same profile (regression fixture), now with time estimates attached.
2. **Optimality where claimed.** On instances small enough for D, B and C are within a stated tolerance
   of the ILP optimum (report the gap; don't assert "optimal" for a heuristic).
2b. **No absolutes / availability-relative.** No option is hardcoded as "best." Swapping the availability
   profile (a Leagues region lock, F2P, ironman) re-filters the option set and produces a valid best route
   over *only* the reachable options; a goal made unreachable by the lock fails loud with the locking
   prerequisite named (§5.12), never a silent substitution.
3. **Honest costing.** No fabricated numbers anywhere in data files. Every displayed duration traces to
   `{source, confidence}`. A plan with no configured rates still renders, clearly marked
   `unknown`-confidence, and **re-costs instantly** when the user supplies a rate — no re-plan needed if
   only rates changed.
4. **Config round-trip.** Changing `config.algorithm` re-plans; changing only `xpRates`/`flatStepSeconds`
   re-costs the existing plan without reordering it.
5. **Editor preserved.** Every §2.5 behavior works: mutable plan, drag-sort of the step list, pins
   surviving re-route, tabs, notes, focal, done+propagation, custom goals, item/tag pickers, filters,
   region exclusion, save/load/rename/delete plans.
6. **Fail loud.** A goal whose prerequisites can't be met by the bank is reported in diagnostics and
   flagged in the UI (with the synthesized-placeholder lineage), never silently dropped.
7. **Static-site clean.** Runs on GitHub Pages with no server; heavy algorithms lazy-load and degrade to
   greedy within a client time budget.

---

## 8. Build phases (suggested order)

- **P0 — Extract & test-harness the baseline.** Pull `progression-router.js` apart into the §6 layout
  *without behavior change*; add Node fixtures from the real JSONL; pin baseline output.
  **[DONE 2026-07-06]** — editor extracted by mechanical code-motion; planner/graph/model/persist pure;
  23 Node tests incl. pinned route fixtures (`npm test`, re-pin via `npm run fixtures`); headless-browser
  smoke verified boot + goal-add + route render.
- **P1 — CostModel (§4).** Implement the duration ladder + config + confidence surfacing. Wire the
  "Costing" panel. This is where the honest-placeholder rule lives.
- **P2 — Planner seam + Greedy (A) + Topological (B).** Ship B as `auto` default; keep A as fallback and
  parity oracle. Goal-ordering modes (§5.8).
- **P3 — A\* (C) + relaxed-plan heuristic; diagnostics/explainability.**
- **P4 — Beam (E) alternatives UX; ILP (D) as an opt-in "prove optimal" validator.**
- **P5 — Polish:** confidence UI, per-goal breakdowns, plan comparison.

---

## 9. Non-goals / guardrails

- **Do not fabricate game data.** No invented XP rates, durations, GP/hr, drop rates, or travel times in
  the data files. Placeholders live in **config**, are labelled estimates, and are user-overridable.
- **Do not encode "best."** No option is privileged as the optimal method; the catalog enumerates
  where/how-unlocked/yield and the optimizer computes best over the *available* set (§5.0).
- **Do not overwrite real data with estimates.** `xp`/`reqs`/`grants` are read-only to the optimizer.
- **Do not require a backend.** Static-site constraint holds; optimizer degrades gracefully.
- **Do not regress the editor.** The mutable-plan experience is the product; the optimizer serves it.
- **Access note:** the live repo is `Arcanidite/osrs-wiki` (`Arcanidite` is an org). The local `gh`
  identity `PowerCreek` has **admin** on it (verified 2026-07-06); target PRs/pushes at it directly.

---

## 10. Game-knowledge KB + gotcha protocol (accrete as we learn)

Building the whole-game option catalog (§5.11) is an ongoing learning process. We **accrete** game
knowledge and traps as we go, under a discipline that keeps it **honest, sourced, and versioned** — the
domain-knowledge analog of this program's P-A/P-B (see the repo's `CLAUDE.md` §1). Two artifacts:

- **`tools/kb/GAME_KB.md`** — durable *game facts*: what an option yields, where it is, how it's unlocked,
  mechanics that shape routing (e.g. "levels are cumulative; only the max required level matters"),
  region contents. The **structured** half of each fact lives in the `*.jsonl` (machine-readable, drives
  the tool); the KB holds the **narrative + source + caveat**, cross-referenced by option `id`.
- **`tools/kb/GAME_GOTCHAS.md`** — *traps and corrections*: "we assumed method X was best, but it's
  region-locked in Leagues so it isn't always available" (the §5.0 lesson), sourcing pitfalls, version
  drift, prereqs that aren't obvious. Each entry names the **trap, the why, and how to avoid it**.

**Rules (enforced for me and any agent that touches the catalog):**

1. **Source every fact.** A KB/data entry carries a `source` (OSRS Wiki URL / cache-extraction / in-game
   observation) and a **stamp** (date or game-update version — OSRS changes across updates). No source ⇒ it's
   a **placeholder**, labelled `unknown`/`estimated` (§4), never asserted as fact.
2. **Never encode "best" as a fact.** A method's superiority is *relative* to the available set (§5.0). Record
   it as an option with a yield + rate placeholder, not as a KB claim of "the best way."
3. **Append + annotate, never silently delete.** Superseded facts/gotchas get `[STALE — game update
   YYYY-MM-DD / superseded by …]`. History is context (a nerfed method still explains an old route).
4. **Capture on contact.** Whenever we add or verify an option, learn a prerequisite, or hit a wrong
   assumption, append to the KB (fact) or the gotcha ledger (trap) **before** the task is done. A data-table
   addition without a KB source line is incomplete.
5. **Split durable vs relative.** Durable game fact → KB + JSONL. Method-relative claim → an option's
   yield/rate (config-costed, §4). Optimization outcome ("best route given this lock") → computed, never stored.
6. **Agents inherit this.** Any subagent extending the catalog reads both KB files first and appends its
   findings + gotchas on completion (mirrors the repo's P-B subagent rule).
```
