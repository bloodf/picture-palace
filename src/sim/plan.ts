/**
 * The building. This single file is the source of truth for the 3D shell (Blender bakes from it),
 * the player's physics colliders, the guests' navigation grid and the simulation's fixtures.
 * Units are metres. +x is east, +z is south (towards the street), +y is up.
 */
export type RoomKind =
  | 'street' | 'lobby' | 'promenade' | 'auditorium' | 'booth' | 'restroom' | 'office'
  | 'foodcourt' | 'arcade' | 'vip';

export type WingId =
  | 'base' | 'aud2' | 'aud3' | 'aud4' | 'aud5' | 'aud6' | 'foodcourt' | 'arcade' | 'vip' | 'restroomE';

export interface Rect { x0: number; x1: number; z0: number; z1: number }

export interface RoomDef {
  id: string;
  kind: RoomKind;
  rect: Rect;
  height: number;
  wing: WingId;
  label: string;
  gender?: 'w' | 'm';
  aud?: number;
}

export interface DoorDef {
  id: string;
  /** 'z' = a wall running along x at constant z, 'x' = a wall running along z at constant x. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  height: number;
  style: 'arch' | 'door' | 'glass' | 'portal' | 'staff';
  wing: WingId;
}

export interface AudDef {
  id: number;
  rect: Rect;
  cx: number;
  rows: number;
  cols: number;
  height: number;
  wing: WingId;
  booth: Rect;
  screenW: number;
  screenH: number;
  screenY: number;
}

export interface SeatDef { aud: number; row: number; col: number; x: number; y: number; z: number; idx: number; accessX: number; accessZ: number }

export type FixtureKind = 'toilet' | 'urinal' | 'sink';
export interface FixtureDef { id: string; kind: FixtureKind; room: string; x: number; z: number; dir: number; ux: number; uz: number }

export const WALL_T = 0.3;
export const SEAT_W = 0.65;
export const ROW_PITCH = 1.5;
export const ROW_DROP = 0.25;
export const FIRST_ROW_Z = -10.5;
export const BOOTH_Z0 = -9.5;

export const WORLD: Rect = { x0: -50, x1: 46, z0: -32, z1: 24 };

function mkAud(id: number, x0: number, x1: number, z0: number, rows: number, cols: number, height: number, wing: WingId): AudDef {
  const cx = (x0 + x1) / 2;
  const screenW = Math.min(x1 - x0 - 1.8, 16);
  const screenH = screenW / 2.2;
  return {
    id, rect: { x0, x1, z0, z1: -6 }, cx, rows, cols, height, wing,
    booth: { x0: cx - 2, x1: cx + 2, z0: BOOTH_Z0, z1: -6 },
    screenW, screenH, screenY: -ROW_DROP * (rows - 1) + 1.05,
  };
}

export const AUDS: AudDef[] = [
  mkAud(1, -12, 0, -24, 6, 10, 5.4, 'base'),
  mkAud(2, 0, 12, -24, 6, 10, 5.4, 'aud2'),
  mkAud(3, -28, -12, -27, 7, 14, 6.4, 'aud3'),
  mkAud(4, 12, 28, -27, 7, 14, 6.4, 'aud4'),
  mkAud(5, 28, 42, -27, 7, 12, 6.2, 'aud5'),
  mkAud(6, -46, -28, -30, 9, 16, 7.6, 'aud6'),
];

export const audById = (id: number): AudDef => AUDS[id - 1]!;

export const ROOMS: RoomDef[] = [
  { id: 'street', kind: 'street', rect: { x0: -50, x1: 46, z0: 18, z1: 23 }, height: 9, wing: 'base', label: 'Sidewalk' },
  { id: 'lobby', kind: 'lobby', rect: { x0: -15, x1: 15, z0: 0, z1: 18 }, height: 5.6, wing: 'base', label: 'Grand Lobby' },
  { id: 'promenade', kind: 'promenade', rect: { x0: -46, x1: 42, z0: -6, z1: 0 }, height: 4.2, wing: 'base', label: 'Promenade' },
  { id: 'wcW', kind: 'restroom', gender: 'w', rect: { x0: -26, x1: -20.5, z0: 0, z1: 8 }, height: 3.2, wing: 'base', label: "Ladies' Room" },
  { id: 'wcM', kind: 'restroom', gender: 'm', rect: { x0: -20.5, x1: -15, z0: 0, z1: 8 }, height: 3.2, wing: 'base', label: "Gents' Room" },
  { id: 'office', kind: 'office', rect: { x0: -26, x1: -15, z0: 8, z1: 18 }, height: 3.4, wing: 'base', label: "Manager's Office" },
  { id: 'foodcourt', kind: 'foodcourt', rect: { x0: 15, x1: 30, z0: 0, z1: 18 }, height: 4.6, wing: 'foodcourt', label: 'Food Hall' },
  { id: 'wcW2', kind: 'restroom', gender: 'w', rect: { x0: 30, x1: 36, z0: 0, z1: 8 }, height: 3.2, wing: 'restroomE', label: "East Ladies' Room" },
  { id: 'wcM2', kind: 'restroom', gender: 'm', rect: { x0: 36, x1: 42, z0: 0, z1: 8 }, height: 3.2, wing: 'restroomE', label: "East Gents' Room" },
  { id: 'vip', kind: 'vip', rect: { x0: 30, x1: 42, z0: 8, z1: 18 }, height: 4, wing: 'vip', label: 'Velvet Lounge' },
  { id: 'arcade', kind: 'arcade', rect: { x0: -46, x1: -26, z0: 0, z1: 14 }, height: 4.2, wing: 'arcade', label: 'Arcade' },
  ...AUDS.map((a): RoomDef => ({ id: `aud${a.id}`, kind: 'auditorium', aud: a.id, rect: a.rect, height: a.height, wing: a.wing, label: `Screen ${a.id}` })),
  ...AUDS.map((a): RoomDef => ({ id: `booth${a.id}`, kind: 'booth', aud: a.id, rect: a.booth, height: 3.2, wing: a.wing, label: `Booth ${a.id}` })),
];

export const roomById = (id: string): RoomDef => ROOMS.find((r) => r.id === id)!;

export const DOORS: DoorDef[] = [
  { id: 'front1', axis: 'z', at: 18, from: -5, to: -2.5, height: 2.6, style: 'glass', wing: 'base' },
  { id: 'front2', axis: 'z', at: 18, from: -1.25, to: 1.25, height: 2.6, style: 'glass', wing: 'base' },
  { id: 'front3', axis: 'z', at: 18, from: 2.5, to: 5, height: 2.6, style: 'glass', wing: 'base' },
  { id: 'archW', axis: 'z', at: 0, from: -13, to: -8, height: 3.6, style: 'arch', wing: 'base' },
  { id: 'archE', axis: 'z', at: 0, from: 8, to: 13, height: 3.6, style: 'arch', wing: 'base' },
  { id: 'wcW', axis: 'z', at: 0, from: -24.5, to: -22, height: 2.4, style: 'door', wing: 'base' },
  { id: 'wcM', axis: 'z', at: 0, from: -19, to: -16.5, height: 2.4, style: 'door', wing: 'base' },
  { id: 'office', axis: 'x', at: -15, from: 8.5, to: 10.5, height: 2.4, style: 'door', wing: 'base' },
  { id: 'food1', axis: 'x', at: 15, from: 5, to: 13, height: 3.6, style: 'arch', wing: 'foodcourt' },
  { id: 'food2', axis: 'z', at: 0, from: 19, to: 24, height: 3.4, style: 'arch', wing: 'foodcourt' },
  { id: 'wcW2', axis: 'z', at: 0, from: 31.5, to: 34, height: 2.4, style: 'door', wing: 'restroomE' },
  { id: 'wcM2', axis: 'z', at: 0, from: 37.5, to: 40, height: 2.4, style: 'door', wing: 'restroomE' },
  { id: 'vip', axis: 'x', at: 30, from: 11, to: 14, height: 2.8, style: 'portal', wing: 'vip' },
  { id: 'arcade', axis: 'z', at: 0, from: -40, to: -34, height: 3.4, style: 'arch', wing: 'arcade' },
  ...AUDS.flatMap((a): DoorDef[] => [
    { id: `aud${a.id}L`, axis: 'z', at: -6, from: a.booth.x0 - 2.75, to: a.booth.x0 - 0.75, height: 2.5, style: 'portal', wing: a.wing },
    { id: `aud${a.id}R`, axis: 'z', at: -6, from: a.booth.x1 + 0.75, to: a.booth.x1 + 2.75, height: 2.5, style: 'portal', wing: a.wing },
    { id: `booth${a.id}`, axis: 'z', at: -6, from: a.cx - 1, to: a.cx + 1, height: 2.3, style: 'staff', wing: a.wing },
  ]),
];

/** Wall solid pieces between doors, used for physics, nav and rendering checks. */
export interface WallSeg { axis: 'x' | 'z'; at: number; from: number; to: number; height: number; y0: number; exterior: boolean }

interface Interval { a: number; b: number }
function unionIntervals(list: Interval[]): Interval[] {
  const s = [...list].sort((p, q) => p.a - q.a);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out[out.length - 1];
    if (last && i.a <= last.b + 1e-6) last.b = Math.max(last.b, i.b);
    else out.push({ ...i });
  }
  return out;
}
function subtract(list: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const i of list) {
    if (cut.b <= i.a || cut.a >= i.b) { out.push(i); continue; }
    if (cut.a > i.a) out.push({ a: i.a, b: cut.a });
    if (cut.b < i.b) out.push({ a: cut.b, b: i.b });
  }
  return out;
}

