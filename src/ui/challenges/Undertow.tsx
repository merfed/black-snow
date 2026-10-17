// The Undertow: the panel inside the zone 2 box, and the room behind it (bins, leak schematic, gauge).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  APPROACHES, approach, BINS, binCost, binLevel, BORE_BUDGET, deliveryTime, depth, efficiency, emberYield, figureHere, gaugeMult,
  gaugeNow, hiss, keepMult, lengths, LORE, luckTilt, luckYield, nearness, nextShift, objDef, OBJECTS, patch, patchMult, PERKS,
  PIPE_CELLS, RARITY_NAMES, rarityOdds, setBore, setMult, setRule, SETS, setsKept, sightWait, sortByRules, sortObj, trayCap,
  upgradeBin, walkTime, zoneBonus, LEAK_CAP, type Bin,
} from '../../game/challenges/undertow';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, SaveHint } from './ChallengeSlot';
import './undertow.css';

const ZONE = 1;
const HUE = ZONE_COLORS[ZONE];
const RED = '#ff3030';
const INK_BG = '#05060b';
const BIN_NAMES: Record<Bin, string> = { keep: 'Keep', burn: 'Burn', down: 'Send down' };
const BIN_DESC: Record<Bin, (l: number) => string> = {
  keep: l => `Kept things count ${Math.round(25 * l)}% more.`,
  burn: l => `Embers +${Math.round(50 * l)}%.`,
  down: l => `Luck +${Math.round(50 * l)}%.`,
};

const mix = (a: string, b: string, k: number) => {
  const x = hex(a), y = hex(b);
  return x.map((v, i) => Math.round(v + (y[i] - v) * k)) as [number, number, number];
};
const PAL = [mix(HUE, INK_BG, 0.92), mix(HUE, INK_BG, 0.6), hex(HUE), mix(HUE, '#ffffff', 0.6)];
const ACC = hex(RED);
const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** A pixel's look: 0..1 is brightness in the hue's inks; 2..3 is the red ink, solid at 3. */
type Px = (x: number, y: number, t: number) => number;

/** A small canvas painted pixel by pixel with ordered dither, at a low frame rate, paused off screen. */
function DitherCanvas({ w, h, px, fps = 10, className, onPointer }: {
  w: number; h: number; px: () => Px; fps?: number; className?: string; onPointer?: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pxRef = useRef(px);
  pxRef.current = px;
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) {
        last = ms;
        const f = pxRef.current(), t = ms / 1000, d = img.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = f(x, y, t), th = threshold(x, y), i = (y * w + x) * 4;
          let col: [number, number, number];
          if (v >= 2) col = v - 2 > th ? ACC : PAL[0];
          else {
            const s = Math.max(0, Math.min(1, v)) * 3, lo = Math.floor(s);
            col = PAL[Math.min(3, lo + (s - lo > th ? 1 : 0))];
          }
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && !still) raf = requestAnimationFrame(loop);
      });
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [w, h, fps]);
  return (
    <canvas ref={ref} width={w} height={h} className={`undertow-canvas ${className ?? ''}`} data-nodrag
      onPointerDown={onPointer && (e => {
        const r = e.currentTarget.getBoundingClientRect();
        onPointer(Math.floor((e.clientX - r.left) / r.width * w), Math.floor((e.clientY - r.top) / r.height * h));
      })} />
  );
}

/** Looking down the pipe: ribs sliding past, water running toward you, and sometimes someone standing in it. */
function pipeView(near: number, show: boolean, flow: number): Px {
  const W = 160, H = 64, cx = W / 2, cy = H * 0.42;
  const fh = H * (0.12 + 0.72 * near); // figure height
  const fw = fh * 0.32;
  const feet = cy + 2 + fh * 0.35;
  return (x, y, t) => {
    const dx = (x - cx) / W, dy = (y - cy) / H * 0.55;
    const r = Math.hypot(dx, dy), z = 1 / Math.max(r, 0.015), ang = Math.atan2(dy, dx);
    // the figure, in front of everything
    if (show) {
      const top = feet - fh, rel = (y - top) / fh;
      if (rel >= 0 && rel <= 1) {
        const headR = fw * 0.38, hy = top + headR;
        const inHead = Math.hypot(x - cx, (y - hy) * 1.1) < headR;
        const half = rel < 0.2 ? 0 : fw * (0.32 + 0.22 * Math.min(1, (rel - 0.2) * 3)) * (rel > 0.85 ? 0.8 : 1);
        if (inHead || Math.abs(x - cx) < half) return 2 + (near > 0.6 ? 0.95 : 0.6 + 0.35 * near);
      }
    }
    const fade = Math.min(1, r * 3.2);
    // water along the floor of the pipe
    if (ang > 0.55 && ang < Math.PI - 0.55) {
      const lane = Math.floor(ang * 18), seg = Math.floor(z * 2 - t * (1.5 + 4 * flow));
      const glint = hash(lane, seg) > 0.86 ? 0.95 : 0;
      return Math.max(glint * fade, (0.22 + 0.12 * Math.sin(z * 3 + t * 2)) * fade);
    }
    const rib = 0.5 + 0.5 * Math.sin(z * 5 - t * 1.2);
    return (0.12 + 0.55 * rib * rib) * fade + (r > 0.47 ? 0.15 : 0);
  };
}

