// A small LZW packer for the save. The JSON is turned into UTF-8 bytes, packed into dictionary codes, and each
// code is written as one UTF-16 character (shifted past control characters, never a lone surrogate), so the
// packed text is safe to keep in localStorage. Typical saves pack to about a quarter of their size.

const BASE = 32; // codes start past the control characters
const MAX = 0xd7ff - BASE; // stay below the surrogate range; the dictionary starts over when full

export function pack(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const out: number[] = [];
  let dict = new Map<string, number>();
  let next = 256;
  let w = '';
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    const wc = w + c;
    if (w === '' || dict.has(wc)) { w = wc; continue; }
    out.push(w.length === 1 ? w.charCodeAt(0) : dict.get(w)!);
    dict.set(wc, next++);
    if (next >= MAX) { dict = new Map(); next = 256; }
    w = c;
  }
  if (w) out.push(w.length === 1 ? w.charCodeAt(0) : dict.get(w)!);
  let s = '';
  for (let i = 0; i < out.length; i += 4096) s += String.fromCharCode(...out.slice(i, i + 4096).map(n => n + BASE));
  return s;
}

export function unpack(packed: string): string {
  const bytes: number[] = [];
  let dict: string[] = [];
  let next = 256;
  let w = '';
  const entry = (code: number) => (code < 256 ? String.fromCharCode(code) : dict[code]);
  for (let i = 0; i < packed.length; i++) {
    const code = packed.charCodeAt(i) - BASE;
    let e = entry(code);
    if (e === undefined) {
      if (code !== next || !w) throw new Error('Damaged save');
      e = w + w[0]; // the code being defined right now
    }
    for (let j = 0; j < e.length; j++) bytes.push(e.charCodeAt(j));
    if (w) {
      dict[next++] = w + e[0];
      if (next >= MAX) { dict = []; next = 256; }
    }
    w = e;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
