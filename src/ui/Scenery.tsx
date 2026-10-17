import { memo } from 'react';
import { rngFrom } from '../game/genome';

const W = 86; // pixels across
const H = 70; // pixels tall
const GROUND = 62;

interface Building { x: number; w: number; h: number; roof: 'flat' | 'peak' | 'tank' | 'spire' }

// One fixed skyline, so the town is the same place every visit.
const rng = rngFrom(404);
const BUILDINGS: Building[] = [];
for (let x = 22; x < W - 2;) {
  const w = 5 + Math.floor(rng() * 7);
  const h = 12 + Math.floor(rng() * 26);
  const roof = (['flat', 'peak', 'tank', 'spire'] as const)[Math.floor(rng() * 4)];
  BUILDINGS.push({ x, w: Math.min(w, W - 2 - x), h, roof });
  x += w + (rng() < 0.3 ? 1 : 0);
}
const WINDOWS = BUILDINGS.flatMap((b, bi) => {
  const out: { x: number; y: number; d: number; s: number; rank: number }[] = [];
  for (let y = GROUND - b.h + 3; y < GROUND - 2; y += 3) {
    for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) {
      out.push({ x, y, d: rng() * 9, s: 3 + rng() * 9, rank: rng() + bi * 0.001 });
    }
  }
  return out;
});

/**
 * Lull, the dead town at the edge of the floor plan. More windows come on the deeper you dig,
 * some of them flicker, and the one streetlamp that still works hums over the road.
 */
export const Scenery = memo(function Scenery({ depth }: { depth: number }) {
  const lit = Math.min(0.05 + depth * 0.06, 0.7);
  return (
    <svg className="scenery" width={W * 6} height={H * 6} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true">
      {/* the town */}
      <g className="town">
        {BUILDINGS.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={GROUND - b.h} width={b.w} height={b.h} />
            {b.roof === 'peak' && <path d={`M${b.x} ${GROUND - b.h}h${b.w}l-${b.w / 2} -${Math.ceil(b.w / 2)}z`} shapeRendering="auto" />}
            {b.roof === 'tank' && <><rect x={b.x + 1} y={GROUND - b.h - 4} width={3} height={3} /><rect x={b.x + 1} y={GROUND - b.h - 1} width={1} height={1} /><rect x={b.x + 3} y={GROUND - b.h - 1} width={1} height={1} /></>}
            {b.roof === 'spire' && <rect x={b.x + Math.floor(b.w / 2)} y={GROUND - b.h - 7} width={1} height={7} />}
            {b.roof === 'spire' && <rect className="aircraft" x={b.x + Math.floor(b.w / 2)} y={GROUND - b.h - 8} width={1} height={1} />}
          </g>
        ))}
      </g>
      <g className="windows">
        {WINDOWS.filter(w => w.rank < lit).map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={1} height={1}
            className={i % 5 === 0 ? 'flicker' : ''} style={{ animationDelay: `${w.d}s`, animationDuration: `${w.s}s` }} />
        ))}
      </g>

      {/* telephone poles and the sagging wire between them */}
      <g className="poles">
        {[3, 33, 63].map(x => (
          <g key={x}>
            <rect x={x} y={GROUND - 30} width={1} height={30} />
            <rect x={x - 3} y={GROUND - 28} width={7} height={1} />
            <rect x={x - 2} y={GROUND - 25} width={5} height={1} />
          </g>
        ))}
      </g>
      <path className="wire" d={`M0 ${GROUND - 28} Q18 ${GROUND - 22} 33 ${GROUND - 28} Q48 ${GROUND - 22} 63 ${GROUND - 28} Q74 ${GROUND - 23} ${W} ${GROUND - 27}`} shapeRendering="auto" />
      <path className="wire" d={`M1 ${GROUND - 25} Q18 ${GROUND - 19} 35 ${GROUND - 25} Q50 ${GROUND - 19} 65 ${GROUND - 25} Q76 ${GROUND - 20} ${W} ${GROUND - 24}`} shapeRendering="auto" />
      <rect className="crow" x={44} y={GROUND - 24} width={2} height={1} />

      {/* the dead tree */}
      <g className="tree">
        <rect x={13} y={GROUND - 20} width={2} height={20} />
        <rect x={10} y={GROUND - 16} width={3} height={1} /><rect x={9} y={GROUND - 19} width={1} height={3} />
        <rect x={15} y={GROUND - 13} width={4} height={1} /><rect x={18} y={GROUND - 17} width={1} height={4} />
        <rect x={12} y={GROUND - 23} width={1} height={3} /><rect x={15} y={GROUND - 24} width={1} height={4} />
        <rect x={16} y={GROUND - 25} width={2} height={1} />
      </g>

      {/* the streetlamp that still works */}
      <path className="lamp-cone" d={`M50 ${GROUND - 17} L44 ${GROUND} H57 Z`} shapeRendering="auto" />
      <g className="lamp">
        <rect x={52} y={GROUND - 18} width={1} height={18} />
        <rect x={49} y={GROUND - 18} width={4} height={1} />
        <rect className="lamp-bulb" x={49} y={GROUND - 17} width={2} height={1} />
      </g>

      {/* the road */}
      <rect className="ground" x={0} y={GROUND} width={W} height={H - GROUND} />
      {[4, 16, 28, 40, 52, 64, 76].map(x => <rect key={x} className="road-line" x={x} y={GROUND + 4} width={5} height={1} />)}
    </svg>
  );
});
