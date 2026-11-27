import { EQUIPMENT, PRODUCTS, SEAT_TIERS, siteDef } from './data/catalog';
import { makeClassic, makeFilm, STUDIOS } from './data/films';
import { AUDS, FIXTURES, seatsOf, type WingId } from './plan';
import { NX, NZ } from './nav';
import { Rng } from './rng';
import type { AudState, GameState, SiteState } from './types';

export interface NewGameOptions { name?: string; manager?: string; avatar?: 'mgr_m' | 'mgr_f'; difficulty?: GameState['difficulty']; seed?: number }

export const DIFFICULTY = {
  matinee: { name: 'Matinee', cash: 20000, demand: 1.18, wear: 0.7, events: 0.8, blurb: 'Forgiving crowds, generous bank.' },
  feature: { name: 'Feature', cash: 12500, demand: 1, wear: 1, events: 1, blurb: 'The intended experience.' },
  directors: { name: 'Director’s Cut', cash: 8000, demand: 0.88, wear: 1.3, events: 1.3, blurb: 'Old wiring, thin margins, loud critics.' },
} as const;

export function freshAud(id: number, built: boolean, rng: Rng, tier = 0): AudState {
  const n = seatsOf(id).length;
  const seatBroken = new Array<number>(n).fill(0), seatDirt = new Array<number>(n).fill(0);
  if (tier === 0) for (let i = 0; i < n; i++) { if (rng.chance(0.17)) seatBroken[i] = 1; seatDirt[i] = rng.range(5, 45); }
  return { id, built, seatTier: tier, screenTier: tier ? 1 : 0, soundTier: tier ? 1 : 0, projTier: tier ? 1 : 0, projCond: tier ? 96 : 71, lampHours: tier ? 10 : 170, focus: tier ? 98 : 82, fault: null, seatBroken, seatDirt, program: [] };
}

export function freshSite(id: string, rng: Rng, fit: 'bare' | 'standard' | 'flagship' = 'bare'): SiteState {
  const wings: WingId[] = fit === 'bare' ? ['base'] : fit === 'standard' ? ['base', 'aud2', 'aud3', 'arcade'] : ['base', 'aud2', 'aud3', 'aud4', 'foodcourt', 'arcade', 'restroomE', 'vip'];
  const tier = fit === 'bare' ? 0 : fit === 'standard' ? 1 : 2;
  const has = (e: string) => (fit === 'bare' ? e === 'popcorn' : fit === 'standard' ? ['popcorn', 'soda', 'candy', 'hotdog', 'nachos'].includes(e) : true);
  const site: SiteState = {
    id, name: siteDef(id).name, owned: true, wings,
    auds: AUDS.map((a) => { const s = freshAud(a.id, wings.includes(a.wing), rng, tier); if (tier === 2) { s.seatTier = 2; s.projTier = 2; s.screenTier = 2; s.soundTier = 2; } return s; }),
    prices: { adult: 8, child: 5.5, senior: 6, matinee: 25, weekend: 0, vip: 6 },
    products: Object.fromEntries(PRODUCTS.map((p) => [p.id, { price: p.base, tier: 1 as const, stock: has(p.equip) ? 140 : 0, reorderAt: 40, reorderQty: 120, auto: true, enabled: true, soldToday: 0, soldTotal: 0 }])),
    recipe: { salt: 45, butter: 45, ice: 50 },
    equipment: Object.fromEntries(EQUIPMENT.map((e) => [e.id, { owned: has(e.id) && (!e.wing || wings.includes(e.wing as WingId)), cond: fit === 'bare' ? 64 : 96, broken: false }])),
    items: [], fixtures: Object.fromEntries(FIXTURES.map((f) => [f.id, { clean: fit === 'bare' ? 66 : 96, broken: false, clogged: false, user: 0 }])),
    supplies: 100, staff: [], candidates: [], boxOpen: 1, conOpen: 1,
    decor: { lobby: tier, wc: tier, prom: tier, facade: tier },
    amb: { temp: 21, music: 'jazz', volume: 40, lights: 70, scent: 20 }, policy: { strict: 45, outsideFood: false, phones: false, refunds: true, cleaningPace: 50, trailers: 10 },
    campaigns: [], litter: [], dirt: new Array<number>(NX * NZ).fill(0), jobs: [], reputation: fit === 'bare' ? 27 : 34, loyalty: 5, hvac: 78, power: true, powerOut: 0, insured: false, manager: null,
    dayRev: 0, dayCost: 0, dayGuests: 0, history: [], security: 0, heat: 0,
  };
  return site;
}

