import * as THREE from 'three';
import { floorY, roomAt } from '../sim/plan';
import { clamp } from '../sim/rng';
import type { PlayerPhysics } from '../physics/player';

export type ViewMode = 'manager' | 'walk';

export class CameraRig {
  readonly cam = new THREE.PerspectiveCamera(50, 1, 0.08, 260);
  mode: ViewMode = 'manager';
  first = false;
  // manager view
  target = new THREE.Vector3(0, 0, 9);
  dist = 26; yaw = 0; pitch = 0.98;
  private goal = { x: 0, z: 9, dist: 26, yaw: 0, pitch: 0.98 };
  // walk view
  wyaw = Math.PI; wpitch = 0.12; private arm = 3;
  follow: (() => { x: number; y: number; z: number } | null) | null = null;
  clip = 99; private clipGoal = 2.45;
  shake = 0;
  pan(dx: number, dz: number): void { this.follow = null; const k = this.goal.dist * 0.0011, c = Math.cos(this.goal.yaw), s = Math.sin(this.goal.yaw); this.goal.x = clamp(this.goal.x - (dx * c + dz * s) * k, -46, 42); this.goal.z = clamp(this.goal.z - (-dx * s + dz * c) * k, -30, 24); }
  orbit(dx: number, dy: number): void { this.goal.yaw -= dx * 0.005; this.goal.pitch = clamp(this.goal.pitch + dy * 0.004, 0.32, 1.5); }
  zoom(f: number): void { this.goal.dist = clamp(this.goal.dist * f, 5, 78); }
  look(dx: number, dy: number): void { this.wyaw -= dx * 0.0032; this.wpitch = clamp(this.wpitch + dy * 0.0026, -0.75, 1.0); }
  focus(x: number, z: number, dist?: number): void { this.follow = null; this.goal.x = x; this.goal.z = z; if (dist) this.goal.dist = dist; }
  snap(): void { this.target.set(this.goal.x, 0, this.goal.z); this.dist = this.goal.dist; this.yaw = this.goal.yaw; this.pitch = this.goal.pitch; }
  setOrbit(yaw: number, pitch: number, dist: number): void { this.goal.yaw = yaw; this.goal.pitch = pitch; this.goal.dist = dist; }
  update(dt: number, player: { x: number; y: number; z: number } | null, phys: PlayerPhysics | null, height = 1.6): void {
    const k = 1 - Math.exp(-dt * 9);
    if (this.mode === 'manager') {
      const f = this.follow?.();
      if (f) { this.goal.x = f.x; this.goal.z = f.z; }
      this.target.x += (this.goal.x - this.target.x) * k; this.target.z += (this.goal.z - this.target.z) * k; this.target.y += ((f ? f.y : floorY(this.goal.x, this.goal.z)) - this.target.y) * k;
      this.dist += (this.goal.dist - this.dist) * k; this.yaw += (this.goal.yaw - this.yaw) * k; this.pitch += (this.goal.pitch - this.pitch) * k;
      const c = Math.cos(this.pitch) * this.dist;
      this.cam.position.set(this.target.x + Math.sin(this.yaw) * c, this.target.y + Math.sin(this.pitch) * this.dist + 0.6, this.target.z + Math.cos(this.yaw) * c);
      this.cam.lookAt(this.target.x, this.target.y + 0.6, this.target.z);
      this.clipGoal = 2.45;
      this.setFov(42);
    } else if (player) {
      const eye = player.y + height;
      const cp = Math.cos(this.wpitch), dx = Math.sin(this.wyaw) * cp, dy = -Math.sin(this.wpitch), dz = Math.cos(this.wyaw) * cp;
      if (this.first) {
        this.cam.position.set(player.x + Math.sin(this.wyaw) * 0.08, eye, player.z + Math.cos(this.wyaw) * 0.08);
        this.cam.lookAt(player.x + dx * 4, eye + dy * 4, player.z + dz * 4);
        this.setFov(66);
      } else {
        const sx = -Math.cos(this.wyaw) * 0.42, sz = Math.sin(this.wyaw) * 0.42; // over the right shoulder
        const so = phys ? phys.clearance(player.x, eye, player.z, sx, 0, sz, 1) : 1;
        const ox = player.x + sx * so * 0.9, oz = player.z + sz * so * 0.9;
        const want = 2.9, free = phys ? phys.clearance(ox, eye, oz, -dx, -dy, -dz, want) : want;
        this.arm = free < this.arm ? free : this.arm + (free - this.arm) * (1 - Math.exp(-dt * 5));
        const a = Math.max(0.12, this.arm - 0.06);
        this.cam.position.set(ox - dx * a, Math.max(player.y + 0.3, eye - dy * a), oz - dz * a);
        this.cam.lookAt(ox + dx * 4, eye + dy * 4, oz + dz * 4);
        this.setFov(56);
      }
      this.clipGoal = 99;
    }
    if (this.shake > 0) { this.shake -= dt; const s = this.shake * 0.06; this.cam.position.x += (Math.random() - 0.5) * s; this.cam.position.y += (Math.random() - 0.5) * s; }
    this.clip = this.clipGoal > 50 ? (this.clip > 12 ? 99 : this.clip + dt * 22) : this.clip > 50 ? 9 : this.clip + (this.clipGoal - this.clip) * (1 - Math.exp(-dt * 6));
  }
  private setFov(f: number): void { if (Math.abs(this.cam.fov - f) > 0.1) { this.cam.fov += (f - this.cam.fov) * 0.25; this.cam.updateProjectionMatrix(); } }
  get room(): string { return roomAt(this.cam.position.x, this.cam.position.z)?.id ?? 'street'; }
}