function Plate({ px, w, h, caption, onPointer, className }: { px: () => Px; w: number; h: number; caption?: string; onPointer?: (x: number, y: number) => void; className?: string }) {
  return (
    <figure className={`artwork undertow-plate ${className ?? ''}`} style={{ '--ink': HUE, '--plate-bg': `rgb(${PAL[0].join(',')})` } as CSSProperties}>
      <div className="artwork-frame knots"><DitherCanvas w={w} h={h} px={px} onPointer={onPointer} /></div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function UndertowPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [open, setOpen] = useState(false);
  const u = game.challenges.undertow;
  const near = nearness(game), here = figureHere(game), walking = u.walk > 0;
  const show = here || walking || u.approaches >= APPROACHES;
  const flow = efficiency(game);
  const newest = u.tray.length - 1;
  const obj = newest >= 0 ? objDef(u.tray[newest]) : null;
  const full = u.tray.length >= trayCap(game);

  return (
    <div className="undertow">
      <Plate w={160} h={64} px={() => pipeView(near, show, flow)}
        caption={u.approaches >= APPROACHES ? '"They are facing you now."' : show ? '"Someone is standing in the water."' : '"It gives back what it took. Mostly."'} />
      <div className="ch-row undertow-stats">
        <span className="ch-stat">Tray <b>{u.tray.length}/{trayCap(game)}</b></span>
        <span className="ch-stat">{full ? <span className="dim">pipe waiting</span> : <>next in <b>{fmtTime((1 - u.pull) * deliveryTime(game))}</b></>}</span>
        <span className="ch-stat">Conduit <b>x{zoneBonus(game).toFixed(2)}</b></span>
      </div>
      {obj ? (
        <div className="undertow-obj">
          <div><span className={`undertow-name r${obj.rarity}`}>{obj.name}</span> <span className="dim">({RARITY_NAMES[obj.rarity]})</span></div>
          <p className="dim small-note">{obj.note}</p>
          <div className="ch-row">
            <button className="undertow-btn" onClick={() => run(s => sortObj(s, newest, 'keep'))}>Keep</button>
            <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, newest, 'burn'))}>Burn +{emberYield(game, obj.id)} embers</button>
            <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, newest, 'down'))}>Send down</button>
          </div>
        </div>
      ) : <p className="dim small-note">The tray is empty. Something is on its way up.</p>}
      <div className="ch-row undertow-figure">
        {here ? <button className="undertow-btn undertow-walk" onClick={() => run(approach)}>Walk toward them ({fmtTime(walkTime(u.approaches))})</button>
          : walking ? <span className="ch-stat">Walking. <b>{fmtTime(u.walk)}</b> left.</span>
            : u.approaches >= APPROACHES ? <span className="dim small-note">Nobody further down. Only them.</span>
              : <span className="dim small-note">The pipe is empty{u.approaches ? ` for ${fmtTime(Math.max(0, sightWait(game) - u.sight))}` : ''}.</span>}
        <span className="ch-stat undertow-count">Approached <b>{u.approaches}/{APPROACHES}</b></span>
      </div>
      {u.approaches > 0 && <p className="undertow-lore">"{LORE[u.approaches - 1]}"</p>}
      <button className="max-all" onClick={() => setOpen(true)}>Open the Undertow</button>
      {open && <UndertowRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

function UndertowRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const u = game.challenges.undertow;
  return (
    <ChallengeRoom zone={ZONE} title="The Undertow" note="what comes up" onClose={onClose} className="undertow-room"
      stat={<>Conduit <b>x{zoneBonus(game).toFixed(2)}</b> · {u.leaks.length} leak{u.leaks.length === 1 ? '' : 's'} · luck {fmt(u.luck)}</>}>
      <div className="undertow-cols">
        <Bins />
        <div className="undertow-side">
          <Leaks />
          <Gauge />
          <Figure />
        </div>
      </div>
    </ChallengeRoom>
  );
}

