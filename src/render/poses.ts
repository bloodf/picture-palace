/**
 * Character animation. Clips are written as pose functions in body-relative directions, so one clip fits a child and
 * a heavy-set man alike; a small solver turns each pose into bone matrices for a particular skeleton.
 */
import type { CharMeta } from './assets';

export type V3 = [number, number, number];
export interface Pose {
  root: V3; pr: V3; sp: V3; nk: V3; hd: V3;
  La: V3; Lf: V3; Ra: V3; Rf: V3; Lt: V3; Lc: V3; Rt: V3; Rc: V3; lf: number; rf: number; lh: V3; rh: V3; sit?: number; grip: number;
}
const base = (): Pose => ({ root: [0, 0, 0], pr: [0, 0, 0], sp: [0, 0, 0], nk: [0, 0, 0], hd: [0, 0, 0], La: [0.2, -1, 0.02], Lf: [0.1, -1, 0.18], Ra: [-0.2, -1, 0.02], Rf: [-0.1, -1, 0.18], Lt: [0.05, -1, 0.02], Lc: [0.03, -1, -0.02], Rt: [-0.05, -1, 0.02], Rc: [-0.03, -1, -0.02], lf: 0, rf: 0, lh: [0, 0, 0], rh: [0, 0, 0], grip: 0.4 });
const S = (t: number, k = 1, o = 0) => Math.sin((t * k + o) * Math.PI * 2);
const bell = (t: number, c: number, w: number) => { let d = t - c; d -= Math.round(d); return Math.exp(-((d / w) ** 2)); };
const ease = (x: number) => { const c = x < 0 ? 0 : x > 1 ? 1 : x; return c * c * (3 - 2 * c); };

function gait(t: number, run: number): Pose {
  const p = base();
  const leg = (u: number): [V3, V3, number] => {
    const amp = run ? 0.72 : 0.46;
    const hip = amp * Math.cos(u * Math.PI * 2) + (run ? 0.18 : 0.05);
    const knee = 0.08 + 0.22 * bell(u, 0.12, 0.08) + (run ? 1.7 : 1.02) * bell(u, run ? 0.68 : 0.71, run ? 0.15 : 0.12) + (run ? 0.25 : 0);
    const foot = -0.28 * bell(u, 0.98, 0.07) + 0.62 * bell(u, 0.57, 0.08);
    return [[0, -Math.cos(hip), Math.sin(hip)], [0, -Math.cos(hip - knee), Math.sin(hip - knee)], foot + (hip - knee) * -0.0];
  };
  const [lt, lc, lf] = leg(t), [rt, rc, rf] = leg((t + 0.5) % 1);
  p.Lt = [0.035, lt[1], lt[2]]; p.Lc = [0.02, lc[1], lc[2]]; p.Rt = [-0.035, rt[1], rt[2]]; p.Rc = [-0.02, rc[1], rc[2]]; p.lf = lf; p.rf = rf;
  const sw = run ? 0.75 : 0.42;
  const arm = (k: number): [V3, V3] => { const a = sw * k + (run ? -0.1 : -0.02), e = a + (run ? 1.25 : 0.32 + 0.18 * Math.max(0, k)); return [[0.14, -Math.cos(a), Math.sin(a)], [0.05, -Math.cos(e), Math.sin(e)]]; };
  const [la, lfa] = arm(-Math.cos(t * Math.PI * 2)), [ra, rfa] = arm(Math.cos(t * Math.PI * 2));
  p.La = la; p.Lf = lfa; p.Ra = [-ra[0], ra[1], ra[2]]; p.Rf = [-rfa[0], rfa[1], rfa[2]];
  p.pr = [run ? 0.12 : 0.02, 0.1 * Math.cos(t * Math.PI * 2), 0.03 * Math.sin(t * Math.PI * 2)];
  p.sp = [run ? 0.16 : 0.045, -0.17 * Math.cos(t * Math.PI * 2), -0.03 * Math.sin(t * Math.PI * 2)];
  p.hd = [run ? -0.12 : -0.02, 0.05 * Math.cos(t * Math.PI * 2), 0];
  p.root = [0.012 * Math.sin(t * Math.PI * 2), 0, 0];
  return p;
}
const carryArms = (p: Pose, t: number): Pose => { p.Ra = [-0.22, -0.93, 0.18]; p.Rf = [0.18, 0.12 + 0.02 * S(t), 1]; p.La = [0.22, -0.95, 0.12]; p.Lf = [-0.12, 0.05 + 0.02 * S(t, 1, 0.3), 1]; p.grip = 0.7; return p; };
const seated = (t: number): Pose => {
  const p = base();
  p.sit = 0.53; p.root = [0, 0, -0.1]; p.sp = [-0.1 + 0.012 * S(t), 0, 0]; p.nk = [0.06, 0, 0]; p.hd = [0.04, 0.04 * S(t, 1, 0.2), 0];
  p.Lt = [0.16, -0.06, 1]; p.Lc = [0.05, -1, 0.08]; p.Rt = [-0.16, -0.06, 1]; p.Rc = [-0.05, -1, 0.08];
  p.La = [0.3, -0.95, 0.18]; p.Lf = [0.05, -0.12, 1]; p.Ra = [-0.3, -0.95, 0.18]; p.Rf = [-0.05, -0.12, 1];
  return p;
};
export interface Clip { name: string; dur: number; frames: number; fn: (t: number) => Pose }
const clip = (name: string, dur: number, fn: (t: number) => Pose): Clip => ({ name, dur, frames: Math.max(4, Math.round(dur * 12)), fn });

