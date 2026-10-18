// The Drowned Stair: the panel inside the zone 4 box, and the room behind it.
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  ashDropCost, BOON_TEXT, breedRate, candleCost, canChoose, canRope, choiceWeight, choose, descentSpeed, drawRate, dropAsh,
  dropEmbers, EMBER_DROP, haul, HUES, ITEMS, landingTime, lanterns, lowTide, net, netCost, pour, QUEUE_MAX, REFL_H, REFL_W,
  reflection, reflLeft, ropeCost, ropeWater, roomText, send, sightPow, spot, still, stillCost, TANK_MAX, tankMult, tide, tideTurn,
  WATERS, wishNeed, wishProgress, buyRope, bandOpen, stairMult, type Item, type Lantern, type PerkId, type StairState, type WishKind,
} from '../../game/challenges/stair';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import type { GameState } from '../../game/state';
import { Artwork } from '../Artwork';
import { ZONE_COLORS } from '../colors';
import type { Scene } from '../scenes';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
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

// ---- the room: the stair on the left, the bucket and the wishes in the middle, the tank and the reflections on the right ----

const PERK_TEXT: Record<PerkId, (w: number) => string> = {
  ...(Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.text])) as Record<Item, (w: number) => string>),
  candle: w => `Old candles: Rampant Wells x${(1 + 0.05 * tapUi(w)).toFixed(2)}`,
  steps: w => `Walks x${(1 + 0.1 * tapUi(w)).toFixed(2)} faster`,
};
const tapUi = (w: number) => (w <= 16 ? w : 16 * Math.sqrt(w / 16));
const PERK_SHORT: Record<PerkId, string> = { ash: 'Ash', zone3: 'Wells', water: 'Water', breed: 'Breed', wish: 'Wishes', eye: 'Sight', candle: 'Candles', steps: 'Steps' };

/** 8x8 pixel glyphs for what the rooms hold, and for the walk and the candle. */
const GLYPHS: Record<PerkId, string[]> = {
  ash: ['........', '.###....', '#...#...', '#...####', '#...#.#.', '.###..#.', '........', '........'],
  zone3: ['.######.', '..#..#..', '.#....#.', '.#.#.##.', '.##.#.#.', '.#....#.', '.######.', '........'],
  water: ['........', '.######.', '.#.#..#.', '.#.#.##.', '.#.#..#.', '.#.#.##.', '.######.', '........'],
  breed: ['........', '........', '.##.....', '.##.....', '.###....', '.######.', '.######.', '........'],
  wish: ['..####..', '.#....#.', '#..##..#', '#.#....#', '#..##..#', '#....#.#', '.#.##.#.', '..####..'],
  eye: ['########', '#......#', '#....#.#', '#..#...#', '#.###..#', '######.#', '########', '........'],
  steps: ['......##', '......#.', '....###.', '....#...', '..###...', '..#.....', '###.....', '........'],
  candle: ['...#....', '..##....', '...#....', '..###...', '..###...', '..###...', '.#####..', '........'],
};
function Glyph({ id, className }: { id: PerkId; className?: string }) {
  const g = GLYPHS[id];
  return (
    <svg className={`st-glyph ${className ?? ''}`} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {g.flatMap((row, y) => [...row].map((c, x) => c === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null))}
    </svg>
  );
}

/** A small checker pattern for an SVG, in the zone's ink (CSS colours it by class). */
const Dith = ({ id, cls, sparse = false }: { id: string; cls: string; sparse?: boolean }) => (
  <pattern id={id} width={sparse ? 4 : 2} height={sparse ? 4 : 2} patternUnits="userSpaceOnUse">
    <rect width="1" height="1" className={cls} />{!sparse && <rect x="1" y="1" width="1" height="1" className={cls} />}
  </pattern>
);

