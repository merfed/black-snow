// The Syzygy: the panel inside the zone 9 box, and its room. A dithered Numogram you route currents on,
// the black sun over it, the pilgrim's dream map, the dream log and the gate.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CHALLENGES } from '../../game/challenges';
import {
  buyLantern, buyLens, buyShade, buyWire, chapters, CHAPTERS, COLS, cut, darkLen, dreamMap, EDGES, edgeKey, edgeWeight, fragment,
  gateCost, GATE_CURRENTS, GATE_LEVEL, lanternCost, lensCost, liveCurrents, offerings, openGate, PAGES_PER_CHAPTER, pilgrimSpeed,
  NIGHT, ROOMS, ROWS, route, routeEdge, shadeCost, totality, totalityLeft, totalityLen, totalityMult, untilTotality, wireCost, wiresFree,
  wiresTotal, ZONE, type SyzygyState,
} from '../../game/challenges/syzygy';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom } from './ChallengeSlot';
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

/** The Numogram plate: nodes lit by strength, wired currents glowing with pulses running along them. */
function Numogram({ w, h, selected, onPick, sun = true }: { w: number; h: number; selected?: number | null; onPick?: (n: number) => void; sun?: boolean }) {
  const game = useGame(st => st.game);
  const sel = useRef(selected);
  sel.current = selected;
  const ref = useDither(w, h, (v, acc, t) => {
    const z = game.challenges.syzygy;
    const open = z.gateOpen;
    const px = (n: number) => POS[n][0] * w, py = (n: number) => POS[n][1] * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      v[i] = 0.1 + 0.08 * (y / h) + 0.04 * Math.sin(x * 0.11 + t * 0.3) * Math.sin(y * 0.17 - t * 0.2);
      // Once the gate is open the plate burns up from the bottom, where zero is.
      if (open) v[i] += 0.22 * Math.pow(y / h, 3) * (0.8 + 0.2 * Math.sin(t * 0.5 + x * 0.05));
    }
    for (const e of EDGES) {
      const wired = z.links[edgeKey(e)] ?? 0;
      const k = edgeWeight(z, e);
      if (!wired) {
        // Unwired routes are a faint dotted trace.
        const n = Math.ceil(Math.hypot(px(e.b) - px(e.a), py(e.b) - py(e.a)));
        for (let s = 0; s <= n; s += 3) {
          const x = Math.round(px(e.a) + (px(e.b) - px(e.a)) * s / n), y = Math.round(py(e.a) + (py(e.b) - py(e.a)) * s / n);
          if (x >= 0 && y >= 0 && x < w && y < h) v[y * w + x] = Math.max(v[y * w + x], e.kind === 'syzygy' ? 0.42 : 0.3);
        }
        continue;
      }
      const at = ((t * 0.35 + e.a * 0.13 + e.b * 0.07) % 1 + 1) % 1;
      glowLine(v, w, h, px(e.a), py(e.a), px(e.b), py(e.b), 1.6 + Math.min(2.5, Math.sqrt(wired)), k > 0 ? 0.6 + Math.min(0.4, k * 0.05) : 0.3, k > 0 ? { at, buf: acc } : undefined);
    }
    for (let n = 0; n < 10; n++) {
      const str = z.nodes[n] ?? 0;
      const cx = px(n), cy = py(n), r = Math.max(4, h * 0.055) + Math.min(3, str * 0.35);
      const sealed = n === 0 && !z.gateOpen;
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = Math.hypot(x - cx, y - cy), i = y * w + x;
        if (d < r) v[i] = sealed ? 0.04 : 0.32 + Math.min(0.65, str * 0.09);
        else if (d < r + 1.2) { v[i] = sealed ? 0.6 : 0.9; if (sel.current === n) acc[i] = 1; }
      }
      digit(v, w, h, n, Math.round(cx - 1), Math.round(cy - 2), sealed ? 0.7 : str > 4 ? 0 : 1);
    }
    if (sun) drawSun(v, acc, w, h, z, w * 0.89, h * 0.2, h * 0.12, t);
  }, 10);
  const click = (ev: MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    const b = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - b.left) / b.width, y = (ev.clientY - b.top) / b.height;
    let best = -1, bd = 0.08;
    POS.forEach(([nx, ny], n) => { const d = Math.hypot((nx - x) * (w / h), ny - y); if (d < bd) { bd = d; best = n; } });
    if (best >= 0) onPick(best);
  };
  return <canvas ref={ref} width={w} height={h} className={`syzygy-canvas ${onPick ? 'pick' : ''}`} onClick={click} data-nodrag />;
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
      <button className="syzygy-thumb" onClick={() => setOpen(true)} title="Open the Syzygy">
        <Numogram w={150} h={84} />
      </button>
      <div className="ch-row syzygy-stats">
        <span className="ch-stat"><b>{fmt(z.dreams)}</b> dreams</span>
        <span className="ch-stat"><b>{live}</b>/{wiresTotal(z)} currents</span>
        <span className={`ch-stat ${totality(z) ? 'syzygy-hot' : ''}`}>{eclipseText(z)}</span>
        <span className="ch-stat">Gate {z.gateOpen ? <b>open</b> : <><b>{given}</b>/{offs.length}</>}</span>
      </div>
      <p className="small-note dim syzygy-hint">{hint}</p>
      <button className="max-all syzygy-open" onClick={() => setOpen(true)}>Open the Syzygy</button>
      {open && <SyzygyRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

function SyzygyRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const z = game.challenges.syzygy;
  const pick = (n: number) => {
    if (sel === null || sel === n) { setSel(sel === n ? null : n); return; }
    const a = sel;
    run(s => route(s, a, n));
    setSel(null);
  };
  const nodeName = (n: number) => n === 0 ? 'The gate' : n === 9 ? 'The Syzygy' : CHALLENGES.find(c => c.zone === n - 1)?.name ?? `Zone ${n}`;
  const offs = offerings(game);
  const gc = gateCost(game);
  const ready = offs.every(o => o.ok) && liveCurrents(z) >= GATE_CURRENTS;
  const ch = chapters(z);
  const pagesShown = Math.min(z.pages, 60);
  const lc = lanternCost(game), lens = lensCost(game);

  return (
    <ChallengeRoom zone={ZONE} title="The Syzygy" note="the bottom, where the iron is dreaming" onClose={onClose}
      className={`syzygy-room ${z.gateOpen ? 'syzygy-opened' : ''}`}
      stat={<><b>{fmt(z.dreams)}</b> dreams</>}>
      <div className="syzygy-cols">
        <section className="syzygy-col">
          <h3 className="sub-head">The Numogram</h3>
          <div className="artwork-frame knots syzygy-frame"><Numogram w={240} h={150} selected={sel} onPick={pick} /></div>
          <p className="small-note dim">{sel === null ? 'Touch a node, then another, to lay a wire between them.' : `${sel}: ${nodeName(sel)}. Now touch where the wire goes.`}</p>
          <div className="ch-row">
            <span className="ch-stat"><b>{wiresFree(z)}</b> of {wiresTotal(z)} wires free</span>
            <button onClick={() => run(buyWire)} disabled={z.dreams < wireCost(z)}>A wire <span className="syzygy-cost">{fmt(wireCost(z))} dreams</span></button>
          </div>
          <div className="syzygy-edges" data-scroll>
            {EDGES.map(e => {
              const k = edgeKey(e), t = z.links[k] ?? 0, wgt = edgeWeight(z, e);
              return (
                <div key={k} className={`syzygy-edge ${t ? 'on' : ''} ${wgt > 0 ? 'live' : ''}`}>
                  <span className="syzygy-pair">{e.a}·{e.b}</span>
                  <span className="syzygy-ename">{e.name} <small>{e.kind}</small></span>
                  <span className="syzygy-w">{t ? (wgt > 0 ? `x${(1 + 0.35 * wgt).toFixed(2)} ash` : 'dark end') : ''}{t > 1 ? ` ·${t}` : ''}</span>
                  <button className="secondary" disabled={wiresFree(z) <= 0} onClick={() => run(s => routeEdge(s, k))} title="Lay a wire here (another braids it)">+</button>
                  <button className="secondary" disabled={!t} onClick={() => run(s => cut(s, k))} title="Take a wire back">−</button>
                </div>
              );
            })}
          </div>
          <h3 className="sub-head">Nodes</h3>
          <div className="syzygy-nodes">
            {z.nodes.map((v, n) => <span key={n} className={v > 0 ? 'lit' : ''}><b>{n}</b> {nodeName(n)} <i>{v.toFixed(1)}</i></span>)}
          </div>
        </section>

        <section className="syzygy-col">
          <h3 className="sub-head">The dream · night {z.night + 1}</h3>
          <div className="syzygy-dream">
            <div className="artwork-frame knots syzygy-frame"><DreamMap /></div>
            <div className="syzygy-dream-side">
              <span className="ch-stat"><b>{Math.min(ROOMS, Math.floor(z.explored))}</b>/{ROOMS} rooms tonight</span>
              <span className="ch-stat"><b>{z.finds}</b> finds kept</span>
              <span className="ch-stat"><b>{(pilgrimSpeed(z) * 60).toFixed(2)}</b> rooms a minute</span>
              <span className="ch-stat dim">The map changes in {hm((z.night + 1) * NIGHT - z.clock)}</span>
              <button onClick={() => run(buyLantern)} disabled={game.ash.lt(lc)}>A lantern for the pilgrim <span className="syzygy-cost">{fmt(lc)} ash</span></button>
            </div>
          </div>
          <p className="syzygy-quote">“The pilgrim goes down by themselves. What they bring back stays.”</p>

          <h3 className="sub-head">The black sun</h3>
          <div className="syzygy-dream">
            <div className="artwork-frame knots syzygy-frame"><SunCanvas /></div>
            <div className="syzygy-dream-side">
              <span className={`ch-stat ${totality(z) ? 'syzygy-hot' : ''}`}>{eclipseText(z)}</span>
              <span className="ch-stat">Totality: every zone <b>x{totalityMult(z).toFixed(2)}</b> for {hm(totalityLen(z))}, dreams x2</span>
              <div className="ch-row">
                <button onClick={() => run(buyShade)} disabled={z.dreams < shadeCost(z)}>A shade <span className="syzygy-cost">{fmt(shadeCost(z))} dreams</span></button>
                <button onClick={() => run(buyLens)} disabled={game.ash.lt(lens)}>A lens <span className="syzygy-cost">{fmt(lens)} ash</span></button>
              </div>
              <span className="small-note dim">Shades hold totality longer. Lenses bring the next one sooner.</span>
            </div>
          </div>

          <h3 className="sub-head">The gate</h3>
          {z.gateOpen ? <p className="syzygy-quote">“Open. Nine touches zero.”</p> : <>
            <div className="syzygy-offerings">
              {offs.map(o => (
                <span key={o.zone} className={o.ok ? 'ok' : ''} style={{ color: o.ok ? ZONE_COLORS[o.zone] : undefined }}>
                  {o.ok ? '◆' : '◇'} {o.name} <i>{o.done ? `${Math.floor(o.level)}/${GATE_LEVEL}` : 'not yet'}</i>
                </span>
              ))}
              <span className={liveCurrents(z) >= GATE_CURRENTS ? 'ok' : ''}>{liveCurrents(z) >= GATE_CURRENTS ? '◆' : '◇'} Live currents <i>{liveCurrents(z)}/{GATE_CURRENTS}</i></span>
            </div>
            <button className="max-all" disabled={!ready || z.dreams < gc.dreams || game.ash.lt(gc.ash)} onClick={() => run(openGate)}>
              Open the gate · {fmt(gc.dreams)} dreams + {fmt(gc.ash)} ash
            </button>
          </>}
        </section>
      </div>

      <section>
        <h3 className="sub-head">The dream log · {z.pages} {z.pages === 1 ? 'page' : 'pages'}</h3>
        <div className="syzygy-book" data-scroll>
          {CHAPTERS.map((c, i) => {
            const have = Math.max(0, Math.min(PAGES_PER_CHAPTER, z.pages - i * PAGES_PER_CHAPTER));
            if (i > ch + 1) return null;
            return (
              <div key={i} className={`syzygy-chapter ${i < ch ? 'done' : ''}`}>
                <div className="syzygy-chapter-head">
                  <b>{['I', 'II', 'III', 'IV', 'V', 'VI'][i]}. {i <= ch ? c.title : '· · ·'}</b>
                  <span className="syzygy-pips">{Array.from({ length: PAGES_PER_CHAPTER }, (_, k) => <i key={k} className={k < have ? 'on' : ''} />)}</span>
                </div>
                <span className={i < ch ? '' : 'dim'}>{i < ch ? c.perk : i === ch ? `${PAGES_PER_CHAPTER - have} more pages.` : ''}</span>
              </div>
            );
          })}
          {ch >= CHAPTERS.length && <div className="syzygy-chapter done"><b>The pages go on.</b><span>Each chapter past the sixth: dreams +10%.</span></div>}
          <ol className="syzygy-pages" reversed>
            {Array.from({ length: pagesShown }, (_, k) => z.pages - 1 - k).map(n => <li key={n}>{fragment(z.seed, n)}</li>)}
          </ol>
          {z.pages === 0 && <p className="small-note dim">One page a night, if the pilgrim gets far enough.</p>}
        </div>
      </section>
    </ChallengeRoom>
  );
}
