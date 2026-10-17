// The Scriptorium: the zone 8 challenge. The walls of the Murmur gallery talk in the voices of the people who
// dug them, written in a script that is different for every save. You transcribe it (a cryptogram), collect
// the voices and seat them as foremen, hush the murmur to bank silence, and answer what the walls ask.
// Pure functions over GameState, like the engine.
import type { GameState } from '../state';
import { log } from '../engine';
import type { ChallengeModule, MultTarget } from './types';

export type Trait = 'patient' | 'greedy' | 'curious';
export const TRAITS: Trait[] = ['patient', 'greedy', 'curious'];

export interface Voice { id: number; name: string; era: string; spec: number; q: number }

export interface ScriptoriumState {
  seed: number;
  stratum: number; // which hand the walls are written in; a new key every time one is finished
  guess: string[]; // 26 glyphs of the current stratum: the letter assigned, or ''
  conf: number[]; // glyphs confirmed (a whole word they sit in resolved)
  correct: number; // glyphs in the current stratum whose guess is right, kept for mult
  past: number; // glyphs confirmed in finished strata
  heard: number; // words of the current stratum heard so far (fractional)
  done: number[]; // sentence slots of the current stratum solved
  sentences: number; // sentences solved, all strata
  lore: number[]; // pool indices of the sentences ever solved
  hints: number; // banked hints (fractional); past HINT_CAP they write themselves in
  loud: number;
  silence: number;
  hushes: number;
  ups: Record<string, number>;
  voices: Voice[];
  vid: number; // voices heard ever, also the next id
  vProg: number;
  seats: number[]; // voice id per zone 0..8, -1 when empty
  tally: number;
  queue: number[]; // waiting questions, by index into QUESTIONS
  asked: number;
  qProg: number;
  prof: Record<Trait, number>;
}

// ---------------------------------------------------------------- tuning

export const PER_STRATUM = 5; // sentences per hand
export const WORD_SECS = 200; // a word heard every 200 s
export const HINT_SECS = 720; // a hint every 12 min
export const HINT_CAP = 3;
export const VOICE_SECS = 1080; // a voice every 18 min
export const QUESTION_SECS = 1500; // a question every 25 min
export const QUEUE_CAP = 3;
export const ROSTER_BASE = 6;
export const LOUD_CAP = 100;
export const LOUD_TAU = 1200; // loudness closes 63% of the gap to its cap every 20 min
const GLYPH_K = 0.3;
const FOREMAN_K = 0.06;
const WAX_K = 0.0001; // silence per second per level per point of loudness

export const UPGRADES: { id: string; name: string; desc: string; base: number; growth: number }[] = [
  { id: 'wide', name: 'Widen the gallery', desc: 'The murmur can grow 25% louder.', base: 60, growth: 2 },
  { id: 'ear', name: 'Ear to the stone', desc: 'Words, hints and voices come 25% sooner.', base: 80, growth: 1.9 },
  { id: 'wax', name: 'Wax in the horn', desc: 'Silence gathers by itself while it is loud.', base: 100, growth: 2 },
  { id: 'roster', name: 'Another chair', desc: 'Room for one more voice.', base: 50, growth: 1.7 },
  { id: 'lamp', name: 'Lamp oil', desc: 'Foremen are 10% stronger.', base: 120, growth: 2 },
];
export const upLevel = (s: GameState, id: string) => st(s).ups[id] ?? 0;
export const upCost = (s: GameState, id: string) => {
  const u = UPGRADES.find(x => x.id === id)!;
  return Math.round(u.base * Math.pow(u.growth, upLevel(s, id)));
};

// ---------------------------------------------------------------- what the walls say

