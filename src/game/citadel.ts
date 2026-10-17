// The Black Citadel and the Dream Engine. Once the Syzygy's gate is open the Citadel wakes: it grows
// nul, a black resource it makes out of nothing, and it drinks a slice of everything the station holds,
// a little more the longer it is awake. Now and then it climbs a floor and drinks harder until a rite
// answers it; the seventh rite is the end of the story. The Dream Engine slows the drinking by feeding
// it dreams; each kind of dream also bends the station, for better and for worse. Wards taper and the
// drain has a ceiling, so it never takes everything. Pure functions over GameState.
import Decimal from 'break_eternity.js';
import type { MultTarget } from './challenges/types';
import type { GameState } from './state';
import { log } from './engine';

export interface Citadel {
  awake: boolean;
  time: number; // seconds awake
  nul: number;
  nulTotal: number;
  ups: Partial<Record<CitadelUpId, number>>;
  drunk: number; // log10 of all ash it has taken, for the record
  rites: number; // rites answered, in order
  bedMade: boolean; // the lucid dream was put in the first bed when it woke
}

export type DreamId = 'lucid' | 'nightmare' | 'falling' | 'drowning' | 'childhood' | 'fever' | 'prophetic' | 'recurring' | 'dreamless' | 'citadel';

export interface Omen { active: boolean; kind: 'bad' | 'bright'; x: number; y: number; ttl: number; spawnIn: number }

export interface Dreams {
  known: DreamId[];
  slots: (DreamId | null)[];
  slotCount: number;
  burned: number;
  burning: Partial<Record<DreamId, number>>; // seconds each dream has burned without a break
  omen: Omen;
  omensCaught: number;
  badClicked: number;
}

export const newCitadel = (): Citadel => ({ awake: false, time: 0, nul: 0, nulTotal: 0, ups: {}, drunk: 0, rites: 0, bedMade: false });
export const newDreams = (): Dreams => ({
  known: ['lucid'], slots: [null, null, null], slotCount: 1, burned: 0, burning: {},
  omen: { active: false, kind: 'bad', x: 0.5, y: 0.5, ttl: 0, spawnIn: 60 }, omensCaught: 0, badClicked: 0,
});

// ---- dreams, the fuel ----

type Syz = { dreams?: number; gateOpen?: boolean };
const syz = (s: GameState) => s.challenges.syzygy as unknown as Syz;
export const dreamsHeld = (s: GameState) => syz(s).dreams ?? 0;
function spendDreams(s: GameState, n: number) { syz(s).dreams = Math.max(0, dreamsHeld(s) - n); }
function addDreams(s: GameState, n: number) { syz(s).dreams = dreamsHeld(s) + n; }

/** Ghostwax melts down into dreams: the brood's sleep, poured into the engine. */
export const WAX_PER_DREAM = 4;
export function meltWax(s: GameState, wax: number): boolean {
  const n = Math.floor(Math.min(wax, s.nursery.ghostwax) / WAX_PER_DREAM);
  if (n <= 0) return false;
  s.nursery.ghostwax -= n * WAX_PER_DREAM;
  addDreams(s, n);
  return true;
}

// ---- the Citadel ----

export const citadelOpen = (s: GameState) => !!syz(s).gateOpen;
const hours = (c: Citadel) => c.time / 3600;

// ---- floors and rites: the long escalation ----

/** Hours awake at which it climbs another floor. Each unanswered floor makes it drink a quarter harder. */
export const FLOORS = [24, 60, 110, 170, 240, 320, 420];
export const FLOOR_BITE = 0.25;
export interface Rite { name: string; nul: number; dreams: number; text: string }
/** One rite answers each floor, in order. The seventh is the last. */
export const RITES: Rite[] = [
  { name: 'Leave the lamp on', nul: 1000, dreams: 300, text: 'A light in the lowest window. It looks at the light instead of you.' },
  { name: 'Read it the dream log', nul: 3000, dreams: 800, text: 'It listens to the pilgrim. It did not know anyone else went down.' },
  { name: 'Brick up the eighth door', nul: 6000, dreams: 1500, text: 'Mortar, bitter, by hand. It knocks once, politely.' },
  { name: 'Count the shifts aloud', nul: 10000, dreams: 2500, text: 'Every name, twice. Nobody extra this time.' },
  { name: 'Bury the ninth lantern', nul: 16000, dreams: 4000, text: 'It keeps burning under the snow. It is warmer down there now.' },
  { name: 'Give it a name', nul: 25000, dreams: 6000, text: 'It does not say whether it likes it. It answers to it.' },
  { name: 'Sing it to sleep', nul: 40000, dreams: 9000, text: 'The station hums in tens. The Citadel hums back, slower, and stops.' },
];
export const RITE_WARD = 0.06; // each rite answered holds back a little more, for good
export const ENDING = 'The Citadel is quiet. It is not asleep. It is listening to the station breathe, and it has decided to let it.';

