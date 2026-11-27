import { ANIM, CARRY } from './anims';
import { FIXTURES, STATIONS, audById, floorY, roomAt } from './plan';
import { moveAlong, openStations, setPath, turn } from './guests';
import { workJob, cleanAround } from './maintenance';
import { clamp } from './rng';
import type { Game } from './game';
import type { Job, JobKind, Staff } from './types';
import { cellX, cellZ, NX, NZ, centerX, centerZ } from './nav';

/** Put cashiers, concessionists and ushers at counters. Re-run whenever staffing changes. */
export function assignStations(g: Game): void {
  const st = g.site.staff;
  const fill = (role: Staff['role'], list: string[]) => {
    const crew = st.filter((x) => x.role === role && x.state !== 'strike' && x.state !== 'off');
    const taken = new Set<string>();
    for (const x of crew) { if (x.station && list.includes(x.station) && !taken.has(x.station)) taken.add(x.station); else if (x.station) x.station = ''; }
    const order = [...list].sort((a, b) => (g.s.queues[b]?.length ?? 0) - (g.s.queues[a]?.length ?? 0));
    for (const x of crew) {
      if (x.station || x.state === 'break') continue;
      const free = order.find((i) => !taken.has(i));
      if (!free) break;
      x.station = free; taken.add(free); x.state = 'idle'; x.path = [];
    }
  };
  fill('box', openStations(g, 'box').map((s) => s.id));
  const con = openStations(g, 'concession').map((s) => s.id);
  const food = g.unlocked.has('foodcourt') && ['pizza', 'grill', 'saladbar'].some((e) => g.site.equipment[e]!.owned) ? openStations(g, 'food').map((s) => s.id) : [];
  fill('concession', [con[0]!, ...(food.length ? [food[0]!] : []), ...con.slice(1), ...food.slice(1)].filter(Boolean));
  fill('usher', STATIONS.filter((s) => s.kind === 'usher').map((s) => s.id));
}

const WORK_ANIM: Partial<Record<JobKind, number>> = { projector: ANIM.use, seat: ANIM.repair, toilet: ANIM.repair, equipment: ANIM.use, item: ANIM.repair, spill: ANIM.mop, litter: ANIM.mop, bin: ANIM.use, fixtureClean: ANIM.mop, audClean: ANIM.mop, leak: ANIM.mop, graffiti: ANIM.mop, supplies: ANIM.use, fire: ANIM.use };

function canDo(x: Staff, j: Job): boolean {
  if (j.role === 'any' || j.role === x.role) return true;
  if (x.role === 'usher' && (j.kind === 'lostchild' || j.kind === 'rowdy' || j.kind === 'audClean' || j.kind === 'faint' || j.kind === 'heckler' || j.kind === 'lostitem')) return true;
  if (x.role === 'janitor' && j.kind === 'rat') return true;
  if (x.role === 'security' && (j.kind === 'pirate' || j.kind === 'rowdy' || j.kind === 'heckler')) return true;
  return false;
}

export function stepStaff(g: Game, dt: number): void {
  for (const x of g.site.staff) {
    x.px = x.x; x.pz = x.z; x.py = x.y;
    if (x.state === 'off') { x.anim = ANIM.idle; continue; }
    stepOne(g, x, dt);
  }
}
function walkTo(g: Game, x: Staff, tx: number, tz: number): boolean { const okp = setPath(g, x, tx, tz); if (okp) x.state = 'walk'; return okp; }