export const POOL = [
  'the lamp was lit when we came down',
  'we dug toward the singing',
  'my name is still in the rock',
  'do not answer the third knock',
  'the snow fell up the shaft all winter',
  'i left my hands at the bottom',
  'there is a room below the last room',
  'the iron dreams of being dug',
  'we counted the men twice and got more',
  'the walls keep what you say',
  'it asked for my voice and i gave it',
  'listen and the dark listens back',
  'every shift came up one short',
  'the foreman never had a face',
  'we were paid in ash and glad of it',
  'the water at the bottom is warm',
  'i hear my mother in the seam',
  'tell them the lift goes further down',
  'the gramophone plays what has not happened',
  'we buried the lantern and it kept burning',
  'nobody digs alone down here',
  'the cold is a kind of patience',
  'my brother is the ninth wall',
  'the pit remembers every hand',
  'we wrote it down so it would stop',
  'something below is learning our names',
  'the dark has a grain like wood',
  'keep the bell quiet after midnight',
  'we broke through into somebody else',
  'the quiet is the loudest part',
  'i am still on the night shift',
  'the ore is warm and it is breathing',
  'we sang so we would know who was missing',
  'the rope came back up without me',
  'there are more steps going down than up',
  'the station hums when it is lonely',
  'you are reading this in my voice',
  'the black snow knows where you sleep',
];

export const QUESTIONS: { q: string; a: { text: string; t: Trait }[] }[] = [
  { q: 'What did you bring down with you?', a: [{ text: 'Nothing. I can wait.', t: 'patient' }, { text: 'A sack, for what I find.', t: 'greedy' }, { text: 'A lamp, to read you by.', t: 'curious' }] },
  { q: 'Would you dig past the bottom?', a: [{ text: 'If it pays.', t: 'greedy' }, { text: 'To see what is under it.', t: 'curious' }, { text: 'Not yet.', t: 'patient' }] },
  { q: 'Someone is knocking. Do you answer?', a: [{ text: 'I ask who it is.', t: 'curious' }, { text: 'I let them knock.', t: 'patient' }, { text: 'I charge them for the door.', t: 'greedy' }] },
  { q: 'How long is a shift?', a: [{ text: 'As long as it takes.', t: 'patient' }, { text: 'Long enough to fill the cart.', t: 'greedy' }, { text: 'Who is counting?', t: 'curious' }] },
  { q: 'We found a seam that sings. What do we do?', a: [{ text: 'Sell it by the ton.', t: 'greedy' }, { text: 'Leave it alone a while.', t: 'patient' }, { text: 'Learn the song.', t: 'curious' }] },
  { q: 'Do you remember your first day down here?', a: [{ text: 'I remember all of them.', t: 'patient' }, { text: 'Only what I took up.', t: 'greedy' }, { text: 'Was it mine?', t: 'curious' }] },
  { q: 'The lift has stopped between floors.', a: [{ text: 'I open the hatch.', t: 'curious' }, { text: 'I sit and wait.', t: 'patient' }, { text: 'I strip the cables.', t: 'greedy' }] },
  { q: 'What should we call you?', a: [{ text: 'Whatever you like.', t: 'patient' }, { text: 'Tell me yours first.', t: 'curious' }, { text: 'The one who owns this.', t: 'greedy' }] },
  { q: 'There is ash in the water. Drink it?', a: [{ text: 'Bottle it.', t: 'greedy' }, { text: 'Let it settle.', t: 'patient' }, { text: 'Taste it.', t: 'curious' }] },
  { q: 'The snow is falling upward again.', a: [{ text: 'Where does it go?', t: 'curious' }, { text: 'Catch it.', t: 'greedy' }, { text: 'It will come back down.', t: 'patient' }] },
  { q: 'One of us is extra. Which one?', a: [{ text: 'Count again tomorrow.', t: 'patient' }, { text: 'Put them to work.', t: 'greedy' }, { text: 'Ask them.', t: 'curious' }] },
  { q: 'Are you listening, or are we?', a: [{ text: 'Both of us.', t: 'curious' }, { text: 'Whoever is paid for it.', t: 'greedy' }, { text: 'Take your time.', t: 'patient' }] },
];

export const TRAIT_TEXT: Record<Trait, string> = {
  patient: 'comfort, rust, and how fast the walls give',
  greedy: 'all ash',
  curious: 'echoes and Listen',
};

