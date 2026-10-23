"""Original score + sound design, synthesized from scratch (no samples, no licences).

    python score.py <cues.json> <out.wav> [--dur=45]

--dur sets the length of the mix (the film's __info().dur). The song sections below are still fixed seconds written for a
45 s film; v0.2 derives them from the timeline (music_plan.json).

120 BPM (one bar = 2 s, so every scene change lands on a bar line), C major with A-minor colour:
Am9 · Fmaj9 · C(add9) · G6  — final hit resolves to Cmaj9.
Arrangement: tension intro (0–4) → drop (4) → groove (4–27) → filtered breakdown (27–30) → drop (30) → build (38–40)
→ final hit (40) → ring-out (45). Sound design comes from the cue sheet exported by the film (render.mjs cues).
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

SR = 48000
DUR = float(next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--dur=")), 45.0))
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(20261022)


# ---------------------------------------------------------------- primitives
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n, dtype=np.float64) / SR


def noise(n):
    return RNG.standard_normal(n).astype(np.float64)


def sos(kind, f, order=2):
    nyq = SR / 2
    if kind == "bp":
        return butter(order, [max(20, f[0]) / nyq, min(f[1], nyq * 0.95) / nyq], btype="band", output="sos")
    return butter(order, min(f, nyq * 0.95) / nyq, btype="high" if kind == "hp" else "low", output="sos")


def filt(x, kind, f, order=2):
    return sosfilt(sos(kind, f, order), x)


def saw_phase(ph, dt):
    """polyBLEP saw from a phase array (0..1) and per-sample increment dt."""
    y = 2.0 * ph - 1.0
    m1 = ph < dt
    x = ph[m1] / dt[m1] if np.ndim(dt) else ph[m1] / dt
    y[m1] -= x + x - x * x - 1.0
    m2 = ph > 1.0 - (dt if not np.ndim(dt) else dt)
    dd = dt[m2] if np.ndim(dt) else dt
    x = (ph[m2] - 1.0) / dd
    y[m2] -= x * x + x + x + 1.0
    return y


def saw(f, n, phase=0.0):
    dt = f / SR
    return saw_phase((phase + np.arange(n) * dt) % 1.0, dt)


def biquad(kind, f, q):
    w = 2 * np.pi * min(f, SR * 0.45) / SR
    a = np.sin(w) / (2 * q)
    c = np.cos(w)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == "bp":
        b = [a, 0, -a]
    else:
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    A = [1 + a, -2 * c, 1 - a]
    return np.array(b) / A[0], np.array(A) / A[0]


def sweep(x, freqs, kind="lp", q=0.8, block=256):
    """time-varying biquad: freqs is an array (one value per sample); coefficients updated per block."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = biquad(kind, float(freqs[min(i + block // 2, len(x) - 1)]), q)
        y[i:i + block], zi = lfilter(b, a, x[i:i + block], zi=zi)
    return y


def pan2(x, p):
    """equal-power pan (-1 … 1) of a mono signal → (2, n)"""
    a = (p + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])


def place(bus, x, t0, gain=1.0, p=0.0):
    i0 = int(round(t0 * SR))
    if x.ndim == 1:
        x = pan2(x, p)
    if i0 < 0:
        x = x[:, -i0:]
        i0 = 0
    n = min(x.shape[1], bus.shape[1] - i0)
    if n > 0:
        bus[:, i0:i0 + n] += x[:, :n] * gain


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    t = tt(n)
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)


