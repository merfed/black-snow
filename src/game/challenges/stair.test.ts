import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame } from '../state';
import { serialize } from '../save';
import {
  breedRate, buyRope, choose, dropAsh, dropEmbers, landingTime, lanterns, net, packL, pour, reflection, ropeCost, ropeWater, send,
  settle, spot, stair, TANK_MAX, tideAt, waterMult,
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
    expect(buyRope(s)).toBe(false); // the second metre wants warm water too
    s.challenges.stair.water[0] = 1000;
    for (let i = 0; i < 4; i++) expect(buyRope(s)).toBe(true);
    expect(s.challenges.stair.water[0]).toBeLessThan(1000 - ropeWater(4));
    stair.step(s, 100, rng);
    expect(s.challenges.stair.water[1]).toBeGreaterThan(0);
  });

  it('accrues the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    for (const s of [a, b]) {
      s.challenges.stair.water[0] = 1e4;
      for (let i = 0; i < 14; i++) buyRope(s);
      send(s);
      s.challenges.stair.tank = [{ g: 2, c: 0, p: 2 }, { g: 1, c: 1, p: 3 }, { g: 1, c: 2, p: 1 }].map(packL);
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
    const r = st.queue[0], had = st.perks[r.item] ?? 0;
    expect(choose(s, 'candle')).toBe(true);
    expect(st.water[0]).toBeLessThan(1000);
    expect(st.perks[r.item]).toBe(had + (r.low ? 4 : 2)); // a candle takes it twice over
    expect(st.candles).toBe(1);
    expect(st.queue.length).toBe(2);
    expect(stair.mult(s, 'comfort')).toBeGreaterThan(1);
  });

  it('wishes carry over and pay', () => {
    const s = late();
    s.embers = 100;
    expect(dropEmbers(s)).toBe(true);
    expect(s.embers).toBe(95);
    const st = s.challenges.stair;
    expect(st.boons.embers).toBe(1);
    for (let i = 0; i < 6; i++) dropAsh(s); // 1 + 2 + 3 drops
    expect(st.boons.ash).toBe(3);
    expect(st.wishes).toBe(4);
    expect(stair.mult(s, 'ash')).toBeGreaterThan(1);
    expect(stair.mult(s, 'zone3')).toBeGreaterThan(1);
    st.water[2] = 50;
    const g = st.given;
    expect(pour(s, 2)).toBe(true);
    expect(st.given).toBeGreaterThan(g);
    expect(st.boons.water).toBe(2); // 300 points: marks at 60 and 170
  });

  it('each kind fills its own wish: a flood of water still leaves ash wishes reachable', () => {
    const s = late();
    const st = s.challenges.stair;
    st.water[3] = 1e6;
    pour(s, 3);
    const ash = st.boons.ash;
    dropAsh(s);
    expect(st.boons.ash).toBe(ash + 1);
    expect(st.since.ash).toBe(0);
  });

  it('water wishes settle instead of feeding themselves', () => {
    const s = late();
    const st = s.challenges.stair;
    st.water[0] = 1e6;
    for (let i = 0; i < 40; i++) buyRope(s);
    let t = 0;
    for (; t < 7 * 86400; t += 1800) {
      stair.step(s, 1800, rng);
      for (let k = 0; k < 4; k++) pour(s, k);
    }
    expect(st.boons.water).toBeLessThan(400);
    expect(waterMult(s)).toBeLessThan(5);
    expect(stair.mult(s, 'zone3')).toBeLessThan(10);
  });

  it('lanterns breed and brighten the zone', () => {
    const s = late();
    s.challenges.stair.water[0] = 1000;
    for (let i = 0; i < 6; i++) buyRope(s);
    const st = s.challenges.stair;
    st.water[1] = 1000;
    expect(net(s)).toBe(true);
    expect(net(s)).toBe(true);
    expect(st.tank.length).toBe(2);
    stair.step(s, 80000, rng);
    expect(st.tank.length).toBeGreaterThan(2);
    expect(stair.mult(s, 'zone3')).toBeGreaterThan(1.3);
  });

  it('the tank holds 256 at most, packed small', () => {
    const s = late();
    const st = s.challenges.stair;
    st.tank = Array.from({ length: TANK_MAX - 1 }, (_, i) => packL({ g: 1 + (i % 3), c: i % 5, p: 2 }));
    stair.step(s, 1e8, rng);
    expect(st.tank.length).toBe(TANK_MAX);
    expect(breedRate(s)).toBe(0);
    st.water[1] = 1e9;
    for (let i = 0; i < 4; i++) buyRope(s);
    s.challenges.stair.water[0] = 1e4;
    for (let i = 0; i < 6; i++) buyRope(s);
    expect(net(s)).toBe(false);
    expect(JSON.stringify(st.tank).length).toBeLessThan(2000);
    expect(lanterns(st).every(l => l.g >= 1 && l.p >= 1 && l.c < 5)).toBe(true);
  });

  it('old saves: a huge tank of objects is trimmed to the brightest 256, swollen boons become wish counts', () => {
    const s = late();
    const st = s.challenges.stair;
    const old = Array.from({ length: 20000 }, (_, i) => ({ g: 1 + (i % 7), c: i % 5, p: 1 + (i % 4) }));
    (st as unknown as { tank: unknown[] }).tank = old;
    st.wishes = 27000;
    st.boons = { ash: 0, embers: 0, water: 9.4e7 };
    settle(st);
    expect(st.tank.length).toBe(TANK_MAX);
    expect(lanterns(st).every(l => l.g === 7)).toBe(true);
    expect(st.glow).toBe(7 * TANK_MAX);
    expect(st.boons.water).toBeLessThanOrEqual(30);
    expect(st.wishes).toBe(st.boons.ash + st.boons.embers + st.boons.water);
    expect(serialize(s).length).toBeLessThan(40000);
    stair.step(s, 60, rng);
    expect(Number.isFinite(stair.mult(s, 'zone3'))).toBe(true);
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
      while (st.rope < 14 && buyRope(s));
      while (st.queue.length) choose(s, 'take');
      net(s);
      dropAsh(s);
      dropEmbers(s);
      pour(s, 1);
      pour(s, 2);
    }
    expect(stair.milestone.done(s)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(1.5 * 3600);
    expect(t).toBeLessThanOrEqual(3.5 * 3600);
  });
});
