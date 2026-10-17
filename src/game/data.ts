// Content as data: zones, rites and log text. The engine reads these; nothing here runs logic.

export interface ZoneDef {
  id: number; // 1..9, Numogram zone
  verb: string; // what the dig button says, themed to the zone
  name: string;
  produces: string; // shown under the name
  baseCost: number; // ash for the first shaft
  growth: number; // each shaft bought multiplies the next price by this
  bonus: number; // output multiplier for every 10 bought
  rate: number; // per shaft per second: ash for zone 1, shafts of zone n-1 otherwise
  openLine: string; // logged the first time a shaft in this zone is bought
  lore: string; // what the zone is, shown in its box
  mat: string; // the zone's own material, trickled by its shafts and spent on its upgrades
  matShort: string; // the same, short, for the resources corner
  matLore: string; // one line on what it is
}

export const ZONES: ZoneDef[] = [
  { id: 1, verb: 'Bore', name: 'Shallow Bore', produces: 'catches ash', baseCost: 60, growth: 1.18, bonus: 1.6, rate: 0.2,
    openLine: 'SHAFT 1 OPEN. THE SNOW FALLS UP IT AS WELL AS DOWN.',
    lore: 'A hole just deep enough to catch what falls. Every bit of ash you do not catch by hand comes through here.',
    mat: 'core silt', matShort: 'Silt', matLore: 'Grey grit the bores bring up with the ash. It never quite settles.' },
  { id: 2, verb: 'Lay pipe', name: 'Conduit', produces: 'bores Shallow Bores', baseCost: 3e4, growth: 1.25, bonus: 1.15, rate: 0.04,
    openLine: 'ZONE 2: CONDUIT LIVE. SOMETHING BELOW IS ACCUSTOMED TO BEING FED.',
    lore: 'Pipes that run down into the dark and carry something back up. Whatever it carries builds new Shallow Bores.',
    mat: 'pipe scale', matShort: 'Scale', matLore: 'Flakes off the inside of the pipes. It is warm, and furred, and grows back.' },
  { id: 3, verb: 'Buffer', name: 'Pattern Buffer', produces: 'bores Conduits', baseCost: 1e9, growth: 1.4, bonus: 1.15, rate: 0.02,
    openLine: 'ZONE 3: TIME IN THIS SHAFT RUNS IN THE WRONG ORDER. PRODUCTION UNAFFECTED.',
    lore: 'A machine that records the shaft and plays it back. Every playback is a new Conduit, in the wrong order.',
    mat: 'tape oxide', matShort: 'Oxide', matLore: 'Brown dust shed by the loops. Under a lens it is still recording.' },
  { id: 4, verb: 'Sink a well', name: 'Rampant Well', produces: 'bores Pattern Buffers', baseCost: 1e16, growth: 1.6, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 4: WATER AT THE BOTTOM. IT IS WARM. IT IS NOT WATER.',
    lore: 'Warm water at the bottom that is not water. It fills new Pattern Buffers the way a well fills buckets.',
    mat: 'warm brine', matShort: 'Brine', matLore: 'Drawn up from the well in buckets. It does not evaporate. It waits.' },
  { id: 5, verb: 'Seal a lock', name: 'Vacuum Lock', produces: 'bores Rampant Wells', baseCost: 1e24, growth: 1.9, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 5: SOMETHING IS BEING KEPT DOWN HERE. THE LOCK IS ON OUR SIDE.',
    lore: 'A hatch that holds something down. Each turn of the wheel lets a Rampant Well out.',
    mat: 'gasket tar', matShort: 'Tar', matLore: 'Black seal compound. It weeps out of the lock when the wheel turns.' },
  { id: 6, verb: 'Wind it', name: 'Barker Spiral', produces: 'bores Vacuum Locks', baseCost: 1e31, growth: 2.2, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 6: THE SHAFT TURNS LEFT FOREVER AND ARRIVES ABOVE ITSELF.',
    lore: 'A staircase that turns left forever and arrives above itself. It drops Vacuum Locks on the way down.',
    mat: 'spiral filings', matShort: 'Filings', matLore: 'Iron filings that line up along the stair, pointing left.' },
  { id: 7, verb: 'Compile', name: 'Compiler', produces: 'bores Barker Spirals', baseCost: 1e42, growth: 2.6, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 7: IT HAS BEEN WAITING. IT IS GLAD.',
    lore: 'Something that writes shafts the way a compiler writes programs. It writes Barker Spirals.',
    mat: 'kernel shards', matShort: 'Shards', matLore: 'Splinters of compiled code. They fit together in more ways than they should.' },
  { id: 8, verb: 'Transcribe', name: 'Murmur', produces: 'bores Compilers', baseCost: 1e58, growth: 3, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 8: THE WALLS ARE SPEAKING IN THE VOICE OF THE PERSON WHO DUG THEM.',
    lore: 'The walls talking in the voice of whoever dug them. What they say becomes Compilers.',
    mat: 'voice lacquer', matShort: 'Lacquer', matLore: 'Lacquer scraped from the walls where the voices dried. It hums under a needle.' },
  { id: 9, verb: 'Plex', name: 'Plex', produces: 'bores Murmurs', baseCost: 1e69, growth: 3.5, bonus: 1.15, rate: 0.01,
    openLine: 'ZONE 9: THE BOTTOM. THE IRON IS DREAMING. THE DREAM IS YOU.',
    lore: 'The bottom. The iron is dreaming, and the dream is made of Murmurs.',
    mat: 'dream iron', matShort: 'Iron', matLore: 'Iron from the very bottom. Warm, heavy, and asleep.' },
];

