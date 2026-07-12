#!/usr/bin/env python3
"""Build assets/data/tools/quests.jsonl from the Quest Helper RuneLite plugin.

WHAT THIS MINES (all real, sourced data — no fabricated metrics):

  1. The RECOMMENDED QUEST ORDER. Quest Helper does NOT compute an optimal
     order with an algorithm — `QuestOrders.sortOptimalOrder()` simply sorts by
     position in a hand-curated static list, `OptimalQuestGuide.java`, which is
     parsed verbatim from the OSRS Wiki's "Optimal quest guide". So the order is
     a *community-curated recommendation*, not a solved optimum. We carry that
     honesty onto the endpoint (see the KB gotcha). We also read the separate
     `IronmanOptimalQuestGuide.java` as an alternative ordering.

  2. Per-quest ENTRY REQUIREMENTS from each helper's `getGeneralRequirements()`:
     skill levels, prerequisite quests, quest-point totals, combat level. These
     are the gates that answer "can I do this quest yet?". We deliberately scope
     to getGeneralRequirements() (the start gate) and NOT step-level item/varbit
     requirements, which would overstate the entry bar.

  3. Quest display names: from a String literal in the enum when present, else
     from the authoritative RuneLite `Quest.java` enum (const -> name).

HONESTY: requirement extraction is a documented SUBSET. Field-assigned and
varbit/combined requirements that we cannot statically resolve are flagged with
`req_partial: true` and a note, never silently dropped or invented.

INPUTS (dev-time checkouts; output jsonl is committed, this is not run at build):
  --qh   path to a Zoinkwiz/quest-helper checkout   (default /tmp/quest-helper)
  --qjava path to runelite api Quest.java           (default /tmp/Quest.java)
  --out  output jsonl (default assets/data/tools/quests.jsonl)

Reproduce:
  gh repo clone Zoinkwiz/quest-helper -- --depth 1 /tmp/quest-helper
  curl -sL https://raw.githubusercontent.com/runelite/runelite/master/\
runelite-api/src/main/java/net/runelite/api/Quest.java -o /tmp/Quest.java
  python3 tools/build_quests.py
"""
import argparse, json, re, sys
from pathlib import Path

QH_ENUM = "src/main/java/com/questhelper/questinfo/QuestHelperQuest.java"
OQG = "src/main/java/com/questhelper/panel/questorders/OptimalQuestGuide.java"
IRON = "src/main/java/com/questhelper/panel/questorders/IronmanOptimalQuestGuide.java"
LEAGUE = "src/main/java/com/questhelper/questinfo/LeagueQuestRegions.java"
HELPERS = "src/main/java/com/questhelper"

STAMP = "quest-helper@Zoinkwiz + OSRS Wiki Optimal Quest Guide"


def slug(const):
    return const.lower().replace("_", "-")


def humanize(const):
    return const.replace("_", " ").title()


def read(p):
    return Path(p).read_text(encoding="utf-8", errors="replace")


# ── 1. RuneLite Quest.java: CONST -> display name ────────────────────────────
def parse_runelite_names(path):
    names = {}
    if not Path(path).exists():
        print(f"WARN: {path} missing — Quest.XXX names fall back to humanize()", file=sys.stderr)
        return names
    for m in re.finditer(r'^\s*([A-Z0-9_]+)\(\s*\d+\s*,\s*"([^"]+)"\)', read(path), re.M):
        names[m.group(1)] = m.group(2)
    return names


# ── 2. Optimal order lists: ordered constants (skip commented lines) ─────────
def parse_order(path):
    """Return (ordered_consts, cutoff_index) where cutoff = first const that is
    NOT part of the OSRS Wiki OQG (a comment marks the boundary)."""
    order, cutoff = [], None
    if not Path(path).exists():
        return order, cutoff
    for line in read(path).splitlines():
        s = line.strip()
        if "not part of the OSRS Wiki" in s or "not part of OSRS Wiki" in s:
            cutoff = len(order)
        if s.startswith("//"):
            continue
        m = re.search(r"QuestHelperQuest\.([A-Z0-9_]+)", s)
        if m:
            order.append(m.group(1))
    return order, cutoff


