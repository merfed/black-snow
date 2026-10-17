// The Seal: the zone 5 challenge, in the Vacuum Lock's box. A hatch holds something down. Its wheel is a
// safe dial: each number is found by feel, and every tier of the lock that opens pays a burst of ash and
// a permanent bonus, and asks for a wax seal. Seals are drawn on a 7x7 grid; their symmetry and their
// Numogram digit decide what they strengthen. A three-chamber airlock cycles by itself, turning ash into
// void ash and frost into rime. Frost grows on the walls of a small garden by a crystal automaton.
// Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import { log, passiveRate } from '../engine';
import type { GameState } from '../state';
import type { ChallengeModule, MultTarget } from './types';

export const SEAL_ZONE = 4;

// ---- state ----

export type Stance = 'ash' | 'split' | 'frost';
export interface PressedSeal { bits: string } // 49 chars of '0'/'1', row by row

export interface SealState {
  seed: number; // per save: picks the combinations
  tier: number; // tiers of the lock opened
  found: number[]; // numbers of the current tier's combination found so far
  dial: number; // where the dial was left, 0..DIAL-1
  seals: PressedSeal[];
  voidAsh: number;
  rime: number;
  frost: number;
  stance: Stance;
  phase: number; // airlock cycle position, 0..3 (cosmetic)
  pumps: number;
  ear: number; // stethoscope levels: the twitch reaches further
  garden: string; // GW*GH chars: '.' bare wall, '*' frost, 'o' seed
  gardenT: number; // seconds banked toward the next generation
  crystals: number; // grown on the walls, waiting to be harvested
  harvests: number;
  seedUps: number;
  cold: number; // faster growth, levels
  hand: number; // a patient hand on the wheel: finds numbers by itself, slowly
  handT: number; // seconds toward the hand's next number
}

export const DIAL = 40;
export const GW = 16, GH = 12;
const bare = () => '.'.repeat(GW * GH);

const fresh = (): SealState => ({
  seed: Math.floor(Math.random() * 2147483647), tier: 0, found: [], dial: 0, seals: [], voidAsh: 0, rime: 0, frost: 0,
  stance: 'ash', phase: 0, pumps: 0, ear: 0, garden: bare(), gardenT: 0, crystals: 0, harvests: 0, seedUps: 0, cold: 0,
  hand: 0, handT: 0,
});

const st = (s: GameState) => s.challenges.seal;

// ---- the combination ----

/** A small integer hash, so each save has its own combinations. */
function hash(a: number, b: number, c: number) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (c + 0x165667b1), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deeper tiers have longer combinations: 3, 3, 4, 4, 5, ... */
export const comboLength = (tier: number) => 3 + Math.floor(tier / 2);

export function combination(seed: number, tier: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < comboLength(tier); k++) {
    let n = hash(seed, tier, k) % DIAL;
    if (k > 0 && Math.abs(n - out[k - 1]) < 4) n = (n + 17) % DIAL; // never next door to the last one
    out.push(n);
  }
  return out;
}

const circ = (a: number, b: number) => { const d = Math.abs(((a - b) % DIAL + DIAL) % DIAL); return Math.min(d, DIAL - d); };
/** How far the twitch reaches, in dial marks. */
export const earReach = (s: GameState) => 5 + 8 * (1 - Math.pow(0.8, st(s).ear)) + 0.2 * st(s).ear;
/** Odd numbers catch turning right, even ones turning left, like an old safe. */
export const wantDir = (k: number) => (k % 2 === 0 ? 1 : -1);
export const comboDone = (s: GameState) => st(s).found.length >= comboLength(st(s).tier);
export const target = (s: GameState) => (comboDone(s) ? null : combination(st(s).seed, st(s).tier)[st(s).found.length]);

/** How hard the meter twitches with the dial at pos: 0 far away, 1 on the number, with a clear kick on the number itself. */
export function feel(s: GameState, pos: number): number {
  const t = target(s);
  if (t === null) return 0;
  const d = circ(pos, t);
  return 0.8 * Math.max(0, 1 - d / earReach(s)) ** 2 + (d === 0 ? 0.2 : 0);
}

/** Void ash the wheel needs to bleed the next tier open. */
export const tierCost = (tier: number) => Math.round(200 * Math.pow(3.6, tier));
/** Void ash a rest that does not catch costs: guessing every mark is slow, reading the meter is nearly free. The stethoscope softens it. */
export const restCost = (s: GameState) => Math.max(1, Math.round(0.03 * tierCost(st(s).tier) * Math.pow(0.85, st(s).ear)));
export const canRest = (s: GameState) => st(s).voidAsh >= restCost(s);

/**
 * Let the dial rest at pos after turning in dir. If it sits on the number, turned the right way, it catches.
 * A rest needs restCost void ash in hand; it is spent only when the rest does not catch.
 */