const starter: [string, number, number, 0 | 1 | 2 | 3][] = [['bin', -6.75, 5.25, 0], ['bench', 12, 3.25, 0], ['fern', -13.75, 17, 0], ['rope', -7, 9.25, 1], ['vending', 13.5, 15.5, 3]];

export function newGame(o: NewGameOptions = {}): GameState {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = new Rng(seed);
  const diff = o.difficulty ?? 'feature';
  const site = freshSite('palace', rng);
  site.name = o.name?.trim() || 'Picture Palace';
  const s: GameState = {
    v: 1, seed, rng: rng.state, name: site.name, manager: o.manager?.trim() || 'The Manager', avatar: o.avatar ?? 'mgr_m', difficulty: diff,
    day: 1, minute: 9 * 60, phase: 'prep', speed: 1, weather: 'clear', weatherNext: 'clear', cash: DIFFICULTY[diff].cash, loan: 0, loanRate: 0.0016, creditLimit: 25000, today: {}, reports: [], insolvent: 0,
    films: [], studios: STUDIOS.map((x) => ({ id: x.id, relation: 50 })), offers: [], contracts: [], nextFilm: 1, site, others: [],
    screenings: [], guests: [], groups: [], queues: {}, rating: { total: 300, guests: 50, clean: 60, tech: 40, comfort: 35, value: 55, variety: 20, stars: 2.5 }, ratingHist: [], reviews: [], news: [], thoughtLog: [],
    events: [], eventCool: {}, eventLog: [], effects: [], flags: {}, chapter: 1, done: [], stats: {}, turnedAway: 0, walkouts: 0, guestsToday: 0, satSum: 0, satN: 0, ids: 1, gameOver: null, tutorial: 0,
  };
  for (const [type, x, z, rot] of starter) site.items.push({ id: s.ids++, type, x, z, rot, cond: 90, fill: 0, broken: false, users: [], income: 0 });
  // opening slate
  const used = new Set<string>();
  const f0 = makeClassic(rng, `f${s.nextFilm++}`, 1, used)!;
  const f1 = makeFilm(rng, `f${s.nextFilm++}`, -3, used, { studio: 'brassband' });
  f1.quality = Math.max(f1.quality, 58); f1.hype = Math.max(f1.hype, 44);
  s.films.push(f0, f1);
  for (let i = 0; i < 5; i++) s.films.push(makeFilm(rng, `f${s.nextFilm++}`, rng.int(-4, 3), used));
  s.contracts.push({ id: s.ids++, filmId: f0.id, terms: { fee: 0, share: 0.3, minWeeks: 1, minShows: 1, exclusive: false }, startDay: 1, endDay: 10, showsToday: 0, gross: 0, paid: 0, breaches: 0, admissions: 0 });
  for (let i = 0; i < NX * NZ; i++) site.dirt[i] = rng.chance(0.1) ? rng.range(0, 0.35) : 0;
  const role = (r: SiteState['staff'][number]['role'], name: string, female: boolean, x: number, z: number) => site.staff.push({
    id: s.ids++, name, role: r, model: female ? 17 : 16, tint: s.ids, female, skill: rng.int(38, 55), speed: rng.int(45, 60), charm: rng.int(40, 65), honesty: rng.int(65, 90), wage: r === 'tech' ? 110 : 76, fair: r === 'tech' ? 118 : 78, morale: 66, energy: 100, hired: 1, xp: 0,
    x, z, y: 0, px: x, pz: z, py: 0, dir: 0, path: [], pi: 0, state: 'idle', anim: 0, station: '', job: 0, timer: 0, served: 0, cleaned: 0, fixed: 0, area: 'all', training: 0, carry: 0, stuck: 0,
  });
  role('box', 'June Abbott', true, -12.25, 13.5);
  role('concession', 'Otis Greer', false, -1.5, 1.75);
  role('janitor', 'Bruno Kovac', false, 3, 8);
  void SEAT_TIERS;
  s.rng = rng.state;
  return s;
}
