// The Barker Ring: the zone 6 challenge. The spiral grows rings, each one + or −. Set them to a Barker
// code (every autocorrelation sidelobe within 1) and the spiral runs cleaner: more pigment, a share of
// ash, harder-working Spirals. Deep winds also shed catalysts, rare colours that are never used up;
// socket one and it bends every tincture aimed at its target. Pure functions over GameState.
import { alchemyOpen, SPIRAL, tinctureMult, type TinctureTarget } from '../alchemy';
import { log, pigmentRate } from '../engine';
import type { GameState } from '../state';
import type { ChallengeModule, MultTarget } from './types';

export const MAX_RINGS = 13;
export const BASE_RINGS = 3;
/** The lengths a Barker code exists at. Nothing else gets every sidelobe down to 1. */
export const BARKER_LENGTHS = [2, 3, 4, 5, 7, 11, 13];
/** Power of a reading by its length, before quality and holding. Longer pays much more. */
export const POWER = [0, 0, 0.3, 0.6, 0.9, 1.3, 1.6, 2, 2.4, 2.8, 3.2, 3.8, 4.4, 5.6];

export interface Catalyst { name: string; hex: string; target: TinctureTarget & MultTarget; base: number; desc: string }
export const CATALYSTS: Catalyst[] = [
  { name: 'Verdigris Bloom', hex: '#3fe0a0', target: 'rust', base: 0.6, desc: 'It grows on the inside of the pipe.' },
  { name: 'Black Sugar', hex: '#2a1a22', target: 'embers', base: 0.6, desc: 'Sweet, and it stays lit.' },
  { name: 'Moth Silver', hex: '#c8c8d8', target: 'echoes', base: 0.6, desc: 'Dust from a wing that was listening.' },
  { name: "Saint's Yellow", hex: '#ffd84a', target: 'ash', base: 0.3, desc: 'Scraped off a halo with a fingernail.' },
  { name: 'Lamp-Black Milk', hex: '#4a4650', target: 'comfort', base: 0.6, desc: 'Warm, and you cannot see the bottom.' },
  { name: 'Wire Blue', hex: '#3a7cff', target: 'cycles', base: 0.6, desc: 'The colour a thought makes in copper.' },
  { name: 'Ghost Rose', hex: '#ff8ab4', target: 'pigment', base: 0.6, desc: 'Pink that was here before the flower.' },
  { name: 'Drowned Gold', hex: '#b8902a', target: 'listen', base: 0.6, desc: 'It rings when nobody touches it.' },
];

export interface RingState {
  pol: number[]; // polarity of each ring, inner first: 1 or -1
  span: number; // how many rings, from the inside, are read as the code
  extra: number; // rings bought with pigment
  best: number; // longest Barker code ever locked
  held: number; // seconds a perfect code has been held, weighted by its length
  dust: number; // deep-wind silt; a catalyst drops each time it reaches the next drop's size
  found: number; // catalysts dropped, ever
  pours: number; // pigment poured into the deep wind
  cats: number[]; // copies of each catalyst held
  ref: number[]; // refine level of each catalyst
  sock: number[]; // catalyst in each socket, -1 for empty
  sock2: boolean; // second socket opened
  seed: number;
  spiralsAt: number; // Spirals owned when the Ring opened (-1 until noted); only ones bought after count for free rings
}

const fresh = (): RingState => ({
  pol: Array(MAX_RINGS).fill(1), span: BASE_RINGS, extra: 0, best: 0, held: 0, dust: 0, found: 0, pours: 0,
  cats: Array(CATALYSTS.length).fill(0), ref: Array(CATALYSTS.length).fill(0), sock: [-1, -1], sock2: false,
  seed: Math.floor(Math.random() * 1e9), spiralsAt: -1,
});

const st = (s: GameState) => s.challenges.ring;

// ---- the code ----

export const FREE_PER = 6;
/** Spirals bought since the Ring opened. */
export const newSpirals = (s: GameState) => (st(s).spiralsAt < 0 ? 0 : Math.max(0, s.zones[SPIRAL].bought - st(s).spiralsAt));
/** Free rings from the Spirals themselves: one per FREE_PER bought after the Ring opened, at most 4. */
export const freeRings = (s: GameState) => Math.min(4, Math.floor(newSpirals(s) / FREE_PER));
/** Note the Spirals owned when the Ring first runs; a save that had already played it keeps its free rings. */
function noteSpirals(s: GameState) {
  const r = st(s);
  if (r.spiralsAt < 0) r.spiralsAt = r.best > 0 || r.found > 0 || r.extra > 0 ? 0 : s.zones[SPIRAL].bought;
}
export const rings = (s: GameState) => Math.min(MAX_RINGS, BASE_RINGS + freeRings(s) + st(s).extra);
/** Pigment a second without the Ring's own share, so its prices do not chase its payout. */
export const rawPigment = (s: GameState) => pigmentRate(s) / ringMult(s, 'pigment');
/** Prices follow the pigment rate: a few minutes of it, growing with each one bought. */
export const ringCost = (s: GameState) => Math.round(Math.max(4000, rawPigment(s) * 750) * Math.pow(2, st(s).extra));
/** Rings actually read: never more than the spiral has. */
export const spanOf = (s: GameState) => Math.max(2, Math.min(st(s).span, rings(s)));

