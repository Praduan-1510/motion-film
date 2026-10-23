// Kinetic-story kit: kinetic lines, the mascot (the brand mark as a travelling character), cursor, pills, tiles, outline
// word stacks, line-art circles, ribbons with text on their path and doodle avatars. Every visual is a pure function of time.
// Colours: FILM.palette.{kinetic, mascot, cursor, lineArt, doodle}; fonts: FILM.fonts.kinetic; mascot geometry: FILM.mascot.
"use strict";

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const mixHex = (a, b, k) => {
  const A = rgbOf(a), B = rgbOf(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(k)))).join(",")})`;
};

// ================================================================ measuring
function measureW(text, font, ls = "-0.025em") {
  const m = el("span", "", document.body);
  m.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${font};letter-spacing:${ls}`;
  m.textContent = text;
  const w = m.offsetWidth; m.remove(); return w;
}

// ================================================================ kinetic lines
// tokens: [{t, b (bold), col, at, fx: 'pop'|'type'|'rise'|'drop'|'scramble'|'fade', hl: {at, cls, ink}, sel: {at, col}}]
// o: {x, y (centre y), size, align: 'left'|'center'|'right', color, z}
function kline(parent, tokens, o) {
  const wrap = el("div", "kl", parent);
  css(wrap, { fontSize: o.size + "px", color: o.color || PAL.kinetic.text });
  if (o.z) wrap.style.zIndex = o.z;
  // a typed word never starts before the previous typed word has finished (0.032 s a character)
  tokens.forEach((tk, i) => { const pv = tokens[i - 1]; if (i > 0 && tk.fx === "type" && pv.fx === "type") tk.at = Math.max(tk.at, pv.at + pv.t.length * 0.032 + 0.03); });
  const words = tokens.map((tk, i) => {
    if (i > 0 && !tk.join) el("span", "sp", wrap);
    const w = el("span", "w" + (tk.b ? " b" : "") + (tk.sel ? " has-sel" : tk.hl ? " has-hl" : ""), wrap);
    if (tk.col) w.style.color = tk.col;
    if (tk.hl) tk.hlEl = el("i", "hl" + (tk.hl.cls ? " " + tk.hl.cls : ""), w);
    const chars = [...tk.t].map((c) => { const s = el("span", "c", w); s.textContent = c; return s; });
    if (tk.sel) {
      const s = el("i", "sel", w);
      if (tk.sel.col) s.style.setProperty("--sel", tk.sel.col);
      if (tk.sel.hbg) s.style.setProperty("--hbg", tk.sel.hbg);
      tk.selE = ["t", "r", "bt", "l"].map((k) => el("i", "e " + k, s));
      tk.selH = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => { const h = el("i", "h", s); css(h, { left: x + "%", top: y + "%" }); return h; });
    }
    return Object.assign(tk, { el: w, chars, base: tk.col || o.color || PAL.kinetic.text });
  });
  const W = wrap.offsetWidth, H = wrap.offsetHeight;
  const x = o.align === "center" ? o.x - W / 2 : o.align === "right" ? o.x - W : o.x, y = o.y - H / 2;
  tf(wrap, { x, y });
  words.forEach((w) => {
    w.left = x + w.el.offsetLeft; w.right = w.left + w.el.offsetWidth;
    w.cx = (w.left + w.right) / 2; w.cy = y + w.el.offsetTop + w.el.offsetHeight * 0.55;
    w.top = y + w.el.offsetTop; w.bot = w.top + w.el.offsetHeight;
  });
  return { wrap, words, x, y, w: W, h: H, size: o.size, o };
}

// move a built line (and its word coordinates) by dx, dy
function klMove(L, dx, dy = 0) {
  L.x += dx; L.y += dy; tf(L.wrap, { x: L.x, y: L.y });
  L.words.forEach((w) => { w.left += dx; w.right += dx; w.cx += dx; w.cy += dy; w.top += dy; w.bot += dy; });
}

