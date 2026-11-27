import * as THREE from 'three';
import type { Lighting } from './lighting';

/**
 * Materials for machines without a GPU. Everything is resolved per vertex where possible, with as few varyings as
 * possible and no discard: a software rasteriser pays for triangle setup and interpolants far more than for maths.
 */
const TONE = /* glsl */ `
uniform float uEx;
vec3 tone(vec3 c){ c *= uEx * 0.72; c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); return sqrt(clamp(c, 0.0, 1.0)); }`;
/** Walls are squashed down to the cut height instead of discarded; anything facing up above the cut is thrown away. */
const CUT = /* glsl */ `
uniform float uClipY;
void cut(inout vec4 wp, float ny, out bool gone){ gone = wp.y > uClipY && ny > 0.5; wp.y = min(wp.y, uClipY); }`;

export interface LowUniforms { uEx: THREE.IUniform; }
export class LowMats {
  readonly ex: THREE.IUniform = { value: 1.1 };
  private prop: THREE.ShaderMaterial | null = null;
  private textured = new Map<string, THREE.ShaderMaterial>();
  constructor(private L: Lighting) {}
  private u(extra: Record<string, THREE.IUniform> = {}): Record<string, THREE.IUniform> { const U = this.L.uniforms; return { uEx: this.ex, uClipY: U.uClipY!, uTintA: U.uTintA!, uLmax: U.uLmax!, ...extra }; }

