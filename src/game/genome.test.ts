import { describe, expect, it } from 'vitest';
import { breed, creatureRows, eggRows, randomGenome, rngFrom, speciesKey, speciesName, SPECIES_COUNT } from './genome';

describe('genome', () => {
  it('draws the same creature for the same genes, and rectangular sprites', () => {
    const rng = rngFrom(42);
    for (let k = 0; k < 200; k++) {
      const g = randomGenome(rng);
      expect(creatureRows(g)).toEqual(creatureRows({ ...g }));
      for (const rows of [creatureRows(g), eggRows(g)]) for (const r of rows) expect(r.length).toBe(rows[0].length);
    }
  });
  it('has a large space of distinct species and names', () => {
    const rng = rngFrom(7);
    const keys = new Set<string>(), names = new Set<string>(), looks = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      const g = randomGenome(rng);
      keys.add(speciesKey(g)); names.add(speciesName(g)); looks.add(creatureRows(g).join(''));
    }
    expect(SPECIES_COUNT).toBeGreaterThan(100000);
    expect(keys.size).toBeGreaterThan(1900);
    expect(looks.size).toBeGreaterThan(1900);
    expect(names.size).toBeGreaterThan(1500);
  });
  it('children take their genes from their parents, with the odd mutation', () => {
    const rng = rngFrom(3);
    const a = randomGenome(rng), b = randomGenome(rng);
    let inherited = 0;
    for (let k = 0; k < 500; k++) {
      const c = breed(a, b, rng);
      if (c.body === a.body || c.body === b.body) inherited++;
    }
    expect(inherited).toBeGreaterThan(420);
  });
});
