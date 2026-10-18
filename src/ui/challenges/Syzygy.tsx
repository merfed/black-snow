// The Syzygy: the panel inside the zone 9 box, and its room. A dithered Numogram you route currents on,
// the black sun over it, the pilgrim's dream map, the dream log and the gate.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CHALLENGES } from '../../game/challenges';
import {
  ashPay, buyLantern, buyLens, buyShade, buyWire, chapters, CHAPTERS, COLS, cut, darkLen, dreamMap, EDGES, edgeKey, edgeWeight, fragment,
  gateCost, GATE_CURRENTS, GATE_LEVEL, lanternCost, lensCost, liveCurrents, neighbours, offerings, openGate, PAGES_PER_CHAPTER, pilgrimSpeed,
  NIGHT, ROOMS, ROWS, routeEdge, shadeCost, totality, totalityLeft, totalityLen, totalityMult, toggle, untilTotality, wireCost, wiresFree,
  wiresTotal, ZONE, type SyzygyState,
} from '../../game/challenges/syzygy';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
import './syzygy.css';

type RGB = [number, number, number];
const HUE = ZONE_COLORS[ZONE];
const BONE = hex('#ece6d2');
const lerp = (a: string, b: string, k: number) => { const x = hex(a), y = hex(b); return x.map((v, i) => Math.round(v + (y[i] - v) * k)) as RGB; };
const RAMP: RGB[] = [hex('#070203'), lerp(HUE, '#070203', 0.72), hex(HUE), lerp(HUE, '#ffffff', 0.55)];

/** Node positions on the plate, in 0..1: warp on top, the time-circuit in two columns, plex at the bottom. */
const POS: [number, number][] = [
  [0.56, 0.9], [0.66, 0.3], [0.72, 0.5], [0.56, 0.1], [0.66, 0.7],
  [0.3, 0.7], [0.4, 0.1], [0.24, 0.5], [0.3, 0.3], [0.4, 0.9],
];
// A 3x5 pixel font for the digits.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

const hm = (sec: number) => {
  const m = Math.ceil(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/**
 * A low-fps dithered canvas that redraws from live state and stops while off screen.
 * `draw` fills a brightness buffer (v) and an accent buffer (acc); this turns them into hard pixels.
 */
function useDither(w: number, h: number, draw: (v: Float32Array, acc: Float32Array, t: number) => void, fps = 10) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const v = new Float32Array(w * h), acc = new Float32Array(w * h);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) {
        last = ms;
        v.fill(0); acc.fill(0);
        drawRef.current(v, acc, ms / 1000);
        const d = img.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, th = threshold(x, y);
          let col: RGB;
          if (acc[i] > th) col = BONE;
          else {
            const q = Math.max(0, Math.min(1, v[i])) * 3, lo = Math.floor(q);
            col = RAMP[Math.min(3, lo + (q - lo > th ? 1 : 0))];
          }
          d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
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
  return ref;
}

/** Stamp a digit at x, y (top left) into a buffer, at value val. */
function digit(buf: Float32Array, w: number, h: number, n: number, x0: number, y0: number, val: number) {
  const g = DIGITS[n];
  for (let k = 0; k < 15; k++) if (g[k] === '1') {
    const x = x0 + (k % 3), y = y0 + Math.floor(k / 3);
    if (x >= 0 && y >= 0 && x < w && y < h) buf[y * w + x] = val;
  }
}

/** Light everything within r of the segment a..b, brightest on the line; returns nothing. */
function glowLine(v: Float32Array, w: number, h: number, ax: number, ay: number, bx: number, by: number, r: number, k: number, pulse?: { at: number; buf: Float32Array }) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - ax - u * dx, y - ay - u * dy);
    if (d > r) continue;
    const i = y * w + x;
    v[i] += (1 - d / r) * k;
    if (pulse) {
      const p = Math.abs(u - pulse.at);
      if (p < 0.08) pulse.buf[i] = Math.max(pulse.buf[i], (1 - p / 0.08) * (1 - d / r) * 1.2);
    }
  }
}

