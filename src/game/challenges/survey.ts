// The Survey: the zone 1 challenge. The bore pulls up cores on its own and racks them; reading one is a
// small swap puzzle (line up three bands of a kind and they are read). A core reader, once bought, reads
// racked cores on its own, slowly and at half value. Bore heads placed on the snow map pay survey by how
// thick the ash falls on their tile; the map drifts slowly with the Survey's own clock.
// Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import { log, passiveRate } from '../engine';
import type { GameState } from '../state';
import type { ChallengeModule, Rng } from './types';

export const MAP_W = 12, MAP_H = 8;
/** Seconds of the Survey's clock per core pulled up. */
export const CORE_EVERY = 240;
export const RACK_BASE = 6, RACK_STEP = 2;
/** Bands of each kind in a core, and kinds per core. A core is always KINDS_PER * RUN bands. */
export const RUN = 3, KINDS_PER = 3;
/** Seconds per core the reader takes at level 1; each level after reads half again as fast. */
export const READ_EVERY = 1200;
/** The share of a core's tally the reader keeps; reading by hand keeps it all. */
export const AUTO_SHARE = 0.5;

export interface Stratum { id: string; name: string; hex: string; weight: number; value: number; rare?: boolean; lore?: string[] }

export const STRATA: Stratum[] = [
  { id: 'ash', name: 'Ash', hex: '#8c8a84', weight: 10, value: 1 },
  { id: 'glass', name: 'Glass', hex: '#bfe6f0', weight: 8, value: 1 },
  { id: 'salt', name: 'Salt', hex: '#ece6d2', weight: 8, value: 1 },
  { id: 'rust', name: 'Rust seam', hex: '#b85a24', weight: 6, value: 1.5 },
  { id: 'peat', name: 'Black peat', hex: '#3a3032', weight: 5, value: 1.5 },
  {
    id: 'road', name: 'Old road', hex: '#d8c890', weight: 1.1, value: 5, rare: true, lore: [
      'A white line, painted, forty metres down.',
      'Tyre tread in the tar. Going towards the bore.',
      'A road sign. The town on it is this one.',
      'Cats\' eyes, still catching the lamp.',
      'The road keeps going down after the core stops.',
    ],
  },
  {
    id: 'snow', name: 'A second snow', hex: '#ffffff', weight: 0.9, value: 5, rare: true, lore: [
      'Snow under the snow. It is still cold.',
      'Footprints in the second snow, pressed flat by the first.',
      'It fell before the town was built. It fell on the town.',
      'The second snow is black as well.',
      'Someone wrote a name in it. The core cut through the middle.',
    ],
  },
  {
    id: 'wrong', name: 'A band that shouldn\'t be there', hex: '#ff2a2a', weight: 0.45, value: 9, rare: true, lore: [
      'Warm.',
      'It is thinner each time we measure it, and the same thickness.',
      'The drill sounded different going through. Like a voice behind a door.',
      'It was not there when we pulled the core up. It was there in the rack.',
      'Our lamp, very small, in the band.',
    ],
  },
];
export const stratum = (id: string) => STRATA.find(k => k.id === id)!;

export interface SurveyState {
  started: boolean;
  seed: number; // per save: shapes the snow map
  clock: number; // seconds the Survey has run, the map's time
  coreProg: number; // fraction toward the next core
  rack: number; // cores waiting to be read
  rackLv: number;
  core: string[] | null; // the core being read: stratum ids, top to bottom
  read: number; // cores read
  tally: Record<string, number>; // stratum id -> runs read, weighted by value
  lore: string[]; // found lore lines, as 'stratum:index'
  last: string[]; // strata read from the last finished core
  heads: number[]; // tile index (y * MAP_W + x) of each bore head
  surveyed: number; // survey ever gathered
  reader: number; // core reader level, 0 = none
  readProg: number; // progress toward the reader's next core
  priceRef: number; // slow log10 income the Survey prices off (kept by stepChallenges, see slowRef), 0 = unset
}

const fresh = (): SurveyState => ({
  started: false, seed: Math.floor(Math.random() * 1e9), clock: 0, coreProg: 0, rack: 1, rackLv: 0, core: null,
  read: 0, tally: {}, lore: [], last: [], heads: [], surveyed: 0, reader: 0, readProg: 0, priceRef: 0,
});

const st = (s: GameState) => s.challenges.survey;

/* ---------- the snow map ---------- */

