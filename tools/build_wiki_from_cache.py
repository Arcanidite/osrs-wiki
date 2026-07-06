#!/usr/bin/env python3
"""
Populate wiki topics/entries from the RuneLite cache extraction packs.

Reads  assets/data/cache/{items,npcs}.pack  (+ assets/data/tools/steps.jsonl)
and emits, idempotently (regenerates everything marked generated):

  graph.json            — category/db/skill nodes + child/related edges
                          (nodes carry meta.generated=true; hand nodes untouched)
  <url>/index.html      — full-bodied pages (not stubs):
                            * database browser pages (client-rendered from packs)
                            * per-skill pages with SSR equipment-unlock tables
                            * hub index pages with children + counts
  then runs build.py    — regenerates _data/nav|sitemap|comboboxes|related.json
                          and assets/data/catalog.json from the expanded graph

Honesty rules (PROGRESSION_ROUTER_BRIEF.md §9, tools/kb/GAME_KB.md):
  - Only fields present in the cache are rendered; nothing is estimated.
  - objects.pack names are garbage (see GAME_GOTCHAS.md G-2) → no object entries.
  - Every generated page carries a source/stamp line.
"""

import json
import mmap
import re
import struct
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "assets" / "data" / "cache"
GRAPH_PATH = ROOT / "graph.json"
STAMP = "2026-07-06"
SOURCE_LINE = (
    f'<p class="data-source">Source: RuneLite cache extraction '
    f'(<code>{{pack}}</code>) · stamp {STAMP}. Only fields present in the game '
    f'cache are shown — nothing here is estimated or hand-invented.</p>'
)

SKILLS = [
    "attack", "strength", "defence", "hitpoints", "ranged", "prayer", "magic",
    "cooking", "woodcutting", "fletching", "fishing", "firemaking", "crafting",
    "smithing", "mining", "herblore", "agility", "thieving", "slayer",
    "farming", "runecraft", "hunter", "construction",
]
SKILL_SUMMARIES = {  # neutral one-liners; hand-authored summaries are preserved over these
    "attack": "Melee accuracy skill.", "strength": "Melee max-hit skill.",
    "defence": "Reduces chance of being hit; gates armour.", "hitpoints": "Your life points.",
    "ranged": "Ranged combat skill.", "prayer": "Prayer points and protection prayers.",
    "magic": "Spellcasting and magic accuracy.", "cooking": "Cook food for healing.",
    "woodcutting": "Chop trees for logs.", "fletching": "Craft bows and ammunition.",
    "fishing": "Catch fish.", "firemaking": "Light fires and lanterns.",
    "crafting": "Craft jewellery, leather and glass.", "smithing": "Smelt and smith metal gear.",
    "mining": "Mine ores and gems.", "herblore": "Mix potions.",
    "agility": "Shortcuts and run energy.", "thieving": "Pickpocket and steal.",
    "slayer": "Assigned monster hunting; gates many monsters.", "farming": "Grow crops.",
    "runecraft": "Craft runes from essence.", "hunter": "Trap creatures.",
    "construction": "Build a player-owned house.",
}
SLOTS = ["head", "cape", "neck", "ammo", "weapon", "2h", "shield", "body",
         "legs", "hands", "feet", "ring"]
CB_BRACKETS = [("lvl-1-20", 1, 20), ("lvl-21-50", 21, 50), ("lvl-51-100", 51, 100),
               ("lvl-101-200", 101, 200), ("lvl-200-plus", 201, 100000)]


