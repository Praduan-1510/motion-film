"""Merge motion-blur sub-frames into final frames.

    python merge.py <subframe dir> <frame dir> --frames=<n> [--sub=12] [--watch] [--keep] [--mod=4 --rem=0]

Averages each frame's sub-frames (count from its .done marker, else --sub) in linear light (correct motion blur), adds ±1 LSB
triangular dither before quantising back to 8-bit sRGB (no banding in the dark gradients), writes frame_00000.png and deletes
the sub-frames unless --keep. With --watch it follows a running render until its frames all exist; --mod/--rem split the
frames between parallel merger processes. The frame size is read from the sub-frames.
"""
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

RNG = np.random.default_rng(7)

# sRGB → linear as a 256-entry table; linear → sRGB as a 16384-entry table (sub-LSB precision, no pow() per pixel)
_x = np.arange(256) / 255.0
TO_LIN = np.where(_x <= 0.04045, _x / 12.92, ((_x + 0.055) / 1.055) ** 2.4).astype(np.float32)
_y = np.linspace(0, 1, 16384)
TO_SRGB = (np.where(_y <= 0.0031308, _y * 12.92, 1.055 * np.power(_y, 1 / 2.4) - 0.055) * 255.0).astype(np.float32)


def merge(sub_dir, out_dir, f, sub, keep):
    done = (sub_dir / f"f{f:05d}.done").read_text().strip()
    sub = int(done) if done else sub          # the renderer records each frame's sample count in its .done marker
    names = [sub_dir / f"f{f:05d}_s{j}.png" for j in range(sub)]
    acc = None
    for n in names:
        px = TO_LIN[np.asarray(Image.open(n).convert("RGB"))]
        if acc is None:
            acc = np.zeros(px.shape, np.float32)
        acc += px
    idx = np.minimum((acc * (16383.0 / sub)).astype(np.int32), 16383)
    srgb = TO_SRGB[idx]
    srgb += RNG.random(srgb.shape, dtype=np.float32) - RNG.random(srgb.shape, dtype=np.float32)
    out = np.clip(np.rint(srgb), 0, 255).astype(np.uint8)
    tmp = out_dir / f"frame_{f:05d}.tmp.png"
    Image.fromarray(out).save(tmp, compress_level=1)
    os.replace(tmp, out_dir / f"frame_{f:05d}.png")
    if not keep:
        for n in names:
            n.unlink(missing_ok=True)
        (sub_dir / f"f{f:05d}.done").unlink(missing_ok=True)


def main():
    sub_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    opts = dict(a.lstrip("-").split("=") if "=" in a else (a.lstrip("-"), "1") for a in sys.argv[3:])
    if "frames" not in opts:
        sys.exit("--frames=<n> is required (render.mjs info reports it)")
    frames = int(opts["frames"])
    sub, watch, keep = int(opts.get("sub", 12)), "watch" in opts, "keep" in opts
    mod, rem = int(opts.get("mod", 1)), int(opts.get("rem", 0))
    first, last = int(opts.get("from", 0)), int(opts.get("to", frames))
    mine = {f for f in range(first, last) if f % mod == rem}
    out_dir.mkdir(parents=True, exist_ok=True)
    done = {int(p.stem[6:11]) for p in out_dir.glob("frame_*.png") if ".tmp" not in p.name} & mine
    t0 = time.time()
    while True:
        ready = sorted(f for f in (int(p.stem[1:6]) for p in sub_dir.glob("f*.done")) if f in mine)
        todo = [f for f in ready if f not in done]
        for f in todo:
            merge(sub_dir, out_dir, f, sub, keep)
            done.add(f)
            if len(done) % 50 == 0:
                print(f"merger {rem}: {len(done)}/{len(mine)} frames ({time.time() - t0:.0f} s)", flush=True)
        if not watch or len(done) >= len(mine):
            break
        if not todo:
            time.sleep(2)
    print(f"merger {rem} merged {len(done)} frames", flush=True)


if __name__ == "__main__":
    main()
