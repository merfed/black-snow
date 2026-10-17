// Achievements: things the station notices you have done. Each one earned adds 1% to all ash.
// Checks read only the state, so they can run in tests and offline catch-up like everything else.
import Decimal from 'break_eternity.js';
import type { GameState } from './state';
import { flowCached } from './wiring';

export type AchCategory = 'ash' | 'shafts' | 'flakes' | 'sirens' | 'nursery' | 'rooms' | 'board' | 'secret';

export interface AchDef { id: string; name: string; desc: string; cat: AchCategory; secret?: boolean; check: (s: GameState) => boolean }

const ash = (s: GameState, n: number) => s.lifetimeAsh.gte(n);
const zone = (s: GameState, i: number) => s.zones[i].bought > 0;
const bought = (s: GameState) => s.zones.reduce((n, z) => n + z.bought, 0);
const fixtures = (s: GameState) => Object.values(s.fixtures).reduce((n: number, v) => n + (v ?? 0), 0);
const ups = (s: GameState) => Object.values(s.zoneUps).reduce((n, v) => n + v, 0);

export const ACHIEVEMENTS: AchDef[] = [
  // ash
  { id: 'first', cat: 'ash', name: 'Something on the line', desc: 'Catch your first ash.', check: s => ash(s, 1) },
  { id: 'ash1k', cat: 'ash', name: 'A handful', desc: 'Catch 1,000 ash in total.', check: s => ash(s, 1e3) },
  { id: 'ash1m', cat: 'ash', name: 'Drifts', desc: 'Catch 1 million ash in total.', check: s => ash(s, 1e6) },
  { id: 'ash1b', cat: 'ash', name: 'Whiteout, but black', desc: 'Catch 1 billion ash in total.', check: s => ash(s, 1e9) },
  { id: 'ash1e15', cat: 'ash', name: 'The town is buried', desc: 'Catch 1e15 ash in total.', check: s => ash(s, 1e15) },
  { id: 'ash1e30', cat: 'ash', name: 'Ash from a fire not yet lit', desc: 'Catch 1e30 ash in total.', check: s => ash(s, 1e30) },
  { id: 'ash1e100', cat: 'ash', name: 'A googol of cinders', desc: 'Catch 1e100 ash in total.', check: s => ash(s, 1e100) },
  { id: 'clicks100', cat: 'ash', name: 'Hello?', desc: 'Press Listen 100 times.', check: s => s.stats.listens >= 100 },
  { id: 'clicks5k', cat: 'ash', name: 'Is anyone there', desc: 'Press Listen 5,000 times.', check: s => s.stats.listens >= 5000 },
  { id: 'resonant', cat: 'ash', name: 'Resonant', desc: 'Fill the resonance bar.', check: s => s.resonance >= 1 },
  { id: 'aps1m', cat: 'ash', name: 'Steady fall', desc: 'Reach 1 million ash per second.', check: s => new Decimal(s.stats.bestAps).gte(1e6) },
  // shafts
  { id: 'dig1', cat: 'shafts', name: 'Pry it open', desc: 'Dig your first Shallow Bore.', check: s => zone(s, 0) },
  { id: 'dig100', cat: 'shafts', name: 'Honeycomb', desc: 'Dig 100 shafts in total.', check: s => bought(s) >= 100 },
  { id: 'dig1000', cat: 'shafts', name: 'Nothing left to stand on', desc: 'Dig 1,000 shafts in total.', check: s => bought(s) >= 1000 },
  { id: 'zone3', cat: 'shafts', name: 'Pattern recognition', desc: 'Open zone 3.', check: s => zone(s, 2) },
  { id: 'zone5', cat: 'shafts', name: 'Pressure differential', desc: 'Open zone 5.', check: s => zone(s, 4) },
  { id: 'zone7', cat: 'shafts', name: 'It compiles', desc: 'Open zone 7.', check: s => zone(s, 6) },
  { id: 'zone9', cat: 'shafts', name: 'Plexing', desc: 'Open zone 9, the bottom.', check: s => zone(s, 8) },
  { id: 'ups25', cat: 'shafts', name: 'Again, and again', desc: 'Buy 25 zone upgrade levels.', check: s => ups(s) >= 25 },
  { id: 'ups200', cat: 'shafts', name: 'Recursive', desc: 'Buy 200 zone upgrade levels.', check: s => ups(s) >= 200 },
  // flakes
  { id: 'warm1', cat: 'flakes', name: 'Warm to the touch', desc: 'Catch a warm flake.', check: s => s.warmCaught >= 1 },
  { id: 'warm100', cat: 'flakes', name: 'Hearth', desc: 'Catch 100 warm flakes.', check: s => s.warmCaught >= 100 },
  { id: 'pale', cat: 'flakes', name: 'Pale', desc: 'Catch a pale flake.', check: s => s.stats.flakes[1] > 0 },
  { id: 'verdant', cat: 'flakes', name: 'Verdant', desc: 'Catch a verdant flake.', check: s => s.stats.flakes[2] > 0 },
  { id: 'hyper', cat: 'flakes', name: 'It was always there', desc: 'Catch a hyperstitional flake.', check: s => s.stats.flakes[3] > 0 },
  { id: 'blacksun', cat: 'flakes', name: 'Black sun', desc: 'Catch a black sun.', check: s => s.stats.flakes[4] > 0 },
  { id: 'missed10', cat: 'flakes', name: 'Let it go out', desc: 'Let 10 warm flakes go out.', check: s => s.stats.missed >= 10 },
  // sirens
  { id: 'siren1', cat: 'sirens', name: 'It will pass', desc: 'Live through a siren.', check: s => s.sirensSeen >= 1 },
  { id: 'siren25', cat: 'sirens', name: 'Used to it', desc: 'Live through 25 sirens.', check: s => s.sirensSeen >= 25 },
  { id: 'answer', cat: 'sirens', name: 'Pick up', desc: 'Answer the phone and call a siren yourself.', check: s => s.sirensAnswered >= 1 },
  { id: 'rust500', cat: 'sirens', name: 'Oxidised', desc: 'Gather 500 rust in total.', check: s => s.stats.rustTotal >= 500 },
  { id: 'rites', cat: 'sirens', name: 'Liturgy', desc: 'Perform every rite.', check: s => Object.keys(s.rites).length >= 6 },
  // nursery
  { id: 'egg', cat: 'nursery', name: 'Something in the ash', desc: 'Find an egg.', check: s => s.nursery.found },
  { id: 'hatch', cat: 'nursery', name: 'It moved', desc: 'Hatch an egg.', check: s => s.stats.hatched >= 1 },
  { id: 'breed', cat: 'nursery', name: 'Lineage', desc: 'Breed two creatures.', check: s => s.stats.bred >= 1 },
  { id: 'species10', cat: 'nursery', name: 'Field guide', desc: 'Record 10 species.', check: s => s.nursery.seen.length >= 10 },
  { id: 'species50', cat: 'nursery', name: 'Bestiary', desc: 'Record 50 species.', check: s => s.nursery.seen.length >= 50 },
  { id: 'grown', cat: 'nursery', name: 'All grown up', desc: 'Raise a creature to its final stage.', check: s => s.nursery.brood.some(c => c.stage >= 4) },
  // rooms
  { id: 'kettle', cat: 'rooms', name: 'Put the kettle on', desc: 'Build your first fixture.', check: s => fixtures(s) >= 1 },
  { id: 'cosy', cat: 'rooms', name: 'Somewhere to stay', desc: 'Build 40 fixture levels.', check: s => fixtures(s) >= 40 },
  { id: 'station1', cat: 'rooms', name: 'Tuned in', desc: 'Find a radio station.', check: s => Object.keys(s.freqs).length >= 1 },
  { id: 'stations', cat: 'rooms', name: 'The whole dial', desc: 'Find every radio station.', check: s => Object.keys(s.freqs).length >= 5 },
  { id: 'kiln', cat: 'rooms', name: 'Kiln-dried', desc: 'Buy every kiln upgrade.', check: s => Object.keys(s.kiln).length >= 5 },
  // board
  { id: 'wire1', cat: 'board', name: 'Hello, world', desc: 'Send signal into a port.', check: s => Object.values(flowCached(s).ports).some(v => v > 0) },
  { id: 'wire4', cat: 'board', name: 'Bus master', desc: 'Light four ports at once.', check: s => Object.values(flowCached(s).ports).filter(v => v > 0).length >= 4 },
  { id: 'void', cat: 'board', name: 'Void-plated', desc: 'Learn void parts.', check: s => s.wiring.tier >= 4 },
  // secret
  { id: 'night', cat: 'secret', secret: true, name: 'Night shift', desc: 'Stay on shift for 8 hours.', check: s => s.playTime >= 8 * 3600 },
  { id: 'still', cat: 'secret', secret: true, name: 'Stillness', desc: 'Have 50,000 ash and still not dig a shaft.', check: s => s.ash.gte(5e4) && bought(s) === 0 },
];

export const achievementCount = (s: GameState) => Object.keys(s.achievements).length;
export const achievementMult = (s: GameState) => 1 + 0.01 * achievementCount(s);

/** Award anything newly earned. Returns what was earned so the caller can announce it. */
export function checkAchievements(s: GameState): AchDef[] {
  const got: AchDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] !== undefined || !a.check(s)) continue;
    s.achievements[a.id] = s.playTime;
    got.push(a);
  }
  return got;
}
