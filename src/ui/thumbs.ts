import * as THREE from 'three';
import { session } from './store';
import { PROP_MATS } from '../render/materials';
import type { CharMeta } from '../render/assets';

/** Little studio photographs of props and people, taken once and kept. */
const cache = new Map<string, string>();
let R: { r: THREE.WebGLRenderer; s: THREE.Scene; c: THREE.PerspectiveCamera } | null = null;
function studio(): NonNullable<typeof R> {
  if (R) return R;
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); r.setSize(184, 184); r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0, 0);
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5040, 1.6)); const k = new THREE.DirectionalLight(0xfff0d8, 2.6); k.position.set(2, 3.5, 3); s.add(k); const f = new THREE.DirectionalLight(0xc8d8ff, 0.8); f.position.set(-3, 1.5, 1); s.add(f);
  return (R = { r, s, c: new THREE.PerspectiveCamera(26, 1, 0.05, 60) });
}
let queue: Promise<unknown> = Promise.resolve();
export function propThumb(prop: string): Promise<string> {
  const hit = cache.get(prop);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(() => new Promise<string>((res) => { requestAnimationFrame(() => { try { res(shoot(prop)); } catch { res(''); } }); }));
  queue = job;
  return job;
}
function shoot(prop: string): string {
  const A = session.engine?.assets; if (!A?.props?.[prop]) return '';
  const { r, s, c } = studio(), g = new THREE.Group();
  for (const { mat, geo } of A.propGeometry(prop)) { const d = PROP_MATS[mat]; const m = new THREE.MeshStandardMaterial({ color: d?.color ?? 0x2a6a8a, roughness: d?.rough ?? 0.5, metalness: Math.min(0.35, d?.metal ?? 0), transparent: d?.opacity !== undefined, opacity: d?.opacity ?? 1, side: THREE.DoubleSide }); if (d?.tex) m.map = A.texture(`tex/${d.tex}_c.webp`, { repeat: true }); if (d?.emissive !== undefined) { m.emissive.setHex(d.emissive); m.emissiveIntensity = Math.min(0.9, d.ei ?? 1); } g.add(new THREE.Mesh(geo, m)); }
  s.add(g);
  const b = new THREE.Box3().setFromObject(g), z = b.getSize(new THREE.Vector3()), o = b.getCenter(new THREE.Vector3()), d = Math.max(z.x, z.y, z.z) * 2.5 + 0.5;
  c.position.set(o.x + d * 0.55, o.y + d * 0.42, o.z + d * 0.78); c.lookAt(o); r.render(s, c); s.remove(g);
  const u = r.domElement.toDataURL('image/png'); cache.set(prop, u); return u;
}
/** Head-and-shoulders portrait of a cast member with their own colours. */
export function portrait(model: number, look: { top: number; hair: number; skin: number }): string {
  const key = `p${model}:${look.top}:${look.hair}:${look.skin}`; const hit = cache.get(key); if (hit) return hit;
  const A = session.engine?.assets; if (!A) return '';
  const ch = A.chars.chars[model] as CharMeta, L = ch.lods[1]!, bin = A.charBins[model]!, { r, s, c } = studio();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, L.off.p, L.nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, L.off.n, L.nv * 3), 3, true)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, L.off.u, L.nv * 2), 2)); g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, L.off.i, L.ni), 1));
  const part = new Uint8Array(bin, L.off.part, L.nv), col = new Float32Array(L.nv * 3), C = (h: number) => new THREE.Color(h), T = [C(look.skin), C(look.top), C(0x2a3550), C(0x1a1a1e), C(look.hair), C(0xffffff), C(look.top)];
  for (let i = 0; i < L.nv; i++) T[part[i]!]!.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: A.texture(`chars/${ch.id}.webp`), vertexColors: true, roughness: 0.75 })); s.add(m);
  const y = ch.height - 0.15; c.position.set(0.2, y + 0.02, 1.05); c.lookAt(0, y - 0.01, 0.02); r.render(s, c); s.remove(m);
  const u = r.domElement.toDataURL('image/png'); cache.set(key, u); return u;
}
