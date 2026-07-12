#!/usr/bin/env python3
"""Fold the opportunistic-granularity W3 atoms (contrib.jsonl "oppgran:atoms:*")
into the existing Lane-G granularity machinery:

  - each atom step becomes a steps.jsonl row carrying `coarse_of` (the machinery
    already keys atoms_by_id off exactly that field), and
  - each coarse_id gets a coarse_expansions.jsonl entry (status "authored",
    steps[] = its atom ids, checkpoints[] passed through), so
    enrich.py::_inject_coarse_atoms unwinds the coarse step into its atoms when
    a goal opts in via `coarse_ids`.

Two-phase for safety: by default writes SIDECARS + prints a plan (dry run);
`--apply` merges into the canonical steps.jsonl + coarse_expansions.jsonl
(dedup by id / coarse_id — idempotent, never clobbers an existing row).

  in : tools/wiki-kb/contrib.jsonl                (oppgran:atoms:* rows)
  out: assets/data/tools/steps_oppgran.jsonl      (sidecar, review)
       assets/data/tools/coarse_expansions_oppgran.jsonl (sidecar, review)
  --apply also appends into steps.jsonl + coarse_expansions.jsonl

Then add the emitted coarse_ids to plan-grand.mjs's goal.coarse_ids and re-export.
"""
import argparse
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "assets/data/tools")
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
STEPS = os.path.join(DATA, "steps.jsonl")
COARSE = os.path.join(DATA, "coarse_expansions.jsonl")
STEPS_SIDECAR = os.path.join(DATA, "steps_oppgran.jsonl")
COARSE_SIDECAR = os.path.join(DATA, "coarse_expansions_oppgran.jsonl")

# steps.jsonl row defaults an atom row must carry for the planner/enrich to
# treat it uniformly (mirrors an existing coarse_of row's shape).
STEP_DEFAULTS = {
    "reqs": {}, "grants": {}, "xp": {}, "tags": [],
    "inv_used": 0, "inv_removes": [], "mapMarkers": [],
}
STEP_KEEP = (
    "id", "label", "kind", "atom", "coarse_of", "detail", "location",
    "produces", "consumes", "hints", "refs", "reqs", "grants", "xp", "tags",
    "supply_chain", "timing", "est_minutes",
)


def read_jsonl(path):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def atom_rows_and_expansions():
    """Returns (step_rows_by_id, expansions_by_coarse) from the ledger, first
    seen wins (idempotent ledger, but guard re-runs)."""
    step_rows, expansions = {}, {}
    for row in read_jsonl(CONTRIB):
        if row.get("kind") != "atoms":
            continue
        coarse_id = row.get("coarse_id")
        steps = row.get("steps") or []
        if not coarse_id or not steps or coarse_id in expansions:
            continue
        ids = []
        for s in steps:
            sid = s.get("id")
            if not sid or sid in step_rows:
                continue
            step_rows[sid] = normalize_step(s, coarse_id)
            ids.append(sid)
        expansions[coarse_id] = {
            "coarse_id": coarse_id,
            "name": row.get("notes") or f"{coarse_id} — granular atoms",
            "status": "authored",
            "steps": ids,
            "checkpoints": row.get("checkpoints") or [],
        }
    return step_rows, expansions


def normalize_step(s, coarse_id):
    out = {k: s[k] for k in STEP_KEEP if k in s}
    out["coarse_of"] = coarse_id
    for k, default in STEP_DEFAULTS.items():
        out.setdefault(k, json.loads(json.dumps(default)))
    return out


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")


def append_new(path, rows, key):
    existing = {r.get(key) for r in read_jsonl(path)}
    fresh = [r for r in rows if r.get(key) not in existing]
    if not fresh:
        return 0
    with open(path, "a", encoding="utf-8") as f:
        for r in fresh:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")
    return len(fresh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="merge into canonical steps.jsonl + coarse_expansions.jsonl")
    args = ap.parse_args()

    step_rows, expansions = atom_rows_and_expansions()
    steps = list(step_rows.values())
    exps = list(expansions.values())
    write_jsonl(STEPS_SIDECAR, steps)
    write_jsonl(COARSE_SIDECAR, exps)
    print(f"atoms: {len(steps)} step rows across {len(exps)} coarse expansions")
    print(f"sidecars: {STEPS_SIDECAR} + {COARSE_SIDECAR}")
    print("coarse_ids to add to plan-grand.mjs goal.coarse_ids:")
    print("  " + json.dumps(sorted(expansions)))

    if args.apply:
        a = append_new(STEPS, steps, "id")
        b = append_new(COARSE, exps, "coarse_id")
        print(f"APPLIED: +{a} steps.jsonl rows, +{b} coarse_expansions.jsonl entries")


if __name__ == "__main__":
    main()
