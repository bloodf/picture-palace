import { useEffect, useRef, useState, type JSX } from 'react';
import { act, session, ui, useGame, useUi } from './store';
import { $, Btn, Bulbs, Fader, Letters, Seg, Stars, Toggle } from './bits';
import { Receipt } from './panels/money';
import { WEEKDAYS, fmt } from '../sim/game';
import { dismissEvent } from '../sim/events';
import { fixProjector } from '../sim/screenings';
import { drawIcon, type IconName } from '../render/emotes';
import { audio } from '../audio/audio';
import { DIFFICULTY } from '../sim/state';
import { clamp } from '../sim/rng';
import { TIERS, type Tier } from '../render/quality';

const ART: Record<string, IconName> = { fire: 'fire', dark: 'alert', camera: 'camera', rowdy: 'people', laugh: 'laughing', child: 'sad', faint: 'sleepy', rat: 'disgusted', bat: 'scared', leak: 'drink', vomit: 'disgusted', ring: 'heart', graffiti: 'mop', projector: 'film', thief: 'money', inspector: 'clock', critic: 'star', phone: 'phone', star: 'star', school: 'people', letter: 'money', strike: 'annoyed', van: 'food', rival: 'film', heat: 'temp', news: 'film', heart: 'heart', ghost: 'scared', cake: 'heart', money: 'money', poster: 'film', storm: 'alert', cup: 'star', bulb: 'alert' };
function Art({ n }: { n: string }): JSX.Element { const r = useRef<HTMLCanvasElement>(null); useEffect(() => { const x = r.current!.getContext('2d')!; x.clearRect(0, 0, 220, 220); x.save(); x.translate(110, 112); x.scale(1.9, 1.9); drawIcon(x, ART[n] ?? 'alert'); x.restore(); }, [n]); return <canvas ref={r} width={220} height={220} className="eart" aria-hidden="true" />; }

export function EventModal(): JSX.Element | null {
  const g = useGame(), { outcome, phase } = useUi();
  if (phase !== 'play') return null;
  if (outcome) return <div className="veil"><article className="telegram" data-testid="outcome"><header><b>Wire service</b><em>{g.clock()}</em></header><h2>{outcome.title}</h2><p className="typed">{outcome.text}</p><div className="acts"><Btn kind="primary" testid="outcome-ok" onClick={() => { ui().set({ outcome: null }); session.syncPause(); session.bump(); }}>Carry on</Btn></div></article></div>;
  const e = g.s.events.find((x) => x.choices.length);
  if (!e) {
    const n = g.s.events.find((x) => !x.choices.length && g.s.minute - x.t < 25);
    if (!n) return null;
    return <aside className="flash" data-testid="event-flash"><Art n={n.art} /><div><h3>{n.title}</h3><p>{n.body}</p></div><button className="x" aria-label="Dismiss" onClick={() => { dismissEvent(g, n.id); session.bump(); }}>×</button></aside>;
  }
  return (
    <div className="veil"><article className="extra" data-testid="event-modal" role="dialog" aria-label={e.title}>
      <header><span>Lumen Bay</span><b>THE EVENING LEDGER</b><span>{WEEKDAYS[g.weekday]}</span></header>
      <div className="ebody"><Art n={e.art} /><div><h2>{e.title}</h2><p>{e.body}</p></div></div>
      <div className="choices">{e.choices.map((c, i) => <button key={i} className="choice" data-testid={`choice-${i}`} disabled={c.cost > g.s.cash} onClick={() => { const r = g.chooseEvent(e.id, i); audio.play(r.ok ? 'stamp' : 'bad', 0.7); if (r.ok) ui().set({ outcome: { title: e.title, text: r.msg } }); else session.toast(r.msg, true); session.syncPause(); session.bump(); }}><b>{c.label}</b>{c.hint && <em>{c.hint}</em>}</button>)}</div>
    </article></div>
  );
}
export function DayReport(): JSX.Element | null {
  const g = useGame(), s = g.s;
  if (ui().phase !== 'play' || s.phase !== 'report' || s.gameOver) return null;
  const r = s.reports[s.reports.length - 1]; if (!r) return null;
  const rev = s.reviews.filter((v) => v.day === r.day).slice(0, 3);
  return (
    <div className="veil dark"><article className="front" data-testid="day-report" role="dialog" aria-label="End of day">
      <header><span>{WEEKDAYS[r.weekday]}, day {r.day}</span><b>The Evening Ledger</b><span>Late edition</span></header>
      <h2>{r.headline}</h2>
      <div className="fcols"><div><p className="lead">{r.guests} guests passed under the marquee{r.best ? `, most of them for ${r.best}` : ''}. {r.turnedAway ? `${r.turnedAway} were turned away. ` : ''}{r.walkouts ? `${r.walkouts} walked out.` : 'Nobody walked out.'}</p><div className="stats"><div><b>{Math.round(r.sat)}</b><span>happiness</span></div><div><b>{r.rating}</b><span>rating</span></div><div><b>{r.stars.toFixed(1)}</b><Stars v={r.stars} s={12} /></div></div>{rev.map((v) => <blockquote key={v.id}><Stars v={v.stars} s={12} /><p>{v.text}</p><cite>{v.name}</cite></blockquote>)}</div><Receipt l={r.ledger} title={s.site.name.toUpperCase()} sub={`Day ${r.day}. Safe: ${fmt(s.cash)}`} /></div>
      <div className="acts"><Btn onClick={() => { session.save(session.slot); session.toast(`Saved to slot ${session.slot}.`); }}>Save</Btn><Btn onClick={() => ui().set({ panel: 'city' })} testid="report-city">City map</Btn><Btn kind="primary big" testid="next-day" onClick={() => { g.nextDay(); session.autosave(); act(undefined, 'doors'); session.syncPause(); }}>Open the next day</Btn></div>
    </article></div>
  );
}
export function GameOver(): JSX.Element | null { const g = useGame(); if (ui().phase !== 'play' || !g.s.gameOver) return null; return <div className="veil dark"><article className="extra"><header><span>Lumen Bay</span><b>THE EVENING LEDGER</b><span>Final edition</span></header><div className="ebody"><Art n="bulb" /><div><h2>The marquee goes dark</h2><p>{g.s.gameOver} You ran {g.s.site.name} for {g.s.day} days and sold {(g.s.stats.tickets ?? 0).toLocaleString('en-US')} tickets.</p></div></div><div className="choices"><button className="choice" onClick={() => session.toTitle()}><b>Back to the title</b></button></div></article></div>; }

