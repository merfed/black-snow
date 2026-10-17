import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  brew, brewCost, colorCost, COLORS, hasIngredient, hintCost, hintTarget, ingredientHex, ingredientName, maxSlots, mixKey,
  nextColor, QUICK_MAX, quickCost, RECIPES, recipeFor, researchColor, researchHint, researchQuick, researchSlot, SLOT3_COST,
  SPIRAL, wind, windCost, windTime, type Recipe,
} from '../game/alchemy';
import { pigmentRate } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { ZONE_COLORS } from './colors';
import { hex, threshold } from './dither';

type RGB = [number, number, number];
const mixRgb = (cs: RGB[]): RGB => cs.length ? [0, 1, 2].map(k => cs.reduce((n, c) => n + c[k], 0) / cs.length) as RGB : [70, 40, 60];
const BG: RGB = [8, 6, 10];

/**
 * The spiral itself: arms that wind inward forever, each arm one of the colours in it. While it winds a
 * mix the arms speed up and bleed into one colour; when it finishes it holds the result's colour.
 */
export function SpiralCanvas({ colors, progress, result, size = 96, className }: { colors: string[]; progress: number; result?: string | null; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ colors, progress, result });
  live.current = { colors, progress, result };
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    const d = img.data;
    let raf = 0, last = 0, spin = 0;
    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw);
      if (ms - last < 1000 / 15) return;
      const dt = last ? (ms - last) / 1000 : 0;
      last = ms;
      const { colors: cs, progress: p, result: res } = live.current;
      const pal = (res ? [res] : cs.length ? cs : ['#3a2436', '#5a3448']).map(hex);
      const mixed = mixRgb(pal);
      const winding = p > 0 && p < 1;
      spin += dt * (winding ? 1.2 + 4 * p : 0.25);
      const arms = Math.max(2, pal.length) + (winding ? 0 : 1);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
        const r = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        let col = BG, on = 0;
        if (r < 0.98) {
          const a = Math.atan2(dy, dx) / (Math.PI * 2);
          const band = a * arms + Math.log(r + 0.03) * 2.4 + spin;
          const f = band - Math.floor(band);
          const arm = ((Math.floor(band) % pal.length) + pal.length) % pal.length;
          const base = pal[arm];
          const k = winding ? p * p : 0;
          col = [0, 1, 2].map(n => base[n] + (mixed[n] - base[n]) * k) as RGB;
          on = (1 - Math.abs(f - 0.5) * 2) * 1.25 * (1 - Math.pow(r, 4)) + (r < 0.12 ? 0.6 : 0);
        }
        const lit = on > threshold(x, y);
        const out = lit ? col : BG;
        d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = r < 0.98 || lit ? 255 : 0;
      }
      g.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} width={size} height={size} className={`spiral-canvas ${className ?? ''}`} />;
}

const TARGET_NAMES: Record<string, string> = {
  ash: 'all ash', listen: 'Listen', echoes: 'echoes', rust: 'rust', embers: 'embers', cycles: 'cycles', pigment: 'pigment',
  comfort: 'comfort', luck: 'rare flake odds', eggs: 'egg warming', zone0: 'Shallow Bores', zone1: 'Conduits',
  zone2: 'Pattern Buffers', zone3: 'Rampant Wells', zone4: 'Vacuum Locks', zones: 'every zone',
};
export const effectText = (r: Recipe, lvl: number) => `+${Math.round(r.per * 100)}% ${TARGET_NAMES[r.target]} a level${lvl ? ` (now x${(1 + r.per * lvl).toFixed(2)})` : ''}`;

function useWinding() {
  const game = useGame(st => st.game);
  const w = game.alchemy.winding;
  return { w, progress: w ? 1 - w.left / w.total : 0 };
}

