// The Barker Spiral's alchemy. Spirals make pigment. Pigment buys colours dropped into the spiral;
// winding them together either finds a tincture, which gives a permanent bonus that can be brewed
// again to level it, or makes mud. Research spends pigment on new colours, a third slot and hints.
// Pure functions over GameState, like the engine.
import Decimal from 'break_eternity.js';
import type { GameState } from './state';

export const SPIRAL = 5; // zone index of the Barker Spiral

/** Sixteen base colours: twelve hues a twelfth of the wheel apart, and four that have no hue. */
export const COLORS: { name: string; hex: string; desc: string }[] = [
  { name: 'Ichor', hex: '#e0283c', desc: 'Red that was inside something.' },
  { name: 'Cinderglow', hex: '#ee7424', desc: 'The colour of the fire before it starts.' },
  { name: 'Sulphur Psalm', hex: '#f2d12a', desc: 'A yellow that smells of a hymn.' },
  { name: 'Bile Lantern', hex: '#9fe02a', desc: 'Sick light, held up to see by.' },
  { name: 'Lichen Choir', hex: '#3ccf3c', desc: 'Green that grows in rows and sings.' },
  { name: 'Verdigris', hex: '#22d48e', desc: 'What copper turns into, given time.' },
  { name: 'Drowned Signal', hex: '#22d0d6', desc: 'A broadcast from under the water.' },
  { name: 'Lull', hex: '#2c8ef0', desc: 'The blue of the town at four in the morning.' },
  { name: 'Abyssal', hex: '#3a46f0', desc: 'Blue so deep it has a floor.' },
  { name: 'Hyperviolet', hex: '#8a3cf0', desc: 'Past violet, where the eye gives up.' },
  { name: 'Numogram', hex: '#d63ce6', desc: 'A colour that counts in tens.' },
  { name: 'Siren Bloom', hex: '#f0408e', desc: 'Pink, and loud, and rising.' },
  { name: 'Bone Static', hex: '#ece6d2', desc: 'White, with a hiss in it.' },
  { name: 'Lead Hymn', hex: '#8c9098', desc: 'Grey that weighs what it sounds like.' },
  { name: 'Soot Halo', hex: '#3a3436', desc: 'Black ring round a thing that was bright.' },
  { name: 'Rust Rosary', hex: '#8e4a26', desc: 'Brown beads counted during the siren.' },
];
/** The colours you start with, spread round the wheel. */
export const START_COLORS = [0, 2, 6, 14];

export type TinctureTarget = 'ash' | 'listen' | 'echoes' | 'rust' | 'embers' | 'cycles' | 'pigment' | 'comfort' | 'luck' | 'eggs'
  | 'zone0' | 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zones';

export interface Recipe { id: string; name: string; mix: string[]; target: TinctureTarget; per: number; base: number; desc: string; hex: string }