# ── 2b. Leagues: CONST -> [league regions required] ─────────────────────────
def parse_league_regions(path):
    regions = {}
    if not Path(path).exists():
        return regions
    for m in re.finditer(r"put\(\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_,\s]+?)\)\s*;", read(path)):
        const = m.group(1)
        regs = [r.strip().lower() for r in m.group(2).split(",") if r.strip()]
        if regs:
            regions[const] = regs
    return regions


# ── 3. QuestHelperQuest enum: CONST -> {class, type, difficulty, name} ───────
def parse_enum(path, rl_names):
    text = read(path)
    # isolate the enum body: from the first entry to the terminating ';'
    entries = {}
    # Each entry begins at a tab + UPPER const + '(' ; accumulate until parens balance.
    lines = text.splitlines()
    buf, const = "", None
    depth = 0
    started = False
    for line in lines:
        if not started:
            # enum constants are the first members, right after the declaration
            if re.search(r"\benum QuestHelperQuest\b", line):
                started = True
            continue
        if buf == "":
            m = re.match(r"^\t([A-Z0-9_]+)\(", line)
            if not m:
                if line.strip() == ";" or line.startswith("\tprivate") or line.startswith("\t@"):
                    break
                continue
            const = m.group(1)
        buf += line + "\n"
        depth += line.count("(") - line.count(")")
        if depth <= 0 and buf:
            entries[const] = _parse_entry(const, buf, rl_names)
            buf, const, depth = "", None, 0
    return entries


def _parse_entry(const, buf, rl_names):
    cls = None
    m = re.search(r"new (\w+)\(", buf)
    if m:
        cls = m.group(1)
    qtype = (re.search(r"QuestDetails\.Type\.(\w+)", buf) or [None, None])[1]
    diff = (re.search(r"QuestDetails\.Difficulty\.(\w+)", buf) or [None, None])[1]
    # name: prefer Quest.XXX runelite name, else first string literal, else humanize
    qref = re.search(r"Quest\.([A-Z0-9_]+)", buf)
    name = None
    if qref and qref.group(1) in rl_names:
        name = rl_names[qref.group(1)]
    if not name:
        lit = re.search(r'"([^"]+)"', buf)
        if lit:
            name = lit.group(1)
    if not name:
        name = humanize(const)
    return {"class": cls, "type": qtype, "difficulty": diff, "name": name}


# ── 4. helper class -> file, and getGeneralRequirements() extraction ─────────
def index_classes(root):
    idx = {}
    for f in Path(root).rglob("*.java"):
        txt = read(f)
        for m in re.finditer(r"\bclass (\w+)", txt):
            idx.setdefault(m.group(1), f)
    return idx


def _method_body(text, name):
    """Return the brace-matched body of `List<Requirement> name()` or None."""
    m = re.search(r"getGeneralRequirements\s*\([^)]*\)\s*\{", text)
    if not m:
        return None
    i = m.end() - 1
    depth, start = 0, i
    for j in range(i, len(text)):
        c = text[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:j]
    return None


REQ_SKILL = re.compile(r"new SkillRequirement\(\s*Skill\.(\w+)\s*,\s*(\d+)")
REQ_QUEST = re.compile(r"new QuestRequirement\(\s*QuestHelperQuest\.([A-Z0-9_]+)")
REQ_QP = re.compile(r"new QuestPointRequirement\(\s*(\d+)")
REQ_CB = re.compile(r"new CombatLevelRequirement\(\s*(\d+)")


