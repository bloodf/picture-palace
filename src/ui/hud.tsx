import { useEffect, useRef, useState, type JSX } from 'react';
import { act, session, ui, useGame, useUi, type PanelId } from './store';
import { $, Btn, Bulbs, Emo, Letters, Meter, Stars, moodName } from './bits';
import { Icon } from './icons';
import { DAY_OPEN, WEEKDAYS, fmt } from '../sim/game';
import { CHAPTERS, currentObjectives, progress } from '../sim/objectives';
import { ROLES, TEMPERS, archById, itemById } from '../sim/data/catalog';
import { WINGS, audById } from '../sim/plan';
import { filmExperience, itemSeat } from '../sim/guests';
import { audio } from '../audio/audio';
import { portrait } from './thumbs';

export const DOCK: [PanelId, string, string][] = [['films', 'Films', 'F1'], ['programme', 'Programme', 'F2'], ['boxoffice', 'Tickets', 'F3'], ['concessions', 'Food', 'F4'], ['staff', 'Staff', 'F6'], ['upkeep', 'Upkeep', 'F7'], ['screens', 'Screens', 'F8'], ['guests', 'Guests', 'F9'], ['build', 'Build', 'B'], ['desk', 'House', ''], ['promote', 'Promote', ''], ['ledger', 'Ledger', ''], ['city', 'City', '']];

export function setSpeed(n: number): void { if (n === 0) ui().set({ paused: !ui().paused }); else { session.game.s.speed = n; ui().set({ paused: false }); } session.syncPause(); audio.play('click', 0.6); session.bump(); }
export function toggleMode(): void { const e = session.engine; if (!e) return; const m = ui().mode === 'walk' ? 'manager' : 'walk'; ui().set({ panel: null, sel: null, building: null }); e.setMode(m); ui().set({ mode: m }); audio.play('open'); }

export function TopBar(): JSX.Element {
  const g = useGame(), s = g.s, { paused, mode } = useUi();
  const playing = s.screenings.filter((x) => x.state === 'playing' || x.state === 'trailers').length;
  return (
    <header className="top">
      <div className="mq" data-testid="hud">
        <Bulbs n={46} />
        <div className="mqin">
          <div className="cell money"><Letters t={fmt(s.cash)} red={s.cash < 0} size={33} /><em data-testid="cash" data-v={Math.round(s.cash)}>In the safe</em></div>
          <div className="cell name"><Letters t={s.site.name.toUpperCase()} size={33} /><em>{playing ? `${playing} film${playing > 1 ? 's' : ''} running, ${s.guests.length} guests inside` : s.phase === 'prep' ? `Doors open in ${Math.max(0, Math.ceil(DAY_OPEN - s.minute))} min` : `${s.guests.length} guests inside`}</em></div>
          <div className="cell time"><Letters t={g.clock()} red size={33} /><em data-testid="day"><Icon n={s.weather} s={14} /> {WEEKDAYS[g.weekday]}, day {s.day}</em></div>
        </div>
        <Bulbs n={46} />
      </div>
      <div className="stubs">
        <button className="ticket rating" onClick={() => openPanel('guests')} data-testid="rating" title="Palace rating"><b>{s.rating.total}</b><span><Stars v={s.rating.stars} s={13} /><em>Palace rating</em></span></button>
        <button className="ticket moodt" onClick={() => openPanel('guests')} title="Average mood" data-testid="mood"><Emo n={moodName(g.avgHappy())} s={34} /><span><b>{Math.round(g.avgHappy())}</b><em>Mood</em></span></button>
      </div>
      <div className="transport" role="group" aria-label="Time">
        <button className={paused ? 'on' : ''} onClick={() => setSpeed(0)} data-testid="pause" aria-label="Pause"><Icon n={paused ? 'play' : 'pause'} s={20} /></button>
        {[1, 2, 4].map((n, i) => <button key={n} className={!paused && s.speed === n ? 'on' : ''} data-testid={`speed-${n}`} onClick={() => setSpeed(n)} aria-label={`Speed ${n}`}><Icon n={['play', 'fast', 'faster'][i]!} s={20} /></button>)}
        {s.phase === 'prep' && <button className="skip" data-testid="open-doors" onClick={() => { s.minute = Math.max(s.minute, DAY_OPEN - 1); act(undefined, 'doors'); }}>Open doors</button>}
        <i /><button className={mode === 'walk' ? 'on wide' : 'wide'} onClick={toggleMode} data-testid="mode" title="Walk the floor (Tab)"><Icon n={mode === 'walk' ? 'eye' : 'walk'} s={20} /><span>{mode === 'walk' ? 'Overview' : 'Walk'}</span></button>
        <button onClick={() => { ui().set({ menu: 'pause' }); session.syncPause(); audio.play('open'); }} data-testid="menu" aria-label="Menu"><Icon n="menu" s={20} /></button>
      </div>
    </header>
  );
}
export function openPanel(p: PanelId): void { const u = ui(); if (u.mode === 'walk') document.exitPointerLock?.(); session.engine?.cancelBuild(); u.set({ panel: u.panel === p ? null : p, sel: null }); audio.play('open'); }
export function Dock(): JSX.Element {
  const g = useGame(), { panel } = useUi();
  const alert: Partial<Record<PanelId, number>> = { upkeep: g.s.site.jobs.filter((j) => j.severity >= 3).length, programme: g.site.auds.filter((a) => a.built && !a.program.length).length, films: g.s.contracts.filter((c) => c.endDay >= g.s.day).length ? 0 : 1, staff: g.site.staff.filter((x) => x.morale < 25).length };
  return <nav className="dock" aria-label="Departments">{DOCK.map(([id, t, k]) => <button key={id} className={panel === id ? 'on' : ''} data-testid={`dock-${id}`} title={k ? `${t} (${k})` : t} onClick={() => openPanel(id)}><Icon n={id} s={25} /><span>{t}</span>{!!alert[id] && <b className="badge">{alert[id]}</b>}</button>)}</nav>;
}