export function restDial(s: GameState, pos: number, dir: number): boolean {
  const c = st(s);
  c.dial = ((Math.round(pos) % DIAL) + DIAL) % DIAL;
  const t = target(s);
  if (t === null || !canRest(s)) return false;
  if (c.dial !== t || Math.sign(dir) !== wantDir(c.found.length)) { c.voidAsh -= restCost(s); return false; }
  c.found.push(t);
  return true;
}

/** Seconds the patient hand takes to find one number, by its level. */
export const handTime = (lv: number) => (lv <= 0 ? Infinity : 1800 / (1 + 0.5 * (lv - 1)));
export const handCost = (c: SealState) => Math.round(300 * Math.pow(3, c.hand));
export function buyHand(s: GameState): boolean {
  const c = st(s), cost = handCost(c);
  if (c.voidAsh < cost) return false;
  c.voidAsh -= cost;
  c.hand++;
  return true;
}
/** The hand works on its own while a number is still missing; it does not bank time once the combination is done. */
function stepHand(s: GameState, dt: number) {
  const c = st(s), ht = handTime(c.hand);
  if (!c.hand) return;
  if (comboDone(s)) { c.handT = Math.min(c.handT, ht); return; }
  c.handT += dt;
  while (c.handT >= ht && !comboDone(s)) { c.handT -= ht; c.found.push(target(s)!); }
  if (comboDone(s)) c.handT = Math.min(c.handT, ht);
}
/** Seconds of income the burst pays for the tier just opened. */
export const burstSeconds = (tier: number) => 600 * (tier + 1);
export const burstFor = (s: GameState) => Decimal.max(1e6, passiveRate(s).mul(burstSeconds(st(s).tier)));

export function turnWheel(s: GameState): boolean {
  const c = st(s), cost = tierCost(c.tier);
  if (!comboDone(s) || c.voidAsh < cost) return false;
  const burst = burstFor(s);
  c.voidAsh -= cost;
  c.tier++;
  c.found = [];
  s.ash = s.ash.add(burst);
  s.ashThisRun = s.ashThisRun.add(burst);
  s.lifetimeAsh = s.lifetimeAsh.add(burst);
  if (c.tier === 3) log(s, 'THE THIRD TURN. SOMETHING BELOW THE HATCH SHIFTS ITS WEIGHT.', 'milestone', true);
  return true;
}

// ---- seals ----

export const SEAL_N = 7;
export type SymId = 'mirror' | 'flip' | 'half' | 'turn' | 'cross';
export const SYMS: { id: SymId; name: string; map: (x: number, y: number) => [number, number] }[] = [
  { id: 'mirror', name: 'Mirror', map: (x, y) => [6 - x, y] },
  { id: 'flip', name: 'Flip', map: (x, y) => [x, 6 - y] },
  { id: 'half', name: 'Half-turn', map: (x, y) => [6 - x, 6 - y] },
  { id: 'turn', name: 'Quarter-turn', map: (x, y) => [6 - y, x] },
  { id: 'cross', name: 'Diagonal', map: (x, y) => [y, x] },
];

export const litCount = (bits: string) => { let n = 0; for (const ch of bits) if (ch === '1') n++; return n; };

/** For each symmetry, the share of lit pixels whose image is lit too. */
export function sealSyms(bits: string): Record<SymId, number> {
  const out = {} as Record<SymId, number>;
  const lit = litCount(bits);
  for (const sym of SYMS) {
    let m = 0;
    for (let y = 0; y < SEAL_N; y++) for (let x = 0; x < SEAL_N; x++) {
      if (bits[y * SEAL_N + x] !== '1') continue;
      const [u, v] = sym.map(x, y);
      if (bits[v * SEAL_N + u] === '1') m++;
    }
    out[sym.id] = lit ? m / lit : 0;
  }
  return out;
}

/** The Numogram digit: lit pixels reduced to one digit, 1..9 (0 for a blank seal). */
export const digitOf = (bits: string) => { const n = litCount(bits); return n ? 1 + ((n - 1) % 9) : 0; };

/** Digit d names zone d; the ninth, the Plex, reaches all ash. */
export const sealTarget = (d: number): MultTarget => (d === 9 ? 'ash' : `zone${d - 1}` as MultTarget);

/** A seal's strength: symmetry squared, and a little more for the ninth digit. */
export function sealPower(bits: string): number {
  const d = digitOf(bits);
  if (!d) return 0;
  const sy = sealSyms(bits);
  const score = SYMS.reduce((n, x) => n + sy[x.id], 0) / SYMS.length;
  return (0.2 + 0.8 * score * score) * (d === 9 ? 1.6 : 1);
}

