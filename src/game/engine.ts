// Game rules. Every function mutates the state it is given and never touches React, timers or
// storage, so the whole simulation can run in tests or in an offline catch-up.
import Decimal from 'break_eternity.js';
import { fmt } from './format';
import {
  AMBIENT_LINES, ASH_MILESTONES, RITES, SIREN_END_LINES, SIREN_START_LINES, UPGRADES, WARM_LINES, ZONES,
  type RiteId, type UpgradeDef, type UpgradeId,
} from './data';
import { randomSirenGap, type GameState, type LogEntry } from './state';
import {
  BREED_COOLDOWN, BREED_STAGE, COMFORT_PERKS, EGG_FOUND_AT, EGG_GROWTH, EGG_LINES, FIXTURE_GROWTH, FIXTURES, FREQS,
  KILN, NEST_BROOD, NEST_EGGS, NURSERY_UPS, RARITIES, WEATHER, ZONE_UP_NAMES, ZONE_UP_SLOTS,
  type FixtureId, type FreqId, type KilnId, type NurseryUpId, type WeatherId,
} from './systems';
import { cycleRate, wiringMult } from './wiring';
import { patternMult } from './patterns';
import { alchemyOpen, pigmentBase, stepAlchemy, tinctureMult } from './alchemy';
import { achievementMult, checkAchievements } from './achievements';
import { breed, giftOf, randomGenome, speciesKey, type Gift } from './genome';
import type { Creature } from './state';
import { BROOD_MAX, familiarGift, quirkMult } from './familiars';
import { chMult, stepChallenges } from './challenges';
import { awayHours, citadelOpen, stepCitadel, wakeCitadel } from './citadel';

export type Rng = () => number;

const LOG_LIMIT = 80;
const LOG_PACE = 25; // seconds between calm lines: the log is flavor, not a feed
const SIREN_LENGTH = 45;

const pick = <T,>(xs: T[], rng: Rng) => xs[Math.floor(rng() * xs.length) % xs.length];

// ---- log ----

/** Siren and away lines, and anything the player just caused, print at once; the rest trickles. */
export function log(s: GameState, text: string, kind: LogEntry['kind'] = 'plain', now = kind === 'siren' || kind === 'away') {
  const entry = { id: s.logSeq++, text, kind };
  if (now) return print(s, entry);
  s.logQueue.push(entry);
  while (s.logQueue.length > 2) {
    const plain = s.logQueue.findIndex(e => e.kind === 'plain');
    s.logQueue.splice(plain >= 0 ? plain : 0, 1);
  }
}

function print(s: GameState, entry: LogEntry) {
  s.log.unshift(entry);
  if (s.log.length > LOG_LIMIT) s.log.length = LOG_LIMIT;
}

function stepLog(s: GameState, dt: number) {
  s.logGap -= dt;
  if (s.logGap <= 0 && s.logQueue.length) {
    print(s, s.logQueue.shift()!);
    s.logGap = LOG_PACE;
  }
}

// ---- ownership ----

export const has = (s: GameState, r: RiteId) => !!s.rites[r];
const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]));
/** Bought, and still connected: an upgrade whose path was switched away from goes dormant until you switch back. */
export function owns(s: GameState, u: UpgradeId): boolean {
  return !!s.upgrades[u] && !cutOff(s, u);
}
/** True when a fork choice somewhere up this upgrade's path has been switched away from. */
function cutOff(s: GameState, u: UpgradeId): boolean {
  const def = UPGRADE_BY_ID.get(u)!;
  const gone = (r: UpgradeId) => (!!UPGRADE_BY_ID.get(r)!.fork && !s.upgrades[r]) || cutOff(s, r);
  return def.requires.some(gone) || (!!def.requiresAny && def.requiresAny.every(gone));
}

export type UpgradeStatus = 'owned' | 'available' | 'locked' | 'swap' | 'dormant' | 'hidden';

/**
 * owned: bought. available: can be bought now (if affordable). locked: next on the path, shown with
 * what it still needs. swap: a sibling in its fork was chosen; it can be switched to, for a price that
 * climbs each time (or added alongside, once the fork's "every" upgrade is owned). dormant: bought, but
 * its path was switched away from. hidden: further down the path.
 */
export function upgradeStatus(s: GameState, u: UpgradeDef): UpgradeStatus {
  if (owns(s, u.id)) return 'owned';
  if (s.upgrades[u.id]) return 'dormant';
  if (forkClosed(s, u)) return 'swap';
  if (u.id === 'thaw' && s.ashThisRun.lt(3)) return 'hidden';
  if (reqsMet(s, u)) return u.gate && s.zones[u.gate.zone].bought < u.gate.bought ? 'locked' : 'available';
  // One step away: every requirement is owned or itself buyable now. Shown so the path ahead is visible.
  const near = (id: UpgradeId) => {
    const r = UPGRADES.find(x => x.id === id)!;
    return owns(s, id) || (reqsMet(s, r) && !forkClosed(s, r));
  };
  const close = u.requiresAny ? u.requiresAny.some(near) : u.requires.every(near);
  return close ? 'locked' : 'hidden';
}

function forkClosed(s: GameState, u: UpgradeDef) {
  return !!u.fork && !owns(s, u.id) && reqsMet(s, u) && UPGRADES.some(o => o.fork === u.fork && owns(s, o.id));
}

function reqsMet(s: GameState, u: UpgradeDef) {
  return u.requires.every(r => owns(s, r)) && (!u.requiresAny || u.requiresAny.some(r => owns(s, r)));
}

