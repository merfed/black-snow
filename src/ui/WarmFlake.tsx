import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { FloaterLayer, useFloaters } from './Floaters';
import { Sprite } from './Sprite';
import { RARITIES } from '../game/systems';
import { FLAKE, RARE_FLAKES } from './sprites';

const BURSTS = [
  ['#ffb46b', '#ffd36b', '#ff6b3b', '#ffffff'],
  ['#a6e4ff', '#ffffff', '#6fc4ff', '#dff6ff'],
  ['#5dff9a', '#b8ff3b', '#2fc27a', '#ffffff'],
  ['#c46bff', '#ff6bd0', '#6b8cff', '#ffffff'],
  ['#ffd23b', '#000000', '#ff8a3d', '#fff2c2'],
];
// Colours for each rarity's flake: body, markings, eyes.
const INKS = [
  { color: 'var(--warm)' },
  { color: '#dff6ff', '--accent': '#6fc4ff', '--warm': '#ffffff' },
  { color: '#2fc27a', '--accent': '#b8ff3b', '--warm': '#fff2c2' },
  { color: '#c46bff', '--accent': '#ff6bd0', '--warm': '#ffffff' },
  { color: '#050505', '--accent': '#ffd23b', '--warm': '#ff3b1f' },
] as CSSProperties[];

/**
 * The glowing flake that drifts across the screen now and then. Catch it for a burst of ash.
 * Missed, it goes out: it greys, cracks and falls apart into ordinary ash.
 */
export function WarmFlake() {
  const flake = useGame(st => st.game.warmFlake);
  useGame(st => st.rev);
  const catchIt = useGame(st => st.catchWarmFlake);
  const { items, spawn, burst } = useFloaters();
  const rarity = flake.rarity ?? 0;
  const caught = useRef(false);
  const last = useRef({ x: flake.x, y: flake.y, active: flake.active });
  const [gone, setGone] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    const was = last.current;
    if (was.active && !flake.active && !caught.current) {
      const id = Date.now();
      setGone(g => [...g, { id, x: was.x, y: was.y }]);
      window.setTimeout(() => setGone(g => g.filter(v => v.id !== id)), 1800);
    }
    if (flake.active && !was.active) caught.current = false;
    last.current = { x: flake.x, y: flake.y, active: flake.active };
  }, [flake.active, flake.x, flake.y]);

  const onClick = (e: MouseEvent) => {
    caught.current = true;
    const got = catchIt();
    if (got.gt(0)) {
      spawn(e.clientX, e.clientY - 16, `+${fmt(got)}`, true);
      burst(e.clientX, e.clientY, 16 + rarity * 14, BURSTS[rarity]);
    }
  };

  return (
    <>
      {flake.active && (
        <button
          className={`warm-flake rarity-${rarity} ${flake.ttl < 2 ? 'fading' : ''}`}
          style={{ left: `${flake.x * 100}%`, top: `${flake.y * 100}%`, '--rc': RARITIES[rarity].color } as CSSProperties}
          onClick={onClick}
          aria-label={`Catch the ${RARITIES[rarity].name.toLowerCase()} flake`}
        >
          {rarity > 0 && <span className="rare-halo" aria-hidden="true" />}
          {rarity > 0 && <span className="rare-name" aria-hidden="true">{RARITIES[rarity].name}</span>}
          <span className="flake-body" style={INKS[rarity]}><Sprite rows={RARE_FLAKES[rarity]} px={rarity > 2 ? 4 : 3} /></span>
          {rarity >= 2 && Array.from({ length: 6 }, (_, k) => <i key={k} className="orbit" style={{ '--k': k } as CSSProperties} />)}
        </button>
      )}
      {gone.map(g => (
        <div key={g.id} className="flake-out" style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }} aria-hidden="true">
          <span className="flake-out-core"><Sprite rows={FLAKE} px={3} /></span>
          {Array.from({ length: 10 }, (_, k) => (
            <span key={k} className="flake-out-bit"
              style={{ '--dx': `${(k - 4.5) * 7 + (k % 3) * 3}px`, '--dy': `${40 + (k * 13) % 50}px`, '--d': `${(k % 4) * 0.08}s` } as CSSProperties} />
          ))}
        </div>
      ))}
      <FloaterLayer items={items} fixed />
    </>
  );
}
