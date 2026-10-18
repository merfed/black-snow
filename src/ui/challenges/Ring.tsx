// The Barker Ring: the panel inside the zone 6 box. The ring canvas (click a ring to flip it), what the
// code reads as, the socketed catalyst, and a room for the catalysts.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { SPIRAL } from '../../game/alchemy';
import {
  ashBonus, BARKER_LENGTHS, buyRing, canRefine, catMult, CATALYSTS, dropCost, dustRate, flip, FREE_PER, freeRings, holdMult,
  kindsFound, MAX_RINGS, newSpirals, openSocket2, pigmentBonus, pour, pourCost, reading, refine, refineCost, ringCost, rings, setSpan,
  sock2Cost, SOCK2_FOUND, socket, sockets, spanOf, spiralBonus,
} from '../../game/challenges/ring';
import { pigmentRate } from '../../game/engine';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
import './ring.css';

const HUE = ZONE_COLORS[SPIRAL];
const RED = '#ff2a2a';
const BG: [number, number, number] = [7, 5, 9];
const CORE = 0.12, EDGE = 0.96;
const TARGET: Record<string, string> = { rust: 'rust', embers: 'embers', echoes: 'echoes', ash: 'all ash', comfort: 'comfort', cycles: 'cycles', pigment: 'pigment', listen: 'Listen' };
const sign = (p: number) => (p > 0 ? '+' : '−');
const dur = (sec: number) => { const m = Math.ceil(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

/** Which ring a point at radius r (0..1) falls on, or -1. */
const ringAt = (r: number, n: number) => (r < CORE || r > EDGE ? -1 : Math.min(n - 1, Math.floor((r - CORE) / (EDGE - CORE) * n)));

/**
 * Concentric rings, inner first. A + ring is dense hue, a − ring is a sparse hue ring with a red seam.
 * Rings outside the reading are faint. When the reading is a Barker code the whole thing breathes and a
 * left-turning arm sweeps through it.
 */
function RingCanvas({ pol, n, span, locked, size = 112, onFlip }: { pol: number[]; n: number; span: number; locked: boolean; size?: number; onFlip?: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ pol, n, span, locked });
  live.current = { pol, n, span, locked };
  const [hover, setHover] = useState(-1);
  const hoverRef = useRef(-1);
  hoverRef.current = hover;
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    const d = img.data;
    const hue = hex(HUE), red = hex(RED), pale = hue.map(v => Math.round(v + (255 - v) * 0.55)) as [number, number, number];
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, t = 0, visible = true;
    const draw = (ms: number) => {
      if (ms - last >= 1000 / 10) {
        last = ms;
        t += 0.1;
        const { pol: p, n: rn, span: sp, locked: lk } = live.current;
        const hv = hoverRef.current;
        const breathe = lk ? 0.12 + 0.1 * Math.sin(t * 2) : 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
          const r = Math.hypot(dx, dy), i = (y * size + x) * 4;
          let col = BG, on = 0, accent = false;
          const th = threshold(x, y);
          if (r < CORE) { on = lk ? 0.9 : 0.35 + 0.1 * Math.sin(t); col = lk ? pale : hue; }
          else if (r <= EDGE) {
            const k = ringAt(r, rn);
            const w = (EDGE - CORE) / rn, f = (r - CORE) / w - k; // 0..1 across the ring
            const gap = f < 0.12 || f > 0.88;
            const read = k < sp;
            const a = Math.atan2(dy, dx);
            const arm = lk ? Math.max(0, Math.cos(a + Math.log(r) * 3 + t * 1.5)) : 0;
            if (gap) on = 0.04;
            else if (p[k] > 0) on = (read ? 0.78 : 0.3) + breathe + 0.25 * arm;
            else { on = (read ? 0.22 : 0.08) + breathe * 0.5 + 0.2 * arm; accent = read && Math.abs(f - 0.5) < 0.09; }
            if (k === hv && !gap) on += 0.18;
            col = on > 0.95 ? pale : hue;
          }
          const out = accent && th < 0.8 ? red : on > th ? col : BG;
          d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
        }
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
  }, [size]);
  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - b.left) / b.width * 2 - 1, dy = (e.clientY - b.top) / b.height * 2 - 1;
    return ringAt(Math.hypot(dx, dy), n);
  };
  return (
    <canvas ref={ref} width={size} height={size} className={`ring-canvas ${locked ? 'locked' : ''}`} data-nodrag
      onClick={e => { const k = pick(e); if (k >= 0) onFlip?.(k); }}
      onMouseMove={e => setHover(pick(e))} onMouseLeave={() => setHover(-1)}
      role="img" aria-label="The rings. Click one to flip it." />
  );
}

