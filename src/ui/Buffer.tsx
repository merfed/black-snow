import { useCallback, useState } from 'react';
import { fmt } from '../game/format';
import {
  BUFFER, FREQ_MAX, HARM_MAX, match, newSlot, PATTERN_TARGETS, patternMult, patternsOpen, patternSlots, PHASE_STEPS,
  setSlot, signature, SLOT_AT, type PatternSlot,
} from '../game/patterns';
import { useGame } from '../game/store';
import { ZONE_COLORS } from './colors';
import { Dither, washes, type Shade } from './dither';

/** A wave across the screen: a base frequency with harmonics stacked on it. */
const wave = (u: number, v: number, w: { freq: number; phase: number; harm: number }, t: number) => {
  let sum = 0;
  for (let k = 1; k <= w.harm; k++) sum += Math.sin(u * w.freq * k * 1.3 + (w.phase / PHASE_STEPS) * Math.PI * 2 * k + t * 0.8 + v * k * 0.9) / k;
  return sum / (1 + Math.log(w.harm + 1));
};

/**
 * The buffer's screen. Your wave and the target's hidden one are laid over each other: far apart they beat
 * into noise, close together they settle into clean bands. Before the modulator wakes it plays a slow
 * pattern on its own.
 */
function screen(slot: PatternSlot | null, sig: { freq: number; phase: number; harm: number } | null, q: number): Shade {
  return (x, y, t, w, h) => {
    const u = x / w * 6, v = y / h * 3;
    if (!slot || !sig) return 0.45 + 0.35 * Math.sin(u * 2 + Math.sin(v * 2 + t * 0.4) * 2 + t * 0.6) * Math.cos(v * 3 - t * 0.3);
    const a = wave(u, v, slot, t), b = wave(u, v, sig, t);
    // Matched waves overlap and the noise drops out; unmatched ones leave a jittering interference.
    const jitter = (1 - q) * 0.35 * Math.sin(x * 12.9898 + y * 78.233 + Math.floor(t * 8));
    return 0.5 + 0.28 * (a + b) + jitter;
  };
}

const ramp = ['#0a0612', '#2a1442', '#7a3ec4', ZONE_COLORS[BUFFER], '#f2e2ff'];

function Stepper({ label, value, max, min = 1, wrap, onStep }: { label: string; value: number; max: number; min?: number; wrap?: boolean; onStep: (v: number) => void }) {
  const go = (d: number) => onStep(wrap ? value + d : Math.max(min, Math.min(max, value + d)));
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button onClick={() => go(-1)} disabled={!wrap && value <= min} aria-label={`${label} down`}>◀</button>
      <b>{value}</b>
      <button onClick={() => go(1)} disabled={!wrap && value >= max} aria-label={`${label} up`}>▶</button>
    </div>
  );
}

/** The Pattern Buffer's modulator: tune a wave to a resource's hidden signature to make it grow. */
export function PatternBuffer() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [sel, setSel] = useState(0);
  const open = patternsOpen(game);
  const slots = patternSlots(game);
  const i = Math.min(sel, Math.max(0, slots - 1));
  const slot = open ? game.patterns.slots[i] ?? newSlot() : null;
  const q = slot ? match(game, slot) : 0;
  const sig = slot?.target ? signature(game, slot.target) : null;
  const set = useCallback((patch: Partial<PatternSlot>) => run(s => setSlot(s, i, patch)), [run, i]);
  const shade = screen(slot?.target ? slot : null, sig, q);
  const meter = washes.fill(q);
  const pct = Math.round(q * 100);

  return (
    <div className="buffer-box" data-nodrag>
      <div className="wiring-head">
        <span className="sub-head">The modulator</span>
        {open && slot?.target && <span className="wiring-cycles">{PATTERN_TARGETS.find(p => p.id === slot.target)!.name} <b>x{fmt(patternMult(game, slot.target))}</b></span>}
      </div>
      <div className={`buffer-screen ${q === 1 ? 'locked' : ''}`}>
        <Dither shade={shade} ramp={ramp} cols={96} rows={36} animate fps={10} className="buffer-canvas" />
        {open && slot?.target && <span className="buffer-tag">{q === 1 ? 'LOCKED' : `${pct}%`}</span>}
      </div>
      {!open ? (
        <p className="dim small-note wake-note">The buffer plays its pattern back to itself. Its modulator sleeps until the first <b>Vacuum Lock</b> holds (zone 5). Then the pattern can be bent toward other things.</p>
      ) : (
        <>
          {slots > 1 && (
            <div className="buffer-slots">
              {Array.from({ length: slots }, (_, k) => {
                const t = game.patterns.slots[k]?.target;
                return <button key={k} className={k === i ? 'on' : ''} onClick={() => setSel(k)}>Slot {k + 1}{t ? ` · ${t}` : ''}</button>;
              })}
            </div>
          )}
          <div className="buffer-targets">
            {PATTERN_TARGETS.map(p => {
              const taken = game.patterns.slots.some((o, k) => k !== i && k < slots && o.target === p.id);
              return <button key={p.id} className={slot?.target === p.id ? 'on' : ''} disabled={taken} onClick={() => set({ target: p.id })}
                title={taken ? 'Another slot is already on this' : `Bend the pattern toward ${p.name.toLowerCase()}`}>{p.name}</button>;
            })}
          </div>
          {slot?.target ? (
            <>
              <div className="buffer-dials">
                <Stepper label="Freq" value={slot.freq} max={FREQ_MAX} onStep={v => set({ freq: v })} />
                <Stepper label="Phase" value={slot.phase} min={0} max={PHASE_STEPS - 1} wrap onStep={v => set({ phase: v })} />
                <Stepper label="Harm" value={slot.harm} max={HARM_MAX} onStep={v => set({ harm: v })} />
              </div>
              <div className="buffer-meter" title="How closely the wave matches. Only a close match pays much; an exact lock pays extra.">
                <Dither shade={meter} ramp={['#140a20', '#3a1e5c', ZONE_COLORS[BUFFER]]} cols={60} rows={3} animate fps={6} className="meter-canvas" />
              </div>
              <p className="dim small-note">Turn each dial until the noise drops out. The match climbs as each dial gets closer. More slots open at {SLOT_AT[1]} and {SLOT_AT[2]} buffers.</p>
            </>
          ) : <p className="dim small-note">Pick what to bend the pattern toward.</p>}
        </>
      )}
    </div>
  );
}
