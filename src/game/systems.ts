// Content for the small side systems: zone upgrades, weather, the station, the kiln, the dial and
// the egg. Data only; the rules live in engine.ts.

// ---- zone upgrades: four per zone, opened by how many of that zone you have bought ----

export type ZoneUpEffect = 'mult' | 'cheap' | 'mult2' | 'all';

/**
 * Four upgrades per zone, each bought again and again. Every level needs more of that zone dug
 * (gate + gateStep per level) and costs `growth` times the last, and every level compounds.
 */
export interface ZoneUpDef { k: number; effect: ZoneUpEffect; gate: number; gateStep: number; costMul: number; growth: number; max: number }

export const ZONE_UP_SLOTS: ZoneUpDef[] = [
  { k: 0, effect: 'mult', gate: 10, gateStep: 10, costMul: 1e3, growth: 4, max: Infinity },
  { k: 1, effect: 'cheap', gate: 25, gateStep: 25, costMul: 1e5, growth: 60, max: Infinity },
  { k: 2, effect: 'mult2', gate: 50, gateStep: 40, costMul: 1e7, growth: 10, max: Infinity },
  { k: 3, effect: 'all', gate: 100, gateStep: 50, costMul: 1e10, growth: 20, max: Infinity },
];

export const ZONE_UP_NAMES: string[][] = [
  ['Brace the walls', 'Tallow on the bit', 'Second auger', 'Hear it hum'],
  ['Seal the joints', 'Pressure valve', 'Bleed the line', 'Flow inversion'],
  ['Clean the heads', 'Loop the tape', 'Record over it', 'Play it backwards'],
  ['Lower a bucket', 'Steam vents', 'Let it boil', 'Drink'],
  ['Grease the wheel', 'Pressure seal', 'Cycle the lock', 'Leave it open'],
  ['Count the turns', 'Mirror the stair', 'Descend by ascending', 'Arrive above'],
  ['Feed it tape', 'Patch the kernel', 'Let it rewrite', 'It compiles you'],
  ['Transcribe it', 'Answer back', 'Harmonize', 'Hum along'],
  ['Map it', 'Name it', 'Unname it', 'Wake the iron'],
];

// ---- weather: passive, rolls over every few minutes, never needs a reaction ----

export type WeatherId = 'calm' | 'ashfall' | 'wind' | 'fog' | 'thunder';

export interface WeatherDef { id: WeatherId; name: string; desc: string; line: string }

export const WEATHER: WeatherDef[] = [
  { id: 'calm', name: 'Still air', desc: 'Nothing moves. Nothing changes.', line: 'THE SNOW HANGS IN THE AIR. IT HAS STOPPED FALLING. IT HAS NOT LANDED.' },
  { id: 'ashfall', name: 'Ashfall', desc: 'Heavy snow. Listen catches 1.5 times as much.', line: 'ASHFALL. THE WINDOWS GO DARK FROM THE OUTSIDE.' },
  { id: 'wind', name: 'Black wind', desc: 'Sideways snow. Shallow Bores catch 1.5 times as much.', line: 'A BLACK WIND. THE SHAFTS INHALE IT.' },
  { id: 'fog', name: 'Warm fog', desc: 'Warm flakes come twice as often.', line: 'WARM FOG. IT SMELLS LIKE A KITCHEN THAT NO LONGER EXISTS.' },
  { id: 'thunder', name: 'Dry thunder', desc: 'Lightning with no sound. All ash x1.1, and echoes come twice as fast.', line: 'DRY THUNDER. THE FLASHES ARE THE ONLY TIME YOU SEE THE TOWN.' },
];

// ---- the station: fixtures you build with ash, each adding comfort ----

export type FixtureId = 'kettle' | 'cot' | 'lamp' | 'radio' | 'rug' | 'stove' | 'photo' | 'curtains'
  | 'shelf' | 'clock' | 'heater' | 'tank' | 'chair' | 'wallpaper' | 'phone' | 'door';

export interface FixtureDef { id: FixtureId; name: string; desc: string; cost: number; comfort: number; full: number } // levels past `full` still build, for a quarter of the comfort

export const FIXTURE_GROWTH = 2.5;

