import { useEffect, useRef, type CSSProperties } from 'react';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { buyTape, ownsTape, playTape, tapeOnShelf, TAPES, tvOpen } from '../game/tapes';
import { hex, threshold } from './dither';

type Fn = (x: number, y: number, t: number, w: number, h: number) => number;
interface Reel { ramp: string[]; fn: Fn }

const W = 128, H = 96;
const hash = (a: number, b: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
const digitAt = (d: number, cx: number, cy: number) => (cx < 0 || cy < 0 || cx > 2 || cy > 4 ? false : DIGITS[d][cy * 3 + cx] === '1');

/** Thirteen tapes, each a little dithered film: a brightness function and the four or five colours it is printed in. */
const REELS: Record<string, Reel> = {
  snow: { ramp: ['#05060a', '#1c2030', '#5a6070', '#c8ccd8'], fn: (x, y, t, _w, h) => {
    const sp = 14 + hash(x, 3) * 18;
    const flake = hash(x, Math.floor(y - t * sp)) > 0.965 ? 1 : 0;
    return y > h * 0.86 ? 0.55 + 0.1 * Math.sin(x * 0.3) : Math.max(flake, 0.12 + 0.18 * (y / h)); } },
  lull: { ramp: ['#04040c', '#141838', '#3a3050', '#ffd27a'], fn: (x, y, t, w, h) => {
    const b = Math.floor(x / 9), top = h * (0.45 + 0.35 * hash(b, 1));
    if (Math.hypot(x - w * 0.8, y - h * 0.18) < 7) return 0.66;
    if (y < top) return 0.08 + 0.12 * (1 - y / h) + (hash(x, y) > 0.995 ? 0.6 : 0);
    const win = x % 9 > 2 && x % 9 < 6 && y % 7 > 2 && y % 7 < 5;
    return win && hash(b * 31 + Math.floor(y / 7), Math.floor(t / 4 + hash(b, y >> 3) * 9)) > 0.62 ? 1 : 0.3; } },
  numbers: { ramp: ['#0a0202', '#3a0808', '#9a1818', '#ffd0c8'], fn: (x, y, t, w, h) => {
    const n = 99 - (Math.floor(t * 0.8) % 100), s = 6;
    const ox = w / 2 - 22, oy = h / 2 - 15;
    const on = digitAt(Math.floor(n / 10), Math.floor((x - ox) / s), Math.floor((y - oy) / s)) || digitAt(n % 10, Math.floor((x - ox - 24) / s), Math.floor((y - oy) / s));
    return on ? 0.95 : 0.1 + 0.12 * Math.sin(t * 6) * (y % 2); } },
  stair: { ramp: ['#060408', '#2a1830', '#7a4a6a', '#f0b0c8'], fn: (x, y, t, w, h) => {
    const dx = (x - w / 2) / h, dy = (y - h / 2) / h, r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) / (Math.PI * 2);
    const band = a * 4 + Math.log(r + 0.02) * 3 - t * 0.6;
    const step = Math.floor(band * 6) % 2 ? 0.75 : 0.45;
    return (band - Math.floor(band) < 0.55 ? step : 0.08) * Math.min(1, r * 4); } },
  pool: { ramp: ['#031018', '#0a3a4a', '#1a8a9a', '#c8fff4'], fn: (x, y, t, w, h) => {
    const z = (y - h * 0.3) / (h * 0.7);
    if (z < 0) return 0.2 + (x % 16 < 1 || y % 12 < 1 ? 0.3 : 0);
    const u = (x - w / 2) / (z + 0.2), v = 1 / (z + 0.2);
    const tile = (Math.abs(u) % 12 < 0.8 || v * 6 % 3 < 0.25) ? 0.25 : 0;
    const c = Math.sin(u * 0.3 + t * 1.5) + Math.sin(v * 4 - t * 1.1) + Math.sin((u + v * 8) * 0.2 + t);
    return 0.35 + tile + (c > 2.1 ? 0.6 : 0); } },
  siren: { ramp: ['#0a0404', '#3a1010', '#b0281c', '#ffe0a0'], fn: (x, y, t, w, h) => {
    const cx = w / 2, top = h * 0.3;
    if (y > top && Math.abs(x - cx) < 3 + (y - top) * 0.12) return y > h * 0.9 ? 0.2 : 0.02;
    if (Math.abs(x - cx) < 6 && Math.abs(y - top) < 4) return 1;
    const d = Math.hypot(x - cx, (y - top) * 1.3);
    const ring = (d - t * 30) % 26;
    return ring > -3 && ring < 0 ? 0.7 : 0.14 * (1 - y / h) + 0.04; } },
  corridor: { ramp: ['#040404', '#1c1a14', '#5a5240', '#e8dcb0'], fn: (x, y, t, w, h) => {
    const u = (x - w / 2) / w, v = (y - h / 2) / h;
    if (Math.abs(u) < 0.05 && v > -0.08 && v < 0.06) return v > 0.05 ? 0.4 : 0.05;
    const m = Math.max(Math.abs(u) * 1.2, Math.abs(v));
    const z = 0.08 / Math.max(m, 0.04);
    const seam = (z * 6 + t * 1.2) % 1 < 0.08;
    return Math.min(1, (seam ? 0.7 : 0.35) * (1 - z * 0.45) + (m < 0.06 ? -0.3 : 0)); } },
  weather: { ramp: ['#04140a', '#0c3a20', '#2a8a4a', '#e0ff9a'], fn: (x, y, t, w, h) => {
    const g = (cx: number, cy: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / 600);
    const f = g(w * (0.3 + 0.1 * Math.sin(t * 0.3)), h * 0.4) - g(w * (0.7 + 0.1 * Math.cos(t * 0.25)), h * (0.6 + 0.1 * Math.sin(t * 0.4))) + 0.3 * Math.sin(x * 0.05 + t * 0.2);
    const line = Math.abs((f * 8) % 1) < 0.12;
    const coast = Math.abs(y - (h * 0.75 + 8 * Math.sin(x * 0.08))) < 1;
    return line ? 0.95 : coast ? 0.6 : 0.18 + (f > 0.4 ? 0.12 : 0); } },
  moths: { ramp: ['#060402', '#2a1c08', '#9a6a20', '#fff2b8'], fn: (x, y, t, w, h) => {
    const cx = w / 2, cy = h * 0.42, d = Math.hypot(x - cx, y - cy);
    let v = Math.max(0, 1 - d / 46) * 0.8;
    if (d < 5) v = 1;
    for (let k = 0; k < 9; k++) {
      const a = t * (0.7 + k * 0.13) + k * 2.1, r = 10 + 16 * hash(k, 7) + 4 * Math.sin(t * 3 + k);
      if (Math.abs(x - (cx + Math.cos(a) * r)) < 1.5 && Math.abs(y - (cy + Math.sin(a * 1.3) * r * 0.6)) < 1) v = 0.02;
    }
    return v; } },
  fire: { ramp: ['#0a0202', '#5a0a04', '#e04a10', '#ffe890'], fn: (x, y, t, _w, h) => {
    const n = Math.sin(x * 0.21 + t * 2) + Math.sin(x * 0.13 - t * 1.3 + y * 0.1) + Math.sin((x + y) * 0.07 + t * 3);
    return (1 - y / (h * 0.75)) * 1.1 + n * 0.15 - (hash(x, Math.floor(y + t * 40)) > 0.97 ? 0.4 : 0); } },
  sun: { ramp: ['#000000', '#1a1408', '#8a6a1a', '#fff0b0'], fn: (x, y, t, w, h) => {
    const dx = x - w / 2, dy = y - h / 2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (r < 18) return 0;
    const rays = 0.5 + 0.5 * Math.sin(a * 14 + Math.sin(t * 0.7) * 2) * Math.sin(a * 5 - t * 0.4);
    return Math.max(0, 1.2 - (r - 18) / (14 + 18 * rays)) + (r < 20 ? 0.6 : 0); } },
  bars: { ramp: ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8', '#101010'], fn: (x, y, t, w, h) => {
    if (y > h * 0.72) return (Math.floor(x / (w / 7)) % 2 ? 7 : 0) / 7 + (Math.abs(x - (w / 2 + Math.sin(t) * 30)) < 2 ? -1 : 0);
    return Math.floor(x / (w / 7)) / 7; } },
  relay: { ramp: ['#020304', '#141a1e', '#4a5a60', '#c8f0e8'], fn: (x, y, t, w, h) => {
    const dx = Math.abs(x - w / 2) / w, dy = Math.abs(y - h / 2) / h;
    const m = Math.max(dx, dy * 0.9);
    const depth = Math.log(m + 0.001) * 2.2 + t * 0.5;
    const frame = (depth - Math.floor(depth)) < 0.12;
    if (m < 0.03) return hash(x + Math.floor(t * 12), y) * 0.8;
    const chair = Math.abs(x - w * 0.3) < 4 && y > h * 0.7 && y < h * 0.9 && Math.floor(depth) % 3 === 0;
    return frame ? 0.85 : chair ? 0 : 0.18 + 0.08 * (Math.floor(depth) % 2); } },
};

