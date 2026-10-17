import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { UPGRADES, ZONES } from './data';
import * as e from './engine';
import * as w from './wiring';
import { deserialize, serialize } from './save';
import { newGame, type GameState } from './state';

const fixed = () => 0.5;
const rich = (s: GameState, n = 1e9) => { s.ash = s.ash.add(n); s.ashThisRun = s.ashThisRun.add(n); };
const status = (s: GameState, id: string) => e.upgradeStatus(s, UPGRADES.find(u => u.id === id)!);

describe('early path', () => {
  it('starts with one button: no shafts until the floorboards come up', () => {
    const s = newGame(fixed);
    for (let i = 0; i < 15; i++) e.listen(s);
    expect(s.ash.toNumber()).toBe(15);
    expect(e.zoneVisible(s, 0)).toBe(false);
    expect(e.buyUpgrade(s, 'thaw')).toBe(true);
    expect(e.listenPower(s).toNumber()).toBe(2);
    expect(status(s, 'floor')).toBe('available');
    for (let i = 0; i < 750; i++) e.listen(s);
    expect(e.buyUpgrade(s, 'floor')).toBe(true);
    expect(e.zoneVisible(s, 0)).toBe(true);
  });

  it('shows the next step as locked with its gate, then opens it', () => {
    const s = newGame(fixed);
    rich(s);
    e.buyUpgrade(s, 'thaw');
    e.buyUpgrade(s, 'floor');
    expect(status(s, 'copper')).toBe('locked'); // needs 5 Shallow Bores
    for (let i = 0; i < 5; i++) e.buyShaft(s, 0);
    expect(status(s, 'copper')).toBe('available');
    expect(status(s, 'coil')).toBe('locked');
    expect(status(s, 'ear')).toBe('hidden');
  });

  it('a doctrine closes its siblings', () => {
    const s = newGame(fixed);
    rich(s);
    for (const id of ['thaw', 'floor'] as const) e.buyUpgrade(s, id);
    for (let i = 0; i < 5; i++) e.buyShaft(s, 0);
    for (const id of ['copper', 'coil'] as const) e.buyUpgrade(s, id);
    expect(status(s, 'ear')).toBe('available');
    expect(e.buyUpgrade(s, 'spade')).toBe(true);
    expect(status(s, 'ear')).toBe('swap');
    expect(status(s, 'spade2')).toBe('available');
    e.buyUpgrade(s, 'spade2');
    // Switching costs more than the first pick, and the old path goes dormant until you switch back.
    expect(e.upgradeCost(s, UPGRADES.find(u => u.id === 'ear')!).gt(2000)).toBe(true);
    expect(e.buyUpgrade(s, 'ear')).toBe(true);
    expect(e.owns(s, 'spade')).toBe(false);
    expect(status(s, 'spade2')).toBe('dormant');
    const again = e.upgradeCost(s, UPGRADES.find(u => u.id === 'spade')!);
    expect(e.buyUpgrade(s, 'spade')).toBe(true);
    expect(e.owns(s, 'spade2')).toBe(true);
    expect(e.upgradeCost(s, UPGRADES.find(u => u.id === 'eye')!).gt(again)).toBe(true);
  });

  it('the every upgrade lets a fork be held whole', () => {
    const s = newGame(fixed);
    rich(s);
    for (const id of ['thaw', 'floor'] as const) e.buyUpgrade(s, id);
    for (let i = 0; i < 5; i++) e.buyShaft(s, 0);
    for (const id of ['copper', 'coil', 'spade'] as const) e.buyUpgrade(s, id);
    s.zones[4].bought = 10;
    s.ash = new Decimal(1e40);
    expect(e.buyUpgrade(s, 'every_doctrine')).toBe(true);
    expect(e.buyUpgrade(s, 'ear')).toBe(true);
    expect(e.buyUpgrade(s, 'eye')).toBe(true);
    expect(['ear', 'spade', 'eye'].every(id => e.owns(s, id as 'ear'))).toBe(true);
  });
});

