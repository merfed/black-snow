// The Seal: the panel inside the Vacuum Lock's box. The hatch wheel and its twitch meter inline; seals,
// the airlock and the frost garden in a room.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import {
  airlockSpeed, buyCold, buyEar, buyHand, buyPump, buySeedUp, burstFor, canRest, coldCost, handCost, handTime, restCost, comboDone, comboLength, crystalRate, cycleLen, DIAL,
  digitOf, earCost, earReach, feel, frostIntake, gardenLit, gardenSymmetry, genTime, GH, GW, harvest, HARVEST_MIN, litCount,
  powerMult, pressSeal, pumpCost, repressSeal, REPRESS_COST, restDial, RIME_PER_FROST, SEAL_N, SEAL_ZONE, sealMult, sealPower, sealsPending,
  sealSyms, sealTarget, seedMax, seedsUsed, seedUpCost, setStance, STANCES, symMult, SYMS, tendCell, thaw, tierAshMult, tierCost,
  tierZoneMult, turnWheel, voidRate, wantDir, type SealState, type Stance, type SymId,
} from '../../game/challenges/seal';
import type { MultTarget } from '../../game/challenges/types';
import { ZONES } from '../../game/data';
import { fmt } from '../../game/format';
import type { GameState } from '../../game/state';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
import './seal.css';

type RGB = [number, number, number];
const HUE = ZONE_COLORS[SEAL_ZONE];
const BG: RGB = [7, 6, 4];
const mixc = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;
const INK = hex(HUE);
/** Background, dim ink, ink, pale highlight: the plate ramp in the zone hue. */
const RAMP: RGB[] = [BG, mixc(BG, INK, 0.35), INK, mixc(INK, [255, 255, 255], 0.6)];
const RED = hex('#ff2a2a');
const WAX = hex('#b0201c');

const mod = (n: number, m: number) => ((n % m) + m) % m;
const TAU = Math.PI * 2;

/** Put a brightness (0..1) through the ordered dither onto the ramp. */
function ink(v: number, x: number, y: number): RGB {
  const s = Math.max(0, Math.min(1, v)) * 3, lo = Math.floor(s);
  return RAMP[Math.min(3, lo + (s - lo > threshold(x, y) ? 1 : 0))];
}

/** Run a draw loop at a low frame rate while the canvas is on screen; hold still for reduced motion. */
function useLoop(ref: RefObject<HTMLCanvasElement | null>, draw: (g: CanvasRenderingContext2D, img: ImageData, t: number) => void, fps = 12) {
  const fn = useRef(draw);
  fn.current = draw;
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(c.width, c.height);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) { last = ms; fn.current(g, img, ms / 1000); g.putImageData(img, 0, 0); }
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
  }, [ref, fps]);
}

const put = (d: Uint8ClampedArray, i: number, c: RGB) => { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };

// ---------- the wheel ----------

const DS = 96; // dial canvas cells

/**
 * The hatch wheel as a safe dial: forty marks on the rim, four spokes, a hub. The red tooth at the top is
 * where the number is read. When the dial rests on the number the rim flares; the meter below twitches
 * harder the closer it gets.
 */
