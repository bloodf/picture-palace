import { ARCHETYPES, CAMPAIGNS, DECOR, EQUIPMENT, FIRST_F, FIRST_M, ITEMS, LAST, PRODUCTS, PROJ_TIERS, ROLES, SCREEN_TIERS, SEAT_TIERS, SITES, SOUND_TIERS, SUPPLY_TIERS, TRAITS, equipById, itemById, productById, siteDef, type DecorKey } from './data/catalog';
import { AUDS, FIXED_SOLIDS, ROOMS, STATIONS, WINGS, audById, roomAt, seatsOf, type StationDef, type WingId } from './plan';
import { Nav, NX, NZ, type Footprint } from './nav';
import { Rng, clamp } from './rng';
import { DIFFICULTY, freshAud, newGame, type NewGameOptions } from './state';
import { THOUGHTS } from './thoughts';
import type { Candidate, GameState, Group, Guest, Job, JobKind, LedgerCat, NewsItem, PlacedItem, Screening, SiteState, Staff, StaffRole, Thought } from './types';
import { spawnArrivals, stepGuests, clearGuests, guestLeaveGame } from './guests';
import { stepStaff, assignStations } from './staff';
import { buildScreenings, stepScreenings, autoProgram, validateSlot } from './screenings';
import { refreshMarket, dailyFilms } from './market';
import { finishJob, maintenanceMinute, spreadDirt } from './maintenance';
import { directorTick, resolveEvent, expireEvents } from './events';
import { computeRating } from './rating';
import { simulateOthers } from './chain';
import { checkObjectives } from './objectives';

export const DAY_OPEN = 10 * 60, DAY_PREP = 9 * 60, DAY_LAST_START = 23 * 60, DAY_END = 26 * 60;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_FACTOR = [0.74, 0.7, 0.76, 0.86, 1.22, 1.45, 1.2];
export const STEP = 0.1;

export interface Result { ok: boolean; msg: string }
export const ok = (msg = ''): Result => ({ ok: true, msg });
export const no = (msg: string): Result => ({ ok: false, msg });

export type GameEvent =
  | { type: 'news'; item: NewsItem } | { type: 'cash'; amount: number; x?: number; z?: number; cat: LedgerCat } | { type: 'thought'; guest: number; code: string; tone: number }
  | { type: 'sound'; id: string; x?: number; z?: number } | { type: 'layout' } | { type: 'dayEnd' } | { type: 'event'; id: number } | { type: 'objective'; title: string; reward: number } | { type: 'jobDone'; kind: JobKind; x: number; z: number } | { type: 'fx'; id: string; x: number; z: number };

export interface PlayerInfo { active: boolean; x: number; z: number; y: number }

export class Game {
  s: GameState;
  rng: Rng;
  nav = new Nav();
  guests = new Map<number, Guest>();
  groups = new Map<number, Group>();
  player: PlayerInfo = { active: false, x: 0, z: 14, y: 0 };
  private subs = new Set<(e: GameEvent) => void>();
  private acc = 0;
  private lastMinute = -1;
  occ = new Uint8Array(NX * NZ);
  hash = new Map<number, Guest[]>();
  /** Beauty of each room from décor, recomputed on layout change. */
  beauty: Record<string, number> = {};

  constructor(state?: GameState, opts?: NewGameOptions) {
    this.s = state ?? newGame(opts);
    this.rng = new Rng(this.s.rng);
    for (const g of this.s.guests) this.guests.set(g.id, g);
    for (const g of this.s.groups) this.groups.set(g.id, g);
    this.relayout();
    if (!state) {
      refreshMarket(this, true);
      this.refreshCandidates();
      autoProgram(this);
      buildScreenings(this);
      computeRating(this);
      this.news('info', `You hold the keys to ${this.s.site.name}. One screen, one popcorn machine, sixty seats. Some of them work.`);
    }
    this.lastMinute = Math.floor(this.s.minute);
  }

