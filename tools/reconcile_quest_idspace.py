#!/usr/bin/env python3
"""Lane B — quest id-space reconciliation (CONSOLIDATION.md §3/§5/§7 Lane B),
resolves tools/guide-export/design/gap_tasks.jsonl's `gap-idspace-01`.

The problem (measured, not assumed — CONSOLIDATION.md §3): `quest_atoms`
(steps_quest_atoms.jsonl + quest_expansions.jsonl, keyed by
steps_quests.jsonl's long ids, e.g. `quest-sheep-herder`) never covered any of
grand's 27 SHORT-id quests (steps.jsonl's `quest-mm`/`quest-dt`/`rfd-*`/etc —
the origin-prefix + RFD spine). Those 27 partially rode on `granular`'s
coarse_expansions_oppgran.jsonl fallback instead (17 of them have real, cited
steps_oppgran.jsonl atoms; the 10 `rfd-*`/`quest-rfd-start` ids have NEITHER
mechanism's atoms — a genuine content gap, not an id-space bug; see
`quest_id_map.jsonl`'s `needs_new_expansion`/`rfd` flags and the companion
gap-rfd-01/02 GENERATE tasks).

This script does two things, both additive (no id renamed or deleted, no
existing contrib.jsonl row touched):

1. Classification (gap-idspace-01's own deliverable): emits
   `assets/data/tools/quest_id_map.jsonl`, one row per one of grand's 27
   short spine-quest ids, verifying — not assuming — whether a long-id twin
   exists in steps_quests.jsonl (answer, measured: none do; MM1/DT1/Fairytale
   I/etc partition from their steps_quests-side sequels, per the [normalize-q]
   gotcha precedent). Mirrors the ledger contribution shape the classifier
   brief specified (`gapfix:idmap:<short-id>`), appended to contrib.jsonl.

2. Mechanical re-registration: for the 17 short ids that already have real,
   cited steps_oppgran.jsonl atoms, converts them into the SAME
   `questatoms:<short-id>` contrib.jsonl shape the questatoms fan-out uses
   (kind "quest-expansion") — content and refs are copied through unchanged
   (nothing fabricated, nothing re-researched), only the closed-enum verb/hint
   drift already catalogued by gap-enum-01 is fixed in transit (go-to->walk-to,
   search->gather, use->use-on, operate->toggle, with 9 per-atom overrides
   where the default table disagreed with the atom's own label/detail —
   verified by hand, see OVERRIDES below; non-enum hints note/loadout fold
   into detail and drop, matching gap-enum-01's fold rule). Feeding these
   through the (Lane-B-extended) consolidate_quest_atoms.py mints real
   steps_quest_atoms.jsonl rows + quest_expansions.jsonl entries keyed by the
   SHORT id, so `quest_atoms` alone now resolves a subChecklist for them —
   `granular`'s oppgran fallback becomes redundant for these 17, not deleted.

The 10 rfd-*/quest-rfd-start ids are NOT covered by this script (no
oppgran atoms exist to re-register) — they need real wiki authoring, tracked
separately (see quest_id_map.jsonl's needs_new_expansion=true rows).

  in : assets/data/tools/steps.jsonl              (27 short quest/rfd ids)
       assets/data/tools/steps_quests.jsonl        (189 long ids, twin-check)
       assets/data/tools/steps_oppgran.jsonl       (existing cited atoms)
       assets/data/tools/coarse_expansions_oppgran.jsonl (existing checkpoints)
  out: assets/data/tools/quest_id_map.jsonl        (new, classification)
       tools/wiki-kb/contrib.jsonl                 (+gapfix:idmap:* rows,
                                                      +questatoms:<short-id>
                                                      rows for the 17)

Idempotent: contrib.jsonl contributions are key-checked before append;
re-running with no new content is a no-op. Run consolidate_quest_atoms.py
afterward to mint the sidecars from the new questatoms:* contributions.
"""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "assets/data/tools")
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")

STEPS = os.path.join(DATA, "steps.jsonl")
STEPS_QUESTS = os.path.join(DATA, "steps_quests.jsonl")
OPPGRAN_ATOMS = os.path.join(DATA, "steps_oppgran.jsonl")
OPPGRAN_EXPANSIONS = os.path.join(DATA, "coarse_expansions_oppgran.jsonl")
ID_MAP_OUT = os.path.join(DATA, "quest_id_map.jsonl")

CLOSED_HINTS = {"do-while", "dialogue", "toggle-state", "batch-size",
                 "teleport-choice", "rng-variance", "keep-drop", "safespot",
                 "contested-fallback"}
