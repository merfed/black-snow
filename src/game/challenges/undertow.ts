// The Undertow: the zone 2 challenge. The Conduit's pipes run down into the dark and things come back up.
// Every few minutes an object rises into a tray: keep it (sets pay), burn it (embers) or send it back
// down (luck, which brings rarer things). Someone stands far down the pipe and can be walked toward.
// Leaks hiss along the pipe and can be found by ear. Three bores share a fixed budget of metal; the
// best mix sits on a curve that moves as the Conduit goes deeper. Pure functions over GameState.
import Decimal from 'break_eternity.js';
import type { GameState } from '../state';
import { log, passiveRate } from '../engine';
import type { ChallengeModule, MultTarget, Rng } from './types';

export type Bin = 'keep' | 'burn' | 'down';
export const BINS: Bin[] = ['keep', 'burn', 'down'];
export type Rarity = 0 | 1 | 2 | 3;
export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'strange'];

export interface ObjDef { id: string; name: string; rarity: Rarity; set: number; note: string }
/** What the pipe brings up. Four to a set, one strange thing in each of the deeper sets. */
export const OBJECTS: ObjDef[] = [
  { id: 'key', name: 'A key', rarity: 0, set: 0, note: 'It fits nothing here.' },
  { id: 'button', name: 'A coat button', rarity: 0, set: 0, note: 'Still threaded.' },
  { id: 'photo', name: 'A photograph', rarity: 1, set: 0, note: 'Everyone in it is facing away.' },
  { id: 'cassette', name: 'A cassette', rarity: 2, set: 0, note: 'Side B is labelled with your name.' },
  { id: 'letter', name: 'A letter', rarity: 0, set: 1, note: 'Dry. The ink is not.' },
  { id: 'glove', name: 'A glove', rarity: 1, set: 1, note: 'Warm on the inside.' },
  { id: 'band', name: 'A wedding band', rarity: 2, set: 1, note: 'The engraving has been filed off.' },
  { id: 'hair', name: 'A lock of hair', rarity: 3, set: 1, note: 'Tied with red thread.' },
  { id: 'nail', name: 'A nail', rarity: 0, set: 2, note: 'Bent, as if pulled from something.' },
  { id: 'tooth', name: 'A tooth', rarity: 1, set: 2, note: 'Small. A milk tooth.' },
  { id: 'iron', name: 'A lump of warm iron', rarity: 2, set: 2, note: 'It does not cool.' },
  { id: 'bell', name: 'A bell, still ringing', rarity: 3, set: 2, note: 'No sound reaches the room.' },
];
export const SETS = ['The Drawer', 'The Vows', 'The Furnace'];
export const objDef = (id: string) => OBJECTS.find(o => o.id === id) ?? OBJECTS[0];

/** Base weight of each rarity; luck tilts them toward the rare end. */
const RARITY_W = [60, 28, 10, 2];
const EMBERS = [1, 3, 8, 20];
const LUCK = [1, 2, 4, 8];

export const DELIVERY = 150; // seconds per object
export const TRAY = 10;
export const BORE_BUDGET = 24;
export const SEGMENTS = 3;
export const DEPTH_STEP = 25; // Conduits per shift of the gauge's optimum
export const PIPE_CELLS = 64; // cells along the leak schematic
export const LEAK_CAP = 3;
export const LEAK_PERIOD = 1500; // seconds for a new leak
const LEAK_SHAVE = 0.05; // each open leak takes this much off the Undertow's own bonus
export const APPROACHES = 9;
const FIRST_SIGHT = 120; // the figure is first seen after this long
const SIGHT = 600; // and returns this long after each approach

export interface UndertowState {
  tray: string[]; // object ids, oldest first
  next: string; // the object already on its way up
  pull: number; // progress toward the next delivery, 0..1
  delivered: number;
  kept: Record<string, number>;
  keptTotal: number;
  burned: number;
  sentDown: number;
  luck: number;
  bins: Record<Bin, number>;
  rules: Record<string, Bin>; // object id -> bin it sorts itself into
  approaches: number;
  walk: number; // seconds left on the current approach, 0 when standing still
  sight: number; // seconds since the last approach (the figure shows once this passes the wait)
  leaks: number[]; // cells along the schematic
  leakT: number;
  patched: number;
  bore: number[]; // diameters, summing to at most BORE_BUDGET
  held: number; // best gauge bonus reached, which stays when the optimum moves
}

