#!/usr/bin/env python3
"""
Builds ETHERFALL sprite sheets from the Flare game art (CC-BY-SA 3.0, see CREDITS.md).

Flare ships packed atlases: every frame line is `frame=index,direction,x,y,w,h,anchorX,anchorY[,image]`.
This tool unpacks them into a uniform grid (one cell per frame, feet at the same point in every cell),
composes the layered hero avatars (chest/legs/hands/feet/head/main/off in Flare's per-direction order),
scales everything by one common factor (creatures keep their size relative to the heroes) and writes
WebP sheets plus a TypeScript manifest the client reads.

Usage:  python3 tools/flare-sheets.py <flare-game checkout> <out dir for .webp> <out .ts manifest> [only...]
"""
import json
import math
import os
import sys
from PIL import Image

FLARE, OUT, MANIFEST = sys.argv[1], sys.argv[2], sys.argv[3]
CORE = os.path.join(FLARE, 'mods/fantasycore')
SCALE = 0.45            # output px per Flare px (a standing hero ends up ~64 px tall)
M_PER_SRC_PX = 0.0118   # world meters per Flare px (same for every sheet: creatures keep their relative size)
SEGS = ['stance', 'run', 'swing', 'cast', 'shoot', 'block', 'hit', 'die', 'spawn', 'dash_attack']
# Flare direction index -> map-direction name (used by the layer order) and -> facing on screen.
# Rows in the output follow ETHERFALL: 0 W, 1 NW, 2 N, 3 NE, 4 E, 5 SE, 6 S, 7 SW.
FLARE_DIR_NAMES = ['SW', 'W', 'NW', 'N', 'NE', 'E', 'SE', 'S']
SCREEN_DIR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
SHEET_W = 2048
ROW_OF = {'W': 0, 'NW': 1, 'N': 2, 'NE': 3, 'E': 4, 'SE': 5, 'S': 6, 'SW': 7}
LAYER_ORDER = {
    'SW': 'main feet legs hands chest off head', 'W': 'main feet legs hands chest off head',
    'NW': 'main feet legs hands chest off head', 'N': 'feet legs hands chest off head main',
    'NE': 'feet legs hands chest off head main', 'E': 'feet legs hands chest off head main',
    'SE': 'feet legs hands main chest head off', 'S': 'main feet legs hands chest head off',
}


def parse(path):
    images, segs, cur, default_img = {}, {}, None, None
    for raw in open(path, encoding='utf-8'):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('['):
            cur = line[1:-1]
            segs[cur] = {'frames': 0, 'duration': 400, 'type': 'play_once', 'f': {}}
            continue
        k, _, v = line.partition('=')
        if k == 'image':
            parts = v.split(',')
            key = parts[1] if len(parts) > 1 else '_'
            images[key] = os.path.join(CORE, parts[0])
            default_img = default_img or key
        elif cur and k == 'frames':
            segs[cur]['frames'] = int(v)
        elif cur and k == 'duration':
            segs[cur]['duration'] = int(v.replace('ms', '')) if 'ms' in v else int(float(v.replace('s', '')) * 1000)
        elif cur and k == 'type':
            segs[cur]['type'] = v
        elif cur and k == 'frame':
            p = v.split(',')
            i, d, x, y, w, h, ax, ay = map(int, p[:8])
            img = p[8] if len(p) > 8 else default_img
            segs[cur]['f'][(i, d)] = (img, x, y, w, h, ax, ay)
    return images, segs


_img_cache = {}


def img(path):
    if path not in _img_cache:
        _img_cache[path] = Image.open(path).convert('RGBA')
    return _img_cache[path]