/** A small hash to 0..1, for per-save constants. */
const h01 = (seed: number, k: number) => {
  let x = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * How thick the ash falls on a tile at Survey time t: a floor plus three drifts that wander the field on
 * slow paths (hours). Same seed and time, same map, so offline steps agree with the open game.
 */
export function density(seed: number, t: number, x: number, y: number): number {
  let d = 0.3;
  for (let k = 0; k < 3; k++) {
    const p = 2600 + 5200 * h01(seed, k * 7 + 1), q = 3100 + 6100 * h01(seed, k * 7 + 2);
    const cx = 5.5 + 5.5 * Math.sin(t / p + 6.28 * h01(seed, k * 7 + 3));
    const cy = 3.5 + 3.5 * Math.sin(t / q + 6.28 * h01(seed, k * 7 + 4));
    const r = 1.6 + 1.4 * h01(seed, k * 7 + 5);
    const a = 0.7 + 0.6 * h01(seed, k * 7 + 6);
    d += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  }
  return d;
}
export const tileDensity = (s: GameState, tile: number, t = st(s).clock) => density(st(s).seed, t, tile % MAP_W, Math.floor(tile / MAP_W));

/** Survey per second from every bore head, at Survey time t. */
export function surveyRate(s: GameState, t = st(s).clock): number {
  let r = 0;
  for (const tile of st(s).heads) r += tileDensity(s, tile, t);
  return r;
}

/* ---------- payouts ---------- */

export const tallyTotal = (v: SurveyState) => Object.values(v.tally).reduce((n, x) => n + x, 0);
/** All ash from reading cores: the tallies, tapering (about x2 at the milestone, x8 after a week of steady reading). */
export const coreMult = (v: SurveyState) => 1 + 0.12 * Math.pow(tallyTotal(v), 0.45);
/** Shallow Bores from survey gathered, by log (about x2 at the milestone, under x3 after a week). */
export const zoneBonus = (v: SurveyState) => 1 + 0.25 * Math.log10(1 + v.surveyed);
/** Retired: the Survey's ash now comes from the cores alone. Always 1; kept so old readers still work. */
export const surveyAsh = (v: SurveyState) => (v ? 1 : 1);

export const rackSize = (s: GameState) => RACK_BASE + RACK_STEP * st(s).rackLv;
const liveLog = (s: GameState) => passiveRate(s).log10().toNumber();
/** sec seconds of the Survey's slow income: what an item costs. */
const income = (s: GameState, sec: number) => {
  const ref = st(s).priceRef > 0 ? st(s).priceRef : liveLog(s);
  return Decimal.max(1e7 * sec, Decimal.pow(10, ref).mul(sec)).floor();
};
/** The next bore head: a minute of slow income, 1.6x each to the sixth, then 3x each. */
export const headCost = (s: GameState) => {
  const n = st(s).heads.length;
  return income(s, 60 * Math.pow(1.6, Math.min(n, 6)) * Math.pow(3, Math.max(0, n - 6)));
};
/** A wider rack: 5 minutes of slow income, then 2.5x each. */
export const rackCost = (s: GameState) => income(s, 300 * Math.pow(2.5, st(s).rackLv));
/** The core reader: 10 minutes of slow income, then 3x each level. */
export const readerCost = (s: GameState) => income(s, 600 * Math.pow(3, st(s).reader));
/** Cores per second the reader gets through. */
export const readerRate = (s: GameState) => (st(s).reader ? (1 + 0.5 * (st(s).reader - 1)) / READ_EVERY : 0);

/* ---------- actions ---------- */

export function buyReader(s: GameState): boolean {
  const cost = readerCost(s);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  st(s).reader++;
  return true;
}

export function buyRack(s: GameState): boolean {
  const cost = rackCost(s);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  st(s).rackLv++;
  return true;
}

/** Buy a bore head and set it on an empty tile. */
export function placeHead(s: GameState, tile: number): boolean {
  const v = st(s);
  if (tile < 0 || tile >= MAP_W * MAP_H || v.heads.includes(tile)) return false;
  const cost = headCost(s);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  v.heads.push(tile);
  v.started = true;
  return true;
}

/** Move a bore head to an empty tile. Free; only ever tuning. */
export function moveHead(s: GameState, from: number, to: number): boolean {
  const v = st(s);
  const i = v.heads.indexOf(from);
  if (i < 0 || to < 0 || to >= MAP_W * MAP_H || v.heads.includes(to)) return false;
  v.heads[i] = to;
  return true;
}

const runAt = (c: string[]) => {
  for (let i = 0; i + RUN <= c.length; i++) if (c.slice(i, i + RUN).every(b => b === c[i])) return i;
  return -1;
};

/** A fresh core: three strata by weight (rarer ones less often), three bands each, with no run already made. */
export function makeCore(rng: Rng): string[] {
  const kinds: string[] = [];
  while (kinds.length < KINDS_PER) {
    const pool = STRATA.filter(k => !kinds.includes(k.id));
    let r = rng() * pool.reduce((n, k) => n + k.weight, 0);
    const pick = pool.find(k => (r -= k.weight) < 0) ?? pool[pool.length - 1];
    kinds.push(pick.id);
  }
  const bands = kinds.flatMap(k => Array(RUN).fill(k) as string[]);
  for (let tries = 0; tries < 50; tries++) {
    for (let i = bands.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bands[i], bands[j]] = [bands[j], bands[i]];
    }
    if (runAt(bands) < 0) break;
  }
  if (runAt(bands) >= 0) return kinds.flatMap(() => kinds); // interleaved: never a run
  return bands;
}

