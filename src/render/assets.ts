import * as THREE from 'three';

export const BASE = import.meta.env.BASE_URL + 'assets/';

export const TEXTURES = ['carpet_deco', 'carpet_worn', 'carpet_grand', 'carpet_neon', 'carpet_aud', 'floor_marble', 'floor_worn', 'floor_terrazzo', 'tile_subway', 'tile_teal', 'tile_hex', 'wood_walnut', 'wood_oak', 'wood_dark', 'plaster', 'wall_damask', 'wall_worn', 'wall_teal', 'velvet', 'leather', 'brushed', 'acoustic', 'ceiling_tin', 'ceiling_tile', 'sidewalk', 'asphalt', 'brick', 'facade', 'concrete', 'popcorn'];

export interface ShellPrim { mat: string; nv: number; ni: number; p: number; n: number; u: number; i: number; l?: number; c?: number }
export interface ShellMeta { rooms: { id: string; prims: ShellPrim[]; trim: ShellPrim[] }[]; sconces: number[][]; lmax: [number, number, number]; probe: { nx: number; nz: number } }
export interface PropPrim { mat: string; nv: number; ni: number; p: number; n: number; u: number; a: number; i: number }
export interface PropMeta { prims: PropPrim[]; min: [number, number, number]; max: [number, number, number]; tris: number }
export interface CharLod { nv: number; ni: number; off: Record<'p' | 'u' | 'i' | 'n' | 'ao' | 'part' | 'bi' | 'bw', number> }
export interface CharMeta { id: string; skin: string; height: number; female: boolean; child: boolean; old: boolean; joints: [number, number, number][]; tails: Record<string, [number, number, number]>; lods: CharLod[] }

export class Assets {
  shell!: ShellMeta; shellBin!: ArrayBuffer;
  props!: Record<string, PropMeta>; propsBin!: ArrayBuffer;
  chars!: { bones: string[]; parent: number[]; chars: CharMeta[] }; charBins: ArrayBuffer[] = [];
  private tex = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();
  aniso = 1;
  loaded = 0; total = 0;
  onProgress: (f: number, what: string) => void = () => {};

  private async track<T>(what: string, p: Promise<T>): Promise<T> { this.total++; const r = await p; this.loaded++; this.onProgress(this.loaded / this.total, what); return r; }
  private json<T>(u: string): Promise<T> { return fetch(BASE + u).then((r) => { if (!r.ok) throw new Error(`Missing asset ${u}`); return r.json() as Promise<T>; }); }
  private bin(u: string): Promise<ArrayBuffer> { return fetch(BASE + u).then((r) => { if (!r.ok) throw new Error(`Missing asset ${u}`); return r.arrayBuffer(); }); }

