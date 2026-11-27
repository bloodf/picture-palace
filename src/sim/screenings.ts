import { PROJ_TIERS, SCREEN_TIERS, SEAT_TIERS, SOUND_TIERS } from './data/catalog';
import { GENRES } from './data/films';
import { audById, seatsOf } from './plan';
import { clamp } from './rng';
import { ANIM } from './anims';
import { expectedDemand, filmBeat, filmPull, walkOut } from './guests';
import { DAY_LAST_START, DAY_OPEN, no, ok, type Game, type Result } from './game';
import type { ProjectorFault, Screening } from './types';

export const TURNAROUND = 15;

export function pictureOf(g: Game, aud: number): number {
  const a = g.site.auds[aud - 1]!;
  const base = SCREEN_TIERS[a.screenTier]!.q * 0.42 + PROJ_TIERS[a.projTier]!.q * 0.58;
  const lamp = clamp(a.lampHours / PROJ_TIERS[a.projTier]!.lampLife, 0, 1.4);
  return clamp(base * (0.72 + a.focus / 357) * (0.8 + a.projCond / 500) - Math.max(0, lamp - 0.7) * 26, 0, 100);
}
export const soundOf = (g: Game, aud: number): number => SOUND_TIERS[g.site.auds[aud - 1]!.soundTier]!.q;
export function comfortOf(g: Game, aud: number): number {
  const a = g.site.auds[aud - 1]!, n = a.seatDirt.length;
  let dirt = 0, broken = 0;
  for (let i = 0; i < n; i++) { dirt += a.seatDirt[i]!; broken += a.seatBroken[i]!; }
  return clamp(SEAT_TIERS[a.seatTier]!.comfort - (dirt / n) * 0.22 - (broken / n) * 30, 0, 100);
}

export function slotLength(g: Game, filmId: string): number { return g.site.policy.trailers + g.film(filmId).runtime + TURNAROUND; }

export function validateSlot(g: Game, aud: number, filmId: string, start: number, ignoreSlot: number): Result {
  const A = g.site.auds[aud - 1];
  if (!A?.built) return no('That screen is not open.');
  const c = g.contractFor(filmId);
  if (!c) return no('You have no active contract for that film.');
  if (start < DAY_OPEN) return no('Doors open at 10:00 AM.');
  if (start > DAY_LAST_START) return no('The last show must start by 11:00 PM.');
  const len = slotLength(g, filmId);
  for (const s of A.program) {
    if (s.id === ignoreSlot) continue;
    const l2 = slotLength(g, s.filmId);
    if (start < s.start + l2 && s.start < start + len) return no(`Clashes with the ${g.clock(s.start)} show.`);
  }
  return ok();
}

/** Fill every open screen with the most sensible mix of contracted films. */
export function autoProgram(g: Game): void {
  const films = g.s.contracts.filter((c) => g.s.day >= c.startDay && g.s.day <= c.endDay).map((c) => ({ c, f: g.film(c.filmId), pull: filmPull(g, c.filmId) })).filter((x) => x.f);
  if (!films.length) return;
  const given = new Map<string, number>();
  const auds = g.site.auds.filter((a) => a.built).sort((a, b) => seatsOf(b.id).length - seatsOf(a.id).length);
  auds.forEach((a, ai) => {
    a.program = [];
    let t = DAY_OPEN + (ai % 4) * 20 + 45;
    while (t <= DAY_LAST_START) {
      const kidsTime = t < 17 * 60, late = t >= 21 * 60;
      let best = films[0]!, bs = -Infinity;
      for (const x of films) {
        const n = given.get(x.c.filmId) ?? 0;
        let v = x.pull / (1 + n * 0.42);
        if (n < x.c.terms.minShows) v += 60;
        if (kidsTime && (x.f.genre === 'animation' || x.f.cert === 'G')) v *= 1.5;
        if (kidsTime && (x.f.genre === 'horror' || x.f.cert === 'R')) v *= 0.5;
        if (late && (x.f.genre === 'horror' || x.f.genre === 'thriller' || x.f.cert === 'R')) v *= 1.4;
        if (late && x.f.genre === 'animation') v *= 0.3;
        if (v > bs) { bs = v; best = x; }
      }
      a.program.push({ id: g.id(), filmId: best.c.filmId, start: t });
      given.set(best.c.filmId, (given.get(best.c.filmId) ?? 0) + 1);
      t += Math.ceil((slotLength(g, best.c.filmId) + 3) / 5) * 5;
    }
  });
}