export const floorsReached = (s: GameState) => FLOORS.filter(h => hours(s.citadel) >= h).length;
export const unanswered = (s: GameState) => Math.max(0, floorsReached(s) - (s.citadel.rites ?? 0));
/** The rite it is waiting for, or null: none due yet, or all seven given. */
export const riteDue = (s: GameState): Rite | null => {
  const k = s.citadel.rites ?? 0;
  return k < RITES.length && floorsReached(s) > k ? RITES[k] : null;
};
export const citadelEnded = (s: GameState) => (s.citadel.rites ?? 0) >= RITES.length;
export function answerRite(s: GameState): boolean {
  const r = riteDue(s);
  if (!r || s.citadel.nul < r.nul || dreamsHeld(s) < r.dreams) return false;
  s.citadel.nul -= r.nul;
  spendDreams(s, r.dreams);
  s.citadel.rites = (s.citadel.rites ?? 0) + 1;
  if (citadelEnded(s)) log(s, 'THE CITADEL HUMS BACK, SLOWER, AND STOPS. IT IS NOT ASLEEP. IT IS LISTENING.', 'milestone', true);
  return true;
}

/** Its appetite: a fraction of every held resource per second, before the wards. It grows with the log of time awake. */
export const appetite = (s: GameState) => 1e-5 * (1 + 1.2 * Math.log(1 + hours(s.citadel) / 12)) * (1 + FLOOR_BITE * unanswered(s));
/** However hungry it gets, what it holds back from you never drops below four hours of income. */
export const DRAIN_CEIL = 1 / (4 * 3600);
/** The most the wards can ever hold back: it always gets a tenth of its appetite. */
export const WARD_CAP = 0.9;

export type CitadelUpId = 'lantern' | 'mortar' | 'undersong' | 'choir' | 'eye' | 'shift' | 'room' | 'snow';
export interface CitadelUp { id: CitadelUpId; name: string; desc: string; base: number; growth: number }
export const CITADEL_UPS: CitadelUp[] = [
  { id: 'lantern', name: 'Black lantern', desc: 'All ash +50% a level.', base: 5, growth: 2.4 },
  { id: 'mortar', name: 'Bitter mortar', desc: 'Its mouth narrows: holds back more of the drain, less with each level (toward half).', base: 8, growth: 2.2 },
  { id: 'undersong', name: 'The undersong', desc: 'Echoes, rust, embers, pigment and cycles +50% a level.', base: 12, growth: 2.6 },
  { id: 'choir', name: 'Hollow choir', desc: 'Every zone +4% a level.', base: 20, growth: 2.8 },
  { id: 'eye', name: 'Eye in the keep', desc: 'Nul +60% a level.', base: 15, growth: 2.5 },
  { id: 'shift', name: 'Night shift', desc: 'Listening +150% a level, and warm flakes come a tenth more often.', base: 10, growth: 2.3 },
  { id: 'room', name: 'A sealed room', desc: 'Time away counts for 6 more hours a level.', base: 40, growth: 3 },
  { id: 'snow', name: 'Black snow', desc: 'All ash grows with the logarithm of all nul ever made.', base: 300, growth: 10 },
];
export const citadelUpLevel = (s: GameState, id: CitadelUpId) => s.citadel.ups[id] ?? 0;
export const citadelUpCost = (s: GameState, u: CitadelUp) => Math.round(u.base * Math.pow(u.growth, citadelUpLevel(s, u.id)));
export function buyCitadelUp(s: GameState, id: CitadelUpId): boolean {
  const u = CITADEL_UPS.find(x => x.id === id)!;
  const cost = citadelUpCost(s, u);
  if (!s.citadel.awake || s.citadel.nul < cost) return false;
  if (u.id === 'snow' && citadelUpLevel(s, 'snow') > 0) return false;
  s.citadel.nul -= cost;
  s.citadel.ups[id] = citadelUpLevel(s, id) + 1;
  return true;
}

