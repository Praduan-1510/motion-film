// iOS 26 components at canvas scale (k = px per iOS point): app icons, notification platters, glass capsule chips.
// Generic app-icon kinds come from FILM.palette.ios.apps ({kind: [glyph, background]}); the "brand" kind draws the logo mark
// on the brand gradient (CSS .appicon.brand), placed as in the brand's app icon (FILM.logo.appIcon).
"use strict";

const IOS = (() => {
  const brandSVG = () => {
    const a = FILM.logo.appIcon;
    return `<svg viewBox="${a.viewBox}"><g transform="${a.transform}" fill="none" stroke="#fff" stroke-width="${a.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${LOGO.mark.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
  };
  function appIcon(size, kind = "brand") {
    if (kind === "brand") return `<div class="appicon brand" style="width:${size}px;height:${size}px">${brandSVG()}</div>`;
    const [glyph, bg] = PAL.ios.apps[kind];
    return `<div class="appicon" style="width:${size}px;height:${size}px;background:${bg}">${icon(glyph, Math.round(size * 0.58), 2.1)}</div>`;
  }

  // notification platter (regular glass). o: {kind, title, body, time, k, w (pt), check}
  function notification(parent, o) {
    const k = o.k || 1.8, w = Math.round((o.w || 400) * k), h = Math.round(70 * k);
    const g = Glass.make(parent, { w, h, r: Math.round(28 * k), variant: "regular", cls: "notif" });
    g.el.style.setProperty("--k", k);
    g.content.innerHTML = `<div class="n-in">${appIcon(Math.round(38 * k), o.kind)}<div class="n-txt"><div class="n-head">` +
      `<span class="n-title">${o.title}${o.check ? checkFill(Math.round(16 * k)) : ""}</span><span class="n-time">${o.time || "now"}</span></div>` +
      `<div class="n-body">${o.body}</div></div></div>`;
    return g;
  }

  // glass capsule chip. o: {fs, h, icon, variant, look}
  function chip(parent, text, o = {}) {
    const fs = o.fs || 26, h = o.h || 62;
    const w = Math.round(measure("", text, `font:600 ${fs}px ${FILM.fonts.ui}`).w + (o.icon ? fs + 12 : 0) + 56);
    const g = Glass.make(parent, { w, h, r: "pill", variant: o.variant || "clear", look: o.look || { frost: 3, sat: 1.6 } });
    g.content.innerHTML = `<div class="chip" style="font-size:${fs}px">${o.icon ? icon(o.icon, fs, 2.2) : ""}${text}</div>`;
    return g;
  }

  return { appIcon, notification, chip };
})();
