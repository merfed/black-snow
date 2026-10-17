import Decimal from 'break_eternity.js';
import { afterEach, describe, expect, it } from 'vitest';
import { newGame } from '../state';
import { CHALLENGES } from './index';
import {
  buyLantern, buyLens, buyShade, buyWire, chapters, cut, darkLen, dreamMap, EDGES, edgeKey, gateCost, gateReady, liveCurrents, neighbours, openGate,
  PAGES_PER_CHAPTER, refreshNodes, ROOMS, routeEdge, syzygy, TAPE13, toggle, totality, wireCost, wiresFree,
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
    expect(wiresFree(z)).toBe(2); // two wires come free
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

  it('totality comes out the same in hour-long steps as in fine ones', () => {
    const a = late(), b = late();
    b.challenges.syzygy.seed = a.challenges.syzygy.seed;
    for (let i = 0; i < 30; i++) syzygy.step(a, 3600, Math.random);
    for (let i = 0; i < 30 * 60; i++) syzygy.step(b, 60, Math.random);
    const da = a.challenges.syzygy.dreams, db = b.challenges.syzygy.dreams;
    expect(Math.abs(da - db) / db).toBeLessThan(0.01);
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
    expect(routeEdge(s, key(5, 4))).toBe(true);
    expect(routeEdge(s, key(7, 2))).toBe(false); // out of wires
    cut(s, key(5, 4));
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
    expect(wiresFree(z)).toBe(3);
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

  /** Check in every 30 minutes: buy one wire, route them, buy `lanterns` lanterns at the first check-in, open the gate. */
  const paceGate = (lanterns: number) => {
    const s = late();
    fakeOthers(20);
    const z = s.challenges.syzygy;
    z.sun = 0;
    let t = 0;
    while (!z.gateOpen && t < 12 * 3600) {
      for (let i = 0; i < 360; i++) syzygy.step(s, 5, Math.random);
      t += 1800;
      z.lanterns = lanterns;
      if (z.wires < 2 && z.dreams >= wireCost(z)) buyWire(s);
      for (const [a, b] of [[8, 1], [7, 2], [5, 4]]) if (wiresFree(z) > 0 && !z.links[key(a, b)]) routeEdge(s, key(a, b));
      openGate(s);
    }
    return { s, h: t / 3600 };
  };

  it('paces the gate at 1.5 to 3 hours of checking in, lanterns or not', () => {
    for (const n of [0, 1, 3]) {
      const { s, h } = paceGate(n);
      expect(h).toBeGreaterThanOrEqual(1.5);
      expect(h).toBeLessThanOrEqual(3);
      const ash = syzygy.mult(s, 'ash');
      expect(ash).toBeGreaterThan(3);
      expect(ash).toBeLessThan(6.5);
    }
  });

  it('the gate wants only a minute of income in ash', () => {
    const s = late();
    s.ash = new Decimal(0);
    expect(gateCost(s).ash.toNumber()).toBeLessThanOrEqual(1e15);
  });

  it('a week of wires and finds tapers the ash bonus', () => {
    const s = late();
    fakeOthers(60);
    const z = s.challenges.syzygy;
    z.gateOpen = true;
    z.wires = 10;
    z.pages = 30;
    refreshNodes(s);
    for (const e of EDGES.slice(0, 11)) routeEdge(s, edgeKey(e));
    const ash = syzygy.mult(s, 'ash');
    expect(ash).toBeGreaterThan(8);
    expect(ash).toBeLessThan(30);
    for (let i = 0; i < 8; i++) expect(syzygy.mult(s, `zone${i}` as 'zone0')).toBeLessThan(1.4);
  });

  it('touching two nodes lays a wire, touching them again takes it back', () => {
    const s = late();
    const z = s.challenges.syzygy;
    expect(neighbours(8).sort()).toEqual([1, 7, 9]);
    expect(toggle(s, 3, 9)).toBe(false); // no route between them
    expect(toggle(s, 1, 8)).toBe(true);
    expect(z.links[key(8, 1)]).toBe(1);
    expect(toggle(s, 5, 4)).toBe(true);
    expect(wiresFree(z)).toBe(0);
    expect(toggle(s, 2, 7)).toBe(false); // no wire left
    expect(toggle(s, 8, 1)).toBe(true);
    expect(z.links[key(8, 1)]).toBeUndefined();
    expect(wiresFree(z)).toBe(1);
  });
});

describe('the 7-1 pair', () => {
  it('wires the Gt-28 gate by its own key, and by touching 7 and 1 twice', () => {
    const s = newGame();
    const z = s.challenges.syzygy;
    z.wires = 3;
    const gate = EDGES.find(e => e.kind === 'gate' && [e.a, e.b].includes(7) && [e.a, e.b].includes(1));
    if (!gate) return;
    const gk = edgeKey(gate);
    expect(routeEdge(s, gk)).toBe(true);
    expect(z.links[gk]).toBe(1);
    cut(s, gk);
    toggle(s, 7, 1);
    expect(z.links[gk] ?? 0).toBe(0);
    toggle(s, 7, 1);
    expect(z.links[gk]).toBe(1);
    toggle(s, 7, 1);
    expect(Object.values(z.links).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