const c = (n: number) => `c${n}`;
// Ingredients are colour ids (c0..c15) or tincture ids. Three-part recipes need the third slot.
export const RECIPES: Recipe[] = [
  { id: 'tallow', name: 'Tallow Dawn', mix: [c(0), c(2)], target: 'ash', per: 0.1, base: 40, hex: '#f08a30', desc: 'Morning, rendered down.' },
  { id: 'clotted', name: 'Clotted Night', mix: [c(0), c(14)], target: 'listen', per: 0.25, base: 40, hex: '#7a1e28', desc: 'Dark enough to hear through.' },
  { id: 'marsh', name: 'Marsh Lamp', mix: [c(2), c(6)], target: 'echoes', per: 0.15, base: 40, hex: '#8ed880', desc: 'A light that walks away from you.' },
  { id: 'bell', name: 'Sunken Bell', mix: [c(6), c(14)], target: 'rust', per: 0.15, base: 40, hex: '#1e6266', desc: 'It still rings at the hour.' },
  { id: 'emberrot', name: 'Ember Rot', mix: [c(1), c(14)], target: 'embers', per: 0.2, base: 120, hex: '#8a3a1e', desc: 'Embers that keep going after they should stop.' },
  { id: 'tide', name: 'Slow Tide', mix: [c(7), c(8)], target: 'pigment', per: 0.2, base: 120, hex: '#3066f0', desc: 'The spiral turns a little easier.' },
  { id: 'moss', name: 'Moss Psalm', mix: [c(4), c(5)], target: 'eggs', per: 0.2, base: 120, hex: '#30d064', desc: 'Eggs like the smell of it.' },
  { id: 'plexink', name: 'Plex Ink', mix: [c(9), c(10)], target: 'cycles', per: 0.2, base: 300, hex: '#b03cec', desc: 'The Compiler writes in this.' },
  { id: 'liturgy', name: 'Grey Liturgy', mix: [c(12), c(13)], target: 'comfort', per: 0.1, base: 300, hex: '#bcbab4', desc: 'A quiet service for the back room.' },
  { id: 'redhymn', name: 'Red Hymn', mix: [c(11), c(0)], target: 'zone0', per: 0.2, base: 300, hex: '#e83464', desc: 'Shallow Bores hum along.' },
  { id: 'jaundice', name: 'Jaundice', mix: [c(3), c(2)], target: 'zone1', per: 0.15, base: 800, hex: '#c8d82a', desc: 'Conduits run yellow and fast.' },
  { id: 'patina', name: 'Patina', mix: [c(5), c(15)], target: 'zone2', per: 0.1, base: 800, hex: '#58905a', desc: 'Old recordings play cleaner.' },
  { id: 'undertow', name: 'Undertow', mix: [c(6), c(7)], target: 'zone3', per: 0.1, base: 800, hex: '#26b0e4', desc: 'The wells pull harder.' },
  { id: 'blackwater', name: 'Black Water', mix: [c(8), c(14)], target: 'zone4', per: 0.1, base: 2000, hex: '#26286a', desc: 'The lock holds, and lets go.' },
  { id: 'oxide', name: 'Oxide Sermon', mix: [c(15), c(1)], target: 'rust', per: 0.25, base: 2000, hex: '#b85a24', desc: 'Preached during the siren.' },
  { id: 'hexchalk', name: 'Hex Chalk', mix: [c(10), c(12)], target: 'luck', per: 0.1, base: 2000, hex: '#e8a6ee', desc: 'Drawn round the window. Rarer flakes notice.' },
  // second order: tinctures as ingredients
  { id: 'candle', name: 'Candle That Remembers', mix: ['tallow', c(12)], target: 'ash', per: 0.2, base: 6000, hex: '#f6c070', desc: 'It burns back to where it started.' },
  { id: 'wisp', name: "Will-o'-the-Wisp", mix: ['marsh', c(7)], target: 'echoes', per: 0.3, base: 6000, hex: '#7ad8e8', desc: 'Follow it and you hear more.' },
  { id: 'tar', name: 'Compiler Tar', mix: ['plexink', c(8)], target: 'cycles', per: 0.4, base: 2e4, hex: '#4a2a9a', desc: 'Thick enough to hold a thought.' },
  { id: 'coil', name: "Barker's Coil", mix: ['tide', c(9)], target: 'pigment', per: 0.4, base: 2e4, hex: '#5a48f0', desc: 'The spiral winds itself.' },
  { id: 'hearth', name: 'Hearth Rite', mix: ['liturgy', 'moss'], target: 'comfort', per: 0.2, base: 2e4, hex: '#d8c890', desc: 'Somewhere to come home to.' },
  { id: 'drownedsiren', name: 'Drowned Siren', mix: ['bell', 'oxide'], target: 'rust', per: 0.5, base: 6e4, hex: '#5a4a3a', desc: 'It sings from the bottom of the well.' },
  { id: 'blacksun', name: 'Black Sun Tincture', mix: ['hexchalk', c(11)], target: 'luck', per: 0.25, base: 6e4, hex: '#2a2210', desc: 'Light that casts darkness.' },
  { id: 'cascade', name: 'Cascade', mix: ['redhymn', 'undertow', 'blackwater'], target: 'zones', per: 0.1, base: 2e5, hex: '#c03a8a', desc: 'Every shaft, all at once, a little more.' },
  { id: 'lemurian', name: 'Lemurian Time', mix: ['tallow', 'clotted', 'hexchalk'], target: 'ash', per: 0.5, base: 1e6, hex: '#e6d8ff', desc: 'Time that runs in the wrong order, on purpose.' },
];

