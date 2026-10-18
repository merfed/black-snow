// The Survey: the panel inside the zone 1 box. A small snow map and the rack inline; the core puzzle and
// the full map in a room.
import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import type Decimal from 'break_eternity.js';
import {
  autoShare, buyRack, buyReader, coreEvery, coreMult, density, FINDS, found, headCost, headYield, KINDS_PER, LORE_AT, MAP_H, MAP_W,
  moveHead, openCore, placeHead, RACK_STEP, rackCost, rackSize, READ_EVERY, readerBoost, readerCost, readerRate, RUN, seamAt, SEAMS,
  seamLevel, setDone, stratum, surveyRate, swapBands, tallyTotal, tileDensity, zoneBonus,
} from '../../game/challenges/survey';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus, SaveHint } from './ChallengeSlot';
import './survey.css';

type RGB = [number, number, number];
const ZONE = 0;
const HUE = hex(ZONE_COLORS[ZONE]);
const BG: RGB = [7, 8, 12];
const RED: RGB = [255, 42, 42];
const WHITE: RGB = [240, 236, 226];
const mixc = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const RAMP: RGB[] = [mixc(HUE, BG, 0.92), mixc(HUE, BG, 0.7), mixc(HUE, BG, 0.4), HUE, mixc(HUE, WHITE, 0.55)];

const hash = (a: number, b: number) => {
  let x = Math.imul(a ^ Math.imul(b, 0x27d4eb2d), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
};

/** Footprints that are not ours: now and then a line of them crosses the field and fills in slowly. */
function footprints(seed: number, clock: number, cell: number): { x: number; y: number; k: number }[] {
  const WIN = 150, k = Math.floor(clock / WIN), into = clock - k * WIN;
  if (hash(seed, k) > 0.4) return [];
  const w = MAP_W * cell, h = MAP_H * cell;
  const edge = (r: number, side: number): [number, number] =>
    side === 0 ? [r * w, -2] : side === 1 ? [w + 2, r * h] : side === 2 ? [r * w, h + 2] : [-2, r * h];
  const s0 = Math.floor(hash(seed, k * 3 + 1) * 4);
  const [ax, ay] = edge(hash(seed, k * 5 + 2), s0);
  const [bx, by] = edge(hash(seed, k * 7 + 3), (s0 + 2) % 4);
  const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / (cell / 2));
  const nx = -(by - ay) / len, ny = (bx - ax) / len, sw = cell / 7;
  const walked = Math.min(1, into / 70), fade = into > 70 ? 1 - (into - 70) / (WIN - 70) : 1;
  const out: { x: number; y: number; k: number }[] = [];
  for (let j = 0; j < n * walked; j++) {
    const t = j / n, side = j % 2 ? sw : -sw;
    out.push({ x: Math.round(ax + (bx - ax) * t + nx * side), y: Math.round(ay + (by - ay) * t + ny * side), k: fade * (0.6 + 0.4 * t) });
  }
  return out;
}

type Set = (x: number, y: number, col: RGB) => void;

/** A bore head seen from above: a toothed collar, a two-flight auger turning inside it, a dark throat, and
 *  one red lamp on the collar. `ghost` draws it half-dithered (where a head would go). */
function drawHead(set: Set, cell: number, tx: number, ty: number, spin: number, lamp: boolean, ghost: boolean) {
  const c = (cell - 1) / 2, R = cell / 2;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy) / R, a = Math.atan2(dy, dx);
    if (r > 1.02) continue;
    if (ghost && ((x + y) & 1)) continue;
    let col: RGB;
    if (r > 0.74) col = Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 && r > 0.88 ? RAMP[2] : WHITE; // collar with teeth
    else if (r < 0.24) col = BG; // the throat
    else {
      const ph = ((a + spin - r * 4.2) / Math.PI) % 1; // two flights, wound inward
      const f = ph < 0 ? ph + 1 : ph;
      col = f < 0.3 ? RAMP[4] : f < 0.42 ? RAMP[2] : BG;
    }
    set(tx + x, ty + y, col);
  }
  if (lamp && !ghost) { const lx = tx + Math.round(c), ly = ty; set(lx, ly, RED); set(lx + (cell > 9 ? 1 : 0), ly, RED); if (cell > 12) { set(lx, ly + 1, RED); set(lx + 1, ly + 1, RED); } }
}