const FIRST = ['Ada', 'Bram', 'Cyril', 'Dora', 'Edwin', 'Fenna', 'Gil', 'Hester', 'Ivo', 'Jory', 'Kit', 'Lenna', 'Mabe', 'Noll', 'Orrin', 'Pell', 'Rhoda', 'Silas', 'Tamsin', 'Ulla', 'Wat', 'Zillah'];
const LAST = ['Kell', 'Reave', 'Thorne', 'Gannet', 'Prowse', 'Hollis', 'Marrow', 'Penhale', 'Stane', 'Coyle', 'Ashby', 'Vosper', 'Trask', 'Odell', 'Rook', 'Pascoe', 'Lumb', 'Quill'];
const ERAS = ['the flood year', 'before the lamps', 'the long strike', 'the first winter', 'after the bell', 'the shift that did not end', 'the year of two moons'];

// ---------------------------------------------------------------- seeded bits

export const hashN = (...ns: number[]) => {
  let h = 2166136261;
  for (const n of ns) { h = Math.imul(h ^ (n | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return h >>> 0;
};
export function mulberry(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(n: number, seed: number) {
  const r = mulberry(seed), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const GW = 5, GH = 7; // glyph bitmap size

/** Twenty-six distinct little marks: a spine, a few bars, a dot or two. */
function makeShapes(seed: number): boolean[][] {
  const r = mulberry(seed), seen = new Set<string>(), out: boolean[][] = [];
  while (out.length < 26) {
    const b: boolean[] = Array(GW * GH).fill(false);
    const set = (x: number, y: number) => { if (x >= 0 && x < GW && y >= 0 && y < GH) b[y * GW + x] = true; };
    const sx = [0, 2, 4][Math.floor(r() * 3)], y0 = Math.floor(r() * 3), y1 = 4 + Math.floor(r() * 3);
    for (let y = y0; y <= y1; y++) set(sx, y);
    const bars = 1 + Math.floor(r() * 3);
    for (let k = 0; k < bars; k++) {
      const y = Math.floor(r() * GH), a = Math.floor(r() * 3), len = 2 + Math.floor(r() * 3);
      for (let x = a; x < a + len; x++) set(x, y);
    }
    if (r() < 0.5) { const x = Math.floor(r() * GW); for (let y = Math.floor(r() * 3); y < GH; y += 2) set(x, y); }
    if (r() < 0.6) set(Math.floor(r() * GW), Math.floor(r() * GH));
    const key = b.map(v => (v ? 1 : 0)).join('');
    if (b.filter(Boolean).length < 7 || seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export interface Layout {
  pool: number[]; // POOL indices of this stratum's sentences
  words: { glyphs: number[]; sent: number }[];
  sentWords: number[][]; // word indices per sentence slot
  letterOf: number[]; // glyph -> letter index
  glyphOf: number[]; // letter index -> glyph
  shapes: boolean[][];
}

const cache = new Map<string, Layout>();
/** Everything fixed about one stratum of one save: its sentences, its key and its glyph shapes. */
export function layout(seed: number, stratum: number): Layout {
  const k = `${seed}:${stratum}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const N = POOL.length, pool: number[] = [];
  for (let j = 0; j < PER_STRATUM; j++) {
    const n = stratum * PER_STRATUM + j;
    pool.push(shuffled(N, hashN(seed, 1, Math.floor(n / N)))[n % N]);
  }
  const letterOf = shuffled(26, hashN(seed, 2, stratum)), glyphOf: number[] = [];
  letterOf.forEach((l, g) => { glyphOf[l] = g; });
  const words: Layout['words'] = [], sentWords: number[][] = [];
  pool.forEach((p, j) => {
    sentWords.push([]);
    for (const w of POOL[p].split(' ')) {
      sentWords[j].push(words.length);
      words.push({ glyphs: [...w].map(ch => glyphOf[ch.charCodeAt(0) - 97]), sent: j });
    }
  });
  const L = { pool, words, sentWords, letterOf, glyphOf, shapes: makeShapes(hashN(seed, 3, stratum)) };
  if (cache.size > 16) cache.clear();
  cache.set(k, L);
  return L;
}

const st = (s: GameState) => s.challenges.scriptorium;
export const lay = (s: GameState) => layout(st(s).seed, st(s).stratum);
export const letterChar = (l: number) => String.fromCharCode(97 + l);
export const truth = (L: Layout, g: number) => letterChar(L.letterOf[g]);
export const wordsHeard = (s: GameState) => Math.min(lay(s).words.length, Math.floor(st(s).heard));

/** Glyphs that have been heard in the current stratum. */
export function heardGlyphs(s: GameState): Set<number> {
  const L = lay(s), n = wordsHeard(s), out = new Set<number>();
  for (let i = 0; i < n; i++) for (const g of L.words[i].glyphs) out.add(g);
  return out;
}

// ---------------------------------------------------------------- numbers

export const glyphsSolved = (s: GameState) => st(s).past + st(s).conf.length;
export const foremen = (s: GameState) => st(s).seats.filter(id => id >= 0).length;
export const rosterCap = (s: GameState) => ROSTER_BASE + upLevel(s, 'roster');
export const loudCap = (s: GameState) => LOUD_CAP * (1 + 0.25 * upLevel(s, 'wide'));
/** The patient side of the profile makes everything the walls give arrive sooner. */
export const giveRate = (s: GameState) => (1 + 0.25 * upLevel(s, 'ear')) * (1 + 0.05 * Math.sqrt(st(s).prof.patient));
export const glyphMult = (s: GameState) => 1 + GLYPH_K * Math.sqrt(st(s).past + st(s).correct);
export const loudMult = (s: GameState) => 1 + st(s).loud / LOUD_CAP;
export const traitMult = (s: GameState, t: Trait, k: number) => 1 + k * Math.sqrt(st(s).prof[t]);
export const foremanStrength = (s: GameState) => (1 + 0.1 * upLevel(s, 'lamp')) * (1 + 0.12 * Math.sqrt(st(s).tally));
export function foremanMult(s: GameState, zone: number): number {
  const c = st(s), id = c.seats[zone];
  if (id === undefined || id < 0) return 1;
  const v = c.voices.find(x => x.id === id);
  return v ? 1 + FOREMAN_K * v.q * (v.spec === zone ? 2 : 1) * foremanStrength(s) : 1;
}
export const retireSilence = (v: Voice) => Math.round(25 * v.q);

// ---------------------------------------------------------------- the cipher

function recount(s: GameState) {
  const c = st(s), L = lay(s);
  c.correct = c.guess.reduce((n, l, g) => n + (l && l === truth(L, g) ? 1 : 0), 0);
}

/** Resolve whatever words are now fully right, and any sentences that came out of it. */
function settle(s: GameState) {
  const c = st(s), L = lay(s), n = wordsHeard(s), conf = new Set(c.conf);
  for (let i = 0; i < n; i++) {
    const gs = L.words[i].glyphs;
    if (gs.every(g => conf.has(g) || c.guess[g] === truth(L, g))) for (const g of gs) conf.add(g);
  }
  c.conf = [...conf];
  for (let j = 0; j < PER_STRATUM; j++) {
    if (c.done.includes(j)) continue;
    const ws = L.sentWords[j];
    if (ws[ws.length - 1] < n && ws.every(i => L.words[i].glyphs.every(g => conf.has(g)))) {
      c.done.push(j);
      c.sentences++;
      if (!c.lore.includes(L.pool[j])) c.lore.push(L.pool[j]);
    }
  }
  if (c.done.length >= PER_STRATUM) {
    c.past += c.conf.length;
    c.stratum++;
    c.guess = Array(26).fill('');
    c.conf = [];
    c.done = [];
    c.correct = 0;
    c.heard = 3;
    log(s, `THE HAND IN THE WALLS HAS CHANGED. STRATUM ${c.stratum + 1}.`, 'milestone', true);
  }
}

/** Write a letter under a glyph ('' clears it). Each letter goes under one glyph only. */
export function assign(s: GameState, g: number, letter: string): boolean {
  const c = st(s);
  if (g < 0 || g > 25 || c.conf.includes(g) || !heardGlyphs(s).has(g)) return false;
  if (letter && !/^[a-z]$/.test(letter)) return false;
  if (letter) {
    const other = c.guess.indexOf(letter);
    if (other >= 0 && other !== g) {
      if (c.conf.includes(other)) return false;
      c.guess[other] = '';
    }
  }
  c.guess[g] = letter;
  recount(s);
  settle(s);
  return true;
}

/** The glyph a hint would give: the most common unconfirmed one heard so far. */
export function hintTarget(s: GameState): number {
  const c = st(s), L = lay(s), n = wordsHeard(s), count = new Map<number, number>();
  for (let i = 0; i < n; i++) for (const g of L.words[i].glyphs) if (!c.conf.includes(g)) count.set(g, (count.get(g) ?? 0) + 1);
  let best = -1, bn = 0;
  for (const [g, k] of count) if (k > bn || (k === bn && g < best)) { best = g; bn = k; }
  return best;
}

function reveal(s: GameState): boolean {
  const c = st(s), g = hintTarget(s);
  if (g < 0) return false;
  const l = truth(lay(s), g), other = c.guess.indexOf(l);
  if (other >= 0) c.guess[other] = '';
  c.guess[g] = l;
  c.conf.push(g);
  recount(s);
  settle(s);
  return true;
}

/** Spend a banked hint: the walls say one glyph out loud. */
export function askWalls(s: GameState): boolean {
  const c = st(s);
  if (c.hints < 1 || !reveal(s)) return false;
  c.hints -= 1;
  return true;
}

// ---------------------------------------------------------------- silence

export function hush(s: GameState): boolean {
  const c = st(s);
  if (c.loud < 1) return false;
  c.silence += c.loud;
  c.loud = 0;
  c.hushes++;
  return true;
}

export function buyUp(s: GameState, id: string): boolean {
  const c = st(s), cost = upCost(s, id);
  if (c.silence < cost) return false;
  c.silence -= cost;
  c.ups[id] = (c.ups[id] ?? 0) + 1;
  return true;
}

// ---------------------------------------------------------------- voices

export function makeVoice(seed: number, n: number): Voice {
  const r = mulberry(hashN(seed, 7, n));
  const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
  const era = r() < 0.6 ? `dug in ${1871 + Math.floor(r() * 109)}` : `dug in ${ERAS[Math.floor(r() * ERAS.length)]}`;
  const spec = Math.floor(r() * 9);
  const q = Math.round((0.8 + 0.4 * r()) * (1 + 0.1 * Math.sqrt(n)) * 100) / 100;
  return { id: n, name, era, spec, q };
}

/** Seat a voice as foreman of a zone. If it was foreman elsewhere it moves. */
export function seat(s: GameState, zone: number, id: number): boolean {
  const c = st(s);
  if (zone < 0 || zone > 8 || !c.voices.some(v => v.id === id)) return false;
  c.seats = c.seats.map(x => (x === id ? -1 : x));
  c.seats[zone] = id;
  return true;
}

export function unseat(s: GameState, zone: number): boolean {
  const c = st(s);
  if (c.seats[zone] === undefined || c.seats[zone] < 0) return false;
  c.seats[zone] = -1;
  return true;
}

/** Let an old voice go: into silence, or onto the tally, which makes every foreman stronger for good. */
export function retire(s: GameState, id: number, into: 'silence' | 'tally'): boolean {
  const c = st(s), v = c.voices.find(x => x.id === id);
  if (!v) return false;
  c.voices = c.voices.filter(x => x.id !== id);
  c.seats = c.seats.map(x => (x === id ? -1 : x));
  if (into === 'silence') c.silence += retireSilence(v);
  else c.tally++;
  return true;
}

// ---------------------------------------------------------------- the confessional

export const questionAt = (seed: number, n: number) => shuffled(QUESTIONS.length, hashN(seed, 13, Math.floor(n / QUESTIONS.length)))[n % QUESTIONS.length];

export function answer(s: GameState, slot: number, k: number): boolean {
  const c = st(s), qi = c.queue[slot];
  const a = qi === undefined ? undefined : QUESTIONS[qi]?.a[k];
  if (!a) return false;
  c.queue.splice(slot, 1);
  c.prof[a.t]++;
  return true;
}

export const leaning = (s: GameState): Trait | null => {
  const p = st(s).prof;
  const best = TRAITS.reduce((a, b) => (p[b] > p[a] ? b : a));
  return p[best] > 0 ? best : null;
};

// ---------------------------------------------------------------- the module

function step(s: GameState, dt: number) {
  const c = st(s);
  if (!c.guess || c.guess.length !== 26) c.guess = Array(26).fill('');
  // loudness: closes on its cap exponentially, so any split of dt lands in the same place
  const cap = loudCap(s), e = Math.exp(-dt / LOUD_TAU), L0 = c.loud;
  const area = cap * dt - (cap - L0) * LOUD_TAU * (1 - e);
  c.silence += WAX_K * upLevel(s, 'wax') * area;
  c.loud = cap - (cap - L0) * e;

  const give = giveRate(s), L = lay(s);
  const before = Math.floor(c.heard);
  c.heard = Math.min(L.words.length, c.heard + (dt * give) / WORD_SECS);
  c.hints += (dt * give) / HINT_SECS;

  c.qProg += dt / QUESTION_SECS;
  while (c.qProg >= 1 && c.queue.length < QUEUE_CAP) { c.queue.push(questionAt(c.seed, c.asked++)); c.qProg -= 1; }
  if (c.queue.length >= QUEUE_CAP) c.qProg = Math.min(c.qProg, 1);

  c.vProg += (dt * give) / VOICE_SECS;
  const room = rosterCap(s);
  while (c.vProg >= 1 && c.voices.length < room) { c.voices.push(makeVoice(c.seed, c.vid++)); c.vProg -= 1; }
  if (c.voices.length >= room) c.vProg = Math.min(c.vProg, 1);

  if (Math.floor(c.heard) !== before) settle(s);
  // Hints past the bank write themselves in, so the cipher never stalls for someone who is away.
  while (c.hints >= HINT_CAP + 1) {
    if (!reveal(s)) { c.hints = HINT_CAP + 1; break; }
    c.hints -= 1;
  }
}

function mult(s: GameState, t: MultTarget): number {
  const c = st(s);
  switch (t) {
    case 'ash': return (1 + GLYPH_K * Math.sqrt(c.past + c.correct)) * (1 + c.loud / LOUD_CAP) * (1 + 0.06 * Math.sqrt(c.prof.greedy));
    case 'comfort': case 'rust': return 1 + 0.1 * Math.sqrt(c.prof.patient);
    case 'echoes': return 1 + 0.1 * Math.sqrt(c.prof.curious);
    case 'listen': return 1 + 0.15 * Math.sqrt(c.prof.curious);
    default:
      if (t.startsWith('zone') && t !== 'zones') return foremanMult(s, Number(t.slice(4)));
      return 1;
  }
}

export const scriptorium: ChallengeModule<ScriptoriumState> = {
  id: 'scriptorium',
  zone: 7,
  name: 'The Scriptorium',
  tagline: 'Break the cipher in the walls. Collect the voices.',
  fresh: () => ({
    seed: Math.floor(Math.random() * 2147483647), stratum: 0, guess: Array(26).fill(''), conf: [], correct: 0, past: 0,
    heard: 3, done: [], sentences: 0, lore: [], hints: 1, loud: 0, silence: 0, hushes: 0, ups: {},
    voices: [], vid: 0, vProg: 1, seats: Array(9).fill(-1), tally: 0, queue: [], asked: 0, qProg: 1,
    prof: { patient: 0, greedy: 0, curious: 0 },
  }),
  step,
  mult,
  milestone: { text: 'Solve 12 glyphs and seat 4 foremen', done: s => glyphsSolved(s) >= 12 && foremen(s) >= 4 },
  level: s => glyphsSolved(s) + foremen(s) + st(s).sentences,
};
