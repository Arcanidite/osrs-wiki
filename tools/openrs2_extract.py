#!/usr/bin/env python3
"""
OpenRS2 cache extractor — true-coordinate map tiles + game-accurate collision.

Replaces the Windows-only Dump.java pipeline for map data: fetches the OSRS
cache directly from the public OpenRS2 archive (per-group HTTP endpoints +
published XTEA keys), decodes it in pure Python, and emits:

  assets/data/cache/map/<rid>.png.gz      terrain tiles, 64x64 tiles @ 4px,
                                          REAL region ids (rid = rx<<8|ry)
  assets/data/cache/map/manifest.json     {rid: {bx, by}} true world coords
  assets/data/cache/collision/<rid>.bin.gz  per-tile u16 collision flags,
                                          little-endian, y-major (see FLAGS)
  assets/data/cache/collision/manifest.json
  assets/data/cache/objects.pack          object defs with REAL names/sizes/
                                          clip data (fixes GAME_GOTCHAS G-2)

Collision follows the game's static clipping rules (plane 0, bridge-adjusted):
terrain block flag, wall edge flags by loc type/rotation (mirrored onto
neighbours), corner flags, and full blocks for diagonal walls / game objects /
clipped floor decorations, honoring each object's interactType.

Usage:
  python3 tools/openrs2_extract.py --verify      # format self-checks only
  python3 tools/openrs2_extract.py --build       # full fetch + emit
Cache id pinned below; HTTP responses are cached under tools/.openrs2-cache/.
"""

import gzip
import io
import json
import struct
import sys
import zlib
import bz2
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from pack import pack as pack_write  # noqa: E402

CACHE_ID = 2499                      # OSRS live, build 236, 2026-03-18
BASE_URL = f"https://archive.openrs2.org/caches/runescape/{CACHE_ID}"
HTTP_CACHE = ROOT / "tools" / ".openrs2-cache"
OUT = ROOT / "assets" / "data" / "cache"
STAMP = "cache 2499 (build 236, 2026-03-18)"

MAPSQ = 64  # tiles per region side
PX = 4      # px per tile in emitted PNGs

# ── collision flags (u16 per tile) ──────────────────────────────────────────
WALL_N, WALL_E, WALL_S, WALL_W = 1, 2, 4, 8
CORNER_NE, CORNER_SE, CORNER_SW, CORNER_NW = 16, 32, 64, 128
FULL = 256


# ── HTTP layer ───────────────────────────────────────────────────────────────

def http(path):
    key = path.replace("/", "_")
    HTTP_CACHE.mkdir(parents=True, exist_ok=True)
    f = HTTP_CACHE / key
    if f.exists():
        return f.read_bytes()
    req = Request(f"{BASE_URL}/{path}", headers={"User-Agent": "osrs-wiki-extractor"})
    with urlopen(req, timeout=60) as r:
        data = r.read()
    f.write_bytes(data)
    return data


def fetch_group(archive, group):
    return http(f"archives/{archive}/groups/{group}.dat")


# ── js5 primitives ───────────────────────────────────────────────────────────

M32 = 0xFFFFFFFF
XTEA_DELTA = 0x9E3779B9


def xtea_decrypt(data, key):
    out = bytearray(data)
    n = len(data) // 8
    k = [x & M32 for x in key]
    for b in range(n):
        o = b * 8
        v0, v1 = struct.unpack_from(">II", out, o)
        s = (XTEA_DELTA * 32) & M32
        for _ in range(32):
            v1 = (v1 - ((((v0 << 4) ^ (v0 >> 5)) + v0) ^ (s + k[(s >> 11) & 3]))) & M32
            s = (s - XTEA_DELTA) & M32
            v0 = (v0 - ((((v1 << 4) ^ (v1 >> 5)) + v1) ^ (s + k[s & 3]))) & M32
        struct.pack_into(">II", out, o, v0, v1)
    return bytes(out)


def decompress_container(data, key=None):
    comp = data[0]
    clen = struct.unpack_from(">i", data, 1)[0]
    enc_len = clen + (0 if comp == 0 else 4)
    body = data[5:5 + enc_len]
    if key is not None:
        body = xtea_decrypt(body, key)
    if comp == 0:
        return body
    ulen = struct.unpack_from(">i", body, 0)[0]
    blob = body[4:4 + clen]
    if comp == 1:                       # bzip2, header stripped
        out = bz2.decompress(b"BZh1" + blob)
    elif comp == 2:                     # gzip
        out = zlib.decompress(blob, 47)
    else:
        raise ValueError(f"unknown compression {comp}")
    assert len(out) == ulen, f"container length mismatch {len(out)} != {ulen}"
    return out


