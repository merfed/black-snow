// The zone challenges: one late system per zone, opening one after another once zone 9 is reached.
// This file is the only place the engine talks to them.
import type { GameState } from '../state';
import type { ChallengeId, ChallengeModule, MultTarget, Rng } from './types';
import { citadelMult } from '../citadel';
import { survey, type SurveyState } from './survey';
import { undertow, type UndertowState } from './undertow';
import { archive, type ArchiveState } from './archive';
import { stair, type StairState } from './stair';
import { seal, type SealState } from './seal';
import { ring, type RingState } from './ring';
import { operator, type OperatorState } from './operator';
import { scriptorium, type ScriptoriumState } from './scriptorium';
import { syzygy, type SyzygyState } from './syzygy';

export type { ChallengeId, MultTarget } from './types';

export interface ChallengeStates {
  survey: SurveyState;
  undertow: UndertowState;
  archive: ArchiveState;
  stair: StairState;
  seal: SealState;
  ring: RingState;
  operator: OperatorState;
  scriptorium: ScriptoriumState;
  syzygy: SyzygyState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CHALLENGES: ChallengeModule<any>[] = [survey, undertow, archive, stair, seal, ring, operator, scriptorium, syzygy];
export const chByZone = (zone: number) => CHALLENGES.find(c => c.zone === zone);

export const freshChallenges = (): ChallengeStates => Object.fromEntries(CHALLENGES.map(c => [c.id, c.fresh()])) as unknown as ChallengeStates;

/** The first challenge waits for the first Plex; each one after waits for the milestone of the one before. */
export const challengesBegin = (s: GameState) => s.zonesOpened >= 9 && s.zones[8].bought >= 1;
export const chUnlocked = (s: GameState, id: ChallengeId) => s.chUnlocked.includes(id);
export function chWaitingOn(s: GameState, id: ChallengeId): string {
  const i = CHALLENGES.findIndex(c => c.id === id);
  if (!challengesBegin(s)) return 'Dig your first Plex.';
  return i <= 0 ? '' : `${CHALLENGES[i - 1].name}: ${CHALLENGES[i - 1].milestone.text}`;
}
export const allChallengesDone = (s: GameState) => CHALLENGES.every(c => chUnlocked(s, c.id) && c.milestone.done(s));

/** Opens whatever is due and runs the open ones. Returns the challenges that just opened. */
export function stepChallenges(s: GameState, dt: number, rng: Rng): ChallengeModule<unknown>[] {
  const opened: ChallengeModule<unknown>[] = [];
  if (!challengesBegin(s)) return opened;
  for (let i = 0; i < CHALLENGES.length; i++) {
    const c = CHALLENGES[i];
    if (!chUnlocked(s, c.id)) {
      if (i > 0 && !CHALLENGES[i - 1].milestone.done(s)) break;
      s.chUnlocked.push(c.id);
      opened.push(c);
    }
    c.step(s, dt, rng);
  }
  return opened;
}

export function chMult(s: GameState, t: MultTarget): number {
  let m = 1;
  for (const c of CHALLENGES) if (chUnlocked(s, c.id)) m *= c.mult(s, t);
  return m * citadelMult(s, t);
}
