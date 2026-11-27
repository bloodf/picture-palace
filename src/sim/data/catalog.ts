import type { AgeBand, ArchetypeId, Genre, StaffRole, Temperament } from '../types';

// ---------------------------------------------------------------- audiences
export interface Archetype { id: ArchetypeId; name: string; size: [number, number]; ages: AgeBand[]; share: number; wealth: number; thrift: number; patience: number; tidy: number; rowdy: number; appetite: number; standards: number; arcade: number; taste: Partial<Record<Genre, number>>; peak: 'day' | 'evening' | 'late' | 'any'; cert: string[] }
export const ARCHETYPES: Archetype[] = [
  { id: 'family', name: 'Family', size: [3, 5], ages: ['adult', 'adult', 'child', 'child', 'child'], share: 0.2, wealth: 1, thrift: 0.65, patience: 0.5, tidy: 0.35, rowdy: 0.35, appetite: 1.25, standards: 0.55, arcade: 0.7, taste: { animation: 20, adventure: 10, comedy: 6, musical: 6, fantasy: 5, horror: -40, thriller: -18 }, peak: 'day', cert: ['G', 'PG', 'PG-13'] },
  { id: 'teens', name: 'Teens', size: [2, 5], ages: ['teen', 'teen', 'teen', 'teen', 'teen'], share: 0.17, wealth: 0.6, thrift: 0.75, patience: 0.4, tidy: 0.2, rowdy: 0.75, appetite: 1.3, standards: 0.35, arcade: 1, taste: { horror: 16, action: 13, scifi: 8, comedy: 9, drama: -14, documentary: -22, animation: -2 }, peak: 'evening', cert: ['G', 'PG', 'PG-13'] },
  { id: 'couple', name: 'Couple', size: [2, 2], ages: ['adult', 'adult'], share: 0.2, wealth: 1.2, thrift: 0.35, patience: 0.6, tidy: 0.7, rowdy: 0.1, appetite: 1, standards: 0.7, arcade: 0.25, taste: { romance: 16, comedy: 8, drama: 4, thriller: 5, horror: 3, animation: -10 }, peak: 'evening', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'cinephile', name: 'Cinephile', size: [1, 2], ages: ['adult', 'adult'], share: 0.1, wealth: 1, thrift: 0.4, patience: 0.75, tidy: 0.85, rowdy: 0.02, appetite: 0.6, standards: 0.95, arcade: 0.05, taste: { drama: 16, documentary: 12, thriller: 8, scifi: 4, action: -6, animation: -2 }, peak: 'any', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'seniors', name: 'Seniors', size: [1, 3], ages: ['senior', 'senior', 'senior'], share: 0.12, wealth: 0.9, thrift: 0.7, patience: 0.7, tidy: 0.9, rowdy: 0.02, appetite: 0.7, standards: 0.75, arcade: 0, taste: { drama: 12, musical: 14, romance: 10, documentary: 8, comedy: 5, horror: -30, action: -10, scifi: -10 }, peak: 'day', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'solo', name: 'Regular', size: [1, 1], ages: ['adult'], share: 0.09, wealth: 0.9, thrift: 0.5, patience: 0.6, tidy: 0.6, rowdy: 0.1, appetite: 0.9, standards: 0.6, arcade: 0.35, taste: { scifi: 10, thriller: 8, horror: 6, fantasy: 6 }, peak: 'any', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'friends', name: 'Friends', size: [2, 5], ages: ['adult', 'adult', 'adult', 'adult', 'adult'], share: 0.12, wealth: 1, thrift: 0.4, patience: 0.5, tidy: 0.45, rowdy: 0.45, appetite: 1.2, standards: 0.55, arcade: 0.6, taste: { comedy: 14, action: 10, horror: 9, scifi: 8, musical: 2 }, peak: 'late', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'influencer', name: 'Influencer', size: [1, 2], ages: ['adult', 'adult'], share: 0, wealth: 1.3, thrift: 0.2, patience: 0.25, tidy: 0.5, rowdy: 0.3, appetite: 0.8, standards: 0.85, arcade: 0.5, taste: { fantasy: 6, action: 6, comedy: 6 }, peak: 'evening', cert: ['G', 'PG', 'PG-13', 'R'] },
  { id: 'critic', name: 'Critic', size: [1, 1], ages: ['adult'], share: 0, wealth: 1.2, thrift: 0.2, patience: 0.5, tidy: 1, rowdy: 0, appetite: 0.7, standards: 1.1, arcade: 0, taste: { drama: 10, documentary: 8, horror: -4 }, peak: 'any', cert: ['G', 'PG', 'PG-13', 'R'] },
];
export const archById = (id: ArchetypeId) => ARCHETYPES.find((a) => a.id === id)!;
export const TEMPERS: { id: Temperament; name: string; humor: number; drift: number; swing: number; patience: number; note: string }[] = [
  { id: 'jolly', name: 'Jolly', humor: 1.35, drift: 6, swing: 1, patience: 1.2, note: 'Laughs first, forgives quickly.' },
  { id: 'grumpy', name: 'Grumpy', humor: 0.55, drift: -8, swing: 1.25, patience: 0.7, note: 'Arrives expecting to be let down.' },
  { id: 'anxious', name: 'Anxious', humor: 0.9, drift: -2, swing: 1.4, patience: 0.85, note: 'Feels crowds, queues and scares twice as hard.' },
  { id: 'chill', name: 'Easy-going', humor: 1, drift: 3, swing: 0.65, patience: 1.5, note: 'Takes a lot to upset, takes a lot to thrill.' },
  { id: 'rowdy', name: 'Rowdy', humor: 1.2, drift: 1, swing: 1.1, patience: 0.7, note: 'Talks in the film unless somebody stops them.' },
  { id: 'curious', name: 'Curious', humor: 1.05, drift: 2, swing: 1, patience: 1, note: 'Notices the décor, the posters and the details.' },
];