/** The black sun: a disc that a dark moon slides over before totality, a bone corona during it. */
function drawSun(v: Float32Array, acc: Float32Array, w: number, h: number, z: SyzygyState, cx: number, cy: number, R: number, t: number) {
  const dark = darkLen(z);
  const cover = totality(z) ? 1 : Math.max(0, Math.min(1, (z.sun - (dark - 2400)) / 2400));
  const mx = cx + R * 2.3 * (1 - cover), my = cy - R * 0.4 * (1 - cover);
  const full = totality(z);
  const x0 = Math.max(0, Math.floor(cx - R * 2)), x1 = Math.min(w - 1, Math.ceil(cx + R * 2));
  const y0 = Math.max(0, Math.floor(cy - R * 2)), y1 = Math.min(h - 1, Math.ceil(cy + R * 2));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x;
    const r = Math.hypot(x - cx, y - cy);
    const inMoon = Math.hypot(x - mx, y - my) < R * 1.02;
    if (full) {
      if (r < R) { v[i] = 0; acc[i] = 0; continue; }
      const a = Math.atan2(y - cy, x - cx);
      const flare = 0.75 + 0.25 * Math.sin(a * 7 + t * 0.7) * Math.sin(a * 3 - t * 0.4);
      const c = Math.max(0, 1 - (r - R) / (R * 0.9 * flare));
      acc[i] = Math.max(acc[i], c * 0.9);
      v[i] = Math.max(v[i], c * 0.6);
    } else if (r < R) {
      v[i] = inMoon ? 0.02 : 0.95 - 0.25 * (r / R);
    } else if (r < R * 1.35 && !inMoon) {
      v[i] = Math.max(v[i], (1 - (r - R) / (R * 0.35)) * 0.45);
    }
  }
}

/** Which node sits under a pointer, with a generous reach (at least 18 screen px) so small plates stay easy to hit. */
function nodeAt(el: HTMLCanvasElement, cx: number, cy: number) {
  const b = el.getBoundingClientRect();
  const reach = Math.max(18, b.height * 0.12);
  let best = -1, bd = reach;
  POS.forEach(([nx, ny], n) => {
    const d = Math.hypot(b.left + nx * b.width - cx, b.top + ny * b.height - cy);
    if (d < bd) { bd = d; best = n; }
  });
  return best;
}

