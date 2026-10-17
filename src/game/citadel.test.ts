import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { activeDreams, buyCitadelUp, citadelMult, drainRate, learnDream, setDream, stepCitadel, touchOmen, ward, wakeCitadel } from './citadel';
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

  it('dreams in a bed ward off the drain and burn fuel', () => {
    const s = awake();
    const before = drainRate(s);
    expect(setDream(s, 0, 'lucid')).toBe(true);
    expect(activeDreams(s)).toEqual(['lucid']);
    expect(ward(s)).toBeCloseTo(0.25);
    expect(drainRate(s)).toBeLessThan(before);
    stepCitadel(s, 600);
    expect(s.dreams.burned).toBeGreaterThan(0);
    expect(citadelMult(s, 'comfort')).toBeCloseTo(1.5);
  });

  it('upgrades and dreams cost nul; a bad ash takes a bite', () => {
    const s = awake();
    s.citadel.nul = 1000;
    expect(buyCitadelUp(s, 'lantern')).toBe(true);
    expect(citadelMult(s, 'ash')).toBe(3);
    expect(learnDream(s, 'nightmare')).toBe(true);
    setDream(s, 0, 'nightmare');
    s.ash = new Decimal(100); s.embers = 100;
    s.dreams.omen = { active: true, kind: 'bad', x: 0.5, y: 0.5, ttl: 5, spawnIn: 0 };
    expect(touchOmen(s)).toBe('bad');
    expect(s.ash.toNumber()).toBeLessThan(100);
    expect(s.embers).toBeLessThan(100);
  });
});
