import { FIRST_F, FIRST_M, LAST, SITES, siteDef } from './data/catalog';
import { clamp } from './rng';
import { freshSite } from './state';
import { seatsOf } from './plan';
import { clearGuests } from './guests';
import { buildScreenings, autoProgram } from './screenings';
import { assignStations } from './staff';
import { computeRating } from './rating';
import { fmt, no, ok, DAY_FACTOR, type Game, type Result } from './game';
import type { SiteState } from './types';

export const FITS = { bare: { name: 'As found', cost: 0, blurb: 'One working screen and a popcorn machine.' }, standard: { name: 'Three-screen refit', cost: 60000, blurb: 'Three screens, digital, cushioned seats, arcade.' }, flagship: { name: 'Flagship', cost: 190000, blurb: 'Four laser screens, recliners, food hall, lounge.' } } as const;

export function ownedSites(g: Game): SiteState[] { return [g.s.site, ...g.s.others]; }
export function buySite(g: Game, id: string, fit: keyof typeof FITS): Result {
  const d = SITES.find((x) => x.id === id);
  if (!d) return no('No such property.');
  if (ownedSites(g).some((x) => x.id === id)) return no('You already own it.');
  if (g.s.chapter < 4) return no('The bank only funds a second house once you reach chapter 4.');
  const cost = Math.round((d.cost + FITS[fit].cost) * (1 - Math.min(0.25, g.effect('propertyDiscount'))));
  const r = g.spend('chain', cost);
  if (!r.ok) return r;
  const st = freshSite(id, g.rng, fit);
  st.manager = { name: `${g.rng.pick(g.rng.chance(0.5) ? FIRST_F : FIRST_M)} ${g.rng.pick(LAST)}`, skill: 45, wage: 170 };
  st.reputation = 30 + g.site.reputation * 0.18;
  g.s.others.push(st);
  g.stat('sites');
  g.news('good', `${d.name} on ${d.district} joins the chain.`);
  g.emit({ type: 'sound', id: 'fanfare' });
  return ok(`${d.name} is yours for ${fmt(cost)}.`);
}
/** One night of trading at a house you are not standing in. Net result in dollars. */
export function siteNight(g: Game, st: SiteState): { rev: number; cost: number; guests: number; sat: number } {
  const d = siteDef(st.id);
  const built = st.auds.filter((a) => a.built);
  const skill = st.manager?.skill ?? 22;
  const films = g.s.contracts.filter((c) => g.s.day >= c.startDay && g.s.day <= c.endDay).map((c) => g.film(c.filmId)).filter(Boolean).sort((a, b) => b.hype - a.hype).slice(0, built.length);
  const pull = films.length ? films.reduce((a, f) => a + f.hype + f.wom, 0) / films.length : 18;
  const tech = built.reduce((a, x) => a + x.projTier + x.screenTier + x.soundTier + x.seatTier, 0) / Math.max(1, built.length) / 8;
  const cap = built.reduce((a, x) => a + seatsOf(x.id).length, 0) * 5;
  const want = 150 * d.traffic * DAY_FACTOR[g.weekday]! * (0.45 + st.reputation / 80) * (pull / 50) * (0.7 + built.length * 0.32) * (0.8 + skill / 250) * g.rng.range(0.85, 1.15);
  const guests = Math.round(Math.min(cap * 0.82, want));
  const price = st.prices.adult * 0.93 * (0.7 + 0.3 * d.wealth);
  const eq = Object.values(st.equipment).filter((e) => e.owned).length;
  const perHead = (1.6 + eq * 0.42) * (0.7 + skill / 160) * d.wealth;
  const rev = guests * (price * 0.52 + perHead);
  const staff = 5 + built.length * 2.2 + (st.wings.includes('foodcourt') ? 3 : 0);
  const cost = staff * 82 + d.rent + st.wings.length * 14 + (st.manager?.wage ?? 0) + 60 + built.length * 20;
  const sat = clamp(38 + tech * 36 + (skill - 40) * 0.35 + g.rng.gauss(0, 4), 5, 97);
  return { rev, cost, guests, sat };
}
export function simulateOthers(g: Game): void {
  for (const st of g.s.others) {
    const n = siteNight(g, st);
    g.money('chain', Math.round(n.rev - n.cost));
    st.history.push({ day: g.s.day, rev: n.rev, cost: n.cost, guests: n.guests, sat: n.sat });
    if (st.history.length > 60) st.history.shift();
    st.reputation = clamp(st.reputation + (n.sat - 52) * 0.05, 0, 100);
    if (g.rng.chance(0.07)) {
      const bad = g.rng.chance(0.65 - (st.manager?.skill ?? 20) / 240);
      const d = siteDef(st.id);
      if (bad) { const c = g.rng.int(200, 1200); g.money('chain', -c); st.reputation = clamp(st.reputation - 3, 0, 100); g.news('bad', `${d.name}: ${g.rng.pick(['a burst pipe', 'a till came up short', 'the projector died mid-premiere', 'a health inspector called', 'the boiler gave up'])}. ${fmt(c)}.`); }
      else { st.reputation = clamp(st.reputation + 3, 0, 100); g.news('good', `${d.name}: ${g.rng.pick(['a local paper ran a glowing feature', 'a sold-out singalong', 'the manager won an industry pin', 'a film club moved in'])}.`); }
    }
  }
}
/** Move into another house. Only between days. */
export function travelTo(g: Game, id: string): Result {
  if (g.s.phase !== 'report' && g.s.phase !== 'prep') return no('Travel before opening or after closing.');
  const i = g.s.others.findIndex((x) => x.id === id);
  if (i < 0) return no('You don’t own that house.');
  const next = g.s.others[i]!;
  const cur = g.s.site;
  clearGuests(g);
  if (!cur.manager) cur.manager = { name: `${g.rng.pick(FIRST_F)} ${g.rng.pick(LAST)}`, skill: 45, wage: 170 };
  g.s.others[i] = cur;
  g.s.site = next;
  if (!next.staff.length) {
    const roles = ['box', 'concession', 'janitor', 'tech', 'usher'] as const;
    for (const role of roles) next.staff.push({ id: g.id(), name: `${g.rng.pick(FIRST_F)} ${g.rng.pick(LAST)}`, role, model: 17, tint: g.rng.int(0, 999), female: true, skill: 55, speed: 55, charm: 55, honesty: 80, wage: 84, fair: 84, morale: 70, energy: 100, hired: g.s.day, xp: 0, x: -18, z: 12, y: 0, px: -18, pz: 12, py: 0, dir: 0, path: [], pi: 0, state: 'idle', anim: 0, station: '', job: 0, timer: 0, served: 0, cleaned: 0, fixed: 0, area: 'all', training: 0, carry: 0, stuck: 0 });
    g.refreshCandidates();
  }
  g.relayout();
  autoProgram(g); buildScreenings(g); assignStations(g); computeRating(g);
  g.emit({ type: 'layout' });
  return ok(`Welcome to ${siteDef(id).name}.`);
}
export function setManager(g: Game, id: string, skill: number): Result {
  const st = ownedSites(g).find((x) => x.id === id);
  if (!st) return no('Not yours.');
  const wage = Math.round(60 + skill * skill * 0.06 + skill);
  const r = g.spend('chain', wage * 3);
  if (!r.ok) return r;
  st.manager = { name: `${g.rng.pick(g.rng.chance(0.5) ? FIRST_F : FIRST_M)} ${g.rng.pick(LAST)}`, skill, wage };
  return ok(`${st.manager.name} takes over.`);
}
export function chainValue(g: Game): number { return ownedSites(g).reduce((a, s) => a + siteDef(s.id).cost * 0.7 + s.wings.length * 9000 + s.reputation * 500, 0) + g.s.cash - g.s.loan; }
