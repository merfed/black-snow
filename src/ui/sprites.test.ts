import { describe, expect, it } from 'vitest';
import { EGG_SPRITES, FIXTURE_SPRITES, FLAKE, RECEIVER, TOWER, WATCHER, WEATHER_SPRITES, ZONE_ICONS } from './sprites';
import { EGG_STAGES, FIXTURES, WEATHER } from '../game/systems';
import { ZONES } from '../game/data';

describe('sprites', () => {
  it('are rectangular and use only known pixels', () => {
    for (const rows of [RECEIVER, WATCHER, TOWER, FLAKE, ...ZONE_ICONS, ...EGG_SPRITES, ...Object.values(FIXTURE_SPRITES), ...Object.values(WEATHER_SPRITES)]) {
      for (const r of rows) {
        expect(r.length).toBe(rows[0].length);
        expect(r).toMatch(/^[.#+:*]+$/);
      }
    }
  });
  it('has a glyph for every zone', () => {
    expect(ZONE_ICONS.length).toBe(ZONES.length);
    expect(EGG_SPRITES.length).toBe(EGG_STAGES.length);
    for (const f of FIXTURES) expect(FIXTURE_SPRITES[f.id]).toBeTruthy();
    for (const w of WEATHER) expect(WEATHER_SPRITES[w.id]).toBeTruthy();
  });
});
