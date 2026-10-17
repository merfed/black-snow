// Familiars and ghostwax. Three slots by the stove hold a creature each; a familiar no longer counts
// toward the brood, needs no feeding, and lends a strong gift plus a quirk of its own. Creatures can
// also be rendered down into ghostwax, which lights candles that strengthen the familiars.
// Pure functions over GameState, like the engine.
import { giftOf, type Genome, type Gift } from './genome';
import type { Creature, GameState } from './state';

export const BROOD_MAX = 255;
export const FAMILIAR_SLOTS = 3;

export type Quirk = 'flakes' | 'rust' | 'embers' | 'eggs' | 'zones';
export const QUIRKS: Quirk[] = ['flakes', 'rust', 'embers', 'eggs', 'zones'];
export const quirkOf = (g: Genome): Quirk => QUIRKS[(g.eyes + g.limbs) % QUIRKS.length];

/** How much one point of familiar power adds, per quirk. */
const QUIRK_RATE: Record<Quirk, number> = { flakes: 0.15, rust: 0.25, embers: 0.2, eggs: 0.3, zones: 0.05 };
export const QUIRK_TEXT: Record<Quirk, (p: number) => string> = {
  flakes: p => `Warm flakes ${fmtPct(QUIRK_RATE.flakes * p)} more often`,
  rust: p => `Rust ${fmtPct(QUIRK_RATE.rust * p)}`,
  embers: p => `Embers ${fmtPct(QUIRK_RATE.embers * p)}`,
  eggs: p => `Eggs warm ${fmtPct(QUIRK_RATE.eggs * p)} faster`,
  zones: p => `Every zone ${fmtPct(QUIRK_RATE.zones * p)}`,
};
function fmtPct(v: number) { return `+${Math.round(v * 100)}%`; }

/** A familiar's gift counts as this many fed creatures of its stage. */
export const FAMILIAR_GIFT = 8;

/** What it costs to open each slot by the stove. */
export const SLOT_COST = [
  { ash: 1e6, embers: 25 },
  { ash: 1e11, embers: 150 },
  { ash: 1e18, embers: 800 },
];

export const familiarsOf = (s: GameState) => s.nursery.familiars.slice(0, s.nursery.slots);

/** Stage, strengthened by the slot's candles. */
export const familiarPower = (s: GameState, slot: number) => {
  const c = s.nursery.familiars[slot];
  return c && slot < s.nursery.slots ? c.stage * (1 + 0.25 * (s.nursery.candles[slot] ?? 0)) : 0;
};

export function familiarGift(s: GameState, gift: Gift): number {
  let n = 0;
  s.nursery.familiars.forEach((c, i) => { if (c && i < s.nursery.slots && giftOf(c.genome) === gift) n += FAMILIAR_GIFT * familiarPower(s, i); });
  return n;
}

export function quirkMult(s: GameState, q: Quirk): number {
  let m = 1;
  s.nursery.familiars.forEach((c, i) => { if (c && i < s.nursery.slots && quirkOf(c.genome) === q) m *= 1 + QUIRK_RATE[q] * familiarPower(s, i); });
  return m;
}

export function openSlot(s: GameState): boolean {
  const n = s.nursery, cost = SLOT_COST[n.slots];
  if (!cost || s.ash.lt(cost.ash) || s.embers < cost.embers) return false;
  s.ash = s.ash.sub(cost.ash);
  s.embers -= cost.embers;
  n.slots++;
  return true;
}

/** Move a creature from the brood to a slot. Whoever was there goes back to the brood, room permitting. */
export function setFamiliar(s: GameState, slot: number, id: number, broodRoom: number): boolean {
  const n = s.nursery;
  if (slot >= n.slots) return false;
  const c = n.brood.find(x => x.id === id);
  if (!c) return false;
  const old = n.familiars[slot];
  if (old && n.brood.length > broodRoom) return false;
  n.brood = n.brood.filter(x => x.id !== id);
  if (old) n.brood.push(old);
  n.familiars[slot] = c;
  return true;
}

export function recallFamiliar(s: GameState, slot: number, broodRoom: number): boolean {
  const n = s.nursery, c = n.familiars[slot];
  if (!c || n.brood.length >= broodRoom) return false;
  n.brood.push(c);
  n.familiars[slot] = null;
  return true;
}

/** Ghostwax a creature renders down to. Grown ones give far more. */
export const waxFor = (c: Creature) => 2 * c.stage * c.stage;

export function renderCreatures(s: GameState, ids: number[]): number {
  const n = s.nursery, set = new Set(ids);
  let wax = 0;
  n.brood = n.brood.filter(c => {
    if (!set.has(c.id)) return true;
    wax += waxFor(c);
    return false;
  });
  n.ghostwax += wax;
  n.rendered += set.size;
  return wax;
}

export const candleCost = (s: GameState, slot: number) => Math.floor(10 * Math.pow(2.2, s.nursery.candles[slot] ?? 0));

export function lightCandle(s: GameState, slot: number): boolean {
  const n = s.nursery, cost = candleCost(s, slot);
  if (slot >= n.slots || n.ghostwax < cost) return false;
  n.ghostwax -= cost;
  n.candles[slot] = (n.candles[slot] ?? 0) + 1;
  return true;
}