/** Door openings are solid while their wing has not been built. */
export function wallSegments(unlocked: ReadonlySet<WingId>): WallSeg[] {
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; iv: Interval[]; h: number }>();
  const add = (axis: 'x' | 'z', at: number, a: number, b: number, h: number) => {
    const key = `${axis}:${at}`;
    const e = lines.get(key) ?? { axis, at, iv: [], h: 0 };
    e.iv.push({ a, b });
    e.h = Math.max(e.h, h);
    lines.set(key, e);
  };
  for (const r of ROOMS) {
    if (r.kind === 'street') continue;
    const { x0, x1, z0, z1 } = r.rect;
    add('z', z0, x0, x1, r.height); add('z', z1, x0, x1, r.height);
    add('x', x0, z0, z1, r.height); add('x', x1, z0, z1, r.height);
  }
  const out: WallSeg[] = [];
  for (const { axis, at, iv, h } of lines.values()) {
    let parts = unionIntervals(iv);
    for (const d of DOORS) {
      if (d.axis === axis && d.at === at && unlocked.has(d.wing)) parts = subtract(parts, { a: d.from, b: d.to });
    }
    for (const p of parts) out.push({ axis, at, from: p.a, to: p.b, height: h, y0: -3, exterior: false });
  }
  return out;
}