/** The autocorrelation readout: one bar per shift, red where a sidelobe is over 1. */
function Lobes({ lobes, n }: { lobes: number[]; n: number }) {
  return (
    <div className="ring-lobes" title="Sidelobes: how much the code agrees with itself shifted. A Barker code keeps every one within 1.">
      <span className="ring-lobe peak" style={{ '--h': 1 } as CSSProperties}><i />{n}</span>
      {lobes.map((c, k) => (
        <span key={k} className={`ring-lobe ${Math.abs(c) > 1 ? 'over' : ''}`} style={{ '--h': Math.abs(c) / n } as CSSProperties}><i />{c}</span>
      ))}
    </div>
  );
}

function CatSwatch({ k }: { k: number }) {
  return <span className="swatch ring-swatch" style={{ '--c': k >= 0 ? CATALYSTS[k].hex : '#1a141c' } as CSSProperties} />;
}

export function RingPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [open, setOpen] = useState(false);
  const r = game.challenges.ring;
  const n = rings(game), span = spanOf(game);
  const rd = reading(game);
  const status = rd.barker ? `BARKER ${span}` : rd.psl <= 1 ? `NO BARKER AT ${span}` : `SIDELOBE ${rd.psl}`;
  const k = r.sock[0];
  return (
    <div className="ring-panel">
      <div className="ring-top">
        <div className="ring-frame knots">
          <RingCanvas pol={r.pol} n={n} span={span} locked={rd.barker} onFlip={i => run(s => flip(s, i))} />
        </div>
        <div className="ring-side">
          <p className={`ring-status ${rd.barker ? 'on' : ''}`}>“{status}”</p>
          <p className="ring-code">{rd.code.map(sign).join(' ')}</p>
          <Lobes lobes={rd.lobes} n={span} />
          <div className="ch-stat ring-mults"><span>pigment <b>x{pigmentBonus(game).toFixed(2)}</b></span><span>ash <b>x{ashBonus(game).toFixed(2)}</b></span></div>
          <div className="ring-span">
            <button className="secondary" disabled={span <= 2} onClick={() => run(s => setSpan(s, span - 1))} aria-label="Read fewer rings">−</button>
            <span>read {span}/{n}</span>
            <button className="secondary" disabled={span >= n} onClick={() => run(s => setSpan(s, span + 1))} aria-label="Read more rings">+</button>
          </div>
        </div>
      </div>
      <p className="dim small-note">Click a ring to flip it. Codes exist at {BARKER_LENGTHS.join(', ')}. Best held: {r.best || 'none'}.
        {freeRings(game) < 4 && n < MAX_RINGS ? ` A free ring every ${FREE_PER} Spirals bought from now (${newSpirals(game) % FREE_PER}/${FREE_PER}).` : ''}</p>
      <div className="ch-row">
        {n < MAX_RINGS && (
          <button disabled={game.alchemy.pigment < ringCost(game)} onClick={() => run(buyRing)}>
            Wind another ring <span className="cost">{fmt(ringCost(game))} pigment</span>
          </button>
        )}
        <button className="secondary ring-cat-btn" onClick={() => setOpen(true)}>
          <CatSwatch k={k} />{k >= 0 ? `${CATALYSTS[k].name} x${catMult(game, k).toFixed(2)} ${TARGET[CATALYSTS[k].target]}` : `Catalysts ${Math.floor(r.dust / dropCost(r.found) * 100)}%`}
        </button>
      </div>
      {open && <CatalystRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

/** A 2px dither of a colour, for SVG fills. Ids are scoped by `id` so two pages never collide. */
function Dith({ id, c, sparse }: { id: string; c: string; sparse?: boolean }) {
  return (
    <pattern id={id} width={sparse ? 4 : 2} height={sparse ? 4 : 2} patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill={c} />{!sparse && <rect x="1" y="1" width="1" height="1" fill={c} />}
    </pattern>
  );
}

/** A bezel of ticks around the ring plate: a long one every sixth, a red arrow for the way the spiral turns. */
function RingBezel({ locked }: { locked: boolean }) {
  return (
    <svg className={`rg-bezel${locked ? ' on' : ''}`} viewBox="0 0 200 200" aria-hidden>
      <circle cx="100" cy="100" r="97" className="rg-bezel-track" />
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2, long = i % 6 === 0, r1 = 92, r2 = long ? 99 : 96;
        return <line key={i} x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * r2} y2={100 - Math.cos(a) * r2} className={long ? 'rg-tick long' : 'rg-tick'} />;
      })}
      <path d="M100 0 l-5 -7 h10 z" className="rg-arrow" transform="translate(0 8)" />
    </svg>
  );
}

