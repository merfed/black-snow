// The Survey: the panel inside the zone 1 box. A small snow map and the rack inline; the core puzzle and
// the full map in a room.
import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  buyRack, CORE_EVERY, coreMult, density, headCost, KINDS_PER, loreText, MAP_H, MAP_W, moveHead, openCore, placeHead,
  rackCost, rackSize, RUN, STRATA, stratum, surveyAsh, surveyRate, swapBands, tileDensity, zoneBonus,
} from '../../game/challenges/survey';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom } from './ChallengeSlot';
import './survey.css';

type RGB = [number, number, number];
const ZONE = 0;
const HUE = hex(ZONE_COLORS[ZONE]);
const BG: RGB = [7, 8, 12];
const RED: RGB = [255, 42, 42];
const WHITE: RGB = [240, 236, 226];
const mixc = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const RAMP: RGB[] = [mixc(HUE, BG, 0.92), mixc(HUE, BG, 0.7), mixc(HUE, BG, 0.4), HUE, mixc(HUE, WHITE, 0.55)];
const CELL = 8; // dither cells per map tile

const hash = (a: number, b: number) => {
  let x = Math.imul(a ^ Math.imul(b, 0x27d4eb2d), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
};

/** Footprints that are not ours: now and then a line of them crosses the field and fills in slowly. */
function footprints(seed: number, clock: number): { x: number; y: number; k: number }[] {
  const WIN = 150, k = Math.floor(clock / WIN), into = clock - k * WIN;
  if (hash(seed, k) > 0.4) return [];
  const w = MAP_W * CELL, h = MAP_H * CELL;
  const edge = (r: number, side: number): [number, number] =>
    side === 0 ? [r * w, -2] : side === 1 ? [w + 2, r * h] : side === 2 ? [r * w, h + 2] : [-2, r * h];
  const s0 = Math.floor(hash(seed, k * 3 + 1) * 4);
  const [ax, ay] = edge(hash(seed, k * 5 + 2), s0);
  const [bx, by] = edge(hash(seed, k * 7 + 3), (s0 + 2) % 4);
  const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 4);
  const nx = -(by - ay) / len, ny = (bx - ax) / len;
  const walked = Math.min(1, into / 70), fade = into > 70 ? 1 - (into - 70) / (WIN - 70) : 1;
  const out: { x: number; y: number; k: number }[] = [];
  for (let j = 0; j < n * walked; j++) {
    const t = j / n, side = j % 2 ? 1.2 : -1.2;
    out.push({ x: Math.round(ax + (bx - ax) * t + nx * side), y: Math.round(ay + (by - ay) * t + ny * side), k: fade * (0.6 + 0.4 * t) });
  }
  return out;
}

/** The snow map: how thick the ash falls, dithered, with the bore heads on it. Low fps, pauses off screen. */
const SnowMap = memo(function SnowMap({ className, selected = -1, hover = -1, onTile, onHover }: {
  className?: string; selected?: number; hover?: number; onTile?: (tile: number) => void; onHover?: (tile: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ selected, hover });
  live.current = { selected, hover };
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const w = MAP_W * CELL, h = MAP_H * CELL;
    const img = g.createImageData(w, h);
    const d = img.data;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const set = (x: number, y: number, col: RGB) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    };
    const draw = (ms: number) => {
      if (ms - last >= 1000 / 8) {
        last = ms;
        const v = useGame.getState().game.challenges.survey;
        const t = ms / 1000;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dn = density(v.seed, v.clock, (x + 0.5) / CELL - 0.5, (y + 0.5) / CELL - 0.5);
          let b = Math.min(1, (dn - 0.25) / 1.5) * 0.85 + 0.05;
          // falling flakes, thicker where the ash is thicker
          if (hash(x * 131 + Math.floor(y - t * 6) * 7, 99) < 0.012 * dn) b += 0.45;
          const edge = (x % CELL === 0 || y % CELL === 0) && ((x + y) & 1) === 0;
          if (edge) b = Math.max(b, 0.22);
          const lv = Math.max(0, Math.min(RAMP.length - 1, b * (RAMP.length - 1)));
          const lo = Math.floor(lv);
          set(x, y, RAMP[Math.min(RAMP.length - 1, lo + (lv - lo > threshold(x, y) ? 1 : 0))]);
        }
        // the bore and its lamp, at the middle of the field
        const bx = w / 2, by = h / 2;
        for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
          const r = Math.hypot(x, y);
          if (r < 1.6) set(bx + x, by + y, BG);
          else if (r < 3.2 && ((x + y) & 1) === 0) set(bx + x, by + y, RAMP[4]);
        }
        for (const p of footprints(v.seed, v.clock)) if (p.k > threshold(p.x, p.y)) { set(p.x, p.y, RED); set(p.x + 1, p.y, RED); }
        const { selected: sel, hover: hov } = live.current;
        const frame = (tile: number, col: RGB, dash: boolean) => {
          const x0 = (tile % MAP_W) * CELL, y0 = Math.floor(tile / MAP_W) * CELL;
          for (let k = 0; k < CELL; k++) {
            if (dash && k % 2) continue;
            set(x0 + k, y0, col); set(x0 + k, y0 + CELL - 1, col); set(x0, y0 + k, col); set(x0 + CELL - 1, y0 + k, col);
          }
        };
        for (const tile of v.heads) {
          // a little derrick: an A-frame over a dark hole
          const x0 = (tile % MAP_W) * CELL + 4, y0 = Math.floor(tile / MAP_W) * CELL + 1;
          for (let k = 0; k < 5; k++) { set(x0 - Math.floor(k / 2), y0 + k, WHITE); set(x0 + Math.floor(k / 2), y0 + k, WHITE); }
          set(x0 - 1, y0 + 3, WHITE); set(x0 + 1, y0 + 3, WHITE); set(x0, y0 + 5, BG); set(x0, y0 + 4, BG);
        }
        if (hov >= 0) frame(hov, RAMP[4], true);
        if (sel >= 0 && Math.floor(t * 3) % 2 === 0) frame(sel, RED, false);
        g.putImageData(img, 0, 0);
      }
      if (visible && !still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && !still) raf = requestAnimationFrame(draw);
      });
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, []);
  const tileAt = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * MAP_W), y = Math.floor((e.clientY - r.top) / r.height * MAP_H);
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? y * MAP_W + x : -1;
  };
  return (
    <canvas ref={ref} width={MAP_W * CELL} height={MAP_H * CELL} className={`survey-map ${className ?? ''}`} data-nodrag
      onPointerDown={onTile ? e => { const t = tileAt(e); if (t >= 0) onTile(t); } : undefined}
      onPointerMove={onHover ? e => onHover(tileAt(e)) : undefined}
      onPointerLeave={onHover ? () => onHover(-1) : undefined} />
  );
});