/** Height of the finished floor. Auditoriums step down towards the screen. */
export function floorY(x: number, z: number): number {
  if (z > FIRST_ROW_Z) return 0;
  for (const a of AUDS) {
    if (x >= a.rect.x0 && x < a.rect.x1 && z >= a.rect.z0 - 0.5) {
      const r = Math.floor((FIRST_ROW_Z - z) / ROW_PITCH + 1e-6);
      return -ROW_DROP * Math.min(Math.max(r, 0), a.rows - 1);
    }
  }
  return 0;
}

const seatCache = new Map<number, SeatDef[]>();
export function seatsOf(aud: number): SeatDef[] {
  const hit = seatCache.get(aud);
  if (hit) return hit;
  const a = audById(aud);
  const out: SeatDef[] = [];
  for (let r = 0; r < a.rows; r++) {
    const zb = FIRST_ROW_Z - r * ROW_PITCH;
    for (let c = 0; c < a.cols; c++) {
      const x = a.cx + (c - (a.cols - 1) / 2) * SEAT_W;
      const z = zb - 0.55;
      out.push({ aud, row: r, col: c, x, z, y: floorY(x, z), idx: out.length, accessX: x, accessZ: zb - 1.25 });
    }
  }
  seatCache.set(aud, out);
  return out;
}