// mascot choreography helpers: a parabolic hop from p0 to p1 (height h) and a damped landing squash
function hop(t, t0, t1, p0, p1, h, ease = E.inOutSine) {
  const u = clamp((t - t0) / (t1 - t0)), e = ease(u);
  return [lerp(p0[0], p1[0], e), lerp(p0[1], p1[1], e) - h * 4 * u * (1 - u)];
}
const squash = (t, tl, k = 0.3) => (t >= tl ? k * Math.exp(-(t - tl) * 8) * Math.cos((t - tl) * 26) : 0);

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZ$%#&0123456789";
// animate a line at time t. out: {at, fx: 'up'|'fall'|'fade'|'left', step} (optional)
function klUpdate(L, t, out) {
  const em = L.size;
  let alive = false;
  L.words.forEach((w, wi) => {
    const a = w.at, fx = w.fx || "pop";
    let xo = 0;
    if (out && t >= out.at) xo = clamp((t - out.at - wi * (out.step === undefined ? 0.03 : out.step)) / (out.dur || 0.32));
    const xe = E.inCubic(xo);
    // word-level transform
    let wt = { s: 1, y: 0, x: 0, o: t >= a ? 1 : 0, r: 0 };
    if (fx === "pop") { const s = S(t, a, 0.42, 0.55); wt.s = t >= a ? lerp(0.35, 1, s) : 0.35; wt.o = clamp((t - a) / 0.07); wt.y = (1 - clamp(s)) * 0.12 * em; }
    if (fx === "fade") { const p = E.outCubic(clamp((t - a) / 0.3)); wt.o = p; wt.y = (1 - p) * 0.2 * em; }
    if (out) {
      if (out.fx === "up") { wt.y -= 0.5 * em * xe; wt.o *= 1 - xe; }
      else if (out.fx === "left") { wt.x -= 0.8 * em * xe; wt.o *= 1 - xe; }
      else if (out.fx === "fade") wt.o *= 1 - xe;
    }
    tf(w.el, { x: wt.x, y: wt.y, s: wt.s, o: wt.o, b: out && out.fx !== "fall" ? 4 * xe : 0 });
    if (wt.o > 0.001) alive = true;
    // character-level effects
    const n = w.chars.length;
    w.chars.forEach((c, i) => {
      let co = 1, cy = 0, cr = 0, cs = 1;
      if (fx === "type") { const ti = a + i * 0.032; co = t >= ti ? clamp((t - ti) / 0.04) : 0; cs = lerp(0.7, 1, E.outCubic(clamp((t - ti) / 0.08))); }
      if (fx === "rise") { const ti = a + i * 0.022, s = S(t, ti, 0.45, 0.62); co = clamp((t - ti) / 0.08); cy = (1 - s) * 0.55 * em; cr = (1 - clamp(s)) * -6; }
      if (fx === "drop") { const ti = a + i * 0.03, s = S(t, ti, 0.5, 0.42); co = clamp((t - ti) / 0.06); cy = -(1 - s) * 0.9 * em; cr = (1 - clamp(s)) * 14 * (i % 2 ? 1 : -1); }
      if (fx === "scramble") {
        const settle = a + 0.14 + i * 0.03;
        co = t >= a + i * 0.012 ? 1 : 0;
        const orig = w.t[i];
        c.textContent = t < settle && orig !== " " ? SCRAMBLE[Math.floor(hash(i * 17.3 + Math.floor(FT * 30) * 3.1 + wi) * SCRAMBLE.length)] : orig;
      }
      if (out && out.fx === "fall") { const k = E.inQuad(clamp((t - out.at - (wi * 4 + i) * 0.012) / 0.45)); cy += k * 1.4 * em; cr += k * (i % 2 ? 24 : -18); co *= 1 - k; }
      tf(c, { y: cy, r: cr, s: cs, o: co });
    });
    // highlight box and colour flip (boxes fade out with their word when the line falls apart)
    const boxO = out && out.fx === "fall" ? 1 - E.inQuad(clamp((t - out.at - wi * 4 * 0.012) / 0.3)) : 1;
    if (w.hl) {
      const p = E.outCubic(clamp((t - w.hl.at) / 0.26));
      w.hlEl.style.transform = `scaleX(${p.toFixed(4)})`;
      w.hlEl.style.opacity = t >= w.hl.at ? boxO : 0;
      w.el.style.color = mixHex(w.base.startsWith("#") ? w.base : PAL.kinetic.text, w.hl.ink || "#FFFFFF", clamp((t - w.hl.at - 0.08) / 0.14));
    }
    // selection box: edges draw on in turn, then the four handles pop
    if (w.sel) {
      const a2 = w.sel.at;
      w.selE.forEach((e, k) => { const p = E.inOutCubic(clamp((t - a2 - k * 0.07) / 0.09)); e.style.transform = k % 2 ? `scaleY(${p.toFixed(4)})` : `scaleX(${p.toFixed(4)})`; e.style.opacity = t >= a2 ? boxO : 0; });
      w.selH.forEach((h, k) => { const s = S(t, a2 + 0.26 + k * 0.03, 0.3, 0.5); h.style.transform = `scale(${clamp(s, 0, 1.4).toFixed(4)})`; h.style.opacity = t >= a2 + 0.26 + k * 0.03 ? boxO : 0; });
    }
  });
  L.wrap.style.visibility = alive ? "visible" : "hidden";
}

