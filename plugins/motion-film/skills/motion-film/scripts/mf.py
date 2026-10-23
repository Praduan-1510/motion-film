"""mf — the motion-film command line. Pages and folders are file paths (never "/…" URL paths, so no shell rewrites them).

    mf doctor                                   check Node, Chrome, WebGL/GPU, Python packages, ffmpeg, disk
    mf info    <page.html>                      the film's size, fps, length and frame count
    mf stills  <page.html> --times=1,2.5 [--out=<dir>]        review stills (no motion blur)
    mf sheet   <stills dir> <out prefix> [--cols=3]           contact sheets of stills
    mf cues    <page.html> --out=<cues.json>                  the film's sound cue sheet
    mf render  <page.html> --name=<name> [--work=<dir>] [--out=<dir>] [--workers=4] [--from=<f> --to=<f>]
                                                cue sheet → score → motion-blurred frames → MP4s (resumable)
    mf verify  <film.mp4>… --mix=<score.wav> --fps=30 --dur=45 [--size=1920x1080]
    mf mascot  <page.html>                      mascot continuity check (rule R7)
    mf compare <reference dir> <test dir> [--min-psnr=40]     PSNR between two folders of stills
    mf lint                                     the runtime stays brand-neutral and size-independent
    mf probe   gpu | eval <page> <expr|@file> | boot <page>
Options after the positional arguments are passed through to the underlying script. Scratch output (stills, render
work) goes under ./work in the current folder, never inside the installed skill.
"""
import json
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
WORK = Path.cwd() / "work"
LATER = {"make": "v0.8", "brand": "v0.3", "brief": "v0.8", "storyboard": "v0.2/v0.8", "assets": "v0.7", "build": "v0.2",
         "preview": "v0.8", "review": "v0.8", "revise": "v0.8", "status": "v0.8", "export": "v0.8"}


def py(script, *args):
    return subprocess.run([sys.executable, str(SCRIPTS / script), *args]).returncode


def nodejs(script, *args):
    return subprocess.run(["node", str(SCRIPTS / script), *args]).returncode


def opt(args, key, default=None):
    return next((a.split("=", 1)[1] for a in args if a.startswith(f"--{key}=")), default)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    cmd, args = sys.argv[1], sys.argv[2:]
    pos = [a for a in args if not a.startswith("--")]
    rest = [a for a in args if a.startswith("--")]

    if cmd == "doctor":
        return py("doctor.py", *args)
    if cmd in ("info", "cues"):
        return nodejs("render/render.mjs", cmd, f"--page={pos[0]}", *rest)
    if cmd == "stills":
        out = opt(args, "out") or str(WORK / "stills" / Path(pos[0]).parent.name)
        return nodejs("render/render.mjs", "stills", f"--page={pos[0]}", f"--out={out}", *[a for a in rest if not a.startswith("--out=")])
    if cmd == "sheet":
        return py("qa/sheet.py", *args)
    if cmd == "render":
        work = opt(args, "work") or str(WORK / "render" / (opt(args, "name") or Path(pos[0]).parent.name))
        return py("render/run.py", work, f"--page={pos[0]}", *[a for a in rest if not a.startswith("--work=")])
    if cmd == "verify":
        return py("qa/verify.py", *args)
    if cmd == "compare":
        return py("qa/compare.py", *args)
    if cmd == "lint":
        return py("qa/lint_runtime.py", *args)
    if cmd == "probe":
        return nodejs("qa/probe.mjs", *args)
    if cmd == "mascot":
        r = subprocess.run(["node", str(SCRIPTS / "qa" / "probe.mjs"), "eval", pos[0], "@" + str(SCRIPTS / "qa" / "mascot_check.js"), *rest],
                           capture_output=True, text=True)
        if r.returncode:
            print(r.stderr.strip())
            return r.returncode
        d = json.loads(r.stdout)
        print(f"mascot continuity: {'PASS' if d['ok'] else 'FAIL'}")
        for t0, t1 in d["invalid"]:
            print(f"  invalid position (NaN) {t0:.3f}-{t1:.3f} s")
        for t, who, dist in d["jumps"]:
            print(f"  jump at {t:.3f} s ({who}): {dist} px in 1/240 s")
        for t, who, dist in d["offstage"]:
            print(f"  note: off-stage handoff at {t:.3f} s ({who}), {dist} px")
        return 0 if d["ok"] else 1
    if cmd in LATER:
        print(f"'mf {cmd}' arrives in {LATER[cmd]} (see the roadmap, section 16)")
        return 2
    print(f"unknown command '{cmd}'\n{__doc__}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