/** Bitter mortar's share: tapers toward a half, never past it. */
export const mortarWard = (n: number) => (0.5 * n) / (n + 4);
/** How much of the appetite the wards hold back: mortar, rites and dreams stack, then WARD_CAP scales the lot. */
export function ward(s: GameState): number {
  let open = (1 - mortarWard(citadelUpLevel(s, 'mortar'))) * Math.pow(1 - RITE_WARD, s.citadel.rites ?? 0);
  for (const id of activeDreams(s)) open *= 1 - dreamWard(s, id);
  return WARD_CAP * (1 - open);
}
/** The drain per second: appetite past the wards, eased under DRAIN_CEIL so it can never strand you. */
export function drainRate(s: GameState): number {
  if (!s.citadel.awake) return 0;
  return ease(appetite(s) * (1 - ward(s)));
}
/** A raw drain eased under DRAIN_CEIL. */
export const ease = (d: number) => (d * DRAIN_CEIL) / (d + DRAIN_CEIL);

/** Nul per second: it grows from nothing, faster the longer it is awake. */
export function nulRate(s: GameState): number {
  if (!s.citadel.awake) return 0;
  let r = 0.004 * (1 + Math.sqrt(hours(s.citadel))) * (1 + 0.6 * citadelUpLevel(s, 'eye'));
  for (const id of activeDreams(s)) r *= DREAMS[id].nul ?? 1;
  return r;
}

export function wakeCitadel(s: GameState): boolean {
  if (!citadelOpen(s) || s.citadel.awake) return false;
  s.citadel.awake = true;
  makeFirstBed(s);
  return true;
}

/** The engine wakes with the lucid dream already in the first bed, so someone who never opens it still has a ward. */
function makeFirstBed(s: GameState) {
  if (s.citadel.bedMade) return;
  s.citadel.bedMade = true;
  if (!s.dreams.slots.slice(0, s.dreams.slotCount).some(Boolean) && s.dreams.known.includes('lucid')) s.dreams.slots[0] = 'lucid';
}

/** Extra hours the station counts while away. */
export const awayHours = (s: GameState) => 6 * citadelUpLevel(s, 'room');

function drink(s: GameState, dt: number) {
  const d = drainRate(s);
  if (d <= 0) return;
  const keep = Math.exp(-d * dt); // exact for any step size, so time away drinks the same
  const took = s.ash.mul(1 - keep);
  if (took.gt(0)) s.citadel.drunk = Decimal.pow(10, s.citadel.drunk).add(took).log10().toNumber();
  s.ash = s.ash.mul(keep);
  s.embers *= keep;
  s.echoes *= keep;
  s.rust *= keep;
  s.alchemy.pigment *= keep;
  s.wiring.cycles *= keep;
}

// ---- the Dream Engine ----