function Wheel({ rot, twitch, catching, onTurn }: {
  rot: number; twitch: number; catching: boolean; onTurn: (rot: number) => void;
}) {
  const dial = useRef<HTMLCanvasElement>(null);
  const meter = useRef<HTMLCanvasElement>(null);
  const live = useRef({ rot, twitch, catching });
  live.current = { rot, twitch, catching };
  const drag = useRef<{ a: number; rot: number } | null>(null);

  useLoop(dial, (_g, img, t) => {
    const { rot: r, catching: hit } = live.current;
    const d = img.data, R = (r / DIAL) * TAU;
    for (let y = 0; y < DS; y++) for (let x = 0; x < DS; x++) {
      const dx = (x + 0.5) / DS * 2 - 1, dy = (y + 0.5) / DS * 2 - 1;
      const rr = Math.hypot(dx, dy), i = (y * DS + x) * 4;
      if (rr > 0.99) { put(d, i, BG); continue; }
      const a = Math.atan2(dy, dx); // screen angle, clockwise from east
      const top = mod(a + Math.PI / 2, TAU); // clockwise from the top
      let v = 0;
      let red = false;
      if (rr > 0.8) {
        // the rim, turning with the wheel: a mark every fortieth, longer every fifth
        const m = mod((top - R) / TAU * DIAL, DIAL), f = Math.abs(m - Math.round(m));
        const long = Math.round(m) % 5 === 0;
        v = 0.22 + (f < 0.12 && rr > (long ? 0.83 : 0.89) ? 0.75 : 0) + (hit ? 0.25 + 0.1 * Math.sin(t * 9) : 0);
        if (top < 0.07 || top > TAU - 0.07) red = rr > 0.9; // the tooth
      } else if (rr > 0.66) {
        v = 0.62 - Math.abs(rr - 0.73) * 4 + 0.15 * Math.cos(a - 2.2); // the wheel's rim, lit from the upper left
      } else if (rr > 0.2) {
        const sp = Math.abs(Math.cos(2 * (top - R)));
        v = sp > 0.94 ? 0.78 + 0.12 * Math.cos(a - 2.2) : 0.06 + 0.08 * (1 - rr);
      } else {
        v = 0.7 - rr * 2 + 0.2 * Math.cos(a - 2.2) - (rr < 0.06 ? 0.6 : 0); // the hub
      }
      put(d, i, red ? RED : ink(v, x, y));
    }
  });

  useLoop(meter, (_g, img, t) => {
    const { twitch: f, catching: hit } = live.current;
    const W = img.width, H = img.height, d = img.data;
    // a needle that shivers more the closer the dial sits; noise scaled by closeness
    const jit = f * 0.07 * (Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3)) / 2 + f * 0.03 * (Math.random() - 0.5);
    const at = Math.max(0.02, Math.min(0.98, 0.04 + 0.92 * f + jit)) * W;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(x + 0.5 - at) < 1) { put(d, i, hit ? RED : RAMP[3]); continue; }
      const tick = x % 8 === 0 && y > H - 4;
      put(d, i, ink(tick ? 0.6 : 0.05 + 0.3 * (x / W) * (y / H), x, y));
    }
  }, 15);

  const angleOf = (e: PointerEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.atan2(e.clientY - b.top - b.height / 2, e.clientX - b.left - b.width / 2);
  };
  const down = (e: PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { a: angleOf(e), rot }; };
  const move = (e: PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    let da = angleOf(e) - g.a;
    da = mod(da + Math.PI, TAU) - Math.PI;
    g.a += da;
    g.rot += (da / TAU) * DIAL;
    onTurn(g.rot);
  };
  const up = () => { drag.current = null; };

  return (
    <div className="seal-wheel">
      <div className="seal-frame knots">
        <canvas ref={dial} width={DS} height={DS} className="seal-dial" data-nodrag onPointerDown={down} onPointerMove={move}
          onPointerUp={up} onPointerCancel={up} aria-label="The hatch wheel. Drag to turn, then let it rest." />
      </div>
      <div className="seal-frame seal-meter-frame"><canvas ref={meter} width={96} height={10} className="seal-meter" /></div>
    </div>
  );
}

// ---------- seals ----------

/** A pressed seal as a small dithered stamp: a wax disc with the design pressed into it. */
function Stamp({ bits, size = 30 }: { bits: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, g = c.getContext('2d')!, img = g.createImageData(size, size), d = img.data;
    const cell = (size - 6) / SEAL_N;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1, r = Math.hypot(dx + Math.sin(y * 1.7) * 0.03, dy);
      const i = (y * size + x) * 4;
      if (r > 1) { d[i + 3] = 0; continue; }
      const u = Math.floor((x - 3) / cell), v = Math.floor((y - 3) / cell);
      const on = u >= 0 && v >= 0 && u < SEAL_N && v < SEAL_N && bits[v * SEAL_N + u] === '1';
      const lightK = 0.75 - r * 0.5 - dx * 0.2 - dy * 0.2;
      const col = on ? (lightK * 0.8 > threshold(x, y) ? INK : mixc(INK, BG, 0.5))
        : r > 0.86 ? (0.5 > threshold(x, y) ? WAX : mixc(WAX, BG, 0.6))
          : (lightK > threshold(x, y) ? WAX : mixc(WAX, BG, 0.55));
      put(d, i, col);
    }
    g.putImageData(img, 0, 0);
  }, [bits, size]);
  return <canvas ref={ref} width={size} height={size} className="seal-stamp" />;
}

const TARGET_NAME = (t: MultTarget) => (t === 'ash' ? 'all ash' : `${ZONES[Number(t.slice(4))].name}s`);
const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;
const blank = () => '0'.repeat(SEAL_N * SEAL_N);
/** What one seal would give on its own. */
const soloMult = (bits: string) => powerMult(sealTarget(digitOf(bits)), sealPower(bits));
type Run = (fn: (s: GameState) => unknown) => void;

