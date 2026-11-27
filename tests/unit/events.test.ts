import { describe, expect, it } from 'vitest';
import { EVENTS, directorTick, eligible, resolveEvent, trigger, triggerRandom } from '../../src/sim/events';
import { newGame, runDay, runTo, hire, bookEverything } from './helpers';
import { Game } from '../../src/sim/game';
const busy = (seed: number, to = 15 * 60): Game => { const g = newGame(seed, { cash: 200000 }); g.buildWing('aud2'); bookEverything(g, 3); g.autoProgram(); hire(g, 'tech'); hire(g, 'usher'); runTo(g, to); g.s.events = []; return g; };
describe('random events', () => {
  it('has a deep deck', () => { expect(EVENTS.length).toBeGreaterThanOrEqual(45); expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length); expect(new Set(EVENTS.map((e) => e.cat)).size).toBeGreaterThanOrEqual(5); });
  it('every event and every choice resolves cleanly, saves, and lets the day finish', () => {
    const bases: string[] = [];
    const variant = (seed: number, f: (g: Game) => void, until = 15 * 60) => { const g = busy(seed, Math.min(until, 15 * 60)); if (until > g.s.minute) runTo(g, until); g.s.events = []; f(g); g.s.eventCool = {}; bases.push(g.serialize()); };
    variant(3, () => {});
    variant(31, (g) => { g.s.day = 12; g.s.weather = 'storm'; for (const x of g.site.staff) { x.morale = 10; x.honesty = 30; } g.s.rating.total = 600; for (const c of g.s.contracts) { const f = g.film(c.filmId); f.star = 80; f.quality = 40; f.weeks = 2; f.cert = 'R'; f.genre = 'scifi'; f.repertory = false; } }, 19 * 60);
    variant(32, (g) => { g.s.day = 13; g.s.weather = 'heat'; g.site.decor.lobby = 2; g.site.decor.facade = 1; g.s.rating.total = 700; g.site.products.popcorn!.tier = 0; g.site.products.popcorn!.soldToday = 20; for (const c of g.s.contracts) { const f = g.film(c.filmId); f.quality = 85; f.hype = 80; f.genre = 'documentary'; f.repertory = false; } const n = g.s.films.find((f) => !g.s.contracts.some((c) => c.filmId === f.id))!; n.hype = 80; n.releaseDay = g.s.day + 3; }, 20.5 * 60);
    variant(34, (g) => { g.s.day = 2; }, 13 * 60);
    variant(33, (g) => { g.s.day = 11; for (const c of g.s.contracts) { g.film(c.filmId).cert = 'G'; c.endDay = 30; } for (const f of Object.values(g.site.equipment)) f.cond = 20; }, 11 * 60);
    const covered = new Set<string>();
    for (const base of bases) for (const def of EVENTS) {
      const probe = Game.load(base); let inst = null; try { inst = trigger(probe, def.id); } catch (e) { throw new Error(`${def.id} make: ${(e as Error).message}`); }
      if (!inst) continue;
      covered.add(def.id);
      expect(inst.title.length, def.id).toBeGreaterThan(2); expect(inst.body.length, def.id).toBeGreaterThan(10); expect(JSON.parse(JSON.stringify(inst))).toEqual(inst);
      for (let i = 0; i < Math.max(1, inst.choices.length); i++) { const g = Game.load(base); const e = trigger(g, def.id); if (!e) continue; const r = resolveEvent(g, e.id, i); expect(r.ok, `${def.id} choice ${i}: ${r.msg}`).toBe(true); expect(r.msg.length, `${def.id} choice ${i}`).toBeGreaterThan(4); expect(Number.isFinite(g.s.cash)).toBe(true); expect(g.s.events.some((x) => x.id === e.id)).toBe(false); for (let t = 0; t < 20; t++) g.step(0.1); JSON.parse(g.serialize()); }
    }
    const missed = EVENTS.map((e) => e.id).filter((id) => !covered.has(id));
    expect(missed, `never triggered: ${missed.join(', ')}`).toHaveLength(0);
  }, 240000);
  it('respects cooldowns', () => { const g = busy(4); trigger(g, 'hire'); g.s.events = []; expect(eligible(g).some((e) => e.id === 'hire')).toBe(false); g.s.day += 30; expect(g.s.eventCool.hire).toBeLessThanOrEqual(g.s.day); });
  it('differs from one game to the next', () => { const run = (seed: number) => { const g = newGame(seed); for (let d = 0; d < 4; d++) { runDay(g); g.nextDay(); } return g.s.eventLog.map((e) => e.title).join('|'); }; const a = [51, 52, 53].map(run); expect(new Set(a).size).toBe(3); });
  it('keeps a game lively without flooding it', () => { let n = 0; for (const seed of [61, 62, 63]) { const g = newGame(seed); for (let d = 0; d < 5; d++) { runDay(g); g.nextDay(); } n += g.s.stats.events ?? 0; } const perDay = n / 15; expect(perDay).toBeGreaterThan(0.9); expect(perDay).toBeLessThan(6); });
  it('bad conditions make bad events likelier', () => { const weight = (g: Game, id: string) => { const e = EVENTS.find((x) => x.id === id)!; return e.weight * (e.boost ? e.boost(g) : 1); }; const g = busy(5); g.site.dirt.fill(0); const clean = weight(g, 'rat'); g.site.dirt.fill(1); expect(weight(g, 'rat')).toBeGreaterThan(clean * 1.5); g.s.weather = 'clear'; const calm = weight(g, 'leak'); g.s.weather = 'storm'; expect(weight(g, 'leak')).toBeGreaterThan(calm * 3); expect(weight(g, 'blackout')).toBeGreaterThan(10); });
  it('choices cost what they say and refuse when broke', () => { const g = busy(6); const e = trigger(g, 'insurance')!; expect(resolveEvent(g, e.id, 0).ok).toBe(true); expect(g.site.insured).toBe(true); const p = trigger(g, 'bulbs')!; const c = g.s.cash; resolveEvent(g, p.id, 0); expect(g.s.cash).toBe(c - 220); g.s.eventCool = {}; const q = trigger(g, 'bulbs')!; g.s.cash = 0; expect(resolveEvent(g, q.id, 0).ok).toBe(false); expect(g.s.events.some((x) => x.id === q.id)).toBe(true); });
  it('the health inspector rewards the clean and punishes the filthy', () => { const run = (dirt: number) => { const g = busy(7); g.s.day = 5; g.site.dirt.fill(dirt); if (!dirt) { g.site.litter = []; for (const f of Object.values(g.site.fixtures)) f.clean = 100; for (const a of g.site.auds) a.seatDirt.fill(0); } else for (const f of Object.values(g.site.fixtures)) f.clean = 0; const c = g.s.cash; const e = trigger(g, 'inspector')!; resolveEvent(g, e.id, 0); return g.s.cash - c; }; expect(run(0)).toBeGreaterThan(0); expect(run(1)).toBeLessThan(0); });
  it('physical incidents appear on the floor and expire if ignored', () => { const g = busy(8); for (const x of [...g.site.staff]) if (x.role !== 'box') g.fire(x.id); trigger(g, 'fire'); const j = g.site.jobs.find((k) => k.kind === 'fire')!; expect(j).toBeTruthy(); runTo(g, g.s.minute + 30); expect(g.site.jobs.some((k) => k.kind === 'fire')).toBe(false); expect(g.site.equipment.popcorn!.broken).toBe(true); });
  it('a critic really walks in and really reviews', () => { const g = busy(9); g.s.day = 3; for (const c of g.s.contracts) c.endDay = 30; const e = trigger(g, 'critic'); expect(e).toBeTruthy(); resolveEvent(g, e!.id, 0); expect(g.s.guests.some((m) => m.special === 'critic')).toBe(true); runDay(g); expect(g.s.reviews.some((r) => r.source === 'critic')).toBe(true); });
  it('unanswered choices settle themselves', () => { const g = busy(10); const e = trigger(g, 'charity')!; e.expires = g.s.minute + 1; for (let t = 0; t < 30; t++) g.step(0.1); expect(g.s.events.some((x) => x.id === e.id)).toBe(false); });
  it('a blackout stops films and darkens moods', () => { const g = busy(11); const play = g.s.screenings.find((s) => s.state === 'playing'); trigger(g, 'blackout'); expect(g.site.power).toBe(false); g.step(0.1); g.step(0.1); if (play) expect(play.fault).toBe('power'); expect(g.site.jobs.some((j) => j.kind === 'power')).toBe(true); });
  void directorTick; void triggerRandom;
});