// Bin icons, 12x12: '#' hue ink, '+' dithered hue, 'r' red ink.
const ICONS: Record<Bin, string[]> = {
  keep: [
    '....####....', '....#..#....', '...######...', '..#......#..', '.#........#.', '.#.++++++.#.',
    '.#.+.+.+.+#.', '.#.++++++.#.', '.#.+.+.+.+#.', '.#........#.', '..########..', '............',
  ],
  burn: [
    '......#.....', '.....##.....', '.....#.#....', '....#..#..#.', '...#...#.##.', '..#..r..#.#.',
    '..#.rrr...#.', '.#.rrrrr..#.', '.#.rr+rr..#.', '.#..r+r..#..', '..#.....#...', '...#####....',
  ],
  down: [
    '...######...', '...#.++.#...', '...#.++.#...', '...#.++.#...', '...#.++.#...', '...#.++.#...',
    '.###.++.###.', '.#..++++..#.', '..#..++..#..', '...#....#...', '....#..#....', '.....##.....',
  ],
};

function PixelIcon({ bin }: { bin: Bin }) {
  const rows = ICONS[bin];
  return (
    <svg className="undertow-icon" viewBox="0 0 12 12" width={36} height={36} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) => [...row].map((c, x) => {
        if (c === '.' || (c === '+' && (x + y) % 2)) return null;
        return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === 'r' ? RED : HUE} />;
      }))}
    </svg>
  );
}

/** A framed well with the bin's icon; a dithered level rises as things go in (tapering, never quite full). */
function BinWell({ bin, n }: { bin: Bin; n: number }) {
  const fill = n / (n + 60);
  return (
    <div className={`undertow-well ${bin}`} style={{ '--fill': `${(fill * 100).toFixed(1)}%` } as CSSProperties}
      title={`${n} gone in`}>
      <span className="undertow-well-level" />
      <PixelIcon bin={bin} />
      <span className="undertow-well-n">{n} in</span>
      <i className="k tl" /><i className="k tr" /><i className="k bl" /><i className="k br" />
    </div>
  );
}

