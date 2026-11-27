import { useState, type JSX } from 'react';
import { session, ui, useUi } from './store';
import { Btn, Bulbs, Letters, Seg } from './bits';
import { Help, Settings, SlotList } from './modals';
import { DIFFICULTY } from '../sim/state';
import { audio } from '../audio/audio';
import type { GameState } from '../sim/types';

export function Loading(): JSX.Element {
  const { progress, loadWhat, error } = useUi();
  const n = Math.max(1, Math.min(8, 8 - Math.floor(progress * 8)));
  return <div className="leader" data-testid="loading">{error ? <div className="lerr"><Letters t="OUT OF ORDER" red size={56} /><p>{error}</p></div> : <><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" /><circle cx="100" cy="100" r="80" /><path d="M100 0V200M0 100H200" /><path className="sweep" d={`M100 100V-40A140 140 0 ${progress > 0.5 ? 1 : 0} 1 ${100 + Math.sin(progress * Math.PI * 2) * 140} ${100 - Math.cos(progress * Math.PI * 2) * 140}Z`} /><text x="100" y="106">{n}</text></svg><p>Threading the {loadWhat || 'projector'}</p></>}</div>;
}
export function Title(): JSX.Element {
  const { menu } = useUi();
  const [name, setName] = useState('Picture Palace'), [mgr, setMgr] = useState(''), [av, setAv] = useState<'mgr_m' | 'mgr_f'>('mgr_f'), [df, setDf] = useState<GameState['difficulty']>('feature');
  const has = !!session.meta('auto');
  const go = (m: typeof menu) => { audio.start(); audio.play('open'); ui().set({ menu: m }); };
  return (
    <div className="title" data-testid="title">
      <div className="tmq"><Bulbs n={34} /><div className="tlit"><span className="script">the</span><Letters t="PICTURE PALACE" size={88} /><p>{menu === 'new' ? 'Hang out your sign' : 'One projector. One popcorn machine. One very sticky floor.'}</p></div><Bulbs n={34} /></div>
      {!menu && <nav className="tmenu">{has && <Btn kind="primary big" testid="continue" onClick={() => { audio.start(); session.load('auto'); }}>Continue</Btn>}<Btn kind={has ? 'big' : 'primary big'} testid="new-game" onClick={() => go('new')}>New theater</Btn><Btn kind="big" testid="load-game" onClick={() => go('load')}>Load a reel</Btn><Btn kind="big" onClick={() => go('settings')}>Settings</Btn><Btn kind="big" onClick={() => go('help')}>How to play</Btn></nav>}
      {menu && <section className="tsheet">
        {menu === 'new' && <form onSubmit={(e) => { e.preventDefault(); audio.start(); session.newGame({ name, manager: mgr, avatar: av, difficulty: df }); audio.play('fanfare', 0.7); }}>
          <label>Name on the marquee<input value={name} maxLength={22} data-testid="theater-name" onChange={(e) => setName(e.target.value)} /></label><label>Manager<input value={mgr} maxLength={22} placeholder="Your name" data-testid="manager-name" onChange={(e) => setMgr(e.target.value)} /></label>
          <div className="line"><span>Appearance</span><Seg v={av} on={setAv} opts={[{ v: 'mgr_f', t: 'Woman' }, { v: 'mgr_m', t: 'Man' }]} testid="avatar" /></div>
          <div className="diffs" role="radiogroup">{(Object.keys(DIFFICULTY) as GameState['difficulty'][]).map((k) => <button type="button" key={k} role="radio" aria-checked={df === k} className={df === k ? 'on' : ''} data-testid={`diff-${k}`} onClick={() => setDf(k)}><b>{DIFFICULTY[k].name}</b><em>{DIFFICULTY[k].blurb}</em><span>${DIFFICULTY[k].cash.toLocaleString('en-US')} to start</span></button>)}</div>
          <div className="acts"><Btn onClick={() => go(null)}>Back</Btn><button className="btn primary big" data-testid="start-game" type="submit">Take the keys</button></div>
        </form>}
        {menu === 'load' && <SlotList mode="load" />}{menu === 'settings' && <Settings />}{menu === 'help' && <Help />}
        {menu !== 'new' && <div className="acts"><Btn onClick={() => go(null)} testid="back">Back</Btn></div>}
      </section>}
    </div>
  );
}