function stepOne(g: Game, x: Staff, dt: number): void {
  const sp = 1.35 + x.speed * 0.009;
  const tired = x.state === 'work' || x.state === 'station' ? 0.055 : 0.035;
  if (x.state !== 'break') x.energy = clamp(x.energy - tired * dt, 0, 100);
  x.timer -= dt;
  if (x.state === 'strike') {
    if (x.pi < x.path.length) { moveAlong(g, x, sp, dt, false); x.anim = ANIM.walk; } else { x.anim = ANIM.angry; turn(x, 0, dt * 4); }
    return;
  }
  if (x.state === 'break') {
    if (x.energy > 28) { const u = pickJob(g, x); if (u && u.severity >= 3) { x.state = 'idle'; take(g, x, u); return; } }
    if (x.pi < x.path.length) { moveAlong(g, x, sp, dt, false); x.anim = ANIM.walk; return; }
    x.anim = x.id % 2 ? ANIM.phone : ANIM.talk; x.energy = clamp(x.energy + dt * 3.2, 0, 100); x.carry = 0;
    if (x.energy > 82) { x.state = 'idle'; x.morale = clamp(x.morale + 2, 0, 100); }
    return;
  }
  if (x.energy < 16 && x.state !== 'work') {
    const inRush = x.station && (g.s.queues[x.station]?.length ?? 0) > 2;
    if (!inRush) { x.station = ''; release(g, x); if (setPath(g, x, -20.5, 11.75)) { x.state = 'break'; return; } }
  }
  // --- counter crew
  if (x.station) {
    const st = g.station(x.station);
    const d = Math.hypot(st.sx - x.x, st.sz - x.z);
    if (d > 0.5) {
      if (x.pi >= x.path.length) setPath(g, x, st.sx, st.sz);
      x.state = 'walk'; x.anim = ANIM.walk;
      moveAlong(g, x, sp, dt, false);
      if (x.pi >= x.path.length && Math.hypot(st.sx - x.x, st.sz - x.z) > 0.5 && Math.hypot(st.sx - x.x, st.sz - x.z) < 1) { x.x = st.sx; x.z = st.sz; }
    } else {
      x.state = 'station';
      turn(x, st.kind === 'usher' ? 0 : Math.atan2(st.x - x.x, st.z - x.z), dt * 6);
      const busy = (g.s.queues[x.station]?.length ?? 0) > 0;
      x.anim = st.kind === 'usher' ? (x.id + Math.floor(g.s.minute / 6)) % 3 ? ANIM.idle : ANIM.wave : busy ? ANIM.serve : ANIM.idle;
      x.carry = 0;
    }
    // ushers help turn rooms around when nobody is arriving
    if (x.role === 'usher' && x.state === 'station' && x.timer <= 0) { x.timer = 4; const j = pickJob(g, x); if (j && j.severity >= 2) { x.station = ''; take(g, x, j); } }
    return;
  }
  // --- roaming crew
  if (x.job) {
    const j = g.site.jobs.find((k) => k.id === x.job);
    if (!j || j.player) { release(g, x); return; }
    // drop small work when something urgent comes up
    if (j.severity < 3 && Math.floor(g.s.minute * 10 + x.id) % 12 === 0) { const u = pickJob(g, x); if (u && u.severity >= 3) { release(g, x); take(g, x, u); return; } }
    if (x.state === 'walk') {
      x.anim = ANIM.walk; x.carry = x.role === 'janitor' ? CARRY.mop : x.role === 'tech' ? CARRY.wrench : 0;
      if (moveAlong(g, x, sp * (j.severity >= 3 ? 1.35 : 1.1), dt, false)) {
        if (Math.hypot(j.x - x.x, j.z - x.z) < 2.2) { x.state = 'work'; x.cellT = 0; }
        else if (!setPath(g, x, j.x, j.z)) release(g, x);
      }
      return;
    }
    x.state = 'work'; x.anim = WORK_ANIM[j.kind] ?? ANIM.talk; x.carry = x.anim === ANIM.mop ? CARRY.mop : x.anim === ANIM.repair || x.anim === ANIM.use ? CARRY.wrench : 0;
    if (j.kind === 'audClean') roamAud(g, x, j, sp, dt);
    else turn(x, Math.atan2(j.x - x.x, j.z - x.z), dt * 4);
    if (workJob(g, j, dt * (0.42 + x.skill * 0.0075) * (0.6 + x.morale / 170), x)) { x.job = 0; x.state = 'idle'; x.timer = 0.6; x.xp++; if (j.kind === 'projector' || j.kind === 'seat' || j.kind === 'toilet' || j.kind === 'equipment' || j.kind === 'item') x.fixed++; else x.cleaned++; }
    return;
  }
  if (x.state === 'work') { // sweeping a patch of floor
    x.anim = ANIM.mop; x.carry = CARRY.mop;
    cleanAround(g, x.x, x.z, 1.5, dt * (0.5 + x.skill * 0.008) * (0.6 + x.morale / 170), true);
    if (x.timer <= 0) { x.state = 'idle'; x.cleaned++; x.timer = 0.3; }
    return;
  }
  if (x.pi < x.path.length) {
    x.anim = ANIM.walk; x.carry = x.role === 'janitor' ? CARRY.mop : 0;
    if (x.timer <= 0) { x.timer = 1.2; const j = pickJob(g, x); if (j && (x.area !== 'sweep' || j.severity >= 2)) { x.area = 'all'; take(g, x, j); return; } }
    if (moveAlong(g, x, sp, dt, false)) { if (x.role === 'janitor' && x.area === 'sweep') { x.state = 'work'; x.timer = 1.7; x.area = 'all'; return; } x.state = 'idle'; x.timer = g.rng.range(1.5, 4); }
    return;
  }
  x.state = 'idle'; x.anim = x.id % 2 ? ANIM.look : ANIM.idle; x.carry = x.role === 'janitor' ? CARRY.mop : 0;
  if (x.timer > 0) return;
  x.timer = 1.2;
  const j = pickJob(g, x);
  if (j) { take(g, x, j); return; }
  if (x.role === 'janitor') {
    const t = dirtiestCell(g, x);
    if (t && setPath(g, x, t.x, t.z)) { x.area = 'sweep'; return; }
  }
  patrol(g, x);
}
function roamAud(g: Game, x: Staff, j: Job, sp: number, dt: number): void {
  const a = audById(Number(j.ref.split(':')[1]));
  if (x.pi >= x.path.length) {
    const row = Math.floor((j.progress / j.need) * a.rows) % a.rows;
    const zb = -10.5 - row * 1.5 - 1.25, side = Math.floor(j.progress * 1.3) % 2 ? 1 : -1;
    setPath(g, x, a.cx + side * a.cols * 0.3, zb);
  }
  moveAlong(g, x, sp * 0.7, dt, false);
  x.y += (floorY(x.x, x.z) - x.y) * Math.min(1, dt * 8);
  cleanAround(g, x.x, x.z, 1.6, dt * 1.2, true);
}
function release(g: Game, x: Staff): void {
  const j = g.site.jobs.find((k) => k.id === x.job);
  if (j && j.assignee === x.id) j.assignee = 0;
  x.job = 0; x.state = 'idle'; x.path = []; x.pi = 0;
}
function take(g: Game, x: Staff, j: Job): void {
  j.assignee = x.id; x.job = j.id;
  if (!walkTo(g, x, j.x, j.z)) { j.assignee = 0; x.job = 0; x.state = 'idle'; x.timer = 3; }
}
function pickJob(g: Game, x: Staff): Job | null {
  let best: Job | null = null, bs = -Infinity;
  for (const j of g.site.jobs) {
    if (j.assignee || j.player || !canDo(x, j)) continue;
    if (j.kind === 'audClean') { const aud = Number(j.ref.split(':')[1]); if (g.s.guests.some((m) => m.z < -6.2 && roomAt(m.x, m.z)?.aud === aud && m.state !== 'leave')) { if (g.s.screenings.some((s) => s.aud === aud && (s.state === 'playing' || s.state === 'trailers' || s.state === 'seating'))) continue; } }
    if (j.kind === 'seat') { const aud = Number(j.ref.split(':')[1]); if (g.s.screenings.some((s) => s.aud === aud && (s.state === 'playing' || s.state === 'trailers' || s.state === 'seating'))) continue; }
    const score = j.severity * 26 + Math.min(20, (g.s.minute - j.created) * 0.2) - Math.hypot(j.x - x.x, j.z - x.z) * 0.7;
    if (score > bs) { bs = score; best = j; }
  }
  return best;
}
function dirtiestCell(g: Game, x: Staff): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null, bs = 0.16;
  for (const l of g.site.litter) {
    const r = roomAt(l.x, l.z);
    if (!r || (r.kind === 'auditorium' && g.s.screenings.some((s) => s.aud === r.aud && (s.state === 'playing' || s.state === 'trailers' || s.state === 'seating')))) continue;
    if (g.site.staff.some((o) => o !== x && o.path.length && Math.hypot(o.path[o.path.length - 1]!.x - l.x, o.path[o.path.length - 1]!.z - l.z) < 1.2)) continue;
    const v = (l.kind === 'vomit' || l.kind === 'water' ? 3 : 1.4) - Math.hypot(l.x - x.x, l.z - x.z) * 0.03;
    if (v > bs) { bs = v; best = { x: l.x, z: l.z }; }
  }
  for (let i = 0; i < 70; i++) {
    const k = Math.floor(g.rng.next() * NX * NZ), d = g.site.dirt[k]!;
    if (d < 0.16 || g.nav.blocked[k]) continue;
    const cx = centerX(k % NX), cz = centerZ((k / NX) | 0);
    const v = d * 1.1 - Math.hypot(cx - x.x, cz - x.z) * 0.018;
    if (v > bs) { bs = v; best = { x: cx, z: cz }; }
  }
  return best;
}
function patrol(g: Game, x: Staff): void {
  for (let i = 0; i < 6; i++) {
    const tx = g.rng.range(-14, 14), tz = x.role === 'tech' ? g.rng.range(8, 13) - 0 : g.rng.range(-5, 16);
    const px = x.role === 'tech' ? -20.5 + g.rng.range(-3, 3) : tx;
    if (g.nav.walkable(px, tz) && setPath(g, x, px, tz)) { x.timer = g.rng.range(4, 9); return; }
  }
}
void FIXTURES; void cellX; void cellZ;