class Buf:
    def __init__(self, data):
        self.d = data
        self.o = 0

    def u8(self):
        v = self.d[self.o]; self.o += 1; return v

    def i8(self):
        v = self.u8(); return v - 256 if v > 127 else v

    def u16(self):
        v = struct.unpack_from(">H", self.d, self.o)[0]; self.o += 2; return v

    def i16(self):
        v = struct.unpack_from(">h", self.d, self.o)[0]; self.o += 2; return v

    def u24(self):
        v = (self.d[self.o] << 16) | (self.d[self.o + 1] << 8) | self.d[self.o + 2]
        self.o += 3; return v

    def u32(self):
        v = struct.unpack_from(">I", self.d, self.o)[0]; self.o += 4; return v

    def big_smart(self):
        if self.d[self.o] & 0x80:
            return self.u32() & 0x7FFFFFFF
        return self.u16()

    def ushort_smart(self):
        if self.d[self.o] < 0x80:
            return self.u8()
        return self.u16() - 0x8000

    def uint_smart_short_compat(self):
        total = 0
        v = self.ushort_smart()
        while v == 0x7FFF:
            total += 0x7FFF
            v = self.ushort_smart()
        return total + v

    def string(self):
        end = self.d.index(0, self.o)
        s = self.d[self.o:end].decode("cp1252", "replace")
        self.o = end + 1
        return s

    def remaining(self):
        return len(self.d) - self.o


def djb2(s):
    h = 0
    for c in s.encode():
        h = (h * 31 + c) & M32
    return h - (1 << 32) if h >= (1 << 31) else h


def parse_ref_table(data):
    """index-255 reference table → {group_id: name_hash}, [group_ids]"""
    b = Buf(data)
    fmt = b.u8()
    assert fmt in (5, 6, 7), f"ref table format {fmt}"
    if fmt >= 6:
        b.u32()  # version
    flags = b.u8()
    named = flags & 1
    read_id = b.big_smart if fmt >= 7 else b.u16
    size = read_id()
    ids, cur = [], 0
    for _ in range(size):
        cur += read_id()
        ids.append(cur)
    names = {}
    if named:
        for gid in ids:
            names[gid] = struct.unpack(">i", struct.pack(">I", b.u32()))[0]
    return names, ids


def split_group_files(data, file_ids):
    """multi-file group container → {file_id: bytes}"""
    n = len(file_ids)
    if n == 1:
        return {file_ids[0]: data}
    chunks = data[-1]
    footer = len(data) - 1 - chunks * n * 4
    b = Buf(data[footer:len(data) - 1])
    sizes = [[0] * n for _ in range(chunks)]
    for c in range(chunks):
        delta = 0
        for f in range(n):
            delta += struct.unpack_from(">i", b.d, b.o)[0]
            b.o += 4
            sizes[c][f] = delta
    out = {fid: bytearray() for fid in file_ids}
    o = 0
    for c in range(chunks):
        for f, fid in enumerate(file_ids):
            out[fid] += data[o:o + sizes[c][f]]
            o += sizes[c][f]
    return {fid: bytes(v) for fid, v in out.items()}


def parse_ref_table_files(data):
    """full parse including per-group file ids (needed for config groups)."""
    b = Buf(data)
    fmt = b.u8()
    if fmt >= 6:
        b.u32()
    flags = b.u8()
    named, whirl, lengths, uncomp = flags & 1, flags & 2, flags & 4, flags & 8
    read_id = b.big_smart if fmt >= 7 else b.u16
    size = read_id()
    ids, cur = [], 0
    for _ in range(size):
        cur += read_id()
        ids.append(cur)
    if named:
        for _ in ids:
            b.u32()
    for _ in ids:
        b.u32()  # crc
    if uncomp:
        for _ in ids:
            b.u32()
    if whirl:
        b.o += 64 * size
    if lengths:
        b.o += 8 * size
    for _ in ids:
        b.u32()  # versions
    counts = [read_id() for _ in ids]
    files = {}
    for gid, cnt in zip(ids, counts):
        fs, cur = [], 0
        for _ in range(cnt):
            cur += read_id()
            fs.append(cur)
        files[gid] = fs
    return files


# ── decoders ─────────────────────────────────────────────────────────────────

