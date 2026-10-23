// Depth particles: dust (behind the scene), bokeh (in front) and the implosion into a point.
// Deterministic: positions are closed-form functions of time. Colours: FILM.palette.particles = { main, light, accent, bokeh }
// (dust is mostly main and light, 12 % accent).
"use strict";

const Particles = (() => {
  const sprite = (rgb, size = 64) => {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d"), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.25, `rgba(${rgb},.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, size, size); return c;
  };
  const P = PAL.particles;
  const SP = { main: sprite(rgbList(P.main)), light: sprite(rgbList(P.light)), accent: sprite(rgbList(P.accent)), big: sprite(rgbList(P.bokeh), 256) };
  const R = rng(20261022);
  const dust = Array.from({ length: 240 }, () => ({ x: R() * 2.6 - 1.3, y: R() * 1.6 - 0.8, z: 0.25 + R() * 0.9, vx: (R() - 0.5) * 0.02, vy: -0.004 - R() * 0.012, tw: R() * 6.28, sp: R() < 0.12 ? "accent" : R() < 0.5 ? "light" : "main", s: 0.6 + R() * 1.4 }));
  const bokeh = Array.from({ length: 16 }, () => ({ x: R() * 2.4 - 1.2, y: R() * 1.4 - 0.7, r: 70 + R() * 170, a: 0.03 + R() * 0.06, ph: R() * 6.28, sp: 0.03 + R() * 0.05 }));

  // st: {dust, bokeh, cx, cy (camera px), implode: p 0..1 toward (ix, iy)}
  function drawBack(ctx, t, st) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const imp = st.implode || 0;
    for (const d of dust) {
      let x = d.x + d.vx * t, y = d.y + d.vy * t;
      x = ((x + 1.3) % 2.6 + 2.6) % 2.6 - 1.3; y = ((y + 0.8) % 1.6 + 1.6) % 1.6 - 0.8;
      let sx = W / 2 + (x * 900) / d.z - (st.cx || 0) * (0.6 / d.z), sy = H / 2 + (y * 900) / d.z - (st.cy || 0) * (0.6 / d.z);
      if (imp > 0) { const k = E.inExpo(imp); sx = lerp(sx, st.ix, k); sy = lerp(sy, st.iy, k); }
      const tw = 0.55 + 0.45 * Math.sin(t * 2.1 + d.tw);
      const size = (d.s * 7) / d.z;
      ctx.globalAlpha = clamp(st.dust * tw * (0.35 + 0.65 * (1 - d.z)) * (1 - 0.6 * E.inQuad(imp)));
      if (ctx.globalAlpha > 0.004) ctx.drawImage(SP[d.sp], sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  function drawFront(ctx, t, st) {
    ctx.clearRect(0, 0, W, H);
    if (!(st.bokeh > 0)) return;
    ctx.globalCompositeOperation = "lighter";
    for (const b of bokeh) {
      const x = W / 2 + (b.x + Math.sin(t * b.sp + b.ph) * 0.08) * 900 - (st.cx || 0) * 1.6;
      const y = H / 2 + (b.y + Math.cos(t * b.sp * 0.8 + b.ph) * 0.06) * 900 - (st.cy || 0) * 1.6;
      ctx.globalAlpha = b.a * st.bokeh;
      ctx.drawImage(SP.big, x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  return { drawBack, drawFront };
})();