  async load(low = false, normals = false): Promise<void> {
    const lo = low ? '_lo' : '';
    const jobs: Promise<unknown>[] = [
      this.track('architecture', this.json<ShellMeta>('shell/shell.json').then((j) => { this.shell = j; })),
      this.track('architecture', this.bin('shell/shell.bin').then((b) => { this.shellBin = b; })),
      this.track('furniture', this.json<Record<string, PropMeta>>(`props/props${lo}.json`).then((j) => { this.props = j; })),
      this.track('furniture', this.bin(`props/props${lo}.bin`).then((b) => { this.propsBin = b; })),
      this.track('cast', this.json<Assets['chars']>('chars/chars.json').then(async (j) => { this.chars = j; this.charBins = await Promise.all(j.chars.map((c) => this.track('cast', this.bin(`chars/${c.id}.bin`)))); })),
    ];
    await Promise.all(jobs);
    await Promise.all([
      ...this.shell.rooms.map((r) => this.track('baked light', this.loadTex(`shell/lm_${r.id}.webp`, { linear: true, mip: false }))),
      this.track('baked light', this.loadTex('shell/probe.png', { linear: true, mip: false, flip: false })),
      ...this.chars.chars.flatMap((c) => [this.track('wardrobe', this.loadTex(`chars/${c.id}.webp`, { flip: true })), this.track('wardrobe', this.loadTex(`chars/${c.id}_m.webp`, { flip: true, linear: true }))]),
      // every tiling texture is fetched before materials clone it: a clone of an unloaded texture would never upload
      ...TEXTURES.map((t) => this.track('materials', this.loadTex(`tex/${t}_c.webp`, { repeat: true }))),
      ...(normals ? TEXTURES.flatMap((t) => ['n', 'r'].filter((k) => !(t === 'floor_terrazzo' && k === 'n')).map((k) => this.track('materials', this.loadTex(`tex/${t}_${k}.webp`, { repeat: true, linear: true })))) : []),
      this.track('materials', this.loadTex('tex/grime.webp', { repeat: true, linear: true })), this.track('materials', this.loadTex('tex/city_c.webp', { repeat: true })), this.track('materials', this.loadTex('tex/city_e.webp', { repeat: true })), this.track('materials', this.loadTex('tex/blob.png', { linear: true })),
    ]);
  }
  private loadTex(u: string, o: { linear?: boolean; repeat?: boolean; mip?: boolean; flip?: boolean }): Promise<THREE.Texture> {
    return new Promise((res, rej) => this.loader.load(BASE + u, (t) => {
      t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (o.mip === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
      t.flipY = o.flip ?? true;
      t.anisotropy = this.aniso;
      this.tex.set(u, t); res(t);
    }, undefined, () => rej(new Error(`Missing texture ${u}`))));
  }
  /** Already-loaded texture, or start loading and return a placeholder that fills in. */
  texture(u: string, o: { linear?: boolean; repeat?: boolean; mip?: boolean; flip?: boolean } = {}): THREE.Texture {
    const hit = this.tex.get(u);
    if (hit) return hit;
    const t = this.loader.load(BASE + u);
    t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (o.mip === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.flipY = o.flip ?? true;
    t.anisotropy = this.aniso;
    this.tex.set(u, t);
    return t;
  }
  private merged = new Map<string, { mat: string; geo: THREE.BufferGeometry }[]>();
  /** Low tier: opaque, untextured parts collapsed into one vertex-coloured mesh per prop. */
  mergedGeometry(name: string, albedo: (mat: string) => [number, number, number, number]): { mat: string; geo: THREE.BufferGeometry }[] {
    const hit = this.merged.get(name);
    if (hit) return hit;
    const m = this.props[name]!, solo = (k: string) => k.startsWith('screen_') || k.startsWith('glass') || k === 'water' || k.startsWith('seat_');
    const out = this.propGeometry(name).filter((p) => solo(p.mat));
    const rest = m.prims.filter((p) => !solo(p.mat)), nv = rest.reduce((a, p) => a + p.nv, 0), ni = rest.reduce((a, p) => a + p.ni, 0);
    if (nv) {
      const P = new Float32Array(nv * 3), N = new Int8Array(nv * 4), A = new Uint8Array(nv), C = new Uint8Array(nv * 4), I = new Uint32Array(ni), b = this.propsBin; let v = 0, i = 0;
      for (const p of rest) { P.set(new Float32Array(b, p.p, p.nv * 3), v * 3); N.set(new Int8Array(b, p.n, p.nv * 4), v * 4); A.set(new Uint8Array(b, p.a, p.nv), v); const al = albedo(p.mat); for (let k = 0; k < p.nv; k++) C.set(al, (v + k) * 4); const src = new Uint32Array(b, p.i, p.ni); for (let k = 0; k < p.ni; k++) I[i + k] = src[k]! + v; v += p.nv; i += p.ni; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 4, true)); g.setAttribute('ao', new THREE.BufferAttribute(A, 1, true)); g.setAttribute('albedo', new THREE.BufferAttribute(C, 4, true)); g.setIndex(new THREE.BufferAttribute(I, 1));
      out.push({ mat: '#low', geo: g });
    }
    this.merged.set(name, out); return out;
  }
  propGeometry(name: string): { mat: string; geo: THREE.BufferGeometry }[] {
    const m = this.props[name];
    if (!m) throw new Error(`No prop ${name}`);
    return m.prims.map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.propsBin, p.p, p.nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(this.propsBin, p.n, p.nv * 4), 4, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.propsBin, p.u, p.nv * 2), 2));
      g.setAttribute('ao', new THREE.BufferAttribute(new Uint8Array(this.propsBin, p.a, p.nv), 1, true));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.propsBin, p.i, p.ni), 1));
      return { mat: p.mat, geo: g };
    });
  }
}