/** Order must match ANIM in sim/anims.ts */
export const CLIPS: Clip[] = [
  clip('idle', 4, (t) => { const p = base(); p.sp = [0.015 * S(t), 0, 0.02 * S(t, 1, 0.25)]; p.root = [0.015 * S(t, 1, 0.25), 0, 0]; p.hd = [0.02 * S(t, 1, 0.1), 0.12 * S(t), 0]; p.La[2] += 0.02 * S(t); return p; }),
  clip('look', 5, (t) => { const p = base(); p.Rf = [0.45, -0.55, 0.5]; p.Ra = [-0.42, -0.9, -0.1]; const y = 0.6 * (ease((t - 0.1) * 6) - ease((t - 0.45) * 5)) - 0.5 * (ease((t - 0.55) * 6) - ease((t - 0.9) * 8)); p.hd = [-0.1 * Math.abs(y), y, 0]; p.sp = [0.01 * S(t), y * 0.3, 0]; p.pr = [0, y * 0.1, 0]; p.root = [0.02 * S(t), 0, 0]; return p; }),
  clip('walk', 1, (t) => gait(t, 0)),
  clip('run', 0.66, (t) => gait(t, 1)),
  clip('carryWalk', 1, (t) => carryArms(gait(t, 0), t)),
  clip('carryIdle', 4, (t) => { const p = carryArms(base(), t); p.hd = [0.02, 0.22 * S(t), 0]; p.sp = [0, 0.06 * S(t), 0]; if (t > 0.55 && t < 0.85) { const k = Math.sin(((t - 0.55) / 0.3) * Math.PI); p.Rf = [0.25, 0.12 + 0.9 * k, 1 - 0.5 * k]; } return p; }),
  clip('sit', 4, (t) => seated(t)),
  clip('sitEat', 3, (t) => { const p = seated(t); p.La = [0.25, -0.95, 0.25]; p.Lf = [-0.28, 0.1, 0.9]; const k = Math.max(0, S(t, 1)) ** 0.7; p.Ra = [-0.3, -0.9, 0.25 + 0.25 * k]; p.Rf = [0.3, 0.15 + 1.1 * k, 0.85 - 0.35 * k]; p.hd = [0.12 * k, 0, 0]; p.grip = 0.8; return p; }),
  clip('sitLaugh', 1.2, (t) => { const p = seated(t); const b = Math.abs(S(t, 2)); p.sp = [-0.22 + 0.14 * b, 0.05 * S(t), 0]; p.hd = [-0.25 + 0.15 * b, 0.1 * S(t), 0]; p.Ra = [-0.3, -0.9, 0.3]; p.Rf = [0.55, 0.25 + 0.1 * b, 0.55]; return p; }),
  clip('sitScared', 1.6, (t) => { const p = seated(t); const j = 0.02 * S(t, 7); p.sp = [-0.2, 0.12, 0.03 + j]; p.hd = [0.1, 0.35, 0]; p.La = [0.35, -0.6, 0.75]; p.Lf = [-0.35, 0.9, 0.15 + j]; p.Ra = [-0.35, -0.6, 0.75]; p.Rf = [0.35, 0.95, 0.1 - j]; p.Lt = [0.12, 0.1, 1]; p.Rt = [-0.12, 0.1, 1]; return p; }),
  clip('sitSleep', 5, (t) => { const p = seated(t); p.sp = [-0.22 + 0.03 * S(t), 0, 0.08]; p.nk = [0.1, 0, 0.25]; p.hd = [0.15, 0.1, 0.3]; p.Lf = [-0.3, -0.35, 0.85]; p.Rf = [0.3, -0.35, 0.85]; return p; }),
  clip('sitClap', 0.6, (t) => { const p = seated(t); const k = 0.5 + 0.5 * S(t, 2); p.La = [0.32, -0.75, 0.5]; p.Lf = [-0.32 + 0.34 * k, 0.55, 0.75]; p.Ra = [-0.32, -0.75, 0.5]; p.Rf = [0.32 - 0.34 * k, 0.55, 0.75]; p.sp = [0.02, 0, 0]; p.hd = [-0.05, 0, 0]; return p; }),
  clip('sitSad', 3, (t) => { const p = seated(t); p.hd = [0.35, 0.05, 0]; p.sp = [0.05, 0, 0]; const k = 0.04 * S(t, 3); p.Ra = [-0.25, -0.7, 0.6]; p.Rf = [0.28 + k, 0.95, 0.15]; return p; }),
  clip('talk', 4, (t) => { const p = base(); p.Ra = [-0.25, -0.95, 0.15]; p.Rf = [0.05 - 0.25 * S(t), 0.05 + 0.3 * Math.max(0, S(t, 2)), 0.9]; p.La = [0.25, -0.95, 0.1]; p.Lf = [-0.1 + 0.2 * S(t, 1, 0.3), -0.25 + 0.3 * Math.max(0, S(t, 1, 0.4)), 0.85]; p.hd = [0.05 * S(t, 3), 0.15 * S(t), 0.05 * S(t, 2)]; p.sp = [0.02, 0.06 * S(t), 0]; p.root = [0.02 * S(t), 0, 0]; return p; }),
  clip('angry', 2, (t) => { const p = base(); const k = Math.max(0, S(t, 2)); p.Ra = [-0.4, -0.2 + 0.3 * k, 0.8]; p.Rf = [0.05, 0.9, 0.45 + 0.3 * k]; p.La = [0.45, -0.85, -0.1]; p.Lf = [-0.6, -0.45, 0.35]; p.sp = [0.1 + 0.06 * k, 0.1 * S(t), 0]; p.hd = [0.02, 0.12 * S(t, 2), 0]; p.grip = 1; return p; }),
  clip('cheer', 1.2, (t) => { const p = base(); const k = Math.abs(S(t, 1)); p.La = [0.35, 0.7 + 0.2 * k, 0.2]; p.Lf = [0.1, 1, 0.1]; p.Ra = [-0.35, 0.7 + 0.2 * k, 0.2]; p.Rf = [-0.1, 1, 0.1]; p.sp = [-0.12, 0, 0.05 * S(t)]; p.hd = [-0.2, 0, 0]; p.root = [0, 0.09 * k, 0]; p.grip = 0.9; return p; }),
  clip('phone', 5, (t) => { const p = base(); p.Ra = [-0.2, -0.95, 0.25]; p.Rf = [0.3, 0.45, 0.75]; p.hd = [0.38 + 0.03 * S(t), 0, 0]; p.nk = [0.15, 0, 0]; p.sp = [0.05, 0, 0]; p.La = [0.25, -1, 0]; p.Lf = [-0.2, -0.7, 0.4]; p.grip = 0.8; return p; }),
  clip('mop', 1.6, (t) => { const p = base(); const k = S(t); p.La = [0.15, -0.85, 0.45]; p.Lf = [-0.4 + 0.15 * k, -0.5, 0.75]; p.Ra = [-0.2, -0.7, 0.55]; p.Rf = [0.25 + 0.3 * k, 0.0, 0.85]; p.sp = [0.3, 0.28 * k, 0]; p.hd = [0.15, -0.1 * k, 0]; p.root = [0.05 * k, 0, 0]; p.Lt = [0.12, -1, 0.12]; p.Rt = [-0.12, -1, -0.1]; p.grip = 1; return p; }),
  clip('serve', 2.4, (t) => { const p = base(); const k = S(t); p.Ra = [-0.15, -0.85, 0.45 + 0.15 * k]; p.Rf = [0.1, 0.05 + 0.1 * k, 0.95]; p.La = [0.15, -0.85, 0.45 - 0.15 * k]; p.Lf = [-0.1, 0.05 - 0.1 * k, 0.95]; p.sp = [0.1, 0.22 * k, 0]; p.hd = [0.12 - 0.1 * Math.abs(k), -0.1 * k, 0]; return p; }),
  clip('repair', 1.4, (t) => { const p = base(); const k = S(t, 2); p.sit = 0.44; p.root = [0, 0, 0]; p.Lt = [0.18, -0.15, 1]; p.Lc = [0.03, -1, -0.05]; p.Rt = [-0.12, -0.85, 0.35]; p.Rc = [-0.02, -0.35, -0.94]; p.rf = 1.0; p.sp = [0.45, 0, 0]; p.hd = [0.1, 0, 0]; p.Ra = [-0.2, -0.6, 0.75]; p.Rf = [0.25 + 0.1 * k, -0.35 + 0.2 * k, 0.9]; p.La = [0.2, -0.6, 0.7]; p.Lf = [-0.25, -0.45, 0.85]; p.grip = 1; return p; }),
  clip('wave', 1.4, (t) => { const p = base(); p.Ra = [-0.6, 0.35, 0.2]; p.Rf = [-0.2 + 0.4 * S(t, 2), 1, 0.15]; p.hd = [-0.05, -0.1, 0.06]; p.sp = [0, 0, 0.04]; p.grip = 0.1; return p; }),
  clip('use', 1.8, (t) => { const p = base(); const k = S(t, 3), j = S(t, 2, 0.2); p.Ra = [-0.15, -0.75, 0.6]; p.Rf = [0.12 + 0.05 * k, 0.2, 0.95]; p.La = [0.15, -0.75, 0.6]; p.Lf = [-0.12 + 0.05 * j, 0.2 + 0.06 * k, 0.95]; p.sp = [0.12, 0.05 * j, 0]; p.hd = [0.12, 0.04 * S(t), 0]; p.root = [0.02 * j, 0, 0]; return p; }),
  clip('sitBored', 5, (t) => { const p = seated(t); p.sp = [0.02, 0.08, 0.14]; p.nk = [0, 0, -0.1]; p.hd = [0.05, 0.2 * S(t), -0.12]; p.Ra = [-0.3, -0.85, 0.35]; p.Rf = [0.3, 0.95, 0.25]; p.Lf = [-0.2, -0.1, 0.95]; return p; }),
  clip('tap', 1.4, (t) => { const p = base(); p.La = [0.2, -0.85, 0.3]; p.Lf = [-0.75, 0.1, 0.6]; p.Ra = [-0.2, -0.85, 0.3]; p.Rf = [0.7, 0.0, 0.65]; p.rf = -0.35 * Math.max(0, S(t, 2)); p.hd = [-0.05, 0.25 * S(t), 0.05]; p.root = [0.04, 0, 0]; return p; }),
  clip('hold', 4, (t) => { const p = base(); p.Ra = [-0.2, -0.9, 0.35]; p.Rf = [0.2, 0.2, 0.9]; p.La = [0.2, -0.9, 0.3]; p.Lf = [-0.3, 0.15, 0.9]; p.hd = [0.2, 0.1 * S(t), 0]; return p; }),
];
export const CLIP_START: number[] = [];
export const TOTAL_FRAMES = (() => { let n = 0; for (const c of CLIPS) { CLIP_START.push(n); n += c.frames; } return n; })();

