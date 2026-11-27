import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import { posterCanvas } from '../render/film';
import { iconAtlas, ICONS, type IconName } from '../render/emotes';
import type { Film } from '../sim/types';
import { GENRES } from '../sim/data/films';
import { ui, session } from './store';
import { audio } from '../audio/audio';
import { Icon } from './icons';

export const $ = (n: number, d = 0) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A name spelled out in marquee letters on three rails. */
export function Letters({ t, red = false, size = 34 }: { t: string; red?: boolean; size?: number }): JSX.Element {
  return <span className={`letters ${red ? 'red' : ''}`} style={{ fontSize: size }} aria-label={t}>{[...t].map((c, i) => <i key={i} aria-hidden="true" style={{ '--r': `${(((i * 37 + c.charCodeAt(0)) % 7) - 3) * 0.28}deg`, '--y': `${((i * 13 + c.charCodeAt(0)) % 3) - 1}px` } as CSSProperties}>{c === ' ' ? '\u00a0' : c}</i>)}</span>;
}
export function Bulbs({ n = 40 }: { n?: number }): JSX.Element { return <span className="bulbs" aria-hidden="true">{Array.from({ length: n }, (_, i) => <b key={i} className={`b${i % 3}`} />)}</span>; }

export function Panel({ id, title, note, children, wide, skin = '' }: { id: string; title: string; note?: string; children: ReactNode; wide?: boolean; skin?: string }): JSX.Element {
  return (
    <section className={`panel ${wide ? 'wide' : ''} ${skin}`} data-testid={`panel-${id}`} aria-label={title}>
      <header className="marq"><Letters t={title.toUpperCase()} /><span className="note">{note}</span><button className="exit" data-testid="panel-close" onClick={() => { ui().set({ panel: null }); audio.play('click'); }} aria-label="Close">EXIT</button></header>
      <div className="body">{children}</div>
    </section>
  );
}
export function Btn({ children, onClick, kind = '', disabled, title, testid }: { children: ReactNode; onClick?: () => void; kind?: string; disabled?: boolean; title?: string; testid?: string }): JSX.Element {
  return <button type="button" className={`btn ${kind}`} onClick={onClick} disabled={disabled} title={title} data-testid={testid}>{children}</button>;
}
export function Stepper({ v, on, step = 1, min = 0, max = 999, f = (x) => String(x), testid, big }: { v: number; on: (n: number) => void; step?: number; min?: number; max?: number; f?: (n: number) => string; testid?: string; big?: boolean }): JSX.Element {
  const hold = useRef(0), val = useRef(v); val.current = v;
  const go = (d: number) => { const n = Math.max(min, Math.min(max, Math.round((val.current + d * step) * 1000) / 1000)); if (n !== val.current) { val.current = n; on(n); audio.play('click', 0.6); session.bump(); } };
  const down = (d: number) => { go(d); window.clearTimeout(hold.current); let w = 380; const rep = () => { go(d); w = Math.max(45, w * 0.8); hold.current = window.setTimeout(rep, w); }; hold.current = window.setTimeout(rep, w); };
  const up = () => window.clearTimeout(hold.current);
  useEffect(() => up, []);
  return <span className={`stepper ${big ? 'big' : ''}`} data-testid={testid}><button type="button" aria-label="Less" onPointerDown={() => down(-1)} onPointerUp={up} onPointerLeave={up} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go(-1); }} disabled={v <= min}>−</button><output>{f(v)}</output><button type="button" aria-label="More" onPointerDown={() => down(1)} onPointerUp={up} onPointerLeave={up} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go(1); }} disabled={v >= max}>+</button></span>;
}
export function Fader({ v, on, min = 0, max = 100, step = 1, label, f, testid, marks }: { v: number; on: (n: number) => void; min?: number; max?: number; step?: number; label: string; f?: (n: number) => string; testid?: string; marks?: [string, string] }): JSX.Element {
  return <label className="fader"><span className="fl">{label}<b>{f ? f(v) : v}</b></span><input type="range" min={min} max={max} step={step} value={v} data-testid={testid} style={{ '--p': `${((v - min) / (max - min)) * 100}%` } as CSSProperties} onChange={(e) => { on(Number(e.target.value)); session.bump(); }} />{marks && <span className="fm"><em>{marks[0]}</em><em>{marks[1]}</em></span>}</label>;
}
export function Seg<T extends string | number>({ v, opts, on, testid }: { v: T; opts: { v: T; t: string; hint?: string }[]; on: (v: T) => void; testid?: string }): JSX.Element {
  return <span className="seg" role="radiogroup" data-testid={testid}>{opts.map((o) => <button type="button" key={String(o.v)} role="radio" aria-checked={o.v === v} className={o.v === v ? 'on' : ''} title={o.hint} onClick={() => { on(o.v); audio.play('click', 0.6); session.bump(); }}>{o.t}</button>)}</span>;
}
export function Toggle({ v, on, children, testid }: { v: boolean; on: (b: boolean) => void; children: ReactNode; testid?: string }): JSX.Element { return <label className="toggle"><input type="checkbox" checked={v} data-testid={testid} onChange={(e) => { on(e.target.checked); audio.play('click', 0.6); session.bump(); }} /><i aria-hidden="true" /><span>{children}</span></label>; }
export function Meter({ v, max = 100, label, good = 60, bad = 35, right, invert }: { v: number; max?: number; label?: ReactNode; good?: number; bad?: number; right?: ReactNode; invert?: boolean }): JSX.Element {
  const p = Math.max(0, Math.min(1, v / max)), k = invert ? 100 - p * 100 : p * 100;
  return <div className="meter">{label !== undefined && <span className="ml">{label}</span>}<span className="mt"><i className={k >= good ? 'g' : k >= bad ? 'm' : 'b'} style={{ width: `${p * 100}%` }} /></span>{right !== undefined && <span className="mr">{right}</span>}</div>;
}
export function Stars({ v, s = 15 }: { v: number; s?: number }): JSX.Element { return <span className="stars" aria-label={`${v} stars`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: s, height: s }}><em style={{ width: `${Math.max(0, Math.min(1, v - i + 1)) * 100}%` }}><Icon n="star" s={s} /></em><Icon n="star" s={s} /></span>)}</span>; }
let atlasUrl = '';
export function Emo({ n, s = 26 }: { n: IconName; s?: number }): JSX.Element { atlasUrl ||= iconAtlas().toDataURL(); const i = ICONS.indexOf(n); return <span className="emo" role="img" aria-label={n} style={{ width: s, height: s, backgroundImage: `url(${atlasUrl})`, backgroundSize: `${s * 6}px`, backgroundPosition: `${-(i % 6) * s}px ${-Math.floor(i / 6) * s}px` }} />; }
export function Poster({ f, w = 96 }: { f: Film; w?: number }): JSX.Element {
  const [src, set] = useState('');
  useEffect(() => { let on = true; posterCanvas(f, (c) => { if (on) set(c.toDataURL('image/jpeg', 0.86)); }); return () => { on = false; }; }, [f.id, f.title]);
  return <span className="poster" style={{ width: w, height: w * 1.5, borderColor: GENRES[f.genre].color }}>{src && <img src={src} alt={`Poster for ${f.title}`} draggable={false} />}</span>;
}
/** Ten bulbs of buzz. */
export function Buzz({ v }: { v: number }): JSX.Element { return <span className="buzz" title={`Buzz ${Math.round(v)}`} aria-label={`Buzz ${Math.round(v)} of 100`}>{Array.from({ length: 10 }, (_, i) => <b key={i} className={v >= (i + 0.6) * 10 ? 'on' : ''} />)}</span>; }
export function Tabs({ v, opts, on }: { v: string; opts: [string, string][]; on: (s: string) => void }): JSX.Element { return <nav className="tabs" role="tablist">{opts.map(([k, t]) => <button key={k} role="tab" aria-selected={k === v} data-testid={`tab-${k}`} className={k === v ? 'on' : ''} onClick={() => { on(k); audio.play('click', 0.6); }}>{t}</button>)}</nav>; }
export const moodName = (h: number): IconName => (h > 84 ? 'delighted' : h > 66 ? 'happy' : h > 42 ? 'neutral' : h > 28 ? 'bored' : h > 14 ? 'annoyed' : 'angry');
/** Small line/bar chart drawn like pencil on graph paper. */
export function Chart({ data, h = 110, w = 420, color = '#c1272d', fmt = (n: number) => String(Math.round(n)), zero = false }: { data: number[]; h?: number; w?: number; color?: string; fmt?: (n: number) => string; zero?: boolean }): JSX.Element {
  if (!data.length) return <div className="chart empty">Nothing to plot until the first night closes.</div>;
  const lo = Math.min(zero ? 0 : Infinity, ...data), hi = Math.max(zero ? 0 : -Infinity, ...data), sp = hi - lo || 1, X = (i: number) => 34 + (i * (w - 44)) / Math.max(1, data.length - 1), Y = (v: number) => 10 + (1 - (v - lo) / sp) * (h - 26);
  return <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img"><g className="grid">{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${i * (w / 13)} 0V${h}`} />)}{Array.from({ length: 5 }, (_, i) => <path key={i} d={`M0 ${i * (h / 4)}H${w}`} />)}</g>{zero && lo < 0 && <path d={`M30 ${Y(0)}H${w}`} stroke="#7a6a58" strokeDasharray="3 3" />}<polyline points={data.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth="2.500" strokeLinejoin="round" />{data.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={i === data.length - 1 ? 4.500 : 2.200} fill={color} />)}<text x="2" y="14">{fmt(hi)}</text><text x="2" y={h - 6}>{fmt(lo)}</text></svg>;
}