/** One symmetry as a tiny engraving: the fold line, or the turn's arc, across a square of wax. */
function SymGlyph({ id }: { id: SymId }) {
  return (
    <svg viewBox="0 0 20 20" className="sl-glyph" aria-hidden>
      <rect x="2.5" y="2.5" width="15" height="15" className="sl-glyph-box" />
      {id === 'mirror' && <line x1="10" y1="1" x2="10" y2="19" className="sl-glyph-ln" />}
      {id === 'flip' && <line x1="1" y1="10" x2="19" y2="10" className="sl-glyph-ln" />}
      {id === 'cross' && <line x1="1" y1="1" x2="19" y2="19" className="sl-glyph-ln" />}
      {id === 'half' && <><path d="M4.5 10 A5.5 5.5 0 0 1 15.5 10" className="sl-glyph-arc" /><path d="M13.2 8.6 L15.5 10.8 L17.4 8.2" className="sl-glyph-arc" /></>}
      {id === 'turn' && <><path d="M10 4.5 A5.5 5.5 0 0 1 15.5 10" className="sl-glyph-arc" /><path d="M13.4 8.8 L15.5 10.9 L17.5 8.6" className="sl-glyph-arc" /></>}
      <rect x="9" y="9" width="2" height="2" className="sl-glyph-dot" />
    </svg>
  );
}

const TRAY = 16; // stamps on one tray page: two rows of eight

function SealsSection({ game, run }: { game: GameState; run: Run }) {
  const c = game.challenges.seal;
  const [bits, setBits] = useState(blank);
  const [sel, setSel] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pending = sealsPending(game);
  const d = digitOf(bits), lit = litCount(bits);
  const sy = sealSyms(bits);
  const flip = (i: number) => setBits(b => b.slice(0, i) + (b[i] === '1' ? '0' : '1') + b.slice(i + 1));
  const targets = [...new Set(c.seals.map(x => sealTarget(digitOf(x.bits))))];
  const slots = c.seals.length + pending;
  const pages = Math.max(1, Math.ceil(slots / TRAY));
  const pg = Math.min(page, pages - 1);
  return (
    <section className="sl-col" aria-label="Seals">
      <div className="sl-head"><span className="sl-cap">"THE PRESS"</span><span className="sl-head-note">{c.seals.length} pressed{pending ? ` · ${pending} waiting` : ''}</span></div>
      <div className="sl-press">
        <div className={`sl-matrix knots${sel !== null ? ' melting' : ''}`} data-nodrag title="Light the wax: each lit pixel adds to the seal. Symmetric designs press harder.">
          {Array.from(bits, (b, i) => (
            <button key={i} className={`seal-px ${b === '1' ? 'on' : ''}`} onClick={() => flip(i)} aria-label={`pixel ${i % SEAL_N + 1}, ${Math.floor(i / SEAL_N) + 1}`} />
          ))}
        </div>
        <div className="sl-read">
          <div className="sl-digit" title="The digit is the lit count folded to 1-9. It picks what the seal feeds: 1-8 a zone, 9 all ash.">
            <b>{d || '–'}</b><span><small>DIGIT</small><i>lit {lit}</i></span>
          </div>
          <p className="sl-gives" title="What this design would give on its own">{lit ? <><b>{pct(soloMult(bits))}</b><span>{TARGET_NAME(sealTarget(d))}</span></> : <><b className="dim">+0%</b><span className="dim">Light some wax.</span></>}</p>
          <ul className="sl-syms" aria-label="Symmetries">
            {SYMS.map(x => {
              const st = lit && sy[x.id] === 1 ? 'on' : lit && sy[x.id] > 0.6 ? 'half' : '';
              return <li key={x.id} className={st} title={`${x.name}: ${st === 'on' ? 'holds' : st === 'half' ? 'nearly holds' : 'broken'}`}><SymGlyph id={x.id} /><span>{x.name}</span></li>;
            })}
          </ul>
        </div>
      </div>
      <div className="sl-row">
        {sel === null
          ? <button className="max-all seal-press" disabled={!pending || !lit} onClick={() => run(s => { if (pressSeal(s, bits)) setBits(blank()); })}>
            {pending ? 'Press the seal' : 'Open a tier to press'}
          </button>
          : <button className="max-all seal-press" disabled={!lit || c.rime < REPRESS_COST} onClick={() => run(s => { if (repressSeal(s, sel, bits)) setSel(null); })}>
            Melt and re-press <span className="cost">{REPRESS_COST} rime</span>
          </button>}
        <button className="sl-btn" onClick={() => { setBits(blank()); setSel(null); }}>Clear</button>
      </div>

      <div className="sl-head"><span className="sl-cap">"THE TRAY"</span>
        <span className="sl-head-note">{sel !== null ? `seal ${sel + 1} on the press` : c.seals.length ? 'click one to melt it' : 'nothing pressed yet'}</span>
        {pages > 1 && <span className="sl-tray-turn">
          <button className="sl-pm" disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="Earlier seals">‹</button>
          <span>{pg + 1}/{pages}</span>
          <button className="sl-pm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Later seals">›</button>
        </span>}
      </div>
      <div className="sl-tray">
        <div className="sl-tray-grid">
          {Array.from({ length: TRAY }, (_, k) => {
            const i = pg * TRAY + k, x = c.seals[i];
            if (x) return (
              <button key={k} className={`sl-slot${sel === i ? ' sel' : ''}`} title={`${pct(soloMult(x.bits))} ${TARGET_NAME(sealTarget(digitOf(x.bits)))}. Click to melt and redraw.`}
                onClick={() => { if (sel === i) { setSel(null); setBits(blank()); } else { setSel(i); setBits(x.bits); } }}>
                <Stamp bits={x.bits} />
              </button>
            );
            return <span key={k} className={`sl-slot ${i < slots ? 'wait' : 'none'}`} title={i < slots ? 'A tier waits for its seal' : undefined} />;
          })}
        </div>
      </div>
      <ul className="sl-key" aria-label="What the seals give, by digit">
        {Array.from({ length: 9 }, (_, k) => {
          const t = sealTarget(k + 1), m = sealMult(c, t), on = targets.includes(t);
          return (
            <li key={k} className={`${on ? 'on' : ''}${lit && d === k + 1 ? ' now' : ''}`} style={{ '--kc': t === 'ash' ? '#ece6d2' : ZONE_COLORS[k] } as CSSProperties}
              title={`Digit ${k + 1}: ${TARGET_NAME(t)}${on ? ` x${m.toFixed(2)} from seals` : ', no seal yet'}`}>
              <i>{k + 1}</i><b>{on ? `x${m >= 10 ? m.toFixed(1) : m.toFixed(2)}` : '·'}</b>
            </li>
          );
        })}
      </ul>
      <p className="sl-quote">"Every door that opens wants its mark."</p>
    </section>
  );
}

