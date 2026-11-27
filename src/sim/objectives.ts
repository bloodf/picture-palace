import { clamp } from './rng';
import type { Game } from './game';

export interface Objective { id: string; chapter: number; title: string; how: string; reward: number; goal: number; value: (g: Game) => number }
export const CHAPTERS = [
  { n: 1, name: 'One Projector', blurb: 'One screen, one popcorn machine. Prove the old place still breathes.' },
  { n: 2, name: 'Double Feature', blurb: 'A second screen, a real menu, a crew with names.' },
  { n: 3, name: 'The Multiplex', blurb: 'Four screens, a food hall, and a reputation to protect.' },
  { n: 4, name: 'The Palace', blurb: 'The best house in town, and the bank’s attention.' },
  { n: 5, name: 'The Chain', blurb: 'Your name on marquees across the city.' },
];
const built = (g: Game) => g.site.auds.filter((a) => a.built).length;
const stat = (k: string) => (g: Game) => g.s.stats[k] ?? 0;
export const OBJECTIVES: Objective[] = [
  { id: 'firstNight', chapter: 1, title: 'Sell 40 tickets', how: 'Keep the box office staffed and the programme full.', reward: 600, goal: 40, value: stat('tickets') },
  { id: 'book', chapter: 1, title: 'Sign a film', how: 'Open the Film Exchange, haggle, sign.', reward: 500, goal: 1, value: stat('contracts') },
  { id: 'snacks', chapter: 1, title: 'Put three products on the menu', how: 'Buy machines in the Concessions panel.', reward: 700, goal: 3, value: (g) => Object.keys(g.site.products).filter((p) => { const e = ({ popcorn: 'popcorn', soda: 'soda', candy: 'candy', hotdog: 'hotdog', nachos: 'nachos', pretzel: 'pretzel', slush: 'slush', icecream: 'icecream', coffee: 'coffee' } as Record<string, string>)[p]; return e && g.site.equipment[e]!.owned; }).length },
  { id: 'seats', chapter: 1, title: 'Repair 8 broken seats', how: 'Hire a technician, or fix them yourself in walk mode.', reward: 800, goal: 8, value: stat('seatsFixed') },
  { id: 'rate1', chapter: 1, title: 'Reach a Palace Rating of 520', how: 'Clean, comfortable, fairly priced.', reward: 2500, goal: 520, value: (g) => g.s.rating.total },
  { id: 'screen2', chapter: 2, title: 'Open Screen 2', how: 'Build ▸ Wings.', reward: 2500, goal: 2, value: built },
  { id: 'crew', chapter: 2, title: 'Employ 7 people', how: 'Hire from the Staff panel.', reward: 1200, goal: 7, value: (g) => g.site.staff.length },
  { id: 'g500', chapter: 2, title: 'Welcome 700 guests', how: 'Total admissions.', reward: 2500, goal: 700, value: stat('guests') },
  { id: 'digital', chapter: 2, title: 'Install a digital projector', how: 'Screens panel ▸ Projector.', reward: 2000, goal: 1, value: (g) => Math.max(...g.site.auds.filter((a) => a.built).map((a) => a.projTier)) },
  { id: 'decor', chapter: 2, title: 'Restore the lobby', how: 'Build ▸ Restoration.', reward: 2000, goal: 1, value: (g) => g.site.decor.lobby },
  { id: 'rate2', chapter: 2, title: 'Reach a Palace Rating of 600', how: 'Better seats, cleaner floors, more on the menu.', reward: 4000, goal: 600, value: (g) => g.s.rating.total },
  { id: 'screen4', chapter: 3, title: 'Run four screens', how: 'Build ▸ Wings.', reward: 8000, goal: 4, value: built },
  { id: 'hall', chapter: 3, title: 'Open the Food Hall', how: 'Build ▸ Wings.', reward: 4000, goal: 1, value: (g) => (g.unlocked.has('foodcourt') ? 1 : 0) },
  { id: 'rev', chapter: 3, title: 'Take $6,000 in a single day', how: 'Gross revenue, one day.', reward: 5000, goal: 6000, value: (g) => Math.max(g.site.dayRev, ...g.site.history.map((h) => h.rev), 0) },
  { id: 'rep', chapter: 3, title: 'Reach 60 reputation', how: 'Send people home happy.', reward: 6000, goal: 60, value: (g) => g.site.reputation },
  { id: 'rate3', chapter: 3, title: 'Reach a Palace Rating of 690', how: 'Digital everywhere, recliners somewhere, no sticky corners.', reward: 8000, goal: 690, value: (g) => g.s.rating.total },
  { id: 'giant', chapter: 4, title: 'Open The Giant', how: 'Build ▸ Wings.', reward: 20000, goal: 1, value: (g) => (g.unlocked.has('aud6') ? 1 : 0) },
  { id: 'second', chapter: 4, title: 'Buy a second house', how: 'The Chain map.', reward: 25000, goal: 2, value: (g) => 1 + g.s.others.length },
  { id: 'laser', chapter: 4, title: 'Three laser projectors', how: 'Screens panel.', reward: 12000, goal: 3, value: (g) => g.site.auds.filter((a) => a.built && a.projTier === 2).length },
  { id: 'rate4', chapter: 4, title: 'Reach a Palace Rating of 780', how: 'Laser pictures, a restored promenade, happy staff.', reward: 20000, goal: 780, value: (g) => g.s.rating.total },
  { id: 'four', chapter: 5, title: 'Own four houses', how: 'The Chain map.', reward: 60000, goal: 4, value: (g) => 1 + g.s.others.length },
  { id: 'all', chapter: 5, title: 'Own the whole skyline', how: 'All eight houses.', reward: 250000, goal: 8, value: (g) => 1 + g.s.others.length },
  { id: 'legend', chapter: 5, title: 'Reach a Palace Rating of 860', how: 'The best house anyone can remember.', reward: 100000, goal: 860, value: (g) => g.s.rating.total },
];
export const currentObjectives = (g: Game) => OBJECTIVES.filter((o) => o.chapter === g.s.chapter);
export function checkObjectives(g: Game): void {
  for (const o of OBJECTIVES) {
    if (o.chapter !== g.s.chapter || g.s.done.includes(o.id)) continue;
    if (o.value(g) >= o.goal) {
      g.s.done.push(o.id);
      g.money('events', o.reward);
      g.news('good', `Objective complete: ${o.title}. Bonus ${'$' + o.reward.toLocaleString('en-US')}.`);
      g.emit({ type: 'objective', title: o.title, reward: o.reward });
    }
  }
  const need = OBJECTIVES.filter((o) => o.chapter === g.s.chapter);
  const done = need.filter((o) => g.s.done.includes(o.id)).length;
  const required = g.s.chapter === 5 ? need.length : need.length - 1;
  if (done >= required && g.s.chapter < 5) {
    g.s.chapter++;
    g.s.creditLimit = [0, 25000, 60000, 140000, 320000, 900000][g.s.chapter]!;
    g.news('good', `Chapter ${g.s.chapter}: ${CHAPTERS[g.s.chapter - 1]!.name}.`);
    g.emit({ type: 'sound', id: 'fanfare' });
  } else if (g.s.chapter === 5 && done >= need.length && !g.s.flags.won) { g.s.flags.won = 1; g.news('good', 'Every marquee in the city carries your name. You built a chain.'); g.emit({ type: 'sound', id: 'fanfare' }); }
}
export const progress = (g: Game, o: Objective) => clamp(o.value(g) / o.goal, 0, 1);
