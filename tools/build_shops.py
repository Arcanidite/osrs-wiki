#!/usr/bin/env python3
"""
Shop stock dataset builder — RSPS-derived, cross-referenced against
items.pack + npcs.pack.

Source: github.com/apollo-rsps/apollo (RSPS, revision 377) —
  game/plugin/locations/{lumbridge,varrock,falador,al-kharid,edgeville}/src/
  shops.plugin.kts
The Kotlin shop DSL files are parsed for DATA ONLY (shop names, operator NPC
names, stock item names/amounts, buy policy) — no code is copied. Item values
(base price) come from osrsbox-db items-complete.json (`cost`).

RSPS-derived approximation — server emulations vary from live OSRS.
Apollo targets revision 377 (2006); starter-town shop stock is largely stable
into OSRS but is NOT live-verified. Price multipliers used by the client
(specialty sells at value, general at ceil(0.8×value); buys at 0.6×/0.4×value)
are Apollo's, cited in GAME_KB.

Validation (id-honesty):
- stock item names resolve case-insensitively against items.pack; when the
  exact name is absent, the documented cache suffix conventions
  "<name> (Unpoisoned)" / "<name> (item)" are tried; still unresolved → DROPPED
  (never guessed). Explicit-id DSL entries are validated by id and take the
  pack's canonical name.
- operator NPC names must exist in npcs.pack with a Trade action.
- "Shop keeper"/"Shop assistant" name the general-store keepers AND the
  Varrock swordshop pair in OSRS; the swordshop is bound by explicit npc ids
  2884/2885, verified by their spawn coordinates (3203,3397)/(3205,3399) — the
  swordshop building — in npc-spawns (all other ids spawn at general stores).

Emits assets/data/cache/shops.pack (OSRP) records:
  {id, name, buys: "any"|"owned", npcIds: [..], npcNames: [..],
   stock: [{itemId, itemName, qty, value}]}

Usage:
  python3 tools/build_shops.py --apollo /path/to/apollo --items /path/to/items-complete.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS_PACK = ROOT / "assets" / "data" / "cache" / "items.pack"
NPCS_PACK = ROOT / "assets" / "data" / "cache" / "npcs.pack"
OUT_PACK = ROOT / "assets" / "data" / "cache" / "shops.pack"

SOURCE_URL = "https://github.com/apollo-rsps/apollo"
VALUES_URL = (
    "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-complete.json"
)
STAMP = "2026-07-07"

SHOP_FILES = [
    "game/plugin/locations/lumbridge/src/shops.plugin.kts",
    "game/plugin/locations/varrock/src/shops.plugin.kts",
    "game/plugin/locations/falador/src/shops.plugin.kts",
    "game/plugin/locations/al-kharid/src/shops.plugin.kts",
    "game/plugin/locations/edgeville/src/shops.plugin.kts",
]

# The general stores share one identical stock table; collapse them into a
# single record bound by npc NAME (all "Shop keeper"/"Shop assistant"/
# "Shopkeeper" variants), EXCEPT the Varrock swordshop pair which is bound by
# explicit id below (spawn-coordinate-verified).
GENERAL_STORE_NAMES = ["Shop keeper", "Shop assistant", "Shopkeeper"]
SWORDSHOP_NPC_IDS = [2884, 2885]

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack import pack as write_pack  # noqa: E402
from build_drops import load_pack_records  # noqa: E402


# ── Apollo shop DSL parser (data extraction only) ───────────────────────────

RE_SHOP = re.compile(r'^shop\("(.+?)"\)\s*\{')
RE_OPERATED = re.compile(r'^operated by (.+)$')
RE_OP_NAME = re.compile(r'"([^"]+)"')
RE_BUYS_ANY = re.compile(r'^buys any items')
RE_CATEGORY = re.compile(r'^category\(\s*"(.+?)"(.*?)\)\s*\{')
RE_SELL_ONE = re.compile(r'^sell\((\d+)\)\s+of\s+"(.+?)"$')
RE_SELL_ID = re.compile(r'^sell\((\d+)\)\s+of\s+\{\s*"(.+?)"\((\d+)\)\s*\}$')
RE_SELL_BLOCK = re.compile(r'^sell\((\d+)\)\s+of\s+\{$')
RE_BLOCK_ITEM = re.compile(r'^-"(.+?)"(?:\((\d+)\))?$')


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*", "", text)


def parse_shops(kts_text):
    """→ [{name, buys, operators: [names], items: [(label, qty, explicitId)]}]"""
    shops = []
    shop = None
    cat = None          # (categoryName, affix, depluralise)
    sell_block = None   # pending qty for a -"item" block
    for raw in strip_comments(kts_text).splitlines():
        line = raw.strip()
        if not line:
            continue
        m = RE_SHOP.match(line)
        if m:
            shop = {"name": m.group(1), "buys": "owned", "operators": [], "items": []}
            shops.append(shop)
            continue
        if shop is None:
            continue
        m = RE_OPERATED.match(line)
        if m:
            shop["operators"] += RE_OP_NAME.findall(m.group(1))
            continue
        if RE_BUYS_ANY.match(line):
            shop["buys"] = "any"
            continue
        m = RE_CATEGORY.match(line)
        if m:
            name, opts = m.group(1), m.group(2)
            affix = "prefix" if "prefix" in opts else "nothing" if "nothing" in opts else "suffix"
            deplural = "depluralise = false" not in opts
            cat = (name[:-1] if deplural and name.endswith("s") else name, affix)
            continue
        m = RE_SELL_ID.match(line)
        if m:
            shop["items"].append((m.group(2), int(m.group(1)), int(m.group(3))))
            continue
        m = RE_SELL_ONE.match(line)
        if m:
            shop["items"].append((join_cat(m.group(2), cat), int(m.group(1)), None))
            continue
        m = RE_SELL_BLOCK.match(line)
        if m:
            sell_block = int(m.group(1))
            continue
        m = RE_BLOCK_ITEM.match(line)
        if m and sell_block is not None:
            explicit = int(m.group(2)) if m.group(2) else None
            label = m.group(1) if explicit else join_cat(m.group(1), cat)
            shop["items"].append((label, sell_block, explicit))
            continue
        if line == "}":
            if sell_block is not None:
                sell_block = None
            elif cat is not None:
                cat = None
            else:
                shop = None
    return shops


def join_cat(item, cat):
    if not cat:
        return item
    name, affix = cat
    if affix == "prefix":
        return f"{name} {item}"
    if affix == "nothing":
        return item
    return f"{item} {name}"


# ── build ────────────────────────────────────────────────────────────────────

def build(apollo: Path, items_src: Path) -> None:
    items = load_pack_records(ITEMS_PACK)
    npcs = load_pack_records(NPCS_PACK)
    by_lower = {}
    for r in items.values():
        by_lower.setdefault(r["name"].lower(), r)
    print(f"items.pack ids: {len(items)} · npcs.pack ids: {len(npcs)}", flush=True)

    print(f"loading item values from {items_src} …", flush=True)
    with open(items_src) as f:
        osrsbox = json.load(f)
    cost = {v["id"]: v.get("cost", 0) for v in osrsbox.values()}

    def resolve(label, explicit_id):
        """→ items.pack record or None. Documented suffix conventions only."""
        if explicit_id is not None:
            return items.get(explicit_id)
        for cand in (label, f"{label} (Unpoisoned)", f"{label} (item)"):
            rec = by_lower.get(cand.lower())
            if rec:
                return rec
        return None

    parsed = []
    for rel in SHOP_FILES:
        parsed += parse_shops((apollo / rel).read_text())
    print(f"parsed shops: {len(parsed)}", flush=True)

    general = None
    records = []
    dropped_items = []
    dropped_shops = []
    npc_name_trade = {}
    for r in npcs.values():
        if "Trade" in (r.get("actions") or []):
            npc_name_trade.setdefault(r["name"], []).append(r["id"])

    next_id = 1
    for shop in parsed:
        stock = []
        for label, qty, explicit in shop["items"]:
            rec = resolve(label, explicit)
            if rec is None:
                dropped_items.append((shop["name"], label))
                continue
            stock.append({
                "itemId": rec["id"], "itemName": rec["name"],
                "qty": qty, "value": cost.get(rec["id"], 0),
                "stackable": bool(rec.get("stackable")),
            })
        is_general = "General Store" in shop["name"]
        if is_general:
            if general is not None:
                continue  # identical stock — collapsed into one record
            general = {
                "id": next_id, "name": "General Store", "buys": "any",
                "npcIds": [], "npcNames": GENERAL_STORE_NAMES, "stock": stock,
            }
            records.append(general)
            next_id += 1
            continue
        if shop["name"] == "Varrock Swordshop.":
            npc_ids, npc_names = SWORDSHOP_NPC_IDS, []
        else:
            npc_ids = []
            npc_names = [op for op in shop["operators"] if op in npc_name_trade]
            missing_ops = [op for op in shop["operators"] if op not in npc_name_trade]
            if missing_ops:
                print(f"  operator(s) without Trade npc in npcs.pack for "
                      f"{shop['name']}: {missing_ops}", flush=True)
        if not npc_ids and not npc_names:
            dropped_shops.append((shop["name"], "no bindable operator"))
            continue
        if not stock:
            dropped_shops.append((shop["name"], "no valid stock"))
            continue
        records.append({
            "id": next_id, "name": shop["name"].rstrip("."), "buys": shop["buys"],
            "npcIds": npc_ids, "npcNames": npc_names, "stock": stock,
        })
        next_id += 1

    kept_entries = sum(len(r["stock"]) for r in records)
    print(f"kept shops: {len(records)} ({kept_entries} stock entries)", flush=True)
    print(f"dropped shops: {len(dropped_shops)}", flush=True)
    for name, why in dropped_shops:
        print(f"  {name}: {why}", flush=True)
    print(f"dropped stock entries (unresolvable item name): {len(dropped_items)}", flush=True)
    for shop_name, label in dropped_items:
        print(f"  {shop_name}: {label!r}", flush=True)

    n = write_pack(records, OUT_PACK)
    print(f"wrote {n} records → {OUT_PACK} ({OUT_PACK.stat().st_size} B)", flush=True)
    print(f"source: {SOURCE_URL} + {VALUES_URL} · stamp: {STAMP}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apollo", required=True, metavar="DIR",
                    help="Path to a checkout of github.com/apollo-rsps/apollo")
    ap.add_argument("--items", required=True, metavar="PATH",
                    help="Path to osrsbox items-complete.json (for item values)")
    args = ap.parse_args()
    build(Path(args.apollo), Path(args.items))


if __name__ == "__main__":
    main()
