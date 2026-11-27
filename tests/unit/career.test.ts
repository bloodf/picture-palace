import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { FITS, buySite, chainValue, setManager, siteNight, travelTo } from '../../src/sim/chain';
import { expectedDemand } from '../../src/sim/guests';
import { signOffer } from '../../src/sim/market';
import { CHAPTERS, OBJECTIVES, checkObjectives, currentObjectives } from '../../src/sim/objectives';
import { SITES } from '../../src/sim/data/catalog';
import { DIFFICULTY } from '../../src/sim/state';
import { newGame, runDay, runTo, bookEverything, hire } from './helpers';
describe('saving', () => {
  it('round-trips mid-day and continues identically', () => { const g = newGame(1, { cash: 60000 }); g.buildWing('aud2'); bookEverything(g, 2); g.autoProgram(); hire(g, 'tech'); runTo(g, 14 * 60); const h = Game.load(g.serialize()); for (let i = 0; i < 900; i++) { g.step(0.1); h.step(0.1); } expect(h.s.guests.length).toBe(g.s.guests.length); expect(h.s.cash).toBeCloseTo(g.s.cash, 6); expect(h.serialize()).toBe(g.serialize()); });
  it('is deterministic: same seed, same day', () => { const a = newGame(2), b = newGame(2); runDay(a); runDay(b); expect(a.serialize()).toBe(b.serialize()); });
  it('rejects unknown versions and garbage', () => { const g = newGame(3); const s = JSON.parse(g.serialize()); s.v = 99; expect(() => Game.load(JSON.stringify(s))).toThrow(); expect(() => Game.load('not json')).toThrow(); });
  it('stays a storable size', () => { const g = newGame(4); runTo(g, 20 * 60); expect(g.serialize().length).toBeLessThan(2_500_000); });
});
describe('objectives', () => {
  it('span five chapters with something to do in each', () => { expect(CHAPTERS).toHaveLength(5); for (const c of CHAPTERS) expect(OBJECTIVES.filter((o) => o.chapter === c.n).length).toBeGreaterThanOrEqual(3); });
  it('are not already done at the start', () => { const g = newGame(5); checkObjectives(g); expect(g.s.done).toEqual([]); for (const o of currentObjectives(g)) expect(o.value(g)).toBeLessThan(o.goal); });
  it('pay out once', () => { const g = newGame(6); g.s.stats.tickets = 50; const c = g.s.cash; checkObjectives(g); expect(g.s.cash).toBe(c + 600); checkObjectives(g); expect(g.s.cash).toBe(c + 600); });
  it('advance the chapter and the credit line', () => { const g = newGame(7); g.s.done = OBJECTIVES.filter((o) => o.chapter === 1).slice(0, 4).map((o) => o.id); const l = g.s.creditLimit; checkObjectives(g); expect(g.s.chapter).toBe(2); expect(g.s.creditLimit).toBeGreaterThan(l); });
});
describe('the chain', () => {
  const rich = (seed = 8) => { const g = newGame(seed, { cash: 5e6 }); g.s.chapter = 4; return g; };
  it('has eight houses, each with its own character', () => { expect(SITES).toHaveLength(8); expect(new Set(SITES.map((s) => s.theme)).size).toBeGreaterThanOrEqual(4); expect(new Set(SITES.map((s) => s.rival)).size).toBe(8); });
  it('sells property only from chapter four, and only once', () => { const g = newGame(9, { cash: 5e6 }); expect(buySite(g, 'harbor', 'bare').ok).toBe(false); g.s.chapter = 4; const c = g.s.cash; expect(buySite(g, 'harbor', 'standard').ok).toBe(true); expect(g.s.cash).toBe(c - 95000 - FITS.standard.cost); expect(buySite(g, 'harbor', 'bare').ok).toBe(false); });
  it('earns (or loses) overnight from houses you are not in', () => { const g = rich(); buySite(g, 'station', 'flagship'); runDay(g); expect(g.s.reports[0]!.ledger.chain).not.toBe(0); expect(g.s.others[0]!.history).toHaveLength(1); });
  it('better fit-outs and managers earn more', () => { const avg = (fit: keyof typeof FITS, skill: number) => { const g = rich(10); buySite(g, 'campus', fit); const st = g.s.others[0]!; st.manager!.skill = skill; st.reputation = 45; let t = 0; for (let i = 0; i < 80; i++) { const n = siteNight(g, st); t += n.rev - n.cost; } return t / 80; }; expect(avg('flagship', 60)).toBeGreaterThan(avg('bare', 60)); expect(avg('standard', 90)).toBeGreaterThan(avg('standard', 20)); });
  it('lets you move in, run the place and come back', () => { const g = rich(11); buySite(g, 'harbor', 'standard'); expect(travelTo(g, 'harbor').ok).toBe(true); expect(g.site.id).toBe('harbor'); expect(g.site.staff.length).toBeGreaterThan(3); runDay(g); expect(g.s.reports[0]!.guests).toBeGreaterThan(0); expect(travelTo(g, 'palace').ok).toBe(true); expect(g.site.id).toBe('palace'); });
  it('will not travel mid-show', () => { const g = rich(12); buySite(g, 'harbor', 'bare'); runTo(g, 12 * 60); expect(travelTo(g, 'harbor').ok).toBe(false); });
  it('hires managers and values the empire', () => { const g = rich(13); const v = chainValue(g); buySite(g, 'garden', 'bare'); expect(setManager(g, 'garden', 80).ok).toBe(true); expect(g.s.others[0]!.manager!.skill).toBe(80); expect(Number.isFinite(chainValue(g))).toBe(true); expect(v).toBeGreaterThan(0); });
});
describe('difficulty', () => {
  it('changes cash and crowds', () => { expect(DIFFICULTY.matinee.cash).toBeGreaterThan(DIFFICULTY.directors.cash); const want = (d: 'matinee' | 'directors') => { const g = newGame(71, { difficulty: d }); return expectedDemand(g, g.s.screenings[3]!); }; expect(want('matinee')).toBeGreaterThan(want('directors') * 1.2); });
  it('a sensible, hands-on week does not bankrupt a new manager', () => { for (const seed of [81, 82]) { const g = newGame(seed); g.buyEquip('soda'); hire(g, 'tech'); for (let d = 0; d < 6; d++) { const o = g.s.offers.filter((q) => g.film(q.filmId).releaseDay <= g.s.day && q.terms.fee < g.s.cash * 0.14)[0]; if (o && g.s.contracts.filter((c) => c.endDay > g.s.day).length < 2) signOffer(g, o.id); runDay(g); g.nextDay(); } expect(g.s.gameOver).toBeNull(); expect(g.s.cash).toBeGreaterThan(0); } }, 180000);
});
