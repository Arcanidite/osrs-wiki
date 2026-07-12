"""backprop.py — Python port of assets/js/router/planner/backprop.js (the
opportunistic-lookahead backward requisite-demand propagation engine).

Design: tools/guide-export/design/OPPORTUNISTIC_GRANULARITY.md §2 (model) / §2b
(wiring). backprop.js is the canonical, RUN-PROVEN engine (spike:
tools/guide-export/spikes/backprop-spike.mjs; unit test: tests/backprop.test.js)
for the web view's pre-enrich planning surface. This module is a *port*, not a
reimplementation from scratch — every function here mirrors its JS namesake
function-for-function; keep both in sync when the algorithm changes.

WHY A PORT INSTEAD OF SHELLING JS IN AS A P8 PRE-PASS (§2b explicitly offers
both, "pick one, document why"): enrich.py's P8 (insert_supply_steps) runs
AFTER P6 hub_batches and P7 topo_order have already produced the route's FINAL
play order — the only order in which "is the player in-position at node N
already" is a meaningful question (hub_batches clusters quest hubs; topo_order
corrects skill/tag/quest violations the batching introduces). A JS pre-pass
computed on the PRE-P6/P7 order could pick a different, less-final "earliest"
node than the one that will actually hold that position once the Python side
is done reordering — anchors are id-based (a re-pin would not crash), but the
SELECTION of which node is earliest could be wrong. Running the sweep natively
in Python, at the exact point P8 makes the placement decision, keeps that
decision grounded in the real final order.

Verdicts + fields mirror backprop.js exactly — see that file's own docstring
for the full semantics (earliest-window / already-earliest / no-window,
sourceAfterConsumer as a route-fault flag, never a silent reorder).
"""

GLOBAL_ZONE = "global"
HORIZON = float("inf")  # consumer position for goal-level (horizon) demands


def build_source_index(bank_steps, oppgran_rows=None):
    """item slug -> [{step_id, zones[], hubs[], min_skills{}}].

    Primary source: every bank step with produces{} (location.zone/hub derive
    the window unless the row authors opp{} to widen/override it — mirrors
    backprop.js's addSources). Secondary, ADDITIVE source: oppgran:opp:*
    contrib.jsonl rows (wave-3 wiki grounding, OPPORTUNISTIC_GRANULARITY.md
    §4 O-track) — each contributes one more candidate window per item from its
    own researched trigger{}, on top of (never replacing) the bank-derived
    entry, so grounding only WIDENS opportunity coverage.
    """
    index = {}
    for step in bank_steps or []:
        _add_bank_source(index, step)
    for row in oppgran_rows or []:
        _add_oppgran_source(index, row)
    return index


def _add_bank_source(index, step):
    produced = list((step.get("produces") or {}).keys())
    if not produced:
        return
    opp = step.get("opp") or {}
    zone = (step.get("location") or {}).get("zone")
    zones = opp["zones"] if opp.get("zones") is not None else ([zone] if zone and zone != GLOBAL_ZONE else [])
    hubs = opp["hubs"] if opp.get("hubs") is not None else ([step["hub"]] if step.get("hub") else [])
    min_skills = {**(step.get("reqs") or {}).get("skills", {}), **opp.get("min_skills", {})}
    entry = {"step_id": step["id"], "zones": zones, "hubs": hubs, "min_skills": min_skills}
    for item in produced:
        index.setdefault(item, []).append(entry)


def _add_oppgran_source(index, row):
    """One oppgran:opp:* contrib row -> one extra source-index entry. Uses the
    row's own researched `trigger{}` verbatim (the grounded window), not the
    row's produces{}/location — trigger IS the deliberate placement.

    Rows that already carry a researcher-assessed `verdict` (e.g. "no-window"
    for a fungible item like coins with no real travel-saving window, or
    "gap-proposed" for a missing recipe-chain edge) are DELIBERATELY excluded:
    that verdict IS the wave-3 researcher's own considered judgment that this
    specific edge should NOT be treated as a live opportunistic candidate —
    only the still-open shortlist (rows with no verdict yet) feeds the sweep.
    "??" is a placeholder for "not grounded", never a literal matchable
    zone/hub, so it is stripped rather than passed through.
    """
    if row.get("kind") != "opportunity" or row.get("verdict"):
        return
    item = row.get("item")
    step_id = (row.get("proposed_row") or {}).get("id") or row.get("source_step")
    if not item or not step_id:
        return
    trigger = row.get("trigger") or {}
    strip_unknown = lambda vs: [v for v in (vs or []) if v != "??"]
    entry = {
        "step_id": step_id,
        "zones": strip_unknown(trigger.get("zones")),
        "hubs": strip_unknown(trigger.get("hubs")),
        "min_skills": trigger.get("min_skills") or {},
    }
    index.setdefault(item, []).append(entry)


