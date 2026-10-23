// Background: WebGL aurora over a near-black base, light filaments, two soft light pools placed behind the glass (so it
// has colour to refract), flash and pulse. Pure function of the uniforms.
// Colours: FILM.palette.aurora = { main, soft, deep, accent (the aurora's second hue), base: [bottom, top], flash }.
"use strict";

const Background = (() => {
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT, uEnergy, uFlash, uHue, uDark, uPulse, uRib;
uniform vec2 uCam; uniform vec4 uP1, uP2;
uniform vec3 uMain, uSoft, uDeep, uAccent, uBase0, uBase1, uFlashC;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a*noise(p); p = m*p; a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p0 = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec2 p = p0 + uCam;
  float t = uT*.07;
  vec2 q = vec2(fbm(p*1.15 + vec2(0., t)), fbm(p*1.15 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p*1.6 + 2.4*q + vec2(1.7, 9.2) + .6*t), fbm(p*1.6 + 2.4*q + vec2(8.3, 2.8) - .5*t));
  float f = fbm(p*1.25 + 2.6*r);
  vec3 col = mix(uBase0, uBase1, smoothstep(0., 1., uv.y));
  vec3 peri = uMain, soft = uSoft, deep = uDeep, teal = uAccent;
  float aur = smoothstep(.42, .95, f);
  vec3 acol = mix(peri, teal, clamp(uHue + .45*(r.y - .5), 0., 1.));
  col += acol*pow(aur, 2.)*.52*uEnergy;
  col += deep*smoothstep(.15, .85, length(q))*.15*uEnergy;
  col += soft*pow(smoothstep(.62, 1., f), 4.)*.34*uEnergy;
  float rib = 0.;
  for (int i = 0; i < 3; i++) { float fi = float(i);
    float y = .17*sin(p.x*1.35 + uT*.42 + fi*2.1) + .09*sin(p.x*3.1 - uT*.3 + fi) + (fi - 1.)*.24 + .10*(q.x - .5);
    rib += .0012/(abs(p.y - y) + .0035)*smoothstep(1.35, .1, abs(p.x)); }
  col += mix(peri, teal, .35)*rib*.26*uRib;
  // light pools (screen-anchored): xy centre, z radius, w intensity
  vec2 d1 = p0 - uP1.xy, d2 = p0 - uP2.xy;
  col += mix(peri, soft, .25)*uP1.w*exp(-dot(d1, d1)/(uP1.z*uP1.z));
  col += mix(peri, teal, .55)*uP2.w*exp(-dot(d2, d2)/(uP2.z*uP2.z));
  float vig = smoothstep(1.3, .2, length((uv - .5)*vec2(1.25, 1.)));
  col *= mix(.28, 1., vig);
  col *= 1. - uDark;
  col += uFlashC*uFlash*max(0., 1. - .5*length(p));
  col += peri*uPulse*.26*exp(-length(p)*1.5);
  gl_FragColor = vec4(col, 1.);
}`;
  let gl, U = {}, ctx2d;
  const C = PAL.aurora;

  function init(canvas) {
    gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) { ctx2d = canvas.getContext("2d"); return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uRes", "uT", "uEnergy", "uFlash", "uHue", "uDark", "uPulse", "uRib", "uCam", "uP1", "uP2",
      "uMain", "uSoft", "uDeep", "uAccent", "uBase0", "uBase1", "uFlashC"]) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform3fv(U.uMain, vec3(C.main)); gl.uniform3fv(U.uSoft, vec3(C.soft)); gl.uniform3fv(U.uDeep, vec3(C.deep));
    gl.uniform3fv(U.uAccent, vec3(C.accent)); gl.uniform3fv(U.uBase0, vec3(C.base[0])); gl.uniform3fv(U.uBase1, vec3(C.base[1]));
    gl.uniform3fv(U.uFlashC, vec3(C.flash));
    return true;
  }

  // pool in stage pixels → shader space: [x px, y px, radius px, intensity]
  const pool = ([x, y, r, k]) => [(x - W / 2) / H, (H / 2 - y) / H, r / H, k];

  // s: {energy, flash, hue, dark, pulse, rib, cx, cy, p1, p2}
  function draw(t, s) {
    if (!gl) {   // 2D fallback: soft blobs in the main and accent colours
      const c = ctx2d, w = c.canvas.width, h = c.canvas.height;
      c.fillStyle = rgba(C.base[0], 1); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const x = w / 2 + Math.sin(t * 0.3 + i * 1.7) * w * 0.3, y = h / 2 + Math.cos(t * 0.25 + i) * h * 0.25;
        const g = c.createRadialGradient(x, y, 0, x, y, w * 0.32), col = rgbList(i % 2 ? C.main : C.accent);
        g.addColorStop(0, `rgba(${col},${0.35 * s.energy})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      return;
    }
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uEnergy, s.energy);
    gl.uniform1f(U.uFlash, s.flash); gl.uniform1f(U.uHue, s.hue); gl.uniform1f(U.uDark, s.dark);
    gl.uniform1f(U.uPulse, s.pulse); gl.uniform1f(U.uRib, s.rib); gl.uniform2f(U.uCam, s.cx, s.cy);
    gl.uniform4f(U.uP1, ...pool(s.p1)); gl.uniform4f(U.uP2, ...pool(s.p2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { init, draw };
})();