/** The stair in section: ledges switching back down the shaft, the walker on the flight, the tide over the low ones. */
function StairSection({ st, tideV }: { st: StairState; tideV: number }) {
  const LEVELS = 10, W = 320, H = 150;
  const first = Math.max(0, st.landing - 7); // the landing on the top level
  const yOf = (i: number) => 10 + i * 13.5;
  const side = (n: number) => (n % 2 ? 1 : -1); // odd landings on the right
  const ledge = (n: number) => { const s = side(n); return { x0: s > 0 ? 196 : 52, x1: s > 0 ? 268 : 124, inner: s > 0 ? 196 : 124, outer: s > 0 ? 268 : 52 }; };
  const waiting = new Set(st.queue.map(r => r.n));
  const candled = new Set(st.stairLog.filter(e => e.text.includes('candle')).map(e => e.n));
  const lowSeen = new Set(st.stairLog.filter(e => e.text.startsWith('Below')).map(e => e.n));
  const water = 112 + (1 - tideV) * 30;
  const full = st.queue.length >= QUEUE_MAX;
  const k = st.sent && !full ? Math.min(1, st.walk / landingTime(st.landing)) : 0;
  const flight = (n: number) => { // from landing n's inner end down to landing n+1's inner end, in five steps
    const a = ledge(n), b = ledge(n + 1), i = n - first, y0 = yOf(i), y1 = yOf(i + 1);
    const pts: string[] = [];
    for (let s = 0; s <= 5; s++) {
      const x = a.inner + ((b.inner - a.inner) * s) / 5, y = y0 + ((y1 - y0) * s) / 5;
      pts.push(`${x},${y}`);
      if (s < 5) pts.push(`${a.inner + ((b.inner - a.inner) * (s + 1)) / 5},${y}`);
    }
    return pts.join(' ');
  };
  return (
    <svg className="st-section" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The stair: ${st.landing} landings down`}>
      <defs>
        <Dith id="st-d-stone" cls="st-d-stone" sparse />
        <Dith id="st-d-water" cls="st-d-water" />
      </defs>
      <rect x="0" y="0" width="40" height={H} fill="url(#st-d-stone)" />
      <rect x={W - 40} y="0" width="40" height={H} fill="url(#st-d-stone)" />
      <line x1="40" y1="0" x2="40" y2={H} className="st-wall" /><line x1="44" y1="0" x2="44" y2={H} className="st-wall thin" />
      <line x1={W - 40} y1="0" x2={W - 40} y2={H} className="st-wall" /><line x1={W - 44} y1="0" x2={W - 44} y2={H} className="st-wall thin" />
      {/* the water that is not water, its line moving with the tide */}
      <path d={`M44 ${water} ${Array.from({ length: 12 }, (_, j) => `Q${50 + j * 20} ${water + (j % 2 ? 3 : -3)} ${60 + j * 20} ${water}`).join(' ')} V${H} H44 Z`}
        className="st-water" fill="url(#st-d-water)" />
      {Array.from({ length: LEVELS - 1 }, (_, i) => {
        const n = first + i;
        const done = n < st.landing;
        return <polyline key={`f${n}`} points={flight(n)} className={`st-flight${done ? ' done' : n === st.landing && st.sent ? ' now' : ''}`} />;
      })}
      {Array.from({ length: LEVELS }, (_, i) => {
        const n = first + i, l = ledge(n), y = yOf(i);
        if (n === 0) return <g key="top"><line x1="44" y1={y} x2="124" y2={y} className="st-ledge done" /><text x="60" y={y - 3} className="st-num">MOUTH</text></g>;
        const cls = waiting.has(n) ? ' wait' : n <= st.landing ? ' done' : '';
        return (
          <g key={n} className={`st-landing${cls}${lowSeen.has(n) ? ' low' : ''}`}>
            <title>{`Landing ${n}${waiting.has(n) ? ': a room waits for an answer' : n <= st.landing ? ': reached' : ''}`}</title>
            <rect x={l.x0} y={y - 1} width={l.x1 - l.x0} height="3" className="st-ledge" />
            <text x={side(n) > 0 ? l.outer - 4 : l.outer + 4} y={y - 3.5} className="st-num" textAnchor={side(n) > 0 ? 'end' : 'start'}>{n}</text>
            {candled.has(n) && <path d={`M${l.inner + side(n) * 14} ${y - 1} v-5 m0 -1 v-2`} className="st-candle" />}
            {waiting.has(n) && <rect x={l.x0 - 3} y={y - 5} width={l.x1 - l.x0 + 6} height="10" className="st-wait-ring" />}
          </g>
        );
      })}
      {/* the one walking down */}
      {st.sent && st.landing - first < LEVELS - 1 && (() => {
        const a = ledge(st.landing), b = ledge(st.landing + 1), i = st.landing - first;
        const x = a.inner + (b.inner - a.inner) * k, y = yOf(i) + (yOf(i + 1) - yOf(i)) * k;
        return <g className="st-walker"><title>{full ? 'Waiting: answer the rooms first' : 'Walking down'}</title><rect x={x - 1.5} y={y - 9} width="3" height="8" /><circle cx={x + 3} cy={y - 8} r="1.6" className="st-lamp" /></g>;
      })()}
    </svg>
  );
}

/** The room at the front of the queue, with its three answers; or the walk; or nobody yet. */
function RoomCard({ game }: { game: GameState }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair, r = st.queue[0];
  if (!st.sent) return (
    <div className="st-card idle">
      <p className="st-card-text">Nobody has gone down yet.</p>
      <button className="st-btn" onClick={() => run(send)} title="They open one small room a landing, and you choose what they do there">Send someone down</button>
    </div>
  );
  if (!r) return (
    <div className="st-card idle">
      <span className="st-card-n">Walking down</span>
      <p className="st-card-text">Landing {st.landing + 1} in {dur((landingTime(st.landing) - st.walk) / descentSpeed(game))}.</p>
    </div>
  );
  const item = ITEMS[r.item], w = r.low ? 2 : 1;
  return (
    <div className={`st-card${r.low ? ' low' : ''}`}>
      <div className="st-card-top">
        <Glyph id={r.item} className="big" />
        <div className="st-card-words">
          <span className="st-card-n">Landing {r.n}{r.low ? ' · below the waterline' : ''}{st.queue.length > 1 ? <i> · +{st.queue.length - 1} waiting</i> : ''}</span>
          <p className="st-card-text">{roomText(r)} There is {item.name}.</p>
        </div>
      </div>
      <div className="st-answers">
        <button className="st-btn" onClick={() => run(s => choose(s, 'take'))} title={`Take it: ${item.text(perkW(st, r.item) + w)}`}>Take it</button>
        <button className="st-btn" onClick={() => run(s => choose(s, 'leave'))} title={`Leave it: walks ${Math.round(10 * w)}% faster`}>Leave it</button>
        <button className="st-btn" disabled={!canChoose(game, 'candle')} onClick={() => run(s => choose(s, 'candle'))}
          title={`Light a candle and take it twice over: ${item.text(perkW(st, r.item) + choiceWeight(r, 'candle'))}`}>Candle <span className="st-cost">{candleCost(r.n)} warm</span></button>
      </div>
    </div>
  );
}

/** The log of the stair, a page of three at a time. */
function StairLog({ st }: { st: StairState }) {
  const [page, setPage] = useState(0);
  const per = 3, pages = Math.max(1, Math.ceil(st.stairLog.length / per)), pg = Math.min(page, pages - 1);
  const rows = st.stairLog.slice(pg * per, pg * per + per);
  return (
    <div className="st-log">
      <div className="st-log-head">
        <span className="st-log-no">{pg === 0 ? 'newest' : `page ${pg + 1} of ${pages}`}</span>
        <div className="st-turn">
          <button className="st-pm" disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="Newer entries">‹</button>
          <button className="st-pm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Older entries">›</button>
        </div>
      </div>
      {rows.length ? rows.map((e, i) => <p key={pg * per + i} className="st-log-row" title={e.text}><b>{e.n}</b>{e.text}</p>)
        : <p className="st-log-row dim">The log is empty.</p>}
    </div>
  );
}

/** One tide, high to high, with now on it and the low-rooms mark. */
function TideGauge({ game }: { game: GameState }) {
  const v = tide(game), ph = (game.challenges.stair.t % TIDE_LEN) / TIDE_LEN;
  const W = 200, H = 40, y = (t: number) => 5 + (1 - t) * 30;
  const pts = Array.from({ length: 41 }, (_, i) => `${(i / 40) * W},${y(0.5 + 0.5 * Math.cos(TAU * (i / 40)))}`).join(' ');
  return (
    <svg className="st-tide-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden preserveAspectRatio="none">
      <defs><Dith id="st-d-tide" cls="st-d-water" /></defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#st-d-tide)" className="st-tide-fill" />
      <polyline points={pts} className="st-tide-line" />
      <line x1="0" y1={y(0.25)} x2={W} y2={y(0.25)} className="st-tide-low" />
      <line x1={ph * W} y1="0" x2={ph * W} y2={H} className="st-tide-now" />
      <circle cx={ph * W} cy={y(v)} r="3" className="st-tide-dot" />
    </svg>
  );
}
const TIDE_LEN = 7 * 3600;

/** A vial of one kind of water: how much the bucket has brought up. Click to pour it all into the well. */
function Vial({ game, k }: { game: GameState; k: number }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair, w = WATERS[k], open = bandOpen(game, k), v = st.water[k];
  const lvl = open ? Math.min(1, Math.log10(1 + v) / 3) : 0;
  const Name = w.name[0].toUpperCase() + w.name.slice(1);
  return (
    <button className={`st-vial${open ? '' : ' shut'}`} disabled={!open || v < 1} onClick={() => run(s => pour(s, k))}
      title={open ? `${Name} water. ${w.desc} Click to pour it all into the well.` : `${Name} water, ${w.at} m down. ${w.desc}`}>
      <span className="st-glass"><i style={{ height: `${lvl * 100}%` }} /></span>
      <span className="st-vial-txt">
        <small className="st-vial-name">{w.name}</small>
        <b>{open ? num(v) : '··'}</b>
        <small>{open ? `+${(drawRate(game, k) * 60).toFixed(1)}/m` : `at ${w.at} m`}</small>
      </span>
    </button>
  );
}

/** A wish on a dial: the ring fills toward the next one, the count in the middle. */
function WishDial({ game, k }: { game: GameState; k: WishKind }) {
  const st = game.challenges.stair, p = wishProgress(game, k);
  const R = 26, C = TAU * R;
  const how = k === 'water' ? 'Pour a vial into the well.' : k === 'ash' ? 'Drop ash into the well.' : 'Drop embers into the well.';
  return (
    <div className="st-wish" title={`${k} wishes: ${BOON_TEXT[k]} ${st.boons[k]} granted. ${how}`}>
      <svg viewBox="0 0 70 70" className="st-wish-dial" aria-hidden>
        <circle cx="35" cy="35" r={R} className="st-dial-track" />
        <circle cx="35" cy="35" r={R} className="st-dial-arc" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 35 35)" />
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * TAU, r1 = R + 4, r2 = R + (i % 4 === 0 ? 8 : 6);
          return <line key={i} x1={35 + Math.sin(a) * r1} y1={35 - Math.cos(a) * r1} x2={35 + Math.sin(a) * r2} y2={35 - Math.cos(a) * r2} className="st-dial-tick" />;
        })}
        <text x="35" y="41" className="st-dial-num">{st.boons[k]}</text>
      </svg>
      <span className="st-wish-name">{k}</span>
      <span className="st-wish-of">{fmt(Math.floor(st.since[k]))} / {fmt(wishNeed(st.boons[k], k))}</span>
    </div>
  );
}

const SWATCH = ['#ff4a3a', '#56d88e', '#ece6d2', '#e8c45a', '#6a9cff'];

function StairRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const st = game.challenges.stair;
  const wc = ropeWater(st.rope), next = WATERS.find(w => w.at > st.rope);
  const tv = tide(game), rising = (st.t % TIDE_LEN) > TIDE_LEN / 2;
  const tideWord = tv > 0.75 ? 'High tide' : tv < 0.25 ? 'Low tide' : rising ? 'Tide rising' : 'Tide falling';
  const ac = ashDropCost(game);
  const showEmbers = st.since.embers > 0 || st.boons.embers > 0 || game.embers >= EMBER_DROP;
  const perks = (Object.keys(PERK_TEXT) as PerkId[]).filter(p => perkW(st, p));
  const status = (
    <RoomStatus
      stats={[
        { label: 'Warm water', value: num(st.water[0]), rate: `+${(drawRate(game, 0) * 60).toFixed(1)}/m`, title: WATERS[0].desc },
        { label: 'Rope', value: `${st.rope} m`, rate: next ? `${next.name} at ${next.at} m` : 'all bands open' },
        { label: 'Landing', value: st.landing >= 12 ? st.landing : `${st.landing}/12`,
          rate: !st.sent ? 'nobody sent' : st.queue.length ? `${st.queue.length} waiting` : 'walking down' },
        { label: 'Wishes', value: st.wishes >= 3 ? st.wishes : `${st.wishes}/3`, rate: 'granted' },
        { label: 'Rampant Wells', value: `x${stairMult(st, 'zone3').toFixed(2)}`, rate: 'from the stair', title: 'Perks, wishes, the tank and the reflections together' },
      ]}
      buy={{
        label: 'Lengthen rope', cost: ropeCost(game), unit: `ash · ${wc} warm`, afford: canRope(game), onClick: () => run(buyRope),
        title: `Also takes ${wc} warm water (you have ${Math.floor(st.water[0])}). Deeper draws more.`,
      }}
    />
  );
  return (
    <ChallengeRoom zone={ZONE} title="The Drowned Stair" note="It turns left, forever." onClose={onClose}
      className="stair-room" status={status}>
      <div className="st-grid">
        {/* ---- the stair ---- */}
        <section className="st-col" aria-label="The stair">
          <div className="st-head"><span className="st-cap">"THE STAIR"</span><span className="st-head-note">{st.candles} {st.candles === 1 ? 'candle' : 'candles'} lit</span></div>
          <div className="st-frame st-section-frame"><StairSection st={st} tideV={tv} /></div>
          <RoomCard game={game} />
          {perks.length > 0 && (
            <div className="st-perks" aria-label="What the stair has left you">
              {perks.map(p => {
                const text = PERK_TEXT[p](perkW(st, p));
                return <span key={p} className="st-perk" title={text}><Glyph id={p} /><small>{PERK_SHORT[p]}</small><b>{text.match(/x[\d.]+/)?.[0]}</b></span>;
              })}
            </div>
          )}
          <StairLog st={st} />
        </section>

        {/* ---- the bucket and the wishes ---- */}
        <section className="st-col" aria-label="The well">
          <div className="st-head"><span className="st-cap">"THE BUCKET"</span><span className="st-head-note">{st.rope} m of rope</span></div>
          <div className="st-well-row">
            <Well st={st} />
          </div>
          <div className="st-tide" title={`One tide, high to high, is seven hours. Draws x${(0.7 + 0.6 * tv).toFixed(2)} now. Below the dashed line the low rooms open on the stair.`}>
            <TideGauge game={game} />
            <div className="st-tide-words">
              <b className={lowTide(game) ? 'low' : ''}>{tideWord}</b>
              <span>x{(0.7 + 0.6 * tv).toFixed(2)} · turns {dur(tideTurn(game))}</span>
            </div>
            <button className="st-btn st-haul" onClick={() => run(haul)} title="Turn the winch by hand: a few seconds of drawing at once">Haul</button>
          </div>
          <div className="st-vials">{WATERS.map((_, k) => <Vial key={k} game={game} k={k} />)}</div>

          <div className="st-head" title="The well remembers everything dropped in. Each thing fills its own wish.">
            <span className="st-cap">"THE WISHES"</span><span className="st-head-note">{st.wishes} granted</span>
          </div>
          <div className="st-wishes">
            <div className="st-dials">
              <WishDial game={game} k="ash" />
              {showEmbers && <WishDial game={game} k="embers" />}
              <WishDial game={game} k="water" />
            </div>
            <div className="st-drops">
              <button className="st-btn" disabled={game.ash.lt(ac)} onClick={() => run(dropAsh)} title="Drop ash into the well: fills the ash wish">Drop ash <span className="st-cost">{fmt(ac)}</span></button>
              <button className="st-btn" disabled={game.embers < EMBER_DROP} onClick={() => run(dropEmbers)} title="Drop embers into the well: fills the embers wish">Drop {EMBER_DROP} embers</button>
            </div>
          </div>
        </section>

        {/* ---- the tank and the reflections ---- */}
        <Tank game={game} />
      </div>
    </ChallengeRoom>
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

/** The right column: the tank of lanterns, then the reflection in the water. */
function Tank({ game }: { game: GameState }) {
  const run = useGame(st => st.run);
  const st = game.challenges.stair;
  const live = useRef<Lantern[]>([]);
  const all = lanterns(st);
  live.current = all.slice(-40);
  const scene = useMemo(() => tankScene(live), []);
  const c = netCost(game), br = breedRate(game), full = st.tank.length >= TANK_MAX;
  const breedNote = !st.tank.length ? 'empty' : full ? 'full · not breeding' : br > 0 ? `one more ~${dur(1 / br)}` : 'one alone will not breed';
  return (
    <section className="st-col" aria-label="The tank">
      <div className="st-head"><span className="st-cap">"THE TANK"</span><span className="st-head-note">{breedNote}</span></div>
      <Artwork scene={scene} ink={HUE} accent={RED} className="st-tank" />
      <div className="st-readouts">
        <span><b>{st.tank.length}<i>/{TANK_MAX}</i></b><small>lanterns</small></span>
        <span><b>{st.glow}</b><small>glow</small></span>
        <span title="Rampant Wells, from the tank"><b>x{tankMult(st).toFixed(2)}</b><small>wells</small></span>
      </div>
      <div className="st-net-row">
        <span className="st-hues" title="Colours in the tank: more colours, more glow">
          {HUES.map((h, i) => {
            const has = all.some(l => l.c === i);
            return <i key={h} className={has ? 'on' : ''} style={{ '--sw': SWATCH[i] } as CSSProperties} title={`${h}${has ? '' : ': none yet'}`} />;
          })}
        </span>
        {full ? <span className="st-line">The tank is full.</span> : bandOpen(game, 1)
          ? <button className="st-btn" disabled={st.water[1] < c} onClick={() => run(net)} title="Net one from the black water">Net a lantern <span className="st-cost">{c} black</span></button>
          : <span className="st-line">They swim in the black water, {WATERS[1].at} m down.</span>}
      </div>
      <Reflections game={game} />
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
    <>
      <div className="st-head" title="The station, somewhere it went differently. Click what is not the same on either side.">
        <span className="st-cap">"THE REFLECTION"</span><span className="st-head-note">{left ? `${left} not the same` : 'you have seen all of it'}</span>
      </div>
      <div className="st-refl">
        <ReflSide id={st.reflId} side={0} found={st.found} onSpot={onSpot} />
        <ReflSide id={st.reflId} side={1} found={st.found} onSpot={onSpot} />
      </div>
      <div className="st-refl-row">
        <span className="st-pips" title={`${st.found.length} of ${ref.diffs.length} differences found`}>
          {ref.diffs.map((_, i) => <i key={i} className={st.found.includes(i) ? 'on' : ''} />)}
        </span>
        <span className="st-seen" title="Every difference ever spotted adds to these">seen <b>{fmt(st.spots)}</b> · ash <b>x{(1 + 0.03 * sightPow(st)).toFixed(2)}</b> · wells <b>x{(1 + 0.04 * sightPow(st)).toFixed(2)}</b></span>
      </div>
      <div className="st-refl-row">
        <span className="st-line">New one in {dur(reflLeft(st))}</span>
        {bandOpen(game, 3) && <button className="st-btn" disabled={st.water[3] < sc} onClick={() => run(still)} title="Still the water for a new reflection now">Still it <span className="st-cost">{sc} singing</span></button>}
      </div>
    </>
  );
}
