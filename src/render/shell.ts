import * as THREE from 'three';
import { ROOMS } from '../sim/plan';
import type { Assets } from './assets';
import type { Materials, MatDef } from './materials';
import type { SiteState } from '../sim/types';
import { siteDef } from '../sim/data/catalog';

export interface Theme { wall: string; wallAlt: string; wallTint: number; altTint: number; aud: number; drape: number; carpetAud: number; gold: number; seat: number; runner: string }
export const THEMES: Record<string, Theme> = {
  ruby: { wall: 'wall_damask', wallAlt: 'wall_teal', wallTint: 0xffffff, altTint: 0xffffff, aud: 0x6a1c24, drape: 0x9a1220, carpetAud: 0xffffff, gold: 0xd8a24a, seat: 0x8e1824, runner: 'carpet_deco' },
  teal: { wall: 'wall_teal', wallAlt: 'wall_damask', wallTint: 0xffffff, altTint: 0xd8b0a0, aud: 0x1d4a52, drape: 0x0f5560, carpetAud: 0x7ac0c8, gold: 0xcaa45c, seat: 0x14565e, runner: 'carpet_grand' },
  emerald: { wall: 'wall_teal', wallAlt: 'wall_teal', wallTint: 0xa8e0a0, altTint: 0xc0e8a8, aud: 0x24503a, drape: 0x1a6a3e, carpetAud: 0x90d0a0, gold: 0xd0a850, seat: 0x1d5a38, runner: 'carpet_grand' },
  violet: { wall: 'wall_damask', wallAlt: 'wall_damask', wallTint: 0xb08ae0, altTint: 0x9a90e8, aud: 0x3c2a58, drape: 0x4a2878, carpetAud: 0xb098e8, gold: 0xd8b060, seat: 0x46286e, runner: 'carpet_grand' },
  onyx: { wall: 'wall_teal', wallAlt: 'wall_teal', wallTint: 0x8a8a98, altTint: 0x9a98a8, aud: 0x26262e, drape: 0x34343e, carpetAud: 0x9898a8, gold: 0xc0a878, seat: 0x2a2a34, runner: 'carpet_deco' },
};

