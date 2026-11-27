import type { JSX } from 'react';
import { session, ui, useGame, useUi } from './store';
import { Btn } from './bits';

const STEPS: { t: string; b: string; at: string }[] = [
  { t: 'These are your keys', b: 'The old owner left you one screen, a 35mm projector with opinions and a popcorn kettle. Drag to look around. Right-drag turns, the wheel zooms.', at: 'centre' },
  { t: 'Book a film', b: 'Open Films. Haggle over the fee and the studio’s share, then sign. A second title fills the quiet hours.', at: 'dock-films' },
  { t: 'Fill the board', b: 'Programme is your showtimes. Drag titles around, or let the house manager fill it.', at: 'dock-programme' },
  { t: 'Feed people', b: 'Snacks pay the rent. Food is where you buy machines, set prices and choose how salty the popcorn is.', at: 'dock-concessions' },
  { t: 'Hire a technician', b: 'Seats, toilets and projectors break. Staff is where you find someone who can mend them.', at: 'dock-staff' },
  { t: 'Walk the floor', b: 'Press Tab to step inside as the manager. Hold E to sweep, mend, serve or greet. Press Tab again to come back up.', at: 'mode' },
  { t: 'Open the doors', b: 'Doors open at 10 AM. Click any guest to read their mind. Good luck.', at: 'transport' },
];
export function Coach(): JSX.Element | null {
  const { coach, phase, menu } = useUi(); useGame();
  if (phase !== 'play' || coach < 0 || coach >= STEPS.length || menu) return null;
  const s = STEPS[coach]!;
  return <aside className={`coach at-${s.at}`} data-testid="coach"><em>{coach + 1} of {STEPS.length}</em><h3>{s.t}</h3><p>{s.b}</p><div className="acts"><button className="link" data-testid="coach-skip" onClick={() => { ui().set({ coach: -1 }); session.bump(); }}>Skip the tour</button><Btn kind="primary small" testid="coach-next" onClick={() => ui().set({ coach: coach + 1 >= STEPS.length ? -1 : coach + 1 })}>{coach + 1 === STEPS.length ? 'To work' : 'Next'}</Btn></div></aside>;
}
