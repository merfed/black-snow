import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { hex, threshold } from './dither';
import { hash, type Scene } from './scenes';

const INK_BG = '#05060b';

const mix = (a: string, b: string, k: number) => {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

/**
 * Crush a scene's two greyscale layers into inks: background, a dim ink, the ink and a pale highlight, ordered-dithered,
 * with the accent ink wherever the accent mask beats the threshold. `veil` buries it in static.
 */
function render(scene: Scene, g: CanvasRenderingContext2D, a: CanvasRenderingContext2D, img: ImageData, t: number,
  pal: [number, number, number][], acc: [number, number, number], veil: number, frame: number) {
  const { w, h } = scene;
  for (const c of [g, a]) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
  }
  scene.draw(g, a, t);
  const L = g.getImageData(0, 0, w, h).data, A = a.getImageData(0, 0, w, h).data, d = img.data;
  const steps = pal.length - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, th = threshold(x, y);
    let v = L[i] / 255;
    let c: [number, number, number];
    if (veil) v = v * (1 - veil) + veil * 0.7 * hash(x >> 1, y, frame) * (0.6 + 0.4 * Math.sin(y * 0.4 + frame));
    if (!veil && A[i] / 255 > th) c = acc;
    else {
      const s = Math.min(1, Math.max(0, v)) * steps, lo = Math.floor(s);
      c = pal[Math.min(steps, lo + (s - lo > th ? 1 : 0))];
    }
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
}

/** A dithered plate. Animates at a low frame rate while on screen; holds still for reduced motion. */
export const Plate = memo(function Plate({ scene, ink, accent, veil = 0, fps = 8 }: {
  scene: Scene; ink: string; accent: string; veil?: number; fps?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const out = c.getContext('2d')!;
    const off = () => {
      const o = document.createElement('canvas');
      o.width = scene.w;
      o.height = scene.h;
      return o.getContext('2d', { willReadFrequently: true })!;
    };
    const g = off(), a = off();
    const img = out.createImageData(scene.w, scene.h);
    const pal = [mix(ink, INK_BG, 0.9), mix(ink, INK_BG, 0.55), ink, mix(ink, '#ffffff', 0.6)].map(hex);
    const acc = hex(accent);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seed = Math.random() * 100;
    let raf = 0, last = -1e9, frame = 0, visible = true;
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) {
        last = ms;
        render(scene, g, a, img, seed + ms / 1000, pal, acc, veil, frame++);
        out.putImageData(img, 0, 0);
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
  }, [scene, ink, accent, veil, fps]);
  return <canvas ref={ref} width={scene.w} height={scene.h} className="plate" style={{ aspectRatio: `${scene.w} / ${scene.h}` }} />;
});

/** A plate in a double pixel frame with knotted corners, and a caption under it. */
export function Artwork({ scene, ink, accent, caption, veil, className, style }: {
  scene: Scene; ink: string; accent: string; caption?: string; veil?: number; className?: string; style?: CSSProperties;
}) {
  return (
    <figure className={`artwork ${className ?? ''}`} style={{ '--ink': ink, '--plate-bg': mix(ink, INK_BG, 0.9), ...style } as CSSProperties}>
      <div className="artwork-frame knots"><Plate scene={scene} ink={ink} accent={accent} veil={veil} /></div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
