"""Compare two folders of PNG stills (golden vs current) by PSNR.

    python compare.py <reference dir> <test dir> [--min-psnr=40] [--diff=<dir>]

Pairs files by name. Prints each pair's PSNR (inf when identical) and exits 1 when any pair is below the threshold,
a file is missing, or the sizes differ. --diff writes an amplified difference image for every pair below the threshold.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def psnr(a, b):
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    return float("inf") if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


def main():
    ref, test = Path(sys.argv[1]), Path(sys.argv[2])
    opts = dict(a.lstrip("-").split("=", 1) for a in sys.argv[3:] if "=" in a)
    floor = float(opts.get("min-psnr", 40))
    diff_dir = Path(opts["diff"]) if "diff" in opts else None
    names = sorted(p.name for p in ref.glob("*.png"))
    if not names:
        sys.exit(f"no PNGs in {ref}")
    worst, failed = float("inf"), []
    for n in names:
        if not (test / n).exists():
            print(f"{n}  MISSING")
            failed.append(n)
            continue
        a = np.asarray(Image.open(ref / n).convert("RGB"))
        b = np.asarray(Image.open(test / n).convert("RGB"))
        if a.shape != b.shape:
            print(f"{n}  SIZE {a.shape[1]}x{a.shape[0]} vs {b.shape[1]}x{b.shape[0]}")
            failed.append(n)
            continue
        p = psnr(a, b)
        worst = min(worst, p)
        bad = p < floor
        print(f"{n}  {'inf' if p == float('inf') else f'{p:.2f} dB'}{'  FAIL' if bad else ''}")
        if bad:
            failed.append(n)
            if diff_dir:
                diff_dir.mkdir(parents=True, exist_ok=True)
                d = np.clip(np.abs(a.astype(np.int16) - b.astype(np.int16)) * 8, 0, 255).astype(np.uint8)
                Image.fromarray(d).save(diff_dir / n)
    print(f"{len(names)} stills, worst {'inf' if worst == float('inf') else f'{worst:.2f} dB'}, "
          f"{'PASS' if not failed else f'FAIL ({len(failed)})'} at {floor:g} dB")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