// ---------------------------------------------------------------- concessions
export interface Product { id: string; name: string; need: 'hunger' | 'thirst' | 'fun'; power: number; base: number; cost: number; equip: string; hall: 'con' | 'food' | 'vip'; kids: number; mess: number; carry: number; blurb: string }
export const PRODUCTS: Product[] = [
  { id: 'popcorn', name: 'Popcorn', need: 'hunger', power: 38, base: 5.5, cost: 0.55, equip: 'popcorn', hall: 'con', kids: 1.2, mess: 1.2, carry: 1, blurb: 'The reason cinemas exist, financially.' },
  { id: 'soda', name: 'Soda', need: 'thirst', power: 48, base: 4.2, cost: 0.4, equip: 'soda', hall: 'con', kids: 1.2, mess: 0.7, carry: 2, blurb: 'Ninety percent ice at the right setting.' },
  { id: 'candy', name: 'Candy', need: 'fun', power: 14, base: 3.8, cost: 0.9, equip: 'candy', hall: 'con', kids: 1.8, mess: 0.6, carry: 0, blurb: 'Rustles at exactly the wrong moment.' },
  { id: 'hotdog', name: 'Hot Dog', need: 'hunger', power: 56, base: 6.5, cost: 1.5, equip: 'hotdog', hall: 'con', kids: 0.9, mess: 0.6, carry: 0, blurb: 'Rolls all day, never arrives.' },
  { id: 'nachos', name: 'Nachos', need: 'hunger', power: 48, base: 6.8, cost: 1.3, equip: 'nachos', hall: 'con', kids: 0.9, mess: 1.1, carry: 0, blurb: 'Loud food for quiet films.' },
  { id: 'pretzel', name: 'Pretzel', need: 'hunger', power: 34, base: 5, cost: 0.9, equip: 'pretzel', hall: 'con', kids: 1, mess: 0.3, carry: 0, blurb: 'Salty, warm and tidy.' },
  { id: 'slush', name: 'Slush', need: 'thirst', power: 38, base: 4.8, cost: 0.5, equip: 'slush', hall: 'con', kids: 2, mess: 0.9, carry: 2, blurb: 'Turns tongues, and armrests, blue.' },
  { id: 'icecream', name: 'Ice Cream', need: 'fun', power: 22, base: 5.2, cost: 1.2, equip: 'icecream', hall: 'con', kids: 1.6, mess: 0.6, carry: 0, blurb: 'Sells itself when the heating is up.' },
  { id: 'coffee', name: 'Coffee', need: 'thirst', power: 26, base: 3.6, cost: 0.6, equip: 'coffee', hall: 'con', kids: 0, mess: 0.3, carry: 2, blurb: 'Keeps the matinee awake.' },
  { id: 'pizza', name: 'Pizza Slice', need: 'hunger', power: 66, base: 7.5, cost: 1.9, equip: 'pizza', hall: 'food', kids: 1.3, mess: 0.6, carry: 0, blurb: 'Wood-ish fired.' },
  { id: 'burger', name: 'Burger Basket', need: 'hunger', power: 86, base: 12.5, cost: 4, equip: 'grill', hall: 'food', kids: 1, mess: 0.6, carry: 0, blurb: 'Dinner and a movie, in that order.' },
  { id: 'salad', name: 'Salad Bowl', need: 'hunger', power: 46, base: 9.5, cost: 3, equip: 'saladbar', hall: 'food', kids: 0.1, mess: 0.2, carry: 0, blurb: 'For one person in every group.' },
  { id: 'cocktail', name: 'Cocktail', need: 'fun', power: 30, base: 13, cost: 3, equip: 'bar', hall: 'vip', kids: 0, mess: 0.2, carry: 0, blurb: 'Named after films nobody finished.' },
  { id: 'wine', name: 'Wine', need: 'thirst', power: 22, base: 10, cost: 2.6, equip: 'bar', hall: 'vip', kids: 0, mess: 0.3, carry: 0, blurb: 'Served in glass. Briefly.' },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)!;