export interface DreamDef {
  id: DreamId; name: string; cost: number; ward: number; burn: number; good: string; bad: string;
  mult: Partial<Record<MultTarget, number>>; nul?: number;
}
/** Each dream: what it costs to learn (nul), how much of the appetite it holds back, dreams burned a minute, and its two faces. */
export const DREAMS: Record<DreamId, DreamDef> = {
  lucid: { id: 'lucid', name: 'Lucid dream', cost: 0, ward: 0.25, burn: 1, good: 'Comfort x1.5', bad: 'Echoes x0.85', mult: { comfort: 1.5, echoes: 0.85 } },
  nightmare: { id: 'nightmare', name: 'Nightmare', cost: 6, ward: 0.45, burn: 1.5, good: 'Embers and rust x2.5', bad: 'Bad ashes fall: they look warm, and they cost you', mult: { embers: 2.5, rust: 2.5 } },
  falling: { id: 'falling', name: 'Falling dream', cost: 10, ward: 0.3, burn: 1, good: 'Warm flakes x1.6 as often', bad: 'Listening x0.7', mult: { flakes: 1.6, listen: 0.7 } },
  drowning: { id: 'drowning', name: 'Drowning dream', cost: 16, ward: 0.35, burn: 1.2, good: 'Rampant Well x3, rust x1.5', bad: 'Comfort x0.8', mult: { zone3: 3, rust: 1.5, comfort: 0.8 } },
  childhood: { id: 'childhood', name: 'Childhood dream', cost: 24, ward: 0.25, burn: 0.8, good: 'Bright flakes fall: catch them for dreams and ghostwax', bad: 'Cycles x0.8', mult: { cycles: 0.8 } },
  fever: { id: 'fever', name: 'Fever dream', cost: 40, ward: 0.4, burn: 3, good: 'All ash x4', bad: 'Burns dreams three times as fast', mult: { ash: 4 } },
  prophetic: { id: 'prophetic', name: 'Prophetic dream', cost: 60, ward: 0.3, burn: 1, good: 'Echoes x2.5, listening x2', bad: 'Pigment x0.7', mult: { echoes: 2.5, listen: 2, pigment: 0.7 } },
  recurring: { id: 'recurring', name: 'Recurring dream', cost: 90, ward: 0.1, burn: 0.6, good: 'Holds back more the longer it burns unbroken (up to 60%)', bad: 'Nul x0.8', mult: {}, nul: 0.8 },
  dreamless: { id: 'dreamless', name: 'Dreamless sleep', cost: 140, ward: 0.65, burn: 1.5, good: 'Holds back the most', bad: 'Nul x0.5, all ash x0.8', mult: { ash: 0.8 }, nul: 0.5 },
  citadel: { id: 'citadel', name: "The Citadel's own dream", cost: 400, ward: 0.5, burn: 2, good: 'Nul x2.5, every zone x1.3', bad: 'Bad ashes fall, and it wakes hungrier', mult: { zones: 1.3 }, nul: 2.5 },
};
export const DREAM_ORDER = Object.keys(DREAMS) as DreamId[];
export const SLOT_NUL = [0, 30, 250];

/** The dreams actually burning: set in a slot, and fuel left to burn them. */
export const activeDreams = (s: GameState): DreamId[] =>
  dreamsHeld(s) > 0 ? s.dreams.slots.slice(0, s.dreams.slotCount).filter((d): d is DreamId => !!d) : [];

export function dreamWard(s: GameState, id: DreamId): number {
  if (id === 'recurring') return Math.min(0.6, 0.1 + 0.5 * ((s.dreams.burning.recurring ?? 0) / (6 * 3600)));
  return DREAMS[id].ward;
}
/** Dreams burned per second by everything in the engine. */
export const burnRate = (s: GameState) => activeDreams(s).reduce((n, id) => n + DREAMS[id].burn / 60, 0) * burnGrowth(s);
/** Dreams burn faster the longer it is awake, by a logarithm, so the pilgrim can always keep a bed or two lit. */
export const burnGrowth = (s: GameState) => 1 + 0.3 * Math.log(1 + hours(s.citadel) / 24);

export function learnDream(s: GameState, id: DreamId): boolean {
  const d = DREAMS[id];
  if (s.dreams.known.includes(id) || s.citadel.nul < d.cost) return false;
  s.citadel.nul -= d.cost;
  s.dreams.known.push(id);
  return true;
}
export function setDream(s: GameState, slot: number, id: DreamId | null): boolean {
  if (slot >= s.dreams.slotCount || (id && !s.dreams.known.includes(id))) return false;
  if (id && s.dreams.slots.some((x, i) => x === id && i !== slot)) return false;
  const old = s.dreams.slots[slot];
  if (old && old !== id) s.dreams.burning[old] = 0;
  s.dreams.slots[slot] = id;
  return true;
}
export function openDreamSlot(s: GameState): boolean {
  const cost = SLOT_NUL[s.dreams.slotCount];
  if (cost === undefined || s.citadel.nul < cost) return false;
  s.citadel.nul -= cost;
  s.dreams.slotCount++;
  return true;
}