export const fresh = (): UndertowState => ({
  tray: [], next: 'key', pull: 0, delivered: 0, kept: {}, keptTotal: 0, burned: 0, sentDown: 0, luck: 0,
  bins: { keep: 0, burn: 0, down: 0 }, rules: {}, approaches: 0, walk: 0, sight: 0,
  leaks: [17, 46], leakT: 0, patched: 0, bore: [8, 8, 8], held: 1,
});

const st = (s: GameState) => s.challenges.undertow;

// ---------- the figure ----------

export const perk = (s: GameState, n: number) => st(s).approaches >= n;
export const PERKS = [
  'The tray holds four more.',
  'Things come up a quarter faster.',
  'Sending things down brings twice the luck.',
  'Burning gives twice the embers.',
  'Leaks grow back half as fast; patches count half again.',
  'The bores pay a quarter more.',
  'Kept things count half again.',
  'Things come up a quarter faster again.',
  'Every Undertow bonus x1.5, and all ash x1.2.',
];
export const LORE = [
  'Someone is standing in the water. They do not turn.',
  'Their coat is the colour the pipe was before.',
  'They are holding something against their chest.',
  'You hear them counting. The numbers go the wrong way.',
  'The water around them does not move when they breathe.',
  'They have your height. They stand the way you stand.',
  'They say a name. It was never yours. It might have been.',
  'Close enough to touch. You do not.',
  'They turn around. "You kept everything," they say. "So did I."',
];

/** Seconds for the n-th approach (0-based): each walk is longer than the last. */
export const walkTime = (n: number) => 600 * Math.pow(1.6, n);
export const sightWait = (s: GameState) => (st(s).approaches === 0 ? FIRST_SIGHT : SIGHT);
export const figureHere = (s: GameState) => {
  const u = st(s);
  return u.approaches < APPROACHES && u.walk <= 0 && u.sight >= sightWait(s);
};
/** How near the figure stands, 0 far down the pipe to 1 within reach, easing in while walking. */
export function nearness(s: GameState): number {
  const u = st(s);
  let a = u.approaches;
  if (u.walk > 0) a += 1 - u.walk / walkTime(u.approaches);
  return Math.min(1, a / APPROACHES);
}

export function approach(s: GameState): boolean {
  if (!figureHere(s)) return false;
  st(s).walk = walkTime(st(s).approaches);
  return true;
}

// ---------- what comes up ----------

export const trayCap = (s: GameState) => TRAY + (perk(s, 1) ? 4 : 0);
export const deliveryTime = (s: GameState) => DELIVERY * (perk(s, 2) ? 0.75 : 1) * (perk(s, 8) ? 0.75 : 1);
/** How hard luck tilts the odds: each rarity step is weighted by (1 + tilt). */
export const luckTilt = (luck: number) => Math.sqrt(luck) / 10;
export function rarityOdds(luck: number): number[] {
  const k = 1 + luckTilt(luck);
  const w = RARITY_W.map((b, r) => b * Math.pow(k, r));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map(v => v / t);
}

export function roll(luck: number, rng: Rng): string {
  const odds = rarityOdds(luck);
  let x = rng(), r = 0;
  while (r < 3 && x >= odds[r]) { x -= odds[r]; r++; }
  const pool = OBJECTS.filter(o => o.rarity === r);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
}

export const binLevel = (s: GameState, b: Bin) => st(s).bins[b] ?? 0;
export const emberYield = (s: GameState, id: string) =>
  Math.round(EMBERS[objDef(id).rarity] * (1 + 0.5 * binLevel(s, 'burn')) * (perk(s, 4) ? 2 : 1));
export const luckYield = (s: GameState, id: string) => LUCK[objDef(id).rarity] * (1 + 0.5 * binLevel(s, 'down')) * (perk(s, 3) ? 2 : 1);

function apply(s: GameState, id: string, bin: Bin) {
  const u = st(s);
  if (bin === 'keep') { u.kept[id] = (u.kept[id] ?? 0) + 1; u.keptTotal++; }
  else if (bin === 'burn') { s.embers += emberYield(s, id); u.burned++; }
  else { u.luck += luckYield(s, id); u.sentDown++; }
}