export const SUPPLY_TIERS = [
  { name: 'Budget', cost: 0.72, quality: 0.7 }, { name: 'House', cost: 1, quality: 1 }, { name: 'Premium', cost: 1.65, quality: 1.32 },
] as const;

export interface Equip { id: string; name: string; prop: string; cost: number; wing?: string; x: number; z: number; y: number; rot: number; wear: number; blurb: string; jobX: number; jobZ: number }
/** Where each machine stands once bought. rot in quarter turns (0 = faces +z). */
export const EQUIPMENT: Equip[] = [
  { id: 'popcorn', name: 'Popcorn Machine', prop: 'popcorn_machine', cost: 0, x: -0.1, z: 0.52, y: 0.95, rot: 0, wear: 0.05, blurb: 'A 1962 kettle. It has opinions.', jobX: -0.25, jobZ: 1.75 },
  { id: 'soda', name: 'Soda Fountain', prop: 'soda_fountain', cost: 1800, x: 1.7, z: 0.52, y: 0.95, rot: 0, wear: 0.04, blurb: 'Six valves, five flavours.', jobX: 1.75, jobZ: 1.75 },
  { id: 'candy', name: 'Candy Rack', prop: 'candy_rack', cost: 700, x: -1.6, z: 0.46, y: 0.95, rot: 0, wear: 0.005, blurb: 'High margin, no moving parts.', jobX: -1.75, jobZ: 1.75 },
  { id: 'hotdog', name: 'Hot Dog Roller', prop: 'hotdog_roller', cost: 1600, x: 3.2, z: 0.52, y: 0.95, rot: 0, wear: 0.05, blurb: 'Mesmerising. Slightly.', jobX: 3.25, jobZ: 1.75 },
  { id: 'nachos', name: 'Nacho Station', prop: 'nacho_warmer', cost: 1400, x: -3.0, z: 0.52, y: 0.95, rot: 0, wear: 0.04, blurb: 'Cheese on a timer.', jobX: -3.25, jobZ: 1.75 },
  { id: 'pretzel', name: 'Pretzel Case', prop: 'pretzel_case', cost: 1200, x: -4.2, z: 0.52, y: 0.95, rot: 0, wear: 0.03, blurb: 'Spins for attention.', jobX: -4.25, jobZ: 1.75 },
  { id: 'slush', name: 'Slush Machine', prop: 'slush_machine', cost: 1900, x: 4.5, z: 0.52, y: 0.95, rot: 0, wear: 0.06, blurb: 'Three colours, one flavour.', jobX: 4.25, jobZ: 1.75 },
  { id: 'coffee', name: 'Espresso Machine', prop: 'coffee_machine', cost: 2400, x: 5.5, z: 0.52, y: 0.95, rot: 0, wear: 0.05, blurb: 'Hisses like a villain.', jobX: 5.25, jobZ: 1.75 },
  { id: 'icecream', name: 'Ice Cream Freezer', prop: 'icecream_freezer', cost: 2200, x: -5.35, z: 0.5, y: 0.95, rot: 0, wear: 0.03, blurb: 'Eight tubs, one scoop.', jobX: -5.25, jobZ: 1.75 },
  { id: 'pizza', name: 'Pizza Oven', prop: '', cost: 5200, wing: 'foodcourt', x: 29.4, z: 13, y: 0, rot: 3, wear: 0.05, blurb: 'Four hundred degrees of queue.', jobX: 28.25, jobZ: 13.25 },
  { id: 'grill', name: 'Burger Grill', prop: '', cost: 6500, wing: 'foodcourt', x: 29.4, z: 9, y: 0, rot: 3, wear: 0.06, blurb: 'Sizzles you can smell from Screen 3.', jobX: 28.25, jobZ: 9.25 },
  { id: 'saladbar', name: 'Salad Bar', prop: '', cost: 2600, wing: 'foodcourt', x: 29.4, z: 5, y: 0, rot: 3, wear: 0.02, blurb: 'Leaves, mostly.', jobX: 28.25, jobZ: 5.25 },
  { id: 'bar', name: 'Cocktail Bar', prop: 'vip_bar', cost: 4800, wing: 'vip', x: 40.6, z: 11.7, y: 0, rot: 3, wear: 0.01, blurb: 'Marble, brass and a licence.', jobX: 39.25, jobZ: 11.75 },
];
export const equipById = (id: string) => EQUIPMENT.find((e) => e.id === id)!;

