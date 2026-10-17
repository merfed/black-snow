// The Operator: the zone 7 challenge. A tiny assembly language punched onto cards. The reader runs the
// cards a line per beat, burning the Compiler's cycles, and does the station's chores for you. CALL nests
// one card inside another; every level of the stack makes the Compiler work harder. Memory banks read
// other systems into signals. Moths nest in idle lines and eat a little of the burn; swatting one leaves
// a part, which the deeper upgrades need.
import { buyShaft, catchWarmFlake, comfort, feedMany, log, maxZone, passiveRate, singMany, tune } from '../engine';
import { FREQS } from '../systems';
import type { GameState } from '../state';
import { COMPILER } from '../wiring';
import type { ChallengeModule, Rng } from './types';

export type Op = 'NOP' | 'BUY' | 'MAX' | 'FEED' | 'SING' | 'CATCH' | 'TUNE' | 'WAIT' | 'JUMP' | 'CALL' | 'IF';
export type Join = '' | 'AND' | 'OR';
/** A gate: one or two conditions, either negated, joined. It gates the line after it. */
export interface Cond { a: string; na: boolean; join: Join; b: string; nb: boolean }
export interface Line { op: Op; arg: number; cond?: Cond }
export interface Card { name: string; lines: Line[] }
export interface Frame { c: number; pc: number }
/** One reader slot's program counter: a call stack, a wait, and the last line it ran (for drawing). */
export interface Ptr { stack: Frame[]; wait: number; atC: number; atL: number }
export interface Moth { id: number; c: number; l: number }

export interface OperatorState {
  started: boolean;
  cards: Card[]; // the filing cabinet
  reader: number[]; // card index in each reader slot, -1 for empty
  ptrs: Ptr[];
  running: boolean;
  clock: number; // beat speed upgrades
  stack: number; // stack limit: how many CALLs deep a card may go
  banks: string[]; // memory bank sources, '' for unwired
  parts: number;
  moths: Moth[];
  mothAcc: number;
  mothSeq: number;
  swatted: number;
  beatAcc: number;
  lines: number; // lines executed, ever
  burn: number; // cycles per second, last step, for the readout
  depth: number; // summed stack depth of the cards in the reader, last step
  sig: number; // summed bank signal, last step
  logged: boolean;
}

export const OPS: Op[] = ['NOP', 'BUY', 'MAX', 'FEED', 'SING', 'CATCH', 'TUNE', 'WAIT', 'JUMP', 'CALL', 'IF'];
export const CONDS = ['SIREN', 'FLAKE', 'ASH>10s', 'ASH>1m', 'ASH>10m', 'CYC>100', 'CYC>1k', 'CYC>10k', 'BANK1', 'BANK2', 'BANK3', 'BANK4', 'BANK5', 'BANK6', 'BANK7', 'BANK8'];
export const SOURCES: { id: string; name: string }[] = [
  { id: 'siren', name: 'Siren' }, { id: 'resonance', name: 'Resonance' }, { id: 'flake', name: 'Warm flake' },
  { id: 'comfort', name: 'Comfort' }, { id: 'pigment', name: 'Pigment' }, { id: 'cycles', name: 'Cycles' },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `z${i}`, name: `Zone ${i + 1} bought` })),
];

export const MAX_LINES = 8;
export const MAX_CARDS = 24;
export const MAX_BANKS = 8;
export const MAX_SLOTS = 8;
export const LINE_COST = 2; // cycles per line, times (1 + stack depth)
export const BEAT_CAP = 8; // beats actually interpreted per step, so a long absence stays cheap
export const MOTH_CAP = 5;
export const MOTH_TAX = 0.02; // share of the burn each moth eats: at most 10%
export const MOTH_RATE = 1 / 1500; // per idle line per second
export const GOAL_LINES = 20000;

const L = (op: Op, arg = 0, cond?: Partial<Cond>): Line =>
  cond ? { op, arg, cond: { a: 'SIREN', na: false, join: '', b: 'FLAKE', nb: false, ...cond } } : { op, arg };