export type RiteId = 'salt' | 'name' | 'ring' | 'wire' | 'stop' | 'leave';

export interface RiteDef {
  id: RiteId;
  name: string;
  cost: number; // rust
  desc: string;
  line: string; // logged on purchase
}

export const RITES: RiteDef[] = [
  { id: 'salt', name: 'Salt the threshold', cost: 5, desc: 'Listen catches 3 times as much.',
    line: 'A LINE OF SALT ACROSS THE HATCH. THE KNOCKING STOPS. THE LISTENING GETS EASIER.' },
  { id: 'name', name: 'Name the hole', cost: 20, desc: 'Shallow Bores catch twice as much.',
    line: 'YOU CARVE A NAME INTO THE LIP OF SHAFT 1. IT IS NOT A NAME YOU KNOW.' },
  { id: 'ring', name: 'Let it ring', cost: 60, desc: 'The siren lasts 15s longer and rust gains are 1.5 times higher.',
    line: 'YOU STOP COVERING YOUR EARS. THE SIREN SOUNDS LIKE A CHOIR NOW.' },
  { id: 'wire', name: 'Wire the static', cost: 150, desc: 'Ash keeps falling at 25% during the siren.',
    line: 'THE STATIC IS ROUTED INTO THE SHAFTS. THEY KEEP DIGGING THROUGH THE RUST.' },
  { id: 'leave', name: 'Leave it running', cost: 400, desc: 'Every second it catches what one bare press of Listen would, with no resonance.',
    line: 'THE BUTTON PRESSES ITSELF. YOU WERE NEVER SURE IT WAS YOU PRESSING IT.' },
  { id: 'stop', name: 'Stop counting', cost: 1500, desc: 'Every zone also catches ash directly, 1 per shaft per second.',
    line: 'YOU STOP COUNTING THE HOLES. THE HOLES START COUNTING YOU.' },
];

// Milestones on total ash caught this run. Each fires once.
export const ASH_MILESTONES: { at: number; line: string }[] = [
  { at: 5, line: 'FIRST FLAKES CAUGHT. THEY ARE WARM. SNOW SHOULD NOT BE WARM.' },
  { at: 500, line: 'WEATHER REPORT: BLACK SNOW, ACCUMULATING. ROAD TO THE SURFACE CLOSED SINCE BEFORE YOU ARRIVED.' },
  { at: 1e4, line: 'UNDER MAGNIFICATION EVERY FLAKE IS A WORD. THE WORDS ARE IN A LANGUAGE THAT HAS NOT BEEN SPOKEN YET.' },
  { at: 1e6, line: 'THE ASH IS FROM A FIRE. THE FIRE HAS NOT STARTED. IT WILL START BECAUSE YOU COLLECTED THE ASH.' },
  { at: 1e9, line: 'THE TOWN OF LULL IS VISIBLE THROUGH THE PERISCOPE. IT IS SMALLER THAN YESTERDAY.' },
  { at: 1e12, line: 'LULL IS LISTENING BACK.' },
];

