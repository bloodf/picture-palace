import { ARCHETYPES, FIRST_F, FIRST_M, LAST, MUSIC, PRODUCTS, CAMPAIGNS, SUPPLY_TIERS, TEMPERS, archById, itemById, productById, siteDef, DECOR, type Archetype, type Product } from './data/catalog';
import { GENRES } from './data/films';
import { ANIM } from './anims';
import { FIXTURES, ROOMS, STATIONS, SPAWNS, audById, floorY, roomAt, seatsOf, type FixtureDef, type SeatDef, type StationDef } from './plan';
import { CELL, NX, NZ, cellX, cellZ } from './nav';
import { clamp } from './rng';
import { DAY_FACTOR, type Game } from './game';
import type { AgeBand, ArchetypeId, Genre, Group, Guest, PlacedItem, Screening } from './types';
import { comfortOf, pictureOf, soundOf } from './screenings';

export const MAX_GUESTS = 430;
const MODELS: Record<'m' | 'f', Record<AgeBand, number[]>> = {
  m: { child: [12], teen: [14, 0], adult: [0, 1, 2, 4, 5], senior: [3] },
  f: { child: [13], teen: [15, 6], adult: [6, 7, 8, 9, 11], senior: [10] },
};

// ------------------------------------------------------------------ demand
const HOUR_CURVE: [number, number][] = [[9, 0.2], [10, 0.34], [12, 0.52], [14, 0.74], [16, 0.82], [17.5, 1.0], [19, 1.42], [20, 1.38], [21, 1.12], [22, 0.8], [23, 0.45], [24, 0.2]];
export function hourFactor(min: number): number {
  const h = min / 60;
  for (let i = 1; i < HOUR_CURVE.length; i++) { const [a, va] = HOUR_CURVE[i - 1]!, [b, vb] = HOUR_CURVE[i]!; if (h <= b) return va + (vb - va) * clamp((h - a) / (b - a), 0, 1); }
  return 0.1;
}
export function fairTicket(g: Game, aud: number): number {
  const wealth = siteDef(g.site.id).wealth;
  return (6.3 + pictureOf(g, aud) * 0.024 + soundOf(g, aud) * 0.012 + comfortOf(g, aud) * 0.022 + g.site.decor.lobby * 0.5 + g.site.decor.prom * 0.2) * (0.6 + 0.4 * wealth);
}
export function ticketPrice(g: Game, s: Screening, age: AgeBand, vip = false): number {
  const p = g.site.prices;
  let v = age === 'child' ? p.child : age === 'senior' ? p.senior : p.adult;
  if (s.start < 16 * 60) v *= 1 - p.matinee / 100;
  if (g.weekday >= 4) v += p.weekend;
  if (vip) v += p.vip;
  return Math.max(0, Math.round(v * 4) / 4);
}
export function filmPull(g: Game, filmId: string): number {
  const f = g.film(filmId);
  return clamp(f.hype * 0.86 + f.wom * 1.25 + (f.critic !== null ? (f.critic - 55) * 0.14 : 0), 2, 130);
}
export function marketingBoost(g: Game, arch?: ArchetypeId): number {
  let b = 1;
  for (const c of g.site.campaigns) { const d = CAMPAIGNS.find((x) => x.id === c.id)!; b += arch ? ((d.arch as readonly string[]).includes(arch) ? d.boost * 1.9 : d.boost * 0.35) : d.boost; }
  return b;
}
/** Total people who would like to attend this show if there were infinite seats. */
export function expectedDemand(g: Game, s: Screening): number {
  const site = siteDef(g.site.id);
  const price = ticketPrice(g, s, 'adult'), fair = fairTicket(g, s.aud);
  const pf = clamp(2.05 - 1.05 * (price / fair), 0.04, 1.45);
  const w = { clear: 1, cloudy: 1.04, rain: 1.12, snow: 0.82, heat: 1.18, storm: 0.6 }[g.s.weather];
  const rep = 0.42 + (g.site.reputation / 100) * 1.35 + g.site.loyalty * 0.002;
  const facade = 1 + g.site.decor.facade * 0.06;
  const same = g.s.screenings.filter((x) => x !== s && x.filmId === s.filmId && Math.abs(x.start - s.start) < 100 && x.state !== 'ended' && x.state !== 'cancelled').length;
  const nearby = g.s.screenings.filter((x) => x !== s && x.filmId !== s.filmId && Math.abs(x.start - s.start) < 70 && x.state !== 'ended' && x.state !== 'cancelled').length;
  const season = 1 + 0.1 * Math.sin(((g.s.day + 20) / 120) * Math.PI * 2);
  return 37 * site.traffic * DAY_FACTOR[g.weekday]! * hourFactor(s.start) * w * rep * facade * season * (filmPull(g, s.filmId) / 50) * pf * marketingBoost(g) * g.diff.demand * (1 + g.effect('demand')) / (1 + same * 0.8) / (1 + nearby * 0.13);
}
const leadShape = (lead: number) => (lead < 34 || lead > 88 ? 0 : lead < 56 ? (lead - 34) / 22 : (88 - lead) / 32);
const LEAD_SUM = (() => { let t = 0; for (let l = 0; l < 100; l++) t += leadShape(l); return t; })();

export function spawnArrivals(g: Game): void {
  for (const s of g.s.screenings) {
    if (s.state !== 'upcoming' && s.state !== 'seating') continue;
    const lead = s.start + s.delay - g.s.minute;
    if (lead > 89 || lead < 33) continue;
    const n = g.rng.poisson((expectedDemand(g, s) / 2.35) * (leadShape(lead) / LEAD_SUM));
    for (let i = 0; i < n && g.s.guests.length < MAX_GUESTS; i++) spawnGroup(g, s);
  }
}
export function pickArchetype(g: Game, s: Screening): Archetype {
  const f = g.film(s.filmId), h = s.start / 60, mix = siteDef(g.site.id).mix;
  return g.rng.weighted(ARCHETYPES, (a) => {
    if (!a.cert.includes(f.cert)) return 0;
    const peak = a.peak === 'day' ? (h < 18 ? 1.5 : 0.4) : a.peak === 'evening' ? (h >= 17 && h < 22 ? 1.4 : 0.7) : a.peak === 'late' ? (h >= 19 ? 1.6 : 0.55) : 1;
    const matinee = h < 16 && a.id === 'seniors' ? 1 + g.site.prices.matinee / 60 : 1;
    return a.share * (mix[a.id] ?? 1) * peak * matinee * Math.exp((a.taste[f.genre] ?? 0) / 14) * marketingBoost(g, a.id);
  }) ?? ARCHETYPES[5]!;
}
export function spawnGroup(g: Game, s: Screening, force?: ArchetypeId, special?: string): Group {
  const a = force ? archById(force) : pickArchetype(g, s);
  const size = g.rng.int(a.size[0], a.size[1]);
  const sp = g.rng.pick(SPAWNS);
  const gr: Group = { id: g.id(), members: [], leader: 0, arch: a.id, screening: s.id, tickets: false, conDone: false, done: false, vip: false, online: false, arcadeDone: false };
  for (let i = 0; i < size; i++) {
    const m = makeGuest(g, a, a.ages[Math.min(i, a.ages.length - 1)]!, gr.id);
    m.x = m.px = sp.x + g.rng.range(-1, 1) + i * 0.5 * Math.sign(sp.x); m.z = m.pz = sp.z + g.rng.range(-0.4, 0.4);
    m.screening = s.id; m.special = special;
    gr.members.push(m.id);
    if (i === 0) { gr.leader = m.id; m.leader = true; }
    g.guests.set(m.id, m); g.s.guests.push(m);
    g.think(m, 'arrive', { film: g.film(s.filmId).title }, true);
  }
  g.groups.set(gr.id, gr); g.s.groups.push(gr);
  gr.vip = g.unlocked.has('vip') && !gr.members.some((id) => g.guests.get(id)!.age === 'child') && g.rng.chance(clamp(0.3 * a.wealth - g.site.prices.vip * 0.02, 0, 0.4));
  if (g.rng.chance(0.22 + g.site.loyalty * 0.002)) {
    gr.online = true;
    if (!sellTickets(g, gr, true)) { for (const id of gr.members) { const m = g.guests.get(id)!; g.think(m, 'soldOut', { film: g.film(s.filmId).title }); } g.s.turnedAway += size; }
  }
  return gr;
}
function makeGuest(g: Game, a: Archetype, age: AgeBand, group: number): Guest {
  const r = g.rng, female = r.chance(0.5), t = a.id === 'seniors' && r.chance(0.3) ? TEMPERS[1]! : r.pick(TEMPERS);
  const taste = r.weighted(Object.keys(GENRES) as Genre[], (k) => Math.exp((a.taste[k] ?? 0) / 10))!;
  return {
    id: g.id(), group, leader: false, name: `${r.pick(female ? FIRST_F : FIRST_M)} ${r.pick(LAST)}`, model: r.pick(MODELS[female ? 'f' : 'm'][age]), tint: r.int(0, 1e6), age, female, arch: a.id, temper: t.id,
    x: 0, z: 0, y: 0, px: 0, pz: 0, py: 0, dir: 0, speed: (age === 'senior' ? 1.55 : age === 'child' ? 2.05 : 2.0) * r.range(0.92, 1.12), state: 'enter', anim: ANIM.walk, path: [], pi: 0, goal: '', timer: r.range(0, 1.5), stuck: 0, ghost: 0,
    hunger: r.range(15, 72), thirst: r.range(15, 66), bladder: r.range(5, 50), energy: r.range(60, 100), fun: r.range(30, 70),
    happy: clamp(60 + t.drift + r.gauss(0, 7), 20, 90), emotion: 'neutral', emoT: 0, patience: clamp(a.patience * t.patience, 0.12, 1.4), humor: t.humor * r.range(0.8, 1.2), tidy: clamp(a.tidy + r.range(-0.2, 0.2), 0.05, 1), thrift: clamp(a.thrift + r.range(-0.2, 0.2), 0, 1), rowdy: clamp(a.rowdy + (t.id === 'rowdy' ? 0.35 : 0) + r.range(-0.1, 0.1), 0, 1), taste,
    cash: Math.round((age === 'child' ? 6 : 46) * a.wealth * r.range(0.7, 1.5)), spent: 0, spentFood: 0, ticketPaid: 0, carry: 0, foodQ: 0, screening: 0, seat: -1, queueSt: '', fixtureId: '', itemId: 0, seen: false, enjoy: 0, thoughts: [], arrive: g.s.minute, visits: 0, phone: false, coughT: 0, offended: 0, lastNeedT: 0,
  };
}