/** The Spiral's box on the board: the spiral turning, pigment, and a way into the room. */
export function SpiralPreview() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  const { w, progress } = useWinding();
  const a = game.alchemy;
  const found = Object.keys(a.found).length;
  const result = a.last && a.last !== 'mud' ? RECIPES.find(r => r.id === a.last)?.hex : null;
  return (
    <div className="spiral-box" data-nodrag>
      <div className="wiring-head">
        <span className="sub-head">The spiral</span>
        <span className="wiring-cycles"><b>{fmt(a.pigment)}</b> pigment · +{fmt(pigmentRate(game))}/s</span>
      </div>
      <button className="spiral-window" onClick={() => setOpen(true)} aria-label="Open the spiral">
        <SpiralCanvas colors={w ? w.mix.map(ingredientHex) : []} progress={progress} result={w ? null : result} size={64} />
      </button>
      <p className="dim small-note">{w ? `Winding ${w.mix.map(ingredientName).join(' and ')}…` : `${found} of ${RECIPES.length} tinctures found. Drop colours in and wind them together.`}</p>
      <button className="max-all" onClick={() => setOpen(true)}>Open the spiral</button>
      {open && <SpiralRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The whole room: colours on the left, the spiral in the middle, the grimoire on the right. */
function SpiralRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [mix, setMix] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const { w, progress } = useWinding();
  const a = game.alchemy;
  const slots = maxSlots(game);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const add = (id: string) => setMix(m => (m.includes(id) || m.length >= slots || !hasIngredient(game, id) ? m : [...m, id]));
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) add(id); };
  const cost = windCost(mix);
  const known = mix.length >= 2 ? recipeFor(mix) : undefined;
  const isMud = mix.length >= 2 && a.tried.includes(mixKey(mix));
  const doWind = () => run(s => { if (wind(s, mix)) setMix([]); });
  const lastRecipe = a.last && a.last !== 'mud' ? RECIPES.find(r => r.id === a.last) : null;
  const hint = hintTarget(game);
  const next = nextColor(game);
  const chip = (id: string) => (
    <button key={id} className={`pigment-chip ${mix.includes(id) ? 'in' : ''}`} draggable onDragStart={e => e.dataTransfer.setData('text/plain', id)}
      onClick={() => add(id)} style={{ '--c': ingredientHex(id) } as CSSProperties} title={/^c\d+$/.test(id) ? COLORS[Number(id.slice(1))].desc : 'A tincture. Used as an ingredient, it is not used up.'}>
      <span className="swatch" /><span>{ingredientName(id)}</span>
    </button>
  );

  return createPortal(
    <div className="dialog-backdrop wiring-backdrop" data-nodrag onClick={onClose}>
      <div className="spiral-room panel framed" role="dialog" aria-label="The Barker Spiral" onClick={e => e.stopPropagation()} style={{ '--hue': ZONE_COLORS[SPIRAL] } as CSSProperties}>
        <header className="we-head">
          <h2>The spiral <span className="h2-note">it turns left forever and arrives above itself</span></h2>
          <span className="we-cycles"><b>{fmt(a.pigment)}</b> pigment <small>+{fmt(pigmentRate(game))}/s</small></span>
          <div className="we-actions"><button className="secondary" onClick={onClose}>Close</button></div>
        </header>

        <div className="spiral-cols">
          <section className="spiral-side">
            <h3 className="sub-head">Colours</h3>
            <div className="pigment-grid">{a.colors.slice().sort((x, y) => x - y).map(n => chip(`c${n}`))}</div>
            {Object.keys(a.found).length > 0 && <>
              <h3 className="sub-head">Tinctures</h3>
              <div className="pigment-grid">{RECIPES.filter(r => a.found[r.id]).map(r => chip(r.id))}</div>
            </>}
            <h3 className="sub-head">Research</h3>
            <div className="research">
              {next !== null && (
                <button disabled={a.pigment < colorCost(game)} onClick={() => run(researchColor)}>
                  <span>Find a colour <small>{a.colors.length}/16</small></span><span className="cost">{fmt(colorCost(game))}</span>
                </button>
              )}
              {!a.slots3 && (
                <button disabled={a.pigment < SLOT3_COST} onClick={() => run(researchSlot)}>
                  <span>A third slot <small>for three-part recipes</small></span><span className="cost">{fmt(SLOT3_COST)}</span>
                </button>
              )}
              {hint && (
                <button disabled={a.pigment < hintCost(game)} onClick={() => run(researchHint)}>
                  <span>Read the stains <small>reveals one ingredient</small></span><span className="cost">{fmt(hintCost(game))}</span>
                </button>
              )}
              {a.quick < QUICK_MAX && (
                <button disabled={a.pigment < quickCost(game)} onClick={() => run(researchQuick)}>
                  <span>Oil the stair <small>wind in {windTime(game).toFixed(1)}s → {(windTime(game) * 0.7).toFixed(1)}s</small></span><span className="cost">{fmt(quickCost(game))}</span>
                </button>
              )}
            </div>
          </section>

          <section className="spiral-centre">
            <div className={`spiral-stage ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
              <SpiralCanvas colors={w ? w.mix.map(ingredientHex) : mix.map(ingredientHex)} progress={progress} result={!w && !mix.length && lastRecipe ? lastRecipe.hex : null} size={128} className="big" />
              {!w && !mix.length && a.last && (
                <div className={`spiral-result ${a.last === 'mud' ? 'mud' : ''}`}>
                  {lastRecipe ? <><b>{lastRecipe.name}</b><span>{effectText(lastRecipe, a.found[lastRecipe.id])}</span></> : <><b>Mud</b><span>Nothing came of it. The spiral will remember.</span></>}
                </div>
              )}
            </div>
            <div className="spiral-slots">
              {Array.from({ length: slots }, (_, k) => {
                const id = (w ? w.mix : mix)[k];
                return (
                  <button key={k} className={`spiral-slot ${id ? 'full' : ''}`} disabled={!!w || !id} onClick={() => setMix(m => m.filter((_, j) => j !== k))}
                    style={{ '--c': id ? ingredientHex(id) : 'transparent' } as CSSProperties} title={id ? 'Take it back out' : 'Drop a colour here'}>
                    {id ? ingredientName(id) : 'empty'}
                  </button>
                );
              })}
            </div>
            {w ? (
              <div className="wind-bar"><span style={{ width: `${progress * 100}%` }} /><b>Winding… {Math.ceil(w.left)}s</b></div>
            ) : (
              <button className="dig wind-button" disabled={mix.length < 2 || a.pigment < cost} onClick={doWind}>
                Wind it <span className="cost">{mix.length ? `${fmt(cost)} pigment` : '10 pigment a colour'}</span>
              </button>
            )}
            <p className="dim small-note">
              {known && a.found[known.id] ? `You know this one: ${known.name}. Brew it from the grimoire to level it.`
                : isMud ? 'You have wound this before. It made mud.'
                  : 'Drop two colours in (three, with the third slot) and wind them. Some mixes find a tincture; the rest make mud.'}
            </p>
          </section>

          <section className="spiral-side grimoire">
            <h3 className="sub-head">Grimoire <small>{Object.keys(a.found).length}/{RECIPES.length} · {a.tried.length} mud</small></h3>
            <ul>
              {RECIPES.map(r => {
                const lvl = a.found[r.id] ?? 0;
                const shown = a.hints[r.id] ?? 0;
                if (!lvl) return (
                  <li key={r.id} className="unknown">
                    <span className="swatch" style={{ '--c': '#2a2430' } as CSSProperties} />
                    <div><b>? ? ?</b><span>{r.mix.map((id, k) => (k < shown ? ingredientName(id) : '?')).join(' + ')}{r.mix.length === 3 ? ' · three parts' : ''}</span></div>
                  </li>
                );
                const bc = brewCost(game, r);
                return (
                  <li key={r.id}>
                    <span className="swatch" style={{ '--c': r.hex } as CSSProperties} />
                    <div><b>{r.name} <small>lv {lvl}</small></b><span>{effectText(r, lvl)}</span><i>{r.mix.map(ingredientName).join(' + ')}</i></div>
                    <button className="secondary" disabled={a.pigment < bc} onClick={() => run(s => brew(s, r.id))}>Brew <span className="cost">{fmt(bc)}</span></button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
