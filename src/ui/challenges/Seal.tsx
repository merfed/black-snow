// The Seal: the panel inside the Vacuum Lock's box. The hatch wheel and its twitch meter inline; seals,
// the airlock and the frost garden in a room.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import {
  airlockSpeed, buyCold, buyEar, buyPump, buySeedUp, burstFor, coldCost, comboDone, comboLength, crystalRate, cycleLen, DIAL,
  digitOf, earCost, earReach, feel, frostIntake, gardenLit, gardenSymmetry, genTime, GH, GW, harvest, HARVEST_MIN, litCount,
  pressSeal, pumpCost, repressSeal, REPRESS_COST, restDial, RIME_PER_FROST, SEAL_N, SEAL_ZONE, sealMult, sealPower, sealsPending,
  sealSyms, sealTarget, seedMax, seedsUsed, seedUpCost, setStance, STANCES, symMult, SYMS, tendCell, thaw, tierAshMult, tierCost,
  tierZoneMult, turnWheel, voidRate, wantDir, type SealState,
} from '../../game/challenges/seal';
import type { MultTarget } from '../../game/challenges/types';
import { ZONES } from '../../game/data';
import { fmt } from '../../game/format';
import type { GameState } from '../../game/state';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom } from './ChallengeSlot';
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
function Wheel({ rot, twitch, catching, onTurn, onRest }: {
  rot: number; twitch: number; catching: boolean; onTurn: (rot: number) => void; onRest: () => void;
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
  const up = () => { if (drag.current) { drag.current = null; onRest(); } };

  return (
    <div className="seal-wheel">
      <div className="seal-frame knots">
        <canvas ref={dial} width={DS} height={DS} className="seal-dial" data-nodrag onPointerDown={down} onPointerMove={move}
          onPointerUp={up} onPointerCancel={up} aria-label="The hatch wheel. Drag to turn." />
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
const soloMult = (bits: string) => {
  const p = sealPower(bits), t = sealTarget(digitOf(bits));
  return p ? 1 + (t === 'ash' ? 0.6 : 0.5) * Math.pow(p, 0.8) : 1;
};

function SealsSection({ game, run }: { game: GameState; run: (fn: (s: GameState) => unknown) => void }) {
  const c = game.challenges.seal;
  const [bits, setBits] = useState(blank);
  const [sel, setSel] = useState<number | null>(null);
  const pending = sealsPending(game);
  const d = digitOf(bits), lit = litCount(bits);
  const sy = sealSyms(bits);
  const flip = (i: number) => setBits(b => b.slice(0, i) + (b[i] === '1' ? '0' : '1') + b.slice(i + 1));
  const targets = [...new Set(c.seals.map(x => sealTarget(digitOf(x.bits))))];
  return (
    <section className="seal-col">
      <h3 className="sub-head">Seals <small>{c.seals.length} pressed{pending ? ` · ${pending} waiting` : ''}</small></h3>
      <div className="seal-editor" data-nodrag>
        {Array.from(bits, (b, i) => (
          <button key={i} className={`seal-px ${b === '1' ? 'on' : ''}`} onClick={() => flip(i)} aria-label={`pixel ${i % SEAL_N + 1}, ${Math.floor(i / SEAL_N) + 1}`} />
        ))}
      </div>
      <div className="seal-read">
        <span className="ch-stat">Lit <b>{lit}</b> · digit <b>{d || '–'}</b></span>
        <span className="seal-syms">
          {SYMS.map(x => <i key={x.id} className={lit && sy[x.id] === 1 ? 'on' : lit && sy[x.id] > 0.6 ? 'half' : ''}>{x.name}</i>)}
        </span>
        <span className="ch-stat">{lit ? <>Would give <b>{pct(soloMult(bits))}</b> {TARGET_NAME(sealTarget(d))}</> : <span className="dim">Light some wax.</span>}</span>
      </div>
      <div className="ch-row">
        {sel === null
          ? <button className="max-all seal-press" disabled={!pending || !lit} onClick={() => run(s => { if (pressSeal(s, bits)) setBits(blank()); })}>
            {pending ? 'Press the seal' : 'Open a tier to press'}
          </button>
          : <button className="max-all seal-press" disabled={!lit || c.rime < REPRESS_COST} onClick={() => run(s => { if (repressSeal(s, sel, bits)) setSel(null); })}>
            Melt and re-press <span className="cost">{REPRESS_COST} rime</span>
          </button>}
        <button className="secondary" onClick={() => { setBits(blank()); setSel(null); }}>Clear</button>
      </div>
      {c.seals.length > 0 && <>
        <div className="seal-stamps" data-scroll>
          {c.seals.map((x, i) => (
            <button key={i} className={`seal-stamp-btn ${sel === i ? 'sel' : ''}`} title={`${pct(soloMult(x.bits))} ${TARGET_NAME(sealTarget(digitOf(x.bits)))}. Click to melt and redraw.`}
              onClick={() => { if (sel === i) { setSel(null); setBits(blank()); } else { setSel(i); setBits(x.bits); } }}>
              <Stamp bits={x.bits} />
            </button>
          ))}
        </div>
        <ul className="seal-totals">
          {targets.map(t => <li key={t}><span>{TARGET_NAME(t)}</span><b>x{sealMult(c, t).toFixed(2)}</b></li>)}
        </ul>
      </>}
      <p className="dim small-note">"Every door that opens wants its mark. The wax remembers which way it was folded."</p>
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
  return <div className="seal-frame knots"><canvas ref={ref} width={120} height={36} className="seal-airlock" /></div>;
}

function AirlockSection({ game, run }: { game: GameState; run: (fn: (s: GameState) => unknown) => void }) {
  const c = game.challenges.seal;
  const fi = frostIntake(c);
  return (
    <section className="seal-col">
      <h3 className="sub-head">The airlock <small>one cycle every {Math.round(cycleLen(c))}s</small></h3>
      <Airlock c={c} />
      <div className="seal-stances" role="radiogroup" aria-label="What to feed the airlock">
        {STANCES.map(x => (
          <button key={x.id} role="radio" aria-checked={c.stance === x.id} className={`secondary ${c.stance === x.id ? 'on' : ''}`} onClick={() => run(s => setStance(s, x.id))}>
            {x.name}<small>{x.note}</small>
          </button>
        ))}
      </div>
      <div className="seal-stats">
        <span className="ch-stat">Void ash <b>+{fmt(voidRate(c))}</b>/s</span>
        <span className="ch-stat">Rime <b>+{fmt(c.frost > 0 ? fi * RIME_PER_FROST : 0)}</b>/s{fi > 0 && c.frost <= 0 && <span className="dim"> · no frost to feed</span>}</span>
        <span className="ch-stat">Frost waiting <b>{fmt(c.frost)}</b></span>
      </div>
      <div className="seal-ups">
        <button disabled={c.rime < pumpCost(c)} onClick={() => run(buyPump)}>
          <span>Prime a pump <small>lv {c.pumps} · speed x{airlockSpeed(c).toFixed(2)}</small></span><span className="cost">{fmt(pumpCost(c))} rime</span>
        </button>
        <button disabled={c.voidAsh < earCost(c)} onClick={() => run(buyEar)}>
          <span>Stethoscope <small>lv {c.ear} · the twitch reaches {earReach(game).toFixed(1)} marks</small></span><span className="cost">{fmt(earCost(c))} void</span>
        </button>
      </div>
      <p className="dim small-note">"It breathes in. It breathes out. What went in is not what comes out."</p>
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
  return <div className="seal-frame knots"><canvas ref={ref} width={GW * CELL} height={GH * CELL} className="seal-garden" data-nodrag onClick={click} aria-label="The frost garden" /></div>;
}

function GardenSection({ game, run }: { game: GameState; run: (fn: (s: GameState) => unknown) => void }) {
  const c = game.challenges.seal;
  const lit = gardenLit(c.garden), sym = gardenSymmetry(c.garden);
  return (
    <section className="seal-col">
      <h3 className="sub-head">The walls <small>seeds {seedsUsed(c)}/{seedMax(c)} · grows every {Math.round(genTime(c))}s</small></h3>
      <Garden c={c} onCell={i => run(s => tendCell(s, i))} />
      <div className="seal-stats">
        <span className="ch-stat">Frosted <b>{lit}</b>/{GW * GH} · symmetry <b>{Math.round(sym * 100)}%</b> · x{symMult(c.garden).toFixed(2)}</span>
        <span className="ch-stat">Crystals <b>{fmt(c.crystals)}</b> · +{fmt(crystalRate(c))}/s · {c.harvests} harvests</span>
      </div>
      <div className="ch-row">
        <button className="max-all seal-harvest" disabled={c.crystals < HARVEST_MIN} onClick={() => run(harvest)}>
          Harvest <span className="cost">{c.crystals < HARVEST_MIN ? `at ${HARVEST_MIN}` : `${fmt(c.crystals)} frost`}</span>
        </button>
        <button className="secondary" onClick={() => run(thaw)} title="Melt the frost, keep the seeds">Thaw</button>
      </div>
      <div className="seal-ups">
        <button disabled={c.rime < seedUpCost(c)} onClick={() => run(buySeedUp)}>
          <span>Another seed <small>{seedMax(c)} → {seedMax(c) + 1}</small></span><span className="cost">{fmt(seedUpCost(c))} rime</span>
        </button>
        <button disabled={c.rime < coldCost(c)} onClick={() => run(buyCold)}>
          <span>Let the cold in <small>grows every {Math.round(genTime(c))}s → {Math.round(30 / (1 + 0.3 * (c.cold + 1)))}s</small></span><span className="cost">{fmt(coldCost(c))} rime</span>
        </button>
      </div>
      <p className="dim small-note">Click bare wall to seed, frost to prune. Frost creeps where exactly one neighbour is lit. "It is warmer than it looks."</p>
    </section>
  );
}

// ---------- panel ----------

function SealRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const c = game.challenges.seal;
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <ChallengeRoom zone={SEAL_ZONE} title="Below the hatch" note="the lock holds, and lets go" onClose={onClose} className="seal-room"
      stat={<><b>{fmt(c.voidAsh)}</b> void ash <small>{fmt(c.rime)} rime · {fmt(c.frost)} frost</small></>}>
      <div className="seal-cols">
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
  const catching = twitch >= 1;
  const cost = tierCost(c.tier);
  const pending = sealsPending(game);

  // rot climbs as the wheel turns clockwise ("right"); like a real safe, the number at the tooth falls
  const turn = (r: number) => { setDir(r > rot ? 1 : r < rot ? -1 : dir); setRot(r); };
  const rest = (n = top, d = dir) => run(s => { if (restDial(s, n, d)) setFlash(f => f + 1); });
  const nudge = (k: number) => { const r = rot + k; setRot(r); setDir(k); rest(mod(-Math.round(r), DIAL), k); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
  };
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), 700);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <div className="seal-panel" style={{ '--seal-red': '#ff2a2a' } as CSSProperties}>
      <div className="seal-top">
        <div tabIndex={0} onKeyDown={key} className="seal-wheel-wrap" aria-label="Hatch dial. Arrow keys turn it.">
          <Wheel rot={rot} twitch={twitch} catching={catching} onTurn={r => turn(r)} onRest={() => rest()} />
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
          <p className="seal-caption">{flash ? '"CLICK."' : done ? '"IT WILL TURN NOW."' : catching ? '"SOMETHING GIVES."' : twitch > 0.3 ? '"WARMER."' : '"FEEL FOR IT."'}</p>
        </div>
      </div>
      {done
        ? <button className="max-all seal-turn" disabled={c.voidAsh < cost} onClick={() => run(turnWheel)}>
          Turn the wheel <span className="cost">{fmt(cost)} void ash · pays {fmt(burstFor(game))} ash</span>
        </button>
        : <p className="dim small-note">Drag the wheel. Let it rest where the needle shivers hardest, turning the way the arrow says.</p>}
      <div className="ch-row">
        <button className={pending ? 'max-all seal-open' : 'secondary seal-open'} onClick={() => setRoom(true)}>
          {pending ? `Press a seal (${pending})` : 'Seals, airlock, walls'}
        </button>
      </div>
      {room && <SealRoom onClose={() => setRoom(false)} />}
    </div>
  );
}