/** Sort one object out of the tray into a bin. */
export function sortObj(s: GameState, idx: number, bin: Bin): boolean {
  const u = st(s);
  if (idx < 0 || idx >= u.tray.length) return false;
  const [id] = u.tray.splice(idx, 1);
  apply(s, id, bin);
  return true;
}

/** Sort everything in the tray that has a rule. */
export function sortByRules(s: GameState): number {
  const u = st(s);
  let n = 0;
  u.tray = u.tray.filter(id => {
    const b = u.rules[id];
    if (!b || binLevel(s, b) < 1) return true;
    apply(s, id, b);
    n++;
    return false;
  });
  return n;
}

/** Bins learn to sort by themselves at level 1; every level after pays more for what lands in them. */
export function binCost(s: GameState, b: Bin): Decimal {
  const l = binLevel(s, b);
  return Decimal.max(1e30, passiveRate(s).mul(1200 * Math.pow(3, l))).floor();
}

export function upgradeBin(s: GameState, b: Bin): boolean {
  const c = binCost(s, b);
  if (s.ash.lt(c)) return false;
  s.ash = s.ash.sub(c);
  st(s).bins[b] = binLevel(s, b) + 1;
  return true;
}

/** Point an object kind at a bin (null clears it). The bin has to know how to sort first. */
export function setRule(s: GameState, id: string, bin: Bin | null): boolean {
  const u = st(s);
  if (bin === null) { delete u.rules[id]; return true; }
  if (binLevel(s, bin) < 1) return false;
  u.rules[id] = bin;
  return true;
}

/** Whole sets kept: as many as the scarcest member of each set. */
export function setsKept(s: GameState): number[] {
  const k = st(s).kept;
  return SETS.map((_, i) => Math.min(...OBJECTS.filter(o => o.set === i).map(o => k[o.id] ?? 0)));
}
export const totalSets = (s: GameState) => setsKept(s).reduce((a, b) => a + b, 0);

// ---------- leaks ----------

/** How loud the hiss is at a cell: the nearest leak, measured along the pipe. */
export function hiss(s: GameState, cell: number): number {
  let best = 0;
  for (const l of st(s).leaks) best = Math.max(best, Math.exp(-Math.pow(Math.abs(l - cell) / 7, 2)));
  return best;
}

export function patch(s: GameState, cell: number): boolean {
  const u = st(s);
  const i = u.leaks.indexOf(cell);
  if (i < 0) return false;
  u.leaks.splice(i, 1);
  u.patched++;
  return true;
}

// ---------- bore and gauge ----------

const h32 = (n: number) => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export const depth = (s: GameState) => Math.floor(s.zones[1].bought / DEPTH_STEP);
export const nextShift = (s: GameState) => (depth(s) + 1) * DEPTH_STEP;
/** The three runs of pipe at a depth. Same depth, same lengths, every time. */
export const lengths = (d: number) => [0, 1, 2].map(i => 1 + Math.floor(h32(d * 7 + i * 131 + 3) * 12));

/** Resistance of the runs in series: each run costs its length over its bore. */
const resist = (L: number[], b: number[]) => L.reduce((a, l, i) => a + l / Math.max(1, b[i]), 0);

const bestCache = new Map<number, { r: number; bore: number[] }>();
/** The lowest resistance the budget allows at a depth, searched over whole-number bores. Cached. */
export function bestBore(d: number): { r: number; bore: number[] } {
  let c = bestCache.get(d);
  if (c) return c;
  const L = lengths(d);
  c = { r: Infinity, bore: [8, 8, 8] };
  for (let a = 1; a < BORE_BUDGET - 1; a++) for (let b = 1; a + b < BORE_BUDGET; b++) {
    const bore = [a, b, BORE_BUDGET - a - b], r = resist(L, bore);
    if (r < c.r) c = { r, bore };
  }
  bestCache.set(d, c);
  return c;
}

/** How close the bores are to the best mix at this depth, 0..1. */
export function efficiency(s: GameState): number {
  const d = depth(s);
  return Math.min(1, bestBore(d).r / resist(lengths(d), st(s).bore));
}

/** What the gauge pays at the current depth and setting, before what it held. */
export function gaugeNow(s: GameState): number {
  const e = efficiency(s);
  return 1 + Math.pow(e, 3) * (0.8 + 0.25 * Math.log2(1 + depth(s))) * (perk(s, 6) ? 1.25 : 1);
}
export const gaugeMult = (s: GameState) => Math.max(st(s).held, gaugeNow(s));

