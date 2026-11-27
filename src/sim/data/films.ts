import type { Certificate, Film, Genre } from '../types';
import { clamp, type Rng } from '../rng';

export interface Studio { id: string; name: string; style: string; genres: Genre[]; muscle: number; logo: string }
export const STUDIOS: Studio[] = [
  { id: 'colossus', name: 'Colossus Pictures', style: 'Blockbusters and hard bargains', genres: ['action', 'scifi', 'fantasy', 'adventure'], muscle: 0.95, logo: 'C' },
  { id: 'lantern', name: 'Lantern & Moth', style: 'Prestige drama, gentle terms', genres: ['drama', 'romance', 'documentary', 'thriller'], muscle: 0.45, logo: 'L' },
  { id: 'nightjar', name: 'Nightjar', style: 'Cheap frights, deep pockets', genres: ['horror', 'thriller', 'scifi'], muscle: 0.6, logo: 'N' },
  { id: 'pinwheel', name: 'Pinwheel Animation', style: 'Family hits that run for months', genres: ['animation', 'adventure', 'musical'], muscle: 0.85, logo: 'P' },
  { id: 'brassband', name: 'Brass Band Films', style: 'Comedies, musicals and a good lunch', genres: ['comedy', 'musical', 'romance'], muscle: 0.6, logo: 'B' },
  { id: 'attic', name: 'The Attic Archive', style: 'Restored classics on flat rentals', genres: ['drama', 'thriller', 'horror', 'comedy', 'romance', 'adventure', 'musical', 'scifi'], muscle: 0.2, logo: 'A' },
];
export const studioById = (id: string) => STUDIOS.find((s) => s.id === id)!;

/** Genre taste by audience, -20..+20. */
export const GENRES: Record<Genre, { name: string; arts: string[]; legs: number; scares: number; laughs: number; tears: number; thrills: number; color: string }> = {
  action: { name: 'Action', arts: ['action1', 'action2'], legs: 0.78, scares: 0.1, laughs: 0.25, tears: 0, thrills: 0.9, color: '#c8452f' },
  comedy: { name: 'Comedy', arts: ['comedy1', 'comedy2'], legs: 0.86, scares: 0, laughs: 1, tears: 0.05, thrills: 0.1, color: '#e2a12f' },
  drama: { name: 'Drama', arts: ['drama1', 'drama2'], legs: 0.92, scares: 0, laughs: 0.1, tears: 0.7, thrills: 0.15, color: '#6f6a86' },
  horror: { name: 'Horror', arts: ['horror1', 'horror2'], legs: 0.66, scares: 1, laughs: 0.05, tears: 0, thrills: 0.5, color: '#3d5a4a' },
  scifi: { name: 'Science Fiction', arts: ['scifi1', 'scifi2'], legs: 0.8, scares: 0.2, laughs: 0.1, tears: 0.1, thrills: 0.8, color: '#2f7fa8' },
  romance: { name: 'Romance', arts: ['romance1', 'romance2'], legs: 0.88, scares: 0, laughs: 0.35, tears: 0.6, thrills: 0, color: '#b84a63' },
  animation: { name: 'Animation', arts: ['anim1', 'anim2'], legs: 0.93, scares: 0.05, laughs: 0.75, tears: 0.3, thrills: 0.35, color: '#3aa36a' },
  thriller: { name: 'Thriller', arts: ['thriller1', 'thriller2'], legs: 0.82, scares: 0.5, laughs: 0, tears: 0.1, thrills: 0.8, color: '#48566b' },
  fantasy: { name: 'Fantasy', arts: ['fantasy1', 'fantasy2'], legs: 0.82, scares: 0.15, laughs: 0.2, tears: 0.25, thrills: 0.75, color: '#7a5aa6' },
  documentary: { name: 'Documentary', arts: ['doc1', 'doc2'], legs: 0.95, scares: 0, laughs: 0.05, tears: 0.3, thrills: 0.1, color: '#2c7f86' },
  adventure: { name: 'Adventure', arts: ['western', 'action2', 'doc2'], legs: 0.84, scares: 0.1, laughs: 0.35, tears: 0.1, thrills: 0.8, color: '#b0712f' },
  musical: { name: 'Musical', arts: ['musical1', 'romance2'], legs: 0.9, scares: 0, laughs: 0.4, tears: 0.35, thrills: 0.2, color: '#a43a7c' },
};

