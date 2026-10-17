// The Drowned Stair: the zone 4 challenge. A well with warm water at the bottom that is not water.
// A bucket on a rope draws four kinds of water by depth; someone walks the spiral stair down the wall,
// one small room a landing; the well grants wishes for what is dropped in; lanterns breed in a tank;
// the water shows the station in another timeline. Everything accrues with dt, so time away agrees.
// Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import { log, passiveRate } from '../engine';
import type { GameState } from '../state';
import type { ChallengeModule } from './types';

// ---- shapes ----

export type Water = 0 | 1 | 2 | 3; // warm, black, sweet, singing
export type Item = 'ash' | 'zone3' | 'water' | 'breed' | 'wish' | 'eye';
export type PerkId = Item | 'candle' | 'steps'; // 'candle' only on old saves: candles now double a take
export type Choice = 'take' | 'leave' | 'candle';
export type WishKind = 'ash' | 'embers' | 'water';

export interface Room { n: number; item: Item; low: boolean }
export interface Lantern { g: number; c: number; p: number } // glow, colour, pace
/** A lantern as kept in the save: one small number, (glow * 64 + pace) * 8 + colour. */
export type Packed = number;
export interface StairEntry { n: number; text: string }

export interface StairState {
  t: number; // seconds this well has been open: the tide runs on it
  rope: number; // metres bought
  water: number[]; // held, by kind
  drawn: number; // all water ever drawn
  sent: boolean; // someone is on the stair
  landing: number; // landings reached
  walk: number; // seconds walked toward the next landing
  queue: Room[]; // rooms waiting for a choice
  perks: Partial<Record<PerkId, number>>;
  candles: number;
  stairLog: StairEntry[];
  given: number; // wish points ever dropped
  since: Record<WishKind, number>; // points toward the next wish of each kind
  wishes: number;
  boons: Record<WishKind, number>; // wishes granted of each kind
  tank: Packed[]; // at most TANK_MAX
  netted: number;
  born: number;
  breed: number; // progress to the next birth
  glow: number; // cached sum of glow
  hues: number; // cached count of distinct colours
  stills: number; // times the water was stilled for a new reflection
  reflId: number;
  found: number[]; // differences spotted in the current reflection
  spots: number; // all differences ever spotted
}

// ---- tables ----

export const WATERS = [
  { name: 'warm', rate: 0.015, at: 1, pts: 1, desc: 'Body heat, from nobody.' },
  { name: 'black', rate: 0.01, at: 4, pts: 2, desc: 'It does not reflect the lamp.' },
  { name: 'sweet', rate: 0.005, at: 8, pts: 6, desc: 'The well likes this one best.' },
  { name: 'singing', rate: 0.0025, at: 13, pts: 10, desc: 'Hums a note just under hearing.' },
];

export const ITEMS: Record<Item, { name: string; text: (w: number) => string }> = {
  ash: { name: 'a wet key', text: w => `All ash x${(1 + 0.1 * Math.sqrt(w)).toFixed(2)}` },
  zone3: { name: 'a jar of teeth', text: w => `Rampant Wells x${(1 + 0.12 * Math.sqrt(w)).toFixed(2)}` },
  water: { name: 'a hymnal swollen shut', text: w => `Water drawn x${(1 + 0.1 * tap(w)).toFixed(2)}` },
  breed: { name: 'a small shoe', text: w => `Lanterns breed x${(1 + 0.12 * tap(w)).toFixed(2)}` },
  wish: { name: 'a coin warm to the touch', text: w => `Wishes weigh x${(1 + 0.08 * tap(w)).toFixed(2)}` },
  eye: { name: 'a photograph of the station', text: w => `Reflections pay x${(1 + 0.1 * tap(w)).toFixed(2)}` },
};
const ITEM_IDS = Object.keys(ITEMS) as Item[];

const ROOMS = [
  'A chair facing the wall.', 'A bed, made, damp.', 'A coat on a hook, still warm.', 'A sink full of the warm water.',
  'A window onto rock.', 'A table laid for one.', 'A radio, tuned to breathing.', 'A clock without hands.',
  'Wallpaper with the station on it.', 'Shoes, lined up, pointing down.', 'A door painted on the stone.', 'A cot. A mobile turning.',
];

export const HUES = ['red', 'green', 'pale', 'gold', 'blue'];

export const TIDE = 7 * 3600; // one tide, high to high
export const REFLECT = 4 * 3600; // a new reflection forms
export const QUEUE_MAX = 5;
export const TANK_MAX = 256;
export const DIFFS = 5;

