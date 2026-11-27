import * as THREE from 'three';

/** Painted icon atlas, shared by the floating thought bubbles and the interface. */
export const ICONS = ['delighted', 'happy', 'neutral', 'annoyed', 'angry', 'scared', 'laughing', 'sad', 'sleepy', 'disgusted', 'food', 'drink', 'wc', 'film', 'star', 'bin', 'seat', 'money', 'heart', 'music', 'alert', 'clock', 'people', 'wrench', 'mop', 'fire', 'shush', 'phone', 'bored', 'temp', 'arcade', 'camera'] as const;
export type IconName = (typeof ICONS)[number];
const N = 6, S = 128;
function face(x: CanvasRenderingContext2D, col: string, mood: string): void {
  x.fillStyle = col; x.beginPath(); x.arc(0, 0, 40, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = 'rgba(40,18,12,.9)'; x.stroke(); x.fillStyle = x.strokeStyle = '#2a120c'; x.lineWidth = 6; x.lineCap = 'round';
  const eye = (sx: number, f: () => void) => { x.save(); x.translate(sx, -9); f(); x.restore(); };
  const dot = () => { x.beginPath(); x.arc(0, 0, 5.5, 0, 7); x.fill(); }, arc = (up: boolean) => () => { x.beginPath(); x.arc(0, up ? 4 : -4, 7, up ? Math.PI : 0, up ? 0 : Math.PI); x.stroke(); }, line = () => { x.beginPath(); x.moveTo(-7, 0); x.lineTo(7, 0); x.stroke(); };
  const mouth = (y: number, r: number, a: number, b: number) => { x.beginPath(); x.arc(0, y, r, a, b); x.stroke(); };
  switch (mood) {
    case 'delighted': eye(-14, arc(true)); eye(14, arc(true)); x.beginPath(); x.arc(0, 6, 20, 0, Math.PI); x.closePath(); x.fill(); break;
    case 'happy': eye(-14, dot); eye(14, dot); mouth(4, 19, 0.25, Math.PI - 0.25); break;
    case 'neutral': eye(-14, dot); eye(14, dot); x.beginPath(); x.moveTo(-14, 17); x.lineTo(14, 17); x.stroke(); break;
    case 'bored': eye(-14, line); eye(14, line); x.beginPath(); x.moveTo(-14, 18); x.lineTo(14, 15); x.stroke(); break;
    case 'annoyed': eye(-14, dot); eye(14, dot); x.beginPath(); x.moveTo(-24, -24); x.lineTo(-8, -19); x.moveTo(24, -24); x.lineTo(8, -19); x.stroke(); mouth(30, 17, Math.PI + 0.4, -0.4); break;
    case 'angry': eye(-14, dot); eye(14, dot); x.lineWidth = 8; x.beginPath(); x.moveTo(-26, -27); x.lineTo(-6, -16); x.moveTo(26, -27); x.lineTo(6, -16); x.stroke(); x.lineWidth = 6; mouth(30, 18, Math.PI + 0.3, -0.3); break;
    case 'scared': eye(-14, () => { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 11, 0, 7); x.fill(); x.fillStyle = '#2a120c'; dot(); }); eye(14, () => { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 11, 0, 7); x.fill(); x.fillStyle = '#2a120c'; dot(); }); x.beginPath(); x.ellipse(0, 20, 9, 12, 0, 0, 7); x.fill(); break;
    case 'laughing': eye(-14, arc(true)); eye(14, arc(true)); x.beginPath(); x.arc(0, 2, 23, 0, Math.PI); x.closePath(); x.fill(); x.fillStyle = '#5cc4f0'; x.beginPath(); x.ellipse(-30, 2, 6, 10, 0.5, 0, 7); x.ellipse(30, 2, 6, 10, -0.5, 0, 7); x.fill(); break;
    case 'sad': eye(-14, dot); eye(14, dot); mouth(30, 16, Math.PI + 0.4, -0.4); x.fillStyle = '#5cc4f0'; x.beginPath(); x.ellipse(16, 8, 6, 11, 0, 0, 7); x.fill(); break;
    case 'sleepy': eye(-14, arc(false)); eye(14, arc(false)); x.beginPath(); x.arc(0, 19, 7, 0, 7); x.fill(); x.font = '700 34px sans-serif'; x.fillText('z', 30, -22); break;
    case 'disgusted': eye(-14, line); eye(14, line); x.beginPath(); x.moveTo(-16, 18); x.quadraticCurveTo(-8, 10, 0, 18); x.quadraticCurveTo(8, 26, 16, 16); x.stroke(); break;
  }
}
export function drawIcon(x: CanvasRenderingContext2D, n: IconName, ink = '#2a120c'): void {
  const F: Partial<Record<IconName, [string, string]>> = { delighted: ['#6cd35f', 'delighted'], happy: ['#a9d84a', 'happy'], neutral: ['#f2cf52', 'neutral'], bored: ['#e6b44a', 'bored'], annoyed: ['#f0953c', 'annoyed'], angry: ['#e2452f', 'angry'], scared: ['#b8a0e0', 'scared'], laughing: ['#ffd84a', 'laughing'], sad: ['#86b6e0', 'sad'], sleepy: ['#b9c0cc', 'sleepy'], disgusted: ['#9aba52', 'disgusted'] };
  const f = F[n];
  if (f) { face(x, f[0], f[1]); return; }
  x.fillStyle = x.strokeStyle = ink; x.lineWidth = 7; x.lineCap = x.lineJoin = 'round';
  const P = (...p: number[]) => { x.beginPath(); for (let i = 0; i < p.length; i += 2) x.lineTo(p[i]!, p[i + 1]!); };
  switch (n) {
    case 'food': x.fillStyle = '#c8311f'; P(-24, -8, 24, -8, 17, 38, -17, 38); x.closePath(); x.fill(); x.fillStyle = '#fff6df'; P(-8, -8, 8, -8, 6, 38, -6, 38); x.fill(); x.fillStyle = '#ffd45a'; for (const [a, b] of [[-18, -16], [-4, -24], [12, -22], [22, -14], [2, -12], [-10, -32], [8, -36]]) { x.beginPath(); x.arc(a!, b!, 10, 0, 7); x.fill(); } break;
    case 'drink': x.fillStyle = '#2b8a94'; P(-20, -18, 20, -18, 14, 38, -14, 38); x.closePath(); x.fill(); x.fillStyle = '#fff6df'; x.fillRect(-24, -26, 48, 10); x.strokeStyle = '#c8311f'; x.beginPath(); x.moveTo(4, -26); x.lineTo(12, -44); x.stroke(); break;
    case 'wc': x.fillStyle = '#f4f1ea'; x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.rect(-20, -38, 40, 24); x.fill(); x.stroke(); x.beginPath(); x.ellipse(0, 2, 26, 14, 0, 0, 7); x.fill(); x.stroke(); P(-18, 12, -10, 38, 10, 38, 18, 12); x.fill(); x.stroke(); break;
    case 'film': x.fillStyle = ink; x.fillRect(-38, -26, 76, 52); x.fillStyle = '#ffe9b8'; for (let i = -3; i <= 3; i++) { x.fillRect(i * 11 - 3, -22, 6, 8); x.fillRect(i * 11 - 3, 14, 6, 8); } P(-9, -10, 12, 0, -9, 10); x.closePath(); x.fill(); break;
    case 'star': x.fillStyle = '#ffc531'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 17 : 40, a = i * Math.PI / 5 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); x.lineWidth = 4; x.strokeStyle = '#7a4a08'; x.stroke(); break;
    case 'bin': x.fillStyle = '#5a6a72'; P(-22, -18, 22, -18, 16, 38, -16, 38); x.closePath(); x.fill(); x.fillRect(-28, -28, 56, 9); x.fillRect(-8, -36, 16, 8); break;
    case 'seat': x.fillStyle = '#9c1526'; x.beginPath(); x.roundRect(-26, -38, 52, 46, 10); x.fill(); x.beginPath(); x.roundRect(-30, 8, 60, 18, 8); x.fill(); x.fillStyle = ink; x.fillRect(-36, -6, 10, 34); x.fillRect(26, -6, 10, 34); x.fillRect(-20, 26, 8, 14); x.fillRect(12, 26, 8, 14); break;
    case 'money': x.fillStyle = '#3f8a4a'; x.beginPath(); x.roundRect(-40, -22, 80, 44, 6); x.fill(); x.fillStyle = '#d9f0c8'; x.beginPath(); x.arc(0, 0, 16, 0, 7); x.fill(); x.fillStyle = '#2a5a30'; x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 0, 2); break;
    case 'heart': x.fillStyle = '#e2335a'; x.beginPath(); x.moveTo(0, 34); x.bezierCurveTo(-60, -6, -34, -48, 0, -18); x.bezierCurveTo(34, -48, 60, -6, 0, 34); x.fill(); break;
    case 'music': x.fillStyle = '#7a3ab0'; x.beginPath(); x.ellipse(-16, 26, 13, 10, -0.3, 0, 7); x.ellipse(22, 18, 13, 10, -0.3, 0, 7); x.fill(); x.strokeStyle = '#7a3ab0'; P(-4, 24, -4, -30, 34, -38, 34, 16); x.stroke(); break;
    case 'alert': x.fillStyle = '#e2452f'; P(0, -42, 44, 36, -44, 36); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.fillRect(-5, -16, 10, 28); x.beginPath(); x.arc(0, 24, 6, 0, 7); x.fill(); break;
    case 'clock': x.fillStyle = '#fff6df'; x.beginPath(); x.arc(0, 0, 38, 0, 7); x.fill(); x.stroke(); P(0, -22, 0, 0, 15, 10); x.stroke(); break;
    case 'people': x.fillStyle = '#17454d'; for (const d of [-20, 20]) { x.beginPath(); x.arc(d, -18, 14, 0, 7); x.fill(); x.beginPath(); x.roundRect(d - 18, 0, 36, 38, 14); x.fill(); } break;
    case 'wrench': x.save(); x.rotate(0.78); x.fillStyle = '#6a747c'; x.fillRect(-8, -20, 16, 60); x.beginPath(); x.arc(0, -26, 21, 0, 7); x.fill(); x.fillStyle = '#fff6df'; x.fillRect(-8, -50, 16, 26); x.restore(); break;
    case 'mop': x.strokeStyle = '#8a5a2a'; P(20, -42, -4, 12); x.stroke(); x.fillStyle = '#e9e4d6'; P(-20, 10, 12, 14, 18, 40, -30, 40); x.closePath(); x.fill(); x.lineWidth = 3; x.strokeStyle = '#8a8478'; for (let i = -20; i < 16; i += 8) { P(i, 18, i - 3, 38); x.stroke(); } break;
    case 'fire': x.fillStyle = '#ff7a1a'; x.beginPath(); x.moveTo(0, -44); x.bezierCurveTo(34, -14, 34, 40, 0, 40); x.bezierCurveTo(-34, 40, -30, 0, -14, -12); x.bezierCurveTo(-10, 0, -2, -4, 0, -44); x.fill(); x.fillStyle = '#ffd84a'; x.beginPath(); x.ellipse(2, 22, 13, 17, 0, 0, 7); x.fill(); break;
    case 'shush': face(x, '#f2cf52', 'neutral'); x.fillStyle = '#f0c090'; x.beginPath(); x.roundRect(-6, 4, 12, 40, 6); x.fill(); x.lineWidth = 4; x.stroke(); break;
    case 'phone': x.beginPath(); x.roundRect(-20, -40, 40, 80, 8); x.fill(); x.fillStyle = '#8fe0ff'; x.fillRect(-15, -30, 30, 56); break;
    case 'temp': x.fillStyle = '#fff6df'; x.beginPath(); x.roundRect(-10, -42, 20, 62, 10); x.fill(); x.lineWidth = 5; x.stroke(); x.fillStyle = '#e2452f'; x.beginPath(); x.arc(0, 26, 17, 0, 7); x.fill(); x.fillRect(-5, -20, 10, 44); break;
    case 'arcade': x.fillStyle = '#2a3a8a'; x.beginPath(); x.roundRect(-26, 6, 52, 32, 8); x.fill(); x.strokeStyle = '#2a120c'; P(0, 8, 0, -20); x.stroke(); x.fillStyle = '#e2335a'; x.beginPath(); x.arc(0, -28, 14, 0, 7); x.fill(); break;
    case 'camera': x.beginPath(); x.roundRect(-38, -14, 50, 40, 6); x.fill(); P(12, 0, 38, -16, 38, 28, 12, 14); x.fill(); for (const d of [-26, 0]) { x.beginPath(); x.arc(d, -26, 13, 0, 7); x.fill(); } break;
  }
}
let atlas: HTMLCanvasElement | null = null;
export function iconAtlas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = c.height = N * S; const x = c.getContext('2d')!;
  ICONS.forEach((n, i) => {
    x.save(); x.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2);
    const isFace = i < 10 || n === 'bored' || n === 'shush';
    if (!isFace) { x.fillStyle = '#fff8ea'; x.beginPath(); x.arc(0, -2, 58, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = '#2a120c'; x.stroke(); x.save(); x.scale(0.92, 0.92); drawIcon(x, n); x.restore(); } else { x.scale(1.32, 1.32); drawIcon(x, n); }
    x.restore();
  });
  atlas = c; return c;
}
export const iconIndex = (n: IconName) => ICONS.indexOf(n);

