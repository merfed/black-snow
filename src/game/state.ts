import Decimal from 'break_eternity.js';
import type { RiteId, UpgradeId } from './data';
import type { FixtureId, FreqId, KilnId, NurseryUpId, WeatherId } from './systems';
import type { Genome } from './genome';
import { newWiring, type Wiring } from './wiring';
import { newPatterns, type Patterns } from './patterns';
import { newAlchemy, type Alchemy } from './alchemy';

export const SAVE_VERSION = 5;

export interface Zone {
  amount: Decimal; // shafts owned, bought plus bored by the zone below
  bought: number; // shafts bought directly; drives price and the x2 per 10 bonus
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'plain' | 'milestone' | 'siren' | 'away';
}

export interface Siren {
  active: boolean;
  timer: number; // seconds until the siren (inactive) or until it ends (active)
  total: number; // length of the current countdown, for the static meter
  rustThisSiren: number;
}

export interface WarmFlake {
  active: boolean;
  x: number; // 0..1 of the viewport
  y: number;
  ttl: number; // seconds left on screen while active
  spawnIn: number; // seconds until the next one, while inactive
  rarity?: number; // index into RARITIES, 0 = common
}

export interface Stats {
  listens: number;
  flakes: number[]; // caught, by rarity
  missed: number;
  hatched: number;
  bred: number;
  rustTotal: number;
  bestAps: string; // best ash per second seen, as a Decimal string
}

export interface Weather {
  id: WeatherId;
  timer: number; // seconds until it changes
}

export interface EggItem {
  id: number;
  genome: Genome;
  warmth: number; // 0..100, hatches at 100
}

/** A hatched creature. Stage 1..4; it never dies, it just stops helping when hungry. */
export interface Creature {
  id: number;
  genome: Genome;
  stage: number;
  hunger: number; // 0..100, 100 is full
  mood: number; // 0..100
  growth: number;
  singIn: number; // seconds until it can be sung to again
  breedIn: number; // seconds until it can breed again
}

export interface Nursery {
  found: boolean; // the first egg turned up
  eggs: EggItem[];
  brood: Creature[];
  seen: string[]; // species keys hatched so far
  nextId: number;
  ups: Partial<Record<NurseryUpId, number>>;
  familiars: (Creature | null)[]; // the three slots by the stove
  slots: number; // how many of them are open
  candles: number[]; // ghostwax candles lit at each slot
  ghostwax: number;
  rendered: number; // creatures rendered down, ever
}

export interface GameState {
  version: number;
  ash: Decimal;
  ashThisRun: Decimal;
  lifetimeAsh: Decimal;
  rust: number;
  zones: Zone[]; // index 0 is zone 1
  upgrades: Partial<Record<UpgradeId, boolean>>;
  rites: Partial<Record<RiteId, boolean>>;
  siren: Siren;
  sirensSeen: number;
  sirensAnswered: number;
  milestones: number; // count of ASH_MILESTONES already fired
  zonesOpened: number; // highest zone with a shaft bought, for open lines
  resonance: number; // 0..1, built by listening quickly, multiplies Listen
  sinceListen: number; // seconds since the last Listen, for resonance decay
  warmFlake: WarmFlake;
  warmCaught: number;
  kindled: number; // seconds left on the Glass eye x2 buff
  shaftsDug: number;
  zoneUps: Record<string, number>; // `${zone}-${slot}` -> level
  weather: Weather;
  embers: number;
  echoes: number;
  kiln: Partial<Record<KilnId, boolean>>;
  freqs: Partial<Record<FreqId, boolean>>;
  tuned: FreqId | null;
  fixtures: Partial<Record<FixtureId, number>>;
  nursery: Nursery;
  wiring: Wiring;
  patterns: Patterns;
  alchemy: Alchemy;
  forkSwaps: Record<string, number>; // times each fork was switched
  tapes: string[]; // VHS tapes owned, for the television
  tv: string | null; // the tape playing, or null for static
  stats: Stats;
  achievements: Record<string, number>; // id -> play time when earned
  achCheckIn: number;
  ambientIn: number;
  logQueue: LogEntry[]; // calm lines wait here and are released slowly
  logGap: number; // seconds until the next queued line may print
  log: LogEntry[];
  logSeq: number;
  playTime: number;
  lastSaved: number; // epoch ms
}

export const randomSirenGap = (rng: () => number) => 180 + rng() * 120;

export function newGame(rng: () => number = Math.random): GameState {
  const gap = randomSirenGap(rng);
  return {
    version: SAVE_VERSION,
    ash: new Decimal(0),
    ashThisRun: new Decimal(0),
    lifetimeAsh: new Decimal(0),
    rust: 0,
    zones: Array.from({ length: 9 }, () => ({ amount: new Decimal(0), bought: 0 })),
    upgrades: {},
    rites: {},
    siren: { active: false, timer: gap, total: gap, rustThisSiren: 0 },
    sirensSeen: 0,
    sirensAnswered: 0,
    milestones: 0,
    zonesOpened: 0,
    resonance: 0,
    sinceListen: 99,
    warmFlake: { active: false, x: 0.5, y: 0.5, ttl: 0, spawnIn: 45 },
    warmCaught: 0,
    kindled: 0,
    shaftsDug: 0,
    zoneUps: {},
    weather: { id: 'calm', timer: 150 },
    embers: 0,
    echoes: 0,
    kiln: {},
    freqs: {},
    tuned: null,
    fixtures: {},
    nursery: { found: false, eggs: [], brood: [], seen: [], nextId: 1, ups: {}, familiars: [null, null, null], slots: 0, candles: [0, 0, 0], ghostwax: 0, rendered: 0 },
    wiring: newWiring(),
    patterns: newPatterns(rng),
    alchemy: newAlchemy(),
    forkSwaps: {},
    tapes: [],
    tv: null,
    stats: { listens: 0, flakes: [0, 0, 0, 0, 0], missed: 0, hatched: 0, bred: 0, rustTotal: 0, bestAps: '0' },
    achievements: {},
    achCheckIn: 1,
    ambientIn: 300,
    logQueue: [],
    logGap: 0,
    log: [{ id: 0, text: 'NIGHT SHIFT BEGINS. THE RECEIVER IS ON. IT IS SNOWING. IT IS ALWAYS SNOWING.', kind: 'plain' }],
    logSeq: 1,
    playTime: 0,
    lastSaved: Date.now(),
  };
}