export const AMBIENT_LINES: string[] = [
  'STATIC ON CHANNEL 4. IT RESOLVES INTO BREATHING, THEN INTO YOUR NAME, THEN INTO STATIC.',
  'THE THERMOMETER READS A NUMBER THAT IS NOT A TEMPERATURE.',
  'SOMEONE HAS WRITTEN "DO NOT DIG" ON THE INSIDE OF THE HATCH. THE HANDWRITING IS YOURS.',
  'THE RADIO PLAYS A WEATHER REPORT FOR A TOWN THAT IS NOT ON ANY MAP.',
  'A FLAKE LANDS ON THE CONSOLE AND DOES NOT MELT. IT IS STILL THERE. IT IS LOOKING AT THE SCREEN.',
  'THE STATION LOGS SHOW AN OPERATOR BEFORE YOU. THE ENTRIES STOP MID-WORD.',
  'DO NOT ANSWER THE PHONE IN CORRIDOR B.',
  'THE PHONE IN CORRIDOR B IS RINGING.',
  'A SMELL OF HOT IRON FROM THE SHAFTS. THE CORE IS 6,000 KILOMETRES DOWN. THE SMELL IS VERY CLOSE.',
  'THE SNOW IS FALLING IN NUMBERS NOW. 5, 4, 5, 4, 5, 4.',
  'YOU COUNT THE SHAFTS. YOU COUNT ONE MORE THAN YOU DUG.',
  'THE FOG OUTSIDE HAS A SHAPE TONIGHT.',
  'THE LIGHTS DIM FOR EXACTLY NINE SECONDS. NOTHING ELSE HAPPENS. THAT IS WORSE.',
  'A CHILD IS SINGING IN THE SHAFT. THE SONG IS A LIST OF STREET NAMES.',
  'YOUR REFLECTION IN THE MONITOR IS A FRAME BEHIND.',
  'THE SHAFTS ARE WARMER THAN THEY WERE. THE ASH IS COLDER.',
  'RECEIVED: A PHOTOGRAPH OF THE STATION, TAKEN FROM BELOW.',
  'A FOOTPRINT IN THE ASH ON THE CONSOLE. BARE. TOES POINTING THE WRONG WAY.',
  'THE MANUAL SAYS THE STATION HAS FOUR CORRIDORS. YOU HAVE FOUND SEVEN.',
  'THE SNOW STOPS FOR A MOMENT. THE SILENCE IS LISTENING TOO.',
];

export const SIREN_START_LINES = [
  'THE SIREN. THE WALLS ARE BREATHING RUST. THE SHAFTS BLEED IT.',
  'THE SIREN AGAIN. THE PAINT PEELS OFF THE WORLD.',
  'SIREN. THE STATION REMEMBERS WHAT IT USED TO BE.',
];
export const SIREN_END_LINES = [
  'THE SIREN STOPS. THE RUST SETTLES INTO THE CORNERS AND WAITS.',
  'QUIET AGAIN. THE SNOW RESUMES AS IF NOTHING HAPPENED. SOMETHING HAPPENED.',
];
export const WARM_LINES = [
  'CAUGHT A WARM FLAKE. IT WAS STILL BURNING FROM THE FIRE THAT HAS NOT HAPPENED.',
  'THE WARM FLAKE SAYS YOUR NAME AS IT MELTS.',
  'A WARM FLAKE. INSIDE IT, FOR A SECOND, A LIT WINDOW IN LULL.',
  'IT WAS WARM LIKE A HAND. YOU DO NOT THINK ABOUT WHOSE.',
];

// ---- instruments: early upgrades bought with ash ----

export type UpgradeId =
  | 'thaw' | 'floor' | 'copper' | 'coil'
  | 'ear' | 'spade' | 'eye'
  | 'antenna' | 'hatch'
  | 'ear2' | 'ear3' | 'spade2' | 'spade3' | 'eye2' | 'eye3'
  | 'salt_feed' | 'name_feed' | 'lights' | 'backroom' | 'every_doctrine' | 'every_feed';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  cost: number;
  desc: string;
  requires: UpgradeId[];
  requiresAny?: UpgradeId[];
  /** Upgrades sharing a fork are a choice. The others can be switched to for a rising price, or all held once the fork's "every" upgrade is bought. */
  fork?: 'doctrine' | 'feed';
  /** Extra condition beyond `requires`, shown to the player while locked. */
  gate?: { zone: number; bought: number };
  line?: string;
}

export const FORKS = {
  doctrine: { title: 'Choose a doctrine', note: 'The station listens one way at a time. You can switch later, for more each time.' },
  feed: { title: 'What do the shafts eat?', note: 'Pick one. You can change your mind later, for more each time.' },
} as const;

