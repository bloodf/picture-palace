import * as THREE from 'three';
import { EQUIPMENT, ITEMS, PRODUCTS, PROJ_TIERS, SEAT_TIERS, equipById, itemById, siteDef } from '../sim/data/catalog';
import { AUDS, DOORS, FIXTURES, ROOMS, STATIONS, WINGS, seatsOf, wallSegments, floorY, roomAt, type WingId } from '../sim/plan';
import { NX, NZ, centerX, centerZ } from '../sim/nav';
import type { Game } from '../sim/game';
import { clamp } from '../sim/rng';
import type { Assets } from './assets';
import { Lighting } from './lighting';
import { Materials, PROP_MATS, clipOnly } from './materials';
import { CinemaScreen, SignTexture, drawMarquee, drawMenu, posterTexture, redrawWhenFontsReady, simpleSign, type ScreenState } from './film';
import { buildShell, LAMP_NAMES, THEMES, type RoomMesh } from './shell';
import type { Quality } from './quality';
import type { CameraRig } from './cameras';

export interface Put { x: number; y?: number; z: number; rot?: number; s?: number; sy?: number; color?: number; tilt?: number }
const BLANK = (() => { const t = new THREE.DataTexture(new Uint8Array([26, 18, 16, 255]), 1, 1); t.needsUpdate = true; return t; })();
const zoneOf = (id: string) => ROOMS.findIndex((r) => r.id === id);

/** Where posters hang: x, z, facing quarter turn, room. */
export const POSTER_SPOTS: [number, number, number, string][] = [
  [-14.83, 4.3, 1, 'lobby'], [-14.83, 6.0, 1, 'lobby'], [14.83, 2.6, 3, 'lobby'], [14.83, 15.3, 3, 'lobby'],
  [-3, -0.17, 2, 'promenade'], [3, -0.17, 2, 'promenade'], [-1.2, -0.17, 2, 'promenade'], [1.2, -0.17, 2, 'promenade'], [-14.9, -0.17, 2, 'promenade'], [15.8, -0.17, 2, 'promenade'],
  [-12, -5.83, 0, 'promenade'], [0, -5.83, 0, 'promenade'], [12, -5.83, 0, 'promenade'], [-28, -5.83, 0, 'promenade'], [28, -5.83, 0, 'promenade'],
  [-14, 18.19, 0, 'street'], [14, 18.19, 0, 'street'], [-5.75, 18.19, 0, 'street'], [5.75, 18.19, 0, 'street'],
];

const SEE: Record<string, string[]> = {
  street: ['street', 'lobby', 'promenade', 'foodcourt'], lobby: ['lobby', 'promenade', 'street', 'foodcourt', 'office', 'aud1', 'aud2'], promenade: ['promenade', 'lobby', 'street', 'foodcourt', 'arcade', 'wcW', 'wcM', 'wcW2', 'wcM2', 'aud1', 'aud2', 'aud3', 'aud4', 'aud5', 'aud6', 'booth1', 'booth2', 'booth3', 'booth4', 'booth5', 'booth6'],
  office: ['office', 'lobby', 'street'], foodcourt: ['foodcourt', 'lobby', 'promenade', 'street', 'vip'], vip: ['vip', 'foodcourt'], arcade: ['arcade', 'promenade'],
};
export function visibleFrom(room: string): Set<string> {
  if (SEE[room]) return new Set(SEE[room]);
  if (room.startsWith('aud')) return new Set([room, 'promenade', 'lobby', room.replace('aud', 'booth')]);
  if (room.startsWith('booth')) return new Set([room, 'promenade', room.replace('booth', 'aud')]);
  if (room.startsWith('wc')) return new Set([room, 'promenade']);
  return new Set(ROOMS.map((r) => r.id));
}