export function MobileControls(): JSX.Element | null {
  const { mode, panel, menu, minigame } = useUi();
  const held = useRef(new Map<number, readonly [number, number]>());
  const update = () => {
    let forward = 0, right = 0;
    for (const [f, r] of held.current.values()) { forward += f; right += r; }
    session.engine?.walkInput(forward, right);
  };
  useEffect(() => {
    const reset = () => { held.current.clear(); session.engine?.walkInput(0, 0); session.engine?.pressUse(false); };
    addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    reset();
    return () => { reset(); removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset); };
  }, [mode, panel, menu, minigame]);
  if (panel || menu || minigame) return null;
  if (mode === 'manager') return <div className="mobile-camera" role="group" aria-label="Camera zoom"><button aria-label="Zoom in" onClick={() => session.engine?.rig.zoom(.8)}>+</button><button aria-label="Zoom out" onClick={() => session.engine?.rig.zoom(1.25)}>−</button></div>;
  const directions: readonly [string, string, number, number][] = [['forward', '↑', 1, 0], ['left', '←', 0, -1], ['backward', '↓', -1, 0], ['right', '→', 0, 1]];
  return <div className="mobile-walk" role="group" aria-label="Walking controls">
    <div className="mobile-dpad">{directions.map(([label, icon, f, r]) => <button key={label} className={label} aria-label={`Move ${label}`} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held.current.set(e.pointerId, [f, r]); update(); }} onPointerUp={(e) => { held.current.delete(e.pointerId); update(); }} onPointerCancel={(e) => { held.current.delete(e.pointerId); update(); }} onLostPointerCapture={(e) => { held.current.delete(e.pointerId); update(); }}>{icon}</button>)}</div>
    <button className="mobile-use" aria-label="Interact or hold to work" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); session.engine?.pressUse(true); }} onPointerUp={() => session.engine?.pressUse(false)} onPointerCancel={() => session.engine?.pressUse(false)} onLostPointerCapture={() => session.engine?.pressUse(false)}>Use</button>
  </div>;
}
export function CallSheet(): JSX.Element | null {
  const g = useGame(), { objectivesOpen } = useUi(), ch = CHAPTERS[g.s.chapter - 1]!, list = currentObjectives(g);
  return (
    <aside className={`callsheet ${objectivesOpen ? '' : 'shut'}`} data-testid="objectives">
      <button className="cshead" onClick={() => ui().set({ objectivesOpen: !objectivesOpen })}><em>Chapter {ch.n}</em><b>{ch.name}</b></button>
      {objectivesOpen && <ul>{list.map((o) => { const done = g.s.done.includes(o.id), p = progress(g, o); return <li key={o.id} className={done ? 'done' : ''} title={o.how}><i>{done && <Icon n="check" s={13} />}</i><span>{o.title}{!done && o.goal > 1 && <em>{Math.floor(Math.min(o.value(g), o.goal)).toLocaleString('en-US')} of {o.goal.toLocaleString('en-US')}</em>}{!done && <u style={{ width: `${p * 100}%` }} />}</span></li>; })}</ul>}
    </aside>
  );
}
export function Wire(): JSX.Element | null {
  const g = useGame(), { wireOpen } = useUi();
  const abs = g.s.day * 1440 + g.s.minute, list = g.s.news.filter((n) => abs - (n.day * 1440 + n.t) < 60).slice(0, 4);
  if (!list.length || !wireOpen) return null;
  return <aside className="wire" aria-live="polite" data-testid="wire">{list.map((n) => <button key={n.id} className={`slip ${n.kind}`} onClick={() => { if (n.x !== undefined && n.z !== undefined) session.engine?.jump(n.x, n.z, 11); }}><em>{g.clock(n.t)}</em>{n.text}</button>)}</aside>;
}
export function Incidents(): JSX.Element | null {
  const g = useGame(), ev = g.s.events.filter((e) => !e.choices.length).slice(-2), jobs = g.s.site.jobs.filter((j) => j.ttl !== undefined || j.severity >= 4 || (j.kind === 'projector' && j.severity >= 3)).slice(0, 3);
  if (!ev.length && !jobs.length) return null;
  return <div className="incidents">{jobs.map((j) => <button key={j.id} className="incident" data-testid="incident" onClick={() => session.engine?.jump(j.x, j.z, 10)}><Emo n={j.kind === 'fire' ? 'fire' : 'alert'} s={32} /><span><b>{j.title}</b><em>{j.player ? 'You are on it' : j.assignee ? 'Someone is on the way' : 'Nobody on it'}{j.ttl !== undefined ? `, ${j.ttl} min left` : ''}</em></span></button>)}</div>;
}
export function PromptBar(): JSX.Element | null {
  const { prompt, mode, panel } = useUi();
  if (mode !== 'walk' || panel) return null;
  return <div className="walkhud"><i className="cross" />{prompt && <div className="prompt" data-testid="prompt"><kbd>E</kbd><span>{prompt.kind === 'job' || prompt.kind === 'sweep' ? 'Hold: ' : ''}{prompt.text}</span>{prompt.progress > 0 && <u style={{ width: `${prompt.progress * 100}%` }} />}</div>}<p className="keys"><kbd>WASD</kbd> walk <kbd>Shift</kbd> run <kbd>Drag</kbd> look <kbd>V</kbd> first person <kbd>Tab</kbd> overview</p></div>;
}
export function BuildBar(): JSX.Element | null {
  const { building } = useUi(); const b = session.engine?.build; useGame();
  if (!building || !b) return null;
  return <div className="buildbar" data-testid="buildbar"><b>{building}</b><span className={b.ok ? 'pos' : 'neg'}>{b.msg || (b.move ? 'Pick a new spot' : `${$(itemById(b.type).cost)}, click to place`)}</span><Btn kind="small" onClick={() => { b.rot = ((b.rot + 1) % 4) as 0; }}>Turn (R)</Btn><Btn kind="small" onClick={() => session.engine?.cancelBuild()} testid="cancel-build">Done (Esc)</Btn></div>;
}
export function Toasts(): JSX.Element { const { toasts, celebrate } = useUi(); return <><div className="toasts" aria-live="assertive">{toasts.map((t) => <p key={t.id} className={t.bad ? 'bad' : ''} data-testid="toast">{t.text}</p>)}</div>{celebrate && <div className="celebrate"><Letters t="BRAVO" red size={54} /><b>{celebrate.title}</b><span>+{fmt(celebrate.reward)}</span></div>}</>; }