/** Pull the picture into focus by eye. */
export function FocusGame(): JSX.Element | null {
  const { minigame } = useUi(); const g = useGame();
  const [v, setV] = useState(0.1); const dir = useRef(1), val = useRef(0.1), target = useRef(0.3 + Math.random() * 0.5), [done, setDone] = useState<number | null>(null), raf = useRef(0), key = useRef(0);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!minigame) return;
    setDone(null); val.current = 0.05; target.current = 0.25 + Math.random() * 0.6;
    let last = performance.now();
    const kd = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'a') key.current = -1; if (e.key === 'ArrowRight' || e.key === 'd') key.current = 1; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); lock(); } }, ku = () => { key.current = 0; };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const loop = (t: number) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (key.current) { val.current = clamp(val.current + key.current * dt * 0.32, 0, 1); setV(val.current); } draw(); raf.current = requestAnimationFrame(loop); };
    const draw = () => { const c = cv.current; if (!c) return; const x = c.getContext('2d')!, b = Math.abs(val.current - target.current) * 46; x.filter = `blur(${b.toFixed(1)}px)`; x.fillStyle = '#e9e2cf'; x.fillRect(-20, -20, 560, 300); x.strokeStyle = '#1a1416'; x.lineWidth = 3; x.strokeRect(12, 12, 496, 236); x.beginPath(); x.arc(260, 130, 96, 0, 7); x.moveTo(260, 12); x.lineTo(260, 248); x.moveTo(12, 130); x.lineTo(508, 130); x.stroke(); x.font = '120px "League Gothic"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1a1416'; x.fillText('8', 260, 136); for (let i = 0; i < 26; i++) x.fillRect(36 + i * 3 + i * i * 0.16, 40, 2, 44); x.font = '16px "Courier Prime"'; x.fillText('FOCUS  SOUND  FRAME', 260, 228); x.filter = 'none'; };
    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [minigame]);
  if (!minigame) return null;
  const lock = () => { const acc = clamp(1 - Math.abs(val.current - target.current) * 3.2, 0, 1); const aud = Number(minigame.ref.split(':')[1]); if (acc > 0.55) { fixProjector(g, aud); const a = g.site.auds[aud - 1]!; a.focus = Math.round(acc * 100); a.projCond = clamp(a.projCond + 20 * acc, 0, 100); g.dropJobs((j) => j.id === minigame.id); g.stat('jobs'); g.stat('playerJobs'); g.emit({ type: 'jobDone', kind: 'projector', x: minigame.x, z: minigame.z }); audio.play('done'); session.toast(acc > 0.9 ? 'Pin sharp. The house applauds.' : 'Sharp enough. On with the show.'); ui().set({ minigame: null }); session.syncPause(); session.bump(); } else { audio.play('bad'); setDone(acc); } };
  void dir;
  return <div className="veil"><article className="lens" data-testid="focus-game"><h2>{minigame.title}</h2><canvas ref={cv} width={520} height={260} /><input type="range" min={0} max={1000} value={Math.round(v * 1000)} aria-label="Focus ring" data-testid="focus-ring" data-target={target.current} onChange={(e) => { val.current = Number(e.target.value) / 1000; setV(val.current); }} /><p>{done !== null ? 'Still soft. Keep turning.' : 'Turn the ring until the chart is sharp, then lock it.'}</p><div className="acts"><Btn onClick={() => { ui().set({ minigame: null }); session.syncPause(); }}>Leave it</Btn><Btn kind="primary" testid="focus-lock" onClick={lock}>Lock focus</Btn></div></article></div>;
}

