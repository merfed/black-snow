import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  buyHand, buyPump, combination, handTime, restCost, comboLength, digitOf, feel, grow, gardenSymmetry, GW, harvest, pressSeal, restDial, seal, sealPower,
  sealsPending, setStance, target, tendCell, tierCost, turnWheel, wantDir,
} from './seal';

function late(): GameState {
  const s = newGame(() => 0.5);
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.zones[0].amount = new Decimal(1e6);
  s.chUnlocked = ['survey', 'undertow', 'archive', 'stair', 'seal'];
  return s;
}

/** Dial in the whole combination of the current tier. */
function crack(s: GameState) {
  let k = 0;
  s.challenges.seal.voidAsh += restCost(s);
  while (target(s) !== null) {
    expect(restDial(s, target(s)!, wantDir(k))).toBe(true);
    k++;
  }
}

const PERFECT9 = // a 7x7 seal with 9 lit pixels and every symmetry: centre plus a ring of 8
  '0000000' +
  '0010100' +
  '0100010' +
  '0001000' +
  '0100010' +
  '0010100' +
  '0000000';

describe('the seal', () => {
  it('starts fresh and gives nothing', () => {
    const s = late();
    const c = s.challenges.seal;
    expect(c.tier).toBe(0);
    expect(c.seals).toEqual([]);
    expect(seal.mult(s, 'ash')).toBe(1);
    expect(seal.mult(s, 'zone4')).toBe(1);
    expect(seal.level(s)).toBe(0);
    expect(seal.milestone.done(s)).toBe(false);
  });

  it('combinations are seeded, longer deeper down, and caught by feel in the right direction', () => {
    const s = late();
    const c = s.challenges.seal;
    expect(combination(c.seed, 0)).toEqual(combination(c.seed, 0));
    expect(combination(c.seed, 6).length).toBe(comboLength(6));
    expect(comboLength(6)).toBeGreaterThan(comboLength(0));
    const t = target(s)!;
    expect(feel(s, t)).toBe(1);
    expect(feel(s, t + 20)).toBe(0);
    expect(feel(s, t) - feel(s, t + 1)).toBeGreaterThan(0.2); // the meter kicks on the number itself
    expect(restDial(s, t, wantDir(0))).toBe(false); // no void ash in hand: the wheel will not settle
    expect(c.found).toEqual([]);
    c.voidAsh = 3 * restCost(s);
    expect(restDial(s, t, -wantDir(0))).toBe(false); // wrong way round
    expect(restDial(s, t + 1, wantDir(0))).toBe(false);
    expect(c.voidAsh).toBe(restCost(s)); // each miss cost a rest
    expect(restDial(s, t, wantDir(0))).toBe(true);
    expect(c.voidAsh).toBe(restCost(s)); // a catch is free
    expect(c.found).toEqual([t]);
  });

  it('guessing every mark costs far more than reading the meter', () => {
    const s = late();
    const c = s.challenges.seal;
    c.voidAsh = 1e6;
    for (let k = 0; target(s) !== null; k++) {
      const t = target(s)!;
      for (let p = 0; p < 40 && target(s) === t; p++) restDial(s, (t + 1 + p) % 40, wantDir(k)); // brute force: last mark tried is right
    }
    const brute = 1e6 - c.voidAsh;
    expect(brute).toBeGreaterThan(tierCost(0) * 3);
  });

  it('a patient hand finds the numbers by itself, slowly, and banks nothing once done', () => {
    const s = late();
    const c = s.challenges.seal;
    c.voidAsh = 1000;
    expect(buyHand(s)).toBe(true);
    seal.step(s, handTime(1) - 1, Math.random);
    expect(c.found.length).toBe(0);
    seal.step(s, 2, Math.random);
    expect(c.found.length).toBe(1);
    seal.step(s, 3600 * 24, Math.random);
    expect(c.found.length).toBe(comboLength(0));
    expect(c.handT).toBeLessThanOrEqual(handTime(1));
  });

  it('turning the wheel spends void ash and pays a burst and a bonus', () => {
    const s = late();
    const c = s.challenges.seal;
    crack(s);
    expect(turnWheel(s)).toBe(false); // no void ash yet
    c.voidAsh = tierCost(0) + 5;
    const before = s.ash;
    expect(turnWheel(s)).toBe(true);
    expect(c.voidAsh).toBeCloseTo(5);
    expect(c.tier).toBe(1);
    expect(s.ash.gt(before)).toBe(true);
    expect(seal.mult(s, 'ash')).toBeGreaterThan(1);
    expect(seal.mult(s, 'zone4')).toBeGreaterThan(1);
    expect(sealsPending(s)).toBe(1);
  });

  it('seals read symmetry and digit; the perfect nine is strongest', () => {
    expect(digitOf(PERFECT9)).toBe(9);
    expect(sealPower(PERFECT9)).toBeCloseTo(1.6);
    const lop = '1100000' + '1000000' + '0'.repeat(35);
    expect(sealPower(lop)).toBeLessThan(sealPower(PERFECT9));
    const s = late();
    expect(pressSeal(s, PERFECT9)).toBe(false); // no open tier to seal
    s.challenges.seal.tier = 1;
    expect(pressSeal(s, '0'.repeat(49))).toBe(false);
    const m0 = seal.mult(s, 'ash');
    expect(pressSeal(s, PERFECT9)).toBe(true);
    expect(seal.mult(s, 'ash')).toBeGreaterThan(m0);
  });

  it('the airlock accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    for (const s of [a, b]) { s.challenges.seal.frost = 30; setStance(s, 'split'); }
    seal.step(a, 100, Math.random);
    for (let i = 0; i < 2000; i++) seal.step(b, 0.05, Math.random);
    const ca = a.challenges.seal, cb = b.challenges.seal;
    expect(ca.voidAsh).toBeCloseTo(cb.voidAsh, 4);
    expect(ca.rime).toBeCloseTo(cb.rime, 4);
    expect(ca.frost).toBeCloseTo(cb.frost, 4);
    expect(ca.voidAsh).toBeCloseTo(25, 4);
    expect(ca.frost).toBe(0);
    expect(ca.rime).toBeCloseTo(15, 4);
  });

  it('pumps cost rime and speed the airlock', () => {
    const s = late();
    const c = s.challenges.seal;
    expect(buyPump(s)).toBe(false);
    c.rime = 30;
    expect(buyPump(s)).toBe(true);
    expect(c.rime).toBe(0);
    seal.step(s, 10, Math.random);
    expect(c.voidAsh).toBeCloseTo(0.5 * 1.35 * 10);
  });

  it('frost grows symmetrically from symmetric seeds, offline-safe, and harvests', () => {
    const s = late();
    const c = s.challenges.seal;
    const y = 5, x = 5;
    expect(tendCell(s, y * GW + x)).toBe(true);
    expect(tendCell(s, y * GW + (GW - 1 - x))).toBe(true);
    expect(tendCell(s, (11 - y) * GW + x)).toBe(true);
    expect(tendCell(s, (11 - y) * GW + (GW - 1 - x))).toBe(true);
    expect(gardenSymmetry(c.garden)).toBe(1);
    seal.step(s, 3600 * 24, Math.random); // a day away: capped and settled, no blow-up
    expect(grow(c.garden)).toBe(c.garden);
    expect(gardenSymmetry(c.garden)).toBe(1);
    expect(c.crystals).toBeGreaterThan(25);
    expect(harvest(s)).toBe(true);
    expect(c.frost).toBeGreaterThan(0);
    expect(c.harvests).toBe(1);
    expect(harvest(s)).toBe(false);
  });

  it('the milestone is reachable', () => {
    const s = late();
    const c = s.challenges.seal;
    for (let t = 0; t < 3; t++) {
      crack(s);
      c.voidAsh += tierCost(t);
      expect(turnWheel(s)).toBe(true);
      expect(pressSeal(s, PERFECT9)).toBe(true);
    }
    expect(seal.milestone.done(s)).toBe(true);
    expect(seal.level(s)).toBe(6);
    const m = seal.mult(s, 'ash');
    expect(m).toBeGreaterThan(3);
    expect(m).toBeLessThan(15);
  });
});