/* ---------- the core ---------- */

const BAND_W = 40, BAND_H = 8, SLOTS = RUN * KINDS_PER;

/** How each stratum looks in the core: a brightness pattern, dithered in its own ink. */
function bandShade(id: string, x: number, y: number): number {
  const n = hash(x * 17 + y * 911, id.length * 31 + id.charCodeAt(0));
  switch (id) {
    case 'ash': return 0.35 + 0.4 * n;
    case 'glass': return ((x + y * 2) % 7 < 2 ? 0.95 : 0.3);
    case 'salt': return n < 0.1 ? 0.3 : 0.8;
    case 'rust': return 0.5 + 0.35 * Math.sin(x * 0.5 + y * 1.3);
    case 'peat': return 0.2 + 0.25 * n;
    case 'road': return y === 3 || y === 4 ? (x % 8 < 4 ? 1 : 0.2) : 0.3;
    case 'snow': return 0.88;
    default: return 0.4 + 0.6 * n; // the wrong band
  }
}

function CoreStrip({ core, sel, onBand }: { core: string[]; sel: number; onBand: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const w = BAND_W, h = SLOTS * BAND_H;
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const b = Math.floor(y / BAND_H), yy = y % BAND_H;
      let col: RGB = BG;
      if (b < core.length) {
        const ink = hex(stratum(core[b]).hex);
        const on = yy === BAND_H - 1 ? false : bandShade(core[b], x, yy) > threshold(x, y);
        col = on ? ink : mixc(ink, BG, 0.85);
        if (b === sel && (x === 0 || x === w - 1 || yy === 0 || yy === BAND_H - 2) && ((x + y) & 1) === 0) col = WHITE;
      } else if ((x + y) % 6 === 0) col = RAMP[1];
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [core.join(), sel]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas ref={ref} width={BAND_W} height={SLOTS * BAND_H} className="survey-core" data-nodrag
      onPointerDown={e => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.floor((e.clientY - r.top) / r.height * SLOTS);
        if (i >= 0 && i < core.length) onBand(i);
      }} />
  );
}