// ------------------------------------------------------------------ seats and tickets
export function freeSeats(g: Game, s: Screening): number { return g.capacity(s.aud) - s.sold; }
export function chooseSeats(g: Game, s: Screening, n: number): SeatDef[] | null {
  const seats = seatsOf(s.aud), a = audById(s.aud), st = g.site.auds[s.aud - 1]!;
  let best: SeatDef[] | null = null, bs = Infinity;
  const prefer = a.rows * 0.45;
  for (let r = 0; r < a.rows; r++) for (let c = 0; c + n <= a.cols; c++) {
    let good = true, dirt = 0;
    for (let k = 0; k < n && good; k++) { const i = r * a.cols + c + k; if (s.seats[i] || st.seatBroken[i]) good = false; else dirt += st.seatDirt[i]!; }
    if (!good) continue;
    const score = Math.abs(r - prefer) * 1.1 + Math.abs(c + (n - 1) / 2 - (a.cols - 1) / 2) * 0.75 + dirt / n / 40 + g.rng.next() * 0.8;
    if (score < bs) { bs = score; best = seats.slice(r * a.cols + c, r * a.cols + c + n); }
  }
  if (best) return best;
  const loose = seats.filter((q) => !s.seats[q.idx] && !st.seatBroken[q.idx]);
  return loose.length >= n ? loose.slice(0, n) : null;
}
/** Returns false when sold out or the group refuses the price. */
export function sellTickets(g: Game, gr: Group, online = false): boolean {
  const s = g.screeningById(gr.screening);
  if (!s || s.state === 'ended' || s.state === 'cancelled') return false;
  const mem = gr.members.map((m) => g.guests.get(m)!).filter(Boolean);
  const seats = chooseSeats(g, s, mem.length);
  if (!seats) return false;
  const fair = fairTicket(g, s.aud);
  const lead = mem[0]!;
  const adult = ticketPrice(g, s, 'adult', gr.vip), ratio = adult / (fair + (gr.vip ? 6 : 0));
  if (ratio > 1.12 && g.rng.chance(clamp((ratio - 1.12) * 1.7 * (0.4 + lead.thrift), 0, 0.96))) {
    for (const m of mem) g.think(m, 'ticketRobbery', { price: `$${adult.toFixed(2)}`, film: g.film(s.filmId).title });
    g.s.turnedAway += mem.length;
    return false;
  }
  let total = 0;
  mem.forEach((m, i) => {
    const p = ticketPrice(g, s, m.age, gr.vip);
    m.seat = seats[i]!.idx; s.seats[m.seat] = m.id; m.ticketPaid = p; m.spent += p; m.cash -= p; total += p;
    if (i === 0 || g.rng.chance(0.3)) g.think(m, ratio < 0.78 ? 'ticketCheap' : ratio < 1.05 ? 'ticketFair' : 'ticketDear', { price: `$${p.toFixed(2)}` });
  });
  s.sold += mem.length; s.revenue += total;
  gr.tickets = true;
  g.money('tickets', total, lead.x, lead.z);
  g.stat('tickets', mem.length);
  const c = g.contractFor(s.filmId), film = g.film(s.filmId);
  film.gross += total;
  if (c) { const share = total * c.terms.share; c.gross += total; c.paid += share; c.admissions += mem.length; if (share) g.money('studio', -share); }
  if (!online) g.emit({ type: 'sound', id: 'register', x: lead.x, z: lead.z });
  return true;
}

// ------------------------------------------------------------------ movement
interface Mover { x: number; z: number; y: number; px: number; pz: number; py: number; dir: number; path: { x: number; z: number }[]; pi: number; stuck: number }
export function setPath(g: Game, a: Mover, x: number, z: number): boolean {
  const p = g.nav.path(a.x, a.z, x, z);
  if (!p) { a.path = []; a.pi = 0; return false; }
  a.path = p; a.pi = 0; a.stuck = 0;
  return true;
}
export function turn(a: { dir: number }, to: number, k: number): void {
  let d = to - a.dir;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.dir += d * Math.min(1, k);
}
/** Walk the current path. The result never leaves walkable floor: every candidate position is checked against the grid. */
export function moveAlong(g: Game, a: Mover & { id: number }, speed: number, dt: number, separate: boolean): boolean {
  if (a.pi >= a.path.length) return true;
  let left = speed * dt;
  let guard = 4;
  while (left > 1e-4 && a.pi < a.path.length && guard-- > 0) {
    const t = a.path[a.pi]!;
    const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.09) { a.pi++; continue; }
    const step = Math.min(left, d);
    let vx = (dx / d) * step, vz = (dz / d) * step;
    if (separate) {
      let sx = 0, sz = 0;
      const cx = Math.floor(a.x), cz = Math.floor(a.z);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const list = g.hash.get((cx + i) * 1000 + cz + j);
        if (!list) continue;
        for (const o of list) {
          if (o.id === a.id) continue;
          const ox = a.x - o.x, oz = a.z - o.z, od = ox * ox + oz * oz;
          if (od < 0.3 && od > 1e-6) { const l = Math.sqrt(od), f = (0.55 - l) / l; sx += ox * f; sz += oz * f; }
        }
      }
      if (g.player.active) {
        const ox = a.x - g.player.x, oz = a.z - g.player.z, l = Math.hypot(ox, oz);
        if (l < 0.95 && l > 1e-3 && (dx * -ox + dz * -oz) > 0) {
          // step round the manager, on whichever side is already nearer
          const side = dx * oz - dz * ox >= 0 ? 1 : -1, k = (0.95 - l) / 0.95;
          vx = vx * (1 - k) + (-dz / d) * side * step * k * 1.2; vz = vz * (1 - k) + (dx / d) * side * step * k * 1.2;
          if (l < 0.5) { vx += (ox / l) * step * 0.8; vz += (oz / l) * step * 0.8; }
        }
      }
      const sl = Math.hypot(sx, sz);
      if (sl > 0) { const m = Math.min(step * 0.75, sl * 0.5) / sl; vx += sx * m; vz += sz * m; }
    }
    const nx = a.x + vx, nz = a.z + vz;
    const here = g.nav.walkable(a.x, a.z);
    if (!here || g.nav.walkable(nx, nz)) { a.x = nx; a.z = nz; }
    else if (g.nav.walkable(a.x + (dx / d) * step, a.z + (dz / d) * step)) { a.x += (dx / d) * step; a.z += (dz / d) * step; }
    else if (g.nav.walkable(nx, a.z)) { a.x = nx; a.stuck += dt; }
    else if (g.nav.walkable(a.x, nz)) { a.z = nz; a.stuck += dt; }
    else a.stuck += dt * 2;
    turn(a, Math.atan2(dx, dz), dt * 9);
    left -= step;
  }
  const fy = floorY(a.x, a.z);
  a.y += (fy - a.y) * Math.min(1, dt * 10);
  if (a.stuck > 2.5 && a.path.length) { const e = a.path[a.path.length - 1]!; setPath(g, a, e.x, e.z); }
  return a.pi >= a.path.length;
}
function go(g: Game, m: Guest, x: number, z: number, state: Guest['state'], goal = ''): boolean {
  if (!setPath(g, m, x, z)) return false;
  m.state = state; m.goal = goal;
  return true;
}

