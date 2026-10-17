// The Archive: the zone 3 challenge. A machine that records the shaft and plays it back in the wrong order.
// Locks from the modulator are recorded to tape and shelved, where they keep paying while the slot is
// freed for something new. Glitches on the plate leave wrong frames that collect in an album, the
// signatures drift a little each station day, and every exact lock opens a hidden channel.
import Decimal from 'break_eternity.js';
import { log, passiveRate } from '../engine';
import { BUFFER, FREQ_MAX, HARM_MAX, match, PATTERN_TARGETS, patternSlots, patternsOpen, patternStrength, PHASE_STEPS, setSlot, signature, type PatternSlot, type PatternTarget } from '../patterns';
import type { GameState } from '../state';
import type { ChallengeModule, MultTarget } from './types';

export interface Tape { id: number; target: PatternTarget; q: number; gold: boolean }

export interface ArchiveState {
  clock: number; // seconds of shaft time since the archive opened; station days are counted from it
  shelf: Tape[]; // kept sorted, best first
  space: number; // shelf spaces bought
  stock: number; // tape stock upgrades bought
  recorded: number; // tapes ever recorded (also the next id)
  frameProg: number; // progress to the next wrong frame
  frames: number; // frames ever developed
  album: number[]; // copies of each sitter x wrongness
  recent: number[]; // seeds of the last few frames
  channels: string[]; // targets whose broadcast has been found
  freshLeft: number; // seconds left on the fresh-lock boost
  freshDay: number; // the station day a fresh lock last paid
}

export const SHELF_BASE = 3;
export const SHELF_MAX = 32; // the shelf never holds more tapes than this
export const RECORD_MIN = 0.6; // a slot must match at least this to be worth recording
export const GOLD_AT = 0.98;
export const GOLD_MULT = 2;
export const STATION_DAY = 12 * 3600;
export const FRESH_TIME = 4 * 3600;
export const FRESH_MULT = 1.5;
export const FRAME_EVERY = 600; // seconds per frame at 25 Pattern Buffers; more buffers glitch faster
export const SITTERS = 6;
export const WRONGS = 4;
export const RECENT = 8;
export const CHANNEL_MULT = 1.1;

const MAX: Record<string, number> = Object.fromEntries(PATTERN_TARGETS.map(p => [p.id, p.max]));
const at = (s: GameState) => s.challenges.archive;

