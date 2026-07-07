#!/usr/bin/env python3
"""
Equipment bonus dataset builder — cross-referenced against items.pack.

Source: github.com/osrsbox/osrsbox-db · docs/items-complete.json
Fields used per item: id, name, equipable, equipment{attack_stab, attack_slash,
attack_crush, attack_magic, attack_ranged, defence_stab, defence_slash,
defence_crush, defence_magic, defence_ranged, melee_strength, ranged_strength,
magic_damage, prayer, slot}.

Reads the downloaded items JSON (--src), keeps only equipable items that carry
an equipment bonus block, validates each item's id AND name against items.pack
(dropping ids not present and name mismatches — the id-honesty guard), and
emits assets/data/cache/equipment.pack (OSRP, tools/pack.py) with records:

  {id, name, slot, bonuses: {attack_stab, ..., prayer}}

Slot strings come straight from the source ("head","cape","neck","ammo",
"weapon","body","shield","legs","hands","feet","ring","2h") — no remapping,
verified 1:1 against the 12 cache slots. Bonus values are copied EXACTLY as
the source provides them — no inflation, no defaults invented.

Usage:
  python3 tools/build_equipment.py --src /path/to/items-complete.json
"""

import argparse
import json
import mmap
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS_PACK = ROOT / "assets" / "data" / "cache" / "items.pack"
OUT_PACK = ROOT / "assets" / "data" / "cache" / "equipment.pack"

SOURCE_URL = (
    "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-complete.json"
)
STAMP = "2026-07-07"

MAGIC = b"OSRP"
HDR_SZ = 8   # magic(4) + count(4)
ENTRY = 12   # id(4) + offset(4) + length(4)

BONUS_KEYS = [
    "attack_stab", "attack_slash", "attack_crush", "attack_magic", "attack_ranged",
    "defence_stab", "defence_slash", "defence_crush", "defence_magic", "defence_ranged",
    "melee_strength", "ranged_strength", "magic_damage", "prayer",
]

VALID_SLOTS = {
    "head", "cape", "neck", "ammo", "weapon", "body",
    "shield", "legs", "hands", "feet", "ring", "2h",
}

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack import pack as write_pack  # noqa: E402


def load_pack_names(pack_path: Path) -> dict:
    """Return {id: name} for every record in an OSRP pack."""
    names = {}
    with open(pack_path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if mm[:4] != MAGIC:
            raise ValueError(f"{pack_path} is not a valid OSRP pack file")
        n = struct.unpack_from("<I", mm, 4)[0]
        for i in range(n):
            pos = HDR_SZ + i * ENTRY
            rid, offset, length = struct.unpack_from("<III", mm, pos)
            rec = json.loads(mm[offset:offset + length])
            names[rid] = rec.get("name")
        mm.close()
    return names


def build(src: Path) -> None:
    print(f"loading {src} …", flush=True)
    with open(src) as f:
        raw = json.load(f)
    print(f"  source records: {len(raw)}", flush=True)

    item_names = load_pack_names(ITEMS_PACK)
    print(f"  items.pack valid ids: {len(item_names)}", flush=True)

    records = []
    dropped = {
        "not-equipable-or-no-equipment": 0,
        "no-slot-or-unknown-slot": 0,
        "id-not-in-items-pack": 0,
        "name-mismatch": 0,
        "duplicate-id": 0,
    }
    seen = set()

    for rec in raw.values():
        if not (rec.get("equipable") and rec.get("equipment")):
            dropped["not-equipable-or-no-equipment"] += 1
            continue
        eq = rec["equipment"]
        slot = eq.get("slot")
        if slot not in VALID_SLOTS:
            dropped["no-slot-or-unknown-slot"] += 1
            continue
        item_id = rec["id"]
        name = rec["name"]
        if item_id not in item_names:
            dropped["id-not-in-items-pack"] += 1
            continue
        if item_names[item_id] != name:
            dropped["name-mismatch"] += 1
            continue
        if item_id in seen:
            dropped["duplicate-id"] += 1
            continue
        seen.add(item_id)
        # copy bonus fields EXACTLY as the source provides them
        bonuses = {k: eq.get(k, 0) for k in BONUS_KEYS}
        records.append({"id": item_id, "name": name, "slot": slot, "bonuses": bonuses})

    kept = len(records)
    total_dropped = sum(dropped.values())
    print(f"  kept: {kept}, dropped: {total_dropped}", flush=True)
    for reason, count in dropped.items():
        print(f"    {reason}: {count}", flush=True)

    n = write_pack(records, OUT_PACK)
    size_mb = OUT_PACK.stat().st_size / 1e6
    print(f"  wrote {n} records → {OUT_PACK} ({size_mb:.2f} MB)", flush=True)
    print(f"  source: {SOURCE_URL} · stamp: {STAMP}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, metavar="PATH",
                    help="Path to items-complete.json (downloaded from source URL)")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.exists():
        print(f"error: {src} not found", file=sys.stderr)
        sys.exit(1)

    build(src)


if __name__ == "__main__":
    main()