def read_pack(path):
    with open(path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        n = struct.unpack_from("<I", mm, 4)[0]
        return [json.loads(mm[off:off + ln]) for _, off, ln in
                (struct.unpack_from("<III", mm, 8 + i * 12) for i in range(n))]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def existing_summary(path):
    """Preserve a hand-authored frontmatter summary if the page exists."""
    if not path.exists():
        return None
    m = re.search(r'^summary:\s*"(.*)"\s*$', path.read_text(), re.M)
    return m.group(1) if m and m.group(1) else None


# ── graph ────────────────────────────────────────────────────────────────────

def node(nid, label, url, ntype, slots, summary, tags, extra_meta=None):
    return {
        "id": nid, "label": label, "url": url, "type": ntype, "slots": slots,
        "meta": {"summary": summary, "tags": tags, "generated": True,
                 **(extra_meta or {})},
    }


def edge(f, t, rel):
    return {"from": f, "to": t, "rel": rel, "generated": True}


def expand_graph(graph, counts):
    nodes = [n for n in graph["nodes"] if not n.get("meta", {}).get("generated")]
    edges = [e for e in graph["edges"] if not e.get("generated")]
    have = {n["id"] for n in nodes}
    add_n, add_e = [], []

    def add(n, parent=None, rel="child"):
        if n["id"] in have:
            return
        add_n.append(n)
        have.add(n["id"])
        if parent:
            add_e.append(edge(parent, n["id"], rel))

    # Item database + categories
    add(node("item-db", "Item Database", "/items/all", "group",
             ["nav", "sitemap", "search"],
             f"Browse all {counts['items']:,} items from the game cache — "
             "stats, requirements, examine text.", ["items", "database"]), "items")
    add(node("item-equipment", "Equipment", "/items/equipment", "group",
             ["nav", "sitemap", "search"],
             f"All {counts['equipable']:,} equipable items by slot.",
             ["items", "equipment"]), "items")
    for slot in SLOTS:
        add(node(f"item-slot-{slot}", slot.capitalize() + (" slot" if slot != "2h" else " weapons"),
                 f"/items/equipment/{slot}", "group", ["sitemap", "search"],
                 f"{counts['slots'][slot]:,} {slot} items from the cache.",
                 ["items", "equipment"]), "item-equipment")
    add(node("item-quest-items", "Quest Items", "/items/quest-items", "group",
             ["sitemap", "search"],
             f"{counts['quest_items']:,} quest-flagged items.", ["items", "quests"]), "items")

    # Monsters hub (page exists on disk but had no graph node) + bestiary + brackets
    add(node("monsters", "Monsters", "/combat/monsters", "group",
             ["nav", "sitemap", "search"],
             f"{counts['attackable']:,} attackable monsters from the cache.",
             ["combat", "monsters"]), "combat")
    for mid in ("monster-abyssal-demon", "monster-kbd", "monster-zulrah"):
        if mid in have and not any(e["to"] == mid and e["rel"] == "child" for e in edges):
            add_e.append(edge("monsters", mid, "child"))
    add(node("bestiary", "Bestiary", "/combat/bestiary", "group",
             ["nav", "sitemap", "search"],
             f"All {counts['attackable']:,} attackable monsters from the cache — "
             "combat level, stats, actions.", ["combat", "monsters", "database"]), "combat")
    for bid, lo, hi in CB_BRACKETS:
        label = f"Combat {lo}–{hi}" if hi < 100000 else "Combat 200+"
        add(node(f"bestiary-{bid}", label, f"/combat/monsters/{bid}", "group",
                 ["sitemap", "search"],
                 f"{counts['brackets'][bid]:,} monsters in this bracket.",
                 ["combat", "monsters"]), "monsters")

    # NPC directory (non-combat included)
    add(node("npc-directory", "NPC Directory", "/npcs", "group",
             ["sitemap", "search"],
             f"All {counts['npcs']:,} NPCs from the cache — actions, tags, combat.",
             ["npcs", "database"]), "root")

    # Skills — ensure all 23 exist (slots mirror the hand-authored skill nodes)
    for sk in SKILLS:
        add(node(sk, sk.capitalize(), f"/skills/{sk}", "page",
                 ["nav", "sitemap", "search"],
                 SKILL_SUMMARIES[sk], ["skills"]), "skills")
    add_e.append(edge("item-equipment", "item-db", "related"))
    add_e.append(edge("bestiary", "npc-directory", "related"))

    graph["nodes"] = nodes + add_n
    graph["edges"] = edges + add_e
    return graph


# ── pages ────────────────────────────────────────────────────────────────────

def frontmatter(front):
    lines = ["---"]
    for k, v in front.items():
        lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def write_page(url, front, body):
    path = ROOT / url.strip("/") / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter(front) + "\n\n" + body + "\n", encoding="utf-8")
    return path


