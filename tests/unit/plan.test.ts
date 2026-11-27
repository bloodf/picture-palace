import { describe, expect, it } from 'vitest';
import { AUDS, DOORS, FIXED_SOLIDS, FIXTURES, ROOMS, STATIONS, WINGS, floorY, roomAt, seatsOf, wallSegments, type WingId } from '../../src/sim/plan';
const ALL = new Set<WingId>(ROOMS.map((r) => r.wing));
describe('the building plan', () => {
  it('has no overlapping rooms apart from booths inside auditoriums', () => {
    for (const a of ROOMS) for (const b of ROOMS) { if (a.id >= b.id || a.kind === 'booth' || b.kind === 'booth') continue; const w = Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0), h = Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0); expect(w > 0.01 && h > 0.01, `${a.id} / ${b.id}`).toBe(false); }
  });
  it('puts every booth inside its auditorium', () => { for (const a of AUDS) { expect(a.booth.x0).toBeGreaterThan(a.rect.x0); expect(a.booth.x1).toBeLessThan(a.rect.x1); expect(a.booth.z0).toBeGreaterThan(a.rect.z0); expect(roomAt(a.cx, -7)?.id).toBe(`booth${a.id}`); } });
  it('hangs every door on a wall that exists', () => { const seg = wallSegments(new Set()); for (const d of DOORS) expect(seg.some((s) => s.axis === d.axis && s.at === d.at && s.from <= d.from && s.to >= d.to), d.id).toBe(true); });
  it('opens doors only for unlocked wings', () => { const base = wallSegments(new Set<WingId>(['base'])), all = wallSegments(ALL); const covers = (list: typeof base, x: number) => list.some((s) => s.axis === 'z' && s.at === -6 && x > s.from && x < s.to); const a2 = DOORS.find((d) => d.id === 'aud2L')!; const mid = (a2.from + a2.to) / 2; expect(covers(base, mid)).toBe(true); expect(covers(all, mid)).toBe(false); });
  it('keeps seats inside their auditorium, facing a lower floor towards the screen', () => { for (const a of AUDS) { const s = seatsOf(a.id); expect(s.length).toBe(a.rows * a.cols); for (const q of s) { expect(q.x).toBeGreaterThan(a.rect.x0 + 0.4); expect(q.x).toBeLessThan(a.rect.x1 - 0.4); expect(q.z).toBeGreaterThan(a.rect.z0 + 1.5); expect(roomAt(q.x, q.z)?.aud).toBe(a.id); } expect(s[s.length - 1]!.y).toBeLessThan(s[0]!.y); } });
  it('never overlaps two seats', () => { for (const a of AUDS) { const s = seatsOf(a.id); for (let i = 1; i < s.length; i++) if (s[i]!.row === s[i - 1]!.row) expect(s[i]!.x - s[i - 1]!.x).toBeGreaterThan(0.6); } });
  it('steps the floor down monotonically', () => { let y = 0; for (let z = -6; z > -24; z -= 0.25) { const v = floorY(-6, z); expect(v).toBeLessThanOrEqual(y + 1e-9); y = v; } expect(floorY(0, 10)).toBe(0); });
  it('places every restroom fixture and its standing spot in the right room', () => { for (const f of FIXTURES) { expect(roomAt(f.x, f.z)?.id).toBe(f.room); expect(roomAt(f.ux, f.uz)?.id).toBe(f.room); } });
  it('gives gents urinals and ladies more stalls', () => { const n = (r: string, k: string) => FIXTURES.filter((f) => f.room === r && f.kind === k).length; expect(n('wcM', 'urinal')).toBeGreaterThan(0); expect(n('wcW', 'urinal')).toBe(0); expect(n('wcW', 'toilet')).toBeGreaterThan(n('wcM', 'toilet')); });
  it('never parks a solid on a staff or customer position', () => { for (const s of STATIONS) for (const f of FIXED_SOLIDS) { const hit = (x: number, z: number) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1; expect(hit(s.sx, s.sz), `${s.id} staff / ${f.tag}`).toBe(false); expect(hit(s.qx, s.qz), `${s.id} queue / ${f.tag}`).toBe(false); } });
  it('prices every wing', () => { for (const w of WINGS) { expect(w.cost).toBeGreaterThan(0); expect(ROOMS.some((r) => r.wing === w.id)).toBe(true); } });
});
