import { DOORS, FIXED_SOLIDS, ROOMS, WALL_T, WORLD, floorY, roomIndexAt, wallSegments, type WingId } from './plan';

export const CELL = 0.5;
export const NX = Math.round((WORLD.x1 - WORLD.x0) / CELL);
export const NZ = Math.round((WORLD.z1 - WORLD.z0) / CELL);
export const AGENT_R = 0.2;
const FAR = 65535;
const OFFS = [-1, 1, -NX, NX, -NX - 1, -NX + 1, NX - 1, NX + 1];
const COSTS = [10, 10, 10, 10, 14, 14, 14, 14];

export interface Footprint { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }

export const cellX = (x: number) => Math.floor((x - WORLD.x0) / CELL);
export const cellZ = (z: number) => Math.floor((z - WORLD.z0) / CELL);
export const centerX = (i: number) => WORLD.x0 + (i + 0.5) * CELL;
export const centerZ = (j: number) => WORLD.z0 + (j + 0.5) * CELL;

/** Walkability grid with cached Dijkstra fields: hundreds of guests share a few dozen destinations. */
export class Nav {
  readonly blocked = new Uint8Array(NX * NZ);
  /** Zone index into ROOMS, 255 = outside. Static. */
  readonly room = new Uint8Array(NX * NZ);
  private fields = new Map<number, Uint16Array>();
  private buckets: number[][] = Array.from({ length: 15 }, () => []);
  version = 0;

