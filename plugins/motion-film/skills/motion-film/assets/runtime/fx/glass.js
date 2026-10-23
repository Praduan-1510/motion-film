// Liquid Glass (iOS 26) for the browser. A glass element is backdrop-filter → an SVG filter that frosts, refracts and
// lifts vibrancy, plus a specular rim. Both the refraction map and the rim are computed from the element's exact
// outline (capsules: round caps; rectangles: continuous corners, matching CSS corner-shape: squircle):
//   · refraction: near the edge the backdrop is sampled from further out along the normal, so the scene bends around
//     the rim like light through thick glass; the interior stays flat (no magnifier, except the tab-bar lens)
//   · rim: a thin specular line lit from the top-left with a dimmer kick from the bottom-right, plus a soft inner glow
//     on the lit side, the way Apple's material reads on dark content
"use strict";

const Glass = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const defs = () => document.querySelector("#svgdefs defs");
  const cache = new Map();
  const urls = [];
  let uid = 0;
  const LN = Math.hypot(-0.56, -0.83), LX = -0.56 / LN, LY = -0.83 / LN;   // light direction (screen space, y down)

  const LOOKS = {
    clear: { frost: 1.6, sat: 1.6 },
    regular: { frost: 10, sat: 1.7 },
    lens: { frost: 0.5, sat: 1.8, zoom: 0.05 },
    prominent: { frost: 3, sat: 1.5 },
  };

  // signed distance to the outline (negative inside) and the outward unit normal at (px, py) from the centre.
  // n = 2: circular corners; n = 4: continuous corners (superellipse, as CSS corner-shape: squircle draws them)
  function outline(px, py, hw, hh, R, n) {
    const sx = px < 0 ? -1 : 1, sy = py < 0 ? -1 : 1;
    const qx = Math.abs(px) - (hw - R), qy = Math.abs(py) - (hh - R);
    if (qx > 0 && qy > 0) {
      const u = qx / R, v = qy / R;
      if (n === 2) { const F = Math.hypot(u, v) || 1e-6; return [(F - 1) * R, (u / F) * sx, (v / F) * sy]; }
      const F = Math.pow(u ** 4 + v ** 4, 0.25) || 1e-6;
      const gx = u ** 3 / F ** 3, gy = v ** 3 / F ** 3, gl = Math.hypot(gx, gy) || 1e-6;   // R·∇F
      return [((F - 1) * R) / gl, (gx / gl) * sx, (gy / gl) * sy];                          // first-order distance
    }
    return qx > qy ? [qx - R, sx, 0] : [qy - R, 0, sy];
  }
  const ss = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

  function maps(w, h, R, n, bezel, zoom) {
    const hw = w / 2, hh = h / 2;
    // refraction (displacement map, 1×)
    const dc = document.createElement("canvas"); dc.width = w; dc.height = h;
    const dctx = dc.getContext("2d"), dimg = dctx.createImageData(w, h), dd = dimg.data;
    const dx = new Float32Array(w * h), dy = new Float32Array(w * h);
    let maxAbs = 1e-3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, py = y + 0.5 - hh;
      const [dist, nx, ny] = outline(px, py, hw, hh, R, n);
      const inside = -dist;
      let ox = 0, oy = 0;
      if (inside >= 0 && inside < bezel) { const m = Math.pow(1 - inside / bezel, 2.2) * bezel * 0.9; ox = nx * m; oy = ny * m; }
      if (zoom && inside >= 0) { ox -= px * zoom; oy -= py * zoom; }
      const i = y * w + x; dx[i] = ox; dy[i] = oy;
      maxAbs = Math.max(maxAbs, Math.abs(ox), Math.abs(oy));
    }
    for (let i = 0; i < w * h; i++) {
      dd[i * 4] = 127.5 + (dx[i] / maxAbs) * 127.5; dd[i * 4 + 1] = 127.5 + (dy[i] / maxAbs) * 127.5; dd[i * 4 + 2] = 128; dd[i * 4 + 3] = 255;
    }
    dctx.putImageData(dimg, 0, 0);
    // specular rim (2×, stays crisp when the camera pushes in)
    const S = 2, W2 = w * S, H2 = h * S, lw = 1.35;
    const rc = document.createElement("canvas"); rc.width = W2; rc.height = H2;
    const rctx = rc.getContext("2d"), rimg = rctx.createImageData(W2, H2), rd = rimg.data;
    const band = 16;
    for (let y = 0; y < H2; y++) {
      const py = (y + 0.5) / S - hh;
      for (let x = 0; x < W2; x++) {
        const px = (x + 0.5) / S - hw;
        if (Math.abs(px) < hw - band - R * 0.3 && Math.abs(py) < hh - band - R * 0.3) { x = Math.max(x, Math.floor((2 * hw - band - R * 0.3) * S) - 1); continue; }
        const [dist, nx, ny] = outline(px, py, hw, hh, R, n);
        if (dist < -band || dist > 1) continue;
        const k = nx * LX + ny * LY;
        const spec = 0.92 * Math.pow(Math.max(0, k), 1.8) + 0.4 * Math.pow(Math.max(0, -k), 1.8) + 0.13;
        const line = ss(-lw - 0.7, -lw + 0.3, dist);
        const glow = Math.exp(dist / 5) * (0.13 * Math.max(0, k) + 0.05 * Math.max(0, -k) + 0.02);
        const a = Math.min(1, line * spec + (1 - line) * glow);
        const j = (y * W2 + x) * 4; rd[j] = 255; rd[j + 1] = 255; rd[j + 2] = 255; rd[j + 3] = Math.round(a * 255);
      }
    }
    rctx.putImageData(rimg, 0, 0);
    return { disp: dc.toDataURL("image/png"), scale: maxAbs * 2, rim: rc.toDataURL("image/png") };
  }

  // one SVG filter + rim per (size, shape, look)
  function get(w, h, r, n, look) {
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
    r = Math.max(1, Math.min(Math.round(r), Math.floor(w / 2), Math.floor(h / 2)));
    const bezel = Math.round(look.bezel !== undefined ? look.bezel : Math.min(26, Math.min(w, h) * 0.3));
    const frost = look.frost, sat = look.sat, zoom = look.zoom || 0;
    const key = `${w}x${h}r${r}n${n}b${bezel}f${frost}s${sat}z${zoom}`;
    if (cache.has(key)) return cache.get(key);
    const id = "lg" + (++uid), m = maps(w, h, r, n, bezel, zoom);
    const f = document.createElementNS(NS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("x", 0); f.setAttribute("y", 0); f.setAttribute("width", w); f.setAttribute("height", h);
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.innerHTML =
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${frost}" edgeMode="duplicate" result="b"/>` +
      `<feImage href="${m.disp}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
      `<feDisplacementMap in="b" in2="m" scale="${m.scale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="d" type="saturate" values="${sat}"/>`;
    defs().appendChild(f);
    const v = { id, rim: m.rim, w, h, r };
    cache.set(key, v); urls.push(m.disp, m.rim);
    return v;
  }

  // create a glass element. o: {w, h, r ('pill' | px), variant: 'clear' | 'regular' | 'lens' | 'prominent', round, tint, cls, look}
  function make(parent, o) {
    const cap = o.r === "pill", w = o.w, h = o.h, r = cap ? h / 2 : o.r === undefined ? 32 : o.r, n = cap || o.round ? 2 : 4;
    const variant = o.variant || "clear";
    const look = Object.assign({}, LOOKS[variant], o.look || {});
    const e = el("div", `glass ${variant}${o.cls ? " " + o.cls : ""}`, parent);
    const f = get(w, h, r, n, look);
    css(e, { width: w + "px", height: h + "px", borderRadius: f.r + "px", backdropFilter: `url(#${f.id})` });
    e.style.setProperty("corner-shape", n === 4 ? "squircle" : "round");
    if (o.tint) e.style.setProperty("--tint", o.tint);
    el("div", "g-sheen", e);
    const content = el("div", "g-content", e);
    const rim = el("div", "g-rim", e); rim.style.backgroundImage = `url("${f.rim}")`;
    const illum = el("div", "g-illum", e);
    return { el: e, content, rim, illum, w, h, r, n, look, cap };
  }

  // glass whose size changes over time (the tab-bar lens): one filter per size, quantised to 4 px. After prewarm
  // (g.frozen) unknown sizes snap to the nearest prewarmed one, so no map is ever decoded mid-render.
  function dynamic(parent, o) {
    const g = make(parent, Object.assign({}, o, { w: o.w || 120, h: o.h || 64 }));
    g.known = new Set(); g.frozen = false;
    g.size = (w, h) => {
      const q = 4;
      let W2 = Math.max(16, Math.round(w / q) * q), H2 = Math.max(16, Math.round(h / q) * q);
      if (g.frozen && !g.known.has(W2 + "x" + H2)) {
        let best = null, bd = 1e9;
        for (const k of g.known) { const [a, b] = k.split("x").map(Number), d = Math.abs(a - W2) + Math.abs(b - H2); if (d < bd) { bd = d; best = [a, b]; } }
        if (best) [W2, H2] = best;
      }
      if (!g.frozen) g.known.add(W2 + "x" + H2);
      const f = get(W2, H2, g.cap ? H2 / 2 : Math.min(o.r, W2 / 2, H2 / 2), g.n, g.look);
      css(g.el, { width: W2 + "px", height: H2 + "px", borderRadius: f.r + "px", backdropFilter: `url(#${f.id})` });
      g.rim.style.backgroundImage = `url("${f.rim}")`;
      g.w = W2; g.h = H2;
    };
    return g;
  }

  // touch illumination (iOS 26 glass lights up from the touch point): k 0..1, x/y in % of the element
  function illum(g, k, x = 50, y = 50) {
    g.illum.style.opacity = clamp(k).toFixed(3);
    g.illum.style.setProperty("--ix", x + "%"); g.illum.style.setProperty("--iy", y + "%");
  }

  // wait until every map is decoded and every filter has rendered once (no frame may sample a not-yet-loaded feImage)
  async function ready() {
    await Promise.all(urls.map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
    const box = el("div", "abs", document.getElementById("stage"));
    css(box, { width: W + "px", height: H + "px", zIndex: 1, pointerEvents: "none" });
    let i = 0;
    for (const v of cache.values()) {
      const d = el("div", "abs", box);
      css(d, { width: "6px", height: "6px", left: (i % 300) * 6 + "px", top: Math.floor(i / 300) * 6 + "px", backdropFilter: `url(#${v.id})`, backgroundImage: `url("${v.rim}")` });
      i++;
    }
    for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r));
    box.remove();
  }

  return { make, dynamic, illum, ready, count: () => cache.size };
})();
