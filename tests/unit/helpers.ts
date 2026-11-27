import { Game } from '../../src/sim/game';
import { signOffer } from '../../src/sim/market';
import type { Guest } from '../../src/sim/types';

export const newGame = (seed = 7, over: Partial<Parameters<typeof make>[1]> = {}) => make(seed, over);
function make(seed: number, over: { cash?: number; difficulty?: 'matinee' | 'feature' | 'directors' }): Game {
  const g = new Game(undefined, { seed, difficulty: over.difficulty });
  if (over.cash !== undefined) g.s.cash = over.cash;
  g.s.flags.autoProgram = 1;
  return g;
}
export function runTo(g: Game, minute: number, each?: (g: Game) => void): void {
  let n = 0;
  while (g.s.minute < minute && g.s.phase !== 'report' && n++ < 20000) { g.step(0.1); each?.(g); for (const e of [...g.s.events]) if (e.choices.length) g.chooseEvent(e.id, 0); }
}
export function runDay(g: Game, each?: (g: Game) => void): void { runTo(g, 99999, each); if (g.s.phase !== 'report') throw new Error('day never ended'); }
export function hire(g: Game, role: string): void { g.refreshCandidates(); const c = g.site.candidates.find((x) => x.role === role); if (!c) throw new Error(`no ${role}`); g.hire(c.id); }
export function bookEverything(g: Game, n = 3): void { for (const o of [...g.s.offers].filter((q) => g.film(q.filmId).releaseDay <= g.s.day).slice(0, n)) signOffer(g, o.id); }
export function until(g: Game, ok: () => boolean, max = 12000): void { let n = 0; while (!ok() && n++ < max && g.s.phase !== 'report') { g.step(0.1); for (const e of [...g.s.events]) if (e.choices.length) g.chooseEvent(e.id, e.choices.length - 1); } if (!ok()) throw new Error('condition never met'); }
/** States in which a guest is deliberately off the walking grid (in a seat, on a bench...). */
export const OFF_GRID = new Set(['seated', 'sitting', 'standing', 'bench', 'table', 'fixture', 'sink', 'enter', 'leave']);
export const firstGuest = (g: Game): Guest => g.s.guests[0]!;
