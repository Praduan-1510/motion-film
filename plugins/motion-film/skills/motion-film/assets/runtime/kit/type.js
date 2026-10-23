// Display-type helpers for per-character animation: measuring, centred and left-aligned lines of per-char spans, and two
// stock moves (word slam, character rise). Every visual is a pure function of time.
"use strict";

// measure a text run with the given class/style (fonts are loaded before build)
function measure(cls, text, style = "") {
  const m = el("span", cls, document.body); m.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;${style}`; m.textContent = text;
  const r = { w: m.offsetWidth, h: m.offsetHeight }; m.remove(); return r;
}
// a centred text line made of per-char spans; parts: [[class, text, style], …]; returns {wrap, chars, w, h, x, y}
function textLine(parent, parts, cx, cy, z = 0) {
  const wrap = el("div", "abs", parent); wrap.style.zIndex = z; wrap.style.whiteSpace = "nowrap";
  const chars = [];
  for (const [cls, text, style] of parts) {
    const span = el("span", cls, wrap); if (style) span.style.cssText = style;
    chars.push(...splitChars(span, text));
  }
  const w = wrap.offsetWidth, h = wrap.offsetHeight;
  const x = cx - w / 2, y = cy - h / 2;
  tf(wrap, { x, y });
  return { wrap, chars, w, h, x, y };
}
// left-aligned text line
function leftLine(parent, parts, x, cy, z = 0) {
  const r = textLine(parent, parts, 0, cy, z);
  r.x = x; tf(r.wrap, { x, y: r.y }); return r;
}
const wordsOf = (line) => [...line.wrap.querySelectorAll(".wd")];
// word slam: each word lands from a larger scale with a short blur, staggered; optional exit at `out`. dirs = lateral
// start offsets per word (the last one repeats), so later words always fly in from the right, away from earlier ones
function slamWords(words, t, t0, step, out, outStep = 0.03, dirs) {
  words.forEach((w, i) => {
    const p = E.outExpo(clamp((t - t0 - i * step) / 0.42)), xo = out ? E.inCubic(clamp((t - out - i * outStep) / 0.36)) : 0;
    w.style.transformOrigin = "0 70%";
    tf(w, { s: lerp(1.32, 1, p) + 0.05 * xo, x: dirs ? dirs[Math.min(i, dirs.length - 1)] * 0.7 * (1 - p) : 0, y: -44 * xo, o: clamp(p * 1.8) * (1 - xo), b: (1 - p) * 8 + 8 * xo });
  });
}
// character rise: chars spring up into place, staggered; optional exit
function riseChars(chars, t, t0, step, out, outStep = 0.012) {
  chars.forEach((c, i) => {
    const d = t0 + i * step, s = S(t, d, 0.5, 0.7), xo = out ? E.inCubic(clamp((t - out - i * outStep) / 0.38)) : 0;
    tf(c, { y: (1 - s) * 120 - 50 * xo, o: clamp((t - d) / 0.12) * (1 - xo), b: Math.max(0, 1 - s) * 6 + 8 * xo, r: (1 - s) * -6 });
  });
}
