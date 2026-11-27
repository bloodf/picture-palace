import * as THREE from 'three';
import type { Assets } from './assets';
import type { Quality } from './quality';
import { patch, type Lighting, type PatchOpts } from './lighting';
import { LowMats } from './lowmats';

export interface MatDef { color: number; tex?: string; scale?: number; rough?: number; metal?: number; emissive?: number; ei?: number; opacity?: number; normal?: number; env?: number; double?: boolean; floor?: boolean; noTexN?: boolean; wet?: boolean }

/** Furniture and prop materials. Names come from the Blender scripts. */
export const PROP_MATS: Record<string, MatDef> = {
  brass: { color: 0xc9973f, tex: 'brushed', scale: 2, rough: 0.28, metal: 1 }, chrome: { color: 0xd8dade, tex: 'brushed', scale: 2, rough: 0.18, metal: 1 }, iron: { color: 0x33353a, rough: 0.55, metal: 0.6 }, metal_grey: { color: 0x8b8f96, rough: 0.4, metal: 0.7 },
  enamel_red: { color: 0xb3161b, rough: 0.22 }, enamel_cream: { color: 0xf0e4c8, rough: 0.25 }, enamel_yellow: { color: 0xe9a917, rough: 0.28 }, enamel_green: { color: 0x4c6b58, rough: 0.35 }, black: { color: 0x0c0c0e, rough: 0.4 }, plastic_dark: { color: 0x1d1e22, rough: 0.5 },
  wood: { color: 0xffffff, tex: 'wood_walnut', scale: 1.1, rough: 0.38 }, wood_panel: { color: 0xe8cdb8, tex: 'wood_walnut', scale: 0.8, rough: 0.3 }, lacquer: { color: 0x08080a, rough: 0.08 }, plywood: { color: 0xd3a76e, tex: 'wood_oak', scale: 0.5, rough: 0.8 },
  seat_fabric: { color: 0x8e1824, tex: 'velvet', scale: 3, rough: 0.92 }, seat_leather: { color: 0x5a2018, tex: 'leather', scale: 4, rough: 0.45 }, leather_dark: { color: 0x231a17, tex: 'leather', scale: 4, rough: 0.45 }, velvet_red: { color: 0x9c1526, tex: 'velvet', scale: 2, rough: 0.92 }, velvet_teal: { color: 0x0f5a60, tex: 'velvet', scale: 2, rough: 0.92 },
  marble_dark: { color: 0x23302d, rough: 0.12 }, marble_light: { color: 0xe6ddcc, rough: 0.16 }, porcelain: { color: 0xf2f1ec, rough: 0.1 }, glass: { color: 0xcfe6ea, rough: 0.04, opacity: 0.16, env: 1.6 }, glass_green: { color: 0x1e6b3c, rough: 0.1, emissive: 0x2c8a4c, ei: 0.5 }, carglass: { color: 0x0b1016, rough: 0.05 }, lens: { color: 0x1b2a4a, rough: 0.02, metal: 0.4 }, water: { color: 0x9fd4de, rough: 0.02, opacity: 0.45 },
  popcorn: { color: 0xffffff, tex: 'popcorn', scale: 3, rough: 0.8 }, sausage: { color: 0x8e3a1e, rough: 0.35 }, nacho: { color: 0xe2a22e, rough: 0.8 }, pretzel: { color: 0x8a4a1c, rough: 0.5 }, paper_white: { color: 0xf1ece2, rough: 0.8 }, stripe_red: { color: 0xc92a24, rough: 0.7 }, soil: { color: 0x2b1d14, rough: 1 }, bark: { color: 0x5a4230, rough: 0.95 }, leaf: { color: 0x2f6b2e, rough: 0.55, double: true }, leaf_tree: { color: 0x3b6a2c, rough: 0.7, double: true },
  candy_a: { color: 0xd6203c, rough: 0.3 }, candy_b: { color: 0x2a6fd0, rough: 0.3 }, candy_c: { color: 0xf2b21c, rough: 0.3 }, candy_d: { color: 0x2f9a55, rough: 0.3 }, candy_e: { color: 0x8a3bb0, rough: 0.3 }, ice_pink: { color: 0xf0a8b4, rough: 0.6 }, ice_choc: { color: 0x5c3422, rough: 0.6 }, ice_mint: { color: 0xa8dcbc, rough: 0.6 }, slush_blue: { color: 0x2479e8, rough: 0.1, emissive: 0x12408a, ei: 0.4 }, slush_red: { color: 0xe0263c, rough: 0.1, emissive: 0x8a1220, ei: 0.4 }, slush_green: { color: 0x3ccc4c, rough: 0.1, emissive: 0x167022, ei: 0.4 },
  lamp: { color: 0xfff2d6, emissive: 0xffc878, ei: 2.2 }, lamp_cool: { color: 0xf2f8ff, emissive: 0xd0e4ff, ei: 1.8 }, tail: { color: 0x8a1010, emissive: 0xff2010, ei: 1.4 }, neon_pink: { color: 0xff4fa0, emissive: 0xff2f8c, ei: 3 }, neon_cyan: { color: 0x5ff0ff, emissive: 0x1fd8ff, ei: 3 }, neon_yellow: { color: 0xffe26a, emissive: 0xffc21a, ei: 3 }, neon_green: { color: 0x6aff8a, emissive: 0x22ff55, ei: 2.5 },
  cab_blue: { color: 0x1c2f78, rough: 0.4 }, cab_black: { color: 0x131318, rough: 0.45 }, car_red: { color: 0x9a1520, rough: 0.15, metal: 0.3 }, car_blue: { color: 0x1d3b66, rough: 0.15, metal: 0.3 }, car_yellow: { color: 0xe5a912, rough: 0.2 }, tyre: { color: 0x141416, rough: 0.9 }, filmstock: { color: 0x1a1512, rough: 0.25 }, tile_teal: { color: 0xffffff, tex: 'tile_teal', scale: 1.2, rough: 0.2 }, brick_prop: { color: 0xffffff, tex: 'brick', scale: 0.8, rough: 0.9 },
  book_a: { color: 0x7a2430, rough: 0.8 }, book_b: { color: 0x2a4a5a, rough: 0.8 }, book_c: { color: 0xb59a5a, rough: 0.8 }, book_d: { color: 0x3a5a34, rough: 0.8 }, bottle_green: { color: 0x1f5a34, rough: 0.06, emissive: 0x0c2a16, ei: 0.5 }, bottle_amber: { color: 0x8a4a12, rough: 0.06, emissive: 0x5a2a06, ei: 0.6 }, bottle_clear: { color: 0xc8dce0, rough: 0.06, emissive: 0x2a3436, ei: 0.4 }, bottle_red: { color: 0x6a1220, rough: 0.06, emissive: 0x3a0610, ei: 0.5 },
};

