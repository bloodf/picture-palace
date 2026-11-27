/** Small deterministic random generator (sfc32). Its state is plain numbers so it can be saved. */
export class Rng {
  a: number; b: number; c: number; d: number;
  constructor(seed: number | [number, number, number, number]) {
    if (Array.isArray(seed)) { [this.a, this.b, this.c, this.d] = seed; return; }
    let h = seed >>> 0;
    const next = () => { h = (h + 0x9e3779b9) >>> 0; let t = h ^ (h >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); return (t ^ (t >>> 15)) >>> 0; };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.next();
  }
  get state(): [number, number, number, number] { return [this.a, this.b, this.c, this.d]; }
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(list: readonly T[]): T { return list[Math.floor(this.next() * list.length)] as T; }
  gauss(mean = 0, sd = 1): number {
    const u = Math.max(1e-9, this.next()), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.gauss(lambda, Math.sqrt(lambda))));
    const l = Math.exp(-lambda); let k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > l);
    return k - 1;
  }
  weighted<T>(list: readonly T[], w: (t: T) => number): T | null {
    let sum = 0;
    for (const t of list) sum += Math.max(0, w(t));
    if (sum <= 0) return null;
    let r = this.next() * sum;
    for (const t of list) { r -= Math.max(0, w(t)); if (r <= 0) return t; }
    return list[list.length - 1] as T;
  }
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [list[i], list[j]] = [list[j]!, list[i]!]; }
    return list;
  }
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
