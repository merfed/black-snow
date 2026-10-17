// The Syzygy: the zone 9 challenge, opened last. The Numogram is drawn as ten nodes; nodes 1-8 are
// the other eight challenges, node 9 is this one, node 0 is the gate. Wires laid along its syzygies,
// currents and gates carry a bonus scaled by the weaker end. Below it the iron dreams: a pilgrim walks
// a map of rooms that reshapes every night and brings back dreams, finds and pages for the dream log.
// A black sun eclipses the plate on a long cycle. Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import type { GameState } from '../state';
import type { ChallengeModule, MultTarget } from './types';
import { CHALLENGES } from './index';
import { log, passiveRate } from '../engine';

export interface SyzygyState {
  clock: number; // seconds of the Syzygy's own time; nights are counted on it
  seed: number;
  dreams: number;
  dreamsEver: number;
  night: number; // which dream map is up
  explored: number; // rooms walked tonight; past ROOMS the pilgrim wanders
  rooms: number; // rooms walked, ever
  finds: number; // relics brought back, kept forever
  pages: number; // pages written in the dream log
  pageNight: number; // the last night whose page is written
  wires: number; // wires bought (one comes free)
  links: Record<string, number>; // edge key -> wires laid on it
  lanterns: number;
  shades: number;
  lenses: number;
  sun: number; // seconds into the eclipse cycle: dark first, then totality
  nodes: number[]; // cached node strengths 0..9, refreshed in step and by actions
  gateOpen: boolean;
}

export const ZONE = 8;

/* ---------- the Numogram ---------- */

export type EdgeKind = 'syzygy' | 'current' | 'gate';
export interface Edge { a: number; b: number; kind: EdgeKind; name: string }