// ---------- the airlock ----------

/** Three chambers left to right; a bright slug of something moves through them as the lock cycles. */
function Airlock({ c }: { c: SealState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(c);
  live.current = c;
  const base = useRef({ phase: c.phase, at: performance.now() });
  useEffect(() => { base.current = { phase: c.phase, at: performance.now() }; }, [c.phase]);
  useLoop(ref, (_g, img, t) => {
    const s = live.current, W = img.width, H = img.height, d = img.data;
    const ph = mod(base.current.phase + (3 * (performance.now() - base.current.at) / 1000) / cycleLen(s), 3);
    const cw = W / 3;
    const ashy = s.stance !== 'frost', frosty = s.stance !== 'ash' && s.frost > 0.01;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, k = Math.floor(x / cw), lx = (x % cw) / cw, ly = y / H;
      const wall = lx < 0.06 || lx > 0.94 || ly < 0.1 || ly > 0.9;
      // the open door: the chamber the slug is crossing into
      const door = (lx < 0.06 && Math.abs(ph - k) < 0.18) || (lx > 0.94 && Math.abs(ph - (k + 1)) < 0.18);
      let v = wall && !door ? 0.55 + 0.2 * Math.sin(y * 0.9) : 0.04;
      const here = ph - k; // 0..1 while the slug is in this chamber
      if (!wall && here >= 0 && here < 1) {
        const cx = 0.15 + 0.7 * here, dist = Math.hypot((lx - cx) * 2.2, ly - 0.5);
        const p = Math.max(0, 0.75 - dist * 2.4) * (0.85 + 0.15 * Math.sin(t * 6 + x));
        if (k === 1) v = Math.max(v, p * (0.5 + 0.5 * Math.sin(x * 0.7 + y * 1.3 + t * 4))); // the vacuum tears it up
        else v = Math.max(v, p);
      }
      let col = ink(v, x, y);
      if (!wall && k === 2 && here >= 0 && here < 1 && v > 0.4 && ashy && (x + y) % 3 === 0) col = RED; // void ash comes out red-black
      if (!wall && k === 2 && frosty && ly > 0.78 && (x * 7 + y * 3) % 5 === 0) col = RAMP[3]; // rime settling
      put(d, i, col);
    }
  }, 10);
  return <canvas ref={ref} width={120} height={50} className="seal-airlock" />;
}

