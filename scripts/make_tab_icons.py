import struct
import zlib
from pathlib import Path

SIZE = 81
OUT = Path(__file__).resolve().parents[1] / "assets"

MUTED = (138, 126, 112, 255)
ACCENT = (184, 92, 56, 255)


def write_png(path, pixels):
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            raw.extend(pixels[y][x])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    content = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(content)


def blank():
    return [[(0, 0, 0, 0) for _ in range(SIZE)] for _ in range(SIZE)]


def set_px(pixels, x, y, color):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        pixels[y][x] = color


def draw_rect(pixels, x0, y0, x1, y1, color, width=3):
    for x in range(x0, x1 + 1):
        for t in range(width):
            set_px(pixels, x, y0 + t, color)
            set_px(pixels, x, y1 - t, color)
    for y in range(y0, y1 + 1):
        for t in range(width):
            set_px(pixels, x0 + t, y, color)
            set_px(pixels, x1 - t, y, color)


def draw_line(pixels, x0, y0, x1, y1, color, width=3):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        x = round(x0 + (x1 - x0) * i / steps)
        y = round(y0 + (y1 - y0) * i / steps)
        for dx in range(-width // 2, width // 2 + 1):
            for dy in range(-width // 2, width // 2 + 1):
                set_px(pixels, x + dx, y + dy, color)


def icon_library(color):
    pixels = blank()
    boxes = [(16, 16, 36, 36), (45, 16, 65, 36), (16, 45, 36, 65), (45, 45, 65, 65)]
    for box in boxes:
        draw_rect(pixels, *box, color, 3)
    return pixels


def icon_memory(color):
    pixels = blank()
    draw_rect(pixels, 22, 18, 62, 62, color, 3)
    draw_rect(pixels, 16, 24, 56, 68, color, 3)
    draw_line(pixels, 28, 36, 48, 36, color, 2)
    draw_line(pixels, 28, 46, 48, 46, color, 2)
    return pixels


def icon_import(color):
    pixels = blank()
    draw_rect(pixels, 18, 18, 63, 63, color, 3)
    draw_line(pixels, 40, 28, 40, 53, color, 3)
    draw_line(pixels, 28, 40, 53, 40, color, 3)
    return pixels


def icon_mine(color):
    pixels = blank()
    for y in range(18, 34):
        for x in range(32, 50):
            if (x - 40) ** 2 + (y - 26) ** 2 <= 64:
                set_px(pixels, x, y, color)
    for y in range(40, 64):
        for x in range(24, 58):
            if abs(x - 40) < 14 + (y - 40) * 0.15:
                set_px(pixels, x, y, color)
    return pixels


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    items = {
        "tab-library": icon_library,
        "tab-memory": icon_memory,
        "tab-import": icon_import,
        "tab-mine": icon_mine,
    }
    for name, builder in items.items():
        write_png(OUT / f"{name}.png", builder(MUTED))
        write_png(OUT / f"{name}-active.png", builder(ACCENT))
    print(f"wrote {len(items) * 2} icons to {OUT}")


if __name__ == "__main__":
    main()
