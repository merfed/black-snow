import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame } from '../state';
import {
  buyRope, choose, dropAsh, dropEmbers, landingTime, net, pour, reflection, ropeCost, send, spot, stair, tideAt, wishNeed,
} from './stair';

function late() {
  const s = newGame();
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.chUnlocked = ['survey', 'undertow', 'archive', 'stair'];
  s.ash = new Decimal(1e300);
  return s;
}
const rng = () => 0.5;

describe('the drowned stair', () => {
  it('starts empty and pays nothing', () => {
    const s = late();
    const st = s.challenges.stair;
    expect(st.rope).toBe(0);
    expect(st.water).toEqual([0, 0, 0, 0]);
    for (const t of ['ash', 'zone3', 'comfort', 'zones'] as const) expect(stair.mult(s, t)).toBe(1);
    expect(stair.level(s)).toBe(0);
    stair.step(s, 100, rng);
    expect(st.water[0]).toBe(0);
  });

  it('rope costs ash, draws water and opens deeper bands', () => {
    const s = late();
    const before = s.ash;
    const cost = ropeCost(s);
    expect(buyRope(s)).toBe(true);
    expect(s.ash.eq(before.sub(cost))).toBe(true);
    stair.step(s, 100, rng);
    expect(s.challenges.stair.water[0]).toBeGreaterThan(0);
    expect(s.challenges.stair.water[1]).toBe(0);
    for (let i = 0; i < 4; i++) buyRope(s);
    stair.step(s, 100, rng);
    expect(s.challenges.stair.water[1]).toBeGreaterThan(0);
  });

  it('accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    for (const s of [a, b]) {
      for (let i = 0; i < 14; i++) buyRope(s);
      send(s);
      s.challenges.stair.tank = [{ g: 2, c: 0, p: 2 }, { g: 1, c: 1, p: 3 }, { g: 1, c: 2, p: 1 }];
    }
    stair.step(a, 400, rng);
    for (let i = 0; i < 8000; i++) stair.step(b, 0.05, rng);
    const sa = a.challenges.stair, sb = b.challenges.stair;
    for (let k = 0; k < 4; k++) expect(sa.water[k]).toBeCloseTo(sb.water[k], 4);
    expect(sa.landing).toBe(sb.landing);
    expect(sa.walk).toBeCloseTo(sb.walk, 4);
    expect(sa.breed).toBeCloseTo(sb.breed, 6);
  });

  it('the descent waits at a full queue and loses nothing', () => {
    const s = late();
    buyRope(s);
    send(s);
    stair.step(s, 1e6, rng);
    const st = s.challenges.stair;
    expect(st.queue.length).toBe(5);
    expect(st.walk).toBeLessThanOrEqual(landingTime(st.landing));
    expect(choose(s, 'take')).toBe(true);
    expect(choose(s, 'leave')).toBe(true);
    st.water[0] = 1000;
    expect(choose(s, 'candle')).toBe(true);
    expect(st.water[0]).toBeLessThan(1000);
    expect(st.queue.length).toBe(2);
    expect(stair.mult(s, 'zone3')).toBeGreaterThan(1);
  });

  it('wishes carry over and pay', () => {
    const s = late();
    s.embers = 100;
    expect(dropEmbers(s)).toBe(true);
    expect(s.embers).toBe(95);
    const st = s.challenges.stair;
    while (st.wishes < 3) dropAsh(s);
    expect(st.given).toBeGreaterThanOrEqual(wishNeed(2));
    expect(stair.mult(s, 'ash') * stair.mult(s, 'zone3')).toBeGreaterThan(1);
    st.water[2] = 50;
    const g = st.given;
    expect(pour(s, 2)).toBe(true);
    expect(st.given).toBeGreaterThan(g);
  });

  it('lanterns breed and brighten the zone', () => {
    const s = late();
    for (let i = 0; i < 6; i++) buyRope(s);
    const st = s.challenges.stair;
    st.water[1] = 1000;
    expect(net(s)).toBe(true);
    expect(net(s)).toBe(true);
    expect(st.tank.length).toBe(2);
    stair.step(s, 40000, rng);
    expect(st.tank.length).toBeGreaterThan(2);
    expect(stair.mult(s, 'zone3')).toBeGreaterThan(1.3);
  });

  it('reflections can be spotted', () => {
    const s = late();
    const st = s.challenges.stair;
    const r = reflection(st.reflId);
    expect(r.diffs.length).toBe(5);
    expect(spot(s, r.diffs[0].f.x, r.diffs[0].f.y)).toBe(true);
    expect(spot(s, r.diffs[0].f.x, r.diffs[0].f.y)).toBe(false);
    expect(st.spots).toBeGreaterThan(0);
    stair.step(s, 4 * 3600, rng);
    expect(st.found).toEqual([]);
  });

  it('tide is deterministic', () => {
    expect(tideAt(0)).toBeCloseTo(1);
    expect(tideAt(3.5 * 3600)).toBeCloseTo(0);
  });

  it('milestone is reachable in a few hours of check-ins', () => {
    const s = late();
    s.embers = 200;
    buyRope(s);
    send(s);
    const st = s.challenges.stair;
    let t = 0;
    while (!stair.milestone.done(s) && t < 6 * 3600) {
      for (let i = 0; i < 90; i++) stair.step(s, 20, rng);
      t += 1800;
      while (buyRope(s) && st.rope < 4 + t / 1200);
      while (st.queue.length) choose(s, 'candle') || choose(s, 'take');
      net(s);
      dropAsh(s);
      dropEmbers(s);
      pour(s, 2);
    }
    expect(stair.milestone.done(s)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(1.5 * 3600);
    expect(t).toBeLessThanOrEqual(3.5 * 3600);
  });
});
