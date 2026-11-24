"""Slice AI sprite sheets on magenta into transparent webp sprites.

Usage: python tools/slice.py <sheet.png> <rows> <cols> <name1,name2,...> [size]
Chroma-keys magenta, splits by grid, trims each cell to its content bbox,
keeps only the largest blob per cell (drops neighbour bleed), saves to public/assets/<name>.webp.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets'
BG_V = 212  # brightness of the magenta background


def key_magenta(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    border = sorted(max(px[x, y][0], px[x, y][2]) for x, y in
                    [(i, 2) for i in range(0, w, 16)] + [(2, i) for i in range(0, h, 16)])
    bg_v = border[len(border) // 2] - 6
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Magenta hue (bg, its drop shadows, and anti-aliased edges): r~b, g low.
            if g < 0.38 * max(r, b) and abs(r - b) < 80 and max(r, b) > 40 and b > 0.55 * r:
                v = max(r, b)
                # Bright magenta = background (transparent); darker magenta = shadow (black, partial alpha).
                a = int(max(0, min(1, (bg_v - v) / bg_v)) * 255 * 1.4)
                px[x, y] = (10, 6, 4, min(200, a))
    return im


def largest_blob_mask(cell: Image.Image) -> Image.Image:
    """Mask of the biggest connected opaque area (+ blobs close to it)."""
    a = cell.split()[3].point(lambda v: 255 if v > 30 else 0)
    small = a.resize((max(1, a.width // 4), max(1, a.height // 4)))
    small = small.filter(ImageFilter.MaxFilter(5))
    w, h = small.size
    data = small.load()
    seen = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if data[x, y] and not seen[y][x]:
                stack = [(x, y)]
                seen[y][x] = True
                comp = []
                while stack:
                    cx, cy = stack.pop()
                    comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and data[nx, ny] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = 255
    return mask.resize(cell.size)


def main():
    sheet, rows, cols, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].split(',')
    size = int(sys.argv[5]) if len(sys.argv) > 5 else 256
    im = key_magenta(Image.open(sheet))
    W, H = im.size
    cw, ch = W / cols, H / rows
    OUT.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        if not name or name == '-':
            continue
        r, c = divmod(i, cols)
        cell = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
        mask = largest_blob_mask(cell)
        alpha = Image.composite(cell.split()[3], Image.new('L', cell.size, 0), mask)
        cell.putalpha(alpha)
        bbox = cell.getbbox()
        if not bbox:
            print('empty', name)
            continue
        cell = cell.crop(bbox)
        cell.thumbnail((size, size), Image.LANCZOS)
        cell.save(OUT / f'{name}.webp', 'WEBP', quality=82, method=6)
        print(name, cell.size)


if __name__ == '__main__':
    main()