export const sealsPending = (s: GameState) => Math.max(0, st(s).tier - st(s).seals.length);
export const validBits = (bits: string) => bits.length === SEAL_N * SEAL_N && /^[01]+$/.test(bits) && litCount(bits) > 0;

export function pressSeal(s: GameState, bits: string): boolean {
  if (!sealsPending(s) || !validBits(bits)) return false;
  st(s).seals.push({ bits });
  return true;
}

export const REPRESS_COST = 20;
/** Melt a pressed seal and press it again with a new design. Costs rime. */
export function repressSeal(s: GameState, i: number, bits: string): boolean {
  const c = st(s);
  if (!c.seals[i] || !validBits(bits) || c.rime < REPRESS_COST) return false;
  c.rime -= REPRESS_COST;
  c.seals[i] = { bits };
  return true;
}

/** Summed seal power per target, kept up to date lazily: seals change rarely, mult is called often. */
let powCache: { key: string; pow: Partial<Record<MultTarget, number>> } = { key: '', pow: {} };
function sealPowers(c: SealState) {
  const key = c.seals.map(x => x.bits).join();
  if (key !== powCache.key) {
    const pow: Partial<Record<MultTarget, number>> = {};
    for (const x of c.seals) { const t = sealTarget(digitOf(x.bits)); pow[t] = (pow[t] ?? 0) + sealPower(x.bits); }
    powCache = { key, pow };
  }
  return powCache.pow;
}
/** What the pressed seals give a target. Tapers as seals stack up. */
export const sealMult = (c: SealState, t: MultTarget) => powerMult(t, sealPowers(c)[t] ?? 0);
/** Seal power p on target t as a multiplier. */
export const powerMult = (t: MultTarget, p: number) => (p ? 1 + (t === 'ash' ? 0.45 : 0.5) * Math.pow(p, 0.8) : 1);

// ---- the airlock ----

export const STANCES: { id: Stance; name: string; note: string }[] = [
  { id: 'ash', name: 'Ash', note: 'all ash: void ash' },
  { id: 'split', name: 'Both', note: 'half and half' },
  { id: 'frost', name: 'Frost', note: 'all frost: rime' },
];
const share = (stance: Stance) => (stance === 'ash' ? [1, 0] : stance === 'frost' ? [0, 1] : [0.5, 0.5]);
/** Seconds for one full cycle of the three chambers. */
export const cycleLen = (c: SealState) => 24 / airlockSpeed(c);
/** Throughput: pumps and fifth-digit seals (the Vacuum Lock's own number). */
export const airlockSpeed = (c: SealState) => (1 + 0.35 * c.pumps) * sealMult(c, 'zone4');
export const voidRate = (c: SealState) => 0.5 * airlockSpeed(c) * share(c.stance)[0];
/** Frost the airlock can take in a second; half of it comes out as rime. */
export const frostIntake = (c: SealState) => 1 * airlockSpeed(c) * share(c.stance)[1];
export const RIME_PER_FROST = 0.5;

export function setStance(s: GameState, stance: Stance): boolean {
  if (!STANCES.some(x => x.id === stance)) return false;
  st(s).stance = stance;
  return true;
}

export const pumpCost = (c: SealState) => Math.round(30 * Math.pow(2, c.pumps));
export function buyPump(s: GameState): boolean {
  const c = st(s), cost = pumpCost(c);
  if (c.rime < cost) return false;
  c.rime -= cost;
  c.pumps++;
  return true;
}

export const earCost = (c: SealState) => Math.round(60 * Math.pow(2.5, c.ear));
export function buyEar(s: GameState): boolean {
  const c = st(s), cost = earCost(c);
  if (c.voidAsh < cost) return false;
  c.voidAsh -= cost;
  c.ear++;
  return true;
}

// ---- the frost garden ----

export const seedMax = (c: SealState) => 4 + c.seedUps;
export const seedsUsed = (c: SealState) => { let n = 0; for (const ch of c.garden) if (ch === 'o') n++; return n; };
export const genTime = (c: SealState) => 30 / (1 + 0.3 * c.cold);
const GEN_CAP = 40; // generations processed per step at most

/**
 * One generation of the crystal rule: a bare cell frosts over when exactly one of its four neighbours is lit.
 * Lit cells never melt on their own. Returns the new garden (the same string if nothing changed).
 */
export function grow(g: string): string {
  const lit = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && g[y * GW + x] !== '.';
  let out = '', changed = false;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const ch = g[y * GW + x];
    if (ch === '.' && (+lit(x - 1, y) + +lit(x + 1, y) + +lit(x, y - 1) + +lit(x, y + 1)) === 1) { out += '*'; changed = true; } else out += ch;
  }
  return changed ? out : g;
}

