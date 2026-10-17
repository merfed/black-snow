import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';

import type { WeatherId } from '../game/systems';

interface Flake { x: number; y: number; r: number; v: number; drift: number }

// How each weather moves the snow: how many flakes show, how fast they fall, sideways wind (px/s).
const WX: Record<WeatherId, { density: number; speed: number; wind: number; streak: boolean }> = {
  calm: { density: 0.45, speed: 0.35, wind: 0, streak: false },
  ashfall: { density: 1, speed: 1.5, wind: 10, streak: false },
  wind: { density: 0.7, speed: 1.2, wind: 260, streak: true },
  fog: { density: 0.4, speed: 0.6, wind: 6, streak: false },
  thunder: { density: 0.55, speed: 1, wind: 30, streak: false },
};

// Background canvas: grey flakes drift down, shaped by the weather; during the siren they turn to rust and rise.
export function Snowfall() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, frame = 0;
    let flakes: Flake[] = [];
    const cur = { density: 0.5, speed: 1, wind: 0 };

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const count = Math.round((w * h) / (reduce ? 20000 : 4000));
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8, v: 12 + Math.random() * 30, drift: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { siren, weather } = useGame.getState().game;
      // Ease toward the target weather so changes roll in instead of snapping.
      const t = WX[weather.id];
      const k = Math.min(1, dt * 0.6);
      cur.density += (t.density - cur.density) * k;
      cur.speed += (t.speed - cur.speed) * k;
      cur.wind += (t.wind - cur.wind) * k;
      ctx.clearRect(0, 0, w, h);
      const color = siren ? 'rgba(170, 70, 40, 0.55)' : weather.id === 'ashfall' ? 'rgba(120, 120, 130, 0.5)' : 'rgba(150, 150, 160, 0.35)';
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      const shown = Math.floor(flakes.length * cur.density);
      const slow = reduce ? 0.3 : 1;
      for (let n = 0; n < shown; n++) {
        const f = flakes[n];
        f.drift += dt * 0.8;
        const vy = (siren ? -0.6 : cur.speed) * f.v * slow;
        const vx = (siren ? 0 : cur.wind * (0.6 + f.r / 3)) * slow + Math.sin(f.drift) * 8;
        f.y += vy * dt;
        f.x += vx * dt;
        if (f.y > h + 4) f.y = -4;
        if (f.y < -4) f.y = h + 4;
        if (f.x > w + 20) f.x = -20;
        if (f.x < -20) f.x = w + 20;
        if (t.streak && !siren && !reduce) {
          ctx.lineWidth = f.r;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - vx * 0.06, f.y - vy * 0.06);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="snowfall" aria-hidden="true" />;
}
