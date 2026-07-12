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

`--attach` (NORMALIZATION §1b, consolidator phase) additionally rewrites
steps.jsonl in place: every train-* row with a methods entry gains the
additive `methods` field AND its single prose `detail` becomes a short
"Pick a method:" note naming the options — the specifics (location, reqs,
xp_hr, wiki breadcrumb) live per-option in methods[]; methods[0] is the
method the old detail named (render continuity), so nothing is lost.
Idempotent: recomputed from the ledger on every run.
"""
import argparse
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
OUT = os.path.join(REPO, "assets/data/tools/train_methods.jsonl")
STEPS = os.path.join(REPO, "assets/data/tools/steps.jsonl")

METHOD_KEYS = ("method", "location", "level_band", "members", "xp_hr", "reqs", "refs", "notes")


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def dedupe_refs(refs):
    """Collapse repeated citations by url (fallback title), first-seen order."""
    out, seen = [], set()
    for ref in refs or []:
        key = ref.get("url") or ref.get("title")
        if key is not None and key in seen:
            continue
        seen.add(key)
        out.append(ref)
    return out


def clean_method(m):
    """Keep the known method fields verbatim; drop anything the miner tacked on
    so the emitted shape is uniform. Unknown xp/members stay "??" untouched."""
    if not isinstance(m, dict):
        return None
    out = {k: m[k] for k in METHOD_KEYS if k in m}
    if "refs" in out:
        out["refs"] = dedupe_refs(out["refs"])
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


def pick_note(methods):
    """The short replacement `detail`: names the options, points at methods[]."""
    names = " / ".join(m["method"] for m in methods)
    return f"Pick a method: {names}."


def attach_to_steps(by_step):
    """Rewrite steps.jsonl rows in place: +methods (additive), detail -> the
    "Pick a method:" note. steps.jsonl is ASCII-escaped (ensure_ascii=True)."""
    rows = list(read_jsonl(STEPS))
    hit = 0
    for r in rows:
        entry = by_step.get(r["id"])
        if not entry:
            continue
        r["methods"] = entry["methods"]
        r["detail"] = pick_note(entry["methods"])
        hit += 1
    with open(STEPS, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=True))
            f.write("\n")
    return hit, len(rows)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--attach", action="store_true",
                      help="also rewrite steps.jsonl (+methods, detail -> pick-note)")
    opts = args.parse_args()
    by_step = load_methods()
    with open(OUT, "w", encoding="utf-8") as f:
        for step_id in sorted(by_step):
            f.write(json.dumps(by_step[step_id], ensure_ascii=False))
            f.write("\n")
    total_methods = sum(len(r["methods"]) for r in by_step.values())
    print(f"wrote {len(by_step)} steps / {total_methods} methods -> {OUT}")
    if opts.attach:
        hit, total = attach_to_steps(by_step)
        print(f"attached methods[] + pick-note detail on {hit}/{total} steps.jsonl rows")


if __name__ == "__main__":
    main()