describe('shafts', () => {
  it('prices climb per purchase and output climbs every 10', () => {
    const s = newGame(fixed);
    rich(s);
    e.buyUpgrade(s, 'thaw');
    e.buyUpgrade(s, 'floor');
    const first = e.zoneCost(s, 0).toNumber();
    e.buyShaft(s, 0);
    expect(e.zoneCost(s, 0).toNumber()).toBeGreaterThan(first);
    for (let i = 0; i < 9; i++) e.buyShaft(s, 0);
    expect(e.zoneMult(s, 0).toNumber()).toBe(ZONES[0].bonus);
  });

  it('each zone bores the one above it', () => {
    const s = newGame(fixed);
    s.zones[1].amount = new Decimal(25);
    e.produce(s, 1);
    expect(s.zones[0].amount.toNumber()).toBeCloseTo(1);
  });

  it('the start is slow: 3 shafts make well under 1 ash per second', () => {
    const s = newGame(fixed);
    s.zones[0].amount = new Decimal(3);
    expect(e.ashPerSecond(s).toNumber()).toBeLessThan(1);
  });
});

describe('siren', () => {
  it('never happens before the antenna', () => {
    const s = newGame(fixed);
    for (let t = 0; t < 400; t += 1) e.tick(s, 1, fixed);
    expect(s.sirensSeen).toBe(0);
  });

  it('is passive: stops ash, pays rust, and ends on its own', () => {
    const s = newGame(fixed);
    s.upgrades = { floor: true, antenna: true };
    s.zones[0].amount = new Decimal(5);
    s.zones[0].bought = 5;
    s.siren.timer = 0.01;
    e.tick(s, 0.05, fixed);
    expect(s.siren.active).toBe(true);
    expect(e.ashPerSecond(s).toNumber()).toBe(0);
    for (let t = 0; t < 46; t += 0.5) e.tick(s, 0.5, fixed);
    expect(s.siren.active).toBe(false);
    expect(s.rust).toBeGreaterThan(0);
  });
});

describe('feel', () => {
  it('calm log lines trickle, at most one every 25 seconds', () => {
    const s = newGame(fixed);
    rich(s, 1e13); // crosses every milestone at once
    e.listen(s);
    const printed = s.log.length;
    e.tick(s, 0.05, fixed);
    expect(s.log.length).toBe(printed + 1);
    for (let t = 0; t < 20; t += 1) e.tick(s, 1, fixed);
    expect(s.log.length).toBe(printed + 1);
    expect(s.logQueue.length).toBeLessThanOrEqual(2);
  });

  it('resonance needs the coil, builds with fast listening, then fades', () => {
    const s = newGame(fixed);
    for (let i = 0; i < 20; i++) e.listen(s);
    expect(s.resonance).toBe(0);
    s.upgrades.coil = true;
    for (let i = 0; i < 20; i++) e.listen(s);
    expect(s.resonance).toBeCloseTo(1);
    expect(e.listenPower(s).toNumber()).toBeCloseTo(2);
    for (let t = 0; t < 5; t += 0.05) e.tick(s, 0.05, fixed);
    expect(s.resonance).toBe(0);
  });

  it('warm flakes appear after the floorboards and can be caught', () => {
    const s = newGame(fixed);
    s.upgrades.floor = true;
    for (let t = 0; t < 46; t += 0.05) e.tick(s, 0.05, fixed);
    expect(s.warmFlake.active).toBe(true);
    expect(e.catchWarmFlake(s, fixed).toNumber()).toBe(15);
    expect(s.warmFlake.active).toBe(false);
  });
});