// ---------------------------------------------------------------- placeable items
export interface ItemDef { id: string; name: string; prop: string; cost: number; w: number; d: number; h: number; cat: 'comfort' | 'decor' | 'service' | 'arcade' | 'clean'; rooms: string[]; beauty: number; seats?: number; income?: number; fun?: number; power: number; wear?: number; chapter: number; blurb: string }
const PUBLIC = ['lobby', 'promenade', 'foodcourt', 'arcade', 'vip'];
export const ITEMS: ItemDef[] = [
  { id: 'bin', name: 'Litter Bin', prop: 'trash_bin', cost: 90, w: 0.5, d: 0.5, h: 0.9, cat: 'clean', rooms: [...PUBLIC, 'street'], beauty: 0.5, power: 0, chapter: 0, blurb: 'Guests look for one within twelve metres, then give up.' },
  { id: 'bench', name: 'Velvet Bench', prop: 'bench', cost: 220, w: 1.5, d: 0.5, h: 0.5, cat: 'comfort', rooms: PUBLIC, beauty: 1.5, seats: 2, power: 0, chapter: 0, blurb: 'Somewhere to wait for the trailers.' },
  { id: 'sofa', name: 'Lobby Settee', prop: 'sofa_round', cost: 950, w: 2, d: 2, h: 1.1, cat: 'comfort', rooms: ['lobby', 'vip', 'foodcourt'], beauty: 5, seats: 6, power: 0, chapter: 1, blurb: 'A round velvet settee with a palm on top. Very 1931.' },
  { id: 'palm', name: 'Potted Palm', prop: 'plant_palm', cost: 160, w: 1, d: 1, h: 1.6, cat: 'decor', rooms: PUBLIC, beauty: 3, power: 0, chapter: 0, blurb: 'Real. Mostly.' },
  { id: 'fern', name: 'Fern Urn', prop: 'plant_fern', cost: 110, w: 1, d: 1, h: 0.7, cat: 'decor', rooms: PUBLIC, beauty: 2, power: 0, chapter: 0, blurb: 'Softens a hard corner.' },
  { id: 'rope', name: 'Rope Line', prop: 'stanchion', cost: 120, w: 2, d: 0.5, h: 1, cat: 'decor', rooms: ['lobby', 'promenade', 'vip', 'street'], beauty: 1.5, power: 0, chapter: 0, blurb: 'Makes a queue feel like an occasion.' },
  { id: 'standee', name: 'Film Standee', prop: 'standee', cost: 140, w: 1.5, d: 0.5, h: 1.9, cat: 'decor', rooms: ['lobby', 'promenade'], beauty: 1.8, fun: 4, power: 0, chapter: 0, blurb: 'Cardboard hype for whatever is showing.' },
  { id: 'kiosk', name: 'Ticket Kiosk', prop: 'kiosk', cost: 1600, w: 1, d: 0.5, h: 1.7, cat: 'service', rooms: ['lobby'], beauty: 0.5, power: 2, wear: 0.05, chapter: 1, blurb: 'Sells tickets without a wage, until it needs a technician.' },
  { id: 'vending', name: 'Vending Machine', prop: 'vending', cost: 1100, w: 1, d: 1, h: 1.9, cat: 'service', rooms: PUBLIC, beauty: 0, income: 3, power: 2, wear: 0.05, chapter: 0, blurb: 'Snacks for people who hate queues.' },
  { id: 'water', name: 'Water Fountain', prop: 'water_fountain', cost: 420, w: 0.5, d: 0.5, h: 1, cat: 'service', rooms: PUBLIC, beauty: 0.5, power: 0, wear: 0.02, chapter: 0, blurb: 'Free water. Guests love it, the soda fountain does not.' },
  { id: 'arcadeA', name: 'Star Hauler', prop: 'arcade_a', cost: 900, w: 1, d: 1, h: 1.85, cat: 'arcade', rooms: ['lobby', 'arcade', 'promenade'], beauty: 1, income: 1, fun: 12, power: 1, wear: 0.07, chapter: 0, blurb: 'Upright shooter. One coin, three lives.' },
  { id: 'arcadeB', name: 'Knuckle Alley', prop: 'arcade_b', cost: 950, w: 1, d: 1, h: 1.85, cat: 'arcade', rooms: ['lobby', 'arcade', 'promenade'], beauty: 1, income: 1, fun: 13, power: 1, wear: 0.07, chapter: 0, blurb: 'Two-player brawler. Teens gather.' },
  { id: 'racer', name: 'Coast Racer', prop: 'arcade_racer', cost: 2400, w: 1, d: 2, h: 2, cat: 'arcade', rooms: ['arcade', 'lobby'], beauty: 2, income: 2, fun: 18, power: 2, wear: 0.08, chapter: 1, blurb: 'Sit-down racer with a seat that rumbles.' },
  { id: 'pinball', name: 'Pinball', prop: 'pinball', cost: 1500, w: 1, d: 1.5, h: 1.7, cat: 'arcade', rooms: ['arcade', 'lobby', 'vip'], beauty: 2, income: 1, fun: 14, power: 1, wear: 0.1, chapter: 1, blurb: 'Breaks often. Loved always.' },
  { id: 'claw', name: 'Claw Machine', prop: 'claw', cost: 1300, w: 1, d: 1, h: 2.1, cat: 'arcade', rooms: ['arcade', 'lobby', 'promenade'], beauty: 1.5, income: 2, fun: 10, power: 1, wear: 0.06, chapter: 0, blurb: 'Statistically a popcorn machine for coins.' },
  { id: 'photobooth', name: 'Photo Booth', prop: 'photobooth', cost: 2100, w: 2, d: 1, h: 2.2, cat: 'arcade', rooms: ['lobby', 'arcade', 'promenade'], beauty: 3, income: 4, fun: 16, power: 1, wear: 0.05, chapter: 1, blurb: 'Four poses, one strip. Couples cannot resist.' },
  { id: 'jukebox', name: 'Jukebox', prop: 'jukebox', cost: 1800, w: 1, d: 1, h: 1.5, cat: 'decor', rooms: PUBLIC, beauty: 5, income: 0.5, fun: 6, power: 1, wear: 0.03, chapter: 1, blurb: 'Bubble tubes and forty-fives.' },
  { id: 'table', name: 'Café Table', prop: 'table_set', cost: 380, w: 2, d: 2, h: 0.9, cat: 'comfort', rooms: ['foodcourt', 'lobby', 'vip', 'arcade'], beauty: 2, seats: 4, power: 0, chapter: 0, blurb: 'Four stools and a marble top.' },
  { id: 'armchair', name: 'Club Armchair', prop: 'lounge_chair', cost: 340, w: 1, d: 1, h: 0.95, cat: 'comfort', rooms: PUBLIC, beauty: 2.5, seats: 1, power: 0, chapter: 0, blurb: 'Teal velvet. Hard to leave.' },
  { id: 'statue', name: 'Golden Muse', prop: 'statue', cost: 2600, w: 1, d: 1, h: 2.2, cat: 'decor', rooms: ['lobby', 'promenade', 'vip'], beauty: 9, power: 0, chapter: 2, blurb: 'Not a legal likeness of any award.' },
  { id: 'reel', name: 'Reel Sculpture', prop: 'reel_sculpture', cost: 1400, w: 1.5, d: 0.5, h: 1.6, cat: 'decor', rooms: ['lobby', 'promenade', 'vip'], beauty: 6, power: 0, chapter: 1, blurb: 'Two giant reels, welded mid-spin.' },
  { id: 'museum', name: 'Antique Projector', prop: 'projector_display', cost: 1200, w: 1, d: 1.5, h: 1.6, cat: 'decor', rooms: ['lobby', 'promenade', 'vip'], beauty: 5, fun: 6, power: 0, chapter: 1, blurb: 'The one from before the one you inherited.' },
  { id: 'piano', name: 'Player Piano', prop: 'piano', cost: 3800, w: 1.5, d: 2.5, h: 1, cat: 'decor', rooms: ['lobby', 'vip', 'foodcourt'], beauty: 8, fun: 10, power: 1, wear: 0.03, chapter: 2, blurb: 'Plays ragtime. Never sleeps.' },
  { id: 'fountain', name: 'Marble Fountain', prop: 'fountain', cost: 5200, w: 2.5, d: 2.5, h: 1.4, cat: 'decor', rooms: ['lobby', 'foodcourt'], beauty: 14, income: 0.4, power: 2, wear: 0.02, chapter: 2, blurb: 'Collects wishes in small change.' },
];
export const itemById = (id: string) => ITEMS.find((i) => i.id === id)!;

