// The zone challenges: one late system per zone, opening one after another once zone 9 is reached.
// This file is the only place the engine talks to them.
import type { GameState } from '../state';
import { slowRef, type ChallengeId, type ChallengeModule, type MultTarget, type Rng } from './types';
import { passiveRate } from '../engine';
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

/**
 * Plex dug before each challenge (in CHALLENGES order) may open, on top of the milestone of the one before.
 * They speed the game up a lot, so they open spread across the late game rather than back to back.
 */
export const PLEX_AT = [1, 5, 12, 20, 28, 36, 44, 52, 60];
export const plexDug = (s: GameState) => s.zones[8].bought;
const indexOf = (id: ChallengeId) => CHALLENGES.findIndex(c => c.id === id);
export const plexNeeded = (id: ChallengeId) => PLEX_AT[indexOf(id)] ?? 1;
export const stageMet = (s: GameState, id: ChallengeId) => plexDug(s) >= plexNeeded(id);

/** What a sealed challenge still waits for: each condition and whether it is met. */
export function chNeeds(s: GameState, id: ChallengeId): { text: string; done: boolean }[] {
  const i = indexOf(id);
  const need = plexNeeded(id), have = plexDug(s);
  const out = [{ text: `Dig ${need} Plex (${Math.min(have, need)}/${need})`, done: have >= need }];
  if (i > 0) out.push({ text: `${CHALLENGES[i - 1].name}: ${CHALLENGES[i - 1].milestone.text}`, done: CHALLENGES[i - 1].milestone.done(s) });
  return out;
}
/** The same, as one line naming only what is still missing. */
export function chWaitingOn(s: GameState, id: ChallengeId): string {
  if (!challengesBegin(s)) return 'Dig your first Plex.';
  return chNeeds(s, id).filter(n => !n.done).map(n => n.text).join(', and ');
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
      if (!stageMet(s, c.id)) break;
      s.chUnlocked.push(c.id);
      opened.push(c);
    }
    c.step(s, dt, rng);
  }
  // Open challenges that price items off a slow income keep it as `priceRef` in their state; income is read once.
  let live: number | undefined;
  for (const id of s.chUnlocked) {
    const v = (s.challenges as unknown as Record<string, { priceRef?: number } | undefined>)[id];
    if (typeof v?.priceRef !== 'number') continue;
    live ??= passiveRate(s).log10().toNumber();
    v.priceRef = slowRef(v.priceRef, live, dt);
  }
  return opened;
}

export function chMult(s: GameState, t: MultTarget): number {
  let m = 1;
  for (const c of CHALLENGES) if (chUnlocked(s, c.id)) m *= c.mult(s, t);
  return m * citadelMult(s, t);
}