def build(name, layers):
    """layers: list of (anim txt path, layer type or None). Returns the manifest entry."""
    parsed = [(parse(p), t) for p, t in layers]
    base_segs = parsed[0][0][1]
    order = [s for s in SEGS if s in base_segs]
    # extents around the anchor over every frame of every layer
    L = R = U = D = 1
    for (_images, segs), _ in parsed:
        for s in order:
            for (_k, _x, _y, w, h, ax, ay) in segs.get(s, {'f': {}})['f'].values():
                L, R, U, D = max(L, ax), max(R, w - ax), max(U, ay), max(D, h - ay)
    src_w, src_h = L + R, U + D
    ax_out, ay_out = round(L * SCALE) + 1, round(U * SCALE) + 1
    starts, total = {}, 0
    for s in order:
        starts[s] = total
        total += base_segs[s]['frames']
    layered = any(t for _, t in parsed)
    crops = [None] * (total * 8)
    for s in order:
        for i in range(base_segs[s]['frames']):
            for d in range(8):
                dname = FLARE_DIR_NAMES[d]
                cell = Image.new('RGBA', (src_w, src_h))
                lay = parsed
                if layered:
                    rank = {t: n for n, t in enumerate(LAYER_ORDER[dname].split())}
                    lay = sorted(parsed, key=lambda pt: rank.get(pt[1], 0))
                for (images, segs), _t in lay:
                    fr = segs.get(s, {'f': {}})['f'].get((i, d))
                    if not fr:
                        continue
                    k, x, y, w, h, fax, fay = fr
                    cell.alpha_composite(img(images[k]).crop((x, y, x + w, y + h)), (L - fax, U - fay))
                cell = cell.resize((round(src_w * SCALE), round(src_h * SCALE)), Image.LANCZOS)
                bb = cell.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox() or (0, 0, 1, 1)
                idx = ROW_OF[SCREEN_DIR[d]] * total + starts[s] + i
                crops[idx] = (cell.crop(bb), ax_out - 1 - bb[0], ay_out - 1 - bb[1])
    # identical frames (e.g. hit = first frames of die) share one rect
    first, same = {}, {}
    for n, (im, ox, oy) in enumerate(crops):
        key = (im.size, ox, oy, im.tobytes())
        if key in first:
            same[n] = first[key]
        else:
            first[key] = n
    # shelf packing, tallest first
    order_idx = sorted((n for n in range(len(crops)) if n not in same), key=lambda n: -crops[n][0].size[1])
    rects = [None] * len(crops)
    x = y = shelf = 0
    for n in order_idx:
        w, h = crops[n][0].size
        if x + w + 1 > SHEET_W:
            x, y, shelf = 0, y + shelf + 1, 0
        rects[n] = (x, y, w, h)
        x += w + 1
        shelf = max(shelf, h)
    for n, m in same.items():
        rects[n] = rects[m]
    sheet = Image.new('RGBA', (SHEET_W, y + shelf + 1))
    for n, (im, _ox, _oy) in enumerate(crops):
        if n not in same:
            sheet.alpha_composite(im, rects[n][:2])
    out = os.path.join(OUT, f'{name}.webp')
    sheet.save(out, 'WEBP', quality=72, alpha_quality=75, method=6)
    segs_out = {s: [starts[s], base_segs[s]['frames'], base_segs[s]['duration'], base_segs[s]['type']] for s in order}
    print(f'{name:22s} {sheet.size[0]}x{sheet.size[1]} {os.path.getsize(out) // 1024} KB', flush=True)
    rect_list = [v for n in range(len(crops)) for v in (*rects[n], crops[n][1], crops[n][2])]
    return {'file': f'{name}.webp', 'w': SHEET_W, 'h': sheet.size[1], 'frames': total,
            'mpp': round(M_PER_SRC_PX / SCALE, 5), 'segs': segs_out, 'rects': rect_list}


A = os.path.join(CORE, 'animations')
HEROES = {
    #            chest             legs               hands                feet               head gear        main          off
    'vanguard': ['plate_cuirass', 'plate_greaves', 'plate_gauntlets', 'plate_boots', None, 'longsword', 'kite_shield'],
    'arcanist': ['mage_vest', 'mage_skirt', 'mage_sleeves', 'mage_boots', 'mage_hood', 'greatstaff', None],
    'healer': ['mage_vest_alt1', 'mage_skirt_alt1', 'mage_sleeves_alt1', 'mage_boots_alt1', None, 'rod', 'iron_buckler'],
    'ranger': ['leather_chest', 'leather_pants', 'leather_gloves', 'leather_boots', 'leather_hood', 'longbow', None],
    'rogue': ['leather_chest', 'leather_pants', 'cloth_gloves', 'leather_boots', None, 'dagger', None],
    'barbarian': ['default_chest', 'leather_pants', 'leather_gloves', 'leather_boots', None, 'battle_axe', None],
    'warlock': ['mage_vest_alt2', 'mage_skirt_alt2', 'mage_sleeves_alt2', 'mage_boots_alt2', 'mage_hood_alt2', 'wand', None],
}
TYPES = ['chest', 'legs', 'hands', 'feet', 'head', 'main', 'off']
CREATURES = ['goblin', 'goblin_elite', 'skeleton', 'skeleton_archer', 'skeleton_mage', 'zombie',
             'minotaur', 'antlion', 'fire_ant', 'ice_ant', 'wyvern_fire', 'wyvern_water', 'cursed_grave']

only = set(sys.argv[4:])
os.makedirs(OUT, exist_ok=True)
prev = json.load(open(os.path.join(OUT, 'manifest.json'))) if os.path.exists(os.path.join(OUT, 'manifest.json')) else {}
manifest = {}
for gender, headname in (('m', 'head_short'), ('f', 'head_long')):
    folder = 'male' if gender == 'm' else 'female'
    for cls, gear in HEROES.items():
        key = f'hero_{cls}_{gender}'
        if only and key not in only:
            manifest[key] = prev.get(key)
            continue
        layers = []
        for t, item in zip(TYPES, gear):
            item = item or (headname if t == 'head' else None)
            if item:
                layers.append((os.path.join(A, 'avatar', folder, f'{item}.txt'), t))
        manifest[key] = build(key, layers)
for c in CREATURES:
    if only and c not in only:
        manifest[c] = prev.get(c)
        continue
    manifest[c] = build(c, [(os.path.join(A, 'enemies', f'{c}.txt'), None)])
manifest = {k: v for k, v in manifest.items() if v}
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
with open(MANIFEST, 'w') as f:
    f.write('// Generated by tools/flare-sheets.py from the Flare art (CC-BY-SA 3.0) — do not edit by hand.\n')
    f.write('/** One packed sheet: `rects` holds 6 ints per frame (x, y, w, h, anchorX, anchorY), frame = row * frames + index. */\n')
    f.write('export interface SheetDef {\n  file: string; w: number; h: number; frames: number; mpp: number; rects: number[];\n')
    f.write('  segs: Record<string, [start: number, count: number, ms: number, type: string]>;\n}\n')
    f.write(f'export const SHEETS: Record<string, SheetDef> = {json.dumps(manifest, separators=(",", ":"))};\n')