export const gardenLit = (g: string) => { let n = 0; for (const ch of g) if (ch !== '.') n++; return n; };

/** Mirror, flip and half-turn: the share of lit cells whose image is lit, averaged. 1 is perfect. */
export function gardenSymmetry(g: string): number {
  const lit = gardenLit(g);
  if (!lit) return 0;
  let m = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (g[y * GW + x] === '.') continue;
    if (g[y * GW + (GW - 1 - x)] !== '.') m++;
    if (g[(GH - 1 - y) * GW + x] !== '.') m++;
    if (g[(GH - 1 - y) * GW + (GW - 1 - x)] !== '.') m++;
  }
  return m / (3 * lit);
}
/** Symmetric walls are worth more: up to x3. */
export const symMult = (g: string) => 1 + 2 * Math.pow(gardenSymmetry(g), 3);
/** Crystals a second from the walls. */
export const crystalRate = (c: SealState) => gardenLit(c.garden) * symMult(c.garden) * 0.004;

/** Click a cell: seed bare wall, take a seed back, or prune frost. */
export function tendCell(s: GameState, i: number): boolean {
  const c = st(s);
  if (i < 0 || i >= GW * GH) return false;
  const ch = c.garden[i];
  const next = ch === '.' ? (seedsUsed(c) < seedMax(c) ? 'o' : null) : '.';
  if (!next) return false;
  c.garden = c.garden.slice(0, i) + next + c.garden.slice(i + 1);
  return true;
}

/** Melt all frost, keep the seeds; it grows back from them. */
export function thaw(s: GameState): boolean {
  const c = st(s);
  c.garden = c.garden.replace(/\*/g, '.');
  c.gardenT = 0;
  return true;
}

export const HARVEST_MIN = 25;
/** Gather the crystals: they become frost, with a little rime for a symmetric wall. */
export function harvest(s: GameState): boolean {
  const c = st(s);
  if (c.crystals < HARVEST_MIN) return false;
  c.frost += c.crystals;
  c.rime += c.crystals * 0.1 * gardenSymmetry(c.garden);
  c.crystals = 0;
  c.harvests++;
  return true;
}

export const seedUpCost = (c: SealState) => Math.round(40 * Math.pow(2.2, c.seedUps));
export const coldCost = (c: SealState) => Math.round(50 * Math.pow(2.4, c.cold));
export function buySeedUp(s: GameState): boolean {
  const c = st(s), cost = seedUpCost(c);
  if (c.rime < cost) return false;
  c.rime -= cost;
  c.seedUps++;
  return true;
}
export function buyCold(s: GameState): boolean {
  const c = st(s), cost = coldCost(c);
  if (c.rime < cost) return false;
  c.rime -= cost;
  c.cold++;
  return true;
}

// ---- tick ----

function step(s: GameState, dt: number) {
  const c = st(s);
  stepHand(s, dt);
  // the airlock: linear, so any split of time gives the same result
  c.phase = (c.phase + (3 * dt) / cycleLen(c)) % 3;
  c.voidAsh += voidRate(c) * dt;
  const take = Math.min(c.frost, frostIntake(c) * dt);
  c.frost -= take;
  c.rime += take * RIME_PER_FROST;
  // the garden: crystals by the second, generations by banked time
  c.crystals += crystalRate(c) * dt;
  c.gardenT += dt;
  const gt = genTime(c);
  for (let k = 0; k < GEN_CAP && c.gardenT >= gt; k++) {
    c.gardenT -= gt;
    const next = grow(c.garden);
    if (next === c.garden) { c.gardenT = 0; break; } // settled: banked time would do nothing
    c.garden = next;
  }
}

/** Opened tiers: all ash, tapering. */
export const tierAshMult = (tier: number) => 1 + 0.5 * Math.pow(tier, 0.85);
export const tierZoneMult = (tier: number) => 1 + 0.3 * Math.pow(tier, 0.8);

function mult(s: GameState, t: MultTarget): number {
  const c = st(s);
  if (t === 'ash') return tierAshMult(c.tier) * sealMult(c, 'ash');
  if (t === 'zone4') return tierZoneMult(c.tier) * sealMult(c, 'zone4');
  if (t.startsWith('zone') && t !== 'zones') return sealMult(c, t);
  return 1;
}

export const seal: ChallengeModule<SealState> = {
  id: 'seal',
  zone: SEAL_ZONE,
  name: 'The Seal',
  tagline: 'Crack the combination, grow the frost, stamp the wax.',
  fresh,
  step,
  mult,
  milestone: { text: 'Open 3 tiers of the lock and press 3 seals', done: s => st(s).tier >= 3 && st(s).seals.length >= 3 },
  level: s => st(s).tier + st(s).seals.length + st(s).harvests / 10,
};