VERB_DEFAULT = {"go-to": "walk-to", "search": "gather", "use": "use-on",
                 "operate": "toggle"}
# Hand-verified against each atom's own label/detail (gap-enum-01's
# "verify each against the atom's own target/label before writing" rule) —
# these 9 disagree with the blind default table.
OVERRIDES = {
    "tr-16-go-to-crevice": "walk-to",              # "Enter the mountain crevice" — zone transition, not item-use
    "feud-22-use-mayors_house_door": "walk-to",    # "Enter the house..." — door = zone transition
    "bv-08-use-barge_guard": "walk-to",            # "Board the barge" — travel hop
    "bv-12-use-barge_guard_2": "walk-to",          # "Re-board the barge"
    "ns-13-solve-stone-puzzle": "toggle",          # puzzle mechanism, no item-on-target
    "lc-04-operate-bank-prep": "deposit",          # "Deposit all weapons and armour at a bank"
    "lc-14-operate-tool-shed": "walk-to",          # "Enter Zanaris" via the shed
    "tr-17-operate-boulder-mine": "gather",        # "Mine the boulder" — resource-extraction verb
    "dt1-30-quest-navigate-pyramid": "walk-to",    # "Enter the pyramid and run each floor" — navigation challenge
}

SHORT17_WITH_OPPGRAN = [
    "quest-big-chompy", "quest-bone-voyage", "quest-cooks-assistant",
    "quest-druidic-ritual", "quest-dt", "quest-fairytale-1",
    "quest-family-crest", "quest-lost-city", "quest-mm", "quest-nature-spirit",
    "quest-priest-in-peril", "quest-rum-deal", "quest-shadow-storm",
    "quest-swan-song", "quest-tai-bwo", "quest-tale-of-arrav", "quest-the-feud",
]
RFD_NEEDS_CONTENT = [
    "quest-rfd-start", "rfd-intro", "rfd-goblins", "rfd-mountain-dwarf",
    "rfd-pirate-pete", "rfd-evil-dave", "rfd-skrach", "rfd-sir-amik",
    "rfd-awowogei", "rfd-finale",
]


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


def existing_contrib_keys():
    if not os.path.exists(CONTRIB):
        return set()
    return {r.get("key") for r in read_jsonl(CONTRIB)}


def append_contrib(rows):
    seen = existing_contrib_keys()
    fresh = [r for r in rows if r.get("key") not in seen]
    if fresh:
        with open(CONTRIB, "a", encoding="utf-8") as f:
            for r in fresh:
                f.write(json.dumps(r, ensure_ascii=False))
                f.write("\n")
    return len(fresh)


def spine_short_ids():
    return [r for r in read_jsonl(STEPS)
            if r["id"].startswith("quest-") or r["id"].startswith("rfd-")]


def build_id_map(oppgran_coarse_ids, questatoms_coarse_ids_before, long_ids):
    """gap-idspace-01's classification deliverable."""
    rows = []
    for r in spine_short_ids():
        sid = r["id"]
        refs = r.get("refs") or []
        title = refs[0]["title"] if refs else "??"
        # verified (not assumed) — no short id string-matches nor
        # semantically-twins a steps_quests.jsonl long id; the sequel/relative
        # quests that DO exist there (quest-monkey-madness-ii,
        # quest-desert-treasure-ii-the-fallen-empire, quest-fairytale-ii-cure-a-queen,
        # quest-goblin-diplomacy, quest-dwarf-cannon, quest-pirates-treasure,
        # quest-recipe-for-disaster-freeing-the-lumbridge-guide) are each a
        # DIFFERENT real-world quest, not this id's twin under another slug.
        long_twin = sid if sid in long_ids else None
        rows.append({
            "short_id": sid,
            "long_slug_equivalent": long_twin,
            "wiki_title": title,
            "has_questatoms": sid in questatoms_coarse_ids_before,
            "has_oppgran": sid in oppgran_coarse_ids,
            "routed_in_grand": True,
            "rfd": sid.startswith("rfd-") or sid == "quest-rfd-start",
            "needs_new_expansion": sid not in questatoms_coarse_ids_before
                                     and sid not in oppgran_coarse_ids,
        })
    return rows


def id_map_contribs(id_map_rows):
    contribs = [{"key": f"gapfix:idmap:{r['short_id']}", "kind": "id-map",
                  "body": r} for r in id_map_rows]
    depth_queue = [r["short_id"] for r in id_map_rows if r["needs_new_expansion"]]
    contribs.append({"key": "gapfix:idmap:depth-queue", "kind": "id-map",
                      "body": {"needs_generate_work": depth_queue,
                               "rfd_chapters_first": [d for d in depth_queue if d != "quest-rfd-start"] +
                                                       (["quest-rfd-start"] if "quest-rfd-start" in depth_queue else [])}})
    return contribs


