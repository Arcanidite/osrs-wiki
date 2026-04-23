"""
Binary pack/unpack for OSRS cache records.

Format:
  header:  4B magic "OSRP" + 4B record count N
  index:   N * 12B entries (id:4LE, offset:4LE, length:4LE), sorted by id
  data:    concatenated utf-8 JSON records

Usage:
  pack(records, path)          — list[dict] with 'id' field → .pack file
  get(path, id)                → dict | None
  verify(path, sample_ids)     → prints count + sampled names
"""

import json, mmap, struct
from pathlib import Path

MAGIC   = b"OSRP"
HDR_SZ  = 8   # magic(4) + count(4)
ENTRY   = 12  # id(4) + offset(4) + length(4)


def pack(records, path):
    path = Path(path)
    recs = sorted(records, key=lambda r: r["id"])
    blobs = [json.dumps(r, ensure_ascii=False, separators=(",", ":")).encode() for r in recs]
    n = len(recs)
    data_start = HDR_SZ + n * ENTRY
    with path.open("wb") as f:
        f.write(MAGIC + struct.pack("<I", n))
        offset = data_start
        for rec, blob in zip(recs, blobs):
            f.write(struct.pack("<III", rec["id"], offset, len(blob)))
            offset += len(blob)
        for blob in blobs:
            f.write(blob)
    return n


def _bisect(mm, n, target_id):
    lo, hi = 0, n - 1
    while lo <= hi:
        mid = (lo + hi) >> 1
        pos = HDR_SZ + mid * ENTRY
        mid_id = struct.unpack_from("<I", mm, pos)[0]
        if mid_id == target_id: return pos
        if mid_id < target_id: lo = mid + 1
        else: hi = mid - 1
    return -1


def get(path, target_id):
    with open(path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        if mm[:4] != MAGIC: return None
        n = struct.unpack_from("<I", mm, 4)[0]
        pos = _bisect(mm, n, target_id)
        if pos < 0: return None
        _, offset, length = struct.unpack_from("<III", mm, pos)
        rec = json.loads(mm[offset:offset + length])
        mm.close()
    return rec


def verify(path, sample_ids=None):
    with open(path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        n = struct.unpack_from("<I", mm, 4)[0]
        size_mb = Path(path).stat().st_size / 1e6
        print(f"{Path(path).name}: {n} records, {size_mb:.2f} MB")
        for sid in (sample_ids or []):
            pos = _bisect(mm, n, sid)
            if pos < 0: print(f"  {sid}: not found")
            else:
                _, offset, length = struct.unpack_from("<III", mm, pos)
                rec = json.loads(mm[offset:offset + length])
                print(f"  {sid}: {rec.get('name')} | {list(rec.keys())}")
        mm.close()