/** Turn today's programme into real screenings; never touches shows that already have an audience. */
export function buildScreenings(g: Game): void {
  const keep = g.s.screenings.filter((s) => g.s.phase !== 'prep' && (s.state !== 'upcoming' || s.sold > 0));
  const out: Screening[] = g.s.phase === 'prep' ? [] : keep;
  for (const a of g.site.auds) {
    if (!a.built) continue;
    for (const p of a.program) {
      if (g.s.phase !== 'prep' && p.start < g.s.minute + 4) continue;
      if (out.some((s) => s.aud === a.id && s.start === p.start)) continue;
      if (!g.contractFor(p.filmId)) continue;
      const f = g.film(p.filmId);
      const filmStart = p.start + g.site.policy.trailers;
      if (out.some((s) => s.aud === a.id && p.start < s.end + s.delay && s.start < filmStart + f.runtime && s.state !== 'ended' && s.state !== 'cancelled')) continue;
      out.push({ id: g.id(), aud: a.id, filmId: p.filmId, start: p.start, filmStart, end: filmStart + f.runtime, sold: 0, seats: new Array<number>(seatsOf(a.id).length).fill(0), price: g.site.prices.adult, state: 'upcoming', delay: 0, fault: null, faultTime: 0, demand: 0, enjoy: 0, enjoyN: 0, revenue: 0, refunded: false });
    }
  }
  out.sort((a, b) => a.start - b.start || a.aud - b.aud);
  g.s.screenings = out;
  for (const s of out) if (s.state === 'upcoming') s.demand = expectedDemand(g, s);
}

export const FAULT_NAMES: Record<ProjectorFault, string> = { jam: 'Film jam', lamp: 'Lamp blown', focus: 'Lost focus', audio: 'Dead speakers', power: 'No power' };
export function breakProjector(g: Game, aud: number, fault: ProjectorFault): void {
  const a = g.site.auds[aud - 1]!, d = audById(aud);
  if (a.fault) return;
  a.fault = fault;
  g.addJob({ kind: 'projector', role: 'tech', title: `${FAULT_NAMES[fault]}, ${g.audName(aud)}`, x: d.cx - 0.9, z: -7.25, ref: `proj:${aud}`, need: fault === 'lamp' ? 7 : fault === 'jam' ? 6 : 4.5, severity: 3 });
  g.news('bad', `${FAULT_NAMES[fault]} in ${g.audName(aud)}. The audience is looking at the booth.`, d.cx, -8);
  g.emit({ type: 'sound', id: 'fault', x: d.cx, z: -10 });
  g.stat('faults');
}
export function fixProjector(g: Game, aud: number): void {
  const a = g.site.auds[aud - 1]!;
  const was = a.fault;
  a.fault = null; a.projCond = clamp(a.projCond + 16, 0, 100); a.focus = clamp(a.focus + 30, 0, 100);
  if (was === 'lamp') { a.lampHours = 0; g.money('repairs', -PROJ_TIERS[a.projTier]!.lampCost); } else g.money('repairs', -25);
  for (const s of g.s.screenings) if (s.aud === aud && s.fault) {
    s.fault = null;
    for (const id of s.seats) { const m = id ? g.guests.get(id) : undefined; if (m && m.state === 'seated') { g.think(m, 'faultFixed'); m.anim = ANIM.sitClap; m.emoT = 2.5; m.emotion = 'happy'; } }
  }
  g.stat('projFixed');
}

