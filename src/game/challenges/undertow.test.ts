import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  approach, bestBore, binCost, BORE_BUDGET, depth, efficiency, figureHere, fresh, hiss, patch, setBore, setRule, sortObj, TRAY,
  undertow, upgradeBin, walkTime,
} from './undertow';
import { stepChallenges } from '.';

function late(): GameState {
  const s = newGame();
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.chUnlocked = ['survey', 'undertow'];
  s.ash = new Decimal(1e300);
  return s;
}

/** A seeded generator so two runs see the same pipe. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('undertow', () => {
  it('starts empty and gives nothing', () => {
    const s = late();
    expect(s.challenges.undertow).toEqual(fresh());
    s.challenges.undertow.leaks = [];
    expect(undertow.mult(s, 'zone1')).toBeGreaterThanOrEqual(1);
    expect(undertow.mult(s, 'ash')).toBe(1);
    expect(undertow.mult(s, 'zones')).toBe(1);
    expect(undertow.level(s)).toBe(0);
  });

  it('fills the tray and stops when it is full', () => {
    const s = late();
    undertow.step(s, 150 * 30, seeded(1));
    expect(s.challenges.undertow.tray.length).toBe(TRAY);
    expect(s.challenges.undertow.pull).toBe(1);
  });

  it('accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    undertow.step(a, 1000, seeded(7));
    const r = seeded(7);
    for (let i = 0; i < 20000; i++) undertow.step(b, 0.05, r);
    const ua = a.challenges.undertow, ub = b.challenges.undertow;
    expect(ub.tray).toEqual(ua.tray);
    expect(ub.pull).toBeCloseTo(ua.pull, 5);
    expect(ub.sight).toBeCloseTo(ua.sight, 3);
    expect(ub.leaks.length).toBe(ua.leaks.length);
  });

  it('sorts into bins', () => {
    const s = late();
    const u = s.challenges.undertow;
    u.tray = ['key', 'iron', 'bell'];
    expect(sortObj(s, 0, 'keep')).toBe(true);
    expect(u.kept.key).toBe(1);
    const e = s.embers;
    sortObj(s, 0, 'burn');
    expect(s.embers).toBeGreaterThan(e);
    sortObj(s, 0, 'down');
    expect(u.luck).toBeGreaterThan(0);
    expect(u.tray.length).toBe(0);
  });

  it('auto-sorts once a bin is upgraded, and runs idle', () => {
    const s = late();
    expect(setRule(s, 'key', 'keep')).toBe(false);
    s.ash = new Decimal(5e30);
    const ash = s.ash;
    expect(upgradeBin(s, 'keep')).toBe(true);
    expect(s.ash.lt(ash)).toBe(true);
    for (const id of ['key', 'button', 'photo', 'cassette', 'letter', 'glove', 'band', 'hair', 'nail', 'tooth', 'iron', 'bell']) setRule(s, id, 'keep');
    undertow.step(s, 150 * 200, seeded(3));
    expect(s.challenges.undertow.tray.length).toBe(0);
    expect(s.challenges.undertow.keptTotal).toBe(200);
  });

  it('walks toward the figure, each walk longer', () => {
    const s = late();
    expect(figureHere(s)).toBe(false);
    undertow.step(s, 200, seeded(2));
    expect(approach(s)).toBe(true);
    expect(approach(s)).toBe(false);
    undertow.step(s, walkTime(0) + 1, seeded(2));
    expect(s.challenges.undertow.approaches).toBe(1);
    expect(walkTime(1)).toBeGreaterThan(walkTime(0));
  });

  it('finds leaks by ear and patches them', () => {
    const s = late();
    const u = s.challenges.undertow;
    const l = u.leaks[0];
    expect(hiss(s, l)).toBeCloseTo(1);
    expect(hiss(s, l + 4)).toBeLessThan(hiss(s, l + 1));
    expect(patch(s, (l + 30) % 64)).toBe(false);
    expect(patch(s, l)).toBe(true);
    expect(u.patched).toBe(1);
    undertow.step(s, 1500 * 10, seeded(4));
    expect(u.leaks.length).toBe(3);
  });

  it('has a real optimum on the gauge that moves with depth', () => {
    const s = late();
    const best = bestBore(depth(s)).bore;
    expect(best.reduce((a, b) => a + b, 0)).toBe(BORE_BUDGET);
    const u = s.challenges.undertow;
    u.bore = [1, 1, 1];
    for (let i = 0; i < 3; i++) setBore(s, i, best[i]);
    expect(efficiency(s)).toBeCloseTo(1);
    // somewhere deeper the best mix differs
    let moved = false;
    for (let d = 1; d < 20; d++) if (bestBore(d).bore.join() !== best.join()) moved = true;
    expect(moved).toBe(true);
    // the bonus it reached holds when the optimum moves
    const held = u.held;
    s.zones[1].bought = 500;
    expect(undertow.mult(s, 'zone1')).toBeGreaterThanOrEqual(held * 0.85 - 1e-9);
  });

  it('pays more after progress and reaches its milestone', () => {
    const s = late();
    const u = s.challenges.undertow;
    u.leaks = [];
    const base = undertow.mult(s, 'zone1');
    u.keptTotal = 12;
    u.approaches = 3;
    u.patched = 4;
    expect(undertow.mult(s, 'zone1')).toBeGreaterThan(base);
    expect(undertow.milestone.done(s)).toBe(true);
    expect(undertow.level(s)).toBe(8); // 3 approaches + 4 patches + 1 dozen kept
  });

  it('reaches the Syzygy gate level of 6 soon after the milestone, even with no patches', () => {
    const s = late();
    const u = s.challenges.undertow;
    u.keptTotal = 24; u.approaches = 4; u.patched = 0;
    expect(undertow.level(s)).toBe(6);
  });

  it('prices bins off a slow income that falls behind a fast climb', () => {
    const s = late();
    s.zones[0].amount = new Decimal(1e40);
    stepChallenges(s, 1, Math.random);
    const c0 = binCost(s, 'keep');
    s.zones[0].amount = s.zones[0].amount.mul(10); // income jumps an order
    for (let i = 0; i < 10; i++) stepChallenges(s, 360, Math.random); // an hour
    const c1 = binCost(s, 'keep');
    // a fifth of an order an hour, not a whole one
    expect(c1.div(c0).toNumber()).toBeGreaterThan(1.4);
    expect(c1.div(c0).toNumber()).toBeLessThan(1.7);
    // but never more than an order and a half behind live income
    s.zones[0].amount = s.zones[0].amount.mul(1e6);
    stepChallenges(s, 1, Math.random);
    expect(binCost(s, "keep").div(c0).toNumber()).toBeGreaterThan(1e5);
  });
});
