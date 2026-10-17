import Decimal from 'break_eternity.js';
import { randomGenome } from './genome';
import { newGame, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'black-snow-save';

// Decimals become strings on the way out and are revived by key on the way in.
const DECIMAL_KEYS = new Set(['ash', 'ashThisRun', 'amount', 'lifetimeAsh']);

export function serialize(s: GameState): string {
  return JSON.stringify(s, (_k, v) => (v instanceof Decimal ? v.toString() : v));
}

export function deserialize(raw: string): GameState {
  const parsed = JSON.parse(raw, (k, v) => (DECIMAL_KEYS.has(k) && typeof v === 'string' ? new Decimal(v) : v));
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
    throw new Error('Not a Black Snow save');
  }
  return migrate(parsed);
}

/** Fill anything a newer version added, so old saves keep loading. */
function migrate(saved: Partial<GameState>): GameState {
  const fresh = newGame();
  const s = { ...fresh, ...saved } as GameState;
  s.siren = { ...fresh.siren, ...saved.siren };
  if ((saved.version ?? 1) < 2) {
    // v1 had no instruments: credit the ones an old save has clearly moved past.
    const dug = (saved.zones ?? []).some(z => z.bought > 0);
    s.upgrades = { thaw: true, floor: dug, copper: dug, coil: dug, antenna: (saved.sirensSeen ?? 0) > 0 };
    s.log = (saved.log ?? []).filter(e => (e.kind as string) !== 'danger');
  }
  s.warmFlake = { ...fresh.warmFlake, ...saved.warmFlake };
  s.weather = { ...fresh.weather, ...saved.weather };
  s.nursery = { ...fresh.nursery, ...saved.nursery };
  s.wiring = { ...fresh.wiring, ...saved.wiring };
  s.stats = { ...fresh.stats, ...saved.stats };
  // Old saves counted warm flakes before rarities existed; credit them as common.
  if (!saved.stats) s.stats.flakes[0] = saved.warmCaught ?? 0;
  // v3 had one egg and booleans for zone upgrades.
  const old = (saved as { egg?: { stage: number; warmth: number; hunger: number; mood: number; growth: number } }).egg;
  if (old && old.stage >= 0 && !saved.nursery) {
    const genome = randomGenome(Math.random);
    s.nursery.found = true;
    if (old.stage === 0) s.nursery.eggs = [{ id: 1, genome, warmth: old.warmth }];
    else s.nursery.brood = [{ id: 1, genome, stage: old.stage, hunger: old.hunger, mood: old.mood, growth: old.growth, singIn: 0, breedIn: 0 }];
    s.nursery.nextId = 2;
  }
  delete (s as { egg?: unknown }).egg;
  s.zoneUps = Object.fromEntries(Object.entries(saved.zoneUps ?? {}).map(([k, v]) => [k, (v as unknown) === true ? 1 : Number(v) || 0]));
  s.zones = fresh.zones.map((z, i) => ({ ...z, ...(saved.zones?.[i] ?? {}) }));
  s.version = SAVE_VERSION;
  return s;
}

export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(serialize(s))));
}

export function importSave(text: string): GameState {
  return deserialize(decodeURIComponent(escape(atob(text.trim()))));
}

export function writeLocal(s: GameState) {
  try {
    s.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, serialize(s));
  } catch {
    // Private mode or full storage: the game keeps running, it just will not persist.
  }
}

export function readLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
