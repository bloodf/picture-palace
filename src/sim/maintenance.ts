import { EQUIPMENT, ITEMS, PROJ_TIERS, itemById } from './data/catalog';
import { FIXTURES, ROOMS, audById, roomAt, seatsOf } from './plan';
import { NX, NZ, cellX, cellZ } from './nav';
import { clamp } from './rng';
import { addLitter } from './guests';
import { breakProjector, fixProjector } from './screenings';
import type { Game } from './game';
import type { Job, Staff } from './types';

/** Foot traffic slowly soils the floor; wet weather is worse. */
export function spreadDirt(g: Game): void {
  const d = g.site.dirt, wet = g.s.weather === 'rain' || g.s.weather === 'snow' || g.s.weather === 'storm' ? 1.9 : 1;
  for (const m of g.s.guests) {
    if (m.state === 'seated' || m.state === 'bench') continue;
    const k = cellZ(m.z) * NX + cellX(m.x);
    if (k >= 0 && k < NX * NZ && !g.nav.blocked[k]) d[k] = Math.min(1, d[k]! + 0.0075 * wet * (1.25 - m.tidy * 0.5) * g.diff.wear);
    if (m.carry & 1 && g.rng.chance(0.006 * (1.2 - m.tidy))) addLitter(g, 'popcorn', m.x, m.z);
    if (m.carry & 2 && g.rng.chance(0.0016 * (1.2 - m.tidy))) addLitter(g, 'spill', m.x, m.z, 0.8);
  }
}
/** Clean floor and pick up litter in a radius. Returns how much was actually cleaned. */
export function cleanAround(g: Game, x: number, z: number, r: number, amount: number, litter: boolean): number {
  const d = g.site.dirt;
  let done = 0;
  const i0 = Math.max(0, cellX(x - r)), i1 = Math.min(NX - 1, cellX(x + r)), j0 = Math.max(0, cellZ(z - r)), j1 = Math.min(NZ - 1, cellZ(z + r));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * NX + i, v = d[k]!; if (v > 0) { const n = Math.max(0, v - amount * 0.55); done += v - n; d[k] = n; } }
  if (litter) {
    for (let n = g.site.litter.length - 1; n >= 0; n--) {
      const l = g.site.litter[n]!;
      if ((l.x - x) ** 2 + (l.z - z) ** 2 > r * r) continue;
      l.size -= amount * (l.kind === 'vomit' || l.kind === 'water' || l.kind === 'graffiti' ? 0.5 : 1.3);
      done += amount;
      if (l.size <= 0) { g.site.litter.splice(n, 1); g.stat('litterCleaned'); }
    }
  }
  return done;
}
export function cleanliness(g: Game): number {
  let sum = 0, n = 0;
  for (let k = 0; k < NX * NZ; k++) { if (g.nav.blocked[k] || ROOMS[g.nav.room[k]!]?.kind === 'street') continue; sum += g.site.dirt[k]!; n++; }
  const floor = 100 - (n ? (sum / n) * 160 : 0);
  const litter = g.site.litter.reduce((a, l) => a + (l.kind === 'vomit' ? 5 : l.kind === 'water' ? 2.5 : 1), 0);
  let fx = 0, fn = 0;
  for (const f of FIXTURES) { const r = ROOMS.find((q) => q.id === f.room)!; if (!g.unlocked.has(r.wing)) continue; fx += g.site.fixtures[f.id]!.clean; fn++; }
  let sd = 0, sn = 0;
  for (const a of g.site.auds) if (a.built) { for (const v of a.seatDirt) sd += v; sn += a.seatDirt.length; }
  return clamp(floor * 0.4 + Math.max(0, 100 - litter * 1.15) * 0.22 + (fn ? fx / fn : 100) * 0.24 + (sn ? 100 - sd / sn : 100) * 0.14, 0, 100);
}

