// The Scriptorium: the panel inside the zone 8 box, and the room behind it.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  answer, askWalls, assign, buyUp, foremanMult, foremanStrength, foremen, giveRate, glyphMult, glyphsSolved, heardGlyphs, HINT_CAP, HINT_SECS,
  hush, lay, leaning, loudCap, loudMult, POOL, QUESTIONS, retire, retireSilence, rosterCap, seat, TRAIT_TEXT, TRAITS, unseat, upCost,
  UPGRADES, upLevel, wordsHeard, WORD_SECS, GW, GH, type Trait,
} from '../../game/challenges/scriptorium';
import { ZONES } from '../../game/data';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import type { GameState } from '../../game/state';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom } from './ChallengeSlot';
import './scriptorium.css';

const ZONE = 7;
const HUE = ZONE_COLORS[ZONE];
const BG: [number, number, number] = [5, 6, 11];
const RED: [number, number, number] = [255, 42, 42];
const mixRgb = (a: [number, number, number], b: [number, number, number], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k)) as [number, number, number];

/** One glyph, drawn as pixels. */
export function Glyph({ shape, className }: { shape: boolean[]; className?: string }) {
  return (
    <svg className={`scriptorium-glyph ${className ?? ''}`} viewBox={`-0.5 -0.5 ${GW + 1} ${GH + 1}`} shapeRendering="crispEdges" aria-hidden>
      {shape.map((on, i) => on && <rect key={i} x={i % GW} y={Math.floor(i / GW)} width={1} height={1} />)}
    </svg>
  );
}

/** The heard words of the current hand, glyph after glyph, with whether each glyph is confirmed. */
function stream(s: GameState) {
  const L = lay(s), n = wordsHeard(s), conf = new Set(s.challenges.scriptorium.conf);
  return { L, words: L.words.slice(0, n).map(w => w.glyphs.map(g => ({ g, ok: conf.has(g) }))) };
}

/**
 * The murmur scrolling past the needle: glyphs on a dithered waveband, confirmed ones pale, the rest in
 * the zone ink, a red needle where the horn takes it down. Low fps, pauses off screen.
 */
const GlyphLine = memo(function GlyphLine({ data, loud }: { data: ReturnType<typeof stream>; loud: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ data, loud });
  live.current = { data, loud };
  const W = 150, H = 26;
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!, img = g.createImageData(W, H), d = img.data;
    const ink = hex(HUE), dim = mixRgb(BG, ink, 0.28), pale = mixRgb(ink, [255, 255, 255], 0.6);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const draw = (ms: number) => {
      if (ms - last >= 1000 / 10) {
        last = ms;
        const t = ms / 1000, { data: { L, words }, loud: ld } = live.current;
        // lay the glyphs out along one long strip
        const cells: { x: number; g: number; ok: boolean }[] = [];
        let x = 0;
        for (const w of words) { for (const c of w) { cells.push({ x, ...c }); x += GW + 1; } x += 4; }
        const len = Math.max(W, x + 12), off = still ? 0 : (t * 5) % len;
        const top = 10;
        for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
          const i = (y * W + px) * 4;
          const wave = Math.sin(px * 0.21 - t * 2.3) * Math.sin(px * 0.05 + t * 0.7);
          const band = Math.max(0, 1 - Math.abs((y - H / 2) - wave * 5 * (0.3 + ld)) / 4);
          let c = band * (0.25 + 0.35 * ld) > threshold(px, y) ? dim : BG;
          if (px === 12 && (y < 4 || y > H - 5 || Math.floor(t * 2) % 2)) c = RED;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
        for (const c of cells) for (const rep of [0, len]) {
          const sx = Math.round(c.x - off + rep + 16);
          if (sx < -GW || sx >= W) continue;
          const shape = L.shapes[c.g], near = Math.max(0, 1 - Math.abs(sx - 12) / 24);
          for (let k = 0; k < GW * GH; k++) {
            if (!shape[k]) continue;
            const px = sx + (k % GW), py = top - 3 + Math.floor(k / GW);
            if (px < 0 || px >= W) continue;
            const col = c.ok ? pale : near > threshold(px, py) * 0.9 ? pale : ink;
            const i = (py * W + px) * 4;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
          }
        }
        g.putImageData(img, 0, 0);
      }
      if (visible && !still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && !still) raf = requestAnimationFrame(draw);
      });
      io.observe(cv);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, []);
  return <canvas ref={ref} width={W} height={H} className="scriptorium-line" data-nodrag />;
});