# ---------------------------------------------------------------- reverb
def make_ir(rt60=2.6, pre=0.022, damp=5500):
    n = int(rt60 * SR)
    t = tt(n)
    env = np.exp(-6.91 * t / rt60)
    ir = np.vstack([filt(noise(n), "lp", damp) * env, filt(noise(n), "lp", damp) * env])
    ir[:, : int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    ir = np.hstack([np.zeros((2, int(pre * SR))), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def reverb(bus, ir):
    out = np.vstack([fftconvolve(bus[0], ir[0])[:N], fftconvolve(bus[1], ir[1])[:N]])
    return out


# ---------------------------------------------------------------- instruments
def kick(v=1.0, big=False):
    n = int((0.9 if big else 0.5) * SR)
    t = tt(n)
    f = 46 + (150 if big else 120) * np.exp(-t * (28 if big else 34))
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * (4.2 if big else 7.5))
    click = filt(noise(n), "hp", 2500) * np.exp(-t * 320) * 0.35
    return np.tanh((body + click) * 1.6) * v


def clap(v=1.0):
    n = int(0.45 * SR)
    t = tt(n)
    nz = filt(noise(n), "bp", (900, 3200))
    e = np.zeros(n)
    for d in (0, 0.009, 0.018, 0.027):
        e += np.where(t >= d, np.exp(-(t - d) * 160), 0)
    e += np.exp(-t * 16) * 0.55
    return nz * e * v * 0.9


def snare(v=1.0):
    n = int(0.3 * SR)
    t = tt(n)
    return (filt(noise(n), "bp", (1500, 7000)) * np.exp(-t * 24) * 0.9 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32) * 0.6) * v


def hat(v=1.0, open_=False):
    n = int((0.38 if open_ else 0.07) * SR)
    t = tt(n)
    return filt(noise(n), "hp", 7200, 4) * np.exp(-t * (11 if open_ else 70)) * v


def crash(v=1.0, dur=2.6):
    n = int(dur * SR)
    t = tt(n)
    e = np.exp(-t * 2.0) * np.minimum(1, t / 0.002)
    return np.vstack([filt(noise(n), "hp", 3800, 4) * e, filt(noise(n), "hp", 3800, 4) * e]) * v * 0.7


def fm_bell(f, dur=1.6, ratio=3.5, index=5.0, decay=3.2):
    n = int(dur * SR)
    t = tt(n)
    I = index * np.exp(-t * decay * 1.8)
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t)) * np.exp(-t * decay)
    return y * np.minimum(1, t / 0.0015)


