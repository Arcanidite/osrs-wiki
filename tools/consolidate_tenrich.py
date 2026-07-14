#!/usr/bin/env python3
"""Fold the tenrich wave (train-band methods[] + Faux-grain atoms, fable-
consolidated) into the EXISTING sidecar machinery (NORMALIZATION §1a/§1b):

  train_methods.jsonl            — enriched methods[] override by step_id
  steps_oppgran.jsonl            — enriched atoms supersede a band's old rows
  coarse_expansions_oppgran.jsonl — one authored expansion per train-* band
  steps.jsonl                    — train-* anchor rows refreshed in place:
                                   +methods, pick-note detail, +coarse_unwind
                                   (atom ids, SYNTHESIS §1b reserved field),
                                   +req_items (per-method item strings,
                                   optional:true — method-conditional)

Two phases, mirroring consolidate_train_methods/_oppgran_atoms:

  --ingest METHODS.jsonl ATOMS.jsonl
      append the consolidated wave rows to tools/wiki-kb/contrib.jsonl under
      `tenrich:consolidated:{methods,atoms}:<step_id>` keys (idempotent on
      key — re-runs are no-ops), so the sidecars below are reproducible from
      repo state alone.

  (default) consolidate
      rebuild the four files above from the ledger. Supersede rules:
        * a band's OLD steps_oppgran rows are dropped UNLESS still referenced
          by some surviving expansion's steps[] (U8 reuse stubs — prayer tpb/
          tpr rows stay because the enriched bands point back at them);
        * same-id enriched atoms replace old rows outright (e.g. the magic
          tmg* atoms over the level-gate-broken oppgran:atoms:train-magic-*);
        * expansion steps[] ids that resolve neither in steps.jsonl nor in
          steps_oppgran are materialized from contrib `oppgran:atoms:*` rows
          (the report's "materialize at oppgran-mint time" note); a residual
          miss prints as lint, never silently dropped.
      U8 pointer stubs (no atom{}) are never written as rows — the expansion
      steps[] carries the id and enrich.py resolves it (oppgran sidecar first,
      steps.jsonl fallback).
"""
import argparse
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "assets/data/tools")
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
STEPS = os.path.join(DATA, "steps.jsonl")
METHODS_OUT = os.path.join(DATA, "train_methods.jsonl")
OPP_STEPS = os.path.join(DATA, "steps_oppgran.jsonl")
OPP_COARSE = os.path.join(DATA, "coarse_expansions_oppgran.jsonl")

KEY_METHODS = "tenrich:consolidated:methods:"
KEY_ATOMS = "tenrich:consolidated:atoms:"


def read_jsonl(path):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path, rows, ascii_escape=False):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=ascii_escape))
            f.write("\n")


# ── ingest ─────────────────────────────────────────────────────────────────

def ingest(methods_path, atoms_path):
    existing = {r.get("key") for r in read_jsonl(CONTRIB)}
    fresh = []
    for row in read_jsonl(methods_path):
        key = KEY_METHODS + row["step_id"]
        if key not in existing:
            fresh.append({"key": key, "kind": "train-methods-enriched", **row})
    for row in read_jsonl(atoms_path):
        key = KEY_ATOMS + row["step_id"]
        if key not in existing:
            fresh.append({"key": key, "kind": "train-atoms-enriched", **row})
    with open(CONTRIB, "a", encoding="utf-8") as f:
        for r in fresh:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")
    print(f"ingested {len(fresh)} new ledger rows -> {CONTRIB}")


# ── consolidate ────────────────────────────────────────────────────────────

def load_wave():
    methods, bands = {}, {}
    for row in read_jsonl(CONTRIB):
        key = row.get("key", "")
        if key.startswith(KEY_METHODS):
            methods[row["step_id"]] = row
        elif key.startswith(KEY_ATOMS):
            bands[row["step_id"]] = row
    return methods, bands


def band_steps_list(band):
    """Ordered atom-id list: the band-level steps[] where authored (herblore/
    cooking carry external reuse ids only reachable there), else atoms[] order."""
    return band.get("steps") or [a["id"] for a in band.get("atoms", [])]


def dedupe_refs(refs):
    out, seen = [], set()
    for ref in refs or []:
        key = ref.get("url") or ref.get("title")
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)
    return out


def band_expansion(step_id, band):
    full = [a for a in band.get("atoms", []) if a.get("atom")]
    refs = dedupe_refs([r for a in full for r in a.get("refs", [])])
    return {
        "coarse_id": step_id,
        "name": band.get("notes") or f"{step_id} — granular training atoms (tenrich)",
        "status": "authored",
        "steps": band_steps_list(band),
        "checkpoints": band.get("checkpoints") or [],
        "refs": refs,
    }