def fold_hint(detail, hint):
    """gap-enum-01's fold rule: non-closed-enum hint value appended own-words
    to detail, hint dropped. Values here are ALREADY own-words prose from a
    prior atomization pass, not wiki-copied text."""
    value = hint.get("value")
    if not value or not isinstance(value, str):
        return detail
    sep = " " if detail.rstrip().endswith((".", "!", "?")) else ". "
    return f"{detail.rstrip()}{sep}{value.rstrip('.')}."


def remap_verb(atom_id, verb):
    if atom_id in OVERRIDES:
        return OVERRIDES[atom_id]
    return VERB_DEFAULT.get(verb, verb)


def convert_atom(row, idx):
    atom = row["atom"]
    verb = remap_verb(row["id"], atom.get("verb"))
    detail = row.get("detail") or ""
    kept_hints = []
    for h in row.get("hints") or []:
        if h.get("type") in CLOSED_HINTS:
            kept_hints.append({"type": h.get("type"), "value": h.get("value")})
        else:
            detail = fold_hint(detail, h)
    return {
        "idx": idx, "verb": verb, "target": atom.get("target"),
        "label": row.get("label") or "??", "detail": detail,
        "count": atom.get("count"), "cmp": atom.get("cmp", "eq"),
        "until": atom.get("until"), "reqs": row.get("reqs") or {},
        "consumes": row.get("consumes") or {}, "produces": row.get("produces") or {},
        "coords": row.get("mapMarkers") or [], "refs": row.get("refs") or [],
        "hints": kept_hints,
    }


def convert_quest(short_id, oppgran_atoms, oppgran_expansion):
    steps_order = oppgran_expansion.get("steps", [])
    by_id = {r["id"]: r for r in oppgran_atoms}
    atoms = [convert_atom(by_id[sid], i) for i, sid in enumerate(steps_order) if sid in by_id]
    idx_by_id = {sid: i for i, sid in enumerate(steps_order)}
    checkpoints = []
    for cp in oppgran_expansion.get("checkpoints") or []:
        start = cp.get("start")
        if start in idx_by_id:
            checkpoints.append({"label": cp.get("label"), "start_idx": idx_by_id[start]})
    return {"key": f"questatoms:{short_id}", "kind": "quest-expansion",
             "quest_id": short_id, "checkpoints": checkpoints, "atoms": atoms}


def main():
    steps_rows = list(read_jsonl(STEPS))
    long_ids = {r["id"] for r in read_jsonl(STEPS_QUESTS)}
    oppgran_atoms = list(read_jsonl(OPPGRAN_ATOMS))
    oppgran_expansions = {r["coarse_id"]: r for r in read_jsonl(OPPGRAN_EXPANSIONS)}
    oppgran_coarse_ids = set(oppgran_expansions)
    questatoms_before = set()  # measured 0 short-id overlap pre-fix; kept
                                 # explicit (not hardcoded) via contrib scan:
    for r in read_jsonl(CONTRIB) if os.path.exists(CONTRIB) else []:
        if r.get("kind") == "quest-expansion":
            questatoms_before.add(r.get("quest_id"))

    id_map_rows = build_id_map(oppgran_coarse_ids, questatoms_before, long_ids)
    write_jsonl(ID_MAP_OUT, id_map_rows)

    quest_contribs = []
    for sid in SHORT17_WITH_OPPGRAN:
        exp = oppgran_expansions.get(sid)
        atoms = [r for r in oppgran_atoms if r.get("coarse_of") == sid]
        if not exp or not atoms:
            print(f"SKIP {sid}: missing oppgran expansion or atoms")
            continue
        quest_contribs.append(convert_quest(sid, atoms, exp))

    n_map = append_contrib(id_map_contribs(id_map_rows))
    n_quest = append_contrib(quest_contribs)
    print(f"wrote {len(id_map_rows)} rows -> {ID_MAP_OUT}")
    print(f"appended {n_map} gapfix:idmap:* contrib rows")
    print(f"appended {n_quest} questatoms:<short-id> contrib rows "
          f"(of {len(SHORT17_WITH_OPPGRAN)} candidates)")
    print(f"RFD ids needing NEW content (no oppgran atoms to re-register): "
          f"{RFD_NEEDS_CONTENT}")


if __name__ == "__main__":
    main()
