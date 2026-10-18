// The Scriptorium: the panel inside the zone 8 box, and the room behind it.
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  answer, askWalls, GREEDY_K, assign, buyUp, foremanMult, foremanStrength, foremen, giveRate, glyphMult, glyphsSolved, heardGlyphs, HINT_CAP, HINT_SECS,
  hush, lay, leaning, loudCap, loudMult, POOL, QUESTIONS, retire, retireSilence, rosterCap, seat, TRAIT_TEXT, TRAITS, traitMult, unseat, upCost,
  UPGRADES, upLevel, wordsHeard, WORD_SECS, GW, GH, type Trait,
} from '../../game/challenges/scriptorium';
import { ZONES } from '../../game/data';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import type { GameState } from '../../game/state';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function Head({ cap, note, title }: { cap: string; note?: ReactNode; title?: string }) {
  return <div className="sc-head"><span className="sc-cap">"{cap}"</span>{note !== undefined && <span className="sc-head-note" title={title}>{note}</span>}</div>;
}

/** Three candles: one lit per banked hint, the next one filling with wax. */
function Candles({ hints }: { hints: number }) {
  const full = Math.floor(hints), part = hints % 1;
  return (
    <svg className="sc-candles" viewBox="0 0 66 40" aria-hidden>
      {Array.from({ length: HINT_CAP }, (_, i) => {
        const x = 6 + i * 21, lit = i < full, wax = lit ? 1 : i === full ? part : 0, h = 4 + 18 * wax;
        return (
          <g key={i} className={`sc-candle${lit ? ' lit' : ''}`}>
            <rect x={x} y={16} width={12} height={22} className="sc-candle-ghost" />
            <rect x={x} y={38 - h} width={12} height={h} className="sc-candle-wax" />
            <line x1={x + 6} y1={38 - h} x2={x + 6} y2={35 - h} className="sc-candle-wick" />
            {lit && <path d={`M${x + 6} ${22 - 18} q5 7 0 10 q-5 -3 0 -10z`} className="sc-flame" />}
          </g>
        );
      })}
      <line x1="2" y1="38.5" x2="64" y2="38.5" className="sc-candle-sill" />
    </svg>
  );
}

