import { describe, expect, it } from 'vitest';
import { pack, unpack } from './pack';
import { newGame } from './state';
import { serialize } from './save';

describe('save packing', () => {
  it('round-trips text, unicode and repeats', () => {
    for (const t of ['', 'a', 'aaaaaaaaaaaaaaaa', 'abababababab', 'THE SNOW · falls — “here” ✶ 雪', JSON.stringify({ a: [1, 2, 3], b: 'x'.repeat(500) })])
      expect(unpack(pack(t))).toBe(t);
  });
  it('round-trips past a dictionary reset', () => {
    let seed = 7, t = '';
    const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 400_000; i++) t += String.fromCharCode(32 + Math.floor(r() * 90));
    expect(unpack(pack(t))).toBe(t);
  });
  it('never writes a surrogate or control character', () => {
    const p = pack('hello '.repeat(5000) + Math.random());
    for (let i = 0; i < p.length; i++) { const c = p.charCodeAt(i); expect(c >= 32 && (c < 0xd800 || c > 0xdfff)).toBe(true); }
  });
  it('shrinks a save', () => {
    const s = newGame();
    for (let i = 0; i < 80; i++) s.log.push({ id: i, text: `THE SNOW KEEPS FALLING. LINE ${i}. IT IS ALWAYS SNOWING.`, kind: 'plain' });
    const t = serialize(s);
    const p = pack(t);
    expect(unpack(p)).toBe(t);
    expect(p.length).toBeLessThan(t.length / 2);
  });
});

describe('save round trip', () => {
  it('exports and imports a packed save', async () => {
    const { exportSave, importSave, deserialize } = await import('./save');
    const s = newGame();
    s.playTime = 1234.5;
    expect(importSave(exportSave(s)).playTime).toBe(1234.5);
    expect(deserialize(serialize(s)).playTime).toBe(1234.5);
  });
});