describe('save', () => {
  it('round-trips Decimals, upgrades and rites', () => {
    const s = newGame(fixed);
    s.ash = new Decimal('1e400');
    s.rites.salt = true;
    s.upgrades.thaw = true;
    const back = deserialize(serialize(s));
    expect(back.ash.eq(s.ash)).toBe(true);
    expect(back.zones[0].amount instanceof Decimal).toBe(true);
    expect(back.rites.salt).toBe(true);
    expect(back.upgrades.thaw).toBe(true);
  });

  it('upgrades a v1 save without losing its shafts', () => {
    const s = newGame(fixed);
    s.zones[0].bought = 12;
    const v1 = JSON.parse(serialize(s));
    v1.version = 1;
    delete v1.upgrades;
    const back = deserialize(JSON.stringify(v1));
    expect(back.upgrades.floor).toBe(true);
    expect(e.zoneVisible(back, 0)).toBe(true);
  });

  it('catches up time away without sirens', () => {
    const s = newGame(fixed);
    s.zones[0].amount = new Decimal(5);
    e.catchUp(s, 3600);
    expect(s.ash.toNumber()).toBeCloseTo(3600, 0);
    expect(s.log[0].kind).toBe('away');
  });
  it('dev ash counts as caught ash and ignores non-positive amounts', () => {
    const s = newGame();
    e.devAddAsh(s, new Decimal(1e6));
    expect(s.ash.toNumber()).toBe(1e6);
    expect(s.ashThisRun.toNumber()).toBe(1e6);
    e.devAddAsh(s, new Decimal(-5));
    expect(s.ash.toNumber()).toBe(1e6);
  });
  it('weather rolls over to a different kind', () => {
    const s = newGame();
    s.weather.timer = 0.01;
    e.tick(s, 0.05, () => 0.5);
    expect(s.weather.id).not.toBe('calm');
    expect(s.weather.timer).toBeGreaterThan(100);
  });

  it('station fixtures add comfort, which lifts all ash', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true, backroom: true };
    s.ash = new Decimal(1e4);
    const before = e.globalMult(s).toNumber();
    expect(e.buildFixture(s, 'kettle')).toBe(true);
    expect(e.buildFixture(s, 'kettle')).toBe(true);
    expect(e.comfort(s)).toBe(2);
    expect(e.globalMult(s).toNumber()).toBeGreaterThan(before);
  });

  it('warm flakes leave embers that buy kiln upgrades', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true };
    s.warmFlake = { active: true, x: 0.5, y: 0.5, ttl: 5, spawnIn: 0 };
    e.catchWarmFlake(s, () => 0.5);
    expect(s.embers).toBe(1);
    s.embers = 3;
    expect(e.buyKiln(s, 'bellows')).toBe(true);
    expect(s.embers).toBe(0);
  });

  it('the first egg is found, hatches with warmth, and its creature grows when fed', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true };
    s.ashThisRun = new Decimal(2e5);
    e.tick(s, 0.05, () => 0.5);
    expect(s.nursery.eggs.length).toBe(1);
    const id = s.nursery.eggs[0].id;
    s.embers = 5;
    for (let k = 0; k < 5; k++) e.warmEgg(s, id);
    e.tick(s, 0.05, () => 0.5);
    expect(s.nursery.brood.length).toBe(1);
    expect(s.nursery.seen.length).toBe(1);
    s.ash = new Decimal(1e6);
    s.nursery.brood[0].hunger = 0;
    expect(e.feedCreature(s, id)).toBe(true);
    expect(e.singTo(s, id)).toBe(true);
    expect(e.singTo(s, id)).toBe(false);
  });

  it('two grown creatures breed an egg that mixes their genes', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true };
    s.nursery.found = true;
    const g = { body: 1, eyes: 2, limbs: 3, mark: 4, hue: 5, accent: 6, shell: 7, seed: 8 };
    const mk = (id: number) => ({ id, genome: { ...g }, stage: 3, hunger: 90, mood: 90, growth: 0, singIn: 0, breedIn: 0 });
    s.nursery.brood = [mk(1), mk(2)];
    s.ash = new Decimal(1e9);
    s.embers = 10;
    expect(e.breedPair(s, 1, 2, () => 0.9)).toBe(true);
    expect(s.nursery.eggs.length).toBe(1);
    expect(s.nursery.eggs[0].genome.body).toBe(1);
    expect(e.breedPair(s, 1, 2)).toBe(false); // cooling down
  });

  it('zone upgrades level up again and again, each level needing more dug', () => {
    const s = newGame();
    s.ash = new Decimal(1e30);
    s.zones[0].bought = 25;
    expect(e.buyZoneUp(s, 0, 0)).toBe(true);
    expect(e.buyZoneUp(s, 0, 0)).toBe(true);
    expect(e.buyZoneUp(s, 0, 0)).toBe(false); // level 3 needs 43 dug
    expect(e.zoneUpLevel(s, 0, 0)).toBe(2);
  });

  it('max all opens only after every upgrade in the zone is bought once', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true };
    s.ash = new Decimal(1e30);
    s.zones[0].bought = 100;
    e.maxZone(s, 0);
    expect(s.zones[0].bought).toBe(100);
    for (let k = 0; k < 4; k++) e.buyZoneUp(s, 0, k);
    e.maxZone(s, 0);
    expect(s.zones[0].bought).toBeGreaterThan(100);
  });

  it('the dial finds frequencies with echoes and tunes one at a time', () => {
    const s = newGame();
    s.upgrades = { thaw: true, floor: true, coil: true };
    s.echoes = 50;
    expect(e.tune(s, 'numbers')).toBe(true);
    expect(e.tune(s, 'hum')).toBe(true);
    expect(s.tuned).toBe('hum');
    expect(e.tune(s, 'numbers')).toBe(true);
    expect(s.echoes).toBe(0);
  });

  it('zone upgrades open at their bought count', () => {
    const s = newGame();
    s.ash = new Decimal(1e9);
    expect(e.zoneUpStatus(s, 0, 0)).toBe('locked');
    s.zones[0].bought = 10;
    const before = e.zoneMult(s, 0).toNumber();
    expect(e.zoneUpStatus(s, 0, 0)).toBe('available');
    expect(e.buyZoneUp(s, 0, 0)).toBe(true);
    expect(e.zoneMult(s, 0).toNumber()).toBeCloseTo(before * 1.25);
  });

  it('dev set changes any stored resource', () => {
    const s = newGame();
    e.devSet(s, 'rust', new Decimal(42));
    e.devSet(s, 'zone3', new Decimal(7));
    e.devSet(s, 'ash', new Decimal(10));
    expect(s.rust).toBe(42);
    expect(s.zones[2].amount.toNumber()).toBe(7);
    expect(s.ash.toNumber()).toBe(10);
  });
});