// ================================================================ the mascot: the brand mark as a travelling character
// FILM.mascot.viewBox frames the mark (with room for the glow); the CSS .spark box sets its size on screen
const Spark = (() => {
  let root, trail, core, glow;
  const C = PAL.mascot;
  function build(parent) {
    trail = el("div", "spark-trail", parent);
    root = el("div", "spark", parent);
    root.innerHTML = `<svg viewBox="${FILM.mascot.viewBox}"><g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="g" stroke="${C.glow}" stroke-width="20" opacity=".28">${MARK_PATHS()}</g>
      <g class="k" stroke="${C.core}" stroke-width="9">${MARK_PATHS()}</g></g></svg>`;
    glow = root.querySelector(".g"); core = root.querySelector(".k");
    root.style.zIndex = trail.style.zIndex = 60;
  }
  // st: {x, y, s, r, o, glow 0..1, light 0..1, vx, vy (px/s)}
  function update(st) {
    if (!st || st.o <= 0.002) { root.style.visibility = trail.style.visibility = "hidden"; return; }
    const sp = Math.hypot(st.vx || 0, st.vy || 0), ang = Math.atan2(st.vy || 0, st.vx || 0) * 180 / Math.PI;
    const k = clamp(sp / 4000, 0, 0.55);                                   // stretch along the motion
    const sq = st.sq || 0;                                                 // landing squash (+) / stretch (−)
    const s = st.s || 1;
    root.style.visibility = "visible";
    root.style.opacity = clamp(st.o).toFixed(3);
    root.style.transform = `translate(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg) scale(${(s * (1 + k)).toFixed(4)}, ${(s / (1 + k)).toFixed(4)}) rotate(${(-ang).toFixed(2)}deg) scale(${(1 + sq).toFixed(4)}, ${(1 - sq).toFixed(4)}) rotate(${(st.r || 0).toFixed(2)}deg)`;
    const light = clamp(st.light || 0), g = clamp(st.glow === undefined ? 0.6 : st.glow);
    core.setAttribute("stroke", light > 0.5 ? C.coreOnLight : C.core);
    glow.setAttribute("stroke", C.glow);
    glow.setAttribute("opacity", (light > 0.5 ? 0.18 : 0.3).toFixed(2));
    root.style.filter = light > 0.5 ? `drop-shadow(0 6px 14px ${rgba(C.shadowOnLight, (0.25 + 0.25 * g).toFixed(2))})`
      : `drop-shadow(0 0 ${(6 + 10 * g).toFixed(1)}px ${rgba(C.halo, (0.6 + 0.35 * g).toFixed(2))}) drop-shadow(0 0 ${(16 + 26 * g).toFixed(1)}px ${rgba(C.halo2, (0.35 + 0.4 * g).toFixed(2))})`;
    // comet trail when it flies
    const tl = clamp((sp - 900) / 2600) * (st.trail === undefined ? 1 : st.trail);
    if (tl > 0.01) {
      const len = 60 + 380 * tl;
      trail.style.visibility = "visible";
      trail.style.width = len.toFixed(1) + "px";
      trail.style.opacity = (0.9 * tl * clamp(st.o)).toFixed(3);
      trail.style.transform = `translate(${(st.x - len).toFixed(2)}px, ${st.y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg)`;
      trail.style.background = light > 0.5 ? `linear-gradient(90deg, ${rgba(C.trailOnLight, 0)}, ${rgba(C.trailOnLight, ".35")} 60%, ${rgba(C.trailHeadOnLight, ".7")})`
        : `linear-gradient(90deg, ${rgba(C.trail, 0)}, ${rgba(C.trail, ".55")} 60%, ${rgba(C.trailHead, ".95")})`;
    } else trail.style.visibility = "hidden";
  }
  return { build, update };
})();