def rebuild_expansions(bands):
    kept = [e for e in read_jsonl(OPP_COARSE) if e.get("coarse_id") not in bands]
    new = [band_expansion(sid, bands[sid]) for sid in sorted(bands)]
    return kept + new


def materialize_from_contrib(missing):
    """Resolve referenced-but-nowhere ids from contrib oppgran:atoms:* rows
    (e.g. atk30-* reused by train-hitpoints-50 before any sidecar regen)."""
    rows = {}
    for row in read_jsonl(CONTRIB):
        if row.get("kind") != "atoms" or not str(row.get("key", "")).startswith("oppgran:atoms:"):
            continue
        for s in row.get("steps", []):
            sid = s.get("id")
            if sid in missing and sid not in rows:
                rows[sid] = {**s, "coarse_of": s.get("coarse_of") or row.get("coarse_id")}
    return rows


def rebuild_opp_steps(bands, expansions):
    new_atoms = {a["id"]: {**a, "coarse_of": a.get("coarse_of") or sid}
                 for sid in sorted(bands)
                 for a in bands[sid].get("atoms", []) if a.get("atom")}
    referenced = {sid for e in expansions for sid in e.get("steps", [])}
    steps_ids = {r["id"] for r in read_jsonl(STEPS)}

    kept = [r for r in read_jsonl(OPP_STEPS)
            if r["id"] not in new_atoms
            and (r.get("coarse_of") not in bands or r["id"] in referenced)]
    kept_ids = {r["id"] for r in kept}

    missing = referenced - steps_ids - kept_ids - set(new_atoms)
    materialized = materialize_from_contrib(missing)
    for sid in sorted(missing - set(materialized)):
        print(f"[tenrich lint] expansion references \"{sid}\" but it resolves nowhere "
              "(steps.jsonl / steps_oppgran / contrib oppgran:atoms) — left dangling.")
    return kept + [materialized[k] for k in sorted(materialized)] + list(new_atoms.values())


def pick_note(methods):
    names = " / ".join(m["method"] for m in methods)
    return f"Pick a method: {names}."


def method_req_items(methods):
    """Row-level req_items (§1d shape) from the per-method reqs.items prose
    strings — optional:true because each item is only needed if that method is
    picked; the note names the method so the render stays honest."""
    out, seen = [], set()
    for m in methods:
        for item in (m.get("reqs") or {}).get("items", []) or []:
            if not isinstance(item, str) or item in seen:
                continue
            seen.add(item)
            out.append({"name": item, "qty": None,
                        "note": f"method: {m['method']}", "optional": True})
    return out


def refresh_steps(methods, bands):
    rows = list(read_jsonl(STEPS))
    hit = 0
    for r in rows:
        m = methods.get(r["id"])
        band = bands.get(r["id"])
        if not m and not band:
            continue
        if m:
            r["methods"] = m["methods"]
            r["detail"] = pick_note(m["methods"])
            req_items = method_req_items(m["methods"])
            if req_items:
                r["req_items"] = req_items
        if band:
            r["coarse_unwind"] = band_steps_list(band)
        hit += 1
    write_jsonl(STEPS, rows, ascii_escape=True)
    return hit


def consolidate():
    methods, bands = load_wave()
    if not methods and not bands:
        print("no tenrich:consolidated:* rows in the ledger — run --ingest first")
        return

    base = {r["step_id"]: r for r in read_jsonl(METHODS_OUT)}
    for sid, row in methods.items():
        base[sid] = {"step_id": sid, "methods": row["methods"]}
    write_jsonl(METHODS_OUT, [base[k] for k in sorted(base)])
    print(f"train_methods.jsonl: {len(base)} rows ({len(methods)} enriched)")

    expansions = rebuild_expansions(bands)
    opp_steps = rebuild_opp_steps(bands, expansions)
    write_jsonl(OPP_COARSE, expansions)
    write_jsonl(OPP_STEPS, opp_steps)
    n_new = sum(1 for sid in bands for a in bands[sid].get("atoms", []) if a.get("atom"))
    print(f"coarse_expansions_oppgran.jsonl: {len(expansions)} expansions "
          f"({len(bands)} tenrich bands)")
    print(f"steps_oppgran.jsonl: {len(opp_steps)} rows ({n_new} enriched atoms)")

    hit = refresh_steps(methods, bands)
    print(f"steps.jsonl: refreshed {hit} train-* anchor rows "
          "(+methods/detail/coarse_unwind/req_items)")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ingest", nargs=2, metavar=("METHODS", "ATOMS"),
                    help="append consolidated wave rows to contrib.jsonl (idempotent)")
    args = ap.parse_args()
    if args.ingest:
        ingest(*args.ingest)
        return
    consolidate()


if __name__ == "__main__":
    main()