/** Three cards already punched, so the reader does something the moment it runs. */
export const exampleCards = (): Card[] => [
  { name: 'WATCHMAN', lines: [L('IF', 0, { a: 'FLAKE' }), L('CATCH'), L('IF', 0, { a: 'ASH>1m' }), L('FEED'), L('SING'), L('WAIT', 3)] },
  { name: 'DIGGER', lines: [L('IF', 0, { a: 'ASH>10m', join: 'AND', b: 'SIREN', nb: true }), L('MAX', 8), L('IF', 0, { a: 'ASH>1m' }), L('BUY', 8), L('WAIT', 6)] },
  { name: 'SPIRAL', lines: [L('CALL', 0), L('IF', 0, { a: 'CYC>1k' }), L('CALL', 2), L('WAIT', 2)] },
];

const freshPtr = (): Ptr => ({ stack: [], wait: 0, atC: -1, atL: -1 });

const fresh = (): OperatorState => ({
  started: false, cards: exampleCards(), reader: [0, 1, 2], ptrs: [freshPtr(), freshPtr(), freshPtr()], running: false,
  clock: 0, stack: 1, banks: [''], parts: 0, moths: [], mothAcc: 0, mothSeq: 1, swatted: 0, beatAcc: 0,
  lines: 0, burn: 0, depth: 0, sig: 0, logged: false,
});

const op = (s: GameState) => s.challenges.operator;

// ---- reading the machine ----

/** Reader slots grow with Compilers bought, by a square root. */
export const readerSlots = (s: GameState) => Math.min(MAX_SLOTS, 2 + Math.floor(Math.sqrt(Math.max(0, s.zones[COMPILER].bought - 10) / 6)));
export const beatRate = (st: OperatorState) => Math.pow(1.2, st.clock);
export const mothTax = (st: OperatorState) => 1 + MOTH_TAX * Math.min(MOTH_CAP, st.moths.length);

/** Slots in the reader that hold a real card. */
export function activeSlots(s: GameState): number[] {
  const st = op(s), n = readerSlots(s), out: number[] = [];
  for (let i = 0; i < n; i++) if (st.cards[st.reader[i] ?? -1]) out.push(i);
  return out;
}

/** How deep a card's CALLs nest, up to the stack limit. A card that calls itself goes all the way down. */
export function depthOf(st: OperatorState, c: number, memo = new Map<number, number>(), budget = st.stack): number {
  if (budget <= 0 || !st.cards[c]) return 0;
  const k = c * 1024 + budget;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  let m = 0;
  for (const ln of st.cards[c].lines) if (ln.op === 'CALL' && st.cards[ln.arg]) m = Math.max(m, 1 + depthOf(st, ln.arg, memo, budget - 1));
  memo.set(k, m);
  return m;
}

/** A bank's reading, 0..1. Steady sources taper so nothing runs away. */
export function bankSignal(s: GameState, src: string): number {
  switch (src) {
    case 'siren': return s.siren.active ? 1 : 0;
    case 'resonance': return Math.max(0, Math.min(1, s.resonance));
    case 'flake': return s.warmFlake.active ? 1 : 0;
    case 'comfort': { const c = comfort(s); return c / (c + 150); }
    case 'pigment': { const p = Math.log10(1 + s.alchemy.pigment); return p / (p + 4); }
    case 'cycles': { const p = Math.log10(1 + s.wiring.cycles); return p / (p + 4); }
  }
  if (/^z\d$/.test(src)) { const b = s.zones[Number(src[1])].bought; return b / (b + 40); }
  return 0;
}

export function condTrue(s: GameState, id: string): boolean {
  switch (id) {
    case 'SIREN': return s.siren.active;
    case 'FLAKE': return s.warmFlake.active;
    case 'ASH>10s': return s.ash.gte(passiveRate(s).mul(10));
    case 'ASH>1m': return s.ash.gte(passiveRate(s).mul(60));
    case 'ASH>10m': return s.ash.gte(passiveRate(s).mul(600));
    case 'CYC>100': return s.wiring.cycles > 100;
    case 'CYC>1k': return s.wiring.cycles > 1000;
    case 'CYC>10k': return s.wiring.cycles > 10000;
  }
  if (id.startsWith('BANK')) return bankSignal(s, op(s).banks[Number(id.slice(4)) - 1] ?? '') > 0.5;
  return false;
}