export const FIXTURES: FixtureDef[] = (() => {
  const out: FixtureDef[] = [];
  const make = (room: string, x0: number, x1: number, gender: 'w' | 'm', doorOnLeft: boolean) => {
    const stalls = gender === 'w' ? 4 : 2;
    const w = 1.25;
    for (let i = 0; i < stalls; i++) {
      const x = doorOnLeft ? x1 - 0.25 - w * (i + 0.5) : x0 + 0.25 + w * (i + 0.5);
      out.push({ id: `${room}-t${i}`, kind: 'toilet', room, x, z: 7.45, dir: 0, ux: x, uz: 6.75 });
    }
    if (gender === 'm') {
      for (let i = 0; i < 3; i++) {
        const z = 4.75 - i * 0.95;
        out.push({ id: `${room}-u${i}`, kind: 'urinal', room, x: x1 - 0.35, z, dir: -1, ux: x1 - 0.95, uz: z });
      }
    }
    for (let i = 0; i < 3; i++) {
      const z = 4.9 - i * 1.0;
      out.push({ id: `${room}-s${i}`, kind: 'sink', room, x: x0 + 0.45, z, dir: 1, ux: x0 + 1.25, uz: z });
    }
  };
  make('wcW', -26, -20.5, 'w', true);
  make('wcM', -20.5, -15, 'm', true);
  make('wcW2', 30, 36, 'w', true);
  make('wcM2', 36, 42, 'm', true);
  return out;
})();

export interface StationDef { id: string; kind: 'box' | 'concession' | 'usher' | 'food'; x: number; z: number; sx: number; sz: number; face: number; qx: number; qz: number; qdx: number; qdz: number; wing: WingId }
/** sx/sz = where staff stand, qx/qz = first customer spot, qdx/qdz = queue direction. */
export const STATIONS: StationDef[] = [
  { id: 'box0', kind: 'box', x: -11, z: 12.25, sx: -12.25, sz: 12.25, face: 1, qx: -9.75, qz: 12.25, qdx: 1, qdz: 0, wing: 'base' },
  { id: 'box1', kind: 'box', x: -11, z: 14.75, sx: -12.25, sz: 14.75, face: 1, qx: -9.75, qz: 14.75, qdx: 1, qdz: 0, wing: 'base' },
  { id: 'con0', kind: 'concession', x: -1.5, z: 2.9, sx: -1.5, sz: 1.75, face: 0, qx: -1.75, qz: 4.25, qdx: 0, qdz: 1, wing: 'base' },
  { id: 'con1', kind: 'concession', x: 1.5, z: 2.9, sx: 1.5, sz: 1.75, face: 0, qx: 1.75, qz: 4.25, qdx: 0, qdz: 1, wing: 'base' },
  { id: 'con2', kind: 'concession', x: -4.5, z: 2.9, sx: -4.5, sz: 1.75, face: 0, qx: -4.75, qz: 4.25, qdx: 0, qdz: 1, wing: 'base' },
  { id: 'con3', kind: 'concession', x: 4.5, z: 2.9, sx: 4.5, sz: 1.75, face: 0, qx: 4.75, qz: 4.25, qdx: 0, qdz: 1, wing: 'base' },
  { id: 'food0', kind: 'food', x: 27, z: 5.25, sx: 28.25, sz: 5.25, face: -1, qx: 25.75, qz: 5.25, qdx: -1, qdz: 0, wing: 'foodcourt' },
  { id: 'food1', kind: 'food', x: 27, z: 9.25, sx: 28.25, sz: 9.25, face: -1, qx: 25.75, qz: 9.25, qdx: -1, qdz: 0, wing: 'foodcourt' },
  { id: 'food2', kind: 'food', x: 27, z: 13.25, sx: 28.25, sz: 13.25, face: -1, qx: 25.75, qz: 13.25, qdx: -1, qdz: 0, wing: 'foodcourt' },
  { id: 'ush0', kind: 'usher', x: -8.6, z: 1.1, sx: -8.25, sz: -0.75, face: 0, qx: -9.75, qz: 1.25, qdx: 0, qdz: 1, wing: 'base' },
  { id: 'ush1', kind: 'usher', x: 8.6, z: 1.1, sx: 8.25, sz: -0.75, face: 0, qx: 9.75, qz: 1.25, qdx: 0, qdz: 1, wing: 'base' },
];

