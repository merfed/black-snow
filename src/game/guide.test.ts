import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { newGame } from './state';
import { devUnlockAll } from './engine';
import { guideHasLocked, visibleGuide, zoneGuide } from './guide';
import { CHALLENGES } from './challenges';

const ids = (s: ReturnType<typeof newGame>, zone: number) => visibleGuide(s, zone).map(x => x.id);

describe('zone guide', () => {
  it('a fresh game shows no challenge, system or Citadel sections', () => {
    const s = newGame(() => 0.5);
    for (let z = 0; z < 9; z++) {
      const shown = ids(s, z);
      expect(shown.filter(id => id.startsWith('ch-'))).toEqual([]);
      expect(shown).not.toContain('z2-buffer');
      expect(shown).not.toContain('z5-spiral');
      expect(shown).not.toContain('z6-exchange');
      expect(shown).not.toContain('z8-citadel');
      expect(guideHasLocked(s, z)).toBe(true);
    }
  });

  it('the Survey stays hidden until the Survey opens', () => {
    const s = newGame(() => 0.5);
    devUnlockAll(s);
    s.chUnlocked = [];
    expect(ids(s, 0).some(id => id.startsWith('ch-survey'))).toBe(false);
    s.chUnlocked = ['survey'];
    expect(ids(s, 0)).toContain('ch-survey');
    expect(ids(s, 1).some(id => id.startsWith('ch-undertow'))).toBe(false);
  });

  it('devUnlockAll shows every challenge and the Citadel', () => {
    const s = newGame(() => 0.5);
    devUnlockAll(s);
    for (const c of CHALLENGES) expect(ids(s, c.zone)).toContain(`ch-${c.id}`);
    expect(ids(s, 2)).toContain('z2-buffer');
    expect(ids(s, 5)).toContain('z5-spiral');
    expect(ids(s, 6)).toContain('z6-exchange');
    expect(ids(s, 8)).toContain('z8-citadel');
    expect(ids(s, 8)).toContain('z8-dreams');
  });

  it('every section renders without throwing, locked state or not', () => {
    for (const unlock of [false, true]) {
      const s = newGame(() => 0.5);
      if (unlock) devUnlockAll(s);
      for (let z = 0; z < 9; z++) {
        const html = renderToStaticMarkup(createElement(Fragment, null, ...zoneGuide(z).map(sec => createElement(Fragment, { key: sec.id }, sec.body(s)))));
        expect(html.length).toBeGreaterThan(100);
        expect(html).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });
});