export function maintenanceMinute(g: Game, m: number): void {
  const st = g.site;
  // restrooms
  if (m % 4 === 0) {
    for (const r of ROOMS) {
      if (r.kind !== 'restroom' || !g.unlocked.has(r.wing)) continue;
      const fs = FIXTURES.filter((f) => f.room === r.id);
      const avg = fs.reduce((a, f) => a + st.fixtures[f.id]!.clean, 0) / fs.length;
      if (avg < 70) g.addJob({ kind: 'fixtureClean', role: 'janitor', title: `Clean the ${r.label}`, x: (r.rect.x0 + r.rect.x1) / 2 + 0.3, z: 5.25, ref: `room:${r.id}`, need: 7, severity: avg < 40 ? 3 : 2 });
    }
    if (st.supplies < 18) g.addJob({ kind: 'supplies', role: 'janitor', title: 'Restock soap and paper', x: -23.25, z: 3.25, ref: 'supplies', need: 3, severity: 2 });
  }
  // equipment & items break with age
  if (m % 6 === 0 && g.s.phase !== 'prep') {
    for (const e of EQUIPMENT) {
      const q = st.equipment[e.id]!;
      if (!q.owned || q.broken) continue;
      q.cond = Math.max(0, q.cond - e.wear * 0.35 * g.diff.wear);
      if (g.rng.chance(0.0009 * (1 + ((100 - q.cond) / 30) ** 2) * g.diff.wear)) {
        q.broken = true;
        g.addJob({ kind: 'equipment', role: 'tech', title: `${e.name} has failed`, x: e.jobX, z: e.jobZ, ref: `equip:${e.id}`, need: 7, severity: 3 });
        g.news('bad', `${e.name} has failed.`, e.jobX, e.jobZ);
      } else if (q.cond < 45) g.addJob({ kind: 'equipment', role: 'tech', title: `Service the ${e.name.toLowerCase()}`, x: e.jobX, z: e.jobZ, ref: `equip:${e.id}`, need: 5, severity: 1 });
    }
    for (const it of st.items) {
      const def = itemById(it.type);
      if (!def.wear || it.broken) continue;
      if (g.rng.chance(0.0006 * (1 + ((100 - it.cond) / 28) ** 2) * g.diff.wear)) {
        it.broken = true; const p = g.itemFront(it);
        for (const u of it.users) { const q = g.guests.get(u); if (q) { q.itemId = 0; q.state = 'idle'; q.timer = 0; } }
        it.users = [];
        g.addJob({ kind: 'item', role: 'tech', title: `${def.name} out of order`, x: p.x, z: p.z, ref: `item:${it.id}`, need: 5, severity: 1 });
        g.emit({ type: 'layout' });
      }
    }
    for (const a of st.auds) {
      if (!a.built || a.fault) continue;
      const d = audById(a.id);
      if (a.projCond < 48 || a.focus < 55 || a.lampHours > PROJ_TIERS[a.projTier]!.lampLife) g.addJob({ kind: 'projector', role: 'tech', title: `Service projector, ${g.audName(a.id)}`, x: d.cx - 0.9, z: -7.25, ref: `proj:${a.id}`, need: 6, severity: 1 });
    }
  }
  // broken seats inherited from the previous owner become repair work for the technician
  if (m % 30 === 0) for (const a of st.auds) {
    if (!a.built) continue;
    let n = 0;
    for (let i = 0; i < a.seatBroken.length && n < 3; i++) if (a.seatBroken[i]) {
      const seat = seatsOf(a.id)[i]!;
      g.addJob({ kind: 'seat', role: 'tech', title: `Broken seat, ${g.audName(a.id)} row ${String.fromCharCode(65 + seat.row)}`, x: seat.accessX, z: seat.accessZ, y: seat.y, ref: `seat:${a.id}:${i}`, need: 5, severity: 1 });
      n++;
    }
  }
  // power cuts
  if (!st.power && st.powerOut > 0) { st.powerOut--; if (st.powerOut <= 0) { st.power = true; g.dropJobs((j) => j.kind === 'power'); g.news('good', 'The lights flicker back on.'); g.emit({ type: 'sound', id: 'poweron' }); } }
  for (const j of st.jobs) if (j.ttl !== undefined) { j.ttl--; if (j.ttl <= 0) jobExpired(g, j); }
}
function jobExpired(g: Game, j: Job): void {
  if (j.kind === 'pirate') { g.news('bad', 'A recording of tonight’s film is online. The studio is furious.'); const c = g.s.contracts[0]; if (c) { const f = g.film(j.ref.split(':')[1]!) ?? g.film(c.filmId); const rel = g.s.studios.find((s) => s.id === f.studio); if (rel) rel.relation = clamp(rel.relation - 12, 0, 100); } g.money('fines', -800); }
  if (j.kind === 'fire') { g.news('bad', 'The popcorn fire spread. The machine is scrap and the lobby reeks.'); const e = g.site.equipment.popcorn!; e.broken = true; e.cond = 4; g.money('repairs', g.site.insured ? -400 : -2400); for (const m of g.s.guests) if (m.z > -6) g.think(m, 'fire'); g.addJob({ kind: 'equipment', role: 'tech', title: 'Rebuild the popcorn machine', x: -0.25, z: 1.75, ref: 'equip:popcorn', need: 12, severity: 3 }); g.emit({ type: 'layout' }); }
  if (j.kind === 'lostchild') { g.news('bad', 'A parent found their child by themselves and wants your name.'); g.site.reputation = clamp(g.site.reputation - 2.5, 0, 100); }
  if (j.kind === 'leak') { for (let i = 0; i < 5; i++) addLitter(g, 'water', j.x + g.rng.range(-1.5, 1.5), j.z + g.rng.range(-1.5, 1.5), 1.6); g.money('repairs', -350); g.news('bad', 'The leak was left running. The floor is a pond.'); }
  if (j.kind === 'faint') { g.news('bad', 'Paramedics arrived before your staff did.'); g.site.reputation = clamp(g.site.reputation - 2, 0, 100); }
  if (j.kind === 'rat') g.news('bad', 'The rat got away. It will be back.');
  if (j.kind === 'rowdy' || j.kind === 'heckler') { for (const m of g.s.guests) if (m.state === 'seated' && roomAt(m.x, m.z)?.id === j.ref.split(':')[1]) g.think(m, 'talker'); }
  g.dropJobs((k) => k === j);
}