/** The five syzygies, the time-circuit currents that run out of them, and the cumulative gates. */
export const EDGES: Edge[] = [
  { a: 9, b: 0, kind: 'syzygy', name: 'Uttunul' },
  { a: 8, b: 1, kind: 'syzygy', name: 'Murrumur' },
  { a: 7, b: 2, kind: 'syzygy', name: 'Oddubb' },
  { a: 6, b: 3, kind: 'syzygy', name: 'Djynxx' },
  { a: 5, b: 4, kind: 'syzygy', name: 'Katak' },
  { a: 8, b: 7, kind: 'current', name: 'Surge' },
  { a: 1, b: 7, kind: 'current', name: 'Surge' },
  { a: 7, b: 5, kind: 'current', name: 'Hold' },
  { a: 2, b: 5, kind: 'current', name: 'Hold' },
  { a: 5, b: 1, kind: 'current', name: 'Sink' },
  { a: 4, b: 1, kind: 'current', name: 'Sink' },
  { a: 2, b: 3, kind: 'gate', name: 'Gt-3' },
  { a: 5, b: 6, kind: 'gate', name: 'Gt-15' },
  { a: 7, b: 1, kind: 'gate', name: 'Gt-28' },
  { a: 8, b: 9, kind: 'gate', name: 'Gt-36' },
];
/** Gt-28 runs 7 to 1 like a Surge does, so the key carries the kind. */
export const edgeKey = (e: Edge) => `${e.kind[0]}${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
export const edgeByKey = (k: string) => EDGES.find(e => edgeKey(e) === k);
const KIND_WEIGHT: Record<EdgeKind, number> = { syzygy: 1.25, current: 1, gate: 0.85 };

/** What a node of strength comes from: a level, tapered so wildly different scales still meet. */
export const strength = (level: number) => Math.log2(1 + Math.max(0, level));

/** This challenge's own progress, for node 9. Kept apart from level() so it never feeds itself. */
export const ownLevel = (z: SyzygyState) => z.rooms / 10 + z.pages * 3 + z.finds;

/** Read every node's strength into the cache. Calls the other modules' level(), never their mult. */
export function refreshNodes(s: GameState) {
  const z = s.challenges.syzygy;
  const n = Array(10).fill(0);
  for (const c of CHALLENGES) if (c.id !== 'syzygy' && c.zone >= 0 && c.zone < 8) n[c.zone + 1] = strength(c.level(s));
  n[9] = strength(ownLevel(z));
  n[0] = z.gateOpen ? strength(30 + z.pages * 3) : 0;
  z.nodes = n;
}

/** How hard one wired edge pulls: the weaker end, braided wires adding a square root's worth. */
export function edgeWeight(z: SyzygyState, e: Edge): number {
  const t = z.links[edgeKey(e)] ?? 0;
  if (t <= 0) return 0;
  const w = Math.min(z.nodes[e.a] ?? 0, z.nodes[e.b] ?? 0);
  return w * Math.sqrt(t) * KIND_WEIGHT[e.kind] * (chapters(z) >= 3 ? 1.25 : 1);
}

export const liveCurrents = (z: SyzygyState) => EDGES.filter(e => edgeWeight(z, e) > 0).length;
export const wiresLaid = (z: SyzygyState) => Object.values(z.links).reduce((n, t) => n + t, 0);
export const wiresTotal = (z: SyzygyState) => z.wires + (chapters(z) >= 4 ? 1 : 0);
export const wiresFree = (z: SyzygyState) => wiresTotal(z) - wiresLaid(z);
export const wireCost = (z: SyzygyState) => Math.round(120 * Math.pow(2.4, z.wires - 1));

/** Lay a wire along a, b (another one on the same edge braids it). */
export function route(s: GameState, a: number, b: number): boolean {
  const z = s.challenges.syzygy;
  const e = EDGES.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!e || wiresFree(z) <= 0) return false;
  const k = edgeKey(e);
  z.links = { ...z.links, [k]: (z.links[k] ?? 0) + 1 };
  refreshNodes(s);
  return true;
}
export function routeEdge(s: GameState, k: string): boolean {
  const e = edgeByKey(k);
  return !!e && route(s, e.a, e.b);
}

/** Take one wire back off an edge. Free, so rerouting costs nothing. */
export function cut(s: GameState, k: string): boolean {
  const z = s.challenges.syzygy;
  if (!z.links[k]) return false;
  const links = { ...z.links, [k]: z.links[k] - 1 };
  if (links[k] <= 0) delete links[k];
  z.links = links;
  return true;
}

export function buyWire(s: GameState): boolean {
  const z = s.challenges.syzygy;
  const c = wireCost(z);
  if (z.dreams < c) return false;
  z.dreams -= c;
  z.wires++;
  return true;
}

/* ---------- the dream ---------- */

export const COLS = 7;
export const ROWS = 5;
export const ROOMS = COLS * ROWS;
export const NIGHT = 3 * 3600; // a new map every station night
export type RoomKind = 'hall' | 'chamber' | 'relic' | 'page';
const YIELD: Record<RoomKind, number> = { hall: 10, chamber: 30, relic: 15, page: 50 };
const WANDER_YIELD = 6.4; // dreams per room-length walked once the map is all known

export interface DreamMap {
  /** Cells in the order the pilgrim walks them (breadth first from the door). */
  order: number[];
  /** Kind of the k-th room walked. */
  kinds: RoomKind[];
  /** Doors between cells, as [cell, cell]. */
  doors: [number, number][];
}

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let mapCache: { key: string; map: DreamMap } | null = null;

/** Tonight's map: a random maze over the grid, seeded by the save and the night. */
export function dreamMap(seed: number, night: number): DreamMap {
  const key = `${seed}:${night}`;
  if (mapCache?.key === key) return mapCache.map;
  const rng = mulberry(seed * 9973 + night * 7919 + 1);
  const start = Math.floor(ROWS / 2) * COLS;
  const seen = new Set([start]);
  const stack = [start];
  const doors: [number, number][] = [];
  const adj: number[][] = Array.from({ length: ROOMS }, () => []);
  while (stack.length) {
    const c = stack[stack.length - 1];
    const x = c % COLS, y = Math.floor(c / COLS);
    const ns = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS).map(([nx, ny]) => ny * COLS + nx).filter(n => !seen.has(n));
    if (!ns.length) { stack.pop(); continue; }
    const n = ns[Math.floor(rng() * ns.length)];
    seen.add(n); stack.push(n); doors.push([c, n]); adj[c].push(n); adj[n].push(c);
  }
  const order = [start];
  for (let i = 0; i < order.length; i++) for (const n of adj[order[i]]) if (!order.includes(n)) order.push(n);
  const kinds: RoomKind[] = order.map((_, k) => {
    if (k === 0) return 'hall';
    const r = rng();
    return r < 0.08 ? 'relic' : r < 0.38 ? 'chamber' : 'hall';
  });
  kinds[Math.floor(ROOMS * 0.4 + rng() * (ROOMS * 0.6 - 1))] = 'page';
  const map = { order, kinds, doors };
  mapCache = { key, map };
  return map;
}

/** Rooms a second. Lanterns and the first chapter quicken the pilgrim. */
export const pilgrimSpeed = (z: SyzygyState) => (1 / 60) * (1 + 0.5 * z.lanterns) * (chapters(z) >= 1 ? 1.5 : 1);
/** What every room's dreams are multiplied by. */
export const dreamMult = (z: SyzygyState) =>
  (1 + 0.2 * Math.sqrt(z.finds)) * (totality(z) ? 2 : 1) * (1 + 0.1 * Math.max(0, chapters(z) - 6));
export const wanderMult = (z: SyzygyState) => chapters(z) >= 5 ? 2 : 1;

export function lanternCost(s: GameState): Decimal {
  return Decimal.max(1e9, passiveRate(s).mul(120 * Math.pow(1.9, s.challenges.syzygy.lanterns))).floor();
}
export function buyLantern(s: GameState): boolean {
  const c = lanternCost(s);
  if (s.ash.lt(c)) return false;
  s.ash = s.ash.sub(c);
  s.challenges.syzygy.lanterns++;
  return true;
}

/** Walk the pilgrim d seconds through tonight's map (no night boundary inside d). */
function walk(s: GameState, d: number) {
  const z = s.challenges.syzygy;
  const before = z.explored;
  const after = before + pilgrimSpeed(z) * d;
  const dm = dreamMult(z);
  if (before < ROOMS) {
    const map = dreamMap(z.seed, z.night);
    const hi = Math.min(ROOMS, Math.floor(after));
    for (let k = Math.floor(before); k < hi; k++) {
      const kind = map.kinds[k];
      z.rooms++;
      if (kind === 'relic') z.finds++;
      if (kind === 'page' && z.pageNight < z.night) writePage(s);
      add(z, YIELD[kind] * dm);
    }
  }
  const wander = after - Math.max(before, ROOMS);
  if (wander > 0) add(z, wander * WANDER_YIELD * dm * wanderMult(z));
  z.explored = after;
}
const add = (z: SyzygyState, n: number) => { z.dreams += n; z.dreamsEver += n; };

/* ---------- the black sun ---------- */

export const TOTALITY = 20 * 60;
export const DARK = 6 * 3600 - TOTALITY;
/** Seconds of totality: shades stretch it, the second chapter more. */
export const totalityLen = (z: SyzygyState) => TOTALITY * (1 + 0.3 * z.shades) * (chapters(z) >= 2 ? 1.5 : 1);
/** Seconds between totalities: lenses bring the next one sooner. */
export const darkLen = (z: SyzygyState) => DARK / (1 + 0.2 * z.lenses);
export const totality = (z: SyzygyState) => z.sun >= darkLen(z);
/** Seconds until the next totality begins (0 during one), and seconds left of one. */
export const untilTotality = (z: SyzygyState) => Math.max(0, darkLen(z) - z.sun);
export const totalityLeft = (z: SyzygyState) => Math.max(0, darkLen(z) + totalityLen(z) - z.sun);
/** How much every zone is multiplied by during totality. */
export const totalityMult = (z: SyzygyState) => 1.2 + 0.04 * Math.sqrt(z.shades + z.lenses) + (chapters(z) >= 2 ? 0.1 : 0);

export const shadeCost = (z: SyzygyState) => Math.round(300 * Math.pow(1.9, z.shades));
export function lensCost(s: GameState): Decimal {
  return Decimal.max(1e10, passiveRate(s).mul(600 * Math.pow(2.2, s.challenges.syzygy.lenses))).floor();
}
export function buyShade(s: GameState): boolean {
  const z = s.challenges.syzygy;
  const c = shadeCost(z);
  if (z.dreams < c) return false;
  z.dreams -= c;
  z.shades++;
  return true;
}
export function buyLens(s: GameState): boolean {
  const c = lensCost(s);
  if (s.ash.lt(c)) return false;
  s.ash = s.ash.sub(c);
  s.challenges.syzygy.lenses++;
  return true;
}

/* ---------- the dream log ---------- */

export const PAGES_PER_CHAPTER = 7;
export const chapters = (z: SyzygyState) => Math.floor(z.pages / PAGES_PER_CHAPTER);
export const CHAPTERS: { title: string; perk: string }[] = [
  { title: 'The Waking Stair', perk: 'The pilgrim walks half again as fast.' },
  { title: 'Smoked Glass', perk: 'Totality lasts half again as long, and presses a little harder.' },
  { title: 'Red Thread', perk: 'Every current weighs a quarter more.' },
  { title: 'The Second Body', perk: 'One more wire, for nothing.' },
  { title: 'Sleepwalking', perk: 'Wandering a known map brings back twice the dreams.' },
  { title: 'Channel Thirteen', perk: 'The tape with no label is on the shelf. It was always on the shelf.' },
];
export const TAPE13 = 'relay';

const F_A = ['A corridor', 'The pool', 'A stair', 'The kiln', 'A television', 'The siren tower', 'A door', 'The well', 'My bed', 'The snow', 'A choir', 'The Compiler'];
const F_B = ['that goes down', 'full of warm ash', 'with nine steps', 'left on all night', 'that hums in tens', 'under the floor', 'facing the wrong way', 'that knows my name', 'made of murmurs', 'counting backwards', 'with the lights off', 'where the iron sleeps'];
const F_C = ['I was already there.', 'Someone had tidied it.', 'It was warmer than the station.', 'Nine and zero were holding hands.', 'I did not look up.', 'The sun was black and nobody minded.', 'I woke before I arrived.', 'It was the same as last night, rearranged.', 'There was a page left open.', 'It had been waiting since the first shaft.'];

/** The fragment written on page n. */
export function fragment(seed: number, n: number): string {
  const r = mulberry(seed * 31 + n * 104729 + 7);
  const p = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  return `${p(F_A)} ${p(F_B)}. ${p(F_C)}`;
}

function writePage(s: GameState) {
  const z = s.challenges.syzygy;
  z.pages++;
  z.pageNight = z.night;
  if (chapters(z) >= 6 && !s.tapes.includes(TAPE13)) s.tapes.push(TAPE13);
}

/* ---------- the gate ---------- */

export const GATE_LEVEL = 6;
export const GATE_CURRENTS = 3;
export const GATE_DREAMS = 3000;

export interface Offering { zone: number; name: string; level: number; done: boolean; ok: boolean }
/** One offering from each zone's system: its milestone reached, and its level at GATE_LEVEL. */
export function offerings(s: GameState): Offering[] {
  return CHALLENGES.filter(c => c.id !== 'syzygy').map(c => {
    const level = c.level(s), done = c.milestone.done(s);
    return { zone: c.zone, name: c.name, level, done, ok: done && level >= GATE_LEVEL };
  });
}
export const gateCost = (s: GameState) => ({ dreams: GATE_DREAMS, ash: Decimal.max(1e15, passiveRate(s).mul(1800)).floor() });
export const gateReady = (s: GameState) => offerings(s).every(o => o.ok) && liveCurrents(s.challenges.syzygy) >= GATE_CURRENTS;

export function openGate(s: GameState): boolean {
  const z = s.challenges.syzygy;
  const c = gateCost(s);
  if (z.gateOpen || !gateReady(s) || z.dreams < c.dreams || s.ash.lt(c.ash)) return false;
  z.dreams -= c.dreams;
  s.ash = s.ash.sub(c.ash);
  z.gateOpen = true;
  refreshNodes(s);
  log(s, 'THE GATE OPENS. NINE TOUCHES ZERO. SOMETHING BELOW TURNS OVER IN ITS SLEEP.', 'milestone', true);
  return true;
}

/* ---------- the module ---------- */

const fresh = (): SyzygyState => ({
  clock: 0, seed: Math.floor(Math.random() * 1e6), dreams: 0, dreamsEver: 0, night: 0, explored: 0, rooms: 0, finds: 0,
  pages: 0, pageNight: -1, wires: 1, links: {}, lanterns: 0, shades: 0, lenses: 0,
  sun: DARK - 3600, // the first totality comes an hour after the gate is found
  nodes: Array(10).fill(0), gateOpen: false,
});

function step(s: GameState, dt: number) {
  const z = s.challenges.syzygy;
  refreshNodes(s);
  let left = dt;
  while (left > 0) {
    const edge = (z.night + 1) * NIGHT - z.clock;
    const d = Math.min(left, edge);
    walk(s, d);
    z.clock += d;
    left -= d;
    if (z.clock >= (z.night + 1) * NIGHT - 1e-9) { z.night = Math.floor(z.clock / NIGHT + 1e-9); z.explored = 0; }
  }
  z.sun += dt;
  const cycle = darkLen(z) + totalityLen(z);
  if (z.sun >= cycle) z.sun %= cycle;
}

function mult(s: GameState, t: MultTarget): number {
  const z = s.challenges.syzygy;
  if (t === 'zones') return totality(z) ? totalityMult(z) : 1;
  if (t === 'ash') {
    let sum = 0;
    for (const e of EDGES) sum += edgeWeight(z, e);
    return 1 + 0.35 * sum;
  }
  if (t.startsWith('zone')) {
    const node = Number(t.slice(4)) + 1; // zone index i is node i+1; Plex (zone 8) is node 9
    let m = 1;
    for (const e of EDGES) if (e.a === node || e.b === node) m *= 1 + 0.1 * edgeWeight(z, e);
    return m;
  }
  return 1;
}

export const syzygy: ChallengeModule<SyzygyState> = {
  id: 'syzygy',
  zone: ZONE,
  name: 'The Syzygy',
  tagline: 'Route the currents, open the gate, keep the dream log.',
  fresh,
  step,
  mult,
  milestone: { text: 'Open the gate', done: s => s.challenges.syzygy.gateOpen },
  level: s => {
    const z = s.challenges.syzygy;
    return liveCurrents(z) + z.pages + (z.gateOpen ? 10 : 0);
  },
};