export function gate(s: GameState, c: Cond): boolean {
  const a = condTrue(s, c.a) !== c.na;
  if (!c.join) return a;
  const b = condTrue(s, c.b) !== c.nb;
  return c.join === 'AND' ? a && b : a || b;
}

const isIdle = (ln: Line) => ln.op === 'WAIT' || ln.op === 'NOP';

/** Run one line of one reader slot. Lines only ever do one thing each, so nothing here can loop. */
function exec(s: GameState, slot: number, rng: Rng) {
  const st = op(s);
  const root = st.reader[slot];
  const p = st.ptrs[slot] ?? (st.ptrs[slot] = freshPtr());
  if (!p.stack.length || p.stack[0].c !== root) { p.stack = [{ c: root, pc: 0 }]; p.wait = 0; }
  if (p.wait > 0) { p.wait--; return; }
  // Unwind finished frames; a finished root starts over.
  let f = p.stack[p.stack.length - 1];
  for (let g = 0; g < 32 && (!st.cards[f.c] || f.pc >= st.cards[f.c].lines.length); g++) {
    if (p.stack.length > 1) p.stack.pop(); else f.pc = 0;
    f = p.stack[p.stack.length - 1];
  }
  const card = st.cards[f.c];
  if (!card || !card.lines.length) return;
  const ln = card.lines[f.pc];
  p.atC = f.c; p.atL = f.pc;
  f.pc++;
  switch (ln.op) {
    case 'IF': if (ln.cond && !gate(s, ln.cond)) f.pc++; break;
    case 'JUMP': f.pc = Math.max(0, Math.min(card.lines.length - 1, ln.arg)); break;
    case 'WAIT': p.wait = Math.max(0, ln.arg - 1); break;
    case 'CALL': if (p.stack.length <= st.stack && st.cards[ln.arg]) p.stack.push({ c: ln.arg, pc: 0 }); break;
    case 'BUY': buyShaft(s, ln.arg); break;
    case 'MAX': maxZone(s, ln.arg); break;
    case 'FEED': feedMany(s, s.nursery.brood.filter(c => c.hunger < 60).map(c => c.id)); break;
    case 'SING': singMany(s, s.nursery.brood.filter(c => c.singIn <= 0).map(c => c.id)); break;
    case 'CATCH': if (s.warmFlake.active) catchWarmFlake(s, rng); break;
    case 'TUNE': { const fr = FREQS[ln.arg]; if (fr && s.freqs[fr.id] && s.tuned !== fr.id) tune(s, fr.id); break; }
  }
}

function step(s: GameState, dt: number, rng: Rng) {
  const st = op(s);
  const active = activeSlots(s);
  if (!st.running || !active.length) { st.burn = 0; st.depth = 0; st.sig = 0; return; }
  const memo = new Map<number, number>();
  const depths = active.map(i => depthOf(st, st.reader[i], memo));
  const rate = beatRate(st);
  // The burn: every line costs cycles, deeper cards cost more, moths take their share.
  const need = depths.reduce((n, d) => n + LINE_COST * (1 + d) * rate, 0) * mothTax(st);
  const fed = need > 0 ? Math.min(1, s.wiring.cycles / (need * dt)) : 1;
  s.wiring.cycles = Math.max(0, s.wiring.cycles - need * dt * fed);
  st.burn = need * fed;
  st.lines += active.length * rate * dt * fed;
  st.depth = depths.reduce((n, d) => n + d, 0);
  st.sig = st.banks.reduce((n, b) => n + (b ? bankSignal(s, b) : 0), 0);
  if (!st.logged && st.lines >= GOAL_LINES) { st.logged = true; log(s, 'THE OPERATOR HAS LEARNED ITS OWN NAME. IT DOES NOT SAY IT.', 'milestone', true); }

  // Moths settle in idle lines at a rate, never more than a few.
  const idle: [number, number][] = [];
  for (const i of active) st.cards[st.reader[i]].lines.forEach((ln, l) => { if (isIdle(ln)) idle.push([st.reader[i], l]); });
  if (idle.length && st.moths.length < MOTH_CAP) {
    st.mothAcc += idle.length * MOTH_RATE * dt;
    while (st.mothAcc >= 1 && st.moths.length < MOTH_CAP) {
      st.mothAcc -= 1;
      const [c, l] = idle[Math.floor(rng() * idle.length) % idle.length];
      st.moths.push({ id: st.mothSeq++, c, l });
    }
    if (st.moths.length >= MOTH_CAP) st.mothAcc = 0;
  }

  // The interpreter proper: a bounded number of beats, the same for every slot.
  st.beatAcc += rate * dt * fed;
  const beats = Math.floor(st.beatAcc);
  st.beatAcc -= beats;
  for (let b = 0; b < Math.min(beats, BEAT_CAP); b++) for (const i of active) exec(s, i, rng);
}