// ---------------------------------------------------------------- auditorium upgrades
export const SEAT_TIERS = [
  { name: 'Inherited flip seats', comfort: 34, cost: 0, prop: 'seat_old', wear: 1.5, blurb: 'Wood, iron and a spring with a grudge.' },
  { name: 'Cushioned rockers', comfort: 66, cost: 95, prop: 'seat_std', wear: 0.8, blurb: 'High backs and cup holders.' },
  { name: 'Power recliners', comfort: 95, cost: 260, prop: 'seat_recl', wear: 0.9, blurb: 'Leather. People fall asleep, happily.' },
];
export const SCREEN_TIERS = [
  { name: 'Matte canvas', q: 40, cost: 0, blurb: 'Patched twice, lower left.' },
  { name: 'Pearl vinyl', q: 68, cost: 3200, blurb: 'Bright and seamless.' },
  { name: 'Silver reference', q: 96, cost: 8500, blurb: 'Perforated, masked, perfect.' },
];
export const SOUND_TIERS = [
  { name: 'Mono horn', q: 32, cost: 0, blurb: 'One speaker. Behind the screen. Somewhere.' },
  { name: 'Seven-point surround', q: 66, cost: 3600, blurb: 'Rain in the right place.' },
  { name: 'Object-based array', q: 97, cost: 9800, blurb: 'Forty-eight channels and a subwoofer with a name.' },
];
export const PROJ_TIERS = [
  { name: '35mm carbon relic', q: 44, cost: 0, prop: 'projector_35', lampLife: 420, lampCost: 180, wear: 0.075, blurb: 'Warm, scratched and alive. Breaks film.' },
  { name: '2K digital', q: 72, cost: 7800, prop: 'projector_dig', lampLife: 900, lampCost: 380, wear: 0.035, blurb: 'Press play, go to lunch.' },
  { name: '4K laser', q: 98, cost: 22000, prop: 'projector_laser', lampLife: 6000, lampCost: 900, wear: 0.018, blurb: 'No lamp. No grain. No excuses.' },
];
export const DECOR = {
  lobby: [{ name: 'As inherited', cost: 0, beauty: 8 }, { name: 'Restored deco', cost: 7500, beauty: 38 }, { name: 'Palace grand', cost: 24000, beauty: 70 }],
  prom: [{ name: 'Threadbare', cost: 0, beauty: 6 }, { name: 'Fan carpet', cost: 4200, beauty: 26 }, { name: 'Peacock carpet', cost: 11000, beauty: 48 }],
  wc: [{ name: 'Original plumbing', cost: 0, beauty: 10 }, { name: 'Refitted', cost: 3800, beauty: 40 }, { name: 'Powder rooms', cost: 9800, beauty: 72 }],
  facade: [{ name: 'Half the bulbs', cost: 0, beauty: 10 }, { name: 'Relit marquee', cost: 5200, beauty: 40 }, { name: 'Full neon', cost: 15000, beauty: 76 }],
} as const;
export type DecorKey = keyof typeof DECOR;

