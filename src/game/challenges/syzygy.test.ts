import Decimal from 'break_eternity.js';
import { afterEach, describe, expect, it } from 'vitest';
import { newGame } from '../state';
import { CHALLENGES } from './index';
import {
  buyLantern, buyLens, buyShade, buyWire, chapters, cut, darkLen, dreamMap, EDGES, edgeKey, gateReady, liveCurrents, openGate,
  PAGES_PER_CHAPTER, refreshNodes, ROOMS, routeEdge, syzygy, TAPE13, totality, wireCost, wiresFree,
} from './syzygy';

const others = CHALLENGES.filter(c => c.id !== 'syzygy');
const saved = others.map(c => ({ level: c.level, done: c.milestone.done }));
afterEach(() => others.forEach((c, i) => { c.level = saved[i].level; c.milestone.done = saved[i].done; }));
/** Stand in for the other eight modules while they are being built. */
const fakeOthers = (level: number, done = true) => others.forEach(c => { c.level = () => level; c.milestone.done = () => done; });

function late() {
  const s = newGame();
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.chUnlocked = CHALLENGES.map(c => c.id);
  s.ash = new Decimal(1e300);
  return s;
}
const key = (a: number, b: number) => edgeKey(EDGES.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))!);

describe('syzygy', () => {
  it('starts untouched', () => {
    const s = late();
    const z = s.challenges.syzygy;
    expect(z.dreams).toBe(0);
    expect(z.gateOpen).toBe(false);
    expect(wiresFree(z)).toBe(1);
    for (const t of ['ash', 'zones', 'zone0', 'zone8'] as const) expect(syzygy.mult(s, t)).toBe(1);
    expect(syzygy.level(s)).toBe(0);
    expect(syzygy.milestone.done(s)).toBe(false);
  });

  it('builds a full maze every night, with one page', () => {
    const m = dreamMap(42, 3);
    expect(m.order.length).toBe(ROOMS);
    expect(new Set(m.order).size).toBe(ROOMS);
    expect(m.doors.length).toBe(ROOMS - 1);
    expect(m.kinds.filter(k => k === 'page').length).toBe(1);
    expect(dreamMap(42, 4).order).not.toEqual(m.order);
  });

  it('dreams the same in big steps as in small ones', () => {
    const a = late(), b = late();
    b.challenges.syzygy.seed = a.challenges.syzygy.seed;
    for (const s of [a, b]) s.challenges.syzygy.sun = 0;
    syzygy.step(a, 100, Math.random);
    for (let i = 0; i < 2000; i++) syzygy.step(b, 0.05, Math.random);
    const za = a.challenges.syzygy, zb = b.challenges.syzygy;
    expect(za.dreams).toBeGreaterThan(0);
    expect(Math.abs(za.dreams - zb.dreams) / za.dreams).toBeLessThan(0.01);
    expect(za.rooms).toBe(zb.rooms);
  });

  it('crosses nights in big steps and writes one page a night', () => {
    const s = late();
    for (let i = 0; i < 2000; i++) syzygy.step(s, (3600 * 24 + 60) / 2000, Math.random);
    const z = s.challenges.syzygy;
    expect(z.night).toBe(8);
    expect(z.pages).toBe(8);
    expect(chapters(z)).toBe(1);
  });

  it('routes a current and pays by the weaker end', () => {
    const s = late();
    fakeOthers(20);
    const z = s.challenges.syzygy;
    refreshNodes(s);
    expect(routeEdge(s, key(8, 1))).toBe(true);
    expect(routeEdge(s, key(5, 4))).toBe(false); // out of wires
    expect(liveCurrents(z)).toBe(1);
    expect(syzygy.mult(s, 'ash')).toBeGreaterThan(1);
    expect(syzygy.mult(s, 'zone7')).toBeGreaterThan(1); // node 8 is zone index 7
    expect(syzygy.mult(s, 'zone0')).toBeGreaterThan(1); // node 1 is zone index 0
    expect(syzygy.mult(s, 'zone3')).toBe(1);
    expect(cut(s, key(8, 1))).toBe(true);
    expect(syzygy.mult(s, 'ash')).toBe(1);
  });

  it('buys wires, shades and lenses with what they cost', () => {
    const s = late();
    const z = s.challenges.syzygy;
    z.dreams = 1e6;
    const c = wireCost(z);
    expect(buyWire(s)).toBe(true);
    expect(z.dreams).toBe(1e6 - c);
    expect(wiresFree(z)).toBe(2);
    expect(buyShade(s)).toBe(true);
    const dark = darkLen(z);
    s.ash = new Decimal(1e20);
    const ash = s.ash;
    expect(buyLens(s)).toBe(true);
    expect(darkLen(z)).toBeLessThan(dark);
    expect(s.ash.lt(ash)).toBe(true);
    expect(buyLantern(s)).toBe(true);
    expect(z.lanterns).toBe(1);
  });

  it('eclipses: totality multiplies the zones', () => {
    const s = late();
    const z = s.challenges.syzygy;
    z.sun = darkLen(z) - 1;
    expect(syzygy.mult(s, 'zones')).toBe(1);
    syzygy.step(s, 2, Math.random);
    expect(totality(z)).toBe(true);
    expect(syzygy.mult(s, 'zones')).toBeGreaterThan(1);
    expect(syzygy.mult(s, 'zones')).toBeLessThanOrEqual(1.5);
  });

  it('opens the gate once every zone has made its offering', () => {
    const s = late();
    const z = s.challenges.syzygy;
    z.dreams = 1e6;
    z.rooms = 200;
    fakeOthers(3);
    for (let i = 0; i < 3; i++) buyWire(s);
    refreshNodes(s);
    for (const [a, b] of [[8, 1], [7, 2], [5, 4]]) routeEdge(s, key(a, b));
    expect(gateReady(s)).toBe(false); // levels too low
    fakeOthers(20);
    refreshNodes(s);
    expect(gateReady(s)).toBe(true);
    const before = syzygy.mult(s, 'ash');
    expect(openGate(s)).toBe(true);
    expect(syzygy.milestone.done(s)).toBe(true);
    expect(s.log[0].text).toContain('GATE');
    expect(openGate(s)).toBe(false);
    routeEdge(s, key(9, 0));
    expect(syzygy.mult(s, 'ash')).toBeGreaterThan(before);
    expect(syzygy.level(s)).toBe(4 + z.pages + 10);
  });

  it('the last chapter puts the thirteenth tape on the shelf', () => {
    const s = late();
    const z = s.challenges.syzygy;
    z.pages = PAGES_PER_CHAPTER * 6 - 1;
    z.explored = 0;
    syzygy.step(s, 60 * ROOMS, Math.random);
    expect(z.pages).toBe(PAGES_PER_CHAPTER * 6);
    expect(s.tapes).toContain(TAPE13);
  });

  it('paces the gate at a couple of hours of checking in', () => {
    const s = late();
    s.ash = new Decimal(0);
    fakeOthers(20);
    const z = s.challenges.syzygy;
    let t = 0;
    // Check in every 30 minutes: buy wires and route them, then save for the gate.
    while (!z.gateOpen && t < 12 * 3600) {
      for (let i = 0; i < 360; i++) syzygy.step(s, 5, Math.random);
      t += 1800;
      // Ash is plentiful this late: pretend a few lanterns get bought along the way.
      z.lanterns = Math.min(6, Math.floor(t / 1800) * 2);
      while (z.wires < 4 && z.dreams >= wireCost(z) + (z.wires >= 3 ? 3000 : 0)) buyWire(s);
      for (const [a, b] of [[8, 1], [7, 2], [5, 4], [6, 3]]) if (wiresFree(z) > 0 && !z.links[key(a, b)]) routeEdge(s, key(a, b));
      s.ash = new Decimal(1e300);
      openGate(s);
    }
    expect(t / 3600).toBeGreaterThanOrEqual(1.5);
    expect(t / 3600).toBeLessThanOrEqual(3);
    const ash = syzygy.mult(s, 'ash');
    expect(ash).toBeGreaterThan(3);
    expect(ash).toBeLessThan(12);
  });
});