/** Solid fixed furniture that belongs to the architecture. h = height in metres. */
export interface SolidDef { x0: number; x1: number; z0: number; z1: number; h: number; wing: WingId; tag: string; y?: number }
export const FIXED_SOLIDS: SolidDef[] = (() => {
  const s: SolidDef[] = [];
  s.push({ x0: -6, x1: 6, z0: 2.5, z1: 3.3, h: 1.1, wing: 'base', tag: 'concession-counter' });
  s.push({ x0: -6, x1: 6, z0: 0.15, z1: 0.9, h: 2.2, wing: 'base', tag: 'concession-back' });
  s.push({ x0: -11.5, x1: -10.7, z0: 11, z1: 16, h: 1.15, wing: 'base', tag: 'boxoffice' });
  s.push({ x0: -14.85, x1: -11.5, z0: 16, z1: 16.3, h: 2.6, wing: 'base', tag: 'boxoffice-side' });
  s.push({ x0: 26.6, x1: 27.4, z0: 3.5, z1: 15, h: 1.1, wing: 'foodcourt', tag: 'food-counter' });
  s.push({ x0: 29.1, x1: 29.85, z0: 3, z1: 15.5, h: 2.2, wing: 'foodcourt', tag: 'food-back' });
  for (const a of AUDS) {
    s.push({ x0: a.cx - 0.45, x1: a.cx + 0.45, z0: -9.2, z1: -7.9, h: 1.6, wing: a.wing, tag: 'projector' });
    for (let r = 0; r < a.rows; r++) {
      const zb = FIRST_ROW_Z - r * ROW_PITCH;
      const half = (a.cols * SEAT_W) / 2 + 0.03;
      s.push({ x0: a.cx - half, x1: a.cx + half, z0: zb - 0.85, z1: zb - 0.1, h: 1.05, wing: a.wing, tag: 'seats', y: -ROW_DROP * r });
    }
  }
  for (const room of ['wcW', 'wcM', 'wcW2', 'wcM2']) {
    const r = roomById(room);
    const stalls = r.gender === 'w' ? 4 : 2;
    const w = 1.25;
    for (let i = 0; i <= stalls; i++) {
      const x = r.rect.x1 - 0.25 - w * i;
      s.push({ x0: x - 0.03, x1: x + 0.03, z0: 6.2, z1: 7.85, h: 2.0, wing: r.wing, tag: 'stall' });
    }
    s.push({ x0: r.rect.x0 + 0.15, x1: r.rect.x0 + 0.75, z0: 2.3, z1: 5.5, h: 0.9, wing: r.wing, tag: 'sinks' });
  }
  for (const f of FIXTURES) {
    const w = roomById(f.room).wing;
    if (f.kind === 'toilet') s.push({ x0: f.x - 0.22, x1: f.x + 0.22, z0: 7.15, z1: 7.85, h: 0.8, wing: w, tag: 'toilet' });
    if (f.kind === 'urinal') s.push({ x0: f.x - 0.05, x1: f.x + 0.2, z0: f.z - 0.2, z1: f.z + 0.2, h: 1.1, wing: w, tag: 'urinal' });
  }
  // manager's office
  s.push({ x0: -23.6, x1: -21.4, z0: 14.0, z1: 15.0, h: 0.78, wing: 'base', tag: 'desk' });
  s.push({ x0: -25.85, x1: -25.3, z0: 9.2, z1: 12.2, h: 2.1, wing: 'base', tag: 'shelves' });
  s.push({ x0: -19.5, x1: -17.3, z0: 16.9, z1: 17.8, h: 0.8, wing: 'base', tag: 'sofa' });
  // ushers' podiums
  s.push({ x0: -8.5, x1: -8.0, z0: 0.35, z1: 0.8, h: 1.1, wing: 'base', tag: 'podium' });
  s.push({ x0: 8.0, x1: 8.5, z0: 0.35, z1: 0.8, h: 1.1, wing: 'base', tag: 'podium' });
  // VIP bar
  s.push({ x0: 40.2, x1: 41.0, z0: 9.2, z1: 14.2, h: 1.1, wing: 'vip', tag: 'vip-bar' });
  return s;
})();