def supersaw(f, n, voices=5, detune=0.11, phase_seed=0):
    r = np.random.default_rng(phase_seed)
    out = np.zeros((2, n))
    for k in range(voices):
        cents = (k - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100 if voices > 1 else 0
        x = saw(f * 2 ** (cents / 1200), n, r.random())
        out += pan2(x, (k - (voices - 1) / 2) / max(1, (voices - 1) / 2) * 0.7)
    return out / voices


def pluck(f, dur=0.35, bright=1.0):
    n = int(dur * SR)
    t = tt(n)
    x = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.25
    hi = filt(x, "lp", 4200 * bright) * np.exp(-t * 26)
    lo = filt(x, "lp", 1100) * np.exp(-t * 7.5)
    return (hi + lo) * np.minimum(1, t / 0.002)


# ---------------------------------------------------------------- harmony
CHORDS = {
    "Am9": (33, [57, 60, 64, 67, 71]),
    "Fmaj9": (29, [53, 57, 60, 64, 67]),
    "Cadd9": (36, [52, 55, 60, 62, 67]),
    "G6": (31, [55, 59, 62, 64, 69]),
    "Cmaj9": (36, [55, 59, 60, 62, 64, 71]),
}
PROG = ["Am9", "Fmaj9", "Cadd9", "G6"]


def chord_at(t):
    b = int(t // BAR)
    return CHORDS["Cmaj9"] if t >= 40.0 else CHORDS[PROG[b % 4]]


# ---------------------------------------------------------------- arrangement automation
def groove_on(t):
    return (4.0 <= t < 27.0) or (30.0 <= t < 37.75) or (40.0 <= t < 43.0)


def music():
    drums = np.zeros((2, N))
    bass = np.zeros((2, N))
    pad = np.zeros((2, N))
    arp = np.zeros((2, N))
    kicks = []

    # ---- drums
    for i in range(int(DUR / (BEAT / 4))):
        t = i * BEAT / 4
        q = i % 16          # 16th index within the bar
        if groove_on(t):
            if q % 4 == 0:
                place(drums, kick(1.0), t, 0.95)
                kicks.append(t)
            if q in (4, 12):
                place(drums, clap(1.0), t, 0.42, 0.0)
            if q % 4 == 2:
                place(drums, hat(1.0, open_=(q == 14)), t, 0.16 if q == 14 else 0.13, 0.25)
            elif q % 2 == 1 and t >= 12:
                place(drums, hat(0.6), t, 0.06, -0.3)
        # intro: building 16th ticks
        if t < 4.0 and t >= 0.5:
            dens = 1 if t > 2.5 else (2 if t > 1.0 else 4)
            if q % dens == 0:
                place(drums, hat(1.0), t, 0.04 + 0.06 * (t / 4), 0.35 if q % 2 else -0.35)
        # CTA build: half-time kicks
        if 38.0 <= t < 40.0 and q in (0, 8):
            place(drums, kick(0.9), t, 0.8)
            kicks.append(t)
        # final ring-out: sparse kicks
        if 43.0 <= t < 44.0 and q == 0:
            place(drums, kick(0.7), t, 0.5)
    # snare rolls into 12, 30 and 40
    for start, end, v in ((11.0, 12.0, 0.35), (29.0, 30.0, 0.45), (39.0, 40.0, 0.5)):
        n_hits = 16
        for j in range(n_hits):
            frac = j / n_hits
            t = start + (end - start) * (1 - (1 - frac) ** 1.6)
            place(drums, snare(0.5 + 0.5 * frac), t, v * (0.35 + 0.65 * frac), 0.1)
    for t in (4.0, 12.0, 24.0, 30.0, 40.0):
        place(drums, crash(1.0), t, 0.35)

    # ---- bass: sub (8ths, sidechained) + driven mid layer on the offbeats
    for i in range(int(DUR / (BEAT / 2))):
        t = i * BEAT / 2
        if not (groove_on(t) or (38.0 <= t < 40.0 and i % 2 == 0)):
            continue
        root = chord_at(t)[0]
        f = mtof(root + 12)
        n = int(BEAT / 2 * SR)
        x = np.sin(2 * np.pi * f * tt(n)) * adsr(n, 0.004, 0.18, 0.8, 0.03)
        place(bass, x, t, 0.5)
        if i % 2 == 1:
            m = filt(saw(f * 2, n), "lp", 700) * adsr(n, 0.003, 0.08, 0.3, 0.02)
            place(bass, m, t, 0.16, 0.0)
    # intro / breakdown sub drone
    for (a, b, rt) in ((0.0, 4.0, 33), (27.0, 30.0, 29)):
        n = int((b - a) * SR)
        t = tt(n)
        x = np.sin(2 * np.pi * mtof(rt + 12) * t) * np.minimum(1, t / 1.5) * np.minimum(1, (b - a - t) / 0.2)
        place(bass, x, a, 0.22)

    # ---- pad: detuned supersaw per bar, crossfaded
    for b in range(int(np.ceil(DUR / BAR))):
        t0 = b * BAR
        root, voicing = chord_at(t0 + 0.01)
        dur = BAR + 0.6 if t0 < 40 else DUR - t0
        n = int(dur * SR)
        env = adsr(n, 0.35, 1.0, 0.85, 0.6, hold=dur - 0.6)
        if t0 >= 40:
            env = np.minimum(1, tt(n) / 0.02) * np.exp(-tt(n) * 0.35)
        x = np.zeros((2, n))
        for k, m in enumerate(voicing):
            x += supersaw(mtof(m), n, 5, 0.12, phase_seed=b * 10 + k) * (0.8 if k else 1.0)
        place(pad, x * env, t0, 0.19)
    # filter automation on the pad (darker intro, filtered breakdown, wide open finale)
    cut = np.interp(tt(N), [0, 3.8, 4.0, 26.8, 27.2, 29.2, 30.0, 37.6, 38.0, 39.9, 40.0, 45.0],
                    [400, 1800, 3200, 3200, 700, 900, 3600, 3600, 1200, 3000, 5200, 2600])
    pad = np.vstack([sweep(pad[0], cut, "lp", 0.9), sweep(pad[1], cut, "lp", 0.9)])

    # ---- arp: 16th plucks over the chord, dotted-eighth ping-pong delay
    pattern = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 2, 3, 1, 4, 2]
    for i in range(int(DUR / (BEAT / 4))):
        t = i * BEAT / 4
        on = (4.0 <= t < 27.0) or (27.0 <= t < 30.0) or (30.0 <= t < 38.0) or (40.0 <= t < 44.0)
        if not on:
            continue
        _, voicing = chord_at(t)
        m = voicing[pattern[i % 16] % len(voicing)] + 12
        lvl = 0.24 if t < 12 else 0.3
        if 27.0 <= t < 30.0:
            lvl = 0.17
        if t >= 40.0:
            lvl = 0.28 * max(0.0, 1 - (t - 40.0) / 4.0)
        place(arp, pluck(mtof(m), 0.3, 1.2 if t >= 30 else 1.0), t, lvl, (-0.35, 0.35)[i % 2])
    delayed = np.zeros_like(arp)
    d = int(0.75 * BEAT * SR)
    for k in range(1, 6):
        g = 0.42 ** k
        src = arp[(k + 1) % 2] if k % 2 else arp[k % 2]
        for ch in (0, 1):
            delayed[ch, d * k:] += (arp[1 - ch] if k % 2 else arp[ch])[: N - d * k] * g
    arp = filt(arp + delayed * 0.8, "hp", 180)

    # ---- sidechain (duck pad, bass and arp under every kick)
    sc = np.ones(N)
    tsec = tt(N)
    for k in kicks:
        i0 = int(k * SR)
        n = int(0.32 * SR)
        seg = 1 - 0.75 * np.exp(-tt(n) / 0.075)
        sc[i0:i0 + n] = np.minimum(sc[i0:i0 + n], seg[: max(0, min(n, N - i0))])
    bass *= sc
    pad *= 0.35 + 0.65 * sc
    arp *= 0.55 + 0.45 * sc
    return drums, bass, pad, arp


# ---------------------------------------------------------------- sound design from the cue sheet
PENTA = [76, 79, 81, 83, 86, 88, 91, 93]   # E5 … A6 (C-major pentatonic-ish, consonant with every chord)


def sfx(cues):
    fx = np.zeros((2, N))
    send = np.zeros((2, N))   # extra reverb send for sparkly things
    r = np.random.default_rng(99)
    for c in cues:
        t, ty, v, p, d = c["t"], c["type"], c.get("v", 1.0), c.get("pan", 0.0), c.get("d", 0.5)
        if ty in ("impact", "hit"):
            n = int(1.6 * SR)
            x = tt(n)
            sub = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-x * 9)) / SR) * np.exp(-x * (2.2 if v > 0.8 else 4))
            crack = filt(noise(n), "bp", (180, 4000)) * np.exp(-x * 14)
            y = np.tanh((sub * 1.3 + crack * 0.5) * 1.4)
            gain = (0.22 if ty == "hit" else 0.6) * v
            place(fx, y, t, gain, p)
            place(send, crack * np.exp(-x * 4), t, 0.25 * v)
            if ty == "hit":
                place(fx, kick(0.8), t, 0.42)
                place(fx, clap(1.0), t, 0.3)
                place(send, clap(1.0), t, 0.25)
            if v >= 0.9:
                place(fx, crash(1.0, 3.0), t, 0.28 * v)
        elif ty == "boom":
            n = int(2.4 * SR)
            x = tt(n)
            y = np.sin(2 * np.pi * np.cumsum(30 + 34 * np.exp(-x * 2.5)) / SR) * np.exp(-x * 1.4) * np.minimum(1, x / 0.004)
            place(fx, np.tanh(y * 1.5), t, 0.55 * v)
        elif ty == "riser":
            n = int(d * SR)
            x = tt(n)
            ramp = (x / d) ** 2.4
            nz = sweep(noise(n), 300 * (30 ** (x / d)), "bp", 2.2)
            tone = saw_phase((np.cumsum(90 * 2 ** (3 * x / d)) / SR) % 1.0, 90 * 2 ** (3 * x / d) / SR)
            y = (nz * 0.9 + filt(tone, "lp", 2600) * 0.25) * ramp
            place(fx, y, t, 0.22 * v)
            place(send, y, t, 0.15 * v)
        elif ty == "reverse":
            y = crash(1.0, d + 0.1)[:, ::-1]
            y = y * np.linspace(0, 1, y.shape[1]) ** 2
            place(fx, y, t, 0.32 * v)
        elif ty in ("whoosh", "wipe", "suck"):
            n = int(d * SR)
            x = tt(n)
            shape = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 2
            if ty == "suck":
                shape = (x / d) ** 2.5 * (x < d)
                f = 6000 * (0.06 ** (x / d))
            else:
                f = 600 * (6 ** np.sin(np.pi * x / d))
            y = sweep(noise(n), f, "bp", 1.4) * shape
            pans = np.linspace(-0.8, 0.8, n) * (1 if p >= 0 else -1) if ty == "wipe" else None
            if pans is not None:
                a = (pans + 1) * np.pi / 4
                y2 = np.vstack([y * np.cos(a), y * np.sin(a)])
                place(fx, y2[:, ::-1], t, 0.5 * v)
                for k in range(3):    # glass shimmer riding the wipe
                    place(send, fm_bell(mtof(PENTA[r.integers(3, 8)]), 0.6, 1.41, 3, 7), t + 0.1 + k * 0.08, 0.05)
            else:
                place(fx, y, t, (0.5 if ty == "suck" else 0.42) * v, p)
        elif ty == "glass":
            f = mtof(PENTA[r.integers(0, len(PENTA))])
            y = fm_bell(f, 0.5, 1.41, 2.5, 9)
            y[: int(0.3 * SR)] += fm_bell(f * 2.01, 0.3, 1.0, 1.0, 14) * 0.3
            place(fx, y, t, 0.11 * v, p)
            place(send, y, t, 0.08 * v, p)
        elif ty == "glassSlide":
            n = int(d * SR)
            x = tt(n)
            f = 700 * 2 ** (0.8 * np.sin(np.pi * x / d) - 0.1) * (1 + 0.004 * np.sin(2 * np.pi * 6 * x))
            tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / d) ** 2
            air = sweep(noise(n), 2500 * (1.8 ** np.sin(np.pi * x / d)), "bp", 2.5) * np.sin(np.pi * x / d) ** 2
            place(fx, tone * 0.12 + air * 0.25, t, 0.6 * v, p)
            place(send, tone * 0.1, t, 0.5 * v)
        elif ty == "ping":
            # soft notification ping (original FM tone, two partials a fifth apart, short and clean)
            f = mtof(PENTA[r.integers(1, 6)])
            y = fm_bell(f, 0.55, 2.0, 1.2, 9)
            y[: int(0.35 * SR)] += fm_bell(f * 1.5, 0.35, 1.0, 0.5, 15) * 0.35
            n = int(0.012 * SR)
            y[:n] += filt(noise(n), "hp", 5000) * np.exp(-tt(n) * 600) * 0.4
            place(fx, y, t, 0.085 * v, p)
            place(send, y, t, 0.06 * v, p)
        elif ty == "tick":
            n = int(0.05 * SR)
            x = tt(n)
            y = filt(noise(n), "hp", 3000) * np.exp(-x * 400) * 0.6 + np.sin(2 * np.pi * 3600 * x) * np.exp(-x * 120) * 0.4
            place(fx, y, t, 0.13 * v, p)
        elif ty == "pulse":
            place(fx, kick(0.6), t, 0.22)
        elif ty == "count":
            k = 0.0
            while k < d:
                n = int(0.02 * SR)
                x = tt(n)
                y = np.sin(2 * np.pi * 4200 * x) * np.exp(-x * 260)
                place(fx, y, t + k, 0.05, 0.2)
                k += 0.028 + 0.06 * (k / d) ** 2
        elif ty in ("chime", "bell", "notify"):
            root = chord_at(t)[1]
            if ty == "notify":
                notes = [88, 93]          # E6 → A6 (iOS-like two-note)
            elif ty == "chime":
                notes = [84, 91]          # C6 + G6
            else:
                notes = [root[-1] + 12]
            for j, m in enumerate(notes):
                y = fm_bell(mtof(m), 1.6, 3.0 if ty != "notify" else 2.0, 2.2, 3.4)
                place(fx, y, t + j * (0.07 if ty == "notify" else 0.05), 0.12 * v, p)
                place(send, y, t + j * 0.06, 0.12 * v, p)
        elif ty in ("swell", "draw", "shimmer"):
            n = int((d if ty != "shimmer" else 0.9) * SR)
            x = tt(n)
            if ty == "swell":
                y = sweep(noise(n), 400 * 8 ** (x / max(d, 0.1)), "bp", 3) * (x / max(d, 0.1)) ** 1.5
                place(fx, y, t, 0.18 * v)
            else:
                for k in range(7):
                    place(send, fm_bell(mtof(PENTA[(k * 3 + int(t * 10)) % len(PENTA)] + 12), 0.8, 1.41, 2, 6),
                          t + k * (n / SR) / 8, 0.05, -0.6 + k * 0.2)
                place(fx, filt(noise(n), "hp", 6000) * np.sin(np.pi * x / (n / SR)) ** 2, t, 0.05)
        elif ty == "pluck":
            # a bright pluck from the current chord, stepping up with c["n"] (Signed → Installed → Funded)
            notes = chord_at(t)[1]
            m = notes[min(len(notes) - 1, 1 + int(c.get("n", 0)))] + 12
            y = pluck(mtof(m), 0.6, 1.1)
            place(fx, y, t, 0.2 * v, p)
            place(send, y, t, 0.12 * v, p)
        elif ty == "scratch":
            # a marker striking through text: rough band-passed noise with a fast grain, falling in pitch
            n = int(0.2 * SR)
            x = tt(n)
            grain = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * (70 + 40 * x / 0.2) * x))
            y = sweep(noise(n), 3600 * (0.5 ** (x / 0.2)), "bp", 1.6) * grain * np.sin(np.pi * np.clip(x / 0.17, 0, 1)) ** 0.6 * (x < 0.17)
            place(fx, y, t, 0.32 * v, p)
        elif ty == "pop":
            n = int(0.12 * SR)
            x = tt(n)
            y = np.sin(2 * np.pi * np.cumsum(300 + 1400 * (x / 0.12)) / SR) * np.exp(-x * 40)
            place(fx, y, t, 0.22 * v, p)
            place(send, y, t, 0.1)
        elif ty == "click":
            n = int(0.08 * SR)
            x = tt(n)
            y = filt(noise(n), "bp", (900, 2600)) * np.exp(-x * 160) + np.sin(2 * np.pi * 180 * x) * np.exp(-x * 60) * 0.5
            place(fx, y, t, 0.3 * v)
    return fx, send


