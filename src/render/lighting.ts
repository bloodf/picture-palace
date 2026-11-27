import * as THREE from 'three';
import { ROOMS, WORLD, floorY } from '../sim/plan';
import { NX, NZ, centerX, centerZ } from '../sim/nav';
import type { Assets } from './assets';

/**
 * Global illumination is baked once per light group (house / daylight-or-screen / accent) and recombined here with
 * live tints per room, so lights dim, the sun sets, the power fails and the film lights the audience, all for the
 * price of one texture fetch.
 */
export class Lighting {
  readonly zones = ROOMS.length;
  readonly tints: Float32Array;
  readonly tintTex: THREE.DataTexture;
  readonly dirtTex: THREE.DataTexture;
  readonly overlayTex: THREE.DataTexture;
  readonly uniforms: Record<string, THREE.IUniform>;
  private tintVecs: THREE.Vector4[];
  private probeData: Uint8ClampedArray | null = null;
  private zoneData: Uint8Array;
  constructor(assets: Assets) {
    this.tints = new Float32Array(this.zones * 3 * 4);
    this.tintTex = new THREE.DataTexture(this.tints, 3, this.zones, THREE.RGBAFormat, THREE.FloatType);
    this.tintTex.minFilter = this.tintTex.magFilter = THREE.NearestFilter;
    this.tintTex.needsUpdate = true;
    const z = new Uint8Array(NX * NZ * 4);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = (j * NX + i) * 4;
      const x = centerX(i), zz = centerZ(j);
      let hit = 0;
      for (let r = 0; r < ROOMS.length; r++) { const q = ROOMS[r]!.rect; if (x >= q.x0 && x < q.x1 && zz >= q.z0 && zz < q.z1) hit = r; }
      z[k] = hit; z[k + 1] = Math.round((floorY(x, zz) + 3) * 40); z[k + 3] = 255;
    }
    const zoneTex = new THREE.DataTexture(z, NX, NZ, THREE.RGBAFormat);
    zoneTex.minFilter = zoneTex.magFilter = THREE.NearestFilter; zoneTex.needsUpdate = true;
    this.dirtTex = new THREE.DataTexture(new Uint8Array(NX * NZ), NX, NZ, THREE.RedFormat);
    this.dirtTex.minFilter = this.dirtTex.magFilter = THREE.LinearFilter; this.dirtTex.unpackAlignment = 1; this.dirtTex.needsUpdate = true;
    this.overlayTex = new THREE.DataTexture(new Uint8Array(NX * NZ * 4), NX, NZ, THREE.RGBAFormat);
    this.overlayTex.minFilter = this.overlayTex.magFilter = THREE.LinearFilter; this.overlayTex.needsUpdate = true;
    const probe = assets.texture('shell/probe.png', { linear: true, mip: false, flip: false });
    this.tintVecs = Array.from({ length: this.zones * 3 }, () => new THREE.Vector4());
    const img = probe.image as HTMLImageElement | undefined;
    if (img && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = NX; c.height = NZ; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0); this.probeData = x.getImageData(0, 0, NX, NZ).data; }
    this.zoneData = z;
    this.uniforms = {
      uTintA: { value: this.tintVecs },      uTint: { value: this.tintTex }, uZone: { value: zoneTex }, uProbe: { value: probe }, uDirt: { value: this.dirtTex }, uOverlay: { value: this.overlayTex }, uOverlayK: { value: 0 },
      uGrime: { value: assets.texture('tex/grime.webp', { repeat: true, linear: true }) }, uLmax: { value: new THREE.Vector3(...assets.shell.lmax) }, uClipY: { value: 99 }, uTime: { value: 0 }, uGridOrg: { value: new THREE.Vector2(WORLD.x0, WORLD.z0) }, uGridInv: { value: new THREE.Vector2(1 / (WORLD.x1 - WORLD.x0), 1 / (WORLD.z1 - WORLD.z0)) }, uWet: { value: 0 },
    };
  }
  set(zone: number, group: 0 | 1 | 2, r: number, g: number, b: number): void {
    const k = (zone * 3 + group) * 4;
    this.tints[k] = r; this.tints[k + 1] = g; this.tints[k + 2] = b;
  }
  setDir(zone: number, s: number): void { this.tints[(zone * 3 + 1) * 4 + 3] = s; }
  commit(): void { this.tintTex.needsUpdate = true; for (let i = 0; i < this.tintVecs.length; i++) { const k = i * 4; this.tintVecs[i]!.set(this.tints[k]!, this.tints[k + 1]!, this.tints[k + 2]!, this.tints[k + 3]!); } }
  /** Fully combined light at a point for the low tier: ambient rgb + key direction sign, then key rgb (7 floats + pad). */
  sampleLit(x: number, z: number, amb: Float32Array, key: Float32Array, o: number): void {
    const b = this.tmp; this.sample(x, z, b, 0);
    const t = this.tints, zi = b[3]! * 12, m = this.uniforms.uLmax!.value as THREE.Vector3;
    const a0 = (b[0]! / 255) ** 2 * m.x, a1 = (b[1]! / 255) ** 2 * m.y, a2 = (b[2]! / 255) ** 2 * m.z;
    for (let c = 0; c < 3; c++) { amb[o + c] = a0 * t[zi + c]! + a2 * t[zi + 8 + c]! * 0.85; key[o + c] = a1 * t[zi + 4 + c]!; }
    amb[o + 3] = t[zi + 7]!; key[o + 3] = 1;
  }
  private tmp = new Uint8Array(4);
  /** Baked light at a point: three encoded group values and the zone index, written into out[o..o+3] (0..255). */
  sample(x: number, z: number, out: Uint8Array | Uint8ClampedArray, o: number): void {
    const i = Math.min(NX - 1, Math.max(0, Math.floor((x - WORLD.x0) * 2))), j = Math.min(NZ - 1, Math.max(0, Math.floor((z - WORLD.z0) * 2))), k = (j * NX + i) * 4, p = this.probeData;
    out[o] = p ? p[k]! : 120; out[o + 1] = p ? p[k + 1]! : 60; out[o + 2] = p ? p[k + 2]! : 40; out[o + 3] = this.zoneData[k]!;
  }
}

