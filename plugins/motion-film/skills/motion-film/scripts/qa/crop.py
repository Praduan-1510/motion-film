"""Crop regions out of stills into one comparison sheet (for looking closely at a collision, a seam or a face).

    python crop.py <out.png> <still.png>@x0,y0,x1,y1 [<still.png>@x0,y0,x1,y1 …] [--width=960] [--cols=2]

Each crop is scaled to --width and placed --cols per row.
"""
import sys

from PIL import Image


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if len(pos) < 2:
        sys.exit(__doc__)
    w, cols = int(opts.get("width", 960)), int(opts.get("cols", 2))
    tiles = []
    for a in pos[1:]:
        f, box = a.rsplit("@", 1)
        im = Image.open(f).convert("RGB").crop(tuple(int(v) for v in box.split(",")))
        tiles.append(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS))
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    sheet = Image.new("RGB", (cols * w + (cols - 1) * 4, sum(max(t.height for t in r) for r in rows) + 4 * (len(rows) - 1)), (60, 60, 60))
    y = 0
    for r in rows:
        for j, t in enumerate(r):
            sheet.paste(t, (j * (w + 4), y))
        y += max(t.height for t in r) + 4
    sheet.save(pos[0])
    print(pos[0])


if __name__ == "__main__":
    main()
