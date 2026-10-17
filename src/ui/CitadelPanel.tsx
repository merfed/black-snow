// The Black Citadel and the Dream Engine: two boxes past Lull, once the Syzygy's gate is open.
import { useState, type CSSProperties, type MouseEvent } from 'react';
import {
  activeDreams, answerRite, appetite, ashDrainPerSecond, awayHours, burnRate, buyCitadelUp, CITADEL_UPS, citadelEnded, citadelUpCost,
  citadelUpLevel, DREAM_ORDER, ease, DREAMS, dreamsHeld, dreamWard, drainRate, ENDING, FLOORS, floorsReached, learnDream, meltWax, nulRate,
  openDreamSlot, riteDue, RITES, setDream, SLOT_NUL, touchOmen, unanswered, ward, WARD_CAP, WAX_PER_DREAM,
} from '../game/citadel';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { Artwork } from './Artwork';
import { Card } from './Card';
import { FloaterLayer, useFloaters } from './Floaters';
import { SCENES } from './scenes';
import { Sprite } from './Sprite';
import { RARE_FLAKES } from './sprites';

export const CITADEL_INK = '#e8c21c';
export const DREAM_INK = '#a593ff';
const pct = (v: number) => `${v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;
/** A fraction per second as "x% an hour", which reads better at these sizes. */
const perHour = (d: number) => pct(1 - Math.exp(-d * 3600));

export function CitadelPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const c = game.citadel;
  const d = drainRate(game);
  const due = riteDue(game), floors = floorsReached(game), owed = unanswered(game);
  const nextFloor = FLOORS[floors];
  return (
    <section className="panel citadel-panel plate-panel knots reveal" data-panel="citadel" style={{ '--hue': CITADEL_INK } as CSSProperties}>
      <h2>The Black Citadel <span className="h2-note">it drinks the station slowly</span></h2>
      <Artwork scene={SCENES.citadel} ink={CITADEL_INK} accent="#fff7c8" caption='"It was always behind the gate. Now it is behind everything."' className="panel-art" />
      <div className="citadel-stats">
        <div><span className="big-number small hue-text">{fmt(c.nul)}</span> nul <small>+{fmt(nulRate(game) * 60)} a minute</small></div>
        <div className="citadel-drain">
          It takes <b>{perHour(d)}</b> of your ash, embers, echoes, rust, pigment and cycles an hour
          <small> (−{fmt(ashDrainPerSecond(game))} ash/s). Unwarded it would take {perHour(ease(appetite(game)))}. Wards hold back {pct(ward(game))}.</small>
        </div>
        <div className="drain-bar" title="How much of its appetite gets through"><div style={{ width: `${(1 - ward(game)) * 100}%` }} /></div>
        {awayHours(game) > 0 && <small className="dim">A sealed room: time away counts {awayHours(game)} hours longer.</small>}
      </div>
      <h3 className="sub-head">The floors <span className="h2-note">{citadelEnded(game) ? 'all seven rites given' : `${game.citadel.rites} of ${RITES.length} rites given`}</span></h3>
      {citadelEnded(game) ? <p className="citadel-ending" style={{ fontSize: 16, color: CITADEL_INK, fontFamily: "'MEK Mono', monospace" }}>"{ENDING}"</p> : <>
        <p className="small-note">
          {floors === 0 ? 'It has not climbed yet.' : `It has climbed ${floors} floor${floors > 1 ? 's' : ''}.`}
          {owed > 0 && <> {owed} unanswered: it drinks {Math.round(owed * 25)}% harder until a rite is given.</>}
          {nextFloor !== undefined && <span className="dim"> Next floor in {fmt(Math.max(0, nextFloor - c.time / 3600))} hours awake.</span>}
        </p>
        {due && (
          <button className="max-all" disabled={c.nul < due.nul || dreamsHeld(game) < due.dreams} onClick={() => run(answerRite)}
            title="A rite answers one floor and holds back a little more of the drain for good.">
            {due.name} <span className="cost">{fmt(due.nul)} nul · {fmt(due.dreams)} dreams</span>
          </button>
        )}
        {game.citadel.rites > 0 && <p className="dim small-note">"{RITES[game.citadel.rites - 1].text}"</p>}
      </>}
      <p className="dim small-note">Nul grows out of nothing, faster the longer it has been awake. Feed it dreams in the Dream Engine to narrow its mouth. Wards never hold back more than {pct(WARD_CAP)}, and it never takes so much that you hold less than four hours of income.</p>
      <div className="cards scroll-list" data-scroll>
        {CITADEL_UPS.map(u => {
          const lvl = citadelUpLevel(game, u.id), cost = citadelUpCost(game, u);
          const done = u.id === 'snow' && lvl > 0;
          return (
            <Card key={u.id} hue={CITADEL_INK} title={u.name} desc={u.desc} level={lvl} cost={`${fmt(cost)} nul`}
              state={done ? 'owned' : 'available'} disabled={done || c.nul < cost} onClick={() => run(s => buyCitadelUp(s, u.id))} />
          );
        })}
      </div>
    </section>
  );
}

export function DreamEnginePanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [pick, setPick] = useState<number | null>(null);
  const de = game.dreams, held = dreamsHeld(game), act = activeDreams(game);
  const rate = burnRate(game);
  return (
    <section className="panel dream-panel plate-panel knots reveal" data-panel="dreams" style={{ '--hue': DREAM_INK } as CSSProperties}>
      <h2>The Dream Engine <span className="h2-note">it sleeps for you</span></h2>
      <Artwork scene={SCENES.dreamEngine} ink={DREAM_INK} accent={CITADEL_INK} caption='"Lie down. It only takes what you were going to forget."' className="panel-art" />
      <div className="dream-fuel">
        <span className="big-number small hue-text">{fmt(held)}</span> dreams
        <small>{act.length ? (held > 0 ? ` burning ${fmt(rate * 60)} a minute, about ${fmt(held / Math.max(rate, 1e-9) / 3600)} hours left` : '') : ' nothing burning'}</small>
      </div>
      {held <= 0 && <p className="dim small-note">No dreams to burn. The Syzygy gathers them each night, or melt ghostwax down.</p>}
      <div className="ch-row">
        <button className="secondary" disabled={game.nursery.ghostwax < WAX_PER_DREAM}
          onClick={() => run(s => meltWax(s, s.nursery.ghostwax))}>Melt all ghostwax ({fmt(Math.floor(game.nursery.ghostwax / WAX_PER_DREAM))} dreams)</button>
      </div>

      <h3 className="sub-head">The beds</h3>
      <div className="dream-beds">
        {de.slots.map((id, i) => {
          if (i >= de.slotCount) {
            const cost = SLOT_NUL[i];
            return (
              <button key={i} className="dream-bed knots locked" disabled={game.citadel.nul < cost} onClick={() => run(s => openDreamSlot(s))}>
                <Cot />
                <span>Make up another bed</span><small>{fmt(cost)} nul</small>
              </button>
            );
          }
          const def = id ? DREAMS[id] : null;
          return (
            <button key={i} className={`dream-bed knots ${id && act.includes(id) ? 'on' : ''} ${pick === i ? 'picking' : ''}`} onClick={() => setPick(pick === i ? null : i)}
              aria-label={def ? `Bed ${i + 1}: ${def.name}` : `Bed ${i + 1}: empty`}>
              <Cot sleeper={!!def} burning={!!id && act.includes(id)} />
              {def ? <><b>{def.name}</b><small>holds back {pct(dreamWard(game, def.id))}</small></> : <><span>Empty</span><small>choose a dream</small></>}
            </button>
          );
        })}
      </div>

      <h3 className="sub-head">Dreams <span className="h2-note">{pick !== null ? `choose one for bed ${pick + 1}` : 'click one to put it to bed, again to wake it'}</span></h3>
      <div className="dream-list scroll-list" data-scroll>
        {DREAM_ORDER.map(id => {
          const def = DREAMS[id], known = de.known.includes(id), inBed = de.slots.slice(0, de.slotCount).includes(id);
          const onClick = () => {
            if (!known) return run(s => learnDream(s, id));
            if (inBed) { const at = de.slots.indexOf(id); run(s => setDream(s, at, null)); setPick(null); return; }
            const bed = pick ?? de.slots.slice(0, de.slotCount).findIndex(x => !x);
            if (bed >= 0) run(s => setDream(s, bed, id));
            setPick(null);
          };
          return (
            <button key={id} className={`dream-row ${known ? '' : 'unknown'} ${inBed ? 'in-bed' : ''}`} onClick={onClick}
              disabled={!known && game.citadel.nul < def.cost}
              title={!known ? 'Learn this dream' : inBed ? 'Take it out of its bed' : 'Put it in a bed'}>
              <span className="dream-name">{def.name}{inBed && <i> in a bed</i>}</span>
              <span className="dream-cost">{known ? `holds back ${pct(def.ward)} · ${def.burn}/min` : `learn ${fmt(def.cost)} nul`}</span>
              <span className="dream-good">+ {def.good}</span>
              <span className="dream-bad">− {def.bad}</span>
            </button>
          );
        })}
      </div>
      <p className="dim small-note">{fmt(de.burned)} dreams burned{de.badClicked ? ` · ${de.badClicked} bad ashes touched` : ''}{de.omensCaught ? ` · ${de.omensCaught} bright flakes caught` : ''}.</p>
    </section>
  );
}

/** A pixel iron cot, someone on it if the bed is taken, the dream rising off them while it burns. */
function Cot({ sleeper = false, burning = false }: { sleeper?: boolean; burning?: boolean }) {
  return (
    <svg className={`cot ${burning ? 'burning' : ''}`} viewBox="0 0 32 16" width="96" height="48" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="9" width="28" height="2" fill="currentColor" opacity="0.8" />
      <rect x="2" y="4" width="2" height="11" fill="currentColor" />
      <rect x="28" y="7" width="2" height="8" fill="currentColor" />
      <rect x="4" y="12" width="24" height="1" fill="currentColor" opacity="0.35" />
      {sleeper && <>
        <rect x="5" y="6" width="4" height="3" fill="currentColor" opacity="0.95" />
        <rect x="9" y="7" width="17" height="2" fill="currentColor" opacity="0.7" />
      </>}
      {burning && <>
        <rect className="cot-wisp w1" x="7" y="3" width="1" height="1" fill="var(--accent-ink)" />
        <rect className="cot-wisp w2" x="9" y="1" width="1" height="1" fill="var(--accent-ink)" />
        <rect className="cot-wisp w3" x="6" y="0" width="1" height="1" fill="var(--accent-ink)" />
      </>}
    </svg>
  );
}

/** Bad ashes and bright flakes from the Dream Engine. A bad ash is a warm flake that is very slightly wrong. */
export function Omen() {
  const o = useGame(st => st.game.dreams.omen);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const { items, spawn, burst } = useFloaters();
  const onClick = (e: MouseEvent) => {
    let got: 'bad' | 'bright' | null = null;
    run(s => { got = touchOmen(s); });
    if (got === 'bad') { spawn(e.clientX, e.clientY - 16, 'IT WAS NOT WARM', true); burst(e.clientX, e.clientY, 18, ['#2a2a2a', '#5b5340', '#000000', '#8a7a4a']); }
    if (got === 'bright') { spawn(e.clientX, e.clientY - 16, '+DREAMS', true); burst(e.clientX, e.clientY, 22, ['#a593ff', '#ffffff', '#e8c21c', '#dcd4ff']); }
  };
  return (
    <>
      {o.active && (
        <button className={`warm-flake omen omen-${o.kind} ${o.ttl < 2 ? 'fading' : ''}`} onClick={onClick}
          style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%` }} aria-label="Catch the flake">
          <span className="flake-body" style={o.kind === 'bright' ? { color: '#dcd4ff' } : { color: 'var(--warm)' }}>
            <Sprite rows={RARE_FLAKES[0]} px={3} />
          </span>
        </button>
      )}
      <FloaterLayer items={items} fixed />
    </>
  );
}