/** Aperiodic autocorrelation sidelobes C_1..C_{n-1} of a ±1 sequence. */
export function sidelobes(a: number[]): number[] {
  const n = a.length, out: number[] = [];
  for (let k = 1; k < n; k++) {
    let c = 0;
    for (let i = 0; i + k < n; i++) c += a[i] * a[i + k];
    out.push(c);
  }
  return out;
}
export const peakSidelobe = (a: number[]) => sidelobes(a).reduce((m, c) => Math.max(m, Math.abs(c)), 0);
export const isBarker = (a: number[]) => BARKER_LENGTHS.includes(a.length) && peakSidelobe(a) <= 1;
/** How much of a length's power a reading gets: all of it for a Barker code, a taper for low sidelobes, none for a flat one. */
export const quality = (psl: number, n: number) => (psl <= 1 ? 1 : psl >= n - 1 ? 0 : 0.3 / (psl - 1));

export interface Reading { code: number[]; lobes: number[]; psl: number; barker: boolean; power: number }
let memoKey = '', memo: Reading | null = null;
/** The code the rings spell right now, and what it is worth. Memoised: mult asks often. */
export function reading(s: GameState): Reading {
  const r = st(s), n = spanOf(s);
  const code = r.pol.slice(0, n);
  const key = n + ':' + code.join('');
  if (memo && key === memoKey) return memo;
  const lobes = sidelobes(code);
  const psl = lobes.reduce((m, c) => Math.max(m, Math.abs(c)), 0);
  const barker = BARKER_LENGTHS.includes(n) && psl <= 1;
  memoKey = key;
  memo = { code, lobes, psl, barker, power: POWER[n] * quality(psl, n) };
  return memo;
}

/** Holding a perfect code makes it hum louder, slowly, forever. */
export const holdMult = (s: GameState) => 1 + 0.2 * Math.log2(1 + st(s).held / 3600);
export const codePower = (s: GameState) => reading(s).power * holdMult(s);
export const pigmentBonus = (s: GameState) => 1 + codePower(s);
export const ASH_SHARE = 0.2;
export const ashBonus = (s: GameState) => 1 + ASH_SHARE * codePower(s);
export const spiralBonus = (s: GameState) => 1 + 0.4 * codePower(s);

function noteLock(s: GameState) {
  const r = st(s), rd = reading(s);
  if (!rd.barker || rd.code.length <= r.best) return;
  r.best = rd.code.length;
  if (r.best === MAX_RINGS) log(s, 'THIRTEEN RINGS AGREE WITH THEMSELVES. THE STAIR ARRIVES ABOVE ITSELF.', 'milestone', true);
}

export function flip(s: GameState, i: number): boolean {
  noteSpirals(s);
  if (i < 0 || i >= rings(s)) return false;
  st(s).pol[i] = -st(s).pol[i];
  noteLock(s);
  return true;
}

export function setSpan(s: GameState, n: number): boolean {
  noteSpirals(s);
  if (n < 2 || n > rings(s) || n === spanOf(s)) return false;
  st(s).span = n;
  noteLock(s);
  return true;
}

export function buyRing(s: GameState): boolean {
  noteSpirals(s);
  const cost = ringCost(s);
  if (rings(s) >= MAX_RINGS || s.alchemy.pigment < cost) return false;
  const was = rings(s), r = st(s);
  s.alchemy.pigment -= cost;
  r.extra++;
  if (r.span >= was) r.span = rings(s);
  return true;
}

// ---- catalysts ----

export const tinctureLevels = (s: GameState) => Object.values(s.alchemy.found).reduce((n, v) => n + v, 0);
/** Silt per second: deeper with every tincture level brewed, quicker while a code holds. */
export const dustRate = (s: GameState) => (alchemyOpen(s) ? 0.0003 * Math.sqrt(1 + tinctureLevels(s)) * (1 + 0.25 * reading(s).power) : 0);
/** Size of the next drop. Grows slowly so catalysts keep coming. */
export const dropCost = (found: number) => 5 + 3 * found;
/** A pour is a few minutes of pigment, dearer each time: banked pigment buys a head start, not every catalyst at once. */
export const pourCost = (s: GameState) => Math.round(Math.max(2000, rawPigment(s) * 240) * Math.pow(1.2, st(s).pours));