export const CATALOG: [string, Genre, string][] = [
  ['Thunder Over Calico', 'action', 'One bridge. Two trucks. No brakes.'],
  ['The Brass Alibi', 'action', 'She kept the receipt for everything.'],
  ['Redline Saints', 'action', 'Heaven has a speed limit.'],
  ['Eleven Seconds of Rain', 'action', 'The storm was the easy part.'],
  ['Hard Left at Midnight', 'action', 'The city only turns one way.'],
  ['Cinder Squad', 'action', 'They put out fires. Then they started one.'],
  ['Vault of the Winter King', 'action', 'Everything is frozen except the clock.'],
  ['My Cousin the Diplomat', 'comedy', 'World peace, but first: brunch.'],
  ['Weekend at the Laundromat', 'comedy', 'Some stains bring people together.'],
  ['The Substitute Groom', 'comedy', 'He was only there to deliver the chairs.'],
  ['Two Forks, One Spoon', 'comedy', 'A dinner party in nine disasters.'],
  ['Uncle Octopus', 'comedy', 'Eight arms. Zero boundaries.'],
  ['Please Hold for Gary', 'comedy', 'The call centre that saved the moon.'],
  ['Grandma Goes Viral', 'comedy', 'Four million followers and one oven mitt.'],
  ['The Clockmaker’s Daughter', 'drama', 'Time was all he left her.'],
  ['Salt Marsh', 'drama', 'The tide keeps what it is given.'],
  ['A Quiet Year in Harrow', 'drama', 'Nothing happened, and it changed everything.'],
  ['The Last Ferry to Ansel', 'drama', 'Some goodbyes run on a timetable.'],
  ['Paper Lungs', 'drama', 'She wrote until she could breathe.'],
  ['Understudy', 'drama', 'Every night she watched someone else live her life.'],
  ['The Cellar Choir', 'horror', 'Do not join in.'],
  ['Thirteen Below', 'horror', 'The lift goes lower than the building.'],
  ['Mother Moth', 'horror', 'Leave the porch light off.'],
  ['What the Scarecrow Kept', 'horror', 'Harvest comes early this year.'],
  ['Nobody Rents Room 6', 'horror', 'Free breakfast. Late checkout.'],
  ['The Hush', 'horror', 'It only hears you once.'],
  ['Saturn Payroll', 'scifi', 'Employee of the month. For nine hundred years.'],
  ['The Orbit Thieves', 'scifi', 'They did not take the money. They took the moon.'],
  ['Halcyon Drift', 'scifi', 'Six crew. Seven shadows.'],
  ['Analog Heart', 'scifi', 'She was built to last. He was not.'],
  ['Colony of Glass', 'scifi', 'Do not raise your voice.'],
  ['Tomorrow, Again', 'scifi', 'He has until yesterday.'],
  ['Letters to Lisbon', 'romance', 'Wrong address. Right person.'],
  ['Third Time Lucky', 'romance', 'They kept missing each other on purpose.'],
  ['The Lighthouse Baker', 'romance', 'Love rises.'],
  ['Slow Dance, Fast Car', 'romance', 'He had the keys. She had the map.'],
  ['An Umbrella for Two', 'romance', 'Forecast: unlikely.'],
  ['Pip and the Paper Moon', 'animation', 'Fold once. Fly forever.'],
  ['Sir Waddles', 'animation', 'A very short knight’s very long quest.'],
  ['Balloon Town', 'animation', 'Hold on tight.'],
  ['The Noodle Dragon', 'animation', 'Legendary. Delicious.'],
  ['Gizmo & Grub', 'animation', 'One builds. One eats the blueprints.'],
  ['Snowplow Sam', 'animation', 'The smallest plow. The biggest winter.'],
  ['Twelve Clean Hands', 'thriller', 'Nobody touched the body. Everybody touched the money.'],
  ['The Night Auditor', 'thriller', 'The numbers know.'],
  ['A Window in Prague', 'thriller', 'She saw it happen. It had not happened yet.'],
  ['Quiet Carriage', 'thriller', 'No talking. No stopping. No witnesses.'],
  ['The Borrowed Man', 'thriller', 'Return in original condition.'],
  ['Crown of Thistles', 'fantasy', 'Every throne draws blood.'],
  ['The Cartographer’s War', 'fantasy', 'Draw the border. Cross the border.'],
  ['Emberling', 'fantasy', 'The last dragon is afraid of the dark.'],
  ['Seven Bells for Marrow', 'fantasy', 'Ring them all and the dead will listen.'],
  ['The Weight of Water', 'documentary', 'A river, from end to beginning.'],
  ['Ice Keepers', 'documentary', 'Four winters at the top of the world.'],
  ['Reel Life: The Projectionists', 'documentary', 'They kept the light on.'],
  ['Whale Road', 'documentary', 'Ten thousand miles by ear.'],
  ['Ghost Canyon Gold', 'adventure', 'The map was a warning.'],
  ['Captain Marigold', 'adventure', 'Wanted in nine ports. Welcome in one.'],
  ['The Compass Rose Club', 'adventure', 'Four kids, one raft, no permission.'],
  ['Lost Road to Petra', 'adventure', 'Some doors are mountains.'],
  ['Curtain Up!', 'musical', 'Five nobodies. One night. No rehearsal.'],
  ['The Understairs Orchestra', 'musical', 'The quietest music in the loudest house.'],
  ['Neon Sunday', 'musical', 'A city that can’t stop singing.'],
];
export const CLASSICS: [string, Genre, string, number][] = [
  ['Dust on the Marigold Trail', 'adventure', 'The 1956 widescreen classic, restored.', 104],
  ['The Violet Hour', 'romance', 'The 1948 tearjerker your grandmother quotes.', 98],
  ['It Crawled from Lake Orrin', 'horror', 'The 1954 creature feature. Rubber suit intact.', 82],
  ['Murder Wears a Carnation', 'thriller', 'The 1946 noir. Every line a knife.', 96],
  ['Three Hats for Henrietta', 'comedy', 'The 1938 screwball comedy.', 89],
  ['Rockets to Venus', 'scifi', 'The 1958 serial, cut into one glorious feature.', 91],
  ['Tap Shoes on Broadway', 'musical', 'The 1936 spectacular.', 101],
  ['The Stationmaster', 'drama', 'The 1951 festival winner.', 118],
];
const A = ['Crimson', 'Silent', 'Golden', 'Broken', 'Electric', 'Hollow', 'Velvet', 'Iron', 'Midnight', 'Paper', 'Burning', 'Second', 'Forgotten', 'Glass', 'Wild', 'Distant'];
const B: Record<Genre, string[]> = {
  action: ['Protocol', 'Vendetta', 'Cartel', 'Ransom', 'Exit', 'Convoy'], comedy: ['Honeymoon', 'Reunion', 'Roommates', 'Inheritance', 'Potluck'], drama: ['Orchard', 'Winter', 'Letter', 'Daughters', 'Harbour'],
  horror: ['Nursery', 'Lullaby', 'Basement', 'Harvest', 'Visitor'], scifi: ['Horizon', 'Signal', 'Orbit', 'Machine', 'Frontier'], romance: ['Promise', 'Summer', 'Waltz', 'Postcard', 'Proposal'],
  animation: ['Badger', 'Snow Cone', 'Umbrella Fox', 'Pancake', 'Toy Parade'], thriller: ['Witness', 'Alibi', 'Informant', 'Verdict', 'Passenger'], fantasy: ['Crown', 'Griffin', 'Oath', 'Kingdom', 'Sorcerer'],
  documentary: ['Ocean', 'Machine Age', 'Season', 'Migration'], adventure: ['Expedition', 'Island', 'Compass', 'Idol'], musical: ['Cabaret', 'Chorus', 'Serenade', 'Bandstand'],
};
const ROMAN = ['', '', 'II', 'III', 'IV', 'V'];