/** Take a core off the rack and lay it out to read. */
export function openCore(s: GameState, rng: Rng = Math.random): boolean {
  const v = st(s);
  if (v.core || v.rack < 1) return false;
  v.rack--;
  v.core = makeCore(rng);
  v.last = [];
  v.started = true;
  return true;
}

/** Read a run: its stratum's tally grows, and a rare one gives up its next lore line. */
function readRun(s: GameState, id: string, share = 1) {
  const v = st(s), k = stratum(id);
  v.tally[id] = (v.tally[id] ?? 0) + k.value * share;
  v.last.push(id);
  if (!k.lore) return;
  const n = v.lore.filter(l => l.startsWith(id + ':')).length;
  if (n >= k.lore.length) return;
  if (!v.lore.length) log(s, 'THE BORE BROUGHT UP SOMETHING THAT WAS NOT SNOW.', 'milestone', true);
  v.lore.push(`${id}:${n}`);
}

/** Swap band i with the band below it. Any run of three that forms is read and drops out; an empty core is finished. */
export function swapBands(s: GameState, i: number): boolean {
  const v = st(s), c = v.core;
  if (!c || i < 0 || i + 1 >= c.length || c[i] === c[i + 1]) return false;
  [c[i], c[i + 1]] = [c[i + 1], c[i]];
  let at;
  while ((at = runAt(c)) >= 0) readRun(s, c.splice(at, RUN)[0]);
  if (!c.length) { v.core = null; v.read++; }
  return true;
}

/** The reader takes a core off the rack and reads it whole, at AUTO_SHARE of the tally. */
function autoRead(s: GameState, rng: Rng) {
  const v = st(s);
  v.rack--;
  for (const id of new Set(makeCore(rng))) readRun(s, id, AUTO_SHARE);
  v.read++;
}

export const loreText = (key: string) => {
  const [id, n] = key.split(':');
  return stratum(id).lore![Number(n)];
};

/* ---------- module ---------- */

export const survey: ChallengeModule<SurveyState> = {
  id: 'survey',
  zone: 0,
  name: 'The Survey',
  tagline: 'Read the cores, and map where the snow falls thickest.',
  fresh,
  step: (s, dt, rng) => {
    const v = st(s);
    // Midpoint rate: the map drifts over hours, so this agrees between small and large steps.
    v.surveyed += surveyRate(s, v.clock + dt / 2) * dt;
    v.clock += dt;
    const cap = rackSize(s);
    if (v.rack < cap) {
      v.coreProg += dt / CORE_EVERY;
      const whole = Math.floor(v.coreProg);
      if (whole > 0) { v.rack = Math.min(cap, v.rack + whole); v.coreProg -= whole; }
      if (v.rack >= cap) v.coreProg = 0;
    }
    const rr = readerRate(s);
    if (rr > 0) {
      v.readProg += rr * dt;
      while (v.readProg >= 1 && v.rack > 0) { v.readProg -= 1; autoRead(s, rng); }
      if (v.rack < 1) v.readProg = Math.min(v.readProg, 1);
    }
  },
  mult: (s, t) => {
    const v = st(s);
    if (t === 'ash') return coreMult(v);
    if (t === 'zone0') return zoneBonus(v);
    return 1;
  },
  milestone: { text: 'Read 25 cores and place 6 bore heads', done: s => st(s).read >= 25 && st(s).heads.length >= 6 },
  level: s => st(s).read + st(s).heads.length,
};
