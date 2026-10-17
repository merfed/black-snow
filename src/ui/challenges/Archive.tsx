// The Archive: the panel inside the zone 3 box, and the archive room with the shelf, the album and the channels.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  albumMult, albumSets, buyShelf, buyStock, canRecord, CHANNEL_MULT, dayLeft, driftMatch, eraseTape, FRESH_MULT, frameRate,
  RECORD_MIN, recordSlot, shelfCost, shelfSize, SITTERS, sitterOf, stockCost, tapeMult, tapeShare, tapeValue, WRONGS, wrongOf,
  type Tape,
} from '../../game/challenges/archive';
import { fmt } from '../../game/format';
import { BUFFER, match, PATTERN_TARGETS, patternSlots, patternsOpen, type PatternTarget } from '../../game/patterns';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { hash } from '../scenes';
import { ChallengeRoom } from './ChallengeSlot';
import './archive.css';

type Shade = (x: number, y: number, t: number, w: number, h: number) => number;
type Mask = (x: number, y: number, t: number, w: number, h: number) => boolean;

const RAMP = ['#0a0612', '#2a1442', '#7a3ec4', ZONE_COLORS[BUFFER], '#f2e2ff'].map(hex);
const RED = hex('#ff2a2a');
const name = (t: string) => PATTERN_TARGETS.find(p => p.id === t)?.name ?? t;

/**
 * A small ordered-dither canvas in the buffer's inks with a red accent mask. Animated ones run at a low
 * frame rate and hold still while off screen or for reduced motion.
 */
const Ink = memo(function Ink({ shade, accent, cols, rows, animate = false, fps = 10, className }: {
  shade: Shade; accent?: Mask; cols: number; rows: number; animate?: boolean; fps?: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cols, rows);
    const d = img.data, steps = RAMP.length - 1;
    const still = !animate || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let raf = 0, last = -1e9, visible = true;
    const draw = (t: number) => {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4, th = threshold(x, y);
        let col: [number, number, number];
        if (accent?.(x, y, t, cols, rows)) col = RED;
        else {
          const v = Math.max(0, Math.min(1, shade(x, y, t, cols, rows))) * steps, lo = Math.floor(v);
          col = RAMP[Math.min(steps, lo + (v - lo > th ? 1 : 0))];
        }
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) { last = ms; draw(ms / 1000); }
      if (visible) raf = requestAnimationFrame(loop);
    };
    if (still) { draw(1.7); return; }
    raf = requestAnimationFrame(loop);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was) raf = requestAnimationFrame(loop);
      });
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [shade, accent, cols, rows, animate, fps]);
  return <canvas ref={ref} width={cols} height={rows} className={`archive-ink ${className ?? ''}`} data-nodrag />;
});

// ---------- wrong frames ----------

const SITTER_NAMES = ['THE NIGHT CLERK', 'THE LINEMAN', 'THE CHILD AT THE GLASS', 'THE SURVEYOR', 'THE WOMAN IN THE LIFT', 'THE ONE WHO WAVES'];
const WRONG_NAMES = ['EYES SET LOW', 'MOUTH TURNED', 'SLIPPED', 'TWICE'];

const ell = (u: number, v: number, cx: number, cy: number, rx: number, ry: number) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2;

