#!/usr/bin/env python3
"""Measure a floorplan image: print the dark (wall) runs along chosen rows and
columns, in the image's own pixels. Gaps in a wall run are doors or windows.

    python3 scripts/floorplan-walls.py plan.jpg --rows 150 600 1000 --cols 300 700
    python3 scripts/floorplan-walls.py plan.jpg --fill 150,120 700,800   # a room's box, from its fill colour

Needs Pillow (pip install pillow)."""
import argparse
from collections import deque
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('--rows', type=int, nargs='*', default=[])
ap.add_argument('--cols', type=int, nargs='*', default=[])
ap.add_argument('--fill', nargs='*', default=[], help='x,y points inside rooms: prints each room\'s bounding box by flood fill')
ap.add_argument('--dark', type=int, default=80, help='grey level below which a pixel counts as wall (0-255)')
ap.add_argument('--min', type=int, default=4, help='shortest run to report, in pixels')
a = ap.parse_args()

im = Image.open(a.image).convert('RGB')
W, H = im.size
grey = im.convert('L').load()
rgb = im.load()
print(f'image {W} x {H}')

def runs(vals, off=0):
    out, s = [], None
    for i, v in enumerate(vals + [255]):
        if v < a.dark and s is None: s = i
        elif v >= a.dark and s is not None:
            if i - s >= a.min: out.append((s + off, i - 1 + off))
            s = None
    return out

for y in a.rows: print(f'row {y}:', runs([grey[x, y] for x in range(W)]))
for x in a.cols: print(f'col {x}:', runs([grey[x, y] for y in range(H)]))

for p in a.fill:
    x, y = (int(v) for v in p.split(','))
    c = rgb[x, y]
    near = lambda q: sum(abs(i - j) for i, j in zip(q, c)) < 40
    seen, q, xs, ys = {(x, y)}, deque([(x, y)]), [], []
    while q:
        u, v = q.popleft(); xs.append(u); ys.append(v)
        for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (u + du, v + dv)
            if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen and near(rgb[n]):
                seen.add(n); q.append(n)
    print(f'fill at {x},{y} colour {c}: x {min(xs)}..{max(xs)} y {min(ys)}..{max(ys)} ({len(xs)} px; doorways can leak into the next room)')