export interface Winding { mix: string[]; left: number; total: number }
export interface Alchemy {
  pigment: number;
  colors: number[]; // base colours unlocked
  found: Record<string, number>; // recipe id -> level
  tried: string[]; // mixes that made mud
  hints: Record<string, number>; // recipe id -> ingredients revealed
  slots3: boolean;
  quick: number; // faster winding, levels
  winding: Winding | null;
  last: string | null; // what the last winding made: a recipe id, or 'mud'
}

export const newAlchemy = (): Alchemy => ({ pigment: 0, colors: [...START_COLORS], found: {}, tried: [], hints: {}, slots3: false, quick: 0, winding: null, last: null });

/** The spiral stays grey until the first Compiler (zone 7) runs. */
export const SPIRAL_AT = 5;
export const ALCHEMY_ZONE = 6;
export const alchemyOpen = (s: GameState) => s.zones[ALCHEMY_ZONE].bought >= 1 && s.zones[SPIRAL].bought >= SPIRAL_AT;
export const mixKey = (mix: string[]) => [...mix].sort().join('+');
export const recipeFor = (mix: string[]) => RECIPES.find(r => mixKey(r.mix) === mixKey(mix));
export const ingredientName = (id: string) => (id[0] === 'c' && /^c\d+$/.test(id) ? COLORS[Number(id.slice(1))].name : RECIPES.find(r => r.id === id)?.name ?? id);
export const ingredientHex = (id: string) => (/^c\d+$/.test(id) ? COLORS[Number(id.slice(1))].hex : RECIPES.find(r => r.id === id)?.hex ?? '#888');

/** Pigment per second: a trickle from the Spirals, growing with how many you have. */
export function pigmentBase(s: GameState): number {
  if (!alchemyOpen(s)) return 0;
  const z = s.zones[SPIRAL];
  return 0.4 + 1.2 * Decimal.log10(z.amount.add(1)).toNumber() + 0.1 * z.bought;
}

/** Dropping a colour in costs pigment; a tincture used as an ingredient is not used up. */
export const dropCost = (id: string) => (/^c\d+$/.test(id) ? 10 : 0);
export const windCost = (mix: string[]) => mix.reduce((n, id) => n + dropCost(id), 0);
export const windTime = (s: GameState) => 6 * Math.pow(0.7, s.alchemy.quick);
/** Each level of a tincture costs this many times the last, so the grimoire helps without carrying the run. */
export const BREW_GROWTH = 3.2;
/** Brewing a found tincture again raises its level; each level costs more. */
export const brewCost = (s: GameState, r: Recipe) => Math.round(r.base * Math.pow(BREW_GROWTH, s.alchemy.found[r.id] ?? 0));

export const hasIngredient = (s: GameState, id: string) => (/^c\d+$/.test(id) ? s.alchemy.colors.includes(Number(id.slice(1))) : (s.alchemy.found[id] ?? 0) > 0);
export const maxSlots = (s: GameState) => (s.alchemy.slots3 ? 3 : 2);