/**
 * Where the airlock empties: one pipe down into a valve, forking to void ash (left, red) and frost (right, bone).
 * A branch runs thick when it takes everything, thin at half, and dashed and dark when it's shut.
 */
function Valve({ stance }: { stance: Stance }) {
  const [ashK, frostK] = stance === 'ash' ? [1, 0] : stance === 'frost' ? [0, 1] : [0.5, 0.5];
  const turn = stance === 'ash' ? -45 : stance === 'frost' ? 45 : 0;
  const w = (k: number) => (k ? 2 + 5 * k : 1.5);
  return (
    <svg className="sl-valve" viewBox="0 0 300 76" role="img" aria-label={`The valve: ${stance === 'split' ? 'half and half' : `all ${stance}`}`}>
      <path d="M150 0 V22" className="sl-pipe sl-pipe-in" />
      <path d="M150 34 C150 52 110 50 52 50 V70" className={`sl-pipe sl-pipe-ash${ashK ? ' flow' : ' shut'}`} style={{ strokeWidth: w(ashK) }} />
      <path d="M150 34 C150 52 190 50 248 50 V70" className={`sl-pipe sl-pipe-frost${frostK ? ' flow' : ' shut'}`} style={{ strokeWidth: w(frostK) }} />
      <g transform={`rotate(${turn} 150 28)`} className="sl-valve-wheel">
        <circle cx="150" cy="28" r="12" />
        <line x1="150" y1="16" x2="150" y2="40" /><line x1="138" y1="28" x2="162" y2="28" />
        <circle cx="150" cy="16" r="2.4" className="sl-valve-mark" />
      </g>
      <text x="28" y="40" className="sl-valve-lbl ash">VOID ASH</text>
      <text x="272" y="40" className="sl-valve-lbl frost" textAnchor="end">FROST</text>
    </svg>
  );
}

/** The pumps' gauge: a half dial, the needle pushed round by airlock speed (log scale to x20). */
function SpeedGauge({ c }: { c: SealState }) {
  const sp = airlockSpeed(c), k = Math.max(0, Math.min(1, Math.log(sp) / Math.log(20)));
  const a = Math.PI * (1 - k), R = 40;
  return (
    <div className="sl-gauge" title={`Pumps lv ${c.pumps}: the airlock runs x${sp.toFixed(2)}, one cycle every ${Math.round(cycleLen(c))}s. Prime pumps below.`}>
      <svg viewBox="0 0 110 66" aria-hidden>
        <path d={`M${55 - R} 56 A${R} ${R} 0 0 1 ${55 + R} 56`} className="sl-gauge-track" />
        <path d={`M${55 - R} 56 A${R} ${R} 0 0 1 ${55 + Math.cos(a) * R} ${56 - Math.sin(a) * R}`} className="sl-gauge-arc" />
        {Array.from({ length: 11 }, (_, i) => {
          const b = Math.PI * (1 - i / 10), r1 = R + 4, r2 = R + (i % 5 === 0 ? 10 : 7);
          return <line key={i} x1={55 + Math.cos(b) * r1} y1={56 - Math.sin(b) * r1} x2={55 + Math.cos(b) * r2} y2={56 - Math.sin(b) * r2} className="sl-gauge-tick" />;
        })}
        <line x1="55" y1="56" x2={55 + Math.cos(a) * (R - 6)} y2={56 - Math.sin(a) * (R - 6)} className="sl-gauge-needle" />
        <circle cx="55" cy="56" r="3.5" className="sl-gauge-hub" />
      </svg>
      <b>x{sp.toFixed(2)}</b>
      <small>PUMPS {c.pumps}</small>
    </div>
  );
}