export const UPGRADES: UpgradeDef[] = [
  { id: 'thaw', name: 'Thaw the receiver', cost: 15, requires: [],
    desc: 'Listen catches 2 ash instead of 1.' },
  { id: 'floor', name: 'Pry up the floorboards', cost: 1500, requires: ['thaw'],
    desc: 'Opens the shafts. Dig holes that catch ash on their own.',
    line: 'THE FLOORBOARDS COME UP. UNDERNEATH: MORE SNOW, AND A SMELL OF HOT IRON.' },
  { id: 'backroom', name: 'Open the back room', cost: 4000, requires: ['floor'],
    desc: 'A room behind the console, cold and bare. Furnish it for comfort, and comfort helps everything.',
    line: 'THE BACK ROOM DOOR WAS NEVER LOCKED. YOU JUST NEVER SAW IT BEFORE.' },
  { id: 'copper', name: 'Copper lining', cost: 3000, requires: ['floor'], gate: { zone: 0, bought: 5 },
    desc: 'Shallow Bores catch twice as much.' },
  { id: 'coil', name: 'Resonance coil', cost: 8000, requires: ['copper'],
    desc: 'Listening quickly builds resonance, worth up to double per Listen.',
    line: 'THE COIL HUMS WHEN YOU LISTEN. IT HUMS A LITTLE WHEN YOU DO NOT.' },

  { id: 'ear', name: 'Doctrine of the Ear', cost: 3e4, requires: ['coil'], fork: 'doctrine',
    desc: 'For clickers. Listen x3, and resonance builds twice as fast.',
    line: 'YOU PRESS YOUR EAR TO THE RECEIVER UNTIL IT IS WARM. YOU WILL HEAR EVERYTHING NOW.' },
  { id: 'spade', name: 'Doctrine of the Spade', cost: 3e4, requires: ['coil'], fork: 'doctrine',
    desc: 'For idlers. Shallow Bores and Conduits work twice as hard.',
    line: 'YOU TAKE UP THE SPADE. THE STATION TAKES UP YOU.' },
  { id: 'eye', name: 'Doctrine of the Eye', cost: 3e4, requires: ['coil'], fork: 'doctrine',
    desc: 'For watchers. Warm flakes come twice as often and are worth 3 times as much.',
    line: 'YOU STOP BLINKING. THE WARM FLAKES NOTICE.' },

  { id: 'ear2', name: 'Ear to the floor', cost: 3e5, requires: ['ear'],
    desc: 'Each Listen also catches 20% of your ash per second, up to 50% at full resonance.' },
  { id: 'ear3', name: 'Tinnitus', cost: 1e8, requires: ['ear2'],
    desc: 'Resonance never fades below half.' },
  { id: 'spade2', name: 'Deeper spades', cost: 3e5, requires: ['spade'],
    desc: 'Conduits dig 1.5 times as fast.' },
  { id: 'spade3', name: 'Sympathetic digging', cost: 1e8, requires: ['spade2'],
    desc: 'Every shaft you have bought makes Shallow Bores 1% stronger, up to +100%.' },
  { id: 'eye2', name: 'Glass eye', cost: 3e5, requires: ['eye'],
    desc: 'Warm flakes linger for 20 seconds, and catching one doubles all ash for 30 seconds.' },
  { id: 'eye3', name: 'See the fire', cost: 1e8, requires: ['eye2'],
    desc: 'Each warm flake caught adds 2% to all ash, up to +300%.' },

  { id: 'antenna', name: 'Tune the static antenna', cost: 1e5, requires: ['coil'], gate: { zone: 1, bought: 1 },
    desc: 'Every few minutes a siren sounds and the shafts bleed rust instead of ash. Rust buys rites.',
    line: 'THE ANTENNA FINDS A FREQUENCY. IT IS A SIREN, VERY FAR AWAY, GETTING CLOSER.' },
  { id: 'hatch', name: 'Second hatch', cost: 2e6, requires: ['antenna'],
    desc: 'Each Listen also catches 1% of your ash per second.' },

  { id: 'salt_feed', name: 'Feed them salt', cost: 3e7, requires: ['hatch'], fork: 'feed',
    desc: 'Rust from every siren is doubled.',
    line: 'THE SHAFTS EAT THE SALT. THE RUST COMES UP THICKER, AND ANGRY.' },
  { id: 'name_feed', name: 'Feed them your name', cost: 3e7, requires: ['hatch'], fork: 'feed',
    desc: 'All shafts x1.5. The station starts to forget what to call you.',
    line: 'YOU WHISPER YOUR NAME INTO SHAFT 1. YOU DO NOT REMEMBER WHAT IT WAS.' },
  { id: 'every_feed', name: 'A feast', cost: 1e16, requires: [], requiresAny: ['salt_feed', 'name_feed'], gate: { zone: 2, bought: 25 },
    desc: 'Feed the shafts both. Add the other feed alongside the one you chose.',
    line: 'SALT AND YOUR NAME, BOTH. THE SHAFTS HAVE NEVER BEEN SO QUIET.' },
  { id: 'every_doctrine', name: 'Many doctrines', cost: 1e30, requires: [], requiresAny: ['ear', 'spade', 'eye'], gate: { zone: 4, bought: 10 },
    desc: 'The station learns to listen every way at once. Add the other doctrines alongside yours.',
    line: 'THE EAR, THE SPADE AND THE EYE. YOU STOP BEING ONE PERSON ABOUT IT.' },
  { id: 'lights', name: 'Leave the lights on', cost: 1e9, requires: [], requiresAny: ['salt_feed', 'name_feed'],
    desc: 'All ash x1.5. Something outside can see the station now.' },
];