/** A socket: a round setting with six prongs, the gem dithered in its own colour. */
function SocketGem({ k, id, size = 76 }: { k: number; id: string; size?: number }) {
  const c = k >= 0 ? CATALYSTS[k].hex : '';
  return (
    <svg className={`rg-gem${k >= 0 ? ' full' : ''}`} viewBox="0 0 80 80" width={size} height={size} aria-hidden>
      {k >= 0 && <defs><Dith id={id} c={c} /><Dith id={`${id}-s`} c={c} sparse /></defs>}
      <circle cx="40" cy="40" r="36" className="rg-gem-rim" />
      <circle cx="40" cy="40" r="31" className="rg-gem-rim inner" />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return <rect key={i} x={40 + Math.cos(a) * 30 - 3} y={40 + Math.sin(a) * 30 - 3} width="6" height="6" className="rg-prong" transform={`rotate(45 ${40 + Math.cos(a) * 30} ${40 + Math.sin(a) * 30})`} />;
      })}
      {k >= 0 ? <>
        <polygon points="40,14 62,28 62,52 40,66 18,52 18,28" fill={`url(#${id}-s)`} className="rg-gem-cut" style={{ stroke: c }} />
        <polygon points="40,22 54,31 54,49 40,58 26,49 26,31" fill={`url(#${id})`} />
        <polygon points="40,22 54,31 40,40 26,31" fill={c} />
        <path d="M30 30 l6 -4" className="rg-gem-glint" />
      </> : <text x="40" y="46" className="rg-gem-empty">·</text>}
    </svg>
  );
}

/** A vial on the shelf: liquid in its colour, as full as the copies held; a dashed ghost before it is found. */
function Vial({ k, have, refined, slot }: { k: number; have: number; refined: number; slot: number }) {
  const c = CATALYSTS[k].hex, id = `rg-vial-${k}`;
  const lvl = have ? Math.min(1, 0.35 + 0.15 * have) : 0;
  const top = 62 - lvl * 40;
  return (
    <svg className={`rg-vial-svg${have ? '' : ' ghost'}`} viewBox="0 0 40 70" aria-hidden>
      <defs>
        <Dith id={id} c={c} />
        <clipPath id={`${id}-clip`}><path d="M15 6 V24 L5 46 Q3 64 20 64 Q37 64 35 46 L25 24 V6 Z" /></clipPath>
      </defs>
      {have > 0 && <g clipPath={`url(#${id}-clip)`}>
        <rect x="0" y={top} width="40" height={70 - top} fill={`url(#${id})`} />
        <rect x="0" y={top} width="40" height="2" fill={c} />
      </g>}
      <path d="M15 6 V24 L5 46 Q3 64 20 64 Q37 64 35 46 L25 24 V6 Z" className="rg-vial-glass" />
      <rect x="12" y="2" width="16" height="5" className="rg-vial-cork" />
      {Array.from({ length: Math.min(4, refined) }, (_, i) => <rect key={i} x={8 + i * 7} y="66" width="4" height="3" className="rg-vial-pip" />)}
      {slot >= 0 && <g><title>{`In socket ${slot + 1}`}</title><rect x="27" y="11" width="10" height="11" className="rg-vial-tag" /><text x="32" y="20" className="rg-vial-s">{slot + 1}</text></g>}
      {!have && <text x="20" y="52" className="rg-vial-q">?</text>}
    </svg>
  );
}