// ---------------------------------------------------------------- tiny matrix/quat kit (column-major 3x3)
type M3 = Float64Array;
const I3 = (): M3 => Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
const mul = (a: M3, b: M3): M3 => { const o = new Float64Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r]! * b[c * 3]! + a[3 + r]! * b[c * 3 + 1]! + a[6 + r]! * b[c * 3 + 2]!; return o; };
const app = (m: M3, v: V3): V3 => [m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2], m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2], m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2]];
const euler = (x: number, y: number, z: number): M3 => { const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z); const X = Float64Array.of(1, 0, 0, 0, cx, sx, 0, -sx, cx), Y = Float64Array.of(cy, 0, -sy, 0, 1, 0, sy, 0, cy), Z = Float64Array.of(cz, sz, 0, -sz, cz, 0, 0, 0, 1); return mul(mul(Y, X), Z); };
const nrm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function between(a: V3, b: V3): M3 {
  a = nrm(a); b = nrm(b);
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let ax: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = Math.hypot(...ax);
  if (s < 1e-6) { if (c > 0) return I3(); ax = Math.abs(a[0]) < 0.9 ? nrm([0, -a[2], a[1]]) : nrm([-a[1], a[0], 0]); return rot(ax, Math.PI); }
  return rot([ax[0] / s, ax[1] / s, ax[2] / s], Math.atan2(s, c));
}
function rot(u: V3, th: number): M3 { const c = Math.cos(th), s = Math.sin(th), k = 1 - c, [x, y, z] = u; return Float64Array.of(c + x * x * k, y * x * k + z * s, z * x * k - y * s, x * y * k - z * s, c + y * y * k, z * y * k + x * s, x * z * k + y * s, y * z * k - x * s, c + z * z * k); }

