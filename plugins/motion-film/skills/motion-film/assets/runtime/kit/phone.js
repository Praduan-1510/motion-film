// iPhone (titanium frame, Dynamic Island, home indicator) laid out with iOS 26 conventions: a floating glass tab bar with
// a separate search button, and a Dynamic Island that expands into a Live Activity. The app screens themselves belong to
// the film (they go into phone.apps).
"use strict";

const Phone = (() => {
  // o: { tabs: [[icon, label, on?], …] } for the glass tab bar
  function make(parent, o) {
    const root = el("div", "phone", parent);
    el("div", "frame", root);
    for (const [side, top, h] of [["left", 176, 36], ["left", 236, 66], ["left", 316, 66], ["right", 270, 104]]) {
      css(el("div", "btn", root), { [side]: "-19px", top: top + "px", height: h + "px" });
    }
    const screen = el("div", "screen", root);
    const apps = el("div", "abs", screen); css(apps, { width: "430px", height: "932px", zIndex: 0 });   // own stacking context: screens stay under the bars
    const status = el("div", "status", screen, `<span class="clock">9:41</span>${STATUS_SVG}`);
    const island = el("div", "island", screen);
    // floating glass tab bar + separate search button; both refract the app scrolling under them
    const tab = Glass.make(screen, { w: 314, h: 64, r: "pill", variant: "clear", cls: "tabbar", look: { frost: 4, sat: 1.8 } });
    tf(tab.el, { x: 20, y: 838 }); tab.el.style.zIndex = 10;
    tab.content.innerHTML = `<div class="sel"></div><div class="tabs">${o.tabs
      .map(([i, n, on]) => `<div class="tab${on ? " on" : ""}">${icon(i, 25, on ? 2.3 : 1.9)}<span>${n}</span></div>`).join("")}</div>`;
    const search = Glass.make(screen, { w: 64, h: 64, r: "pill", variant: "clear", look: { frost: 4, sat: 1.8 } });
    tf(search.el, { x: 346, y: 838 }); search.el.style.zIndex = 10;
    search.content.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center">${icon("search", 26, 2.2)}</div>`;
    el("div", "home", screen);
    el("div", "glare", root);
    return { root, screen, apps, status, island, tab, search, las: [] };
  }

  // a Live Activity shown in the expanded island. o: {title, sub, value}
  function liveActivity(ph, o) {
    const la = el("div", "la", ph.island);
    la.innerHTML = `<div class="la-icon">${IOS.appIcon(44)}</div><div class="la-t">${o.title}</div><div class="la-s">${o.sub}</div>` +
      `<div class="la-v">${checkFill(24)}<span>${o.value}</span></div><div class="la-bar"><i></i></div>`;
    la.bar = la.querySelector(".la-bar i");
    ph.las.push(la);
    return la;
  }
  // island state: p 0 = compact … 1 = expanded (a spring may overshoot); la = the activity to show; bar = its progress
  function island(ph, p, la = null, bar = 1) {
    const q = Math.max(0, p), c = clamp(q);
    const w = 126 + 278 * q, h = 37 + 81 * q, r = 18.5 + 27.5 * c;
    css(ph.island, { left: (215 - w / 2).toFixed(2) + "px", top: (11 - 2 * c).toFixed(2) + "px", width: w.toFixed(2) + "px", height: h.toFixed(2) + "px", borderRadius: r.toFixed(2) + "px" });
    ph.status.style.opacity = (1 - clamp(q * 2.4)).toFixed(3);
    for (const a of ph.las) {
      const on = a === la && p > 0.5;
      a.style.opacity = on ? clamp((p - 0.55) / 0.3).toFixed(3) : "0";
      if (on) {
        a.style.transform = `translate(${((w - 404) / 2).toFixed(2)}px, 0) scale(${(0.94 + 0.06 * c).toFixed(4)})`;
        a.bar.style.width = (100 * clamp(bar)).toFixed(1) + "%";
      }
    }
  }

  // an inset-grouped list that grows downward as its rows arrive: q = per-row progress 0..1
  function growList(list, rows, q) {
    const full = rows.reduce((a, r) => a + r.offsetHeight, 0), h = rows.reduce((a, r, i) => a + r.offsetHeight * clamp(q[i]), 0);
    list.style.clipPath = h >= full - 0.5 ? "none" : `inset(0 0 ${(full - h).toFixed(1)}px 0 round 26px)`;
    list.style.visibility = h > 0.5 ? "visible" : "hidden";
  }

  // app chrome: glass nav buttons and a segmented control (iOS points)
  const nav = () => `<div class="nav"><div class="navbtn">${icon("chevL", 22, 2.4)}</div><div class="navbtn">${icon("ellipsis", 22, 3.4)}</div></div>`;
  const seg = (top, on, labels) => `<div class="seg" style="top:${top}px"><div class="thumb" style="left:${(2 + on * 386 / labels.length).toFixed(2)}px;width:${(386 / labels.length).toFixed(2)}px"></div>${labels.map((l) => `<span>${l}</span>`).join("")}</div>`;

  return { make, liveActivity, island, growList, nav, seg };
})();