export class World {
  readonly scene = new THREE.Scene();
  readonly L: Lighting; readonly mats: Materials;
  private shellRoot = new THREE.Group(); rooms = new Map<string, RoomMesh>();
  private roomProps = new Map<string, THREE.Group>();
  private pools = new Map<string, { meshes: THREE.InstancedMesh[]; cap: number; list: Put[] }>();
  screens: CinemaScreen[] = [];
  private beams: THREE.Mesh[] = [];
  private seatState: string[] = [];
  private caps = new THREE.Group(); private capMat: THREE.MeshBasicMaterial;
  private marquee = new SignTexture(2048, 300); private menu = new SignTexture(1024, 352); private blade!: THREE.Mesh;
  private bulbs!: THREE.InstancedMesh; private bulbU = { value: 0 }; private bulbOn = { value: 1 };
  private signs: Record<string, THREE.Material> = {};
  private plates: { tex: SignTexture; mesh: THREE.Mesh }[] = [];
  private posters: THREE.Mesh[] = []; private standeeMat: THREE.MeshBasicMaterial;
  private litterMeshes = new Map<string, THREE.InstancedMesh[]>(); private decals!: THREE.InstancedMesh; private decalMat!: THREE.MeshBasicMaterial;
  private sky!: THREE.Mesh; private cityMat!: THREE.MeshBasicMaterial; private cityEm!: THREE.MeshBasicMaterial; private road!: THREE.Group; private cars: { m: THREE.Group; v: number; x: number; z: number }[] = [];
  private rain!: THREE.LineSegments; private snow!: THREE.Points;
  private wingSigns = new THREE.Group();
  private decorKey = ''; private layoutKey = ''; private ghost: THREE.Group | null = null; private ghostKey = ''; private ghostMat = new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0.45, depthWrite: false });
  private tint: { target: Float32Array; cur: Float32Array };
  manager = false; day = 1; overlay: 'none' | 'mood' | 'dirt' | 'crowd' = 'none';
  private overlayT = 0; private dirtT = 0;
  private shared: { seat: THREE.Material | null; leather: THREE.Material | null } = { seat: null, leather: null };

  constructor(readonly assets: Assets, readonly game: () => Game, readonly q: Quality, env: THREE.Texture | null) {
    this.L = new Lighting(assets); this.mats = new Materials(assets, this.L, q, env);
    this.tint = { target: new Float32Array(this.L.tints.length), cur: this.L.tints };
    this.scene.background = new THREE.Color(0x0a0a10);
    this.scene.add(this.shellRoot);
    for (const r of ROOMS) { const g = new THREE.Group(); this.roomProps.set(r.id, g); this.scene.add(g); }
    this.capMat = new THREE.MeshBasicMaterial({ color: 0x15100f });
    this.scene.add(this.caps, this.wingSigns);
    this.standeeMat = this.mats.screen(BLANK, 0.9);
    this.makeSigns(); this.makeSky(); this.makeStreet(); this.makeScreens(); this.makeMarquee(); this.makeLitter(); this.makeWeather();
    ROOMS.forEach((r, i) => this.L.setDir(i, r.kind === 'auditorium' ? -1 : 1));
    this.refresh(true);
    redrawWhenFontsReady([this.marquee, this.menu, ...this.plates.map((p) => p.tex)], () => this.updateSigns());
  }

  // ------------------------------------------------------------------ static bits
  private makeSigns(): void {
    const S = (w: number, h: number, fn: (x: CanvasRenderingContext2D, w: number, h: number) => void, gain = 1) => this.mats.screen(simpleSign(w, h, fn), gain);
    const txt = (x: CanvasRenderingContext2D, t: string, font: string, col: string, px: number, py: number) => { x.font = font; x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py); };
    const board = (t: string, bg: string, fg: string, script = false) => (x: CanvasRenderingContext2D, w: number, h: number) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); txt(x, t, script ? `${h * 0.74}px "Yellowtail", cursive` : `${h * 0.8}px "League Gothic", sans-serif`, fg, w / 2, h * 0.54); };
    const build = () => {
      this.signs.screen_boxoffice = S(1024, 74, board('BOX OFFICE', '#fff6df', '#b3161b'));
      this.signs.screen_soda = S(512, 84, board('Ice Cold', '#b3161b', '#fff2d8', true)); this.signs.screen_ice = S(512, 280, board('Ice Cream', '#f7c6d0', '#8a1830', true));
      this.signs.screen_photo = S(1024, 128, board('4 POSES  ·  1 STRIP', '#fff6df', '#17454d')); this.signs.screen_hoard = S(512, 568, (x, w, h) => { x.fillStyle = '#f2e4c4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#b3161b'; x.lineWidth = 14; x.strokeRect(16, 16, w - 32, h - 32); txt(x, 'COMING', '150px "League Gothic"', '#1c1412', w / 2, h * 0.3); txt(x, 'SOON', '190px "League Gothic"', '#b3161b', w / 2, h * 0.55); txt(x, 'pardon our dust', '54px "Yellowtail"', '#1c1412', w / 2, h * 0.8); });
      this.signs.screen_pos = S(256, 170, (x, w, h) => { x.fillStyle = '#0c1a20'; x.fillRect(0, 0, w, h); for (let i = 0; i < 12; i++) { x.fillStyle = ['#c8311f', '#e8a11c', '#2b8a94', '#5b7a3a'][i % 4]!; x.fillRect(10 + (i % 4) * 60, 12 + Math.floor(i / 4) * 38, 52, 30); } x.fillStyle = '#dff'; x.fillRect(10, 132, 232, 26); });
      this.signs.screen_kiosk = S(256, 350, (x, w, h) => { x.fillStyle = '#18060a'; x.fillRect(0, 0, w, h); txt(x, 'Tickets', '64px "Yellowtail"', '#ffd27a', w / 2, 54); for (let i = 0; i < 4; i++) { x.fillStyle = ['#c8311f', '#e8a11c', '#2b8a94', '#8a3a7a'][i]!; x.fillRect(22, 104 + i * 58, w - 44, 46); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(36, 120 + i * 58, 90 + i * 18, 12); } });
      const game = (a: string, b: string, k: number) => (x: CanvasRenderingContext2D, w: number, h: number) => { x.fillStyle = a; x.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = i % 5 ? 'rgba(255,255,255,.5)' : b; const s = 1 + ((i * 7 + k) % 4); x.fillRect((i * 97 + k * 31) % w, (i * 53 + k * 17) % h, s, s); } if (k === 1) { x.fillStyle = '#5cf'; x.beginPath(); x.moveTo(w / 2, h - 54); x.lineTo(w / 2 - 18, h - 20); x.lineTo(w / 2 + 18, h - 20); x.fill(); for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) { x.fillStyle = ['#f55', '#fc3', '#6f6'][r]!; x.fillRect(30 + c * 30, 34 + r * 28, 18, 12); x.fillRect(34 + c * 30, 30 + r * 28, 10, 20); } } if (k === 2) { x.fillStyle = '#c63'; x.fillRect(0, h * 0.7, w, h * 0.3); x.fillStyle = '#48f'; x.fillRect(60, h * 0.4, 30, 70); x.fillStyle = '#f44'; x.fillRect(150, h * 0.4, 30, 70); x.fillStyle = '#fc9'; x.fillRect(64, h * 0.32, 22, 22); x.fillRect(154, h * 0.32, 22, 22); x.fillStyle = '#fd0'; x.fillRect(14, 14, 90, 12); x.fillRect(w - 74, 14, 60, 12); } if (k === 3) { x.fillStyle = '#3af'; x.fillRect(0, 0, w, h * 0.45); x.fillStyle = '#3a5'; x.fillRect(0, h * 0.45, w, h); x.fillStyle = '#444'; x.beginPath(); x.moveTo(w * 0.46, h * 0.45); x.lineTo(w * 0.54, h * 0.45); x.lineTo(w, h); x.lineTo(0, h); x.fill(); x.fillStyle = '#e22'; x.fillRect(w * 0.4, h * 0.72, w * 0.2, h * 0.14); } txt(x, k === 3 ? 'LAP 2/3' : 'HI 48210', '22px "Barlow Condensed"', '#fff', w / 2, 12); };
      this.signs.screen_game1 = S(256, 206, game('#060818', '#5cf', 1), 1.3); this.signs.screen_game2 = S(256, 206, game('#241038', '#fc3', 2), 1.3); this.signs.screen_game3 = S(256, 180, game('#223', '#fff', 3), 1.3);
      this.signs.screen_marquee1 = S(512, 160, board('STAR HAULER', '#12206a', '#7fe8ff'), 1.3); this.signs.screen_marquee2 = S(512, 160, board('KNUCKLE ALLEY', '#4a0a2a', '#ffd23a'), 1.3); this.signs.screen_marquee3 = S(512, 120, board('COAST RACER', '#a01010', '#fff'), 1.3);
      this.signs.screen_pin = S(256, 512, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1060'); g.addColorStop(1, '#0a2a6a'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < 9; i++) { x.fillStyle = ['#f44', '#fc3', '#4cf'][i % 3]!; x.beginPath(); x.arc(40 + (i * 73) % 180, 60 + i * 40, 18, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(40 + (i * 73) % 180, 60 + i * 40, 8, 0, 7); x.fill(); } });
      this.signs.screen_menu = this.mats.screen(this.menu.tex, 1.1);
      this.signs.screen_poster = this.standeeMat;
    };
    build();
    void document.fonts?.ready.then(() => { build(); this.layoutKey = ''; for (const [k] of this.pools) this.dropPool(k); this.refresh(); });
  }
  private dropPool(key: string): void { const p = this.pools.get(key); if (!p) return; for (const m of p.meshes) { m.parent?.remove(m); m.dispose(); } this.pools.delete(key); }
  private geos(prop: string): { mat: string; geo: THREE.BufferGeometry }[] { return this.q.pbr ? this.assets.propGeometry(prop) : this.assets.mergedGeometry(prop, (m) => this.mats.albedo(PROP_MATS[m] ?? { color: 0x888888 })); }
  private matFor(name: string): THREE.Material {
    if (name === '#low') return this.mats.lowm.props();
    if (name.startsWith('screen_')) return this.signs[name] ?? this.signs.screen_pos!;
    if (!this.q.pbr && name.startsWith('seat_')) { const th = THEMES[siteDef(this.game().site.id).theme] ?? THEMES.ruby!; return this.mats.lowm.solid(name === 'seat_fabric' ? th.seat : new THREE.Color(th.seat).multiplyScalar(0.62).getHex()); }
    if (name === 'seat_fabric' && this.shared.seat) return this.shared.seat;
    if (name === 'seat_leather' && this.shared.leather) return this.shared.leather;
    return this.mats.prop(name);
  }
  /** Replace all instances of a prop within one room group. */
  place(room: string, prop: string, list: Put[], tag = ''): void {
    const key = `${room}|${prop}|${tag}`;
    let p = this.pools.get(key);
    if (!list.length) { if (p) for (const m of p.meshes) { m.count = 0; m.visible = false; } return; }
    if (!p || p.cap < list.length) {
      this.dropPool(key);
      const cap = Math.ceil(list.length * 1.3) + 1;
      const grp = this.roomProps.get(room) ?? this.scene;
      const amb = this.q.pbr ? null : new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), keyA = this.q.pbr ? null : new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const ms = this.geos(prop).map(({ mat, geo }) => { let gg = geo; if (amb) { gg = new THREE.BufferGeometry(); for (const k in geo.attributes) gg.setAttribute(k, geo.attributes[k]!); gg.setIndex(geo.index); gg.setAttribute('iAmb', amb); gg.setAttribute('iKey', keyA!); } const m = new THREE.InstancedMesh(gg, this.matFor(mat), cap); m.name = key; if (mat.startsWith('glass') || mat === 'water') m.renderOrder = 3; grp.add(m); return m; });
      p = { meshes: ms, cap, list: [] }; this.pools.set(key, p);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((a, i) => { e.set(a.tilt ?? 0, (a.rot ?? 0), 0, 'YXZ'); q.setFromEuler(e); v.set(a.x, a.y ?? 0, a.z); s.set(a.s ?? 1, a.sy ?? a.s ?? 1, a.s ?? 1); m4.compose(v, q, s); for (const m of p!.meshes) { m.setMatrixAt(i, m4); if (a.color !== undefined) m.setColorAt(i, col.setHex(a.color)); } });
    for (const m of p.meshes) { m.count = list.length; m.visible = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
    p.list = list; this.litPool(p);
  }
  private litPool(p: { meshes: THREE.InstancedMesh[]; list: Put[] }): void {
    const g = p.meshes[0]?.geometry, A = g?.getAttribute('iAmb') as THREE.InstancedBufferAttribute | undefined, K = g?.getAttribute('iKey') as THREE.InstancedBufferAttribute | undefined;
    if (!A || !K) return;
    for (let i = 0; i < p.list.length; i++) this.L.sampleLit(p.list[i]!.x, p.list[i]!.z, A.array as Float32Array, K.array as Float32Array, i * 4);
    A.needsUpdate = true; K.needsUpdate = true;
  }
  private makeSky(): void {
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uStar: { value: 0 } }, vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position,1.0); gl_Position = p.xyww; }', fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform float uStar; varying vec3 vD; float h(vec2 p){ return fract(sin(dot(p, vec2(12.98,78.2)))*43758.5); } void main(){ vec3 d = normalize(vD); float k = pow(max(d.y,0.0), 0.55); vec3 c = mix(uHor, uTop, k); vec2 g = floor(vec2(atan(d.z,d.x)*330.0, d.y*420.0)); float s = step(0.9988, h(g)) * (0.4 + 0.6 * h(g + 7.0)) * uStar * smoothstep(0.05,0.4,d.y); c += s * 0.8; gl_FragColor = vec4(c,1.0);\n#include <tonemapping_fragment>
#include <colorspace_fragment>
}` });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 14), m); this.sky.renderOrder = 6; this.sky.frustumCulled = false; this.scene.add(this.sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ color: 0x0b0a0c })); ground.rotation.x = -Math.PI / 2; ground.position.y = -3.4; this.scene.add(ground);
  }
  private makeStreet(): void {
    this.road = new THREE.Group();
    const c = this.assets.texture('tex/city_c.webp', { repeat: true }), e = this.assets.texture('tex/city_e.webp', { repeat: true });
    this.cityMat = new THREE.MeshBasicMaterial({ map: c }); this.cityEm = new THREE.MeshBasicMaterial({ map: e, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const geos: THREE.BoxGeometry[] = [];
    let x = -62, i = 0;
    while (x < 62) { const w = 9 + ((i * 37) % 7), h = 9 + ((i * 53) % 15), d = 12; const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv!; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 12) + i * 0.13, uv.getY(k) * (h / 14)); g.translate(x + w / 2, h / 2 - 0.2, 38.5 + d / 2 + ((i * 29) % 3) * 0.4); geos.push(g); x += w + 0.2; i++; }
    for (const g of geos) { this.road.add(new THREE.Mesh(g, this.cityMat)); const m = new THREE.Mesh(g, this.cityEm); m.scale.set(1.0005, 1.0005, 1.0005); m.position.z = -0.02; this.road.add(m); }
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(130, 6), new THREE.MeshBasicMaterial({ color: 0x24232a })); walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.02, 36); this.road.add(walk);
    const line = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 0.14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8f8a70 }), 26); const m4 = new THREE.Matrix4(); for (let k = 0; k < 26; k++) { m4.makeTranslation(-50 + k * 4, -0.13, 28); line.setMatrixAt(k, m4); } this.road.add(line);
    this.scene.add(this.road);
    for (let k = 0; k < 5; k++) {
      const g = new THREE.Group(); const prop = ['car_red', 'taxi', 'car_blue', 'taxi', 'car_red'][k]!;
      for (const { mat, geo } of this.geos(prop)) { const m = new THREE.Mesh(geo, this.matFor(mat)); g.add(m); }
      const dir = k % 2 ? -1 : 1; g.rotation.y = dir > 0 ? 0 : Math.PI; g.position.set(-50 + k * 23, -0.14, dir > 0 ? 30.2 : 25.8); this.scene.add(g); this.cars.push({ m: g, v: dir * (6 + k), x: g.position.x, z: g.position.z });
    }
  }
  private makeScreens(): void {
    const beamMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uC: { value: new THREE.Color() }, uT: { value: 0 }, uClipY: this.L.uniforms.uClipY! }, vertexShader: 'varying vec3 vP; varying float vY; void main(){ vP = position; vec4 w = modelMatrix*vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix*viewMatrix*w; }', fragmentShader: 'uniform vec3 uC; uniform float uT; uniform float uClipY; varying vec3 vP; varying float vY; void main(){ if (vY > uClipY + 3.0) discard; float k = pow(1.0 - vP.z, 1.6); float d = 0.7 + 0.3*sin(vP.x*31.0+uT*0.5)*sin(vP.y*27.0-uT*0.4+vP.z*9.0); gl_FragColor = vec4(uC * k * d * 0.055, 1.0); }' });
    for (const a of AUDS) {
      const s = new CinemaScreen(a.id, a.screenW, a.screenH, this.assets, this.L);
      s.mesh.position.set(a.cx, a.screenY + a.screenH / 2, a.rect.z0 + 0.15 + 0.37);
      s.mesh.renderOrder = 4; this.roomProps.get(`aud${a.id}`)!.add(s.mesh); this.screens.push(s);
      // projection beam: a frustum from the port to the screen
      const g = new THREE.BufferGeometry(), P: number[] = [], z0 = a.booth.z0 - 0.2, z1 = a.rect.z0 + 0.6, y0 = 2.32;
      const c0 = [[-0.1, 0.05], [0.1, 0.05], [0.1, -0.05], [-0.1, -0.05]], c1 = [[-a.screenW / 2, a.screenH / 2], [a.screenW / 2, a.screenH / 2], [a.screenW / 2, -a.screenH / 2], [-a.screenW / 2, -a.screenH / 2]];
      const vs: number[] = [], loc: number[] = [];
      for (let k = 0; k < 4; k++) { const q = (k + 1) % 4; const A = [c0[k]!, c0[q]!, c1[q]!, c1[k]!]; const Z = [0, 0, 1, 1]; for (const t of [0, 1, 2, 0, 2, 3]) { const p = A[t]!, zz = Z[t]!; vs.push(a.cx + p[0]!, (zz ? a.screenY + a.screenH / 2 : y0) + p[1]!, zz ? z1 : z0); loc.push(p[0]!, p[1]!, zz); } }
      void P; g.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); g.setAttribute('lp', new THREE.Float32BufferAttribute(loc, 3));
      const m = beamMat(); m.vertexShader = m.vertexShader.replace('void main(){ vP = position;', 'attribute vec3 lp; void main(){ vP = lp;');
      const b = new THREE.Mesh(g, m); b.renderOrder = 5; b.frustumCulled = false; this.roomProps.get(`aud${a.id}`)!.add(b); this.beams.push(b);
    }
  }
  private makeMarquee(): void {
    const st = this.roomProps.get('street')!;
    const mk = (w: number, h: number, x: number, y: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mats.screen(this.marquee.tex, 1.25)); m.position.set(x, y, z); m.rotation.y = ry; st.add(m); };
    mk(15.4, 1.14, 0, 5.24, 21.42, 0); mk(2.9, 1.14, 8.02, 5.24, 19.9, Math.PI / 2); mk(2.9, 1.14, -8.02, 5.24, 19.9, -Math.PI / 2);
    const pts: number[][] = [];
    for (let i = 0; i <= 52; i++) { const x = -7.9 + (15.8 * i) / 52; pts.push([x, 4.58, 21.53], [x, 5.9, 21.53]); }
    for (let i = 0; i < 9; i++) { const z = 18.5 + i * 0.34; pts.push([8.13, 4.58, z], [8.13, 5.9, z], [-8.13, 4.58, z], [-8.13, 5.9, z]); }
    for (let i = 0; i < 26; i++) { const y = 6.3 + i * 0.27; pts.push([-0.86, y, 19.6], [0.86, y, 19.6]); }
    for (const a of AUDS) { const t = new SignTexture(512, 160); const m = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 0.756), this.mats.screen(t.tex, 1.15)); m.position.set(a.cx, 3.085, -5.725); this.roomProps.get('promenade')!.add(m); this.plates.push({ tex: t, mesh: m }); }
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    bm.onBeforeCompile = (s) => { s.uniforms.uT = this.bulbU; s.uniforms.uOn = this.bulbOn; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uOn; varying float vG;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat id = float(gl_InstanceID); vG = (0.35 + 0.65 * step(0.5, fract(id / 4.0 - uT * 1.6))) * step(fract(sin(id * 12.9898) * 43758.5453), uOn);'); s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vG;').replace('#include <opaque_fragment>', 'outgoingLight = mix(vec3(0.1,0.07,0.05), vec3(2.4,1.75,0.9), vG);\n#include <opaque_fragment>'); };
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), bm, pts.length);
    const m4 = new THREE.Matrix4(); pts.forEach((p, i) => { m4.makeTranslation(p[0]!, p[1]!, p[2]!); this.bulbs.setMatrixAt(i, m4); }); st.add(this.bulbs);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 7.3, 0.5), this.mats.make({ color: 0x3a0d14, rough: 0.3 }, { mode: 'probe' })); back.geometry.setAttribute('ao', new THREE.BufferAttribute(new Uint8Array(back.geometry.attributes.position!.count).fill(255), 1, true)); back.position.set(0, 9.8, 19.3); st.add(back);
    this.blade = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 7), this.mats.screen(BLANK, 1)); this.blade.position.set(0, 9.8, 19.56); st.add(this.blade);
  }
  private makeLitter(): void {
    for (const [kind, prop] of [['popcorn', 'lit_popcorn'], ['cup', 'lit_cup'], ['bucket', 'lit_bucket'], ['wrapper', 'lit_wrapper']] as const) {
      const pa = new THREE.InstancedBufferAttribute(new Float32Array(330 * 4), 4), pk = new THREE.InstancedBufferAttribute(new Float32Array(330 * 4), 4);
      const ms = this.geos(prop).map(({ mat, geo }) => { geo.setAttribute('iAmb', pa); geo.setAttribute('iKey', pk); const m = new THREE.InstancedMesh(geo, this.matFor(mat), 330); m.count = 0; m.frustumCulled = false; this.scene.add(m); return m; });
      this.litterMeshes.set(kind, ms);
    }
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d')!;
    const blot = (ox: number, col: string, n: number, seed: number) => { for (let i = 0; i < n; i++) { const a = (i * 2.399 + seed), r = 44 * Math.sqrt(((i * 37 + seed * 13) % 100) / 100); const g = x.createRadialGradient(ox + 64 + Math.cos(a) * r * 0.7, 64 + Math.sin(a) * r * 0.7, 1, ox + 64 + Math.cos(a) * r * 0.7, 64 + Math.sin(a) * r * 0.7, 12 + ((i * 7) % 14)); g.addColorStop(0, col); g.addColorStop(0.75, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(ox, 0, 128, 128); } };
    blot(0, 'rgba(70,28,14,.55)', 16, 1); blot(128, 'rgba(150,138,52,.75)', 22, 2); blot(256, 'rgba(120,160,185,.5)', 26, 3); x.strokeStyle = '#1a1030'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); for (let i = 0; i < 40; i++) x.lineTo(392 + i * 2.7, 64 + Math.sin(i * 0.9) * 26 * Math.cos(i * 0.31)); x.stroke(); x.strokeStyle = '#b0203a'; x.beginPath(); x.moveTo(400, 100); x.bezierCurveTo(430, 20, 470, 120, 500, 40); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const off = new THREE.InstancedBufferAttribute(new Float32Array(120), 1); g.setAttribute('iK', off);
    this.decalMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.decalMat.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float iK;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((uv.x + iK) * 0.25, uv.y);'); };
    this.decals = new THREE.InstancedMesh(g, this.decalMat, 120); this.decals.count = 0; this.decals.frustumCulled = false; this.decals.renderOrder = 1; this.scene.add(this.decals);
  }
  private makeWeather(): void {
    const n = Math.round(900 * this.q.particles), a = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = -30 + Math.random() * 60, z = 18.6 + Math.random() * 15, y = Math.random() * 10; a.set([x, y, z, x + 0.03, y + 0.34, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const rm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } }, vertexShader: 'uniform float uT; void main(){ vec3 p = position; float b = mod(p.y, 0.0001); p.y = mod(position.y - uT*11.0 , 10.0); gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(0.62,0.68,0.78,0.26); }' });
    this.rain = new THREE.LineSegments(g, rm); this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain);
    const sg = new THREE.BufferGeometry(), sa = new Float32Array(n * 3); for (let i = 0; i < n; i++) sa.set([-30 + Math.random() * 60, Math.random() * 10, 18.6 + Math.random() * 15], i * 3); sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } }, vertexShader: 'uniform float uT; void main(){ vec3 p = position; p.y = mod(p.y - uT*0.9, 10.0); p.x += sin(uT*0.6+p.z*3.0)*0.4; vec4 m = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*m; gl_PointSize = 46.0/ -m.z; }', fragmentShader: 'void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(0.95,0.97,1.0,0.8*(1.0-d*2.0)); }' }));
    this.snow.frustumCulled = false; this.snow.visible = false; this.scene.add(this.snow);
  }

  // ------------------------------------------------------------------ game state -> scene
  refresh(force = false): void {
    const g = this.game(), st = g.site;
    const dk = `${st.id}|${JSON.stringify(st.decor)}`;
    if (force || dk !== this.decorKey) {
      this.decorKey = dk;
      this.shellRoot.clear(); this.rooms.clear();
      const th = THEMES[siteDef(st.id).theme] ?? THEMES.ruby!;
      this.shared.seat = this.mats.make({ color: th.seat, tex: 'velvet', scale: 3, rough: 0.92 }, { mode: 'probe' }); this.shared.leather = this.mats.make({ color: new THREE.Color(th.seat).multiplyScalar(0.62).getHex(), tex: 'leather', scale: 4, rough: 0.42 }, { mode: 'probe' });
      const b = buildShell(this.assets, this.mats, st); this.shellRoot.add(b.group); this.rooms = b.rooms;
      for (const [k] of [...this.pools]) this.dropPool(k);
      this.layoutKey = ''; this.seatState = [];
    }
    const u = g.unlocked;
    const lk = JSON.stringify([st.wings, st.items.map((i) => [i.id, i.type, i.x, i.z, i.rot, i.broken]), Object.entries(st.equipment).map(([k, e]) => [k, e.owned, e.broken]), st.boxOpen, st.conOpen, st.auds.map((a) => [a.projTier, a.seatTier, a.screenTier, a.soundTier])]);
    if (lk !== this.layoutKey) { this.layoutKey = lk; this.layoutProps(u); this.buildCaps(u); this.buildWingSigns(u); }
    this.updateSigns();
  }
  private layoutProps(u: Set<WingId>): void {
    const g = this.game(), st = g.site, R = Math.PI / 2;
    this.place('lobby', 'con_counter', [{ x: 0, z: 2.9 }]); this.place('lobby', 'con_back', [{ x: 0, z: 0.52 }]);
    this.place('lobby', 'menu_board', [{ x: -4.15, y: 2.3, z: 0.3 }, { x: 4.15, y: 2.3, z: 0.3 }]);
    this.place('lobby', 'boxoffice', [{ x: -11.1, z: 13.5, rot: R }]);
    const regs: Put[] = [];
    STATIONS.filter((s) => s.kind === 'concession').slice(0, st.conOpen).forEach((s) => regs.push({ x: s.x, y: 1.1, z: 2.86 })); STATIONS.filter((s) => s.kind === 'box').slice(0, st.boxOpen).forEach((s) => regs.push({ x: -11.15, y: 1.12, z: s.z, rot: R }));
    this.place('lobby', 'register', regs);
    this.place('lobby', 'podium', [{ x: -8.25, z: 0.57 }, { x: 8.25, z: 0.57 }]);
    for (const e of EQUIPMENT) { if (!e.prop || e.id === 'bar') continue; const s = st.equipment[e.id]!; this.place('lobby', e.prop, s.owned ? [{ x: e.x, y: e.y, z: e.z, rot: e.rot * R }] : []); }
    this.place('office', 'desk', [{ x: -22.5, z: 14.5 }]); this.place('office', 'office_chair', [{ x: -22.5, z: 13.5, rot: 0.3 }]); this.place('office', 'shelves', [{ x: -25.57, z: 10.7, rot: R }]); this.place('office', 'sofa', [{ x: -18.4, z: 17.3, rot: Math.PI }]); this.place('office', 'plant_palm', [{ x: -16, z: 16.9, s: 0.9 }, { x: -25, z: 17, s: 1 }]); this.place('office', 'rack', [{ x: -25.4, z: 13.3, rot: R, s: 0.9 }]);
    for (const room of ['wcW', 'wcM', 'wcW2', 'wcM2']) {
      const fs = FIXTURES.filter((f) => f.room === room), on = u.has(ROOMS.find((r) => r.id === room)!.wing);
      this.place(room, 'toilet', on ? fs.filter((f) => f.kind === 'toilet').map((f) => ({ x: f.x, z: f.z, rot: Math.PI })) : []);
      this.place(room, 'urinal', on ? fs.filter((f) => f.kind === 'urinal').map((f) => ({ x: f.x, z: f.z, rot: -R })) : []);
      this.place(room, 'sink', on ? fs.filter((f) => f.kind === 'sink').map((f) => ({ x: f.x, z: f.z, rot: R })) : []);
    }
    for (const a of AUDS) {
      const s = st.auds[a.id - 1]!, b = u.has(a.wing);
      for (let t = 0; t < 3; t++) this.place(`booth${a.id}`, PROJ_TIERS[t]!.prop, b && s.projTier === t ? [{ x: a.cx, z: -8.3, s: 1.12, sy: t === 0 ? 1.18 : 1.45 }] : []);
      this.place(`booth${a.id}`, 'rack', b ? [{ x: a.cx + 1.45, z: -6.6, rot: -R }] : []);
      const sp: Put[] = [];
      if (b) { const n = s.soundTier === 0 ? 0 : s.soundTier === 1 ? 3 : 5; for (let k = 0; k < n; k++) { const z = -11 - k * ((a.rect.z1 - a.rect.z0 - 9) / Math.max(1, n - 1)); sp.push({ x: a.rect.x0 + 0.35, y: a.height - 1.9, z, rot: R }, { x: a.rect.x1 - 0.35, y: a.height - 1.9, z, rot: -R }); } }
      this.place(`aud${a.id}`, 'speaker', sp);
    }
    if (u.has('foodcourt')) { this.place('foodcourt', 'food_counter', [{ x: 27, z: 9.25, rot: -R }]); this.place('foodcourt', 'food_back', [{ x: 29.45, z: 9.25, rot: -R }]); this.place('foodcourt', 'register', STATIONS.filter((s) => s.kind === 'food').map((s) => ({ x: 27, y: 1.06, z: s.z, rot: -R }))); this.place('foodcourt', 'menu_board', [{ x: 29.2, y: 2.75, z: 6, rot: -R }, { x: 29.2, y: 2.75, z: 12.5, rot: -R }]); }
    this.place('vip', 'vip_bar', u.has('vip') && st.equipment.bar?.owned ? [{ x: 40.6, z: 11.7, rot: -R }] : []); this.place('vip', 'bar_stool', u.has('vip') && st.equipment.bar?.owned ? [0, 1, 2, 3, 4].map((k) => ({ x: 39.75, z: 9.8 + k * 0.95 })) : []);
    this.place('street', 'tree', [-33, -27.5, -12.5, 12.5, 19, 27, 36].map((x, i) => ({ x, z: 22.2, s: 0.95 + (i % 3) * 0.08, rot: i }))); this.place('street', 'hydrant', [{ x: -17.5, z: 22.4 }]); this.place('street', 'newsbox', [{ x: 16.4, z: 22.2 }, { x: 17, z: 22.2 }]);
    this.place('street', 'car_blue', [{ x: -13, y: -0.14, z: 24.3 }]); this.place('street', 'car_red', [{ x: 14, y: -0.14, z: 24.3, rot: Math.PI }]);
    for (const d of ['sofa_round', 'plant_palm']) this.place('vip', d, u.has('vip') ? (d === 'sofa_round' ? [] : [{ x: 31, z: 17 }, { x: 41, z: 17 }, { x: 31, z: 9 }]) : [], 'fix');
    // hoardings over closed wings
    const h: Put[] = [];
    for (const d of DOORS) { if (u.has(d.wing)) continue; for (let t = d.from + 0.5; t < d.to; t += 1) h.push(d.axis === 'z' ? { x: t, z: d.at + (d.at === 0 ? -0.17 : 0.17), rot: d.at === 0 ? Math.PI : 0, sy: Math.min(1.25, d.height / 2.9) } : { x: d.at - 0.17, z: t, rot: -R, sy: Math.min(1.25, d.height / 2.9) }); }
    this.place('promenade', 'hoarding', h.filter((q) => q.z < 1 && q.z > -7)); this.place('lobby', 'hoarding', h.filter((q) => q.z >= 1));
    // placed furniture
    for (const def of ITEMS) {
      const byRoom = new Map<string, Put[]>();
      for (const it of st.items) { if (it.type !== def.id) continue; const r = roomAt(it.x, it.z)?.id ?? 'lobby'; const l = byRoom.get(r) ?? []; l.push({ x: it.x, z: it.z, rot: it.rot * R, color: it.broken ? 0x6a6a6a : 0xffffff }); byRoom.set(r, l); }
      for (const r of ['lobby', 'promenade', 'foodcourt', 'arcade', 'vip', 'street']) this.place(r, def.prop, byRoom.get(r) ?? [], 'item');
    }
    this.buildPosters();
  }
  private buildPosters(): void {
    for (const p of this.posters) p.parent?.remove(p);
    this.posters = [];
    const cases = new Map<string, Put[]>();
    POSTER_SPOTS.forEach(([x, z, r, room]) => {
      const l = cases.get(room) ?? []; l.push({ x, y: 1.0, z, rot: (r * Math.PI) / 2 }); cases.set(room, l);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.1), this.mats.screen(BLANK, 0.92));
      const a = (r * Math.PI) / 2; m.position.set(x + Math.sin(a) * 0.056, 1.65, z + Math.cos(a) * 0.056); m.rotation.y = a; m.userData.spot = true;
      this.roomProps.get(room)!.add(m); this.posters.push(m);
    });
    for (const room of ['lobby', 'promenade', 'street']) this.place(room, 'poster_case', cases.get(room) ?? [], 'wall');
  }
  updateSigns(): void {
    const g = this.game();
    const now = g.s.contracts.filter((c) => g.s.day >= c.startDay && g.s.day <= c.endDay).map((c) => g.film(c.filmId)).filter(Boolean).sort((a, b) => b.hype - a.hype);
    const soon = g.s.contracts.filter((c) => c.startDay > g.s.day).map((c) => g.film(c.filmId)); const off = g.s.offers.map((o) => g.film(o.filmId));
    drawMarquee(this.marquee, g.site.name, now.map((f) => f.title), g.site.decor.facade === 0 ? 1 : 0);
    drawMenu(this.menu, PRODUCTS.filter((p) => p.hall === 'con' && g.site.equipment[p.equip]!.owned && g.site.products[p.id]!.enabled).map((p) => ({ name: p.name, price: g.site.products[p.id]!.price, out: g.site.products[p.id]!.stock <= 0 || g.site.equipment[p.equip]!.broken })));
    const pool = [...now, ...now, ...soon, ...off].filter(Boolean);
    if (pool.length) { this.posters.forEach((p, i) => { const f = pool[i % pool.length]!; const t = posterTexture(f), m = p.material as THREE.MeshBasicMaterial; if (m.map !== t) { m.map = t; m.needsUpdate = true; } }); const t = posterTexture(pool[0]!); if (this.standeeMat.map !== t) { this.standeeMat.map = t; this.standeeMat.needsUpdate = true; } }
    this.plates.forEach((p, i) => { const id = i + 1, on = g.unlocked.has(AUDS[i]!.wing); const sc = g.s.screenings.find((q) => q.aud === id && q.state !== 'ended' && q.state !== 'cancelled'); const ti = !on ? 'Closed' : sc ? g.film(sc.filmId).title : 'No more shows today'; const tm = sc ? g.clock(sc.start + (sc.state === 'upcoming' || sc.state === 'seating' ? sc.delay : 0)) : ''; p.tex.draw(`${ti}|${tm}|${sc?.state}`, (x, w, h) => { x.fillStyle = on ? '#fff8e6' : '#4a4038'; x.fillRect(0, 0, w, h); x.fillStyle = '#b3161b'; x.fillRect(0, 0, 118, h); x.fillStyle = '#fff8e6'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${h * 0.95}px "League Gothic", sans-serif`; x.fillText(String(id), 59, h * 0.55); x.textAlign = 'left'; x.fillStyle = '#1a1214'; let sz = 70; const T = ti.toUpperCase(); x.font = `${sz}px "League Gothic", sans-serif`; while (x.measureText(T).width > w - 150 && sz > 22) { sz -= 2; x.font = `${sz}px "League Gothic", sans-serif`; } x.fillText(T, 136, h * 0.4); x.font = '600 34px "Barlow Condensed", sans-serif'; x.fillStyle = '#b3161b'; x.fillText(sc ? (sc.state === 'playing' ? 'NOW PLAYING' : sc.state === 'trailers' ? 'TRAILERS' : tm) : '', 136, h * 0.78); }); });
    const nm = (g.site.name.split(/\s+/).filter((w) => w.length > 2 && !/^the$/i.test(w)).sort((a, b) => b.length - a.length)[0] ?? g.site.name).toUpperCase().slice(0, 9);
    const bm = this.blade.material as THREE.MeshBasicMaterial;
    if (this.blade.userData.name !== nm + (document.fonts?.status ?? '')) { this.blade.userData.name = nm + (document.fonts?.status ?? ''); bm.map = simpleSign(192, 896, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a0f1a'); gr.addColorStop(1, '#2a060c'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.textAlign = 'center'; x.textBaseline = 'middle'; const sz = Math.min(150, (h - 40) / nm.length); x.font = `${sz * 1.05}px "League Gothic", sans-serif`; [...nm].forEach((c, i) => { x.shadowColor = '#ff5a2a'; x.shadowBlur = 26; x.fillStyle = '#ffe7b0'; x.fillText(c, w / 2, 20 + sz * (i + 0.55)); x.shadowBlur = 0; x.strokeStyle = '#ff9a4a'; x.lineWidth = 2; x.strokeText(c, w / 2, 20 + sz * (i + 0.55)); }); }); bm.needsUpdate = true; }
  }
  private buildCaps(u: Set<WingId>): void {
    this.caps.clear();
    const segs = wallSegments(u);
    const g = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.capMat, segs.length), m4 = new THREE.Matrix4();
    segs.forEach((s, i) => { const len = s.to - s.from + 0.3, mid = (s.from + s.to) / 2; m4.makeScale(s.axis === 'z' ? len : 0.3, 1, s.axis === 'z' ? 0.3 : len); m4.setPosition(s.axis === 'z' ? mid : s.at, 0, s.axis === 'z' ? s.at : mid); g.setMatrixAt(i, m4); });
    g.frustumCulled = false; this.caps.add(g);
  }
  private buildWingSigns(u: Set<WingId>): void {
    this.wingSigns.clear();
    for (const w of WINGS) {
      if (u.has(w.id)) continue;
      const rs = ROOMS.filter((r) => r.wing === w.id && r.kind !== 'booth');
      if (!rs.length) continue;
      const x0 = Math.min(...rs.map((r) => r.rect.x0)), x1 = Math.max(...rs.map((r) => r.rect.x1)), z0 = Math.min(...rs.map((r) => r.rect.z0)), z1 = Math.max(...rs.map((r) => r.rect.z1));
      const W = x1 - x0 - 0.4, H = z1 - z0 - 0.4, k = 36;
      const tex = simpleSign(Math.round(W * k), Math.round(H * k), (x, cw, ch) => { x.fillStyle = '#171214'; x.fillRect(0, 0, cw, ch); x.strokeStyle = 'rgba(242,193,90,.10)'; x.lineWidth = 10; for (let i = -ch; i < cw; i += 46) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + ch, ch); x.stroke(); } x.strokeStyle = 'rgba(242,193,90,.5)'; x.lineWidth = 5; x.setLineDash([22, 16]); x.strokeRect(14, 14, cw - 28, ch - 28); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f2c15a'; let s = 92; x.font = `${s}px "League Gothic", sans-serif`; while (x.measureText(w.name.toUpperCase()).width > cw - 70 && s > 20) { s -= 4; x.font = `${s}px "League Gothic", sans-serif`; } x.fillText(w.name.toUpperCase(), cw / 2, ch / 2 - 26); x.fillStyle = 'rgba(244,228,196,.75)'; x.font = `500 ${Math.max(20, s * 0.46)}px "Barlow Condensed", sans-serif`; x.fillText(`$${w.cost.toLocaleString('en-US')}`, cw / 2, ch / 2 + 40); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex })); m.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2); m.userData.wing = w.id; this.wingSigns.add(m);
    }
  }
  wingAt(x: number, z: number): WingId | null { for (const m of this.wingSigns.children as THREE.Mesh[]) { const b = new THREE.Box3().setFromObject(m); if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) return m.userData.wing as WingId; } return null; }

  private seats(rig: CameraRig, vis: Set<string> | null): void {
    const g = this.game(), cam = rig.cam.position;
    for (const a of AUDS) {
      const st = g.site.auds[a.id - 1]!, built = g.unlocked.has(a.wing) && (!vis || vis.has(`aud${a.id}`));
      const d = Math.hypot(cam.x - a.cx, cam.y, cam.z - (a.rect.z0 + a.rect.z1) / 2);
      const full = d < (this.q.tier === 'low' ? 13 : this.q.tier === 'medium' ? 20 : 34);
      let brk = 0; for (let i = 0; i < st.seatBroken.length; i++) if (st.seatBroken[i]) brk = (brk * 31 + i + 1) | 0;
      const key = built ? `${st.seatTier}|${full}|${brk}` : '-';
      if (this.seatState[a.id] === key) continue;
      this.seatState[a.id] = key;
      const list: Put[] = built ? seatsOf(a.id).map((s) => ({ x: s.x, y: s.y, z: s.z, rot: Math.PI, tilt: st.seatBroken[s.idx] ? 0.16 : 0, color: st.seatBroken[s.idx] ? 0x5a4a44 : 0xffffff })) : [];
      for (const p of ['seat_old', 'seat_std', 'seat_recl', 'seat_lo']) this.place(`aud${a.id}`, p, built && p === (full ? SEAT_TIERS[st.seatTier]!.prop : 'seat_lo') ? list : []);
    }
  }
  private litter(): void {
    const g = this.game(), m4 = new THREE.Matrix4(), n: Record<string, number> = { popcorn: 0, cup: 0, bucket: 0, wrapper: 0 };
    let d = 0; const K = this.decals.geometry.attributes.iK as THREE.InstancedBufferAttribute;
    for (const l of g.site.litter) {
      const y = floorY(l.x, l.z);
      if (l.kind in n) { const i = n[l.kind]!++; if (i >= 330) continue; m4.makeRotationY(l.id * 1.7); const s = 0.6 + 0.5 * clamp(l.size, 0.2, 1); m4.scale(new THREE.Vector3(s, 1, s)); m4.setPosition(l.x, y + 0.005, l.z); const ms = this.litterMeshes.get(l.kind)!; for (const m of ms) m.setMatrixAt(i, m4); const gg = ms[0]!.geometry; this.L.sampleLit(l.x, l.z, gg.getAttribute('iAmb').array as Float32Array, gg.getAttribute('iKey').array as Float32Array, i * 4); }
      else if (d < 120) { const s = (l.kind === 'water' ? 1.5 : l.kind === 'graffiti' ? 1.6 : 0.95) * clamp(l.size, 0.3, 1.6); m4.makeRotationY(l.id * 2.1); m4.scale(new THREE.Vector3(s, 1, s)); m4.setPosition(l.x, y + 0.012, l.z); this.decals.setMatrixAt(d, m4); K.setX(d, l.kind === 'spill' ? 0 : l.kind === 'vomit' ? 1 : l.kind === 'water' ? 2 : 3); d++; }
    }
    for (const [k, ms] of this.litterMeshes) for (const m of ms) { m.count = Math.min(330, n[k]!); m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; m.geometry.getAttribute('iAmb').needsUpdate = true; m.geometry.getAttribute('iKey').needsUpdate = true; }
    this.decals.count = d; this.decals.visible = d > 0; this.decals.instanceMatrix.needsUpdate = true; K.needsUpdate = true;
  }
  private dirt(): void { const d = this.game().site.dirt, a = this.L.dirtTex.image.data as Uint8Array; for (let i = 0; i < a.length; i++) a[i] = Math.min(255, d[i]! * 255); this.L.dirtTex.needsUpdate = true; }
  private paintOverlay(): void {
    const g = this.game(), a = this.L.overlayTex.image.data as Uint8Array; a.fill(0);
    const put = (k: number, r: number, gg: number, b: number, al: number) => { a[k * 4] = r; a[k * 4 + 1] = gg; a[k * 4 + 2] = b; a[k * 4 + 3] = al; };
    if (this.overlay === 'dirt') for (let k = 0; k < NX * NZ; k++) { if (g.nav.blocked[k]) continue; const v = clamp(g.site.dirt[k]! * 1.3, 0, 1); put(k, 60 + 195 * v, 200 - 140 * v, 90 - 50 * v, 150); }
    if (this.overlay === 'crowd' || this.overlay === 'mood') {
      const n = new Float32Array(NX * NZ), h = new Float32Array(NX * NZ), R = 4;
      for (const m of g.s.guests) { const i = Math.floor((m.x + 50) * 2), j = Math.floor((m.z + 32) * 2); for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const x = i + di, z = j + dj; if (x < 0 || z < 0 || x >= NX || z >= NZ) continue; const w = Math.max(0, 1 - Math.hypot(di, dj) / (R + 0.5)); n[z * NX + x]! += w; h[z * NX + x]! += w * m.happy; } }
      for (let k = 0; k < NX * NZ; k++) { if (n[k]! < 0.05) continue; const al = Math.min(190, 50 + n[k]! * 70); if (this.overlay === 'crowd') { const v = clamp(n[k]! / 5, 0, 1); put(k, 255 * v, 190 - 110 * v, 255 - 215 * v, al); } else { const v = clamp((h[k]! / n[k]! - 20) / 65, 0, 1); put(k, 235 - 170 * v, 60 + 150 * v, 60 + 40 * v, al); } }
    }
    this.L.overlayTex.needsUpdate = true;
  }
  showGhost(type: string | null, x = 0, z = 0, rot = 0, good = true): void {
    if (!type) { if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostKey = ''; } return; }
    if (this.ghostKey !== type) { if (this.ghost) this.scene.remove(this.ghost); this.ghost = new THREE.Group(); for (const { geo } of this.assets.propGeometry(itemById(type).prop)) this.ghost.add(new THREE.Mesh(geo, this.ghostMat)); const d = itemById(type); const p = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d).rotateX(-Math.PI / 2), this.ghostMat); p.position.y = 0.03; this.ghost.add(p); this.scene.add(this.ghost); this.ghostKey = type; }
    this.ghost!.position.set(x, 0, z); this.ghost!.rotation.y = (rot * Math.PI) / 2; this.ghostMat.color.setHex(good ? 0x6dff9a : 0xff4a3a);
  }

  // ------------------------------------------------------------------ per frame
  private skyState(min: number): { day: number; top: THREE.Color; hor: THREE.Color; light: [number, number, number] } {
    const h = (min / 60) % 24, w = this.game().s.weather, dull = w === 'clear' || w === 'heat' ? 1 : w === 'cloudy' ? 0.72 : w === 'storm' ? 0.36 : 0.55;
    const rise = clamp((h - 5.6) / 1.6, 0, 1), set = clamp((20.4 - h) / 2.2, 0, 1), day = Math.min(rise, set), dusk = day * (1 - day) * 4;
    const top = new THREE.Color(0.008, 0.012, 0.035).lerp(new THREE.Color(0.16, 0.34, 0.72), day).lerp(new THREE.Color(0.22, 0.24, 0.27), (1 - dull) * day * 0.9);
    const hor = new THREE.Color(0.03, 0.03, 0.06).lerp(new THREE.Color(0.62, 0.74, 0.86), day).lerp(new THREE.Color(0.95, 0.42, 0.16), dusk * 0.72 * dull).lerp(new THREE.Color(0.4, 0.42, 0.45), (1 - dull) * day * 0.7);
    const k = day * dull; return { day, top, hor, light: [k * (1 + dusk * 0.25) + 0.012, k * (0.97 - dusk * 0.2) + 0.016, k * (0.92 - dusk * 0.45) + 0.034] };
  }
  private lights(dt: number, clock: number): void {
    const g = this.game(), st = g.site, T = this.tint.target, s = this.skyState(g.s.minute);
    this.day = s.day;
    const pw = st.power ? 1 : 0, lv = 0.35 + (st.amb.lights / 70) * 0.65, fl = !st.power ? 0 : 1;
    const set = (z: number, gr: number, r: number, gg: number, b: number) => { const k = (z * 3 + gr) * 4; T[k] = r; T[k + 1] = gg; T[k + 2] = b; };
    const night = 1 - s.day;
    ROOMS.forEach((r, z) => {
      const mgr = this.manager ? 1 : 0; let house = lv * pw * 1.25, warm: [number, number, number] = [1, 0.8, 0.57];
      const acc: [number, number, number] = [1, 0.62, 0.36]; let ak = pw;
      let g1: [number, number, number] = [s.light[0] * 1.15, s.light[1] * 1.15, s.light[2] * 1.15];
      if (!st.wings.includes(r.wing)) { house = 0; ak = 0; g1 = [0, 0, 0]; }
      if (r.kind === 'lobby') { house *= st.decor.lobby === 0 ? 1.08 : 1.1; ak = pw * 2.2; acc[0] = 1; acc[1] = 0.42; acc[2] = 0.36; }
      if (r.kind === 'promenade') { house *= 4.2; ak = pw * 3.2; }
      if (r.kind === 'restroom') { warm = [1, 0.93, 0.82]; house *= 0.95; }
      if (r.kind === 'booth') { warm = [0.8, 0.9, 1]; house *= 2.4; ak = pw * 5; acc[0] = 1; acc[1] = 0.25; acc[2] = 0.12; }
      if (r.kind === 'office') house *= 1.9;
      if (r.kind === 'foodcourt') house *= 1.25;
      if (r.kind === 'vip') { house *= 2.6; ak = pw * 2; acc[0] = 1; acc[1] = 0.6; acc[2] = 0.25; }
      if (r.kind === 'arcade') { house *= 0.6; const c = clock * 0.25; ak = pw * 5; acc[0] = 0.6 + 0.4 * Math.sin(c); acc[1] = 0.25 + 0.15 * Math.sin(c * 1.3 + 1); acc[2] = 0.9; }
      if (r.kind === 'street') { house = 0; g1 = [s.light[0] * 0.62, s.light[1] * 0.62, s.light[2] * 0.62]; const fk = [0.5, 0.95, 1.35][st.decor.facade]!; ak = pw * (0.25 + night * 1.6) * fk * 1.5; acc[0] = 1; acc[1] = 0.7; acc[2] = 0.4; }
      if (r.kind === 'auditorium') {
        const id = r.aud!, scr = this.screens[id - 1]!;
        const sc = g.s.screenings.find((q) => q.aud === id && (q.state === 'trailers' || q.state === 'playing' || q.state === 'seating'));
        const dim = !sc || sc.state === 'seating' ? 1 : sc.state === 'trailers' ? 0.22 : sc.fault && sc.faultTime > 4 ? 0.5 : 0.045;
        house = st.wings.includes(r.wing) ? Math.max(4.2 * pw * dim * lv, mgr * 1.5) : 0; warm = [1, 0.72, 0.46];
        g1 = [scr.avg.r * 4.6, scr.avg.g * 4.6, scr.avg.b * 4.6]; ak = st.wings.includes(r.wing) ? 3.6 + (pw ? 0 : 1) : 0; acc[0] = 1; acc[1] = 0.55; acc[2] = 0.22; if (!pw) { acc[1] = 0.1; acc[2] = 0.05; }
      }
      if (!st.power && r.kind !== 'auditorium' && r.kind !== 'street') { ak = 0.9; acc[0] = 1; acc[1] = 0.12; acc[2] = 0.06; }
      house *= fl;
      set(z, 0, warm[0] * house, warm[1] * house, warm[2] * house); set(z, 1, g1[0], g1[1], g1[2]); set(z, 2, acc[0] * ak, acc[1] * ak, acc[2] * ak);
    });
    const k = 1 - Math.exp(-dt * 3.2), kf = 1 - Math.exp(-dt * 14), C = this.tint.cur;
    for (let z = 0; z < ROOMS.length; z++) for (let gr = 0; gr < 3; gr++) { const o = (z * 3 + gr) * 4, q = gr === 1 ? kf : st.power ? k : kf; for (let c = 0; c < 3; c++) C[o + c]! += (T[o + c]! - C[o + c]!) * q; }
    this.L.commit();
    for (const [id, rm] of this.rooms) { if (!rm.lamps.length) continue; const z = zoneOf(id) * 12; const on = id === 'street' ? pw * (0.35 + night * 0.8) : Math.min(1.25, (C[z]! + C[z + 8]! * 0.15) / 1.2 * (id.startsWith('aud') ? 0.55 : 0.85)); for (const l of rm.lamps) { const f = l.name === 'step_led' ? 0.42 : l.name.startsWith('neon') ? pw : Math.max(0.015, on); if (l.pbr) (l.mesh.material as THREE.MeshStandardMaterial).emissive.copy(l.base).multiplyScalar(f); else (l.mesh.material as THREE.MeshBasicMaterial).color.copy(l.base).multiplyScalar(Math.max(0.04, f)); } }
    const sm = this.sky.material as THREE.ShaderMaterial; (sm.uniforms.uTop!.value as THREE.Color).copy(s.top); (sm.uniforms.uHor!.value as THREE.Color).copy(s.hor); sm.uniforms.uStar!.value = night > 0.6 ? (night - 0.6) * 2.5 : 0;
    const c = 0.1 + s.day * 0.75; this.cityMat.color.setRGB(c * (0.7 + s.light[0] * 0.4), c * (0.7 + s.light[1] * 0.4), c * (0.75 + s.light[2] * 0.4)); this.cityEm.opacity = 0.9 * clamp(night * 1.4, 0, 1);
    this.bulbU.value = clock; this.bulbOn.value = pw * [0.55, 0.97, 1][st.decor.facade]!;
    this.decalMat.color.setScalar(0.35 + 0.65 * Math.min(1, C[zoneOf('lobby') * 12]!));
  }
  screenState(aud: number): ScreenState {
    const g = this.game(), a = g.site.auds[aud - 1]!, sc = g.s.screenings.find((q) => q.aud === aud && (q.state === 'trailers' || q.state === 'playing' || q.state === 'seating'));
    const film = sc ? g.film(sc.filmId) : null;
    const gain = (0.5 + a.projTier * 0.24) * (0.7 + a.screenTier * 0.17) * (a.lampHours > PROJ_TIERS[a.projTier]!.lampLife * 0.8 ? 0.7 : 1);
    const f = a.fault; const fault = !g.site.power ? 4 : f === 'jam' ? 1 : f === 'lamp' ? 2 : 0;
    return { mode: !a.built ? 0 : !sc ? 0 : sc.state === 'seating' ? 1 : sc.state === 'trailers' ? 2 : 3, film, blur: f === 'focus' ? 0.03 : Math.max(0, (62 - a.focus) / 62) * 0.012, gain: gain * 1.25, grain: a.projTier === 0 ? 1 : a.projTier === 1 ? 0.25 : 0.05, fault: sc && sc.state !== 'seating' ? fault : fault === 4 ? 4 : 0 };
  }
  update(dt: number, clock: number, rig: CameraRig): Set<string> | null {
    const g = this.game(); this.manager = rig.mode === 'manager';
    this.L.uniforms.uTime!.value = clock; this.L.uniforms.uClipY!.value = rig.clip;
    this.screens.forEach((s, i) => { const st = this.screenState(i + 1); s.update(st, clock + i * 7); const b = this.beams[i]!, m = b.material as THREE.ShaderMaterial; const on = st.mode >= 2 && st.fault !== 2 && st.fault !== 4; b.visible = on && rig.mode === 'walk'; (m.uniforms.uC!.value as THREE.Color).copy(s.avg).addScalar(0.12); m.uniforms.uT!.value = clock; });
    this.lights(dt, clock);
    const u = g.unlocked;
    let vis: Set<string> | null = null;
    const here = roomAt(rig.cam.position.x, rig.cam.position.z)?.id ?? 'street';
    if (rig.mode === 'walk') { vis = visibleFrom(here); if (!this.q.pbr) { if (here === 'lobby' || here === 'street') { vis.delete('aud1'); vis.delete('aud2'); vis.delete('office'); } if (here === 'promenade') for (const a of AUDS) if (Math.abs(a.cx - rig.cam.position.x) > 11) { vis.delete(`aud${a.id}`); vis.delete(`booth${a.id}`); } } }
    for (const r of ROOMS) { const v = u.has(r.wing) && (!vis || vis.has(r.id)); const a = this.rooms.get(r.id); if (a) { a.group.visible = v; if (v && vis) { const o = r.id === here ? 0 : r.kind === 'street' && here !== 'street' ? 3 : 1; if (a.group.userData.o !== o) { a.group.userData.o = o; for (const m of a.meshes) m.renderOrder = o; } } } this.roomProps.get(r.id)!.visible = v; }
    const out = !vis || vis.has('street'); this.road.visible = out; this.sky.visible = out;
    this.caps.visible = rig.clip < 20; this.caps.position.y = rig.clip - 0.005; this.wingSigns.visible = rig.mode === 'manager'; this.bulbs.visible = rig.clip > 20; this.blade.visible = rig.clip > 20;
    this.seats(rig, vis);
    if ((this.dirtT -= dt) <= 0) { this.dirtT = 0.35; this.dirt(); this.litter(); if (!this.q.pbr) for (const [k, p] of this.pools) if (p.list.length && this.roomProps.get(k.slice(0, k.indexOf('|')))?.visible !== false) this.litPool(p); }
    const want = this.overlay === 'none' ? 0 : 0.85; this.L.uniforms.uOverlayK!.value += (want - (this.L.uniforms.uOverlayK!.value as number)) * Math.min(1, dt * 8);
    if (this.overlay !== 'none' && (this.overlayT -= dt) <= 0) { this.overlayT = 0.4; this.paintOverlay(); }
    for (const c of this.cars) { c.x += c.v * dt; if (c.x > 60) c.x = -60; if (c.x < -60) c.x = 60; c.m.position.x = c.x; c.m.visible = out; }
    const w = g.s.weather; this.rain.visible = out && (w === 'rain' || w === 'storm'); this.snow.visible = out && w === 'snow'; (this.rain.material as THREE.ShaderMaterial).uniforms.uT!.value = clock; (this.snow.material as THREE.ShaderMaterial).uniforms.uT!.value = clock;
    this.L.uniforms.uWet!.value += ((w === 'rain' || w === 'storm' ? 0.8 : 0) - (this.L.uniforms.uWet!.value as number)) * Math.min(1, dt);
    return vis;
  }
}
void centerX; void centerZ; void equipById; void LAMP_NAMES; void clipOnly;
