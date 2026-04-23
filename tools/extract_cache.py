"""
Cache extractor — reads RuneLite data sources, emits binary .pack files and map chunks.

Sources:
  ITEMS_SRC  — osrsbox items-cache.json (names, equipment, reqs)
  Dump.java  — pipes NPCs/objects/locations/maptiles from the live OSRS cache jar

Outputs (assets/data/cache/):
  items.pack    — items with equipment reqs, tradeable, slot, etc.
  npcs.pack     — NPCs with combat level, actions, stats, params
  objects.pack  — interactable objects tagged by action type
  locations.pack — placed locations per region (requires XTEA keys)
  map/          — chunked map tiles + manifest

Run:
  python tools/extract_cache.py [--verify] [--map] [--xtea <path>]
"""

import gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from pack import pack, verify as pack_verify

ROOT      = Path(__file__).parent.parent
ITEMS_SRC = Path(r"C:\Users\TheLando\development\runelight-spaces\dev-server\data\items-cache.json")
JAVA      = Path(r"C:\Users\TheLando\development\runelight-spaces\.jdk\jdk-11.0.30+7\bin\java.exe")
JAR       = Path(r"C:\Users\TheLando\development\runelight-spaces\runelite\cache\build\libs\cache-1.12.17-SNAPSHOT.jar")
CACHE_DIR = Path(r"C:\Users\TheLando\.runelite\jagexcache\oldschool\LIVE")
GRADLE    = Path(r"C:\Users\TheLando\.gradle\caches\modules-2\files-2.1")
XTEA_JSON = Path(r"C:\Users\TheLando\.runelite\cache\xtea.json")
OUT       = ROOT / "assets" / "data" / "cache"

OUT.mkdir(parents=True, exist_ok=True)

VERIFY_ITEMS   = [4151, 11832, 453, 995]
VERIFY_NPCS    = [0, 1, 2]
VERIFY_OBJECTS = [42834]

# Action keywords that classify an object's role
ACTION_TAGS = {
    "bank":    {"bank", "deposit", "withdraw"},
    "shop":    {"trade", "buy", "sell", "shop"},
    "craft":   {"craft", "smelt", "smith", "cook", "make"},
    "travel":  {"climb", "enter", "exit", "pass", "teleport", "jump"},
    "unlock":  {"open", "unlock", "pick", "push"},
    "gather":  {"mine", "chop", "fish", "pick", "harvest", "cut"},
}


def slug(name):
    return name.lower().replace(" ", "-").replace("'", "").replace(",", "")


def action_tags(actions):
    lowered = {(a or "").lower() for a in actions}
    return [tag for tag, kws in ACTION_TAGS.items() if any(k in a for a in lowered for k in kws)]


def deps_cp():
    jars = list(GRADLE.rglob("*.jar"))
    return str(JAR) + ";" + ";".join(str(j) for j in jars)


def pipe_dump(kind, xtea=None):
    """Run Dump.java via subprocess, return parsed JSON."""
    cmd = [str(JAVA), "-cp", deps_cp(), "net.runelite.cache.Dump", str(CACHE_DIR), kind]
    if xtea:
        cmd.append(str(xtea))
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    return json.loads(result.stdout.decode("utf-8"))


def extract_items():
    raw = json.loads(ITEMS_SRC.read_text(encoding="utf-8"))
    recs = []
    for v in raw.values():
        name = (v.get("wiki_name") or v.get("name") or "").strip()
        if not name or v.get("duplicate") or v.get("noted") or v.get("placeholder"):
            continue
        eq   = v.get("equipment") or {}
        reqs = eq.get("requirements") or {}
        recs.append({
            "id":        v["id"],
            "name":      name,
            "slug":      slug(name),
            "members":   bool(v.get("members")),
            "tradeable": bool(v.get("tradeable_on_ge")),
            "stackable": bool(v.get("stackable")),
            "equipable": bool(v.get("equipable_by_player")),
            "slot":      eq.get("slot"),
            "reqs":      reqs or None,
            "quest_item":bool(v.get("quest_item")),
            "examine":   v.get("examine") or "",
        })
    return pack(recs, OUT / "items.pack"), len(raw) - len(recs)


def extract_npcs():
    entries = pipe_dump("npcs")
    recs = []
    for v in entries:
        name = (v.get("name") or "").strip()
        if not name or name == "null": continue
        actions = [a for a in (v.get("actions") or []) if a]
        params  = v.get("params") or {}
        recs.append({
            "id":           v["id"],
            "name":         name,
            "slug":         slug(name),
            "combat_level": v.get("combatLevel", -1),
            "interactable": bool(v.get("isInteractable", True)),
            "actions":      actions,
            "tags":         action_tags(actions),
            "stats":        v.get("stats"),
            "params":       params if params else None,
        })
    return pack(recs, OUT / "npcs.pack")