/** The Numogram plate: nodes lit by strength, wired currents glowing with pulses running along them. */
function Numogram({ w, h, selected, onPick, onMiss, sun = true }: {
  w: number; h: number; selected?: number | null; onPick?: (n: number) => void; onMiss?: () => void; sun?: boolean;
}) {
  const game = useGame(st => st.game);
  const sel = useRef(selected);
  sel.current = selected;
  const hover = useRef(-1);
  const [over, setOver] = useState(false);
  const ref = useDither(w, h, (v, acc, t) => {
    const z = game.challenges.syzygy;
    const open = z.gateOpen;
    const px = (n: number) => POS[n][0] * w, py = (n: number) => POS[n][1] * h;
    const s0 = sel.current ?? null;
    const near = s0 === null ? [] : neighbours(s0);
    const blink = Math.floor(t * 4) % 2 === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      v[i] = 0.1 + 0.08 * (y / h) + 0.04 * Math.sin(x * 0.11 + t * 0.3) * Math.sin(y * 0.17 - t * 0.2);
      // Once the gate is open the plate burns up from the bottom, where zero is.
      if (open) v[i] += 0.22 * Math.pow(y / h, 3) * (0.8 + 0.2 * Math.sin(t * 0.5 + x * 0.05));
    }
    for (const e of EDGES) {
      const wired = z.links[edgeKey(e)] ?? 0;
      const k = edgeWeight(z, e);
      const cand = s0 !== null && (e.a === s0 || e.b === s0);
      if (!wired) {
        // Unwired routes are a faint dotted trace; from the chosen node they march, in bone.
        const n = Math.ceil(Math.hypot(px(e.b) - px(e.a), py(e.b) - py(e.a)));
        const shift = cand ? Math.floor(t * 8) % 3 : 0;
        for (let s = shift; s <= n; s += 3) {
          const x = Math.round(px(e.a) + (px(e.b) - px(e.a)) * s / n), y = Math.round(py(e.a) + (py(e.b) - py(e.a)) * s / n);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (cand) acc[y * w + x] = 0.85;
          else v[y * w + x] = Math.max(v[y * w + x], e.kind === 'syzygy' ? 0.42 : 0.3);
        }
        continue;
      }
      const at = ((t * 0.35 + e.a * 0.13 + e.b * 0.07) % 1 + 1) % 1;
      glowLine(v, w, h, px(e.a), py(e.a), px(e.b), py(e.b), 1.6 + Math.min(2.5, Math.sqrt(wired)), (k > 0 ? 0.6 + Math.min(0.4, k * 0.05) : 0.3) + (cand ? 0.2 : 0), k > 0 ? { at, buf: acc } : undefined);
    }
    for (let n = 0; n < 10; n++) {
      const str = z.nodes[n] ?? 0;
      const cx = px(n), cy = py(n), r = Math.max(4, h * 0.055) + Math.min(3, str * 0.35);
      const sealed = n === 0 && !z.gateOpen;
      const isSel = s0 === n, isCand = near.includes(n), isHover = hover.current === n;
      const out = isSel || isCand ? 3.2 : 2;
      for (let y = Math.floor(cy - r - out - 1); y <= cy + r + out + 1; y++) for (let x = Math.floor(cx - r - out - 1); x <= cx + r + out + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = Math.hypot(x - cx, y - cy), i = y * w + x;
        if (d < r) v[i] = sealed ? 0.04 : 0.32 + Math.min(0.65, str * 0.09);
        else if (d < r + 1.2) {
          v[i] = sealed ? 0.6 : 0.9;
          if (isSel ? blink : isHover) acc[i] = 1;
        } else if (d >= r + 2 && d < r + 3.2) {
          // A second ring: solid and blinking on the chosen node, broken and turning on the nodes it can reach.
          if (isSel && blink) acc[i] = 1;
          else if (isCand && Math.floor((Math.atan2(y - cy, x - cx) / Math.PI + 1) * 6 + t * 2) % 2 === 0) acc[i] = 0.9;
        }
      }
      digit(v, w, h, n, Math.round(cx - 1), Math.round(cy - 2), sealed ? 0.7 : str > 4 ? 0 : 1);
    }
    if (sun) drawSun(v, acc, w, h, z, w * 0.89, h * 0.2, h * 0.12, t);
  }, 10);
  const click = (ev: MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) { onMiss?.(); return; }
    const n = nodeAt(ev.currentTarget, ev.clientX, ev.clientY);
    if (n >= 0) onPick(n); else onMiss?.();
  };
  const move = (ev: MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    hover.current = nodeAt(ev.currentTarget, ev.clientX, ev.clientY);
    setOver(hover.current >= 0);
  };
  const leave = () => { hover.current = -1; setOver(false); };
  return <canvas ref={ref} width={w} height={h} className={`syzygy-canvas ${onPick ? 'pick' : ''} ${over ? 'over' : ''}`}
    onClick={click} onMouseMove={move} onMouseLeave={leave} data-nodrag />;
}

/** Touch a node, then a node it can reach: lays a wire, or takes one back if that route is wired. The first node stays chosen. */
function usePicker() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const [sel, setSel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const pick = (n: number) => {
    if (sel === null || sel === n) { setSel(sel === n ? null : n); setNote(''); return; }
    if (!neighbours(sel).includes(n)) { setSel(n); setNote(''); return; }
    const z = game.challenges.syzygy;
    const a = sel;
    const wired = EDGES.some(e => ((e.a === a && e.b === n) || (e.a === n && e.b === a)) && z.links[edgeKey(e)]);
    if (!wired && wiresFree(z) <= 0) { setNote('No wire free. Take one back, or twist another from dreams.'); return; }
    run(s => toggle(s, a, n));
    setNote(wired ? `Wire taken back from ${a}·${n}.` : `Wire laid ${a}·${n}. Touch ${n} again to take it back.`);
  };
  return { sel, pick, note, clear: () => { setSel(null); setNote(''); } };
}