describe('wiring', () => {
  const lay = (s: ReturnType<typeof newGame>, tier = 4) => {
    for (let x = 2; x <= 22; x++) w.place(s, x, 8, 'wire', tier);
    w.place(s, 22, 7, 'wire', tier);
  };

  it('carries the core signal along wires to a zone port', () => {
    const s = newGame();
    s.wiring.tier = 4; s.wiring.cycles = 1e9;
    lay(s);
    const f = w.flow(s);
    expect(f.ports[3]).toBeCloseTo(10 - 22 * 0.1);
    expect(w.wiringMult(s, 3)).toBeCloseTo(1 + Math.sqrt(10 - 2.2) / 7);
  });

  it('upgrades in place for the difference and refunds on removal', () => {
    const s = newGame();
    s.wiring.tier = 2; s.wiring.cycles = 100;
    expect(w.place(s, 5, 5, 'wire', 1)).toBe(true);
    expect(s.wiring.cycles).toBe(99);
    expect(w.place(s, 5, 5, 'wire', 2)).toBe(true);
    expect(s.wiring.cycles).toBe(90);
    expect(w.place(s, 5, 5, 'wire', 1)).toBe(false);
    expect(w.remove(s, 5, 5)).toBe(true);
    expect(s.wiring.cycles).toBe(100);
  });

  it('a branch divides the signal unless it is a splitter', () => {
    const s = newGame();
    s.wiring.tier = 4; s.wiring.cycles = 1e9;
    w.place(s, 2, 8, 'relay', 4); // lifts to 60
    w.place(s, 3, 8, 'wire', 4); w.place(s, 2, 7, 'wire', 4);
    let f = w.flow(s);
    expect(f.strength['3,8']).toBeCloseTo(30 - 0.1);
    w.place(s, 2, 8, 'split', 4);
    f = w.flow(s);
    expect(f.strength['3,8']).toBeCloseTo(10 - 0.1);
    expect(f.strength['2,7']).toBeCloseTo(10 - 0.1);
  });

  it('upgrade all lifts every part to the best known tier', () => {
    const s = newGame();
    s.wiring.cycles = 1e9;
    lay(s, 1);
    s.wiring.tier = 3;
    w.upgradeAll(s);
    expect(Object.values(s.wiring.cells).every(p => p.tier === 3)).toBe(true);
  });
});

describe('rarities and achievements', () => {
  it('rolls rarest first and pays rare flakes far more', () => {
    expect(e.rollRarity(() => 0.99)).toBe(0);
    expect(e.rollRarity(() => 0)).toBe(4);
    const s = newGame();
    s.upgrades = { thaw: true, floor: true };
    s.warmFlake = { active: true, x: 0.5, y: 0.5, ttl: 5, spawnIn: 0, rarity: 0 };
    const common = e.warmFlakeReward(s);
    s.warmFlake.rarity = 2;
    expect(e.warmFlakeReward(s).toNumber()).toBe(common.toNumber() * 40);
    const embers = s.embers;
    e.catchWarmFlake(s, () => 0.9);
    expect(s.embers - embers).toBe(8);
    expect(s.stats.flakes[2]).toBe(1);
  });

  it('records achievements once and each adds 1% to all ash', () => {
    const s = newGame();
    const before = e.globalMult(s).toNumber();
    e.listen(s);
    e.tick(s, 1.1, () => 0.5);
    expect(s.achievements.first).toBeDefined();
    expect(e.globalMult(s).toNumber()).toBeCloseTo(before * (1 + 0.01 * Object.keys(s.achievements).length));
  });
});