def decode_terrain(data):
    """→ settings[4][64][64], overlay[4][64][64], underlay[4][64][64]"""
    b = Buf(data)
    settings = [[[0] * MAPSQ for _ in range(MAPSQ)] for _ in range(4)]
    overlay = [[[0] * MAPSQ for _ in range(MAPSQ)] for _ in range(4)]
    underlay = [[[0] * MAPSQ for _ in range(MAPSQ)] for _ in range(4)]
    for z in range(4):
        for x in range(MAPSQ):
            for y in range(MAPSQ):
                while True:
                    attr = b.u16()
                    if attr == 0:
                        break
                    if attr == 1:
                        b.u8()  # height
                        break
                    if attr <= 49:
                        overlay[z][x][y] = b.i16()
                    elif attr <= 81:
                        settings[z][x][y] = attr - 49
                    else:
                        underlay[z][x][y] = attr - 81
    # trailer: u8 count of extra plane sections (underwater terrain in some
    # regions) — each is another full 64×64 walk of the same tile grammar
    if b.remaining():
        extra = b.u8()
        for _ in range(extra):
            for x in range(MAPSQ):
                for y in range(MAPSQ):
                    while True:
                        attr = b.u16()
                        if attr == 0:
                            break
                        if attr == 1:
                            b.u8()
                            break
                        if attr <= 49:
                            b.i16()
    assert b.remaining() == 0, f"terrain trailing {b.remaining()}"
    return settings, overlay, underlay


def decode_locations(data):
    """→ [(obj_id, type, rot, z, lx, ly)]"""
    b = Buf(data)
    out = []
    obj_id = -1
    while True:
        delta = b.uint_smart_short_compat()
        if delta == 0:
            break
        obj_id += delta
        pos = 0
        while True:
            pd = b.ushort_smart()
            if pd == 0:
                break
            pos += pd - 1
            ly = pos & 63
            lx = (pos >> 6) & 63
            z = (pos >> 12) & 3
            attrs = b.u8()
            out.append((obj_id, attrs >> 2, attrs & 3, z, lx, ly))
    assert b.remaining() == 0, f"locations trailing {b.remaining()}"
    return out


def decode_object(data, variant):
    """Object config → dict. `variant` toggles the op78/79 retain byte
    (present in newer revisions); build() picks the variant where every
    def parses to exact end-of-stream."""
    b = Buf(data)
    o = {"name": "null", "sizeX": 1, "sizeY": 1, "interactType": 2,
         "blocksProjectile": True, "actions": [None] * 5, "wallOrDoor": -1}
    while True:
        op = b.u8()
        if op == 0:
            break
        elif op == 1:
            n = b.u8()
            for _ in range(n):
                b.u16(); b.u8()
        elif op == 2:
            o["name"] = b.string()
        elif op == 5:
            n = b.u8()
            for _ in range(n):
                b.u16()
        elif op == 14:
            o["sizeX"] = b.u8()
        elif op == 15:
            o["sizeY"] = b.u8()
        elif op == 17:
            o["interactType"] = 0
            o["blocksProjectile"] = False
        elif op == 18:
            o["blocksProjectile"] = False
        elif op == 19:
            o["wallOrDoor"] = b.u8()
        elif op == 21 or op == 22 or op == 23:
            pass
        elif op == 24:
            b.u16()
        elif op == 27:
            o["interactType"] = 1
        elif op == 28:
            b.u8()
        elif op == 29:
            b.i8()
        elif 30 <= op < 35:
            o["actions"][op - 30] = b.string()
        elif op == 39:
            b.i8()
        elif op == 40 or op == 41:
            n = b.u8()
            for _ in range(n):
                b.u16(); b.u16()
        elif op == 61:
            b.u16()
        elif op == 62 or op == 64 or op == 73 or op == 74 or op == 89:
            pass
        elif op == 65 or op == 66 or op == 67:
            b.u16()
        elif op == 68:
            b.u16()
        elif op == 69:
            b.u8()
        elif op == 70 or op == 71 or op == 72:
            b.i16()
        elif op == 75:
            b.u8()
        elif op == 77 or op == 92:
            b.u16(); b.u16()
            if op == 92:
                b.u16()
            n = b.u8()
            for _ in range(n + 1):
                b.u16()
        elif op == 78:
            b.u16(); b.u8()
            if variant >= 1:
                b.u8()          # retain-after-change (newer revs)
        elif op == 79:
            b.u16(); b.u16(); b.u8()
            if variant >= 1:
                b.u8()
            n = b.u8()
            for _ in range(n):
                b.u16()
        elif op == 81:
            b.u8()
        elif op == 82:
            b.u16()
        elif op == 90:
            pass
        elif op == 93:
            # newer-rev opcode; payload is two u24s (observed as equal value
            # pairs like 400,400 / 200,200 across all 10 defs using it)
            b.u24(); b.u24()
        elif op == 95 or op == 96:
            # newer-rev opcodes; 1-byte payload determined empirically — every
            # def in cache 2499 parses to exact end with u8, and the
            # alternative readings produce invalid model types (see DEVLOG)
            b.u8()
        elif op == 249:
            n = b.u8()
            for _ in range(n):
                is_str = b.u8()
                b.u24()
                if is_str:
                    b.string()
                else:
                    b.u32()
        else:
            raise ValueError(f"object op {op}")
    assert b.remaining() == 0, f"object trailing {b.remaining()}"
    return o