export function SlotList({ mode }: { mode: 'load' | 'save' }): JSX.Element {
  useUi((s) => s.v);
  return <ul className="slots">{(mode === 'load' ? (['auto', 1, 2, 3] as const) : ([1, 2, 3] as const)).map((k) => { const m = session.meta(k); return <li key={k}><button data-testid={`slot-${k}`} disabled={mode === 'load' && !m} onClick={() => { if (mode === 'load') session.load(k); else { session.slot = k as number; if (session.save(k)) { session.toast(`Saved to reel ${k}.`); audio.play('stamp'); session.bump(); } } }}><span className="reel">{k === 'auto' ? 'A' : k}</span>{m ? <span><b>{m.name}</b><em>Day {m.day}, chapter {m.chapter}, {$(Math.round(m.cash))}, rating {m.rating}</em></span> : <span><b>Empty reel</b></span>}</button></li>; })}</ul>;
}
export function Settings(): JSX.Element {
  useUi((s) => s.v); const e = session.engine;
  const [q, setQ] = useState<string>(localStorage.getItem('pp.quality') ?? 'auto');
  return <div className="settings"><h4>Picture</h4><Seg v={q} testid="quality" on={(v) => { setQ(v); localStorage.setItem('pp.quality', v); }} opts={[{ v: 'auto', t: 'Auto' }, ...(Object.keys(TIERS) as Tier[]).map((t) => ({ v: t as string, t: t[0]!.toUpperCase() + t.slice(1) }))]} /><p className="mini">Running {e?.q.tier} at {Math.round(e?.fps ?? 0)} frames a second on {e?.gpu.replace(/ANGLE \(|\)$/g, '').slice(0, 70)}. A change takes effect after a reload.</p><h4>Sound</h4><Fader label="Everything" v={Math.round(audio.vol.master * 100)} on={(n) => { audio.vol.master = n / 100; audio.apply(); }} /><Fader label="Lobby music" v={Math.round(audio.vol.music * 100)} on={(n) => { audio.vol.music = n / 100; }} /><Fader label="Effects" v={Math.round(audio.vol.sfx * 100)} on={(n) => { audio.vol.sfx = n / 100; audio.apply(); }} /><h4>Interface</h4><Toggle v={ui().moods} on={(b) => ui().set({ moods: b })}>Faces over guests</Toggle><Toggle v={ui().wireOpen} on={(b) => ui().set({ wireOpen: b })}>News slips</Toggle></div>;
}
export function Help(): JSX.Element {
  return <div className="helpd"><dl><dt>Overview</dt><dd>Drag to pan, right-drag to turn, wheel to zoom. Click anyone or anything to inspect it.</dd><dt>Walk the floor</dt><dd><kbd>Tab</kbd> to step in and out. <kbd>W A S D</kbd> to walk, <kbd>Shift</kbd> to run, drag to look (right-click to capture the mouse), <kbd>V</kbd> for first person.</dd><dt>Work</dt><dd>Stand near a job, mess, guest or till and press or hold <kbd>E</kbd>.</dd><dt>Time</dt><dd><kbd>Space</kbd> pauses. <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> set the speed.</dd><dt>Build</dt><dd><kbd>B</kbd> opens the catalogue. <kbd>R</kbd> turns, <kbd>Shift</kbd>-click places several, <kbd>Esc</kbd> finishes.</dd></dl><p>Money comes from tickets and, mostly, from snacks. Guests come for films, stay for comfort and tell people about the restrooms.</p></div>;
}
export function PauseMenu(): JSX.Element | null {
  const { menu, phase } = useUi();
  if (phase !== 'play' || !menu) return null;
  const close = () => { ui().set({ menu: null }); session.syncPause(); };
  return <div className="veil" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><article className="pausem" data-testid="pause-menu"><div className="pmq"><Bulbs n={30} /><Letters t={menu === 'pause' ? 'INTERMISSION' : menu === 'load' ? 'REELS' : menu === 'settings' ? 'SETTINGS' : 'HOW TO PLAY'} size={44} /><Bulbs n={30} /></div>
    {menu === 'pause' && <div className="pbtns"><Btn kind="primary" testid="resume" onClick={close}>Back to work</Btn><h4>Save</h4><SlotList mode="save" /><Btn testid="open-load" onClick={() => ui().set({ menu: 'load' })}>Load another reel</Btn><Btn onClick={() => ui().set({ menu: 'settings' })}>Settings</Btn><Btn onClick={() => ui().set({ menu: 'help' })}>How to play</Btn><Btn kind="danger" testid="quit" onClick={() => { session.autosave(); session.toTitle(); }}>Save and quit to title</Btn></div>}
    {menu === 'load' && <SlotList mode="load" />}{menu === 'settings' && <Settings />}{menu === 'help' && <Help />}
    {menu !== 'pause' && <div className="acts"><Btn onClick={() => ui().set({ menu: 'pause' })}>Back</Btn></div>}</article></div>;
}
export { DIFFICULTY };