/** Every option in a fork can be held at once after this upgrade. */
export const FORK_ALL: Record<NonNullable<UpgradeDef['fork']>, UpgradeId> = { doctrine: 'every_doctrine', feed: 'every_feed' };
export const forkMerged = (s: GameState, u: UpgradeDef) => !!u.fork && owns(s, FORK_ALL[u.fork]);

/** What an upgrade costs now. Switching a fork costs more each time; it tracks income so it always means something. */
export function upgradeCost(s: GameState, u: UpgradeDef): Decimal {
  if (upgradeStatus(s, u) !== 'swap') return new Decimal(u.cost);
  const base = Decimal.max(u.cost * 5, passiveRate(s).mul(120));
  return forkMerged(s, u) ? base.mul(5).floor() : base.mul(Decimal.pow(4, s.forkSwaps[u.fork!] ?? 0)).floor();
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  const def = UPGRADES.find(u => u.id === id)!;
  const st = upgradeStatus(s, def);
  const cost = upgradeCost(s, def);
  if ((st !== 'available' && st !== 'swap') || s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  if (st === 'swap' && !forkMerged(s, def)) {
    // Switch: the old choice (and anything built on it) goes dormant until you switch back.
    for (const o of UPGRADES) if (o.fork === def.fork && o.id !== id) delete s.upgrades[o.id];
    s.forkSwaps[def.fork!] = (s.forkSwaps[def.fork!] ?? 0) + 1;
  }
  s.upgrades[id] = true;
  if (def.line) log(s, def.line, 'milestone', true);
  if (id === 'antenna') {
    const gap = 90; // the first siren comes sooner so the player meets it while it is fresh
    s.siren = { active: false, timer: gap, total: gap, rustThisSiren: 0 };
  }
  return true;
}

// ---- derived values ----

/** Multiplier on all ash income, from doctrines, feeds and buffs. */
export function globalMult(s: GameState): Decimal {
  let m = new Decimal(1);
  if (owns(s, 'lights')) m = m.mul(1.5);
  if (owns(s, 'eye3')) m = m.mul(1 + Math.min(3, 0.02 * s.warmCaught));
  if (s.kindled > 0) m = m.mul(2);
  m = m.mul(comfortMult(s));
  m = m.mul(1 + giftTotal(s, 'ash') * 0.05);
  if (s.kiln.tithe) m = m.mul(1 + Math.min(0.5, 0.01 * s.embers));
  m = m.mul(weatherMult(s, 'thunder', 1.1));
  for (let i = 0; i < 9; i++) m = m.mul(Math.pow(1.02, zoneUpLevel(s, i, 3)));
  m = m.mul(achievementMult(s));
  m = m.mul(patternMult(s, 'ash') * tinctureMult(s, 'ash') * chMult(s, 'ash'));
  return m;
}

// ---- side systems ----

export const tunedTo = (s: GameState, f: FreqId) => s.tuned === f && !!s.freqs[f];

/** A weather bonus, 1 when that weather is not on. The Weather service doubles the bonus part. */
export function weatherMult(s: GameState, id: WeatherId, m: number): number {
  if (s.weather.id !== id) return 1;
  return 1 + (m - 1) * (tunedTo(s, 'forecast') ? 2 : 1);
}

export const fixtureLevel = (s: GameState, id: FixtureId) => s.fixtures[id] ?? 0;
/** Levels up to `full` count whole; every one past that counts a quarter, so a fixture never stops building. */
export const fixtureWeight = (f: { full: number }, lvl: number) => Math.min(lvl, f.full) + 0.25 * Math.max(0, lvl - f.full);

export function comfort(s: GameState): number {
  const raw = FIXTURES.reduce((n, f) => n + f.comfort * fixtureWeight(f, fixtureLevel(s, f.id)), 0) + 2 * giftTotal(s, 'comfort');
  return raw * (tunedTo(s, 'lullaby') ? 2 : 1) * tinctureMult(s, 'comfort') * chMult(s, 'comfort');
}

export const comfortPerk = (s: GameState, k: number) => comfort(s) >= COMFORT_PERKS[k].at;

/** All ash bonus from comfort: 1% a point up to 200, then it tapers off with the cube root. */
export function comfortMult(s: GameState): number {
  const c = comfort(s);
  return 1 + (c <= 200 ? c : 200 + 30 * (Math.cbrt(c - 199) - 1)) / 100;
}

export const stationOpen = (s: GameState) => owns(s, 'backroom');
export const kilnOpen = (s: GameState) => s.warmCaught > 0;
export const dialOpen = (s: GameState) => owns(s, 'coil');

export function fixtureCost(s: GameState, id: FixtureId): Decimal {
  const def = FIXTURES.find(f => f.id === id)!;
  const lvl = fixtureLevel(s, id);
  // Past full strength each level gives a quarter of the comfort and costs a lot more.
  return new Decimal(def.cost).mul(Decimal.pow(FIXTURE_GROWTH, Math.min(lvl, def.full))).mul(Decimal.pow(FIXTURE_GROWTH * 4, Math.max(0, lvl - def.full))).floor();
}

export function buildFixture(s: GameState, id: FixtureId): boolean {
  const cost = fixtureCost(s, id);
  if (!stationOpen(s) || s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  s.fixtures[id] = fixtureLevel(s, id) + 1;
  return true;
}

export function buyKiln(s: GameState, id: KilnId): boolean {
  const def = KILN.find(k => k.id === id)!;
  if (s.kiln[id] || s.embers < def.cost) return false;
  s.embers -= def.cost;
  s.kiln[id] = true;
  return true;
}

export function echoRate(s: GameState): number {
  if (!dialOpen(s)) return 0;
  // A slow trickle on its own, more for every zone opened, and a lot more while resonance is high.
  const base = 0.05 * (1 + s.zonesOpened) + s.resonance * 0.3;
  return base * weatherMult(s, 'thunder', 2) * (1 + 0.2 * giftTotal(s, 'echoes')) * patternMult(s, 'echoes') * tinctureMult(s, 'echoes') * chMult(s, 'echoes');
}

/** Find a frequency (costs echoes) or tune to one already found (free). */
export function tune(s: GameState, id: FreqId): boolean {
  if (!dialOpen(s)) return false;
  if (!s.freqs[id]) {
    const def = FREQS.find(f => f.id === id)!;
    if (s.echoes < def.cost) return false;
    s.echoes -= def.cost;
    s.freqs[id] = true;
  }
  s.tuned = id;
  return true;
}

export function zoneUpMult(i: number, k: 0 | 2): number {
  if (i === 0) return k === 0 ? 1.25 : 1.5;
  return k === 0 ? 1.05 : 1.1;
}

export const zoneUpKey = (i: number, k: number) => `${i}-${k}`;
export const zoneUpLevel = (s: GameState, i: number, k: number) => s.zoneUps[zoneUpKey(i, k)] ?? 0;

export function zoneUpCost(s: GameState, i: number, k: number): Decimal {
  const slot = ZONE_UP_SLOTS[k];
  // Price climbs a little faster than exponential, so endless levels keep compounding without running away.
  return new Decimal(ZONES[i].baseCost).mul(slot.costMul).mul(Decimal.pow(slot.growth, Math.pow(zoneUpLevel(s, i, k), 2)));
}

/** How many of the zone must be dug before the next level opens. */
export const zoneUpGate = (s: GameState, i: number, k: number) => {
  // Each level asks for about half again as many shafts as the last, so levels keep coming but slow down.
  const l = zoneUpLevel(s, i, k);
  return Math.ceil(ZONE_UP_SLOTS[k].gate * Math.pow(1.5, l) + ZONE_UP_SLOTS[k].gateStep * l);
};

export function zoneUpDesc(i: number, k: number): string {
  const e = ZONE_UP_SLOTS[k].effect;
  const name = ZONES[i].name;
  return e === 'mult' ? `${name}s work x${zoneUpMult(i, 0)} as hard, per level.`
    : e === 'cheap' ? `${name}s get 3% cheaper to stack, per level (1% past level 8).`
    : e === 'mult2' ? `${name}s work x${zoneUpMult(i, 2)} as hard, per level.`
    : 'All ash x1.02, per level.';
}

export const zoneUpName = (i: number, k: number) => ZONE_UP_NAMES[i][k];

export function zoneUpStatus(s: GameState, i: number, k: number): 'maxed' | 'available' | 'locked' {
  if (zoneUpLevel(s, i, k) >= ZONE_UP_SLOTS[k].max) return 'maxed';
  return s.zones[i].bought >= zoneUpGate(s, i, k) ? 'available' : 'locked';
}

export function buyZoneUp(s: GameState, i: number, k: number): boolean {
  const cost = zoneUpCost(s, i, k);
  if (zoneUpStatus(s, i, k) !== 'available' || s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  s.zoneUps[zoneUpKey(i, k)] = zoneUpLevel(s, i, k) + 1;
  return true;
}

// ---- max all: opens once every upgrade in a box has been bought at least once ----

export const zoneMaxOpen = (s: GameState, i: number) => ZONE_UP_SLOTS.every(sl => zoneUpLevel(s, i, sl.k) > 0);
export const stationMaxOpen = (s: GameState) => FIXTURES.every(f => fixtureLevel(s, f.id) > 0);
export const nurseryMaxOpen = (s: GameState) => NURSERY_UPS.every(u => nurseryUpLevel(s, u.id) > 0);

/** Spend ash on the cheapest thing in the box, again and again, until nothing is affordable. */
function buyCheapest(s: GameState, options: () => { cost: Decimal; buy: () => boolean }[]) {
  for (let guard = 0; guard < 5000; guard++) {
    const open = options().filter(o => s.ash.gte(o.cost)).sort((a, b) => a.cost.cmp(b.cost));
    if (!open.length || !open[0].buy()) return;
  }
}

export function maxZone(s: GameState, i: number) {
  if (!zoneMaxOpen(s, i)) return;
  buyCheapest(s, () => [
    { cost: zoneCost(s, i), buy: () => buyShaft(s, i) },
    ...ZONE_UP_SLOTS.filter(sl => zoneUpStatus(s, i, sl.k) === 'available')
      .map(sl => ({ cost: zoneUpCost(s, i, sl.k), buy: () => buyZoneUp(s, i, sl.k) })),
  ]);
}

export function maxStation(s: GameState) {
  if (!stationMaxOpen(s)) return;
  buyCheapest(s, () => FIXTURES
    .map(f => ({ cost: fixtureCost(s, f.id), buy: () => buildFixture(s, f.id) })));
}

/** Tend the whole nursery: buy affordable upgrades, feed the hungry, sing to everyone, warm eggs with spare embers. */
export function tendAll(s: GameState) {
  if (!nurseryMaxOpen(s)) return;
  buyCheapest(s, () => NURSERY_UPS.filter(u => nurseryUpLevel(s, u.id) < u.max)
    .map(u => ({ cost: nurseryUpCost(s, u.id), buy: () => buyNurseryUp(s, u.id) })));
  for (const c of s.nursery.brood) {
    if (c.hunger < 60) feedCreature(s, c.id);
    singTo(s, c.id);
  }
  for (const e of s.nursery.eggs) while (e.warmth < 100 && warmEgg(s, e.id));
}

// ---- the nursery ----

export const nurseryUpLevel = (s: GameState, id: NurseryUpId) => s.nursery.ups[id] ?? 0;

export function nurseryUpCost(s: GameState, id: NurseryUpId): Decimal {
  const def = NURSERY_UPS.find(u => u.id === id)!;
  return new Decimal(def.cost).mul(Decimal.pow(def.growth, nurseryUpLevel(s, id)));
}

export function buyNurseryUp(s: GameState, id: NurseryUpId): boolean {
  const def = NURSERY_UPS.find(u => u.id === id)!;
  const cost = nurseryUpCost(s, id);
  if (!s.nursery.found || nurseryUpLevel(s, id) >= def.max || s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  s.nursery.ups[id] = nurseryUpLevel(s, id) + 1;
  return true;
}

export const eggSlots = (s: GameState) => NEST_EGGS + nurseryUpLevel(s, 'nest');
export const broodSlots = (s: GameState) => Math.min(BROOD_MAX, NEST_BROOD + nurseryUpLevel(s, 'nest') + 8 * nurseryUpLevel(s, 'wing'));
export const isFed = (c: Creature) => c.hunger > 25;

/** Sum of fed creatures' stages for one kind of gift; each gift scales with how grown its giver is. */
export function giftTotal(s: GameState, gift: Gift): number {
  let n = 0;
  for (const c of s.nursery.brood) if (isFed(c) && giftOf(c.genome) === gift) n += c.stage;
  // A big brood still helps, but past 40 each one adds less, so 255 creatures can't run away with it.
  if (n > 40) n = 40 * Math.sqrt(n / 40);
  return n + familiarGift(s, gift);
}

export const eggWarmRate = (s: GameState) => Math.min(comfort(s), 300) * 0.02 * (1 + 0.5 * nurseryUpLevel(s, 'lamp')) * (comfortPerk(s, 4) ? 2 : 1) * tinctureMult(s, 'eggs') * quirkMult(s, 'eggs');

/** Pigment per second from the Barker Spirals, for the alchemy. */
export const pigmentRate = (s: GameState) => pigmentBase(s) * patternMult(s, 'pigment') * tinctureMult(s, 'pigment') * chMult(s, 'pigment');
export const growthRate = (s: GameState, c: Creature) =>
  (1 + 0.5 * nurseryUpLevel(s, 'straw')) * (c.mood > 70 ? 1.5 : 1) * (tunedTo(s, 'lullaby') ? 1.5 : 1);
export const feedCost = (s: GameState) => Decimal.max(50, passiveRate(s).mul(30)).floor();
export const breedCost = (s: GameState) => Decimal.max(1e5, passiveRate(s).mul(120)).floor();
export const BREED_EMBERS = 3;

const creature = (s: GameState, id: number) => s.nursery.brood.find(c => c.id === id);

/** Put an egg in the nest if there is room. Wild eggs have random genes. */
export function addEgg(s: GameState, genome = randomGenome(Math.random)): boolean {
  if (s.nursery.eggs.length >= eggSlots(s)) return false;
  s.nursery.eggs.push({ id: s.nursery.nextId++, genome, warmth: 0 });
  return true;
}

export function warmEgg(s: GameState, id: number): boolean {
  const e = s.nursery.eggs.find(x => x.id === id);
  if (!e || e.warmth >= 100 || s.embers < 1) return false;
  s.embers -= 1;
  e.warmth = Math.min(100, e.warmth + 20);
  return true;
}

export function feedCreature(s: GameState, id: number): boolean {
  const c = creature(s, id);
  const cost = feedCost(s);
  if (!c || c.hunger >= 100 || s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  c.hunger = Math.min(100, c.hunger + 40 + 20 * nurseryUpLevel(s, 'trough'));
  return true;
}

export function singTo(s: GameState, id: number): boolean {
  const c = creature(s, id);
  if (!c || c.singIn > 0) return false;
  c.mood = Math.min(100, c.mood + 25);
  c.singIn = 45;
  return true;
}

/** Feed or sing to a whole set of creatures at once; returns how many it reached. */
export function feedMany(s: GameState, ids: number[]): number {
  let n = 0;
  for (const id of ids) if (feedCreature(s, id)) n++;
  return n;
}
export function singMany(s: GameState, ids: number[]): number {
  let n = 0;
  for (const id of ids) if (singTo(s, id)) n++;
  return n;
}

export const canBreed = (c: Creature) => c.stage >= BREED_STAGE && c.breedIn <= 0;

/** Two grown creatures make an egg that mixes their genes, sometimes into a species neither was. */
export function breedPair(s: GameState, a: number, b: number, rng: Rng = Math.random): boolean {
  const ca = creature(s, a), cb = creature(s, b);
  const cost = breedCost(s);
  if (!ca || !cb || a === b || !canBreed(ca) || !canBreed(cb)) return false;
  if (s.nursery.eggs.length >= eggSlots(s) || s.ash.lt(cost) || s.embers < BREED_EMBERS) return false;
  s.ash = s.ash.sub(cost);
  s.embers -= BREED_EMBERS;
  ca.breedIn = cb.breedIn = BREED_COOLDOWN;
  addEgg(s, breed(ca.genome, cb.genome, rng));
  s.stats.bred++;
  log(s, EGG_LINES.laid, 'milestone', true);
  return true;
}

export function releaseCreature(s: GameState, id: number) {
  s.nursery.brood = s.nursery.brood.filter(c => c.id !== id);
}

export function discardEgg(s: GameState, id: number) {
  s.nursery.eggs = s.nursery.eggs.filter(e => e.id !== id);
}

/** Mood settles toward a level set by comfort, so a cosy station keeps the brood content on its own. */
export const moodTarget = (s: GameState) => Math.min(100, 20 + comfort(s));

function stepNursery(s: GameState, dt: number) {
  const n = s.nursery;
  if (!n.found) {
    if (owns(s, 'floor') && s.ashThisRun.gte(EGG_FOUND_AT)) {
      n.found = true;
      addEgg(s);
      log(s, EGG_LINES.found, 'milestone', true);
    }
    return;
  }
  const warm = eggWarmRate(s) * dt;
  for (const e of [...n.eggs]) {
    e.warmth = Math.min(100, e.warmth + warm);
    if (e.warmth < 100 || n.brood.length >= broodSlots(s)) continue;
    n.eggs = n.eggs.filter(x => x.id !== e.id);
    n.brood.push({ id: e.id, genome: e.genome, stage: 1, hunger: 80, mood: 60, growth: 0, singIn: 0, breedIn: 0 });
    s.stats.hatched++;
    const key = speciesKey(e.genome);
    if (!n.seen.includes(key)) {
      n.seen.push(key);
      log(s, n.seen.length === 1 ? EGG_LINES.hatch : EGG_LINES.species, 'milestone', true);
    }
  }
  const target = moodTarget(s);
  const pull = 0.05 * (tunedTo(s, 'lullaby') ? 3 : 1) * dt;
  const hungerFall = 0.15 * Math.pow(0.85, nurseryUpLevel(s, 'trough')) * dt;
  for (const c of n.brood) {
    c.singIn = Math.max(0, c.singIn - dt);
    c.breedIn = Math.max(0, c.breedIn - dt);
    c.hunger = Math.max(0, c.hunger - hungerFall);
    c.mood += Math.max(-pull, Math.min(pull, target - c.mood));
    if (comfortPerk(s, 1)) c.mood = Math.max(50, c.mood);
    if (c.stage < 1 + EGG_GROWTH.length && isFed(c) && c.mood > 30) {
      c.growth += dt * growthRate(s, c);
      if (c.growth >= EGG_GROWTH[c.stage - 1]) {
        c.growth = 0;
        c.stage++;
        log(s, EGG_LINES.grow, 'milestone');
      }
    }
  }
}

/** A wild egg turns up now and then: sometimes with a caught warm flake, sometimes after a siren. */
function maybeWildEgg(s: GameState, chance: number, rng: Rng) {
  if (s.nursery.found && rng() < chance && addEgg(s, randomGenome(rng))) log(s, EGG_LINES.wild, 'milestone');
}

function stepWeather(s: GameState, dt: number, rng: Rng) {
  s.weather.timer -= dt;
  if (s.weather.timer > 0) return;
  const others = WEATHER.filter(w => w.id !== s.weather.id);
  const next = pick(others, rng);
  s.weather = { id: next.id, timer: 120 + rng() * 150 };
  if (rng() < 0.3) log(s, next.line);
}

/** Dev tool: set any stored resource. Comfort comes from fixtures, so it is not here. */
export type DevResource = 'ash' | 'rust' | 'embers' | 'echoes' | `zone${number}`;

export function devSet(s: GameState, res: DevResource, value: Decimal) {
  if (value.lt(0) || !value.isFinite()) return;
  if (res === 'ash') {
    const diff = value.sub(s.ash);
    if (diff.gt(0)) { gainAsh(s, diff); checkMilestones(s); } else s.ash = value;
  } else if (res === 'rust') s.rust = value.toNumber();
  else if (res === 'embers') s.embers = Math.floor(value.toNumber());
  else if (res === 'echoes') s.echoes = value.toNumber();
  else {
    const i = Number(res.slice(4)) - 1;
    if (i >= 0 && i < 9) s.zones[i].amount = value;
  }
}

/**
 * Output multiplier for a zone: its bonus per 10 bought, plus upgrades. Deep zones get a small
 * per-10 bonus on purpose: a big one on every tier compounds into runaway growth.
 */
export function zoneMult(s: GameState, i: number): Decimal {
  let m = Decimal.pow(ZONES[i].bonus, Math.floor(s.zones[i].bought / 10));
  if (owns(s, 'spade') && i <= 1) m = m.mul(2);
  if (owns(s, 'name_feed')) m = m.mul(1.5);
  if (i === 0) {
    if (owns(s, 'copper')) m = m.mul(2);
    if (has(s, 'name')) m = m.mul(2);
    if (owns(s, 'spade3')) m = m.mul(1 + Math.min(1, 0.01 * s.shaftsDug));
  }
  if (i === 1 && owns(s, 'spade2')) m = m.mul(1.5);
  // Deep zones compound up the cascade, so their upgrades and buffs stay small.
  m = m.mul(Math.pow(zoneUpMult(i, 0), zoneUpLevel(s, i, 0)));
  m = m.mul(Math.pow(zoneUpMult(i, 2), zoneUpLevel(s, i, 2)));
  if (i === 0) m = m.mul(1 + 0.1 * giftTotal(s, 'bores'));
  if (i === 0 && tunedTo(s, 'hum')) m = m.mul(2);
  if (i === 0) m = m.mul(weatherMult(s, 'wind', 1.5));
  m = m.mul(wiringMult(s, i));
  if (i <= 4) m = m.mul(tinctureMult(s, `zone${i}` as 'zone0'));
  m = m.mul(tinctureMult(s, 'zones'));
  m = m.mul(quirkMult(s, 'zones') * chMult(s, 'zones') * chMult(s, `zone${i}` as 'zone0'));
  return m;
}

export function zoneGrowth(s: GameState, i: number): number {
  let g = ZONES[i].growth;
  // 3% a level for the first 8, then 1% a level: it never stops, it just matters less than digging deeper.
  const l = zoneUpLevel(s, i, 1);
  g = 1 + (g - 1) * Math.pow(0.97, Math.min(l, 8)) * Math.pow(0.99, Math.max(0, l - 8));
  return g;
}

export function zoneCost(s: GameState, i: number): Decimal {
  return new Decimal(ZONES[i].baseCost).mul(Decimal.pow(zoneGrowth(s, i), s.zones[i].bought)).floor();
}

/** Shafts open with the floorboards; each deeper zone shows once you own 5 of the zone above. */
export function zoneVisible(s: GameState, i: number): boolean {
  if (!owns(s, 'floor')) return false;
  if (i === 0) return true;
  return s.zones[i - 1].bought >= 5 || s.zones[i].bought > 0;
}

/** What one zone produces per second in total: ash for zone 1, shafts of the zone above otherwise. */
export function zoneOutput(s: GameState, i: number): Decimal {
  const out = s.zones[i].amount.mul(ZONES[i].rate).mul(zoneMult(s, i));
  return i === 0 ? out.mul(globalMult(s)) : out;
}

/** Ash per second from shafts and rites, ignoring the siren. */
export function passiveRate(s: GameState): Decimal {
  let rate = s.zones[0].amount.mul(ZONES[0].rate).mul(zoneMult(s, 0));
  if (has(s, 'stop')) for (let i = 1; i < 9; i++) rate = rate.add(s.zones[i].amount);
  if (has(s, 'leave')) rate = rate.add(listenBase(s));
  return rate.mul(globalMult(s));
}

/** Ash per second right now (zero during the siren unless wired). */
export function ashPerSecond(s: GameState): Decimal {
  const rate = passiveRate(s);
  return s.siren.active ? rate.mul(has(s, 'wire') ? 0.25 : 0) : rate;
}

export function listenBase(s: GameState): Decimal {
  let base = new Decimal(owns(s, 'thaw') ? 2 : 1);
  if (owns(s, 'ear')) base = base.mul(3);
  if (has(s, 'salt')) base = base.mul(3);
  if (tunedTo(s, 'numbers')) base = base.mul(2);
  base = base.mul(1 + 0.1 * giftTotal(s, 'listen'));
  return base.mul(weatherMult(s, 'ashfall', 1.5)).mul(patternMult(s, 'listen') * tinctureMult(s, 'listen') * chMult(s, 'listen'));
}

/** Ash per Listen: base, times resonance, plus a slice of passive income from later upgrades. */
export function listenPower(s: GameState): Decimal {
  let p = listenBase(s).mul(1 + s.resonance);
  const share = (owns(s, 'ear2') ? 0.2 : 0) + (owns(s, 'hatch') ? 0.01 : 0);
  if (share) p = p.add(passiveRate(s).mul(share));
  return p;
}

export const flakeRarity = (s: GameState) => RARITIES[s.warmFlake.rarity ?? 0];

export function warmFlakeReward(s: GameState): Decimal {
  const r = Decimal.max(listenBase(s).mul(15), passiveRate(s).mul(25)).floor();
  return r.mul(owns(s, 'eye') ? 3 : 1).mul(s.kiln.crucible ? 2 : 1).mul(flakeRarity(s).mult);
}

/** Rarest first. The odds never change: a black sun is one flake in ten thousand. */
export function rollRarity(rng: Rng, luck = 1): number {
  for (let r = RARITIES.length - 1; r > 0; r--) if (rng() < RARITIES[r].chance * luck) return r;
  return 0;
}

export function totalShaftsBought(s: GameState) {
  return s.zones.reduce((n, z) => n + z.bought, 0);
}

export function rustPerSecond(s: GameState): number {
  const base = 0.1 * Math.sqrt(totalShaftsBought(s)) * (1 + 0.25 * s.zonesOpened);
  return base * (has(s, 'ring') ? 1.5 : 1) * (owns(s, 'salt_feed') ? 2 : 1)
    * (tunedTo(s, 'dead') ? 2 : 1) * (comfortPerk(s, 2) ? 1.5 : 1) * patternMult(s, 'rust') * tinctureMult(s, 'rust') * quirkMult(s, 'rust') * chMult(s, 'rust');
}

export function sirenLength(s: GameState) {
  return SIREN_LENGTH + (has(s, 'ring') ? 15 : 0) + (tunedTo(s, 'dead') ? 15 : 0);
}

export const sirenEnabled = (s: GameState) => owns(s, 'antenna');

/** 0..1 how close the next siren is. Climbs before it, full during it. */
export function staticLevel(s: GameState): number {
  if (!sirenEnabled(s)) return 0;
  if (s.siren.active) return 1;
  return Math.max(0, Math.min(1, 1 - s.siren.timer / s.siren.total));
}

export function answerCost(s: GameState): Decimal {
  return Decimal.max(100, ashPerSecond(s).mul(30)).floor();
}

// ---- actions ----

function gainAsh(s: GameState, amount: Decimal) {
  s.ash = s.ash.add(amount);
  s.ashThisRun = s.ashThisRun.add(amount);
  s.lifetimeAsh = s.lifetimeAsh.add(amount);
}

/** Dev tool: add ash as if it had been caught, so milestones and unlocks follow. */
export function devAddAsh(s: GameState, amount: Decimal) {
  if (amount.gt(0)) gainAsh(s, amount);
}

/** Returns the ash caught, so the UI can float it off the button. Listen still works in the siren. */
export function listen(s: GameState): Decimal {
  const caught = listenPower(s);
  gainAsh(s, caught);
  s.stats.listens++;
  if (owns(s, 'coil')) s.resonance = Math.min(1, s.resonance + (owns(s, 'ear') ? 0.1 : 0.05));
  s.sinceListen = 0;
  checkMilestones(s);
  return caught;
}

export function buyShaft(s: GameState, i: number): boolean {
  if (!zoneVisible(s, i)) return false;
  const cost = zoneCost(s, i);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  const z = s.zones[i];
  z.bought++;
  s.shaftsDug++;
  z.amount = z.amount.add(1);
  if (i + 1 > s.zonesOpened) {
    s.zonesOpened = i + 1;
    log(s, ZONES[i].openLine, 'milestone');
  }
  return true;
}

/** Buy shafts until the next x2 step or until ash runs out. */
export function buyShaftsToTen(s: GameState, i: number) {
  const target = (Math.floor(s.zones[i].bought / 10) + 1) * 10;
  while (s.zones[i].bought < target && buyShaft(s, i));
}

export function buyRite(s: GameState, id: RiteId): boolean {
  const def = RITES.find(r => r.id === id)!;
  if (has(s, id) || s.rust < def.cost) return false;
  s.rust -= def.cost;
  s.rites[id] = true;
  log(s, def.line, 'milestone', true);
  return true;
}

export function answerSiren(s: GameState, rng: Rng = Math.random): boolean {
  if (!sirenEnabled(s) || s.siren.active || s.sirensSeen === 0) return false;
  const cost = answerCost(s);
  if (s.ash.lt(cost)) return false;
  s.ash = s.ash.sub(cost);
  s.sirensAnswered++;
  startSiren(s, rng);
  return true;
}

export function catchWarmFlake(s: GameState, rng: Rng = Math.random): Decimal {
  if (!s.warmFlake.active) return new Decimal(0);
  const reward = warmFlakeReward(s);
  gainAsh(s, reward);
  s.warmCaught++;
  if (owns(s, 'eye2')) s.kindled = 30;
  else if (s.kiln.kindling) s.kindled = Math.max(s.kindled, 15);
  const r = s.warmFlake.rarity ?? 0;
  s.stats.flakes[r] = (s.stats.flakes[r] ?? 0) + 1;
  s.embers += Math.round(((s.kiln.bloom ? 2 : 1) * RARITIES[r].embers + (comfortPerk(s, 5) ? 1 : 0)) * patternMult(s, 'embers') * tinctureMult(s, 'embers') * quirkMult(s, 'embers') * chMult(s, 'embers'));
  maybeWildEgg(s, r > 0 ? 1 : 0.15, rng);
  s.warmFlake = { ...s.warmFlake, active: false, ttl: 0, spawnIn: nextFlakeGap(s, rng), rarity: 0 };
  if (r > 0) log(s, `${RARITIES[r].line} +${fmt(reward)} ASH.`, 'milestone', true);
  else if (s.warmCaught === 1 || rng() < 0.25) log(s, `${pick(WARM_LINES, rng)} +${fmt(reward)} ASH.`, 'milestone', true);
  checkMilestones(s);
  return reward;
}

// ---- simulation ----

const nextFlakeGap = (s: GameState, rng: Rng) => (40 + rng() * 50) * (owns(s, 'eye') ? 0.5 : 1)
  * (s.kiln.bellows ? 0.8 : 1) / weatherMult(s, 'fog', 2) / quirkMult(s, 'flakes') / chMult(s, 'flakes');

function stepWarmFlake(s: GameState, dt: number, rng: Rng) {
  const w = s.warmFlake;
  if (w.active) {
    w.ttl -= dt;
    if (w.ttl <= 0) {
      s.stats.missed++;
      s.warmFlake = { ...w, active: false, spawnIn: nextFlakeGap(s, rng) };
    }
    return;
  }
  if (s.siren.active || !owns(s, 'floor')) return;
  w.spawnIn -= dt;
  if (w.spawnIn <= 0) {
    const rarity = rollRarity(rng, (comfortPerk(s, 6) ? 2 : 1) * tinctureMult(s, 'luck'));
    s.warmFlake = {
      active: true, x: 0.12 + rng() * 0.76, y: 0.18 + rng() * 0.64, spawnIn: 0, rarity,
      ttl: (owns(s, 'eye2') ? 20 : 10) + (comfortPerk(s, 1) ? 5 : 0) + RARITIES[rarity].ttl,
    };
  }
}

function stepResonance(s: GameState, dt: number) {
  s.sinceListen += dt;
  const floor = owns(s, 'ear3') ? 0.5 : 0;
  const fade = comfortPerk(s, 0) ? 0.15 : 0.3;
  if (s.sinceListen > 0.8 && s.resonance > floor) s.resonance = Math.max(floor, s.resonance - fade * dt);
  s.echoes += echoRate(s) * dt;
}

function startSiren(s: GameState, rng: Rng) {
  const len = sirenLength(s);
  s.siren = { active: true, timer: len, total: len, rustThisSiren: 0 };
  s.sirensSeen++;
  s.warmFlake = { ...s.warmFlake, active: false, spawnIn: nextFlakeGap(s, rng) };
  log(s, s.sirensSeen === 1
    ? 'A SIREN. THE WALLS ARE BREATHING RUST. THE SHAFTS ARE BLEEDING IT. IT WILL PASS.'
    : pick(SIREN_START_LINES, rng), 'siren');
}

function endSiren(s: GameState, rng: Rng) {
  const gap = randomSirenGap(rng);
  const earned = s.siren.rustThisSiren;
  s.siren = { active: false, timer: gap, total: gap, rustThisSiren: 0 };
  log(s, `${pick(SIREN_END_LINES, rng)} (+${earned.toFixed(1)} RUST)`, 'siren');
  maybeWildEgg(s, 0.5, rng);
}

function stepSiren(s: GameState, dt: number, rng: Rng) {
  if (!sirenEnabled(s)) return;
  const sr = s.siren;
  sr.timer -= dt;
  if (!sr.active) {
    if (sr.timer <= 0) startSiren(s, rng);
    return;
  }
  const rust = rustPerSecond(s) * dt;
  s.rust += rust;
  s.stats.rustTotal += rust;
  sr.rustThisSiren += rust;
  if (sr.timer <= 0) endSiren(s, rng);
}

function checkMilestones(s: GameState) {
  while (s.milestones < ASH_MILESTONES.length && s.ashThisRun.gte(ASH_MILESTONES[s.milestones].at)) {
    log(s, ASH_MILESTONES[s.milestones].line, 'milestone');
    s.milestones++;
  }
}

/** Advance the shaft cascade and ash income by dt seconds. */
export function produce(s: GameState, dt: number) {
  s.wiring.cycles += cycleRate(s) * dt;
  // Deepest first so each tier feeds the one above using this tick's counts.
  for (let i = 8; i >= 1; i--) {
    const z = s.zones[i];
    if (z.amount.lte(0)) continue;
    const made = z.amount.mul(ZONES[i].rate).mul(zoneMult(s, i)).mul(dt);
    s.zones[i - 1].amount = s.zones[i - 1].amount.add(made);
  }
  gainAsh(s, ashPerSecond(s).mul(dt));
  checkMilestones(s);
}

/** One fixed simulation step. */
function stepAchievements(s: GameState, dt: number) {
  s.achCheckIn -= dt;
  if (s.achCheckIn > 0) return;
  s.achCheckIn = 1;
  const aps = ashPerSecond(s);
  if (aps.gt(s.stats.bestAps)) s.stats.bestAps = aps.toString();
  checkAchievements(s); // announced by a toast in the UI, not the log, which stays rare
}

export function tick(s: GameState, dt: number, rng: Rng = Math.random) {
  s.playTime += dt;
  if (s.kindled > 0) s.kindled = Math.max(0, s.kindled - dt);
  produce(s, dt);
  stepSiren(s, dt, rng);
  stepResonance(s, dt);
  stepWarmFlake(s, dt, rng);
  stepWeather(s, dt, rng);
  stepNursery(s, dt);
  stepAlchemy(s, dt, pigmentRate(s));
  for (const c of stepChallenges(s, dt, rng)) log(s, `${c.name.toUpperCase()} OPENS IN ZONE ${c.zone + 1}. ${c.tagline.toUpperCase()}`, 'milestone', true);
  if (!s.citadel.awake && citadelOpen(s) && wakeCitadel(s)) log(s, 'SOMETHING BEHIND THE GATE OPENS ITS EYES. THE BLACK CITADEL IS AWAKE, AND IT IS THIRSTY.', 'milestone', true);
  stepCitadel(s, dt, rng);
  stepAchievements(s, dt);
  stepLog(s, dt);
  s.ambientIn -= dt;
  if (s.ambientIn <= 0) {
    s.ambientIn = 360 + rng() * 240;
    if (owns(s, 'floor')) log(s, pick(AMBIENT_LINES, rng));
  }
}

/**
 * Catch up time spent away. Sirens are skipped, so only the cascade runs, in at most 2,000
 * coarse steps. Capped at 12 hours.
 */
export function catchUp(s: GameState, seconds: number) {
  const capped = Math.min(seconds, (12 + awayHours(s)) * 3600) * (comfortPerk(s, 3) ? 2 : 1);
  if (capped < 10) return;
  const before = s.ash;
  const wasActive = s.siren.active;
  s.siren.active = false;
  s.kindled = 0;
  const steps = Math.min(2000, Math.ceil(capped));
  const dt = capped / steps;
  for (let k = 0; k < steps; k++) { produce(s, dt); stepChallenges(s, dt, Math.random); stepCitadel(s, dt); }
  if (alchemyOpen(s)) s.alchemy.pigment += pigmentRate(s) * capped;
  s.siren.active = wasActive;
  s.playTime += capped;
  if (capped < 120) return;
  const hours = Math.floor(capped / 3600), mins = Math.floor((capped % 3600) / 60);
  const away = hours ? `${hours} HOURS ${mins} MINUTES` : `${mins} MINUTES`;
  log(s, `YOU WERE AWAY ${away}. THE SHAFTS KEPT DIGGING. +${fmt(s.ash.sub(before))} ASH.`, 'away');
}
