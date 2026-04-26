"""
Item detection from a composed scene image using exact-pixel fingerprinting.

Pipeline:
  1. Build per-item fingerprints from the atlas + spritesheet:
       - Composite each 36x32 sprite over the scene background colour
       - Store (composited_rgb, alpha_mask) per item
       - Index by a coarse bucket key derived from the opaque-pixel mean colour
  2. Compose a test scene: paste 14 sprites at non-uniform, randomised positions
       - Stackable items (Coins, Nature rune) get a yellow count overlay
  3. Slide a 36x32 window over the scene; at each position with sufficient
     opaque content, compute a bucket key then score all candidates in that
     bucket via masked MSE against the composited reference
  4. Emit detections above the score threshold; assert 100% accuracy

Notes:
  - Transparent regions of the source sprite are excluded from the MSE so
    background colour does not affect matching
  - Stackable count overlays occupy the upper-left corner; the lower-right
    anchors are clean and sufficient for disambiguation
  - The full dataset has only 2 name-collision groups (Pharaoh's sceptre
    Uncharged, Bow of faerdhinen Inactive); both differ in pixel content so
    exact matching naturally resolves them
"""

import json
import math
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT  = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "assets/data/cache/sprites/items-atlas.json"
SHEET = ROOT / "assets/data/cache/sprites/items.png"
ITEMS = ROOT / "assets/data/cache/items.jsonl"

SLOT_W, SLOT_H = 36, 32
BG = np.array([20, 20, 20], dtype=np.uint8)   # scene background RGB

# ── Data loading ───────────────────────────────────────────────────────────────

def load_atlas() -> dict[int, dict]:
    with ATLAS.open() as f:
        return {int(k): v for k, v in json.load(f).items()}

def load_items() -> dict[int, dict]:
    idx = {}
    with ITEMS.open() as f:
        for line in f:
            r = json.loads(line)
            idx[r["id"]] = r
    return idx

# ── Compositing ────────────────────────────────────────────────────────────────

