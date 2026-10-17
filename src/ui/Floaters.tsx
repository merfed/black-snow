import { useCallback, useRef, useState, type CSSProperties } from 'react';

export interface Floater {
  id: number; x: number; y: number; text?: string; big?: boolean; color?: string;
  // Sparks fly out to (dx, dy) instead of rising.
  dx?: number; dy?: number;
}

/** Signal colours for Listen: each press burns a different one, like a bad tube. */
export const SIGNAL = ['#ff3b6b', '#ffb43b', '#3bf0ff', '#b8ff3b', '#c46bff', '#ff6b3b'];

/** Little "+12" numbers that rise and fade from wherever the player clicked, plus spark bursts. */
export function useFloaters() {
  const [items, setItems] = useState<Floater[]>([]);
  const seq = useRef(0);
  const add = useCallback((fresh: Floater[], life: number) => {
    const ids = new Set(fresh.map(f => f.id));
    setItems(xs => [...xs.slice(-60), ...fresh]);
    window.setTimeout(() => setItems(xs => xs.filter(f => !ids.has(f.id))), life);
  }, []);
  const spawn = useCallback((x: number, y: number, text: string, big = false, color?: string) => {
    const jitter = (Math.random() - 0.5) * 36;
    add([{ id: seq.current++, x: x + jitter, y, text, big, color }], 1100);
  }, [add]);
  const burst = useCallback((x: number, y: number, n: number, colors: string[]) => {
    const fresh: Floater[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const r = 40 + Math.random() * 50;
      fresh.push({ id: seq.current++, x, y, dx: Math.cos(a) * r, dy: Math.sin(a) * r, color: colors[k % colors.length] });
    }
    add(fresh, 700);
  }, [add]);
  return { items, spawn, burst };
}

export function FloaterLayer({ items, fixed = false }: { items: Floater[]; fixed?: boolean }) {
  return (
    <div className={`floaters ${fixed ? 'fixed' : ''}`} aria-hidden="true">
      {items.map(f => {
        const style = { left: f.x, top: f.y, '--c': f.color, '--dx': `${f.dx}px`, '--dy': `${f.dy}px` } as CSSProperties;
        return f.dx !== undefined
          ? <span key={f.id} className="spark" style={style} />
          : <span key={f.id} className={`floater ${f.big ? 'big' : ''} ${f.color ? 'tinted' : ''}`} style={style}>{f.text}</span>;
      })}
    </div>
  );
}