export const B = { pelvis: 0, spine_01: 1, spine_02: 2, spine_03: 3, neck_01: 4, head: 5, clavicle_l: 6, upperarm_l: 7, lowerarm_l: 8, hand_l: 9, fingers_l: 10, clavicle_r: 11, upperarm_r: 12, lowerarm_r: 13, hand_r: 14, fingers_r: 15, thigh_l: 16, calf_l: 17, foot_l: 18, ball_l: 19, thigh_r: 20, calf_r: 21, foot_r: 22, ball_r: 23 } as const;
export const NB = 24;

/** Rotation (3x3) and position per bone for a pose on a given skeleton. */
export function solve(p: Pose, ch: CharMeta, parent: number[]): { R: M3[]; P: V3[] } {
  const J = ch.joints as V3[];
  const R: M3[] = new Array<M3>(NB), P: V3[] = new Array<V3>(NB);
  const scale = J[0]![1] / 0.94;
  R[0] = euler(p.pr[0], p.pr[1], p.pr[2]);
  const third = euler(p.sp[0] / 3, p.sp[1] / 3, p.sp[2] / 3);
  R[1] = mul(R[0], third); R[2] = mul(R[1], third); R[3] = mul(R[2], third);
  R[4] = mul(R[3], euler(p.nk[0], p.nk[1], p.nk[2])); R[5] = mul(R[4], euler(p.hd[0], p.hd[1], p.hd[2]));
  const limb = (frame: M3, a: number, b: number, c: number, end: V3, da: V3, db: V3) => {
    const r1 = sub(J[b]!, J[a]!), r2 = sub(J[c]!, J[b]!);
    R[a] = mul(frame, between(r1, da));
    const cur = app(R[a]!, r2), want = app(frame, db);
    R[b] = mul(between(cur, want), R[a]!);
    R[c] = R[b]!;
    void end;
  };
  R[6] = R[3]!; R[11] = R[3]!;
  limb(R[3]!, 7, 8, 9, ch.tails.hand_l as V3, p.La, p.Lf); limb(R[3]!, 12, 13, 14, ch.tails.hand_r as V3, p.Ra, p.Rf);
  R[9] = mul(R[8]!, euler(...p.lh)); R[14] = mul(R[13]!, euler(...p.rh));
  R[10] = mul(R[9]!, rot(nrm(sub(J[9]!, J[8]!)), 0)); R[15] = R[14]!;
  // curl fingers about the axis across the palm
  const curl = (h: number, f: number) => { const d = nrm(sub(J[f]!, J[h]!)); const ax = nrm([d[2], 0, -d[0]]); return rot(ax, p.grip * 0.9); };
  R[10] = mul(R[9]!, curl(9, 10)); R[15] = mul(R[14]!, curl(14, 15));
  const hips = euler(0, p.pr[1], 0);
  limb(hips, 16, 17, 18, [0, 0, 0], p.Lt, p.Lc); limb(hips, 20, 21, 22, [0, 0, 0], p.Rt, p.Rc);
  // feet stay level with the floor plus their own pitch
  R[18] = mul(hips, euler(p.lf, 0, 0)); R[22] = mul(hips, euler(p.rf, 0, 0));
  R[19] = mul(hips, euler(Math.min(0, p.lf) * 0.3 + Math.max(0, p.lf) * 0.25, 0, 0)); R[23] = mul(hips, euler(Math.min(0, p.rf) * 0.3 + Math.max(0, p.rf) * 0.25, 0, 0));
  P[0] = [J[0]![0] + p.root[0], J[0]![1], J[0]![2] + p.root[2]];
  for (let b = 1; b < NB; b++) { const q = parent[b]!; P[b] = add(P[q]!, app(R[q]!, sub(J[b]!, J[q]!))); }
  let lift = 0;
  if (p.sit !== undefined) lift = p.sit * (p.sit < 0.5 ? scale : 1) - P[0]![1];
  else {
    let low = Infinity;
    for (const [f, t] of [[18, 19], [22, 23]] as const) {
      const a = J[f]!;
      for (const q of [[a[0], 0, a[2] - 0.05] as V3, [J[t]![0], 0, J[t]![2]] as V3]) { const w = add(P[f]!, app(R[f]!, sub(q, a))); low = Math.min(low, w[1]); }
      const toe = ch.tails[t === 19 ? 'ball_l' : 'ball_r'] as V3; const w = add(P[t]!, app(R[t]!, sub([toe[0], 0, toe[2]], J[t]!))); low = Math.min(low, w[1]);
    }
    lift = -low;
  }
  for (let b = 0; b < NB; b++) P[b]![1] += lift + p.root[1];
  return { R, P };
}
/** rows = frames, 3 RGBA texels per bone: a row-major 3x4 skinning matrix. */
export function bakeClips(ch: CharMeta, parent: number[]): Float32Array {
  const out = new Float32Array(TOTAL_FRAMES * NB * 12);
  const J = ch.joints as V3[];
  CLIPS.forEach((c, ci) => {
    for (let f = 0; f < c.frames; f++) {
      const { R, P } = solve(c.fn(f / c.frames), ch, parent);
      for (let b = 0; b < NB; b++) {
        const m = R[b]!, t = sub(P[b]!, app(m, J[b]!)), o = ((CLIP_START[ci]! + f) * NB + b) * 12;
        out[o] = m[0]!; out[o + 1] = m[3]!; out[o + 2] = m[6]!; out[o + 3] = t[0];
        out[o + 4] = m[1]!; out[o + 5] = m[4]!; out[o + 6] = m[7]!; out[o + 7] = t[1];
        out[o + 8] = m[2]!; out[o + 9] = m[5]!; out[o + 10] = m[8]!; out[o + 11] = t[2];
      }
    }
  });
  return out;
}
