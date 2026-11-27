import { useRef, useState, type JSX } from 'react';
import { act, session, useGame } from '../store';
import { Btn, Fader, Panel, Poster, Toggle, $ } from '../bits';
import { GENRES } from '../../sim/data/films';
import { seatsOf } from '../../sim/plan';
import { TURNAROUND, slotLength, validateSlot } from '../../sim/screenings';
import { audio } from '../../audio/audio';

const T0 = 10 * 60, T1 = 25.5 * 60;
export function ProgrammePanel(): JSX.Element {
  const g = useGame();
  const films = g.s.contracts.filter((c) => c.endDay >= g.s.day).map((c) => ({ c, f: g.film(c.filmId) }));
  const live = films.filter((x) => x.c.startDay <= g.s.day);
  const [pick, setPick] = useState(live[0]?.f.id ?? '');
  const [sel, setSel] = useState<{ aud: number; id: number } | null>(null);
  const [ghost, setGhost] = useState<{ aud: number; t: number; ok: boolean; len: number } | null>(null);
  const drag = useRef<{ aud: number; id: number; off: number; moved: boolean; film: string } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const timeAt = (e: React.PointerEvent, el: HTMLElement) => { const r = el.getBoundingClientRect(); return T0 + ((e.clientX - r.left) / r.width) * (T1 - T0); };
  const snap = (t: number) => Math.round(t / 5) * 5;
  const X = (t: number) => `${((t - T0) / (T1 - T0)) * 100}%`;
  const auds = g.site.auds.filter((a) => a.built);
  const cur = sel && g.site.auds[sel.aud - 1]!.program.find((p) => p.id === sel.id);
  const hoverRow = (e: React.PointerEvent<HTMLDivElement>, aud: number) => {
    const d = drag.current; const film = d ? d.film : pick; if (!film || !g.film(film)) return;
    const t = snap(timeAt(e, e.currentTarget) - (d ? d.off : 0));
    if (d) d.moved = true;
    setGhost({ aud, t, ok: validateSlot(g, aud, film, t, d?.id ?? 0).ok, len: slotLength(g, film) - TURNAROUND });
  };
  return (
    <Panel id="programme" title="Programme" note={`${g.s.screenings.filter((s) => s.state !== 'cancelled').length} shows today`} wide skin="felt">
      <div className="palette"><span>Pick a film, then click the board</span>{live.map(({ f }) => <button key={f.id} data-testid="pick-film" className={`chip ${pick === f.id ? 'on' : ''}`} style={{ '--c': GENRES[f.genre].color } as React.CSSProperties} onClick={() => { setPick(f.id); audio.play('click', 0.6); }}><Poster f={f} w={30} /><b>{f.title}</b><em>{f.runtime} min</em></button>)}{!live.length && <em className="warn">Book a film at the Exchange first.</em>}</div>
      <div className="board" ref={board} data-testid="board">
        <div className="hours">{Array.from({ length: 15 }, (_, i) => 10 + i).map((h) => <span key={h} style={{ left: X(h * 60) }}>{((h - 1) % 12) + 1}{h < 12 || h === 24 ? 'a' : 'p'}</span>)}</div>
        {auds.map((a) => (
          <div className="row" key={a.id}>
            <span className="rn">{g.audName(a.id)}<em>{g.capacity(a.id)}/{seatsOf(a.id).length} seats</em></span>
            <div className="track" data-testid={`track-${a.id}`} onPointerMove={(e) => hoverRow(e, a.id)} onPointerLeave={() => { if (!drag.current) setGhost(null); }}
              onPointerUp={(e) => { const d = drag.current; const t = snap(timeAt(e, e.currentTarget) - (d ? d.off : 0)); drag.current = null; setGhost(null); if (d) { if (d.moved) act(g.moveSlot(d.aud, d.id, a.id, t), 'place'); else setSel({ aud: d.aud, id: d.id }); } else if (pick) act(g.addSlot(a.id, pick, t), 'place'); }}>
              {g.s.phase !== 'prep' && <i className="now" style={{ left: X(g.s.minute) }} />}
              {a.program.map((p) => { const f = g.film(p.filmId); if (!f) return null; const s = g.s.screenings.find((x) => x.aud === a.id && x.start === p.start && x.filmId === p.filmId); const len = slotLength(g, p.filmId) - TURNAROUND; return (
                <button key={p.id} data-testid="slot" className={`slot ${sel?.id === p.id ? 'on' : ''} ${s?.state ?? ''}`} style={{ left: X(p.start), width: `${(len / (T1 - T0)) * 100}%`, '--c': GENRES[f.genre].color } as React.CSSProperties}
                  onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); const r = e.currentTarget.parentElement!; drag.current = { aud: a.id, id: p.id, off: timeAt(e, r) - p.start, moved: false, film: p.filmId }; }}>
                  <b>{f.title}</b><em>{g.clock(p.start)}</em>{s && <span className="fill"><i style={{ width: `${(s.sold / Math.max(1, g.capacity(a.id))) * 100}%` }} /></span>}
                </button>); })}
              {ghost && ghost.aud === a.id && <i className={`gslot ${ghost.ok ? '' : 'no'}`} style={{ left: X(ghost.t), width: `${(ghost.len / (T1 - T0)) * 100}%` }}><b>{g.clock(ghost.t)}</b></i>}
            </div>
          </div>
        ))}
      </div>
      <div className="pfoot">
        {cur && sel ? <div className="selslot"><b>{g.film(cur.filmId).title}</b><span>{g.audName(sel.aud)}, {g.clock(cur.start)}</span><Btn kind="small danger" testid="remove-slot" onClick={() => { g.removeSlot(sel.aud, cur.id); setSel(null); act(undefined, 'punch'); }}>Take off the board</Btn></div> : <p className="hint">Drag a title to move it. Shows need {TURNAROUND} minutes between them to clean the house.</p>}
        <Fader label="Trailers before each film" v={g.site.policy.trailers} min={0} max={20} f={(n) => `${n} min, ${$(Math.round(n * 1.5))}/show`} on={(n) => { g.site.policy.trailers = n; }} marks={['None', 'Endless']} testid="trailers" />
        <Toggle testid="auto-programme" v={!!g.s.flags.autoProgram} on={(b) => { g.s.flags.autoProgram = b ? 1 : 0; }}>Let the house manager fill the board every morning</Toggle>
        <Btn testid="auto-fill" onClick={() => { g.autoProgram(); setSel(null); act(undefined, 'place'); session.toast('Board filled.'); }}>Fill the board now</Btn>
      </div>
    </Panel>
  );
}
