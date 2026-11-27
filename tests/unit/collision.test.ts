import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER_R, PlayerPhysics, initPhysics, solidBoxes } from '../../src/physics/player';
import { ROOMS, floorY, type WingId } from '../../src/sim/plan';
import { Rng } from '../../src/sim/rng';
const BASE = new Set<WingId>(['base']), ALL = new Set<WingId>(ROOMS.map((r) => r.wing));
const make = (w: Set<WingId>, items: Parameters<PlayerPhysics['rebuild']>[1] = []) => { const p = new PlayerPhysics(); p.rebuild(w, items); return p; };
const walk = (p: PlayerPhysics, vx: number, vz: number, secs: number) => { for (let t = 0; t < secs; t += 1 / 30) p.move(vx, vz, 1 / 30); return p.pos; };
/** Deepest penetration of the capsule's footprint into any tall solid. */
const penetration = (p: PlayerPhysics) => { const q = p.pos; let worst = 0; for (const b of p.boxes) { if (q.y + 0.4 < b.y0 || q.y + 0.35 > b.y1) continue; const dx = Math.max(b.x0 - q.x, 0, q.x - b.x1), dz = Math.max(b.z0 - q.z, 0, q.z - b.z1); const d = Math.hypot(dx, dz); if (d < PLAYER_R) worst = Math.max(worst, PLAYER_R - d); } return worst; };
describe('player collision', () => {
  beforeAll(initPhysics);
  it('stops at every lobby wall at a sprint', () => { for (const [vx, vz, check] of [[8, 0, (q: { x: number }) => q.x < 14.9], [-8, 0, (q: { x: number }) => q.x > -14.9], [0, -8, (q: { z: number }) => q.z > 3.2]] as const) { const p = make(BASE); p.teleport(0, 6.4); const q = walk(p, vx, vz, 5); expect((check as (q: { x: number; z: number }) => boolean)(q)).toBe(true); expect(penetration(p)).toBeLessThan(0.03); p.dispose(); } });
  it('cannot tunnel through a wall even with a huge time step', () => { const p = make(BASE); p.teleport(12, 9); for (let i = 0; i < 12; i++) p.move(60, 0, 0.12); expect(p.pos.x).toBeLessThan(15); p.dispose(); });
  it('walks through an open arch into the promenade', () => { const p = make(BASE); p.teleport(-10.5, 2.2); const q = walk(p, 0, -2.5, 2.2); expect(q.z).toBeLessThan(-1); p.dispose(); });
  it('walks out of the front doors and is stopped at the kerb', () => { const p = make(BASE); p.teleport(0, 16); const q = walk(p, 0, 3, 6); expect(q.z).toBeGreaterThan(18.5); expect(q.z).toBeLessThan(23); p.dispose(); });
  it('is stopped by a closed wing and admitted once it is built', () => { let p = make(BASE); p.teleport(12, 9); expect(walk(p, 3, 0, 3).x).toBeLessThan(15); p.dispose(); p = make(ALL); p.teleport(12, 9); expect(walk(p, 3, 0, 3).x).toBeGreaterThan(16); p.dispose(); });
  it('cannot walk through the concession counter, the box office or seats', () => { const p = make(BASE); p.teleport(0, 5); expect(walk(p, 0, -3, 3).z).toBeGreaterThan(3.3); p.teleport(-9, 13); expect(walk(p, -3, 0, 2).x).toBeGreaterThan(-10.75); p.teleport(-6, -9.95); expect(walk(p, 0, -3, 3).z).toBeGreaterThan(-10.7); p.dispose(); });
  it('climbs and descends the auditorium steps in the aisle', () => { const p = make(BASE); p.teleport(-10.7, -10); let q = walk(p, 0, -2.4, 5.2); expect(q.z).toBeLessThan(-19); expect(Math.abs(q.y - floorY(q.x, q.z))).toBeLessThan(0.2); q = walk(p, 0, 2.4, 7.5); expect(q.z).toBeGreaterThan(-10.9); expect(q.y).toBeGreaterThan(-0.1); p.dispose(); });
  it('collides with placed furniture', () => { const p = make(BASE, [{ x0: -1, x1: 1, z0: 9, z1: 10, h: 1 }]); p.teleport(0, 12); expect(walk(p, 0, -3, 3).z).toBeGreaterThan(10); p.dispose(); });
  it('slides along a wall instead of sticking', () => { const p = make(BASE); p.teleport(13.5, 12); const q = walk(p, 3, -2, 3); expect(q.z).toBeLessThan(8); expect(q.x).toBeLessThan(15); p.dispose(); });
  it('survives 40 frantic random walks without ever entering a solid or leaving the building', () => {
    const r = new Rng(99), p = make(ALL, [{ x0: 3, x1: 5, z0: 8, z1: 10, h: 1.2 }, { x0: -7, x1: -6, z0: 6, z1: 7, h: 1 }]);
    const starts: [number, number][] = [[0, 14], [-10.7, -10], [10, -3], [-23, 3.5], [-18, 4], [-20, 11], [20, 8], [35, 14], [-36, 8], [34, 4], [-37, -10], [35, -10], [0, 20]];
    for (let k = 0; k < 40; k++) { const s = starts[k % starts.length]!; p.teleport(s[0], s[1]); for (let i = 0; i < 14; i++) { const a = r.range(0, 6.28), v = r.range(2, 7), vx = Math.cos(a) * v, vz = Math.sin(a) * v; for (let t = 0; t < 14; t++) { p.move(vx, vz, r.range(0.01, 0.1)); expect(penetration(p)).toBeLessThan(0.06); const q = p.pos; expect(q.x).toBeGreaterThan(-46.2); expect(q.x).toBeLessThan(42.2); expect(q.z).toBeGreaterThan(-30.2); expect(q.z).toBeLessThan(23.2); expect(q.y).toBeGreaterThan(-2.6); expect(q.y).toBeLessThan(1.4); } } }
    p.dispose();
  });
  it('pulls the camera in front of walls', () => { const p = make(BASE); p.teleport(0, 17); expect(p.clearance(12, 1.6, 16, 0, 0, 1, 4)).toBeLessThan(2.2); expect(p.clearance(0, 1.6, 9, 0, 0, 1, 3)).toBeCloseTo(3, 1); p.dispose(); });
  it('builds one wall set for physics and navigation', () => { const b = solidBoxes(BASE, []); expect(b.filter((x) => x.tag === 'wall').length).toBeGreaterThan(30); expect(b.some((x) => x.tag === 'seats')).toBe(true); });
});
