import { CAMPAIGNS } from './data/catalog';
import { STUDIOS, makeClassic, makeFilm, studioById } from './data/films';
import { clamp } from './rng';
import { fmt, no, ok, type Game, type Result } from './game';
import type { ContractTerms, Film, Offer } from './types';

export const relationOf = (g: Game, studio: string) => g.s.studios.find((s) => s.id === studio)!;

export function baseTerms(g: Game, f: Film): ContractTerms {
  const st = studioById(f.studio), rel = relationOf(g, f.studio).relation;
  if (f.repertory) return { fee: Math.round((180 + f.quality * 3) / 10) * 10, share: 0.12, minWeeks: 1, minShows: 1, exclusive: false };
  const strength = f.hype / 100;
  const age = Math.max(0, g.s.day - f.releaseDay) / 7;
  return {
    fee: Math.round((240 + strength * strength * 3900 * (0.6 + st.muscle * 0.6)) * (1 - rel / 420) * Math.max(0.25, 1 - age * 0.22) / 10) * 10,
    share: Math.round(clamp(0.4 + strength * 0.2 + st.muscle * 0.06 - rel * 0.0009 - age * 0.07, 0.22, 0.68) * 100) / 100,
    minWeeks: strength > 0.7 ? 3 : strength > 0.42 ? 2 : 1, minShows: strength > 0.7 ? 3 : strength > 0.35 ? 2 : 1, exclusive: false,
  };
}
/** The studio's private walk-away point, as a single "value to studio" number. */
export function offerValue(f: Film, t: ContractTerms): number {
  const expected = 26 * f.hype * 1.05 * Math.max(1, t.minWeeks) ** 0.72;
  return t.fee + t.share * expected + t.minShows * 55 + t.minWeeks * 70 + (t.exclusive ? 150 + f.hype * 5 : 0);
}
export function refreshMarket(g: Game, first: boolean): void {
  const s = g.s, used = new Set(s.films.map((f) => f.title));
  s.offers = s.offers.filter((o) => !o.closed && o.expires >= s.day);
  const fresh: Film[] = [];
  if (!first) {
    const n = g.rng.int(2, 4) + (s.chapter > 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const prev = g.rng.chance(0.16) ? g.rng.pick(s.films.filter((f) => f.hype > 30 && f.gross > 1500 && !f.repertory)) ?? null : null;
      fresh.push(makeFilm(g.rng, `f${s.nextFilm++}`, s.day + g.rng.int(1, 5), used, { big: g.rng.chance(0.2 + s.chapter * 0.03), previous: prev ?? null }));
    }
    if (g.rng.chance(0.35)) { const c = makeClassic(g.rng, `f${s.nextFilm++}`, s.day, used); if (c) fresh.push(c); }
    s.films.push(...fresh);
  }
  const cand = s.films.filter((f) => !s.offers.some((o) => o.filmId === f.id) && !s.contracts.some((c) => c.filmId === f.id && c.endDay >= s.day) && s.day - f.releaseDay < 24 && !(s.flags[`lost:${f.id}`]));
  for (const f of cand) {
    const terms = baseTerms(g, f);
    const hot = f.hype > 58 && g.rng.chance(0.5);
    s.offers.push({ id: g.id(), filmId: f.id, terms, patience: Math.round(2 + relationOf(g, f.studio).relation / 30 + (1 - studioById(f.studio).muscle) * 2), rounds: 0, expires: s.day + g.rng.int(4, 8), rival: hot ? Math.round(offerValue(f, terms) * g.rng.range(0.95, 1.12)) : null, mood: hot ? 'The rival house across town has called about this one.' : 'Waiting to hear from you.' });
  }
  s.offers.sort((a, b) => g.film(b.filmId).hype - g.film(a.filmId).hype);
}

