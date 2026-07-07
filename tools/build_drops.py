#!/usr/bin/env python3
"""
NPC drop-table dataset builder — cross-referenced against npcs.pack + items.pack.

Source: github.com/osrsbox/osrsbox-db · docs/monsters-complete.json
Fields used per monster: id, drops[{id, name, quantity, noted, rarity}].

Reads the downloaded monsters JSON (--src), keeps only NPC ids present in
npcs.pack, validates every drop's item id AND name against items.pack
(dropping mismatches — the id-honesty guard), and emits
assets/data/cache/drops.pack (OSRP, tools/pack.py) with records:

  {id: npcId, drops: [{itemId, itemName, qtyMin, qtyMax, rarity,
                       stackable, noted}]}

- quantity "1-5" → qtyMin 1 / qtyMax 5; single "N" → N/N; unparseable → drop
- rarity is the source's float probability (1 = always, 1/128 ≈ 0.0078);
  kept EXACTLY as sourced, entries outside (0, 1] are dropped
- stackable comes from items.pack (cache fact, lets the client stack loot
  honestly); noted is the source's noted flag

Usage:
  python3 tools/build_drops.py --src /path/to/monsters-complete.json
"""

import argparse
import json
import mmap
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NPCS_PACK = ROOT / "assets" / "data" / "cache" / "npcs.pack"
ITEMS_PACK = ROOT / "assets" / "data" / "cache" / "items.pack"
OUT_PACK = ROOT / "assets" / "data" / "cache" / "drops.pack"

SOURCE_URL = (
    "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json"
)
STAMP = "2026-07-07"

MAGIC = b"OSRP"
HDR_SZ = 8   # magic(4) + count(4)
ENTRY = 12   # id(4) + offset(4) + length(4)

QTY_INT = re.compile(r"^\d+$")
QTY_RANGE = re.compile(r"^(\d+)\s*[-–]\s*(\d+)$")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack import pack as write_pack  # noqa: E402


def load_pack_records(pack_path: Path) -> dict:
    """Return {id: record} for every record in an OSRP pack."""
    recs = {}
    with open(pack_path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if mm[:4] != MAGIC:
            raise ValueError(f"{pack_path} is not a valid OSRP pack file")
        n = struct.unpack_from("<I", mm, 4)[0]
        for i in range(n):
            pos = HDR_SZ + i * ENTRY
            rid, offset, length = struct.unpack_from("<III", mm, pos)
            recs[rid] = json.loads(mm[offset:offset + length])
        mm.close()
    return recs


def parse_qty(q):
    """'1' → (1, 1); '1-5' → (1, 5); anything else → None."""
    s = str(q).replace(",", "").strip()
    if QTY_INT.match(s):
        n = int(s)
        return (n, n)
    m = QTY_RANGE.match(s)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return (min(lo, hi), max(lo, hi))
    return None


def build(src: Path) -> None:
    print(f"loading {src} …", flush=True)
    with open(src) as f:
        raw = json.load(f)
    print(f"  source monsters: {len(raw)}", flush=True)

    npc_ids = set(load_pack_records(NPCS_PACK))
    items = load_pack_records(ITEMS_PACK)
    print(f"  npcs.pack valid ids: {len(npc_ids)} · items.pack valid ids: {len(items)}",
          flush=True)

    records = []
    npc_dropped = {"id-not-in-npcs-pack": 0, "no-valid-drops": 0}
    entry_dropped = {"item-id-not-in-items-pack": 0, "item-name-mismatch": 0,
                     "bad-quantity": 0, "bad-rarity": 0}
    kept_entries = 0

    for rec in raw.values():
        npc_id = rec.get("id")
        if npc_id not in npc_ids:
            npc_dropped["id-not-in-npcs-pack"] += 1
            continue
        drops = []
        for d in rec.get("drops") or []:
            item = items.get(d.get("id"))
            if item is None:
                entry_dropped["item-id-not-in-items-pack"] += 1
                continue
            if item.get("name") != d.get("name"):
                entry_dropped["item-name-mismatch"] += 1
                continue
            qty = parse_qty(d.get("quantity"))
            if qty is None:
                entry_dropped["bad-quantity"] += 1
                continue
            rarity = d.get("rarity")
            if not isinstance(rarity, (int, float)) or not (0 < rarity <= 1):
                entry_dropped["bad-rarity"] += 1
                continue
            drops.append({
                "itemId": d["id"],
                "itemName": d["name"],
                "qtyMin": qty[0],
                "qtyMax": qty[1],
                "rarity": rarity,
                "stackable": bool(item.get("stackable")),
                "noted": bool(d.get("noted")),
            })
        if not drops:
            npc_dropped["no-valid-drops"] += 1
            continue
        kept_entries += len(drops)
        records.append({"id": npc_id, "drops": drops})

    print(f"  kept npcs: {len(records)} ({kept_entries} drop entries)", flush=True)
    print(f"  dropped npcs: {sum(npc_dropped.values())}", flush=True)
    for reason, count in npc_dropped.items():
        print(f"    {reason}: {count}", flush=True)
    print(f"  dropped drop entries: {sum(entry_dropped.values())}", flush=True)
    for reason, count in entry_dropped.items():
        print(f"    {reason}: {count}", flush=True)

    n = write_pack(records, OUT_PACK)
    size_mb = OUT_PACK.stat().st_size / 1e6
    print(f"  wrote {n} records → {OUT_PACK} ({size_mb:.2f} MB)", flush=True)
    print(f"  source: {SOURCE_URL} · stamp: {STAMP}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, metavar="PATH",
                    help="Path to monsters-complete.json (downloaded from source URL)")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.exists():
        print(f"error: {src} not found", file=sys.stderr)
        sys.exit(1)

    build(src)


if __name__ == "__main__":
    main()
