import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  AUTO_SHARE, buyReader, coreMult, CORE_EVERY, buyRack, density, READ_EVERY, readerCost, tallyTotal, zoneBonus, headCost, makeCore, moveHead, openCore, placeHead, rackSize, RUN, survey, swapBands,
} from './survey';

const late = (): GameState => {
  const s = newGame();
  s.zonesOpened = 9; s.zones[8].bought = 1; s.chUnlocked = ['survey'];
  s.ash = new Decimal(1e100);
  return s;
};

/** Solve the open core greedily: swap anything that makes progress until it is read. */
function solve(s: GameState) {
  for (let guard = 0; guard < 500 && s.challenges.survey.core; guard++) {
    const c = s.challenges.survey.core;
    // bring the bottom band's kind up next to its nearest match
    let done = false;
    for (let i = 0; i < c.length && !done; i++) for (let j = i + 2; j < c.length && !done; j++) {
      if (c[j] === c[i] && c[j - 1] !== c[j]) { swapBands(s, j - 1); done = true; }
    }
    if (!done) swapBands(s, 0);
  }
}

describe('the survey', () => {
  it('starts untouched, one core in the rack', () => {
    const s = late();
    const v = s.challenges.survey;
    expect(v.rack).toBe(1);
    expect(v.read).toBe(0);
    expect(survey.mult(s, 'ash')).toBe(1);
    expect(survey.mult(s, 'zone0')).toBe(1);
    expect(survey.level(s)).toBe(0);
  });

  it('makes cores of three kinds, three bands each, with no run already made', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const c = makeCore(rng);
      expect(c.length).toBe(9);
      const counts = c.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
      expect(Object.values(counts)).toEqual([RUN, RUN, RUN]);
      for (let i = 0; i + 2 < c.length; i++) expect(c[i] === c[i + 1] && c[i] === c[i + 2]).toBe(false);
    }
  });

  it('reading a core clears runs, tallies them and pays ash', () => {
    const s = late();
    expect(openCore(s)).toBe(true);
    expect(s.challenges.survey.rack).toBe(0);
    expect(openCore(s)).toBe(false);
    solve(s);
    const v = s.challenges.survey;
    expect(v.core).toBe(null);
    expect(v.read).toBe(1);
    expect(v.last.length).toBe(3);
    expect(survey.mult(s, 'ash')).toBeGreaterThan(1);
  });

  it('a swap that lines up three reads them', () => {
    const s = late();
    const v = s.challenges.survey;
    v.core = ['ash', 'ash', 'salt', 'ash', 'salt', 'glass', 'salt', 'glass', 'glass'];
    expect(swapBands(s, 2)).toBe(true); // ash ash ash -> read
    expect(v.tally.ash).toBe(1);
    expect(v.core).toEqual(['salt', 'salt', 'glass', 'salt', 'glass', 'glass']);
  });

  it('heads cost ash, grow in price and pay survey into Shallow Bores', () => {
    const s = late();
    s.ash = new Decimal(1e15);
    const before = s.ash;
    const c0 = headCost(s);
    expect(placeHead(s, 13)).toBe(true);
    expect(placeHead(s, 13)).toBe(false);
    expect(s.ash.lt(before)).toBe(true);
    expect(headCost(s).gt(c0)).toBe(true);
    expect(moveHead(s, 13, 40)).toBe(true);
    expect(s.challenges.survey.heads).toEqual([40]);
    survey.step(s, 60, Math.random);
    expect(s.challenges.survey.surveyed).toBeGreaterThan(0);
    expect(survey.mult(s, 'zone0')).toBeGreaterThan(1);
  });

  it('the map drifts but is the same for the same seed and time', () => {
    expect(density(7, 1000, 3, 4)).toBe(density(7, 1000, 3, 4));
    expect(density(7, 1000, 3, 4)).not.toBe(density(7, 9000, 3, 4));
    expect(density(7, 1000, 3, 4)).toBeGreaterThan(0.29);
  });

  it('accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    for (const s of [a, b]) {
      s.challenges.survey.seed = 1234; s.challenges.survey.rack = 0;
      placeHead(s, 5); placeHead(s, 50); placeHead(s, 77);
    }
    survey.step(a, 100, Math.random);
    for (let k = 0; k < 2000; k++) survey.step(b, 0.05, Math.random);
    const va = a.challenges.survey, vb = b.challenges.survey;
    expect(Math.abs(va.surveyed - vb.surveyed) / vb.surveyed).toBeLessThan(1e-4);
    expect(Math.abs(va.coreProg - vb.coreProg)).toBeLessThan(1e-6);
  });

  it('the rack fills while away and stops when full, without loss', () => {
    const s = late();
    survey.step(s, CORE_EVERY * 3 + 10, Math.random);
    expect(s.challenges.survey.rack).toBe(4);
    for (let k = 0; k < 100; k++) survey.step(s, 600, Math.random);
    expect(s.challenges.survey.rack).toBe(rackSize(s));
    expect(buyRack(s)).toBe(true);
    expect(rackSize(s)).toBe(8);
  });

  it('the reader reads racked cores on its own, slowly and at half value', () => {
    const s = late();
    const v = s.challenges.survey;
    survey.step(s, 1, Math.random);
    expect(v.read).toBe(0);
    const cost = readerCost(s);
    expect(buyReader(s)).toBe(true);
    expect(readerCost(s).gt(cost)).toBe(true);
    v.rack = 3;
    survey.step(s, READ_EVERY + 1, () => 0.3);
    expect(v.read).toBe(1);
    expect(v.core).toBe(null); // never touches the core on the bench
    // a whole core read by the reader tallies half what reading by hand would
    expect(tallyTotal(v)).toBeGreaterThan(0);
    expect(tallyTotal(v)).toBeLessThanOrEqual(9 * 9 * AUTO_SHARE / 3);
    // an empty rack: the reader waits, and does not bank more than one core of progress
    v.rack = 0; v.coreProg = 0;
    const read = v.read;
    for (let k = 0; k < 10; k++) survey.step(s, 10, Math.random);
    expect(v.read).toBe(read);
    expect(v.readProg).toBeLessThanOrEqual(1);
  });

  it('pays inside the shared budget: x3-6 around the milestone, x10-25 after a week', () => {
    const v = late().challenges.survey;
    v.tally = { ash: 107 }; v.surveyed = 3e4; // about the milestone
    const atMs = coreMult(v) * zoneBonus(v);
    expect(atMs).toBeGreaterThan(3); expect(atMs).toBeLessThan(6);
    v.tally = { ash: 5000 }; v.surveyed = 1e7; // about a week
    const week = coreMult(v) * zoneBonus(v);
    expect(week).toBeGreaterThan(10); expect(week).toBeLessThan(25);
  });

  it('the milestone is reachable', () => {
    const s = late();
    for (let i = 0; i < 6; i++) placeHead(s, i * 9);
    for (let n = 0; n < 25; n++) { s.challenges.survey.rack = 1; openCore(s); solve(s); }
    expect(s.challenges.survey.read).toBe(25);
    expect(survey.milestone.done(s)).toBe(true);
    expect(survey.level(s)).toBe(31);
  });
});