const CELL = 9;
/** Tonight's map: walked rooms lit, the pilgrim blinking where they are, the page in bone until found. */
function DreamMap() {
  const game = useGame(st => st.game);
  const w = COLS * CELL + 1, h = ROWS * CELL + 1;
  const ref = useDither(w, h, (v, acc, t) => {
    const z = game.challenges.syzygy;
    const map = dreamMap(z.seed, z.night);
    const walked = Math.floor(z.explored);
    const idx = new Array(ROOMS).fill(0);
    map.order.forEach((c, k) => { idx[c] = k; });
    const door = new Set(map.doors.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    const open = (a: number, b: number) => door.has(`${Math.min(a, b)}-${Math.max(a, b)}`);
    const here = map.order[walked < ROOMS ? walked : Math.floor(t * 0.7) % ROOMS];
    const blink = Math.floor(t * 3) % 2 === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const cx = Math.min(COLS - 1, Math.floor(x / CELL)), cy = Math.min(ROWS - 1, Math.floor(y / CELL));
      const lx = x - cx * CELL, ly = y - cy * CELL, c = cy * COLS + cx, k = idx[c];
      const lit = k < walked;
      let val = lit ? 0.5 + 0.06 * Math.sin(t + c) : 0.13;
      // Walls on the cell edges, broken where a door is.
      const mid = lx >= 3 && lx <= 5 || ly >= 3 && ly <= 5;
      if (lx === 0 && !(cx > 0 && mid && ly >= 3 && ly <= 5 && open(c, c - 1))) val = 0;
      if (ly === 0 && !(cy > 0 && mid && lx >= 3 && lx <= 5 && open(c, c - COLS))) val = 0;
      if (x === w - 1 || y === h - 1) val = 0;
      v[i] = val;
      const centre = lx >= 3 && lx <= 5 && ly >= 3 && ly <= 5;
      if (centre) {
        const kind = map.kinds[k];
        if (kind === 'page' && (!lit || z.pageNight < z.night)) acc[i] = 0.9;
        else if (kind === 'relic' && lit && lx === 4 && ly === 4) v[i] = 1;
        else if (kind === 'chamber' && lit && lx === 4 && ly === 4) v[i] = 0.9;
        if (c === here && blink) { acc[i] = 1; }
      }
    }
  }, 6);
  return <canvas ref={ref} width={w} height={h} className="syzygy-canvas syzygy-map" />;
}

function SunCanvas() {
  const game = useGame(st => st.game);
  const ref = useDither(64, 40, (v, acc, t) => {
    for (let i = 0; i < v.length; i++) v[i] = 0.08;
    drawSun(v, acc, 64, 40, game.challenges.syzygy, 32, 20, 10, t);
  }, 8);
  return <canvas ref={ref} width={64} height={40} className="syzygy-canvas syzygy-sun" />;
}

function eclipseText(z: SyzygyState) {
  return totality(z) ? `Totality, ${hm(totalityLeft(z))} left` : `Totality in ${hm(untilTotality(z))}`;
}