  constructor() {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const r = roomIndexAt(centerX(i), centerZ(j));
      this.room[j * NX + i] = r < 0 ? 255 : r;
    }
  }

  rebuild(unlocked: ReadonlySet<WingId>, items: readonly Footprint[]): void {
    this.fields.clear();
    this.version++;
    const segs = wallSegments(unlocked);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const r = this.room[k]!;
      this.blocked[k] = r === 255 || !unlocked.has(ROOMS[r]!.wing) ? 1 : 0;
    }
    const reach = WALL_T / 2 + AGENT_R;
    for (const s of segs) {
      const a = s.from - AGENT_R, b = s.to + AGENT_R;
      if (s.axis === 'z') this.blockRect(a, b, s.at - reach, s.at + reach);
      else this.blockRect(s.at - reach, s.at + reach, a, b);
    }
    for (const f of FIXED_SOLIDS) {
      if (unlocked.has(f.wing)) this.blockRect(f.x0 - 0.18, f.x1 + 0.18, f.z0 - 0.18, f.z1 + 0.18);
    }
    for (const f of items) this.blockRect(f.x0 - 0.12, f.x1 + 0.12, f.z0 - 0.12, f.z1 + 0.12);
    for (let i = 0; i < NX; i++) { this.blocked[i] = 1; this.blocked[(NZ - 1) * NX + i] = 1; }
    for (let j = 0; j < NZ; j++) { this.blocked[j * NX] = 1; this.blocked[j * NX + NX - 1] = 1; }
  }

  private blockRect(x0: number, x1: number, z0: number, z1: number): void {
    const i0 = Math.max(0, Math.ceil((x0 - WORLD.x0) / CELL - 0.5)), i1 = Math.min(NX - 1, Math.floor((x1 - WORLD.x0) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - WORLD.z0) / CELL - 0.5)), j1 = Math.min(NZ - 1, Math.floor((z1 - WORLD.z0) / CELL - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.blocked[j * NX + i] = 1;
  }

  walkable(x: number, z: number): boolean {
    const i = cellX(x), j = cellZ(z);
    return i >= 0 && j >= 0 && i < NX && j < NZ && this.blocked[j * NX + i] === 0;
  }

  /** Closest free cell, spiralling outwards. */
  nearestFree(x: number, z: number, maxR = 14): number {
    const ci = Math.min(NX - 1, Math.max(0, cellX(x))), cj = Math.min(NZ - 1, Math.max(0, cellZ(z)));
    if (!this.blocked[cj * NX + ci]) return cj * NX + ci;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const k = j * NX + i;
        if (this.blocked[k]) continue;
        const d = (centerX(i) - x) ** 2 + (centerZ(j) - z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  field(target: number): Uint16Array {
    const hit = this.fields.get(target);
    if (hit) { this.fields.delete(target); this.fields.set(target, hit); return hit; }
    const d = new Uint16Array(NX * NZ).fill(FAR);
    // Dial's bucket queue with edge costs 10 / 14. Grid borders are always blocked, so no bounds checks are needed.
    const Q = this.buckets;
    for (let i = 0; i < 15; i++) Q[i]!.length = 0;
    d[target] = 0; Q[0]!.push(target);
    let live = 1, cost = 0;
    const b = this.blocked;
    const off = OFFS, oc = COSTS;
    while (live > 0) {
      const q = Q[cost % 15]!;
      while (q.length) {
        const k = q.pop()!; live--;
        if (d[k] !== cost) continue;
        const l = b[k - 1] === 0, r = b[k + 1] === 0, u = b[k - NX] === 0, w = b[k + NX] === 0;
        for (let e = 0; e < 8; e++) {
          if (e === 0 ? !l : e === 1 ? !r : e === 2 ? !u : e === 3 ? !w : e === 4 ? !(l && u) : e === 5 ? !(r && u) : e === 6 ? !(l && w) : !(r && w)) continue;
          const n = k + off[e]!;
          if (b[n] !== 0) continue;
          const nc = cost + oc[e]!;
          if (nc < d[n]!) { d[n] = nc; Q[nc % 15]!.push(n); live++; }
        }
      }
      cost++;
    }
    this.fields.set(target, d);
    if (this.fields.size > 360) this.fields.delete(this.fields.keys().next().value!);
    return d;
  }

  /** Path length in metres or Infinity. */
  distance(x: number, z: number, tx: number, tz: number): number {
    const t = this.nearestFree(tx, tz, 4), s = this.nearestFree(x, z);
    if (t < 0 || s < 0) return Infinity;
    const d = this.field(t)[s]!;
    return d === FAR ? Infinity : d * 0.05;
  }

  path(x: number, z: number, tx: number, tz: number): Pt[] | null {
    const t = this.nearestFree(tx, tz, 4), s = this.nearestFree(x, z);
    if (t < 0 || s < 0) return null;
    const T = { x: centerX(t % NX), z: centerZ((t / NX) | 0) };
    if (Math.abs(T.x - x) + Math.abs(T.z - z) < 16 && this.clear({ x: centerX(s % NX), z: centerZ((s / NX) | 0) }, T)) return [T];
    const d = this.field(t);
    if (d[s] === FAR) return null;
    const b = this.blocked;
    const cells: number[] = [s];
    let k = s;
    while (k !== t) {
      let best = -1, bd = d[k]!;
      const l = b[k - 1] === 0, r = b[k + 1] === 0, u = b[k - NX] === 0, w = b[k + NX] === 0;
      for (let e = 0; e < 8; e++) {
        if (e === 0 ? !l : e === 1 ? !r : e === 2 ? !u : e === 3 ? !w : e === 4 ? !(l && u) : e === 5 ? !(r && u) : e === 6 ? !(l && w) : !(r && w)) continue;
        const n = k + OFFS[e]!;
        if (d[n]! + COSTS[e]! <= d[k]! && d[n]! < bd) { bd = d[n]!; best = n; }
      }
      if (best < 0) return null;
      k = best;
      cells.push(k);
    }
    return this.smooth(cells);
  }

  private smooth(cells: number[]): Pt[] {
    const pts = cells.map((k) => ({ x: centerX(k % NX), z: centerZ((k / NX) | 0) }));
    const out: Pt[] = [];
    let a = 0;
    while (a < pts.length - 1) {
      let e = Math.min(pts.length - 1, a + 24);
      while (e > a + 1 && !this.clear(pts[a]!, pts[e]!)) e--;
      out.push(pts[e]!);
      a = e;
    }
    if (!out.length) out.push(pts[pts.length - 1]!);
    return out;
  }

  /** Grid line of sight: every cell the segment touches must be free. */
  clear(p: Pt, q: Pt): boolean {
    const dx = q.x - p.x, dz = q.z - p.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let s = 0; s <= n; s++) {
      const x = p.x + (dx * s) / n, z = p.z + (dz * s) / n;
      if (!this.walkable(x, z)) return false;
      // keep a sliver of clearance so smoothed paths do not clip corners
      if (!this.walkable(x + 0.1, z) || !this.walkable(x - 0.1, z) || !this.walkable(x, z + 0.1) || !this.walkable(x, z - 0.1)) return false;
    }
    return true;
  }

  /** All given points mutually reachable from the origin? Used before placing furniture. */
  reachable(origin: Pt, targets: readonly Pt[]): boolean {
    const o = this.nearestFree(origin.x, origin.z);
    if (o < 0) return false;
    const f = this.field(o);
    return targets.every((p) => { const k = this.nearestFree(p.x, p.z, 3); return k >= 0 && f[k] !== FAR; });
  }
}
export { floorY };
export const doorById = (id: string) => DOORS.find((d) => d.id === id)!;