def extract_requirements(text):
    """Extract entry requirements from getGeneralRequirements(), resolving one
    level of local field references. Returns (reqs_dict, partial, note)."""
    body = _method_body(text, "getGeneralRequirements")
    if body is None:
        return {"skills": {}, "quests": [], "quest_points": None, "combat": None}, False, "no getGeneralRequirements()"

    skills, quests, qp, cb = {}, [], None, None

    def scan(src):
        nonlocal qp, cb
        for m in REQ_SKILL.finditer(src):
            sk, lv = m.group(1).lower(), int(m.group(2))
            skills[sk] = max(skills.get(sk, 0), lv)
        for m in REQ_QUEST.finditer(src):
            if m.group(1) not in quests:
                quests.append(m.group(1))
        m = REQ_QP.search(src)
        if m:
            qp = max(qp or 0, int(m.group(1)))
        m = REQ_CB.search(src)
        if m:
            cb = max(cb or 0, int(m.group(1)))

    scan(body)

    # resolve bare-identifier field references added in the body, e.g. req.add(barcrawl);
    idents = set(re.findall(r"(?:req\.add|add)\(\s*([a-z]\w*)\s*\)", body))
    for ident in idents:
        fm = re.search(r"\b" + re.escape(ident) + r"\s*=\s*new (\w+Requirement)\(([^;]*)", text)
        if fm:
            scan("new " + fm.group(1) + "(" + fm.group(2))

    # honesty: does the body add things we did NOT resolve?
    add_count = len(re.findall(r"(?:req\.add|\.add|return ImmutableList\.of|Arrays\.asList)\(", body))
    resolved = len(skills) + len(quests) + (1 if qp else 0) + (1 if cb else 0)
    has_other = bool(re.search(r"new (Varbit|Item|Favour|ItemRequirements|Zone|Chat)\w*Requirement|ComplexRequirement|Conditional", body))
    partial = has_other or add_count > max(resolved, 1)
    note = ""
    if has_other:
        note = "has varbit/item/complex entry requirements not captured"
    elif partial:
        note = "some entry requirements could not be statically resolved"
    return {"skills": skills, "quests": quests, "quest_points": qp, "combat": cb}, partial, note


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qh", default="/tmp/quest-helper")
    ap.add_argument("--qjava", default="/tmp/Quest.java")
    ap.add_argument("--out", default="assets/data/tools/quests.jsonl")
    a = ap.parse_args()
    qh = Path(a.qh)

    rl_names = parse_runelite_names(a.qjava)
    enum = parse_enum(qh / QH_ENUM, rl_names)
    order, cutoff = parse_order(qh / OQG)
    iron_order, _ = parse_order(qh / IRON)
    league = parse_league_regions(qh / LEAGUE)
    rank = {c: i for i, c in enumerate(order)}
    iron_rank = {c: i for i, c in enumerate(iron_order)}
    classes = index_classes(qh / HELPERS)

    records, partial_n, noreq_n = [], 0, 0
    for const, e in enum.items():
        # real quests carry a Type; skip developer/player-quest scaffolding
        if not e["type"]:
            continue
        reqs, partial, note = ({"skills": {}, "quests": [], "quest_points": None, "combat": None}, False, "")
        cls = e["class"]
        fpath = classes.get(cls)
        if fpath:
            reqs, partial, note = extract_requirements(read(fpath))
        else:
            note = f"helper class {cls} not found"
            partial = True
        # map prereq consts -> quest slugs (only those we actually emit are linkable in UI)
        prereq_slugs = [slug(c) for c in reqs["quests"]]
        r = {
            "id": slug(const),
            "name": e["name"],
            "type": e["type"],
            "difficulty": e["difficulty"],
            "order_rank": rank.get(const),
            "in_wiki_oqg": (const in rank) and (cutoff is None or rank[const] < cutoff),
            "ironman_rank": iron_rank.get(const),
            "req_skills": reqs["skills"],
            "req_quests": prereq_slugs,
            "req_quest_points": reqs["quest_points"],
            "req_combat": reqs["combat"],
            "req_partial": partial,
            "req_note": note,
            "league_regions": league.get(const, []),
            "src": STAMP,
        }
        records.append(r)
        partial_n += 1 if partial else 0
        noreq_n += 1 if note == "no getGeneralRequirements()" else 0

    # order: guide order first (by rank), then the rest alphabetically
    records.sort(key=lambda r: (r["order_rank"] is None, r["order_rank"] if r["order_rank"] is not None else 0, r["name"]))

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    ordered = sum(1 for r in records if r["order_rank"] is not None)
    print(f"wrote {len(records)} quests -> {out}")
    print(f"  in recommended order: {ordered} | unranked (not in guide): {len(records) - ordered}")
    print(f"  requirement extraction partial/flagged: {partial_n} | no entry reqs: {noreq_n}")
    print(f"  names resolved from RuneLite Quest.java: {len(rl_names)}")
    print(f"  quests tagged with league regions: {sum(1 for r in records if r['league_regions'])}")


if __name__ == "__main__":
    main()
