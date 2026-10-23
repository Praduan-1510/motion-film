// Look inside a film page in headless Chrome.
//   node probe.mjs gpu                                          the WebGL renderer Chrome uses (GPU or software) and its version
//   node probe.mjs eval  <page.html> <expression | @file.js>    wait for __ready, evaluate, print the result as JSON
//   node probe.mjs boot  <page.html>                            print console output, exceptions and boot state
//   options: --root=<dir> (served as /, default: the current folder if the page is inside it, else the page's folder),
//            --size=WxH (viewport, default 1920x1080)
// Replaces the session-only evalpage.mjs and dbg.mjs (tools/recovered/story/).
import fs from "node:fs";
import path from "node:path";
import { openPage, defaultRoot, GPU_PROBE } from "../lib/chrome.mjs";

const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=") || true]; }));
const [mode, page, expr] = pos;
const root = page ? path.resolve(String(opt.root || defaultRoot(page))) : null;
const size = opt.size ? String(opt.size).split("x").map(Number) : [1920, 1080];

if (mode === "gpu") {
  const p = await openPage({ size, quiet: true });
  console.log(JSON.stringify(await p.evaluate(GPU_PROBE)));
  await p.close();
} else if (mode === "eval") {
  const code = String(expr).startsWith("@") ? fs.readFileSync(String(expr).slice(1), "utf8") : String(expr);
  const p = await openPage({ root, page, size });
  console.log(JSON.stringify(await p.evaluate(code), null, 1));
  await p.close();
} else if (mode === "boot") {
  const p = await openPage({ root, page, size, ready: false, onConsole: (m) => console.log(m) });
  for (let i = 0; i < 150; i++) {
    const st = await p.evaluate("window.__error || (window.__ready ? 'ready' : document.title)");
    if (st === "ready" || String(st).startsWith("ERR")) { console.log("state:", st); break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("info:", JSON.stringify(await p.evaluate("window.__info && window.__info()")));
  await p.close();
} else {
  console.error("usage: probe.mjs gpu | eval <page> <expr|@file> | boot <page>");
  process.exit(2);
}
