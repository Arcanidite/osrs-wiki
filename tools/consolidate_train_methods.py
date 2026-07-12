#!/usr/bin/env python3
"""Fold the skill-methods normalizer fan-out (contrib.jsonl "methods:<step_id>",
kind "train-methods") into one row per train-* step.

Each train-* step currently carries a single prose `detail` line ("Chickens in
Lumbridge. No food needed."). The miners replace that with a 1:many
skill->methods[] picker: several activity options per level band, each with its
own location / xp_hr / reqs / wiki breadcrumbs. This consolidator is the
deterministic seam between the ledger and the pipeline — it never fetches, never
guesses; a missing field stays missing.

  in : tools/wiki-kb/contrib.jsonl        (methods:* rows, idempotent ledger)
  out: assets/data/tools/train_methods.jsonl   (one row per step_id)

enrich.py attaches methods[] onto the matching step behind an opt-in flag so
routes without the data stay byte-identical (xp_fold precedent).
"""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
OUT = os.path.join(REPO, "assets/data/tools/train_methods.jsonl")

METHOD_KEYS = ("method", "location", "level_band", "members", "xp_hr", "reqs", "refs")


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def clean_method(m):
    """Keep the known method fields verbatim; drop anything the miner tacked on
    so the emitted shape is uniform. Unknown xp/members stay "??" untouched."""
    if not isinstance(m, dict):
        return None
    out = {k: m[k] for k in METHOD_KEYS if k in m}
    return out if out.get("method") else None


def load_methods():
    """First-seen wins per step_id (ledger is idempotent, but guard re-runs)."""
    by_step = {}
    for row in read_jsonl(CONTRIB):
        if row.get("kind") != "train-methods":
            continue
        step_id = row.get("step_id") or str(row.get("key", "")).replace("methods:", "", 1)
        if not step_id or step_id in by_step:
            continue
        methods = [cm for cm in (clean_method(m) for m in row.get("methods") or []) if cm]
        if methods:
            by_step[step_id] = {"step_id": step_id, "methods": methods}
    return by_step


def main():
    by_step = load_methods()
    with open(OUT, "w", encoding="utf-8") as f:
        for step_id in sorted(by_step):
            f.write(json.dumps(by_step[step_id], ensure_ascii=False))
            f.write("\n")
    total_methods = sum(len(r["methods"]) for r in by_step.values())
    print(f"wrote {len(by_step)} steps / {total_methods} methods -> {OUT}")


if __name__ == "__main__":
    main()