/** Linear for a while, then square-root: perks keep counting but matter less. */
export const tap = (w: number) => (w <= 16 ? w : 16 * Math.sqrt(w / 16));

const hash = (a: number, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const S = (s: GameState) => s.challenges.stair;
const perk = (s: GameState, p: PerkId) => S(s).perks[p] ?? 0;

// ---- the tide ----

/** Water level 0..1 at time t: starts high, low 3.5 hours later. */
export const tideAt = (t: number) => 0.5 + 0.5 * Math.cos((Math.PI * 2 * t) / TIDE);
export const tide = (s: GameState) => tideAt(S(s).t);
/** Low rooms show on the stair while the tide is out. */
export const lowTide = (s: GameState) => tide(s) < 0.25;
export const tideMult = (s: GameState) => 0.7 + 0.6 * tide(s);
/** The tide's mean level over [t, t + dt], exact, so one long step draws what many short ones do. */
function tideMean(t: number, dt: number) {
  if (dt < 1e-6) return tideAt(t);
  const w = (Math.PI * 2) / TIDE;
  return 0.5 + 0.5 * (Math.sin(w * (t + dt)) - Math.sin(w * t)) / (w * dt);
}
/** Seconds until the tide next turns (from rising to falling or back). */
export function tideTurn(s: GameState) {
  const ph = (S(s).t % TIDE) / TIDE;
  return (ph < 0.5 ? 0.5 - ph : 1 - ph) * TIDE;
}

// ---- the bucket ----

export const bandOpen = (s: GameState, k: number) => S(s).rope >= WATERS[k].at;
/** Water wishes feed the bucket only by a log, so water buying wishes buying water settles instead of running away. */
export const waterMult = (s: GameState) => (1 + 0.1 * tap(perk(s, 'water'))) * (1 + 0.6 * Math.log(1 + S(s).boons.water / 5));

/** Water of kind k per second at this moment's tide. */
export const drawRate = (s: GameState, k: number) => baseDraw(s, k) * tideMult(s);
function baseDraw(s: GameState, k: number) {
  const st = S(s), w = WATERS[k];
  return st.rope < w.at ? 0 : w.rate * (1 + 0.2 * (st.rope - w.at)) * waterMult(s);
}

/** Rope is ash and warm water: the ash stays a few minutes of income, the water paces the depth by time in the well. */
export const ropeCost = (s: GameState) => Decimal.max(1e9, passiveRate(s).mul(60 * Math.pow(1.04, S(s).rope))).floor();
export const ropeWater = (rope: number) => (rope < 1 ? 0 : Math.round(1.6 * Math.pow(rope, 1.6)));
export const canRope = (s: GameState) => s.ash.gte(ropeCost(s)) && S(s).water[0] >= ropeWater(S(s).rope);

export function buyRope(s: GameState): boolean {
  if (!canRope(s)) return false;
  s.ash = s.ash.sub(ropeCost(s));
  S(s).water[0] -= ropeWater(S(s).rope);
  S(s).rope++;
  return true;
}

/** Turn the winch by hand: a few seconds of drawing at once. */
export function haul(s: GameState): boolean {
  if (S(s).rope < 1) return false;
  draw(s, 3);
  return true;
}

function draw(s: GameState, dt: number, t0 = S(s).t) {
  const st = S(s), tm = 0.7 + 0.6 * tideMean(t0, dt);
  for (let k = 0; k < 4; k++) {
    const v = baseDraw(s, k) * tm * dt;
    st.water[k] += v;
    st.drawn += v;
  }
}

// ---- the stair ----

/** Seconds of walking from landing n to the next. */
export const landingTime = (n: number) => 150 * Math.pow(1 + n / 5, 1.5);
export const descentSpeed = (s: GameState) => 1 + 0.1 * tap(perk(s, 'steps'));
/** Warm water to light a candle in the room at landing n. */
export const candleCost = (n: number) => Math.round(4 * Math.pow(1 + n / 4, 1.6));
/** What each landing holds, fixed by its number so it is the same however you got there. */
export const roomAt = (n: number, low: boolean): Room => ({ n, item: ITEM_IDS[Math.floor(hash(n, 1) * ITEM_IDS.length)], low });
export const roomText = (r: Room) => ROOMS[Math.floor(hash(r.n, 2) * ROOMS.length)];

export function send(s: GameState): boolean {
  const st = S(s);
  if (st.sent || st.rope < 1) return false;
  st.sent = true;
  return true;
}

export function canChoose(s: GameState, c: Choice) {
  const r = S(s).queue[0];
  return !!r && (c !== 'candle' || S(s).water[0] >= candleCost(r.n));
}

/** How much an answer leaves: low rooms twice, and a candle doubles a take. */
export const choiceWeight = (r: Room, c: Choice) => (r.low ? 2 : 1) * (c === 'candle' ? 2 : 1);

/** Answer the room at the front of the queue. Take leaves the thing's perk, leave quickens the walk, a candle takes it twice over. */
export function choose(s: GameState, c: Choice): boolean {
  const st = S(s), r = st.queue[0];
  if (!r || !canChoose(s, c)) return false;
  const p: PerkId = c === 'leave' ? 'steps' : r.item;
  if (c === 'candle') { st.water[0] -= candleCost(r.n); st.candles++; }
  st.perks[p] = (st.perks[p] ?? 0) + choiceWeight(r, c);
  st.queue.shift();
  const text = c === 'take' ? `Took ${ITEMS[r.item].name}.` : c === 'leave' ? `Left ${ITEMS[r.item].name}. Walked on.` : `Lit a candle by ${ITEMS[r.item].name}. Took it in the light.`;
  st.stairLog.unshift({ n: r.n, text: (r.low ? 'Below the waterline. ' : '') + text });
  if (st.stairLog.length > 40) st.stairLog.length = 40;
  return true;
}

// ---- wishes ----

/** Points the nth wish of a kind needs. Ash and embers count by the drop; water by the bucket, steeper. */
export const wishNeed = (n: number, kind: WishKind = 'water') => (kind === 'water' ? Math.round(60 * Math.pow(n + 1, 1.5)) : 10 * (n + 1));
export const wishWeight = (s: GameState) => 1 + 0.08 * tap(perk(s, 'wish'));
export const ashDropCost = (s: GameState) => Decimal.max(1e9, passiveRate(s).mul(300)).floor();
export const EMBER_DROP = 5;
export const DROP_PTS = 10;
export const BOON_TEXT: Record<WishKind, string> = {
  ash: 'More ash, from somewhere.', embers: 'The wells pull harder.', water: 'The bucket comes up fuller.',
};
export const WISH_KINDS: WishKind[] = ['ash', 'embers', 'water'];

/** Each kind fills its own mark; passing it grants one wish of that kind. Points past the mark carry over. */
function give(s: GameState, kind: WishKind, pts: number) {
  const st = S(s);
  pts *= wishWeight(s);
  st.given += pts;
  st.since[kind] += pts;
  for (let n = 0; n < 1000 && st.since[kind] >= wishNeed(st.boons[kind], kind); n++) {
    st.since[kind] -= wishNeed(st.boons[kind], kind);
    st.boons[kind]++;
    st.wishes++;
  }
}

export function dropAsh(s: GameState): boolean {
  const cost = ashDropCost(s);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  give(s, 'ash', DROP_PTS);
  return true;
}

export function dropEmbers(s: GameState): boolean {
  if (s.embers < EMBER_DROP) return false;
  s.embers -= EMBER_DROP;
  give(s, 'embers', DROP_PTS);
  return true;
}

/** Pour all held water of one kind into the well. */
export function pour(s: GameState, k: number): boolean {
  const st = S(s), v = Math.floor(st.water[k]);
  if (v < 1) return false;
  st.water[k] -= v;
  give(s, 'water', v * WATERS[k].pts);
  return true;
}

/** How far toward the next wish of a kind; with no kind, the kind closest to its next wish. */
export const wishProgress = (s: GameState, kind?: WishKind): number => {
  const st = S(s);
  if (!kind) return Math.max(...WISH_KINDS.map(k => wishProgress(s, k)));
  return Math.max(0, Math.min(1, st.since[kind] / wishNeed(st.boons[kind], kind)));
};

// ---- lanterns ----

export const netCost = (s: GameState) => Math.round(8 * Math.pow(1 + S(s).netted / 2, 1.4));

export const packL = (l: Lantern): Packed => (l.g * 64 + Math.min(63, l.p)) * 8 + l.c;
/** Read a kept lantern; old saves kept them as objects. */
export const unpackL = (x: Packed | Lantern): Lantern => (typeof x === 'number' ? { g: Math.floor(x / 512), p: Math.floor(x / 8) % 64, c: x % 8 } : x);
export const lanterns = (st: StairState) => st.tank.map(unpackL);
const better = (a: Lantern, b: Lantern) => b.g - a.g || b.p - a.p;

function retank(st: StairState) {
  let g = 0;
  const seen = new Set<number>();
  for (const x of st.tank) { const l = unpackL(x); g += l.g; seen.add(l.c); }
  st.glow = g;
  st.hues = seen.size;
}

/** Old saves: pack the tank and keep the brightest TANK_MAX; turn the old swollen boons into wish counts. */
export function settle(st: StairState) {
  if (st.tank.length > TANK_MAX || st.tank.some(x => typeof x !== 'number')) {
    st.tank = st.tank.map(unpackL).sort(better).slice(0, TANK_MAX).map(packL);
    st.breed = 0;
    retank(st);
  }
  const b = st.boons, tot = b.ash + b.embers + b.water;
  if (tot > st.wishes + 1e-6 || WISH_KINDS.some(k => !Number.isInteger(b[k]))) {
    for (const k of WISH_KINDS) b[k] = Math.min(OLD_BOON_MAX, Math.floor(b[k] / Math.max(1, tot) * st.wishes));
    st.wishes = b.ash + b.embers + b.water;
    st.since = { ash: 0, embers: 0, water: 0 };
  }
}
const OLD_BOON_MAX = 30;

export function net(s: GameState): boolean {
  const st = S(s), cost = netCost(s);
  settle(st);
  if (!bandOpen(s, 1) || st.water[1] < cost || st.tank.length >= TANK_MAX) return false;
  st.water[1] -= cost;
  const n = st.netted++;
  st.tank.push(packL({ g: 1 + Math.floor(hash(n, 7) * 2), c: Math.floor(hash(n, 8) * HUES.length), p: 1 + Math.floor(hash(n, 9) * 3) }));
  retank(st);
  return true;
}

const BREED = 0.00004;
/** Births a second; none once the tank is full. */
export function breedRate(s: GameState) {
  const st = S(s), n = st.tank.length;
  if (n < 2 || n >= TANK_MAX) return 0;
  let pace = 0;
  for (const x of st.tank) pace += unpackL(x).p;
  return BREED * Math.sqrt(n - 1) * (pace / n / 2) * (1 + 0.12 * tap(perk(s, 'breed')));
}

/** A child of two lanterns: the brighter glow, sometimes brighter still, rarely a new colour. */
function birth(st: StairState) {
  const b = st.born++, n = st.tank.length;
  const a = unpackL(st.tank[Math.floor(hash(b, 11) * n)]), c = unpackL(st.tank[Math.floor(hash(b, 12) * n)]);
  const r = hash(b, 13), q = hash(b, 14);
  let g = Math.max(a.g, c.g);
  if (r < 0.3 / g) g++;
  else if (r > 0.88 && g > 1) g--;
  let p = Math.round((a.p + c.p) / 2);
  if (q < 0.2) p++;
  else if (q > 0.9 && p > 1) p--;
  const col = hash(b, 15) < 0.12 ? (a.c + 1 + Math.floor(hash(b, 16) * 4)) % HUES.length : hash(b, 17) < 0.5 ? a.c : c.c;
  st.tank.push(packL({ g, c: col, p }));
}

/** The tank lights Rampant Wells: quick at first, slow by the time it is full. */
export const tankMult = (st: StairState) => 1 + 0.6 * Math.pow(st.glow, 0.3) * (1 + 0.05 * st.hues);

// ---- reflections ----

export interface Feature { x: number; y: number; kind: number }
export interface Reflection { id: number; common: Feature[]; diffs: { f: Feature; side: 0 | 1 }[] }
export const REFL_W = 96;
export const REFL_H = 72;

export const reflIdAt = (st: StairState) => Math.floor(st.t / REFLECT) + st.stills;
export const reflLeft = (st: StairState) => REFLECT - (st.t % REFLECT);

/** The two pictures, from the reflection's number: shared features, and five that only one side has. */
export function reflection(id: number): Reflection {
  const r = (k: number) => hash(id * 131 + k, 31);
  const feat = (k: number): Feature => ({ x: 8 + Math.floor(r(k) * (REFL_W - 16)), y: 10 + Math.floor(r(k + 1) * (REFL_H - 24)), kind: Math.floor(r(k + 2) * 5) });
  const common: Feature[] = [];
  for (let i = 0; i < 6; i++) common.push(feat(i * 3));
  const diffs: Reflection['diffs'] = [];
  for (let i = 0; diffs.length < DIFFS && i < 60; i++) {
    const f = feat(100 + i * 3);
    if ([...common, ...diffs.map(d => d.f)].some(o => Math.abs(o.x - f.x) < 12 && Math.abs(o.y - f.y) < 10)) continue;
    diffs.push({ f, side: r(200 + i) < 0.5 ? 0 : 1 });
  }
  return { id, common, diffs };
}

/** Click at scene coords on either picture: spots the nearest unspotted difference within reach. */
export function spot(s: GameState, x: number, y: number): boolean {
  const st = S(s), ref = reflection(st.reflId);
  const i = ref.diffs.findIndex((d, j) => !st.found.includes(j) && Math.abs(d.f.x - x) <= 7 && Math.abs(d.f.y - y) <= 7);
  if (i < 0) return false;
  st.found.push(i);
  st.spots += 1 + 0.1 * tap(perk(s, 'eye'));
  return true;
}

export const stillCost = (s: GameState) => Math.round(15 * Math.pow(1.25, S(s).stills));
/** Still the water with singing water: a new reflection forms now. */
export function still(s: GameState): boolean {
  const st = S(s), c = stillCost(s);
  if (!bandOpen(s, 3) || st.water[3] < c) return false;
  st.water[3] -= c;
  st.stills++;
  st.reflId = reflIdAt(st);
  st.found = [];
  return true;
}

// ---- payouts ----

/** Differences seen, tapered by a square root. */
export const sightPow = (st: StairState) => Math.sqrt(st.spots);
const perkOf = (st: StairState, p: PerkId) => tap(st.perks[p] ?? 0);

/** Perks, boons and sight all pay by square roots: they keep counting and never run away. */
const rt = Math.sqrt;
export function stairMult(st: StairState, t: string): number {
  if (t === 'zone3') return (1 + 0.05 * perkOf(st, 'candle')) * (1 + 0.12 * rt(st.perks.zone3 ?? 0)) * (1 + 0.15 * rt(st.boons.embers))
    * (1 + 0.08 * rt(st.boons.water)) * tankMult(st) * (1 + 0.04 * sightPow(st));
  if (t === 'ash') return (1 + 0.1 * rt(st.perks.ash ?? 0)) * (1 + 0.1 * rt(st.boons.ash)) * (1 + 0.03 * sightPow(st));
  if (t === 'comfort') return 1 + 0.03 * rt(st.candles);
  return 1;
}

// ---- the module ----

export const stair: ChallengeModule<StairState> = {
  id: 'stair',
  zone: 3,
  name: 'The Drowned Stair',
  tagline: 'Lower the bucket, walk the stair, wish on the warm water.',
  fresh: () => ({
    t: 0, rope: 0, water: [0, 0, 0, 0], drawn: 0,
    sent: false, landing: 0, walk: 0, queue: [], perks: {}, candles: 0, stairLog: [],
    given: 0, since: { ash: 0, embers: 0, water: 0 }, wishes: 0, boons: { ash: 0, embers: 0, water: 0 },
    tank: [], netted: 0, born: 0, breed: 0, glow: 0, hues: 0,
    stills: 0, reflId: 0, found: [], spots: 0,
  }),
  step: (s, dt) => {
    const st = S(s);
    settle(st);
    draw(s, dt, st.t);
    st.t += dt;
    if (st.sent) {
      st.walk += dt * descentSpeed(s);
      while (st.queue.length < QUEUE_MAX && st.walk >= landingTime(st.landing)) {
        st.walk -= landingTime(st.landing);
        st.landing++;
        st.queue.push(roomAt(st.landing, lowTide(s)));
        if (st.landing === 12) log(s, 'THE STAIR TURNS LEFT AT THE TWELFTH LANDING. IT KEEPS TURNING.', 'milestone', true);
      }
      if (st.queue.length >= QUEUE_MAX) st.walk = Math.min(st.walk, landingTime(st.landing));
    }
    const br = breedRate(s);
    if (br > 0) {
      st.breed += dt * br;
      let n = 0;
      while (st.breed >= 1 && st.tank.length < TANK_MAX && n++ < 200) { st.breed -= 1; birth(st); }
      if (st.tank.length >= TANK_MAX) st.breed = 0;
      if (n) retank(st);
    }
    const id = reflIdAt(st);
    if (id !== st.reflId) { st.reflId = id; st.found = []; }
  },
  mult: (s, t) => stairMult(S(s), t),
  milestone: { text: 'Reach landing 12 and grant 3 wishes', done: s => S(s).landing >= 12 && S(s).wishes >= 3 },
  level: s => S(s).landing + S(s).wishes + S(s).tank.length,
};