function Walls() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<number | null>(null);
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
  // how often each glyph shows up in what has been heard
  const count = new Array(26).fill(0);
  L.words.slice(0, n).forEach(w => w.glyphs.forEach(g => { count[g]++; }));

  const heardIn = (j: number) => L.sentWords[j].filter(i => i < n);
  const auto = (() => {
    const open = L.sentWords.findIndex((_, j) => !c.done.includes(j) && heardIn(j).length > 0);
    if (open >= 0) return open;
    let last = 0;
    L.sentWords.forEach((_, j) => { if (heardIn(j).length) last = j; });
    return last;
  })();
  const j = tab !== null && tab < L.sentWords.length && heardIn(tab).length ? tab : auto;
  const ws = heardIn(j), done = c.done.includes(j);

  const cell = (g: number, k: number) => (
    <button key={k} className={`scriptorium-cell sc-cell ${conf.has(g) ? 'ok' : ''} ${sel === g ? 'sel' : ''}`} disabled={conf.has(g)}
      onClick={() => setSel(sel === g ? null : g)} title={conf.has(g) ? 'Confirmed' : 'Pick a letter for this glyph'}>
      <Glyph shape={L.shapes[g]} />
      <span>{c.guess[g] || '·'}</span>
    </button>
  );

  return (
    <section className="sc-col sc-walls" aria-label="The walls">
      <Head cap="THE WALLS" note={`hand ${c.stratum + 1} · ${c.done.length}/${L.sentWords.length} sentences`} />
      <div className="sc-tabs" role="tablist">
        {L.sentWords.map((all, k) => {
          const h = heardIn(k).length, d = c.done.includes(k);
          return (
            <button key={k} role="tab" aria-selected={k === j} className={`sc-tab${k === j ? ' now' : ''}${d ? ' done' : ''}`} disabled={!h}
              onClick={() => setTab(k)} title={d ? 'Solved' : h ? `${h} of ${all.length} words heard` : 'Not heard yet'}>
              <b>{ROMAN[k]}</b>
              <span className="sc-tab-pips">{all.map((_, q) => <i key={q} className={q < h ? 'on' : ''} />)}</span>
            </button>
          );
        })}
      </div>
      <div className={`sc-tablet artwork-frame knots${done ? ' done' : ''}`}>
        <div className="sc-tablet-text">
          {ws.length ? <>
            {ws.map(i => <span key={i} className="scriptorium-word">{L.words[i].glyphs.map(cell)}</span>)}
            {ws.length < L.sentWords[j].length && <span className="scriptorium-more dim">…</span>}
          </> : <p className="sc-quiet">The walls are quiet. The first word comes in {fmtTime((1 - (c.heard % 1)) * WORD_SECS / give)}.</p>}
        </div>
        <p className={`sc-tablet-foot${done ? ' done' : ''}`}>
          {done ? `"${POOL[L.pool[j]].toUpperCase()}."` : sel === null ? 'Pick a glyph, then a letter (or type it).' : 'Type a letter. Backspace clears.'}
        </p>
      </div>
      <Head cap="THE KEY" note={`${heard.size}/26 glyphs heard`} title={`Right guesses raise ash x${glyphMult(game).toFixed(2)}. A word that comes out right is confirmed.`} />
      <div className="sc-key">
        {L.shapes.map((sh, g) => {
          const h = heard.has(g), ok = conf.has(g);
          return h ? (
            <button key={g} className={`sc-key-tile${ok ? ' ok' : ''}${sel === g ? ' sel' : ''}${c.guess[g] ? ' set' : ''}`} disabled={ok}
              onClick={() => setSel(sel === g ? null : g)} title={`${ok ? 'Confirmed · ' : ''}heard ${count[g]} time${count[g] === 1 ? '' : 's'}`}>
              <Glyph shape={sh} />
              <span>{c.guess[g] || '·'}</span>
            </button>
          ) : <span key={g} className="sc-key-tile none" title="Not heard yet" />;
        })}
      </div>
      <div className="sc-keys">
        {LETTERS.map(l => {
          const g = used.get(l), locked = g !== undefined && conf.has(g);
          return (
            <button key={l} className={`sc-letter${g !== undefined ? ' used' : ''}${locked ? ' locked' : ''}`} disabled={sel === null || locked}
              onClick={() => sel !== null && run(s => assign(s, sel, l))}>{l}</button>
          );
        })}
        <button className="sc-letter sc-clear" disabled={sel === null || !c.guess[sel ?? 0]} onClick={() => sel !== null && run(s => assign(s, sel, ''))}>clear</button>
      </div>
      <div className="sc-ask">
        <Candles hints={c.hints} />
        <button className="sc-btn" disabled={c.hints < 1} onClick={() => run(askWalls)} title="The walls give up their most common glyph">
          Ask the walls <span className="sc-cost">{Math.floor(c.hints)}/{HINT_CAP}</span>
        </button>
        <span className="sc-ask-note">
          {c.hints < HINT_CAP ? <span>next hint <b>{fmtTime((1 - (c.hints % 1)) * HINT_SECS / give)}</b></span>
            : <span title="Bank full: spare hints come slowly and write themselves in">hint bank full</span>}
          {n < L.words.length ? <span>next word <b>{fmtTime((1 - (c.heard % 1)) * WORD_SECS / give)}</b></span> : <span>every word heard</span>}
        </span>
      </div>
    </section>
  );
}

type Pick = { kind: 'voice'; id: number } | { kind: 'chair'; i: number } | null;

