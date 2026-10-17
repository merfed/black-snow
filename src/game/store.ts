import Decimal from 'break_eternity.js';
import { create } from 'zustand';
import * as engine from './engine';
import type { RiteId, UpgradeId } from './data';
import type { FixtureId, FreqId, KilnId, NurseryUpId } from './systems';
import { clearLocal, exportSave, importSave, readLocal, writeLocal } from './save';
import { newGame, type GameState } from './state';

// The game object is mutated in place by the engine; `rev` bumps so React re-renders.
interface Store {
  game: GameState;
  rev: number;
  run: (fn: (s: GameState) => unknown) => void;
  listen: () => Decimal;
  catchWarmFlake: () => Decimal;
  buyShaft: (i: number) => void;
  buyShaftsToTen: (i: number) => void;
  buyRite: (id: RiteId) => void;
  buyUpgrade: (id: UpgradeId) => void;
  answerSiren: () => void;
  devSet: (res: engine.DevResource, amount: string, mode: 'set' | 'add') => boolean;
  buildFixture: (id: FixtureId) => void;
  buyKiln: (id: KilnId) => void;
  tune: (id: FreqId) => void;
  buyZoneUp: (i: number, k: number) => void;
  warmEgg: (id: number) => void;
  feed: (id: number) => void;
  sing: (id: number) => void;
  breed: (a: number, b: number) => void;
  release: (id: number) => void;
  discardEgg: (id: number) => void;
  buyNurseryUp: (id: NurseryUpId) => void;
  maxZone: (i: number) => void;
  maxStation: () => void;
  tendAll: () => void;
  save: () => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  hardReset: () => void;
}

function boot(): GameState {
  const saved = readLocal();
  if (!saved) return newGame();
  engine.catchUp(saved, (Date.now() - saved.lastSaved) / 1000);
  return saved;
}

export const useGame = create<Store>((set, get) => ({
  game: boot(),
  rev: 0,
  run: fn => {
    fn(get().game);
    set(st => ({ rev: st.rev + 1 }));
  },
  listen: () => {
    const caught = engine.listen(get().game);
    set(st => ({ rev: st.rev + 1 }));
    return caught;
  },
  catchWarmFlake: () => {
    const got = engine.catchWarmFlake(get().game);
    set(st => ({ rev: st.rev + 1 }));
    return got;
  },
  buyShaft: i => get().run(s => engine.buyShaft(s, i)),
  buyShaftsToTen: i => get().run(s => engine.buyShaftsToTen(s, i)),
  buyRite: id => get().run(s => engine.buyRite(s, id)),
  buyUpgrade: id => get().run(s => engine.buyUpgrade(s, id)),
  answerSiren: () => get().run(s => engine.answerSiren(s)),
  devSet: (res, amount, mode) => {
    const n = new Decimal(amount.trim() || 0);
    if (!n.isFinite()) return false;
    const s = get().game;
    const current = devValue(s, res);
    const target = mode === 'add' ? current.add(n) : n;
    if (target.lt(0)) return false;
    get().run(g => engine.devSet(g, res, target));
    return true;
  },
  buildFixture: id => get().run(s => engine.buildFixture(s, id)),
  buyKiln: id => get().run(s => engine.buyKiln(s, id)),
  tune: id => get().run(s => engine.tune(s, id)),
  buyZoneUp: (i, k) => get().run(s => engine.buyZoneUp(s, i, k)),
  warmEgg: id => get().run(s => engine.warmEgg(s, id)),
  feed: id => get().run(s => engine.feedCreature(s, id)),
  sing: id => get().run(s => engine.singTo(s, id)),
  breed: (a, b) => get().run(s => engine.breedPair(s, a, b)),
  release: id => get().run(s => engine.releaseCreature(s, id)),
  discardEgg: id => get().run(s => engine.discardEgg(s, id)),
  buyNurseryUp: id => get().run(s => engine.buyNurseryUp(s, id)),
  maxZone: i => get().run(s => engine.maxZone(s, i)),
  maxStation: () => get().run(s => engine.maxStation(s)),
  tendAll: () => get().run(s => engine.tendAll(s)),
  save: () => writeLocal(get().game),
  exportSave: () => exportSave(get().game),
  importSave: text => {
    try {
      const g = importSave(text);
      set(st => ({ game: g, rev: st.rev + 1 }));
      writeLocal(g);
      return true;
    } catch {
      return false;
    }
  },
  hardReset: () => {
    clearLocal();
    set(st => ({ game: newGame(), rev: st.rev + 1 }));
  },
}));

/** Current amount of a dev-editable resource. */
export function devValue(s: GameState, res: engine.DevResource): Decimal {
  if (res === 'ash') return s.ash;
  if (res === 'rust') return new Decimal(s.rust);
  if (res === 'embers') return new Decimal(s.embers);
  if (res === 'echoes') return new Decimal(s.echoes);
  return s.zones[Number(res.slice(4)) - 1].amount;
}
