// Motion engine. Every visual is a pure function of time `t` (seconds), so any frame (or motion-blur sub-frame) can be
// rendered in any order by any number of headless renderers. The film's size, frame rate, length and tempo come from
// window.FILM, which the page defines before this file loads.
"use strict";

if (!window.FILM) throw new Error("window.FILM is not defined: load the film's config before engine.js");
const FILM = window.FILM;
const W = FILM.w, H = FILM.h, FPS = FILM.fps, DUR = FILM.dur, BPM = FILM.bpm, BEAT = 60 / BPM, BAR = BEAT * 4;
const PAL = FILM.palette;

// colour helpers: palette entries are "#RRGGBB" strings or [r, g, b] arrays
const rgbOf = (c) => (Array.isArray(c) ? c : [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
const rgba = (c, a) => `rgba(${rgbOf(c).join(",")},${a})`;
const rgbList = (c) => rgbOf(c).join(",");                       // "r,g,b" for building rgba() at draw time
const vec3 = (c) => rgbOf(c).map((v) => v / 255);                // shader uniform

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const mixArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const smooth = (x) => x * x * (3 - 2 * x);

const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inQuart: (x) => x * x * x * x,
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  outCirc: (x) => Math.sqrt(1 - Math.pow(x - 1, 2)),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

// iOS-style spring (response = period in s, damping = damping fraction). Returns 0 → 1 with overshoot.
function spring(t, response = 0.45, damping = 0.72) {
  if (t <= 0) return 0;
  const w0 = (2 * Math.PI) / response;
  if (damping < 1) {
    const wd = w0 * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

// progress of a tween that starts at t0 and lasts d seconds
const P = (t, t0, d, ease = E.outCubic) => ease(clamp((t - t0) / d));
// spring progress starting at t0
const S = (t, t0, response, damping) => spring(t - t0, response, damping);

// piecewise keyframes: [[time, value, ease?], ...]; value may be a number or an array; ease applies to the segment that starts at the key
function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, ez] = keys[i], [t1, v1] = keys[i + 1];
    if (t < t1) {
      const p = (ez || E.inOutCubic)((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? mixArr(v0, v1, p) : lerp(v0, v1, p);
    }
  }
  return keys[keys.length - 1][1];
}

// envelope: 0 before a, rises over `inD`, holds, falls over `outD` before b
function env(t, a, b, inD = 0.3, outD = 0.3, eIn = E.outCubic, eOut = E.inCubic) {
  if (t < a || t > b) return 0;
  const i = inD > 0 ? eIn(clamp((t - a) / inD)) : 1;
  const o = outD > 0 ? 1 - eOut(clamp((t - (b - outD)) / outD)) : 1;
  return Math.min(i, o);
}

// ---------- deterministic noise / random ----------
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
// camera shake: decaying noise after an impact at t0
function shake(t, t0, amp = 14, decay = 5, freq = 22) {
  const d = t - t0; if (d < 0 || d > 1.2) return [0, 0, 0];
  const k = amp * Math.exp(-decay * d) * (1 - Math.exp(-d / 0.012));   // 12 ms attack: no jump at the impact
  return [noise1(d * freq + 3.1) * k, noise1(d * freq + 17.7) * k, noise1(d * freq * 0.7 + 9.3) * k * 0.06];
}

// ---------- DOM ----------
function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
function css(e, o) { for (const k in o) e.style[k] = o[k]; return e; }
// transform/opacity/blur from a state object. Never put opacity/filter on a container that holds glass (it would cut the glass off from the scene behind it).
function tf(e, o) {
  const s = o.s === undefined ? 1 : o.s;
  const sx = s * (o.sx === undefined ? 1 : o.sx), sy = s * (o.sy === undefined ? 1 : o.sy);
  let tr = "";
  if (o.p) tr += `perspective(${o.p}px) `;
  tr += `translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,${(o.z || 0).toFixed(2)}px)`;
  if (o.rx) tr += ` rotateX(${o.rx.toFixed(3)}deg)`;
  if (o.ry) tr += ` rotateY(${o.ry.toFixed(3)}deg)`;
  if (o.r) tr += ` rotate(${o.r.toFixed(3)}deg)`;
  if (sx !== 1 || sy !== 1) tr += ` scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  e.style.transform = tr;
  if (o.o !== undefined) { e.style.opacity = clamp(o.o).toFixed(4); e.style.visibility = o.o <= 0.001 ? "hidden" : "visible"; }
  if (o.b !== undefined) e.style.filter = o.b > 0.05 ? `blur(${o.b.toFixed(2)}px)` : "none";
  return e;
}
const show = (e, on) => { e.style.display = on ? "" : "none"; };

// split text into per-character spans (words kept together so lines never break mid-word)
function splitChars(parent, text, cls = "ch") {
  const chars = [];
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word)) { el("span", "sp", parent, "&nbsp;"); continue; }
    const w = el("span", "wd", parent);
    for (const c of word) chars.push(el("span", cls, w, c));
  }
  return chars;
}

// frame-quantised time: numbers that tick (counters, typing) must not change between motion-blur sub-frames
let FT = 0;
const money = (v, dec = 2) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ---------- audio cue sheet (consumed by audio/score.py) ----------
const CUES = [];
function cue(t, type, o = {}) { CUES.push(Object.assign({ t: +t.toFixed(4), type }, o)); }

// ---------- scene registry ----------
const SCENES = [];
function scene(def) { SCENES.push(def); return def; }