// ------------------------------------------------------------------ queues
export function queueSpot(st: StationDef, i: number): { x: number; z: number } {
  const lane = Math.floor(i / 9), k = lane % 2 ? 8 - (i % 9) : i % 9;
  const ox = st.qdz !== 0 ? lane * 0.9 * (st.x < 0 ? -1 : 1) : 0, oz = st.qdx !== 0 ? lane * 0.9 * (st.id.endsWith('0') ? -1 : 1) : 0;
  return { x: st.qx + st.qdx * 0.78 * k + ox, z: st.qz + st.qdz * 0.78 * k + oz };
}
export function openStations(g: Game, kind: StationDef['kind']): StationDef[] {
  const all = STATIONS.filter((s) => s.kind === kind && g.unlocked.has(s.wing));
  const n = kind === 'box' ? g.site.boxOpen : kind === 'concession' ? g.site.conOpen : kind === 'food' ? all.length : all.length;
  return all.slice(0, n);
}
export function stationStaffed(g: Game, id: string): number {
  if (g.player.active && g.s.flags.playerStation === STATIONS.findIndex((s) => s.id === id) + 1) return 1.25;
  for (const x of g.site.staff) if (x.station === id && x.state === 'station') return 0.6 + (x.skill * 0.5 + x.speed * 0.6) / 100 * (0.6 + x.morale / 160) * (0.55 + x.energy / 220);
  return 0;
}
function joinQueue(g: Game, m: Guest, kind: 'box' | 'concession' | 'food', state: Guest['state']): boolean {
  const open = openStations(g, kind);
  if (!open.length) return false;
  let best: StationDef | null = null, bs = Infinity;
  for (const st of open) {
    const q = (g.s.queues[st.id] ??= []);
    const score = q.length * 3 + (stationStaffed(g, st.id) ? 0 : 14) + Math.hypot(st.qx - m.x, st.qz - m.z) * 0.12;
    if (score < bs) { bs = score; best = st; }
  }
  if (!best) return false;
  const q = g.s.queues[best.id]!;
  if (q.length > 22) return false;
  q.push(m.id); m.queueSt = best.id; m.timer = 0;
  const p = queueSpot(best, q.length - 1);
  return go(g, m, p.x, p.z, state, 'queue');
}
function leaveQueue(g: Game, m: Guest): void {
  if (!m.queueSt) return;
  const q = g.s.queues[m.queueSt];
  if (q) { const i = q.indexOf(m.id); if (i >= 0) q.splice(i, 1); }
  m.queueSt = '';
}
function stepQueue(g: Game, m: Guest, dt: number, gr: Group): void {
  const st = g.station(m.queueSt), q = g.s.queues[m.queueSt];
  if (!st || !q || !q.includes(m.id)) { m.queueSt = ''; m.state = 'idle'; return; }
  const i = q.indexOf(m.id), p = queueSpot(st, i);
  const far = Math.hypot(p.x - m.x, p.z - m.z);
  if (far > 0.42) {
    const end = m.path[m.path.length - 1];
    if (!end || Math.hypot(end.x - p.x, end.z - p.z) > 0.6 || m.pi >= m.path.length) setPath(g, m, p.x, p.z);
    moveAlong(g, m, m.speed, dt, far > 3);
    m.anim = walkAnim(m);
  } else {
    turn(m, Math.atan2(st.x - m.x, st.z - m.z), dt * 6);
    m.anim = m.patience < 0.5 && m.timer > 12 ? ANIM.tap : (m.id + Math.floor(g.s.minute / 9)) % 4 === 0 ? ANIM.phone : (m.id % 3 === 0 ? ANIM.look : ANIM.idle);
  }
  m.timer += dt;
  const lim = 16 + m.patience * 22;
  if (m.timer > lim * 0.6) g.think(m, 'queueLong');
  if (m.timer > lim) g.think(m, 'queueRage');
  const staffed = stationStaffed(g, st.id);
  if (!staffed && i === 0 && m.timer > 14) g.think(m, 'noStaff');
  if (m.timer > lim * 1.7 || (!staffed && m.timer > 45)) {
    leaveQueue(g, m);
    if (st.kind === 'box') { gr.done = true; for (const id of gr.members) { const x = g.guests.get(id); if (x) startLeave(g, x); } g.s.walkouts += gr.members.length; }
    else { gr.conDone = true; m.state = 'idle'; }
    return;
  }
  if (i === 0 && far < 0.6 && staffed) {
    const need = st.kind === 'box' ? 1.5 + gr.members.length * 0.2 : 2.1 + gr.members.length * 0.45;
    m.coughT += dt * staffed;
    if (m.coughT >= need) {
      m.coughT = 0;
      const staff = g.site.staff.find((x) => x.station === st.id && x.state === 'station');
      if (staff) { staff.served++; staff.xp++; if (g.rng.chance(staff.charm / 420)) g.think(m, 'staffNice'); else if (g.rng.chance((100 - staff.charm) * (100 - staff.morale) / 60000)) g.think(m, 'staffRude'); }
      else g.think(m, 'managerHi');
      leaveQueue(g, m);
      if (st.kind === 'box') {
        if (sellTickets(g, gr)) m.state = 'idle';
        else {
          const s = g.screeningById(gr.screening);
          if (s && freeSeats(g, s) < gr.members.length) { for (const id of gr.members) { const x = g.guests.get(id); if (x) g.think(x, 'soldOut', { film: g.film(s.filmId).title }); } g.s.turnedAway += gr.members.length; }
          gr.done = true;
          for (const id of gr.members) { const x = g.guests.get(id); if (x) startLeave(g, x); }
        }
      } else { buyFood(g, m, gr, st.kind === 'food' ? 'food' : 'con', staff?.skill ?? 70); gr.conDone = true; m.state = 'idle'; }
    }
  } else if (i !== 0) m.coughT = 0;
}

// ------------------------------------------------------------------ food
export function foodQuality(g: Game, p: Product, skill: number): number {
  const st = g.site.products[p.id]!, eq = g.site.equipment[p.equip]!;
  let q = 52 * SUPPLY_TIERS[st.tier].quality + skill * 0.2 + eq.cond * 0.14;
  if (p.id === 'popcorn') q -= Math.abs(g.site.recipe.salt - 48) * 0.22 + Math.max(0, 35 - g.site.recipe.butter) * 0.25;
  if (p.need === 'thirst' && p.hall === 'con') q -= Math.max(0, g.site.recipe.ice - 60) * 0.3;
  return clamp(q, 5, 100);
}
export function fairFood(g: Game, p: Product): number { return p.base * (0.82 + 0.24 * SUPPLY_TIERS[g.site.products[p.id]!.tier].quality) * (0.7 + 0.3 * siteDef(g.site.id).wealth); }
export function availableProducts(g: Game, hall: Product['hall']): Product[] {
  return PRODUCTS.filter((p) => p.hall === hall && g.site.products[p.id]!.enabled && g.site.equipment[p.equip]!.owned && !g.site.equipment[p.equip]!.broken);
}
export function buyFood(g: Game, m: Guest, gr: Group, hall: 'con' | 'food' | 'vip', skill: number): void {
  const stock = availableProducts(g, hall);
  let total = 0, x = m.x, z = m.z;
  for (const id of gr.members) {
    const k = g.guests.get(id);
    if (!k) continue;
    for (const need of ['hunger', 'thirst', 'fun'] as const) {
      const want = need === 'fun' ? 34 + (k.age === 'child' ? 26 : 0) : k[need];
      if (want < 26 || !g.rng.chance(clamp((want - 6) / 74 * archById(k.arch).appetite, 0, 0.94) * (need === 'fun' ? 0.42 : 1))) continue;
      const opts = stock.filter((p) => p.need === need);
      const pick = g.rng.weighted(opts, (p) => { const st = g.site.products[p.id]!; const r = st.price / fairFood(g, p); return (k.age === 'child' ? p.kids : 1) * Math.max(0.02, 2.1 - r * 1.2) * p.power * (p.id === 'popcorn' ? 2.6 : 1); });
      if (!pick) { if (need !== 'fun' && opts.length === 0 && g.rng.chance(0.5)) g.think(k, need === 'hunger' ? 'hungry' : 'thirsty'); continue; }
      const st = g.site.products[pick.id]!;
      if (st.stock <= 0) { g.think(k, 'foodGone', { item: pick.name.toLowerCase() }); g.stat('stockouts'); continue; }
      const fair = fairFood(g, pick), r = st.price / fair;
      if (r > 1.25 && g.rng.chance(clamp((r - 1.25) * 1.3 * (0.5 + k.thrift), 0, 0.95))) { g.think(k, 'foodDear', { item: pick.name.toLowerCase(), price: `$${st.price.toFixed(2)}` }); continue; }
      st.stock--; st.soldToday++; st.soldTotal++;
      total += st.price; k.spent += st.price; k.spentFood += st.price;
      g.stat(`sold_${pick.id}`);
      const q = foodQuality(g, pick, skill);
      k[need] = Math.max(0, k[need] - pick.power * (need === 'thirst' && hall === 'con' ? 1 - Math.max(0, g.site.recipe.ice - 50) / 120 : 1));
      if (need === 'thirst') k.bladder = Math.min(100, k.bladder + 16);
      if (pick.id === 'popcorn') {
        k.thirst = Math.min(100, k.thirst + g.site.recipe.salt * 0.22);
        if (g.site.recipe.salt > 76 && g.rng.chance(0.4)) g.think(k, 'salty'); else if (g.site.recipe.salt < 16 && g.rng.chance(0.4)) g.think(k, 'bland');
        if (g.site.recipe.butter > 60 && g.rng.chance(0.25)) g.think(k, 'buttery');
      }
      if (g.site.recipe.ice > 80 && need === 'thirst' && hall === 'con' && g.rng.chance(0.4)) g.think(k, 'iceOnly');
      g.think(k, q > 78 ? 'foodGreat' : q > 50 ? 'foodOk' : 'foodBad', { item: pick.name.toLowerCase() }, k.id !== m.id);
      if (r < 0.72 && g.rng.chance(0.4)) g.think(k, 'foodCheap', { item: pick.name.toLowerCase(), price: `$${st.price.toFixed(2)}` });
      if (pick.carry) k.carry = (k.carry & 3) | pick.carry;
      k.foodQ = Math.max(k.foodQ, 45 + pick.mess * 40);
      const eq = g.site.equipment[pick.equip]!;
      eq.cond = Math.max(0, eq.cond - g.rng.range(0.01, 0.05) * g.diff.wear);
    }
  }
  if (total > 0) { g.money(hall === 'con' ? 'concessions' : hall === 'food' ? 'food' : 'vip', total, x, z); g.emit({ type: 'sound', id: 'register', x, z }); }
}

// ------------------------------------------------------------------ main step
const walkAnim = (m: Guest) => (m.carry & 3 ? ANIM.carryWalk : ANIM.walk);
const standAnim = (m: Guest) => (m.carry & 3 ? ANIM.carryIdle : m.id % 3 === 0 ? ANIM.look : ANIM.idle);

export function stepGuests(g: Game, dt: number): void {
  g.hash.clear(); g.occ.fill(0);
  for (const m of g.s.guests) {
    m.px = m.x; m.pz = m.z; m.py = m.y;
    if (m.state !== 'seated' && m.state !== 'bench') { const k = Math.floor(m.x) * 1000 + Math.floor(m.z); const l = g.hash.get(k); if (l) l.push(m); else g.hash.set(k, [m]); }
    const i = cellX(m.x), j = cellZ(m.z);
    if (i >= 0 && j >= 0 && i < NX && j < NZ) g.occ[j * NX + i]!++;
  }
  for (const m of [...g.s.guests]) stepGuest(g, m, dt);
}

