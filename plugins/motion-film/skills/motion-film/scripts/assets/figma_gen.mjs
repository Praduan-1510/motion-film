// Generate photos with Figma AI through headless Claude runs that hold the Figma MCP connection (one run per image).
//   node figma_gen.mjs <figma fileKey> <out dir> <slot[:tag]>,<slot[:tag]>… --prompts=<prompts.json> [--model=gpt-image-2.5-sunburst]
// prompts.json: { "style": "<shared photo style>", "slots": { "<slot>": { "scene": "…", "w": 1536, "h": 1152 } } }
// Each image is saved as <slot>_<tag>.<ext> with a .json sidecar (url, size, Figma node, model, prompt). About one Figma
// credit per image. Claude: $CLAUDE, else `claude` on PATH, else the newest Claude Code VS Code extension's binary.
// v0.7 wraps this in scripts/assets/photos.mjs (figma | manual | none).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function findClaude() {
  if (process.env.CLAUDE && fs.existsSync(process.env.CLAUDE)) return process.env.CLAUDE;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" });
  const onPath = which.status === 0 && which.stdout.split(/\r?\n/).find((l) => l.trim());
  if (onPath) return onPath.trim();
  // newest anthropic.claude-code-<version>-<platform> extension
  for (const base of [".vscode/extensions", ".vscode-insiders/extensions", ".cursor/extensions"].map((d) => path.join(os.homedir(), d))) {
    if (!fs.existsSync(base)) continue;
    const ver = (n) => (n.match(/anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const exts = fs.readdirSync(base).filter((n) => n.startsWith("anthropic.claude-code-")).sort((a, b) => {
      const [x, y] = [ver(a), ver(b)];
      for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
      return 0;
    });
    for (const e of exts) {
      const bin = path.join(base, e, "resources", "native-binary", process.platform === "win32" ? "claude.exe" : "claude");
      if (fs.existsSync(bin)) return bin;
    }
  }
  throw new Error("claude not found: install Claude Code or set CLAUDE to its executable");
}

const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=")]; }));
const [fileKey, outDir, list] = pos;
if (!fileKey || !outDir || !list || !opt.prompts) { console.error("usage: figma_gen.mjs <fileKey> <outDir> <slot[:tag],…> --prompts=<prompts.json> [--model=…]"); process.exit(2); }
const MODEL = opt.model || "gpt-image-2.5-sunburst";
const P = JSON.parse(fs.readFileSync(opt.prompts, "utf8"));
const CLAUDE = findClaude();
fs.mkdirSync(outDir, { recursive: true });

function headless(prompt) {
  return new Promise((res) => {
    const p = spawn(CLAUDE, ["-p", prompt, "--allowedTools", "ToolSearch,mcp__figma__generate_image", "--output-format", "text"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => (err += b));
    p.on("exit", (code) => res({ code, out, err }));
  });
}

async function one(entry) {
  const [slot, tag = "a"] = entry.split(":");
  const s = P.slots[slot];
  if (!s) return console.error(`${slot}: no such slot in ${opt.prompts}`);
  const prompt = `${s.scene} ${P.style}`;
  const ask = `Load the tool with ToolSearch (query "select:mcp__figma__generate_image"). Then call mcp__figma__generate_image exactly once with these arguments: fileKey="${fileKey}", model="${MODEL}", width=${s.w}, height=${s.h}, prompt=<the text between the markers, verbatim>.
<<<PROMPT
${prompt}
PROMPT>>>
Do not call any other tool and do not retry with different arguments. Print ONLY one line of JSON: {"url": <the full-resolution image url from the result>, "width": <w>, "height": <h>, "nodeId": <node id>} or {"error": <the error message>}.`;
  const r = await headless(ask);
  const m = r.out.match(/\{[^{}]*"(?:url|error)"[^{}]*\}/);
  if (!m) return console.error(`${slot}:${tag} no JSON (exit ${r.code})\n${r.out.slice(0, 600)}\n${r.err.slice(0, 300)}`);
  const j = JSON.parse(m[0]);
  if (!j.url) return console.error(`${slot}:${tag} error: ${j.error}`);
  const buf = Buffer.from(await (await fetch(j.url)).arrayBuffer());
  const ext = buf.subarray(0, 4).toString("hex") === "89504e47" ? "png" : buf[0] === 0xff ? "jpg" : "webp";
  const f = path.join(outDir, `${slot}_${tag}.${ext}`);
  fs.writeFileSync(f, buf);
  fs.writeFileSync(f + ".json", JSON.stringify({ ...j, slot, tag, model: MODEL, prompt }, null, 2));
  console.log(`${slot}:${tag} -> ${f} (${j.width}x${j.height}, node ${j.nodeId})`);
}

await Promise.all(list.split(",").map(one));