const OMEN_TTL = 9;
function stepOmens(s: GameState, dt: number, rng: () => number) {
  const o = s.dreams.omen, act = activeDreams(s);
  const bad = act.includes('nightmare') || act.includes('citadel');
  const bright = act.includes('childhood');
  if (o.active) {
    o.ttl -= dt;
    if (o.ttl <= 0 || (o.kind === 'bad' ? !bad : !bright)) o.active = false;
    return;
  }
  if (!bad && !bright) return;
  o.spawnIn -= dt;
  if (o.spawnIn > 0) return;
  const kind = bad && (!bright || rng() < 0.5) ? 'bad' : 'bright';
  s.dreams.omen = { active: true, kind, x: 0.12 + rng() * 0.76, y: 0.18 + rng() * 0.64, ttl: OMEN_TTL, spawnIn: 50 + rng() * 70 };
}

/** What a bad ash takes when it is touched. */
export const BAD_TAKE = { ash: 0.04, embers: 0.15, echoes: 0.1 };

/** A bright flake brings back ten minutes of what the engine burns, and never less than a handful. */
export const brightGift = (s: GameState) => Math.max(3 + Math.floor(Math.sqrt(s.dreams.burned) / 4), Math.round(burnRate(s) * 600));

/** Touch the omen. A bright one gives dreams and ghostwax; a bad one takes a bite of what you hold. */
export function touchOmen(s: GameState): 'bright' | 'bad' | null {
  const o = s.dreams.omen;
  if (!o.active) return null;
  o.active = false;
  if (o.kind === 'bright') {
    addDreams(s, brightGift(s));
    s.nursery.ghostwax += 10;
    s.dreams.omensCaught++;
    return 'bright';
  }
  s.ash = s.ash.mul(1 - BAD_TAKE.ash);
  s.embers = Math.floor(s.embers * (1 - BAD_TAKE.embers));
  s.echoes *= 1 - BAD_TAKE.echoes;
  s.dreams.badClicked++;
  return 'bad';
}

// ---- the engine's hooks ----

export function stepCitadel(s: GameState, dt: number, rng: () => number = Math.random) {
  if (!s.citadel.awake) return;
  const c = s.citadel;
  makeFirstBed(s); // saves that woke before the engine made its own first bed
  const floors = floorsReached(s);
  const hunger = activeDreams(s).includes('citadel') ? 1.5 : 1;
  c.time += dt * hunger;
  const n = nulRate(s) * dt;
  c.nul += n;
  c.nulTotal += n;
  const act = activeDreams(s);
  if (act.length) {
    const fuel = burnRate(s) * dt;
    s.dreams.burned += Math.min(fuel, dreamsHeld(s));
    spendDreams(s, fuel);
    for (const id of act) s.dreams.burning[id] = (s.dreams.burning[id] ?? 0) + dt;
  }
  drink(s, dt);
  stepOmens(s, dt, rng);
  if (floorsReached(s) > floors && !citadelEnded(s)) log(s, `THE CITADEL HAS CLIMBED ANOTHER FLOOR. IT IS DRINKING HARDER.`, 'milestone', true);
}

export const snowMult = (nulTotal: number) => 1 + Math.log10(1 + nulTotal);

export function citadelMult(s: GameState, t: MultTarget): number {
  if (!s.citadel.awake) return 1;
  let m = 1;
  const lvl = (id: CitadelUpId) => s.citadel.ups[id] ?? 0;
  // Each level adds a fixed amount: with prices growing by a power, the gains taper like everything else this late.
  if (t === 'ash') {
    m *= 1 + 0.5 * lvl('lantern');
    if (lvl('snow')) m *= snowMult(s.citadel.nulTotal);
  }
  if (t === 'echoes' || t === 'rust' || t === 'embers' || t === 'pigment' || t === 'cycles') m *= 1 + 0.5 * lvl('undersong');
  if (t === 'zones') m *= 1 + 0.04 * lvl('choir');
  if (t === 'listen') m *= 1 + 1.5 * lvl('shift');
  if (t === 'flakes') m *= 1 + 0.1 * lvl('shift');
  for (const id of activeDreams(s)) m *= DREAMS[id].mult[t] ?? 1;
  return m;
}

/** A plain-number view of the drain for the UI: ash it takes a second right now. */
export const ashDrainPerSecond = (s: GameState) => s.ash.mul(drainRate(s));