function Voices() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const [pick, setPick] = useState<Pick>(null);
  const [page, setPage] = useState(-1);
  const c = game.challenges.scriptorium;
  const seatOf = (id: number) => c.seats.indexOf(id);
  const voice = pick?.kind === 'voice' ? c.voices.find(v => v.id === pick.id) : undefined;
  const chair = pick?.kind === 'chair' ? pick.i : null;
  const full = c.voices.length >= rosterCap(game);

  const touchChair = (i: number) => {
    if (voice) { if (c.seats[i] !== voice.id) run(s => seat(s, i, voice.id)); setPick({ kind: 'chair', i }); }
    else setPick(chair === i ? null : { kind: 'chair', i });
  };
  const touchVoice = (id: number) => {
    if (chair !== null) { if (c.seats[chair] !== id) run(s => seat(s, chair, id)); setPick({ kind: 'voice', id }); }
    else setPick(voice?.id === id ? null : { kind: 'voice', id });
  };

  const lore = c.lore, pg = page < 0 || page >= lore.length ? lore.length - 1 : page;
  const seated = chair !== null ? c.voices.find(v => v.id === c.seats[chair]) : undefined;

  return (
    <section className="sc-col" aria-label="The foremen">
      <Head cap="THE FOREMEN" note={`${foremen(game)}/9 · x${foremanStrength(game).toFixed(2)} strength`} />
      <div className={`sc-chairs${voice ? ' seating' : ''}`}>
        {ZONES.map((z, i) => {
          const v = c.voices.find(x => x.id === c.seats[i]), star = voice && voice.spec === i;
          return (
            <button key={i} className={`sc-chair${v ? ' filled' : ''}${chair === i ? ' sel' : ''}${star ? ' star' : ''}${v && v.spec === i ? ' home' : ''}`}
              style={{ '--zc': ZONE_COLORS[i] } as CSSProperties} onClick={() => touchChair(i)}
              title={`${z.name}${v ? `: ${v.name}, x${foremanMult(game, i).toFixed(2)}` : ': empty chair'}${voice ? `. Touch to seat ${voice.name} here.` : ''}`}>
              <span className="sc-chair-name">{z.name}</span>
              <span className="sc-chair-low"><i>{i + 1}</i>{v ? <><span className="sc-initials">{v.name.split(' ').map(w => w[0]).join('')}{v.spec === i ? ' ★' : ''}</span><b>x{foremanMult(game, i).toFixed(2)}</b></> : <span className="dim">empty</span>}{star && <b className="sc-star">★</b>}</span>
            </button>
          );
        })}
      </div>
      <Head cap="THE VOICES" note={<>{c.voices.length}/{rosterCap(game)}{full ? ' · full' : ''} · tally {c.tally}</>}
        title={full ? 'The roster is full. New voices wait until a chair is free.' : undefined} />
      <div className={`sc-roster${c.voices.length > 10 ? ' dense' : ''}`}>
        {c.voices.map(v => {
          const at = seatOf(v.id);
          return (
            <button key={v.id} className={`sc-voice${voice?.id === v.id ? ' sel' : ''}${at >= 0 ? ' seated' : ''}`} onClick={() => touchVoice(v.id)}
              style={{ '--zc': ZONE_COLORS[v.spec] } as CSSProperties} title={`${v.name}, ${v.era}. Knew the ${ZONES[v.spec].name}.`}>
              <i className="sc-voice-swatch" />
              <span className="sc-voice-name">{v.name}</span>
              <span className="sc-voice-q">{at >= 0 ? <b>@{at + 1}</b> : v.q.toFixed(2)}</span>
            </button>
          );
        })}
        {!c.voices.length && <p className="sc-empty">Nobody yet. Keep listening.</p>}
      </div>
      <div className="sc-card">
        {voice ? <>
          <div className="sc-card-top" style={{ '--zc': ZONE_COLORS[voice.spec] } as CSSProperties}>
            <b>{voice.name}</b><span>{voice.era}</span>
          </div>
          <p className="sc-card-line">knew the <em>{ZONES[voice.spec].name}</em> · voice <b>{voice.q.toFixed(2)}</b>{seatOf(voice.id) >= 0 ? <> · <b>@{seatOf(voice.id) + 1}</b></> : ''}</p>
          <div className="sc-card-row">
            <span className="sc-card-hint">Touch a chair to seat them.</span>
            <button className="sc-btn small" onClick={() => { run(s => retire(s, voice.id, 'silence')); setPick(null); }} title="Let it go quiet">Quiet <span className="sc-cost">+{retireSilence(voice)}</span></button>
            <button className="sc-btn small" onClick={() => { run(s => retire(s, voice.id, 'tally')); setPick(null); }} title="Count it. Every foreman grows a little stronger, for good.">Tally</button>
          </div>
        </> : chair !== null ? <>
          <div className="sc-card-top" style={{ '--zc': ZONE_COLORS[chair] } as CSSProperties}>
            <b>Chair {chair + 1}</b><span>{ZONES[chair].name}</span>
          </div>
          <p className="sc-card-line">{seated ? <>{seated.name}{seated.spec === chair ? ' ★' : ''} · <b>x{foremanMult(game, chair).toFixed(2)}</b></> : 'Nobody sits here.'}</p>
          <div className="sc-card-row">
            <span className="sc-card-hint">Touch a voice to seat them here.</span>
            <button className="sc-btn small" disabled={!seated} onClick={() => run(s => unseat(s, chair))} title="Empty the chair">Empty</button>
          </div>
        </> : <p className="sc-card-hint idle">Touch a voice, then a chair, to make a foreman. ★ marks the zone a voice knew.</p>}
      </div>
      <Head cap="TRANSCRIBED" note={`${lore.length}/${POOL.length}`} />
      <div className="sc-slip">
        {lore.length ? <>
          <span className="sc-slip-no">No. {pg + 1}</span>
          <p className="sc-slip-text">"{POOL[lore[pg]].toUpperCase()}."</p>
          <span className="sc-turn">
            <button className="sc-pm" disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="Earlier line">‹</button>
            <button className="sc-pm" disabled={pg >= lore.length - 1} onClick={() => setPage(pg + 1)} aria-label="Later line">›</button>
          </span>
        </> : <p className="sc-slip-text dim">Nothing written down yet.</p>}
      </div>
    </section>
  );
}