export function stepScreenings(g: Game, dt: number): void {
  const now = g.s.minute;
  for (const s of g.s.screenings) {
    if (s.state === 'ended' || s.state === 'cancelled') continue;
    const a = g.site.auds[s.aud - 1]!;
    if (s.state === 'upcoming') {
      if (now >= s.start + s.delay - 24) {
        const busy = g.s.screenings.find((x) => x !== s && x.aud === s.aud && (x.state === 'playing' || x.state === 'trailers'));
        if (busy) { s.delay = Math.max(s.delay, busy.end + busy.delay + 6 - s.start + 24); }
        else s.state = 'seating';
      }
      continue;
    }
    if (s.state === 'seating') {
      if (now >= s.start + s.delay) {
        if (a.fault || !g.site.power) { s.delay += dt; s.fault = a.fault; s.faultTime += dt; if (s.delay > 35) cancelScreening(g, s); continue; }
        s.state = 'trailers'; s.filmStart = now + g.site.policy.trailers; s.end = s.filmStart + g.film(s.filmId).runtime; s.delay = 0; s.faultTime = 0; s.fault = null;
        g.stat('shows');
      }
      continue;
    }
    // running
    const faulted = a.fault && a.fault !== 'focus' && a.fault !== 'audio' ? a.fault : !g.site.power ? ('power' as const) : a.fault;
    if (faulted) {
      if (!s.fault) { s.fault = faulted; s.faultTime = 0; }
      s.faultTime += dt;
      if (faulted === 'jam' || faulted === 'lamp' || faulted === 'power') { s.filmStart += s.state === 'trailers' ? dt : 0; s.end += dt; s.delay += 0; }
      if (s.faultTime > 40) { cancelScreening(g, s); continue; }
    } else if (s.fault) { s.fault = null; s.faultTime = 0; }
    if (s.state === 'trailers' && now >= s.filmStart) {
      s.state = 'playing';
      const f = g.film(s.filmId);
      g.emit({ type: 'sound', id: 'filmstart', x: audById(s.aud).cx, z: -14 });
      void f;
    }
    if (s.state === 'playing') {
      const P = PROJ_TIERS[a.projTier]!;
      a.lampHours += dt / 60;
      a.projCond = Math.max(0, a.projCond - P.wear * dt * 0.4 * g.diff.wear);
      a.focus = Math.max(10, a.focus - dt * (a.projTier === 0 ? 0.05 : 0.012) * g.diff.wear);
      if (!a.fault && !s.fault) {
        const risk = (a.projTier === 0 ? 0.00026 : a.projTier === 1 ? 0.00012 : 0.00003) * (1 + ((100 - a.projCond) / 34) ** 2) * g.diff.wear * dt;
        const lampRisk = a.projTier < 2 && a.lampHours > P.lampLife * 0.85 ? 0.0006 * dt * (a.lampHours / P.lampLife) : 0;
        if (g.rng.chance(lampRisk)) breakProjector(g, s.aud, 'lamp');
        else if (g.rng.chance(risk)) breakProjector(g, s.aud, a.projTier === 0 ? g.rng.pick(['jam', 'jam', 'focus', 'audio', 'lamp'] as const) : g.rng.pick(['audio', 'focus', 'lamp'] as const));
        // beats: roughly one every four minutes, flavoured by genre
        if (g.rng.chance(0.26 * dt)) {
          const G = GENRES[g.film(s.filmId).genre];
          const kind = g.rng.weighted(['laugh', 'scare', 'tears', 'thrill'] as const, (k) => ({ laugh: G.laughs, scare: G.scares, tears: G.tears * (now > s.filmStart + (s.end - s.filmStart) * 0.6 ? 2 : 0.5), thrill: G.thrills })[k]);
          if (kind) { filmBeat(g, s, kind); g.emit({ type: 'fx', id: `beat:${kind}:${s.aud}`, x: audById(s.aud).cx, z: -14 }); }
        }
      }
      if (now >= s.end && !s.fault) {
        s.state = 'ended';
        const f = g.film(s.filmId);
        if (s.enjoyN > 20 && s.enjoy / s.enjoyN > 70) g.emit({ type: 'sound', id: 'applause', x: audById(s.aud).cx, z: -14 });
        void f;
        scheduleAudClean(g, s.aud);
      }
    }
  }
}
export function scheduleAudClean(g: Game, aud: number): void {
  const a = g.site.auds[aud - 1]!, d = audById(aud);
  g.addJob({ kind: 'audClean', role: 'janitor', title: `Turn around ${g.audName(aud)}`, x: d.cx - d.cols * 0.33 - 0.8, z: -11.25, y: 0, ref: `aud:${aud}`, need: 9 + a.seatDirt.length * 0.05, severity: 2 });
}
export function cancelScreening(g: Game, s: Screening): void {
  s.state = 'cancelled';
  let back = 0;
  for (const id of s.seats) {
    const m = id ? g.guests.get(id) : undefined;
    if (!m) continue;
    back += m.ticketPaid;
    const gr = g.groups.get(m.group);
    if (gr) gr.done = true;
    if (m.state === 'seated') { walkOut(g, m, gr!); } else if (g.site.policy.refunds) { g.money('refunds', -m.ticketPaid); g.think(m, 'refund'); }
  }
  void back;
  g.news('bad', `${g.film(s.filmId).title} in ${g.audName(s.aud)} was cancelled${g.site.policy.refunds ? ' and refunded' : ''}.`);
  g.site.reputation = clamp(g.site.reputation - 2.5, 0, 100);
  g.stat('cancelled');
}