def decode_color_config(data, ops):
    """underlay/overlay config; ops = {opcode: field or (field, reader)}"""
    b = Buf(data)
    out = {}
    while True:
        op = b.u8()
        if op == 0:
            return out
        if op == 1:
            out["rgb"] = b.u24()
        elif op == 2:
            out["texture"] = b.u8()
        elif op == 5:
            out["hideUnderlay"] = True
        elif op == 7:
            out["secondaryRgb"] = b.u24()
        else:
            raise ValueError(f"color op {op}")


# ── collision builder (game static clipping rules, plane 0) ─────────────────

def wall_flags(loc_type, rot):
    """→ (own_tile_flags, [(dx, dy, neighbour_flags), ...])"""
    if loc_type == 0 or loc_type == 2:   # straight wall (2 = corner "L", two sides)
        sides = {0: (WALL_W, (-1, 0, WALL_E)), 1: (WALL_N, (0, 1, WALL_S)),
                 2: (WALL_E, (1, 0, WALL_W)), 3: (WALL_S, (0, -1, WALL_N))}
        own, nb = sides[rot][0], [sides[rot][1]]
        if loc_type == 2:                # L-corner: also the next side clockwise
            r2 = (rot + 1) & 3
            own |= sides[r2][0]
            nb.append(sides[r2][1])
        return own, nb
    if loc_type == 1 or loc_type == 3:   # corner pillar
        corners = {0: (CORNER_NW, (-1, 1, CORNER_SE)), 1: (CORNER_NE, (1, 1, CORNER_SW)),
                   2: (CORNER_SE, (1, -1, CORNER_NW)), 3: (CORNER_SW, (-1, -1, CORNER_NE))}
        own, nb = corners[rot]
        return own, [nb]
    return 0, []


class World:
    """sparse world-tile grids keyed by region, cross-border writes allowed."""

    def __init__(self, region_ids):
        self.grids = {rid: bytearray(MAPSQ * MAPSQ * 2) for rid in region_ids}

    def add(self, wx, wy, flag):
        rid = ((wx >> 6) << 8) | (wy >> 6)
        g = self.grids.get(rid)
        if g is None:
            return
        i = ((wy & 63) * MAPSQ + (wx & 63)) * 2
        cur = g[i] | (g[i + 1] << 8)
        cur |= flag
        g[i] = cur & 0xFF
        g[i + 1] = (cur >> 8) & 0xFF


# ── map tile renderer (flat underlay/overlay colours) ────────────────────────

