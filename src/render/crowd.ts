import * as THREE from 'three';
import type { Assets } from './assets';
import type { Lighting } from './lighting';
import { PROP_MATS, type Materials } from './materials';
import type { Quality } from './quality';
import { CLIPS, CLIP_START, NB, TOTAL_FRAMES, bakeClips, B } from './poses';
import { CARRY } from '../sim/anims';

export interface Actor {
  key: number; model: number; x: number; y: number; z: number; dir: number; anim: number; carry: number; top: number; bottom: number; hair: number; skin: number; shoes: number; scale: number; speed: number; phase: number; highlight?: number;
}
interface Batch { mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; pos: THREE.InstancedBufferAttribute; frame: THREE.InstancedBufferAttribute; c0: THREE.InstancedBufferAttribute; c1: THREE.InstancedBufferAttribute; c2: THREE.InstancedBufferAttribute; c3: THREE.InstancedBufferAttribute; pr: THREE.InstancedBufferAttribute; pk: THREE.InstancedBufferAttribute; n: number }
interface Blend { anim: number; prev: number; t: number; clock: number; seen: number }

const HELD: [number, string, 'r' | 'l'][] = [[CARRY.popcorn, 'held_popcorn', 'r'], [CARRY.cup, 'held_cup', 'l'], [CARRY.mop, 'held_mop', 'r'], [CARRY.phone, 'held_phone', 'r'], [CARRY.wrench, 'held_wrench', 'r'], [CARRY.clipboard, 'held_clipboard', 'l']];

export class Crowd {
  readonly group = new THREE.Group();
  private batches: Batch[][] = [];
  private mats: Float32Array[] = [];
  private held = new Map<number, { meshes: THREE.InstancedMesh[]; n: number; side: 'r' | 'l' }>();
  private blends = new Map<number, Blend>();
  private tick = 0;
  private shadow: THREE.InstancedMesh;
  drawn = 0;
  readonly heights: number[];