// ------------------------------------------------------------------ inspector
export function Inspector(): JSX.Element | null {
  const g = useGame(), { sel } = useUi();
  if (!sel) return null;
  if (sel.kind === 'guest') return <GuestCard id={sel.id as number} />;
  if (sel.kind === 'staff') {
    const x = g.site.staff.find((q) => q.id === sel.id); if (!x) return null;
    return <Card title={x.name} sub={ROLES[x.role].name} img={portrait(x.model, { top: ROLES[x.role].tint, hair: 0x2c1c14, skin: 0xe8bc98 })}><Meter label="Morale" v={x.morale} /><Meter label="Energy" v={x.energy} good={45} bad={20} /><Meter label="Skill" v={x.skill} /><p className="mini">{x.job ? g.site.jobs.find((j) => j.id === x.job)?.title : x.station ? 'At a station' : x.state === 'break' ? 'On a break' : 'Between jobs'}. {$(x.wage)} a night.</p><div className="acts"><Btn kind="small" onClick={() => act(g.praise(x.id))}>Praise</Btn><Btn kind="small" onClick={() => session.engine?.followStaff(x.id)}>Follow</Btn><Btn kind="small" onClick={() => openPanel('staff')}>Time card</Btn></div></Card>;
  }
  if (sel.kind === 'item') {
    const it = g.site.items.find((q) => q.id === sel.id); if (!it) return null; const d = itemById(it.type);
    return <Card title={d.name} sub={d.blurb}><Meter label="Condition" v={it.broken ? 0 : it.cond} right={it.broken ? <b className="neg">Broken</b> : `${Math.round(it.cond)}%`} />{d.id === 'bin' && <Meter label="Full" v={it.fill} invert />}{(d.income ?? 0) > 0 && <p className="mini">Earned {$(Math.round(it.income))} so far.</p>}<p className="mini">In use by {it.users.length}{d.seats ? ` of ${d.seats}` : ''}.</p><div className="acts"><Btn kind="small" testid="move-item" onClick={() => { session.engine?.startBuild(it.type, it.id, it.rot); ui().set({ sel: null, building: d.name }); }}>Move</Btn><Btn kind="small danger" testid="sell-item" onClick={() => { act(g.sellItem(it.id)); ui().set({ sel: null }); }}>Sell for {$(Math.round(d.cost * 0.4 * it.cond / 100))}</Btn></div></Card>;
  }
  if (sel.kind === 'aud') {
    const a = g.site.auds[(sel.id as number) - 1]!, s = g.s.screenings.find((x) => x.aud === sel.id && x.state !== 'ended' && x.state !== 'cancelled');
    return <Card title={g.audName(sel.id as number)} sub={s ? `${g.film(s.filmId).title}, ${s.state === 'upcoming' ? `at ${g.clock(s.start)}` : s.state}` : 'Dark'}>{s && <Meter label="House" v={s.sold} max={g.capacity(s.aud)} right={`${s.sold}/${g.capacity(s.aud)}`} />}{s && s.enjoyN > 5 && <Meter label="Enjoyment" v={s.enjoy / s.enjoyN} right={Math.round(s.enjoy / s.enjoyN)} />}<Meter label="Projector" v={a.projCond} right={a.fault ? <b className="neg">Fault</b> : `${Math.round(a.projCond)}%`} /><p className="mini">{audById(sel.id as number).rows} rows of {audById(sel.id as number).cols}.</p><div className="acts"><Btn kind="small" onClick={() => session.engine?.goAud(sel.id as number)}>Look inside</Btn><Btn kind="small" onClick={() => openPanel('screens')}>Equipment</Btn></div></Card>;
  }
  if (sel.kind === 'wing') { const w = WINGS.find((x) => x.id === sel.id); if (!w) return null; return <Card title={w.name} sub={w.blurb}><div className="acts"><Btn kind="stamp" disabled={g.s.chapter < w.needsChapter || g.s.cash < w.cost} onClick={() => { if (act(g.buildWing(w.id), 'stamp')) ui().set({ sel: null }); }}>{g.s.chapter < w.needsChapter ? `Chapter ${w.needsChapter}` : `Open for ${$(w.cost)}`}</Btn></div></Card>; }
  return null;
}
function Card({ title, sub, img, children }: { title: string; sub?: string; img?: string; children: React.ReactNode }): JSX.Element {
  return <aside className="card" data-testid="inspector"><button className="x" aria-label="Close" onClick={() => { ui().set({ sel: null }); if (session.engine) session.engine.selection = null; }}>×</button><header>{img && <img src={img} alt="" width={84} height={84} />}<div><h3>{title}</h3>{sub && <p>{sub}</p>}</div></header><div className="cbody">{children}</div></aside>;
}
const DOING: Record<string, string> = { enter: 'Arriving', queueBox: 'Queueing for tickets', atBox: 'Buying tickets', follow: 'Sticking with the group', idle: 'Deciding what to do', queueCon: 'Queueing for snacks', restroomGo: 'Heading for the restroom', restroomWait: 'Waiting for a stall', fixture: 'Busy', sink: 'Washing hands', toSeat: 'Finding the seat', sitting: 'Sitting down', seated: 'In the seat', standing: 'Getting up', bench: 'Having a sit-down', table: 'At a table', arcade: 'Playing', browse: 'Looking around', leave: 'Going home', kiosk: 'At the ticket kiosk', bin: 'Finding a bin', wait: 'At the bar', event: 'Caught up in something' };
function GuestCard({ id }: { id: number }): JSX.Element | null {
  const g = useGame(), m = g.guests.get(id);
  const [last, setLast] = useState<string>('');
  useEffect(() => { if (m) setLast(m.name); }, [m]);
  if (!m) return last ? <Card title={last} sub="Has gone home." >{null}</Card> : null;
  const s = g.screeningById(m.screening), a = archById(m.arch), t = TEMPERS.find((x) => x.id === m.temper)!, look = session.engine ? (session.engine as unknown as { looks: Map<number, { top: number; hair: number; skin: number }> }).looks.get(id) : undefined;
  const emo = m.emotion === 'content' ? 'happy' : m.emotion === 'moved' ? 'sad' : m.emotion;
  return (
    <Card title={m.name} sub={`${t.name}. ${a.id === 'family' ? 'Here with family' : a.id === 'teens' ? 'Out with friends' : a.id === 'couple' ? 'On a date' : a.id === 'friends' ? 'With friends' : a.id === 'seniors' ? 'Matinee regular' : a.name}`} img={look ? portrait(m.model, look) : ''}>
      <div className="gmood"><Emo n={emo} s={52} /><div><b>{Math.round(m.happy)}</b><span>{m.emotion}</span></div><p>{DOING[m.state] ?? m.state}{m.state === 'seated' && s ? `: ${g.film(s.filmId).title}` : ''}</p></div>
      <Meter label="Happiness" v={m.happy} right={Math.round(m.happy)} /><Meter label="Hunger" v={m.hunger} invert /><Meter label="Thirst" v={m.thirst} invert /><Meter label="Restroom" v={m.bladder} invert /><Meter label="Energy" v={m.energy} />{s && s.state === 'playing' && m.state === 'seated' && <Meter label="Enjoying film" v={filmExperience(g, m, s)} />}
      <ul className="thinks" data-testid="guest-thoughts">{m.thoughts.slice(0, 5).map((x, i) => <li key={i} className={x.tone > 0 ? 'pos' : x.tone < 0 ? 'neg' : ''}>“{x.text}”<em>{g.clock(x.t)}</em></li>)}</ul>
      <table className="gt"><tbody><tr><td>Ticket</td><td>{m.ticketPaid ? $(m.ticketPaid, 2) : 'none yet'}</td></tr><tr><td>Food and fun</td><td>{$(m.spent - m.ticketPaid, 2)}</td></tr><tr><td>Humour</td><td>{m.humor > 1.2 ? 'Laughs at anything' : m.humor > 0.85 ? 'Good' : 'Hard to amuse'}</td></tr><tr><td>Patience</td><td>{m.patience > 0.9 ? 'Saintly' : m.patience > 0.5 ? 'Average' : 'Short'}</td></tr><tr><td>Favourite</td><td>{m.taste}</td></tr></tbody></table>
      <div className="acts"><Btn kind="small" testid="follow-guest" onClick={() => session.engine?.followGuest(id)}>Follow</Btn><Btn kind="small" testid="comp-guest" onClick={() => act(g.comp(id))}>Free popcorn</Btn><Btn kind="small danger" onClick={() => act(g.kickGuest(id), 'punch')}>Show out</Btn></div>
    </Card>
  );
}
void itemSeat;