/** The confessional: an arched lattice window with the emblem behind it. */
function Booth({ p }: { p: Record<Trait, number> }) {
  return (
    <div className="sc-booth">
      <svg viewBox="0 0 100 120" className="sc-booth-svg" aria-hidden>
        <defs>
          <pattern id="sc-lattice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" className="sc-lattice-bg" /><rect width="1.4" height="8" className="sc-lattice-bar" /><rect width="8" height="1.4" className="sc-lattice-bar" />
          </pattern>
          <clipPath id="sc-arch"><path d="M14 116 V48 A36 36 0 0 1 86 48 V116 Z" /></clipPath>
        </defs>
        <path d="M14 116 V48 A36 36 0 0 1 86 48 V116 Z" fill="url(#sc-lattice)" />
        <circle cx="50" cy="66" r="25" className="sc-booth-hole" clipPath="url(#sc-arch)" />
        <path d="M6 118 V46 A44 44 0 0 1 94 46 V118" className="sc-booth-outer" />
        <path d="M14 116 V48 A36 36 0 0 1 86 48 V116" className="sc-booth-inner" />
        <path d="M50 2 v8 M46 6 h8" className="sc-booth-cross" />
        <line x1="2" y1="118.5" x2="98" y2="118.5" className="sc-booth-sill" />
      </svg>
      <Emblem p={p} />
    </div>
  );
}