  private low: Materials['lowm'];
  constructor(private assets: Assets, private L: Lighting, mats: Materials, private q: Quality) {
    this.low = mats.lowm;
    const cap = q.crowdMax;
    this.heights = assets.chars.chars.map((c) => c.height);
    assets.chars.chars.forEach((ch, ci) => {
      const m = bakeClips(ch, assets.chars.parent);
      this.mats.push(m);
      const half = new Uint16Array(m.length);
      for (let i = 0; i < m.length; i++) half[i] = THREE.DataUtils.toHalfFloat(m[i]!);
      const bones = new THREE.DataTexture(half, NB * 3, TOTAL_FRAMES, THREE.RGBAFormat, THREE.HalfFloatType);
      bones.minFilter = bones.magFilter = THREE.NearestFilter; bones.needsUpdate = true;
      const lods: Batch[] = [];
      ch.lods.forEach((l, li) => {
        const b = assets.charBins[ci]!, g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, l.off.p, l.nv * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b, l.off.n, l.nv * 3), 3, true));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b, l.off.u, l.nv * 2), 2));
        const part = new Uint8Array(b, l.off.part, l.nv), ao = new Uint8Array(b, l.off.ao, l.nv), pa = new Uint8Array(l.nv * 2);
        for (let i = 0; i < l.nv; i++) { pa[i * 2] = part[i]!; pa[i * 2 + 1] = ao[i]!; }
        g.setAttribute('pa', new THREE.BufferAttribute(pa, 2));
        g.setAttribute('bi', new THREE.BufferAttribute(new Uint8Array(b, l.off.bi, l.nv * 4), 4));
        g.setAttribute('bw', new THREE.BufferAttribute(new Uint8Array(b, l.off.bw, l.nv * 4), 4, true));
        g.setIndex(new THREE.BufferAttribute(new Uint16Array(b, l.off.i, l.ni), 1));
        const n = li === 0 ? Math.min(64, cap) : cap;
        const mk = (size: number, Arr: typeof Float32Array | typeof Uint8Array, norm: boolean) => { const a = new THREE.InstancedBufferAttribute(new Arr(n * size), size, norm); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const pos = mk(4, Float32Array, false), frame = mk(4, Float32Array, false), c0 = mk(4, Uint8Array, true), c1 = mk(4, Uint8Array, true), c2 = mk(4, Uint8Array, true), c3 = mk(4, Uint8Array, true), pr = mk(4, Float32Array, false), pk = mk(4, Float32Array, false);
        g.setAttribute('iPos', pos); g.setAttribute('iFrame', frame); g.setAttribute('iC0', c0); g.setAttribute('iC1', c1); g.setAttribute('iC2', c2); g.setAttribute('iC3', c3); g.setAttribute('iAmb', pr); g.setAttribute('iKey', pk);
        const mat = this.material(assets.texture(`chars/${ch.id}.webp`), assets.texture(`chars/${ch.id}_m.webp`), bones, li, mats.env);
        const mesh = new THREE.Mesh(g, mat);
        g.instanceCount = 0; mesh.frustumCulled = false; mesh.visible = false;
        this.group.add(mesh);
        lods.push({ mesh, geo: g, pos, frame, c0, c1, c2, c3, pr, pk, n: 0 });
      });
      this.batches.push(lods);
    });
    for (const [bit, prop, side] of HELD) {
      const pa = new THREE.InstancedBufferAttribute(new Float32Array(220 * 4), 4), pk = new THREE.InstancedBufferAttribute(new Float32Array(220 * 4), 4);
      const src = q.pbr ? assets.propGeometry(prop) : assets.mergedGeometry(prop, (m) => mats.albedo(PROP_MATS[m] ?? { color: 0x888888 }));
      const meshes = src.map(({ mat, geo }) => { geo.setAttribute('iAmb', pa); geo.setAttribute('iKey', pk); const k = new THREE.InstancedMesh(geo, mat === '#low' ? mats.lowm.props() : mats.prop(mat), 220); k.frustumCulled = false; k.count = 0; this.group.add(k); return k; });
      this.held.set(bit, { meshes, n: 0, side });
    }
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: assets.texture('tex/blob.png', { linear: true }), transparent: true, depthWrite: false, opacity: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 512);
    this.shadow.frustumCulled = false; this.shadow.renderOrder = 2;
    this.group.add(this.shadow);
  }

  private material(map: THREE.Texture, mask: THREE.Texture, bones: THREE.Texture, lod: number, env: THREE.Texture | null): THREE.Material {
    const L = this.L, pbr = this.q.pbr;
    if (!pbr) return this.low.crowd(map, mask, bones, lod);
    const m = pbr ? new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, envMap: this.q.env ? env : null, envMapIntensity: 0.6 }) : new THREE.MeshBasicMaterial({ map });
    const inf = lod === 0 && pbr ? 4 : lod === 3 || (lod === 2 && !pbr) ? 1 : 2;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, L.uniforms, { uBones: { value: bones }, uMask: { value: mask } });
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 iPos; attribute vec4 iFrame; attribute vec4 iC0; attribute vec4 iC1; attribute vec4 iC2; attribute vec4 iC3; attribute vec2 pa; attribute vec4 bi; attribute vec4 bw;
        attribute vec4 iAmb; attribute vec4 iKey; uniform sampler2D uBones;
        varying vec3 vTintC; varying vec3 vL0; varying vec3 vL1; varying float vDir; varying float vAo; varying vec3 vWN; varying float vHi;
        vec3 skP; vec3 skN;
        void bone(float b, float w, float row, vec3 p, vec3 n, inout vec3 op, inout vec3 on) { int x = int(b + 0.5) * 3; int y = int(row + 0.5); vec4 r0 = texelFetch(uBones, ivec2(x, y), 0), r1 = texelFetch(uBones, ivec2(x + 1, y), 0), r2 = texelFetch(uBones, ivec2(x + 2, y), 0);
          vec4 q = vec4(p, 1.0); op += w * vec3(dot(r0, q), dot(r1, q), dot(r2, q)); on += w * vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n)); }
        void skinAt(float row, vec3 p, vec3 n, inout vec3 op, inout vec3 on) { ${inf === 1 ? 'bone(bi.x,1.0,row,p,n,op,on);' : inf === 4 ? 'bone(bi.x,bw.x,row,p,n,op,on); if (bw.y>0.004) bone(bi.y,bw.y,row,p,n,op,on); if (bw.z>0.004) bone(bi.z,bw.z,row,p,n,op,on); if (bw.w>0.004) bone(bi.w,bw.w,row,p,n,op,on);' : 'float ws = bw.x + bw.y; bone(bi.x,bw.x/ws,row,p,n,op,on); if (bw.y>0.02) bone(bi.y,bw.y/ws,row,p,n,op,on);'} }`)
        .replace(pbr ? '#include <beginnormal_vertex>' : '#include <begin_vertex>', `
          { vec3 a = vec3(0.0), an = vec3(0.0); skinAt(iFrame.x, position, normal, a, an);
          ${lod < (pbr ? 2 : 1) ? 'if (iFrame.z > 0.01) { vec3 c = vec3(0.0), cn = vec3(0.0); skinAt(iFrame.y, position, normal, c, cn); a = mix(a, c, iFrame.z); an = mix(an, cn, iFrame.z); }' : ''}
          float cs = cos(iPos.w), sn = sin(iPos.w); a *= iFrame.w;
          skP = vec3(a.x * cs + a.z * sn, a.y, -a.x * sn + a.z * cs) + iPos.xyz; skN = vec3(an.x * cs + an.z * sn, an.y, -an.x * sn + an.z * cs); }
          ${pbr ? 'vec3 objectNormal = skN;' : '#include <begin_vertex>'}`)
        .replace('#include <begin_vertex>', `vec3 transformed = skP;
          { float pt = floor(pa.x + 0.5); vec3 t = vec3(1.0); if (pt < 0.5) t = iC0.rgb; else if (pt < 1.5) t = iC1.rgb; else if (pt < 2.5) t = iC2.rgb; else if (pt < 3.5) t = vec3(iC0.a, iC1.a, iC2.a); else if (pt < 4.5) t = iC3.rgb; else if (pt > 5.5) t = iC1.rgb; vTintC = t * t; vAo = pa.y / 255.0; vWN = skN; vHi = iC3.a;
          vL0 = iAmb.rgb; vL1 = iKey.rgb; vDir = iAmb.a;${pbr ? '' : ' vec3 nw = normalize(skN); vL0 = (vL0 * (0.66 + 0.34 * nw.y) + vL1 * (0.32 + 0.9 * max(0.0, dot(nw, normalize(vec3(0.12, 0.3, vDir)))))) * mix(0.45, 1.0, vAo);'} }`)
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;');
      const light = pbr ? /* glsl */ `
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        vec3 bakedL = vL0 * (0.64 + 0.34 * wn.y + 0.08 * wn.z) + vL1 * (0.34 + 0.95 * max(0.0, dot(wn, normalize(vec3(0.12, 0.3, vDir)))));
        bakedL *= mix(0.45, 1.0, vAo);` : 'vec3 bakedL = vL0;';
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMask; varying vec3 vTintC; varying vec3 vL0; varying vec3 vL1; varying float vDir; varying float vAo; varying vec3 vWN; varying float vHi;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vTintC, texture2D(uMask, vMapUv).r);')
        .replace(pbr ? '#include <lights_fragment_maps>' : '#include <aomap_fragment>', pbr ? `${light}\nirradiance += bakedL * PI;\n#include <lights_fragment_maps>\nradiance *= clamp(dot(bakedL, vec3(0.33)) * 1.2, 0.0, 1.0); iblIrradiance = vec3(0.0);` : `${light}\nreflectedLight.indirectDiffuse = bakedL;`)
        .replace('#include <opaque_fragment>', 'if (vHi > 0.01) { float rim = pow(1.0 - abs(normalize(vWN).y * 0.2 + 0.5), 1.5); outgoingLight += vec3(1.0, 0.78, 0.3) * vHi * (0.18 + rim * 0.5); }\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => `crowd:${pbr ? 1 : 0}:${lod}`;
    return m;
  }

  private static m4 = new THREE.Matrix4();
  /** clock advances with simulated time so fast-forward speeds animation too. */
  render(actors: Iterable<Actor>, camera: THREE.Camera, clock: number, dt: number, inView: (a: Actor) => boolean): void {
    this.tick++;
    for (const l of this.batches) for (const b of l) b.n = 0;
    for (const h of this.held.values()) h.n = 0;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let sn = 0; this.drawn = 0;
    const m4 = Crowd.m4;
    for (const a of actors) {
      if (!inView(a)) continue;
      const d = Math.hypot(a.x - cx, a.y + 1 - cy, a.z - cz);
      const li = d < this.q.lod0 ? 0 : d < this.q.lod1 ? 1 : d < this.q.lod2 ? 2 : 3;
      const batch = this.batches[a.model]![li]!;
      let B0 = batch;
      if (B0.n >= B0.pos.count) { B0 = this.batches[a.model]![Math.min(3, li + 1)]!; if (B0.n >= B0.pos.count) continue; }
      let st = this.blends.get(a.key);
      if (!st) { st = { anim: a.anim, prev: -1, t: 1, clock: a.phase, seen: this.tick }; this.blends.set(a.key, st); }
      if (st.anim !== a.anim) { st.prev = frameOf(st.anim, st.clock); st.anim = a.anim; st.t = 0; }
      st.seen = this.tick;
      const loco = a.anim === 2 || a.anim === 4 || a.anim === 3;
      st.clock += dt * (loco ? Math.max(0.4, a.speed / 1.38) : 1);
      if (st.t < 1) st.t = Math.min(1, st.t + dt / 0.22);
      const c = CLIPS[a.anim] ?? CLIPS[0]!;
      const ft = ((st.clock / c.dur) % 1) * c.frames, f0 = Math.floor(ft) % c.frames, f1 = (f0 + 1) % c.frames, s0 = CLIP_START[a.anim] ?? 0;
      let rowA = s0 + f0, rowB = s0 + f1, mix = ft - Math.floor(ft);
      if (st.t < 1 && st.prev >= 0) { rowB = s0 + f0; rowA = st.prev; mix = st.t; }
      const n = B0.n++, P = B0.pos.array as Float32Array, F = B0.frame.array as Float32Array;
      P[n * 4] = a.x; P[n * 4 + 1] = a.y; P[n * 4 + 2] = a.z; P[n * 4 + 3] = a.dir;
      F[n * 4] = rowA; F[n * 4 + 1] = rowB; F[n * 4 + 2] = mix; F[n * 4 + 3] = a.scale;
      put(B0.c0, n, a.skin, (a.shoes >> 16) & 255); put(B0.c1, n, a.top, (a.shoes >> 8) & 255); put(B0.c2, n, a.bottom, a.shoes & 255); put(B0.c3, n, a.hair, Math.round((a.highlight ?? 0) * 255));
      this.L.sampleLit(a.x, a.z, B0.pr.array as Float32Array, B0.pk.array as Float32Array, n * 4);
      this.drawn++;
      if (sn < 512) { const sc = 0.85 * a.scale; m4.makeScale(sc, 1, sc); m4.setPosition(a.x, a.y + 0.015, a.z); this.shadow.setMatrixAt(sn++, m4); }
      if (a.carry && d < Math.max(9, this.q.lod1 * 1.3)) {
        const row = mix > 0.5 ? rowB : rowA;
        for (const [bit, h] of this.held) {
          if (!(a.carry & bit) || h.n >= 220) continue;
          const hp = this.handPos(a.model, row, h.side);
          const cs = Math.cos(a.dir), si = Math.sin(a.dir), k = a.scale;
          const wx = a.x + (hp[0] * cs + hp[2] * si) * k, wy = a.y + hp[1] * k, wz = a.z + (-hp[0] * si + hp[2] * cs) * k;
          m4.makeRotationY(a.dir); m4.setPosition(wx, wy, wz);
          for (const mesh of h.meshes) mesh.setMatrixAt(h.n, m4);
          const hg = h.meshes[0]!.geometry; this.L.sampleLit(a.x, a.z, hg.getAttribute('iAmb').array as Float32Array, hg.getAttribute('iKey').array as Float32Array, h.n * 4);
          h.n++;
        }
      }
    }
    for (const l of this.batches) for (const b of l) { b.geo.instanceCount = b.n; b.mesh.visible = b.n > 0; if (b.n) { for (const at of [b.pos, b.frame, b.c0, b.c1, b.c2, b.c3, b.pr, b.pk]) { at.clearUpdateRanges(); at.addUpdateRange(0, b.n * at.itemSize); at.needsUpdate = true; } } }
    for (const h of this.held.values()) for (const mesh of h.meshes) { mesh.count = h.n; mesh.visible = h.n > 0; if (h.n) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.getAttribute('iAmb').needsUpdate = true; mesh.geometry.getAttribute('iKey').needsUpdate = true; } }
    this.shadow.count = sn; this.shadow.instanceMatrix.needsUpdate = true;
    if (this.tick % 240 === 0) for (const [k, v] of this.blends) if (this.tick - v.seen > 200) this.blends.delete(k);
  }
  private handPos(model: number, row: number, side: 'r' | 'l'): [number, number, number] {
    const ch = this.assets.chars.chars[model]!, M = this.mats[model]!;
    const b = side === 'r' ? B.hand_r : B.hand_l, f = side === 'r' ? B.fingers_r : B.fingers_l;
    const a = ch.joints[b]!, e = ch.joints[f]!, x = (a[0] + e[0]) / 2, y = (a[1] + e[1]) / 2, z = (a[2] + e[2]) / 2;
    const o = (row * NB + b) * 12;
    return [M[o]! * x + M[o + 1]! * y + M[o + 2]! * z + M[o + 3]!, M[o + 4]! * x + M[o + 5]! * y + M[o + 6]! * z + M[o + 7]!, M[o + 8]! * x + M[o + 9]! * y + M[o + 10]! * z + M[o + 11]!];
  }
  headHeight(model: number, anim: number): number { return anim >= 6 && anim <= 12 || anim === 22 ? this.heights[model]! * 0.5 + 0.42 : this.heights[model]!; }
}
function frameOf(anim: number, clock: number): number { const c = CLIPS[anim] ?? CLIPS[0]!; return (CLIP_START[anim] ?? 0) + (Math.floor(((clock / c.dur) % 1) * c.frames) % c.frames); }
function put(at: THREE.InstancedBufferAttribute, n: number, rgb: number, a: number): void { const A = at.array as Uint8Array; A[n * 4] = (rgb >> 16) & 255; A[n * 4 + 1] = (rgb >> 8) & 255; A[n * 4 + 2] = rgb & 255; A[n * 4 + 3] = a; }
