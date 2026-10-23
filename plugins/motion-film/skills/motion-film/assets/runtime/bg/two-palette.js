// Background: big soft glows that drift (organic edges from a domain warp), an optional blurred light ring, in two
// palettes (dark / light) mixed per pixel by a circular wipe, so a scene can flip from dark to light from a point (the
// mascot). Pure function of the uniforms.
// Colours: FILM.palette.twoPalette = {
//   dark:  { base: [bottom, top], glows: [g0, g1, g2, g3] (main, accent, deep, soft) },
//   light: { base: [bottom, top], tints: [t0, t1, t2] (for glows 0–2; glow 3 is a white highlight), ring } }
"use strict";

const Background = (() => {
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT, uDark;
uniform vec4 uB[4];      // blobs: x, y (shader space), radius, intensity
uniform vec4 uRing;      // ring: x, y, radius, intensity
uniform vec4 uWipe;      // x, y, radius, softness (light inside when uIn = 1)
uniform vec2 uMode;      // (mode outside the wipe, mode inside): 0 dark, 1 light
uniform vec3 uDk0, uDk1, uG0, uG1, uG2, uG3, uLt0, uLt1, uT0, uT1, uT2, uTR;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }
float blob(vec2 p, vec4 b){ vec2 d = p - b.xy; return b.w*exp(-dot(d, d)/(b.z*b.z)); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec2 q = p + .07*vec2(fbm(p*2.2 + vec2(0., uT*.06)) - .5, fbm(p*2.2 + vec2(5.2, -uT*.05)) - .5);
  float b0 = blob(q, uB[0]), b1 = blob(q, uB[1]), b2 = blob(q, uB[2]), b3 = blob(q, uB[3]);
  float rd = length(q - uRing.xy) - uRing.z; float ring = uRing.w*exp(-rd*rd/.004);   // a thick, soft ring of light
  // dark: base gradient and four glows
  vec3 dk = mix(uDk0, uDk1, smoothstep(0., 1., uv.y));
  dk += uG0*b0*.62 + uG1*b1*.42 + uG2*b2*.55 + uG3*b3*.42 + mix(uG0, uG1, .35)*ring*.8;
  float vig = smoothstep(1.35, .25, length((uv - .5)*vec2(1.2, 1.)));
  dk *= mix(.45, 1., vig);
  // light: pale base, tints, white highlight
  vec3 lt = mix(uLt0, uLt1, smoothstep(0., 1., uv.y));
  lt = mix(lt, uT0, clamp(b0*.75, 0., 1.));
  lt = mix(lt, uT1, clamp(b1*.7, 0., 1.));
  lt = mix(lt, uT2, clamp(b2*.7, 0., 1.));
  lt = mix(lt, vec3(1., 1., 1.), clamp(b3*.8, 0., 1.));
  lt = mix(lt, uTR, clamp(ring*.6, 0., 1.));
  float inside = smoothstep(uWipe.z + uWipe.w, uWipe.z - uWipe.w, length(p - uWipe.xy));
  float m = mix(uMode.x, uMode.y, inside);
  vec3 col = mix(dk, lt, m);
  col *= 1. - uDark;
  gl_FragColor = vec4(col, 1.);
}`;
  let gl, U = {};
  const C = PAL.twoPalette;

  function init(canvas) {
    gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL is not available (the two-palette background needs it; run doctor)");
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uRes", "uT", "uDark", "uB", "uRing", "uWipe", "uMode", "uDk0", "uDk1", "uG0", "uG1", "uG2", "uG3",
      "uLt0", "uLt1", "uT0", "uT1", "uT2", "uTR"]) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    const set = (n, c) => gl.uniform3fv(U[n], vec3(c));
    set("uDk0", C.dark.base[0]); set("uDk1", C.dark.base[1]);
    C.dark.glows.forEach((c, i) => set("uG" + i, c));
    set("uLt0", C.light.base[0]); set("uLt1", C.light.base[1]);
    C.light.tints.forEach((c, i) => set("uT" + i, c));
    set("uTR", C.light.ring);
  }

  // stage px → shader space
  const X = (x) => (x - W / 2) / H, Y = (y) => (H / 2 - y) / H, R = (r) => r / H;

  // s: {blobs: [[x, y, r, k] × 4] (stage px), ring: [x, y, r, k], wipe: [x, y, r, soft], mode: [outside, inside], dark}
  function draw(t, s) {
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uDark, s.dark);
    const b = new Float32Array(16);
    s.blobs.forEach(([x, y, r, k], i) => b.set([X(x), Y(y), R(r), k], i * 4));
    gl.uniform4fv(U.uB, b);
    const [rx, ry, rr, rk] = s.ring; gl.uniform4f(U.uRing, X(rx), Y(ry), R(rr), rk);
    const [wx, wy, wr, ws] = s.wipe; gl.uniform4f(U.uWipe, X(wx), Y(wy), R(wr), R(ws));
    gl.uniform2f(U.uMode, s.mode[0], s.mode[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { init, draw };
})();
