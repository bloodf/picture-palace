import { useEffect, useState, type JSX } from 'react';
import { act, session, ui, useGame } from '../store';
import { $, Btn, Chart, Emo, Fader, Meter, Panel, Seg, Stars, Stepper, Tabs, Toggle, moodName } from '../bits';
import { DECOR, ITEMS, MUSIC, PROJ_TIERS, ROLES, SCREEN_TIERS, SEAT_TIERS, SOUND_TIERS, itemById, ARCHETYPES, TEMPERS, type DecorKey } from '../../sim/data/catalog';
import { FIXTURES, ROOMS, WINGS, audById } from '../../sim/plan';
import { comfortOf, FAULT_NAMES, pictureOf, scheduleAudClean, soundOf } from '../../sim/screenings';
import { cleanliness } from '../../sim/maintenance';
import { propThumb } from '../thumbs';
import { fmt } from '../../sim/game';

// -------------------------------------------------------------------- staff
export function StaffPanel(): JSX.Element {
  const g = useGame();
  const [tab, setTab] = useState('crew');
  return (
    <Panel id="staff" title="Staff Room" note={`${g.site.staff.length} on the payroll, ${fmt(g.wagesDue)} a night`} wide skin="manila">
      <Tabs v={tab} on={setTab} opts={[['crew', 'Crew'], ['hire', `At the door (${g.site.candidates.length})`]]} />
      {tab === 'crew' ? <div className="cards">{g.site.staff.map((x) => (
        <article key={x.id} className="tcard" data-testid="staff-card"><header><b>{x.name}</b><em style={{ background: `#${ROLES[x.role].tint.toString(16).padStart(6, '0')}` }}>{ROLES[x.role].name}</em></header>
          <div className="skills"><Meter label="Skill" v={x.skill} /><Meter label="Speed" v={x.speed} /><Meter label="Charm" v={x.charm} /><Meter label="Morale" v={x.morale} /><Meter label="Energy" v={x.energy} good={45} bad={20} /></div>
          <div className="line"><span>Wage</span><Stepper v={x.wage} step={2} min={30} max={400} f={(n) => $(n)} on={(n) => g.setWage(x.id, n)} /><em className={x.wage < x.fair - 4 ? 'neg' : ''}>{x.wage < x.fair - 4 ? 'underpaid' : x.wage > x.fair + 8 ? 'well paid' : 'fair'}</em></div>
          <p className="mini">{x.state === 'strike' ? 'On strike' : x.state === 'break' ? 'On a break' : x.station ? `At the ${g.station(x.station).kind === 'usher' ? 'door' : 'counter'}` : x.job ? g.site.jobs.find((j) => j.id === x.job)?.title ?? 'Working' : 'Between jobs'}. {x.role === 'janitor' ? `${x.cleaned} cleaned` : x.role === 'tech' ? `${x.fixed} fixed` : `${x.served} served`}.</p>
          <div className="acts"><Btn kind="small" onClick={() => { session.engine?.followStaff(x.id); ui().set({ panel: null, sel: { kind: 'staff', id: x.id } }); }}>Find</Btn><Btn kind="small" onClick={() => act(g.praise(x.id))}>Praise</Btn><Btn kind="small" disabled={x.training > 0} onClick={() => act(g.train(x.id))}>{x.training ? 'Training' : 'Train $240'}</Btn><Btn kind="small danger" onClick={() => act(g.fire(x.id), 'punch')}>Let go</Btn></div>
        </article>))}</div>
        : <div className="cards">{g.site.candidates.map((c) => (
          <article key={c.id} className="tcard app" data-testid="candidate"><header><b>{c.name}</b><em style={{ background: `#${ROLES[c.role].tint.toString(16).padStart(6, '0')}` }}>{ROLES[c.role].name}</em></header><p className="script">{c.trait}</p><div className="skills"><Meter label="Skill" v={c.skill} /><Meter label="Speed" v={c.speed} /><Meter label="Charm" v={c.charm} /></div><p className="mini">{ROLES[c.role].blurb}</p><Btn kind="primary" testid="hire" onClick={() => act(g.hire(c.id), 'punch')}>Hire at {$(c.wage)} a night</Btn></article>))}{!g.site.candidates.length && <p className="empty">Nobody waiting. New faces every other morning.</p>}</div>}
    </Panel>
  );
}
// -------------------------------------------------------------------- upkeep
export function UpkeepPanel(): JSX.Element {
  const g = useGame(), st = g.site, jobs = [...st.jobs].sort((a, b) => b.severity - a.severity || a.created - b.created);
  const wc = ROOMS.filter((r) => r.kind === 'restroom' && g.unlocked.has(r.wing));
  return (
    <Panel id="upkeep" title="Upkeep" note={`${jobs.length} open work order${jobs.length === 1 ? '' : 's'}`} wide skin="clip">
      <div className="cols"><div>
        <h4>Work orders</h4><ul className="orders" data-testid="jobs">{jobs.map((j) => <li key={j.id} className={`s${Math.min(4, j.severity)}`}><Emo n={j.kind === 'fire' ? 'fire' : j.role === 'janitor' ? 'mop' : j.role === 'tech' ? 'wrench' : 'alert'} s={30} /><span><b>{j.title}</b><small>{j.player ? 'You are on it' : j.assignee ? st.staff.find((x) => x.id === j.assignee)?.name : `Waiting for ${j.role === 'any' ? 'anyone' : `a ${ROLES[j.role].name.toLowerCase()}`}`}{j.ttl !== undefined ? ` · ${j.ttl} min left` : ''}</small>{j.progress > 0 && <i style={{ width: `${(j.progress / j.need) * 100}%` }} />}</span>{j.role === 'tech' && <Btn kind="small" testid="callout" title="Pay a contractor to fix it now" onClick={() => act(g.callOut(j.id), 'punch')}>Call out {$(g.callOutCost(j))}</Btn>}<Btn kind="small" onClick={() => { session.engine?.jump(j.x, j.z, 10); ui().set({ panel: null }); }}>Show</Btn></li>)}{!jobs.length && <li className="empty">Nothing broken, blocked, burning or biting.</li>}</ul></div>
      <div><h4>Cleanliness <b className="big">{Math.round(cleanliness(g))}</b></h4>
        <Meter label="Litter on floors" v={st.litter.length} max={80} invert right={`${st.litter.length} pieces`} />
        {wc.map((r) => { const fs = FIXTURES.filter((f) => f.room === r.id); const v = fs.reduce((a, f) => a + st.fixtures[f.id]!.clean, 0) / fs.length, bad = fs.filter((f) => st.fixtures[f.id]!.clogged || st.fixtures[f.id]!.broken).length; return <Meter key={r.id} label={r.label} v={v} right={bad ? <b className="neg">{bad} out of order</b> : `${Math.round(v)}%`} />; })}
        {st.auds.filter((a) => a.built).map((a) => { const v = 100 - a.seatDirt.reduce((p, c) => p + c, 0) / a.seatDirt.length; return <Meter key={a.id} label={`${g.audName(a.id)} seats`} v={v} right={`${Math.round(v)}%`} />; })}
        <div className="line"><span>Soap and paper</span><Meter v={st.supplies} right={`${Math.round(st.supplies)}%`} /><Btn kind="small" onClick={() => act(g.buySupplies())}>Restock $60</Btn></div>
        <h4>Plant</h4><Meter label="Air conditioning" v={st.hvac - st.heat * 8} right={st.heat ? 'Struggling' : 'Running'} /><Meter label="Power" v={st.power ? 100 : 0} right={st.power ? 'On' : <b className="neg">Out</b>} />
        <div className="line"><span>Show dirt on the floor plan</span><Toggle v={ui().overlay === 'dirt'} on={(b) => { ui().set({ overlay: b ? 'dirt' : 'none' }); }}>{ui().overlay === 'dirt' ? 'On' : 'Off'}</Toggle></div>
        <p className="hint">Walk the floor (Tab) and hold E to clean or mend things yourself.</p></div></div>
    </Panel>
  );
}
// -------------------------------------------------------------------- screens
export function ScreensPanel(): JSX.Element {
  const g = useGame();
  const built = g.site.auds.filter((a) => a.built);
  const [sel, setSel] = useState(built[0]!.id);
  const a = g.site.auds[sel - 1]!, d = audById(sel), s = g.s.screenings.find((x) => x.aud === sel && x.state !== 'ended' && x.state !== 'cancelled');
  const up = (k: 'seat' | 'screen' | 'sound' | 'proj', name: string, tiers: readonly { name: string; blurb: string }[], t: number) => { const c = g.upgradeCost(sel, k); return <article className="upg"><span className="lvl">{tiers.map((_, i) => <i key={i} className={i <= t ? 'on' : ''} />)}</span><h4>{name}: {tiers[t]!.name}</h4><p>{tiers[t]!.blurb}</p>{c !== null ? <Btn kind="primary" testid={`up-${k}`} disabled={g.s.cash < c} onClick={() => act(g.upgradeAud(sel, k), 'place')}>{tiers[t + 1]!.name} · {$(c)}</Btn> : <em className="pos">Best there is</em>}</article>; };
  return (
    <Panel id="screens" title="Screens" note={`${built.length} open`} wide skin="velvet">
      <Tabs v={String(sel)} on={(v) => setSel(Number(v))} opts={built.map((x) => [String(x.id), g.audName(x.id)])} />
      <div className="cols"><div>
        <h4>{s ? `${g.film(s.filmId).title}, ${s.state === 'upcoming' ? g.clock(s.start) : s.state}` : 'Dark until tomorrow'}</h4>
        {a.fault && <div className="fault"><span>{FAULT_NAMES[a.fault]}. Get to the booth, or pay someone to.</span>{(() => { const j = g.site.jobs.find((k) => k.ref === `proj:${sel}`); return j ? <Btn kind="small" onClick={() => act(g.callOut(j.id), 'punch')}>Call out {$(g.callOutCost(j))}</Btn> : null; })()}</div>}
        <Meter label="Picture" v={pictureOf(g, sel)} right={Math.round(pictureOf(g, sel))} /><Meter label="Sound" v={soundOf(g, sel)} right={Math.round(soundOf(g, sel))} /><Meter label="Comfort" v={comfortOf(g, sel)} right={Math.round(comfortOf(g, sel))} />
        <h4>In the booth</h4><Meter label="Projector condition" v={a.projCond} right={`${Math.round(a.projCond)}%`} /><Meter label="Focus" v={a.focus} right={`${Math.round(a.focus)}%`} /><Meter label="Lamp life left" v={Math.max(0, 100 - (a.lampHours / PROJ_TIERS[a.projTier]!.lampLife) * 100)} right={`${Math.round(a.lampHours)} h used`} />
        <h4>Seats</h4><p className="mini">{g.capacity(sel)} of {d.rows * d.cols} usable. {a.seatBroken.reduce((p, c) => p + c, 0)} broken.</p><SeatMap aud={sel} />
        <div className="acts"><Btn kind="small" onClick={() => { scheduleAudClean(g, sel); act(undefined); session.toast('Turnaround ordered.'); }}>Order a clean</Btn><Btn kind="small" onClick={() => { session.engine?.goAud(sel); ui().set({ panel: null }); }}>Look inside</Btn></div>
      </div><div className="upgs">{up('proj', 'Projector', PROJ_TIERS, a.projTier)}{up('screen', 'Screen', SCREEN_TIERS, a.screenTier)}{up('sound', 'Sound', SOUND_TIERS, a.soundTier)}{up('seat', 'Seats', SEAT_TIERS, a.seatTier)}</div></div>
    </Panel>
  );
}
function SeatMap({ aud }: { aud: number }): JSX.Element { const g = useGame(), a = g.site.auds[aud - 1]!, d = audById(aud), s = g.s.screenings.find((x) => x.aud === aud && x.state !== 'ended' && x.state !== 'cancelled' && (x.state !== 'upcoming' || x.sold > 0)); return <svg className="seatmap" viewBox={`0 0 ${d.cols * 10 + 4} ${d.rows * 11 + 10}`}><path d={`M6 4H${d.cols * 10 - 2}`} stroke="#fff4d9" strokeWidth="3" strokeLinecap="round" />{a.seatBroken.map((b, i) => { const c = i % d.cols, r = Math.floor(i / d.cols), m = s ? g.guests.get(s.seats[i] ?? 0) : undefined; return <rect key={i} x={3 + c * 10} y={10 + (d.rows - 1 - r) * 11} width="8" height="8" rx="2" fill={b ? '#4a3a38' : m ? (m.happy > 66 ? '#6cc45f' : m.happy > 42 ? '#e8c04a' : '#d8502f') : s?.seats[i] ? '#8a7a70' : a.seatDirt[i]! > 55 ? '#7a5a2a' : '#7a1a26'} />; })}</svg>; }
// -------------------------------------------------------------------- guests
export function GuestsPanel(): JSX.Element {
  const g = useGame(), s = g.s, G = s.guests, n = Math.max(1, G.length), avg = (f: (m: (typeof G)[number]) => number) => G.reduce((a, m) => a + f(m), 0) / n;
  const [tab, setTab] = useState('mood');
  const bands = [[84, 101, 'delighted'], [66, 84, 'happy'], [42, 66, 'neutral'], [28, 42, 'bored'], [14, 28, 'annoyed'], [-1, 14, 'angry']] as const;
  const th = [...s.thoughtLog].filter((t) => !['arrive', 'home'].includes(t.code)).sort((a, b) => b.n - a.n), r = s.rating;
  return (
    <Panel id="guests" title="Guests" note={`${G.length} in the building`} wide skin="comment">
      <Tabs v={tab} on={setTab} opts={[['mood', 'Mood'], ['thoughts', 'Thoughts'], ['reviews', 'Reviews'], ['rating', 'Palace rating']]} />
      {tab === 'mood' && <div className="cols"><div><h4>How they feel right now</h4><div className="dial"><Emo n={moodName(g.avgHappy())} s={92} /><div><b>{Math.round(g.avgHappy())}</b><span>average happiness</span></div></div><div className="hist">{bands.map(([lo, hi, e]) => { const k = G.filter((m) => m.happy >= lo && m.happy < hi).length; return <div key={e}><span style={{ height: `${(k / n) * 100}%` }} /><Emo n={e} s={34} /><em>{k}</em></div>; })}</div><div className="line"><Toggle testid="moods" v={ui().moods} on={(b) => ui().set({ moods: b })}>Show faces over every head</Toggle></div><Seg v={ui().overlay} on={(v) => ui().set({ overlay: v })} opts={[{ v: 'none', t: 'Plain floor' }, { v: 'mood', t: 'Mood map' }, { v: 'crowd', t: 'Crowd map' }, { v: 'dirt', t: 'Dirt map' }]} testid="overlay" /></div>
        <div><h4>What they need</h4><Meter label="Hunger" v={avg((m) => m.hunger)} invert /><Meter label="Thirst" v={avg((m) => m.thirst)} invert /><Meter label="Restroom" v={avg((m) => m.bladder)} invert /><Meter label="Energy" v={avg((m) => m.energy)} /><Meter label="Enjoying the film" v={(() => { const f = G.filter((m) => m.state === 'seated' && m.enjoy); return f.length ? f.reduce((a, m) => a + m.enjoy, 0) / f.length : 0; })()} /><h4>Who they are</h4><div className="mix">{ARCHETYPES.map((a) => { const k = G.filter((m) => m.arch === a.id).length; return k ? <span key={a.id}><b>{k}</b>{a.name}</span> : null; })}</div><h4>Temperaments</h4><div className="mix">{TEMPERS.map((t) => { const k = G.filter((m) => m.temper === t.id).length; return k ? <span key={t.id} title={t.note}><b>{k}</b>{t.name}</span> : null; })}</div><p className="mini">Spent per head today: {fmt((s.site.dayRev) / Math.max(1, s.guestsToday + G.length))}</p></div></div>}
      {tab === 'thoughts' && <ul className="thoughts" data-testid="thoughts">{th.slice(0, 40).map((t) => <li key={t.code} className={t.tone > 0 ? 'pos' : t.tone < 0 ? 'neg' : ''}><b>{t.n}</b><span>“{t.text}”</span></li>)}{!th.length && <li className="empty">Nobody has thought anything yet.</li>}</ul>}
      {tab === 'reviews' && <ul className="reviews">{s.reviews.map((v) => <li key={v.id} className={v.source}><header><Stars v={v.stars} /><b>{v.name}</b><em>{v.source === 'guest' ? v.film : v.source}</em></header><p>{v.text}</p></li>)}{!s.reviews.length && <li className="empty">No cards in the box yet.</li>}</ul>}
      {tab === 'rating' && <div className="cols"><div><div className="dial"><Stars v={r.stars} s={30} /><div><b>{r.total}</b><span>Palace rating, out of 999</span></div></div><Chart data={s.ratingHist.map((x) => x.v)} fmt={(x) => String(Math.round(x))} /><p className="mini">Reputation {Math.round(s.site.reputation)} · Loyalty {Math.round(s.site.loyalty)}</p></div><div><Meter label="Happy guests" v={r.guests} right="36%" /><Meter label="Cleanliness" v={r.clean} right="16%" /><Meter label="Picture and sound" v={r.tech} right="15%" /><Meter label="Comfort and beauty" v={r.comfort} right="12%" /><Meter label="Variety" v={r.variety} right="12%" /><Meter label="Value" v={r.value} right="9%" /></div></div>}
    </Panel>
  );
}
// -------------------------------------------------------------------- build
export function BuildPanel(): JSX.Element {
  const g = useGame();
  const [tab, setTab] = useState('comfort');
  const cats: [string, string][] = [['comfort', 'Seating'], ['clean', 'Bins'], ['service', 'Services'], ['arcade', 'Arcade'], ['decor', 'Décor'], ['wings', 'Wings'], ['restore', 'Restoration']];
  useEffect(() => { if (ui().wingFocus) { setTab('wings'); ui().set({ wingFocus: null }); } }, []);
  return (
    <Panel id="build" title="Build" note="Lumen Fixtures & Fittings, catalogue No. 31" wide skin="catalogue">
      <Tabs v={tab} on={setTab} opts={cats} />
      {!['wings', 'restore'].includes(tab) && <div className="cat">{ITEMS.filter((i) => i.cat === tab).map((i) => { const lock = g.s.chapter < i.chapter; return <article key={i.id} className={lock ? 'off' : ''}><Thumb prop={i.prop} /><b>{i.name}</b><p>{i.blurb}</p><small>{i.rooms.includes('street') ? 'Anywhere' : i.rooms.slice(0, 3).join(', ')}{i.seats ? ` · seats ${i.seats}` : ''}{i.beauty ? ` · charm ${i.beauty}` : ''}</small><Btn kind="primary" testid={`item-${i.id}`} disabled={lock || g.s.cash < i.cost} onClick={() => { session.engine?.startBuild(i.id); ui().set({ panel: null, building: i.name }); }}>{lock ? `Chapter ${i.chapter}` : $(i.cost)}</Btn></article>; })}</div>}
      {tab === 'wings' && <div className="wings">{WINGS.map((w) => { const own = g.unlocked.has(w.id), lock = g.s.chapter < w.needsChapter; return <article key={w.id} className={own ? 'own' : lock ? 'off' : ''}><h4>{w.name}</h4><p>{w.blurb}</p>{own ? <em className="pos">Open</em> : <Btn kind="stamp" testid={`wing-${w.id}`} disabled={lock || g.s.cash < w.cost} onClick={() => act(g.buildWing(w.id), 'stamp')}>{lock ? `Chapter ${w.needsChapter}` : $(w.cost)}</Btn>}</article>; })}</div>}
      {tab === 'restore' && <div className="wings">{([['lobby', 'Grand lobby'], ['prom', 'Promenade'], ['wc', 'Restrooms'], ['facade', 'Marquee and façade']] as [DecorKey, string][]).map(([k, n]) => { const t = g.site.decor[k], next = DECOR[k][t + 1]; return <article key={k} className={next ? '' : 'own'}><h4>{n}</h4><p>Now: {DECOR[k][t]!.name}. Charm {DECOR[k][t]!.beauty}.</p>{next ? <Btn kind="stamp" testid={`decor-${k}`} disabled={g.s.cash < next.cost} onClick={() => act(g.upgradeDecor(k), 'place')}>{next.name} · {$(next.cost)}</Btn> : <em className="pos">As grand as it gets</em>}</article>; })}</div>}
    </Panel>
  );
}
export function Thumb({ prop, s = 92 }: { prop: string; s?: number }): JSX.Element { const [u, set] = useState(''); useEffect(() => { let on = true; void propThumb(prop).then((x) => on && set(x)); return () => { on = false; }; }, [prop]); return <span className="thumb" style={{ width: s, height: s }}>{u && <img src={u} alt="" width={s} height={s} />}</span>; }
// -------------------------------------------------------------------- house desk
export function DeskPanel(): JSX.Element {
  const g = useGame(), a = g.site.amb, p = g.site.policy, m = MUSIC.find((x) => x.id === a.music)!;
  const likes = Object.entries(m.like) as [string, number][];
  return (
    <Panel id="desk" title="House Desk" note="Set the mood" wide skin="metal">
      <div className="cols"><div className="faders"><h4>Atmosphere</h4><Fader label="Temperature" v={a.temp} min={15} max={29} f={(n) => `${n} °C`} on={(n) => { a.temp = n; }} marks={['Crisp', 'Balmy']} testid="temp" /><Fader label="Lobby lights" v={a.lights} min={10} max={100} on={(n) => { a.lights = n; }} marks={['Moody', 'Bright']} testid="lights" /><Fader label="Popcorn scent" v={a.scent} on={(n) => { a.scent = n; }} marks={['Neutral', 'Irresistible']} /><Fader label="Music volume" v={a.volume} on={(n) => { a.volume = n; }} marks={['Hush', 'Party']} /><div className="line"><span>Lobby music</span><Seg v={a.music} on={(v) => { a.music = v; }} opts={MUSIC.map((x) => ({ v: x.id as string, t: x.name }))} testid="music" /></div><p className="mini">{likes.length ? <>Pleases {likes.filter(([, v]) => v > 0).map(([k]) => ARCHETYPES.find((x) => x.id === k)!.name.toLowerCase()).join(', ')}{likes.some(([, v]) => v < 0) ? <>. Grates on {likes.filter(([, v]) => v < 0).map(([k]) => ARCHETYPES.find((x) => x.id === k)!.name.toLowerCase()).join(', ')}</> : null}.</> : 'Nobody minds silence. Nobody loves it.'}</p></div>
        <div className="faders"><h4>House rules</h4><Fader label="Usher strictness" v={p.strict} on={(n) => { p.strict = n; }} marks={['Live and let live', 'Library']} testid="strict" /><Toggle v={p.phones} on={(b) => { p.phones = b; }}>Phones allowed in the house</Toggle><Toggle v={p.outsideFood} on={(b) => { p.outsideFood = b; }}>Outside food allowed</Toggle><Fader label="Trailers" v={p.trailers} min={0} max={20} f={(n) => `${n} min`} on={(n) => { p.trailers = n; }} marks={['Straight in', 'Twenty minutes']} /><h4>Effect on the room</h4><Meter label="Average mood" v={g.avgHappy()} right={Math.round(g.avgHappy())} /><Meter label="Peace and quiet" v={100 - p.strict < 30 ? 92 : 40 + p.strict * 0.5 + g.site.staff.filter((x) => x.role === 'usher').length * 8} /><Meter label="Utilities tonight" v={g.dailyUtilities} max={300} invert right={fmt(g.dailyUtilities)} /><p className="hint">Every temperament reads the room differently. Anxious guests hate crowds and heat. Grumpy guests arrive unhappy. Rowdy ones talk unless an usher is near.</p></div></div>
    </Panel>
  );
}
void itemById; void Stars;