function AirlockSection({ game, run }: { game: GameState; run: Run }) {
  const c = game.challenges.seal;
  const fi = frostIntake(c);
  return (
    <section className="sl-col" aria-label="The airlock">
      <div className="sl-head"><span className="sl-cap">"THE AIRLOCK"</span><span className="sl-head-note">one cycle every {Math.round(cycleLen(c))}s</span></div>
      <div className="seal-frame knots sl-lock">
        <Airlock c={c} />
        <div className="sl-chambers" aria-hidden><span>IN</span><span>VACUUM</span><span>OUT</span></div>
      </div>
      <Valve stance={c.stance} />
      <div className="sl-stances" role="radiogroup" aria-label="What to feed the airlock">
        {STANCES.map(x => (
          <button key={x.id} role="radio" aria-checked={c.stance === x.id} className={`sl-btn${c.stance === x.id ? ' on' : ''}`} onClick={() => run(s => setStance(s, x.id))} title={x.note}>
            {x.name}<small>{x.note.split(': ').pop()}</small>
          </button>
        ))}
      </div>
      <div className="sl-instr">
        <SpeedGauge c={c} />
        <div className="sl-ups">
          <button className="sl-up" disabled={c.voidAsh < earCost(c)} onClick={() => run(buyEar)}
            title={`The twitch reaches ${earReach(game).toFixed(1)} marks from the number. A miss costs ${fmt(restCost(game))} void ash.`}>
            <span className="sl-up-name">Stethoscope <i>lv {c.ear}</i></span>
            <small>reach {earReach(game).toFixed(1)} · miss {fmt(restCost(game))}</small>
            <span className="sl-cost">{fmt(earCost(c))} void</span>
          </button>
          <button className="sl-up" disabled={c.voidAsh < handCost(c)} onClick={() => run(buyHand)}
            title={c.hand ? `Finds a number by itself every ${Math.round(handTime(c.hand) / 60)}m; next level every ${Math.round(handTime(c.hand + 1) / 60)}m` : 'Turns the wheel by feel while you are away'}>
            <span className="sl-up-name">A patient hand <i>lv {c.hand}</i></span>
            <small>{c.hand ? `every ${Math.round(handTime(c.hand) / 60)}m → ${Math.round(handTime(c.hand + 1) / 60)}m` : 'turns it while away'}</small>
            <span className="sl-cost">{fmt(handCost(c))} void</span>
          </button>
        </div>
      </div>
      <p className={`sl-warn${fi > 0 && c.frost <= 0 ? ' on' : ''}`}>{fi > 0 && c.frost <= 0 ? 'No frost to feed it. Harvest the walls.' : '"It breathes in. It breathes out."'}</p>
    </section>
  );
}

// ---------- the frost garden ----------

const CELL = 8;

/** The wall: bare stone, frost as crystal glints, seeds in red. Click to seed, take back or prune. */
function Garden({ c, onCell }: { c: SealState; onCell: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(c.garden);
  live.current = c.garden;
  useLoop(ref, (_g, img, t) => {
    const g = live.current, W = img.width, H = img.height, d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), ch = g[cy * GW + cx];
      const lx = (x % CELL) / CELL - 0.5, ly = (y % CELL) / CELL - 0.5, i = (y * W + x) * 4;
      let col: RGB;
      if (ch === 'o') col = Math.hypot(lx, ly) < 0.32 ? RED : ink(0.3, x, y);
      else if (ch === '*') {
        // a six-armed glint; arms shimmer a little
        const arm = Math.min(Math.abs(lx), Math.abs(ly), Math.abs(lx - ly), Math.abs(lx + ly));
        const spark = 0.05 * Math.sin(t * 2 + cx * 1.7 + cy * 2.3);
        col = ink(0.35 + (arm < 0.07 ? 0.5 : 0) + spark - Math.hypot(lx, ly) * 0.4, x, y);
      } else col = ink(0.03 + ((x % CELL === 0 || y % CELL === 0) ? 0.1 : 0), x, y);
      put(d, i, col);
    }
  }, 8);
  const click = (e: MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width) * GW), y = Math.floor(((e.clientY - b.top) / b.height) * GH);
    if (x >= 0 && y >= 0 && x < GW && y < GH) onCell(y * GW + x);
  };
  return <canvas ref={ref} width={GW * CELL} height={GH * CELL} className="seal-garden" data-nodrag onClick={click} aria-label="The frost garden" />;
}

/** Symmetry as a thermometer beside the wall: the column climbs with the garden's symmetry. */
function Thermo({ sym, mult }: { sym: number; mult: number }) {
  return (
    <div className="sl-thermo" title={`Symmetry ${Math.round(sym * 100)}%: crystals grow x${mult.toFixed(2)}. Mirror the frost left to right to raise it.`}>
      <b>x{mult.toFixed(2)}</b>
      <div className="sl-thermo-tube"><i style={{ height: `${Math.round(sym * 100)}%` }} /></div>
      <span className="sl-thermo-bulb" />
      <small>{Math.round(sym * 100)}%</small>
    </div>
  );
}