// ---------------------------------------------------------------- staff
export const ROLES: Record<StaffRole, { name: string; wage: number; tint: number; blurb: string; model: [string, string] }> = {
  box: { name: 'Cashier', wage: 78, tint: 0x7a1626, blurb: 'Sells tickets at the box office.', model: ['staff_m', 'staff_f'] },
  concession: { name: 'Concessionist', wage: 80, tint: 0xb0261f, blurb: 'Serves the stand and the food hall.', model: ['staff_m', 'staff_f'] },
  usher: { name: 'Usher', wage: 76, tint: 0x17454d, blurb: 'Checks tickets, hushes talkers, wakes sleepers.', model: ['staff_m', 'staff_f'] },
  janitor: { name: 'Janitor', wage: 72, tint: 0x3f5b78, blurb: 'Floors, bins, bathrooms and whatever that was.', model: ['staff_m', 'staff_f'] },
  tech: { name: 'Technician', wage: 118, tint: 0x3d3f45, blurb: 'Projectors, seats, plumbing and machines.', model: ['staff_m', 'staff_f'] },
  security: { name: 'Security', wage: 98, tint: 0x15171c, blurb: 'Pirates, brawls and people who bring whole pizzas.', model: ['staff_m', 'staff_f'] },
};
export const FIRST_M = ['Amos', 'Bruno', 'Cal', 'Dario', 'Eli', 'Felix', 'Gus', 'Hugo', 'Ivan', 'Jonah', 'Kofi', 'Leo', 'Marco', 'Nils', 'Otis', 'Pavel', 'Quinn', 'Rafa', 'Sol', 'Theo', 'Umar', 'Vito', 'Wes', 'Xavi', 'Yusuf', 'Zane', 'Kenji', 'Andre', 'Mateo', 'Dev'];
export const FIRST_F = ['Ada', 'Bea', 'Cleo', 'Dina', 'Esme', 'Flora', 'Gia', 'Hana', 'Ines', 'June', 'Kira', 'Lola', 'Mina', 'Nora', 'Opal', 'Petra', 'Rosa', 'Sana', 'Tess', 'Uma', 'Vera', 'Wren', 'Yara', 'Zoe', 'Priya', 'Mei', 'Amara', 'Lucia', 'Ingrid', 'Salma'];
export const LAST = ['Abbott', 'Barros', 'Castellan', 'Dunmore', 'Egan', 'Farrow', 'Greer', 'Haddad', 'Ishii', 'Jansen', 'Kovac', 'Lindqvist', 'Moreau', 'Nakata', 'Okafor', 'Pereira', 'Quigley', 'Rossi', 'Silva', 'Tanaka', 'Ueda', 'Varga', 'Whitlock', 'Xu', 'Yilmaz', 'Zamora', 'Bright', 'Costa', 'Delgado', 'Nwosu'];
export const TRAITS = ['Whistles on shift', 'Former bowler', 'Never late', 'Film school dropout', 'Hates the sun', 'Knows every regular', 'Very strong', 'Owns nine cats', 'Speaks four languages', 'Writes a blog', 'Loves lists', 'Ex-lighthouse keeper', 'Allergic to butter', 'Fastest hands in town', 'Cries at trailers'];

