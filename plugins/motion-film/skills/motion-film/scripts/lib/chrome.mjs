// Headless Chrome over CDP (Node's built-in fetch + WebSocket, so Node 22+), plus a static file server for the page.
// Shared by render.mjs (stills, frames, cues) and probe.mjs (evaluate, console, GPU info).
//
//   const page = await openPage({ root, page, size })   // page: file path inside root; size: [w, h] viewport before boot
//   await page.evaluate("window.__seek(1)"); await page.screenshot(file); await page.close(code)
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome: $CHROME, then the usual install locations. doctor.py reports which one is used.
export function findChrome() {
  const c = [process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const hit = c.find((p) => p && fs.existsSync(p));
  if (!hit) throw new Error("Chrome not found: install Google Chrome or set CHROME to its executable");
  return hit;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json" };

// serve `root` over HTTP on a free port; returns { server, port }
async function serve(root) {
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(p).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

// the folder served as / when none is given: the current folder (the user's project) if the page is inside it, else the
// page's own folder. A film page must reach everything it loads (runtime copy, brand, photos) from that root.
export function defaultRoot(page) {
  const cwd = process.cwd(), abs = path.resolve(page), rel = path.relative(cwd, abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? path.dirname(abs) : cwd;
}

// the URL path of a page file under root (pages are passed as file paths, so no shell rewrites a "/…" argument)
export function urlPath(root, page) {
  const rel = path.relative(root, path.resolve(page));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`page ${page} is not inside the served root ${root}`);
  return "/" + rel.split(path.sep).join("/");
}

/**
 * Open a page in headless Chrome and wait for window.__ready.
 * o: { root (dir served as /), page (file path) | url (absolute URL), size: [w, h], ready: false to skip the wait,
 *      onConsole(msg), quiet }
 */
export async function openPage(o) {
  const root = o.root && path.resolve(o.root);
  const [w, h] = o.size || [1920, 1080];
  const srv = root ? await serve(root) : null;
  const url = o.url || (o.page ? `http://127.0.0.1:${srv.port}${urlPath(root, o.page)}` : "about:blank");
  const dbg = 9300 + Math.floor(Math.random() * 600);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mf-chrome-"));
  const chrome = spawn(findChrome(), ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, "--hide-scrollbars",
    "--force-device-scale-factor=1", `--window-size=${w},${h}`, "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--autoplay-policy=no-user-gesture-required", ...(o.chromeArgs || []), "about:blank"], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = await (await fetch(`http://127.0.0.1:${dbg}/json/new?${url}`, { method: "PUT" })).json(); } catch {} }
  if (!target) { await shutdown(); throw new Error("chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pend = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    // surface page errors (a script that fails to load would otherwise just look like a page that never gets ready)
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; console.error("page exception:", d.exception?.description || d.text, `(${d.url || ""}:${d.lineNumber})`); }
    if (m.method === "Runtime.consoleAPICalled" && o.onConsole) o.onConsole(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const setSize = (sw, sh) => send("Emulation.setDeviceMetricsOverride", { width: sw, height: sh, deviceScaleFactor: 1, mobile: false });
  await setSize(w, h);
  await send("Runtime.enable");

  // shut down; Chrome keeps files open in its temporary profile until it has exited, so wait for that before deleting it
  async function shutdown() {
    try { ws?.close(); } catch {}
    chrome.kill(); srv?.server.close();
    await new Promise((r) => { if (chrome.exitCode !== null) return r(); chrome.once("exit", r); setTimeout(r, 5000); });
    for (let i = 0; i < 10; i++) { try { fs.rmSync(prof, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  }

  if (o.page && o.ready !== false) {
    const t0 = Date.now();
    for (let i = 0; ; i++) {
      const st = await evaluate("window.__error || (window.__ready ? 'ready' : document.title)");
      if (st === "ready") break;
      if (st && (String(st).startsWith("ERR") || String(st).includes("Error"))) { await shutdown(); throw new Error("page error: " + st); }
      if (i > 900) { await shutdown(); throw new Error("timeout waiting for page"); }
      await sleep(200);
    }
    if (!o.quiet) console.error(`page ready in ${Date.now() - t0} ms`);
  }

  return {
    send, evaluate, setSize, url,
    async screenshot(file) {
      const s = await send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
      fs.writeFileSync(file, Buffer.from(s.result.data, "base64"));
    },
    close: shutdown,
  };
}

// the WebGL renderer headless Chrome actually uses (a GPU, or SwiftShader = software rendering)
export const GPU_PROBE = `(() => { const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return { webgl: false };
  const e = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return { webgl: true, vendor: e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer,
    software: /swiftshader|llvmpipe|software|basic render/i.test(renderer), chrome: navigator.userAgent.match(/Chrome\\/([\\d.]+)/)?.[1] }; })()`;