const STATIC: Reel = { ramp: ['#060606', '#3a3a3a', '#9a9a9a', '#f0f0f0'], fn: (x, y, t) => hash(x * 1.7 + Math.floor(t * 30) * 13.1, y * 3.3) * (0.7 + 0.3 * Math.sin(y * 0.4 - t * 9)) };

/**
 * The screen. Each frame is dithered at a tiny size, then run through a cheap VHS pass: rows slip
 * sideways near a rolling tracking band, and red is printed a pixel off from the rest.
 */
function Screen({ tape }: { tape: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tapeRef = useRef(tape);
  tapeRef.current = tape;
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    const img = g.createImageData(W, H);
    const out = g.createImageData(W, H);
    let raf = 0, last = 0, since = 0, prev: string | null | undefined;
    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw);
      if (ms - last < 1000 / 15) return;
      last = ms;
      const t = ms / 1000;
      if (tapeRef.current !== prev) { prev = tapeRef.current; since = t; }
      // A second of static whenever the tape changes, like a real deck finding the signal.
      const reel = t - since < 0.8 || !prev ? STATIC : REELS[prev] ?? STATIC;
      const pal = reel.ramp.map(hex), steps = pal.length - 1;
      const d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = Math.max(0, Math.min(1, reel.fn(x, y, t - since, W, H))) * steps;
        const lo = Math.floor(v);
        const c = pal[Math.min(steps, lo + (v - lo > threshold(x, y) ? 1 : 0))];
        const i = (y * W + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      const band = ((t * 18) % (H + 30)) - 15;
      const o = out.data;
      for (let y = 0; y < H; y++) {
        const near = Math.abs(y - band) < 2;
        const slip = near ? Math.round((hash(y, Math.floor(t * 10)) - 0.5) * 6) : hash(y, Math.floor(t * 4)) > 0.985 ? 2 : 0;
        for (let x = 0; x < W; x++) {
          const sx = Math.min(W - 1, Math.max(0, x + slip));
          const i = (y * W + x) * 4, j = (y * W + sx) * 4, r = (y * W + Math.min(W - 1, sx + 1)) * 4;
          const lift = near ? 18 : 0;
          o[i] = Math.min(255, d[r] + lift); o[i + 1] = Math.min(255, d[j + 1] + lift); o[i + 2] = Math.min(255, d[j + 2] + lift); o[i + 3] = 255;
        }
      }
      g.putImageData(out, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={W} height={H} className="tv-canvas" />;
}

const SPINE_COLORS = ['#c8ccd8', '#ffd27a', '#ff6b5b', '#f0b0c8', '#5ad8e0', '#ff8a3d', '#e8dcb0', '#9aff7a', '#fff2b8', '#ff4a10', '#ffd23b', '#8a9aff', '#3a5a60'];

/** The set in the corner of the room, with whatever tapes you own stacked under it. */
export function TvPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  if (!tvOpen(game)) return null;
  const playing = TAPES.find(t => t.id === game.tv);
  const owned = TAPES.filter(t => ownsTape(game, t.id));

  return (
    <section className="panel tv-panel framed reveal" data-panel="tv">
      <h2>Television <span className="h2-note">it was on when you got here</span></h2>
      <div className="tv-set">
        <div className="tv-glass">
          <Screen tape={game.tv} />
          <div className="tv-scan" aria-hidden="true" />
          <div className="tv-osd">
            {playing ? <><span>PLAY ▶</span><span>SP</span></> : <span>CH 0</span>}
          </div>
          {playing && <div className="tv-title">{playing.title}</div>}
        </div>
        <div className="tv-side">
          <span className="tv-knob" /><span className="tv-knob small" />
          <span className="tv-grille" />
        </div>
      </div>
      <div className="tv-deck">
        <span className="tv-deck-label">VCR</span>
        <span className={`tv-led ${playing ? 'on' : ''}`} />
        <button className="tv-eject" disabled={!playing} onClick={() => run(s => playTape(s, null))}>Eject</button>
      </div>
      {owned.length > 0 ? (
        <div className="tape-stack" aria-label="Your tapes">
          {owned.map(t => (
            <button key={t.id} className={`tape-spine ${game.tv === t.id ? 'on' : ''}`} onClick={() => run(s => playTape(s, t.id))}
              style={{ '--c': SPINE_COLORS[TAPES.indexOf(t)] } as CSSProperties} title={t.blurb}>{t.title}</button>
          ))}
        </div>
      ) : <p className="dim small-note">Only static so far. The video shop down the road still rents tapes.</p>}
    </section>
  );
}

/** The video shop. Tapes are just for watching; there are twelve on the shelf, and something behind the counter. */
export function ShopPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  if (!tvOpen(game)) return null;
  // Tapes you own go home with you, so the shelf only shows what is left.
  const shelf = TAPES.filter(t => tapeOnShelf(game, t) && !ownsTape(game, t.id));
  const left = TAPES.filter(t => !t.secret && !ownsTape(game, t.id)).length;
  return (
    <section className="panel shop-panel framed reveal" data-panel="shop">
      <h2>Lull Video <span className="h2-note">open all night, every night</span></h2>
      <ul className="shop-shelf">
        {shelf.map(t => {
          const got = ownsTape(game, t.id);
          return (
            <li key={t.id} className={`shop-tape ${got ? 'got' : ''} ${t.secret ? 'secret' : ''}`} style={{ '--c': SPINE_COLORS[TAPES.indexOf(t)] } as CSSProperties}>
              <span className="shop-box" aria-hidden="true" />
              <div><b>{t.title}</b><span>{t.blurb}</span></div>
              {got ? <span className="shop-owned">owned</span> : (
                <button className="secondary" disabled={game.ash.lt(t.cost)} onClick={() => run(s => buyTape(s, t.id))}>Buy <span className="cost">{fmt(t.cost)}</span></button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="dim small-note">{left ? `${left} of 12 still on the shelf. The man behind the counter says there is one more, for when you have seen the rest.` : 'You have every tape on the shelf.'}</p>
    </section>
  );
}