def render_region(settings, overlay, underlay, under_defs, over_defs):
    from PIL import Image
    img = Image.new("RGB", (MAPSQ * PX, MAPSQ * PX), (0, 0, 0))
    pixels = img.load()

    def tile_rgb(x, y):
        ov = overlay[0][x][y]
        if ov > 0:
            d = over_defs.get(ov - 1, {})
            rgb = d.get("rgb")
            if rgb is not None and rgb != 0xFF00FF:
                return rgb
            if d.get("texture") is not None:
                return 0x4E6B8A        # textured overlay (e.g. water) fallback tone
            if rgb == 0xFF00FF:
                rgb = None
        un = underlay[0][x][y]
        if un > 0:
            return under_defs.get(un - 1, {}).get("rgb", 0x555555)
        return None                    # void

    for x in range(MAPSQ):
        for y in range(MAPSQ):
            rgb = tile_rgb(x, y)
            if rgb is None:
                c = (30, 42, 56)
            else:
                c = ((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255)
            py0 = (MAPSQ - 1 - y) * PX  # north at top
            for dx in range(PX):
                for dy in range(PX):
                    pixels[x * PX + dx, py0 + dy] = c
    return img


# ── pipeline ─────────────────────────────────────────────────────────────────

def load_keys():
    keys = json.loads(http("keys.json"))
    return {k["mapsquare"]: k["key"] for k in keys if k.get("mapsquare") is not None}


def map_group_index():
    """→ ({(rx,ry): terrain_gid}, {(rx,ry): locs_gid})"""
    names, _ = parse_ref_table(decompress_container(fetch_group(255, 5)))
    hash_to_gid = {h: gid for gid, h in names.items()}
    terrain, locs = {}, {}
    for rx in range(128):
        for ry in range(256):
            m = hash_to_gid.get(djb2(f"m{rx}_{ry}"))
            if m is not None:
                terrain[(rx, ry)] = m
            l = hash_to_gid.get(djb2(f"l{rx}_{ry}"))
            if l is not None:
                locs[(rx, ry)] = l
    return terrain, locs


def load_configs():
    files = parse_ref_table_files(decompress_container(fetch_group(255, 2)))
    objs_raw = split_group_files(decompress_container(fetch_group(2, 6)), files[6])
    unders_raw = split_group_files(decompress_container(fetch_group(2, 1)), files[1])
    overs_raw = split_group_files(decompress_container(fetch_group(2, 4)), files[4])

    objects, variant_used = None, None
    for variant in (1, 0):             # prefer newer wire format
        try:
            objects = {fid: decode_object(d, variant) for fid, d in objs_raw.items()}
            variant_used = variant
            break
        except (ValueError, AssertionError, IndexError):
            continue
    if objects is None:
        raise SystemExit("object config decode failed under both op78/79 variants")
    unders = {fid: decode_color_config(d, {}) for fid, d in unders_raw.items()}
    overs = {fid: decode_color_config(d, {}) for fid, d in overs_raw.items()}
    return objects, unders, overs, variant_used


def build():
    from PIL import Image  # noqa: F401  (import check before long fetch)
    keys = load_keys()
    terrain_idx, locs_idx = map_group_index()
    print(f"map squares: {len(terrain_idx)} terrain, {len(locs_idx)} locations, "
          f"{len(keys)} keyed")

    objects, unders, overs, variant = load_configs()
    named = sum(1 for o in objects.values() if o["name"] != "null")
    print(f"configs: {len(objects)} objects ({named} named, wire variant {variant}), "
          f"{len(unders)} underlays, {len(overs)} overlays")

    # fetch everything (threaded, disk-cached)
    def grab(args):
        a, g = args
        try:
            return (a, g, fetch_group(a, g))
        except Exception as e:
            return (a, g, None)
    jobs = [(5, g) for g in terrain_idx.values()] + [(5, g) for g in locs_idx.values()]
    with ThreadPoolExecutor(8) as ex:
        got = {(a, g): d for a, g, d in ex.map(grab, jobs)}
    missing = sum(1 for v in got.values() if v is None)
    print(f"fetched {len(got)} groups ({missing} unavailable)")

    region_ids = [(rx << 8) | ry for rx, ry in terrain_idx]
    world = World(region_ids)
    terrains = {}
    undecryptable = 0

    for (rx, ry), gid in terrain_idx.items():
        raw = got.get((5, gid))
        if raw is None:
            continue
        settings, overlay, underlay = decode_terrain(decompress_container(raw))
        terrains[(rx, ry)] = (settings, overlay, underlay)
        bx, by = rx * MAPSQ, ry * MAPSQ
        for x in range(MAPSQ):
            for y in range(MAPSQ):
                # bridge rule: if plane-1 tile is a bridge, ground floor uses plane-1 flags
                p = 1 if (settings[1][x][y] & 2) else 0
                if settings[p][x][y] & 1:
                    world.add(bx + x, by + y, FULL)

    for (rx, ry), gid in locs_idx.items():
        raw = got.get((5, gid))
        key = keys.get((rx << 8) | ry)
        if raw is None or key is None:
            undecryptable += 1
            continue
        try:
            locs = decode_locations(decompress_container(raw, key))
        except Exception:
            undecryptable += 1
            continue
        settings = terrains.get((rx, ry), (None,))[0]
        bx, by = rx * MAPSQ, ry * MAPSQ
        for obj_id, ltype, rot, z, lx, ly in locs:
            # bridge shift: locs on plane 1 above a bridge tile belong to ground
            eff_z = z
            if settings and (settings[1][lx][ly] & 2):
                eff_z = z - 1
            if eff_z != 0:
                continue
            d = objects.get(obj_id)
            if d is None or d["interactType"] == 0:
                continue
            if ltype in (0, 1, 2, 3):
                own, nbs = wall_flags(ltype, rot)
                world.add(bx + lx, by + ly, own)
                for dx, dy, f in nbs:
                    world.add(bx + lx + dx, by + ly + dy, f)
            elif ltype == 9:                          # diagonal wall
                world.add(bx + lx, by + ly, FULL)
            elif ltype in (10, 11):                   # game object footprint
                sx, sy = d["sizeX"], d["sizeY"]
                if rot in (1, 3):
                    sx, sy = sy, sx
                for ox in range(sx):
                    for oy in range(sy):
                        world.add(bx + lx + ox, by + ly + oy, FULL)
            elif ltype == 22 and d["interactType"] == 1:  # clipped floor decoration
                world.add(bx + lx, by + ly, FULL)

    print(f"collision built ({undecryptable} squares without usable keys/locs)")

    # ── emit ──
    map_dir = OUT / "map"
    col_dir = OUT / "collision"
    for f in map_dir.glob("*.png.gz"):
        f.unlink()
    col_dir.mkdir(parents=True, exist_ok=True)
    for f in col_dir.glob("*.bin.gz"):
        f.unlink()

    manifest = {}
    for (rx, ry), parts in terrains.items():
        rid = (rx << 8) | ry
        img = render_region(*parts, unders, overs)
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        (map_dir / f"{rid}.png.gz").write_bytes(gzip.compress(buf.getvalue(), 9))
        (col_dir / f"{rid}.bin.gz").write_bytes(gzip.compress(bytes(world.grids[rid]), 9))
        manifest[str(rid)] = {"bx": rx * MAPSQ, "by": ry * MAPSQ}
    meta = {"source": f"OpenRS2 {STAMP}", "px_per_tile": PX,
            "collision_format": "u16le per tile, y-major; bits: N,E,S,W walls / NE,SE,SW,NW corners / 256 full",
            "plane": 0}
    (map_dir / "manifest.json").write_text(json.dumps(manifest))
    (col_dir / "manifest.json").write_text(json.dumps({**meta, "regions": manifest}))
    print(f"emitted {len(manifest)} regions → map/ + collision/")

    # objects.pack with real names (same action filter as the old extractor)
    recs = []
    for oid, d in sorted(objects.items()):
        actions = [a for a in d["actions"] if a]
        if not actions or d["name"] == "null":
            continue
        recs.append({
            "id": oid, "name": d["name"],
            "slug": d["name"].lower().replace(" ", "-").replace("'", ""),
            "actions": actions, "sizeX": d["sizeX"], "sizeY": d["sizeY"],
            "interactType": d["interactType"], "wallOrDoor": d["wallOrDoor"],
        })
    pack_write(recs, OUT / "objects.pack")
    print(f"objects.pack: {len(recs)} named interactable objects")


def verify():
    assert djb2("l42_42") == -1153413389, "djb2 mismatch vs keys.json"
    print("djb2 ok")
    ref = decompress_container(fetch_group(255, 5))
    names, ids = parse_ref_table(ref)
    print(f"index 5 ref table: {len(ids)} groups, named={bool(names)}")
    h2g = {h: g for g, h in names.items()}
    lum = h2g.get(djb2("m50_50"))
    assert lum is not None, "Lumbridge m50_50 missing"
    settings, overlay, underlay = decode_terrain(decompress_container(fetch_group(5, lum)))
    blocked = sum(1 for x in range(64) for y in range(64) if settings[0][x][y] & 1)
    print(f"m50_50 (Lumbridge) decoded: {blocked} terrain-blocked tiles on plane 0")
    keys = load_keys()
    lum_l = h2g.get(djb2("l50_50"))
    locs = decode_locations(decompress_container(fetch_group(5, lum_l), keys[12850]))
    print(f"l50_50 decoded: {len(locs)} locations")
    objects, unders, overs, variant = load_configs()
    for known in (1276, 10583):
        print(f"object {known}: {objects.get(known)}")
    print(f"underlays {len(unders)}, overlays {len(overs)}, object wire variant {variant}")


if __name__ == "__main__":
    if "--build" in sys.argv:
        build()
    else:
        verify()