const hash = (n: number) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
/** Which catalyst the nth drop is: the first eight are all different, the rest fall where they fall. */
export function dropKind(seed: number, n: number): number {
  const k = CATALYSTS.length;
  if (n >= k) return hash(seed + n * 7919) % k;
  const order = CATALYSTS.map((_, i) => i);
  for (let i = k - 1; i > 0; i--) { const j = hash(seed + i * 104729) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order[n];
}

function drops(s: GameState) {
  const r = st(s);
  while (r.dust >= dropCost(r.found)) {
    r.dust -= dropCost(r.found);
    const k = dropKind(r.seed, r.found++);
    r.cats[k]++;
    if (r.sock[0] < 0) r.sock[0] = k; // the first one goes straight in
  }
}

export function pour(s: GameState): boolean {
  const cost = pourCost(s);
  if (!alchemyOpen(s) || s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  st(s).pours++;
  st(s).dust += 1;
  drops(s);
  return true;
}

export const kindsFound = (s: GameState) => st(s).cats.filter(n => n > 0).length;
export const sockets = (s: GameState) => (st(s).sock2 ? 2 : 1);
export const SOCK2_FOUND = 4;
export const SOCK2_COST = 400000;
export const sock2Cost = (s: GameState) => Math.round(Math.max(SOCK2_COST, rawPigment(s) * 1800));

export function socket(s: GameState, slot: number, k: number): boolean {
  const r = st(s);
  if (slot < 0 || slot >= sockets(s)) return false;
  if (k >= 0 && !r.cats[k]) return false;
  if (k >= 0 && r.sock.includes(k)) r.sock[r.sock.indexOf(k)] = -1; // moving it, not copying it
  r.sock[slot] = k;
  return true;
}

export function openSocket2(s: GameState): boolean {
  const r = st(s);
  const cost = sock2Cost(s);
  if (r.sock2 || r.found < SOCK2_FOUND || s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  r.sock2 = true;
  return true;
}

/** Refining melts one spare copy into the catalyst, with pigment. */
export const refineCost = (s: GameState, k: number) => Math.round(Math.max(20000, rawPigment(s) * 600) * Math.pow(2.2, st(s).ref[k]));
export const canRefine = (s: GameState, k: number) => st(s).cats[k] >= 2 && s.alchemy.pigment >= refineCost(s, k);
export function refine(s: GameState, k: number): boolean {
  if (!canRefine(s, k)) return false;
  s.alchemy.pigment -= refineCost(s, k);
  st(s).cats[k]--;
  st(s).ref[k]++;
  return true;
}
export const refines = (s: GameState) => st(s).ref.reduce((n, v) => n + v, 0);

/** A catalyst's own strength, before the tinctures it bends. */
export const catStrength = (s: GameState, k: number) => CATALYSTS[k].base * Math.pow(1 + st(s).ref[k], 0.6);
/** What a socketed catalyst multiplies its target by: stronger the more tincture is already aimed there. */
export function catMult(s: GameState, k: number): number {
  const t = CATALYSTS[k].target;
  return 1 + catStrength(s, k) * (1 + 0.2 * Math.log(tinctureMult(s, t)));
}

function ringMult(s: GameState, t: MultTarget) {
  const r = st(s);
  let m = 1;
  if (t === 'pigment' || t === 'ash' || t === 'zone5') {
    const p = codePower(s);
    m *= 1 + p * (t === 'pigment' ? 1 : t === 'ash' ? ASH_SHARE : 0.4);
  }
  for (let i = 0; i < sockets(s); i++) {
    const k = r.sock[i];
    if (k >= 0 && CATALYSTS[k].target === t) m *= catMult(s, k);
  }
  return m;
}

export const ring: ChallengeModule<RingState> = {
  id: 'ring',
  zone: 5,
  name: 'The Barker Ring',
  tagline: 'Set the rings to a Barker code. Drop a catalyst in the brew.',
  fresh,
  step: (s, dt) => {
    const r = st(s);
    noteSpirals(s);
    const rd = reading(s);
    if (rd.barker) r.held += dt * rd.code.length / 7;
    r.dust += dustRate(s) * dt;
    drops(s);
  },
  mult: (s, t) => ringMult(s, t),
  milestone: { text: 'Lock a 7-long Barker code and find 2 catalysts', done: s => st(s).best >= 7 && kindsFound(s) >= 2 },
  level: s => st(s).best + st(s).found + refines(s),
};
