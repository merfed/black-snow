import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import * as a from './alchemy';
import { globalMult, tick } from './engine';
import * as p from './patterns';
import { newGame } from './state';

describe('pattern buffer', () => {
  it('opens at 25 buffers and pays only when tuned close', () => {
    const s = newGame(() => 0.3);
    expect(p.setSlot(s, 0, { target: 'ash' })).toBe(false);
    s.zones[p.BUFFER].bought = 25;
    expect(p.setSlot(s, 0, { target: 'ash' })).toBe(true);
    const before = globalMult(s).toNumber();
    const sig = p.signature(s, 'ash');
    p.setSlot(s, 0, sig);
    expect(p.match(s, s.patterns.slots[0])).toBe(1);
    expect(globalMult(s).toNumber()).toBeCloseTo(before * 2.5, 3);
  });
  it('keeps targets unique and dials in range', () => {
    const s = newGame();
    s.zones[p.BUFFER].bought = 100;
    p.setSlot(s, 0, { target: 'rust' });
    expect(p.setSlot(s, 1, { target: 'rust' })).toBe(false);
    p.setSlot(s, 1, { target: 'echoes', freq: 99, phase: -1, harm: 0 });
    expect(s.patterns.slots[1]).toMatchObject({ freq: p.FREQ_MAX, phase: p.PHASE_STEPS - 1, harm: 1 });
  });
});

describe('barker spiral alchemy', () => {
  const open = () => {
    const s = newGame();
    s.zones[a.SPIRAL].bought = a.SPIRAL_AT;
    s.zones[a.SPIRAL].amount = new Decimal(1);
    s.alchemy.pigment = 1000;
    return s;
  };
  it('winds a known mix into a tincture after a while', () => {
    const s = open();
    expect(a.wind(s, ['c0', 'c2'])).toBe(true);
    expect(a.wind(s, ['c0', 'c14'])).toBe(false); // already winding
    for (let k = 0; k < 200; k++) tick(s, 0.05, () => 0.5);
    expect(s.alchemy.found.tallow).toBe(1);
    expect(a.tinctureMult(s, 'ash')).toBeCloseTo(1.1);
    expect(a.brew(s, 'tallow')).toBe(true);
    expect(s.alchemy.found.tallow).toBe(2);
  });
  it('makes mud from a mix that is not a recipe, and remembers it', () => {
    const s = open();
    a.wind(s, ['c2', 'c14']);
    for (let k = 0; k < 200; k++) tick(s, 0.05, () => 0.5);
    expect(s.alchemy.last).toBe('mud');
    expect(s.alchemy.tried).toContain(a.mixKey(['c2', 'c14']));
  });
  it('needs colours you have', () => {
    const s = open();
    expect(a.wind(s, ['c0', 'c1'])).toBe(false);
    expect(a.researchColor(s)).toBe(true);
    expect(a.wind(s, ['c1', 'c14'])).toBe(true);
  });
  it('has 16 colours, distinct, and recipes that only use real ingredients', () => {
    expect(new Set(a.COLORS.map(c => c.hex)).size).toBe(16);
    const ids = new Set([...a.COLORS.map((_, i) => `c${i}`), ...a.RECIPES.map(r => r.id)]);
    for (const r of a.RECIPES) for (const m of r.mix) expect(ids.has(m)).toBe(true);
    expect(new Set(a.RECIPES.map(r => a.mixKey(r.mix))).size).toBe(a.RECIPES.length);
  });
});
