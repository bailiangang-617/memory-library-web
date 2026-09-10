import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "assets"
BG = (244, 239, 230, 255)
FG = (184, 92, 56, 255)


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixels[y][x])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def make(size):
    pixels = [[BG for _ in range(size)] for _ in range(size)]
    pad = size // 6
    mid = size // 2
    for x in range(pad, size - pad):
        for t in range(size // 18):
            pixels[pad + t][x] = FG
            pixels[size - pad - t][x] = FG
            pixels[x][pad + t] = FG
            pixels[x][size - pad - t] = FG
    for x in range(mid - size // 16, mid + size // 16):
        for y in range(pad + size // 8, size - pad - size // 8):
            pixels[y][x] = FG
    for y in range(mid - size // 16, mid + size // 16):
        for x in range(pad + size // 8, size - pad - size // 8):
            pixels[y][x] = FG
    return pixels


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    icon = make(192)
    write_png(OUT / "icon.png", 192, icon)
    write_png(OUT / "adaptive-icon.png", 192, icon)
    write_png(OUT / "splash-icon.png", 192, icon)
    print(f"wrote icons to {OUT}")


if __name__ == "__main__":
    main()