def _horizon_demands_from_payoff(route):
    """Goal-level (horizon) demands, derived from the `_payoff` edges
    burndown.js already stamps on injected supply/synth steps (§2a.1) rather
    than re-reading goals.jsonl (a second source of truth for the same edge):
    a `_payoff` whose consumer == goal (both fields equal) means the item's
    demand is the GOAL itself, not any one route step — exactly a
    horizon-pinned demand for collect_demands()."""
    seen, demands = set(), []
    for step in route:
        payoff = step.get("_payoff")
        if not payoff or payoff.get("consumer") != payoff.get("goal"):
            continue
        key = (payoff.get("item"), payoff.get("consumer"))
        if key in seen:
            continue
        seen.add(key)
        demands.append({"item": payoff["item"], "qty": "??",
                         "consumer_id": payoff["consumer"], "consumer_idx": HORIZON})
    return demands


def collect_demands(route):
    """Route consumes{} -> positioned demands, plus horizon demands recovered
    from `_payoff` (see above). Mirrors backprop.js's collectDemands(route,
    goals), with the goals[]-driven horizon half replaced by the _payoff-edge
    recovery (enrich.py's P8 runs one route/one goal per invocation, and the
    edge burndown.js already computed is a stronger source of truth than a
    second raw read of goals.jsonl reqs.items)."""
    demands = []
    for i, step in enumerate(route):
        for item, qty in (step.get("consumes") or {}).items():
            demands.append({"item": item, "qty": qty, "consumer_id": step.get("id"), "consumer_idx": i})
    demands.extend(_horizon_demands_from_payoff(route))
    return demands


def accumulate_skills(route):
    """Prefix pass: skill maxima accumulated from grants{} up to and including i."""
    prefix, state = [], {}
    for step in route:
        for skill, lvl in (step.get("grants") or {}).items():
            if isinstance(lvl, (int, float)):
                state[skill] = max(state.get(skill, 1), lvl)
        prefix.append(dict(state))
    return prefix


def _meets_skills(skills_at, min_skills):
    return all(skills_at.get(sk, 1) >= lvl for sk, lvl in min_skills.items())


def _in_position(node, source):
    zone = (node.get("location") or {}).get("zone")
    if zone and zone in source["zones"]:
        return True
    if node.get("hub") and node["hub"] in source["hubs"]:
        return True
    return False


def backprop_collection_plan(route, demands, source_index, prefix_skills=None):
    """One backward sweep; mirrors backprop.js's backpropCollectionPlan exactly.
    Returns plans: [{item, qty, consumer_id, consumer_idx, sources, collect_at_idx,
    collect_at_id, via_source, source_idx, source_after_consumer, verdict}]."""
    skills = prefix_skills if prefix_skills is not None else accumulate_skills(route)
    position_of = {s.get("id"): i for i, s in enumerate(route)}
    plans = [{
        **d, "sources": source_index.get(d["item"], []),
        "collect_at_idx": None, "collect_at_id": None, "via_source": None,
    } for d in demands]

    for i in range(len(route) - 1, -1, -1):
        node, skills_at = route[i], skills[i]
        for plan in plans:
            _update_plan_at_node(plan, node, i, skills_at)

    for plan in plans:
        _finalize_verdict(plan, position_of)
    return plans


def _update_plan_at_node(plan, node, i, skills_at):
    if i >= plan["consumer_idx"]:
        return  # demand not yet live this far downstream
    source = next((s for s in plan["sources"]
                    if _in_position(node, s) and _meets_skills(skills_at, s["min_skills"])), None)
    if not source:
        return
    plan["collect_at_idx"] = i  # backward walk: last write = earliest in route order
    plan["collect_at_id"] = node.get("id")
    plan["via_source"] = source["step_id"]


def _finalize_verdict(plan, position_of):
    chosen = plan["via_source"] or (plan["sources"][0]["step_id"] if plan["sources"] else None)
    src_idx = position_of.get(chosen) if chosen is not None else None
    plan["source_idx"] = src_idx
    plan["source_after_consumer"] = src_idx is not None and src_idx > plan["consumer_idx"]
    if plan["collect_at_idx"] is None:
        plan["verdict"] = "no-window"
    elif src_idx is not None and src_idx <= plan["collect_at_idx"]:
        plan["verdict"] = "already-earliest"
    else:
        plan["verdict"] = "earliest-window"
