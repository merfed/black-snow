import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  brew, brewCost, colorCost, COLORS, hasIngredient, hintCost, hintTarget, ingredientHex, ingredientName, maxSlots, mixKey,
  nextColor, QUICK_MAX, quickCost, RECIPES, recipeFor, researchColor, researchHint, researchQuick, researchSlot, SLOT3_COST,
  SPIRAL, wind, windCost, windTime, type Recipe,
} from '../game/alchemy';
import { pigmentRate } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { ChallengeRoom, RoomStatus, type RoomBuy } from './challenges/ChallengeSlot';
import { hex, threshold } from './dither';
import './spiral.css';

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

/** The palette as a rosary round the spiral: sixteen beads, lit for the colours you hold, ringed when they are in the mix.
 *  While it winds, an arc fills round the inside of the beads. */
function Rosary({ owned, inMix, progress, winding, onBead }: { owned: number[]; inMix: string[]; progress: number; winding: boolean; onBead: (id: string) => void }) {
  const R = 91, T = 80, C = 2 * Math.PI * T;
  return (
    <svg className={`sp-rosary${winding ? ' winding' : ''}`} viewBox="0 0 200 200" aria-hidden={false} role="group" aria-label="The palette, as beads">
      <circle cx="100" cy="100" r={R} className="sp-ros-cord" />
      <circle cx="100" cy="100" r={T} className="sp-ros-track" />
      {winding && <circle cx="100" cy="100" r={T} className="sp-ros-arc" strokeDasharray={`${C * progress} ${C}`} transform="rotate(-90 100 100)" />}
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2, r1 = T - 3, r2 = T - (i % 4 === 0 ? 8 : 5);
        return <line key={i} x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * r2} y2={100 - Math.cos(a) * r2} className="sp-ros-tick" />;
      })}
      <g className="sp-ros-beads">
        {COLORS.map((c, n) => {
          const a = (n / COLORS.length) * Math.PI * 2, x = 100 + Math.sin(a) * R, y = 100 - Math.cos(a) * R;
          const have = owned.includes(n), on = inMix.includes(`c${n}`);
          return (
            <g key={n} className={`sp-bead${have ? ' have' : ''}${on ? ' on' : ''}`} onClick={have ? () => onBead(`c${n}`) : undefined}
              style={{ '--c': c.hex } as CSSProperties}>
              <title>{have ? `${c.name}: ${c.desc}` : 'A colour not found yet'}</title>
              <circle cx={x} cy={y} r={on ? 7.5 : 5.5} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** The whole room: the palette and research on the left, the spiral on its rosary in the middle, the grimoire on the right. */
function SpiralRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [mix, setMix] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
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
  const found = Object.keys(a.found).length;
  const cc = colorCost(game), hc = hintCost(game), qc = quickCost(game);
  const shown = w ? w.mix : mix;

  // The room's one repeat buy goes in the status bar: a new colour while there are any, then reading the stains.
  const main: 'color' | 'hint' | null = next !== null ? 'color' : hint ? 'hint' : null;
  const buy: RoomBuy | undefined = main === 'color'
    ? { label: 'Find a colour', cost: cc, unit: 'pigment', afford: a.pigment >= cc, onClick: () => run(researchColor), title: `Research the next colour (${a.colors.length} of 16 found)` }
    : main === 'hint'
      ? { label: 'Read the stains', cost: hc, unit: 'pigment', afford: a.pigment >= hc, onClick: () => run(researchHint), title: 'Reveals one ingredient of a tincture you could make' }
      : undefined;
  const status = (
    <RoomStatus
      stats={[
        { label: 'Pigment', value: fmt(a.pigment), rate: `+${fmt(pigmentRate(game))}/s`, title: 'The Spirals make pigment' },
        { label: 'Colours', value: `${a.colors.length}/16`, rate: next === null ? 'all found' : undefined },
        { label: 'Tinctures', value: `${found}/${RECIPES.length}`, rate: `${a.tried.length} mud`, title: 'Tinctures found, and mixes that made mud' },
        { label: 'Wind', value: `${windTime(game).toFixed(1)}s`, rate: `${slots} slots`, title: 'How long a winding takes, and how many ingredients it holds' },
      ]}
      buy={buy}
    />
  );

  // The grimoire card: the picked tincture, else the last one found, else the first known.
  const selId = pick ?? lastRecipe?.id ?? RECIPES.find(r => a.found[r.id])?.id ?? RECIPES[0].id;
  const sel = RECIPES.find(r => r.id === selId)!;
  const selLvl = a.found[sel.id] ?? 0;
  const selShown = a.hints[sel.id] ?? 0;
  const selCost = brewCost(game, sel);

  const research = [
    main !== 'color' && next !== null && { key: 'color', name: 'Find a colour', note: `${a.colors.length}/16`, cost: cc, fn: researchColor, tip: 'Research the next colour' },
    !a.slots3 && { key: 'slot', name: 'A third slot', note: 'three-part recipes', cost: SLOT3_COST, fn: researchSlot, tip: 'A third slot in the spiral, for three-part recipes' },
    main !== 'hint' && hint && { key: 'hint', name: 'Read the stains', note: 'one ingredient', cost: hc, fn: researchHint, tip: 'Reveals one ingredient of a tincture you could make' },
    a.quick < QUICK_MAX && { key: 'quick', name: 'Oil the stair', note: `${windTime(game).toFixed(1)}s → ${(windTime(game) * 0.7).toFixed(1)}s`, cost: qc, fn: researchQuick, tip: `Winding goes faster (${a.quick}/${QUICK_MAX})` },
  ].filter(Boolean) as { key: string; name: string; note: string; cost: number; fn: (s: typeof game) => boolean; tip: string }[];

  const note = known && a.found[known.id] ? `You know this one: ${known.name}. Brew it from the grimoire.`
    : isMud ? 'You have wound this before. It made mud.'
      : w ? `Winding ${w.mix.map(ingredientName).join(' and ')}…`
        : 'Drop two colours in and wind them.';

  return (
    <ChallengeRoom zone={SPIRAL} title="The Barker Spiral" note="it turns left forever and arrives above itself" onClose={onClose} className="sp-room" status={status}>
      <div className="sp-grid">
        {/* ---- the palette and research ---- */}
        <section className="sp-col" aria-label="Colours">
          <div className="sp-head"><span className="sp-cap">"THE PALETTE"</span><span className="sp-head-note">click or drag into the spiral</span></div>
          <div className="sp-wells">
            {COLORS.map((c, n) => {
              const id = `c${n}`, have = a.colors.includes(n), on = shown.includes(id);
              if (!have) return (
                <div key={n} className={`sp-well sealed${n === next ? ' next' : ''}`} title={n === next ? 'The next colour research finds' : 'Not found yet'}>
                  <span className="sp-jar" /><span className="sp-well-name">{n === next ? 'next' : 'sealed'}</span>
                </div>
              );
              return (
                <button key={n} className={`sp-well${on ? ' in' : ''}`} draggable onDragStart={e => e.dataTransfer.setData('text/plain', id)}
                  onClick={() => add(id)} disabled={!!w} style={{ '--c': c.hex } as CSSProperties} title={`${c.name}: ${c.desc}`}>
                  <span className="sp-jar" /><span className="sp-well-name">{c.name}</span>
                </button>
              );
            })}
          </div>

          <div className="sp-head"><span className="sp-cap">"RESEARCH"</span><span className="sp-head-note">paid in pigment</span></div>
          {research.length ? (
            <div className="sp-research">
              {research.map(r => (
                <button key={r.key} className="sp-res" disabled={a.pigment < r.cost} onClick={() => run(r.fn)} title={r.tip}>
                  <span className="sp-res-name">{r.name}</span>
                  <span className="sp-res-note">{r.note}</span>
                  <span className="sp-res-cost">{fmt(r.cost)}</span>
                </button>
              ))}
            </div>
          ) : <p className="sp-quiet">“Nothing left to learn here but the recipes.”</p>}
        </section>

        {/* ---- the spiral on its rosary ---- */}
        <section className="sp-col sp-centre" aria-label="The spiral">
          <div className="sp-head"><span className="sp-cap">"THE SPIRAL"</span><span className={`sp-head-note${w ? ' hot' : ''}`}>{w ? `winding… ${Math.ceil(w.left)}s` : `${shown.length} of ${slots} slots`}</span></div>
          <div className={`sp-stage${over ? ' over' : ''}${w ? ' winding' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
            <Rosary owned={a.colors} inMix={shown} progress={progress} winding={!!w} onBead={id => !w && add(id)} />
            <SpiralCanvas colors={shown.map(ingredientHex)} progress={progress} result={!w && !mix.length && lastRecipe ? lastRecipe.hex : null} size={128} className="sp-canvas" />
            {!w && !mix.length && a.last && (
              <div className={`sp-result${a.last === 'mud' ? ' mud' : ''}`}>
                {lastRecipe ? <><b>{lastRecipe.name}</b><span>{effectText(lastRecipe, a.found[lastRecipe.id])}</span></> : <><b>Mud</b><span>Nothing came of it. The spiral will remember.</span></>}
              </div>
            )}
          </div>
          <div className="sp-slots">
            {Array.from({ length: slots }, (_, k) => {
              const id = shown[k];
              return (
                <button key={k} className={`sp-slot${id ? ' full' : ''}`} disabled={!!w || !id} onClick={() => setMix(m => m.filter((_, j) => j !== k))}
                  style={{ '--c': id ? ingredientHex(id) : 'transparent' } as CSSProperties} title={id ? 'Take it back out' : 'Drop a colour here'}>
                  <span className="sp-slot-vial" /><span className="sp-slot-name">{id ? ingredientName(id) : 'empty'}</span>
                </button>
              );
            })}
          </div>
          {w ? (
            <div className="sp-windbar"><span style={{ width: `${progress * 100}%` }} /><b>Winding… {Math.ceil(w.left)}s</b></div>
          ) : (
            <button className="sp-wind" disabled={mix.length < 2 || a.pigment < cost} onClick={doWind}>
              Wind it <span className="sp-wind-cost">{mix.length ? `${fmt(cost)} pigment` : '10 pigment a colour'}</span>
            </button>
          )}
          <p className={`sp-note${known || isMud ? ' on' : ''}`} title="Drop two colours in (three, with the third slot) and wind them. Some mixes find a tincture; the rest make mud. A tincture used as an ingredient is not used up.">{note}</p>
        </section>

        {/* ---- the grimoire ---- */}
        <section className="sp-col" aria-label="The grimoire">
          <div className="sp-head"><span className="sp-cap">"THE GRIMOIRE"</span><span className="sp-head-note">{found}/{RECIPES.length} found · {a.tried.length} mud</span></div>
          <div className="sp-book">
            {RECIPES.map(r => {
              const lvl = a.found[r.id] ?? 0;
              const ready = lvl > 0 && a.pigment >= brewCost(game, r);
              const hs = a.hints[r.id] ?? 0;
              return (
                <button key={r.id} className={`sp-tile${lvl ? ' known' : ''}${ready ? ' ready' : ''}${r.id === selId ? ' sel' : ''}${shown.includes(r.id) ? ' in' : ''}${hint?.id === r.id ? ' stained' : ''}`}
                  style={{ '--c': lvl ? r.hex : '#2a2430' } as CSSProperties} onClick={() => setPick(r.id)}
                  draggable={lvl > 0} onDragStart={lvl ? e => e.dataTransfer.setData('text/plain', r.id) : undefined}
                  title={lvl ? `${r.name}, lv ${lvl}. ${effectText(r, lvl)}` : `Not found yet${hs ? `: ${r.mix.map((id, k) => (k < hs ? ingredientName(id) : '?')).join(' + ')}` : ''}`}>
                  <span className="sp-flask">{lvl ? null : <i>?</i>}</span>
                  {lvl > 0 && <span className="sp-tile-lv">{lvl}</span>}
                  {r.mix.length === 3 && <span className="sp-tile-three" />}
                  {!lvl && hs > 0 && <span className="sp-tile-pips">{r.mix.map((_, k) => <i key={k} className={k < hs ? 'on' : ''} />)}</span>}
                </button>
              );
            })}
          </div>
          <div className={`sp-card${selLvl ? '' : ' unknown'}`} style={{ '--c': selLvl ? sel.hex : '#2a2430' } as CSSProperties}>
            {selLvl ? <>
              <div className="sp-card-top"><b className="sp-card-name">{sel.name}</b><span className="sp-card-lv">lv {selLvl}</span></div>
              <p className="sp-card-effect">{effectText(sel, selLvl)}</p>
              <p className="sp-card-desc">“{sel.desc}”</p>
              <div className="sp-card-mix">{sel.mix.map(id => <span key={id} className="sp-ing" style={{ '--c': ingredientHex(id) } as CSSProperties}><i />{ingredientName(id)}</span>)}</div>
              <div className="sp-card-btns">
                <button className="sp-btn" disabled={!!w || shown.includes(sel.id) || shown.length >= slots} onClick={() => add(sel.id)} title="Put this tincture in the spiral as an ingredient. It is not used up.">Into the spiral</button>
                <button className="sp-btn brew" disabled={a.pigment < selCost} onClick={() => run(s => brew(s, sel.id))} title="Brew it again to raise its level">Brew <span className="sp-btn-cost">{fmt(selCost)}</span></button>
              </div>
            </> : <>
              <div className="sp-card-top"><b className="sp-card-name">? ? ?</b><span className="sp-card-lv">{sel.mix.length === 3 ? 'three parts' : 'two parts'}</span></div>
              <div className="sp-card-mix">{sel.mix.map((id, k) => k < selShown
                ? <span key={k} className="sp-ing" style={{ '--c': ingredientHex(id) } as CSSProperties}><i />{ingredientName(id)}</span>
                : <span key={k} className="sp-ing blank"><i />?</span>)}</div>
              <p className="sp-card-desc">{hint?.id === sel.id ? 'The stains point here. Reading them shows another part.' : selShown ? 'Part of it shows through the stains.' : 'Not found yet. Wind colours together to find it.'}</p>
            </>}
          </div>
        </section>
      </div>
    </ChallengeRoom>
  );
}
