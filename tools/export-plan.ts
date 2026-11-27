import { writeFileSync } from 'node:fs';
import * as P from '../src/sim/plan';
writeFileSync(new URL('./blender/plan.json', import.meta.url), JSON.stringify({
  rooms: P.ROOMS, doors: P.DOORS, auds: P.AUDS, fixtures: P.FIXTURES, solids: P.FIXED_SOLIDS, world: P.WORLD,
  seats: P.AUDS.flatMap((a) => P.seatsOf(a.id)), wallT: P.WALL_T, rowPitch: P.ROW_PITCH, rowDrop: P.ROW_DROP,
  firstRow: P.FIRST_ROW_Z, zones: P.ZONE_IDS, boothZ0: P.BOOTH_Z0,
}));