// ---------------------------------------------------------------- marketing & ambience
export const CAMPAIGNS = [
  { id: 'flyers', name: 'Street flyers', cost: 250, days: 3, boost: 0.1, arch: ['teens', 'friends'], blurb: 'Paper, tape and a borrowed bicycle.' },
  { id: 'radio', name: 'Radio spot', cost: 900, days: 5, boost: 0.18, arch: ['seniors', 'family', 'solo'], blurb: 'Thirty seconds after the traffic.' },
  { id: 'social', name: 'Social ads', cost: 1300, days: 5, boost: 0.22, arch: ['teens', 'couple', 'friends'], blurb: 'Targets people who typed “bored”.' },
  { id: 'billboard', name: 'Highway billboard', cost: 3200, days: 10, boost: 0.26, arch: ['family', 'couple', 'solo'], blurb: 'Your marquee, forty feet wide.' },
  { id: 'critics', name: 'Press night', cost: 2000, days: 2, boost: 0.14, arch: ['cinephile', 'couple'], blurb: 'Free wine. Honest reviews. Risky.' },
  { id: 'kids', name: 'Kids’ club', cost: 1100, days: 7, boost: 0.24, arch: ['family'], blurb: 'Badges, stickers, Saturday chaos.' },
] as const;
export const MUSIC = [
  { id: 'off', name: 'Silence', like: {} as Partial<Record<ArchetypeId, number>> },
  { id: 'jazz', name: 'Lobby jazz', like: { couple: 5, seniors: 5, cinephile: 5, solo: 2, teens: -3 } },
  { id: 'scores', name: 'Film scores', like: { cinephile: 6, solo: 4, family: 3, friends: 2 } },
  { id: 'pop', name: 'Chart pop', like: { teens: 6, friends: 4, family: 3, seniors: -4, cinephile: -4 } },
  { id: 'synth', name: 'Night synth', like: { teens: 4, friends: 5, solo: 4, seniors: -5 } },
] as const;