export const FIXTURES: FixtureDef[] = [
  { id: 'kettle', name: 'Kettle', desc: 'It boils. It sings a little.', cost: 300, comfort: 1, full: 5 },
  { id: 'cot', name: 'Cot', desc: 'Somewhere to not sleep.', cost: 3000, comfort: 2, full: 5 },
  { id: 'lamp', name: 'Oil lamp', desc: 'A circle of light with you in it.', cost: 4e4, comfort: 3, full: 5 },
  { id: 'radio', name: 'Kitchen radio', desc: 'Plays music from a station that closed in 1974.', cost: 6e5, comfort: 4, full: 5 },
  { id: 'rug', name: 'Rug', desc: 'Covers the stain. The stain is warm.', cost: 1e7, comfort: 6, full: 5 },
  { id: 'stove', name: 'Pot-belly stove', desc: 'Burns ash. Gives off a heat that remembers you.', cost: 2e8, comfort: 8, full: 5 },
  { id: 'photo', name: 'Photograph', desc: 'Of a family. Of no one. It depends when you look.', cost: 5e9, comfort: 12, full: 5 },
  { id: 'curtains', name: 'Curtains', desc: 'For the window that faces the wall.', cost: 1e11, comfort: 18, full: 5 },
  { id: 'shelf', name: 'Bookshelf', desc: 'Every book is the same book. You have not finished it.', cost: 3e12, comfort: 24, full: 5 },
  { id: 'clock', name: 'Wall clock', desc: 'Runs backwards, but keeps very good time.', cost: 1e14, comfort: 32, full: 5 },
  { id: 'heater', name: 'Bar heater', desc: 'Two orange bars. The third one is for later.', cost: 5e15, comfort: 42, full: 5 },
  { id: 'tank', name: 'Fish tank', desc: 'No fish. The water moves anyway.', cost: 3e17, comfort: 55, full: 5 },
  { id: 'chair', name: 'Second chair', desc: 'For company. Someone sits in it when you look away.', cost: 2e19, comfort: 70, full: 5 },
  { id: 'wallpaper', name: 'Wallpaper', desc: 'A pattern of small houses. One light is on in each.', cost: 2e21, comfort: 90, full: 5 },
  { id: 'phone', name: 'Rotary phone', desc: 'A second line. It only rings during snow.', cost: 3e23, comfort: 115, full: 5 },
  { id: 'door', name: 'A door', desc: 'Where there was wall. It is shut. It is warm on the other side.', cost: 5e25, comfort: 150, full: 5 },
];

/** Comfort perks, in order. Shown in the station so there is always a next one to reach for. */
export const COMFORT_PERKS = [
  { at: 10, desc: 'Resonance fades half as fast.' },
  { at: 30, desc: 'Warm flakes linger 5 seconds longer, and the egg is never sad.' },
  { at: 60, desc: 'Rust from sirens x1.5.' },
  { at: 120, desc: 'Away time counts double.' },
  { at: 300, desc: 'Eggs warm twice as fast.' },
  { at: 800, desc: 'Every warm flake leaves one more ember.' },
  { at: 2000, desc: 'Rare flakes turn up twice as often.' },
];

// ---- the kiln: embers from caught warm flakes ----

export type KilnId = 'bellows' | 'crucible' | 'kindling' | 'tithe' | 'bloom';

export interface KilnDef { id: KilnId; name: string; desc: string; cost: number }

export const KILN: KilnDef[] = [
  { id: 'bellows', name: 'Bellows', desc: 'Warm flakes come 25% more often.', cost: 3 },
  { id: 'crucible', name: 'Crucible', desc: 'Warm flakes are worth twice as much.', cost: 8 },
  { id: 'kindling', name: 'Kindling', desc: 'Catching a warm flake doubles all ash for 15 seconds.', cost: 15 },
  { id: 'tithe', name: 'Ember tithe', desc: 'Each ember you keep adds 1% to all ash, up to +50%.', cost: 40 },
  { id: 'bloom', name: 'Glass bloom', desc: 'Each warm flake leaves 2 embers.', cost: 100 },
];

// ---- the dial: echoes from resonance, spent to find frequencies; one is tuned at a time ----

export type FreqId = 'numbers' | 'hum' | 'forecast' | 'lullaby' | 'dead';

export interface FreqDef { id: FreqId; band: string; name: string; desc: string; cost: number }

export const FREQS: FreqDef[] = [
  { id: 'numbers', band: '88.0', name: 'Numbers station', desc: 'Listen catches twice as much.', cost: 10 },
  { id: 'hum', band: '91.4', name: 'The hum', desc: 'Shallow Bores catch twice as much.', cost: 40 },
  { id: 'forecast', band: '103.9', name: 'Weather service', desc: 'Weather effects are twice as strong.', cost: 150 },
  { id: 'lullaby', band: '77.7', name: 'Lullaby', desc: 'Comfort counts double, and the egg cheers up faster.', cost: 500 },
  { id: 'dead', band: '0.0', name: 'Dead air', desc: 'Rust from sirens x2, and sirens last 15 seconds longer.', cost: 2000 },
];