def extract_objects():
    entries = pipe_dump("objects")
    recs = []
    for v in entries:
        name    = (v.get("name") or "").strip()
        actions = [a for a in (v.get("actions") or []) if a]
        if not actions: continue
        tags = action_tags(actions)
        if not tags and not name: continue
        params = v.get("params") or {}
        recs.append({
            "id":           v["id"],
            "name":         name or f"object_{v['id']}",
            "slug":         slug(name) if name else f"object-{v['id']}",
            "actions":      actions,
            "tags":         tags,
            "supports_items": v.get("supportsItems", -1),
            "wall_or_door": v.get("wallOrDoor", -1),
            "params":       params if params else None,
        })
    return pack(recs, OUT / "objects.pack")


def extract_locations(xtea=None):
    """Pack region locations from cache. Requires valid XTEA keys to produce non-empty output."""
    data = pipe_dump("locations", xtea=xtea)
    recs = []
    for region_id, region in data.items():
        recs.append({
            "id":     int(region_id),
            "baseX":  region["baseX"],
            "baseY":  region["baseY"],
            "locs":   region["locs"],
        })
    if not recs:
        return 0
    return pack(recs, OUT / "locations.pack")


def extract_maptiles(xtea=None):
    """Render terrain tiles per region (4px/tile, 256x256 PNG) into gzip chunks + manifest."""
    import base64, struct
    from io import BytesIO

    map_out = OUT / "map"
    map_out.mkdir(parents=True, exist_ok=True)

    data = pipe_dump("maptiles", xtea=xtea)
    manifest = {}

    for region_id, region in data.items():
        png_bytes = base64.b64decode(region["png"])
        chunk_path = map_out / f"{region_id}.png.gz"
        with gzip.open(chunk_path, "wb") as f:
            f.write(png_bytes)
        manifest[region_id] = {"bx": region["bx"], "by": region["by"]}

    manifest_path = map_out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return len(data)


def build_sprite_atlas():
    """Pack item icons from items-cache.json into a spritesheet PNG + atlas JSON."""
    import base64, math
    from io import BytesIO
    try:
        from PIL import Image
    except ImportError:
        print("PIL not available — skipping sprite atlas (pip install pillow)")
        return 0

    raw = json.loads(ITEMS_SRC.read_text(encoding="utf-8"))
    icons = []
    for v in raw.values():
        icon_b64 = v.get("icon")
        if not icon_b64: continue
        try:
            img = Image.open(BytesIO(base64.b64decode(icon_b64))).convert("RGBA")
            icons.append((v["id"], img))
        except Exception:
            continue

    if not icons:
        return 0

    icons.sort(key=lambda t: t[0])
    ICON_W, ICON_H = 36, 32
    cols = math.ceil(math.sqrt(len(icons)))
    rows = math.ceil(len(icons) / cols)

    sheet = Image.new("RGBA", (cols * ICON_W, rows * ICON_H), (0, 0, 0, 0))
    atlas = {}
    for i, (item_id, img) in enumerate(icons):
        r, c = divmod(i, cols)
        x, y = c * ICON_W, r * ICON_H
        w = min(img.width, ICON_W)
        h = min(img.height, ICON_H)
        sheet.paste(img.crop((0, 0, w, h)), (x, y))
        atlas[item_id] = {"x": x, "y": y, "w": w, "h": h}

    sprite_out = OUT / "sprites"
    sprite_out.mkdir(parents=True, exist_ok=True)
    sheet.save(sprite_out / "items.png", "PNG", optimize=True)
    (sprite_out / "items-atlas.json").write_text(
        json.dumps(atlas, separators=(",", ":")), encoding="utf-8"
    )
    return len(icons)


def main():
    do_verify = "--verify" in sys.argv
    do_map    = "--map" in sys.argv
    xtea_arg  = None
    if "--xtea" in sys.argv:
        idx = sys.argv.index("--xtea")
        xtea_arg = Path(sys.argv[idx + 1]) if idx + 1 < len(sys.argv) else XTEA_JSON
    elif XTEA_JSON.exists():
        xtea_arg = XTEA_JSON

    n, skipped = extract_items()
    print(f"items:   {n} packed, {skipped} skipped")
    if do_verify: pack_verify(OUT / "items.pack", VERIFY_ITEMS)

    nn = extract_npcs()
    print(f"npcs:    {nn} packed")
    if do_verify: pack_verify(OUT / "npcs.pack", VERIFY_NPCS)

    no = extract_objects()
    print(f"objects: {no} packed")
    if do_verify: pack_verify(OUT / "objects.pack", VERIFY_OBJECTS)

    nl = extract_locations(xtea=xtea_arg)
    print(f"locations: {nl} packed" + (" (no XTEA keys)" if nl == 0 else ""))

    na = build_sprite_atlas()
    if na:
        print(f"sprites: {na} icons in atlas")
    else:
        print("sprites: skipped (no PIL or no icons)")

    if do_map:
        nt = extract_maptiles(xtea=xtea_arg)
        print(f"maptiles: {nt} regions rendered")


if __name__ == "__main__":
    sys.exit(main())