/** Start winding a mix. Finishes on its own in the tick. */
export function wind(s: GameState, mix: string[]): boolean {
  const a = s.alchemy;
  if (!alchemyOpen(s) || a.winding || mix.length < 2 || mix.length > maxSlots(s)) return false;
  if (new Set(mix).size !== mix.length || !mix.every(id => hasIngredient(s, id))) return false;
  const cost = windCost(mix);
  if (a.pigment < cost) return false;
  a.pigment -= cost;
  const t = windTime(s);
  a.winding = { mix: [...mix], left: t, total: t };
  a.last = null;
  return true;
}

/** Brew a found tincture again, from the grimoire. */
export function brew(s: GameState, id: string): boolean {
  const r = RECIPES.find(x => x.id === id);
  if (!r || !(s.alchemy.found[id] ?? 0)) return false;
  const cost = brewCost(s, r);
  if (s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  s.alchemy.found[id]++;
  return true;
}

function finish(s: GameState) {
  const a = s.alchemy;
  const mix = a.winding!.mix;
  a.winding = null;
  const r = recipeFor(mix);
  if (r && !a.found[r.id]) { a.found[r.id] = 1; a.last = r.id; return; }
  if (r) { a.last = r.id; return; } // already known: winding it again does nothing but show it
  if (!a.tried.includes(mixKey(mix))) a.tried.push(mixKey(mix));
  a.last = 'mud';
}

export function stepAlchemy(s: GameState, dt: number, pigmentRate: number) {
  if (!alchemyOpen(s)) return;
  const a = s.alchemy;
  a.pigment += pigmentRate * dt;
  if (a.winding) {
    a.winding.left -= dt;
    if (a.winding.left <= 0) finish(s);
  }
}

// ---- research ----

export const colorCost = (s: GameState) => Math.round(60 * Math.pow(2.4, s.alchemy.colors.length - START_COLORS.length));
export const SLOT3_COST = 4000;
export const quickCost = (s: GameState) => Math.round(250 * Math.pow(4, s.alchemy.quick));
export const QUICK_MAX = 5;
export const hintCost = (s: GameState) => Math.round(150 * Math.pow(1.6, Object.values(s.alchemy.hints).reduce((n, v) => n + v, 0)));

/** The next colour research would reveal, in wheel order. */
export function nextColor(s: GameState): number | null {
  const left = COLORS.map((_, i) => i).filter(i => !s.alchemy.colors.includes(i));
  return left.length ? left[0] : null;
}

export function researchColor(s: GameState): boolean {
  const n = nextColor(s);
  const cost = colorCost(s);
  if (n === null || s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  s.alchemy.colors.push(n);
  return true;
}

export function researchSlot(s: GameState): boolean {
  if (s.alchemy.slots3 || s.alchemy.pigment < SLOT3_COST) return false;
  s.alchemy.pigment -= SLOT3_COST;
  s.alchemy.slots3 = true;
  return true;
}

export function researchQuick(s: GameState): boolean {
  const cost = quickCost(s);
  if (s.alchemy.quick >= QUICK_MAX || s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  s.alchemy.quick++;
  return true;
}

/** The recipe a hint would work on: the first undiscovered one you could make with what you have. */
export function hintTarget(s: GameState): Recipe | null {
  const open = RECIPES.filter(r => !s.alchemy.found[r.id] && (s.alchemy.hints[r.id] ?? 0) < r.mix.length && (r.mix.length < 3 || s.alchemy.slots3));
  return open.find(r => r.mix.every(id => hasIngredient(s, id))) ?? null;
}

export function researchHint(s: GameState): boolean {
  const r = hintTarget(s);
  const cost = hintCost(s);
  if (!r || s.alchemy.pigment < cost) return false;
  s.alchemy.pigment -= cost;
  s.alchemy.hints[r.id] = (s.alchemy.hints[r.id] ?? 0) + 1;
  return true;
}

/** Product of every tincture aimed at a target. */
export function tinctureMult(s: GameState, t: TinctureTarget): number {
  let m = 1;
  for (const r of RECIPES) if (r.target === t && s.alchemy.found[r.id]) m *= 1 + r.per * s.alchemy.found[r.id];
  return m;
}
