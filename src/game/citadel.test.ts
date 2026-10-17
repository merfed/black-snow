import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import {
  activeDreams, answerRite, appetite, buyCitadelUp, burnRate, citadelEnded, citadelMult, DRAIN_CEIL, drainRate, dreamsHeld, FLOORS, learnDream,
  RITES, riteDue, setDream, stepCitadel, touchOmen, unanswered, ward, WARD_CAP, wakeCitadel,
} from './citadel';
import { newGame } from './state';

const awake = () => {
  const s = newGame();
  (s.challenges.syzygy as unknown as { gateOpen: boolean; dreams: number }).gateOpen = true;
  (s.challenges.syzygy as unknown as { dreams: number }).dreams = 1000;
  expect(wakeCitadel(s)).toBe(true);
  return s;
};

describe('the Black Citadel', () => {
  it('stays asleep until the gate opens', () => {
    const s = newGame();
    expect(wakeCitadel(s)).toBe(false);
    expect(drainRate(s)).toBe(0);
    expect(citadelMult(s, 'ash')).toBe(1);
  });

  it('drinks the same over one long step as many short ones, and grows nul', () => {
    const a = awake(), b = awake();
    a.ash = b.ash = new Decimal(1e12);
    stepCitadel(a, 100, () => 0.9);
    for (let i = 0; i < 2000; i++) stepCitadel(b, 0.05, () => 0.9);
    expect(a.ash.toNumber()).toBeLessThan(1e12);
    expect(a.ash.toNumber() / b.ash.toNumber()).toBeCloseTo(1, 4);
    expect(a.citadel.nul / b.citadel.nul).toBeCloseTo(1, 1);
  });

  it('wakes with the lucid dream already in the first bed', () => {
    const s = awake();
    expect(activeDreams(s)).toEqual(['lucid']);
    expect(ward(s)).toBeGreaterThan(0.2);
  });

  it('dreams in a bed ward off the drain and burn fuel', () => {
    const s = awake();
    setDream(s, 0, null);
    const before = drainRate(s);
    expect(setDream(s, 0, 'lucid')).toBe(true);
    expect(activeDreams(s)).toEqual(['lucid']);
    expect(ward(s)).toBeCloseTo(0.25 * WARD_CAP);
    expect(drainRate(s)).toBeLessThan(before);
    stepCitadel(s, 600);
    expect(s.dreams.burned).toBeGreaterThan(0);
    expect(citadelMult(s, 'comfort')).toBeCloseTo(1.5);
  });

  it('upgrades and dreams cost nul; a bad ash takes a bite', () => {
    const s = awake();
    s.citadel.nul = 1000;
    expect(buyCitadelUp(s, 'lantern')).toBe(true);
    expect(citadelMult(s, 'ash')).toBe(1.5);
    expect(learnDream(s, 'nightmare')).toBe(true);
    setDream(s, 0, 'nightmare');
    s.ash = new Decimal(100); s.embers = 100;
    s.dreams.omen = { active: true, kind: 'bad', x: 0.5, y: 0.5, ttl: 5, spawnIn: 0 };
    expect(touchOmen(s)).toBe('bad');
    expect(s.ash.toNumber()).toBeLessThan(100);
    expect(s.embers).toBeLessThan(100);
  });

  it('wards taper: everything at once still lets a tenth through', () => {
    const s = awake();
    s.citadel.ups.mortar = 1000;
    s.citadel.rites = RITES.length;
    s.dreams.known = ['lucid', 'dreamless', 'nightmare'];
    s.dreams.slotCount = 3;
    setDream(s, 0, 'dreamless'); setDream(s, 1, 'nightmare'); setDream(s, 2, 'lucid');
    expect(ward(s)).toBeLessThanOrEqual(WARD_CAP);
    expect(drainRate(s)).toBeGreaterThan(appetite(s) * (1 - WARD_CAP) * 0.9);
  });

  it('never drinks faster than the ceiling, however long it is awake', () => {
    const s = awake();
    setDream(s, 0, null);
    s.citadel.time = 1e5 * 3600;
    expect(unanswered(s)).toBe(FLOORS.length);
    expect(drainRate(s)).toBeLessThan(DRAIN_CEIL);
    expect(burnRate(s)).toBe(0);
    setDream(s, 0, 'lucid');
    expect(burnRate(s) * 3600).toBeLessThan(400); // the pilgrim's slowest wander still feeds one bed
  });

  it('climbs floors; rites answer them in order and the seventh ends the story', () => {
    const s = awake();
    expect(riteDue(s)).toBeNull();
    const d0 = drainRate(s);
    s.citadel.time = FLOORS[0] * 3600;
    expect(unanswered(s)).toBe(1);
    expect(riteDue(s)).toBe(RITES[0]);
    s.citadel.nul = 1e9;
    (s.challenges.syzygy as unknown as { dreams: number }).dreams = 1e9;
    const d1 = drainRate(s);
    expect(d1).toBeGreaterThan(d0);
    expect(answerRite(s)).toBe(true);
    expect(drainRate(s)).toBeLessThan(d1);
    expect(answerRite(s)).toBe(false); // the next floor is not reached yet
    s.citadel.time = FLOORS[FLOORS.length - 1] * 3600;
    while (answerRite(s));
    expect(citadelEnded(s)).toBe(true);
    expect(s.log[0].text).toContain('LISTENING');
    expect(dreamsHeld(s)).toBeLessThan(1e9);
  });

  it('the Citadel\'s own upgrades taper', () => {
    const s = awake();
    setDream(s, 0, null);
    s.citadel.ups = { lantern: 12, snow: 1 };
    s.citadel.nulTotal = 1e5;
    expect(citadelMult(s, 'ash')).toBeLessThan(50);
  });
});