def db_page(url, nid, title, summary, kind, dbfilter, breadcrumb, tags):
    front = {
        "layout": "tool", "title": title, "node_id": nid, "summary": summary,
        "page_class": "tool", "tags": tags, "breadcrumb": breadcrumb,
        "children": [], "tool_script": "/assets/js/tools/db.js",
    }
    body = (
        f'<div id="db-root" data-db-kind="{kind}" '
        f"data-db-filter='{json.dumps(dbfilter)}'></div>\n"
        '<noscript><p>The database browser requires JavaScript. Raw data: '
        '<code>/assets/data/cache/</code>.</p></noscript>\n'
        + SOURCE_LINE.format(pack=f"{kind}.pack")
    )
    write_page(url, front, body)


def hub_page(url, nid, title, summary, children, breadcrumb, tags, extra_html=""):
    front = {
        "layout": "node", "title": title, "node_id": nid, "summary": summary,
        "page_class": "", "tags": tags, "breadcrumb": breadcrumb,
        "children": children,
    }
    kids = "\n".join(
        f'  <li><a href="{{{{ site.baseurl }}}}{c["url"]}">{c["label"]}</a>'
        + (f' <span class="hub-count">{c["count"]:,}</span>' if c.get("count") else "")
        + "</li>"
        for c in children)
    body = f'<ul class="node-children">\n{kids}\n</ul>\n{extra_html}'
    write_page(url, front, body)


