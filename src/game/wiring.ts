// The Compiler's board. Compilers make cycles; cycles buy wires and circuits that you lay on a grid.
// The Compiler core sends a signal through them, and whatever reaches a zone's port makes that zone
// work harder. Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import type { GameState } from './state';
import { patternMult } from './patterns';
import { tinctureMult } from './alchemy';

export const COLS = 24;
export const ROWS = 16;
export const CORE = { x: 1, y: 8 };
export const COMPILER = 6; // zone index of the Compiler

/** Ports down the right edge. Zones 8 and 9 sit past the Compiler and need the bus extended. */
export const PORTS: { zone: number; x: number; y: number; late?: boolean }[] = [
  { zone: 0, x: COLS - 1, y: 1 }, { zone: 1, x: COLS - 1, y: 3 }, { zone: 2, x: COLS - 1, y: 5 },
  { zone: 3, x: COLS - 1, y: 7 }, { zone: 4, x: COLS - 1, y: 9 }, { zone: 5, x: COLS - 1, y: 11 },
  { zone: 7, x: COLS - 1, y: 13, late: true }, { zone: 8, x: COLS - 1, y: 15, late: true },
];

export type PartKind = 'wire' | 'amp' | 'split' | 'relay';
export interface Part { kind: PartKind; tier: number }
export interface Wiring { cycles: number; cells: Record<string, Part>; tier: number; bus: boolean }

export const newWiring = (): Wiring => ({ cycles: 0, cells: {}, tier: 1, bus: false });

export const TIER_NAMES = ['Copper', 'Silver', 'Gold', 'Void'];
export const TIER_COLORS = ['#e07a3c', '#cfd8e6', '#ffd23b', '#b06bff'];
/** Cycles to learn each tier. Tier 1 is known from the start. */
export const TIER_COST = [0, 400, 8000, 160000];
export const BUS_COST = 25000;

export const PARTS: Record<PartKind, { name: string; base: number; desc: (t: number) => string }> = {
  wire: { name: 'Wire', base: 1, desc: t => `Carries the signal. Loses ${WIRE_LOSS[t - 1]} per tile.` },
  amp: { name: 'Amplifier', base: 30, desc: t => `Multiplies the signal by ${AMP[t - 1]}.` },
  split: { name: 'Splitter', base: 20, desc: t => `Feeds up to ${SPLIT[t - 1]} branches without dividing the signal.` },
  relay: { name: 'Relay', base: 45, desc: t => `Lifts a weak signal back up to ${RELAY[t - 1]}.` },
};
export const PART_KINDS: PartKind[] = ['wire', 'amp', 'split', 'relay'];
const WIRE_LOSS = [1, 0.5, 0.25, 0.1];
const AMP = [1.5, 2, 3, 5];
const SPLIT = [2, 3, 4, 4];
const RELAY = [8, 15, 30, 60];
export const CORE_SIGNAL = 10;

export const key = (x: number, y: number) => `${x},${y}`;
export const wiringOpen = (s: GameState) => s.zones[COMPILER].bought > 0;
export const portAt = (s: GameState, x: number, y: number) => PORTS.find(p => p.x === x && p.y === y && (!p.late || s.wiring.bus));
const fixedAt = (x: number, y: number) => (x === CORE.x && y === CORE.y) || PORTS.some(p => p.x === x && p.y === y);

/** Cycles per second: more Compilers, more cycles, with diminishing returns. */
export function cycleRate(s: GameState): number {
  if (!wiringOpen(s)) return 0;
  const z = s.zones[COMPILER];
  return (0.5 + 2 * Decimal.log10(z.amount.add(1)).toNumber() + 0.25 * z.bought) * patternMult(s, 'cycles') * tinctureMult(s, 'cycles');
}

/** What one part costs at a tier. Circuits get pricier the more of that kind you have laid. */
export function partCost(s: GameState, kind: PartKind, tier: number): number {
  const base = PARTS[kind].base * Math.pow(10, tier - 1);
  if (kind === 'wire') return base;
  const owned = Object.values(s.wiring.cells).filter(p => p.kind === kind).length;
  return Math.round(base * Math.pow(1.2, owned));
}

const valueOf = (s: GameState, p: Part) => partCost(s, p.kind, p.tier);

/**
 * Lay a part, or drop a part on top of one already there. Same kind, higher tier: upgraded in place,
 * paying only the difference. A different kind replaces it, refunding what was there.
 */
export function place(s: GameState, x: number, y: number, kind: PartKind, tier: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS || fixedAt(x, y) || tier > s.wiring.tier) return false;
  const k = key(x, y);
  const was = s.wiring.cells[k];
  if (was && was.kind === kind && was.tier >= tier) return false;
  // Price it as if the old part were gone, so replacing a circuit with itself doesn't count it twice.
  if (was) delete s.wiring.cells[k];
  const refund = was ? valueOf(s, was) : 0;
  const cost = partCost(s, kind, tier);
  if (s.wiring.cycles + refund < cost) { if (was) s.wiring.cells[k] = was; return false; }
  s.wiring.cycles += refund - cost;
  s.wiring.cells[k] = { kind, tier };
  edits++;
  return true;
}

