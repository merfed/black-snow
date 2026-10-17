// The Barker Ring: the panel inside the zone 6 box. The ring canvas (click a ring to flip it), what the
// code reads as, the socketed catalyst, and a room for the catalysts.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { SPIRAL } from '../../game/alchemy';
import {
  ashBonus, BARKER_LENGTHS, buyRing, canRefine, catMult, CATALYSTS, dropCost, dustRate, flip, FREE_PER, freeRings, holdMult,
  kindsFound, MAX_RINGS, newSpirals, openSocket2, pigmentBonus, pour, pourCost, reading, refine, refineCost, ringCost, rings, setSpan,
  sock2Cost, SOCK2_FOUND, socket, sockets, spanOf, spiralBonus,
} from '../../game/challenges/ring';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom } from './ChallengeSlot';
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

function CatalystRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const r = game.challenges.ring;
  const rd = reading(game);
  const pig = game.alchemy.pigment;
  const need = dropCost(r.found);
  const rate = dustRate(game);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <ChallengeRoom zone={SPIRAL} title="The fourth slot" note="it is never used up" onClose={onClose} className="ring-room"
      stat={<><b>{fmt(pig)}</b> pigment</>}>
      <div className="ring-room-cols">
        <section className="ring-room-left">
          <div className="ring-frame knots big">
            <RingCanvas pol={r.pol} n={rings(game)} span={spanOf(game)} locked={rd.barker} size={160} onFlip={i => run(s => flip(s, i))} />
          </div>
          <div className="ch-stat">pigment <b>x{pigmentBonus(game).toFixed(2)}</b> · ash <b>x{ashBonus(game).toFixed(2)}</b> · Spirals <b>x{spiralBonus(game).toFixed(2)}</b></div>
          <div className="ch-stat">held <b>x{holdMult(game).toFixed(2)}</b> <span className="dim">(grows while a code holds)</span></div>

          <h3 className="sub-head">Sockets</h3>
          <div className="ring-sockets">
            {Array.from({ length: 2 }, (_, i) => {
              const k = r.sock[i];
              if (i >= sockets(game)) return (
                <button key={i} className="ring-socket sealed" disabled={r.found < SOCK2_FOUND || pig < sock2Cost(game)} onClick={() => run(openSocket2)}>
                  <span>Open a second socket <small>{r.found < SOCK2_FOUND ? `after ${SOCK2_FOUND} drops` : ''}</small></span><span className="cost">{fmt(sock2Cost(game))} pigment</span>
                </button>
              );
              return (
                <div key={i} className={`ring-socket ${k >= 0 ? 'full' : ''}`} style={{ '--c': k >= 0 ? CATALYSTS[k].hex : 'transparent' } as CSSProperties}>
                  <CatSwatch k={k} />
                  <div>{k >= 0 ? <><b>{CATALYSTS[k].name}</b><span>x{catMult(game, k).toFixed(2)} {TARGET[CATALYSTS[k].target]}</span></> : <span className="dim">empty</span>}</div>
                  {k >= 0 && <button className="secondary" onClick={() => run(s => socket(s, i, -1))}>Lift</button>}
                </div>
              );
            })}
          </div>

          <h3 className="sub-head">Deep wind</h3>
          <div className="wind-bar ring-dust"><span style={{ width: `${Math.min(100, r.dust / need * 100)}%` }} /><b>{r.dust.toFixed(1)} / {need} silt</b></div>
          <p className="dim small-note">
            {rate > 0 ? `About ${dur(Math.max(0, need - r.dust) / rate)} to the next drop. Deeper with every tincture level; quicker while a code holds.` : 'The spiral is not taking colour yet.'}
          </p>
          <button className="secondary" disabled={pig < pourCost(game)} onClick={() => run(pour)}>
            Pour pigment into the deep wind <span className="cost">{fmt(pourCost(game))} → 1 silt</span>
          </button>
        </section>

        <section className="ring-room-right">
          <h3 className="sub-head">Catalysts <small>{kindsFound(game)}/{CATALYSTS.length} · {r.found} drops</small></h3>
          <ul className="ring-cats" data-scroll>
            {CATALYSTS.map((c, k) => {
              const have = r.cats[k];
              if (!have) return (
                <li key={k} className="unknown"><CatSwatch k={-1} /><div><b>? ? ?</b><span>Not yet. Something about {TARGET[c.target]}.</span></div></li>
              );
              const slotted = r.sock.indexOf(k);
              return (
                <li key={k} className={slotted >= 0 ? 'in' : ''}>
                  <CatSwatch k={k} />
                  <div>
                    <b>{c.name} <small>{have} held{r.ref[k] ? ` · refined ${r.ref[k]}` : ''}</small></b>
                    <span>bends every tincture aimed at {TARGET[c.target]}: x{catMult(game, k).toFixed(2)}</span>
                    <i>{c.desc}</i>
                  </div>
                  <div className="ring-cat-acts">
                    {Array.from({ length: sockets(game) }, (_, i) => (
                      <button key={i} className="secondary" disabled={slotted === i} onClick={() => run(s => socket(s, i, k))}>
                        {slotted === i ? 'Socketed' : sockets(game) > 1 ? `Socket ${i + 1}` : 'Socket'}
                      </button>
                    ))}
                    <button className="secondary" disabled={!canRefine(game, k)} onClick={() => run(s => refine(s, k))}
                      title="Melts one spare copy into it">
                      Refine <span className="cost">{have < 2 ? 'needs a copy' : fmt(refineCost(game, k))}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </ChallengeRoom>
  );
}