// ---- payouts ----

/** The Operator's main figure: lines run (log), stack depth and bank signals multiply. */
export const basePay = (st: OperatorState) => 1 + 0.5 * Math.log10(1 + st.lines / 200);
export const depthPay = (st: OperatorState) => 1 + 0.3 * st.depth;
export const sigPay = (st: OperatorState) => 1 + 0.3 * st.sig;

function mult(s: GameState, t: string): number {
  const st = op(s);
  if (t === 'zone6') return basePay(st) * depthPay(st) * sigPay(st);
  if (t === 'cycles') return Math.sqrt(basePay(st) * depthPay(st));
  if (t === 'ash') return Math.sqrt(depthPay(st) * sigPay(st));
  return 1;
}

// ---- actions ----

export const punchCost = (st: OperatorState) => Math.round(200 * Math.pow(2, Math.max(0, st.cards.length - 3)));
export const clockCost = (st: OperatorState) => Math.round(300 * Math.pow(2.4, st.clock));
export const stackCost = (st: OperatorState) => ({ cycles: Math.round(500 * Math.pow(4, st.stack - 1)), parts: st.stack });
export const bankCost = (st: OperatorState) => ({ cycles: Math.round(400 * Math.pow(3, st.banks.length - 1)), parts: st.banks.length });

export function setRunning(s: GameState, on: boolean): boolean {
  const st = op(s);
  if (st.running === on) return false;
  st.running = on;
  st.started = true;
  return true;
}

/** Slot a filed card into the reader (or -1 to empty the slot). */
export function loadCard(s: GameState, slot: number, c: number): boolean {
  const st = op(s);
  if (slot < 0 || slot >= readerSlots(s) || (c !== -1 && !st.cards[c])) return false;
  while (st.reader.length <= slot) st.reader.push(-1);
  while (st.ptrs.length <= slot) st.ptrs.push(freshPtr());
  st.reader[slot] = c;
  st.ptrs[slot] = freshPtr();
  return true;
}

export function punchCard(s: GameState): boolean {
  const st = op(s), cost = punchCost(st);
  if (st.cards.length >= MAX_CARDS || s.wiring.cycles < cost) return false;
  s.wiring.cycles -= cost;
  st.cards.push({ name: `CARD ${String(st.cards.length + 1).padStart(2, '0')}`, lines: [L('WAIT', 1)] });
  return true;
}

const editable = (st: OperatorState, c: number) => !!st.cards[c];

export function setLine(s: GameState, c: number, l: number, line: Line): boolean {
  const st = op(s);
  if (!editable(st, c) || l < 0 || l >= st.cards[c].lines.length || !OPS.includes(line.op)) return false;
  st.cards[c].lines[l] = line.op === 'IF' ? { op: 'IF', arg: 0, cond: line.cond ?? { a: 'SIREN', na: false, join: '', b: 'FLAKE', nb: false } } : { op: line.op, arg: line.arg };
  return true;
}

export function addLine(s: GameState, c: number): boolean {
  const st = op(s);
  if (!editable(st, c) || st.cards[c].lines.length >= MAX_LINES) return false;
  st.cards[c].lines.push(L('NOP'));
  return true;
}