/** The profile as a small dithered emblem: three lobes, each as large as that side of you. */
const Emblem = memo(function Emblem({ p }: { p: Record<Trait, number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const S = 40;
  useEffect(() => {
    const g = ref.current!.getContext('2d')!, img = g.createImageData(S, S), d = img.data;
    const ink = hex(HUE), pale = mixRgb(ink, [255, 255, 255], 0.55), dim = mixRgb(BG, ink, 0.3);
    const total = TRAITS.reduce((n, t) => n + p[t], 0);
    const best = TRAITS.reduce((a, b) => (p[b] > p[a] ? b : a));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5, r = Math.hypot(dx, dy) / (S / 2);
      let v = r < 1 && r > 0.92 ? 0.5 : 0, accent = false;
      TRAITS.forEach((t, k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3, share = total ? p[t] / total : 1 / 3;
        const cx = Math.cos(a) * 0.42, cy = Math.sin(a) * 0.42, rad = 0.12 + 0.38 * Math.sqrt(share);
        const q = Math.hypot(dx / (S / 2) - cx, dy / (S / 2) - cy) / rad;
        if (q < 1) v = Math.max(v, 1 - q * 0.75);
        if (total && t === best && q < 0.22) accent = true;
      });
      const c = accent ? RED : v > 0.6 + 0.3 * threshold(x, y) ? pale : v > threshold(x, y) ? ink : r < 1 && 0.08 > threshold(x, y) ? dim : BG;
      const i = (y * S + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [p.patient, p.greedy, p.curious]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={S} height={S} className="scriptorium-emblem" />;
});

function Question({ slot }: { slot: number }) {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const qi = game.challenges.scriptorium.queue[slot];
  if (qi === undefined) return null;
  const q = QUESTIONS[qi];
  return (
    <div className="scriptorium-q">
      <p className="scriptorium-caption">"{q.q.toUpperCase()}"</p>
      <div className="ch-row">
        {q.a.map((a, k) => <button key={k} className="secondary" onClick={() => run(s => answer(s, slot, k))}>{a.text}</button>)}
      </div>
    </div>
  );
}

function LoudBar() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const c = game.challenges.scriptorium, cap = loudCap(game);
  return (
    <div className="scriptorium-loud">
      <div className="scriptorium-bar" title={`Loudness ${Math.floor(c.loud)} of ${Math.floor(cap)}. Louder walls, more ash.`}>
        <span style={{ width: `${(c.loud / cap) * 100}%` }} />
        <b>loud {Math.floor(c.loud)} · ash x{loudMult(game).toFixed(2)}</b>
      </div>
      <button disabled={c.loud < 1} onClick={() => run(hush)} title="Bank the loudness as silence. It grows back.">
        Hush <span className="cost">+{Math.floor(c.loud)}</span>
      </button>
    </div>
  );
}

export function ScriptoriumPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  const c = game.challenges.scriptorium;
  const data = stream(game);
  return (
    <div className="scriptorium" data-nodrag>
      <button className="scriptorium-window" onClick={() => setOpen(true)} aria-label="Open the scriptorium">
        <GlyphLine data={data} loud={Math.min(1, c.loud / loudCap(game))} />
      </button>
      <div className="ch-row">
        <span className="ch-stat"><b>{glyphsSolved(game)}</b> glyphs</span>
        <span className="ch-stat"><b>{c.sentences}</b> sentences</span>
        <span className="ch-stat"><b>{foremen(game)}</b>/9 foremen</span>
        <span className="ch-stat"><b>{fmt(c.silence)}</b> silence</span>
      </div>
      <LoudBar />
      {c.queue.length > 0 && <Question slot={0} />}
      <button className="max-all" onClick={() => setOpen(true)}>
        Open the scriptorium{Math.floor(c.hints) > 0 ? ` · ${Math.floor(c.hints)} hint${Math.floor(c.hints) > 1 ? 's' : ''}` : ''}
      </button>
      {open && <ScriptoriumRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- the room

function Cipher() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const [sel, setSel] = useState<number | null>(null);
  const c = game.challenges.scriptorium, L = lay(game), n = wordsHeard(game);
  const conf = useMemo(() => new Set(c.conf), [c.conf, c.conf.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const heard = heardGlyphs(game);
  const give = giveRate(game);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (sel === null || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) { run(s => assign(s, sel, e.key.toLowerCase())); e.preventDefault(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { run(s => assign(s, sel, '')); e.preventDefault(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sel, run]);
  useEffect(() => { if (sel !== null && conf.has(sel)) setSel(null); }, [sel, conf]);

  const used = new Map<string, number>();
  c.guess.forEach((l, g) => { if (l) used.set(l, g); });
  const cell = (g: number, k: number) => (
    <button key={k} className={`scriptorium-cell ${conf.has(g) ? 'ok' : ''} ${sel === g ? 'sel' : ''}`} disabled={conf.has(g)}
      onClick={() => setSel(sel === g ? null : g)} title={conf.has(g) ? 'Confirmed' : 'Pick a letter for this glyph'}>
      <Glyph shape={L.shapes[g]} />
      <span>{c.guess[g] || '·'}</span>
    </button>
  );
  const sentences = L.sentWords.map((ws, j) => ({ j, ws: ws.filter(i => i < n) })).filter(x => x.ws.length);

  return (
    <section className="scriptorium-col scriptorium-cipher">
      <h3 className="sub-head">The walls <small>hand {c.stratum + 1} · {c.done.length}/{L.sentWords.length} sentences</small></h3>
      <div className="scriptorium-text" data-scroll>
        {sentences.map(({ j, ws }) => (
          <div key={j} className={`scriptorium-sentence ${c.done.includes(j) ? 'done' : ''}`}>
            {ws.map(i => <span key={i} className="scriptorium-word">{L.words[i].glyphs.map(cell)}</span>)}
            {ws.length < L.sentWords[j].length && <span className="scriptorium-more dim">…</span>}
          </div>
        ))}
      </div>
      <div className="scriptorium-keys">
        {'abcdefghijklmnopqrstuvwxyz'.split('').map(l => {
          const g = used.get(l), locked = g !== undefined && conf.has(g);
          return (
            <button key={l} className={`secondary ${g !== undefined ? 'used' : ''}`} disabled={sel === null || locked}
              onClick={() => sel !== null && run(s => assign(s, sel, l))}>{l}</button>
          );
        })}
        <button className="secondary" disabled={sel === null || !c.guess[sel ?? 0]} onClick={() => sel !== null && run(s => assign(s, sel, ''))}>clear</button>
      </div>
      <p className="dim small-note">
        {sel === null ? 'Pick a glyph, then a letter (or type it). A word that comes out right is confirmed.' : 'Type a letter. Backspace clears.'}
        {' '}Glyphs seen: {heard.size}. Right guesses raise ash x{glyphMult(game).toFixed(2)}.
      </p>
      <div className="ch-row">
        <button disabled={c.hints < 1} onClick={() => run(askWalls)}>Ask the walls <span className="cost">{Math.floor(c.hints)}/{HINT_CAP}</span></button>
        <span className="ch-stat dim">
          {c.hints < HINT_CAP ? `next hint ${fmtTime((1 - (c.hints % 1)) * HINT_SECS / give)}` : 'past three, they write themselves in'}
          {n < L.words.length ? ` · next word ${fmtTime((1 - (c.heard % 1)) * WORD_SECS / give)}` : ''}
        </span>
      </div>
      {c.lore.length > 0 && <>
        <h3 className="sub-head">Transcribed <small>{c.lore.length}/{POOL.length}</small></h3>
        <ul className="scriptorium-lore" data-scroll>
          {c.lore.slice().reverse().map(p => <li key={p}>"{POOL[p].toUpperCase()}."</li>)}
        </ul>
      </>}
    </section>
  );
}

function Voices() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const c = game.challenges.scriptorium;
  const seatOf = (id: number) => c.seats.indexOf(id);
  return (
    <section className="scriptorium-col">
      <h3 className="sub-head">Foremen <small>{foremen(game)}/9 · x{foremanStrength(game).toFixed(2)} strength</small></h3>
      <ul className="scriptorium-seats">
        {ZONES.map((z, i) => {
          const id = c.seats[i], v = c.voices.find(x => x.id === id);
          return (
            <li key={i}>
              <span className="scriptorium-zone" style={{ color: ZONE_COLORS[i] }}>{i + 1} {z.name}</span>
              <select value={v ? v.id : -1} onChange={e => run(s => (+e.target.value < 0 ? unseat(s, i) : seat(s, i, +e.target.value)))}>
                <option value={-1}>empty</option>
                {c.voices.map(x => <option key={x.id} value={x.id}>{x.name}{x.spec === i ? ' ★' : ''}{seatOf(x.id) >= 0 && seatOf(x.id) !== i ? ` (at ${seatOf(x.id) + 1})` : ''}</option>)}
              </select>
              <b className="ch-stat">{v ? `x${foremanMult(game, i).toFixed(2)}` : ''}</b>
            </li>
          );
        })}
      </ul>
      <h3 className="sub-head">Voices <small>{c.voices.length}/{rosterCap(game)} · tally {c.tally}</small></h3>
      <ul className="scriptorium-voices" data-scroll>
        {c.voices.map(v => (
          <li key={v.id}>
            <div>
              <b>{v.name}</b> <span className="dim">{v.era}</span>
              <span className="scriptorium-spec">knew the {ZONES[v.spec].name} · voice {v.q.toFixed(2)}{seatOf(v.id) >= 0 ? ` · foreman of ${seatOf(v.id) + 1}` : ''}</span>
            </div>
            <div className="ch-row">
              <button className="secondary" onClick={() => run(s => retire(s, v.id, 'silence'))} title="Let it go quiet">Quiet <span className="cost">+{retireSilence(v)}</span></button>
              <button className="secondary" onClick={() => run(s => retire(s, v.id, 'tally'))} title="Count it. Every foreman grows a little stronger, for good.">Tally</button>
            </div>
          </li>
        ))}
        {!c.voices.length && <li className="dim">Nobody yet. Keep listening.</li>}
      </ul>
      {c.voices.length >= rosterCap(game) && <p className="dim small-note">The roster is full. New voices wait until a chair is free.</p>}
    </section>
  );
}

function Silence() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const c = game.challenges.scriptorium;
  const lean = leaning(game);
  return (
    <section className="scriptorium-col">
      <h3 className="sub-head">Silence <small>{fmt(c.silence)}</small></h3>
      <LoudBar />
      <div className="scriptorium-ups">
        {UPGRADES.map(u => (
          <button key={u.id} disabled={c.silence < upCost(game, u.id)} onClick={() => run(s => buyUp(s, u.id))} title={u.desc}>
            <span>{u.name} <small>lv {upLevel(game, u.id)}</small><i>{u.desc}</i></span><span className="cost">{fmt(upCost(game, u.id))}</span>
          </button>
        ))}
      </div>
      <h3 className="sub-head">The confessional</h3>
      <div className="scriptorium-profile">
        <Emblem p={c.prof} />
        <ul>
          {TRAITS.map(t => <li key={t} className={lean === t ? 'lean' : ''}><b>{t}</b> {c.prof[t]} <span className="dim">· {TRAIT_TEXT[t]}</span></li>)}
        </ul>
      </div>
      {c.queue.length ? c.queue.map((_, k) => <Question key={k} slot={k} />) : <p className="dim small-note">The walls have nothing to ask. They will.</p>}
    </section>
  );
}

function ScriptoriumRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const c = game.challenges.scriptorium;
  return (
    <ChallengeRoom zone={ZONE} title="The Scriptorium" note="the walls speak in the voice of whoever dug them" onClose={onClose}
      stat={<><b>{glyphsSolved(game)}</b> glyphs · <b>{fmt(c.silence)}</b> silence</>}>
      <div className="scriptorium-cols">
        <Cipher />
        <Voices />
        <Silence />
      </div>
      <p className="scriptorium-caption dim">"WE WROTE IT DOWN SO IT WOULD STOP."</p>
    </ChallengeRoom>
  );
}
