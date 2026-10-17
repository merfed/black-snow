// The Drowned Stair: the panel inside the zone 4 box, and the room behind it.
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ashDropCost, BOON_TEXT, breedRate, candleCost, canChoose, canRope, choiceWeight, choose, descentSpeed, drawRate, dropAsh,
  dropEmbers, EMBER_DROP, haul, HUES, ITEMS, landingTime, lanterns, lowTide, net, netCost, pour, QUEUE_MAX, REFL_H, REFL_W,
  reflection, reflLeft, ropeCost, ropeWater, roomText, send, sightPow, spot, still, stillCost, TANK_MAX, tankMult, tide, tideTurn,
  WATERS, WISH_KINDS, wishNeed, wishProgress, buyRope, bandOpen, type Item, type Lantern, type PerkId, type StairState,
} from '../../game/challenges/stair';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import type { GameState } from '../../game/state';
import { Artwork } from '../Artwork';
import { ZONE_COLORS } from '../colors';
import type { Scene } from '../scenes';
import { ChallengeRoom } from './ChallengeSlot';
import './stair.css';

const ZONE = 3;
const HUE = ZONE_COLORS[ZONE];
const RED = '#ff2a2a';
const TAU = Math.PI * 2;

type G = CanvasRenderingContext2D;
const gray = (v: number) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${c},${c},${c})`; };
const rect = (g: G, x: number, y: number, w: number, h: number, v: number) => { g.fillStyle = gray(v); g.fillRect(x, y, w, h); };
function glow(g: G, x: number, y: number, r: number, v: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, gray(v));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}
const line = (g: G, x0: number, y0: number, x1: number, y1: number, v: number, lw = 1) => {
  g.strokeStyle = gray(v); g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
};

const dur = (sec: number) => {
  const m = Math.max(0, Math.ceil(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
};
const num = (v: number) => (v < 10 ? v.toFixed(1) : fmt(Math.floor(v)));

interface WellView { tide: number; rope: number; lanterns: Lantern[]; candles: number; sent: boolean; walk: number; waiting: boolean }

/** The well from above and the side: a stair down the left wall, the bucket on its rope, lit things in the water. */
function wellScene(live: { current: WellView }): Scene {
  const w = 160, h = 96;
  return {
    w, h,
    draw: (g, a, t) => {
      const v = live.current;
      const surf = 56 + (1 - v.tide) * 22;
      // shaft: dark inside, stone walls with courses
      rect(g, 0, 0, w, h, 0.04);
      for (let y = 0; y < h; y += 6) for (const [x0, x1] of [[0, 26], [134, w]]) {
        const off = (y / 6) % 2 ? 0 : 5;
        for (let x = x0 - off; x < x1; x += 10) rect(g, Math.max(x0, x), y, Math.min(9, x1 - Math.max(x0, x)), 5, 0.22 + 0.05 * Math.sin(x * 3 + y));
      }
      // the stair: ledges stepping down the left wall, turning out of sight
      for (let i = 0; i < 12; i++) {
        const y = 8 + i * 7, x = 26 + (i % 2) * 2;
        rect(g, x, y, 12, 2, 0.5 - i * 0.025);
        if (i < Math.min(8, v.candles)) { rect(a, x + 3 + (i * 5) % 7, y - 2, 1, 2, 1); glow(g, x + 3, y - 2, 4, 0.35); }
      }
      if (v.sent) {
        const k = v.waiting ? 11 : Math.min(11, Math.floor(v.walk * 12));
        const y = 8 + k * 7, x = 30 + (k % 2) * 2;
        rect(g, x, y - 5, 2, 5, 0.75);
        rect(a, x + 2, y - 4, 1, 1, 1);
        glow(g, x + 2, y - 4, 5, 0.4);
      }
      // the water, warm and moving
      for (let y = Math.floor(surf); y < h; y++) {
        const d = (y - surf) / (h - surf + 1);
        for (let x = 26; x < 134; x += 2) {
          const r = 0.18 + 0.08 * Math.sin(x * 0.18 + t * 1.3 + y * 0.4) * (1 - d) - d * 0.08;
          rect(g, x, y, 2, 1, r);
        }
      }
      line(g, 26, surf, 134, surf, 0.6 + 0.1 * Math.sin(t * 2));
      // lanterns
      v.lanterns.forEach((l, i) => {
        const sp = 0.15 + l.p * 0.08;
        const x = 30 + ((i * 37 + t * 8 * sp) % 100);
        const y = Math.min(h - 3, surf + 6 + ((i * 13) % Math.max(4, h - surf - 8)) + 2 * Math.sin(t * sp * 3 + i));
        glow(g, x, y, 3 + l.g, 0.25 + 0.12 * l.g);
        if (l.c === 0) rect(a, Math.round(x), Math.round(y), 1, 1, 1);
      });
      // the bucket on its rope
      if (v.rope > 0) {
        const bx = 104, by = Math.min(h - 6, 10 + (surf - 6) * Math.min(1.4, v.rope / 8)) + Math.sin(t * 1.6) * 1.2;
        line(g, bx + 3, 0, bx + 3, by, 0.7);
        rect(g, bx, by, 7, 5, by > surf ? 0.45 : 0.8);
        rect(g, bx + 1, by + 1, 5, 2, 0.15);
      }
      rect(g, 100, 0, 12, 3, 0.6);
    },
  };
}

function Well({ st }: { st: StairState }) {
  const live = useRef<WellView>(null!);
  const q = st.queue.length >= QUEUE_MAX;
  live.current = {
    tide: tideFrom(st), rope: st.rope, lanterns: lanterns(st).slice(-14), candles: st.candles, sent: st.sent,
    walk: st.walk / landingTime(st.landing), waiting: q,
  };
  const scene = useMemo(() => wellScene(live), []);
  return <Artwork scene={scene} ink={HUE} accent={RED} caption="“It is warm. It is not water.”" className="stair-well" />;
}
const tideFrom = (st: StairState) => 0.5 + 0.5 * Math.cos((TAU * st.t) / (7 * 3600));

/** The water held, one stat per open band. */
function Waters({ game }: { game: GameState }) {
  const st = game.challenges.stair;
  return (
    <div className="stair-waters">
      {WATERS.map((w, k) => bandOpen(game, k) && (
        <span key={w.name} className="ch-stat" title={w.desc}><b>{num(st.water[k])}</b> {w.name} <span className="dim">+{(drawRate(game, k) * 60).toFixed(1)}/m</span></span>
      ))}
    </div>
  );
}

function TideLine({ game }: { game: GameState }) {
  const v = tide(game), rising = (game.challenges.stair.t % (7 * 3600)) > 3.5 * 3600;
  const word = v > 0.75 ? 'High tide' : v < 0.25 ? 'Low tide' : rising ? 'Tide rising' : 'Tide falling';
  return (
    <p className="dim small-note stair-tide">
      {word} · draws x{(0.7 + 0.6 * v).toFixed(2)}{lowTide(game) ? ' · low rooms open on the stair' : ''} · turns in {dur(tideTurn(game))}
    </p>
  );
}

/** The room waiting at the front of the queue, with its three answers. */
function RoomChoice({ game, compact = false }: { game: GameState; compact?: boolean }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair, r = st.queue[0];
  if (!st.sent) return null;
  if (!r) return <p className="dim small-note">Walking down. Landing {st.landing + 1} in {dur((landingTime(st.landing) - st.walk) / descentSpeed(game))}.</p>;
  const item = ITEMS[r.item];
  const w = r.low ? 2 : 1;
  return (
    <div className={`stair-roomcard ${r.low ? 'low' : ''}`}>
      <p className="stair-roomtext">
        <span className="stair-n">Landing {r.n}{r.low ? ' · below the waterline' : ''}</span>
        {roomText(r)} There is {item.name}.
        {st.queue.length > 1 && <span className="dim"> ({st.queue.length - 1} more waiting)</span>}
      </p>
      <div className="ch-row">
        <button onClick={() => run(s => choose(s, 'take'))} title={item.text(perkW(st, r.item) + w)}>Take it</button>
        <button className="secondary" onClick={() => run(s => choose(s, 'leave'))} title={`Walks ${Math.round(10 * w)}% faster`}>Leave it</button>
        <button className="secondary" disabled={!canChoose(game, 'candle')} onClick={() => run(s => choose(s, 'candle'))}
          title={item.text(perkW(st, r.item) + choiceWeight(r, 'candle'))}>Candle and take · {candleCost(r.n)} warm</button>
      </div>
      {!compact && <p className="dim small-note">Take: {item.text(perkW(st, r.item) + w)}. Leave: walks faster. A candle lets you take it twice over, for warm water.</p>}
    </div>
  );
}
const perkW = (st: StairState, p: PerkId) => st.perks[p] ?? 0;

export function StairPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [open, setOpen] = useState(false);
  const st = game.challenges.stair;
  const cost = ropeCost(game), wc = ropeWater(st.rope);
  const next = WATERS.find(w => w.at > st.rope);
  return (
    <div className="stair-panel">
      <Well st={st} />
      {st.rope === 0 ? (
        <>
          <p className="dim small-note">A bucket on a rope, and a long way down to something warm.</p>
          <button className="max-all" disabled={game.ash.lt(cost)} onClick={() => run(buyRope)}>Lower the bucket · {fmt(cost)} ash</button>
        </>
      ) : (
        <>
          <Waters game={game} />
          <TideLine game={game} />
          <div className="ch-row">
            <button disabled={!canRope(game)} onClick={() => run(buyRope)}
              title={next ? `${next.name} water at ${next.at} m` : 'Deeper draws more'}>Lengthen rope ({st.rope} m) · {fmt(cost)} · {wc} warm</button>
            <button className="secondary" onClick={() => run(haul)}>Haul</button>
          </div>
          {next && <p className="dim small-note">{next.name[0].toUpperCase() + next.name.slice(1)} water at {next.at} m.</p>}
          {!st.sent
            ? <button className="max-all" onClick={() => run(send)}>Send someone down the stair</button>
            : <RoomChoice game={game} compact />}
          <button className="max-all" onClick={() => setOpen(true)}>Look into the well</button>
        </>
      )}
      {open && <StairRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---- the room ----

const PERK_TEXT: Record<PerkId, (w: number) => string> = {
  ...(Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.text])) as Record<Item, (w: number) => string>),
  candle: w => `Old candles: Rampant Wells x${(1 + 0.05 * tapUi(w)).toFixed(2)}`,
  steps: w => `Walks x${(1 + 0.1 * tapUi(w)).toFixed(2)} faster`,
};
const tapUi = (w: number) => (w <= 16 ? w : 16 * Math.sqrt(w / 16));

function StairRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const st = game.challenges.stair;
  return (
    <ChallengeRoom zone={ZONE} title="The Drowned Stair" note="It turns left, forever." onClose={onClose}
      stat={<>landing <b>{st.landing}</b> · wishes <b>{st.wishes}</b> · lanterns <b>{st.tank.length}</b></>} className="stair-room">
      <div className="stair-grid">
        <section className="stair-sec">
          <h3 className="sub-head">The stair</h3>
          {st.sent ? <RoomChoice game={game} /> : <p className="dim small-note">Nobody has gone down yet.</p>}
          <div className="stair-perks">
            {(Object.keys(PERK_TEXT) as PerkId[]).filter(p => perkW(st, p)).map(p => <span key={p} className="ch-stat">{PERK_TEXT[p](perkW(st, p))}</span>)}
          </div>
          <ol className="stair-log" data-scroll>
            {st.stairLog.map((e, i) => <li key={i}><span className="stair-n">{e.n}</span> {e.text}</li>)}
            {!st.stairLog.length && <li className="dim">The log is empty.</li>}
          </ol>
        </section>
        <Wishes game={game} />
        <Tank game={game} />
        <Reflections game={game} />
      </div>
    </ChallengeRoom>
  );
}

function Wishes({ game }: { game: GameState }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair;
  const ac = ashDropCost(game);
  return (
    <section className="stair-sec">
      <h3 className="sub-head">Wishes</h3>
      <p className="dim small-note">The well remembers everything dropped in. Each thing fills its own wish.</p>
      {WISH_KINDS.map(k => (k !== 'embers' || st.since.embers > 0 || st.boons.embers > 0 || game.embers >= EMBER_DROP) && (
        <div key={k} className="stair-wish">
          <p className="ch-stat"><b>{k}</b> {fmt(Math.floor(st.since[k]))} / {fmt(wishNeed(st.boons[k], k))} <span className="dim">· {st.boons[k]} granted</span></p>
          <div className="stair-meter"><span style={{ width: `${wishProgress(game, k) * 100}%` }} /></div>
        </div>
      ))}
      <div className="ch-row">
        <button disabled={game.ash.lt(ac)} onClick={() => run(dropAsh)}>Drop ash · {fmt(ac)}</button>
        <button disabled={game.embers < EMBER_DROP} onClick={() => run(dropEmbers)}>Drop {EMBER_DROP} embers</button>
      </div>
      <div className="ch-row">
        {WATERS.map((w, k) => bandOpen(game, k) && (
          <button key={w.name} className="secondary" disabled={st.water[k] < 1} onClick={() => run(s => pour(s, k))}>Pour {w.name} ({Math.floor(st.water[k])})</button>
        ))}
      </div>
      <div className="stair-perks">
        {WISH_KINDS.filter(k => st.boons[k]).map(k => (
          <span key={k} className="ch-stat"><b>{k}</b> {BOON_TEXT[k]} <span className="dim">({st.boons[k]})</span></span>
        ))}
      </div>
    </section>
  );
}

function tankScene(live: { current: Lantern[] }): Scene {
  const w = 160, h = 56;
  return {
    w, h,
    draw: (g, a, t) => {
      rect(g, 0, 0, w, h, 0.05);
      for (let x = 0; x < w; x += 2) rect(g, x, h - 4 + Math.round(Math.sin(x * 0.3) * 1.5), 2, 6, 0.2);
      live.current.forEach((l, i) => {
        const sp = 0.1 + 0.06 * l.p;
        const x = (i * 29 + t * 10 * sp * (i % 2 ? 1 : -1)) % w, xx = x < 0 ? x + w : x;
        const y = 8 + ((i * 17) % (h - 16)) + 3 * Math.sin(t * sp * 4 + i);
        glow(g, xx, y, 2 + l.g, 0.25 + 0.12 * l.g);
        if (l.c === 0) rect(a, Math.round(xx), Math.round(y), 1, 1, 1);
      });
    },
  };
}

function Tank({ game }: { game: GameState }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair;
  const live = useRef<Lantern[]>([]);
  const all = lanterns(st);
  live.current = all.slice(-40);
  const scene = useMemo(() => tankScene(live), []);
  const c = netCost(game), br = breedRate(game), full = st.tank.length >= TANK_MAX;
  const hues = HUES.filter((_, i) => all.some(l => l.c === i));
  return (
    <section className="stair-sec">
      <h3 className="sub-head">The tank</h3>
      <Artwork scene={scene} ink={HUE} accent={RED} className="stair-tank" />
      <p className="ch-stat"><b>{st.tank.length}</b>/{TANK_MAX} lanterns · glow <b>{st.glow}</b> · Rampant Wells <b>x{tankMult(st).toFixed(2)}</b></p>
      {st.tank.length > 0 && <p className="dim small-note">Colours: {hues.join(', ')}. {full ? 'The tank is full. They have stopped breeding.' : br > 0 ? `One more about every ${dur(1 / br)}.` : 'One alone will not breed.'}</p>}
      {full ? null : bandOpen(game, 1)
        ? <button disabled={st.water[1] < c} onClick={() => run(net)}>Net a lantern · {c} black water</button>
        : <p className="dim small-note">They swim in the black water, {WATERS[1].at} m down.</p>}
    </section>
  );
}

/** One side of a reflection: the station, its features, and rings round what has been spotted. */
function reflScene(id: number, side: 0 | 1, found: { current: number[] }): Scene {
  const ref = reflection(id);
  const r = (k: number) => { const x = Math.sin(id * 97.1 + k * 13.7) * 43758.5; return x - Math.floor(x); };
  const horizon = 48 + Math.floor(r(1) * 8), bx = 20 + Math.floor(r(2) * 40), bw = 22 + Math.floor(r(3) * 12), bh = 14 + Math.floor(r(4) * 8);
  const mast = bx + Math.floor(r(5) * bw);
  const feat = (g: G, f: { x: number; y: number; kind: number }) => {
    if (f.kind === 0) rect(g, f.x - 1, f.y - 1, 3, 3, 0.95);
    else if (f.kind === 1) { rect(g, f.x - 1, f.y - 4, 2, 8, 0.85); rect(g, f.x - 1, f.y - 6, 2, 2, 0.95); }
    else if (f.kind === 2) { g.fillStyle = gray(0.9); g.beginPath(); g.arc(f.x, f.y, 3, 0, TAU); g.fill(); }
    else if (f.kind === 3) { rect(g, f.x, f.y - 4, 1, 8, 0.8); rect(g, f.x - 2, f.y - 2, 5, 1, 0.8); }
    else { line(g, f.x - 3, f.y - 2, f.x, f.y, 0.85); line(g, f.x, f.y, f.x + 3, f.y - 2, 0.85); }
  };
  return {
    w: REFL_W, h: REFL_H,
    draw: (g, a, t) => {
      const gr = g.createLinearGradient(0, 0, 0, horizon);
      gr.addColorStop(0, gray(0.08)); gr.addColorStop(1, gray(0.34));
      g.fillStyle = gr; g.fillRect(0, 0, REFL_W, horizon);
      rect(g, 0, horizon, REFL_W, REFL_H - horizon, 0.16);
      rect(g, bx, horizon - bh, bw, bh, 0.05);
      rect(g, mast, horizon - bh - 16, 1, 16, 0.05);
      for (let y = horizon + 2; y < REFL_H; y += 3) rect(g, 0, y, REFL_W, 1, 0.12 + 0.04 * Math.sin(t * 1.5 + y));
      for (const f of ref.common) feat(g, f);
      ref.diffs.forEach((d, i) => {
        if (d.side === side) feat(g, d.f);
        if (found.current.includes(i)) { a.strokeStyle = '#fff'; a.lineWidth = 1; a.beginPath(); a.arc(d.f.x, d.f.y, 6, 0, TAU); a.stroke(); }
      });
    },
  };
}

function ReflSide({ id, side, found, onSpot }: { id: number; side: 0 | 1; found: number[]; onSpot: (x: number, y: number) => void }) {
  const live = useRef(found);
  live.current = found;
  const scene = useMemo(() => reflScene(id, side, live), [id, side]);
  const click = (e: MouseEvent<HTMLDivElement>) => {
    const c = e.currentTarget.querySelector('canvas');
    if (!c) return;
    const b = c.getBoundingClientRect();
    onSpot(((e.clientX - b.left) / b.width) * REFL_W, ((e.clientY - b.top) / b.height) * REFL_H);
  };
  return <div className="stair-reflside" data-nodrag onClick={click}><Artwork scene={scene} ink={HUE} accent={RED} /></div>;
}

function Reflections({ game }: { game: GameState }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair;
  const ref = reflection(st.reflId);
  const left = ref.diffs.length - st.found.length;
  const onSpot = (x: number, y: number) => run(s => spot(s, x, y));
  const sc = stillCost(game);
  return (
    <section className="stair-sec">
      <h3 className="sub-head">Reflections</h3>
      <p className="dim small-note">The station, somewhere it went differently. {left ? `${left} things are not the same.` : 'You have seen all of it.'}</p>
      <div className="stair-refl">
        <ReflSide id={st.reflId} side={0} found={st.found} onSpot={onSpot} />
        <ReflSide id={st.reflId} side={1} found={st.found} onSpot={onSpot} />
      </div>
      <p className="ch-stat">Seen <b>{fmt(st.spots)}</b> · all ash <b>x{(1 + 0.03 * sightPow(st)).toFixed(2)}</b> · Rampant Wells <b>x{(1 + 0.04 * sightPow(st)).toFixed(2)}</b></p>
      <div className="ch-row">
        <span className="dim small-note stair-inline">A new one forms in {dur(reflLeft(st))}.</span>
        {bandOpen(game, 3) && <button className="secondary" disabled={st.water[3] < sc} onClick={() => run(still)}>Still the water · {sc} singing</button>}
      </div>
    </section>
  );
}