let seedTitles = 0;
export function makeFilm(rng: Rng, id: string, releaseDay: number, used: Set<string>, opts: { studio?: string; big?: boolean; previous?: Film | null } = {}): Film {
  const studio = opts.studio ? studioById(opts.studio) : rng.weighted(STUDIOS.filter((s) => s.id !== 'attic'), () => 1)!;
  let title = '', tagline = '', genre: Genre = rng.pick(studio.genres), sequel: number | undefined;
  const prev = opts.previous;
  if (prev && !prev.repertory) {
    sequel = (prev.sequel ?? 1) + 1; genre = prev.genre;
    title = `${prev.title.replace(/ (II|III|IV|V)$/, '')} ${ROMAN[Math.min(sequel, 5)]}`;
    tagline = rng.pick(['This time it’s complicated.', 'You thought it was over. So did they.', 'Bigger. Louder. Slightly longer.', 'Some endings don’t take.']);
  } else {
    const free = CATALOG.filter(([t, g]) => g === genre && !used.has(t));
    if (free.length) { const c = rng.pick(free); title = c[0]; tagline = c[2]; }
    else {
      for (let i = 0; i < 40; i++) { title = `${rng.chance(0.4) ? 'The ' : ''}${rng.pick(A)} ${rng.pick(B[genre])}`; if (!used.has(title)) break; }
      if (used.has(title)) title += ` ${++seedTitles + 1}`;
      tagline = rng.pick(['Based on a story too strange to check.', 'In cinemas only. For now.', 'From the people who brought you the last one.', 'See it before someone tells you about it.']);
    }
  }
  used.add(title);
  const budget = opts.big ? rng.range(0.75, 1) : clamp(rng.gauss(0.32 + studio.muscle * 0.3, 0.2), 0.05, 1);
  const quality = clamp(rng.gauss(56 + (studio.id === 'lantern' ? 8 : 0) - (sequel ? 5 : 0), 17), 12, 98);
  const star = clamp(rng.gauss(budget * 65 + 12, 16), 3, 99);
  const hype = clamp(budget * 46 + star * 0.3 + rng.gauss(0, 10) + (sequel ? 12 : 0), 5, 100);
  const cert: Certificate = genre === 'animation' ? rng.pick(['G', 'PG'] as const) : genre === 'horror' ? rng.pick(['PG-13', 'R', 'R'] as const) : genre === 'documentary' || genre === 'musical' ? rng.pick(['G', 'PG', 'PG-13'] as const) : rng.pick(['PG', 'PG-13', 'PG-13', 'R'] as const);
  const runtime = Math.round(clamp(rng.gauss(genre === 'animation' ? 94 : genre === 'horror' ? 97 : 108 + budget * 22, 9), 78, 172));
  const G = GENRES[genre];
  return {
    id, title, tagline, genre, cert, studio: studio.id, runtime, quality, star, budget, hype, legs: clamp(G.legs + (quality - 55) / 260, 0.5, 0.98), art: rng.pick(G.arts), palette: rng.int(0, 5), releaseDay,
    critic: null, wom: 0, weeks: 0, sequel, gross: 0,
  };
}
export function makeClassic(rng: Rng, id: string, day: number, used: Set<string>): Film | null {
  const free = CLASSICS.filter(([t]) => !used.has(t));
  if (!free.length) return null;
  const [title, genre, tagline, runtime] = rng.pick(free);
  used.add(title);
  return { id, title, tagline, genre, cert: 'PG', studio: 'attic', runtime, quality: rng.range(66, 92), star: 40, budget: 0.05, hype: rng.range(14, 30), legs: 0.985, art: rng.pick(GENRES[genre].arts), palette: rng.int(0, 5), releaseDay: day, critic: rng.int(70, 95), wom: 6, weeks: 0, repertory: true, gross: 0 };
}
