import { describe, expect, it } from 'vitest';
import { wallSegments } from '../../src/sim/plan';
import { setPath, moveAlong } from '../../src/sim/guests';
import { Rng } from '../../src/sim/rng';
import { OFF_GRID, bookEverything, hire, newGame, runDay } from './helpers';

describe('people and solid things', () => {
  it('no guest or employee is ever inside a wall during a whole busy day', () => {
    const g = newGame(11, { cash: 200000 });
    g.buildWing('aud2'); g.buildWing('arcade'); bookEverything(g); g.autoProgram();
    for (const r of ['tech', 'usher', 'janitor', 'concession', 'security']) hire(g, r);
    for (const [t, x, z] of [['arcadeA', -34, 8], ['arcadeB', -36, 8], ['bin', 7, 8], ['table', 10, 8], ['sofa', 10, 12]] as const) g.placeItem(t, x, z, 0);
    const segs = wallSegments(g.unlocked);
    let samples = 0, tick = 0;
    runDay(g, () => {
      if (tick++ % 11) return;
      for (const m of [...g.s.guests, ...g.site.staff.filter((x) => x.state !== 'off')]) { samples++; for (const s of segs) { const along = s.axis === 'z' ? m.x : m.z, across = s.axis === 'z' ? m.z : m.x; if (along > s.from && along < s.to) expect(Math.abs(across - s.at), `${m.name} at ${m.x.toFixed(2)},${m.z.toFixed(2)}`).toBeGreaterThan(0.15); } }
    });
    expect(samples).toBeGreaterThan(5000);
  });
  it('walking guests only ever stand on walkable floor', () => { const g = newGame(12); let tick = 0; runDay(g, () => { if (tick++ % 9) return; for (const m of g.s.guests) if (!OFF_GRID.has(m.state)) expect(g.nav.walkable(m.x, m.z), `${m.state} ${m.x.toFixed(2)},${m.z.toFixed(2)}`).toBe(true); }); });
  it('never seats two guests in one seat', () => { const g = newGame(13); let tick = 0; runDay(g, () => { if (tick++ % 40) return; for (const s of g.s.screenings) { const taken = s.seats.filter(Boolean); expect(new Set(taken).size).toBe(taken.length); } const spots = g.s.guests.filter((m) => m.state === 'seated').map((m) => `${m.screening}:${m.seat}`); expect(new Set(spots).size).toBe(spots.length); }); });
  it('pushes overlapping walkers apart without leaving the floor', () => {
    const g = newGame(14), r = new Rng(5);
    const mk = (id: number) => ({ id, x: 0.25, z: 12.25, y: 0, px: 0, pz: 0, py: 0, dir: 0, path: [], pi: 0, stuck: 0 });
    const crowd = Array.from({ length: 14 }, (_, i) => mk(-1 - i));
    for (const c of crowd) setPath(g, c, r.range(-6, 6), r.range(6, 15));
    for (let t = 0; t < 80; t++) { g.hash.clear(); for (const c of crowd) { const k = Math.floor(c.x) * 1000 + Math.floor(c.z); const l = g.hash.get(k) ?? []; l.push(c as never); g.hash.set(k, l); } for (const c of crowd) { moveAlong(g, c, 1.6, 0.1, true); expect(g.nav.walkable(c.x, c.z)).toBe(true); } }
    const d = crowd.map((c) => `${c.x.toFixed(1)},${c.z.toFixed(1)}`); expect(new Set(d).size).toBeGreaterThan(8);
  });
  it('guests give way to the player', () => { const g = newGame(15); const a = { id: -1, x: -2, z: 10.25, y: 0, px: 0, pz: 0, py: 0, dir: 0, path: [] as { x: number; z: number }[], pi: 0, stuck: 0 }; g.player = { active: true, x: 0, y: 0, z: 10.25 }; setPath(g, a, 4, 10.25); let near = 9; for (let t = 0; t < 60; t++) { moveAlong(g, a, 1.6, 0.1, true); near = Math.min(near, Math.hypot(a.x, a.z - 10.25)); } expect(near).toBeGreaterThan(0.1); expect(a.x).toBeGreaterThan(2); });
});