function stepGuest(g: Game, m: Guest, dt: number): void {
  const gr = g.groups.get(m.group);
  if (!gr) { g.removeGuest(m); return; }
  if (m.ghost > 0) m.ghost -= dt;
  if (m.emoT > 0) m.emoT -= dt;
  m.timer -= m.state === 'queueBox' || m.state === 'queueCon' ? 0 : dt;
  // staggered once-a-minute brain
  m.lastNeedT += dt;
  if (m.lastNeedT >= 1) { m.lastNeedT -= 1; perMinute(g, m, gr); if (!g.guests.has(m.id)) return; }
  switch (m.state) {
    case 'enter': {
      if (!m.path.length) {
        if (m.leader) { if (!setPath(g, m, g.rng.range(-4, 4), g.rng.range(14.6, 16))) { g.removeGuest(m); return; } }
        else { m.state = 'follow'; break; }
      }
      m.anim = ANIM.walk;
      if (moveAlong(g, m, m.speed, dt, true)) { m.path = []; lobbyImpression(g, m); m.state = 'idle'; m.timer = 0.2; }
      break;
    }
    case 'follow': {
      const L = g.guests.get(gr.leader);
      if (!L || L.id === m.id) { m.state = 'idle'; break; }
      const d = Math.hypot(L.x - m.x, L.z - m.z);
      const seatBound = L.state === 'toSeat' || L.state === 'sitting' || L.state === 'seated';
      if (gr.tickets && seatBound) { headToSeat(g, m); break; }
      if (L.state === 'leave') { startLeave(g, m); break; }
      if (d > 1.7) {
        if (m.pi >= m.path.length || m.timer <= 0) { const a = m.id * 2.4; setPath(g, m, L.x + Math.cos(a) * 0.9, L.z + Math.sin(a) * 0.9); m.timer = 1.2; }
        moveAlong(g, m, m.speed * (d > 4 ? 1.25 : 1), dt, true); m.anim = walkAnim(m);
      } else {
        m.path = []; m.pi = 0; turn(m, Math.atan2(L.x - m.x, L.z - m.z), dt * 4);
        m.anim = m.carry & 3 ? ANIM.carryIdle : (m.id + Math.floor(g.s.minute / 8)) % 3 === 0 ? ANIM.talk : ANIM.look;
        if (m.age !== 'child' && gr.tickets && m.timer <= 0) { m.timer = g.rng.range(3, 7); if (m.bladder > 58 && g.rng.chance(0.7)) goRestroom(g, m); else if (g.rng.chance(0.16)) goArcade(g, m); }
        else if (m.timer <= 0) { m.timer = 4; if (m.bladder > 70) goRestroom(g, m); }
      }
      break;
    }
    case 'idle': m.anim = standAnim(m); if (m.timer <= 0) { m.timer = g.rng.range(0.6, 1.4); decide(g, m, gr); } break;
    case 'queueBox': case 'queueCon': stepQueue(g, m, dt, gr); break;
    case 'kiosk': case 'bin': case 'browse': case 'restroomGo': case 'arcade': case 'bench': case 'table': case 'wait': stepActivity(g, m, dt, gr); break;
    case 'restroomWait': {
      m.anim = m.bladder > 80 ? ANIM.tap : ANIM.idle;
      if (m.timer <= 0) { m.timer = 1.5; if (!tryFixture(g, m)) { g.think(m, 'wcQueue'); if (g.rng.chance(0.09)) { m.state = 'idle'; m.bladder = Math.min(m.bladder, 74); } } }
      break;
    }
    case 'fixture': case 'sink': stepFixture(g, m, dt); break;
    case 'toSeat': stepToSeat(g, m, dt); break;
    case 'sitting': {
      const s = g.screeningById(m.screening), seat = s ? seatsOf(s.aud)[m.seat] : undefined;
      if (!s || !seat) { m.state = 'idle'; break; }
      const k = Math.min(1, dt / Math.max(0.1, m.timer + dt));
      m.x += (seat.x - m.x) * k; m.z += (seat.z - m.z) * k; m.y += (seat.y - m.y) * k; turn(m, Math.PI, dt * 8); m.anim = ANIM.sit;
      if (m.timer <= 0) { m.x = seat.x; m.z = seat.z; m.y = seat.y; m.dir = Math.PI; m.state = 'seated'; m.timer = 0; seatImpression(g, m, s); }
      break;
    }
    case 'seated': stepSeated(g, m, gr); break;
    case 'standing': {
      const a = g.screeningById(m.screening), seat = a ? seatsOf(a.aud)[m.seat] : undefined;
      if (seat) { const k = Math.min(1, dt / Math.max(0.1, m.timer + dt)); m.x += (seat.accessX - m.x) * k; m.z += (seat.accessZ - m.z) * k; }
      m.anim = ANIM.idle;
      if (m.timer <= 0) { if (seat) { m.x = seat.accessX; m.z = seat.accessZ; } afterStanding(g, m, gr); }
      break;
    }
    case 'leave': {
      m.anim = m.happy > 78 && !m.goal.includes('x') && m.id % 5 === 0 && m.z > 6 && m.z < 12 ? ANIM.cheer : walkAnim(m);
      if (!m.path.length && !setPath(g, m, Math.sign(m.x || 1) * 24, 20.75)) { finishVisit(g, m); g.removeGuest(m); return; }
      if (moveAlong(g, m, m.speed, dt, roomAt(m.x, m.z)?.kind !== 'auditorium')) { finishVisit(g, m); g.removeGuest(m); return; }
      if (m.z > 18.4) finishVisit(g, m);
      break;
    }
    case 'event': {
      if (m.path.length && m.pi < m.path.length) { moveAlong(g, m, m.speed, dt, true); m.anim = walkAnim(m); }
      else m.anim = m.goal === 'cheer' ? ANIM.cheer : m.goal === 'wave' ? ANIM.wave : m.goal === 'angry' ? ANIM.angry : ANIM.talk;
      if (m.timer <= 0) m.state = 'idle';
      break;
    }
    default: m.state = 'idle';
  }
}

// ------------------------------------------------------------------ decisions
function decide(g: Game, m: Guest, gr: Group): void {
  const s = g.screeningById(gr.screening);
  if (gr.done || !s || s.state === 'cancelled' || (s.state === 'ended')) { afterFilm(g, m, gr); return; }
  if (!gr.tickets) {
    if (!m.leader) { m.state = 'follow'; return; }
    if (gr.online) { gr.done = true; startLeave(g, m); return; }
    const kiosk = g.site.items.filter((i) => i.type === 'kiosk' && !i.broken && i.users.length < 2).sort((a, b) => a.users.length - b.users.length)[0];
    const boxQ = Math.min(...openStations(g, 'box').map((st) => (g.s.queues[st.id]?.length ?? 0) + (stationStaffed(g, st.id) ? 0 : 8)), 99);
    if (kiosk && m.age !== 'senior' && kiosk.users.length * 2.2 < boxQ + 1) { kiosk.users.push(m.id); m.itemId = kiosk.id; const p = g.itemFront(kiosk); if (go(g, m, p.x + (kiosk.users.length - 1) * 0.7, p.z, 'kiosk')) { m.timer = 40; return; } }
    if (!joinQueue(g, m, 'box', 'queueBox')) { gr.done = true; g.think(m, 'queueRage'); startLeave(g, m); }
    return;
  }
  const until = s.start + s.delay - g.s.minute;
  const playing = s.state === 'playing' || s.state === 'trailers';
  if (m.bladder > 62 || (m.bladder > 36 && until > 9 && g.rng.chance(0.35))) { if (goRestroom(g, m)) return; }
  if (m.seen === false && m.leader && !gr.conDone && until > 2 && until < 70) {
    const want = gr.members.some((id) => { const x = g.guests.get(id)!; return x && (x.hunger > 30 || x.thirst > 34 || x.age === 'child'); });
    const qlen = Math.min(...openStations(g, 'concession').map((st) => (g.s.queues[st.id]?.length ?? 0)), 99);
    if (want && g.rng.chance(0.9) && qlen < Math.max(2, (until - 6) / 3)) {
      if (gr.vip && g.site.equipment.bar?.owned && g.rng.chance(0.6)) { gr.conDone = true; if (go(g, m, 39.25, g.rng.range(10, 13.5), 'wait', 'bar')) { m.timer = 5; return; } }
      const hall = g.unlocked.has('foodcourt') && availableProducts(g, 'food').length && g.rng.chance(0.42) && until > 14 ? 'food' : 'concession';
      if (joinQueue(g, m, hall, 'queueCon')) return;
    } else if (!want) gr.conDone = true;
  }
  const seating = s.state === 'seating' || playing;
  if (seating && (until < 15 || (until < 21 && g.rng.chance(0.3)) || playing)) { headToSeat(g, m); return; }
  if ((m.carry & 3 || m.foodQ > 0) && m.foodQ <= 0) { dropTrash(g, m); }
  if (!m.leader && (m.age === 'child' || g.rng.chance(0.7))) { m.state = 'follow'; m.timer = 0; return; }
  if (until > 24 && g.rng.chance(archById(m.arch).arcade * 0.3) && goArcade(g, m)) return;
  if (m.thirst > 55 && g.rng.chance(0.5) && goItem(g, m, 'water', 'arcade', 3)) return;
  if (m.hunger > 55 && gr.conDone && g.rng.chance(0.3) && goItem(g, m, 'vending', 'arcade', 3)) return;
  if (until > 20 && (m.energy < 55 || g.rng.chance(0.22)) && goSit(g, m)) return;
  // browse the lobby
  const lob = g.rng.chance(0.6) ? ROOMS[1]!.rect : ROOMS[2]!.rect;
  for (let i = 0; i < 5; i++) {
    const x = Math.round(g.rng.range(Math.max(lob.x0, m.x - 14) + 0.6, Math.min(lob.x1, m.x + 14) - 0.6)) + 0.25, z = Math.round(g.rng.range(lob.z0 + 0.6, lob.z1 - 0.6)) + 0.25;
    if (g.nav.walkable(x, z) && !(x > -6.5 && x < 6.5 && z < 11 && z > 0) && !(x < -3 && z > 11.5 && z < 15.5)) { if (go(g, m, x, z, 'browse')) { m.timer = 30; return; } }
  }
  m.timer = 3;
}

