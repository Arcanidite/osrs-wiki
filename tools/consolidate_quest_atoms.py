#!/usr/bin/env python3
"""Fold the quest-subchecklist normalizer fan-out (contrib.jsonl
"questatoms:<slug>", kind "quest-expansion") into the coarse-expansion model
(NORMALIZATION.md §1a) — the consolidator mints the ids the cordoned micro-
agents deliberately never knew (they emit local idx only):

  - each atom becomes a steps_quest_atoms.jsonl row in the unified steps.jsonl
    node shape (SYNTHESIS §1b), id `q-<quest-slug>-<NN>-<verb>-<target-slug>`;
  - each quest gets a quest_expansions.jsonl entry (status "authored", same
    shape as coarse_expansions.jsonl) with checkpoint start_idx resolved to
    the minted atom id;
  - the parent steps_quests.jsonl row gains `coarse_unwind` (the atom ids) —
    its prose `detail` stays untouched as the fallback for renders that
    don't consume the sub-checklist.

enrich.py attaches the atoms as subChecklist{atoms,checkpoints} behind the
goal.quest_atoms opt-in flag (ATTACH model, same as the oppgran precedent —
NOT flat-injected; 5k+ atoms would reorder every pinned route).

  in : tools/wiki-kb/contrib.jsonl                    (questatoms:* rows)
  out: assets/data/tools/steps_quest_atoms.jsonl      (minted atom rows)
       assets/data/tools/quest_expansions.jsonl       (registry)
       assets/data/tools/steps_quests.jsonl           (+coarse_unwind, in place)

Idempotent: re-runs regenerate both sidecars from the ledger and re-assign
the same coarse_unwind lists. First-seen wins per quest_id (ledger contract).
"""
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "assets/data/tools")
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
STEPS_QUESTS = os.path.join(DATA, "steps_quests.jsonl")
ATOMS_OUT = os.path.join(DATA, "steps_quest_atoms.jsonl")
EXPANSIONS_OUT = os.path.join(DATA, "quest_expansions.jsonl")

VERBS = set("talk-to walk-to teleport withdraw deposit buy sell kill gather "
            "produce use-on equip toggle plant harvest claim consume".split())
HINT_KEYS = ("type", "target", "value", "note")
TARGET_SLUG_MAX = 24
LABEL_MAX = 80
# GRANULARITY coord envelope: surface / dungeon (y+6400) / instanced bands.
X_RANGE, Y_SURFACE, Y_DUNGEON_MAX, Y_INSTANCED = (1000, 4400), (2200, 3900), 10500, (4000, 6500)


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False))
            f.write("\n")


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def target_slug(atom):
    """Deterministic short slug for the id tail; target if named, else the
    label's leading words. Truncated at a dash boundary, never mid-word."""
    base = slugify(atom.get("target") or atom.get("label") or "x")
    if len(base) <= TARGET_SLUG_MAX:
        return base
    cut = base[:TARGET_SLUG_MAX].rsplit("-", 1)[0]
    return cut or base[:TARGET_SLUG_MAX]


def mint_id(quest_slug, idx, atom):
    tail = target_slug(atom)
    verb = atom.get("verb", "x")
    return f"q-{quest_slug}-{idx + 1:02d}-{verb}" + (f"-{tail}" if tail else "")


def norm_hint(h):
    if not isinstance(h, dict):
        return None
    return {k: h.get(k) for k in HINT_KEYS}


def dedupe_refs(refs):
    out, seen = [], set()
    for r in refs or []:
        key = r.get("url") or r.get("title")
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def markers(atom):
    return [{"x": c.get("x"), "y": c.get("y"), "plane": c.get("plane", 0),
             "label": c.get("label")} for c in atom.get("coords") or []]


def atom_location(parent, quest_id):
    loc = dict(parent.get("location") or {"region": "global", "zone": None})
    loc["quest_gate"] = quest_id
    loc["quest_phase"] = "during"
    return loc