/** Set one bore. It can only take metal the other two have left. */
export function setBore(s: GameState, i: number, d: number): boolean {
  const u = st(s);
  if (i < 0 || i >= SEGMENTS) return false;
  const others = u.bore.reduce((a, b, j) => (j === i ? a : a + b), 0);
  const v = Math.max(1, Math.min(BORE_BUDGET - others, Math.round(d)));
  if (v === u.bore[i]) return false;
  u.bore[i] = v;
  u.held = Math.max(u.held, gaugeNow(s));
  return true;
}

// ---------- payouts ----------

export const keepMult = (s: GameState) => 1 + 0.06 * Math.pow(st(s).keptTotal, 0.6) * (1 + 0.25 * binLevel(s, 'keep')) * (perk(s, 7) ? 1.5 : 1);
export const setMult = (s: GameState) => 1 + 0.25 * Math.pow(totalSets(s), 0.7);
export const patchMult = (s: GameState) => 1 + 0.1 * Math.pow(st(s).patched, 0.6) * (perk(s, 5) ? 1.5 : 1);
/** Everything the Undertow gives the Conduit, with open leaks taken off but never below nothing. */
export function zoneBonus(s: GameState): number {
  const raw = gaugeMult(s) * keepMult(s) * setMult(s) * patchMult(s) * (perk(s, 9) ? 1.5 : 1);
  return Math.max(1, raw * (1 - LEAK_SHAVE * st(s).leaks.length));
}

function step(s: GameState, dt: number, rng: Rng) {
  const u = st(s);
  // deliveries: the next object waits in the pipe if it has nowhere to go
  u.pull += dt / deliveryTime(s);
  for (let guard = 0; u.pull >= 1 && guard < 5000; guard++) {
    const id = u.next, rule = u.rules[id];
    if (rule && binLevel(s, rule) >= 1) apply(s, id, rule);
    else if (u.tray.length < trayCap(s)) u.tray.push(id);
    else { u.pull = 1; break; }
    u.pull -= 1;
    u.delivered++;
    u.next = roll(u.luck, rng);
  }
  // the figure
  let rest = dt;
  if (u.walk > 0) {
    const used = Math.min(u.walk, rest);
    u.walk -= used;
    rest -= used;
    if (u.walk <= 1e-9) {
      u.walk = 0;
      u.approaches++;
      u.sight = 0;
      if (u.approaches === APPROACHES) log(s, 'THE FIGURE IN THE PIPE HAS TURNED AROUND', 'milestone', true);
    }
  }
  if (u.walk <= 0) u.sight = Math.min(u.sight + rest, 1e6);
  // leaks grow back slowly, up to a few
  if (u.leaks.length >= LEAK_CAP) u.leakT = 0;
  else {
    u.leakT += dt / (LEAK_PERIOD * (perk(s, 5) ? 2 : 1));
    while (u.leakT >= 1 && u.leaks.length < LEAK_CAP) {
      u.leakT -= 1;
      let c = Math.floor(rng() * PIPE_CELLS);
      while (u.leaks.includes(c)) c = (c + 11) % PIPE_CELLS;
      u.leaks.push(c);
    }
    if (u.leaks.length >= LEAK_CAP) u.leakT = 0;
  }
  // the gauge keeps the best it has reached
  u.held = Math.max(u.held, gaugeNow(s));
}

function mult(s: GameState, t: MultTarget): number {
  if (t === 'zone1') return zoneBonus(s);
  if (t === 'ash') return perk(s, 9) ? 1.2 : 1;
  return 1;
}

export const MILESTONE_APPROACHES = 3;
export const MILESTONE_KEPT = 12;

export const undertow: ChallengeModule<UndertowState> = {
  id: 'undertow',
  zone: 1,
  name: 'The Undertow',
  tagline: 'Sort what the pipe brings up. Someone stands in the water.',
  fresh,
  step,
  mult,
  milestone: {
    text: `Approach the figure ${MILESTONE_APPROACHES} times and keep ${MILESTONE_KEPT} objects`,
    done: s => st(s).approaches >= MILESTONE_APPROACHES && st(s).keptTotal >= MILESTONE_KEPT,
  },
  level: s => st(s).approaches + st(s).patched + totalSets(s),
};