  // -------------------------------------------------------------- plumbing
  on(fn: (e: GameEvent) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(e: GameEvent): void { for (const f of this.subs) f(e); }
  id(): number { return this.s.ids++; }
  get site(): SiteState { return this.s.site; }
  get weekday(): number { return (this.s.day + 3) % 7; } // day 1 = Friday
  get unlocked(): Set<WingId> { return new Set(this.s.site.wings); }
  get diff() { return DIFFICULTY[this.s.difficulty]; }
  clock(m = this.s.minute): string { const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60); return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
  stat(k: string, n = 1): void { this.s.stats[k] = (this.s.stats[k] ?? 0) + n; }
  film(id: string) { return this.s.films.find((f) => f.id === id)!; }
  effect(id: string): number { let v = 0; for (const e of this.s.effects) if (e.id === id) v += e.v; return v; }
  addEffect(id: string, days: number, v: number): void { this.s.effects.push({ id, until: this.s.day + days, v }); }

  news(kind: NewsItem['kind'], text: string, x?: number, z?: number): void {
    const item: NewsItem = { id: this.id(), day: this.s.day, t: this.s.minute, kind, text, x, z };
    this.s.news.unshift(item);
    if (this.s.news.length > 80) this.s.news.length = 80;
    this.emit({ type: 'news', item });
  }

  /** Positive = income, negative = expense. */
  money(cat: LedgerCat, amount: number, x?: number, z?: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    this.s.cash += amount;
    this.s.today[cat] = (this.s.today[cat] ?? 0) + amount;
    if (amount > 0) { this.s.site.dayRev += amount; this.stat('revenue', amount); } else this.s.site.dayCost -= amount;
    this.emit({ type: 'cash', amount, x, z, cat });
  }
  spend(cat: LedgerCat, cost: number): Result {
    if (this.s.cash < cost) return no(`Not enough cash: ${fmt(cost)} needed.`);
    this.money(cat, -cost);
    return ok();
  }

  // -------------------------------------------------------------- layout
  footprint(it: { type: string; x: number; z: number; rot: number }): Footprint {
    const d = itemById(it.type);
    const w = it.rot % 2 ? d.d : d.w, h = it.rot % 2 ? d.w : d.d;
    return { x0: it.x - w / 2, x1: it.x + w / 2, z0: it.z - h / 2, z1: it.z + h / 2 };
  }
  snap(type: string, x: number, z: number, rot: number): { x: number; z: number } {
    const d = itemById(type);
    const w = rot % 2 ? d.d : d.w, h = rot % 2 ? d.w : d.d;
    const s = (v: number, size: number) => Math.round((v - size / 2) * 2) / 2 + size / 2;
    return { x: s(x, w), z: s(z, h) };
  }
  relayout(): void {
    this.nav.rebuild(this.unlocked, this.s.site.items.map((i) => this.footprint(i)));
    this.beauty = {};
    for (const it of this.s.site.items) {
      const r = roomAt(it.x, it.z);
      if (r) this.beauty[r.id] = (this.beauty[r.id] ?? 0) + itemById(it.type).beauty * (it.broken ? 0 : 1);
    }
    this.emit({ type: 'layout' });
  }
  canPlace(type: string, x: number, z: number, rot: number, ignore = 0): Result {
    const def = itemById(type);
    const p = this.footprint({ type, x, z, rot });
    const cx = [p.x0 + 0.02, (p.x0 + p.x1) / 2, p.x1 - 0.02], cz = [p.z0 + 0.02, (p.z0 + p.z1) / 2, p.z1 - 0.02];
    for (const a of cx) for (const b of cz) {
      const r = roomAt(a, b);
      if (!r || !def.rooms.includes(r.kind)) return no(`The ${def.name.toLowerCase()} can’t go there.`);
      if (!this.unlocked.has(r.wing)) return no('That wing is still closed.');
      const k = r.rect, m = 0.15;
      if (a < k.x0 + m - 0.03 || a > k.x1 - m + 0.03 || b < k.z0 + m - 0.03 || b > k.z1 - m + 0.03) return no('Too close to the wall.');
    }
    const hit = (q: Footprint, e = 0.01) => p.x0 < q.x1 - e && p.x1 > q.x0 + e && p.z0 < q.z1 - e && p.z1 > q.z0 + e;
    for (const f of FIXED_SOLIDS) if (hit(f)) return no('Something is already there.');
    for (const it of this.s.site.items) if (it.id !== ignore && hit(this.footprint(it))) return no(`The ${itemById(it.type).name.toLowerCase()} is in the way.`);
    for (const st of STATIONS) {
      if (hit({ x0: st.sx - 0.5, x1: st.sx + 0.5, z0: st.sz - 0.5, z1: st.sz + 0.5 })) return no('Staff need to stand there.');
      if (hit({ x0: st.qx - 0.6, x1: st.qx + 0.6, z0: st.qz - 0.6, z1: st.qz + 0.6 })) return no('Customers need to stand there.');
    }
    if (hit({ x0: -5, x1: 5, z0: 16.4, z1: 19.5 })) return no('Keep the entrance clear.');
    if (this.player.active && hit({ x0: this.player.x - 0.35, x1: this.player.x + 0.35, z0: this.player.z - 0.35, z1: this.player.z + 0.35 })) return no('You are standing there.');
    // never let furniture wall anything off
    const test = new Nav();
    test.rebuild(this.unlocked, [...this.s.site.items.filter((i) => i.id !== ignore).map((i) => this.footprint(i)), p]);
    const targets = this.keyPoints();
    if (!test.reachable({ x: 0, z: 20 }, targets)) return no('That would block the way through.');
    return ok();
  }
  keyPoints(): { x: number; z: number }[] {
    const u = this.unlocked;
    const out: { x: number; z: number }[] = [];
    for (const st of STATIONS) if (u.has(st.wing)) out.push({ x: st.qx, z: st.qz }, { x: st.sx, z: st.sz });
    for (const a of AUDS) if (u.has(a.wing)) { const s = seatsOf(a.id); out.push({ x: s[0]!.accessX, z: s[0]!.accessZ }, { x: a.cx, z: -7 }); }
    for (const r of ROOMS) if (u.has(r.wing) && r.kind === 'restroom') out.push({ x: (r.rect.x0 + r.rect.x1) / 2 + 0.5, z: 5.75 });
    out.push({ x: -20, z: 11 });
    for (const it of this.s.site.items) { const d = this.itemFront(it); out.push(d); }
    return out;
  }
  itemFront(it: { type: string; x: number; z: number; rot: number }): { x: number; z: number } {
    const d = itemById(it.type), r = it.rot * Math.PI / 2, dist = d.d / 2 + 0.45;
    const p = { x: it.x + Math.sin(r) * dist, z: it.z + Math.cos(r) * dist };
    const k = this.nav.nearestFree(p.x, p.z, 4);
    if (k < 0) return p;
    return { x: -50 + (k % NX + 0.5) * 0.5, z: -32 + (Math.floor(k / NX) + 0.5) * 0.5 };
  }
  placeItem(type: string, x: number, z: number, rot: 0 | 1 | 2 | 3): Result {
    const def = itemById(type);
    if (this.s.chapter < def.chapter) return no('Not available yet.');
    const p = this.snap(type, x, z, rot);
    const c = this.canPlace(type, p.x, p.z, rot);
    if (!c.ok) return c;
    const r = this.spend('build', def.cost);
    if (!r.ok) return r;
    this.s.site.items.push({ id: this.id(), type, x: p.x, z: p.z, rot, cond: 100, fill: 0, broken: false, users: [], income: 0 });
    this.stat('itemsPlaced');
    this.relayout();
    this.emit({ type: 'sound', id: 'place', x: p.x, z: p.z });
    return ok(`${def.name} placed.`);
  }
  moveItem(id: number, x: number, z: number, rot: 0 | 1 | 2 | 3): Result {
    const it = this.s.site.items.find((i) => i.id === id);
    if (!it) return no('Gone.');
    const p = this.snap(it.type, x, z, rot);
    const c = this.canPlace(it.type, p.x, p.z, rot, id);
    if (!c.ok) return c;
    Object.assign(it, { x: p.x, z: p.z, rot });
    this.releaseItem(it);
    this.relayout();
    return ok();
  }
  private releaseItem(it: PlacedItem): void {
    for (const u of it.users) { const g = this.guests.get(u); if (g) { g.itemId = 0; g.state = 'idle'; } }
    it.users = [];
  }
  sellItem(id: number): Result {
    const i = this.s.site.items.findIndex((x) => x.id === id);
    if (i < 0) return no('Gone.');
    const it = this.s.site.items[i]!;
    this.releaseItem(it);
    this.s.site.items.splice(i, 1);
    this.s.site.jobs = this.s.site.jobs.filter((j) => j.ref !== `item:${id}`);
    this.money('build', Math.round(itemById(it.type).cost * 0.4 * (it.cond / 100)));
    this.relayout();
    return ok('Sold.');
  }

  // -------------------------------------------------------------- building & upgrades
  buildWing(id: WingId): Result {
    const w = WINGS.find((x) => x.id === id);
    if (!w) return no('No such wing.');
    if (this.s.site.wings.includes(id)) return no('Already open.');
    if (this.s.chapter < w.needsChapter) return no(`Unlocks in chapter ${w.needsChapter}.`);
    const r = this.spend('build', w.cost);
    if (!r.ok) return r;
    this.s.site.wings.push(id);
    const a = AUDS.find((x) => x.wing === id);
    if (a) {
      const st = freshAud(a.id, true, this.rng, 0);
      st.seatBroken.fill(0); st.seatDirt.fill(0); st.projCond = 90; st.lampHours = 0; st.focus = 95;
      if (a.id >= 3) { st.projTier = 1; st.screenTier = 1; st.seatTier = 1; st.soundTier = 1; }
      this.s.site.auds[a.id - 1] = st;
    }
    this.stat('wings');
    this.relayout();
    this.news('good', `${w.name} is open for business.`, a ? a.cx : undefined, a ? -8 : undefined);
    this.emit({ type: 'sound', id: 'fanfare' });
    return ok(`${w.name} opened.`);
  }
  upgradeCost(aud: number, kind: 'seat' | 'screen' | 'sound' | 'proj'): number | null {
    const a = this.s.site.auds[aud - 1]!;
    const n = seatsOf(aud).length, k = Math.sqrt(n / 60);
    if (kind === 'seat') { const t = SEAT_TIERS[a.seatTier + 1]; return t ? Math.round(t.cost * n / 50) * 50 : null; }
    if (kind === 'screen') { const t = SCREEN_TIERS[a.screenTier + 1]; return t ? Math.round(t.cost * k / 100) * 100 : null; }
    if (kind === 'sound') { const t = SOUND_TIERS[a.soundTier + 1]; return t ? Math.round(t.cost * k / 100) * 100 : null; }
    const t = PROJ_TIERS[a.projTier + 1];
    return t ? Math.round(t.cost * (0.7 + 0.3 * k) / 100) * 100 : null;
  }
  upgradeAud(aud: number, kind: 'seat' | 'screen' | 'sound' | 'proj'): Result {
    const a = this.s.site.auds[aud - 1]!;
    if (!a.built) return no('That screen is not open.');
    if (this.s.screenings.some((x) => x.aud === aud && (x.state === 'seating' || x.state === 'trailers' || x.state === 'playing'))) return no('Wait until the house is empty.');
    const cost = this.upgradeCost(aud, kind);
    if (cost === null) return no('Already the best there is.');
    const r = this.spend('build', cost);
    if (!r.ok) return r;
    if (kind === 'seat') { a.seatTier++; a.seatBroken.fill(0); a.seatDirt.fill(0); this.dropJobs((j) => j.kind === 'seat' && j.ref.startsWith(`seat:${aud}:`)); }
    if (kind === 'screen') a.screenTier++;
    if (kind === 'sound') a.soundTier++;
    if (kind === 'proj') { a.projTier++; a.projCond = 100; a.lampHours = 0; a.focus = 100; a.fault = null; this.dropJobs((j) => j.kind === 'projector' && j.ref === `proj:${aud}`); }
    this.stat('upgrades');
    this.emit({ type: 'layout' });
    return ok('Installed overnight crew in an afternoon.');
  }
  upgradeDecor(k: DecorKey): Result {
    const t = DECOR[k][this.s.site.decor[k] + 1];
    if (!t) return no('Already the best there is.');
    const r = this.spend('build', t.cost);
    if (!r.ok) return r;
    this.s.site.decor[k]++;
    this.stat('upgrades');
    this.emit({ type: 'layout' });
    return ok(`${t.name}: done.`);
  }
  buyEquip(id: string): Result {
    const e = equipById(id), st = this.s.site.equipment[id]!;
    if (st.owned) return no('Already owned.');
    if (e.wing && !this.unlocked.has(e.wing as WingId)) return no('Needs its wing to be open first.');
    const r = this.spend('build', e.cost);
    if (!r.ok) return r;
    st.owned = true; st.cond = 100; st.broken = false;
    for (const p of PRODUCTS) if (p.equip === id) this.s.site.products[p.id]!.stock += 60;
    this.emit({ type: 'layout' });
    return ok(`${e.name} installed, with sixty portions to start.`);
  }

  // -------------------------------------------------------------- concessions
  orderStock(id: string, qty: number): Result {
    const p = productById(id), st = this.s.site.products[id]!;
    const cost = qty * p.cost * SUPPLY_TIERS[st.tier].cost * (1 + this.effect('supplyCost'));
    const r = this.spend('stock', Math.round(cost * 100) / 100);
    if (!r.ok) return r;
    st.stock += qty;
    return ok(`${qty} × ${p.name} delivered.`);
  }
  buySupplies(): Result { const r = this.spend('stock', 60); if (r.ok) { this.s.site.supplies = 100; this.dropJobs((j) => j.kind === 'supplies'); } return r.ok ? ok('Soap and paper restocked.') : r; }

  // -------------------------------------------------------------- staff
  refreshCandidates(): void {
    const roles: StaffRole[] = ['box', 'concession', 'usher', 'janitor', 'janitor', 'tech', 'security', 'concession'];
    this.s.site.candidates = roles.map((role) => {
      const female = this.rng.chance(0.5), R = ROLES[role];
      const skill = Math.round(clamp(this.rng.gauss(50, 17), 15, 96)), speed = Math.round(clamp(this.rng.gauss(52, 15), 15, 96)), charm = Math.round(clamp(this.rng.gauss(52, 18), 10, 98)), honesty = Math.round(clamp(this.rng.gauss(78, 16), 20, 99));
      return { id: this.id(), name: `${this.rng.pick(female ? FIRST_F : FIRST_M)} ${this.rng.pick(LAST)}`, role, female, model: female ? 17 : 16, skill, speed, charm, honesty, wage: Math.round(R.wage * (0.72 + (skill + speed * 0.6 + charm * 0.4) / 340)), trait: this.rng.pick(TRAITS) } satisfies Candidate;
    });
  }
  hire(id: number): Result {
    const i = this.s.site.candidates.findIndex((c) => c.id === id);
    if (i < 0) return no('They took another job.');
    if (this.s.site.staff.length >= 26) return no('The staff room is full.');
    const c = this.s.site.candidates[i]!;
    this.s.site.candidates.splice(i, 1);
    const st: Staff = { id: this.id(), name: c.name, role: c.role, model: c.model, tint: this.rng.int(0, 9999), female: c.female, skill: c.skill, speed: c.speed, charm: c.charm, honesty: c.honesty, wage: c.wage, fair: c.wage, morale: 74, energy: 100, hired: this.s.day, xp: 0, x: -19, z: 20.75, y: 0, px: -19, pz: 20.75, py: 0, dir: 0, path: [], pi: 0, state: 'idle', anim: 0, station: '', job: 0, timer: 0, served: 0, cleaned: 0, fixed: 0, area: 'all', training: 0, carry: 0, stuck: 0 };
    this.s.site.staff.push(st);
    this.stat('hired');
    assignStations(this);
    this.news('staff', `${c.name} joins as ${ROLES[c.role].name.toLowerCase()}.`);
    return ok(`${c.name} starts right away.`);
  }
  fire(id: number): Result {
    const i = this.s.site.staff.findIndex((c) => c.id === id);
    if (i < 0) return no('Already gone.');
    const st = this.s.site.staff[i]!;
    const sev = st.wage * 2;
    this.money('wages', -sev);
    this.s.site.staff.splice(i, 1);
    for (const j of this.s.site.jobs) if (j.assignee === id) j.assignee = 0;
    for (const o of this.s.site.staff) o.morale = clamp(o.morale - 5, 0, 100);
    assignStations(this);
    return ok(`${st.name} was let go with ${fmt(sev)} severance.`);
  }
  setWage(id: number, wage: number): void {
    const st = this.s.site.staff.find((x) => x.id === id);
    if (!st) return;
    const old = st.wage;
    st.wage = clamp(Math.round(wage), 30, 400);
    st.morale = clamp(st.morale + (st.wage - old) * 0.5, 0, 100);
  }
  train(id: number): Result {
    const st = this.s.site.staff.find((x) => x.id === id);
    if (!st) return no('Gone.');
    if (st.training > 0) return no('Already booked on a course.');
    if (st.skill >= 97) return no('Nothing left to teach them.');
    const r = this.spend('wages', 240);
    if (!r.ok) return r;
    st.training = 1; st.morale = clamp(st.morale + 6, 0, 100);
    return ok(`${st.name} trains tonight.`);
  }
  praise(id: number): Result {
    const st = this.s.site.staff.find((x) => x.id === id);
    if (!st) return no('Gone.');
    const key = `praise${id}`;
    if ((this.s.eventCool[key] ?? 0) > this.s.day) return no('They know. Give it a day.');
    this.s.eventCool[key] = this.s.day + 1;
    st.morale = clamp(st.morale + 9, 0, 100);
    return ok(`${st.name} stands a little taller.`);
  }

  // -------------------------------------------------------------- programme
  addSlot(aud: number, filmId: string, start: number): Result {
    const v = validateSlot(this, aud, filmId, start, 0);
    if (!v.ok) return v;
    this.s.site.auds[aud - 1]!.program.push({ id: this.id(), filmId, start });
    this.s.site.auds[aud - 1]!.program.sort((a, b) => a.start - b.start);
    buildScreenings(this);
    return ok();
  }
  moveSlot(aud: number, slotId: number, toAud: number, start: number): Result {
    const A = this.s.site.auds[aud - 1]!, i = A.program.findIndex((x) => x.id === slotId);
    if (i < 0) return no('Gone.');
    const sl = A.program[i]!;
    const v = validateSlot(this, toAud, sl.filmId, start, slotId);
    if (!v.ok) return v;
    A.program.splice(i, 1);
    const B = this.s.site.auds[toAud - 1]!;
    B.program.push({ ...sl, start });
    B.program.sort((a, b) => a.start - b.start);
    buildScreenings(this);
    return ok();
  }
  removeSlot(aud: number, slotId: number): void {
    const A = this.s.site.auds[aud - 1]!;
    A.program = A.program.filter((x) => x.id !== slotId);
    buildScreenings(this);
  }
  autoProgram(): void { autoProgram(this); buildScreenings(this); }

  // -------------------------------------------------------------- money matters
  borrow(n: number): Result { if (this.s.loan + n > this.s.creditLimit) return no('The bank says no.'); this.s.loan += n; this.money('loan', n); return ok(); }
  repay(n: number): Result { const k = Math.min(n, this.s.loan); if (k <= 0) return no('Nothing to repay.'); const r = this.spend('loan', k); if (r.ok) this.s.loan -= k; return r; }
  startCampaign(id: string): Result {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (!c) return no('No such campaign.');
    if (this.s.site.campaigns.some((x) => x.id === id)) return no('Already running.');
    const r = this.spend('marketing', c.cost);
    if (!r.ok) return r;
    this.s.site.campaigns.push({ id, until: this.s.day + c.days });
    this.stat('campaigns');
    if (id === 'critics') this.s.flags.pressNight = this.s.day;
    return ok(`${c.name} running for ${c.days} days.`);
  }
  get dailyRent(): number { return siteDef(this.s.site.id).rent + this.s.site.wings.length * 14; }
  get dailyUtilities(): number {
    const st = this.s.site;
    let u = 34 + st.wings.length * 9 + Math.abs(st.amb.temp - 19) * 3 + st.amb.lights * 0.16;
    if (this.s.weather === 'heat' || this.s.weather === 'snow') u *= 1.3;
    for (const a of st.auds) if (a.built) u += [18, 14, 20][a.projTier]!;
    for (const i of st.items) u += itemById(i.type).power * 1.6;
    return Math.round(u);
  }
  get wagesDue(): number { return this.s.site.staff.reduce((a, b) => a + b.wage, 0); }

  // -------------------------------------------------------------- people
  think(g: Guest, code: string, vars: Record<string, string> = {}, quiet = false): void {
    const def = THOUGHTS[code];
    if (!def) return;
    const last = g.thoughts.find((t) => t.code === code);
    if (last && this.s.minute - last.t < 30 && this.s.minute >= last.t) return;
    let text = def.t[Math.floor(this.rng.next() * def.t.length)]!;
    for (const k in vars) text = text.replaceAll(`{${k}}`, vars[k]!);
    const th: Thought = { t: this.s.minute, code, text, tone: def.tone };
    g.thoughts.unshift(th);
    if (g.thoughts.length > 10) g.thoughts.length = 10;
    g.happy = clamp(g.happy + def.d * (g.temper === 'anxious' ? 1.35 : g.temper === 'chill' ? 0.65 : 1), 0, 100);
    if (def.tone <= -2) g.offended++;
    const log = this.s.thoughtLog, e = log.find((x) => x.code === code);
    const abs = this.s.day * 1440 + this.s.minute;
    if (e) { e.n++; e.text = text; e.t = abs; } else log.push({ code, text, tone: def.tone, n: 1, t: abs });
    if (!quiet) this.emit({ type: 'thought', guest: g.id, code, tone: def.tone });
  }
  removeGuest(g: Guest): void {
    this.guests.delete(g.id);
    const i = this.s.guests.indexOf(g);
    if (i >= 0) { const l = this.s.guests.pop()!; if (i < this.s.guests.length) this.s.guests[i] = l; }
    const gr = this.groups.get(g.group);
    if (gr) {
      gr.members = gr.members.filter((m) => m !== g.id);
      if (!gr.members.length) { this.groups.delete(gr.id); const k = this.s.groups.indexOf(gr); if (k >= 0) this.s.groups.splice(k, 1); }
      else if (gr.leader === g.id) { gr.leader = gr.members[0]!; const nl = this.guests.get(gr.leader); if (nl) nl.leader = true; }
    }
  }

  // -------------------------------------------------------------- jobs
  addJob(j: Partial<Job> & { kind: JobKind; role: StaffRole | 'any'; title: string; x: number; z: number; ref: string }): Job {
    const same = this.s.site.jobs.find((k) => k.ref === j.ref && k.kind === j.kind);
    if (same) { same.severity = Math.max(same.severity, j.severity ?? 1); return same; }
    const job: Job = { id: this.id(), y: 0, severity: 1, created: this.s.minute, need: 4, progress: 0, assignee: 0, player: false, ...j };
    this.s.site.jobs.push(job);
    return job;
  }
  /** Pay an outside contractor to finish a repair immediately. */
  callOutCost(j: Job): number { return 60 + j.severity * 55; }
  callOut(id: number): Result {
    const j = this.s.site.jobs.find((k) => k.id === id);
    if (!j) return no('Already done.');
    if (j.role !== 'tech') return no('Contractors only do repairs.');
    const r = this.spend('repairs', this.callOutCost(j));
    if (!r.ok) return r;
    if (j.assignee) { const x = this.s.site.staff.find((q) => q.id === j.assignee); if (x) { x.job = 0; x.state = 'idle'; x.path = []; } }
    finishJob(this, j, this.s.site.staff[0] ?? null);
    return ok('A contractor was in and out.');
  }
  dropJobs(pred: (j: Job) => boolean): void {
    for (const j of this.s.site.jobs) if (pred(j) && j.assignee) { const st = this.s.site.staff.find((x) => x.id === j.assignee); if (st) { st.job = 0; st.state = 'idle'; } }
    this.s.site.jobs = this.s.site.jobs.filter((j) => !pred(j));
  }

  // -------------------------------------------------------------- time
  /** Advance by real seconds at the given speed multiplier. */
  advance(dt: number, mult = this.s.speed): void {
    if (this.s.phase === 'report' || this.s.gameOver) return;
    this.acc += Math.min(dt, 0.25) * mult;
    let n = 0;
    while (this.acc >= STEP && n < 60) { this.acc -= STEP; this.step(STEP); n++; if ((this.s.phase as string) === 'report') { this.acc = 0; break; } }
    if (n >= 60) this.acc = 0;
  }
  get alpha(): number { return this.acc / STEP; }

  step(dt: number): void {
    const s = this.s;
    s.minute += dt;
    const m = Math.floor(s.minute);
    if (m !== this.lastMinute) { this.lastMinute = m; this.onMinute(m); }
    stepScreenings(this, dt);
    stepGuests(this, dt);
    stepStaff(this, dt);
    if (s.phase === 'closing' && (s.guests.length === 0 || s.minute > DAY_END)) this.endDay();
  }

  private onMinute(m: number): void {
    const s = this.s;
    if (s.phase === 'prep' && m >= DAY_OPEN) { s.phase = 'open'; this.news('info', 'Doors open.'); this.emit({ type: 'sound', id: 'doors' }); }
    const pending = s.screenings.some((x) => x.state !== 'ended' && x.state !== 'cancelled');
    if (s.phase === 'open' && m >= 20 * 60 && !pending) { s.phase = 'closing'; this.news('info', 'Last show is out. Closing up.'); }
    if (s.phase !== 'closing' && (s.phase === 'open' || m >= DAY_OPEN - 25)) { spawnArrivals(this); }
    maintenanceMinute(this, m);
    if (m % 3 === 0) spreadDirt(this);
    if (m % 5 === 0) { assignStations(this); computeRating(this); }
    if (m % 20 === 0 && s.phase === 'open') directorTick(this);
    expireEvents(this);
    if (m % 10 === 0) checkObjectives(this);
    for (const e of EQUIPMENT) {
      const st = s.site.products;
      for (const p of PRODUCTS) if (p.equip === e.id && s.site.equipment[e.id]!.owned) {
        const q = st[p.id]!;
        if (q.auto && q.enabled && q.stock < q.reorderAt && m % 15 === 0 && s.cash > q.reorderQty * p.cost * 1.7) this.orderStock(p.id, q.reorderQty);
      }
    }
  }

  // -------------------------------------------------------------- day boundary
  endDay(): void {
    const s = this.s, st = s.site;
    clearGuests(this);
    for (const x of s.screenings) if (x.state !== 'ended') x.state = 'ended';
    this.money('wages', -this.wagesDue);
    this.money('rent', -this.dailyRent);
    this.money('utilities', -this.dailyUtilities);
    if (st.insured) this.money('rent', -45);
    if (s.loan > 0) this.money('loan', -Math.round(s.loan * s.loanRate));
    // contract minimum-show obligations
    for (const c of s.contracts) {
      if (s.day > c.startDay && s.day <= c.endDay && c.terms.minShows > 0) {
        const shows = s.screenings.filter((x) => x.filmId === c.filmId && x.state === 'ended').length;
        c.showsToday = shows;
        if (shows < c.terms.minShows) {
          c.breaches++;
          const fine = (c.terms.minShows - shows) * 120;
          this.money('fines', -fine);
          const f = this.film(c.filmId), rel = s.studios.find((q) => q.id === f.studio)!;
          rel.relation = clamp(rel.relation - 4, 0, 100);
          this.news('bad', `${f.title} played ${shows} of ${c.terms.minShows} contracted shows. The studio fined you ${fmt(fine)}.`);
        }
      }
    }
    simulateOthers(this);
    for (const x of st.staff) {
      if (x.training > 0) { x.training = 0; x.skill = clamp(x.skill + this.rng.int(4, 9), 0, 99); x.speed = clamp(x.speed + this.rng.int(1, 4), 0, 99); x.fair = Math.round(x.fair * 1.03); }
      x.energy = 100; x.morale = clamp(x.morale + (x.wage - x.fair) * 0.14 + (x.morale < 55 ? 1 : 0) - 0.8, 0, 100);
      x.state = 'off'; x.job = 0; x.station = '';
    }
    for (const j of st.jobs) { j.assignee = 0; j.player = false; }
    computeRating(this);
    const sat = s.satN ? s.satSum / s.satN : s.rating.guests;
    const ledger = { ...s.today };
    const net = Object.values(ledger).reduce((a, b) => a + (b ?? 0), 0);
    const best = [...s.screenings].sort((a, b) => b.sold - a.sold)[0];
    const todays = s.reviews.filter((r) => r.day === s.day);
    const report = {
      day: s.day, weekday: this.weekday, ledger, guests: s.guestsToday, sat, rating: s.rating.total, cash: s.cash, weather: s.weather, turnedAway: s.turnedAway, walkouts: s.walkouts,
      best: best && best.sold ? this.film(best.filmId).title : '', headline: headline(this, net, sat), reviews: todays.length, stars: todays.length ? todays.reduce((a, b) => a + b.stars, 0) / todays.length : s.rating.stars,
    };
    s.reports.push(report);
    if (s.reports.length > 90) s.reports.shift();
    st.history.push({ day: s.day, rev: st.dayRev, cost: st.dayCost, guests: s.guestsToday, sat });
    if (st.history.length > 60) st.history.shift();
    s.ratingHist.push({ day: s.day, v: s.rating.total, s: s.rating.stars });
    // reputation chases satisfaction
    if (s.satN > 4) st.reputation = clamp(st.reputation + (sat * 0.62 + s.rating.total * 0.043 - st.reputation) * 0.075 + (s.walkouts > 12 ? -0.6 : 0), 0, 100);
    st.loyalty = clamp(st.loyalty + (sat - 62) * 0.03, 0, 100);
    checkObjectives(this);
    if (s.cash < 0) { s.insolvent++; if (s.insolvent >= 4) s.gameOver = 'The bank has changed the locks. Four nights in the red is three too many.'; else this.news('bad', `Overdrawn. The bank forecloses after ${4 - s.insolvent} more night${4 - s.insolvent === 1 ? '' : 's'} in the red.`); } else s.insolvent = 0;
    s.phase = 'report';
    s.rng = this.rng.state;
    this.emit({ type: 'dayEnd' });
  }

  nextDay(): void {
    const s = this.s, st = s.site;
    if (s.phase !== 'report' || s.gameOver) return;
    s.events = []; s.day++; s.minute = DAY_PREP; s.phase = 'prep'; s.today = {}; s.guestsToday = 0; s.satSum = 0; s.satN = 0; s.turnedAway = 0; s.walkouts = 0; s.queues = {};
    st.dayRev = 0; st.dayCost = 0; st.dayGuests = 0;
    for (const p of Object.values(st.products)) p.soldToday = 0;
    s.weather = s.weatherNext as GameState['weather'];
    const season = Math.floor(((s.day + 20) % 120) / 30); // 0 spring 1 summer 2 autumn 3 winter
    s.weatherNext = this.rng.weighted(['clear', 'cloudy', 'rain', 'snow', 'heat', 'storm'], (w) => ({ clear: 5, cloudy: 4, rain: season === 2 ? 4 : 2.5, snow: season === 3 ? 3 : 0, heat: season === 1 ? 3 : 0, storm: 0.7 })[w] ?? 0)!;
    st.campaigns = st.campaigns.filter((c) => c.until >= s.day);
    s.effects = s.effects.filter((e) => e.until >= s.day);
    st.litter = st.litter.filter((l) => l.kind === 'vomit' || this.rng.chance(0.35));
    for (let i = 0; i < st.dirt.length; i++) st.dirt[i]! *= 0.82;
    for (const f of Object.values(st.fixtures)) f.user = 0;
    for (const i of st.items) i.users = [];
    const cut = s.day * 1440 - 3 * 1440;
    s.thoughtLog = s.thoughtLog.filter((t) => t.t > cut);
    for (const t of s.thoughtLog) t.n = Math.ceil(t.n * 0.5);
    dailyFilms(this);
    if (this.weekday === 0 || this.weekday === 3) refreshMarket(this, false);
    if (s.day % 2 === 0) this.refreshCandidates();
    // staff resign when miserable
    for (const x of [...st.staff]) if (x.morale < 18 && this.rng.chance(0.4)) { st.staff = st.staff.filter((y) => y !== x); this.news('bad', `${x.name} quit. The note just says “no.”`); }
    for (const x of st.staff) { x.state = 'idle'; x.x = x.px = -18 + this.rng.range(-2, 2); x.z = x.pz = 11 + this.rng.range(-1.5, 1.5); x.y = x.py = 0; x.path = []; }
    // drop finished films from the programme
    for (const a of st.auds) a.program = a.program.filter((p) => this.contractFor(p.filmId));
    const empty = st.auds.filter((a) => a.built && a.program.length === 0).length;
    if (s.flags.autoProgram) autoProgram(this);
    else if (empty) this.news('bad', `${empty} screen${empty > 1 ? 's have' : ' has'} nothing scheduled today.`);
    buildScreenings(this);
    assignStations(this);
    computeRating(this);
    this.lastMinute = DAY_PREP;
    s.rng = this.rng.state;
    this.emit({ type: 'layout' });
  }
  contractFor(filmId: string) { return this.s.contracts.find((c) => c.filmId === filmId && this.s.day >= c.startDay && this.s.day <= c.endDay); }

  chooseEvent(id: number, choice: number): Result { return resolveEvent(this, id, choice); }

  /** Everything the save file needs. */
  serialize(): string { this.s.rng = this.rng.state; return JSON.stringify(this.s); }
  static load(json: string): Game { const s = JSON.parse(json) as GameState; if (s.v !== 1) throw new Error('Unknown save version'); return new Game(s); }

  // -------------------------------------------------------------- queries for UI / renderer
  avgHappy(): number { const g = this.s.guests; if (!g.length) return this.s.rating.guests; let t = 0; for (const x of g) t += x.happy; return t / g.length; }
  screeningById(id: number): Screening | undefined { return this.s.screenings.find((x) => x.id === id); }
  station(id: string): StationDef { return STATIONS.find((x) => x.id === id)!; }
  audName(id: number): string { return id === 6 ? 'The Giant' : `Screen ${id}`; }
  capacity(aud: number): number { const a = this.s.site.auds[aud - 1]!; return seatsOf(aud).length - a.seatBroken.reduce((p, c) => p + c, 0); }
  kickGuest(id: number): Result { const g = this.guests.get(id); if (!g) return no('They already left.'); g.happy = clamp(g.happy - 40, 0, 100); this.think(g, 'tooStrict'); guestLeaveGame(this, g); return ok('Shown the door.'); }
  comp(id: number): Result {
    const g = this.guests.get(id);
    if (!g) return no('They already left.');
    const r = this.spend('concessions', 4);
    if (!r.ok) return r;
    this.think(g, 'freebie'); g.hunger = Math.max(0, g.hunger - 30); if (!g.carry) g.carry = 1; g.foodQ = 60;
    return ok('On the house.');
  }
  greet(id: number): Result { const g = this.guests.get(id); if (!g) return no('They already left.'); if (g.thoughts.some((t) => t.code === 'managerHi')) return no('You already said hello.'); this.think(g, 'managerHi'); this.stat('greeted'); g.emotion = 'happy'; g.emoT = 6; return ok(`${g.name.split(' ')[0]} lights up.`); }
}

export const fmt = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
function headline(g: Game, net: number, sat: number): string {
  const n = g.s.site.name;
  if (g.s.walkouts > 12) return `Walkouts at ${n} as patience runs out`;
  if (g.s.guestsToday < 8) return `${n} plays to empty velvet`;
  if (net > 2500 && sat > 70) return `Full houses, full hearts at ${n}`;
  if (net > 1000) return `${n} counts a very good ${WEEKDAYS[g.weekday]}`;
  if (sat > 74) return `Crowds go home humming from ${n}`;
  if (sat < 40) return `“Never again,” say guests leaving ${n}`;
  if (net < -400) return `Red ink under the marquee at ${n}`;
  return `A steady ${WEEKDAYS[g.weekday]} at ${n}`;
}
void ARCHETYPES; void SITES; void ITEMS; void audById;
