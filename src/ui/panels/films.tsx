import { useState, type JSX } from 'react';
import { act, session, useGame } from '../store';
import { $, Btn, Buzz, Panel, Poster, Seg, Stepper, Tabs, Toggle, pct } from '../bits';
import { GENRES, studioById } from '../../sim/data/films';
import { counterOffer, declineOffer, extendContract, relationOf, signOffer } from '../../sim/market';
import { fmt, type Game } from '../../sim/game';
import type { ContractTerms, Film, Offer } from '../../sim/types';
import { audio } from '../../audio/audio';

const when = (g: Game, f: Film) => (f.releaseDay > g.s.day ? `Opens in ${f.releaseDay - g.s.day} day${f.releaseDay - g.s.day > 1 ? 's' : ''}` : f.repertory ? 'Restored classic' : f.releaseDay === g.s.day ? 'Opens today' : `In release, week ${Math.floor((g.s.day - f.releaseDay) / 7) + 1}`);

export function FilmsPanel(): JSX.Element {
  const g = useGame();
  const [tab, setTab] = useState('offers');
  const [sel, setSel] = useState<number>(g.s.offers[0]?.id ?? 0);
  const offer = g.s.offers.find((o) => o.id === sel) ?? g.s.offers[0];
  return (
    <Panel id="films" title="Film Exchange" note={`${g.s.offers.length} titles on offer`} wide skin="kraft">
      <Tabs v={tab} on={setTab} opts={[['offers', 'On offer'], ['booked', `Booked (${g.s.contracts.filter((c) => c.endDay >= g.s.day).length})`], ['studios', 'Studios']]} />
      {tab === 'offers' && (
        <div className="exchange">
          <ul className="cans" data-testid="offers">
            {g.s.offers.map((o) => { const f = g.film(o.filmId); return (
              <li key={o.id}><button className={`can ${offer?.id === o.id ? 'on' : ''}`} onClick={() => { setSel(o.id); audio.play('click', 0.6); }} data-testid="offer">
                <Poster f={f} w={52} /><span className="ct"><b>{f.title}</b><em style={{ color: GENRES[f.genre].color }}>{GENRES[f.genre].name}</em><small>{f.runtime} min · {f.cert} · {when(g, f)}</small><Buzz v={f.hype} /></span>{o.rival && <i className="rival">RIVAL BID</i>}
              </button></li>); })}
            {!g.s.offers.length && <li className="empty">Nothing on the exchange. New titles arrive Mondays and Thursdays.</li>}
          </ul>
          {offer && <ContractSheet key={offer.id} o={offer} />}
        </div>
      )}
      {tab === 'booked' && <Booked />}
      {tab === 'studios' && <div className="studios">{g.s.studios.map((s) => { const d = studioById(s.id); return <article key={s.id} className="studio"><span className="sl">{d.logo}</span><div><b>{d.name}</b><small>{d.style}. {d.genres.slice(0, 3).map((x) => GENRES[x].name).join(', ')}.</small><span className="rel"><i style={{ width: `${s.relation}%` }} /></span></div><em>{s.relation > 75 ? 'Old friends' : s.relation > 55 ? 'Warm' : s.relation > 38 ? 'Business' : s.relation > 20 ? 'Cool' : 'Frosty'}</em></article>; })}</div>}
    </Panel>
  );
}
function ContractSheet({ o }: { o: Offer }): JSX.Element {
  const g = useGame(), f = g.film(o.filmId), st = studioById(f.studio);
  const [t, set] = useState<ContractTerms>({ ...o.terms });
  const changed = JSON.stringify(t) !== JSON.stringify(o.terms);
  const up = (p: Partial<ContractTerms>) => set({ ...t, ...p });
  const price = g.site.prices.adult * 0.9, be = t.share < 1 ? Math.ceil(t.fee / Math.max(0.5, price * (1 - t.share) + 3)) : 0;
  return (
    <article className="contract" data-testid="contract">
      <div className="chead"><Poster f={f} w={118} /><div><h3>{f.title}</h3><p className="tag">“{f.tagline}”</p><p className="typed">{GENRES[f.genre].name} · {f.runtime} min · {f.cert}<br />{st.name}<br />{f.critic !== null ? `Critics: ${f.critic}%` : 'Not yet reviewed'}<br />Stars: {f.star > 75 ? 'A-list' : f.star > 45 ? 'Familiar faces' : 'Unknowns'}</p></div></div>
      <h4 className="typed">EXHIBITION LICENCE No. {1000 + o.id}</h4>
      <dl className="terms">
        <dt>Licence fee</dt><dd><Stepper testid="term-fee" v={t.fee} step={Math.max(10, Math.round(o.terms.fee * 0.05 / 10) * 10)} max={60000} f={(n) => $(n)} on={(n) => up({ fee: n })} /></dd>
        <dt>Studio’s share of tickets</dt><dd><Stepper testid="term-share" v={Math.round(t.share * 100)} min={5} max={80} f={(n) => `${n}%`} on={(n) => up({ share: n / 100 })} /></dd>
        <dt>Run</dt><dd><Stepper testid="term-weeks" v={t.minWeeks} min={1} max={6} f={(n) => `${n} wk`} on={(n) => up({ minWeeks: n })} /></dd>
        <dt>Shows promised per day</dt><dd><Stepper testid="term-shows" v={t.minShows} min={0} max={6} on={(n) => up({ minShows: n })} /></dd>
        <dt>Exclusive in the district</dt><dd><Toggle v={t.exclusive} on={(b) => up({ exclusive: b })}>{t.exclusive ? 'Yes' : 'No'}</Toggle></dd>
      </dl>
      <p className="typed mood">{st.name}: “{o.mood}” <span className="pips" title="Patience">{Array.from({ length: Math.max(0, o.patience) }, (_, i) => <i key={i} />)}</span></p>
      <p className="fine">At today’s prices you clear the fee after about {be} tickets. Missed shows are fined $120 each.</p>
      <div className="acts">
        {changed ? <><Btn kind="ghost" onClick={() => set({ ...o.terms })}>Their terms</Btn><Btn kind="primary" testid="propose" onClick={() => { const r = counterOffer(g, o.id, t); session.toast(r.msg, !r.ok); audio.play(r.accepted ? 'stamp' : 'bad', 0.7); const n = g.s.offers.find((x) => x.id === o.id); if (n && !r.accepted) set({ ...t }); session.bump(); }}>Propose these terms</Btn></>
          : <><Btn kind="ghost" onClick={() => { declineOffer(g, o.id); session.bump(); }}>Pass</Btn><Btn kind="stamp" testid="sign" disabled={g.s.cash < o.terms.fee} onClick={() => act(signOffer(g, o.id), 'stamp')}>Sign for {$(o.terms.fee)}</Btn></>}
      </div>
    </article>
  );
}
function Booked(): JSX.Element {
  const g = useGame(), list = g.s.contracts.filter((c) => c.endDay >= g.s.day);
  if (!list.length) return <p className="empty">No films booked. The marquee is blank and so is tomorrow.</p>;
  return <div className="booked">{list.map((c) => { const f = g.film(c.filmId); return (
    <article key={c.id} className="stub"><Poster f={f} w={74} /><div className="sb"><b>{f.title}</b><small>{c.startDay > g.s.day ? `Starts in ${c.startDay - g.s.day} days` : `${c.endDay - g.s.day + 1} day${c.endDay - g.s.day ? 's' : ''} left`}</small><Buzz v={f.hype} />
      <table><tbody><tr><td>Admissions</td><td>{c.admissions}</td></tr><tr><td>Gross</td><td>{$(Math.round(c.gross))}</td></tr><tr><td>To studio</td><td>{$(Math.round(c.paid))} ({pct(c.terms.share)})</td></tr><tr><td>Promised shows</td><td>{c.terms.minShows}/day{c.breaches ? `, ${c.breaches} missed` : ''}</td></tr></tbody></table></div>
      <div className="perf"><span>Word of mouth</span><b className={f.wom > 4 ? 'pos' : f.wom < -4 ? 'neg' : ''}>{f.wom > 12 ? 'Raves' : f.wom > 4 ? 'Good' : f.wom > -4 ? 'Mixed' : f.wom > -12 ? 'Poor' : 'Toxic'}</b><Btn kind="small" onClick={() => act(extendContract(g, c.id), 'stamp')}>Hold over a week · {fmt(Math.round((90 + f.hype * 9) / 10) * 10)}</Btn></div>
    </article>); })}</div>;
}
void Seg; void relationOf;
