"""Check that this machine can build films, and say how to fix what is missing.

    python doctor.py [--json] [--work=<dir whose drive holds the render frames>]

Checks: Node 22+ (the renderer uses Node's built-in fetch and WebSocket), Chrome and its version (139+ for CSS
corner-shape, which the Liquid Glass and iOS shapes use; set CHROME to pick another build), WebGL in headless Chrome and
whether it runs on the GPU or in software (software rendering is several times slower), Python 3.10+ with numpy, scipy,
Pillow and imageio-ffmpeg (whose bundled ffmpeg encodes the MP4s), and free disk space (about 4 GB of temporary frames per
45 s format at 1920 x 1080).
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
MIN_NODE, MIN_CHROME, MIN_PY = 22, 139, (3, 10)
GB_PER_45S = 4


def run(cmd, timeout=120):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def check_node():
    exe = shutil.which("node")
    if not exe:
        return False, "not found", "install Node.js 22 or newer (nodejs.org) and put it on PATH"
    _, out, _ = run([exe, "--version"])
    major = int(re.match(r"v(\d+)", out).group(1)) if out.startswith("v") else 0
    ok = major >= MIN_NODE
    return ok, f"{out} ({exe})", None if ok else f"Node {out} is too old: install Node {MIN_NODE} or newer"


def check_chrome():
    code, out, err = run(["node", str(SCRIPTS / "qa" / "probe.mjs"), "gpu"], timeout=90)
    if code != 0:
        msg = (err or out).splitlines()[-1] if (err or out) else "probe failed"
        return [("chrome", False, msg, "install Google Chrome, or set CHROME to a Chrome / Chrome for Testing executable")]
    g = json.loads(out.splitlines()[-1])
    major = int(str(g.get("chrome", "0")).split(".")[0])
    rows = [("chrome", major >= MIN_CHROME, f"Chrome {major}",
             None if major >= MIN_CHROME else f"Chrome {major} is too old: the glass and iOS shapes need {MIN_CHROME}+ (CSS corner-shape)")]
    if not g.get("webgl"):
        rows.append(("webgl", False, "WebGL unavailable in headless Chrome", "update the GPU driver; the backgrounds need WebGL"))
    else:
        soft = g.get("software")
        rows.append(("webgl", True, f"{'software' if soft else 'GPU'}: {g.get('renderer')}",
                     "rendering in software: expect final renders several times slower" if soft else None))
    return rows


def check_python():
    ok = sys.version_info >= MIN_PY
    rows = [("python", ok, f"{sys.version.split()[0]} ({sys.executable})", None if ok else "install Python 3.10 or newer")]
    missing = []
    for mod, pip in (("numpy", "numpy"), ("scipy", "scipy"), ("PIL", "Pillow"), ("imageio_ffmpeg", "imageio-ffmpeg")):
        try:
            __import__(mod)
        except ImportError:
            missing.append(pip)
    rows.append(("python packages", not missing, "numpy, scipy, Pillow, imageio-ffmpeg" if not missing else "missing: " + ", ".join(missing),
                 None if not missing else f"{sys.executable} -m pip install -r {SCRIPTS.parent / 'requirements.txt'}"))
    if "imageio-ffmpeg" not in missing:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        _, out, _ = run([exe, "-version"])
        rows.append(("ffmpeg", bool(out), out.splitlines()[0][:60] if out else "not runnable", None if out else "reinstall imageio-ffmpeg"))
    return rows


def check_disk(work):
    free = shutil.disk_usage(work).free / 1e9
    ok = free >= GB_PER_45S + 1
    return ("disk", ok, f"{free:.0f} GB free on {Path(work).anchor or work}",
            None if ok else f"free at least {GB_PER_45S + 1} GB: final renders keep about {GB_PER_45S} GB of frames per 45 s format until export")


def main():
    opts = dict(a.lstrip("-").split("=", 1) if "=" in a else (a.lstrip("-"), "1") for a in sys.argv[1:])
    work = Path(opts.get("work", Path.cwd()))
    node_ok, node_msg, node_fix = check_node()
    rows = [("node", node_ok, node_msg, node_fix)]
    rows += check_chrome() if node_ok else [("chrome", False, "skipped (needs Node)", None)]
    rows += check_python()
    rows.append(check_disk(work))
    if "json" in opts:
        print(json.dumps([{"check": n, "ok": ok, "detail": d, "fix": f} for n, ok, d, f in rows], indent=1))
    else:
        for n, ok, d, f in rows:
            print(f"{'ok ' if ok else 'FAIL'}  {n:<16} {d}")
            if f:
                print(f"      {'':<16} -> {f}")
        print("ready" if all(ok for _, ok, _, _ in rows) else "not ready: fix the items marked FAIL")
    sys.exit(0 if all(ok for _, ok, _, _ in rows) else 1)


if __name__ == "__main__":
    main()