/** The first bore, at the middle of the field: the same collar, wider and doubled, braced with four struts,
 *  and a red lamp down the throat instead of a bit. */
function drawBore(set: Set, cell: number, bx: number, by: number, t: number) {
  const R = cell * 0.95;
  const n = Math.ceil(R) + 1;
  for (let y = -n; y < n; y++) for (let x = -n; x < n; x++) {
    const dx = x + 0.5, dy = y + 0.5, r = Math.hypot(dx, dy) / R, a = Math.atan2(dy, dx);
    if (r > 1.02) continue;
    let col: RGB | null = null;
    if (r > 0.86) col = ((x + y) & 1) ? RAMP[4] : BG; // dotted outer ring
    else if (r > 0.76) col = BG;
    else if (r > 0.6) col = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2 ? RAMP[2] : WHITE; // the collar
    else if (r < 0.26) col = r < 0.15 || Math.floor(t * 1.5) % 2 ? RED : mixc(RED, BG, 0.6); // the lamp
    else col = (Math.abs(dx) < 0.9 || Math.abs(dy) < 0.9) ? WHITE : BG; // struts
    set(bx + x, by + y, col);
  }
}

/** The snow map: how thick the ash falls, dithered, with the bore heads on it. Low fps, pauses off screen.
 *  `grid` draws every tile edge (while picking a tile); `ghost` previews a head under the hover. */