/** Mean linear colour of the textures used on props, so the low tier can skip sampling them. */
const TEX_MEAN: Record<string, [number, number, number]> = { wood_walnut: [0.075, 0.035, 0.016], wood_oak: [0.36, 0.2, 0.09], wood_dark: [0.03, 0.012, 0.006], velvet: [0.55, 0.55, 0.55], leather: [0.72, 0.72, 0.72], brushed: [0.85, 0.85, 0.85], popcorn: [0.75, 0.58, 0.3], tile_teal: [0.02, 0.11, 0.1], brick: [0.12, 0.05, 0.035], plaster: [0.75, 0.7, 0.6], fabric: [0.6, 0.6, 0.6], acoustic: [0.45, 0.45, 0.45], carpet_neon: [0.05, 0.05, 0.08], facade: [0.7, 0.6, 0.46] };

export class Materials {
  private props = new Map<string, THREE.Material>();
  readonly lowm: LowMats;
  constructor(private assets: Assets, readonly L: Lighting, readonly q: Quality, readonly env: THREE.Texture | null) { this.lowm = new LowMats(L); }
  tex(name: string, kind: 'c' | 'n' | 'r', scale: number): THREE.Texture {
    const t = this.assets.texture(`tex/${name}_${kind}.webp`, { repeat: true, linear: kind !== 'c' });
    const key = scale.toFixed(3);
    const cached = (t.userData as Record<string, THREE.Texture>)[key];
    if (cached) return cached;
    const c = t.clone();
    c.repeat.set(scale, scale); c.wrapS = c.wrapT = THREE.RepeatWrapping;
    (t.userData as Record<string, THREE.Texture>)[key] = c;
    return c;
  }
  make(d: MatDef, o: PatchOpts): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
    const q = this.q;
    const transparent = d.opacity !== undefined;
    if (q.pbr) {
      const m = new THREE.MeshStandardMaterial({ color: d.color, roughness: d.rough ?? 0.7, metalness: d.metal ?? 0, transparent, opacity: d.opacity ?? 1, depthWrite: !transparent, side: d.double || o.twoSided ? THREE.DoubleSide : THREE.FrontSide });
      if (d.tex) {
        m.map = this.tex(d.tex, 'c', d.scale ?? 1);
        if (q.normals && !d.noTexN) { if (d.tex !== 'floor_terrazzo') m.normalMap = this.tex(d.tex, 'n', d.scale ?? 1); m.normalScale.setScalar(d.normal ?? 0.9); m.roughnessMap = this.tex(d.tex, 'r', d.scale ?? 1); m.roughness = 1; }
      }
      if (d.emissive !== undefined) { m.emissive.setHex(d.emissive); m.emissiveIntensity = d.ei ?? 1; }
      m.envMap = q.env ? this.env : null; m.envMapIntensity = d.env ?? 1;
      // metals have no diffuse: lift them so baked light still reads
      if ((d.metal ?? 0) > 0.5) { m.metalness = q.env ? 0.85 : 0.2; }
      return patch(m, this.L, { ...o, floor: d.floor, wetOutdoor: d.wet });
    }
    const c = new THREE.Color(d.color);
    if (d.emissive !== undefined) c.copy(new THREE.Color(d.emissive)).multiplyScalar(Math.min(2.2, (d.ei ?? 1))).add(new THREE.Color(d.color).multiplyScalar(0.25));
    const m = new THREE.MeshBasicMaterial({ color: c, transparent, opacity: d.opacity ?? 1, depthWrite: !transparent, side: d.double || o.twoSided ? THREE.DoubleSide : THREE.FrontSide });
    if (d.tex) m.map = this.tex(d.tex, 'c', d.scale ?? 1);
    if (d.emissive !== undefined && (d.ei ?? 1) > 0.9) return clipOnly(m, this.L);
    return patch(m, this.L, { ...o, floor: d.floor });
  }
  prop(name: string): THREE.Material {
    let m = this.props.get(name);
    if (!m) { m = this.make(PROP_MATS[name] ?? { color: 0xff00ff }, { mode: 'probe' }); m.name = name; this.props.set(name, m); }
    return m;
  }
  /** Average colour of a material for vertex colouring, sRGB bytes plus glow. */
  albedo(d: MatDef): [number, number, number, number] {
    const c = new THREE.Color(d.color), t = d.tex ? TEX_MEAN[d.tex] : undefined;
    let r = c.r, g = c.g, b = c.b;
    if (t) { r *= t[0]; g *= t[1]; b *= t[2]; }
    let glow = 0;
    if ((d.metal ?? 0) > 0.5) { r *= 0.5; g *= 0.5; b *= 0.5; }
    if (d.emissive !== undefined) { const e = new THREE.Color(d.emissive); glow = Math.min(1, (d.ei ?? 1) / 2.2); r = r * 0.3 + e.r * 0.7; g = g * 0.3 + e.g * 0.7; b = b * 0.3 + e.b * 0.7; }
    const q = (v: number) => Math.round(Math.sqrt(Math.min(1, v)) * 255);
    return [q(r), q(g), q(b), Math.round(glow * 255)];
  }
  /** Self-lit panel showing a texture (posters, menus, arcade screens). */
  screen(tex: THREE.Texture, gain = 1): THREE.MeshBasicMaterial {
    return clipOnly(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(gain, gain, gain), toneMapped: true }), this.L);
  }
}
export function clipOnly(m: THREE.MeshBasicMaterial, L: Lighting): THREE.MeshBasicMaterial {
  m.onBeforeCompile = (s) => {
    s.uniforms.uClipY = L.uniforms.uClipY!;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 w4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      w4 = instanceMatrix * w4;
      #endif
      vWY = (modelMatrix * w4).y; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uClipY;').replace('void main() {', 'void main() {\nif (vWY > uClipY) discard;');
  };
  m.customProgramCacheKey = () => 'pp:clip';
  return m;
}
