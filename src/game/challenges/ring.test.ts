import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { ALCHEMY_ZONE } from '../alchemy';
import { newGame } from '../state';
import {
  buyRing, CATALYSTS, dropKind, FREE_PER, flip, freeRings, isBarker, peakSidelobe, pour, pourCost, rawPigment, reading, refine, ring,
  ringCost, rings, setSpan, socket,
} from './ring';

function late() {
  const s = newGame(() => 0.5);
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.zones[5].bought = 50;
  s.zones[5].amount = new Decimal(1e20);
  s.zones[ALCHEMY_ZONE].bought = Math.max(1, s.zones[ALCHEMY_ZONE].bought);
  s.chUnlocked = ['survey', 'undertow', 'archive', 'stair', 'seal', 'ring'];
  s.ash = new Decimal(1e300);
  s.alchemy.pigment = 1e12;
  s.alchemy.found = { tallow: 10, tide: 10, bell: 5 };
  return s;
}
const rs = (s: ReturnType<typeof late>) => s.challenges.ring;
const set = (s: ReturnType<typeof late>, code: number[]) => {
  code.forEach((p, i) => { if (rs(s).pol[i] !== p) flip(s, i); });
  setSpan(s, code.length);
};
const B7 = [1, 1, 1, -1, -1, 1, -1];
const B13 = [1, 1, 1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1];

describe('barker ring', () => {
  it('fresh state is untouched', () => {
    const s = newGame();
    const r = rs(s as ReturnType<typeof late>);
    expect(r.best).toBe(0);
    expect(r.found).toBe(0);
    expect(r.sock).toEqual([-1, -1]);
    expect(ring.level(s)).toBe(0);
  });

  it('knows Barker codes, reversed and negated too', () => {
    expect(isBarker(B7)).toBe(true);
    expect(isBarker([...B7].reverse())).toBe(true);
    expect(isBarker(B7.map(x => -x))).toBe(true);
    expect(isBarker(B13)).toBe(true);
    expect(isBarker([1, 1, 1, 1, 1, 1, 1])).toBe(false);
    expect(peakSidelobe([1, 1, 1, 1, 1, 1])).toBe(5);
  });

  it('mult is 1 untouched, more for a locked code, most for 13', () => {
    const s = late();
    const fresh = late();
    expect(reading(fresh).power).toBe(0);
    expect(ring.mult(fresh, 'pigment')).toBe(1);
    expect(ring.mult(fresh, 'ash')).toBe(1);
    while (rings(s) < 13) expect(buyRing(s)).toBe(true);
    set(s, B7);
    expect(reading(s).barker).toBe(true);
    expect(rs(s).best).toBe(7);
    const m7 = ring.mult(s, 'pigment');
    expect(m7).toBeGreaterThan(2.5);
    expect(ring.mult(s, 'ash')).toBeGreaterThan(1);
    set(s, B13);
    expect(rs(s).best).toBe(13);
    expect(ring.mult(s, 'pigment')).toBeGreaterThan(m7 * 1.8);
  });

  it('buying a ring spends pigment', () => {
    const s = late();
    const before = s.alchemy.pigment, n = rings(s);
    expect(buyRing(s)).toBe(true);
    expect(rings(s)).toBe(n + 1);
    expect(s.alchemy.pigment).toBeLessThan(before);
    s.alchemy.pigment = 0;
    expect(buyRing(s)).toBe(false);
  });

  it('step accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    b.challenges.ring.seed = a.challenges.ring.seed;
    set(a, [1, 1, 1, -1, 1]); set(b, [1, 1, 1, -1, 1]);
    for (let i = 0; i < 2000; i++) ring.step(a, 0.05, Math.random);
    ring.step(b, 100, Math.random);
    expect(a.challenges.ring.held).toBeCloseTo(b.challenges.ring.held, 6);
    expect(a.challenges.ring.dust).toBeCloseTo(b.challenges.ring.dust, 6);
    expect(a.challenges.ring.found).toBe(b.challenges.ring.found);
  });

  it('catalysts drop, socket, refine, and pay', () => {
    const s = late();
    expect(ring.mult(s, 'rust')).toBe(1);
    rs(s).dust = 152;
    expect(pour(s)).toBe(true); // the 153rd silt: nine drops
    expect(pour(s)).toBe(true);
    expect(rs(s).pours).toBe(2);
    const r = rs(s);
    expect(r.found).toBe(9);
    expect(new Set(Array.from({ length: 8 }, (_, n) => dropKind(r.seed, n))).size).toBe(8);
    expect(r.sock[0]).toBeGreaterThanOrEqual(0);
    const k = dropKind(r.seed, 8); // the ninth is a duplicate
    expect(r.cats[k]).toBe(2);
    expect(socket(s, 0, k)).toBe(true);
    const t = CATALYSTS[k].target;
    const before = ring.mult(s, t);
    expect(before).toBeGreaterThan(1);
    expect(refine(s, k)).toBe(true);
    expect(r.cats[k]).toBe(1);
    expect(ring.mult(s, t)).toBeGreaterThan(before);
    expect(refine(s, k)).toBe(false); // no spare copy left
  });

  it('free rings count only Spirals bought after the Ring opened; an old save that played keeps them', () => {
    const s = late();
    s.zones[5].bought = 122;
    ring.step(s, 1, Math.random);
    expect(freeRings(s)).toBe(0);
    expect(rings(s)).toBe(3);
    s.zones[5].bought += FREE_PER * 2;
    expect(freeRings(s)).toBe(2);
    s.zones[5].bought += FREE_PER * 10;
    expect(freeRings(s)).toBe(4);
    const old = late();
    old.zones[5].bought = 122;
    old.challenges.ring.best = 7;
    ring.step(old, 1, Math.random);
    expect(freeRings(old)).toBe(4);
  });

  it('prices follow the pigment rate, so a banked hour does not buy the whole ring', () => {
    const s = late();
    s.alchemy.found = { tallow: 200, tide: 200, bell: 200 };
    const raw = rawPigment(s);
    expect(raw).toBeGreaterThan(0);
    expect(ringCost(s)).toBeGreaterThanOrEqual(raw * 600);
    s.alchemy.pigment = raw * 3600;
    while (buyRing(s));
    expect(rings(s)).toBeLessThan(7);
    const p0 = pourCost(s);
    s.alchemy.pigment = 1e30;
    pour(s);
    expect(pourCost(s)).toBeGreaterThan(p0);
  });

  it('milestone is reachable', () => {
    const s = late();
    while (rings(s) < 7) buyRing(s);
    expect(ring.milestone.done(s)).toBe(false);
    set(s, B7);
    for (let t = 0; t < 6 * 3600 && !ring.milestone.done(s); t += 20) ring.step(s, 20, Math.random);
    expect(ring.milestone.done(s)).toBe(true);
    expect(ring.level(s)).toBeGreaterThanOrEqual(9);
  });
});