def skill_page(sk, items, steps):
    url = f"/skills/{sk}"
    path = ROOT / url.strip("/") / "index.html"
    summary = existing_summary(path) or SKILL_SUMMARIES[sk]

    unlocks = sorted(
        (i for i in items if i["reqs"] and sk in i["reqs"]),
        key=lambda i: (i["reqs"][sk], i["name"]))
    sections = []

    if unlocks:
        by_lvl = defaultdict(list)
        for i in unlocks:
            by_lvl[i["reqs"][sk]].append(i)
        rows = []
        for lvl in sorted(by_lvl):
            for i in by_lvl[lvl]:
                other = ", ".join(f"{k} {v}" for k, v in sorted(i["reqs"].items()) if k != sk)
                rows.append(
                    "<tr>"
                    f"<td>{lvl}</td>"
                    f'<td><span class="sri-sprite" data-item-id="{i["id"]}">'
                    f'{esc(i["name"][0])}</span> '
                    f'<a href="{{{{ site.baseurl }}}}/items/all/#{i["id"]}">{esc(i["name"])}</a></td>'
                    f'<td>{esc(i["slot"] or "")}</td>'
                    f'<td>{"members" if i["members"] else "F2P"}</td>'
                    f"<td>{esc(other)}</td>"
                    "</tr>")
        sections.append(
            f"<section><h2>Equipment unlocks ({len(unlocks):,})</h2>\n"
            '<table class="data-table"><thead><tr>'
            f"<th>{sk.capitalize()} level</th><th>Item</th><th>Slot</th>"
            "<th>Access</th><th>Other reqs</th></tr></thead>\n<tbody>\n"
            + "\n".join(rows) + "\n</tbody></table></section>")

    sk_steps = [s for s in steps
                if (s.get("xp") or {}).get(sk) or isinstance((s.get("grants") or {}).get(sk), (int, float))]
    if sk_steps:
        rows = []
        for s in sk_steps:
            xp = (s.get("xp") or {}).get(sk)
            to_lvl = (s.get("grants") or {}).get(sk)
            rows.append(
                "<tr>"
                f"<td>{esc(s['label'])}</td>"
                f"<td>{esc(s.get('detail') or '')}</td>"
                f"<td>{f'{xp:,} xp' if xp else '—'}</td>"
                f"<td>{f'level {to_lvl}' if to_lvl else '—'}</td>"
                "</tr>")
        sections.append(
            "<section><h2>Training steps (progression data)</h2>\n"
            '<table class="data-table"><thead><tr><th>Step</th><th>Detail</th>'
            "<th>XP</th><th>Reaches</th></tr></thead>\n<tbody>\n"
            + "\n".join(rows) + "\n</tbody></table>\n"
            '<p class="data-source">Source: hand-curated progression data '
            '(<code>assets/data/tools/steps.jsonl</code>) — XP amounts are sourced; '
            "no time/rate estimates.</p></section>")

    front = {
        "layout": "node", "title": sk.capitalize(), "node_id": sk,
        "summary": summary, "page_class": "",
        "tags": ["skills"] + (["combat"] if sk in
                              ("attack", "strength", "defence", "hitpoints", "ranged", "prayer", "magic") else []),
        "breadcrumb": [{"label": "Skills", "url": "/skills"}], "children": [],
    }
    body = "\n".join(sections)
    if unlocks:
        body += "\n" + SOURCE_LINE.format(pack="items.pack")
    write_page(url, front, body)
    return len(unlocks), len(sk_steps)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    items = read_pack(CACHE / "items.pack")
    npcs = read_pack(CACHE / "npcs.pack")
    steps = [json.loads(l) for l in
             (ROOT / "assets/data/tools/steps.jsonl").read_text().strip().split("\n")]

    attackable = [n for n in npcs if "Attack" in (n["actions"] or [])]
    counts = {
        "items": len(items),
        "equipable": sum(1 for i in items if i["equipable"]),
        "slots": {s: sum(1 for i in items if i["slot"] == s) for s in SLOTS},
        "quest_items": sum(1 for i in items if i["quest_item"]),
        "npcs": len(npcs),
        "attackable": len(attackable),
        "brackets": {bid: sum(1 for n in attackable if lo <= n["combat_level"] <= hi)
                     for bid, lo, hi in CB_BRACKETS},
    }

    graph = json.loads(GRAPH_PATH.read_text())
    graph = expand_graph(graph, counts)
    GRAPH_PATH.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n")

    ib = [{"label": "Items", "url": "/items"}]
    cb = [{"label": "Combat", "url": "/combat"}]

    # database pages
    db_page("/items/all", "item-db", "Item Database",
            f"All {counts['items']:,} items from the game cache.",
            "items", {}, ib, ["items", "database"])
    db_page("/items/weapons", "weapons", "Weapons",
            f"{counts['slots']['weapon'] + counts['slots']['2h']:,} weapons (1h and 2h) from the cache.",
            "items", {"slot": ["weapon", "2h"]}, ib, ["items", "combat"])
    db_page("/items/armour", "armour", "Armour",
            "Wearable defensive equipment from the cache.",
            "items", {"slot": ["head", "body", "legs", "shield", "hands", "feet"]},
            ib, ["items", "combat"])
    db_page("/items/runes", "runes", "Runes",
            "Runes for spellcasting (all items named “… rune”).",
            "items", {"nameSuffix": " rune"}, ib, ["items", "magic"])
    db_page("/items/quest-items", "item-quest-items", "Quest Items",
            f"{counts['quest_items']:,} quest-flagged items.",
            "items", {"questItem": True}, ib, ["items", "quests"])
    for slot in SLOTS:
        db_page(f"/items/equipment/{slot}", f"item-slot-{slot}",
                f"{slot.capitalize()} slot" if slot != "2h" else "Two-handed weapons",
                f"{counts['slots'][slot]:,} {slot} items.",
                "items", {"slot": [slot]},
                ib + [{"label": "Equipment", "url": "/items/equipment"}],
                ["items", "equipment"])
    db_page("/combat/bestiary", "bestiary", "Bestiary",
            f"All {counts['attackable']:,} attackable monsters.",
            "npcs", {"attackable": True}, cb, ["combat", "monsters"])
    for bid, lo, hi in CB_BRACKETS:
        title = f"Monsters — combat {lo}–{hi}" if hi < 100000 else "Monsters — combat 200+"
        db_page(f"/combat/monsters/{bid}", f"bestiary-{bid}", title,
                f"{counts['brackets'][bid]:,} attackable monsters in this bracket.",
                "npcs", {"attackable": True, "cbMin": lo, "cbMax": hi},
                cb + [{"label": "Monsters", "url": "/combat/monsters"}],
                ["combat", "monsters"])
    db_page("/npcs", "npc-directory", "NPC Directory",
            f"All {counts['npcs']:,} NPCs — shopkeepers, quest givers, monsters.",
            "npcs", {}, [], ["npcs", "database"])

    # hub pages
    hub_page("/items/equipment", "item-equipment", "Equipment",
             f"All {counts['equipable']:,} equipable items, by slot.",
             [{"label": (s.capitalize() + " slot" if s != "2h" else "Two-handed"),
               "url": f"/items/equipment/{s}", "count": counts["slots"][s]} for s in SLOTS],
             ib, ["items", "equipment"])
    hub_page("/items", "items", "Items",
             f"{counts['items']:,} items extracted from the game cache.",
             [{"label": "Item Database", "url": "/items/all", "count": counts["items"]},
              {"label": "Equipment", "url": "/items/equipment", "count": counts["equipable"]},
              {"label": "Weapons", "url": "/items/weapons",
               "count": counts["slots"]["weapon"] + counts["slots"]["2h"]},
              {"label": "Armour", "url": "/items/armour"},
              {"label": "Runes", "url": "/items/runes"},
              {"label": "Quest Items", "url": "/items/quest-items", "count": counts["quest_items"]}],
             [], ["items"])
    hub_page("/combat/monsters", "monsters", "Monsters",
             f"{counts['attackable']:,} attackable monsters from the cache.",
             [{"label": "Bestiary (all)", "url": "/combat/bestiary", "count": counts["attackable"]}]
             + [{"label": (f"Combat {lo}–{hi}" if hi < 100000 else "Combat 200+"),
                 "url": f"/combat/monsters/{bid}", "count": counts["brackets"][bid]}
                for bid, lo, hi in CB_BRACKETS]
             + [{"label": "Abyssal Demon", "url": "/combat/monsters/abyssal-demon"},
                {"label": "King Black Dragon", "url": "/combat/monsters/kbd"},
                {"label": "Zulrah", "url": "/combat/monsters/zulrah"}],
             cb, ["combat", "monsters"])

    # skill pages
    unlock_totals = {}
    for sk in SKILLS:
        u, t = skill_page(sk, items, steps)
        unlock_totals[sk] = u
    hub_page("/skills", "skills", "Skills",
             "All 23 skills.",
             [{"label": sk.capitalize(), "url": f"/skills/{sk}",
               "count": unlock_totals[sk] or None} for sk in SKILLS],
             [], ["skills"])

    print(f"graph: {len(graph['nodes'])} nodes / {len(graph['edges'])} edges")
    print(f"items {counts['items']}, equipable {counts['equipable']}, "
          f"npcs {counts['npcs']}, attackable {counts['attackable']}")
    print("running build.py …")
    subprocess.run([sys.executable, str(ROOT / "build.py")], check=True)


if __name__ == "__main__":
    main()
