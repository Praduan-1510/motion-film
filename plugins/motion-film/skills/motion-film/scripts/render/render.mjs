// Headless-Chrome renderer for a film page (a page that draws any frame via window.__seek(t)).
//   node render.mjs stills --page=<page.html> --times=0.5,4.2 --out=<dir>        review stills (no motion blur)
//   node render.mjs frames --page=<page.html> --out=<dir> --sub=12 --subfast=28 --shutter=0.5 --step=4 --offset=0
//                          [--from=0 --to=<frames> --skipdir=<merged frames> --list=a-b,c-d]
//                          sub-frames for frames f (f % step == offset) → <dir>/f00000_s0.png …
//                          (more sub-frames inside the film's fast-motion windows, window.__fast)
//   node render.mjs cues   --page=<page.html> --out=<file.json>                  audio cue sheet
//   node render.mjs info   --page=<page.html>                                    the page's __info() as JSON
//   any mode: --root=<dir> served as / (default: the current folder if the page is inside it, else the page's folder).
// Size, fps and duration come from the page's __info() ({w, h, fps, dur}); pages without them are taken as 1920×1080, 30 fps, 45 s.
import fs from "node:fs";
import path from "node:path";
import { openPage, defaultRoot } from "../lib/chrome.mjs";

const LEGACY = { w: 1920, h: 1080, fps: 30, dur: 45 };
const [mode, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
if (!args.page) { console.error("--page=<page.html> is required"); process.exit(2); }
const root = path.resolve(String(args.root || defaultRoot(String(args.page))));

const page = await openPage({ root, page: String(args.page) });
const done = async (code = 0) => { await page.close(); process.exit(code); };
const raw = (await page.evaluate("window.__info && window.__info()")) || {};
const film = Object.assign({}, LEGACY, Object.fromEntries(Object.entries(raw).filter(([k]) => k in LEGACY)));
if (!("w" in raw && "h" in raw && "fps" in raw && "dur" in raw)) console.error("note: page does not report w/h/fps/dur in __info(); assuming", JSON.stringify(LEGACY));
console.error(JSON.stringify(raw));
if (film.w !== 1920 || film.h !== 1080) { await page.setSize(film.w, film.h); }
const FPS = film.fps, FRAMES = Math.round(film.dur * FPS);

const out = args.out && path.resolve(String(args.out));
if (out) fs.mkdirSync(mode === "cues" ? path.dirname(out) : out, { recursive: true });

async function shot(t, file) {
  await page.evaluate(`window.__seek(${t})`);
  await page.screenshot(file);
}

try {
  if (mode === "info") {
    console.log(JSON.stringify(Object.assign({}, raw, { w: film.w, h: film.h, fps: FPS, dur: film.dur, frames: FRAMES })));
  } else if (mode === "cues") {
    fs.writeFileSync(out, JSON.stringify(await page.evaluate("window.__cues()"), null, 1));
    console.error("cues written");
  } else if (mode === "stills") {
    const times = String(args.times).split(",").map(Number);
    const s0 = Date.now();
    for (const t of times) await shot(t, path.join(out, `s_${String(Math.round(t * 100)).padStart(5, "0")}.png`));
    console.error(`${times.length} stills in ${Date.now() - s0} ms`);
  } else if (mode === "frames") {
    const sub = +(args.sub || 4), shutter = +(args.shutter || 0.5), step = +(args.step || 1), offset = +(args.offset || 0);
    const subfast = +(args.subfast || sub), from = +(args.from || 0), to = +(args.to || FRAMES);
    const skipDir = args.skipdir ? path.resolve(String(args.skipdir)) : null;   // resume: frames already merged there are skipped
    const list = args.list ? String(args.list).split(",").map((r) => r.split("-").map(Number)) : null;
    const inList = (f) => !list || list.some(([a, b]) => f >= a && f <= (b === undefined ? a : b));
    // the film's fast-motion windows [t0, t1, samples?] get --subfast (or their own count) sub-frames instead of --sub
    const fast = subfast > sub ? (await page.evaluate("window.__fast ? window.__fast() : []")) || [] : [];
    const subAt = (f) => { let n = sub; for (const [a, b, k] of fast) if (f / FPS >= a && f / FPS <= b) n = Math.max(n, k || subfast); return n; };
    let n = 0; const s0 = Date.now();
    for (let f = from; f < to; f++) {
      if (f % step !== offset || !inList(f)) continue;
      const name = path.join(out, `f${String(f).padStart(5, "0")}`);
      if (fs.existsSync(name + ".done")) continue;
      if (skipDir && fs.existsSync(path.join(skipDir, `frame_${String(f).padStart(5, "0")}.png`))) continue;
      const k = subAt(f);
      for (let j = 0; j < k; j++) {
        // sub-frames centred on the frame time across `shutter` of the frame interval (180° shutter by default)
        const t = (f + (k > 1 ? (j / (k - 1) - 0.5) * shutter : 0)) / FPS;
        await shot(Math.max(0, t), `${name}_s${j}.png`);
      }
      fs.writeFileSync(name + ".done", String(k));   // the merger reads the sample count from here
      n++;
      if (n % 20 === 0) console.error(`worker ${offset}: ${n} frames, ${((Date.now() - s0) / n / 1000).toFixed(2)} s/frame`);
    }
    console.error(`worker ${offset} done: ${n} frames in ${((Date.now() - s0) / 1000).toFixed(0)} s`);
  } else {
    console.error("unknown mode"); await done(1);
  }
} catch (e) {
  console.error(e.message); await done(1);
}
await done(0);
