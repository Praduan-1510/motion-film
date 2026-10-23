"""Keep the runtime brand-neutral and size-independent.

    python lint_runtime.py [runtime dir, default assets/runtime]

Fails on any chromatic colour literal in the runtime — hex (#RGB, #RRGGBB), rgb()/rgba() with fixed channels, or a shader
vec3() of constants — and on hard-coded stage sizes (1920, 1080). Neutral white and black (#fff, #000, rgba(255,255,255,a),
rgba(0,0,0,a), vec3(1.)) are allowed: they are material highlights and shadows, not brand colour. Brand colours come from
FILM.palette, sizes from FILM.w / FILM.h.
"""
import re
import sys
from pathlib import Path

HEX = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
RGB = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)")
VEC3 = re.compile(r"vec3\(\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*,\s*([\d.]+))?\s*\)")
SIZE = re.compile(r"(?<![\w.])(1920|1080)(?![\w.])")
NEUTRAL_HEX = {"#fff", "#ffffff", "#000", "#000000"}


def neutral(*ch):
    return len(set(ch)) == 1 and ch[0] in (0, 255, 1, 1.0)


def lint(path):
    out = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        code = line.split("//")[0] if not line.lstrip().startswith("<") else line
        for m in HEX.finditer(code):
            # an svg url(#id) or an element id is not a colour
            if m.group(0).lower() not in NEUTRAL_HEX and not re.search(r"(url\(|id=\"|href=\")\s*$", code[:m.start()]):
                out.append((n, f"colour {m.group(0)}"))
        for m in RGB.finditer(code):
            if not neutral(*map(int, m.groups())):
                out.append((n, f"colour {m.group(0)})"))
        for m in VEC3.finditer(code):
            vals = [float(v) for v in m.groups() if v is not None]
            if not all(v in (0.0, 1.0) for v in vals) or len(set(vals)) > 1:
                out.append((n, f"shader colour {m.group(0)}"))
        for m in SIZE.finditer(code):
            out.append((n, f"stage size {m.group(0)}"))
    return out


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "assets" / "runtime")
    bad = 0
    for f in sorted(root.rglob("*")):
        if f.suffix not in (".js", ".css", ".html", ".mjs"):
            continue
        for n, msg in lint(f):
            print(f"{f.relative_to(root)}:{n}: {msg}")
            bad += 1
    print(f"{'PASS' if not bad else f'FAIL: {bad} problem(s)'} ({root})")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