// ================================================================ cursor (with click ripple)
const Cursor = (() => {
  let root, ripple, path;
  const C = PAL.cursor;
  function build(parent) {
    ripple = el("div", "ripple", parent);
    root = el("div", "cursor", parent);
    root.innerHTML = `<svg viewBox="0 0 24 24" width="46" height="46"><path d="M4.2 2.4v17.9l4.6-4.3 3.1 6.9 3.2-1.4-3-6.8h6.5z" fill="${C.fill}" stroke="${C.outline}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    path = root.querySelector("path");
    root.style.zIndex = ripple.style.zIndex = 70;
  }
  // st: {x, y (tip), o, press 0..1, click (time since click, s), light}
  function update(st) {
    if (!st || st.o <= 0.002) { root.style.visibility = ripple.style.visibility = "hidden"; return; }
    root.style.visibility = "visible"; root.style.opacity = clamp(st.o).toFixed(3);
    const pr = 1 - 0.16 * clamp(st.press || 0);
    root.style.transform = `translate(${(st.x - 4.6).toFixed(2)}px, ${(st.y - 4).toFixed(2)}px) scale(${pr.toFixed(4)})`;
    const light = (st.light || 0) > 0.5;
    path.setAttribute("fill", light ? C.outline : C.fill); path.setAttribute("stroke", light ? "#FFFFFF" : C.outline);
    const c = st.click;
    if (c !== undefined && c >= 0 && c < 0.6) {
      const p = E.outCubic(c / 0.6);
      ripple.style.visibility = "visible";
      ripple.style.borderColor = light ? rgba(C.rippleOnLight, ".8") : rgba(C.ripple, ".9");
      ripple.style.transform = `translate(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px) scale(${(0.15 + 0.85 * p).toFixed(4)})`;
      ripple.style.opacity = (1 - p).toFixed(3);
    } else ripple.style.visibility = "hidden";
  }
  return { build, update };
})();

// ================================================================ pills, tiles
function pill(parent, html, cls) { const p = el("div", "pill " + cls, parent); p.innerHTML = html; return p; }
function tile(parent, label, ic) {
  const t = el("div", "tile", parent);
  t.innerHTML = `${icon(ic, 60, 2.1)}<span>${label}</span>`;
  return t;
}

// ================================================================ outline word stack (one solid copy in the middle)
function ostack(parent, word, n, o) {
  const wrap = el("div", "abs", parent);
  const lines = Array.from({ length: n }, (_, i) => { const l = el("div", "ow" + (o.dark ? " dark" : "") + (i === o.solid ? " solid" : ""), wrap, word); if (o.size) l.style.fontSize = o.size + "px"; return l; });
  const lh = lines[0].offsetHeight * (o.lh || 0.98), w = lines[0].offsetWidth;
  return { wrap, lines, lh, w, n, o };
}

// ================================================================ line-art circles with travelling dots
function circles(parent, list, o = {}) {
  const svg = svgEl("svg", { class: "lineart", viewBox: `0 0 ${W} ${H}` }, parent);
  const items = list.map(([cx, cy, r, a0]) => {
    const c = svgEl("circle", { cx, cy, r, fill: "none", stroke: o.stroke || rgba(PAL.lineArt.stroke, ".55"), "stroke-width": o.width || 2.2, transform: `rotate(${a0 || 0} ${cx} ${cy})` }, svg);
    const L = 2 * Math.PI * r; c.style.strokeDasharray = `${L} ${L}`;
    const dot = svgEl("circle", { r: o.dot || 6, fill: o.dotFill || PAL.lineArt.dot }, svg);
    return { c, dot, cx, cy, r, L, a0: a0 || 0 };
  });
  return { svg, items };
}
function circlesUpdate(C, t, draw, spin, alpha = 1) {
  C.items.forEach((it, i) => {
    it.c.style.strokeDashoffset = (it.L * (1 - clamp(draw))).toFixed(2);
    const ang = ((it.a0 + spin * (i % 2 ? -1 : 1) + i * 70) * Math.PI) / 180;
    it.dot.setAttribute("cx", (it.cx + Math.cos(ang) * it.r).toFixed(2)); it.dot.setAttribute("cy", (it.cy + Math.sin(ang) * it.r).toFixed(2));
    it.dot.style.opacity = clamp(draw * 1.4 - 0.4).toFixed(3);
  });
  C.svg.style.opacity = clamp(alpha).toFixed(3);
  C.svg.style.visibility = alpha > 0.001 ? "visible" : "hidden";
}

// ================================================================ ribbons: a thick stroke whose colour runs along its length,
// drawn as many short round-capped segments, with optional text riding on its centre line
function ribbon(parent, d, o) {
  const svg = svgEl("svg", { class: "lineart", viewBox: `0 0 ${W} ${H}` }, parent);
  const id = "rb" + Math.random().toString(36).slice(2, 8);
  const path = svgEl("path", { d, id, fill: "none", stroke: "none" }, svg);
  const L = path.getTotalLength(), N = o.segs || 220, stops = o.colors;
  const col = (u) => { const k = u * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k)); return mixHex(stops[i], stops[i + 1], k - i); };
  const pts = Array.from({ length: N + 1 }, (_, i) => path.getPointAtLength((L * i) / N));
  const g = svgEl("g", { "stroke-linecap": "round" }, svg);
  const segs = pts.slice(0, N).map((p, i) => svgEl("line", { x1: p.x.toFixed(1), y1: p.y.toFixed(1), x2: pts[i + 1].x.toFixed(1), y2: pts[i + 1].y.toFixed(1), stroke: col(i / (N - 1)), "stroke-width": o.width }, g));
  let text = null;
  if (o.text) {
    text = svgEl("text", { fill: o.textColor || "#fff", "font-family": FILM.fonts.kinetic, "font-weight": 600, "font-size": o.textSize || 28, "letter-spacing": "0.02em", "dominant-baseline": "central" }, svg);
    const tp = svgEl("textPath", { href: "#" + id, startOffset: "0" }, text);
    tp.textContent = o.text;
    text.tp = tp;
  }
  return { svg, path, L, N, segs, text, pts, o };
}
// head/tail in 0..1 of the length; textOff in px along the path
function ribbonUpdate(R, head, tail = 0, textOff = 0, textO = 1) {
  const h = clamp(head) * R.N, tl = clamp(tail) * R.N;
  R.segs.forEach((s, i) => { s.style.visibility = i < h && i >= tl ? "visible" : "hidden"; });
  if (R.text) { R.text.tp.setAttribute("startOffset", textOff.toFixed(1)); R.text.style.opacity = clamp(textO).toFixed(3); }
  R.svg.style.visibility = h > tl ? "visible" : "hidden";
}
const ribbonPoint = (R, u) => R.path.getPointAtLength(clamp(u) * R.L);

// ================================================================ doodle avatars (simple line faces on pastel discs)
const FACES = [
  `<path d="M30 74c-4-20 2-44 22-46 18-1 24 16 21 31"/><circle cx="45" cy="50" r="2.6" fill="currentColor" stroke="none"/><circle cx="61" cy="50" r="2.6" fill="currentColor" stroke="none"/><path d="M45 63q7 7 15-1"/><path d="M33 40c5-16 30-21 40-6"/>`,
  `<path d="M27 63c-3-24 15-36 30-35 16 1 23 17 19 34"/><circle cx="43" cy="51" r="7"/><circle cx="63" cy="51" r="7"/><path d="M50 51h6"/><path d="M46 66q7 6 14 0"/>`,
  `<path d="M28 66c-2-22 10-36 25-36s26 12 24 34"/><circle cx="53" cy="22" r="8"/><path d="M38 51q4-5 8 0M58 51q4-5 8 0"/><path d="M42 61q11 12 22 0"/>`,
  `<path d="M62 22c-15-1-26 10-26 24l-6 8 7 2c0 6 1 10 5 12l3 10"/><path d="M62 22c10 1 16 10 16 20"/><circle cx="50" cy="44" r="2.6" fill="currentColor" stroke="none"/><path d="M47 60q4 2 7-1"/>`,
  `<path d="M28 70c-2-24 9-40 25-40 15 0 25 14 23 36"/><path d="M28 46c6-14 18-20 30-18 10 2 16 8 18 16"/><circle cx="45" cy="54" r="2.6" fill="currentColor" stroke="none"/><circle cx="61" cy="54" r="2.6" fill="currentColor" stroke="none"/><path d="M47 66q6 4 12 0"/>`,
];
function doodle(parent, i, size, bg) {
  const d = el("div", "doodle", parent);
  css(d, { width: size + "px", height: size + "px", background: bg || PAL.doodle.bg[i % PAL.doodle.bg.length], color: PAL.doodle.ink });
  d.innerHTML = `<svg viewBox="0 0 100 100"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${FACES[i % FACES.length]}</g></svg>`;
  return d;
}
