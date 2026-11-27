import * as THREE from 'three';
import type { Film, ProductState } from '../sim/types';
import { GENRES, studioById } from '../sim/data/films';
import { BASE, type Assets } from './assets';
import type { Lighting } from './lighting';

// ---------------------------------------------------------------- the picture on the screen
const FRAG = /* glsl */ `
uniform sampler2D uA; uniform sampler2D uB; uniform float uT; uniform float uMode; uniform float uBlur; uniform float uGain; uniform float uSeed; uniform float uGrainK; uniform float uFault; uniform float uClipY; varying vec2 vUv; varying float vY;
float h(float n){ return fract(sin(n * 127.1 + uSeed * 3.7) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 shot(vec2 uv, float i, float f){ float pick = h(i); float z = mix(1.06, 1.5, h(i + 3.0)); vec2 c = vec2(mix(0.36, 0.64, h(i + 5.0)), mix(0.4, 0.6, h(i + 7.0))); vec2 drift = (vec2(h(i + 9.0), h(i + 11.0)) - 0.5) * 0.09 * f; float zz = z - (h(i + 13.0) - 0.35) * 0.12 * f;
  vec2 q = (uv - 0.5) / zz + c + drift; q = clamp(q, 0.004, 0.996); if (h(i + 15.0) > 0.78) q.x = 1.0 - q.x;
  vec3 s = vec3(0.0); if (uBlur > 0.002) { for (int k = 0; k < 8; k++) { float a = float(k) * 0.785; vec2 o = vec2(cos(a), sin(a) * 2.0) * uBlur; s += (pick < 0.5 ? texture2D(uA, q + o).rgb : texture2D(uB, q + o).rgb); } s /= 8.0; } else s = pick < 0.5 ? texture2D(uA, q).rgb : texture2D(uB, q).rgb; return s; }
void main(){ if (vY > uClipY) discard;
  vec2 uv = vUv; vec3 c = vec3(0.004);
  if (uMode > 0.5) {
    if (uMode < 1.5) { /* house slide */ float r = length((uv - 0.5) * vec2(2.2, 1.0)); c = mix(vec3(0.16, 0.02, 0.03), vec3(0.02, 0.0, 0.01), r * 1.5); float fan = abs(fract(atan(uv.y + 0.1, (uv.x - 0.5) * 2.2) * 5.0 + uT * 0.03) - 0.5); c += vec3(0.5, 0.32, 0.1) * smoothstep(0.42, 0.5, fan) * 0.3 * smoothstep(0.9, 0.1, r); }
    else { float len = uMode < 2.5 ? 2.1 : 4.6; vec2 wob = uGrainK * vec2(sin(uT * 11.0) * 0.0009, sin(uT * 7.3) * 0.0014); float i = floor(uT / len); float f = fract(uT / len); c = shot(uv + wob, i, f);
      if (uMode < 2.5) { c = mix(c, c * vec3(1.1, 1.0, 0.9), 0.5); float bar = step(0.965, uv.y) + step(uv.y, 0.035); c *= 1.0 - bar; c *= smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f); }
      float vig = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2(1.0, 0.8))); c *= mix(1.0, vig, 0.35);
      c *= 1.0 + uGrainK * (0.05 * sin(uT * 37.0) + 0.04 * (h2(uv * 400.0 + fract(uT) * 17.0) - 0.5) * 3.0);
      if (uGrainK > 0.5) { float sx = h(floor(uT * 9.0)); float sc = smoothstep(0.0012, 0.0, abs(uv.x - sx)) * step(0.7, h(floor(uT * 9.0) + 2.0)); c += sc * 0.35; }
    }
    if (uFault > 0.5) { if (uFault < 1.5) { /* jam: melt */ float m = smoothstep(0.0, 0.5, 0.5 - length((uv - vec2(0.5, 0.45)) * vec2(1.6, 1.0)) + 0.18 * sin(uv.x * 17.0 + uT) * sin(uv.y * 13.0 - uT * 0.6)); c = mix(c * vec3(1.0, 0.6, 0.3), vec3(1.6, 1.3, 0.8), m); c = mix(c, vec3(0.05, 0.02, 0.0), smoothstep(0.25, 0.3, m) * (1.0 - smoothstep(0.4, 0.5, m))); }
      else if (uFault < 2.5) c *= 0.015; else if (uFault > 3.5) c *= 0.0; }
  }
  gl_FragColor = vec4(c * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export interface ScreenState { mode: 0 | 1 | 2 | 3; film: Film | null; blur: number; gain: number; grain: number; fault: number }
export class CinemaScreen {
  readonly mesh: THREE.Mesh;
  private u: Record<string, THREE.IUniform>;
  readonly avg = new THREE.Color();
  constructor(readonly aud: number, w: number, h: number, private assets: Assets, L: Lighting) {
    const black = assets.texture('films/' + 'drama1.webp');
    this.u = { uA: { value: black }, uB: { value: black }, uT: { value: 0 }, uMode: { value: 0 }, uBlur: { value: 0 }, uGain: { value: 1 }, uSeed: { value: aud }, uGrainK: { value: 1 }, uFault: { value: 0 }, uClipY: L.uniforms.uClipY! };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  }
  update(s: ScreenState, t: number): void {
    const u = this.u;
    u.uT!.value = t; u.uMode!.value = s.mode; u.uBlur!.value = s.blur; u.uGain!.value = s.gain; u.uGrainK!.value = s.grain; u.uFault!.value = s.fault;
    if (s.film) {
      const arts = GENRES[s.film.genre].arts;
      const a = s.film.art, b = arts.find((x) => x !== a) ?? a;
      u.uA!.value = this.assets.texture(`films/${a}.webp`); u.uB!.value = this.assets.texture(`films/${b}.webp`);
      u.uSeed!.value = hashStr(s.film.id) % 97;
    }
    // colour thrown back on the audience
    if (s.mode === 0 || s.fault === 2 || s.fault === 4) this.avg.setRGB(0, 0, 0);
    else if (s.mode === 1) this.avg.setRGB(0.24, 0.09, 0.06);
    else {
      const len = s.mode === 2 ? 2.1 : 4.6, i = Math.floor(t / len), seed = (u.uSeed!.value as number);
      const hh = (n: number) => { const x = Math.sin(n * 127.1 + seed * 3.7) * 43758.5453; return x - Math.floor(x); };
      const arts = s.film ? GENRES[s.film.genre].arts : ['drama1'];
      const a = s.film ? s.film.art : 'drama1', b = arts.find((x) => x !== a) ?? a;
      const c = artColor(hh(i) < 0.5 ? a : b);
      const k = (0.8 + 0.4 * hh(i + 21)) * (1 + 0.05 * Math.sin(t * 23)) * s.gain;
      this.avg.setRGB(c[0] * k, c[1] * k, c[2] * k);
    }
    if (s.mode >= 2 && s.fault !== 2 && s.fault !== 4) { this.avg.r += 0.09; this.avg.g += 0.095; this.avg.b += 0.12; }
    if (s.fault === 1) this.avg.setRGB(1.2, 0.85, 0.45);
  }
}
const ART_DEFAULT: Record<string, [number, number, number]> = { action1: [0.78, 0.45, 0.24], action2: [1.19, 0.39, 0.15], anim1: [0.51, 1.08, 0.75], anim2: [1.07, 0.51, 0.57], comedy1: [0.66, 0.51, 0.27], comedy2: [0.78, 0.9, 1.04], doc1: [0.32, 0.54, 0.51], doc2: [0.3, 0.47, 1.12], drama1: [0.69, 0.51, 0.33], drama2: [0.82, 0.93, 0.96], fantasy1: [0.68, 0.92, 1.23], fantasy2: [0.23, 0.45, 0.75], horror1: [0.18, 0.27, 0.39], horror2: [0.14, 0.18, 0.14], musical1: [0.38, 0.18, 0.17], romance1: [0.78, 0.33, 0.32], romance2: [0.21, 0.18, 0.18], scifi1: [0.41, 0.28, 0.21], scifi2: [0.3, 0.28, 0.39], thriller1: [0.21, 0.21, 0.28], thriller2: [0.33, 0.47, 0.69], western: [1.05, 0.68, 0.65] };
function artColor(a: string): [number, number, number] { return ART_DEFAULT[a] ?? [0.5, 0.5, 0.5]; }
export function hashStr(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// ---------------------------------------------------------------- posters
const imgs = new Map<string, Promise<HTMLImageElement>>();
function img(a: string): Promise<HTMLImageElement> {
  let p = imgs.get(a);
  if (!p) { p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`missing film art ${a}`)); i.src = `${BASE}films/${a}.webp`; }); imgs.set(a, p); }
  return p;
}
const PAL = [['#f4e6c4', '#c8311f'], ['#f7f1e3', '#e8a11c'], ['#e9f0ee', '#2b8a94'], ['#ffe9d2', '#b9256a'], ['#f2efe6', '#6fae3a'], ['#fbe9b6', '#5b3fae']];
const posterCache = new Map<string, HTMLCanvasElement>();
const posterWait = new Map<string, ((c: HTMLCanvasElement) => void)[]>();
export function posterCanvas(f: Film, cb?: (c: HTMLCanvasElement) => void): HTMLCanvasElement {
  const key = f.id + f.title;
  const hit = posterCache.get(key);
  if (hit) { if (cb) { const w = posterWait.get(key); if (w) w.push(cb); else cb(hit); } return hit; }
  const c = document.createElement('canvas'); c.width = 400; c.height = 600;
  posterCache.set(key, c); posterWait.set(key, cb ? [cb] : []);
  const x = c.getContext('2d')!; x.fillStyle = '#17110f'; x.fillRect(0, 0, 400, 600);
  void Promise.all([img(f.art), document.fonts?.ready]).then(([im]) => { drawPoster(x, f, im); }).catch(() => drawPoster(x, f, null)).finally(() => { const w = posterWait.get(key) ?? []; posterWait.delete(key); for (const k of w) k(c); });
  return c;
}
function fit(x: CanvasRenderingContext2D, t: string, font: (s: number) => string, max: number, size: number): number { let s = size; do { x.font = font(s); if (x.measureText(t).width <= max) break; s -= 2; } while (s > 12); return s; }
function wrap(t: string, n: number): string[] { const w = t.split(' '), out: string[] = []; let l = ''; const avg = Math.ceil(t.length / n) + 2; for (const k of w) { if (l && (l + ' ' + k).length > avg && out.length < n - 1) { out.push(l); l = k; } else l = l ? l + ' ' + k : k; } out.push(l); return out; }
function drawPoster(x: CanvasRenderingContext2D, f: Film, im: HTMLImageElement | null): void {
  const W = 400, H = 600, [ink, acc] = PAL[f.palette % PAL.length] as [string, string];
  const seed = hashStr(f.id), layout = f.repertory ? 3 : seed % 3;
  const artH = layout === 0 ? H : layout === 1 ? 420 : layout === 3 ? 360 : 470;
  const artY = layout === 1 ? 0 : layout === 3 ? 120 : layout === 2 ? 130 : 0;
  x.fillStyle = layout === 2 ? acc : layout === 3 ? ink : '#100c0d'; x.fillRect(0, 0, W, H);
  if (im) {
    const focus = 0.5 + ((seed % 7) - 3) * 0.03, sw = im.height * (W / artH), sx = Math.max(0, Math.min(im.width - sw, im.width * focus - sw / 2));
    if (layout === 3) { x.save(); x.filter = 'saturate(0.35) sepia(0.55) contrast(1.15)'; }
    x.drawImage(im, sx, 0, Math.min(sw, im.width), im.height, layout === 3 ? 28 : 0, artY, layout === 3 ? W - 56 : W, artH);
    if (layout === 3) x.restore();
  }
  if (layout === 0) { const g = x.createLinearGradient(0, 250, 0, H); g.addColorStop(0, 'rgba(8,6,8,0)'); g.addColorStop(0.62, 'rgba(8,6,8,.82)'); g.addColorStop(1, 'rgba(8,6,8,.97)'); x.fillStyle = g; x.fillRect(0, 250, W, 350); }
  if (layout === 1) { const g = x.createLinearGradient(0, 330, 0, 420); g.addColorStop(0, 'rgba(16,12,13,0)'); g.addColorStop(1, '#100c0d'); x.fillStyle = g; x.fillRect(0, 330, W, 91); }
  const title = f.title.toUpperCase(), lines = wrap(title, title.length > 22 ? 3 : title.length > 10 ? 2 : 1);
  const face: Record<string, (s: number) => string> = { a: (s) => `${s}px "League Gothic", "Arial Narrow", sans-serif`, b: (s) => `700 ${s}px "Barlow Condensed", sans-serif`, c: (s) => `${s}px "Yellowtail", cursive` };
  const script = (f.genre === 'romance' || f.genre === 'musical' || f.genre === 'comedy') && seed % 2 === 0;
  const fn = script ? face.c! : seed % 3 === 0 ? face.b! : face.a!;
  const show = script ? wrap(f.title, 2) : lines;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  let s = 96; for (const l of show) s = Math.min(s, fit(x, l, fn, W - 52, 96));
  const lh = s * (script ? 0.95 : 0.9); let y = layout === 2 ? 70 : layout === 3 ? 64 : H - 128 - (show.length - 1) * lh;
  if (layout === 2) y = Math.max(s * 0.86 + 18, 66 - (show.length - 1) * 4);
  if (layout === 2 || layout === 3) { const tot = show.length * lh; const box = layout === 3 ? 104 : 118; if (tot > box) { const k = box / tot; s *= k; } y = (layout === 3 ? 14 : 10) + s * 0.88; }
  x.fillStyle = layout === 3 ? '#2a1512' : layout === 2 ? '#fff8ea' : ink;
  show.forEach((l, i) => { x.font = fn(s); if (layout === 0 && !script) { x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 12; } x.fillText(l, W / 2, y + i * Math.min(lh, s * 0.95)); x.shadowBlur = 0; });
  const ty = layout === 2 ? H - 50 : layout === 3 ? H - 92 : H - 96;
  x.fillStyle = layout === 3 ? '#5a2a1c' : layout === 2 ? '#fff2d8' : '#e8dcc8'; fit(x, f.tagline, (k) => `italic 500 ${k}px "Barlow", sans-serif`, W - 60, 17); x.fillText(f.tagline, W / 2, layout === 2 ? H - 62 : ty);
  x.fillStyle = layout === 3 ? '#8a3020' : acc; if (layout !== 2) x.fillRect(W / 2 - 24, ty + 12, 48, 3);
  const st = studioById(f.studio);
  x.fillStyle = layout === 3 ? '#3a201a' : 'rgba(240,230,214,.82)'; x.font = '500 15px "Barlow Condensed", sans-serif';
  x.fillText(`${st.name.toUpperCase()}  PRESENTS A  ${GENRES[f.genre].name.toUpperCase()}  PICTURE`, W / 2, H - 50 + (layout === 2 ? 14 : 0));
  x.font = '500 13px "Barlow Condensed", sans-serif'; x.fillText(`${f.runtime} MIN      RATED ${f.cert}`, W / 2, H - 28 + (layout === 2 ? 10 : 0));
  if (f.star > 62) { x.save(); x.translate(W - 58, layout === 2 ? 176 : 58); x.rotate(0.2); x.beginPath(); for (let i = 0; i < 24; i++) { const r = i % 2 ? 34 : 42, a = (i / 24) * Math.PI * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = acc; x.fill(); x.fillStyle = '#fff'; x.font = '700 14px "Barlow Condensed", sans-serif'; x.fillText('ALL-STAR', 0, -2); x.fillText('CAST', 0, 14); x.restore(); }
}
const posterTex = new Map<string, THREE.CanvasTexture>();
export function posterTexture(f: Film): THREE.CanvasTexture {
  const key = f.id + f.title;
  let t = posterTex.get(key);
  if (!t) { const n = new THREE.CanvasTexture(posterCanvas(f, () => { n.needsUpdate = true; })); n.colorSpace = THREE.SRGBColorSpace; n.anisotropy = 4; posterTex.set(key, n); t = n; }
  return t;
}

// ---------------------------------------------------------------- sign writing
export class SignTexture {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  private last = '';
  constructor(w: number, h: number) { this.canvas.width = w; this.canvas.height = h; this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8; }
  draw(key: string, fn: (x: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.last) return;
    this.last = key;
    const x = this.canvas.getContext('2d')!; x.clearRect(0, 0, this.canvas.width, this.canvas.height); x.save(); fn(x, this.canvas.width, this.canvas.height); x.restore();
    this.tex.needsUpdate = true;
  }
}
export function drawMarquee(s: SignTexture, name: string, films: string[], broken: number): void {
  s.draw(name + films.join('|') + broken, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff9e8'); g.addColorStop(0.5, '#fffdf6'); g.addColorStop(1, '#f7ecd0'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(90,70,40,.28)'; x.lineWidth = 2; const show = films.length ? films.slice(0, 3) : ['CLOSED FOR REPAIRS', 'OPENING SOON']; const list = show.length === 1 ? ['NOW SHOWING', show[0]!] : show; const rows = list.length, rh = h / rows; for (let i = 1; i < rows; i++) { x.beginPath(); x.moveTo(0, i * rh); x.lineTo(w, i * rh); x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    list.forEach((t, i) => {
      t = t.toUpperCase(); let sz = rh * 0.92; x.font = `${sz}px "League Gothic", "Arial Narrow", sans-serif`; while (x.measureText(t).width * 1.12 > w * 0.95 && sz > 10) { sz -= 2; x.font = `${sz}px "League Gothic", sans-serif`; }
      let tw = 0; const gap = sz * 0.06; for (const c of t) tw += x.measureText(c).width + gap; let px = w / 2 - tw / 2;
      [...t].forEach((c, k) => { const cw = x.measureText(c).width; if (!(broken && t !== 'NOW SHOWING' && (k * 7 + i * 5 + 3) % 17 < broken)) { x.fillStyle = t === 'NOW SHOWING' ? '#b3161b' : '#141214'; x.save(); x.translate(px + cw / 2, (i + 0.54) * rh + (((k * 13 + i * 7) % 5) - 2) * 0.7); x.rotate((((k * 17 + i) % 7) - 3) * 0.004); x.textAlign = 'center'; x.fillText(c, 0, 0); x.restore(); } px += cw + gap; });
    });
  });
}
export function drawMenu(s: SignTexture, items: { name: string; price: number; out: boolean }[]): void {
  s.draw(JSON.stringify(items), (x, w, h) => {
    x.fillStyle = '#1c0d0e'; x.fillRect(0, 0, w, h); const g = x.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6); g.addColorStop(0, 'rgba(255,190,110,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd98a'; x.font = `${h * 0.2}px "Yellowtail", cursive`; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText('Refreshments', 26, h * 0.14);
    const cols = 2, rows = Math.max(3, Math.ceil(items.length / cols)), rh = (h * 0.72) / rows;
    items.forEach((it, i) => { const c = Math.floor(i / rows), r = i % rows, px = 28 + c * (w / cols), y = h * 0.28 + (r + 0.5) * rh; x.font = `600 ${Math.min(rh * 0.8, 34)}px "Barlow Condensed", sans-serif`; x.fillStyle = it.out ? '#7a5a50' : '#fff3dc'; x.textAlign = 'left'; x.fillText(it.name, px, y); x.textAlign = 'right'; x.fillStyle = it.out ? '#7a5a50' : '#ffb53a'; x.fillText(it.out ? 'SOLD OUT' : it.price.toFixed(2), px + w / cols - 54, y); });
  });
}
export function simpleSign(w: number, h: number, fn: (x: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture { const s = new SignTexture(w, h); s.draw('once', fn); return s.tex; }
export function redrawWhenFontsReady(t: SignTexture[], fn: () => void): void { void document.fonts?.ready.then(() => { for (const s of t) (s as unknown as { last: string }).last = ''; fn(); }); }
export type { ProductState };
