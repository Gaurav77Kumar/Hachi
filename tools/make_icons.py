import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUTPUT_SIZES = (16, 32, 48, 128)
RENDER_SIZE = 256

DARK_GREEN = (10, 55, 40, 255)
MID_GREEN = (32, 105, 73, 255)
CREAM = (244, 231, 205, 255)
SKY_TOP = (30, 74, 96, 255)
SKY_BOTTOM = (86, 157, 163, 255)
MOON = (250, 200, 84, 255)
MOON_LIGHT = (255, 226, 140, 255)
HILL_BACK = (36, 100, 75, 255)
HILL_FRONT = (17, 65, 50, 255)
LEAF = (13, 61, 45, 255)


def mix(first, second, amount):
    amount = min(1, max(0, amount))
    return tuple(round(first[index] * (1 - amount) + second[index] * amount) for index in range(4))


def inside_rounded_rect(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def inside_ellipse(x, y, cx, cy, rx, ry, angle):
    dx = x - cx
    dy = y - cy
    cosine = math.cos(angle)
    sine = math.sin(angle)
    u = dx * cosine + dy * sine
    v = -dx * sine + dy * cosine
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1


def distance_to_bezier(x, y, points, samples=48):
    best = 1e9
    for index in range(samples):
        t = index / (samples - 1)
        inverse = 1 - t
        px = inverse ** 3 * points[0][0] + 3 * inverse ** 2 * t * points[1][0] + 3 * inverse * t ** 2 * points[2][0] + t ** 3 * points[3][0]
        py = inverse ** 3 * points[0][1] + 3 * inverse ** 2 * t * points[1][1] + 3 * inverse * t ** 2 * points[2][1] + t ** 3 * points[3][1]
        best = min(best, (x - px) ** 2 + (y - py) ** 2)
    return math.sqrt(best)


def inside_triangle(x, y, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign((x, y), a, b)
    d2 = sign((x, y), b, c)
    d3 = sign((x, y), c, a)
    has_negative = d1 < 0 or d2 < 0 or d3 < 0
    has_positive = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_negative and has_positive)


def render_pixel(x, y):
    radius = 0.49
    distance = math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    if distance > radius:
        return (0, 0, 0, 0)
    color = mix(DARK_GREEN, MID_GREEN, (0.5 - distance) * 0.95)

    frame = (0.235, 0.315, 0.795, 0.855)
    art = (0.29, 0.37, 0.74, 0.80)
    if inside_rounded_rect(x, y, *frame, 0.12):
        color = CREAM
    if inside_rounded_rect(x, y, *art, 0.075):
        color = mix(SKY_TOP, SKY_BOTTOM, (y - art[1]) / (art[3] - art[1]))

        if inside_ellipse(x, y, 0.645, 0.505, 0.125, 0.125, 0):
            color = MOON
        if inside_ellipse(x, y, 0.625, 0.485, 0.075, 0.075, 0):
            color = MOON_LIGHT

        for star_x, star_y, star_radius in ((0.395, 0.435, 0.028), (0.50, 0.405, 0.022), (0.53, 0.60, 0.020)):
            if inside_ellipse(x, y, star_x, star_y, star_radius, star_radius, 0):
                color = MOON_LIGHT

        hill = 0.655 + 0.035 * math.sin(x * 13)
        if y > hill:
            color = HILL_BACK
        if y > hill + 0.055:
            color = HILL_FRONT
        if inside_triangle(x, y, (0.315, 0.80), (0.40, 0.66), (0.43, 0.80)):
            color = LEAF
        if inside_triangle(x, y, (0.43, 0.80), (0.52, 0.62), (0.555, 0.80)):
            color = LEAF

    stem = ((0.285, 0.79), (0.335, 0.62), (0.42, 0.45), (0.485, 0.245))
    if distance_to_bezier(x, y, stem) < 0.030:
        color = CREAM
    if inside_ellipse(x, y, 0.305, 0.565, 0.145, 0.075, -0.70):
        color = CREAM
    if inside_ellipse(x, y, 0.425, 0.345, 0.105, 0.215, 0.60):
        color = CREAM
    if inside_ellipse(x, y, 0.335, 0.695, 0.115, 0.060, -0.70):
        color = CREAM
    return color


def render_pixels():
    pixels = []
    for y in range(RENDER_SIZE):
        row = []
        for x in range(RENDER_SIZE):
            row.append(render_pixel((x + 0.5) / RENDER_SIZE, (y + 0.5) / RENDER_SIZE))
        pixels.append(row)
    return pixels


def resize(pixels, size):
    scale = RENDER_SIZE // size
    output = []
    for y in range(size):
        row = []
        for x in range(size):
            channels = [0, 0, 0, 0]
            for offset_y in range(scale):
                for offset_x in range(scale):
                    pixel = pixels[y * scale + offset_y][x * scale + offset_x]
                    for channel in range(4):
                        channels[channel] += pixel[channel]
            row.append(tuple(round(channel / (scale * scale)) for channel in channels))
        output.append(row)
    return output


def write_png(path, pixels):
    size = len(pixels)
    raw = b""
    for row in pixels:
        raw += b"\x00"
        for pixel in row:
            raw += struct.pack("4B", *pixel)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT.mkdir(exist_ok=True)
    pixels = render_pixels()
    for size in OUTPUT_SIZES:
        path = OUT / f"icon{size}.png"
        write_png(path, resize(pixels, size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
