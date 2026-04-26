"""
Real-screenshot item detection using the pre-built colour-histogram index.

Reads items-hist.pack (built by build_hist_index.py) for the item index.
Detects the OSRS inventory grid from the screenshot, then matches each slot
via colour-histogram overlap — scale-invariant, works on any screenshot size.

Assert: 100% detection rate (every slot with a visible item is matched).
"""

import json
import struct
import mmap
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT   = Path(__file__).resolve().parent.parent
HIST   = ROOT / "assets/data/cache/items-hist.pack"
ITEMS  = ROOT / "assets/data/cache/items.jsonl"
SAMPLE = ROOT / "items/samples/inventory paste example.png"

BG_DEV_THRESHOLD = 15.0   # L2 distance from BG below which a pixel is "background"
HIST_MATCH_MIN   = 0.60   # minimum overlap score to claim a detection

# ── Pack reader (matches sprite.js readPack) ───────────────────────────────────

def read_hist_pack(path: Path) -> dict[int, list]:
    """Returns {item_id: [[r5,g5,b5,n], ...]} from items-hist.pack."""
    with open(path, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
    buf = mm[:]   # copy to bytes
    mm.close()
    assert buf[:4] == b"OSRP", "Not an OSRP pack"
    n = struct.unpack_from("<I", buf, 4)[0]
    result = {}
    for i in range(n):
        base   = 8 + i * 12
        iid    = struct.unpack_from("<I", buf, base)[0]
        offset = struct.unpack_from("<I", buf, base + 4)[0]
        length = struct.unpack_from("<I", buf, base + 8)[0]
        rec    = json.loads(buf[offset:offset + length])
        result[iid] = rec["hist"]
    return result

# ── Background estimation ──────────────────────────────────────────────────────

def estimate_bg(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    corners = np.vstack([arr[:4, :4, :3], arr[:4, -4:, :3], arr[-4:, :4, :3], arr[-4:, -4:, :3]]).reshape(-1, 3)
    counts = Counter(map(tuple, corners.tolist()))
    return np.array(counts.most_common(1)[0][0], dtype=np.float32)

# ── Grid detection ─────────────────────────────────────────────────────────────

def gap_runs(profile: np.ndarray, thr: float) -> list[tuple[int, int]]:
    runs, in_run, start = [], False, 0
    for i, v in enumerate(profile):
        if v < thr and not in_run:  start = i; in_run = True
        elif v >= thr and in_run:   runs.append((start, i - 1)); in_run = False
    if in_run: runs.append((start, len(profile) - 1))
    return runs

def content_bands(gaps: list[tuple[int, int]], total: int) -> list[tuple[int, int]]:
    bands, prev = [], 0
    for gs, ge in gaps:
        if gs > prev: bands.append((prev, gs - 1))
        prev = ge + 1
    if prev < total: bands.append((prev, total - 1))
    return [(s, e) for s, e in bands if e - s >= 5]

def detect_grid(arr: np.ndarray, bg: np.ndarray) -> tuple[list, list]:
    dist    = np.linalg.norm(arr[:, :, :3].astype(np.float32) - bg, axis=-1)
    thr     = max(dist.mean(axis=0).mean() * 0.15, 2.0)
    col_gaps = gap_runs(dist.mean(axis=0), thr)
    row_gaps = gap_runs(dist.mean(axis=1), thr)
    return content_bands(col_gaps, arr.shape[1]), content_bands(row_gaps, arr.shape[0])

# ── Index ──────────────────────────────────────────────────────────────────────

@dataclass
class RefEntry:
    item_id: int
    hist:    Counter   # (r5,g5,b5) → count
    total:   int

def bk(r: int, g: int, b: int) -> int:
    return r | (g << 5) | (b << 10)

def build_index(hist_data: dict[int, list]) -> tuple[dict[int, RefEntry], dict[int, set[int]]]:
    entries: dict[int, RefEntry] = {}
    buckets: dict[int, set[int]] = defaultdict(set)
    for iid in sorted(hist_data):   # ascending id → canonical first
        raw = hist_data[iid]
        h   = Counter({(r, g, b): n for r, g, b, n in raw})
        tot = sum(h.values())
        if tot < 5: continue
        entries[iid] = RefEntry(item_id=iid, hist=h, total=tot)
        for r, g, b in h:
            buckets[bk(r, g, b)].add(iid)
    return entries, dict(buckets)

# ── Query ──────────────────────────────────────────────────────────────────────

def slot_hist(slot: np.ndarray, bg: np.ndarray) -> Counter:
    dist  = np.linalg.norm(slot[:, :, :3].astype(np.float32) - bg, axis=-1)
    valid = slot[:, :, :3][dist > BG_DEV_THRESHOLD].astype(int)
    quant = [((r >> 3), (g >> 3), (b >> 3)) for r, g, b in valid]
    return Counter(quant)

def hist_overlap(q: Counter, ref: RefEntry) -> float:
    overlap = sum(min(q.get(c, 0), n) for c, n in ref.hist.items())
    return overlap / ref.total

def match(
    q: Counter,
    entries: dict[int, RefEntry],
    buckets: dict[int, set[int]],
) -> tuple[float, int] | None:
    candidates: set[int] = set()
    for c in q:
        candidates |= buckets.get(bk(*c), set())
    if not candidates:
        return None
    scored = [(hist_overlap(q, entries[i]), i) for i in candidates if i in entries]
    scored.sort(key=lambda t: (-t[0], t[1]))   # desc score, asc id (canonical wins ties)
    best_s, best_id = scored[0]
    return (best_s, best_id) if best_s >= HIST_MATCH_MIN else None

# ── Annotate ───────────────────────────────────────────────────────────────────

def annotate(img: Image.Image, cols: list, rows: list, results: list, items_meta: dict) -> Image.Image:
    out  = img.convert("RGBA")
    draw = ImageDraw.Draw(out)
    for ri, row in enumerate(results):
        for ci, det in enumerate(row):
            cx1, cx2 = cols[ci]; ry1, ry2 = rows[ri]
            color = (0, 220, 0, 255) if det else (80, 80, 80, 200)
            draw.rectangle([cx1, ry1, cx2, ry2], outline=color, width=1)
            if det:
                name = items_meta.get(det["item_id"], {}).get("name", str(det["item_id"]))
                draw.text((cx1 + 1, ry2 - 9), name[:12], fill=(255, 255, 0, 255))
    return out

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Loading items histogram pack ...")
    hist_data  = read_hist_pack(HIST)
    items_meta = {json.loads(l)["id"]: json.loads(l) for l in ITEMS.open()}
    print(f"  {len(hist_data):,} items")

    print("Building index ...")
    entries, buckets = build_index(hist_data)
    print(f"  {len(entries):,} entries  {len(buckets):,} bucket keys")

    img_pil = Image.open(SAMPLE).convert("RGBA")
    img_arr = np.array(img_pil)
    bg      = estimate_bg(img_arr)
    print(f"Background: {bg.astype(int).tolist()}")

    cols, rows = detect_grid(img_arr, bg)
    print(f"Grid: {len(cols)} cols x {len(rows)} rows = {len(cols)*len(rows)} slots")

    results: list[list] = []
    n_items = n_det = 0
    for ri, (ry1, ry2) in enumerate(rows):
        row_res = []
        for ci, (cx1, cx2) in enumerate(cols):
            slot = img_arr[ry1:ry2+1, cx1:cx2+1]
            q    = slot_hist(slot, bg)
            if not q:
                row_res.append(None); continue
            n_items += 1
            m = match(q, entries, buckets)
            if m:
                score, iid = m
                row_res.append({"item_id": iid, "score": score})
                n_det += 1
            else:
                row_res.append(None)
        results.append(row_res)

    print(f"\n{'Slot':>6}  {'Score':>6}  {'ID':>6}  Item")
    print("-" * 60)
    for ri, row in enumerate(results):
        for ci, det in enumerate(row):
            tag = f"({ri},{ci})"
            if det is None:
                print(f"{tag:>6}  {'--':>6}  {'--':>6}  (empty)")
            else:
                name = items_meta.get(det["item_id"], {}).get("name", str(det["item_id"]))
                print(f"{tag:>6}  {det['score']:.3f}  {det['item_id']:>6}  {name}")

    pct = 100 * n_det / n_items if n_items else 0
    print(f"\nResult: {n_det}/{n_items} detected  ({pct:.1f}%)")

    out_path = Path(__file__).parent / "detected_screenshot.png"
    annotate(img_pil, cols, rows, results, items_meta).save(out_path)
    print(f"Annotated -> {out_path.name}")

    assert n_det == n_items, (
        f"Detection {pct:.1f}% < 100% -- {n_items - n_det} slot(s) unmatched"
    )
    print("All assertions passed - 100% detection rate.")

if __name__ == "__main__":
    main()