/** A portrait from a frame's seed: the sitter sets the face, the wrongness sets what is off about it. */
function portrait(seed: number): { shade: Shade; accent: Mask } {
  const k = sitterOf(seed), w = wrongOf(seed);
  const r = (n: number) => hash(seed, n, 3);
  const hw = 0.2 + 0.05 * ((k * 7) % 3) + r(1) * 0.03, hh = 0.27 + 0.03 * (k % 2) + r(2) * 0.02;
  const cy = 0.42, hair = k % 3, collar = (k >> 1) % 2;
  const eyeY = w === 0 ? cy + 0.1 : cy - 0.03, eyeDx = 0.07 + r(3) * 0.02;
  const face = (u: number, v: number) => {
    if (ell(u, v, 0.5, cy, hw, hh) > 1) return -1;
    let b = 0.62 - (u - 0.4) * 0.6 - (v - cy) * 0.5;
    if (hair === 0 && v < cy - hh * 0.55) b = 0.18;
    if (hair === 1 && v < cy - hh * 0.3 && Math.abs(u - 0.5) > hw * 0.45) b = 0.15;
    if (ell(u, v, 0.5 - eyeDx, eyeY, 0.035, 0.022) < 1 || ell(u, v, 0.5 + eyeDx, eyeY, 0.035, 0.022) < 1) b = 0.06;
    const my = cy + 0.15;
    if (w === 1 ? Math.abs(u - 0.5) < 0.012 && Math.abs(v - my) < 0.07 : Math.abs(v - my) < 0.012 && Math.abs(u - 0.5) < 0.07) b = 0.1;
    if (Math.abs(u - 0.5) < 0.01 && v > cy && v < cy + 0.08) b -= 0.15;
    return b;
  };
  const shade: Shade = (x, y, _t, W, H) => {
    let u = x / W, v = y / H;
    if (w === 2 && v > 0.38 && v < 0.52) u -= 0.12; // a band of the picture slipped sideways
    const n = hash(x, y, seed) * 0.12;
    let b = 0.12 + 0.1 * (1 - v) + n;
    if (v > cy + hh * 0.85) {
      const sh = Math.abs(u - 0.5) < 0.42 - (1 - v) * 0.4;
      if (sh) b = collar ? (Math.abs(u - 0.5) < 0.06 ? 0.8 : 0.35) : 0.3;
    }
    if (w === 3) { const f2 = face(u - 0.24, v + 0.05); if (f2 >= 0) b = 0.08 + f2 * 0.35; }
    const f = face(u, v);
    if (f >= 0) b = f + n * 0.5;
    if (y % 3 === 0) b -= 0.05;
    return b;
  };
  const accent: Mask = (x, y, _t, W, H) => {
    const u = x / W, v = y / H;
    if (w === 0) return ell(u, v, 0.5 + eyeDx, eyeY, 0.016, 0.012) < 1;
    if (w === 1) return Math.abs(u - 0.5) < 0.012 && Math.abs(v - (cy + 0.15)) < 0.02;
    if (w === 2) return v > 0.38 && v < 0.395 && hash(x, 1, seed) > 0.6;
    return hash(x, y, seed + 1) > 0.996;
  };
  return { shade, accent };
}

/** A stand-in seed for an album cell whose own frame has rolled out of the recent list. */
function stand(base: number, cell: number) {
  for (let n = 0; n < 4096; n++) { const sd = (base ^ Math.imul(n + 1, 0x27d4eb2d)) >>> 1; if (sitterOf(sd) * WRONGS + wrongOf(sd) === cell) return sd; }
  return cell;
}

const portraitCache = new Map<number, { shade: Shade; accent: Mask }>();
const portraitOf = (seed: number) => {
  let p = portraitCache.get(seed);
  if (!p) { p = portrait(seed); portraitCache.set(seed, p); }
  return p;
};

function Frame({ seed, big }: { seed: number; big?: boolean }) {
  const p = portraitOf(seed);
  return <Ink shade={p.shade} accent={p.accent} cols={big ? 36 : 24} rows={big ? 44 : 30} className="archive-portrait" />;
}

// ---------- broadcasts ----------

/** The tape look laid over every channel: scanlines and a slow tracking band rolling down. */
const tape = (inner: Shade): Shade => (x, y, t, w, h) => {
  const band = ((t * 0.12) % 1.4) * h - h * 0.2;
  const inBand = Math.abs(y - band) < 2.5;
  const xs = inBand ? x + Math.round((hash(y, Math.floor(t * 10)) - 0.5) * 6) : x;
  let v = inner(xs, y, t, w, h);
  if (inBand) v += (hash(x, y, Math.floor(t * 10)) - 0.5) * 0.6;
  if (y % 2) v -= 0.07;
  return v;
};