/** A small seeded hash, the archive's own. */
export function ahash(seed: number, n: number) {
  let h = (seed ^ Math.imul(n + 0x6d2b79f5, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// ---------- tapes ----------

export const shelfSize = (s: GameState) => Math.min(SHELF_MAX, SHELF_BASE + at(s).space);
export const shelfFull = (s: GameState) => shelfSize(s) >= SHELF_MAX;
/** The share of a live lock's bonus a tape keeps paying. Grows with tape stock, tapering. */
export const tapeShare = (s: GameState) => 0.35 * Math.sqrt(1 + 0.5 * at(s).stock);
const tapeWeight = (t: Tape) => Math.pow(t.q, 4) * (t.gold ? GOLD_MULT : 1);
export const freshActive = (s: GameState) => at(s).freshLeft > 0;

/** The bonus on one target from its tapes. A second tape of the same target pays half, a third a third, and so on. */
export function tapeMult(s: GameState, t: PatternTarget): number {
  const a = at(s);
  let v = 0, k = 0;
  for (const tape of a.shelf) if (tape.target === t) v += tapeWeight(tape) / ++k;
  if (!k) return 1;
  return 1 + tapeShare(s) * MAX[t] * patternStrength(s) * v * (a.freshLeft > 0 ? FRESH_MULT : 1);
}

/** What one tape adds on its own, as a multiplier, if it were the only one of its target. */
export const tapeValue = (s: GameState, tape: Tape) =>
  1 + tapeShare(s) * MAX[tape.target] * patternStrength(s) * tapeWeight(tape) * (freshActive(s) ? FRESH_MULT : 1);

const live = (s: GameState) => (patternsOpen(s) ? s.patterns.slots.slice(0, patternSlots(s)) : []);
export const canRecord = (s: GameState, i: number) => {
  const slot = live(s)[i];
  return !!slot?.target && match(s, slot) >= RECORD_MIN && at(s).shelf.length < shelfSize(s);
};

function addChannel(s: GameState, t: string) {
  const a = at(s);
  if (a.channels.includes(t)) return;
  a.channels.push(t);
  if (a.channels.length === PATTERN_TARGETS.length) log(s, 'SEVEN CHANNELS RECEIVED. THE SHELF HAS ROOM FOR A THIRTEENTH TAPE. NOBODY RECORDED IT.', 'milestone', true);
}

/** Record a slot's match to tape and shelve it. The slot lets go of its target, free for a new one. */
export function recordSlot(s: GameState, i: number): boolean {
  if (!canRecord(s, i)) return false;
  const a = at(s);
  const slot = s.patterns.slots[i];
  const q = match(s, slot);
  const tape: Tape = { id: a.recorded++, target: slot.target!, q, gold: q >= GOLD_AT };
  a.shelf = [...a.shelf, tape].sort((x, y) => tapeWeight(y) - tapeWeight(x) || x.id - y.id);
  if (tape.gold) addChannel(s, tape.target);
  setSlot(s, i, { target: null });
  return true;
}

export function eraseTape(s: GameState, id: number): boolean {
  const a = at(s);
  if (!a.shelf.some(t => t.id === id)) return false;
  a.shelf = a.shelf.filter(t => t.id !== id);
  return true;
}

export const shelfCost = (s: GameState) => Decimal.max(1e15, passiveRate(s).mul(900 * Math.pow(2.2, at(s).space))).floor();
export const stockCost = (s: GameState) => Decimal.max(1e15, passiveRate(s).mul(600 * Math.pow(1.8, at(s).stock))).floor();

export function buyShelf(s: GameState): boolean {
  if (shelfFull(s)) return false;
  const c = shelfCost(s);
  if (s.ash.lt(c)) return false;
  s.ash = s.ash.sub(c);
  at(s).space++;
  return true;
}

export function buyStock(s: GameState): boolean {
  const c = stockCost(s);
  if (s.ash.lt(c)) return false;
  s.ash = s.ash.sub(c);
  at(s).stock++;
  return true;
}

// ---------- drift ----------

export const stationDay = (s: GameState) => Math.floor(at(s).clock / STATION_DAY);
export const dayLeft = (s: GameState) => STATION_DAY - (at(s).clock % STATION_DAY);

/** Where a target's signature has wandered to today. Never quite where it was; the real one doesn't move. */
export function driftSig(s: GameState, t: PatternTarget, day = stationDay(s)) {
  const sig = signature(s, t);
  const n = PATTERN_TARGETS.findIndex(p => p.id === t);
  const seed = (s.patterns.seed ^ Math.imul(day + 1, 0x2c1b3c6d)) >>> 0;
  const df = Math.floor(ahash(seed, n * 3) * 5) - 2, dp = Math.floor(ahash(seed, n * 3 + 1) * 5) - 2, dh = Math.floor(ahash(seed, n * 3 + 2) * 3) - 1;
  const freq = Math.max(1, Math.min(FREQ_MAX, sig.freq + df));
  const phase = (((sig.phase + dp) % PHASE_STEPS) + PHASE_STEPS) % PHASE_STEPS;
  let harm = Math.max(1, Math.min(HARM_MAX, sig.harm + dh));
  // Always somewhere new: if every dial landed home, nudge the harmonics.
  if (freq === sig.freq && phase === sig.phase && harm === sig.harm) harm = harm < HARM_MAX ? harm + 1 : harm - 1;
  return { freq, phase, harm };
}

/** 0..1 how closely a slot matches today's drifted signature, by the same rule as the modulator. */
export function driftMatch(s: GameState, slot: PatternSlot): number {
  if (!slot.target) return 0;
  const sig = driftSig(s, slot.target);
  const f = 1 - Math.abs(slot.freq - sig.freq) / (FREQ_MAX - 1);
  const d = Math.abs(slot.phase - sig.phase);
  const p = 1 - Math.min(d, PHASE_STEPS - d) / (PHASE_STEPS / 2);
  const h = 1 - Math.abs(slot.harm - sig.harm) / (HARM_MAX - 1);
  return f * p * h;
}

// ---------- frames ----------

export const frameRate = (s: GameState) => patternStrength(s) / FRAME_EVERY;
/** A frame's seed: the same frame number always comes back the same wrong way. */
export const frameSeed = (s: GameState, n: number) => Math.floor(ahash(s.patterns.seed ^ 0x5eed, n) * 2 ** 31);
export const frameCell = (seed: number) => Math.floor(ahash(seed, 7) * SITTERS * WRONGS);
export const sitterOf = (seed: number) => Math.floor(frameCell(seed) / WRONGS);
export const wrongOf = (seed: number) => frameCell(seed) % WRONGS;

/** Full sets: for each sitter, how many times every wrongness of them is in the album. */
export function albumSets(s: GameState): number {
  const al = at(s).album;
  let n = 0;
  for (let k = 0; k < SITTERS; k++) {
    let m = Infinity;
    for (let w = 0; w < WRONGS; w++) m = Math.min(m, al[k * WRONGS + w] ?? 0);
    n += m;
  }
  return n;
}
export const albumMult = (s: GameState) => 1 + 0.5 * Math.pow(albumSets(s), 0.7);

// ---------- module ----------

function step(s: GameState, dt: number) {
  const a = at(s);
  a.clock += dt;
  // Old saves may carry more than the shelf holds: keep the best, let the rest go.
  if (a.space > SHELF_MAX - SHELF_BASE) a.space = SHELF_MAX - SHELF_BASE;
  if (a.shelf.length > SHELF_MAX) a.shelf = a.shelf.slice(0, SHELF_MAX);
  a.freshLeft = Math.max(0, a.freshLeft - dt);

  a.frameProg += frameRate(s) * dt;
  for (let guard = 0; a.frameProg >= 1 && guard < 1000; guard++) {
    a.frameProg -= 1;
    const seed = frameSeed(s, a.frames++);
    a.album[frameCell(seed)] = (a.album[frameCell(seed)] ?? 0) + 1;
    a.recent = [seed, ...a.recent].slice(0, RECENT);
  }

  const day = stationDay(s);
  for (const slot of live(s)) {
    if (!slot.target) continue;
    if (match(s, slot) === 1) addChannel(s, slot.target);
    if (a.freshDay !== day) {
      const d = driftSig(s, slot.target, day);
      if (slot.freq === d.freq && slot.phase === d.phase && slot.harm === d.harm) { a.freshLeft = FRESH_TIME; a.freshDay = day; }
    }
  }
}

function mult(s: GameState, t: MultTarget): number {
  if (t === `zone${BUFFER}`) return albumMult(s);
  if (!(t in MAX)) return 1;
  const a = at(s);
  return tapeMult(s, t as PatternTarget) * (a.channels.includes(t) ? CHANNEL_MULT : 1);
}

export const archive: ChallengeModule<ArchiveState> = {
  id: 'archive',
  zone: 2,
  name: 'The Archive',
  tagline: 'Shelve the locks on tape. Keep the frames that came back wrong.',
  fresh: () => ({
    clock: 0, shelf: [], space: 0, stock: 0, recorded: 0, frameProg: 0, frames: 0,
    album: Array(SITTERS * WRONGS).fill(0), recent: [], channels: [], freshLeft: 0, freshDay: -1,
  }),
  step: (s, dt) => step(s, dt),
  mult,
  milestone: { text: 'Shelve 5 tapes and fill one album set', done: s => at(s).shelf.length >= 5 && albumSets(s) >= 1 },
  level: s => at(s).shelf.length + albumSets(s) + at(s).channels.length,
};
