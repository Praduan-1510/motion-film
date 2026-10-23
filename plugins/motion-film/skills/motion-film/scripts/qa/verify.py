"""Verify delivered MP4s: streams and colour tags, size, exact frame count and duration, audio sync against the score.

    python verify.py <film.mp4> [<film_web.mp4> …] --mix=<score.wav> --fps=30 --dur=45 [--size=1920x1080] [--json]

Pass --fps/--dur/--size from the film (render.mjs info). Checks per file:
  · video is H.264 yuv420p tagged BT.709 (matrix, primaries, transfer), at --size and --fps, with exactly dur × fps frames
  · audio is AAC 48 kHz stereo, as long as the film
  · the audio lines up with the score: cross-correlation of a 10 s window around the loudest part of the mix (|offset| ≤ 1 ms)
Exits 1 when any check fails.
"""
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from scipy.signal import fftconvolve

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000


def load(p):
    w = wave.open(str(p))
    return np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()).T / 32768.0


def loudest_window(x, n):
    """start sample of the n-sample window with the most energy (sync is easiest to measure where the music is busy)"""
    e = np.convolve(x ** 2, np.ones(SR // 10), mode="valid")[::SR // 10]
    k = n // (SR // 10)
    s = np.convolve(e, np.ones(k), mode="valid")
    return int(np.argmax(s)) * (SR // 10)


def verify(f, mix, fps, dur, size):
    res = {"file": str(f), "checks": []}
    add = lambda name, ok, detail: res["checks"].append({"check": name, "ok": bool(ok), "detail": detail})
    info = subprocess.run([FF, "-hide_banner", "-i", str(f)], capture_output=True, text=True).stderr
    v = next((l for l in info.splitlines() if "Video:" in l), "")
    a = next((l for l in info.splitlines() if "Audio:" in l), "")
    add("video codec", "h264" in v and "yuv420p" in v, v.strip()[:140])
    # ffmpeg prints "yuv420p(tv, bt709, …)" when matrix, primaries and transfer agree, else "matrix/primaries/transfer"
    pf = re.search(r"yuv\w+\(([^)]*)\)", v)
    tags = [p.strip() for p in pf.group(1).split(",")] if pf else []
    col = next((p for p in tags if "bt" in p or "/" in p or "smpte" in p), "unspecified")
    add("colour tags", all(c == "bt709" for c in col.split("/")), f"{col} (want bt709 matrix/primaries/transfer)")
    m = re.search(r"(\d{2,5})x(\d{2,5})", v)
    add("size", m and (int(m.group(1)), int(m.group(2))) == size, f"{m.group(0) if m else '?'} (want {size[0]}x{size[1]})")
    fr = re.search(r"([\d.]+) fps", v)
    add("frame rate", fr and abs(float(fr.group(1)) - fps) < 1e-3, f"{fr.group(1) if fr else '?'} fps (want {fps})")
    cnt = subprocess.run([FF, "-hide_banner", "-i", str(f), "-map", "0:v", "-c", "copy", "-f", "null", "-"], capture_output=True, text=True).stderr
    frames = int(re.findall(r"frame=\s*(\d+)", cnt)[-1]) if re.findall(r"frame=\s*(\d+)", cnt) else -1
    want = round(dur * fps)
    add("frame count", frames == want, f"{frames} (want {want})")
    add("audio codec", "aac" in a and "48000 Hz" in a and "stereo" in a, a.strip()[:140])
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(f), "-map", "0:a", "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(wav)], check=True)
        b = load(wav)
    add("audio length", abs(b.shape[1] / SR - dur) < 0.05, f"{b.shape[1] / SR:.3f} s (want {dur})")
    ref = load(mix)
    n = 10 * SR
    s0 = loudest_window(ref[0], n)
    mref, mout = ref[0, s0:s0 + n], b[0, s0:s0 + n]
    c = fftconvolve(mout, mref[::-1], mode="full")
    lag = int(np.argmax(c) - (len(mref) - 1))
    add("audio sync", abs(lag) <= SR // 1000, f"offset {lag} samples ({lag / SR * 1000:.2f} ms) at {s0 / SR:.1f}-{(s0 + n) / SR:.1f} s")
    res["ok"] = all(c["ok"] for c in res["checks"])
    return res


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a.lstrip("-").split("=", 1) if "=" in a else (a.lstrip("-"), "1") for a in sys.argv[1:] if a.startswith("--"))
    if not pos or "mix" not in opts:
        sys.exit(__doc__)
    fps, dur = float(opts.get("fps", 30)), float(opts.get("dur", 45))
    size = tuple(int(v) for v in opts.get("size", "1920x1080").split("x"))
    results = [verify(Path(f), Path(opts["mix"]), fps, dur, size) for f in pos]
    if "json" in opts:
        print(json.dumps(results, indent=1))
    else:
        for r in results:
            print(f"== {r['file']}: {'PASS' if r['ok'] else 'FAIL'}")
            for c in r["checks"]:
                print(f"   {'ok ' if c['ok'] else 'FAIL'} {c['check']:<13} {c['detail']}")
    sys.exit(0 if all(r["ok"] for r in results) else 1)


if __name__ == "__main__":
    main()
