import { memo, useEffect, useRef, type CSSProperties } from 'react';

/*
 * A tiny ordered-dither engine, in the spirit of Dither Kit: every effect is a function that says how
 * bright each cell should be, and the engine turns that into hard on/off pixels with an 8x8 Bayer
 * matrix. Drawn on a small canvas and scaled up with crisp edges, so it always looks like pixel art.
 */
const BAYER8 = (() => {
  const m = [[0, 2], [3, 1]];
  let b = m;
  for (let n = 2; n < 8; n *= 2) {
    const next: number[][] = Array.from({ length: n * 2 }, () => Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = b[y][x] * 4;
      next[y][x] = v; next[y][x + n] = v + 2; next[y + n][x] = v + 3; next[y + n][x + n] = v + 1;
    }
    b = next;
  }
  return b.map(r => r.map(v => (v + 0.5) / 64));
})();

export const threshold = (x: number, y: number) => BAYER8[y & 7][x & 7];

export type Shade = (x: number, y: number, t: number, w: number, h: number) => number;

/** Fill an ImageData with two colours (or a palette ramp) from a brightness function. */
export function paint(img: ImageData, shade: Shade, t: number, ramp: [number, number, number][]) {
  const { width: w, height: h, data } = img;
  const steps = ramp.length - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.max(0, Math.min(1, shade(x, y, t, w, h))) * steps;
    const lo = Math.floor(v);
    const c = ramp[Math.min(steps, lo + (v - lo > threshold(x, y) ? 1 : 0))];
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
}

export const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * A canvas that redraws a dithered effect. `px` is how many screen pixels each dither cell takes.
 * Animated effects redraw at `fps` (12 by default, which also keeps the stepped, hand-drawn feel).
 */
export const Dither = memo(function Dither({ shade, ramp, cols, rows, animate = false, fps = 12, className, style }: {
  shade: Shade; ramp: string[]; cols: number; rows: number; animate?: boolean; fps?: number; className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shadeRef = useRef(shade);
  shadeRef.current = shade;
  const rampKey = ramp.join();
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cols, rows);
    const pal = ramp.map(hex);
    let raf = 0, last = 0;
    const draw = (ms: number) => {
      if (ms - last >= 1000 / fps) {
        last = ms;
        paint(img, shadeRef.current, ms / 1000, pal);
        g.putImageData(img, 0, 0);
      }
      if (animate) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cols, rows, rampKey, animate, fps]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={cols} height={rows} className={`dither ${className ?? ''}`} style={style} />;
});

// A few ready-made effects.
export const washes = {
  /** A soft diagonal gradient that slowly breathes. */
  wash: (angle = 0.35): Shade => (x, y, t, w, h) => (x / w) * (1 - angle) + (y / h) * angle + 0.08 * Math.sin(t * 0.8 + x * 0.05),
  /** Light falling from the top, like a lamp over a dial. */
  glow: (): Shade => (x, y, _t, w, h) => 1 - Math.hypot((x - w / 2) / w, y / h * 0.9) * 1.4,
  /** Vertical bars that fill to a level, for meters. */
  fill: (level: number): Shade => (x, _y, _t, w) => (x / w < level ? 0.85 : 0.08),
};
