/** Animation clip ids shared by the simulation and the crowd renderer. */
export const ANIM = {
  idle: 0, look: 1, walk: 2, run: 3, carryWalk: 4, carryIdle: 5, sit: 6, sitEat: 7, sitLaugh: 8, sitScared: 9, sitSleep: 10, sitClap: 11, sitSad: 12,
  talk: 13, angry: 14, cheer: 15, phone: 16, mop: 17, serve: 18, repair: 19, wave: 20, use: 21, sitBored: 22, tap: 23, hold: 24,
} as const;
export type AnimName = keyof typeof ANIM;
export const CARRY = { none: 0, popcorn: 1, cup: 2, both: 3, mop: 4, phone: 8, wrench: 16, clipboard: 32 } as const;
