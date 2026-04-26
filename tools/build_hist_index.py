"""
Build the colour-histogram index for screenshot item detection.

Output: assets/data/cache/items-hist.pack  (OSRP format)

Each record: { "id": N, "hist": [[r,g,b,n], ...] }
  hist = list of [r,g,b,count] entries for non-background opaque pixels
  in the lower portion of the sprite (top STACK_ROW_FRAC excluded).
  Colours are stored at full 8-bit precision; the JS reader quantises
  them to 5 bits/channel for bucket lookup.

Background used: OSRS inventory BG [62,53,41] (the standard screenshot colour).
Items with fewer than MIN_ITEM_PX distinct non-BG pixels are omitted.
"""

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pack import pack

ROOT        = Path(__file__).resolve().parent.parent
ATLAS       = ROOT / "assets/data/cache/sprites/items-atlas.json"
SHEET       = ROOT / "assets/data/cache/sprites/items.png"
OUT         = ROOT / "assets/data/cache/items-hist.pack"

SLOT_W, SLOT_H = 36, 32
BG             = np.array([62, 53, 41], dtype=np.float32)   # OSRS inventory BG
BG_DEV_MIN     = 15.0    # pixels closer than this to BG are considered background
STACK_ROW_FRAC = 0.35    # exclude top fraction of sprite (stack-count text area)
MIN_ITEM_PX    = 5       # skip sprites with fewer non-BG pixels than this


def composite(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a   = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    return (rgb * a + BG * (1.0 - a)).astype(np.float32), rgba[:, :, 3] >= 16


def quantise5(v: int) -> int:
    return (v >> 3) & 0x1F   # 5-bit per channel


def item_hist(rgb: np.ndarray, mask: np.ndarray) -> list[list[int]]:
    """
    Returns [[r5,g5,b5,count], ...] — colours quantised to 5 bits/channel,
    non-BG opaque pixels in the lower portion of the sprite.
    Quantisation matches the JS bucket-key computation, and halves storage.
    """
    row_cut = round(SLOT_H * STACK_ROW_FRAC)
    lo      = mask.copy()
    lo[:row_cut, :] = False
    use = lo if lo.sum() >= MIN_ITEM_PX else mask
    px  = rgb[use]
    dist = np.linalg.norm(px - BG, axis=-1)
    valid = px[dist > BG_DEV_MIN].astype(int)
    if len(valid) < MIN_ITEM_PX:
        return []
    quant = [(quantise5(r), quantise5(g), quantise5(b)) for r, g, b in valid]
    counts = Counter(quant)
    return [[int(r), int(g), int(b), int(n)] for (r, g, b), n in sorted(counts.items())]


def main() -> None:
    print("Loading atlas + spritesheet ...")
    with ATLAS.open() as f:
        atlas = {int(k): v for k, v in json.load(f).items()}
    sheet = np.array(Image.open(SHEET).convert("RGBA"))
    print(f"  {len(atlas):,} entries  {sheet.shape[1]}x{sheet.shape[0]}")

    print("Computing histograms ...")
    records = []
    skipped = 0
    for item_id, e in sorted(atlas.items()):
        if e["w"] != SLOT_W or e["h"] != SLOT_H:
            skipped += 1
            continue
        raw      = sheet[e["y"]:e["y"]+SLOT_H, e["x"]:e["x"]+SLOT_W]
        rgb, mask = composite(raw)
        h        = item_hist(rgb, mask)
        if not h:
            skipped += 1
            continue
        records.append({"id": item_id, "hist": h})

    print(f"  {len(records):,} items  ({skipped} skipped — wrong size or blank)")

    print(f"Writing {OUT.name} ...")
    n = pack(records, OUT)
    size_kb = OUT.stat().st_size / 1024
    print(f"  Wrote {n:,} records  ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