function CoreBench() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const v = game.challenges.survey;
  const [sel, setSel] = useState(-1);
  const core = v.core;
  const pick = (i: number) => {
    if (sel < 0 || Math.abs(sel - i) !== 1) { setSel(i === sel ? -1 : i); return; }
    run(s => swapBands(s, Math.min(sel, i)));
    setSel(-1);
  };
  const cap = rackSize(game);
  return (
    <section className="survey-bench">
      <div className="survey-cap">"THE CORE"</div>
      <div className="survey-core-wrap">
        {core ? <CoreStrip core={core} sel={sel} onBand={pick} /> : <div className="survey-core survey-core-empty" />}
        <div className="survey-core-side">
          {core ? (
            <p className="survey-note">Pick a band, then the band above or below it to swap. Three of a kind together are read.</p>
          ) : (
            <>
              <button className="max-all" disabled={v.rack < 1} onClick={() => { setSel(-1); run(s => openCore(s)); }}>
                {v.rack < 1 ? 'Rack is empty' : 'Take a core'}
              </button>
              {v.last.length > 0 && <p className="survey-note">Last core: {v.last.map(id => stratum(id).name.toLowerCase()).join(', ')}.</p>}
            </>
          )}
          <div className="ch-stat">Rack <b>{v.rack}/{cap}</b></div>
          <div className="ch-stat dim">{v.rack >= cap ? 'Full. The bore waits.' : `Next core in ${fmtTime((1 - v.coreProg) * CORE_EVERY)}`}</div>
          <div className="ch-stat">Read <b>{v.read}</b></div>
          <button className="secondary" disabled={game.ash.lt(rackCost(game))} onClick={() => run(buyRack)}>
            Widen the rack ({fmt(rackCost(game))} ash)
          </button>
        </div>
      </div>
      <div className="survey-cap">"STRATA"</div>
      <ul className="survey-tally">
        {STRATA.filter(k => !k.rare || v.tally[k.id]).map(k => (
          <li key={k.id}><i style={{ background: k.hex }} />{k.name}<span>{fmt(v.tally[k.id] ?? 0)}</span></li>
        ))}
        {STRATA.some(k => k.rare && !v.tally[k.id]) && <li className="dim"><i />Something else, further down</li>}
      </ul>
      {v.lore.length > 0 && (
        <>
          <div className="survey-cap">"FOUND IN THE CORES"</div>
          <ul className="survey-lore" data-scroll>
            {v.lore.map(key => <li key={key} style={{ borderColor: stratum(key.split(':')[0]).hex }}>{loreText(key)}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------- the field ---------- */

function Field() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const v = game.challenges.survey;
  const [sel, setSel] = useState(-1);
  const [placing, setPlacing] = useState(v.heads.length === 0);
  const [hover, setHover] = useState(-1);
  const cost = headCost(game);
  const afford = game.ash.gte(cost);
  const onTile = (t: number) => {
    if (v.heads.includes(t)) { setSel(t === sel ? -1 : t); setPlacing(false); return; }
    if (sel >= 0) { run(s => moveHead(s, sel, t)); setSel(-1); return; }
    if (placing && afford) { run(s => placeHead(s, t)); setPlacing(false); }
  };
  const info = hover >= 0 ? hover : sel;
  return (
    <section className="survey-field">
      <div className="survey-cap">"WHERE IT FALLS THICKEST"</div>
      <div className="survey-frame"><SnowMap className="big" selected={sel} hover={hover} onTile={onTile} onHover={setHover} /></div>
      <div className="ch-row">
        <button className={placing ? '' : 'secondary'} disabled={!afford} onClick={() => { setPlacing(!placing); setSel(-1); }}>
          {placing ? 'Pick a tile' : 'Buy a bore head'} ({fmt(cost)} ash)
        </button>
        <span className="ch-stat">Heads <b>{v.heads.length}</b></span>
        <span className="ch-stat">Survey <b>+{fmt(surveyRate(game))}/s</b></span>
      </div>
      <p className="survey-note">
        {info >= 0
          ? `Tile ${info % MAP_W + 1},${Math.floor(info / MAP_W) + 1}: the snow falls ${tileDensity(game, info).toFixed(2)} thick here.`
          : sel >= 0 ? 'Pick an empty tile to move the head.' : 'Heads pay by how thick it falls on their tile. The drifts wander. Moving a head is free.'}
      </p>
      <div className="ch-row">
        <span className="ch-stat">Surveyed <b>{fmt(v.surveyed)}</b></span>
        <span className="ch-stat">Shallow Bores <b>x{zoneBonus(v).toFixed(2)}</b></span>
        <span className="ch-stat">ash <b>x{surveyAsh(v).toFixed(2)}</b></span>
      </div>
    </section>
  );
}

function SurveyRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const v = game.challenges.survey;
  return (
    <ChallengeRoom zone={ZONE} title="The Survey" note="a hole in the snow, and what it catches" onClose={onClose}
      stat={<>cores x{coreMult(v).toFixed(2)} ash · bores x{zoneBonus(v).toFixed(2)}</>} className="survey-room">
      <div className="survey-room-grid">
        <CoreBench />
        <Field />
      </div>
    </ChallengeRoom>
  );
}

export function SurveyPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  const v = game.challenges.survey;
  const cap = rackSize(game);
  const toRead = v.core || v.rack > 0;
  return (
    <div className="survey-inline">
      <figure className="survey-fig">
        <div className="survey-frame"><SnowMap /></div>
        <figcaption className="survey-cap">"ONE LAMP. IT CATCHES WHAT FALLS"</figcaption>
      </figure>
      <div className="survey-side">
        <div className="ch-stat">Rack <b>{v.rack}/{cap}</b>{v.core && <span className="dim"> · one open</span>}</div>
        <div className="ch-stat">Cores read <b>{v.read}</b> <span className="dim">x{coreMult(v).toFixed(2)} ash</span></div>
        <div className="ch-stat">Heads <b>{v.heads.length}</b> <span className="dim">+{fmt(surveyRate(game))}/s</span></div>
        <div className="ch-stat">Shallow Bores <b>x{zoneBonus(v).toFixed(2)}</b></div>
        <button className={toRead ? 'max-all' : 'secondary'} onClick={() => setOpen(true)}>{toRead ? 'Read a core' : 'Open the survey'}</button>
      </div>
      {open && <SurveyRoom onClose={() => setOpen(false)} />}
    </div>
  );
}