function GardenSection({ game, run }: { game: GameState; run: Run }) {
  const c = game.challenges.seal;
  const lit = gardenLit(c.garden), sym = gardenSymmetry(c.garden);
  const used = seedsUsed(c), max = seedMax(c);
  const nextGen = Math.round(30 / (1 + 0.3 * (c.cold + 1)));
  return (
    <section className="sl-col" aria-label="The frost garden">
      <div className="sl-head"><span className="sl-cap">"THE WALLS"</span><span className="sl-head-note">grows every {Math.round(genTime(c))}s</span></div>
      <div className="sl-wall">
        <div className="seal-frame knots sl-garden"><Garden c={c} onCell={i => run(s => tendCell(s, i))} /></div>
        <Thermo sym={sym} mult={symMult(c.garden)} />
      </div>
      <p className="sl-hint" title="Frost creeps where exactly one neighbour is lit. Seeds stay lit; thawing melts the frost and keeps them.">Click bare wall to seed, frost to prune.</p>
      <div className="sl-readouts">
        <span><b>{lit}<i>/{GW * GH}</i></b><small>frosted</small></span>
        <span><b>+{fmt(crystalRate(c))}</b><small>crystals a second</small></span>
        <span className="sl-seeds" title={`Seeds planted ${used} of ${max}`}>
          <span className="sl-seed-pips">{Array.from({ length: max }, (_, k) => <i key={k} className={k < used ? 'on' : ''} />)}</span>
          <small>seeds {used}/{max}</small>
        </span>
      </div>
      <div className="sl-row">
        <button className="max-all seal-harvest" disabled={c.crystals < HARVEST_MIN} onClick={() => run(harvest)} title={`${c.harvests} harvests so far`}>
          Harvest <span className="cost">{c.crystals < HARVEST_MIN ? `at ${HARVEST_MIN}` : `${fmt(c.crystals)} frost`}</span>
        </button>
        <button className="sl-btn" onClick={() => run(thaw)} title="Melt the frost, keep the seeds">Thaw</button>
      </div>
      <div className="sl-ups sl-ups-2">
        <button className="sl-up" disabled={c.rime < seedUpCost(c)} onClick={() => run(buySeedUp)} title="One more seed you can plant on the wall">
          <span className="sl-up-name">Another seed</span><small>{max} → {max + 1}</small><span className="sl-cost">{fmt(seedUpCost(c))} rime</span>
        </button>
        <button className="sl-up" disabled={c.rime < coldCost(c)} onClick={() => run(buyCold)} title={`The frost grows every ${Math.round(genTime(c))}s; next level every ${nextGen}s`}>
          <span className="sl-up-name">Let the cold in</span><small>{Math.round(genTime(c))}s → {nextGen}s</small><span className="sl-cost">{fmt(coldCost(c))} rime</span>
        </button>
      </div>
      <p className="sl-foot">{c.harvests} {c.harvests === 1 ? 'harvest' : 'harvests'} taken · "It is warmer than it looks."</p>
    </section>
  );
}

// ---------- panel ----------

function SealRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const c = game.challenges.seal;
  const fi = frostIntake(c), pc = pumpCost(c);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Void ash', value: fmt(c.voidAsh), rate: `+${fmt(voidRate(c))}/s` },
        { label: 'Rime', value: fmt(c.rime), rate: c.frost > 0 || !fi ? `+${fmt(c.frost > 0 ? fi * RIME_PER_FROST : 0)}/s` : 'no frost to feed' },
        { label: 'Frost', value: fmt(c.frost), rate: `${fmt(c.crystals)} on the walls`, title: 'Frost waiting for the airlock; crystals ready to harvest' },
        { label: 'Tier', value: c.tier >= 3 ? c.tier : `${c.tier}/3`, rate: `${c.seals.length} seals${sealsPending(game) ? ` · ${sealsPending(game)} waiting` : ''}` },
        { label: 'All ash', value: `x${(tierAshMult(c.tier) * sealMult(c, 'ash')).toFixed(2)}`, rate: `locks x${(tierZoneMult(c.tier) * sealMult(c, 'zone4')).toFixed(2)}`,
          title: 'From opened tiers and seals. Locks: the Vacuum Locks' },
      ]}
      buy={{
        label: 'Prime a pump', cost: pc, unit: 'rime', afford: c.rime >= pc, onClick: () => run(buyPump),
        title: `Pumps lv ${c.pumps}: the airlock runs x${airlockSpeed(c).toFixed(2)}, one cycle every ${Math.round(cycleLen(c))}s`,
      }}
    />
  );
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <ChallengeRoom zone={SEAL_ZONE} title="Below the hatch" note="the lock holds, and lets go" onClose={onClose} className="seal-room" status={status}>
      <div className="sl-grid">
        <SealsSection game={game} run={run} />
        <AirlockSection game={game} run={run} />
        <GardenSection game={game} run={run} />
      </div>
    </ChallengeRoom>
  );
}