export function shellMat(name: string, site: SiteState): MatDef {
  const th = THEMES[siteDef(site.id).theme] ?? THEMES.ruby!;
  const lob = site.decor.lobby, prom = site.decor.prom, wc = site.decor.wc;
  switch (name) {
    case 'floor_lobby': return lob === 0 ? { color: 0xd8ccb8, tex: 'floor_worn', scale: 0.42, rough: 0.5, floor: true } : { color: 0xffffff, tex: 'floor_marble', scale: 0.42, rough: 0.14, floor: true, env: 1.3 };
    case 'floor_runner': return lob === 0 ? { color: 0xb09a88, tex: 'carpet_worn', scale: 0.33, rough: 0.95, floor: true } : { color: 0xffffff, tex: lob === 2 ? 'carpet_grand' : th.runner, scale: lob === 2 ? 0.24 : 0.33, rough: 0.95, floor: true };
    case 'floor_prom': return prom === 0 ? { color: 0xa8968a, tex: 'carpet_worn', scale: 0.3, rough: 0.95, floor: true } : { color: 0xffffff, tex: prom === 2 ? 'carpet_grand' : th.runner, scale: prom === 2 ? 0.22 : 0.3, rough: 0.95, floor: true };
    case 'wall_upper': return lob === 0 ? { color: 0xcab49a, tex: 'wall_worn', scale: 0.5, rough: 0.85 } : { color: th.wallTint, tex: th.wall, scale: 0.5, rough: 0.7 };
    case 'wall_prom': return prom === 0 ? { color: 0xb0a090, tex: 'wall_worn', scale: 0.5, rough: 0.85 } : { color: th.altTint, tex: th.wallAlt, scale: 0.5, rough: 0.7 };
    case 'wall_wains': return { color: lob === 0 ? 0xa88c78 : 0xffffff, tex: 'wood_walnut', scale: 0.6, rough: 0.34 };
    case 'ceiling_lobby': return { color: lob === 0 ? 0xb8a48c : 0xfff4de, tex: 'ceiling_tin', scale: 0.5, rough: 0.5 };
    case 'ceiling_prom': return { color: prom === 0 ? 0xc8b8a0 : 0xf6ead4, tex: 'plaster', scale: 0.5, rough: 0.9 };
    case 'trim_gold': return { color: lob === 0 ? 0x9a7a44 : th.gold, tex: 'brushed', scale: 1, rough: 0.3, metal: 0.9 };
    case 'trim_cream': return { color: lob === 0 ? 0xc0ae94 : 0xf2e4c8, rough: 0.55 };
    case 'trim_wood': return { color: 0xd8b8a0, tex: 'wood_walnut', scale: 0.7, rough: 0.35 };
    case 'floor_aud': return { color: th.carpetAud, tex: 'carpet_aud', scale: 0.8, rough: 0.95, floor: true };
    case 'wall_aud': return { color: th.aud, tex: 'acoustic', scale: 0.5, rough: 0.95 };
    case 'wall_aud_dado': return { color: 0x8a6a58, tex: 'wood_dark', scale: 0.6, rough: 0.5 };
    case 'ceiling_aud': return { color: 0x2a282e, tex: 'ceiling_tile', scale: 0.4, rough: 0.95 };
    case 'screen_wall': return { color: 0x0a0a0b, rough: 1 };
    case 'drape': return { color: th.drape, tex: 'velvet', scale: 1, rough: 0.95, double: true };
    case 'floor_wc': return { color: wc === 0 ? 0xc8c0b0 : 0xffffff, tex: wc === 2 ? 'floor_marble' : 'tile_hex', scale: wc === 2 ? 0.5 : 1, rough: 0.3, floor: true };
    case 'wall_wc': return { color: wc === 0 ? 0xd0c8b0 : 0xffffff, tex: 'tile_subway', scale: 1, rough: 0.2 };
    case 'wall_wc_band': return { color: 0xffffff, tex: 'tile_teal', scale: 1, rough: 0.2 };
    case 'ceiling_tile': return { color: 0xffffff, tex: 'ceiling_tile', scale: 0.6, rough: 0.95 };
    case 'floor_office': return { color: 0xffffff, tex: 'wood_oak', scale: 0.4, rough: 0.42, floor: true };
    case 'wall_office': return { color: 0xb8c8b0, tex: 'plaster', scale: 0.6, rough: 0.85 };
    case 'floor_booth': return { color: 0xffffff, tex: 'concrete', scale: 0.5, rough: 0.8, floor: true };
    case 'wall_booth': return { color: 0x8a8684, tex: 'plaster', scale: 0.6, rough: 0.9 };
    case 'floor_food': return { color: 0xffffff, tex: 'floor_terrazzo', scale: 0.5, rough: 0.28, floor: true };
    case 'wall_food_low': return { color: 0xffffff, tex: 'tile_teal', scale: 0.8, rough: 0.2 };
    case 'wall_food': return { color: 0xe8cf9c, tex: 'plaster', scale: 0.6, rough: 0.85 };
    case 'ceiling_food': return { color: 0xffffff, tex: 'wood_oak', scale: 0.3, rough: 0.5 };
    case 'floor_vip': return { color: 0xffffff, tex: 'wood_dark', scale: 0.4, rough: 0.35, floor: true };
    case 'carpet_vip': return { color: 0xffffff, tex: 'carpet_grand', scale: 0.25, rough: 0.95, floor: true };
    case 'wall_vip': return { color: th.altTint, tex: th.wallAlt, scale: 0.5, rough: 0.7 };
    case 'floor_arcade': return { color: 0xffffff, tex: 'carpet_neon', scale: 0.25, rough: 0.95, floor: true };
    case 'wall_arcade': return { color: 0x3a3468, tex: 'plaster', scale: 0.6, rough: 0.8 };
    case 'ceiling_dark': return { color: 0x1c1a26, tex: 'ceiling_tile', scale: 0.5, rough: 0.95 };
    case 'sidewalk': return { color: 0xffffff, tex: 'sidewalk', scale: 0.4, rough: 0.85, floor: true, wet: true };
    case 'road': return { color: 0xffffff, tex: 'asphalt', scale: 0.22, rough: 0.7, wet: true };
    case 'facade': return { color: site.decor.facade === 0 ? 0xc8b8a0 : 0xfff6e4, tex: 'facade', scale: 0.35, rough: 0.4 };
    case 'facade_dark': return { color: siteDef(site.id).theme === 'ruby' ? 0x5e1420 : 0x12383e, rough: 0.25 };
    case 'brick': return { color: 0xd8c8c0, tex: 'brick', scale: 0.5, rough: 0.9 };
    case 'lamp': return { color: 0xfff0d0, emissive: 0xffc070, ei: 2.4 };
    case 'lamp_cool': return { color: 0xf2f8ff, emissive: 0xd8e8ff, ei: 1.8 };
    case 'neon_a': return { color: 0xff6aa8, emissive: 0xff2f80, ei: 2.6 };
    case 'neon_b': return { color: 0x80f0ff, emissive: 0x22d0ff, ei: 2.4 };
    case 'step_led': return { color: 0xffd8a0, emissive: 0xffa850, ei: 1.3 };
    case 'metal': return { color: 0x9a9ea4, rough: 0.4, metal: 0.7 };
    case 'mirror': return { color: 0xaab4b8, rough: 0.03, metal: 1, env: 1.6 };
    case 'black': return { color: 0x08080a, rough: 0.6 };
    default: return { color: 0xff00ff };
  }
}
/** Lamp materials that should go dark when their zone has no power. */
export const LAMP_NAMES = new Set(['lamp', 'lamp_cool', 'neon_a', 'neon_b', 'step_led']);