/** The picked colour, large, on the bench: a tall flask with a bubble rising. */
function BenchVial({ k, have }: { k: number; have: number }) {
  const c = CATALYSTS[k].hex, id = `rg-bench-${k}`;
  const top = 62 - Math.min(1, 0.35 + 0.15 * have) * 40;
  const shape = 'M15 6 V24 L5 46 Q3 64 20 64 Q37 64 35 46 L25 24 V6 Z';
  return (
    <svg className="rg-bench-art" viewBox="0 0 40 70" aria-hidden>
      <defs><Dith id={id} c={c} /><clipPath id={`${id}-clip`}><path d={shape} /></clipPath></defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect x="0" y={top} width="40" height={70 - top} fill={`url(#${id})`} />
        <rect x="0" y={top} width="40" height="1.5" fill={c} />
        <rect x="12" y={top + 6} width="2" height="2" className="rg-bubble" />
        <rect x="24" y={top + 12} width="1.5" height="1.5" className="rg-bubble b2" />
      </g>
      <path d={shape} className="rg-vial-glass" />
      <path d="M10 46 Q9 58 16 60" className="rg-bench-glint" />
      <rect x="12" y="2" width="16" height="5" className="rg-vial-cork" />
    </svg>
  );
}

/** The deep wind: a left-turning spiral that silts up from the outside in toward the next drop. */
function DeepWind({ frac, silt, need, idle }: { frac: number; silt: number; need: number; idle: boolean }) {
  const pts: string[] = [];
  const turns = 3.25, steps = 140;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = -t * turns * Math.PI * 2 - Math.PI / 2, r = 86 - t * 56;
    pts.push(`${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`);
  }
  const d = 'M' + pts.join(' L');
  return (
    <svg className={`rg-wind${idle ? ' idle' : ''}`} viewBox="0 0 200 200" role="img" aria-label={`Deep wind: ${silt.toFixed(1)} of ${need} silt`}>
      <defs><Dith id="rg-wind-d" c="currentColor" sparse /></defs>
      <circle cx="100" cy="100" r="96" className="rg-wind-rim" />
      <circle cx="100" cy="100" r="92" fill="url(#rg-wind-d)" className="rg-wind-floor" />
      <path d={d} pathLength={100} className="rg-wind-track" />
      <path d={d} pathLength={100} className="rg-wind-fill" strokeDasharray={`${Math.max(0.01, frac * 100)} 100`} />
      <circle cx="100" cy="100" r="24" className="rg-wind-eye" />
      <text x="100" y="101" className="rg-wind-num">{silt.toFixed(1)}</text>
      <text x="100" y="113" className="rg-wind-of">of {need}</text>
    </svg>
  );
}

function CatalystRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const r = game.challenges.ring;
  const rd = reading(game);
  const pig = game.alchemy.pigment;
  const need = dropCost(r.found);
  const rate = dustRate(game);
  const [pickK, setPick] = useState(-1);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const pc = pourCost(game);
  const n = spanOf(game);
  const total = rings(game);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Pigment', value: fmt(pig), rate: `+${fmt(pigmentRate(game))}/s` },
        { label: 'Code', value: rd.barker ? `${n} held` : `${n} loose`, rate: rd.barker ? `held x${holdMult(game).toFixed(2)}` : `sidelobe ${rd.psl} · best ${r.best || '—'}`, title: 'The rings read now. A Barker code holds; holding grows its power.' },
        { label: 'Pigment bonus', value: `x${pigmentBonus(game).toFixed(2)}`, rate: `ash x${ashBonus(game).toFixed(2)} · Spirals x${spiralBonus(game).toFixed(2)}`, title: 'What the code pays' },
        { label: 'Catalysts', value: `${kindsFound(game)}/${CATALYSTS.length}`, rate: `${r.found} drops`, title: 'Kinds found, of all there are' },
        { label: 'Next drop', value: `${Math.floor(Math.min(100, r.dust / need * 100))}%`, rate: rate > 0 ? `~${dur(Math.max(0, need - r.dust) / rate)}` : 'no colour yet', title: `${r.dust.toFixed(1)} / ${need} silt in the deep wind` },
      ]}
      buy={{ label: 'Pour pigment', cost: pc, unit: 'pigment', afford: pig >= pc, onClick: () => run(pour), title: 'Pour into the deep wind: +1 silt toward the next catalyst' }}
    />
  );
  // the vial on the bench: the one picked, else the one in the first socket, else the first found
  const firstFound = r.cats.findIndex(c => c > 0);
  const sel = pickK >= 0 ? pickK : r.sock[0] >= 0 ? r.sock[0] : Math.max(0, firstFound);
  const sc = CATALYSTS[sel], have = r.cats[sel], slotted = r.sock.indexOf(sel);
  const codeTitle = rd.barker ? `A Barker code ${n} long. Every sidelobe is within 1.` : `Not a Barker code. Codes exist at ${BARKER_LENGTHS.join(', ')}.`;
  return (
    <ChallengeRoom zone={SPIRAL} title="The fourth slot" note="it is never used up" onClose={onClose} className="ring-room" status={status}>
      <div className="rg-grid">
        {/* ---- the rings, the code they spell, its sidelobes ---- */}
        <section className="rg-col" aria-label="The rings">
          <div className="rg-head"><span className="rg-cap">"THE RINGS"</span><span className="rg-head-note">best held {r.best || 'none'}</span></div>
          <div className="rg-dial">
            <RingBezel locked={rd.barker} />
            <div className="ring-frame knots rg-plate">
              <RingCanvas pol={r.pol} n={total} span={n} locked={rd.barker} size={160} onFlip={i => run(s => flip(s, i))} />
            </div>
          </div>
          <p className={`rg-verdict${rd.barker ? ' on' : ''}`} title={codeTitle}>“{rd.barker ? `BARKER ${n}` : rd.psl <= 1 ? `NO BARKER AT ${n}` : `SIDELOBE ${rd.psl}`}”</p>
          <div className="rg-code" title="Inner ring first. Click a cell to flip its ring.">
            {Array.from({ length: total }, (_, i) => (
              <button key={i} className={`rg-cell ${r.pol[i] > 0 ? 'pos' : 'neg'}${i < n ? ' read' : ''}`} onClick={() => run(s => flip(s, i))}
                aria-label={`Ring ${i + 1}: ${r.pol[i] > 0 ? 'plus' : 'minus'}. Flip it.`}>{r.pol[i] > 0 ? '+' : '−'}</button>
            ))}
          </div>
          <div className="rg-read-row">
            <Lobes lobes={rd.lobes} n={n} />
            <div className="rg-span" title="How many rings, from the inside, are read as the code">
              <button className="rg-pm" disabled={n <= 2} onClick={() => run(s => setSpan(s, n - 1))} aria-label="Read fewer rings">−</button>
              <span><b>{n}</b>/{total}<small>read</small></span>
              <button className="rg-pm" disabled={n >= total} onClick={() => run(s => setSpan(s, n + 1))} aria-label="Read more rings">+</button>
            </div>
          </div>
        </section>

        {/* ---- the sockets and the deep wind ---- */}
        <section className="rg-col" aria-label="The sockets">
          <div className="rg-head"><span className="rg-cap">"THE SOCKETS"</span><span className="rg-head-note">{sockets(game)} of 2 open</span></div>
          <div className="rg-sockets">
            {Array.from({ length: 2 }, (_, i) => {
              const k = r.sock[i];
              if (i >= sockets(game)) return (
                <div key={i} className="rg-socket sealed">
                  <svg className="rg-seal" viewBox="0 0 80 80" width="76" height="76" aria-hidden>
                    <circle cx="40" cy="40" r="36" className="rg-gem-rim" />
                    <path d="M14 14 L66 66 M66 14 L14 66" className="rg-seal-x" />
                    {[[16, 40], [64, 40], [40, 16], [40, 64]].map(([x, y], j) => <circle key={j} cx={x} cy={y} r="3" className="rg-rivet" />)}
                  </svg>
                  <span className="rg-socket-name dim">sealed</span>
                  <button className="rg-btn" disabled={r.found < SOCK2_FOUND || pig < sock2Cost(game)} onClick={() => run(openSocket2)}
                    title={r.found < SOCK2_FOUND ? `Opens after ${SOCK2_FOUND} drops (${r.found} so far)` : 'Open a second socket'}>
                    Open <span className="cost">{r.found < SOCK2_FOUND ? `after ${SOCK2_FOUND} drops` : `${fmt(sock2Cost(game))} pigment`}</span>
                  </button>
                </div>
              );
              return (
                <div key={i} className={`rg-socket${k >= 0 ? ' full' : ''}`} style={{ '--c': k >= 0 ? CATALYSTS[k].hex : 'transparent' } as CSSProperties}>
                  <button className="rg-socket-gem" onClick={() => k >= 0 && setPick(k)} disabled={k < 0} title={k >= 0 ? `${CATALYSTS[k].name}: show it on the bench` : 'Empty. Socket a catalyst from the shelf.'}>
                    <SocketGem k={k} id={`rg-sock-${i}`} />
                  </button>
                  <span className="rg-socket-no">socket {i + 1}</span>
                  {k >= 0 ? <>
                    <span className="rg-socket-name">{CATALYSTS[k].name}</span>
                    <span className="rg-socket-mult"><b>x{catMult(game, k).toFixed(2)}</b> {TARGET[CATALYSTS[k].target]}</span>
                    <button className="rg-btn" onClick={() => run(s => socket(s, i, -1))}>Lift</button>
                  </> : <span className="rg-socket-name dim">empty</span>}
                </div>
              );
            })}
          </div>

          <div className="rg-head"><span className="rg-cap">"THE DEEP WIND"</span><span className="rg-head-note">drop {r.found + 1}</span></div>
          <div className="rg-wind-wrap" title="Silt settles in the deep wind; a catalyst drops when it fills. Deeper with every tincture level, quicker while a code holds. Pour pigment to hurry it.">
            <DeepWind frac={Math.min(1, r.dust / need)} silt={r.dust} need={need} idle={rate <= 0} />
          </div>
          <p className="rg-quote">{rate > 0 ? (rd.barker ? '“The code holds. The silt comes quicker.”' : '“Silt settles in the deep wind.”') : '“The spiral is not taking colour yet.”'}</p>
        </section>

        {/* ---- the shelf of catalysts and the bench ---- */}
        <section className="rg-col" aria-label="The catalysts">
          <div className="rg-head"><span className="rg-cap">"THE SHELF"</span><span className="rg-head-note">{kindsFound(game)} of {CATALYSTS.length} colours</span></div>
          <div className="rg-shelf">
            {CATALYSTS.map((c, k) => {
              const h = r.cats[k], s = r.sock.indexOf(k);
              return (
                <button key={k} className={`rg-vial${k === sel ? ' sel' : ''}${s >= 0 ? ' in' : ''}${h ? '' : ' unknown'}`} onClick={() => setPick(k)}
                  title={h ? `${c.name}: ${h} held` : `Not yet. Something about ${TARGET[c.target]}.`} style={{ '--c': c.hex } as CSSProperties}>
                  <Vial k={k} have={h} refined={r.ref[k]} slot={s} />
                  <span className="rg-vial-label">{h ? TARGET[c.target] : '? ? ?'}</span>
                  {h > 1 && <span className="rg-vial-n">×{h}</span>}
                </button>
              );
            })}
          </div>
          <div className={`rg-bench${have ? '' : ' unknown'}${slotted >= 0 ? ' in' : ''}`} style={{ '--c': sc.hex } as CSSProperties}>
            {have ? <>
              <div className="rg-bench-top">
                <span className="rg-bench-name">{sc.name}</span>
                <span className="rg-bench-meta">{have} held{r.ref[sel] ? ` · refined ${r.ref[sel]}` : ''}</span>
              </div>
              <div className="rg-bench-body">
                <BenchVial k={sel} have={have} />
                <div className="rg-bench-text">
                  <div className="rg-bench-mult" title={`Bends every tincture aimed at ${TARGET[sc.target]}: stronger the more tincture is already aimed there`}>
                    <b>x{catMult(game, sel).toFixed(2)}</b><span>{TARGET[sc.target]}{slotted < 0 ? ' when socketed' : ''}</span>
                  </div>
                  <p className="rg-bench-desc">“{sc.desc}”</p>
                </div>
              </div>
              <div className="rg-bench-acts">
                {Array.from({ length: sockets(game) }, (_, i) => (
                  <button key={i} className="rg-btn" disabled={slotted === i} onClick={() => run(s => socket(s, i, sel))}>
                    {slotted === i ? 'Socketed' : sockets(game) > 1 ? `Socket ${i + 1}` : 'Socket'}
                  </button>
                ))}
                <button className="rg-btn" disabled={!canRefine(game, sel)} onClick={() => run(s => refine(s, sel))} title="Melts one spare copy into it">
                  Refine <span className="cost">{have < 2 ? 'needs a copy' : fmt(refineCost(game, sel))}</span>
                </button>
              </div>
            </> : <>
              <div className="rg-bench-top"><span className="rg-bench-name">? ? ?</span><span className="rg-bench-meta">not found</span></div>
              <div className="rg-bench-body">
                <span className="rg-bench-ghost"><Vial k={sel} have={0} refined={0} slot={-1} /></span>
                <div className="rg-bench-text">
                  <p className="rg-bench-desc">Not yet. Something about {TARGET[sc.target]}.</p>
                  <p className="rg-bench-hint">The deep wind sheds it, in time.</p>
                </div>
              </div>
            </>}
          </div>
        </section>
      </div>
    </ChallengeRoom>
  );
}