export const SPAWNS = [
  { x: -19, z: 20.75 }, { x: -19, z: 21.75 }, { x: 19, z: 20.25 }, { x: 19, z: 21.75 },
];

export const ZONE_IDS: string[] = ROOMS.map((r) => r.id);

/** Index into ROOMS of the room containing a point (booths win over auditoriums), or -1. */
export function roomIndexAt(x: number, z: number): number {
  let hit = -1;
  for (let i = 0; i < ROOMS.length; i++) {
    const r = ROOMS[i]!.rect;
    if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) {
      hit = i;
      if (ROOMS[i]!.kind === 'booth') return i;
    }
  }
  return hit;
}
export const roomAt = (x: number, z: number): RoomDef | null => {
  const i = roomIndexAt(x, z);
  return i < 0 ? null : ROOMS[i]!;
};

export interface WingDef { id: WingId; name: string; cost: number; blurb: string; needsChapter: number }
export const WINGS: WingDef[] = [
  { id: 'aud2', name: 'Screen 2', cost: 11500, needsChapter: 1, blurb: 'The shuttered twin of Screen 1. Same sixty seats, same slope, forty years of dust.' },
  { id: 'arcade', name: 'Arcade', cost: 9000, needsChapter: 1, blurb: 'Blacklight carpet and room for two dozen cabinets. Keeps early arrivals spending.' },
  { id: 'foodcourt', name: 'Food Hall', cost: 20000, needsChapter: 2, blurb: 'A second kitchen: pizza, burgers and a proper place to sit.' },
  { id: 'aud3', name: 'Screen 3', cost: 31000, needsChapter: 2, blurb: 'Ninety-eight seats and a wall-to-wall scope screen.' },
  { id: 'restroomE', name: 'East Restrooms', cost: 9000, needsChapter: 2, blurb: 'Halves the walk from the east screens.' },
  { id: 'aud4', name: 'Screen 4', cost: 36000, needsChapter: 3, blurb: 'The mirror of Screen 3, on the east side.' },
  { id: 'vip', name: 'Velvet Lounge', cost: 28000, needsChapter: 3, blurb: 'Bar service and armchairs. Lets you sell VIP tickets.' },
  { id: 'aud5', name: 'Screen 5', cost: 46000, needsChapter: 4, blurb: 'An intimate east-end house, eighty-four seats.' },
  { id: 'aud6', name: 'The Giant', cost: 90000, needsChapter: 4, blurb: 'A sixteen-metre screen and 144 seats. The room people drive across town for.' },
];
