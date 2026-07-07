#!/usr/bin/env python3
"""
NPC spawn-point dataset builder — cross-referenced against npcs.pack.

Source: github.com/mejrs/data_osrs · NPCList_OSRS.json
Fields used: id (NPC id), x (world x), y (world y), p (plane 0-3).

Reads the downloaded spawn JSON (--src), validates each entry's NPC id against
npcs.pack (dropping ids not present), buckets by region + plane, and emits:

  assets/data/cache/npc-spawns/<rid>.json.gz          plane 0
  assets/data/cache/npc-spawns/<rid>.<plane>.json.gz  planes 1-3
  assets/data/cache/npc-spawns/manifest.json

Each per-region file: [[npcId, localX, localY], ...]  (localX=x&63, localY=y&63)
Gzip compression level 9.

Region formula (matches world client + openrs2_extract):
  rid = ((x >> 6) << 8) | (y >> 6)
  localX = x & 63
  localY = y & 63

Usage:
  python3 tools/build_npc_spawns.py \\
      --src /path/to/NPCList_OSRS.json
"""

import argparse
import gzip
import json
import mmap
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK_PATH = ROOT / "assets" / "data" / "cache" / "npcs.pack"
OUT_DIR = ROOT / "assets" / "data" / "cache" / "npc-spawns"

SOURCE_URL = (
    "https://raw.githubusercontent.com/mejrs/data_osrs/master/NPCList_OSRS.json"
)
STAMP = "2026-07-07"

MAGIC = b"OSRP"
HDR_SZ = 8   # magic(4) + count(4)
ENTRY = 12   # id(4) + offset(4) + length(4)


def load_valid_npc_ids(pack_path: Path) -> set:
    """Return the set of NPC ids present in npcs.pack."""
    ids = set()
    with open(pack_path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if mm[:4] != MAGIC:
            raise ValueError(f"{pack_path} is not a valid OSRP pack file")
        n = struct.unpack_from("<I", mm, 4)[0]
        for i in range(n):
            pos = HDR_SZ + i * ENTRY
            npc_id = struct.unpack_from("<I", mm, pos)[0]
            ids.add(npc_id)
        mm.close()
    return ids


def build(src: Path) -> None:
    # ── load source ──────────────────────────────────────────────────────────
    print(f"loading {src} …", flush=True)
    with open(src) as f:
        raw = json.load(f)
    print(f"  source records: {len(raw)}", flush=True)

    # ── validate ids against npcs.pack ───────────────────────────────────────
    valid_ids = load_valid_npc_ids(PACK_PATH)
    print(f"  npcs.pack valid ids: {len(valid_ids)}", flush=True)

    buckets = {}      # (rid, plane) -> [[npcId, localX, localY], ...]
    kept = 0
    dropped = 0
    missing_ids = set()

    for rec in raw:
        npc_id = rec.get("id")
        x = rec.get("x")
        y = rec.get("y")
        plane = rec.get("p", 0)

        # skip records without essential fields
        if npc_id is None or x is None or y is None:
            dropped += 1
            continue

        if npc_id not in valid_ids:
            dropped += 1
            missing_ids.add(npc_id)
            continue

        rid = ((x >> 6) << 8) | (y >> 6)
        local_x = x & 63
        local_y = y & 63
        key = (rid, plane)
        if key not in buckets:
            buckets[key] = []
        buckets[key].append([npc_id, local_x, local_y])
        kept += 1

    print(f"  kept: {kept}, dropped: {dropped} "
          f"({len(missing_ids)} distinct missing NPC ids)", flush=True)

    # ── emit per-region gzip files ───────────────────────────────────────────
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # remove stale files
    for f in OUT_DIR.glob("*.json.gz"):
        f.unlink()

    regions_manifest = {}
    for (rid, plane), entries in sorted(buckets.items()):
        if not entries:
            continue
        name = f"{rid}.json.gz" if plane == 0 else f"{rid}.{plane}.json.gz"
        payload = json.dumps(entries, separators=(",", ":")).encode()
        (OUT_DIR / name).write_bytes(gzip.compress(payload, compresslevel=9))
        regions_manifest[f"{rid}:{plane}"] = len(entries)

    # ── manifest ─────────────────────────────────────────────────────────────
    manifest = {
        "source": SOURCE_URL,
        "stamp": STAMP,
        "spawns": kept,
        "dropped": dropped,
        "regions": regions_manifest,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2)
    )

    region_plane_count = len(regions_manifest)
    print(f"  emitted {region_plane_count} region-plane files → {OUT_DIR}", flush=True)
    print(f"  manifest.json written ({kept} spawns, {region_plane_count} region-planes)",
          flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, metavar="PATH",
                    help="Path to NPCList_OSRS.json (downloaded from source URL)")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.exists():
        print(f"error: {src} not found", file=sys.stderr)
        sys.exit(1)

    build(src)


if __name__ == "__main__":
    main()