export interface RoomMesh { id: string; group: THREE.Group; meshes: THREE.Mesh[]; lamps: { mesh: THREE.Mesh; base: THREE.Color; name: string; pbr: boolean }[] }

export function buildShell(assets: Assets, mats: Materials, site: SiteState): { group: THREE.Group; rooms: Map<string, RoomMesh> } {
  const root = new THREE.Group();
  const rooms = new Map<string, RoomMesh>();
  for (const r of assets.shell.rooms) {
    const zone = ROOMS.findIndex((x) => x.id === r.id);
    const g = new THREE.Group(); g.name = r.id;
    const rm: RoomMesh = { id: r.id, group: g, meshes: [], lamps: [] };
    const lm = assets.texture(`shell/lm_${r.id}.webp`, { linear: true, mip: false });
    const add = (p: (typeof r.prims)[number], mode: 'lm' | 'vc') => {
      const geo = new THREE.BufferGeometry(), b = assets.shellBin;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, p.p, p.nv * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b, p.n, p.nv * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b, p.u, p.nv * 2), 2));
      if (mode === 'lm') geo.setAttribute('lmUv', new THREE.BufferAttribute(new Float32Array(b, p.l!, p.nv * 2), 2));
      else geo.setAttribute('bake', new THREE.BufferAttribute(new Uint8Array(b, p.c!, p.nv * 4), 4, true));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(b, p.i, p.ni), 1));
      const def = shellMat(p.mat, site);
      const m: THREE.Material = !mats.q.pbr && mode === 'lm' && !LAMP_NAMES.has(p.mat) ? mats.lowm.surface(def.tex ? mats.tex(def.tex, 'c', 1) : null, def.color, def.scale ?? 1, lm, zone, !!def.floor) : mats.make(def, { mode, zone, lightmap: lm });
      m.name = p.mat;
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      g.add(mesh); rm.meshes.push(mesh);
      if (LAMP_NAMES.has(p.mat)) rm.lamps.push({ mesh, name: p.mat, pbr: (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true, base: (m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial ? (m as THREE.MeshStandardMaterial).emissive.clone() : (m as THREE.MeshBasicMaterial).color.clone() });
    };
    for (const p of r.prims) add(p, 'lm');
    if (mats.q.pbr) for (const p of r.trim) add(p, 'vc');
    else {
      const keep = r.trim.filter((p) => LAMP_NAMES.has(p.mat)), merge = r.trim.filter((p) => !LAMP_NAMES.has(p.mat));
      for (const p of keep) add(p, 'vc');
      const nv = merge.reduce((a, p) => a + p.nv, 0), ni = merge.reduce((a, p) => a + p.ni, 0);
      if (nv) {
        const P = new Float32Array(nv * 3), C = new Uint8Array(nv * 4), A = new Uint8Array(nv * 4), I = new Uint32Array(ni), Y = new Int8Array(nv), b = assets.shellBin; let v = 0, i = 0;
        for (const p of merge) { const N = new Float32Array(b, p.n, p.nv * 3); for (let k = 0; k < p.nv; k++) Y[v + k] = Math.round(N[k * 3 + 1]! * 127); P.set(new Float32Array(b, p.p, p.nv * 3), v * 3); C.set(new Uint8Array(b, p.c!, p.nv * 4), v * 4); const al = mats.albedo(shellMat(p.mat, site)); for (let k = 0; k < p.nv; k++) A.set(al, (v + k) * 4); const src = new Uint32Array(b, p.i, p.ni); for (let k = 0; k < p.ni; k++) I[i + k] = src[k]! + v; v += p.nv; i += p.ni; }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('bake', new THREE.BufferAttribute(C, 4, true)); geo.setAttribute('albedo', new THREE.BufferAttribute(A, 4, true)); geo.setAttribute('ny', new THREE.BufferAttribute(Y, 1, true)); geo.setIndex(new THREE.BufferAttribute(I, 1));
        const mesh = new THREE.Mesh(geo, mats.lowm.trim(zone)); mesh.matrixAutoUpdate = false; g.add(mesh); rm.meshes.push(mesh);
      }
    }
    root.add(g); rooms.set(r.id, rm);
  }
  return { group: root, rooms };
}
