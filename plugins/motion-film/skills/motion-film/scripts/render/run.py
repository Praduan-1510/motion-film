"""One-command build of a film page: cue sheet → score → frames (12-sample motion blur) → MP4s.

    python run.py <work dir> --page=<page.html> --name=<output name> [--root=<dir>] [--out=<dir>] [--workers=4]
                  [--sub=12 --subfast=28] [--from=<frame> --to=<frame>]

1. reads the film's size, fps and length from the page (render.mjs info)
2. exports the sound cue sheet from the page and synthesizes the score (scripts/audio/score.py)
3. renders every frame as --sub sub-frames across a 180° shutter (--subfast, or the window's own count, inside the film's
   fast-motion windows) with headless Chrome workers in parallel, while parallel mergers average them in linear light
4. encodes <name>.mp4 and <name>_web.mp4 into --out (default <work dir>/out); skipped for a partial --from/--to range
About 25–40 minutes per 45 s at 1920 × 1080 on a GeForce GT 730. Re-running with the same work dir resumes. The work dir holds
temporary frames (about 4 GB per 45 s); delete it after a verified export.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
SCRIPTS = HERE.parent


def node(*args, capture=False):
    r = subprocess.run(["node", str(HERE / "render.mjs"), *args], check=True, text=True,
                       stdout=subprocess.PIPE if capture else None)
    return r.stdout


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if not pos or "page" not in opts or "name" not in opts:
        sys.exit(__doc__)
    work = Path(pos[0]).resolve()
    work.mkdir(parents=True, exist_ok=True)
    page = [f"--page={opts['page']}"] + ([f"--root={opts['root']}"] if "root" in opts else [])
    n = int(opts.get("workers", 4))
    sub, subfast = opts.get("sub", "12"), opts.get("subfast", "28")
    out = Path(opts.get("out", work / "out"))

    info = json.loads(node("info", *page, capture=True))
    frames = info["frames"]
    first, last = int(opts.get("from", 0)), int(opts.get("to", frames))
    # console output stays ASCII: Windows pipes Python's stdout as cp1252
    print(f"{info['w']}x{info['h']}, {info['fps']} fps, {info['dur']} s: frames {first}-{last - 1} of {frames}", flush=True)

    cues, mix = work / "cues.json", work / "mix.wav"
    node("cues", *page, f"--out={cues}")
    subprocess.run([sys.executable, str(SCRIPTS / "audio" / "score.py"), str(cues), str(mix), f"--dur={info['dur']}"], check=True)

    subs, merged = work / "sub", work / "frames"
    rng = [f"--from={first}", f"--to={last}"]
    procs = [subprocess.Popen(["node", str(HERE / "render.mjs"), "frames", *page, f"--out={subs}", f"--step={n}", f"--offset={i}",
                               f"--sub={sub}", f"--subfast={subfast}", "--shutter=0.5", f"--skipdir={merged}", *rng])
             for i in range(n)]   # re-running resumes
    mergers = [subprocess.Popen([sys.executable, str(HERE / "merge.py"), str(subs), str(merged), f"--frames={frames}", f"--sub={sub}",
                                 "--watch", f"--mod={n}", f"--rem={i}", *rng])
               for i in range(n)]
    for p in procs + mergers:
        p.wait()
    if any(p.returncode for p in procs + mergers):
        sys.exit("a render worker or merger failed")

    if first == 0 and last == frames:
        subprocess.run([sys.executable, str(HERE / "compose.py"), str(merged), str(mix), str(out), opts["name"], f"--fps={info['fps']}"], check=True)
    else:
        print(f"partial range: frames are in {merged}; no MP4 encoded", flush=True)


if __name__ == "__main__":
    main()