function headToSeat(g: Game, m: Guest): void {
  const s = g.screeningById(m.screening);
  if (!s || m.seat < 0) { m.state = 'idle'; m.timer = 2; return; }
  const seat = seatsOf(s.aud)[m.seat]!;
  if (!go(g, m, seat.accessX, seat.accessZ, 'toSeat')) { m.state = 'idle'; m.timer = 3; }
}
function stepToSeat(g: Game, m: Guest, dt: number): void {
  const s = g.screeningById(m.screening);
  if (!s || s.state === 'ended' || s.state === 'cancelled') { m.state = 'idle'; return; }
  m.anim = walkAnim(m);
  const inAud = roomAt(m.x, m.z)?.kind === 'auditorium';
  if (moveAlong(g, m, m.speed, dt, !inAud)) { m.state = 'sitting'; m.timer = 0.8; m.path = []; }
}
function lobbyImpression(g: Game, m: Guest): void {
  if (m.seen) return;
  const b = DECOR.lobby[g.site.decor.lobby]!.beauty + Math.min(45, (g.beauty.lobby ?? 0) * 1.1);
  if (b > 62 && g.rng.chance(0.35)) g.think(m, 'lobbyGrand');
  else if (b < 18 && g.rng.chance(0.28)) g.think(m, 'lobbyShabby');
  else if (m.temper === 'curious' && b > 32 && g.rng.chance(0.5)) g.think(m, 'decorNice');
  if (g.site.amb.scent > 45 && g.rng.chance(0.2)) { g.think(m, 'smell'); m.hunger = Math.min(100, m.hunger + g.site.amb.scent * 0.14); }
  const music = MUSIC.find((x) => x.id === g.site.amb.music);
  const like = (music?.like as Partial<Record<ArchetypeId, number>> | undefined)?.[m.arch] ?? 0;
  if (like > 3 && g.rng.chance(0.25)) g.think(m, 'musicNice'); else if (like < -2 && g.site.amb.volume > 30 && g.rng.chance(0.3)) g.think(m, 'musicBad');
}
function seatImpression(g: Game, m: Guest, s: Screening): void {
  if (m.visits & 1) return;
  m.visits |= 1;
  const a = g.site.auds[s.aud - 1]!;
  if (a.seatDirt[m.seat]! > 55) g.think(m, 'seatDirty');
  else { const c = comfortOf(g, s.aud); g.think(m, c > 82 ? 'seatGood' : c > 50 ? 'seatOk' : g.rng.chance(0.5) ? 'seatBad' : 'seatOk', {}, true); }
  if (g.rng.chance(0.006 * [2, 1, 1][a.seatTier]! * g.diff.wear) && !a.seatBroken[m.seat]) {
    a.seatBroken[m.seat] = 1; g.think(m, 'seatBroken');
    const seat = seatsOf(s.aud)[m.seat]!;
    g.addJob({ kind: 'seat', role: 'tech', title: `Broken seat, ${g.audName(s.aud)} row ${String.fromCharCode(65 + seat.row)}`, x: seat.accessX, z: seat.accessZ, y: seat.y, ref: `seat:${s.aud}:${m.seat}`, need: 6, severity: 1 });
  }
}

// ------------------------------------------------------------------ activities
function stepActivity(g: Game, m: Guest, dt: number, gr: Group): void {
  const s = g.screeningById(gr.screening);
  if (m.path.length && m.pi < m.path.length) {
    m.anim = walkAnim(m);
    if (!moveAlong(g, m, m.speed, dt, true)) return;
    m.path = []; m.pi = 0;
    onArrive(g, m);
    return;
  }
  const it = m.itemId ? g.site.items.find((x) => x.id === m.itemId) : undefined;
  switch (m.state) {
    case 'restroomGo': if (!tryFixture(g, m)) { m.state = 'restroomWait'; m.timer = 1; } return;
    case 'browse': m.anim = m.leader && gr.members.length > 1 ? ANIM.talk : m.id % 2 ? ANIM.phone : ANIM.look; break;
    case 'kiosk': if (!it || it.broken) { freeItem(g, m); m.state = 'idle'; return; } turn(m, Math.atan2(it.x - m.x, it.z - m.z), dt * 5); m.anim = it.users[0] === m.id ? ANIM.use : ANIM.idle; if (it.users[0] !== m.id) m.timer = Math.max(m.timer, 4); break;
    case 'arcade': if (it) { turn(m, Math.atan2(it.x - m.x, it.z - m.z), dt * 6); m.anim = ANIM.use; } break;
    case 'bench': case 'table': if (it) { const p = itemSeat(it, it.users.indexOf(m.id)); m.x += (p.x - m.x) * Math.min(1, dt * 5); m.z += (p.z - m.z) * Math.min(1, dt * 5); turn(m, p.dir, dt * 8); m.y += (p.y - m.y) * Math.min(1, dt * 6); m.anim = m.foodQ > 0 && m.carry & 1 ? ANIM.sitEat : m.id % 3 ? ANIM.sit : ANIM.sitBored; m.energy = Math.min(100, m.energy + dt * 3); } break;
    case 'wait': m.anim = ANIM.talk; break;
  }
  if (s && s.state !== 'upcoming' && s.state !== 'seating' && m.timer > 3 && !gr.done && m.state !== 'kiosk') m.timer = 3;
  if (m.timer <= 0) endActivity(g, m, gr);
}
function onArrive(g: Game, m: Guest): void {
  const it = m.itemId ? g.site.items.find((x) => x.id === m.itemId) : undefined;
  if (m.state === 'restroomGo') { if (!tryFixture(g, m)) { m.state = 'restroomWait'; m.timer = 1.2; } return; }
  if (m.state === 'browse') m.timer = g.rng.range(2, 6);
  else if (m.state === 'kiosk') m.timer = 3.2;
  else if (m.state === 'bin') {
    if (it) { it.fill = Math.min(100, it.fill + 5); if (it.fill >= 80) g.addJob({ kind: 'bin', role: 'janitor', title: 'Full litter bin', x: it.x, z: it.z, ref: `item:${it.id}`, need: 2.5, severity: 1 }); }
    m.carry &= ~3; m.state = 'idle'; m.itemId = 0;
  } else if (m.state === 'arcade') {
    if (it?.broken) { g.think(m, 'arcadeBroken'); freeItem(g, m); m.state = 'idle'; return; }
    m.timer = it && (it.type === 'vending' || it.type === 'water') ? 2.5 : g.rng.range(7, 14);
  } else if (m.state === 'bench' || m.state === 'table') m.timer = g.rng.range(8, 20);
  else if (m.state === 'wait') m.timer = Math.max(m.timer, 4);
}
function endActivity(g: Game, m: Guest, gr: Group): void {
  const it = m.itemId ? g.site.items.find((x) => x.id === m.itemId) : undefined;
  if (m.state === 'kiosk') {
    if (it && it.users[0] === m.id) {
      freeItem(g, m);
      it.cond = Math.max(0, it.cond - 0.5 * g.diff.wear);
      if (sellTickets(g, gr)) { m.state = 'idle'; return; }
      gr.done = true; for (const id of gr.members) { const x = g.guests.get(id); if (x) startLeave(g, x); }
      return;
    }
    m.timer = 1; return;
  }
  if (m.state === 'arcade' && it) {
    const d = itemById(it.type);
    if (it.type === 'water') { m.thirst = Math.max(0, m.thirst - 45); m.bladder = Math.min(100, m.bladder + 9); }
    else if (it.type === 'vending') { m.hunger = Math.max(0, m.hunger - 24); m.thirst = Math.max(0, m.thirst - 14); m.spentFood += d.income!; m.spent += d.income!; it.income += d.income!; g.money('concessions', d.income!, it.x, it.z); }
    else if (d.income || d.fun) {
      m.fun = Math.min(100, m.fun + (d.fun ?? 0) * 1.5);
      if (d.income) { it.income += d.income; m.spent += d.income; g.money('arcade', d.income, it.x, it.z); g.stat('arcadePlays'); }
      g.think(m, it.type === 'photobooth' ? 'photo' : 'arcadeFun');
      if (g.rng.chance(0.35) && !d.id.includes('photo') && (g.screeningById(m.screening)?.start ?? 0) - g.s.minute > 10) { m.timer = g.rng.range(6, 10); it.cond = Math.max(0, it.cond - (d.wear ?? 0) * 2); return; }
    }
    it.cond = Math.max(0, it.cond - (d.wear ?? 0) * 3 * g.diff.wear);
  }
  if (m.state === 'wait' && m.goal === 'bar') { buyFood(g, m, gr, 'vip', 75); g.think(m, 'vipLove'); }
  if (m.state === 'bench' || m.state === 'table') g.think(m, 'rest', {}, true);
  freeItem(g, m);
  m.state = 'idle'; m.timer = 0.3;
}
function freeItem(g: Game, m: Guest): void {
  const it = m.itemId ? g.site.items.find((x) => x.id === m.itemId) : undefined;
  if (it) it.users = it.users.filter((u) => u !== m.id);
  m.itemId = 0;
  if (!g.nav.walkable(m.x, m.z)) { const k = g.nav.nearestFree(m.x, m.z); if (k >= 0) { m.path = [{ x: -50 + (k % NX + 0.5) * CELL, z: -32 + (Math.floor(k / NX) + 0.5) * CELL }]; m.x = m.path[0]!.x; m.z = m.path[0]!.z; m.path = []; } }
  m.y = floorY(m.x, m.z);
}
export function itemSeat(it: PlacedItem, i: number): { x: number; z: number; dir: number; y: number } {
  const r = it.rot * Math.PI / 2, k = Math.max(0, i);
  const loc = (lx: number, lz: number, d: number, y: number) => ({ x: it.x + lx * Math.cos(r) + lz * Math.sin(r), z: it.z - lx * Math.sin(r) + lz * Math.cos(r), dir: d + r, y });
  if (it.type === 'bench') return loc(k ? 0.36 : -0.36, 0.1, 0, 0.02);
  if (it.type === 'sofa') { const a = (k / 6) * Math.PI * 2 + 0.3; return { x: it.x + Math.sin(a) * 0.78, z: it.z + Math.cos(a) * 0.78, dir: a, y: 0 }; }
  if (it.type === 'table') { const a = k * Math.PI / 2 + Math.PI / 4; return { x: it.x + Math.cos(a) * 0.7, z: it.z + Math.sin(a) * 0.7, dir: Math.atan2(-Math.cos(a), -Math.sin(a)), y: 0.02 }; }
  return loc(0, 0.08, 0, 0.0);
}
function goItem(g: Game, m: Guest, type: string, state: 'arcade', t: number): boolean {
  const it = g.site.items.filter((i) => i.type === type && !i.broken && i.users.length < 1 && g.nav.distance(m.x, m.z, i.x, i.z) < 30)[0];
  if (!it) return false;
  const p = g.itemFront(it);
  if (!go(g, m, p.x, p.z, state)) return false;
  it.users.push(m.id); m.itemId = it.id; m.timer = 25 + t;
  return true;
}
function goArcade(g: Game, m: Guest): boolean {
  const list = g.site.items.filter((i) => itemById(i.type).cat === 'arcade' && !i.broken && i.users.length < 1);
  if (!list.length) return false;
  const it = g.rng.pick(list), p = g.itemFront(it);
  if (Math.hypot(p.x - m.x, p.z - m.z) > 46 || !go(g, m, p.x, p.z, 'arcade')) return false;
  it.users.push(m.id); m.itemId = it.id; m.timer = 40;
  return true;
}
function goSit(g: Game, m: Guest): boolean {
  const list = g.site.items.filter((i) => { const d = itemById(i.type); return d.seats && i.users.length < d.seats && Math.hypot(i.x - m.x, i.z - m.z) < 22; });
  if (!list.length) return false;
  list.sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z));
  const it = list[0]!, p = itemSeat(it, it.users.length);
  if (!go(g, m, p.x, p.z, it.type === 'table' ? 'table' : 'bench')) return false;
  it.users.push(m.id); m.itemId = it.id; m.timer = 40;
  return true;
}
export function dropTrash(g: Game, m: Guest): void {
  const bin = g.site.items.filter((i) => i.type === 'bin' && i.fill < 98 && Math.hypot(i.x - m.x, i.z - m.z) < 13)[0];
  if (bin && g.rng.chance(0.35 + m.tidy * 0.65)) { const p = g.itemFront(bin); if (go(g, m, p.x, p.z, 'bin')) { m.itemId = bin.id; m.timer = 20; return; } }
  if (!bin && m.tidy > 0.7) g.think(m, 'noBin');
  if (g.rng.chance(0.6 - m.tidy * 0.5)) { addLitter(g, m.carry & 1 ? 'bucket' : m.carry & 2 ? 'cup' : 'wrapper', m.x + g.rng.range(-0.3, 0.3), m.z + g.rng.range(-0.3, 0.3)); }
  m.carry &= ~3;
}
export function addLitter(g: Game, kind: Game['site']['litter'][number]['kind'], x: number, z: number, size = 1): void {
  if (g.site.litter.length > 320) return;
  g.site.litter.push({ id: g.id(), kind, x, z, size });
  g.stat('litter');
}