  /** Lightmapped surface with a tiling texture. */
  surface(map: THREE.Texture | null, color: number, scale: number, lm: THREE.Texture, zone: number, floor: boolean): THREE.ShaderMaterial {
    const U = this.L.uniforms;
    return new THREE.ShaderMaterial({
      uniforms: this.u({ uMap: { value: map }, uLm: { value: lm }, uC: { value: new THREE.Color(color) }, uS: { value: scale }, uDirt: U.uDirt!, uOverlay: U.uOverlay!, uOverlayK: U.uOverlayK!, uGridOrg: U.uGridOrg!, uGridInv: U.uGridInv! }),
      vertexShader: `attribute vec2 lmUv; uniform float uS; uniform vec2 uGridOrg; uniform vec2 uGridInv; varying vec4 vUv2; ${floor ? 'varying vec2 vG;' : ''} ${CUT}
        void main(){ vec4 wp = vec4(position, 1.0); bool gone; cut(wp, normal.y, gone); vUv2 = vec4(uv * uS, lmUv); ${floor ? 'vG = (position.xz - uGridOrg) * uGridInv;' : ''} gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform sampler2D uMap; uniform sampler2D uLm; uniform vec3 uC; uniform vec4 uTintA[${this.L.zones * 3}]; uniform vec3 uLmax; varying vec4 vUv2; ${floor ? 'varying vec2 vG; uniform sampler2D uDirt; uniform sampler2D uOverlay; uniform float uOverlayK;' : ''} ${TONE}
        void main(){ vec3 e = texture2D(uLm, vUv2.zw).rgb; e *= e; e *= uLmax; vec3 c = uC${map ? ' * texture2D(uMap, vUv2.xy).rgb' : ''};
        ${floor ? 'float d = texture2D(uDirt, vG).r; c = mix(c, c * vec3(0.42, 0.38, 0.33) + 0.02, smoothstep(0.2, 1.0, d) * 0.8);' : ''}
        c *= e.r * uTintA[${zone * 3}].rgb + e.g * uTintA[${zone * 3 + 1}].rgb + e.b * uTintA[${zone * 3 + 2}].rgb; c = tone(c);
        ${floor ? 'if (uOverlayK > 0.01) { vec4 o = texture2D(uOverlay, vG); c = mix(c, o.rgb, o.a * uOverlayK); }' : ''}
        gl_FragColor = vec4(c, 1.0); }`,
    });
  }
  /** Merged vertex-baked trim of one room. */
  trim(zone: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.u(),
      vertexShader: `attribute vec4 bake; attribute vec4 albedo; attribute float ny; uniform vec4 uTintA[${this.L.zones * 3}]; uniform vec3 uLmax; varying vec3 vC; ${CUT} ${TONE}
        void main(){ vec4 wp = vec4(position, 1.0); bool gone; cut(wp, ny, gone); vec3 e = bake.rgb; e *= e; e *= uLmax; vC = tone(albedo.rgb * albedo.rgb * (e.r * uTintA[${zone * 3}].rgb + e.g * uTintA[${zone * 3 + 1}].rgb + e.b * uTintA[${zone * 3 + 2}].rgb)); gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }',
    });
  }
  /** Merged instanced prop with per-instance light. */
  props(): THREE.ShaderMaterial {
    return (this.prop ??= new THREE.ShaderMaterial({
      uniforms: this.u(),
      vertexShader: `attribute vec4 albedo; attribute float ao; varying vec3 vC; ${CUT} ${TONE}
        #ifdef USE_INSTANCING
        attribute vec4 iAmb; attribute vec4 iKey;
        #endif
        void main(){
        #ifdef USE_INSTANCING
          mat4 im = modelMatrix * instanceMatrix; vec4 amb = iAmb; vec3 key = iKey.rgb;
        #else
          mat4 im = modelMatrix; vec4 amb = vec4(0.16, 0.16, 0.18, 1.0); vec3 key = vec3(0.22);
        #endif
        vec3 n = normalize(mat3(im) * normal); vec3 l = (amb.rgb * (0.62 + 0.38 * n.y) + key * (0.4 + 0.75 * max(0.0, dot(n, normalize(vec3(0.1, 0.35, amb.a)))))) * mix(0.35, 1.0, ao);
        vec3 a = albedo.rgb * albedo.rgb;
        #ifdef USE_INSTANCING_COLOR
          a *= instanceColor;
        #endif
        vC = tone(mix(a * l, a * 1.7, albedo.a)); vec4 wp = im * vec4(position, 1.0); bool gone; cut(wp, n.y, gone); gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }',
    }));
  }
  /** Single-colour instanced part that needs its own tint (seats). */
  solid(color: number): THREE.ShaderMaterial {
    const k = `s${color}`; let m = this.textured.get(k);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: this.u({ uC: { value: new THREE.Color(color).multiplyScalar(0.62) } }),
        vertexShader: `attribute float ao; varying vec3 vC; uniform vec3 uC; ${TONE}
          #ifdef USE_INSTANCING
          attribute vec4 iAmb; attribute vec4 iKey;
          #endif
          void main(){
          #ifdef USE_INSTANCING
            mat4 im = modelMatrix * instanceMatrix; vec4 amb = iAmb; vec3 key = iKey.rgb;
          #else
            mat4 im = modelMatrix; vec4 amb = vec4(0.2, 0.2, 0.2, 1.0); vec3 key = vec3(0.2);
          #endif
          vec3 n = normalize(mat3(im) * normal); vec3 l = (amb.rgb * (0.62 + 0.38 * n.y) + key * (0.4 + 0.75 * max(0.0, dot(n, normalize(vec3(0.1, 0.35, amb.a)))))) * mix(0.35, 1.0, ao);
          vec3 a = uC;
          #ifdef USE_INSTANCING_COLOR
            a *= instanceColor;
          #endif
          vC = tone(a * l); gl_Position = projectionMatrix * viewMatrix * (im * vec4(position, 1.0)); }`,
        fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }',
      });
      this.textured.set(k, m);
    }
    return m;
  }
  crowd(map: THREE.Texture, mask: THREE.Texture, bones: THREE.Texture, lod: number): THREE.ShaderMaterial {
    const inf = lod >= 2 ? 1 : 2;
    return new THREE.ShaderMaterial({
      uniforms: { uEx: this.ex, uMap: { value: map }, uMask: { value: mask }, uBones: { value: bones } },
      vertexShader: `attribute vec4 iPos; attribute vec4 iFrame; attribute vec4 iC0; attribute vec4 iC1; attribute vec4 iC2; attribute vec4 iC3; attribute vec2 pa; attribute vec4 bi; attribute vec4 bw; attribute vec4 iAmb; attribute vec4 iKey; uniform sampler2D uBones; uniform float uEx;
        varying vec2 vUv; varying vec3 vL; varying vec3 vT;
        void bone(float b, float w, int y, inout vec3 op, inout vec3 on){ int x = int(b + 0.5) * 3; vec4 r0 = texelFetch(uBones, ivec2(x, y), 0), r1 = texelFetch(uBones, ivec2(x + 1, y), 0), r2 = texelFetch(uBones, ivec2(x + 2, y), 0); vec4 q = vec4(position, 1.0); op += w * vec3(dot(r0, q), dot(r1, q), dot(r2, q)); on += w * vec3(dot(r0.xyz, normal), dot(r1.xyz, normal), dot(r2.xyz, normal)); }
        void main(){ int y = int((iFrame.z > 0.5 ? iFrame.y : iFrame.x) + 0.5); vec3 p = vec3(0.0), n = vec3(0.0); ${inf === 1 ? 'bone(bi.x, 1.0, y, p, n);' : 'float ws = bw.x + bw.y; bone(bi.x, bw.x / ws, y, p, n); if (bw.y > 0.03) bone(bi.y, bw.y / ws, y, p, n);'}
        float cs = cos(iPos.w), sn = sin(iPos.w); p *= iFrame.w; vec3 wp = vec3(p.x * cs + p.z * sn, p.y, -p.x * sn + p.z * cs) + iPos.xyz; vec3 nw = vec3(n.x * cs + n.z * sn, n.y, -n.x * sn + n.z * cs);
        vec3 t = vec3(1.0); float pt = pa.x; if (pt < 0.5) t = iC0.rgb; else if (pt < 1.5) t = iC1.rgb; else if (pt < 2.5) t = iC2.rgb; else if (pt < 3.5) t = vec3(iC0.a, iC1.a, iC2.a); else if (pt < 4.5) t = iC3.rgb; else if (pt > 5.5) t = iC1.rgb;
        vT = t * t; vL = (iAmb.rgb * (0.66 + 0.34 * nw.y) + iKey.rgb * (0.32 + 0.9 * max(0.0, dot(nw, normalize(vec3(0.12, 0.3, iAmb.a)))))) * mix(0.45, 1.0, pa.y / 255.0) * uEx * 0.72 + vec3(0.5, 0.36, 0.12) * iC3.a; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `uniform sampler2D uMap; uniform sampler2D uMask; varying vec2 vUv; varying vec3 vL; varying vec3 vT;
        void main(){ vec3 c = texture2D(uMap, vUv).rgb * mix(vec3(1.0), vT, texture2D(uMask, vUv).r) * vL; c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); gl_FragColor = vec4(sqrt(clamp(c, 0.0, 1.0)), 1.0); }`,
    });
  }
}
