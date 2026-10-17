import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { MODULATOR_ZONE, setSlot, signature } from '../patterns';
import {
  albumSets, archive, BLANK_CAP, BLANK_EVERY, BLANK_START, recordBlock, buyShelf, buyStock, driftSig, eraseTape, FRESH_TIME, recordSlot, shelfFull, shelfSize, SHELF_BASE, SHELF_MAX, STATION_DAY, tapeMult,
} from './archive';

function late(): GameState {
  const s = newGame(() => 0.37);
  s.zonesOpened = 9;
  s.zones[8].bought = 1;
  s.zones[2].bought = 250;
  s.zones[MODULATOR_ZONE].bought = 1;
  s.chUnlocked = ['survey', 'undertow', 'archive'];
  s.ash = new Decimal(1e300);
  s.challenges.archive.blanks = 99;
  return s;
}

/** Point slot i at a target and lock it exactly. */
function lock(s: GameState, i: number, t: 'ash' | 'listen' | 'echoes' | 'rust' | 'cycles' | 'pigment' | 'embers') {
  const sig = signature(s, t);
  expect(setSlot(s, i, { target: t, ...sig })).toBe(true);
}

describe('archive', () => {
  it('starts empty and pays nothing', () => {
    const s = late();
    expect(s.challenges.archive.shelf).toEqual([]);
    for (const t of ['ash', 'listen', 'zone2', 'zones', 'echoes'] as const) expect(archive.mult(s, t)).toBe(1);
    expect(archive.level(s)).toBe(0);
    expect(archive.milestone.done(s)).toBe(false);
  });

  it('records a locked slot to a gold tape, frees the slot and keeps paying', () => {
    const s = late();
    lock(s, 0, 'listen');
    expect(recordSlot(s, 0)).toBe(true);
    expect(s.patterns.slots[0].target).toBeNull();
    const a = s.challenges.archive;
    expect(a.shelf).toHaveLength(1);
    expect(a.shelf[0].gold).toBe(true);
    expect(a.channels).toContain('listen');
    expect(archive.mult(s, 'listen')).toBeGreaterThan(3);
    expect(recordSlot(s, 0)).toBe(false); // nothing on the slot now
    // the dials spun back to rest: the same lock has to be found again
    expect(s.patterns.slots[0]).toEqual({ target: null, freq: 1, phase: 0, harm: 1 });
  });

  it('uses up a blank reel per tape, and reels come back slowly', () => {
    const s = late();
    const a = s.challenges.archive;
    a.blanks = 1;
    lock(s, 0, 'listen');
    expect(recordSlot(s, 0)).toBe(true);
    expect(a.blanks).toBe(0);
    lock(s, 0, 'ash');
    expect(recordSlot(s, 0)).toBe(false);
    expect(recordBlock(s, 0)).toBe('No blank reel');
    archive.step(s, BLANK_EVERY - 1, Math.random);
    expect(a.blanks).toBe(0);
    archive.step(s, 2, Math.random);
    expect(a.blanks).toBe(1);
    expect(recordSlot(s, 0)).toBe(true);
    archive.step(s, BLANK_EVERY * 100, Math.random);
    expect(a.blanks).toBe(BLANK_CAP);
    expect(archive.fresh().blanks).toBe(BLANK_START);
  });

  it('a near match records plain and pays less; the shelf fills up', () => {
    const s = late();
    const sig = signature(s, 'ash');
    setSlot(s, 0, { target: 'ash', ...sig, freq: sig.freq === 1 ? 2 : sig.freq - 1 });
    expect(recordSlot(s, 0)).toBe(true);
    expect(s.challenges.archive.shelf[0].gold).toBe(false);
    const plain = tapeMult(s, 'ash');
    lock(s, 0, 'ash');
    recordSlot(s, 0);
    expect(tapeMult(s, 'ash')).toBeGreaterThan(plain);
    for (const t of ['rust', 'listen', 'echoes'] as const) { lock(s, 0, t); recordSlot(s, 0); }
    lock(s, 0, 'embers');
    expect(recordSlot(s, 0)).toBe(false); // the shelf is full
    expect(eraseTape(s, s.challenges.archive.shelf[2].id)).toBe(true);
    expect(recordSlot(s, 0)).toBe(true);
  });

  it('shelf and stock cost ash', () => {
    const s = late();
    s.ash = new Decimal(1e20);
    const before = s.ash;
    expect(buyShelf(s)).toBe(true);
    expect(shelfSize(s)).toBe(SHELF_BASE + 1);
    expect(s.ash.lt(before)).toBe(true);
    lock(s, 0, 'echoes');
    recordSlot(s, 0);
    const m = archive.mult(s, 'echoes');
    expect(buyStock(s)).toBe(true);
    expect(archive.mult(s, 'echoes')).toBeGreaterThan(m);
    s.ash = new Decimal(0);
    expect(buyShelf(s)).toBe(false);
  });

  it('accrues frames the same in one big step as in many small ones', () => {
    const a = late(), b = late();
    archive.step(a, 3510, Math.random);
    for (let i = 0; i < 70200; i++) archive.step(b, 0.05, Math.random);
    expect(a.challenges.archive.frames).toBe(b.challenges.archive.frames);
    expect(a.challenges.archive.album).toEqual(b.challenges.archive.album);
    expect(Math.abs(a.challenges.archive.frameProg - b.challenges.archive.frameProg)).toBeLessThan(1e-6);
    expect(a.challenges.archive.frames).toBeGreaterThan(5);
  });

  it('a fresh lock on the drifted signature boosts tapes once per day', () => {
    const s = late();
    lock(s, 0, 'listen');
    recordSlot(s, 0);
    const base = archive.mult(s, 'listen');
    const d = driftSig(s, 'pigment');
    expect(d).not.toEqual(signature(s, 'pigment'));
    setSlot(s, 0, { target: 'pigment', ...d });
    archive.step(s, 1, Math.random);
    expect(s.challenges.archive.freshLeft).toBeCloseTo(FRESH_TIME);
    expect(archive.mult(s, 'listen')).toBeGreaterThan(base);
    archive.step(s, 3600, Math.random);
    expect(s.challenges.archive.freshLeft).toBeCloseTo(FRESH_TIME - 3600); // no restack the same day
    archive.step(s, FRESH_TIME, Math.random);
    expect(archive.mult(s, 'listen')).toBeCloseTo(base);
    void STATION_DAY;
  });

  it('reaches the milestone with five tapes and a full set', () => {
    const s = late();
    buyShelf(s); buyShelf(s);
    for (const t of ['ash', 'listen', 'echoes', 'rust', 'cycles'] as const) { lock(s, 0, t); expect(recordSlot(s, 0)).toBe(true); }
    expect(archive.milestone.done(s)).toBe(false);
    let hours = 0;
    while (albumSets(s) < 1 && hours < 200) { archive.step(s, 3600, Math.random); hours++; }
    expect(albumSets(s)).toBeGreaterThanOrEqual(1);
    expect(archive.milestone.done(s)).toBe(true);
    expect(archive.mult(s, 'zone2')).toBeGreaterThan(1);
    expect(archive.level(s)).toBeGreaterThanOrEqual(5 + 1 + 5);
  });

  it('caps the shelf at 32 tapes', () => {
    const s = late();
    while (buyShelf(s)) { /* buy to the top */ }
    expect(shelfSize(s)).toBe(SHELF_MAX);
    expect(shelfFull(s)).toBe(true);
    expect(s.challenges.archive.space).toBe(SHELF_MAX - SHELF_BASE);
    const ash = s.ash;
    expect(buyShelf(s)).toBe(false);
    expect(s.ash.eq(ash)).toBe(true);
    const ts = ['ash', 'listen', 'echoes', 'rust', 'cycles', 'pigment', 'embers'] as const;
    for (let i = 0; i < SHELF_MAX; i++) { lock(s, 0, ts[i % 7]); expect(recordSlot(s, 0)).toBe(true); }
    lock(s, 0, 'ash');
    expect(recordSlot(s, 0)).toBe(false);
    expect(s.challenges.archive.shelf).toHaveLength(SHELF_MAX);
  });

  it('trims an old save that went past 32', () => {
    const s = late();
    const a = s.challenges.archive;
    a.space = 60;
    a.shelf = Array.from({ length: 40 }, (_, i) => ({ id: i, target: 'ash' as const, q: 1 - i / 100, gold: false }));
    expect(shelfSize(s)).toBe(SHELF_MAX);
    archive.step(s, 0.05, Math.random);
    expect(a.shelf).toHaveLength(SHELF_MAX);
    expect(a.shelf[0].id).toBe(0);
    expect(a.space).toBe(SHELF_MAX - SHELF_BASE);
  });
});