export interface Emote { x: number; y: number; z: number; icon: number; size: number; alpha: number }
export class Emotes {
  readonly mesh: THREE.Mesh; private pos: THREE.InstancedBufferAttribute; private dat: THREE.InstancedBufferAttribute; private geo: THREE.InstancedBufferGeometry;
  constructor(private cap = 520) {
    const g = new THREE.InstancedBufferGeometry(); const p = new THREE.PlaneGeometry(1, 1); g.index = p.index; g.setAttribute('position', p.attributes.position!); g.setAttribute('uv', p.attributes.uv!);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.dat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); this.pos.setUsage(THREE.DynamicDrawUsage); this.dat.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iP', this.pos); g.setAttribute('iD', this.dat); this.geo = g; g.instanceCount = 0;
    const t = new THREE.CanvasTexture(iconAtlas()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uMap: { value: t } }, vertexShader: `attribute vec4 iP; attribute vec2 iD; varying vec2 vUv; varying float vA; void main(){ vec4 mv = viewMatrix * vec4(iP.xyz, 1.0); float k = max(1.0, -mv.z * 0.045); mv.xy += position.xy * iP.w * k; gl_Position = projectionMatrix * mv; gl_Position.z -= 0.002 * gl_Position.w; float i = iD.x; vUv = (vec2(mod(i, ${N}.0), ${N - 1}.0 - floor(i / ${N}.0)) + uv) / ${N}.0; vA = iD.y; }`, fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; varying float vA; void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.02) discard; gl_FragColor = vec4(c.rgb, c.a * vA);\n#include <colorspace_fragment>\n}' });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
  }
  set(list: Emote[]): void {
    const n = Math.min(this.cap, list.length), P = this.pos.array as Float32Array, D = this.dat.array as Float32Array;
    for (let i = 0; i < n; i++) { const e = list[i]!; P[i * 4] = e.x; P[i * 4 + 1] = e.y; P[i * 4 + 2] = e.z; P[i * 4 + 3] = e.size; D[i * 2] = e.icon; D[i * 2 + 1] = e.alpha; }
    this.geo.instanceCount = n; this.mesh.visible = n > 0; this.pos.needsUpdate = true; this.dat.needsUpdate = true;
  }
}
export const THOUGHT_ICON: Record<string, IconName> = {
  queueLong: 'clock', queueRage: 'clock', ticketCheap: 'money', ticketDear: 'money', ticketRobbery: 'money', soldOut: 'seat', foodGreat: 'food', foodOk: 'food', foodBad: 'food', foodDear: 'money', foodGone: 'food', salty: 'food', hungry: 'food', thirsty: 'drink', bladder: 'wc', bladderBad: 'wc', wcClean: 'wc', wcDirty: 'disgusted', wcQueue: 'wc', wcNoPaper: 'wc', litter: 'bin', filthy: 'bin', vomit: 'disgusted', noBin: 'bin', crowded: 'people', hot: 'temp', cold: 'temp', musicNice: 'music', musicBad: 'music', arcadeFun: 'arcade', arcadeBroken: 'wrench', photo: 'camera', seatGood: 'seat', seatBad: 'seat', seatBroken: 'seat', seatDirty: 'seat', picGreat: 'film', picBad: 'film', sndGreat: 'music', sndBad: 'music', fault: 'alert', faultLong: 'angry', faultFixed: 'heart', filmGreat: 'star', filmGood: 'film', filmBad: 'bored', filmAwful: 'angry', laugh: 'laughing', scare: 'scared', tears: 'sad', thrill: 'delighted', tooScary: 'scared', talker: 'annoyed', phone: 'phone', shushed: 'shush', staffNice: 'heart', staffRude: 'annoyed', noStaff: 'alert', refund: 'money', noRefund: 'angry', dark: 'alert', fire: 'fire', rat: 'disgusted', celeb: 'star', proposal: 'heart', freebie: 'heart', lobbyGrand: 'star', lobbyShabby: 'annoyed', decorNice: 'heart', managerHi: 'heart', vipLove: 'heart', sleepy: 'sleepy', wet: 'drink', rest: 'happy', tired: 'seat',
};
