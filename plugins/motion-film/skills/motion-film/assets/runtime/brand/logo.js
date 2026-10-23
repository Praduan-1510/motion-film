// The brand logo: loaded once at boot from the SVG in FILM.logo, split into the mark (drawn as a stroke, it becomes the
// mascot and the line art) and the wordmark (filled, revealed through a clip).
//   FILM.logo = { src: <url of the SVG>, mark: <CSS selector for the mark's paths> }
// v0.3 replaces the selector with logo normalisation (flattened paths, mark/word split by clustering).
"use strict";

const LOGO = { mark: [], word: [], vb: [0, 0, 0, 0] };
const LOGO_PATHS = LOGO;   // { mark: [d…], word: [d…] }, the name the scenes use

async function loadLogo() {
  const cfg = FILM.logo;
  const txt = await (await fetch(cfg.src)).text();
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
  const mark = new Set(doc.querySelectorAll(cfg.mark));
  for (const p of doc.querySelectorAll("path")) (mark.has(p) ? LOGO.mark : LOGO.word).push(p.getAttribute("d"));
  LOGO.vb = doc.documentElement.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
}

// full logo: the mark as strokes, the wordmark behind a clip (for the reveal) and optional gradient copies of it.
// o: { word: fill, mark: stroke, markWidth, sheen: colour, sheenClip: clip the sheen too, glint: [c0, c1, c2] (a hot edge) }
function LOGO_SVG(id, o) {
  const [vx, vy, vw, vh] = LOGO.vb;
  const word = LOGO.word.map((d) => `<path d="${d}"/>`).join("");
  const sheen = o.sheen;
  const glintDef = o.glint ? `<linearGradient id="${id}-gl" gradientUnits="userSpaceOnUse" x1="-200" y1="0" x2="-140" y2="0"><stop offset="0" stop-color="${o.glint[0]}" stop-opacity="0"/><stop offset=".8" stop-color="${o.glint[1]}" stop-opacity=".95"/><stop offset="1" stop-color="${o.glint[2]}" stop-opacity="1"/></linearGradient>` : "";
  const sheenStops = o.sheenEdge
    ? `<stop offset="0" stop-color="${o.sheenEdge}" stop-opacity="0"/><stop offset=".5" stop-color="${sheen}" stop-opacity=".9"/><stop offset="1" stop-color="${o.sheenEdge}" stop-opacity="0"/>`
    : `<stop offset="0" stop-color="${sheen}" stop-opacity="0"/><stop offset=".5" stop-color="${sheen}" stop-opacity=".95"/><stop offset="1" stop-color="${sheen}" stop-opacity="0"/>`;
  return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg"${o.overflow ? ' style="overflow:visible"' : ""}>
  <defs><clipPath id="${id}-clip"><rect x="100" y="-20" width="0" height="180"/></clipPath>
  ${glintDef}<linearGradient id="${id}-sh" gradientUnits="userSpaceOnUse" x1="-200" y1="0" x2="-80" y2="0">${sheenStops}</linearGradient></defs>
  <g class="mark" fill="none" stroke="${o.mark}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${o.markWidth || 5.23}">${LOGO.mark.map((d) => `<path class="mk" d="${d}"/>`).join("")}</g>
  <g class="word" fill="${o.word}" clip-path="url(#${id}-clip)">${word}</g>
  ${o.glint ? `<g class="glint" fill="url(#${id}-gl)" clip-path="url(#${id}-clip)">${word}</g>` : ""}
  <g class="sheen" fill="url(#${id}-sh)"${o.sheenClip ? ` clip-path="url(#${id}-clip)"` : ""}>${word}</g></svg>`;
}

// the mark alone (for the mascot and big line art)
const MARK_PATHS = () => LOGO.mark.map((d) => `<path d="${d}"/>`).join("");
