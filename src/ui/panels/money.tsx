import { useState, type JSX } from 'react';
import { act, session, ui, useGame } from '../store';
import { $, Btn, Buzz, Chart, Fader, Meter, Panel, Poster, Seg, Stepper, Tabs, Toggle } from '../bits';
import { CAMPAIGNS, PRODUCTS, SITES, SUPPLY_TIERS, archById, equipById, siteDef } from '../../sim/data/catalog';
import { expectedDemand, fairFood, fairTicket, hourFactor } from '../../sim/guests';
import { FITS, buySite, chainValue, ownedSites, setManager, siteNight, travelTo } from '../../sim/chain';
import { WEEKDAYS, fmt } from '../../sim/game';
import type { LedgerCat } from '../../sim/types';
import { CHAPTERS } from '../../sim/objectives';

const verdict = (r: number) => (r < 0.72 ? 'A steal' : r < 0.92 ? 'Good value' : r < 1.08 ? 'Fair' : r < 1.28 ? 'Steep' : 'Robbery');
export function BoxOfficePanel(): JSX.Element {
  const g = useGame(), p = g.site.prices, built = g.site.auds.filter((a) => a.built), fair = built.reduce((a, x) => a + fairTicket(g, x.id), 0) / built.length;
  const tile = (label: string, k: keyof typeof p, step: number, max: number, f: (n: number) => string, note?: string, r?: number) => <div className="ptile" key={k}><span>{label}</span><Stepper big testid={`price-${k}`} v={p[k]} step={step} max={max} f={f} on={(n) => { p[k] = n; }} /><em className={r === undefined ? '' : r > 1.08 ? 'neg' : r < 0.92 ? 'pos' : ''}>{note}</em></div>;
  return (
    <Panel id="boxoffice" title="Box Office" note={`${g.s.guestsToday} through the doors today`} wide skin="lightbox">
      <div className="ptiles">
        {tile('Adult', 'adult', 0.25, 40, (n) => n.toFixed(2), verdict(p.adult / fair), p.adult / fair)}{tile('Child', 'child', 0.25, 40, (n) => n.toFixed(2), verdict(p.child / (fair * 0.68)), p.child / (fair * 0.68))}{tile('Senior', 'senior', 0.25, 40, (n) => n.toFixed(2), verdict(p.senior / (fair * 0.74)), p.senior / (fair * 0.74))}
        {tile('Matinee off', 'matinee', 5, 70, (n) => `${n}%`, 'Before 4 PM')}{tile('Weekend +', 'weekend', 0.25, 10, (n) => n.toFixed(2), 'Fri to Sun')}{g.unlocked.has('vip') && tile('Velvet +', 'vip', 0.5, 30, (n) => n.toFixed(2), 'Lounge guests')}
      </div>
      <div className="cols">
        <div><h4>Windows and rules</h4><div className="line"><span>Ticket windows open</span><Stepper v={g.site.boxOpen} min={1} max={2} on={(n) => { g.site.boxOpen = n; g.emit({ type: 'layout' }); }} testid="box-open" /></div>
          <Toggle v={g.site.policy.refunds} on={(b) => { g.site.policy.refunds = b; }}>Refund walkouts and cancelled shows</Toggle>
          <p className="hint">Cashiers on staff: {g.site.staff.filter((x) => x.role === 'box').length}. Kiosks: {g.site.items.filter((i) => i.type === 'kiosk').length}. Turned away today: {g.s.turnedAway}.</p></div>
        <div><h4>Today’s houses</h4><table className="houses"><thead><tr><th>Time</th><th>Film</th><th>Screen</th><th>Sold</th><th>Wanted</th></tr></thead><tbody>{g.s.screenings.map((s) => <tr key={s.id} className={s.state}><td>{g.clock(s.start)}</td><td>{g.film(s.filmId).title}</td><td>{s.aud}</td><td>{s.sold}/{g.capacity(s.aud)}</td><td>{s.state === 'upcoming' || s.state === 'seating' ? `~${Math.round(expectedDemand(g, s))}` : s.state}</td></tr>)}</tbody></table></div>
      </div>
    </Panel>
  );
}
export function ConcessionsPanel(): JSX.Element {
  const g = useGame(), st = g.site;
  const [hall, setHall] = useState('con');
  const list = PRODUCTS.filter((p) => p.hall === hall && (!equipById(p.equip).wing || g.unlocked.has(equipById(p.equip).wing as 'vip')));
  return (
    <Panel id="concessions" title="Concessions" note={`${Object.values(st.products).reduce((a, p) => a + p.soldToday, 0)} sold today`} wide skin="stripes">
      <Tabs v={hall} on={setHall} opts={[['con', 'The stand'], ['food', 'Food hall'], ['vip', 'Lounge bar']]} />
      {!list.length && <p className="empty">{hall === 'food' ? 'Open the Food Hall wing to cook here.' : 'Open the Velvet Lounge to pour here.'}</p>}
      <div className="products">{list.map((p) => { const q = st.products[p.id]!, e = st.equipment[p.equip]!, fair = fairFood(g, p), r = q.price / fair; return (
        <article key={p.id} className={`product ${e.owned ? '' : 'off'}`} data-testid={`product-${p.id}`}>
          <header><b>{p.name}</b><em>{p.blurb}</em></header>
          {!e.owned ? <Btn kind="primary" testid={`buy-${p.equip}`} disabled={g.s.cash < equipById(p.equip).cost} onClick={() => act(g.buyEquip(p.equip), 'place')}>{equipById(p.equip).name} · {$(equipById(p.equip).cost)}</Btn> : <>
            <div className="line"><span>Price</span><Stepper v={q.price} step={0.25} max={40} f={(n) => n.toFixed(2)} on={(n) => { q.price = n; }} testid={`food-${p.id}`} /><em className={r > 1.12 ? 'neg' : r < 0.9 ? 'pos' : ''}>{verdict(r)}</em></div>
            <div className="line"><span>Supplier</span><Seg v={q.tier} opts={SUPPLY_TIERS.map((t, i) => ({ v: i as 0 | 1 | 2, t: t.name, hint: `${$(p.cost * t.cost, 2)} each` }))} on={(v) => { q.tier = v; }} /></div>
            <Meter label="Stock" v={q.stock} max={Math.max(200, q.stock)} good={35} bad={12} right={`${q.stock}`} />
            <Meter label={equipById(p.equip).name} v={e.cond} good={55} bad={30} right={e.broken ? <b className="neg">Broken</b> : `${Math.round(e.cond)}%`} />
            <div className="line"><Toggle v={q.auto} on={(b) => { q.auto = b; }}>Reorder at {q.reorderAt}</Toggle><Btn kind="small" onClick={() => act(g.orderStock(p.id, 100))}>+100 · {$(100 * p.cost * SUPPLY_TIERS[q.tier].cost)}</Btn></div>
            <p className="mini">Sold {q.soldToday} today, {q.soldTotal} ever. Costs {$(p.cost * SUPPLY_TIERS[q.tier].cost, 2)} each.</p>
          </>}
        </article>); })}</div>
      {hall === 'con' && <div className="recipe"><h4>House recipe</h4><Fader label="Popcorn salt" v={st.recipe.salt} on={(n) => { st.recipe.salt = n; }} marks={['Bland', 'Sells soda']} testid="salt" /><Fader label="Butter" v={st.recipe.butter} on={(n) => { st.recipe.butter = n; }} marks={['Dry', 'Decadent']} /><Fader label="Ice in the cup" v={st.recipe.ice} on={(n) => { st.recipe.ice = n; }} marks={['Generous', 'Mostly ice']} /><div className="line"><span>Tills open</span><Stepper v={st.conOpen} min={1} max={4} on={(n) => { st.conOpen = n; g.emit({ type: 'layout' }); }} testid="con-open" /></div><p className="hint">Each till needs a concessionist, or you.</p></div>}
    </Panel>
  );
}
const CATS: [LedgerCat, string][] = [['tickets', 'Tickets'], ['concessions', 'Concessions'], ['food', 'Food hall'], ['arcade', 'Arcade'], ['vip', 'Lounge'], ['events', 'Events and bonuses'], ['chain', 'Other houses'], ['other', 'Sundry'], ['studio', 'Studio share'], ['license', 'Film licences'], ['wages', 'Wages'], ['stock', 'Stock'], ['rent', 'Rent and cover'], ['utilities', 'Utilities'], ['repairs', 'Repairs'], ['marketing', 'Promotion'], ['build', 'Building'], ['refunds', 'Refunds'], ['fines', 'Fines'], ['loan', 'Bank']];
export function Receipt({ l, title, sub }: { l: Partial<Record<LedgerCat, number>>; title: string; sub?: string }): JSX.Element {
  const rows = CATS.filter(([k]) => Math.abs(l[k] ?? 0) >= 0.5), net = rows.reduce((a, [k]) => a + (l[k] ?? 0), 0);
  return <div className="receipt" data-testid="receipt"><h4>{title}</h4>{sub && <p>{sub}</p>}<hr /><table><tbody>{rows.map(([k, t]) => <tr key={k}><td>{t}</td><td>{fmt(l[k]!)}</td></tr>)}</tbody></table><hr /><table><tbody><tr className="net"><td>NET</td><td className={net < 0 ? 'neg' : ''}>{fmt(net)}</td></tr></tbody></table></div>;
}
export function LedgerPanel(): JSX.Element {
  const g = useGame(), s = g.s, net = s.reports.map((r) => Object.values(r.ledger).reduce((a, b) => a + (b ?? 0), 0));
  return (
    <Panel id="ledger" title="Ledger" note={`${fmt(s.cash)} in the safe`} wide skin="graph">
      <div className="cols l">
        <Receipt l={s.today} title={s.site.name.toUpperCase()} sub={`${WEEKDAYS[g.weekday]}, day ${s.day}`} />
        <div><h4>Net, last {net.length || 0} nights</h4><Chart data={net.slice(-30)} fmt={(n) => fmt(n)} zero /><h4>Admissions</h4><Chart data={s.reports.slice(-30).map((r) => r.guests)} color="#12555a" zero /><h4>Tonight’s fixed costs</h4><p className="mini">Wages {fmt(g.wagesDue)} · Rent {fmt(g.dailyRent)} · Utilities {fmt(g.dailyUtilities)}{s.site.insured ? ' · Insurance $45' : ''}{s.loan ? ` · Interest ${fmt(Math.round(s.loan * s.loanRate))}` : ''}</p></div>
        <div><h4>First Lumen Bank</h4><div className="bank"><p>Owed <b>{fmt(s.loan)}</b><br />Limit {fmt(s.creditLimit)}, {(s.loanRate * 100).toFixed(2)}% a night</p><div className="acts"><Btn testid="borrow" disabled={s.loan + 5000 > s.creditLimit} onClick={() => act(g.borrow(5000))}>Borrow $5,000</Btn><Btn testid="repay" disabled={!s.loan} onClick={() => act(g.repay(5000))}>Repay $5,000</Btn></div></div><h4>The house</h4><p className="mini">Chapter {s.chapter}: {CHAPTERS[s.chapter - 1]!.name}<br />Worth of the business: <b>{fmt(chainValue(g))}</b><br />Insurance: {s.site.insured ? 'covered' : 'none'}</p></div>
      </div>
    </Panel>
  );
}
export function PromotePanel(): JSX.Element {
  const g = useGame();
  return <Panel id="promote" title="Promote" note={`Demand ${g.effect('demand') >= 0 ? '+' : ''}${Math.round(g.effect('demand') * 100)}% from events`} skin="news"><div className="ads">{CAMPAIGNS.map((c) => { const on = g.site.campaigns.find((x) => x.id === c.id); return <article key={c.id} className={`ad ${on ? 'run' : ''}`}><h4>{c.name}</h4><p>{c.blurb}</p><small>Reaches {c.arch.map((a) => archById(a as 'teens').name.toLowerCase()).join(', ')} · {c.days} days</small>{on ? <em>Running, {on.until - g.s.day + 1} day{on.until - g.s.day ? 's' : ''} left</em> : <Btn testid={`ad-${c.id}`} kind="primary" disabled={g.s.cash < c.cost} onClick={() => act(g.startCampaign(c.id), 'stamp')}>Run it for {$(c.cost)}</Btn>}</article>; })}</div></Panel>;
}
export function CityPanel(): JSX.Element {
  const g = useGame();
  const [sel, setSel] = useState('harbor');
  const [fit, setFit] = useState<keyof typeof FITS>('bare');
  const d = siteDef(sel), own = ownedSites(g).find((x) => x.id === sel), here = g.site.id === sel;
  const last = own?.history[own.history.length - 1];
  return (
    <Panel id="city" title="Lumen Bay" note={`${ownedSites(g).length} of ${SITES.length} houses`} wide skin="map">
      <div className="citymap">
        <svg viewBox="0 0 100 84" className="cmap" role="img" aria-label="Map of Lumen Bay"><path d="M0 60 C14 56 16 74 10 84 H0z" fill="#7fb3b5" /><path d="M0 0H100V84H30C26 72 18 66 0 58z" fill="#efe3c8" /><path d="M0 58C18 66 26 72 30 84" stroke="#5a9a9c" strokeWidth="1" fill="none" /><g stroke="#fffaf0" strokeWidth="1.700" fill="none"><path d="M8 40H100M20 12V80M47 0V84M70 0V84M28 28H100M12 54H100M34 66H100" /><path d="M0 22C30 30 60 18 100 30" strokeWidth="2.600" /><path d="M88 0C84 30 90 60 80 84" strokeWidth="2.400" /></g><g fill="#cdd9a8"><rect x="73" y="58" width="14" height="14" rx="2" /><rect x="50" y="12" width="9" height="9" rx="1.500" /></g><g fill="#dccbac">{Array.from({ length: 60 }, (_, i) => <rect key={i} x={14 + ((i * 37) % 82)} y={6 + ((i * 53) % 72)} width={2 + (i % 3)} height={2 + ((i * 7) % 3)} rx=".3" />)}</g><text x="5" y="76" fontSize="3.600" fill="#2a6a6c" fontFamily="Yellowtail">the bay</text></svg>
        {SITES.map((s) => { const o = ownedSites(g).find((x) => x.id === s.id); return <button key={s.id} data-testid={`site-${s.id}`} className={`pin ${o ? 'own' : ''} ${sel === s.id ? 'on' : ''} ${g.site.id === s.id ? 'here' : ''}`} style={{ left: `${s.mapX}%`, top: `${(s.mapY / 84) * 100}%` }} onClick={() => setSel(s.id)}><i />{s.name}</button>; })}
      </div>
      <article className="deed"><h3>{d.name}</h3><p className="script">{d.district}</p><p>{d.blurb}</p>
        <Meter label="Footfall" v={d.traffic} max={2.5} good={50} bad={30} /><Meter label="Wealth" v={d.wealth} max={1.8} good={60} bad={45} /><p className="mini">Rent {fmt(d.rent)} a night. Rival: {d.rival}.{Object.keys(d.mix).length ? ` Draws ${Object.entries(d.mix).filter(([, v]) => v > 1.1).map(([k]) => archById(k as 'teens').name.toLowerCase()).join(', ')}.` : ''}</p>
        {here ? <p className="own">You are here.</p> : own ? <><p className="mini">Manager: <b>{own.manager ? `${own.manager.name}, skill ${own.manager.skill}` : 'none'}</b><br />Reputation {Math.round(own.reputation)}. {last ? `Last night ${last.guests} guests, ${fmt(last.rev - last.cost)}.` : 'No trading yet.'}</p><div className="acts"><Btn kind="small" onClick={() => act(setManager(g, sel, Math.min(95, (own.manager?.skill ?? 40) + 12)))}>Hire a better manager</Btn><Btn kind="primary" testid="travel" disabled={g.s.phase !== 'prep' && g.s.phase !== 'report'} title="Before opening or after closing" onClick={() => { if (act(travelTo(g, sel), 'doors')) { session.engine?.bindGame(); ui().set({ panel: null }); } }}>Go there</Btn></div></>
          : <><Seg v={fit} on={setFit} opts={(Object.keys(FITS) as (keyof typeof FITS)[]).map((k) => ({ v: k, t: FITS[k].name, hint: FITS[k].blurb }))} /><p className="mini">{FITS[fit].blurb}</p><Btn kind="stamp" testid="buy-site" disabled={g.s.chapter < 4 || g.s.cash < d.cost + FITS[fit].cost} onClick={() => act(buySite(g, sel, fit), 'stamp')}>Buy for {fmt(d.cost + FITS[fit].cost)}</Btn>{g.s.chapter < 4 && <p className="hint">The bank backs a second house from chapter 4.</p>}</>}
      </article>
    </Panel>
  );
}
void Buzz; void Poster; void hourFactor; void siteNight;