// ---- the nursery: wild eggs, the brood, breeding ----

export type NurseryUpId = 'lamp' | 'straw' | 'trough' | 'nest' | 'wing';

export interface NurseryUpDef { id: NurseryUpId; name: string; desc: string; cost: number; growth: number; max: number }

export const NURSERY_UPS: NurseryUpDef[] = [
  { id: 'lamp', name: 'Heat lamp', desc: 'Eggs warm 50% faster per level.', cost: 2e4, growth: 5, max: 5 },
  { id: 'straw', name: 'Straw from nowhere', desc: 'The brood grows 50% faster per level.', cost: 5e4, growth: 5, max: 5 },
  { id: 'trough', name: 'Feeding trough', desc: 'Feeding fills 20 more, and hunger falls 15% slower, per level.', cost: 3e4, growth: 5, max: 5 },
  { id: 'nest', name: 'Bigger nest', desc: 'Room for one more egg and one more creature per level.', cost: 1e5, growth: 8, max: 5 },
  { id: 'wing', name: 'Brood wing', desc: 'Another room off the nursery: space for 8 more creatures per level, up to 255.', cost: 2e6, growth: 2.6, max: 31 },
];

export const NEST_EGGS = 2; // egg slots before upgrades
export const NEST_BROOD = 3; // creature slots before upgrades
export const BREED_STAGE = 3; // a creature must reach this stage to breed
export const BREED_COOLDOWN = 300;

// ---- the egg ----

export const EGG_FOUND_AT = 1e5; // ash caught this run
export const EGG_STAGES = [
  { name: 'Egg', desc: 'Found in the ash at the bottom of shaft 1. It is warm. It wants to be warmer.' },
  { name: 'Hatchling', desc: 'Small. Soft. Too many joints. It follows your voice.' },
  { name: 'Nymph', desc: 'It has started to hum along with the receiver.' },
  { name: 'Thing', desc: 'It sleeps curled around the stove. Its shadow does not.' },
  { name: 'Larger Thing', desc: 'It is the size of the room now, somehow without being bigger.' },
];
/** Growth needed to leave each creature stage. */
export const EGG_GROWTH = [300, 1500, 6000, 20000];
export const EGG_LINES = {
  found: 'SOMETHING IN THE ASH AT THE BOTTOM OF SHAFT 1. IT IS WARM. IT IS AN EGG.',
  wild: 'ANOTHER EGG IN THE ASH. THIS ONE IS A DIFFERENT COLOUR. IT WAS NOT THERE A MOMENT AGO.',
  laid: 'TWO OF THEM CURL AROUND EACH OTHER. IN THE MORNING THERE IS AN EGG.',
  species: 'A NEW KIND OF THING. YOU WRITE ITS NAME DOWN BEFORE YOU FORGET HOW TO SAY IT.',
  hatch: 'THE EGG HATCHES. IT LOOKS AT YOU AS IF IT HAS BEEN WAITING. IT HAS.',
  grow: 'IT HAS GROWN. IT SITS CLOSER TO YOU THAN IT USED TO.',
};

// ---- warm flake rarities: almost always the common orange one ----

export interface RarityDef { name: string; chance: number; mult: number; embers: number; ttl: number; color: string; line: string }

/** Rolled rarest first; whatever is left over is common. */
export const RARITIES: RarityDef[] = [
  { name: 'Warm', chance: 1, mult: 1, embers: 1, ttl: 0, color: '#ffb46b', line: '' },
  { name: 'Pale', chance: 1 / 40, mult: 8, embers: 3, ttl: 3, color: '#a6e4ff',
    line: 'A PALE FLAKE. COLD TO LOOK AT, WARM IN THE HAND. IT REMEMBERS A WINTER THAT HAS NOT HAPPENED.' },
  { name: 'Verdant', chance: 1 / 250, mult: 40, embers: 8, ttl: 5, color: '#5dff9a',
    line: 'A GREEN FLAKE. SOMETHING WAS GROWING IN IT. IT STILL IS.' },
  { name: 'Hyperstitional', chance: 1 / 1500, mult: 250, embers: 25, ttl: 7, color: '#c46bff',
    line: 'A FLAKE THAT WAS NOT THERE UNTIL YOU BELIEVED IN IT. NOW IT ALWAYS WAS.' },
  { name: 'Black sun', chance: 1 / 10000, mult: 2000, embers: 100, ttl: 10, color: '#ffd23b',
    line: 'A BLACK SUN. THE LIGHT BENDS AROUND IT. THE SNOW STOPS TO WATCH.' },
];
