import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { broodSlots, giftTotal, zoneMult } from './engine';
import { candleCost, lightCandle, openSlot, quirkMult, recallFamiliar, renderCreatures, setFamiliar, waxFor } from './familiars';
import { newGame, type Creature } from './state';

const pet = (id: number, stage: number, eyes = 0, limbs = 4): Creature => ({
  id, stage, hunger: 100, mood: 80, growth: 0, singIn: 0, breedIn: 0,
  genome: { body: 0, eyes, limbs, mark: 0, hue: 0, accent: 0, shell: 0, seed: 0 },
});

describe('familiars and ghostwax', () => {
  it('opens slots in order for ash and embers', () => {
    const s = newGame();
    s.ash = new Decimal(1e20); s.embers = 2000;
    expect(openSlot(s)).toBe(true);
    expect(openSlot(s)).toBe(true);
    expect(openSlot(s)).toBe(true);
    expect(openSlot(s)).toBe(false);
    expect(s.nursery.slots).toBe(3);
  });

  it('a familiar leaves the brood, keeps its gift and adds its quirk', () => {
    const s = newGame();
    s.nursery.found = true; s.nursery.slots = 1;
    s.nursery.brood = [pet(1, 4), pet(2, 2)];
    const before = zoneMult(s, 0);
    expect(setFamiliar(s, 0, 1, broodSlots(s))).toBe(true);
    expect(s.nursery.brood.map(c => c.id)).toEqual([2]);
    // eyes 0 + limbs 4 -> 'zones' quirk; body 0 + mark 0 -> 'ash' gift
    expect(quirkMult(s, 'zones')).toBeCloseTo(1.2);
    expect(zoneMult(s, 0).gt(before)).toBe(true);
    expect(giftTotal(s, 'ash')).toBeGreaterThan(30);
    expect(recallFamiliar(s, 0, broodSlots(s))).toBe(true);
    expect(s.nursery.brood.length).toBe(2);
  });

  it('renders creatures into ghostwax that lights candles', () => {
    const s = newGame();
    s.nursery.found = true; s.nursery.slots = 1;
    s.nursery.brood = [pet(1, 4), pet(2, 3)];
    expect(renderCreatures(s, [1, 2])).toBe(waxFor(pet(0, 4)) + waxFor(pet(0, 3)));
    expect(s.nursery.brood.length).toBe(0);
    const c = candleCost(s, 0);
    expect(lightCandle(s, 0)).toBe(true);
    expect(s.nursery.ghostwax).toBe(50 - c);
  });

  it('the brood tops out at 255 and a big brood tapers', () => {
    const s = newGame();
    s.nursery.ups.nest = 5; s.nursery.ups.wing = 31;
    expect(broodSlots(s)).toBe(255);
    s.nursery.brood = Array.from({ length: 200 }, (_, i) => pet(i + 1, 4));
    expect(giftTotal(s, 'ash')).toBeLessThan(200);
  });
});
