// Procedural egg creatures. A genome is a handful of small integers; everything else (species name,
// gift, creature sprite, egg shell) is derived from it deterministically, so a save only stores genes.
// 6 bodies x 5 eyes x 5 limbs x 6 markings x 12 colours x 12 accents = 129,600 species.

export interface Genome {
  body: number; // 0..5
  eyes: number; // 0..4
  limbs: number; // 0..4
  mark: number; // 0..5
  hue: number; // 0..11
  accent: number; // 0..11
  shell: number; // 0..7, egg pattern only
  seed: number; // 0..9999, individual variation inside a species
}

export const GENE_RANGES: Record<keyof Genome, number> = {
  body: 6, eyes: 5, limbs: 5, mark: 6, hue: 12, accent: 12, shell: 8, seed: 10000,
};

export const SPECIES_COUNT = 6 * 5 * 5 * 6 * 12 * 12;

export const HUES: { name: string; hex: string }[] = [
  { name: 'Ash', hex: '#a3a3a3' }, { name: 'Ochre', hex: '#d9a441' }, { name: 'Rust', hex: '#c9602f' },
  { name: 'Bone', hex: '#e8dcc0' }, { name: 'Moss', hex: '#86a84d' }, { name: 'Teal', hex: '#2fc2b0' },
  { name: 'Ice', hex: '#a6dcff' }, { name: 'Violet', hex: '#9d72ff' }, { name: 'Rose', hex: '#ff86b6' },
  { name: 'Blood', hex: '#e0283a' }, { name: 'Gold', hex: '#ffd23b' }, { name: 'Void', hex: '#6e5aa8' },
];

const PRE = ['Glum', 'Tor', 'Krab', 'Sil', 'Vey', 'Thorn'];
const VOWEL = ['a', 'e', 'i', 'o', 'u'];
const CONS = ['m', 'r', 'sk', 'th', 'v'];
const SUF = ['ith', 'ox', 'ule', 'ent', 'arch', 'ling'];

export type Gift = 'ash' | 'listen' | 'bores' | 'echoes' | 'comfort';
export const GIFTS: Gift[] = ['ash', 'listen', 'bores', 'echoes', 'comfort'];
export const GIFT_TEXT: Record<Gift, (stage: number) => string> = {
  ash: st => `All ash +${5 * st}%`,
  listen: st => `Listen +${10 * st}%`,
  bores: st => `Shallow Bores +${10 * st}%`,
  echoes: st => `Echoes +${20 * st}%`,
  comfort: st => `+${2 * st} comfort`,
};

export const speciesKey = (g: Genome) => `${g.body}${g.eyes}${g.limbs}${g.mark}-${g.hue}-${g.accent}`;
export const speciesName = (g: Genome) => `${HUES[g.hue].name} ${PRE[g.body]}${VOWEL[g.eyes]}${CONS[g.limbs]}${SUF[g.mark]}`;
export const giftOf = (g: Genome): Gift => GIFTS[(g.body + g.mark) % GIFTS.length];

/** Small seeded RNG (mulberry32) so the same genome always draws the same sprite. */
export function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashGenome = (g: Genome) =>
  ((((((g.body * 7 + g.eyes) * 11 + g.limbs) * 13 + g.mark) * 17 + g.hue) * 19 + g.accent) * 23 + g.shell) * 10007 + g.seed;

export function randomGenome(rng: () => number): Genome {
  const g = {} as Genome;
  for (const k of Object.keys(GENE_RANGES) as (keyof Genome)[]) g[k] = Math.floor(rng() * GENE_RANGES[k]);
  return g;
}

/** Each gene comes from one parent; 12% of the time it mutates into something neither had. */
export function breed(a: Genome, b: Genome, rng: () => number): Genome {
  const g = {} as Genome;
  for (const k of Object.keys(GENE_RANGES) as (keyof Genome)[]) {
    g[k] = rng() < 0.12 ? Math.floor(rng() * GENE_RANGES[k]) : rng() < 0.5 ? a[k] : b[k];
  }
  g.seed = Math.floor(rng() * GENE_RANGES.seed);
  return g;
}