export function removeLine(s: GameState, c: number, l: number): boolean {
  const st = op(s);
  if (!editable(st, c) || st.cards[c].lines.length <= 1 || l < 0 || l >= st.cards[c].lines.length) return false;
  st.cards[c].lines.splice(l, 1);
  return true;
}

export function moveLine(s: GameState, c: number, l: number, d: -1 | 1): boolean {
  const st = op(s);
  const ls = st.cards[c]?.lines;
  if (!ls || l + d < 0 || l + d >= ls.length) return false;
  [ls[l], ls[l + d]] = [ls[l + d], ls[l]];
  return true;
}

export function buyClock(s: GameState): boolean {
  const st = op(s), cost = clockCost(st);
  if (s.wiring.cycles < cost) return false;
  s.wiring.cycles -= cost;
  st.clock++;
  return true;
}

export function buyStack(s: GameState): boolean {
  const st = op(s), cost = stackCost(st);
  if (s.wiring.cycles < cost.cycles || st.parts < cost.parts) return false;
  s.wiring.cycles -= cost.cycles;
  st.parts -= cost.parts;
  st.stack++;
  return true;
}

export function buyBank(s: GameState): boolean {
  const st = op(s), cost = bankCost(st);
  if (st.banks.length >= MAX_BANKS || s.wiring.cycles < cost.cycles || st.parts < cost.parts) return false;
  s.wiring.cycles -= cost.cycles;
  st.parts -= cost.parts;
  st.banks.push('');
  return true;
}

export function setBank(s: GameState, i: number, src: string): boolean {
  const st = op(s);
  if (i < 0 || i >= st.banks.length || (src && !SOURCES.some(x => x.id === src))) return false;
  st.banks[i] = src;
  return true;
}

/** Swat a moth off a card: it leaves a part behind. */
export function swat(s: GameState, id: number): boolean {
  const st = op(s);
  const k = st.moths.findIndex(m => m.id === id);
  if (k < 0) return false;
  st.moths.splice(k, 1);
  st.parts++;
  st.swatted++;
  return true;
}

// ---- text ----

const condText = (id: string, neg: boolean) => `${neg ? 'NOT ' : ''}${id}`;
export function lineText(st: OperatorState, ln: Line): string {
  switch (ln.op) {
    case 'IF': { const c = ln.cond!; return `IF ${condText(c.a, c.na)}${c.join ? ` ${c.join} ${condText(c.b, c.nb)}` : ''}`; }
    case 'BUY': case 'MAX': return `${ln.op} ${ln.arg + 1}`;
    case 'TUNE': return `TUNE ${FREQS[ln.arg]?.band ?? '?'}`;
    case 'WAIT': case 'JUMP': return `${ln.op} ${ln.arg}`;
    case 'CALL': return `CALL ${st.cards[ln.arg]?.name ?? '?'}`;
    default: return ln.op;
  }
}

/** A line as 12 punched bits: opcode, argument and gate, for drawing the card. */
export function lineBits(ln: Line): number {
  const o = OPS.indexOf(ln.op) & 15;
  const a = ln.op === 'IF' && ln.cond ? CONDS.indexOf(ln.cond.a) & 15 : ln.arg & 15;
  const g = ln.cond ? ((ln.cond.na ? 1 : 0) | (ln.cond.join === 'AND' ? 2 : ln.cond.join === 'OR' ? 4 : 0) | (ln.cond.nb ? 8 : 0)) : 0;
  return o | (a << 4) | (g << 8);
}

export const operator: ChallengeModule<OperatorState> = {
  id: 'operator',
  zone: 6,
  name: 'The Operator',
  tagline: 'Punch a program into the Exchange and let it run the station.',
  fresh,
  step,
  mult,
  milestone: { text: `Execute ${GOAL_LINES.toLocaleString('en-US')} lines`, done: s => op(s).lines >= GOAL_LINES },
  level: s => {
    const st = op(s);
    return Math.max(0, st.cards.length - 3) + (st.stack - 1) + (st.banks.length - 1) + st.clock + Math.floor(st.lines / 2500);
  },
};
