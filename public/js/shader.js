/*
 * Lenticular wave shader — a WebGL port of the Figma "Pattern refraction" effect.
 *
 * Figma's own runtime needs WebGPU + the unreleased HTML-in-Canvas API, so it would
 * not render for most visitors. This recreates the same look in WebGL 1, which runs
 * everywhere:
 *   1. Draw three blurred wave "curtains" (navy / blue / purple) procedurally.
 *   2. Refract them through vertical lenticular strips (same height function,
 *      refraction and RGB dispersion as the Figma shader).
 *   3. Drift the waves slowly over time so the background is animated.
 *
 * Usage: <canvas data-shader="hero"> or <canvas data-shader="card">.
 */

// --- CONFIG ---
const PRESETS = {
  // Page hero: matches Figma params amount 32, radius 8.16 (→ 100px strips)
  hero: { strip: 100, amount: 320, dispersion: 0.01, mirror: 0, bg: [0x23, 0x21, 0x07], fade: 1,
          bases: [0.37, 0.49, 0.64], amp: 0.2, blur: 0.08, period: 480, speed: 0.045 },
  // "coming soon" cards: amount 6, radius 0 (→ 20px strips), curtains top + bottom
  card: { strip: 20, amount: 60, dispersion: 0.01, mirror: 1, bg: [0x0e, 0x0e, 0x05], fade: 0,
          bases: [0.12, 0.2, 0.3], amp: 0.1, blur: 0.06, period: 420, speed: 0.06 },
};
const COLORS = { navy: [0x06, 0x06, 0x45], blue: [0x20, 0x20, 0x99], purple: [0x8f, 0x20, 0x99] };

const VERT = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;        // canvas size in device px
uniform float uDpr, uTime, uStrip, uAmount, uDisp, uMirror, uFade;
uniform float uAmp, uBlur, uPeriod;
uniform vec3 uBases, uBg, uNavy, uBlue, uPurple;
const float PI = 3.14159265;

// Wave edge (0..1 of height) for one curtain at CSS-px x
float edge(float x, float base, float phase) {
  float t = x / uPeriod + uTime + phase;
  return base + uAmp * (0.75 * sin(t * 2.0 * PI) + 0.25 * sin(t * 4.3 * PI + 1.7));
}

// 1 above the edge, 0 below, with a soft blurred transition
float cover(float y, float e) { return 1.0 - smoothstep(e - uBlur, e + uBlur, y); }

// The un-refracted artwork: purple under blue under navy, curtains hanging from the top.
// With uMirror, a second set rotated 180° rises from the bottom (the card artwork).
vec3 art(vec2 p) {                       // p in CSS px, y down
  vec2 size = uRes / uDpr;
  float x = clamp(p.x, 0.0, size.x);     // clamp edge-wrap, as in Figma
  float y = p.y / size.y;
  float xm = size.x - x + 137.0;         // mirrored x, offset so the two sets don't line up
  float m = uMirror;
  vec3 col = uBg;
  col = mix(col, uPurple, max(cover(y, edge(x, uBases.z, 0.00)), m * cover(1.0 - y, edge(xm, uBases.z, 0.00))));
  col = mix(col, uBlue,   max(cover(y, edge(x, uBases.y, 0.05)), m * cover(1.0 - y, edge(xm, uBases.y, 0.05))));
  col = mix(col, uNavy,   max(cover(y, edge(x, uBases.x, 0.09)), m * cover(1.0 - y, edge(xm, uBases.x, 0.09))));
  return col;
}

// Lenticular height profile (Figma patternType 0)
float height(float x) {
  float g = fract(x / uStrip) * 2.0 - 1.0;
  return pow(clamp(sin((g * 0.5 + 0.5) * PI), 0.0, 1.0), 0.7);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float h = height(p.x);
  vec3 nor = normalize(vec3(h - height(p.x + 0.125), 0.0, 0.0125));
  vec3 ray = vec3(0.0, 0.0, -1.0);
  vec3 rR = refract(ray, nor, 1.333 + uDisp);
  vec3 rG = refract(ray, nor, 1.333);
  vec3 rB = refract(ray, nor, 1.333 - uDisp);
  vec3 col = vec3(art(p + rR.xy * uAmount).r, art(p + rG.xy * uAmount).g, art(p + rB.xy * uAmount).b);
  // Hero: fade into the page background (Figma "Rectangle 23" gradient)
  float y = p.y / (uRes.y / uDpr);
  col = mix(col, uBg, uFade * smoothstep(0.77, 1.0, y));
  gl_FragColor = vec4(col, 1.0);
}`;

const rgb = (c) => c.map((v) => v / 255);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Compile the shader program for one canvas; returns null if WebGL is unavailable. */
function createRenderer(canvas, preset) {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // Full-screen quad
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(prog, name);
  const set1 = (name, v) => gl.uniform1f(u(name), v);
  const set3 = (name, v) => gl.uniform3fv(u(name), v);
  set1("uStrip", preset.strip); set1("uAmount", preset.amount); set1("uDisp", preset.dispersion);
  set1("uMirror", preset.mirror); set1("uFade", preset.fade); set1("uAmp", preset.amp);
  set1("uBlur", preset.blur); set1("uPeriod", preset.period);
  set3("uBases", preset.bases); set3("uBg", rgb(preset.bg));
  set3("uNavy", rgb(COLORS.navy)); set3("uBlue", rgb(COLORS.blue)); set3("uPurple", rgb(COLORS.purple));

  /** Match the drawing buffer to the canvas's CSS size (capped DPR for performance). */
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u("uRes"), w, h);
    set1("uDpr", dpr);
  };

  const draw = (seconds) => {
    resize();
    set1("uTime", seconds * preset.speed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  return { draw };
}

/** Start every [data-shader] canvas; only animate the ones currently on screen. */
function initShaders() {
  const canvases = [...document.querySelectorAll("canvas[data-shader]")];
  const items = canvases
    .map((canvas) => ({ canvas, r: createRenderer(canvas, PRESETS[canvas.dataset.shader] || PRESETS.hero), visible: false }))
    .filter((it) => {
      if (!it.r) it.canvas.classList.add("no-webgl"); // CSS gradient fallback
      return it.r;
    });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const it = items.find((i) => i.canvas === e.target);
      if (it) it.visible = e.isIntersecting;
    });
  });
  items.forEach((it) => { io.observe(it.canvas); it.r.draw(0); });

  if (reduceMotion) {
    window.addEventListener("resize", () => items.forEach((it) => it.r.draw(0)));
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = (now - start) / 1000;
    items.forEach((it) => it.visible && it.r.draw(t));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

initShaders();