// ------------------------------------------------------------------ restrooms
function restroomsFor(g: Game, m: Guest): string[] {
  const gender = m.female ? 'w' : 'm';
  return ROOMS.filter((r) => r.kind === 'restroom' && r.gender === gender && g.unlocked.has(r.wing)).map((r) => r.id).sort((a, b) => {
    const A = ROOMS.find((r) => r.id === a)!.rect, B = ROOMS.find((r) => r.id === b)!.rect;
    return Math.abs(A.x0 - m.x) - Math.abs(B.x0 - m.x);
  });
}
export function goRestroom(g: Game, m: Guest): boolean {
  const id = restroomsFor(g, m)[0];
  if (!id) return false;
  const r = ROOMS.find((x) => x.id === id)!.rect;
  if (!go(g, m, (r.x0 + r.x1) / 2 + 0.4 + g.rng.range(-0.6, 0.6), g.rng.range(3.2, 5.6), 'restroomGo', id)) return false;
  m.timer = 30;
  return true;
}
function tryFixture(g: Game, m: Guest): boolean {
  const room = m.goal;
  const fs = FIXTURES.filter((f) => f.room === room && f.kind !== 'sink' && usable(g, f));
  if (!fs.length) return false;
  const f = (!m.female && fs.find((x) => x.kind === 'urinal' && g.rng.chance(0.7))) || g.rng.pick(fs);
  g.site.fixtures[f.id]!.user = m.id; m.fixtureId = f.id;
  if (!go(g, m, f.ux, f.uz, 'fixture', room)) { g.site.fixtures[f.id]!.user = 0; return false; }
  m.timer = f.kind === 'urinal' ? g.rng.range(2, 3.5) : g.rng.range(3.5, 6);
  return true;
}
const usable = (g: Game, f: FixtureDef) => { const s = g.site.fixtures[f.id]!; return !s.broken && !s.clogged && s.user === 0; };
function stepFixture(g: Game, m: Guest, dt: number): void {
  const f = FIXTURES.find((x) => x.id === m.fixtureId);
  if (!f) { m.state = 'idle'; return; }
  if (m.path.length && m.pi < m.path.length) { const was = m.timer; m.anim = walkAnim(m); moveAlong(g, m, m.speed, dt, false); m.timer = was; return; }
  m.x += (f.ux - m.x) * Math.min(1, dt * 5); m.z += (f.uz - m.z) * Math.min(1, dt * 5);
  turn(m, Math.atan2(f.x - m.x, f.z - m.z), dt * 7);
  m.anim = m.state === 'sink' ? ANIM.use : ANIM.idle;
  if (m.timer > 0) return;
  const st = g.site.fixtures[f.id]!;
  st.user = 0; m.fixtureId = '';
  if (m.state === 'sink') { st.clean = Math.max(0, st.clean - 1); m.state = 'idle'; m.goal = ''; return; }
  m.bladder = 0;
  st.clean = clamp(st.clean - (2.2 + (1 - m.tidy) * 5) * (g.site.decor.wc === 0 ? 1.2 : 0.9), 0, 100);
  g.site.supplies = Math.max(0, g.site.supplies - 0.28);
  const room = FIXTURES.filter((x) => x.room === f.room), avg = room.reduce((a, x) => a + g.site.fixtures[x.id]!.clean, 0) / room.length;
  const q = avg * 0.75 + DECOR.wc[g.site.decor.wc]!.beauty * 0.35;
  if (g.site.supplies < 3) g.think(m, 'wcNoPaper');
  if (q > 84 && g.rng.chance(0.35)) g.think(m, 'wcClean'); else if (q < 36 && g.rng.chance(0.75)) g.think(m, 'wcDirty');
  if (f.kind === 'toilet' && g.rng.chance(0.009 * g.diff.wear * (g.site.decor.wc === 0 ? 1.7 : 0.8))) {
    st.clogged = true;
    g.addJob({ kind: 'toilet', role: 'tech', title: 'Blocked toilet', x: f.ux, z: f.uz, ref: `fix:${f.id}`, need: 6, severity: 2 });
    if (g.rng.chance(0.4)) addLitter(g, 'water', f.ux, f.uz - 0.4, 1.6);
  }
  g.stat('flushes');
  if (m.tidy > 0.3 && g.rng.chance(0.8)) {
    const sinks = FIXTURES.filter((x) => x.room === f.room && x.kind === 'sink' && usable(g, x));
    if (sinks.length) { const k = g.rng.pick(sinks); g.site.fixtures[k.id]!.user = m.id; m.fixtureId = k.id; m.timer = 1.8; if (go(g, m, k.ux, k.uz, 'sink', f.room)) { m.timer = 1.8; return; } g.site.fixtures[k.id]!.user = 0; m.fixtureId = ''; }
  }
  m.state = 'idle'; m.timer = 0.2; m.goal = '';
}

