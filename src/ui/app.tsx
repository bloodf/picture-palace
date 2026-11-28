import { useEffect, useRef, type JSX } from 'react';
import { Engine } from '../render/engine';
import { session, ui, useUi } from './store';
import { BuildBar, CallSheet, Dock, Incidents, Inspector, MobileControls, PromptBar, Toasts, TopBar, Wire, openPanel, setSpeed, toggleMode } from './hud';
import { DayReport, EventModal, FocusGame, GameOver, PauseMenu } from './modals';
import { Loading, Title } from './title';
import { Coach } from './coach';
import { FilmsPanel } from './panels/films';
import { ProgrammePanel } from './panels/programme';
import { BoxOfficePanel, CityPanel, ConcessionsPanel, LedgerPanel, PromotePanel } from './panels/money';
import { BuildPanel, DeskPanel, GuestsPanel, ScreensPanel, StaffPanel, UpkeepPanel } from './panels/house';
import { audio } from '../audio/audio';
import { roomAt } from '../sim/plan';

const PANELS: Record<string, () => JSX.Element> = { films: FilmsPanel, programme: ProgrammePanel, boxoffice: BoxOfficePanel, concessions: ConcessionsPanel, staff: StaffPanel, upkeep: UpkeepPanel, screens: ScreensPanel, guests: GuestsPanel, build: BuildPanel, desk: DeskPanel, promote: PromotePanel, ledger: LedgerPanel, city: CityPanel };
const FKEYS: Record<string, keyof typeof PANELS> = { f1: 'films', f2: 'programme', f3: 'boxoffice', f4: 'concessions', f6: 'staff', f7: 'upkeep', f8: 'screens', f9: 'guests', b: 'build' };

function onKey(k: string): boolean {
  const u = ui(), e = session.engine;
  if (u.phase !== 'play') return true;
  if (u.minigame || session.game.s.events.some((x) => x.choices.length) || u.outcome) return true;
  if (k === 'escape') { if (e?.build) e.cancelBuild(); else if (u.menu) { u.set({ menu: null }); } else if (u.panel) u.set({ panel: null }); else if (u.sel) { u.set({ sel: null }); if (e) e.selection = null; } else u.set({ menu: 'pause' }); session.syncPause(); return true; }
  if (u.menu || session.game.s.phase === 'report') return true;
  if (k === 'tab') { toggleMode(); return true; }
  if (k === ' ') { setSpeed(0); return true; }
  if (k === '1' || k === '2' || k === '3') { setSpeed([1, 2, 4][Number(k) - 1]!); return true; }
  if (FKEYS[k]) { openPanel(FKEYS[k] as 'films'); return true; }
  return false;
}
export function App(): JSX.Element {
  const cv = useRef<HTMLCanvasElement>(null);
  const { phase, panel, mode, moods, overlay } = useUi();
  useEffect(() => {
    let e: Engine;
    try { e = new Engine(cv.current!, () => session.game); } catch (x) { ui().set({ error: `This browser could not start WebGL 2. ${(x as Error).message}` }); return; }
    session.engine = e;
    e.cb = {
      select: (s) => { ui().set({ sel: s, panel: null }); if (s) audio.play('click', 0.5); },
      prompt: (p) => ui().set({ prompt: p }), mode: (m) => ui().set({ mode: m as 'walk' }),
      place: (r) => { if (r.msg) session.toast(r.msg, !r.ok); if (!e.build) ui().set({ building: null }); session.bump(); },
      minigame: (j) => { document.exitPointerLock?.(); ui().set({ minigame: j }); session.syncPause(); }, toast: (t, b) => session.toast(t, b), key: onKey,
      sound: (id, x, z) => { let gain = 1; if (x !== undefined && z !== undefined) { const l = e.rig.mode === 'walk' ? e.player : { x: e.rig.target.x, z: e.rig.target.z }; gain = Math.max(0, 1 - Math.hypot(l.x - x, l.z - z) / 30) * (e.rig.mode === 'walk' ? 1 : 0.45); } audio.play(id, gain); },
      frame: () => { session.syncPause(); if (e.paused && document.pointerLockElement) document.exitPointerLock(); },
    };
    let alive = true;
    e.init((f, what) => { if (alive) ui().set({ progress: f, loadWhat: what }); }).then(() => { if (!alive) return; e.enterMenu(); e.start(); ui().set({ phase: 'title' }); }).catch((x: Error) => ui().set({ error: x.message }));
    const iv = setInterval(() => {
      if (ui().phase !== 'play') return;
      session.bump(); e.showMoods = ui().moods; e.world.overlay = ui().overlay;
      const g = session.game, walk = e.rig.mode === 'walk', here = walk ? roomAt(e.player.x, e.player.z) : null, inAud = here?.kind === 'auditorium', near = walk ? g.s.guests.filter((m) => Math.hypot(m.x - e.player.x, m.z - e.player.z) < 14 && m.state !== 'seated').length : Math.min(60, g.s.guests.length * 0.5);
      const film = inAud && g.s.screenings.some((s) => s.aud === here!.aud && s.state === 'playing') ? 1 : 0;
      audio.mood({ crowd: near, film: film ? 0.5 : walk ? 0 : 0.06, style: g.site.amb.music, volume: g.site.amb.volume, inAud, rain: g.s.weather === 'rain' || g.s.weather === 'storm', power: g.site.power, outside: here?.kind === 'street' });
    }, 250);
    const unlock = () => audio.start(); addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true });
    const hide = () => { if (ui().phase === 'play' && session.game.s.phase !== 'report') session.autosave(); }; addEventListener('pagehide', hide);
    (window as unknown as Record<string, unknown>).__pp = { session, ui, engine: e, get game() { return session.game; } };
    return () => { alive = false; clearInterval(iv); e.stop(); removeEventListener('pagehide', hide); };
  }, []);
  const P = panel ? PANELS[panel] : null;
  void moods; void overlay;
  return (
    <div className={`app ${phase} ${mode} ${session.game.s.phase === 'report' ? 'reporting' : ''}`}>
      <canvas ref={cv} className="stage" data-testid="stage" />
      {phase === 'loading' && <Loading />}
      {phase === 'title' && <Title />}
      {phase === 'play' && <><TopBar /><CallSheet /><Wire /><Incidents /><PromptBar /><Inspector />{P && <P />}<BuildBar /><Dock /><MobileControls /><Coach /><EventModal /><DayReport /><GameOver /><FocusGame /><PauseMenu /></>}
      <Toasts />
    </div>
  );
}