// ---------------------------------------------------------------- chain
export interface SiteDef { id: string; name: string; district: string; cost: number; traffic: number; wealth: number; rent: number; mix: Partial<Record<ArchetypeId, number>>; rival: string; theme: string; mapX: number; mapY: number; blurb: string }
export const SITES: SiteDef[] = [
  { id: 'palace', name: 'Picture Palace', district: 'Old Orchard Street', cost: 0, traffic: 1, wealth: 1, rent: 150, mix: {}, rival: 'Cineplex Nine', theme: 'ruby', mapX: 47, mapY: 56, blurb: 'Your first. The projector is older than the mayor.' },
  { id: 'harbor', name: 'Harborlight', district: 'Fishmarket Quay', cost: 95000, traffic: 1.1, wealth: 0.95, rent: 230, mix: { family: 1.5, seniors: 1.2 }, rival: 'Pier Screens', theme: 'teal', mapX: 24, mapY: 70, blurb: 'Salt air, ferry crowds and a leaking roof.' },
  { id: 'campus', name: 'The Lecture', district: 'University Row', cost: 120000, traffic: 1.25, wealth: 0.75, rent: 260, mix: { teens: 1.6, friends: 1.7, cinephile: 1.6, family: 0.4, seniors: 0.4 }, rival: 'Student Union Film', theme: 'emerald', mapX: 62, mapY: 32, blurb: 'Forty thousand students. None of them own a tidy shirt.' },
  { id: 'garden', name: 'Garden Gate', district: 'Maple Heights', cost: 150000, traffic: 1.15, wealth: 1.3, rent: 330, mix: { family: 2, couple: 1.2, teens: 1.1 }, rival: 'MegaMall 16', theme: 'ruby', mapX: 78, mapY: 66, blurb: 'Prams, minivans and weekend money.' },
  { id: 'station', name: 'Grand Junction', district: 'Central Station', cost: 220000, traffic: 1.7, wealth: 1, rent: 520, mix: { solo: 2, couple: 1.1, friends: 1.2 }, rival: 'Railway Picturehouse', theme: 'onyx', mapX: 44, mapY: 38, blurb: 'Sixty thousand commuters a day, all with an hour to lose.' },
  { id: 'opera', name: 'The Old Opera', district: 'Theatre Quarter', cost: 340000, traffic: 1.35, wealth: 1.7, rent: 680, mix: { couple: 1.7, cinephile: 2, seniors: 1.6, teens: 0.4 }, rival: 'Aurelia Arthouse', theme: 'violet', mapX: 33, mapY: 46, blurb: 'Velvet, ghosts and patrons who read the programme.' },
  { id: 'neon', name: 'Neon Mile', district: 'The Strip', cost: 480000, traffic: 2.1, wealth: 1.35, rent: 920, mix: { friends: 2, teens: 1.6, couple: 1.2, seniors: 0.3 }, rival: 'HyperDome', theme: 'onyx', mapX: 86, mapY: 44, blurb: 'Open until the sun complains.' },
  { id: 'crown', name: 'The Crown', district: 'Lumen Plaza', cost: 800000, traffic: 2.5, wealth: 1.6, rent: 1400, mix: { couple: 1.3, influencer: 2 }, rival: 'Colossus Flagship', theme: 'violet', mapX: 56, mapY: 22, blurb: 'The most famous corner in the city. Own it and you own the skyline.' },
];
export const siteDef = (id: string) => SITES.find((s) => s.id === id)!;
