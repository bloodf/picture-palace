import { describe, expect, it } from 'vitest';
import { Rng, clamp, lerp } from '../../src/sim/rng';
describe('Rng', () => {
  it('is deterministic for a seed', () => { const a = new Rng(42), b = new Rng(42); for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next()); });
  it('differs between seeds', () => { const a = new Rng(1), b = new Rng(2); expect(Array.from({ length: 8 }, () => a.next())).not.toEqual(Array.from({ length: 8 }, () => b.next())); });
  it('resumes from saved state', () => { const a = new Rng(9); for (let i = 0; i < 50; i++) a.next(); const b = new Rng(a.state); expect(b.next()).toBe(a.next()); });
  it('stays in [0,1) and is roughly uniform', () => { const r = new Rng(3); let s = 0; for (let i = 0; i < 20000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); s += v; } expect(s / 20000).toBeCloseTo(0.5, 1); });
  it('int is inclusive at both ends', () => { const r = new Rng(4), seen = new Set<number>(); for (let i = 0; i < 500; i++) seen.add(r.int(2, 5)); expect([...seen].sort()).toEqual([2, 3, 4, 5]); });
  it('gauss has the requested mean and spread', () => { const r = new Rng(5); const v = Array.from({ length: 8000 }, () => r.gauss(10, 2)); const m = v.reduce((a, b) => a + b) / v.length; expect(m).toBeCloseTo(10, 0); expect(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)).toBeCloseTo(2, 0); });
  it('poisson has the requested mean, small and large', () => { const r = new Rng(6); for (const l of [0.3, 4, 60]) { let s = 0; for (let i = 0; i < 4000; i++) s += r.poisson(l); expect(Math.abs(s / 4000 - l)).toBeLessThan(l * 0.12 + 0.05); } });
  it('weighted never picks zero weight and returns null when nothing is eligible', () => { const r = new Rng(7); for (let i = 0; i < 300; i++) expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b'); expect(r.weighted(['a'], () => 0)).toBeNull(); expect(r.weighted([], () => 1)).toBeNull(); });
  it('shuffle keeps every element', () => { const r = new Rng(8); expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]); });
  it('clamp and lerp', () => { expect(clamp(5, 0, 3)).toBe(3); expect(clamp(-5, 0, 3)).toBe(0); expect(lerp(2, 4, 0.5)).toBe(3); });
});