export function SyzygyPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  const pk = usePicker();
  const z = game.challenges.syzygy;
  const offs = offerings(game);
  const given = offs.filter(o => o.ok).length;
  const live = liveCurrents(z);
  const hint = z.gateOpen ? 'Nine touches zero. The dream goes on without you.'
    : live === 0 ? 'Lay your first wire along a syzygy.'
    : live < GATE_CURRENTS ? `The gate wants ${GATE_CURRENTS} live currents.`
    : given < offs.length ? 'The gate waits for an offering from every zone.'
    : 'The gate is ready.';
  return (
    <div className={`syzygy ${z.gateOpen ? 'syzygy-opened' : ''}`}>
      <div className={`syzygy-thumb ${pk.sel !== null ? 'picking' : ''}`} title="Touch two nodes to wire them. Touch the dark to open the Syzygy.">
        <Numogram w={150} h={84} selected={pk.sel} onPick={pk.pick} onMiss={() => (pk.sel !== null ? pk.clear() : setOpen(true))} />
      </div>
      <div className="ch-row syzygy-stats">
        <span className="ch-stat"><b>{fmt(z.dreams)}</b> dreams</span>
        <span className="ch-stat"><b>{live}</b>/{wiresTotal(z)} currents</span>
        <span className={`ch-stat ${totality(z) ? 'syzygy-hot' : ''}`}>{eclipseText(z)}</span>
        <span className="ch-stat">Gate {z.gateOpen ? <b>open</b> : <><b>{given}</b>/{offs.length}</>}</span>
      </div>
      <p className={`small-note syzygy-hint ${pk.sel !== null || pk.note ? 'syzygy-picking' : 'dim'}`}>
        {pk.note || (pk.sel !== null ? `${pk.sel} chosen. Touch a ringed node to wire it.` : hint)}
      </p>
      <button className="max-all syzygy-btn syzygy-open" onClick={() => setOpen(true)}>Open the Syzygy</button>
      {open && <SyzygyRoom onClose={() => { setOpen(false); pk.clear(); }} />}
    </div>
  );
}

const KIND_HEAD: Record<string, string> = { syzygy: 'Syzygies', current: 'Currents', gate: 'Gates' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** One route on the wire board: its pair and name, lit by state, with + and − keys. */
function EdgeTile({ k, sel }: { k: string; sel: number | null }) {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const z = game.challenges.syzygy;
  const e = EDGES.find(x => edgeKey(x) === k)!;
  const t = z.links[k] ?? 0, wgt = edgeWeight(z, e);
  const cand = sel !== null && (e.a === sel || e.b === sel);
  const tip = `${e.name}, ${e.kind} ${e.a}·${e.b}. ${t ? (wgt > 0 ? `Live: x${(1 + 0.35 * wgt).toFixed(2)} ash` : 'Wired, but one end is dark') : 'Not wired'}${t > 1 ? `, braided ${t}` : ''}.`;
  return (
    <div className={`sz-edge${t ? ' on' : ''}${wgt > 0 ? ' live' : ''}${cand ? ' cand' : ''}`} title={tip}>
      <span className="sz-edge-pair">{e.a}·{e.b}</span>
      <span className="sz-edge-name">{e.name}{t > 1 ? <b> ×{t}</b> : ''}</span>
      <button className="syzygy-pm add" disabled={wiresFree(z) <= 0} onClick={() => run(s => routeEdge(s, k))} title="Lay a wire here (another braids it)" aria-label={`Lay a wire on ${e.name} ${e.a}·${e.b}`}>+</button>
      <button className="syzygy-pm cut" disabled={!t} onClick={() => run(s => cut(s, k))} title="Take a wire back" aria-label={`Take a wire back from ${e.name} ${e.a}·${e.b}`}>−</button>
    </div>
  );
}

/** The black sun on a dial: the ring fills toward totality, then drains while it lasts. */
function SunDial({ z }: { z: SyzygyState }) {
  const tot = totality(z);
  const k = tot ? totalityLeft(z) / totalityLen(z) : 1 - untilTotality(z) / darkLen(z);
  const R = 46, C = 2 * Math.PI * R;
  return (
    <div className={`sz-dial${tot ? ' tot' : ''}`}>
      <SunCanvas />
      <svg viewBox="0 0 110 110" aria-hidden>
        <circle cx="55" cy="55" r={R} className="sz-dial-track" />
        <circle cx="55" cy="55" r={R} className="sz-dial-arc" strokeDasharray={`${C * Math.max(0, Math.min(1, k))} ${C}`} transform="rotate(-90 55 55)" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2, r1 = R + 5, r2 = R + (i % 6 === 0 ? 10 : 7);
          return <line key={i} x1={55 + Math.sin(a) * r1} y1={55 - Math.cos(a) * r1} x2={55 + Math.sin(a) * r2} y2={55 - Math.cos(a) * r2} className="sz-dial-tick" />;
        })}
      </svg>
    </div>
  );
}