// ------------------------------------------------------------------ in the film
function stepSeated(g: Game, m: Guest, gr: Group): void {
  const s = g.screeningById(m.screening);
  if (!s) { stand(m, 'leave'); return; }
  if (s.state === 'ended' || s.state === 'cancelled') {
    if (m.timer <= 0) { if (m.goal !== 'out') { m.goal = 'out'; m.timer = g.rng.range(0.5, 9); m.anim = m.enjoy > 66 && s.state === 'ended' ? ANIM.sitClap : ANIM.sit; return; } m.visits |= 2; stand(m, 'out'); }
    return;
  }
  if (m.emoT > 0) return;
  m.anim = m.foodQ > 0 && m.carry & 1 && (m.id + Math.floor(g.s.minute * 0.5)) % 3 === 0 ? ANIM.sitEat : m.emotion === 'sleepy' ? ANIM.sitSleep : m.emotion === 'bored' ? ANIM.sitBored : ANIM.sit;
  if (s.state === 'playing' && !s.fault) {
    if (m.bladder > 84 && m.timer <= 0) { m.timer = 8; g.think(m, 'bladderBad'); stand(m, 'wc'); return; }
    if (m.happy < 9 && g.rng.chance(0.004)) { walkOut(g, m, gr); }
  }
}
function stand(m: Guest, goal: string): void { m.state = 'standing'; m.goal = goal; m.timer = 0.6; }
function afterStanding(g: Game, m: Guest, gr: Group): void {
  if (m.goal === 'wc') { if (!goRestroom(g, m)) m.state = 'idle'; return; }
  if (m.goal === 'leave') { startLeave(g, m); return; }
  if (m.foodQ > 0 || m.carry & 3) leaveSeatMess(g, m);
  gr.done = true; m.seen = true;
  afterFilm(g, m, gr);
}
function leaveSeatMess(g: Game, m: Guest): void {
  const s = g.screeningById(m.screening);
  if (!s) return;
  const seat = seatsOf(s.aud)[m.seat], a = g.site.auds[s.aud - 1]!;
  if (!seat) return;
  a.seatDirt[m.seat] = clamp(a.seatDirt[m.seat]! + 10 + (1 - m.tidy) * 34, 0, 100);
  const takeOut = g.rng.chance(m.tidy * 0.62);
  if (m.carry & 1 && !takeOut) { addLitter(g, g.rng.chance(0.5) ? 'popcorn' : 'bucket', seat.x + g.rng.range(-0.2, 0.2), seat.accessZ + g.rng.range(0, 0.2)); m.carry &= ~1; }
  if (m.carry & 2 && !takeOut) { addLitter(g, 'cup', seat.x + g.rng.range(-0.2, 0.2), seat.accessZ + g.rng.range(0, 0.2)); m.carry &= ~2; }
  if (g.rng.chance(0.06 * (1 - m.tidy))) addLitter(g, 'spill', seat.x, seat.accessZ + 0.1, 0.9);
  m.foodQ = 0;
}
export function afterFilm(g: Game, m: Guest, gr: Group): void {
  if (m.carry & 3 && m.state !== 'bin') { m.foodQ = 0; dropTrash(g, m); if ((m.state as string) === 'bin') return; }
  if (m.bladder > 45 && g.rng.chance(0.85) && !(m.visits & 4)) { m.visits |= 4; if (goRestroom(g, m)) return; }
  if (!(m.visits & 8) && g.s.minute < 22 * 60 && m.happy > 45) { m.visits |= 8; if (g.rng.chance(archById(m.arch).arcade * 0.3) && goArcade(g, m)) return; }
  void gr;
  startLeave(g, m);
}
export function startLeave(g: Game, m: Guest): void {
  leaveQueue(g, m);
  if (m.itemId) freeItem(g, m);
  if (m.fixtureId) { const f = g.site.fixtures[m.fixtureId]; if (f) f.user = 0; m.fixtureId = ''; }
  const sp = g.rng.pick(SPAWNS);
  if (!go(g, m, sp.x, sp.z, 'leave')) { m.state = 'leave'; m.path = []; }
  g.think(m, 'home', {}, true);
}
export function guestLeaveGame(g: Game, m: Guest): void { const s = g.screeningById(m.screening); if (s && m.seat >= 0 && s.seats[m.seat] === m.id) s.seats[m.seat] = 0; startLeave(g, m); }
export function walkOut(g: Game, m: Guest, gr: Group): void {
  const s = g.screeningById(m.screening);
  g.s.walkouts++; m.walkout = true;
  if (s && g.site.policy.refunds && m.ticketPaid > 0) { g.money('refunds', -m.ticketPaid, m.x, m.z); g.think(m, 'refund'); } else g.think(m, 'noRefund');
  void gr;
  if (m.state === 'seated') stand(m, 'leave'); else startLeave(g, m);
}

/** One film "beat": a laugh, a scare, a tear. Called by the screening. */
export function filmBeat(g: Game, s: Screening, kind: 'laugh' | 'scare' | 'tears' | 'thrill'): void {
  const f = g.film(s.filmId), power = f.quality / 100;
  for (const id of s.seats) {
    const m = id ? g.guests.get(id) : undefined;
    if (!m || m.state !== 'seated' || m.emoT > 0) continue;
    const aff = archById(m.arch).taste[f.genre] ?? 0;
    const p = clamp((0.2 + power * 0.55 + aff / 60) * (kind === 'laugh' ? m.humor : kind === 'scare' ? (m.temper === 'anxious' ? 1.4 : 0.9) : 0.8), 0.02, 0.95);
    if (!g.rng.chance(p)) continue;
    m.emoT = g.rng.range(2, 4.5);
    if (kind === 'laugh') { m.emotion = 'laughing'; m.anim = ANIM.sitLaugh; if (g.rng.chance(0.2)) g.think(m, 'laugh'); else m.happy = clamp(m.happy + 1.2, 0, 100); }
    else if (kind === 'scare') { m.emotion = 'scared'; m.anim = ANIM.sitScared; if (m.age === 'child' || (m.age === 'senior' && g.rng.chance(0.3))) { if (g.rng.chance(0.3)) g.think(m, 'tooScary'); } else if (g.rng.chance(0.2)) g.think(m, 'scare'); else m.happy = clamp(m.happy + 1, 0, 100); }
    else if (kind === 'tears') { m.emotion = 'moved'; m.anim = ANIM.sitSad; if (g.rng.chance(0.2)) g.think(m, 'tears'); else m.happy = clamp(m.happy + 0.9, 0, 100); }
    else { m.emotion = 'delighted'; m.emoT = 1.6; if (g.rng.chance(0.1)) g.think(m, 'thrill'); else m.happy = clamp(m.happy + 0.8, 0, 100); }
  }
}

/** How much this guest is enjoying the film right now, 0..100. */
export function filmExperience(g: Game, m: Guest, s: Screening): number {
  const f = g.film(s.filmId), a = archById(m.arch), st = g.site.auds[s.aud - 1]!;
  const pic = pictureOf(g, s.aud), snd = soundOf(g, s.aud), com = comfortOf(g, s.aud) - (st.seatBroken[m.seat] ? 40 : 0) - st.seatDirt[m.seat]! * 0.2;
  const tech = pic * 0.5 + snd * 0.3 + com * 0.4;
  const aff = (a.taste[f.genre] ?? 0) + (m.taste === f.genre ? 8 : 0);
  const t = TEMPERS.find((x) => x.id === m.temper)!;
  const expect = 46 + a.standards * 16;
  const tempOff = Math.max(0, Math.abs(g.site.amb.temp - 21) - 1.5) * 4;
  return clamp(f.quality * 0.62 + 18 + aff * 0.85 + (tech - expect) * (0.2 + 0.16 * a.standards) + t.drift * 0.7 - tempOff, 0, 100);
}

