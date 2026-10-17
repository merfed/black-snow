import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  activeSlots, addLine, buyBank, buyClock, buyStack, depthOf, GOAL_LINES, loadCard, MOTH_CAP, operator, punchCard,
  readerSlots, setBank, setLine, setRunning, swat,
} from './operator';

const late = (): GameState => {
  const s = newGame(() => 0.5);
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.zones[6].bought = 20;
  s.chUnlocked = ['survey', 'undertow', 'archive', 'stair', 'seal', 'ring', 'operator'];
  s.wiring.cycles = 1e9;
  return s;
};

/** A card with no side effects, so only the accounting differs between runs. */
const quiet = (s: GameState) => {
  const st = s.challenges.operator;
  st.cards = [{ name: 'A', lines: [{ op: 'NOP', arg: 0 }, { op: 'CALL', arg: 1 }] }, { name: 'B', lines: [{ op: 'WAIT', arg: 2 }] }];
  st.reader = [0, 1, -1];
  st.running = true;
};

describe('operator', () => {
  it('starts untouched with example cards and pays nothing', () => {
    const s = late();
    const st = s.challenges.operator;
    expect(st.cards.length).toBe(3);
    expect(st.running).toBe(false);
    for (const t of ['zone6', 'cycles', 'ash', 'zones'] as const) expect(operator.mult(s, t)).toBe(1);
    expect(operator.level(s)).toBe(0);
  });

  it('reader slots grow with Compilers', () => {
    const s = late();
    s.zones[6].bought = 10;
    expect(readerSlots(s)).toBe(2);
    s.zones[6].bought = 34;
    expect(readerSlots(s)).toBe(4);
  });

  it('runs the examples, burns cycles and executes lines', () => {
    const s = late();
    s.ash = new Decimal(0);
    setRunning(s, true);
    const before = s.wiring.cycles;
    for (let i = 0; i < 200; i++) operator.step(s, 0.05, () => 0.5);
    expect(s.challenges.operator.lines).toBeCloseTo(activeSlots(s).length * 10, 5);
    expect(s.wiring.cycles).toBeLessThan(before);
    expect(operator.mult(s, 'zone6')).toBeGreaterThan(1);
    expect(operator.mult(s, 'ash')).toBeGreaterThan(1);
  });

  it('accrues the same over one big step and many small ones', () => {
    const a = late(), b = late();
    quiet(a); quiet(b);
    operator.step(a, 100, () => 0.5);
    for (let i = 0; i < 2000; i++) operator.step(b, 0.05, () => 0.5);
    const sa = a.challenges.operator, sb = b.challenges.operator;
    expect(sa.lines).toBeCloseTo(sb.lines, 3);
    expect(a.wiring.cycles).toBeCloseTo(b.wiring.cycles, 0);
    expect(sa.moths.length).toBe(sb.moths.length);
  });

  it('starves gracefully without cycles', () => {
    const s = late();
    quiet(s);
    s.wiring.cycles = 0;
    operator.step(s, 1, () => 0.5);
    expect(s.challenges.operator.lines).toBe(0);
    expect(s.wiring.cycles).toBe(0);
  });

  it('recursion depth is bounded by the stack limit', () => {
    const s = late();
    const st = s.challenges.operator;
    expect(depthOf(st, 2)).toBe(1); // SPIRAL calls itself
    st.stack = 5;
    expect(depthOf(st, 2)).toBe(5);
    expect(depthOf(st, 0)).toBe(0);
  });

  it('moths nest in idle lines, are capped, and leave parts', () => {
    const s = late();
    quiet(s);
    operator.step(s, 1e6, () => 0.3);
    const st = s.challenges.operator;
    expect(st.moths.length).toBe(MOTH_CAP);
    expect(swat(s, st.moths[0].id)).toBe(true);
    expect(st.parts).toBe(1);
  });

  it('upgrades spend cycles and parts', () => {
    const s = late();
    const st = s.challenges.operator;
    expect(buyStack(s)).toBe(false); // needs a part
    st.parts = 10;
    const c = s.wiring.cycles;
    expect(buyStack(s)).toBe(true);
    expect(st.stack).toBe(2);
    expect(st.parts).toBe(9);
    expect(s.wiring.cycles).toBeLessThan(c);
    expect(buyBank(s)).toBe(true);
    expect(setBank(s, 1, 'z6')).toBe(true);
    expect(buyClock(s)).toBe(true);
    expect(punchCard(s)).toBe(true);
    expect(addLine(s, 3)).toBe(true);
    expect(setLine(s, 3, 1, { op: 'CALL', arg: 2 })).toBe(true);
    expect(loadCard(s, 0, 3)).toBe(true);
    expect(operator.level(s)).toBe(4);
  });

  it('the program actually does chores', () => {
    const s = late();
    s.upgrades.floor = true;
    s.ash = new Decimal(1e300);
    const st = s.challenges.operator;
    st.cards = [{ name: 'X', lines: [{ op: 'BUY', arg: 0 }] }];
    st.reader = [0];
    setRunning(s, true);
    for (let i = 0; i < 100; i++) operator.step(s, 0.05, () => 0.5);
    expect(s.zones[0].bought).toBeGreaterThanOrEqual(4);
  });

  it('banks feed signals into the payout', () => {
    const s = late();
    quiet(s);
    operator.step(s, 1, () => 0.5);
    const m0 = operator.mult(s, 'zone6');
    setBank(s, 0, 'z6');
    operator.step(s, 1, () => 0.5);
    expect(operator.mult(s, 'zone6')).toBeGreaterThan(m0);
  });

  it('milestone is reachable', () => {
    const s = late();
    quiet(s);
    expect(operator.milestone.done(s)).toBe(false);
    for (let i = 0; i < 200; i++) operator.step(s, 60, () => 0.5);
    expect(s.challenges.operator.lines).toBeGreaterThanOrEqual(GOAL_LINES);
    expect(operator.milestone.done(s)).toBe(true);
  });
});