/** The gate: an arch with a sigil for every zone's offering, three lamps for the currents, the door in the middle. */
function GateArch({ z, offs, live }: { z: SyzygyState; offs: ReturnType<typeof offerings>; live: number }) {
  const n = offs.length;
  return (
    <svg className={`sz-arch${z.gateOpen ? ' open' : ''}`} viewBox="0 0 300 190" role="img" aria-label="The gate">
      <defs>
        <pattern id="sz-dith" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" className="sz-dith-ink" /><rect x="1" y="1" width="1" height="1" className="sz-dith-ink" /></pattern>
        <pattern id="sz-dith-sparse" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1" height="1" className="sz-dith-ink" /></pattern>
      </defs>
      {/* the arch: two pillars and a round head, double ruled */}
      <path d="M60 182 V96 A90 90 0 0 1 240 96 V182" className="sz-arch-outer" />
      <path d="M78 182 V98 A72 72 0 0 1 222 98 V182" className="sz-arch-inner" />
      <path d="M102 182 V112 A48 48 0 0 1 198 112 V182 Z" className="sz-door" fill={z.gateOpen ? 'url(#sz-dith)' : 'url(#sz-dith-sparse)'} />
      {z.gateOpen && <path d="M102 182 V112 A48 48 0 0 1 198 112 V182 Z" className="sz-door-glow" />}
      <text x="150" y="160" className="sz-door-num">{z.gateOpen ? '0' : '9'}</text>
      <line x1="40" y1="183" x2="260" y2="183" className="sz-arch-sill" />
      {offs.map((o, i) => {
        const a = Math.PI * (1 - (i + 0.5) / n), cx = 150 + Math.cos(a) * 81, cy = 98 - Math.sin(a) * 81;
        return (
          <g key={o.zone} className={`sz-sigil${o.ok ? ' ok' : ''}`} style={{ color: ZONE_COLORS[o.zone] }}>
            <title>{`${o.name}: ${o.ok ? 'given' : o.done ? `level ${Math.floor(o.level)}/${GATE_LEVEL}` : 'not yet'}`}</title>
            <rect x={cx - 9} y={cy - 9} width="18" height="18" transform={`rotate(45 ${cx} ${cy})`} />
            <text x={cx} y={cy + 4}>{o.zone + 1}</text>
          </g>
        );
      })}
      {Array.from({ length: GATE_CURRENTS }, (_, i) => (
        <circle key={i} cx={130 + i * 20} cy="172" r="4.5" className={`sz-lamp${i < live ? ' lit' : ''}`}><title>{`Live currents ${Math.min(live, GATE_CURRENTS)}/${GATE_CURRENTS}`}</title></circle>
      ))}
    </svg>
  );
}

function SyzygyRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const { sel, pick, note } = usePicker();
  const [page, setPage] = useState(-1); // -1 follows the newest page
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const z = game.challenges.syzygy;
  const nodeName = (n: number) => n === 0 ? 'The gate' : n === 9 ? 'The Syzygy' : CHALLENGES.find(c => c.zone === n - 1)?.name ?? `Zone ${n}`;
  const offs = offerings(game);
  const gc = gateCost(game);
  const ready = offs.every(o => o.ok) && liveCurrents(z) >= GATE_CURRENTS;
  const ch = chapters(z);
  const lc = lanternCost(game), lens = lensCost(game);
  const live = liveCurrents(z), given = offs.filter(o => o.ok).length;
  const ashX = ashPay(EDGES.reduce((n, e) => n + edgeWeight(z, e), 0));
  const pg = z.pages === 0 ? -1 : page < 0 || page >= z.pages ? z.pages - 1 : page;
  const status = (
    <RoomStatus
      stats={[
        { label: 'Dreams', value: fmt(z.dreams), rate: `${Math.min(ROOMS, Math.floor(z.explored))}/${ROOMS} rooms tonight` },
        { label: 'Currents', value: live, rate: `${wiresFree(z)}/${wiresTotal(z)} wires free`, title: 'Live currents: wired routes with power at both ends' },
        { label: 'All ash', value: `x${ashX.toFixed(2)}`, rate: 'from the currents' },
        totality(z)
          ? { label: 'Totality', value: `x${totalityMult(z).toFixed(2)}`, rate: `${hm(totalityLeft(z))} left`, title: 'Every zone is multiplied while the sun is out' }
          : { label: 'Black sun', value: hm(untilTotality(z)), rate: 'to totality', title: `Totality: every zone x${totalityMult(z).toFixed(2)}` },
        z.gateOpen
          ? { label: 'Gate', value: 'open', rate: 'nine touches zero' }
          : { label: 'Gate', value: `${given}/${offs.length}`, rate: `${Math.min(live, GATE_CURRENTS)}/${GATE_CURRENTS} currents`, title: 'Offerings given, and live currents the gate wants' },
      ]}
      buy={{ label: 'A lantern', cost: lc, onClick: () => run(buyLantern), title: 'Hurries the pilgrim through the dream' }}
    />
  );

  return (
    <ChallengeRoom zone={ZONE} title="The Syzygy" note="the bottom, where the iron is dreaming" onClose={onClose}
      className={`syzygy-room ${z.gateOpen ? 'syzygy-opened' : ''}`} status={status}>
      <div className="sz-grid">
        {/* ---- the plate and its wire board ---- */}
        <section className="sz-col sz-plate-col" aria-label="The Numogram">
          <div className="sz-head"><span className="sz-cap">"THE NUMOGRAM"</span><span className="sz-head-note">{wiresFree(z)} of {wiresTotal(z)} wires free</span></div>
          <div className="artwork-frame knots syzygy-frame sz-plate"><Numogram w={240} h={150} selected={sel} onPick={pick} /></div>
          <div className="sz-pick-row">
            <p className={`sz-pick ${sel === null && !note ? '' : 'on'}`}>{note || (sel === null ? 'Touch a node, then a ringed one, to lay a wire.' : `${sel}: ${nodeName(sel)}. Touch a ringed node.`)}</p>
            <button className="syzygy-btn" onClick={() => run(buyWire)} disabled={z.dreams < wireCost(z)} title="Twist another wire from dreams">A wire <span className="syzygy-cost">{fmt(wireCost(z))} dreams</span></button>
          </div>
          <div className="sz-board">
            {(['syzygy', 'current', 'gate'] as const).map(kind => (
              <div key={kind} className="sz-board-col">
                <span className="sz-board-head">{KIND_HEAD[kind]}</span>
                {EDGES.filter(e => e.kind === kind).map(e => <EdgeTile key={edgeKey(e)} k={edgeKey(e)} sel={sel} />)}
              </div>
            ))}
          </div>
        </section>

        {/* ---- the dream and the black sun ---- */}
        <section className="sz-col" aria-label="The dream">
          <div className="sz-head"><span className="sz-cap">"THE DREAM"</span><span className="sz-head-note">night {z.night + 1} · new map in {hm((z.night + 1) * NIGHT - z.clock)}</span></div>
          <div className="artwork-frame knots syzygy-frame sz-map"><DreamMap /></div>
          <div className="sz-readouts">
            <span><b>{Math.min(ROOMS, Math.floor(z.explored))}<i>/{ROOMS}</i></b><small>rooms walked</small></span>
            <span><b>{(pilgrimSpeed(z) * 60).toFixed(2)}</b><small>rooms a minute</small></span>
            <span><b>{z.finds}</b><small>finds kept</small></span>
          </div>
          <p className="syzygy-quote sz-quote">“The pilgrim goes down by themselves. What they bring back stays.”</p>

          <div className="sz-head"><span className="sz-cap">"THE BLACK SUN"</span><span className={`sz-head-note${totality(z) ? ' syzygy-hot' : ''}`}>{eclipseText(z)}</span></div>
          <div className="sz-sun">
            <SunDial z={z} />
            <div className="sz-sun-side">
              <p className="sz-sun-line">Totality: every zone <b>x{totalityMult(z).toFixed(2)}</b> for {hm(totalityLen(z))}, dreams x2.</p>
              <button className="syzygy-btn" onClick={() => run(buyShade)} disabled={z.dreams < shadeCost(z)} title="Shades hold totality longer">A shade <span className="syzygy-cost">{fmt(shadeCost(z))} dreams</span></button>
              <button className="syzygy-btn" onClick={() => run(buyLens)} disabled={game.ash.lt(lens)} title="Lenses bring the next totality sooner">A lens <span className="syzygy-cost">{fmt(lens)} ash</span></button>
            </div>
          </div>
        </section>

        {/* ---- the gate and the dream log ---- */}
        <section className="sz-col" aria-label="The gate">
          <div className="sz-head"><span className="sz-cap">"THE GATE"</span><span className="sz-head-note">{z.gateOpen ? 'open' : `${given} of ${offs.length} offerings`}</span></div>
          <GateArch z={z} offs={offs} live={live} />
          {z.gateOpen ? <p className="syzygy-quote sz-quote">“Open. Nine touches zero.”</p>
            : <button className="max-all syzygy-btn syzygy-gate" disabled={!ready || z.dreams < gc.dreams || game.ash.lt(gc.ash)} onClick={() => run(openGate)}
              title={ready ? 'Every offering is given and the currents are live' : 'The gate wants an offering from every zone and three live currents'}>
              Open the gate <span className="syzygy-cost">{fmt(gc.dreams)} dreams + {fmt(gc.ash)} ash</span>
            </button>}

          <div className="sz-head"><span className="sz-cap">"THE DREAM LOG"</span><span className="sz-head-note">{z.pages} {z.pages === 1 ? 'page' : 'pages'}</span></div>
          <div className="sz-chapters">
            {CHAPTERS.map((c, i) => {
              const have = Math.max(0, Math.min(PAGES_PER_CHAPTER, z.pages - i * PAGES_PER_CHAPTER));
              return (
                <div key={i} className={`sz-chapter${i < ch ? ' done' : i === ch ? ' now' : ''}`}
                  title={i <= ch ? `${c.title}${i < ch ? `: ${c.perk}` : `. ${PAGES_PER_CHAPTER - have} more pages.`}` : 'Not yet'}>
                  <b>{ROMAN[i]}</b>
                  <span className="syzygy-pips">{Array.from({ length: PAGES_PER_CHAPTER }, (_, k) => <i key={k} className={k < have ? 'on' : ''} />)}</span>
                </div>
              );
            })}
          </div>
          <p className="sz-perk">{ch >= CHAPTERS.length ? 'The pages go on. Each chapter past the sixth: dreams +10%.'
            : ch > 0 ? <>Last opened: <b>{CHAPTERS[ch - 1].title}</b>. {CHAPTERS[ch - 1].perk}</>
            : <>Next: <b>{CHAPTERS[0].title}</b>, {PAGES_PER_CHAPTER - z.pages} more pages.</>}</p>
          <div className="sz-page">
            {pg < 0 ? <p className="sz-page-text dim">One page a night, if the pilgrim gets far enough.</p> : <>
              <span className="sz-page-no">page {pg + 1}</span>
              <p className="sz-page-text">{fragment(z.seed, pg)}</p>
              <div className="sz-page-turn">
                <button className="syzygy-pm" disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="Earlier page">‹</button>
                <button className="syzygy-pm" disabled={pg >= z.pages - 1} onClick={() => setPage(pg + 1 >= z.pages - 1 ? -1 : pg + 1)} aria-label="Later page">›</button>
              </div>
            </>}
          </div>
        </section>
      </div>
    </ChallengeRoom>
  );
}
