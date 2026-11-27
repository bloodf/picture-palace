import RAPIER from '@dimforge/rapier3d-compat';
import { AUDS, FIXED_SOLIDS, ROW_DROP, WALL_T, WORLD, floorY, wallSegments, type WingId } from '../sim/plan';
import type { Footprint } from '../sim/nav';

export const PLAYER_R = 0.2, PLAYER_H = 1.72;
let ready: Promise<void> | null = null;
export const initPhysics = (): Promise<void> => (ready ??= RAPIER.init());

export interface SolidBox { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; tag: string }

/** Every solid box in the building: walls, counters, seats, partitions, plus furniture. */
export function solidBoxes(unlocked: ReadonlySet<WingId>, items: readonly (Footprint & { h: number })[]): SolidBox[] {
  const out: SolidBox[] = [];
  const t = WALL_T / 2;
  for (const s of wallSegments(unlocked)) {
    const a = s.from - t, b = s.to + t;
    // door jambs end exactly at the opening, room corners overlap by half a wall
    const fa = isDoorEdge(s.axis, s.at, s.from, unlocked) ? s.from : a, fb = isDoorEdge(s.axis, s.at, s.to, unlocked) ? s.to : b;
    out.push(s.axis === 'z' ? { x0: fa, x1: fb, z0: s.at - t, z1: s.at + t, y0: -4, y1: 6, tag: 'wall' } : { x0: s.at - t, x1: s.at + t, z0: fa, z1: fb, y0: -4, y1: 6, tag: 'wall' });
  }
  for (const f of FIXED_SOLIDS) if (unlocked.has(f.wing)) out.push({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: (f.y ?? 0) - 0.05, y1: (f.y ?? 0) + f.h, tag: f.tag });
  for (const i of items) out.push({ x0: i.x0, x1: i.x1, z0: i.z0, z1: i.z1, y0: -0.05, y1: i.h, tag: 'item' });
  return out;
}
import { DOORS } from '../sim/plan';
function isDoorEdge(axis: 'x' | 'z', at: number, v: number, unlocked: ReadonlySet<WingId>): boolean {
  return DOORS.some((d) => d.axis === axis && d.at === at && unlocked.has(d.wing) && (Math.abs(d.from - v) < 1e-6 || Math.abs(d.to - v) < 1e-6));
}

export class PlayerPhysics {
  private world: RAPIER.World;
  private body!: RAPIER.RigidBody;
  private col!: RAPIER.Collider;
  private ctl: RAPIER.KinematicCharacterController;
  private statics: RAPIER.Collider[] = [];
  boxes: SolidBox[] = [];
  private vy = 0;
  grounded = true;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.ctl = this.world.createCharacterController(0.015);
    this.ctl.enableAutostep(0.32, 0.12, false);
    this.ctl.enableSnapToGround(0.35);
    this.ctl.setMaxSlopeClimbAngle(0.9);
    this.ctl.setSlideEnabled(true);
  }
  rebuild(unlocked: ReadonlySet<WingId>, items: readonly (Footprint & { h: number })[]): void {
    for (const c of this.statics) this.world.removeCollider(c, false);
    this.statics = [];
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      const d = RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setFriction(0);
      this.statics.push(this.world.createCollider(d));
    };
    this.boxes = solidBoxes(unlocked, items);
    for (const b of this.boxes) box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1);
    // floors: flat everywhere except the stepped auditoriums
    box(WORLD.x0 - 2, WORLD.x1 + 2, -0.5, 0, -10.5, WORLD.z1 + 2);
    for (const a of AUDS) {
      // walked as a gentle ramp through the middle of every tread, so nobody ever trips on a step edge
      const z1 = -11.25, z2 = z1 - 1.5 * (a.rows - 1), z3 = a.rect.z0 - 0.5, low = -ROW_DROP * (a.rows - 1);
      const slab = (za: number, ya: number, zb: number, yb: number) => { const d = RAPIER.ColliderDesc.convexHull(new Float32Array([a.rect.x0, ya, za, a.rect.x1, ya, za, a.rect.x0, yb, zb, a.rect.x1, yb, zb, a.rect.x0, ya - 0.6, za, a.rect.x1, ya - 0.6, za, a.rect.x0, yb - 0.6, zb, a.rect.x1, yb - 0.6, zb])); if (d) this.statics.push(this.world.createCollider(d)); };
      slab(-10.4, 0, z1, 0); slab(z1, 0, z2, low); slab(z2, low, z3, low);
    }
    // the edge of the world
    box(-26, 26, -1, 6, 23, 23.4);
    box(-26.4, -26, -1, 6, 13, 23.4); box(26, 26.4, -1, 6, 18, 23.4);
    if (!this.body) {
      this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PLAYER_H / 2 + 0.02, 14));
      this.col = this.world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_H / 2 - PLAYER_R, PLAYER_R), this.body);
    }
    this.world.step();
  }
  get pos(): { x: number; y: number; z: number } { const t = this.body.translation(); return { x: t.x, y: t.y - PLAYER_H / 2, z: t.z }; }
  teleport(x: number, z: number): void { const y = floorY(x, z); this.body.setTranslation({ x, y: y + PLAYER_H / 2 + 0.03, z }, true); this.body.setNextKinematicTranslation({ x, y: y + PLAYER_H / 2 + 0.03, z }); this.vy = 0; this.world.step(); }
  /** Move by a horizontal velocity. The capsule slides along walls and climbs auditorium steps. */
  move(vx: number, vz: number, dt: number): { x: number; y: number; z: number } {
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vy = this.grounded ? -1.2 : Math.max(-12, this.vy - 9.81 * h);
      this.ctl.computeColliderMovement(this.col, { x: vx * h, y: this.vy * h, z: vz * h });
      const m = this.ctl.computedMovement();
      this.grounded = this.ctl.computedGrounded();
      const t = this.body.translation();
      this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
      this.world.timestep = h;
      this.world.step();
    }
    const p = this.pos;
    if (p.y < -8) this.teleport(0, 14);
    return p;
  }
  /** How far a ray from the player's head may travel before hitting something solid. Used for the camera arm. */
  clearance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    const hit = this.world.castShape({ x: ox, y: oy, z: oz }, { x: 0, y: 0, z: 0, w: 1 }, { x: dx, y: dy, z: dz }, new RAPIER.Ball(0.16), 0, max, true, undefined, undefined, this.col);
    return hit ? Math.max(0, hit.time_of_impact) : max;
  }
  /** True when a point is inside any solid, with an allowance. */
  inside(x: number, y: number, z: number, r = 0): boolean { return this.boxes.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r && y > b.y0 && y < b.y1); }
  dispose(): void { this.world.free(); }
}