export function counterOffer(g: Game, offerId: number, t: ContractTerms): Result & { accepted?: boolean } {
  const o = g.s.offers.find((x) => x.id === offerId);
  if (!o || o.closed) return no('That deal is off the table.');
  const f = g.film(o.filmId), st = studioById(f.studio), rel = relationOf(g, f.studio);
  t = { fee: clamp(Math.round(t.fee), 0, 60000), share: clamp(Math.round(t.share * 100) / 100, 0.05, 0.8), minWeeks: clamp(Math.round(t.minWeeks), 1, 6), minShows: clamp(Math.round(t.minShows), 0, 6), exclusive: t.exclusive };
  const ask = offerValue(f, o.terms), bid = offerValue(f, t);
  const give = clamp(0.05 + rel.relation * 0.0016 + (1 - st.muscle) * 0.08 + o.rounds * 0.014, 0, 0.3);
  const floor = Math.max(ask * (1 - give), o.rival ?? 0);
  o.rounds++;
  if (bid >= floor) { o.terms = t; o.mood = 'Deal. We’ll send the papers over.'; return { ok: true, msg: 'They accept your terms.', accepted: true }; }
  o.patience--;
  const gap = 1 - bid / ask;
  if (o.patience <= 0) {
    o.closed = 'walked'; rel.relation = clamp(rel.relation - 3, 0, 100); g.s.flags[`lost:${f.id}`] = 1;
    return no(`${st.name} hung up. ${f.title} goes elsewhere.`);
  }
  if (gap > 0.35) { rel.relation = clamp(rel.relation - 2, 0, 100); o.mood = 'Is that a typo?'; }
  else {
    o.mood = gap > 0.18 ? 'We’re not even in the same postcode.' : o.rival && bid < o.rival ? 'The other house is offering more.' : 'Closer. Try again.';
    // the studio meets you part of the way
    const k = 0.22;
    o.terms = { fee: Math.round((o.terms.fee + (t.fee - o.terms.fee) * k) / 10) * 10, share: Math.round((o.terms.share + (t.share - o.terms.share) * k) * 100) / 100, minWeeks: o.terms.minWeeks, minShows: o.terms.minShows, exclusive: o.terms.exclusive };
    if (offerValue(f, o.terms) < ask * (1 - give)) o.terms = { ...o.terms, fee: Math.round(o.terms.fee * 1.05) };
  }
  return no(o.mood);
}
export function signOffer(g: Game, offerId: number): Result {
  const o = g.s.offers.find((x) => x.id === offerId);
  if (!o || o.closed) return no('That deal is off the table.');
  const f = g.film(o.filmId);
  const r = g.spend('license', o.terms.fee);
  if (!r.ok) return r;
  o.closed = 'signed';
  const start = Math.max(g.s.day, f.releaseDay);
  g.s.contracts.push({ id: g.id(), filmId: f.id, terms: { ...o.terms }, startDay: start, endDay: start + o.terms.minWeeks * 7 - 1, showsToday: 0, gross: 0, paid: 0, breaches: 0, admissions: 0 });
  const rel = relationOf(g, f.studio);
  rel.relation = clamp(rel.relation + 3, 0, 100);
  if (o.terms.exclusive) { f.hype = clamp(f.hype + 7, 0, 110); }
  g.s.offers = g.s.offers.filter((x) => x.id !== offerId);
  g.stat('contracts');
  g.news('film', `${f.title} booked for ${o.terms.minWeeks} week${o.terms.minWeeks > 1 ? 's' : ''}${start > g.s.day ? `, opening in ${start - g.s.day} day${start - g.s.day > 1 ? 's' : ''}` : ''}.`);
  g.emit({ type: 'sound', id: 'stamp' });
  return ok(`${f.title} is yours.`);
}
export function declineOffer(g: Game, id: number): void { g.s.offers = g.s.offers.filter((o) => o.id !== id); }
export function extendContract(g: Game, id: number): Result {
  const c = g.s.contracts.find((x) => x.id === id);
  if (!c) return no('Expired.');
  const f = g.film(c.filmId);
  const fee = Math.round((90 + f.hype * 9) / 10) * 10;
  const r = g.spend('license', fee);
  if (!r.ok) return r;
  c.endDay += 7; c.terms.share = Math.max(0.2, Math.round((c.terms.share - 0.05) * 100) / 100);
  relationOf(g, f.studio).relation = clamp(relationOf(g, f.studio).relation + 2, 0, 100);
  return ok(`${f.title} held over another week for ${fmt(fee)}.`);
}

export function dailyFilms(g: Game): void {
  const s = g.s;
  for (const f of s.films) {
    if (s.day < f.releaseDay) { f.hype = clamp(f.hype + g.rng.range(-0.5, 1.6), 0, 108); continue; }
    f.weeks = (s.day - f.releaseDay) / 7;
    f.hype = Math.max(2, f.hype * Math.pow(f.legs, 1 / 3.2));
    f.wom *= 0.985;
    if (f.critic === null && s.day >= f.releaseDay) {
      f.critic = Math.round(clamp(g.rng.gauss(f.quality, 8), 3, 99));
      if (g.contractFor(f.id) || f.hype > 55) g.news('film', `Critics on ${f.title}: ${f.critic}% ${f.critic > 74 ? 'adore it' : f.critic > 55 ? 'are kind' : f.critic > 35 ? 'are divided' : 'are merciless'}.`);
    }
  }
  for (const c of s.contracts) if (c.endDay === s.day - 1) {
    const f = g.film(c.filmId), rel = relationOf(g, f.studio);
    rel.relation = clamp(rel.relation + (c.breaches === 0 ? 6 : -3 * c.breaches), 0, 100);
    g.news('film', `${f.title} ends its run: ${c.admissions} admissions, ${fmt(c.gross)} gross.`);
    g.stat('runsFinished');
  }
  s.contracts = s.contracts.filter((c) => c.endDay >= s.day - 14);
  // stale films nobody booked
  s.films = s.films.filter((f) => s.day - f.releaseDay < 60 || s.contracts.some((c) => c.filmId === f.id));
  for (const o of s.offers) if (o.rival && !o.closed && g.rng.chance(0.16)) {
    o.closed = 'lost'; s.flags[`lost:${o.filmId}`] = 1;
    g.news('film', `A rival house signed ${g.film(o.filmId).title} while you were thinking.`);
  }
  s.offers = s.offers.filter((o) => !o.closed && o.expires >= s.day);
  void CAMPAIGNS; void STUDIOS;
}
export type { Offer };
