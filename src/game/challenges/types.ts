// The contract every zone challenge module follows. A challenge is a late system that lives in one
// zone's box and opens after zone 9, one at a time. Each module owns a slice of GameState under
// s.challenges[id], advances it in step(), and pays out through mult().
import type { GameState } from '../state';

export type Rng = () => number;

export type ChallengeId = 'survey' | 'undertow' | 'archive' | 'stair' | 'seal' | 'ring' | 'operator' | 'scriptorium' | 'syzygy';

/** Where a challenge's bonuses can land. Each is a plain multiplier, 1 when it gives nothing. */
export type MultTarget =
  | 'ash' // all ash
  | 'zones' // every zone's output
  | 'zone0' | 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5' | 'zone6' | 'zone7' | 'zone8'
  | 'echoes' | 'rust' | 'embers' | 'cycles' | 'pigment' | 'comfort' | 'flakes' | 'listen';

export interface ChallengeModule<S> {
  id: ChallengeId;
  zone: number; // zone index whose box it lives in (0 = Shallow Bore ... 8 = Plex)
  name: string;
  tagline: string; // one short line under the name
  fresh: () => S;
  /** Advance by dt seconds. Also called in coarse steps for time spent away, so dt can be large. */
  step: (s: GameState, dt: number, rng: Rng) => void;
  mult: (s: GameState, t: MultTarget) => number;
  /** Reaching this opens the next challenge. */
  milestone: { text: string; done: (s: GameState) => boolean };
  /** How far along this challenge is, open-ended (0 = untouched). The Syzygy routes currents by it. */
  level: (s: GameState) => number;
}
