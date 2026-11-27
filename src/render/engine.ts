import * as THREE from 'three';
import type { Game } from '../sim/game';
import { ANIM, CARRY } from '../sim/anims';
import { ROLES, itemById } from '../sim/data/catalog';
import { STATIONS, audById, floorY, roomAt, type WingId } from '../sim/plan';
import { clamp } from '../sim/rng';
import type { Guest, Job, Staff } from '../sim/types';
import { cleanAround, workJob } from '../sim/maintenance';
import { PlayerPhysics, initPhysics } from '../physics/player';
import { Assets } from './assets';
import { CameraRig } from './cameras';
import { Crowd, type Actor } from './crowd';
import { Emotes, THOUGHT_ICON, iconIndex, type Emote } from './emotes';
import { TIERS, detectTier, gpuName, type Quality, type Tier } from './quality';
import { World } from './world';
import { Post } from './post';
import { LayerCache, dynamic } from './layercache';

export type Selection = { kind: 'guest' | 'staff' | 'item' | 'aud' | 'wing' | 'job'; id: number | string } | null;
export interface Prompt { key: string; text: string; progress: number; kind: string }

const TOPS = [0x8a2b2b, 0x2f4a6b, 0x3c5a3a, 0xc9b48a, 0x1f1f24, 0x7d5a8a, 0xb5602f, 0x4f7f86, 0xd8d2c4, 0x6e1f3f, 0x35506e, 0x9a8a3a, 0x283a2c, 0xa64a5e, 0x57493c, 0xe0b04a, 0x2d6b62, 0x44415f];
const BOTTOMS = [0x2a3550, 0x33415e, 0x1c1d22, 0x4a4034, 0x6a5c48, 0x24303a, 0x3b2f3a, 0x555a60];
const HAIR = [0x1a1210, 0x2c1c14, 0x4a2f1c, 0x7a5230, 0xb98a4a, 0x151417, 0x5e2a18, 0x8c8a88];
const SHOES = [0x2a1d16, 0x1a1a1e, 0x6b6b70, 0x7a3a2a, 0x3a4250, 0x4a3a2a];
const hex = (s: string) => parseInt(s.slice(1), 16);
const shade = (c: number, f: number) => { const r = clamp(((c >> 16) & 255) * f, 0, 255), g = clamp(((c >> 8) & 255) * f, 0, 255), b = clamp((c & 255) * f, 0, 255); return (r << 16) | (g << 8) | b; };

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig = new CameraRig();
  readonly assets = new Assets();
  q!: Quality; world!: World; crowd!: Crowd; emotes!: Emotes; phys!: PlayerPhysics; post: Post | null = null;
  gpu = ''; fps = 0; frameMs = 0; dpr = 1; private frames = 0; private fpsT = 0; private adaptT = 0;
  clock = 0; paused = true; menuMode = true;
  player = { x: 0, y: 0, z: 14, dir: Math.PI, px: 0, pz: 0, speed: 0, anim: 0 as number, carry: 0 };
  private input = { fwd: 0, right: 0, run: false, use: false, usePressed: false };
  keys = new Set<string>();
  selection: Selection = null; hover: Selection = null; prompt: Prompt | null = null;
  build: { type: string; rot: 0 | 1 | 2 | 3; move: number; x: number; z: number; ok: boolean; msg: string } | null = null;
  showMoods = false;
  private bubbles = new Map<number, { icon: number; t: number }>();
  private drag: { x: number; y: number; b: number; moved: number } | null = null;
  private mouse = { x: 0, y: 0, in: false };
  private unsub: (() => void) | null = null; private passers: Actor[] = []; private passV: number[] = []; private lastLayout = 0;
  private cache: LayerCache | null = null;
  private raf = 0; private last = 0; private ray = new THREE.Raycaster(); private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  cb: { select?: (s: Selection) => void; prompt?: (p: Prompt | null) => void; mode?: (m: string) => void; place?: (r: { ok: boolean; msg: string }) => void; minigame?: (job: Job) => void; toast?: (t: string, bad?: boolean) => void; key?: (k: string) => boolean; frame?: (dt: number) => void; sound?: (id: string, x?: number, z?: number) => void; lock?: (on: boolean) => void } = {};

  constructor(readonly canvas: HTMLCanvasElement, private getGame: () => Game) {
    const pref = localStorage.getItem('pp.quality') as Tier | 'auto' | null;
    const url = new URLSearchParams(location.search).get('quality') as Tier | null;
    const probe = document.createElement('canvas').getContext('webgl2');
    const auto: Tier = probe ? detectTier(probe) : 'low';
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    const tier = url && TIERS[url] ? url : pref && pref !== 'auto' && TIERS[pref] ? pref : auto;
    const ctx = canvas.getContext('webgl2', { alpha: false, antialias: tier === 'medium', depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: ctx ?? undefined, antialias: tier === 'medium', stencil: false });
    this.gpu = gpuName(this.renderer.getContext() as WebGL2RenderingContext);
    this.q = { ...TIERS[tier] };
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.dpr = Math.min(this.q.dpr, window.devicePixelRatio || 1) * (tier === 'low' ? 0.8 : 1);
    this.assets.aniso = this.q.aniso;
  }
  async init(onProgress: (f: number, what: string) => void): Promise<void> {
    this.assets.onProgress = onProgress;
    await Promise.all([initPhysics(), this.assets.load(!this.q.pbr, this.q.normals), document.fonts?.load?.('40px "League Gothic"'), document.fonts?.load?.('40px "Yellowtail"'), document.fonts?.load?.('600 20px "Barlow Condensed"')]);
    const env = this.q.env ? this.makeEnv() : null;
    this.world = new World(this.assets, this.getGame, this.q, env);
    this.crowd = new Crowd(this.assets, this.world.L, this.world.mats, this.q);
    this.world.scene.add(this.crowd.group);
    this.emotes = new Emotes(); this.world.scene.add(this.emotes.mesh);
    this.phys = new PlayerPhysics();
    if (!this.q.pbr) { this.cache = new LayerCache(this.renderer); dynamic(this.crowd.group); dynamic(this.emotes.mesh); for (const sc of this.world.screens) dynamic(sc.mesh); }
    if (this.q.post) this.post = new Post(this.renderer, this.world.scene, this.rig.cam, this.q);
    this.makePassers();
    this.bindGame(); this.bindInput(); this.resize();
    this.renderer.compile(this.world.scene, this.rig.cam);
  }
  private makeEnv(): THREE.Texture {
    const s = new THREE.Scene(); const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); s.add(m); };
    box(30, 6, 18, 0, 2, 0, new THREE.Color(0.16, 0.075, 0.05)); box(29.9, 0.1, 17.9, 0, -0.9, 0, new THREE.Color(0.2, 0.12, 0.08)); box(29.9, 0.1, 17.9, 0, 4.9, 0, new THREE.Color(0.55, 0.42, 0.28)); box(4, 0.6, 4, 0, 4.2, 0, new THREE.Color(6, 4.4, 2.6));
    for (let i = -2; i <= 2; i++) { box(0.6, 0.1, 0.6, i * 5, 4.8, -5, new THREE.Color(9, 7, 4.4)); box(0.6, 0.1, 0.6, i * 5, 4.8, 5, new THREE.Color(9, 7, 4.4)); box(1.6, 3.2, 0.1, i * 5, 2, 8.8, new THREE.Color(1.4, 1.7, 2.1)); }
    const p = new THREE.PMREMGenerator(this.renderer); const t = p.fromScene(s, 0.02).texture; p.dispose(); return t;
  }
  /** Call after loading or starting a different game. */
  bindGame(): void {
    this.unsub?.();
    const g = this.getGame();
    this.unsub = g.on((e) => {
      if (e.type === 'thought') { const ic = THOUGHT_ICON[e.code]; if (ic && this.bubbles.size < 60) this.bubbles.set(e.guest, { icon: iconIndex(ic), t: 3.2 }); }
      else if (e.type === 'layout') this.lastLayout = -1;
      else if (e.type === 'sound') this.cb.sound?.(e.id, e.x, e.z);
    });
    this.lastLayout = -1; this.looks.clear(); this.bubbles.clear(); this.selection = null; this.rig.follow = null;
    this.rebuildPhysics(); this.phys.teleport(0, 14.5);
    this.player.dir = Math.PI; this.rig.wyaw = Math.PI;
    this.world.refresh(true);
  }
  rebuildPhysics(): void { const g = this.getGame(); this.phys.rebuild(g.unlocked, g.site.items.map((i) => ({ ...g.footprint(i), h: Math.max(0.5, itemById(i.type).h) }))); }
  start(): void { this.last = performance.now(); const loop = (t: number) => { this.raf = requestAnimationFrame(loop); this.frame(Math.min(0.12, (t - this.last) / 1000)); this.last = t; }; this.raf = requestAnimationFrame(loop); }
  stop(): void { cancelAnimationFrame(this.raf); }
  resize(): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false); this.rig.cam.aspect = w / h; this.rig.cam.updateProjectionMatrix(); this.post?.setSize(w, h);
  }
  setMode(m: 'manager' | 'walk'): void {
    if (this.rig.mode === m) return;
    this.rig.mode = m;
    const g = this.getGame();
    if (m === 'walk') { g.player.active = true; this.cancelBuild(); } else { g.player.active = false; g.s.flags.playerStation = 0; document.exitPointerLock?.(); this.rig.focus(this.player.x, this.player.z, 17); this.setPrompt(null); }
    this.cb.mode?.(m);
  }

  // ------------------------------------------------------------------ input
  private bindInput(): void {
    const c = this.canvas;
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'tab' || k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (this.cb.key?.(k)) return;
      if (!e.repeat) { if (k === 'e') this.input.usePressed = true; if (k === 'r' && this.build) this.build.rot = ((this.build.rot + 1) % 4) as 0; if (k === 'v' && this.rig.mode === 'walk') this.rig.first = !this.rig.first; }
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0 }; c.setPointerCapture?.(e.pointerId); (document.activeElement as HTMLElement | null)?.blur?.(); });
    c.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.in = true;
      if (document.pointerLockElement === c) { this.rig.look(e.movementX, e.movementY); return; }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.menuMode) return;
      if (this.rig.mode === 'walk') this.rig.look(dx, dy);
      else if (this.drag.b === 0 && !this.build) this.rig.pan(dx, dy); else if (this.drag.b !== 0) this.rig.orbit(dx, dy);
    });
    c.addEventListener('pointerup', (e) => { const d = this.drag; this.drag = null; if (!d || d.moved > 6 || this.menuMode) { return; } if (this.rig.mode === 'walk') { if (d.b === 2) { try { void c.requestPointerLock?.(); } catch { /* unsupported */ } } else this.click(e.clientX, e.clientY); } else if (d.b === 0) this.click(e.clientX, e.clientY); else if (d.b === 2) this.cancelBuild(); });
    c.addEventListener('pointerleave', () => { this.mouse.in = false; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); if (this.menuMode) return; if (this.rig.mode === 'manager') this.rig.zoom(e.deltaY > 0 ? 1.1 : 0.91); else this.rig.first = e.deltaY < 0; }, { passive: false });
    document.addEventListener('pointerlockchange', () => this.cb.lock?.(document.pointerLockElement === c));
  }
  private ndc(x: number, y: number): THREE.Vector2 { const r = this.canvas.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
  groundAt(x: number, y: number): { x: number; z: number } | null { this.ray.setFromCamera(this.ndc(x, y), this.rig.cam); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? { x: p.x, z: p.z } : null; }
  /** Screen position of a world point, for interface anchors and tests. */
  project(x: number, y: number, z: number): { x: number; y: number; front: boolean } { const v = new THREE.Vector3(x, y, z).project(this.rig.cam), r = this.canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, front: v.z < 1 }; }
  pick(x: number, y: number): Selection {
    const g = this.getGame();
    let best: Selection = null, bd = 30;
    const test = (kind: 'guest' | 'staff', id: number, px: number, py: number, pz: number) => { const p = this.project(px, py + 0.9, pz); if (!p.front) return; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { kind, id }; } };
    const vis = this.rig.mode === 'walk' ? 14 : 999;
    for (const m of g.s.guests) if (Math.hypot(m.x - this.rig.cam.position.x, m.z - this.rig.cam.position.z) < vis) test('guest', m.id, m.x, m.y, m.z);
    for (const s of g.site.staff) if (s.state !== 'off') test('staff', s.id, s.x, s.y, s.z);
    if (best) return best;
    const p = this.groundAt(x, y);
    if (!p) return null;
    for (const it of g.site.items) { const f = g.footprint(it); if (p.x > f.x0 - 0.15 && p.x < f.x1 + 0.15 && p.z > f.z0 - 0.15 && p.z < f.z1 + 0.25) return { kind: 'item', id: it.id }; }
    if (this.rig.mode === 'manager') { const w = this.world.wingAt(p.x, p.z); if (w) return { kind: 'wing', id: w as WingId }; }
    const r = roomAt(p.x, p.z);
    if (r?.aud && g.unlocked.has(r.wing)) return { kind: 'aud', id: r.aud };
    return null;
  }
  private click(x: number, y: number): void {
    const g = this.getGame();
    if (this.build) {
      this.updateBuild();
      const b = this.build;
      const r = b.move ? g.moveItem(b.move, b.x, b.z, b.rot) : g.placeItem(b.type, b.x, b.z, b.rot);
      this.cb.place?.(r);
      if (r.ok && (b.move || !this.keys.has('shift'))) this.cancelBuild();
      return;
    }
    this.selection = this.pick(x, y); this.cb.select?.(this.selection);
  }
  startBuild(type: string, move = 0, rot: 0 | 1 | 2 | 3 = 0): void { this.setMode('manager'); this.build = { type, rot, move, x: this.rig.target.x, z: this.rig.target.z, ok: false, msg: '' }; }
  cancelBuild(): void { if (this.build) { this.build = null; this.world?.showGhost(null); this.cb.place?.({ ok: true, msg: '' }); } }
  private updateBuild(): void {
    const b = this.build; if (!b) return;
    const p = this.groundAt(this.mouse.x, this.mouse.y);
    if (p && this.mouse.in) { const g = this.getGame(), s = g.snap(b.type, p.x, p.z, b.rot); if (s.x !== b.x || s.z !== b.z || this.ghostRot !== b.rot) { b.x = s.x; b.z = s.z; this.ghostRot = b.rot; const c = g.canPlace(b.type, s.x, s.z, b.rot, b.move); b.ok = c.ok; b.msg = c.msg; } }
    this.world.showGhost(b.type, b.x, b.z, b.rot, b.ok);
  }
  private ghostRot = -1;

  // ------------------------------------------------------------------ the player in the building
  private setPrompt(p: Prompt | null): void { const a = this.prompt, same = (!a && !p) || (a && p && a.text === p.text && Math.abs(a.progress - p.progress) < 0.02); this.prompt = p; if (!same) this.cb.prompt?.(p); }
  walkInput(fwd: number, right: number, run = false): void { this.input.fwd = fwd; this.input.right = right; this.input.run = run; }
  pressUse(on: boolean): void { this.input.use = on; if (on) this.input.usePressed = true; }
  private stepPlayer(dt: number): void {
    const g = this.getGame(), k = this.keys;
    const f = clamp((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.input.fwd, -1, 1), r = clamp((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.input.right, -1, 1);
    const l = Math.hypot(f, r), run = k.has('shift') || this.input.run;
    const sy = Math.sin(this.rig.wyaw), cy = Math.cos(this.rig.wyaw);
    let vx = 0, vz = 0;
    const sp = l > 0.05 ? (run ? 4.6 : 2.5) : 0;
    if (l > 0.05) { vx = ((sy * f - cy * r) / Math.max(1, l)) * sp; vz = ((cy * f + sy * r) / Math.max(1, l)) * sp; }
    const P = this.player; P.px = P.x; P.pz = P.z;
    const q = this.phys.move(vx, vz, dt);
    const moved = Math.hypot(q.x - P.x, q.z - P.z) / Math.max(dt, 1e-4);
    P.x = q.x; P.y += (floorY(q.x, q.z) - P.y) * Math.min(1, dt * 12); P.z = q.z; P.speed += (moved - P.speed) * Math.min(1, dt * 12);
    if (l > 0.05) { let d = Math.atan2(vx, vz) - P.dir; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.dir += d * Math.min(1, dt * 11); g.s.flags.playerStation = 0; }
    g.player.x = P.x; g.player.y = P.y; g.player.z = P.z;
    P.anim = P.speed > 3.2 ? ANIM.run : P.speed > 0.35 ? ANIM.walk : ANIM.idle; P.carry = 0;
    this.interact(dt);
  }
  /** What the player could do right here. */
  target(): { kind: 'job' | 'sweep' | 'station' | 'unstation' | 'greet' | 'staff' | 'desk'; text: string; job?: Job; id?: number | string } | null {
    const g = this.getGame(), P = this.player;
    const ps = g.s.flags.playerStation ?? 0;
    if (ps) return { kind: 'unstation', text: 'Leave the counter' };
    let best: Job | null = null, bd = 1.9;
    for (const j of g.site.jobs) { const d = Math.hypot(j.x - P.x, j.z - P.z) - (j.kind === 'audClean' || j.kind === 'fixtureClean' ? 3 : 0) - j.severity * 0.05; if (d < bd && roomAt(j.x, j.z)?.id === roomAt(P.x, P.z)?.id) { bd = d; best = j; } }
    if (best) return { kind: 'job', text: best.title, job: best };
    for (const s of STATIONS) { if (!g.unlocked.has(s.wing) || s.kind === 'usher') continue; if (Math.hypot(s.sx - P.x, s.sz - P.z) < 0.95 && !g.site.staff.some((x) => x.station === s.id && x.state === 'station')) return { kind: 'station', text: s.kind === 'box' ? 'Sell tickets here' : 'Serve at this till', id: s.id }; }
    const i = Math.floor((P.x + 50) * 2), j = Math.floor((P.z + 32) * 2); let dirt = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) dirt = Math.max(dirt, g.site.dirt[(j + b) * 192 + i + a] ?? 0);
    const lit = g.site.litter.some((l) => Math.hypot(l.x - P.x, l.z - P.z) < 1.25);
    if (lit || dirt > 0.34) return { kind: 'sweep', text: lit ? 'Clean up this mess' : 'Sweep the floor' };
    const fx = Math.sin(P.dir), fz = Math.cos(P.dir);
    let gb: Guest | null = null, gd = 1.8; for (const m of g.s.guests) { const dx = m.x - P.x, dz = m.z - P.z, d = Math.hypot(dx, dz); if (d < gd && (dx * fx + dz * fz) / d > 0.45 && m.state !== 'seated' && m.state !== 'fixture') { gd = d; gb = m; } }
    if (gb) return { kind: 'greet', text: `Greet ${gb.name.split(' ')[0]}`, id: gb.id };
    let sb: Staff | null = null; gd = 1.6; for (const m of g.site.staff) { const dx = m.x - P.x, dz = m.z - P.z, d = Math.hypot(dx, dz); if (m.state !== 'off' && d < gd && (dx * fx + dz * fz) / d > 0.4) { gd = d; sb = m; } }
    if (sb) return { kind: 'staff', text: `Praise ${sb.name.split(' ')[0]}`, id: sb.id };
    return null;
  }
  private interact(dt: number): void {
    const g = this.getGame(), t = this.target(), P = this.player;
    const use = this.keys.has('e') || this.input.use, pressed = this.input.usePressed; this.input.usePressed = false;
    if (!t) { this.setPrompt(null); return; }
    let progress = 0;
    if (t.kind === 'job' && t.job) {
      const j = t.job; progress = j.progress / j.need;
      if (pressed && j.kind === 'projector' && this.cb.minigame) { this.cb.minigame(j); }
      else if (use && j.kind !== 'projector') {
        j.player = true;
        P.anim = ['audClean', 'fixtureClean', 'leak', 'graffiti', 'spill', 'litter'].includes(j.kind) ? ANIM.mop : ['seat', 'toilet', 'item', 'faint', 'lostitem'].includes(j.kind) ? ANIM.repair : ['pirate', 'rowdy', 'heckler', 'lostchild'].includes(j.kind) ? ANIM.talk : ANIM.use;
        P.carry = P.anim === ANIM.mop ? CARRY.mop : P.anim === ANIM.repair ? CARRY.wrench : 0;
        let d = Math.atan2(j.x - P.x, j.z - P.z) - P.dir; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.hypot(j.x - P.x, j.z - P.z) > 0.3) P.dir += d * Math.min(1, dt * 8);
        if (workJob(g, j, dt * 1.9 * Math.max(1, g.s.speed), null)) { this.cb.toast?.('Done.'); this.cb.sound?.('done'); }
        else progress = j.progress / j.need;
      } else j.player = false;
    } else if (t.kind === 'sweep') { if (use) { P.anim = ANIM.mop; P.carry = CARRY.mop; cleanAround(g, P.x + Math.sin(P.dir) * 0.4, P.z + Math.cos(P.dir) * 0.4, 1.5, dt * 1.5 * Math.max(1, g.s.speed), true); } }
    else if (pressed) {
      if (t.kind === 'station') { g.s.flags.playerStation = STATIONS.findIndex((s) => s.id === t.id) + 1; const s = STATIONS.find((x) => x.id === t.id)!; this.player.dir = Math.atan2(s.x - s.sx, s.z - s.sz); this.cb.toast?.('You’re on the till. Walk away to stop.'); }
      else if (t.kind === 'unstation') g.s.flags.playerStation = 0;
      else if (t.kind === 'greet') { const r = g.greet(t.id as number); P.anim = ANIM.wave; this.cb.toast?.(r.msg, !r.ok); }
      else if (t.kind === 'staff') { const r = g.praise(t.id as number); this.cb.toast?.(r.msg, !r.ok); }
    }
    if (t.kind === 'unstation') P.anim = ANIM.serve;
    this.setPrompt({ key: 'E', text: t.text, progress, kind: t.kind });
  }

  // ------------------------------------------------------------------ actors
  private makePassers(): void { for (let i = 0; i < 9; i++) { const model = [0, 6, 2, 7, 4, 9, 3, 8, 5][i]!; this.passers.push(this.dress({ key: -100 - i, model, tint: i * 7919, x: -30 + i * 7, y: 0, z: 19.6 + (i % 5) * 0.65, dir: i % 2 ? Math.PI / 2 : -Math.PI / 2, anim: ANIM.walk, carry: 0, speed: 1.3 })); this.passV.push((i % 2 ? 1 : -1) * (1.1 + (i % 3) * 0.2)); } }
  private dress(o: { key: number; model: number; tint: number; x: number; y: number; z: number; dir: number; anim: number; carry: number; speed: number }): Actor {
    const t = Math.abs(o.tint), ch = this.assets.chars.chars[o.model]!;
    return { ...o, top: TOPS[t % TOPS.length]!, bottom: BOTTOMS[(t >> 3) % BOTTOMS.length]!, hair: ch.old ? [0xc8c4be, 0xdedad4, 0xa8a29a][t % 3]! : /african/.test('') ? 0x151110 : HAIR[(t >> 5) % (ch.skin < '#a' ? 3 : HAIR.length)]!, skin: shade(hex(ch.skin), 0.92 + ((t >> 7) % 16) / 100), shoes: SHOES[(t >> 9) % SHOES.length]!, scale: 0.97 + ((t >> 4) % 7) / 100, phase: (t % 97) * 0.11 };
  }
  private looks = new Map<number, Actor>();
  private actors(alpha: number, dt: number): Actor[] {
    const g = this.getGame(), out: Actor[] = [];
    const lp = (a: number, b: number) => a + (b - a) * alpha;
    for (const m of g.s.guests) {
      let a = this.looks.get(m.id);
      if (!a) { a = this.dress({ key: m.id, model: m.model, tint: m.tint, x: 0, y: 0, z: 0, dir: 0, anim: 0, carry: 0, speed: 0 }); this.looks.set(m.id, a); }
      const d = Math.hypot(m.x - m.px, m.z - m.pz); const far = d > 2;
      a.x = far ? m.x : lp(m.px, m.x); a.z = far ? m.z : lp(m.pz, m.z); a.y = far ? m.y : lp(m.py, m.y); a.dir = m.dir; a.anim = m.anim; a.carry = (m.carry & 3) | (m.anim === ANIM.phone ? CARRY.phone : 0); a.speed = m.speed; a.highlight = this.selection?.kind === 'guest' && this.selection.id === m.id ? 1 : 0;
      out.push(a);
    }
    for (const s of g.site.staff) {
      if (s.state === 'off') continue;
      let a = this.looks.get(s.id);
      if (!a) { a = this.dress({ key: s.id, model: s.model, tint: s.tint, x: 0, y: 0, z: 0, dir: 0, anim: 0, carry: 0, speed: 0 }); a.top = ROLES[s.role].tint; a.bottom = 0x17171b; a.shoes = 0x141416; this.looks.set(s.id, a); }
      a.x = lp(s.px, s.x); a.z = lp(s.pz, s.z); a.y = lp(s.py, s.y); a.dir = s.dir; a.anim = s.anim; a.carry = s.carry; a.speed = 1.5; a.highlight = this.selection?.kind === 'staff' && this.selection.id === s.id ? 1 : 0;
      out.push(a);
    }
    if (this.rig.mode === 'walk' ? !this.rig.first || false : !this.menuMode) {
      let a = this.looks.get(-1);
      const model = g.s.avatar === 'mgr_f' ? 19 : 18;
      if (!a || a.model !== model) { a = this.dress({ key: -1, model, tint: 5, x: 0, y: 0, z: 0, dir: 0, anim: 0, carry: 0, speed: 0 }); a.top = 0x23262e; a.bottom = 0x1a1c22; a.hair = 0x2c1c14; a.shoes = 0x1a1310; a.scale = 1; this.looks.set(-1, a); }
      const P = this.player; a.x = P.x; a.y = P.y; a.z = P.z; a.dir = P.dir; a.anim = P.anim; a.carry = P.carry; a.speed = Math.max(0.8, P.speed); out.push(a);
    }
    this.passers.forEach((p, i) => { p.x += this.passV[i]! * dt; if (p.x > 44) p.x = -44; if (p.x < -44) p.x = 44; p.dir = this.passV[i]! > 0 ? Math.PI / 2 : -Math.PI / 2; p.speed = Math.abs(this.passV[i]!); out.push(p); });
    if (this.looks.size > 900) for (const [k] of this.looks) if (k > 0 && !g.guests.has(k) && !g.site.staff.some((s) => s.id === k)) this.looks.delete(k);
    return out;
  }
  private emoteList(dt: number, vis: Set<string> | null): Emote[] {
    const g = this.getGame(), out: Emote[] = [];
    for (const [id, b] of this.bubbles) { b.t -= dt; const m = g.guests.get(id); if (b.t <= 0 || !m) { this.bubbles.delete(id); continue; } if (vis && !vis.has(roomAt(m.x, m.z)?.id ?? '')) continue; out.push({ x: m.x, y: m.y + this.crowd.headHeight(m.model, m.anim) + 0.32 + Math.min(0.12, (3.2 - b.t) * 0.2), z: m.z, icon: b.icon, size: 0.4, alpha: Math.min(1, b.t * 2) }); }
    if (this.showMoods) for (const m of g.s.guests) { if (this.bubbles.has(m.id) || (vis && !vis.has(roomAt(m.x, m.z)?.id ?? ''))) continue; const e = m.emotion; const ic = e === 'content' ? 'happy' : e === 'moved' ? 'sad' : e; out.push({ x: m.x, y: m.y + this.crowd.headHeight(m.model, m.anim) + 0.26, z: m.z, icon: iconIndex(ic), size: 0.28, alpha: 0.95 }); }
    const pulse = 0.5 + 0.08 * Math.sin(this.clock * 5);
    for (const j of g.site.jobs) { if (j.severity < 2 && j.kind !== 'seat') continue; if (j.kind === 'seat' && this.rig.mode !== 'walk') continue; if (vis && !vis.has(roomAt(j.x, j.z)?.id ?? '')) continue; const ic = j.kind === 'fire' ? 'fire' : j.role === 'janitor' ? 'mop' : j.role === 'tech' ? 'wrench' : 'alert'; out.push({ x: j.x, y: floorY(j.x, j.z) + (j.kind === 'seat' ? 1.25 : 2.15), z: j.z, icon: iconIndex(ic), size: j.severity >= 3 ? pulse : 0.36, alpha: j.assignee || j.player ? 0.6 : 1 }); }
    return out;
  }

  // ------------------------------------------------------------------ frame
  frame(dt: number): void {
    const t0 = performance.now();
    const g = this.getGame();
    this.cb.frame?.(dt);
    if (!this.paused) { g.advance(dt); this.clock += dt * g.s.speed; } else this.clock += dt * (this.menuMode ? 1 : 0);
    if (this.lastLayout < 0) { this.lastLayout = 1; this.rebuildPhysics(); this.world.refresh(); }
    if ((this.signT -= dt) <= 0) { this.signT = 2; this.world.updateSigns(); }
    if (this.rig.mode === 'walk' && !this.menuMode) this.stepPlayer(dt);
    else if (!this.menuMode) {
      const k = this.keys, s = 460 * dt;
      if (!k.has('control') && !k.has('meta')) { const dx = (k.has('a') || k.has('arrowleft') ? s : 0) - (k.has('d') || k.has('arrowright') ? s : 0), dy = (k.has('w') || k.has('arrowup') ? s : 0) - (k.has('s') || k.has('arrowdown') ? s : 0); if (dx || dy) this.rig.pan(dx, dy); if (k.has('q')) this.rig.orbit(-260 * dt, 0); if (k.has('e') && !this.build) this.rig.orbit(260 * dt, 0); }
      const P = this.player; P.anim = ANIM.idle; P.speed = 0; this.input.usePressed = false;
      this.updateBuild();
    }
    const height = g.s.avatar === 'mgr_f' ? 1.6 : 1.62;
    if (this.menuMode) this.menuCam(); else this.rig.update(dt, this.player, this.phys, height);
    const vis = this.world.update(dt, this.clock, this.rig);
    const ex = this.rig.mode === 'walk' && vis ? this.exposureFor(roomAt(this.rig.cam.position.x, this.rig.cam.position.z)?.id ?? 'street') : 1.1;
    this.renderer.toneMappingExposure += (ex - this.renderer.toneMappingExposure) * Math.min(1, dt * 2.5); this.post?.setExposure(this.renderer.toneMappingExposure); this.world.mats.lowm.ex.value = this.renderer.toneMappingExposure;
    const cam = this.rig.cam; cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)), sp = new THREE.Sphere(new THREE.Vector3(), 1.2);
    this.crowd.render(this.actors(this.paused ? 1 : g.alpha, this.paused && !this.menuMode ? 0 : dt), cam, this.clock, this.paused && !this.menuMode ? 0 : dt * Math.max(1, g.s.speed * 0.75), (a) => { sp.center.set(a.x, a.y + 0.9, a.z); if (!fr.intersectsSphere(sp)) return false; return !vis || vis.has(roomAt(a.x, a.z)?.id ?? 'street'); });
    this.emotes.set(this.menuMode ? [] : this.emoteList(dt, vis));
    if (this.post) this.post.render(dt);
    else if (this.cache && this.rig.mode === 'manager' && !this.menuMode) this.cache.render(this.world.scene, cam, dt, this.build ? 0 : 0.9);
    else { this.cache && (this.cache.dirty = true); cam.layers.enableAll(); this.renderer.render(this.world.scene, cam); }
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
    this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; }
    // adaptive resolution
    if ((this.adaptT += dt) > 1.6) { this.adaptT = 0; const want = this.fps < 22 ? this.dpr * 0.9 : this.fps > 50 ? this.dpr * 1.06 : this.dpr; const n = clamp(want, this.q.minDpr, Math.min(this.q.dpr, (window.devicePixelRatio || 1) * 1.0)); if (Math.abs(n - this.dpr) > 0.03) { this.dpr = n; this.resize(); } }
  }
  private signT = 0;
  private exposureFor(room: string): number { const g = this.getGame(); if (room.startsWith('aud')) { const id = Number(room.slice(3)); const s = g.s.screenings.find((q) => q.aud === id && (q.state === 'trailers' || q.state === 'playing')); return s ? 2.1 : 1.25; } if (!g.site.power) return 2.2; if (room === 'street') return 1.15 + (1 - this.world.day) * 0.6; if (room === 'arcade') return 1.5; return 1.1; }
  private menuCam(): void { const t = this.clock * 0.05, c = this.rig.cam; c.position.set(Math.sin(t) * 5 - 9, 2.1 + Math.sin(t * 1.7) * 0.25, 33 + Math.cos(t) * 1.4); c.lookAt(-7 + Math.sin(t * 0.7) * 0.8, 5.6, 18); if (Math.abs(c.fov - 58) > 0.1) { c.fov = 58; c.updateProjectionMatrix(); } this.rig.clip = 99; }
  leaveMenu(): void { this.menuMode = false; this.rig.mode = 'manager'; this.rig.focus(0, 8, 25); this.rig.setOrbit(0, 0.98, 25); this.rig.snap(); this.rig.clip = 2.45; }
  enterMenu(): void { this.menuMode = true; this.paused = true; this.rig.mode = 'walk'; this.setPrompt(null); }
  jump(x: number, z: number, dist = 13): void { if (this.rig.mode === 'manager') this.rig.focus(x, z, dist); else { this.setMode('manager'); this.rig.focus(x, z, dist); } }
  followGuest(id: number): void { const g = this.getGame(); this.setMode('manager'); this.rig.focus(this.rig.target.x, this.rig.target.z, 12); this.rig.follow = () => { const m = g.guests.get(id); return m ? { x: m.x, y: m.y, z: m.z } : null; }; }
  followStaff(id: number): void { const g = this.getGame(); this.setMode('manager'); this.rig.focus(this.rig.target.x, this.rig.target.z, 9); this.rig.follow = () => { const m = g.site.staff.find((q) => q.id === id); return m ? { x: m.x, y: m.y, z: m.z } : null; }; }
  goAud(id: number): void { const a = audById(id); this.jump(a.cx, (a.rect.z0 + a.rect.z1) / 2, 24); }
}