// Half-width body profiles, 12 rows each: how far from the centre line the body reaches.
const PROFILES = [
  [0, 1, 2, 3, 4, 4, 4, 4, 3, 2, 0, 0], // blob
  [1, 2, 2, 2, 3, 3, 3, 2, 2, 2, 1, 0], // tall
  [0, 0, 2, 4, 5, 5, 5, 4, 2, 0, 0, 0], // wide
  [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1], // serpent
  [0, 1, 2, 2, 5, 6, 5, 2, 2, 1, 0, 0], // winged
  [1, 0, 2, 3, 2, 4, 2, 4, 3, 2, 1, 0], // spiky
];

/**
 * A 12x12 creature, mirrored down the middle. Pixels use the Sprite legend: '#' body (colour it with
 * `color`), '+' markings (set --accent), '*' eyes (set --warm), ':' shadow.
 */
export function creatureRows(g: Genome): string[] {
  const rng = rngFrom(hashGenome(g));
  const half: string[][] = PROFILES[g.body].map(w => Array.from({ length: 6 }, (_, c) => {
    if (w === 0) return '.';
    const v = c < w - 1 ? 2 : c < w + 1 ? 1 : 0;
    return v === 2 || (v === 1 && rng() < 0.5) ? '#' : '.';
  }));
  // Markings.
  half.forEach((row, r) => row.forEach((px, c) => {
    if (px !== '#') return;
    const m = g.mark;
    const on = m === 1 ? r % 3 === 1
      : m === 2 ? (r * 3 + c * 5 + g.seed) % 7 === 0
      : m === 3 ? r >= 6 && c <= 1
      : m === 4 ? c === 0
      : m === 5 ? (c + 1 >= 6 || row[c + 1] !== '#')
      : false;
    if (on) row[c] = '+';
  }));
  // Legs.
  const leg = (r: number, c: number) => { if (r < 12 && c < 6) half[r][c] = '#'; };
  if (g.limbs === 1) { leg(10, 2); leg(11, 2); }
  if (g.limbs === 2) { leg(10, 1); leg(11, 1); leg(10, 3); leg(11, 3); }
  if (g.limbs === 3) { leg(10, 0); leg(10, 2); leg(10, 4); leg(11, 1); leg(11, 3); leg(11, 5); }
  if (g.limbs === 4) { leg(9, 3); leg(10, 3); leg(11, 3); leg(11, 4); }
  // Eyes, two rows under the top of the body.
  const top = half.findIndex(row => row.some(px => px !== '.'));
  const er = Math.min(9, Math.max(0, top) + 2);
  const eye = (r: number, c: number) => { if (r < 12) half[r][c] = '*'; };
  if (g.eyes === 0) eye(er, 0);
  if (g.eyes === 1) eye(er, 2);
  if (g.eyes === 2) { eye(er, 1); eye(er + 1, 3); }
  if (g.eyes === 3) { half[er][0] = ':'; half[er][1] = ':'; half[er][2] = ':'; }
  if (g.eyes === 4) { eye(er, 0); eye(er, 2); eye(er + 2, 1); }
  return half.map(row => [...row].reverse().join('') + row.join(''));
}

const EGG_HALF = [1, 2, 3, 3, 4, 4, 5, 5, 5, 4, 3, 2];

/** A 10x12 egg shell with the genome's pattern in its accent colour. */
export function eggRows(g: Genome): string[] {
  const rng = rngFrom(hashGenome(g) ^ 0x5eed);
  return EGG_HALF.map((w, r) => {
    const half = Array.from({ length: 5 }, (_, c) => {
      if (c >= w) return '.';
      const s = g.shell;
      const on = s === 0 ? (r * 7 + c * 3 + g.seed) % 5 === 0
        : s === 1 ? r % 3 === 0
        : s === 2 ? (r + c) % 4 === 0
        : s === 3 ? r === 5 || r === 6
        : s === 4 ? rng() < 0.22
        : s === 5 ? r < 4
        : s === 6 ? r % 4 === 1
        : r >= 5 && r <= 6 && c <= 1;
      if (s === 7 && on) return '*';
      return on ? '+' : '#';
    });
    return [...half].reverse().join('') + half.join('');
  });
}