def composite(sprite_rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Alpha-composite sprite over BG.
    Returns (rgb_f32 shape HxWx3, alpha_mask shape HxW bool — True = opaque pixel).
    """
    a   = sprite_rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = sprite_rgba[:, :, :3].astype(np.float32)
    out = rgb * a + BG.astype(np.float32) * (1.0 - a)
    mask = sprite_rgba[:, :, 3] >= 16
    return out.astype(np.float32), mask

# ── Bucket key ─────────────────────────────────────────────────────────────────
# Derived from the LOWER half of the slot only (rows STACK_ROW_CUT onward).
# Stack-count overlays occupy the upper-left corner, so excluding the top rows
# makes the bucket key stable regardless of count text.

STACK_ROW_CUT = 10   # ignore rows 0..9 when computing bucket keys

def lower_bucket(rgb: np.ndarray, mask: np.ndarray) -> int:
    lo_rgb  = rgb[STACK_ROW_CUT:]
    lo_mask = mask[STACK_ROW_CUT:]
    px      = lo_rgb[lo_mask]
    if px.size == 0:
        px = rgb[mask]   # fallback: full sprite (very small sprites)
    if px.size == 0:
        return 0
    mean = px.mean(axis=0)
    r, g, b = int(mean[0]) >> 3, int(mean[1]) >> 3, int(mean[2]) >> 3
    return r | (g << 5) | (b << 10)

# ── Index ──────────────────────────────────────────────────────────────────────

@dataclass
class IndexEntry:
    item_id:   int
    rgb:       np.ndarray   # HxWx3 float32, composited over BG
    mask:      np.ndarray   # HxW bool, True = originally opaque

def build_index(atlas: dict, sheet: np.ndarray) -> dict[int, list[IndexEntry]]:
    """
    Build bucket map.  Entries within each bucket are sorted by item_id ascending
    so that, when multiple items share identical pixel content (e.g. LMS reskins),
    the canonical (lowest-id) item is ranked first after sorting by score.
    """
    buckets: dict[int, list[IndexEntry]] = defaultdict(list)
    for item_id, e in sorted(atlas.items()):   # sorted → canonical first
        sx, sy, sw, sh = e["x"], e["y"], e["w"], e["h"]
        raw = sheet[sy:sy+sh, sx:sx+sw]
        if raw.size == 0 or sw != SLOT_W or sh != SLOT_H:
            continue
        rgb, mask = composite(raw)
        if mask.sum() < 10:
            continue
        ie = IndexEntry(item_id=item_id, rgb=rgb, mask=mask)
        bk = lower_bucket(rgb, mask)
        buckets[bk].append(ie)
    return dict(buckets)

# ── Scoring ────────────────────────────────────────────────────────────────────

def mse_score(query_rgb: np.ndarray, ie: IndexEntry) -> float:
    """
    MSE over the reference's opaque pixels in the LOWER portion of the slot
    (rows STACK_ROW_CUT onward), where stack-count text never appears.
    Falls back to full mask if the lower portion has too few pixels.
    """
    lo_mask = ie.mask.copy()
    lo_mask[:STACK_ROW_CUT, :] = False
    if lo_mask.sum() >= 10:
        mask = lo_mask
    else:
        mask = ie.mask   # very small sprite: use all pixels
    diff = (query_rgb - ie.rgb)[mask]
    mse  = float((diff ** 2).mean()) if diff.size > 0 else 1e9
    return math.exp(-mse / 200.0)

def top_candidates(
    query_rgb: np.ndarray,
    query_mask: np.ndarray,
    buckets:   dict[int, list[IndexEntry]],
    k:         int = 5,
) -> list[tuple[float, int]]:
    """
    Look up the query using the lower-half bucket key (± 1 for boundary safety).
    Among tied scores (e.g. identical-pixel LMS reskins), the lower item_id wins
    because build_index inserts in ascending-id order and we stable-sort by score.
    """
    bk = lower_bucket(query_rgb, query_mask)
    seen: set[int] = set()
    candidates: list[IndexEntry] = []
    for key in (bk - 1, bk, bk + 1):
        for ie in buckets.get(key, []):
            if ie.item_id not in seen:
                seen.add(ie.item_id)
                candidates.append(ie)
    # Stable sort: score descending, then item_id ascending (tie-break to canonical).
    ranked = sorted(
        ((mse_score(query_rgb, ie), -ie.item_id, ie.item_id) for ie in candidates),
        key=lambda t: (t[0], t[1]),
        reverse=True,
    )
    return [(s, iid) for s, _, iid in ranked[:k]]

# ── Scene composition ──────────────────────────────────────────────────────────

SCENE_ITEMS = [
    4151,   # Abyssal whip
    4587,   # Dragon scimitar
    1127,   # Rune platebody
     385,   # Shark
     995,   # Coins (stackable)
     536,   # Dragon bones
    1513,   # Magic logs
    1617,   # Uncut diamond
    2452,   # Antifire potion (4 dose)
    3024,   # Super restore (4 dose)
     561,   # Nature rune (stackable)
    4153,   # Granite maul
     995,   # Coins again (different stack count)
     385,   # Shark again
]

SCENE_W, SCENE_H = 400, 300
PADDING          = 6   # pixels between placed sprites

def random_positions(n: int, seed: int = 42) -> list[tuple[int, int]]:
    rng = random.Random(seed)
    pos: list[tuple[int, int]] = []
    for _ in range(n):
        for _ in range(2000):
            x = rng.randint(0, SCENE_W - SLOT_W)
            y = rng.randint(0, SCENE_H - SLOT_H)
            clear = all(
                abs(x - px) >= SLOT_W + PADDING or abs(y - py) >= SLOT_H + PADDING
                for px, py in pos
            )
            if clear:
                pos.append((x, y))
                break
        else:
            pos.append((rng.randint(0, SCENE_W - SLOT_W), rng.randint(0, SCENE_H - SLOT_H)))
    return pos

STACK_COUNTS = {995: 42_000, 561: 500}

def render_stack_number(draw: ImageDraw.ImageDraw, x: int, y: int, count: int) -> None:
    txt = f"{count // 1000}K" if count >= 1000 else str(count)
    draw.text((x + 1, y + 1), txt, fill=(255, 215, 0, 255))

def compose_scene(
    atlas:      dict,
    sheet:      np.ndarray,
    items_meta: dict,
) -> tuple[Image.Image, list[dict]]:
    scene  = Image.new("RGBA", (SCENE_W, SCENE_H), (*BG, 255))
    draw   = ImageDraw.Draw(scene)
    sheet_img = Image.fromarray(sheet, mode="RGBA")
    positions = random_positions(len(SCENE_ITEMS))
    truth: list[dict] = []
    seen_stacks: dict[int, int] = {}

    for item_id, (px, py) in zip(SCENE_ITEMS, positions):
        entry = atlas.get(item_id)
        if entry is None:
            continue
        ex, ey, ew, eh = entry["x"], entry["y"], entry["w"], entry["h"]
        sprite = sheet_img.crop((ex, ey, ex + ew, ey + eh))
        scene.paste(sprite, (px, py), sprite)
        meta = items_meta.get(item_id, {})
        if meta.get("stackable") and item_id in STACK_COUNTS:
            nth   = seen_stacks.get(item_id, 0)
            count = STACK_COUNTS[item_id] * (nth + 1)
            render_stack_number(draw, px, py, count)
            seen_stacks[item_id] = nth + 1
        truth.append({"item_id": item_id, "name": meta.get("name", str(item_id)), "x": px, "y": py})

    return scene, truth

# ── Sliding-window scan ────────────────────────────────────────────────────────

SCORE_THRESHOLD = 0.90   # exp(-mse/200); at step=1 we land exactly on sprites
STEP            = 1      # px increment; must be 1 for exact-pixel matching

def scan_scene(
    scene:   np.ndarray,
    buckets: dict[int, list[IndexEntry]],
) -> list[dict]:
    h, w       = scene.shape[:2]
    covered:   list[tuple[int,int,int,int]] = []
    detections: list[dict] = []

    def overlaps(x: int, y: int) -> bool:
        return any(x < x2 and x+SLOT_W > x1 and y < y2 and y+SLOT_H > y1 for x1,y1,x2,y2 in covered)

    for sy in range(0, h - SLOT_H + 1, STEP):
        for sx in range(0, w - SLOT_W + 1, STEP):
            if overlaps(sx, sy):
                continue
            crop      = scene[sy:sy+SLOT_H, sx:sx+SLOT_W]
            query_rgb  = crop[:, :, :3].astype(np.float32)
            bg_f       = BG.astype(np.float32)
            dist       = np.linalg.norm(query_rgb - bg_f, axis=-1)
            query_mask = dist > 12.0   # non-background pixels
            if query_mask.sum() < 20:
                continue
            candidates = top_candidates(query_rgb, query_mask, buckets)
            if not candidates:
                continue
            best_score, best_id = candidates[0]
            if best_score < SCORE_THRESHOLD:
                continue
            detections.append({"item_id": best_id, "score": best_score, "x": sx, "y": sy})
            covered.append((sx, sy, sx + SLOT_W, sy + SLOT_H))

    return detections

# ── Match detections to ground truth ──────────────────────────────────────────

def center_dist(det: dict, gt: dict) -> float:
    dx = abs((det["x"] + SLOT_W / 2) - (gt["x"] + SLOT_W / 2))
    dy = abs((det["y"] + SLOT_H / 2) - (gt["y"] + SLOT_H / 2))
    return math.hypot(dx / SLOT_W, dy / SLOT_H)

def match(detections: list[dict], truth: list[dict]) -> list[dict]:
    unmatched = list(detections)
    results   = []
    for gt in truth:
        best_i = min(range(len(unmatched)), key=lambda i: center_dist(unmatched[i], gt), default=None)
        if best_i is not None and center_dist(unmatched[best_i], gt) < 1.0:
            det = unmatched.pop(best_i)
            results.append({"gt": gt, "det": det, "correct": det["item_id"] == gt["item_id"]})
        else:
            results.append({"gt": gt, "det": None, "correct": False})
    return results

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Loading atlas + spritesheet ...")
    atlas      = load_atlas()
    items_meta = load_items()
    sheet      = np.array(Image.open(SHEET).convert("RGBA"))
    print(f"  Atlas: {len(atlas):,} entries  Sheet: {sheet.shape[1]}x{sheet.shape[0]}")

    print("Building fingerprint index ...")
    buckets = build_index(atlas, sheet)
    total_entries = sum(len(v) for v in buckets.values())
    print(f"  {len(buckets):,} bucket keys  {total_entries:,} index entries")

    print("Composing test scene ...")
    scene_img, truth = compose_scene(atlas, sheet, items_meta)
    scene_path = Path(__file__).parent / "test_scene.png"
    scene_img.save(scene_path)
    print(f"  Saved {scene_path.name}  ({SCENE_W}x{SCENE_H}, {len(truth)} items)")

    print("Scanning scene ...")
    scene_arr  = np.array(scene_img)
    detections = scan_scene(scene_arr, buckets)
    print(f"  {len(detections)} detections found")

    results = match(detections, truth)

    print(f"\n{'GT item':<35} {'GT pos':>10}  {'Det item':<35} {'Score':>6}  OK?")
    print("-" * 96)
    n_correct = 0
    for m in results:
        gt  = m["gt"]
        det = m["det"]
        ok  = m["correct"]
        n_correct += int(ok)
        det_name  = items_meta.get(det["item_id"], {}).get("name", str(det["item_id"])) if det else "(none)"
        det_score = f'{det["score"]:.3f}' if det else "—"
        flag      = "ok" if ok else "FAIL"
        print(f"{gt['name']:<35} ({gt['x']:3d},{gt['y']:3d})   {det_name:<35} {det_score:>6}  {flag}")

    total = len(truth)
    pct   = 100 * n_correct / total if total else 0.0
    print(f"\nResult: {n_correct}/{total} correct  ({pct:.1f}%)")

    assert n_correct == total, (
        f"Detection accuracy {pct:.1f}% -- {total - n_correct} item(s) misidentified"
    )
    print("All assertions passed - 100% accuracy.")

if __name__ == "__main__":
    main()
