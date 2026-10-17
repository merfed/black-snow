// The Pattern Buffer's modulator. Each slot plays a wave set by three dials; every resource it can
// target has a hidden signature, and the closer the wave matches it the more that resource grows.
// Pure functions over GameState, like the engine.
import type { GameState } from './state';

export const BUFFER = 2; // zone index of the Pattern Buffer
export type PatternTarget = 'ash' | 'listen' | 'echoes' | 'rust' | 'cycles' | 'pigment' | 'embers';
export interface PatternSlot { target: PatternTarget | null; freq: number; phase: number; harm: number }
export interface Patterns { seed: number; slots: PatternSlot[] }

export const FREQ_MAX = 16; // 1..16
export const PHASE_STEPS = 16; // 0..15, around a circle
export const HARM_MAX = 6; // 1..6

export const PATTERN_TARGETS: { id: PatternTarget; name: string; max: number }[] = [
  { id: 'ash', name: 'Ash', max: 1 },
  { id: 'listen', name: 'Listen', max: 3 },
  { id: 'echoes', name: 'Echoes', max: 2 },
  { id: 'rust', name: 'Rust', max: 1 },
  { id: 'cycles', name: 'Cycles', max: 2 },
  { id: 'pigment', name: 'Pigment', max: 2 },
  { id: 'embers', name: 'Embers', max: 1 },
];

/** The modulator wakes at 25 Pattern Buffers dug; more slots open at 100 and 250. */
export const SLOT_AT = [25, 100, 250];

export const newSlot = (): PatternSlot => ({ target: null, freq: 1, phase: 0, harm: 1 });
export const newPatterns = (rng: () => number = Math.random): Patterns => ({ seed: Math.floor(rng() * 2 ** 31), slots: [] });

export const patternsOpen = (s: GameState) => s.zones[BUFFER].bought >= SLOT_AT[0];
export const patternSlots = (s: GameState) => SLOT_AT.filter(n => s.zones[BUFFER].bought >= n).length;

/** A small seeded hash so each save has its own signatures. */
function hash(seed: number, n: number) {
  let h = (seed ^ (n * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Where a target's wave wants to be. */
export function signature(s: GameState, t: PatternTarget) {
  const n = PATTERN_TARGETS.findIndex(p => p.id === t);
  return {
    freq: 1 + Math.floor(hash(s.patterns.seed, n * 3) * FREQ_MAX),
    phase: Math.floor(hash(s.patterns.seed, n * 3 + 1) * PHASE_STEPS),
    harm: 1 + Math.floor(hash(s.patterns.seed, n * 3 + 2) * HARM_MAX),
  };
}

/** 0..1 how closely a slot matches its target. Each dial counts on its own, so it can be tuned by ear. */
export function match(s: GameState, slot: PatternSlot): number {
  if (!slot.target) return 0;
  const sig = signature(s, slot.target);
  const f = 1 - Math.abs(slot.freq - sig.freq) / (FREQ_MAX - 1);
  const d = Math.abs(slot.phase - sig.phase);
  const p = 1 - Math.min(d, PHASE_STEPS - d) / (PHASE_STEPS / 2);
  const h = 1 - Math.abs(slot.harm - sig.harm) / (HARM_MAX - 1);
  return f * p * h;
}

/** More Pattern Buffers make every match count for more. */
export const patternStrength = (s: GameState) => 1 + Math.log10(Math.max(1, s.zones[BUFFER].bought / SLOT_AT[0]));

/** The bonus on one resource from every slot pointed at it. Only a close match pays much; an exact lock pays 1.5x more. */
export function patternMult(s: GameState, t: PatternTarget): number {
  if (!patternsOpen(s)) return 1;
  const def = PATTERN_TARGETS.find(p => p.id === t)!;
  let m = 1;
  s.patterns.slots.slice(0, patternSlots(s)).forEach(slot => {
    if (slot.target !== t) return;
    const q = match(s, slot);
    m *= 1 + def.max * patternStrength(s) * Math.pow(q, 4) * (q === 1 ? 1.5 : 1);
  });
  return m;
}

/** Set one slot's dial or target. Two slots can't share a target. */
export function setSlot(s: GameState, i: number, patch: Partial<PatternSlot>): boolean {
  if (i >= patternSlots(s)) return false;
  while (s.patterns.slots.length <= i) s.patterns.slots.push(newSlot());
  if (patch.target && s.patterns.slots.some((o, j) => j !== i && o.target === patch.target)) return false;
  const slot = { ...s.patterns.slots[i], ...patch };
  slot.freq = Math.max(1, Math.min(FREQ_MAX, Math.round(slot.freq)));
  slot.phase = ((Math.round(slot.phase) % PHASE_STEPS) + PHASE_STEPS) % PHASE_STEPS;
  slot.harm = Math.max(1, Math.min(HARM_MAX, Math.round(slot.harm)));
  s.patterns.slots[i] = slot;
  return true;
}
