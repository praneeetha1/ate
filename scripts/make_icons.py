#!/usr/bin/env python3
"""
Redraw the PWA / home-screen icons to match the app's header.

The mark is the "ate." wordmark: ink letters and a coral full stop on the
header's paper ground, the same three colours as tailwind.config.js.

There is no font rasteriser here, so the letters are drawn as geometry rather
than set as type — rounded strokes with round terminals, which is how Fredoka
is built anyway. Every shape is a signed distance field and coverage comes
from the distance itself, so it antialiases cleanly at any size.

Re-run after a palette change:  python3 scripts/make_icons.py
"""
import math, struct, zlib

PAPER = (0xFF, 0xEB, 0xD3)   # paper
INK   = (0x2B, 0x23, 0x20)   # ink
CORAL = (0xFF, 0x8B, 0x5E)   # accent

FIT = 0.76                   # fraction of the canvas the wordmark may span
                             # (also its maskable diameter — keep under 0.80)

# ── Wordmark geometry ────────────────────────────────────────────────
# Laid out left to right against a baseline, then auto-fitted, so the letters
# stay in proportion if any single measurement is nudged.
H      = 0.30                # x-height
W      = 0.100               # stroke weight
B      = 0.65                # baseline
R      = H / 2               # bowl radius of 'a' and 'e'
GAP    = 0.030
TAU    = 2 * math.pi

_shapes = []                 # (kind, args, colour)
_bounds = []                 # (point, radius) samples for the bounding box


def _bound(c, r):
    _bounds.append((c, r))


cursor = 0.0

# 'a' — bowl plus a stem on the right shoulder.
ax = cursor + R + W / 2
_shapes.append(('ring', ((ax, B - R), R, W), INK))
_shapes.append(('cap', ((ax + R, B - H), (ax + R, B), W), INK))
_bound((ax, B - R), R + W / 2)
cursor = ax + R + W / 2 + GAP

# 't' — ascending stem crossed at the x-height line.
tx = cursor + 0.33 * H + W / 2
_shapes.append(('cap', ((tx, B - 1.34 * H), (tx, B - W / 2), W), INK))
_shapes.append(('cap', ((tx - 0.33 * H, B - H), (tx + 0.40 * H, B - H), W), INK))
_bound((tx, B - 1.34 * H), W / 2)
_bound((tx - 0.33 * H, B - H), W / 2)
_bound((tx + 0.40 * H, B - H), W / 2)
_bound((tx, B), W / 2)
cursor = tx + 0.40 * H + W / 2 + GAP

# 'e' — a ring left open at the lower right, barred across the middle.
ex = cursor + R + W / 2
_shapes.append(('arc', ((ex, B - R), R, W, 0.0, math.radians(311)), INK))
_shapes.append(('cap', ((ex - R, B - R), (ex + R, B - R), W), INK))
_bound((ex, B - R), R + W / 2)
cursor = ex + R + W / 2 + GAP * 0.8

# '.' — the one coral element, as in the header.
DR = W * 0.62
dx = cursor + DR
_shapes.append(('disc', ((dx, B - DR), DR), CORAL))
_bound((dx, B - DR), DR)

# ── Auto-fit ─────────────────────────────────────────────────────────
_xs = [c[0] - r for c, r in _bounds] + [c[0] + r for c, r in _bounds]
_ys = [c[1] - r for c, r in _bounds] + [c[1] + r for c, r in _bounds]
_x0, _x1, _y0, _y1 = min(_xs), max(_xs), min(_ys), max(_ys)
K = FIT / max(_x1 - _x0, _y1 - _y0)
_CX, _CY = (_x0 + _x1) / 2, (_y0 + _y1) / 2


def T(p):
    return (0.5 + (p[0] - _CX) * K, 0.5 + (p[1] - _CY) * K)


def sd_disc(p, c, r):
    return math.hypot(p[0] - c[0], p[1] - c[1]) - r


def sd_ring(p, c, r, w):
    return abs(math.hypot(p[0] - c[0], p[1] - c[1]) - r) - w / 2


def sd_cap(p, a, b, w):
    px, py = p[0] - a[0], p[1] - a[1]
    bx, by = b[0] - a[0], b[1] - a[1]
    d2 = bx * bx + by * by
    t = 0.0 if d2 == 0 else max(0.0, min(1.0, (px * bx + py * by) / d2))
    return math.hypot(px - bx * t, py - by * t) - w / 2


def sd_arc(p, c, r, w, a0, a1):
    """Ring limited to the CCW sweep a0 → a1, with round caps at both ends."""
    dx_, dy_ = p[0] - c[0], -(p[1] - c[1])          # y-up for the angle test
    ang = math.atan2(dy_, dx_) % TAU
    a0m, a1m = a0 % TAU, a1 % TAU
    within = (a0m <= ang <= a1m) if a0m <= a1m else (ang >= a0m or ang <= a1m)
    if within:
        return abs(math.hypot(dx_, dy_) - r) - w / 2
    best = float('inf')
    for a in (a0m, a1m):
        e = (c[0] + r * math.cos(a), c[1] - r * math.sin(a))
        best = min(best, math.hypot(p[0] - e[0], p[1] - e[1]) - w / 2)
    return best


def over(dst, src, a):
    return tuple(int(round(s * a + d * (1 - a))) for d, s in zip(dst, src))


def render(size):
    feather = 1.0 / size
    # Pre-transform every shape once, not per pixel.
    prepared = []
    for kind, args, colour in _shapes:
        if kind == 'disc':
            c, r = args
            prepared.append((lambda p, c=T(c), r=r * K: sd_disc(p, c, r), colour))
        elif kind == 'ring':
            c, r, w = args
            prepared.append((lambda p, c=T(c), r=r * K, w=w * K: sd_ring(p, c, r, w), colour))
        elif kind == 'cap':
            a, b, w = args
            prepared.append((lambda p, a=T(a), b=T(b), w=w * K: sd_cap(p, a, b, w), colour))
        elif kind == 'arc':
            c, r, w, a0, a1 = args
            prepared.append((lambda p, c=T(c), r=r * K, w=w * K, a0=a0, a1=a1:
                             sd_arc(p, c, r, w, a0, a1), colour))

    rows = []
    for y in range(size):
        row = bytearray()
        py = (y + 0.5) / size
        for x in range(size):
            p = ((x + 0.5) / size, py)
            col = PAPER
            for sdf, paint in prepared:
                a = max(0.0, min(1.0, 0.5 - sdf(p) / feather))
                if a > 0:
                    col = over(col, paint, a)
            row += bytes(col)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + r for r in rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/icons'
    for name, size in (('icon-192.png', 192), ('icon-512.png', 512),
                       ('apple-touch-icon.png', 180)):
        print(f'{name:<22} {size}x{size}  {write_png(f"{out}/{name}", size, render(size)):>7,} bytes')
