#!/usr/bin/env python3
"""Fold the card-facts normalizer fan-out (contrib.jsonl "cardfacts:<kind>:<id>",
kind "card-facts") onto the repo data files (NORMALIZATION.md §1c/§1d):

  - quest_db.jsonl quest/diary rows gain `summary` + `facts[]` + `req_items[]`
    (additive; the prose `notes` blob stays untouched as the render fallback);
  - steps_quests.jsonl rows gain `req_items[]` via the cardfacts row's own
    steps_quests_id join (§1d — the step and the card hold the same item prose,
    so both get the same structured mirror).

minigame/unlock card facts stay in the ledger — gen_reference_catalog.py (the
guide-chain repo) attaches those at catalog build time, since their source rows
(minigamedb:/unlockdb:) are ledger rows too, not repo files.

  in : tools/wiki-kb/contrib.jsonl        (cardfacts:* rows, idempotent ledger)
  out: assets/data/tools/quest_db.jsonl   (+summary/facts/req_items, in place)
       assets/data/tools/steps_quests.jsonl (+req_items, in place)

Idempotent: recomputed from the ledger on every run; first-seen wins per
(card_kind, card_id).
"""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRIB = os.path.join(REPO, "tools/wiki-kb/contrib.jsonl")
QUEST_DB = os.path.join(REPO, "assets/data/tools/quest_db.jsonl")
STEPS_QUESTS = os.path.join(REPO, "assets/data/tools/steps_quests.jsonl")

FACT_LABELS = set("overview boss kills combat start length difficulty unlock "
                  "required-for hazard mechanics xp-note items-note removed caveat".split())
SUMMARY_MAX = 160


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path, rows, ensure_ascii):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=ensure_ascii))
            f.write("\n")


def load_card_facts():
    """{(card_kind, card_id): row} — first-seen wins (idempotent ledger)."""
    facts = {}
    for row in read_jsonl(CONTRIB):
        if row.get("kind") != "card-facts":
            continue
        key = (row.get("card_kind"), row.get("card_id"))
        if not all(key) or key in facts:
            continue
        facts[key] = row
    return facts


def lint(key, row, warns):
    if len(row.get("summary") or "") > SUMMARY_MAX:
        warns.append(f"{key}: summary > {SUMMARY_MAX} chars")
    for f in row.get("facts") or []:
        if f.get("label") not in FACT_LABELS:
            warns.append(f"{key}: fact label '{f.get('label')}' not in enum")


def apply_quest_db(facts, warns):
    rows = list(read_jsonl(QUEST_DB))
    hit = 0
    for r in rows:
        block = facts.get((r.get("kind"), r["id"]))
        if not block:
            continue
        lint(f"{r.get('kind')}:{r['id']}", block, warns)
        r["summary"] = block.get("summary") or ""
        r["facts"] = block.get("facts") or []
        r["req_items"] = block.get("req_items") or []
        hit += 1
    write_jsonl(QUEST_DB, rows, ensure_ascii=True)
    return hit, len(rows)


def apply_steps_quests(facts):
    by_step = {row.get("steps_quests_id"): row.get("req_items") or []
               for row in facts.values() if row.get("steps_quests_id")}
    rows = list(read_jsonl(STEPS_QUESTS))
    hit = 0
    for r in rows:
        items = by_step.get(r["id"])
        if items is None:
            continue
        r["req_items"] = items
        hit += 1
    write_jsonl(STEPS_QUESTS, rows, ensure_ascii=False)
    return hit, len(rows)


def main():
    facts = load_card_facts()
    warns = []
    db_hit, db_total = apply_quest_db(facts, warns)
    sq_hit, sq_total = apply_steps_quests(facts)
    ledger_kinds = {}
    for (kind, _cid) in facts:
        ledger_kinds[kind] = ledger_kinds.get(kind, 0) + 1
    print(f"ledger card-facts rows: {len(facts)} {ledger_kinds}")
    print(f"quest_db structured: {db_hit}/{db_total} rows")
    print(f"steps_quests req_items: {sq_hit}/{sq_total} rows")
    print(f"lint: {len(warns)} warnings")
    for w in warns[:40]:
        print(f"  WARN {w}")


if __name__ == "__main__":
    main()
