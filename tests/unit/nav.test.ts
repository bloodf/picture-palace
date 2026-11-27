import { beforeAll, describe, expect, it } from 'vitest';
import { Nav, NX, NZ, centerX, centerZ } from '../../src/sim/nav';
import { AUDS, FIXED_SOLIDS, FIXTURES, ROOMS, STATIONS, seatsOf, wallSegments, type WingId } from '../../src/sim/plan';
import { Rng } from '../../src/sim/rng';
const ALL = new Set<WingId>(ROOMS.map((r) => r.wing)), BASE = new Set<WingId>(['base']);
const street = { x: 0, z: 20.5 };
describe('navigation', () => {
  let all: Nav, base: Nav;
  beforeAll(() => { all = new Nav(); all.rebuild(ALL, []); base = new Nav(); base.rebuild(BASE, []); });
  it('reaches every seat row, station and fixture from the street when everything is open', () => {
    const pts = [...AUDS.flatMap((a) => [seatsOf(a.id)[0]!, seatsOf(a.id).at(-1)!].map((s) => ({ x: s.accessX, z: s.accessZ }))), ...STATIONS.flatMap((s) => [{ x: s.qx, z: s.qz }, { x: s.sx, z: s.sz }]), ...FIXTURES.map((f) => ({ x: f.ux, z: f.uz }))];
    for (const p of pts) expect(all.distance(street.x, street.z, p.x, p.z), JSON.stringify(p)).toBeLessThan(200);
  });
  it('cannot reach a wing that has not been built', () => { expect(base.path(0, 20, 20, 9)).toBeNull(); expect(base.path(0, 20, 6, -15)).toBeNull(); expect(base.path(0, 20, -6, -11.25)).not.toBeNull(); });
  it('never routes through a blocked cell', () => {
    const r = new Rng(3); let n = 0;
    for (let i = 0; i < 400; i++) { const a = { x: r.range(-45, 41), z: r.range(-29, 22) }, b = { x: r.range(-45, 41), z: r.range(-29, 22) }; if (!all.walkable(a.x, a.z) || !all.walkable(b.x, b.z)) continue; const p = all.path(a.x, a.z, b.x, b.z); if (!p) continue; n++; let q = { x: centerX(Math.floor((a.x + 50) * 2)), z: centerZ(Math.floor((a.z + 32) * 2)) }; for (const w of p) { const d = Math.hypot(w.x - q.x, w.z - q.z), k = Math.ceil(d / 0.1); for (let t = 0; t <= k; t++) expect(all.walkable(q.x + ((w.x - q.x) * t) / Math.max(1, k), q.z + ((w.z - q.z) * t) / Math.max(1, k))).toBe(true); q = w; } }
    expect(n).toBeGreaterThan(60);
  });
  it('keeps every walkable cell clear of walls by at least an agent radius', () => {
    const segs = wallSegments(ALL);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { if (all.blocked[j * NX + i]) continue; const x = centerX(i), z = centerZ(j); for (const s of segs) { const along = s.axis === 'z' ? x : z, across = s.axis === 'z' ? z : x; if (along > s.from && along < s.to) expect(Math.abs(across - s.at)).toBeGreaterThan(0.34); } }
  });
  it('keeps every walkable cell out of fixed furniture', () => { for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { if (all.blocked[j * NX + i]) continue; const x = centerX(i), z = centerZ(j); for (const f of FIXED_SOLIDS) expect(x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1, f.tag).toBe(false); } });
  it('routes around furniture once placed', () => { const n = new Nav(); n.rebuild(BASE, [{ x0: -2, x1: 2, z0: 8, z1: 9 }]); expect(n.walkable(0, 8.5)).toBe(false); const p = n.path(0, 6.5, 0, 11); expect(p).not.toBeNull(); expect(p!.length).toBeGreaterThan(1); });
  it('prefers short paths', () => { const d = all.distance(0, 20, 0, 16); expect(d).toBeLessThan(6); });
  it('finds the nearest free cell from inside a wall', () => { const k = all.nearestFree(-15, 5); expect(k).toBeGreaterThanOrEqual(0); expect(all.blocked[k]).toBe(0); });
  it('reachable() reports a sealed-off target', () => { const n = new Nav(); n.rebuild(BASE, [{ x0: -15, x1: 15, z0: 15.5, z1: 16 }]); expect(n.reachable(street, [{ x: 0, z: 8 }])).toBe(false); expect(base.reachable(street, [{ x: 0, z: 8 }])).toBe(true); });
  it('caches distance fields', () => { expect(all.field(5000)).toBe(all.field(5000)); });
});