/** Pull a part up. Everything is refunded in full, so rewiring is free to try. */
export function remove(s: GameState, x: number, y: number): boolean {
  const k = key(x, y);
  const was = s.wiring.cells[k];
  if (!was) return false;
  delete s.wiring.cells[k];
  s.wiring.cycles += valueOf(s, was);
  edits++;
  return true;
}

export function learnTier(s: GameState): boolean {
  const next = s.wiring.tier;
  if (next >= TIER_COST.length || s.wiring.cycles < TIER_COST[next]) return false;
  s.wiring.cycles -= TIER_COST[next];
  s.wiring.tier++;
  return true;
}

export function extendBus(s: GameState): boolean {
  if (s.wiring.bus || s.wiring.tier < 3 || s.wiring.cycles < BUS_COST) return false;
  s.wiring.cycles -= BUS_COST;
  s.wiring.bus = true;
  edits++;
  return true;
}

/** Bring every part up to the best known tier, cheapest first, while cycles last. */
export function upgradeAll(s: GameState): number {
  let n = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const todo = Object.entries(s.wiring.cells)
      .filter(([, p]) => p.tier < s.wiring.tier)
      .map(([k, p]) => ({ k, p, cost: partCost(s, p.kind, p.tier + 1) - valueOf(s, p) }))
      .sort((a, b) => a.cost - b.cost);
    const t = todo[0];
    if (!t || t.cost > s.wiring.cycles) break;
    const [x, y] = t.k.split(',').map(Number);
    if (!place(s, x, y, t.p.kind, t.p.tier + 1)) break;
    n++;
  }
  return n;
}

export interface Flow {
  /** Signal strength in each powered cell, by key. */
  strength: Record<string, number>;
  /** Edges the signal travels along, parent to child, for drawing pulses. */
  edges: { from: [number, number]; to: [number, number]; s: number }[];
  /** Signal that reached each zone's port. */
  ports: Record<number, number>;
}

const N4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Run the signal out from the core, breadth first, so every cell is fed by its nearest powered
 * neighbour and loops can't feed themselves. A cell that feeds several branches divides its signal
 * between them, unless it is a splitter.
 */
export function flow(s: GameState): Flow {
  const out: Flow = { strength: {}, edges: [], ports: {} };
  const cells = s.wiring.cells;
  const seen = new Set([key(CORE.x, CORE.y)]);
  let frontier: { x: number; y: number; sig: number; part: Part | null }[] = [{ ...CORE, sig: CORE_SIGNAL, part: null }];
  out.strength[key(CORE.x, CORE.y)] = CORE_SIGNAL;
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const c of frontier) {
      const kids: { x: number; y: number }[] = [];
      for (const [dx, dy] of N4) {
        const x = c.x + dx, y = c.y + dy, k = key(x, y);
        if (seen.has(k)) continue;
        if (cells[k] || portAt(s, x, y)) kids.push({ x, y });
      }
      const limit = c.part?.kind === 'split' ? SPLIT[c.part.tier - 1] : Infinity;
      const fed = kids.slice(0, limit);
      const share = c.part?.kind === 'split' ? c.sig : c.sig / Math.max(1, fed.length);
      for (const kid of fed) {
        const k = key(kid.x, kid.y);
        seen.add(k);
        const port = portAt(s, kid.x, kid.y);
        if (port) {
          out.ports[port.zone] = (out.ports[port.zone] ?? 0) + share;
          out.strength[k] = share;
          out.edges.push({ from: [c.x, c.y], to: [kid.x, kid.y], s: share });
          continue;
        }
        const p = cells[k];
        let sig = share;
        if (p.kind === 'wire') sig -= WIRE_LOSS[p.tier - 1];
        if (p.kind === 'amp') sig *= AMP[p.tier - 1];
        if (p.kind === 'relay') sig = Math.max(sig, RELAY[p.tier - 1]);
        if (sig <= 0) continue;
        out.strength[k] = sig;
        out.edges.push({ from: [c.x, c.y], to: [kid.x, kid.y], s: sig });
        next.push({ ...kid, sig, part: p });
      }
    }
    frontier = next;
  }
  return out;
}

// The board only changes when a part is laid or pulled, so the flow is cached per board and edit.
let edits = 0;
const cache = new WeakMap<object, { at: number; flow: Flow }>();
export function flowCached(s: GameState): Flow {
  const hit = cache.get(s.wiring);
  if (hit && hit.at === edits) return hit.flow;
  const f = flow(s);
  cache.set(s.wiring, { at: edits, flow: f });
  return f;
}

/** How much a port's signal multiplies its zone. Zone 1 feels it fully; deeper zones compound, so less. */
export function portMult(zone: number, signal: number): number {
  if (signal <= 0) return 1;
  // Square roots so a huge signal still pays, but a board can't run away with the whole cascade.
  return zone === 0 ? 1 + 0.6 * Math.sqrt(signal) : 1 + Math.sqrt(signal) / 7;
}

export const wiringMult = (s: GameState, zone: number) => portMult(zone, flowCached(s).ports[zone] ?? 0);