export function SealPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const c = game.challenges.seal;
  const [room, setRoom] = useState(false);
  const [rot, setRot] = useState(() => -c.dial);
  const [dir, setDir] = useState(1);
  const [flash, setFlash] = useState(0);
  const top = mod(-Math.round(rot), DIAL);
  const done = comboDone(game);
  const len = comboLength(c.tier);
  const twitch = feel(game, top);
  const miss = restCost(game);
  const cost = tierCost(c.tier);
  const pending = sealsPending(game);

  // rot climbs as the wheel turns clockwise ("right"); like a real safe, the number at the tooth falls
  const turn = (r: number) => { setDir(r > rot ? 1 : r < rot ? -1 : dir); setRot(r); };
  const rest = () => run(s => { if (restDial(s, top, dir)) setFlash(f => f + 1); else setMissed(m => m + 1); });
  const [missed, setMissed] = useState(0);
  const nudge = (k: number) => { setRot(rot + k); setDir(k); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!done && canRest(game)) rest(); }
  };
  useEffect(() => {
    if (!missed) return;
    const id = setTimeout(() => setMissed(0), 900);
    return () => clearTimeout(id);
  }, [missed]);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), 700);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <div className="seal-panel" style={{ '--seal-red': '#ff2a2a' } as CSSProperties}>
      <div className="seal-top">
        <div tabIndex={0} onKeyDown={key} className="seal-wheel-wrap" aria-label="Hatch dial. Arrow keys turn it.">
          <Wheel rot={rot} twitch={twitch} catching={!!flash} onTurn={r => turn(r)} />
          <div className="seal-nudge">
            <button className="secondary" onClick={() => nudge(-1)} aria-label="Turn left">↺</button>
            <b className={`seal-num ${flash ? 'caught' : ''}`}>{String(top).padStart(2, '0')}</b>
            <button className="secondary" onClick={() => nudge(1)} aria-label="Turn right">↻</button>
          </div>
        </div>
        <div className="seal-side">
          <div className="seal-combo" aria-label="The combination">
            {Array.from({ length: len }, (_, k) => {
              const n = c.found[k];
              const now = k === c.found.length;
              return <span key={k} className={n !== undefined ? 'got' : now ? 'now' : ''}>{n !== undefined ? String(n).padStart(2, '0') : now ? (wantDir(k) > 0 ? '↻?' : '↺?') : '··'}</span>;
            })}
          </div>
          <div className="seal-stats">
            <span className="ch-stat">Tier <b>{c.tier}</b> · ash x{tierAshMult(c.tier).toFixed(2)} · locks x{tierZoneMult(c.tier).toFixed(2)}</span>
            <span className="ch-stat">Void ash <b>{fmt(c.voidAsh)}</b> <span className="dim">+{fmt(voidRate(c))}/s</span></span>
            <span className="ch-stat">Rime <b>{fmt(c.rime)}</b> · frost {fmt(c.frost)}</span>
          </div>
          <p className="seal-caption">{flash ? '"CLICK."' : done ? '"IT WILL TURN NOW."' : missed ? '"NOTHING."' : twitch > 0.3 ? '"WARMER."' : '"FEEL FOR IT."'}</p>
        </div>
      </div>
      {done
        ? <button className="max-all seal-turn" disabled={c.voidAsh < cost} onClick={() => run(turnWheel)}>
          Turn the wheel <span className="cost">{fmt(cost)} void ash · pays {fmt(burstFor(game))} ash</span>
        </button>
        : <>
          <button className="max-all seal-rest" disabled={!canRest(game)} onClick={rest}>
            Let it rest <span className="cost">a miss costs {fmt(miss)} void ash</span>
          </button>
          <p className="dim small-note">Turn the way the arrow says. Rest where the needle shivers hardest; it kicks once more on the number itself.{c.hand ? ` The hand finds the next one in ${Math.ceil((handTime(c.hand) - c.handT) / 60)}m.` : ''}</p>
        </>}
      <div className="ch-row">
        <button className={pending ? 'max-all seal-open' : 'secondary seal-open'} onClick={() => setRoom(true)}>
          {pending ? `Press a seal (${pending})` : 'Seals, airlock, walls'}
        </button>
      </div>
      {room && <SealRoom onClose={() => setRoom(false)} />}
    </div>
  );
}