def atom_row(aid, atom, parent, quest_id):
    """Unified steps.jsonl node shape (SYNTHESIS §1b / NORMALIZATION §1a)."""
    reqs = atom.get("reqs") if isinstance(atom.get("reqs"), dict) else {"skills": {}}
    return {
        "id": aid,
        "label": atom.get("label") or "??",
        "detail": atom.get("detail") or "",
        "kind": "quest",
        "atom": {"verb": atom.get("verb"), "target": atom.get("target"),
                 "count": atom.get("count"), "cmp": atom.get("cmp", "eq"),
                 "until": atom.get("until")},
        "reqs": reqs, "grants": {}, "xp": {}, "inv_used": 0, "inv_removes": [],
        "tags": ["quest"],
        "location": atom_location(parent, quest_id),
        "consumes": atom.get("consumes") or {},
        "produces": atom.get("produces") or {},
        "coarse_of": quest_id,
        "hints": [h for h in map(norm_hint, atom.get("hints") or []) if h],
        "mapMarkers": markers(atom),
        "refs": dedupe_refs(atom.get("refs")),
    }


def coord_ok(x, y):
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return False
    if not (X_RANGE[0] <= x <= X_RANGE[1]):
        return False
    return (Y_SURFACE[0] <= y <= Y_SURFACE[1] or Y_SURFACE[1] < y <= Y_DUNGEON_MAX
            or Y_INSTANCED[0] <= y <= Y_INSTANCED[1])


def lint(row, warns):
    a = row["atom"]
    if a["verb"] not in VERBS:
        warns.append(f"{row['id']}: verb '{a['verb']}' not in enum")
    if len(row["label"]) > LABEL_MAX:
        warns.append(f"{row['id']}: label {len(row['label'])} chars > {LABEL_MAX}")
    if not row["refs"]:
        warns.append(f"{row['id']}: empty refs[]")
    for m in row["mapMarkers"]:
        if not coord_ok(m["x"], m["y"]):
            warns.append(f"{row['id']}: coord ({m['x']},{m['y']}) outside envelope")


def consolidate():
    parents = {r["id"]: r for r in read_jsonl(STEPS_QUESTS)}
    seen, atom_rows, expansions, warns = set(), [], [], []
    unwind = {}
    for row in read_jsonl(CONTRIB):
        if row.get("kind") != "quest-expansion":
            continue
        qid = row.get("quest_id")
        if not qid or qid in seen:
            continue
        seen.add(qid)
        parent = parents.get(qid)
        if parent is None:
            warns.append(f"{qid}: no steps_quests.jsonl row — skipped")
            continue
        slug = qid[len("quest-"):] if qid.startswith("quest-") else qid
        ids = []
        for i, atom in enumerate(row.get("atoms") or []):
            aid = mint_id(slug, i, atom)
            r = atom_row(aid, atom, parent, qid)
            lint(r, warns)
            atom_rows.append(r)
            ids.append(aid)
        checkpoints = []
        for cp in row.get("checkpoints") or []:
            si = cp.get("start_idx")
            if not isinstance(si, int) or not 0 <= si < len(ids):
                warns.append(f"{qid}: checkpoint '{cp.get('label')}' start_idx {si} unresolvable")
                continue
            checkpoints.append({"label": cp.get("label"), "start": ids[si]})
        title = re.sub(r"^Complete ", "", parent.get("label") or qid)
        expansions.append({"coarse_id": qid, "name": f"{title} sub-checklist",
                           "status": "authored", "steps": ids, "checkpoints": checkpoints})
        unwind[qid] = ids
    return atom_rows, expansions, unwind, warns


def apply_unwind(unwind):
    rows = list(read_jsonl(STEPS_QUESTS))
    hit = 0
    for r in rows:
        ids = unwind.get(r["id"])
        if not ids:
            continue
        r["coarse_unwind"] = ids
        hit += 1
    write_jsonl(STEPS_QUESTS, rows)
    return hit


def main():
    atom_rows, expansions, unwind, warns = consolidate()
    dup = len(atom_rows) - len({r["id"] for r in atom_rows})
    if dup:
        warns.append(f"{dup} duplicate minted atom ids")
    write_jsonl(ATOMS_OUT, atom_rows)
    write_jsonl(EXPANSIONS_OUT, expansions)
    hit = apply_unwind(unwind)
    print(f"wrote {len(atom_rows)} atoms -> {ATOMS_OUT}")
    print(f"wrote {len(expansions)} expansions -> {EXPANSIONS_OUT}")
    print(f"coarse_unwind set on {hit} steps_quests rows")
    print(f"lint: {len(warns)} warnings")
    for w in warns[:40]:
        print(f"  WARN {w}")


if __name__ == "__main__":
    main()
