// Mascot continuity (rule R7), evaluated inside a film page that uses the kinetic kit's shared-actor conductor (claim()):
//   node probe.mjs eval <page.html> @mascot_check.js
// Walks the film at 240 steps a second. A jump is a discontinuity, not fast motion: a step longer than 24 px that is also
// over 4× the typical step around it (fast hops move 40+ px a step smoothly), while the mascot is visible on the stage.
// Also reports which scene drives the mascot when, the cue count and the fast-motion windows. ok = no jumps.
(() => {
  const RATE = 240, MIN = 24, FACTOR = 4, MARGIN = 60;
  const who = (t) => { for (const sc of SCENES) if (sc.spark && sc.spark(t - (sc.dt || 0))) return sc.name; return null; };
  const onStage = (p) => p.x > -MARGIN && p.x < W + MARGIN && p.y > -MARGIN && p.y < H + MARGIN;
  const pts = [], spans = [];
  let cur = null, start = 0;
  for (let i = 0; i <= DUR * RATE; i++) {
    const t = i / RATE, s = claim("spark", t), vis = s && s.o > 0.01, w = vis ? who(t) : null;
    if (w !== cur) { if (cur) spans.push([cur, +start.toFixed(3), +t.toFixed(3)]); cur = w; start = t; }
    pts.push(vis ? { t, x: s.x, y: s.y, w } : null);
  }
  if (cur) spans.push([cur, +start.toFixed(3), DUR]);
  const step = (i) => (pts[i] && pts[i - 1] ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : null);
  // a visible mascot with a non-finite position is a bug (the browser ignores the transform and leaves the mascot wherever
  // the previous render put it, which differs per render worker)
  const invalid = [];
  pts.forEach((p, i) => { if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y))) { invalid.push(+p.t.toFixed(3)); pts[i] = null; } });
  const invalidSpans = invalid.reduce((a, t) => { const l = a[a.length - 1]; if (l && t - l[1] < 1.5 / RATE) l[1] = t; else a.push([t, t]); return a; }, []);
  const jumps = [], offstage = [];
  for (let i = 1; i < pts.length; i++) {
    const d = step(i);
    if (d === null || d <= MIN) continue;
    const around = [-3, -2, -1, 1, 2, 3].map((k) => step(i + k)).filter((v) => v !== null).sort((a, b) => a - b);
    const typical = around.length ? around[Math.floor(around.length / 2)] : 0;
    if (d <= FACTOR * typical) continue;                       // part of a fast but smooth move
    const rec = [+pts[i].t.toFixed(3), pts[i - 1].w + " → " + pts[i].w, Math.round(d)];
    (onStage(pts[i]) || onStage(pts[i - 1]) ? jumps : offstage).push(rec);
  }
  return {
    ok: jumps.length === 0 && invalid.length === 0, invalid: invalidSpans, jumps, offstage, spans, cues: CUES.length,
    fast: window.__fast().map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]),
    scenes: SCENES.map((sc) => [sc.name, +(sc.t0 + (sc.dt || 0)).toFixed(2), +(sc.t1 + (sc.dt || 0)).toFixed(2)]),
  };
})()