/** Apply work to a job. Returns true when finished. */
export function workJob(g: Game, j: Job, amount: number, by: Staff | null): boolean {
  j.progress += amount;
  if (j.kind === 'fixtureClean') { const room = j.ref.split(':')[1]; for (const f of FIXTURES) if (f.room === room) { const s = g.site.fixtures[f.id]!; s.clean = clamp(s.clean + amount * 9, 0, 100); } cleanAround(g, j.x, j.z, 3.4, amount * 0.6, true); }
  if (j.kind === 'audClean') { const aud = Number(j.ref.split(':')[1]), a = g.site.auds[aud - 1]!; const k = Math.max(0, 1 - amount / j.need * 1.5); for (let i = 0; i < a.seatDirt.length; i++) a.seatDirt[i]! *= k; }
  if (j.progress < j.need) return false;
  finishJob(g, j, by);
  return true;
}
export function finishJob(g: Game, j: Job, by: Staff | null): void {
  const [, a, b] = j.ref.split(':');
  const st = g.site;
  switch (j.kind) {
    case 'projector': fixProjector(g, Number(a)); break;
    case 'seat': { const A = st.auds[Number(a) - 1]!; A.seatBroken[Number(b)] = 0; g.money('repairs', -8, j.x, j.z); g.stat('seatsFixed'); break; }
    case 'toilet': { const f = st.fixtures[a!]!; f.clogged = false; f.broken = false; f.clean = clamp(f.clean + 20, 0, 100); g.money('repairs', -12); g.stat('toiletsFixed'); break; }
    case 'equipment': { const e = st.equipment[a!]!; g.money('repairs', -(e.broken ? 70 : 25), j.x, j.z); e.broken = false; e.cond = clamp(e.cond + 55, 0, 100); g.emit({ type: 'layout' }); break; }
    case 'item': { const it = st.items.find((q) => q.id === Number(a)); if (it) { it.broken = false; it.cond = 92; g.money('repairs', -30, j.x, j.z); g.emit({ type: 'layout' }); } break; }
    case 'bin': { const it = st.items.find((q) => q.id === Number(a)); if (it) it.fill = 0; break; }
    case 'audClean': {
      const aud = Number(a), A = st.auds[aud - 1]!;
      for (let i = 0; i < A.seatDirt.length; i++) A.seatDirt[i] = Math.min(A.seatDirt[i]!, 6);
      st.litter = st.litter.filter((l) => roomAt(l.x, l.z)?.aud !== aud);
      g.stat('audCleans');
      break;
    }
    case 'fixtureClean': { for (const f of FIXTURES) if (f.room === a) st.fixtures[f.id]!.clean = Math.max(94, st.fixtures[f.id]!.clean); g.stat('wcCleans'); break; }
    case 'supplies': st.supplies = 100; g.money('stock', -60); break;
    case 'fire': g.news('good', `${by ? by.name : 'You'} smothered the popcorn fire.`); g.money('repairs', -90); st.equipment.popcorn!.cond = clamp(st.equipment.popcorn!.cond - 20, 5, 100); g.stat('fires'); break;
    case 'leak': cleanAround(g, j.x, j.z, 3, 9, true); g.money('repairs', -60); g.news('good', 'Leak stopped.'); break;
    case 'pirate': g.news('good', `${by ? by.name : 'You'} caught a pirate with a camera in a popcorn bucket. The studio sends a reward.`); g.money('events', 400); { const f = g.film(a!); const rel = f && g.s.studios.find((s) => s.id === f.studio); if (rel) rel.relation = clamp(rel.relation + 6, 0, 100); } g.stat('pirates'); break;
    case 'rowdy': case 'heckler': for (const m of g.s.guests) if (m.state === 'seated' && roomAt(m.x, m.z)?.id === a) { g.think(m, 'shushed'); } break;
    case 'faint': g.news('good', 'The guest is sitting up, sipping water and embarrassed.'); st.reputation = clamp(st.reputation + 1.2, 0, 100); break;
    case 'lostchild': g.news('good', 'Reunited. There were tears and a complimentary slush.'); st.reputation = clamp(st.reputation + 1.6, 0, 100); g.stat('lostKids'); break;
    case 'lostitem': g.news('good', 'A wedding ring, back on its finger.'); st.reputation = clamp(st.reputation + 1, 0, 100); g.money('events', 60); break;
    case 'rat': g.news('good', `${by ? by.name : 'You'} escorted the rat off the premises.`); delete g.s.flags.rats; break;
    case 'bat': g.news('good', 'The bat is back outside, with opinions about the sequel.'); break;
    case 'graffiti': cleanAround(g, j.x, j.z, 1.5, 9, true); break;
    case 'power': st.powerOut = 0; st.power = true; g.news('good', `${by ? by.name : 'You'} reset the breakers. Light!`); g.emit({ type: 'sound', id: 'poweron' }); break;
  }
  g.dropJobs((k) => k === j);
  g.stat('jobs'); if (!by) g.stat('playerJobs');
  g.emit({ type: 'jobDone', kind: j.kind, x: j.x, z: j.z });
}
void breakProjector; void ITEMS;