function Silence() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const c = game.challenges.scriptorium;
  const lean = leaning(game);
  const top = Math.max(4, ...TRAITS.map(t => c.prof[t]));
  const data = stream(game);
  return (
    <section className="sc-col" aria-label="Silence">
      <Head cap="THE HORN" note="what the walls are saying" />
      <div className="sc-horn artwork-frame knots"><GlyphLine data={data} loud={Math.min(1, c.loud / loudCap(game))} /></div>
      <Head cap="SILENCE" note="spend it on the room" />
      <div className="sc-ups">
        {UPGRADES.map(u => {
          const lv = upLevel(game, u.id), cost = upCost(game, u.id);
          return (
            <button key={u.id} className="sc-up" disabled={c.silence < cost} onClick={() => run(s => buyUp(s, u.id))} title={u.desc}>
              <span className="sc-up-name">{u.name}</span>
              <span className="sc-up-low"><small>lv {lv}</small><span className="sc-cost">{fmt(cost)}</span></span>
            </button>
          );
        })}
      </div>
      <Head cap="THE CONFESSIONAL" note={lean ? `you lean ${lean}` : 'no leaning yet'} />
      <div className="sc-confess">
        <Booth p={c.prof} />
        <ul className="sc-traits">
          {TRAITS.map(t => (
            <li key={t} className={lean === t ? 'lean' : ''} title={`${t}: ${TRAIT_TEXT[t]}`}>
              <span className="sc-trait-top"><b>{t}</b><span className="sc-trait-text">{TRAIT_TEXT[t]}</span><em>{c.prof[t]}</em></span>
              <span className="sc-trait-bar"><i style={{ width: `${(c.prof[t] / top) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      </div>
      {c.queue.length ? <RoomQuestion more={c.queue.length - 1} /> : <p className="sc-empty">The walls have nothing to ask. They will.</p>}
    </section>
  );
}

function RoomQuestion({ more }: { more: number }) {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const q = QUESTIONS[game.challenges.scriptorium.queue[0]];
  if (!q) return null;
  return (
    <div className="sc-q">
      <p className="sc-q-text">"{q.q.toUpperCase()}"{more > 0 && <small> +{more} waiting</small>}</p>
      <div className="sc-q-answers">
        {q.a.map((a, k) => <button key={k} className="sc-btn small" onClick={() => run(s => answer(s, 0, k))}>{a.text}</button>)}
      </div>
    </div>
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
  const run = useGame(st => st.run);
  const c = game.challenges.scriptorium;
  const ashX = glyphMult(game) * loudMult(game) * traitMult(game, 'greedy', GREEDY_K);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Glyphs', value: glyphsSolved(game), rate: `${c.sentences} sentences`, title: `Right guesses raise ash x${glyphMult(game).toFixed(2)}` },
        { label: 'Loudness', value: `${Math.floor(c.loud)}/${Math.floor(loudCap(game))}`, rate: `ash x${loudMult(game).toFixed(2)}`, title: 'Louder walls, more ash. Hush to bank it as silence.' },
        { label: 'Silence', value: fmt(c.silence), rate: `${c.hushes} hushes` },
        { label: 'Foremen', value: `${foremen(game)}/9`, rate: `x${foremanStrength(game).toFixed(2)} strength` },
        { label: 'All ash', value: `x${ashX.toFixed(2)}`, rate: 'glyphs, loud, greed', title: 'Glyphs, loudness and a greedy heart, together' },
      ]}
      buy={{
        label: 'Hush', cost: Math.floor(c.loud), unit: 'loud', afford: c.loud >= 1, onClick: () => run(hush),
        title: 'Bank the loudness as silence. It grows back.',
      }}
    />
  );
  return (
    <ChallengeRoom zone={ZONE} title="The Scriptorium" note="the walls speak in the voice of whoever dug them" onClose={onClose}
      className="scriptorium-room" status={status}>
      <div className="sc-grid">
        <Walls />
        <Voices />
        <Silence />
      </div>
    </ChallengeRoom>
  );
}
