import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  answer, askWalls, HINT_CAP, HINT_SECS, SPILL_SLOW, assign, buyUp, foremen, glyphsSolved, hush, lay, layout, POOL, retire, scriptorium, seat, truth, upCost, wordsHeard,
} from './scriptorium';

function late(): GameState {
  const s = newGame();
  s.ash = new Decimal(1e300);
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.chUnlocked = ['survey', 'undertow', 'archive', 'stair', 'seal', 'ring', 'operator', 'scriptorium'];
  s.challenges.scriptorium.seed = 12345;
  return s;
}
const c = (s: GameState) => s.challenges.scriptorium;
const rng = () => 0.5;

describe('scriptorium', () => {
  it('starts fresh and silent', () => {
    const s = late();
    expect(c(s).conf).toEqual([]);
    expect(scriptorium.level(s)).toBe(0);
    expect(scriptorium.mult(s, 'ash')).toBe(1);
    expect(scriptorium.mult(s, 'zone3')).toBe(1);
    expect(scriptorium.milestone.done(s)).toBe(false);
  });

  it('builds a per-save cipher that covers its sentences', () => {
    const a = layout(1, 0), b = layout(2, 0);
    expect(new Set(a.letterOf).size).toBe(26);
    expect(a.words.length).toBeGreaterThan(10);
    expect(a.letterOf.join() === b.letterOf.join() && a.pool.join() === b.pool.join()).toBe(false);
    for (const p of a.pool) expect(POOL[p]).toMatch(/^[a-z ]+$/);
  });

  it('confirms glyphs only when a whole word is right', () => {
    const s = late(), L = lay(s);
    const w = L.words[0].glyphs;
    // a wrong guess on the first glyph: nothing confirmed
    const wrong = truth(L, w[0]) === 'z' ? 'q' : 'z';
    expect(assign(s, w[0], wrong)).toBe(true);
    expect(c(s).conf).toEqual([]);
    for (const g of w) assign(s, g, truth(L, g));
    for (const g of w) expect(c(s).conf).toContain(g);
    expect(scriptorium.mult(s, 'ash')).toBeGreaterThan(1);
    // confirmed glyphs are locked
    expect(assign(s, w[0], '')).toBe(false);
  });

  it('a hint reveals a glyph', () => {
    const s = late();
    c(s).hints = 1;
    expect(askWalls(s)).toBe(true);
    expect(c(s).conf.length).toBe(1);
    expect(askWalls(s)).toBe(false);
  });

  it('step accrues the same in one big step or many small ones', () => {
    const a = late(), b = late();
    scriptorium.step(a, 100, rng);
    for (let i = 0; i < 2000; i++) scriptorium.step(b, 0.05, rng);
    expect(c(b).loud).toBeCloseTo(c(a).loud, 6);
    expect(c(b).heard).toBeCloseTo(c(a).heard, 6);
    expect(c(b).hints).toBeCloseTo(c(a).hints, 6);
    expect(c(b).voices.length).toBe(c(a).voices.length);
    expect(c(a).loud).toBeGreaterThan(0);
  });

  it('hush banks silence and silence buys upgrades', () => {
    const s = late();
    scriptorium.step(s, 3600, rng);
    const loud = c(s).loud;
    expect(hush(s)).toBe(true);
    expect(c(s).silence).toBeCloseTo(loud);
    expect(c(s).loud).toBe(0);
    const cost = upCost(s, 'roster');
    expect(buyUp(s, 'roster')).toBe(true);
    expect(c(s).silence).toBeCloseTo(loud - cost);
  });

  it('voices arrive, seat as foremen, and retire', () => {
    const s = late();
    scriptorium.step(s, 4000, rng);
    expect(c(s).voices.length).toBeGreaterThanOrEqual(4);
    const v = c(s).voices[0];
    expect(seat(s, v.spec, v.id)).toBe(true);
    expect(scriptorium.mult(s, `zone${v.spec}` as 'zone0')).toBeGreaterThan(1);
    expect(retire(s, v.id, 'tally')).toBe(true);
    expect(c(s).tally).toBe(1);
    expect(foremen(s)).toBe(0);
  });

  it('questions queue up to three and answers build the profile', () => {
    const s = late();
    scriptorium.step(s, 1e6, rng);
    expect(c(s).queue.length).toBe(3);
    expect(answer(s, 0, 0)).toBe(true);
    expect(c(s).queue.length).toBe(2);
    const p = c(s).prof;
    expect(p.patient + p.greedy + p.curious).toBe(1);
  });

  it('idle time alone makes progress, and the milestone is reachable', () => {
    const s = late();
    for (let i = 0; i < 400; i++) scriptorium.step(s, 30, rng); // 200 minutes away
    expect(glyphsSolved(s)).toBeGreaterThan(0);
    expect(wordsHeard(s)).toBeGreaterThan(10);
    c(s).voices.slice(0, 4).forEach((v, z) => seat(s, z, v.id));
    // finish the transcription by hand
    for (let k = 0; k < 40 && glyphsSolved(s) < 12; k++) {
      const L = lay(s);
      for (let i = 0; i < wordsHeard(s); i++) for (const g of L.words[i].glyphs) assign(s, g, truth(L, g));
      scriptorium.step(s, 300, rng);
    }
    expect(scriptorium.milestone.done(s)).toBe(true);
    expect(scriptorium.level(s)).toBeGreaterThan(16);
  });

  it('finishing a stratum moves to a new hand without losing output', () => {
    const s = late();
    for (let k = 0; k < 200 && c(s).stratum === 0; k++) {
      c(s).heard = lay(s).words.length;
      const L = lay(s);
      for (let i = 0; i < L.words.length; i++) for (const g of L.words[i].glyphs) assign(s, g, truth(L, g));
    }
    expect(c(s).stratum).toBe(1);
    expect(c(s).sentences).toBe(5);
    expect(c(s).past).toBeGreaterThan(10);
    expect(scriptorium.mult(s, 'ash')).toBeGreaterThan(1.5);
  });

  it('spare hints come slowly once the bank is full', () => {
    const s = late();
    c(s).hints = HINT_CAP;
    c(s).heard = 0; // nothing heard: no glyph to write in, so the bank just fills
    scriptorium.step(s, HINT_SECS, rng);
    expect(c(s).hints).toBeCloseTo(HINT_CAP + 1 / SPILL_SLOW, 1);
  });

  it('a week of glyphs and a loud gallery stays inside the payout budget', () => {
    const s = late();
    c(s).past = 3000;
    c(s).ups = { wide: 10 };
    c(s).loud = 350;
    c(s).prof.greedy = 300;
    const m = scriptorium.mult(s, 'ash');
    expect(m).toBeGreaterThan(10);
    expect(m).toBeLessThan(30);
  });
});
