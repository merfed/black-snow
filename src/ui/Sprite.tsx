import { memo } from 'react';

/*
 * Tiny pixel-art renderer. A sprite is a list of equal-length rows:
 *   '.' empty   '#' ink (currentColor)   '+' signal (accent red)   ':' shade (dim)   '*' warm
 * Each colour becomes one SVG path of row runs, drawn with crisp edges so it stays blocky at any zoom.
 */
const INKS: Record<string, string> = { '#': 'currentColor', '+': 'var(--accent)', ':': 'var(--dim)', '*': 'var(--warm)' };

function paths(rows: string[]) {
  const out: Record<string, string> = {};
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x;
      while (end < row.length && row[end] === c) end++;
      if (INKS[c]) out[c] = (out[c] ?? '') + `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return out;
}

export const Sprite = memo(function Sprite({ rows, px = 3, className = '', title }: { rows: string[]; px?: number; className?: string; title?: string }) {
  const w = rows[0].length, h = rows.length;
  const p = paths(rows);
  return (
    <svg className={`sprite ${className}`} width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {Object.entries(p).map(([c, d]) => <path key={c} className={`ink-${c === '#' ? 'ink' : c === '+' ? 'signal' : c === ':' ? 'shade' : 'warm'}`} d={d} fill={INKS[c]} />)}
    </svg>
  );
});