function Bins() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const sets = setsKept(game);
  const odds = rarityOdds(u.luck);
  const ruled = u.tray.some(id => u.rules[id] && binLevel(game, u.rules[id]) >= 1);
  const binCount: Record<Bin, number> = { keep: u.keptTotal, burn: u.burned, down: u.sentDown };
  return (
    <section className="undertow-sec">
      <h3 className="sub-head">The tray · {u.tray.length}/{trayCap(game)}</h3>
      <div className="undertow-tray" data-scroll>
        {u.tray.length === 0 && <p className="dim small-note">Empty.</p>}
        {u.tray.map((id, i) => ({ id, i })).reverse().map(({ id, i }) => {
          const o = objDef(id);
          return (
            <div key={i} className="undertow-trow">
              <span className={`undertow-name r${o.rarity}`}>{o.name}</span>
              <span className="undertow-tbtn">
                <button className="undertow-btn" onClick={() => run(s => sortObj(s, i, 'keep'))}>Keep</button>
                <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, i, 'burn'))}>+{emberYield(game, id)}</button>
                <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, i, 'down'))}>Down</button>
              </span>
            </div>
          );
        })}
      </div>
      {ruled && <button className="undertow-btn alt" onClick={() => run(sortByRules)}>Sort the tray by the rules</button>}

      <h3 className="sub-head">Bins</h3>
      <div className="undertow-bins">
        {BINS.map(b => {
          const l = binLevel(game, b), cost = binCost(game, b);
          return (
            <div key={b} className={`undertow-bin ${l ? 'on' : ''}`}>
              <BinWell bin={b} n={binCount[b]} />
              <div className="undertow-bin-head"><b>{BIN_NAMES[b]}</b><span>lv {l}</span></div>
              <p className="dim small-note">{l ? `Sorts by itself. ${BIN_DESC[b](l)}` : 'Sorts only by hand.'}</p>
              <button className="undertow-btn alt" disabled={game.ash.lt(cost)} onClick={() => run(s => upgradeBin(s, b))}>
                {l ? 'Deepen' : 'Teach it to sort'} · {fmt(cost)} ash
              </button>
              <SaveHint game={game} cost={cost} />
            </div>
          );
        })}
      </div>
      <p className="dim small-note">Luck {fmt(u.luck)} · odds {odds.map((o, r) => `${RARITY_NAMES[r]} ${(o * 100).toFixed(o < 0.1 ? 1 : 0)}%`).join(' · ')}</p>

      <h3 className="sub-head">Rules and sets</h3>
      <div className="undertow-rules" data-scroll>
        {SETS.map((name, si) => (
          <div key={name} className="undertow-set">
            <div className="ch-stat"><b>{name}</b> · {sets[si]} kept whole</div>
            {OBJECTS.filter(o => o.set === si).map(o => (
              <div key={o.id} className="undertow-rule">
                <span className={`undertow-name r${o.rarity}`}>{o.name}</span>
                <span className="ch-stat">{u.kept[o.id] ?? 0}</span>
                <span className="undertow-select">
                  <select value={u.rules[o.id] ?? ''} data-nodrag onChange={e => run(s => setRule(s, o.id, (e.target.value || null) as Bin | null))}>
                    <option value="">by hand</option>
                    {BINS.map(b => <option key={b} value={b} disabled={binLevel(game, b) < 1}>{BIN_NAMES[b]}</option>)}
                  </select>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="dim small-note">
        Kept {u.keptTotal} (x{keepMult(game).toFixed(2)}) · sets x{setMult(game).toFixed(2)} · burned {u.burned} · sent down {u.sentDown}
        {' '}(+{luckYield(game, 'key').toFixed(0)} luck a common, tilt {luckTilt(u.luck).toFixed(2)})
      </p>
    </section>
  );
}

// The leak schematic: the pipe snakes across a grid; cell n of the pipe sits at (col, row).
const SC = 16, SR = PIPE_CELLS / SC;
const cellPos = (n: number) => {
  const row = Math.floor(n / SC), k = n % SC;
  return { x: row % 2 ? SC - 1 - k : k, y: row };
};
const cellAt = (x: number, y: number) => (y % 2 ? y * SC + (SC - 1 - x) : y * SC + x);

function Leaks() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const [taps, setTaps] = useState<{ n: number; v: number }[]>([]);
  const [last, setLast] = useState<{ v: number; found: boolean } | null>(null);
  const tap = (n: number) => {
    const v = hiss(game, n);
    let found = false;
    run(s => { found = patch(s, n); });
    setLast({ v: found ? 1 : v, found });
    setTaps(t => (found ? t.filter(x => Math.abs(x.n - n) > 10) : [...t.filter(x => x.n !== n), { n, v }].slice(-12)));
  };
  const meter = last?.v ?? 0;
  const CELL = 22;
  return (
    <section className="undertow-sec">
      <h3 className="sub-head">Leak hunt · {u.leaks.length}/{LEAK_CAP} open · {u.patched} patched</h3>
      <svg className="undertow-schem" data-nodrag viewBox={`0 0 ${SC * CELL} ${SR * CELL}`} width="100%">
        {Array.from({ length: PIPE_CELLS - 1 }, (_, n) => {
          const a = cellPos(n), b = cellPos(n + 1);
          return <line key={n} x1={a.x * CELL + CELL / 2} y1={a.y * CELL + CELL / 2} x2={b.x * CELL + CELL / 2} y2={b.y * CELL + CELL / 2} className="undertow-pipe" />;
        })}
        {Array.from({ length: SR * SC }, (_, i) => {
          const x = i % SC, y = Math.floor(i / SC), n = cellAt(x, y), t = taps.find(q => q.n === n);
          return (
            <rect key={i} x={x * CELL + 3} y={y * CELL + 3} width={CELL - 6} height={CELL - 6} className="undertow-cell"
              style={t ? { fill: t.v > 0.95 ? RED : HUE, fillOpacity: 0.15 + 0.85 * t.v } : undefined}
              onPointerDown={e => { e.stopPropagation(); tap(n); }} />
          );
        })}
      </svg>
      <div className="undertow-meter" style={{ '--lvl': meter } as CSSProperties}>
        <span className="undertow-meter-bar" />
        <span className="ch-stat">{last ? (last.found ? 'Patched.' : meter > 0.8 ? 'Loud. Right here, nearly.' : meter > 0.3 ? 'A hiss.' : meter > 0.02 ? 'Faint.' : 'Nothing.') : 'Tap along the pipe and listen.'}</span>
      </div>
      <p className="dim small-note">Each open leak takes 5% off the Undertow (never below nothing). Patches stay: x{patchMult(game).toFixed(2)}. New leaks seep in slowly, never more than {LEAK_CAP}.</p>
    </section>
  );
}

/** The three bores as a stream: narrow runs go fast and broken, wide runs slow and full. */
function streamView(bore: number[], L: number[], eff: number): Px {
  const W = 180, H = 48;
  const tot = L.reduce((a, b) => a + b, 0);
  const edges = [0, L[0] / tot, (L[0] + L[1]) / tot, 1].map(f => f * W);
  return (x, y, t) => {
    const i = x < edges[1] ? 0 : x < edges[2] ? 1 : 2;
    const half = (bore[i] / BORE_BUDGET) * H * 0.95;
    const dy = Math.abs(y - H / 2);
    if (dy > half + 1.5) return 0.04;
    if (dy > half - 0.5) return 0.7; // the wall
    const speed = 6 + 30 / Math.max(1, bore[i]);
    const p = hash(Math.floor((x - t * speed * 8) / 3), y);
    const rough = (1 - eff) * 0.5 * (bore[i] < 4 ? 1 : 0.4);
    if (p > 0.9 - rough * 0.3) return rough > 0.25 && p > 0.985 ? 2.9 : 0.95;
    return 0.18 + 0.1 * Math.sin((x - t * speed * 4) * 0.2);
  };
}

function Gauge() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const d = depth(game), L = lengths(d), eff = efficiency(game);
  const used = u.bore.reduce((a, b) => a + b, 0);
  return (
    <section className="undertow-sec">
      <h3 className="sub-head">Bore and gauge · depth {d}</h3>
      <Plate w={180} h={48} px={() => streamView(u.bore, L, eff)} />
      <div className="undertow-bores">
        {u.bore.map((b, i) => (
          <label key={i} className="undertow-bore">
            <span className="ch-stat">Run {i + 1} · {L[i]} m · bore <b>{b}</b></span>
            <span className="undertow-slider">
              <input type="range" min={1} max={BORE_BUDGET - 2} value={b} data-nodrag className="undertow-range"
                style={{ '--pct': `${((b - 1) / (BORE_BUDGET - 3)) * 100}%` } as CSSProperties}
                onChange={e => run(s => setBore(s, i, Number(e.target.value)))} />
              <span className="undertow-ticks" aria-hidden>
                {Array.from({ length: BORE_BUDGET - 2 }, (_, k) => <i key={k} className={(k + 1) % 5 === 0 || k === 0 ? 'big' : ''} />)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="ch-row">
        <span className="ch-stat">Metal <b>{used}/{BORE_BUDGET}</b></span>
        <span className="ch-stat">Efficiency <b>{(eff * 100).toFixed(1)}%</b></span>
        <span className="ch-stat">Gauge <b>x{gaugeMult(game).toFixed(2)}</b></span>
      </div>
      <p className="dim small-note">
        {gaugeNow(game) < u.held - 1e-6 ? `The old bore still holds x${u.held.toFixed(2)}. Retune to go past it. ` : ''}
        The best mix moves when the Conduit goes deeper: next at {nextShift(game)} Conduits.
      </p>
    </section>
  );
}

function Figure() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const u = game.challenges.undertow;
  return (
    <section className="undertow-sec">
      <h3 className="sub-head">The figure · {u.approaches}/{APPROACHES}</h3>
      <ol className="undertow-perks" data-scroll>
        {PERKS.map((p, i) => (
          <li key={i} className={i < u.approaches ? 'on' : ''}>
            {i < u.approaches ? <><span className="undertow-lore">"{LORE[i]}"</span><span className="dim">{p}</span></> : <span className="dim">? ? ?</span>}
          </li>
        ))}
      </ol>
      <p className="dim small-note">Each approach takes longer than the last. Nothing happens to you there.</p>
    </section>
  );
}
