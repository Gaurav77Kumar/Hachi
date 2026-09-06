# Generates the Ads→Art icons: a dark rounded square; the left half is an ugly
# "banner ad" shape, the right half a framed painting with an easel leg. Pure
# stdlib PNG writer.
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

BG = (0x0D, 0x11, 0x17, 0xFF)
BANNER = (0xF8, 0x51, 0x49, 0xFF)      # red ad block
FRAME = (0xD4, 0xAF, 0x37, 0xFF)       # gold frame
CANVAS1 = (0x39, 0xD3, 0x53, 0xFF)     # greens — the "art"
CANVAS2 = (0x00, 0x6D, 0x32, 0xFF)
WHITE = (0xE6, 0xED, 0xF3, 0xFF)


def in_rounded(x, y, size, r):
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def make_pixel_fn(size):
    pad = size * 0.16
    br = size * 0.22

    # banner: left strip, upper area
    bx0, by0, bw, bh = pad, pad, size * 0.30, size * 0.34

    # painting: right area with gold frame + art inside
    px0, py0, pw, ph = size * 0.52, pad, size * 0.32, size * 0.52

    def px(x, y):
        if not in_rounded(x, y, size, br):
            return (0, 0, 0, 0)
        # banner ad block (top-left) with fake text lines
        if bx0 <= x < bx0 + bw and by0 <= y < by0 + bh:
            ty = y - by0
            if ty < bh * 0.28 or bh * 0.5 < ty < bh * 0.78:
                return WHITE
            return BANNER
        # gold frame
        if px0 <= x < px0 + pw and py0 <= y < py0 + ph:
            ix0, iy0 = px0 + size * 0.025, py0 + size * 0.025
            ix1, iy1 = px0 + pw - size * 0.025, py0 + ph - size * 0.025
            if ix0 <= x < ix1 and iy0 <= y < iy1:
                # sky/ground split inside the painting
                mid = iy0 + (iy1 - iy0) * 0.45
                return CANVAS1 if y < mid else CANVAS2
            return FRAME
        # easel leg under the painting
        if abs(x - (px0 + pw / 2)) < size * 0.028 and py0 + ph <= y < size - size * 0.10:
            return FRAME
        return BG

    return px


def write_png(path, size):
    fn = make_pixel_fn(size)
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            raw += struct.pack("4B", *fn(x, y))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


for s in (16, 32, 48, 128):
    write_png(OUT / f"icon{s}.png", s)
    print(f"wrote {OUT / f'icon{s}.png'}")