const COMMON_V = /* glsl */ `
varying vec3 vWP; uniform sampler2D uTint; uniform sampler2D uZone; uniform sampler2D uProbe; uniform vec2 uGridOrg; uniform vec2 uGridInv; uniform vec3 uLmax;
`;
const COMMON_F = /* glsl */ `
varying vec3 vWP; uniform sampler2D uTint; uniform sampler2D uDirt; uniform sampler2D uOverlay; uniform sampler2D uGrime; uniform float uOverlayK; uniform float uClipY; uniform float uTime; uniform vec2 uGridOrg; uniform vec2 uGridInv; uniform vec3 uLmax; uniform float uWet;
`;
export type LightMode = 'lm' | 'vc' | 'probe';

export interface PatchOpts { mode: LightMode; zone?: number; lightmap?: THREE.Texture; floor?: boolean; emissiveKeep?: boolean; noClip?: boolean; twoSided?: boolean; tintAttr?: boolean; wetOutdoor?: boolean; litVC?: boolean }

/** Teach a standard or basic material to take its diffuse light from the bake. */
export function patch<T extends THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>(m: T, L: Lighting, o: PatchOpts): T {
  const pbr = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  const extra: Record<string, THREE.IUniform> = { uLm: { value: o.lightmap ?? null } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, L.uniforms, extra);
    let vhead = COMMON_V, vbody = '', fhead = COMMON_F, light = '';
    if (o.mode === 'lm') { vhead += 'attribute vec2 lmUv; varying vec2 vLm;\n'; vbody += 'vLm = lmUv;\n'; fhead += 'varying vec2 vLm; uniform sampler2D uLm;\n'; }
    if (o.mode === 'vc') { vhead += 'attribute vec4 bake; varying vec3 vBake;\n'; vbody += 'vBake = bake.rgb;\n'; fhead += 'varying vec3 vBake;\n'; }
    if (o.mode === 'probe' && !pbr) vhead += `\n#ifdef USE_INSTANCING\nattribute vec4 iAmb; attribute vec4 iKey;\n#endif\n`;
    if (o.mode === 'probe') { vhead += 'attribute float ao; varying float vAo; varying vec3 vL0; varying vec3 vL1; varying vec3 vL2; varying float vDir;\n'; fhead += 'varying float vAo; varying vec3 vL0; varying vec3 vL1; varying vec3 vL2; varying float vDir;\n'; }
    if (o.mode !== 'probe') fhead += `uniform vec4 uTintA[${L.zones * 3}];\n`;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + vhead).replace('#include <project_vertex>', `
      #include <project_vertex>
      { vec4 wp4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4;
      #endif
      wp4 = modelMatrix * wp4; vWP = wp4.xyz; }
      ${o.mode === 'probe' && !pbr ? `#ifdef USE_INSTANCING
      { vec3 nw = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vAo = ao; vL0 = iAmb.rgb * (0.62 + 0.38 * nw.y) + iKey.rgb * (0.4 + 0.75 * max(0.0, dot(nw, normalize(vec3(0.1, 0.35, iAmb.a))))); vL0 *= mix(0.35, 1.0, ao); vL1 = vec3(0.0); vL2 = vec3(0.0); vDir = 2.0; }
      #else
      ` : ''}${o.mode === 'probe' ? `{ vAo = ao; vec2 guv = (vWP.xz - uGridOrg) * uGridInv; vec4 zt = textureLod(uZone, guv, 0.0); float zid = (floor(zt.r * 255.0 + 0.5) + 0.5) / ${L.zones.toFixed(1)};
        vec3 e = textureLod(uProbe, guv, 0.0).rgb; e *= e; e *= uLmax;
        vL0 = e.r * textureLod(uTint, vec2(0.1667, zid), 0.0).rgb; vec4 t1 = textureLod(uTint, vec2(0.5, zid), 0.0); vL1 = e.g * t1.rgb; vDir = t1.a; vL2 = e.b * textureLod(uTint, vec2(0.8333, zid), 0.0).rgb; }` : ''}${o.mode === 'probe' && !pbr ? '\n#endif\n' : ''}
      ${vbody}`);
    if (o.mode === 'probe') light = /* glsl */ `
      vec3 wn = ${pbr ? 'inverseTransformDirection(normal, viewMatrix)' : 'normalize(vWN)'};
      vec3 bakedL = vL0 * (0.58 + 0.34 * wn.y + 0.08 * wn.z) + vL1 * (0.45 + 0.75 * max(0.0, dot(wn, normalize(vec3(0.1, 0.35, vDir)))) ) * 1.1 + vL2 * (0.75 + 0.25 * wn.y);
      bakedL *= mix(0.35, 1.0, vAo);${pbr ? '' : ' if (vDir > 1.5) bakedL = vL0;'}`;
    else light = /* glsl */ `
      vec3 be = ${o.mode === 'lm' ? 'texture2D(uLm, vLm).rgb' : 'vBake'}; be *= be; be *= uLmax;
      vec3 bakedL = be.r * uTintA[${(o.zone ?? 0) * 3}].rgb + be.g * uTintA[${(o.zone ?? 0) * 3 + 1}].rgb + be.b * uTintA[${(o.zone ?? 0) * 3 + 2}].rgb;`;
    if (!pbr && o.mode === 'probe') {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 nn = normal;
        #ifdef USE_INSTANCING
          nn = mat3(instanceMatrix) * nn;
        #endif
        vWN = mat3(modelMatrix) * nn; }`);
      fhead += 'varying vec3 vWN;\n';
    }
    const floorCode = o.floor ? /* glsl */ `
      { vec2 guv = (vWP.xz - uGridOrg) * uGridInv; float d = texture2D(uDirt, guv).r; float k = 0.0; if (d > 0.06) { float gr = texture2D(uGrime, vWP.xz * 0.23).r; k = smoothstep(0.15, 0.95, d * (0.55 + gr * 0.95)); } diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.38, 0.33) + vec3(0.025, 0.021, 0.015), k * 0.88); dirtK = k;
        if (uOverlayK > 0.01) overlayC = texture2D(uOverlay, guv) * uOverlayK; }` : '';
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + fhead + 'float dirtK = 0.0; vec4 overlayC = vec4(0.0);\n')
      .replace('void main() {', `void main() {\n${o.noClip ? '' : 'if (vWP.y > uClipY) discard;'}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + floorCode);
    if (pbr) {
      s.fragmentShader = s.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, dirtK);${o.wetOutdoor ? 'roughnessFactor = mix(roughnessFactor, 0.12, uWet); diffuseColor.rgb *= mix(1.0, 0.55, uWet);' : ''}`)
        .replace('#include <lights_fragment_maps>', `${light}\nirradiance += bakedL * PI;\n#include <lights_fragment_maps>\nradiance *= clamp(dot(bakedL, vec3(0.3, 0.5, 0.2)) * 1.5, 0.0, 1.6); iblIrradiance = vec3(0.0);`);
    } else {
      s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>', `${light}\nreflectedLight.indirectDiffuse = ${o.litVC ? 'mix(bakedL, vec3(1.0), vGlow)' : 'bakedL'};`);
      if (o.litVC) { s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 albedo; varying vec3 vAlb; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlb = albedo.rgb; vGlow = albedo.a;'); s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vAlb; varying float vGlow;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vAlb * vAlb * (1.0 + vGlow * 1.6);'); }
    }
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, overlayC.rgb, overlayC.a);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `pp:${pbr ? 1 : 0}:${o.mode}:${o.mode === 'probe' ? 'x' : (o.zone ?? 0)}:${o.litVC ? 1 : 0}:${o.floor ? 1 : 0}:${o.noClip ? 1 : 0}:${o.wetOutdoor ? 1 : 0}`;
  return m;
}