# ---------------------------------------------------------------- master
def lufs(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    k = np.vstack([lfilter(b2, a2, lfilter(b1, a1, ch)) for ch in x])
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(k[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, k.shape[1] - blk, hop)])
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[ld > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g = ms[(ld > -70) & (ld > rel)]
    return -0.691 + 10 * np.log10(g.mean())


def limiter(x, ceiling=0.89, look=0.004, release=0.12):
    from scipy.ndimage import maximum_filter1d
    peak = maximum_filter1d(np.abs(x).max(axis=0), size=int(look * SR) * 2 + 1)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    a = np.exp(-1 / (release * SR))
    sm = lfilter([1 - a], [1, -a], g)          # release smoothing …
    sm = np.minimum(sm, g)                       # … but never above the instantaneous requirement
    return x * sm


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(pos) < 2:
        sys.exit(__doc__)
    cues_path, out = Path(pos[0]), Path(pos[1])
    cues = json.loads(cues_path.read_text())
    drums, bass, pad, arp = music()
    fx, send = sfx(cues)
    ir = make_ir()
    music_bus = drums * 1.0 + bass * 1.0 + pad * 1.0 + arp * 1.0
    wet = reverb(pad * 0.45 + arp * 0.5 + drums * 0.08 + send + fx * 0.12, ir)
    mix = music_bus + fx + wet * 0.32
    mix = filt(mix, "hp", 28)
    # glue: gentle saturation, then loudness to -14 LUFS and a true-peak-safe limiter
    mix = np.tanh(mix * 1.1) / 1.1
    gain = 10 ** ((-14.0 - lufs(mix)) / 20)
    mix = limiter(mix * gain, ceiling=10 ** (-1.2 / 20))
    fade = np.ones(N)
    fade[-int(0.45 * SR):] = np.linspace(1, 0, int(0.45 * SR)) ** 1.5
    mix *= fade
    print(f"loudness {lufs(mix):.1f} LUFS, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS")
    import wave
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out)


if __name__ == "__main__":
    main()