// ------------------------------------------------------------------ per-minute mind
function perMinute(g: Game, m: Guest, gr: Group): void {
  const a = archById(m.arch);
  const rest = m.state === 'seated' ? 0.5 : 1;
  m.hunger = Math.min(100, m.hunger + 0.2 * a.appetite * rest);
  m.thirst = Math.min(100, m.thirst + (0.22 * rest) + Math.max(0, g.site.amb.temp - 23) * 0.05);
  m.bladder = Math.min(100, m.bladder + 0.26 + (m.age === 'senior' || m.age === 'child' ? 0.1 : 0));
  const moving = m.state !== 'seated' && m.state !== 'bench' && m.state !== 'table';
  m.energy = clamp(m.energy + (moving ? -0.35 : 0.6), 0, 100);
  if (m.foodQ > 0) { m.foodQ -= 1.1; if (m.state === 'seated' || m.state === 'bench') m.foodQ -= 0.4; }
  const s = g.screeningById(m.screening);
  const room = roomAt(m.x, m.z);
  let target = m.happy;
  if (m.state === 'seated' && s && (s.state === 'playing' || s.state === 'trailers')) {
    if (s.fault) {
      target = 14; m.emotion = 'annoyed'; m.anim = s.faultTime > 6 ? ANIM.angry : ANIM.sitBored;
      m.anim = ANIM.sitBored;
      g.think(m, s.faultTime > 12 ? 'faultLong' : 'fault');
      if (s.faultTime > 14 && g.rng.chance(0.05 + (1 - m.patience) * 0.07)) { walkOut(g, m, gr); return; }
    } else if (s.state === 'playing') {
      const e = filmExperience(g, m, s);
      target = e + (m.hunger > 78 ? -6 : 0) + (m.thirst > 80 ? -6 : 0) - Math.max(0, m.bladder - 60) * 0.5;
      m.enjoy = m.enjoy === 0 ? e : m.enjoy * 0.97 + e * 0.03;
      s.enjoy += e; s.enjoyN++;
      const film = g.film(s.filmId).title;
      if (g.rng.chance(0.02)) g.think(m, e > 80 ? 'filmGreat' : e > 62 ? 'filmGood' : e > 46 ? 'filmMeh' : e > 32 ? 'filmBad' : 'filmAwful', { film });
      if (g.rng.chance(0.007)) { const pic = pictureOf(g, s.aud); if (pic > 82) g.think(m, 'picGreat'); else if (pic < 46 && g.rng.chance(a.standards)) g.think(m, 'picBad'); const snd = soundOf(g, s.aud); if (snd > 80) g.think(m, 'sndGreat'); else if (snd < 42 && g.rng.chance(a.standards)) g.think(m, 'sndBad'); }
      if (m.emoT <= 0) m.emotion = e < 34 ? (m.energy < 40 ? 'sleepy' : 'bored') : emotionOf(m.happy);
      if (comfortOf(g, s.aud) > 85 && m.energy < 46 && e < 55 && g.rng.chance(0.02)) { m.emotion = 'sleepy'; m.emoT = 14; m.anim = ANIM.sitSleep; g.think(m, 'sleepy'); }
      disturb(g, m, s);
    } else { if (s.start + s.delay + g.site.policy.trailers > s.start + s.delay + 15 && g.rng.chance(0.03)) g.think(m, 'trailersLong'); else if (g.rng.chance(0.012)) g.think(m, 'trailersFun'); }
    m.happy += (target - m.happy) * 0.045;
  } else {
    // environment
    let env = 57 + TEMPERS.find((x) => x.id === m.temper)!.drift;
    const i = cellX(m.x), j = cellZ(m.z), k = j * NX + i;
    if (room && room.kind !== 'street') {
      const dirt = g.site.dirt[k] ?? 0;
      env -= dirt * 13;
      if (dirt > 0.72 && g.rng.chance(0.2 + m.tidy * 0.2)) g.think(m, 'filthy');
      else if (dirt < 0.08 && m.tidy > 0.6 && g.rng.chance(0.015)) g.think(m, 'spotless');
      let near = 0, gross = false, wet = false;
      for (const l of g.site.litter) { const d = Math.abs(l.x - m.x) + Math.abs(l.z - m.z); if (d < 2.6) { near++; if (l.kind === 'vomit') gross = true; if (l.kind === 'water') wet = true; } }
      env -= near * 2.4;
      if (gross) g.think(m, 'vomit'); else if (wet && g.rng.chance(0.3)) g.think(m, 'wet'); else if (near > 2 && g.rng.chance(0.3)) g.think(m, 'litter');
      const lvl = room.kind === 'lobby' ? DECOR.lobby[g.site.decor.lobby]!.beauty : room.kind === 'promenade' ? DECOR.prom[g.site.decor.prom]!.beauty : room.kind === 'restroom' ? 20 : 40;
      env += (Math.min(100, lvl + (g.beauty[room.id] ?? 0)) - 24) * 0.16;
      const music = MUSIC.find((x) => x.id === g.site.amb.music);
      env += (((music?.like as Partial<Record<ArchetypeId, number>> | undefined)?.[m.arch]) ?? 0) * Math.min(1, g.site.amb.volume / 45);
      const off = g.site.amb.temp - 21 + (g.site.heat ?? 0);
      if (off > 2.5) { env -= (off - 2) * 3; if (g.rng.chance(0.04)) g.think(m, 'hot'); } else if (off < -2.5) { env += (off + 2) * 3; if (g.rng.chance(0.04)) g.think(m, 'cold'); } else if (g.rng.chance(0.002)) g.think(m, 'toasty');
      let crowd = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) crowd += g.occ[(j + dj) * NX + i + di] ?? 0;
      if (crowd > 7) { env -= (crowd - 7) * 2 * (m.temper === 'anxious' ? 1.6 : 1); if (g.rng.chance(0.05)) g.think(m, 'crowded'); }
      if (!g.site.power) { env -= 22; if (g.rng.chance(0.2)) g.think(m, 'dark'); }
      const L = g.site.amb.lights;
      if (L < 25 && room.kind !== 'arcade') env -= (25 - L) * 0.3;
    }
    if (m.hunger > 74) { env -= (m.hunger - 70) * 0.35; if (g.rng.chance(0.06)) g.think(m, 'hungry'); }
    if (m.thirst > 76) { env -= (m.thirst - 72) * 0.35; if (g.rng.chance(0.06)) g.think(m, 'thirsty'); }
    if (m.bladder > 66) { env -= (m.bladder - 62) * 0.6; if (g.rng.chance(0.1)) g.think(m, m.bladder > 88 ? 'bladderBad' : 'bladder'); }
    if (m.energy < 24) { env -= 6; if (g.rng.chance(0.06)) g.think(m, 'tired'); }
    if (m.seen || m.visits & 2) env = env * 0.3 + (m.enjoy || m.happy) * 0.7;
    m.happy += (clamp(env, 0, 100) - m.happy) * 0.055;
    if (s && !m.seen && s.state === 'upcoming' && g.s.minute > s.start + 8 && g.rng.chance(0.1)) g.think(m, 'lateStart');
    if (m.emoT <= 0) m.emotion = emotionOf(m.happy);
    if (m.happy < 7 && m.state !== 'leave' && m.state !== 'enter' && g.rng.chance(0.08)) walkOut(g, m, gr);
  }
  m.happy = clamp(m.happy, 0, 100);
}
export function emotionOf(h: number): Guest['emotion'] { return h > 84 ? 'delighted' : h > 68 ? 'happy' : h > 54 ? 'content' : h > 42 ? 'neutral' : h > 28 ? 'bored' : h > 14 ? 'annoyed' : 'angry'; }

export function disturb(g: Game, m: Guest, s: Screening): void {
  const strict = g.site.policy.strict;
  const ushers = g.site.staff.filter((x) => x.role === 'usher' && x.state !== 'off' && x.state !== 'strike').length;
  const control = clamp((strict / 100) * 0.55 + Math.min(0.45, ushers * 0.22), 0, 0.95);
  if (!g.rng.chance(0.0032 * m.rowdy * (1 - control * 0.75) + (g.site.policy.phones ? 0.0016 : 0.0004))) return;
  const kind = g.rng.chance(m.rowdy) ? 'talker' : 'phone';
  const a = audById(s.aud), row = Math.floor(m.seat / a.cols), col = m.seat % a.cols;
  m.anim = kind === 'talker' ? ANIM.sitLaugh : ANIM.sit; m.emoT = 3;
  const caught = g.rng.chance(control);
  for (let r = row - 1; r <= row + 1; r++) for (let c = col - 3; c <= col + 3; c++) {
    if (r < 0 || c < 0 || r >= a.rows || c >= a.cols) continue;
    const o = g.guests.get(s.seats[r * a.cols + c] ?? 0);
    if (!o || o.group === m.group || o.state !== 'seated') continue;
    g.think(o, kind); if (caught && g.rng.chance(0.6)) g.think(o, 'shushed');
  }
  if (caught) { if (strict > 80 && g.rng.chance(0.4)) g.think(m, 'tooStrict'); g.stat('shushed'); }
}

// ------------------------------------------------------------------ goodbye
function finishVisit(g: Game, m: Guest): void {
  if (m.goal === 'gone') return;
  m.goal = 'gone';
  const gr = g.groups.get(m.group);
  if (m.ticketPaid > 0) {
    g.s.satSum += m.happy; g.s.satN++;
    g.site.dayGuests++;
  }
  if (m.ticketPaid > 0) { g.s.guestsToday++; g.stat('guests'); }
  const s = g.screeningById(m.screening);
  if (s && m.visits & 2) {
    const f = g.film(s.filmId);
    f.wom = clamp(f.wom + (m.enjoy - 57) * 0.016, -28, 34);
    if (m.spent < fairTicket(g, s.aud) * 1.5 && m.happy > 72 && g.rng.chance(0.2)) g.think(m, 'valueGreat');
    else if (m.spent > 34 && m.happy < 55 && g.rng.chance(0.4)) g.think(m, 'valueBad');
  }
  const voice = m.special === 'critic' ? 1 : m.special === 'influencer' ? 1 : m.age === 'child' ? 0 : m.ticketPaid > 0 ? 0.14 : 0.03;
  if (gr && g.rng.chance(voice)) writeReview(g, m, s);
}
function writeReview(g: Game, m: Guest, s?: Screening): void {
  const stars = clamp(Math.round(((m.happy - 8) / 18.5) * 2) / 2, 0.5, 5);
  const good = m.thoughts.filter((t) => t.tone > 0 && t.code !== 'ticketFair' && t.code !== 'seatOk'), bad = m.thoughts.filter((t) => t.tone < 0);
  const pick = (stars >= 3 ? [...good.slice(0, 2), ...bad.slice(0, 1)] : [...bad.slice(0, 2), ...good.slice(0, 1)]).map((t) => t.text);
  if (!pick.length) pick.push(stars >= 3.5 ? 'A lovely evening.' : stars >= 2.5 ? 'It was fine.' : 'Disappointing.');
  const source = m.special === 'critic' ? 'critic' : m.special === 'influencer' ? 'influencer' : 'guest';
  g.s.reviews.unshift({ id: g.id(), day: g.s.day, stars, text: pick.join(' '), name: m.name, film: s ? g.film(s.filmId).title : '', arch: m.arch, source });
  if (g.s.reviews.length > 70) g.s.reviews.length = 70;
  const w = source === 'guest' ? 0.1 : source === 'critic' ? 2.6 : 2.2;
  g.site.reputation = clamp(g.site.reputation + (stars - 2.6) * w, 0, 100);
  if (source !== 'guest') g.news(stars >= 3.5 ? 'good' : 'bad', `${source === 'critic' ? 'Critic' : 'Influencer'} ${m.name} gives you ${stars} stars: “${pick[0]}”`);
  else if (stars >= 4.5 || stars <= 1.5) g.news('review', `${'★'.repeat(Math.floor(stars))}${stars % 1 ? '½' : ''}  ${m.name}: “${pick[0]}”`);
}
export function clearGuests(g: Game): void {
  for (const m of [...g.s.guests]) { finishVisit(g, m); }
  g.s.guests.length = 0; g.s.groups.length = 0; g.guests.clear(); g.groups.clear(); g.s.queues = {};
  for (const f of Object.values(g.site.fixtures)) f.user = 0;
  for (const it of g.site.items) it.users = [];
}
void productById;
