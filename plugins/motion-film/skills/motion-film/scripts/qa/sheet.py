"""Tile review stills into labelled contact sheets (step 1 and 2 of the review loop).

    python sheet.py <stills dir> <out prefix> [--cols=3] [--width=640] [--per=9]

Reads the s_XXXXX.png stills that render.mjs writes (XXXXX = time in hundredths of a second), keeps their aspect ratio
(16:9, 9:16, 1:1, 4:5 alike), labels each with its time and writes <out prefix>_1.png, _2.png, … with --per stills each.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size):
    for f in ("C:/Windows/Fonts/consola.ttf", "/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if len(pos) < 2:
        sys.exit(__doc__)
    d, pre = Path(pos[0]), pos[1]
    cols, tw = int(opts.get("cols", 3)), int(opts.get("width", 640))
    per = int(opts.get("per", cols * cols))
    files = sorted(d.glob("s_*.png"))
    if not files:
        sys.exit(f"no s_*.png stills in {d}")
    w0, h0 = Image.open(files[0]).size
    th = round(tw * h0 / w0)
    f = font(max(14, tw // 24))
    for s in range(0, len(files), per):
        chunk = files[s:s + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw + (cols - 1) * 4, rows * th + (rows - 1) * 4), (60, 60, 60))
        for i, p in enumerate(chunk):
            im = Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS)
            dr = ImageDraw.Draw(im)
            lab = f"{int(p.stem[2:]) / 100:.2f}s"
            dr.rectangle([0, 0, max(tw // 5, 90), tw // 22 + 8], fill=(0, 0, 0))
            dr.text((6, 3), lab, fill=(255, 255, 0), font=f)
            sheet.paste(im, ((i % cols) * (tw + 4), (i // cols) * (th + 4)))
        out = f"{pre}_{s // per + 1}.png"
        sheet.save(out)
        print(out)


if __name__ == "__main__":
    main()