const SnowMap = memo(function SnowMap({ className, cell = 10, selected = -1, hover = -1, grid = false, ghost = false, onTile, onHover }: {
  className?: string; cell?: number; selected?: number; hover?: number; grid?: boolean; ghost?: boolean;
  onTile?: (tile: number) => void; onHover?: (tile: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ selected, hover, grid, ghost });
  live.current = { selected, hover, grid, ghost };
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const CELL = cell;
    const w = MAP_W * CELL, h = MAP_H * CELL;
    const img = g.createImageData(w, h);
    const d = img.data;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const set: Set = (x, y, col) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    };
    const flake = CELL / 8;
    const paint = (ms: number) => {
      const v = useGame.getState().game.challenges.survey;
      const t = ms / 1000;
      const { selected: sel, hover: hov, grid: showGrid, ghost: showGhost } = live.current;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dn = density(v.seed, v.clock, (x + 0.5) / CELL - 0.5, (y + 0.5) / CELL - 0.5);
        let b = Math.min(1, (dn - 0.25) / 1.5) * 0.85 + 0.05;
        // falling flakes, thicker where the ash is thicker
        if (hash(Math.floor(x / flake) * 131 + Math.floor(y / flake - t * 6) * 7, 99) < 0.012 * dn) b += 0.45;
        const onEdge = x % CELL === 0 || y % CELL === 0;
        if (onEdge && showGrid) { set(x, y, (x + y) & 1 ? BG : RAMP[4]); continue; } // a dotted grid that reads on light and dark snow
        if (onEdge && ((x + y) & 1) === 0) b = Math.max(b, 0.22);
        const lv = Math.max(0, Math.min(RAMP.length - 1, b * (RAMP.length - 1)));
        const lo = Math.floor(lv);
        set(x, y, RAMP[Math.min(RAMP.length - 1, lo + (lv - lo > threshold(x, y) ? 1 : 0))]);
      }
      drawBore(set, CELL, w / 2, h / 2, t);
      for (const p of footprints(v.seed, v.clock, CELL)) if (p.k > threshold(p.x, p.y)) {
        const s = Math.max(1, Math.round(CELL / 8));
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx <= s; xx++) set(p.x + xx, p.y + yy, RED);
      }
      const frame = (tile: number, col: RGB, dash: boolean, inset = 0) => {
        const x0 = (tile % MAP_W) * CELL + inset, y0 = Math.floor(tile / MAP_W) * CELL + inset, n = CELL - inset * 2;
        for (let k = 0; k < n; k++) {
          if (dash && k % 2) continue;
          set(x0 + k, y0, col); set(x0 + k, y0 + n - 1, col); set(x0, y0 + k, col); set(x0 + n - 1, y0 + k, col);
        }
      };
      if (hov >= 0 && !v.heads.includes(hov)) {
        // light the hovered tile: lift its snow a step, then a solid double frame
        const x0 = (hov % MAP_W) * CELL, y0 = Math.floor(hov / MAP_W) * CELL;
        for (let y = 1; y < CELL - 1; y++) for (let x = 1; x < CELL - 1; x++) if (((x + y) & 3) === 0) set(x0 + x, y0 + y, RAMP[3]);
        if (showGhost) drawHead(set, CELL, x0, y0, t * 1.5, false, true);
      }
      for (const tile of v.heads) {
        const tx = (tile % MAP_W) * CELL, ty = Math.floor(tile / MAP_W) * CELL;
        drawHead(set, CELL, tx, ty, still ? tile : t * 1.5 + tile, Math.floor(t * 2 + tile) % 3 !== 0, false);
      }
      if (hov >= 0) { frame(hov, WHITE, false); if (CELL >= 12) frame(hov, RAMP[3], false, 1); }
      if (sel >= 0 && Math.floor(t * 3) % 2 === 0) { frame(sel, RED, false); if (CELL >= 12) frame(sel, RED, false, 1); }
      g.putImageData(img, 0, 0);
    };
    const draw = (ms: number) => {
      if (ms - last >= 1000 / 8) { last = ms; paint(ms); }
      if (visible && !still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // when still, repaint on hover / pick changes only
    const poke = still ? setInterval(() => paint(performance.now()), 250) : undefined;
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && !still) raf = requestAnimationFrame(draw);
      });
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); clearInterval(poke); io?.disconnect(); };
  }, [cell]);
  const tileAt = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * MAP_W), y = Math.floor((e.clientY - r.top) / r.height * MAP_H);
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? y * MAP_W + x : -1;
  };
  return (
    <canvas ref={ref} width={MAP_W * cell} height={MAP_H * cell} className={`survey-map ${className ?? ''}`} data-nodrag
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

/** A thin dithered bar in the zone's ink: how far along something is. */
const Bar = ({ k, red }: { k: number; red?: boolean }) => (
  <span className={`sv-bar${red ? ' red' : ''}`}><i style={{ width: `${Math.max(0, Math.min(1, k)) * 100}%` }} /></span>
);

/** A side-column buy: the verb and what it does, with the price in a second ink under it. */
function BenchBuy({ label, gives, cost, onClick, title }: { label: string; gives: string; cost: Decimal; onClick: () => void; title?: string }) {
  const game = useGame(st => st.game);
  return (
    <div className="sv-buy-wrap">
      <button className="sv-buy" disabled={game.ash.lt(cost)} onClick={onClick} title={title}>
        <span className="sv-buy-top"><span className="btn-label">{label}</span><span className="sv-buy-gives">{gives}</span></span>
        <span className="sv-buy-bot"><span className="btn-cost">{fmt(cost)} ash</span><SaveHint game={game} cost={cost} /></span>
      </button>
    </div>
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
  const full = v.rack >= cap;
  const every = coreEvery(game);
  const rr = readerRate(game);
  const nextRead = v.rack > 0 ? fmtTime(Math.max(0, (1 - v.readProg) / rr)) : 'waits for a core';
  const nextLv = v.reader + 1;
  const nextEvery = (1 + 0.5 * (nextLv - 1)) * readerBoost(v) / READ_EVERY;
  return (
    <aside className="survey-bench">
      <div className="sv-head"><span className="survey-cap">"THE CORE"</span><span className="sv-head-note">{core ? 'on the bench' : `${v.rack} racked`}</span></div>
      <div className="survey-core-wrap">
        <div className="sv-core-col">
          {core ? <CoreStrip core={core} sel={sel} onBand={pick} /> : <div className="survey-core survey-core-empty"><span>{v.rack ? 'take a core' : 'the rack is empty'}</span></div>}
        </div>
        <div className="sv-blocks">
          <div className="sv-block">
            <div className="sv-k">Rack</div>
            <div className="sv-v"><b>{v.rack}</b><span>/ {cap}</span></div>
            <div className="sv-pips" aria-hidden>{Array.from({ length: cap }, (_, i) => <i key={i} className={i < v.rack ? 'on' : ''} />)}</div>
          </div>
          <div className="sv-block">
            <div className="sv-k">Next core</div>
            <div className="sv-v sm">{full ? <span className="sv-wait">full · the bore waits</span> : fmtTime((1 - v.coreProg) * every)}</div>
            <Bar k={full ? 1 : v.coreProg} red={full} />
            <div className="sv-sub">one every {fmtTime(every)}</div>
          </div>
          <div className="sv-block">
            <div className="sv-k">Cores read</div>
            <div className="sv-v"><b>{v.read}</b></div>
            <div className="sv-sub">tally {fmt(tallyTotal(v))} · <em>x{coreMult(v).toFixed(2)} ash</em></div>
          </div>
          <div className="sv-block">
            <div className="sv-k">Reader</div>
            {v.reader ? <>
              <div className="sv-v sm"><b>lv {v.reader}</b> <span>next {nextRead}</span></div>
              <Bar k={v.rack > 0 ? v.readProg : 0} />
              <div className="sv-sub">one every {fmtTime(1 / rr)} · keeps {Math.round(autoShare(v) * 100)}%</div>
            </> : <div className="sv-sub wrap">none yet. Cores wait for you.</div>}
          </div>
        </div>
      </div>
      <div className="sv-act">
        {core
          ? <p className="survey-note">Pick a band, then the one above or below it to swap. Three of a kind together are read.</p>
          : <>
            <button className="sv-take" disabled={v.rack < 1} onClick={() => { setSel(-1); run(s => openCore(s)); }}>
              {v.rack < 1 ? 'Rack is empty' : 'Take a core'}
            </button>
            {v.last.length > 0 && <p className="survey-note">Last core: {v.last.map(id => stratum(id).name.toLowerCase()).join(', ')}.</p>}
          </>}
      </div>
      <div className="sv-buys">
        <BenchBuy label="Widen the rack" gives={`${cap} → ${cap + RACK_STEP}`} cost={rackCost(game)} onClick={() => run(buyRack)} />
        <BenchBuy label={v.reader ? 'A faster reader' : 'Hire a reader'}
          gives={v.reader ? `lv ${nextLv} · every ${fmtTime(1 / nextEvery)}` : `every ${fmtTime(1 / nextEvery)}`}
          cost={readerCost(game)} onClick={() => run(buyReader)}
          title={`Reads racked cores on its own, slowly, keeping ${Math.round(autoShare(v) * 100)}% of what reading by hand would.`} />
      </div>
    </aside>
  );
}

/* ---------- strata and finds, under the map ---------- */

function Strata() {
  const game = useGame(st => st.game);
  const v = game.challenges.survey;
  return (
    <section className="sv-strata">
      <div className="sv-head"><span className="survey-cap">"STRATA"</span><span className="sv-head-note">each seam tunes the survey</span></div>
      <ul>
        {SEAMS.map(sm => {
          const k = stratum(sm.id), t = v.tally[sm.id] ?? 0, L = seamLevel(v, sm.id);
          const lo = L ? seamAt(L - 1) : 0, hi = seamAt(L);
          return (
            <li key={sm.id} title={`${k.name}: ${sm.what}. Level ${L + 1} at ${fmt(hi)} tally.`}>
              <span className="sv-name"><i style={{ background: k.hex }} />{k.name}</span>
              <span className="sv-lv">lv {L}</span>
              <span className="sv-prog"><Bar k={(t - lo) / (hi - lo)} /><small>{fmt(t)}/{fmt(hi)}</small></span>
              <span className="sv-gives"><b>{L ? `${sm.num(sm.per * L)} ${sm.unit}` : `— ${sm.unit}`}</b><small>→ {sm.num(sm.per * (L + 1))}</small></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Finds() {
  const game = useGame(st => st.game);
  const v = game.challenges.survey;
  return (
    <section className="sv-finds">
      <div className="sv-head"><span className="survey-cap">"FOUND IN THE CORES"</span><span className="sv-head-note">{v.lore.length} / {FINDS.length * LORE_AT.length}</span></div>
      <ul data-scroll>
        {FINDS.map(f => {
          const k = stratum(f.id), n = found(v, f.id), runs = v.runs?.[f.id] ?? 0, whole = setDone(v, f.id);
          if (!runs && !n) return f.id === FINDS.find(x => !v.runs?.[x.id] && !found(v, x.id))!.id
            ? <li key={f.id} className="sv-find unknown"><span className="sv-name"><i />Something else, further down</span></li> : null;
          const latest = n ? k.lore![n - 1] : null;
          return (
            <li key={f.id} className={`sv-find${whole ? ' whole' : ''}`} style={{ '--ink': k.hex } as CSSProperties}
              title={whole ? k.lore!.join('\n') : undefined}>
              <div className="sv-find-top">
                <span className="sv-name" title={k.name}><i style={{ background: k.hex }} />{k.name}</span>
                {whole && <span className="sv-find-next"><b className="sv-find-now">{f.fmt(f.per * n)}</b> · {f.setFmt}</span>}
                <span className="sv-dots">{k.lore!.map((line, i) => <i key={i} className={i < n ? 'on' : ''} title={i < n ? line : `${LORE_AT[i]} runs`} />)}</span>
              </div>
              {!whole && <>
                {latest && <p className="sv-line" title={latest}>{latest}</p>}
                <div className="sv-find-next" title={`Each line: ${f.what}. All five: ${f.set}.`}>
                  <b className="sv-find-now">{n ? f.fmt(f.per * n) : 'nothing yet'}</b>{' · '}
                  next {f.fmt(f.per * (n + 1))} in {LORE_AT[n] - runs} run{LORE_AT[n] - runs === 1 ? '' : 's'} · <em>all five</em> {f.setFmt}
                </div>
              </>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- the field ---------- */

function Field({ sel, setSel, placing, setPlacing }: { sel: number; setSel: (t: number) => void; placing: boolean; setPlacing: (p: boolean) => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const v = game.challenges.survey;
  const [hover, setHover] = useState(-1);
  const afford = game.ash.gte(headCost(game));
  const onTile = (t: number) => {
    if (v.heads.includes(t)) { setSel(t === sel ? -1 : t); setPlacing(false); return; }
    if (sel >= 0) { run(s => moveHead(s, sel, t)); setSel(-1); return; }
    if (placing && afford) { run(s => placeHead(s, t)); setPlacing(false); }
  };
  const info = hover >= 0 ? hover : sel;
  const picking = sel >= 0 || (placing && afford);
  const best = v.heads.length ? Math.max(...v.heads.map(t => tileDensity(game, t))) : 0;
  return (
    <section className="survey-fieldcol">
      <div className="survey-field-top">
        <div className="survey-field">
          <div className={`survey-frame${picking ? ' survey-picking' : ''}`}>
            <SnowMap className="big" cell={16} selected={sel} hover={hover} grid={picking} ghost={placing && afford && sel < 0}
              onTile={onTile} onHover={setHover} />
          </div>
        </div>
        <div className="sv-readout">
          <div className="survey-cap">"WHERE IT FALLS THICKEST"</div>
          <div className="sv-block">
            <div className="sv-k">{info >= 0 ? `Tile ${info % MAP_W + 1}, ${Math.floor(info / MAP_W) + 1}` : 'Tile'}</div>
            <div className="sv-v">{info >= 0 ? <b>{(tileDensity(game, info) * headYield(v)).toFixed(2)}</b> : <span className="sv-dim">—</span>}<span>survey/s a head</span></div>
          </div>
          <p className="survey-note">
            {sel >= 0 ? 'Pick an empty tile to move the head.'
              : placing && afford ? 'Pick a tile for the head.'
              : 'Heads pay by how thick it falls on their tile. The drifts wander. Moving a head is free.'}
          </p>
          <div className="sv-ramp" aria-hidden><span>thin</span><i /><span>thick</span></div>
          <div className="sv-block">
            <div className="sv-k">Best head</div>
            <div className="sv-v sm">{v.heads.length ? best.toFixed(2) : '—'}</div>
          </div>
          <div className="sv-block">
            <div className="sv-k">Surveyed</div>
            <div className="sv-v sm">{fmt(v.surveyed)}</div>
            <div className="sv-sub"><em>x{zoneBonus(v).toFixed(2)} Shallow Bores</em></div>
          </div>
        </div>
      </div>
      <div className="survey-under">
        <Strata />
        <Finds />
      </div>
    </section>
  );
}

function SurveyRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const v = game.challenges.survey;
  const [sel, setSel] = useState(-1);
  const [placing, setPlacing] = useState(v.heads.length === 0);
  const cost = headCost(game);
  const afford = game.ash.gte(cost);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Bore heads', value: v.heads.length, rate: `+${fmt(surveyRate(game))} survey/s` },
        { label: 'Cores read', value: v.read, rate: `${v.rack}/${rackSize(game)} racked` },
        { label: 'All ash', value: `x${coreMult(v).toFixed(2)}`, rate: 'from the cores', title: 'The core bonus: grows with the tally of every run read' },
        { label: 'Shallow Bores', value: `x${zoneBonus(v).toFixed(2)}`, rate: 'from survey', title: 'Grows with survey ever gathered, by log' },
        { label: 'Found', value: `${v.lore.length}/${FINDS.length * LORE_AT.length}`, rate: 'lines' },
      ]}
      buy={{
        label: placing && afford ? 'Pick a tile' : 'Buy a bore head', cost, pressed: placing && afford,
        onClick: () => { setPlacing(!placing); setSel(-1); },
        title: 'Buy a head, then pick a tile on the map for it',
      }}
    />
  );
  return (
    <ChallengeRoom zone={ZONE} title="The Survey" note="a hole in the snow, and what it catches" onClose={onClose}
      className="survey-room" status={status}>
      <div className="survey-room-grid">
        <Field sel={sel} setSel={setSel} placing={placing} setPlacing={setPlacing} />
        <CoreBench />
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
        <div className="survey-frame"><SnowMap cell={12} /></div>
        <figcaption className="survey-cap">"ONE LAMP. IT CATCHES WHAT FALLS"</figcaption>
      </figure>
      <div className="survey-side">
        <div className="sv-block"><div className="sv-k">Rack</div><div className="sv-v sm">{v.rack}/{cap}</div>
          <div className="sv-sub">{v.core ? 'one on the bench' : v.reader ? `reader lv ${v.reader}` : 'no reader'}</div></div>
        <div className="sv-block"><div className="sv-k">Cores read</div><div className="sv-v sm">{v.read}</div>
          <div className="sv-sub"><em>x{coreMult(v).toFixed(2)} all ash</em></div></div>
        <div className="sv-block"><div className="sv-k">Bore heads</div><div className="sv-v sm">{v.heads.length}</div>
          <div className="sv-sub">+{fmt(surveyRate(game))} survey/s</div></div>
        <div className="sv-block"><div className="sv-k">Found</div><div className="sv-v sm">{v.lore.length}/{FINDS.length * LORE_AT.length}</div>
          <div className="sv-sub"><em>x{zoneBonus(v).toFixed(2)} Shallow Bores</em></div></div>
        <button className={toRead ? 'max-all' : 'secondary'} onClick={() => setOpen(true)}>{toRead ? 'Read a core' : 'Open the survey'}</button>
      </div>
      {open && <SurveyRoom onClose={() => setOpen(false)} />}
    </div>
  );
}