const CHANNELS: Record<PatternTarget, { title: string; caption: string; shade: Shade; accent?: Mask }> = {
  ash: {
    title: 'CH 1 · ASHFALL OVER NO ONE', caption: '"IT HAS SNOWED ON THIS CHANNEL SINCE BEFORE THE STATION."',
    shade: (x, y, t, _w, h) => {
      const v = y / h;
      if (hash(x >> 1, (y - Math.floor(t * 9)) >> 1, 11) > 0.94) return 0.95;
      return v > 0.72 ? 0.35 - (v - 0.72) * 0.6 + 0.04 * Math.sin(x * 0.7) : 0.1 + v * 0.18;
    },
    accent: (x, y, t, w, h) => Math.floor(t * 1.5) % 3 === 0 && Math.abs(x - w * 0.71) < 1 && Math.abs(y - h * 0.7) < 1,
  },
  listen: {
    title: 'CH 2 · THE LISTENER', caption: '"SOMEONE ON THE OTHER END IS HOLDING THEIR BREATH."',
    shade: (x, y, t, w, h) => {
      const u = x / w, v = y / h;
      if (ell(u, v, 0.5, 0.4, 0.07, 0.12) < 1 || (v > 0.52 && Math.abs(u - 0.5) < 0.2 - (1 - v) * 0.15)) return 0.04;
      const d = Math.hypot((u - 0.5) * w / h, v - 0.4);
      return Math.sin(d * 34 - t * 3) > 0.75 ? 0.55 - d * 0.5 : 0.14;
    },
    accent: (x, y, _t, w, h) => Math.abs(x - w * 0.43) < 1 && Math.abs(y - h * 0.4) < 1,
  },
  echoes: {
    title: 'CH 3 · CORRIDOR, REPEATING', caption: '"THE SAME DOOR, NEARER EACH TIME."',
    shade: (x, y, t, w, h) => {
      const d = Math.max(Math.abs(x / w - 0.5) / 0.5, Math.abs(y / h - 0.55) / 0.45);
      const f = (Math.log(d + 0.02) * 2.2 + t * 0.4) % 1;
      return (f < 0 ? f + 1 : f) < 0.12 ? 0.75 * d + 0.1 : 0.08 + d * 0.2;
    },
    accent: (x, y, t, w, h) => Math.floor(t * 2) % 5 === 0 && Math.abs(x - w / 2) < 1 && y > h * 0.53 && y < h * 0.6,
  },
  rust: {
    title: 'CH 4 · THE CABLE CAR', caption: '"IT ARRIVES EMPTY. IT LEAVES FULL."',
    shade: (x, y, t, w, h) => {
      const u = x / w, v = y / h;
      const ridge = 0.75 - 0.18 * Math.abs(Math.sin(u * 5.3 + 1)) - 0.08 * Math.sin(u * 13);
      if (v > ridge) return 0.3;
      const line = 0.2 + u * 0.4;
      if (Math.abs(v - line) < 0.012) return 0.8;
      const p = (t * 0.06) % 1.2 - 0.1;
      if (Math.abs(u - p) < 0.06 && v > 0.2 + p * 0.4 + 0.02 && v < 0.2 + p * 0.4 + 0.15) return 0.65;
      return 0.1 + v * 0.1;
    },
    accent: (x, y, t, w, h) => { const p = (t * 0.06) % 1.2 - 0.1; return Math.abs(x / w - p) < 0.015 && Math.abs(y / h - (0.2 + p * 0.4 + 0.08)) < 0.02; },
  },
  cycles: {
    title: 'CH 5 · CLOCKWORK GARDEN', caption: '"THE HANDS COUNT SOMETHING OTHER THAN HOURS."',
    shade: (x, y, t, w, h) => {
      const u = (x / w - 0.5) * w / h, v = y / h - 0.5, d = Math.hypot(u, v), a = Math.atan2(v, u);
      if (Math.abs(d - 0.38) < 0.02) return 0.8;
      if (d < 0.36 && Math.cos(a * 12 - t * 0.7) > 0.9) return 0.5;
      if (d < 0.05) return 0.9;
      return 0.1 + 0.08 * Math.sin(d * 20);
    },
    accent: (x, y, t, w, h) => {
      const u = (x / w - 0.5) * w / h, v = y / h - 0.5, d = Math.hypot(u, v), a = Math.atan2(v, u);
      const da = Math.abs(((a + t * 0.9) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      return d > 0.06 && d < 0.3 && da < 0.06;
    },
  },
  pigment: {
    title: 'CH 6 · THE PAINTED WINDOW', caption: '"THE VIEW WAS PAINTED FROM THE OUTSIDE."',
    shade: (x, y, t, w, h) => {
      const u = x / w, v = y / h;
      if (u < 0.2 || u > 0.8 || v < 0.12 || v > 0.88) return 0.06;
      if (Math.abs(u - 0.5) < 0.02 || Math.abs(v - 0.5) < 0.025 || u < 0.23 || u > 0.77 || v < 0.15 || v > 0.85) return 0.7;
      return 0.3 + 0.25 * Math.sin(u * 9 + Math.sin(v * 7 + t * 0.5) * 1.5 + t * 0.3);
    },
    accent: (x, y, t, w, h) => Math.floor(t / 3) % 4 === 1 && x > w * 0.52 && x < w * 0.77 && y > h * 0.53 && y < h * 0.85 && hash(x, y) > 0.7,
  },
  embers: {
    title: 'CH 7 · KILN LIGHT', caption: '"WARM HANDS. NOT YOURS."',
    shade: (x, y, t, w, h) => {
      const u = x / w - 0.5, v = y / h;
      const width = 0.25 * v * v + 0.02;
      const wob = 0.04 * Math.sin(v * 14 - t * 5) + 0.03 * Math.sin(v * 31 + t * 7);
      const f = 1 - Math.abs(u + wob) / width;
      if (v > 0.85) return 0.2;
      return f > 0 ? 0.35 + f * 0.6 * v + hash(x, y - Math.floor(t * 12)) * 0.15 : 0.06 + v * 0.06;
    },
    accent: (x, y, t, w, h) => { const u = x / w - 0.5, v = y / h; return v > 0.62 && v < 0.84 && Math.abs(u + 0.03 * Math.sin(v * 14 - t * 5)) < 0.03; },
  },
};

const tapeShades = Object.fromEntries(Object.entries(CHANNELS).map(([k, c]) => [k, tape(c.shade)])) as Record<PatternTarget, Shade>;
const noSignal: Shade = (x, y, t) => 0.15 + hash(x, y, Math.floor(t * 12)) * 0.6 * (0.6 + 0.4 * Math.sin(y * 0.5 + t * 4));

// ---------- panel ----------

function Spine({ tape: t, empty }: { tape?: Tape; empty?: boolean }) {
  if (empty || !t) return <span className="archive-spine empty" title="An empty space on the shelf" />;
  return (
    <span className={`archive-spine ${t.gold ? 'gold' : ''}`} title={`${name(t.target)} · ${Math.round(t.q * 100)}%${t.gold ? ' · gold label' : ''}`}>
      <i>{t.target.slice(0, 3).toUpperCase()}</i>
    </span>
  );
}

export function ArchivePanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [room, setRoom] = useState(false);
  const a = game.challenges.archive;
  const size = shelfSize(game);
  const slots = patternsOpen(game) ? patternSlots(game) : 0;
  const cost = shelfCost(game);
  const sets = albumSets(game);
  return (
    <div className="archive-box">
      <div className="archive-shelf" title="The shelf">
        {Array.from({ length: size }, (_, i) => <Spine key={a.shelf[i]?.id ?? `e${i}`} tape={a.shelf[i]} empty={!a.shelf[i]} />)}
      </div>
      <div className="ch-row">
        <span className="ch-stat">Shelf <b>{a.shelf.length}/{size}</b></span>
        <span className="ch-stat">Frames <b>{a.frames}</b></span>
        <span className="ch-stat">Sets <b>{sets}</b></span>
        <span className="ch-stat">Channels <b>{a.channels.length}/7</b></span>
        {a.freshLeft > 0 && <span className="ch-stat archive-fresh">Fresh <b>{Math.ceil(a.freshLeft / 60)}m</b></span>}
      </div>
      {slots === 0 ? <p className="dim small-note">The modulator is asleep. Nothing to record yet.</p> : (
        <div className="archive-slots">
          {Array.from({ length: slots }, (_, i) => {
            const slot = game.patterns.slots[i];
            const q = slot?.target ? match(game, slot) : 0;
            return (
              <div key={i} className="archive-slot">
                <span className="ch-stat">Slot {i + 1} · {slot?.target ? <>{name(slot.target)} <b>{Math.round(q * 100)}%</b></> : <span className="dim">empty</span>}</span>
                <button className="secondary" disabled={!canRecord(game, i)} onClick={() => run(s => recordSlot(s, i))}
                  title={q < RECORD_MIN ? `Needs a ${Math.round(RECORD_MIN * 100)}% match` : a.shelf.length >= size ? 'The shelf is full' : 'Record this match to tape. The slot lets go of it.'}>
                  Record slot {i + 1}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="ch-row">
        <button className="max-all" onClick={() => setRoom(true)}>Open the archive</button>
        <button className="secondary" disabled={game.ash.lt(cost)} onClick={() => run(buyShelf)}>More shelf · {fmt(cost)} ash</button>
      </div>
      {room && <ArchiveRoom onClose={() => setRoom(false)} />}
    </div>
  );
}

// ---------- room ----------

function ArchiveRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [view, setView] = useState<PatternTarget | null>(null);
  const a = game.challenges.archive;
  const size = shelfSize(game);
  const sets = albumSets(game);
  const slots = patternsOpen(game) ? patternSlots(game) : 0;
  const sc = stockCost(game);
  const hours = Math.floor(dayLeft(game) / 3600), mins = Math.floor((dayLeft(game) % 3600) / 60);
  const perHour = frameRate(game) * 3600;
  // The newest frame of each sitter x wrongness, so the album shows faces it has actually seen.
  const cells = useMemo(() => {
    const m = new Map<number, number>();
    for (const sd of [...a.recent].reverse()) m.set(sitterOf(sd) * WRONGS + wrongOf(sd), sd);
    return m;
  }, [a.recent]);
  const shown = view && a.channels.includes(view) ? view : (a.channels[0] as PatternTarget | undefined) ?? null;

  return (
    <ChallengeRoom zone={BUFFER} title="The Archive" note="records the shaft, plays it back wrong" onClose={onClose}
      stat={<>Shelf <b>{a.shelf.length}/{size}</b> · Sets <b>{sets}</b> · Channels <b>{a.channels.length}/7</b></>} className="archive-room">
      <div className="archive-grid" data-scroll>
        <section className="archive-sec">
          <span className="sub-head">The shelf</span>
          <p className="dim small-note">Tapes keep paying {Math.round(tapeShare(game) * 100)}% of a live lock. Gold labels pay double. A second tape of the same thing pays half, a third a third.</p>
          <div className="archive-tapes" data-scroll>
            {a.shelf.length === 0 && <p className="dim small-note">Empty. Lock a slot on the modulator, then record it.</p>}
            {a.shelf.map(t => (
              <div key={t.id} className={`archive-tape ${t.gold ? 'gold' : ''}`}>
                <span className="archive-label">{t.gold ? '◆ ' : ''}{name(t.target).toUpperCase()} · {Math.round(t.q * 100)}%</span>
                <span className="ch-stat">x<b>{fmt(tapeValue(game, t))}</b></span>
                <button className="secondary" onClick={() => run(s => eraseTape(s, t.id))} title="Erase it and free the space">Erase</button>
              </div>
            ))}
          </div>
          <div className="ch-row">
            {PATTERN_TARGETS.filter(p => a.shelf.some(t => t.target === p.id)).map(p => (
              <span key={p.id} className="ch-stat">{p.name} <b>x{fmt(tapeMult(game, p.id))}</b></span>
            ))}
          </div>
          <div className="ch-row">
            <button className="secondary" disabled={game.ash.lt(sc)} onClick={() => run(buyStock)} title="Better tape keeps more of the lock">Better stock ({a.stock}) · {fmt(sc)} ash</button>
          </div>

          <span className="sub-head">Drift</span>
          <p className="dim small-note">The signatures wander a little each station day. Meet one where it is today for a fresh lock: tapes pay x{FRESH_MULT} for four hours, once a day. Tapes never drift.</p>
          {slots === 0 ? <p className="dim small-note">The modulator is asleep.</p> : Array.from({ length: slots }, (_, i) => {
            const slot = game.patterns.slots[i];
            return (
              <div key={i} className="ch-row">
                <span className="ch-stat">Slot {i + 1} · {slot?.target ? <>{name(slot.target)} · today <b>{Math.round(driftMatch(game, slot) * 100)}%</b></> : <span className="dim">empty</span>}</span>
              </div>
            );
          })}
          <p className="ch-stat">{a.freshLeft > 0 ? <>Fresh lock · <b>{Math.ceil(a.freshLeft / 60)}m</b> left</> : <span className="dim">No fresh lock.</span>} <span className="dim">Next day in {hours}h {mins}m.</span></p>
        </section>

        <section className="archive-sec">
          <span className="sub-head">Wrong frames</span>
          <p className="dim small-note">Every glitch on the plate leaves a frame. About {fmt(perHour)} an hour; more buffers, more glitches. Each full row of four is a set: x{fmt(albumMult(game))} Pattern Buffer.</p>
          <div className="archive-album" data-scroll>
            {Array.from({ length: SITTERS }, (_, k) => {
              const row = a.album.slice(k * WRONGS, k * WRONGS + WRONGS);
              const full = Math.min(...row);
              return (
                <div key={k} className={`archive-row ${full ? 'full' : ''}`}>
                  <span className="archive-sitter">{SITTER_NAMES[k]}{full ? ` ×${full}` : ''}</span>
                  {row.map((n, w) => {
                    const sd = cells.get(k * WRONGS + w) ?? stand(game.patterns.seed, k * WRONGS + w);
                    return (
                      <div key={w} className={`archive-cell ${n ? '' : 'missing'}`} title={n ? `${WRONG_NAMES[w]} · ${n}` : 'Not yet'}>
                        {n ? <Frame seed={sd} /> : <span className="archive-blank">?</span>}
                        <span className="archive-count">{n ? n : ''}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {a.recent.length > 0 && (
            <>
              <span className="sub-head">Last frames</span>
              <div className="archive-recent">
                {a.recent.slice(0, 4).map((sd, i) => (
                  <figure key={`${sd}-${i}`} className="archive-fig">
                    <div className="archive-frame"><Frame seed={sd} big /></div>
                    <figcaption>"{SITTER_NAMES[sitterOf(sd)]}, {WRONG_NAMES[wrongOf(sd)]}"</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="archive-sec archive-wide">
          <span className="sub-head">Hidden channels</span>
          <p className="dim small-note">Every exact lock, live or on a gold tape, finds a channel. Each one found: x{CHANNEL_MULT} on what it was locked to.</p>
          <div className="archive-channels">
            {PATTERN_TARGETS.map(p => {
              const on = a.channels.includes(p.id);
              return (
                <button key={p.id} className={`archive-ch ${on ? 'on' : ''} ${shown === p.id ? 'sel' : ''}`} disabled={!on} onClick={() => setView(p.id)}
                  title={on ? CHANNELS[p.id].title : `No signal. Lock ${p.name.toLowerCase()} exactly.`}>
                  {on ? CHANNELS[p.id].title.split(' · ')[0] : '· · ·'}
                </button>
              );
            })}
          </div>
          <figure className="archive-fig archive-tv">
            <div className="archive-frame">
              {shown
                ? <Ink key={shown} shade={tapeShades[shown]} accent={CHANNELS[shown].accent} cols={120} rows={68} animate fps={10} className="archive-screen" />
                : <Ink shade={noSignal} cols={120} rows={68} animate fps={8} className="archive-screen" />}
            </div>
            <figcaption>{shown ? <><b>{CHANNELS[shown].title}</b><br />{CHANNELS[shown].caption}</> : '"NO SIGNAL. THE TAPE IS STILL ROLLING."'}</figcaption>
          </figure>
          {a.channels.length >= PATTERN_TARGETS.length && <p className="archive-final">"SEVEN CHANNELS. THERE IS A THIRTEENTH TAPE ON THE SHELF ALREADY. THE LABEL IS IN YOUR HANDWRITING."</p>}
        </section>
      </div>
    </ChallengeRoom>
  );
}
