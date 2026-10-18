// The Archive: the panel inside the zone 3 box, and the archive room with the shelf, the album and the channels.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  albumMult, albumSets, BLANK_CAP, BLANK_EVERY, buyShelf, buyStock, canRecord, recordBlock, CHANNEL_MULT, dayLeft, driftMatch, eraseTape, FRESH_MULT, frameRate,
  recordSlot, shelfCost, shelfFull, shelfSize, SHELF_MAX, SITTERS, sitterOf, stockCost, tapeMult, tapeShare, tapeValue, WRONGS, wrongOf,
  type Tape,
} from '../../game/challenges/archive';
import { fmt, fmtTime } from '../../game/format';
import { BUFFER, match, PATTERN_TARGETS, patternSlots, patternsOpen, type PatternTarget } from '../../game/patterns';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { hash } from '../scenes';
import { ChallengeRoom, RoomStatus, SaveHint } from './ChallengeSlot';
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
        <span className="ch-stat" title={`A blank reel comes every ${BLANK_EVERY / 60} minutes, up to ${BLANK_CAP}. Each tape uses one.`}>
          Blank reels <b>{a.blanks}</b>{a.blanks < BLANK_CAP && <span className="dim"> · next {fmtTime((1 - a.blankProg) * BLANK_EVERY)}</span>}
        </span>
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
            const why = recordBlock(game, i);
            return (
              <div key={i} className="archive-slot">
                <span className="ch-stat">Slot {i + 1} · {slot?.target
                  ? <>{name(slot.target)} <b>{Math.round(q * 100)}%</b> <span className="dim" title="How close it sits to today's drifted signature. Meet it exactly for a fresh lock.">· drift today {Math.round(driftMatch(game, slot) * 100)}%</span></>
                  : <span className="dim">empty</span>}</span>
                <button className="secondary" disabled={!canRecord(game, i)} onClick={() => run(s => recordSlot(s, i))}
                  title={why || 'Record this match onto a blank reel. The slot lets go of it and its dials spin back to rest.'}>
                  Record slot {i + 1}
                </button>
                {why && slot?.target && <span className="dim small-note">{why}.</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="ch-row">
        <button className="max-all" onClick={() => setRoom(true)}>Open the archive</button>
        {shelfFull(game) ? <span className="ch-stat archive-full">Shelf full: <b>{SHELF_MAX}</b></span>
          : <><button className="secondary" disabled={game.ash.lt(cost)} onClick={() => run(buyShelf)}>More shelf · {fmt(cost)} ash</button><SaveHint game={game} cost={cost} /></>}
      </div>
      {room && <ArchiveRoom onClose={() => setRoom(false)} />}
    </div>
  );
}

// ---------- room ----------

/** Shelves of the rack: spines per plank. Three planks hold the whole 32. */
const PER_PLANK = 11;

/** A cassette spine on the rack: label strip, a quality gauge, gold if it locked true. */
function RackSpine({ t, sel, onPick }: { t: Tape; sel: boolean; onPick: () => void }) {
  return (
    <button className={`ar-spine${t.gold ? ' gold' : ''}${sel ? ' sel' : ''}`} onClick={onPick} aria-pressed={sel}
      title={`${name(t.target)} · ${Math.round(t.q * 100)}%${t.gold ? ' · gold label' : ''}`}>
      <span className="ar-spine-label">{t.target.slice(0, 3).toUpperCase()}</span>
      <span className="ar-spine-q" style={{ height: `${Math.round(t.q * 100)}%` }} />
    </button>
  );
}

/** Two tape reels in a cassette window; they turn while the slot holds something worth recording. */
function Reels({ turning }: { turning: boolean }) {
  return (
    <span className={`ar-reels${turning ? ' turning' : ''}`} aria-hidden>
      <i /><span className="ar-reel-tape" /><i />
    </span>
  );
}

function ArchiveRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [view, setView] = useState<PatternTarget | null>(null);
  const [pick, setPick] = useState<number | null>(null);
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
  const shelfAt = shelfFull(game);
  const picked = a.shelf.find(t => t.id === pick) ?? null;
  const planks = Math.ceil(SHELF_MAX / PER_PLANK);
  const share = Math.round(tapeShare(game) * 100);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Shelf', value: `${a.shelf.length}/${size}`, rate: `pays ${share}%`, title: 'Tapes on the shelf, and the share of a live lock each keeps paying' },
        { label: 'Blank reels', value: a.blanks, rate: a.blanks < BLANK_CAP ? `next ${fmtTime((1 - a.blankProg) * BLANK_EVERY)}` : 'full',
          title: `A blank reel comes every ${BLANK_EVERY / 60} minutes, up to ${BLANK_CAP}. Each tape uses one.` },
        { label: 'Frames', value: fmt(a.frames), rate: `~${fmt(perHour)}/h` },
        { label: 'Sets', value: sets, rate: `x${fmt(albumMult(game))} buffer`, title: 'Full album rows: each pays the Pattern Buffer' },
        { label: 'Channels', value: `${a.channels.length}/${PATTERN_TARGETS.length}`, rate: a.freshLeft > 0 ? `fresh ${Math.ceil(a.freshLeft / 60)}m` : 'no fresh lock' },
      ]}
      buy={{
        label: shelfAt ? 'Shelf full' : 'More shelf', cost: shelfCost(game), disabled: shelfAt || game.ash.lt(shelfCost(game)),
        onClick: () => run(buyShelf), title: shelfAt ? `The shelf holds ${SHELF_MAX} at most` : 'Room for one more tape',
      }}
    />
  );

  return (
    <ChallengeRoom zone={BUFFER} title="The Archive" note="records the shaft, plays it back wrong" onClose={onClose}
      status={status} className="archive-room">
      <div className="ar-grid">
        {/* ---- the rack ---- */}
        <section className="ar-col ar-rack-col" aria-label="The shelf">
          <div className="ar-head"><span className="ar-cap">"THE SHELF"</span><span className="ar-head-note">{a.shelf.length} of {size} · {SHELF_MAX} at most</span></div>
          <div className="ar-rack" title={`Tapes keep paying ${share}% of a live lock. Gold labels pay double. A second tape of the same thing pays half, a third a third.`}>
            {Array.from({ length: planks }, (_, r) => (
              <div key={r} className="ar-plank">
                {Array.from({ length: PER_PLANK }, (_, c) => {
                  const i = r * PER_PLANK + c;
                  if (i >= SHELF_MAX) return <span key={c} className="ar-gap none" />;
                  const t = a.shelf[i];
                  if (t) return <RackSpine key={t.id} t={t} sel={pick === t.id} onPick={() => setPick(pick === t.id ? null : t.id)} />;
                  return <span key={c} className={`ar-gap${i < size ? '' : ' locked'}`} title={i < size ? 'An empty space' : 'Buy more shelf'} />;
                })}
              </div>
            ))}
          </div>
          <div className={`ar-card${picked?.gold ? ' gold' : ''}`}>
            {picked ? <>
              <div className="ar-card-label">{picked.gold ? '◆ ' : ''}{name(picked.target).toUpperCase()}</div>
              <div className="ar-card-row">
                <span>locked <b>{Math.round(picked.q * 100)}%</b></span>
                <span>pays <b>x{fmt(tapeValue(game, picked))}</b></span>
                <button className="secondary" onClick={() => { run(s => eraseTape(s, picked.id)); setPick(null); }} title="Erase it and free the space">Erase</button>
              </div>
            </> : a.shelf.length
              ? <p className="ar-card-hint">Pick a tape to read its label.</p>
              : <p className="ar-card-hint">Empty. Lock a slot on the modulator, then record it on the deck.</p>}
          </div>
          <div className="ar-chips">
            {PATTERN_TARGETS.filter(p => a.shelf.some(t => t.target === p.id)).map(p => (
              <span key={p.id} className="ar-chip">{p.name} <b>x{fmt(tapeMult(game, p.id))}</b></span>
            ))}
          </div>
          <div className="ar-buy-row">
            <button className="secondary ar-stock" disabled={game.ash.lt(sc)} onClick={() => run(buyStock)} title={`Better tape keeps more of the lock. Now ${share}%.`}>
              <span>Better stock <small>lv {a.stock}</small></span><small className="cost">{fmt(sc)} ash</small>
            </button>
            {game.ash.lt(sc) && <SaveHint game={game} cost={sc} />}
          </div>
        </section>

        {/* ---- the set and the deck ---- */}
        <section className="ar-col ar-set-col" aria-label="The set">
          <div className="ar-tv">
            <div className="ar-tv-screen">
              {shown
                ? <Ink key={shown} shade={tapeShades[shown]} accent={CHANNELS[shown].accent} cols={120} rows={68} animate fps={10} className="archive-screen" />
                : <Ink shade={noSignal} cols={120} rows={68} animate fps={8} className="archive-screen" />}
              <span className="ar-tv-osd">{shown ? CHANNELS[shown].title.split(' · ')[0] : 'NO SIGNAL'}</span>
            </div>
            <div className="ar-tv-side">
              <div className="ar-tv-grille" aria-hidden />
              <div className="ar-tv-keys" role="group" aria-label="Channels">
                {PATTERN_TARGETS.map((p, k) => {
                  const on = a.channels.includes(p.id);
                  return (
                    <button key={p.id} className={`ar-key${on ? ' on' : ''}${shown === p.id ? ' sel' : ''}`} disabled={!on} onClick={() => setView(p.id)}
                      title={on ? CHANNELS[p.id].title : `No signal. Lock ${p.name.toLowerCase()} exactly. Each channel found: x${CHANNEL_MULT} on it.`}>
                      {k + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="ar-tv-plate">ARCHIVE·7 <span>{a.channels.length}/{PATTERN_TARGETS.length} found</span></div>
          </div>
          <p className="ar-caption">
            {a.channels.length >= PATTERN_TARGETS.length
              ? '"SEVEN CHANNELS. THERE IS A THIRTEENTH TAPE ON THE SHELF ALREADY. THE LABEL IS IN YOUR HANDWRITING."'
              : shown ? CHANNELS[shown].caption : '"NO SIGNAL. THE TAPE IS STILL ROLLING."'}
          </p>

          <div className="ar-deck" aria-label="The deck">
            <div className="ar-deck-head">
              <span className="ar-cap">"THE DECK"</span>
              <span className={`ar-lamp${a.freshLeft > 0 ? ' lit' : ''}`} title={`Meet a signature where it drifted today for a fresh lock: tapes pay x${FRESH_MULT} for four hours, once a day. Tapes never drift.`}>
                <i /> {a.freshLeft > 0 ? `FRESH ${Math.ceil(a.freshLeft / 60)}m` : 'NO FRESH LOCK'}
              </span>
              <span className="ar-head-note">day turns in {hours}h {mins}m</span>
            </div>
            {slots === 0 ? <p className="ar-card-hint">The modulator is asleep. Nothing to record yet.</p> : Array.from({ length: slots }, (_, i) => {
              const slot = game.patterns.slots[i];
              const q = slot?.target ? match(game, slot) : 0;
              const d = slot?.target ? driftMatch(game, slot) : 0;
              const ok = canRecord(game, i);
              const why = recordBlock(game, i);
              return (
                <div key={i} className={`ar-slot${slot?.target ? '' : ' empty'}`}>
                  <Reels turning={ok} />
                  <div className="ar-slot-info">
                    <span className="ar-slot-name">{i + 1} · {slot?.target ? name(slot.target).toUpperCase() : 'EMPTY'}</span>
                    {slot?.target && <span className="ar-meters">
                      <span title="How well it locks">lock <b>{Math.round(q * 100)}%</b></span>
                      <span title="How close it sits to today's drifted signature. Meet it exactly for a fresh lock.">today <b>{Math.round(d * 100)}%</b></span>
                    </span>}
                  </div>
                  <button className="ar-rec" disabled={!ok} onClick={() => run(s => recordSlot(s, i))}
                    title={why || 'Record this match onto a blank reel. The slot lets go of it and its dials spin back to rest.'}>
                    <i /> REC
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- the album ---- */}
        <section className="ar-col ar-album-col" aria-label="Wrong frames">
          <div className="ar-head"><span className="ar-cap">"WRONG FRAMES"</span><span className="ar-head-note">{sets} {sets === 1 ? 'set' : 'sets'}</span></div>
          <div className="ar-strip" title="The last frames the plate glitched out">
            {Array.from({ length: 6 }, (_, i) => {
              const sd = a.recent[i];
              return <div key={i} className="ar-strip-cell">{sd != null ? <Frame seed={sd} /> : <span className="archive-blank">·</span>}</div>;
            })}
          </div>
          {a.recent.length > 0 && <p className="ar-strip-cap">"{SITTER_NAMES[sitterOf(a.recent[0])]}, {WRONG_NAMES[wrongOf(a.recent[0])]}"</p>}
          <div className="ar-album" title="Every glitch on the plate leaves a frame; more buffers, more glitches. Each full row of four is a set, and each set pays the Pattern Buffer.">
            <div className="ar-album-row ar-album-key" aria-hidden>
              <span />{WRONG_NAMES.map(w => <span key={w}>{w.split(' ')[0]}</span>)}
            </div>
            {Array.from({ length: SITTERS }, (_, k) => {
              const row = a.album.slice(k * WRONGS, k * WRONGS + WRONGS);
              const full = Math.min(...row);
              return (
                <div key={k} className={`ar-album-row${full ? ' full' : ''}`}>
                  <span className="ar-sitter">{SITTER_NAMES[k].replace(/^THE /, '')}{full ? <b> ×{full}</b> : ''}</span>
                  {row.map((n, w) => {
                    const sd = cells.get(k * WRONGS + w) ?? stand(game.patterns.seed, k * WRONGS + w);
                    return (
                      <div key={w} className={`ar-cell${n ? '' : ' missing'}`} title={n ? `${WRONG_NAMES[w]} · ${n}` : 'Not yet'}>
                        {n ? <Frame seed={sd} /> : <span className="archive-blank">?</span>}
                        {n > 0 && <span className="archive-count">{n}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ChallengeRoom>
  );
}
