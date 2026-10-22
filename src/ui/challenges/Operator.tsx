// The Operator: the panel inside the zone 7 box (the reader) and its room (the editor, the moths, the banks).
import { useEffect, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react';
import { ZONES } from '../../game/data';
import { fmt } from '../../game/format';
import { useGame } from '../../game/store';
import { FREQS } from '../../game/systems';
import {
  activeSlots, addLine, bankCost, bankSignal, basePay, buyBank, buyClock, buyStack, clockCost, clockNeed, CONDS, depthOf, GOAL_LINES,
  lineBits, lineText, loadCard, MAX_BANKS, MAX_CARDS, MAX_LINES, moveLine, mothTax, operator, OPS, punchCard, punchCost,
  readerSlots, removeLine, setBank, setLine, setRunning, SOURCES, stackCost, swat, beatRate, type Cond, type Join, type Line, type Op,
} from '../../game/challenges/operator';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus } from './ChallengeSlot';
import './operator.css';

const ZONE = 6;
const HUE = ZONE_COLORS[ZONE];
const BG: RGB = [5, 6, 11];
const ACC: RGB = [255, 42, 42];
type RGB = [number, number, number];

// The card, in canvas pixels: a notch, eight line columns, twelve bit rows.
const COL = 9, X0 = 7, Y0 = 4, ROW = 3;
const CW = X0 + MAX_LINES * COL + 3, CH = Y0 + 12 * ROW + 4;

const mixRgb = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB;

/** Where a moth flutters right now, in card pixels. */
function mothPos(id: number, l: number, t: number) {
  return {
    x: X0 + l * COL + COL / 2 + Math.sin(t * 2.3 + id * 1.7) * 3.5,
    y: Y0 + 6 + ((id * 7) % 26) + Math.cos(t * 1.9 + id) * 3,
    flap: Math.floor(t * 9 + id) % 2,
  };
}

/**
 * One punch card as a dithered strip of holes: each line a column, its opcode, argument and gate punched
 * as twelve bits. The line the reader is on burns red; moths flutter over the lines they nest in.
 */
function PunchCard({ card, slot, onSwat, className }: { card: number; slot?: number; onSwat?: (id: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(CW, CH);
    const d = img.data;
    const hue = hex(HUE);
    const pal: RGB[] = [mixRgb(hue, BG, 0.85), mixRgb(hue, BG, 0.55), hue, mixRgb(hue, [255, 255, 255], 0.55)];
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const put = (x: number, y: number, col: RGB) => {
      if (x < 0 || y < 0 || x >= CW || y >= CH) return;
      const i = (y * CW + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    };
    const draw = (ms: number) => {
      if (ms - last >= 1000 / 10) {
        last = ms;
        const t = ms / 1000;
        tRef.current = t;
        const st = useGame.getState().game.challenges.operator;
        const cd = st.cards[card];
        const n = cd?.lines.length ?? 0;
        const p = slot !== undefined ? st.ptrs[slot] : undefined;
        const at = p && st.running && p.atC === card ? p.atL : -1;
        const bits = (cd?.lines ?? []).map(lineBits);
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
          const i = (y * CW + x) * 4;
          // the clipped corner every punch card has
          if (x + y < 6 || x === 0 || y === 0 || x === CW - 1 || y === CH - 1) {
            const edge = x + y >= 6 && (x === 0 || y === 0 || x === CW - 1 || y === CH - 1);
            const col = edge ? pal[1] : BG;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = edge ? 255 : 0;
            continue;
          }
          const l = Math.floor((x - X0) / COL);
          const used = l >= 0 && l < n;
          let v = 0.42 + 0.22 * (x / CW) - 0.12 * (y / CH) + 0.05 * Math.sin(t * 0.7 + x * 0.3);
          if (!used && x >= X0) v *= 0.45;
          const s = Math.max(0, Math.min(1, v)) * 2, lo = Math.floor(s);
          let col = pal[Math.min(2, lo + (s - lo > threshold(x, y) ? 1 : 0))];
          if (l === at && x >= X0 && (x + y + Math.floor(t * 6)) % 3 === 0) col = ACC;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
        }
        // the holes
        bits.forEach((b, l) => {
          for (let r = 0; r < 12; r++) {
            const hx = X0 + l * COL + 2, hy = Y0 + r * ROW;
            const on = (b >> r) & 1;
            for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 5; xx++) {
              if (on) put(hx + xx, hy + yy, l === at ? mixRgb(ACC, BG, 0.4) : BG);
              else if (xx === 2 && yy === 0 && threshold(hx, hy) > 0.5) put(hx + xx, hy + yy, pal[1]);
            }
          }
        });
        // moths
        for (const m of st.moths) {
          if (m.c !== card) continue;
          const q = mothPos(m.id, Math.min(m.l, MAX_LINES - 1), t);
          const x = Math.round(q.x), y = Math.round(q.y);
          put(x, y, ACC); put(x, y + 1, ACC);
          const w = pal[3];
          if (q.flap) { put(x - 1, y - 1, w); put(x - 2, y - 1, w); put(x + 1, y - 1, w); put(x + 2, y - 1, w); put(x - 1, y, w); put(x + 1, y, w); }
          else { put(x - 1, y, w); put(x - 2, y + 1, w); put(x + 1, y, w); put(x + 2, y + 1, w); }
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
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [card, slot]);

  const click = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onSwat) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * CW, y = (e.clientY - r.top) / r.height * CH;
    const st = useGame.getState().game.challenges.operator;
    let best = -1, bd = 6;
    for (const m of st.moths) {
      if (m.c !== card) continue;
      const q = mothPos(m.id, Math.min(m.l, MAX_LINES - 1), tRef.current);
      const dd = Math.hypot(q.x - x, q.y - y);
      if (dd < bd) { bd = dd; best = m.id; }
    }
    if (best >= 0) onSwat(best);
  };

  return <canvas ref={ref} width={CW} height={CH} className={`operator-card ${onSwat ? 'operator-huntable' : ''} ${className ?? ''}`} data-nodrag onClick={click} />;
}

/** The reader as it sits in the zone box: card strips, run or pause, the burn. */
export function OperatorPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [open, setOpen] = useState(false);
  const st = game.challenges.operator;
  const slots = readerSlots(game);
  const pay = operator.mult(game, 'zone6');
  return (
    <div className="operator">
      <div className="ch-row operator-stats">
        <span className="ch-stat">Lines <b>{fmt(Math.floor(st.lines))}</b>{st.lines < GOAL_LINES && <span className="dim"> / {fmt(GOAL_LINES)}</span>}</span>
        <span className="ch-stat">Burn <b>{fmt(st.burn)}</b> cyc/s</span>
        <span className="ch-stat">{ZONES[ZONE].name} <b>×{pay.toFixed(2)}</b></span>
      </div>
      <div className="operator-reader" data-scroll>
        {Array.from({ length: slots }, (_, i) => {
          const c = st.reader[i] ?? -1;
          const cd = st.cards[c];
          const p = st.ptrs[i];
          const ln = cd && p && p.atC >= 0 ? st.cards[p.atC]?.lines[p.atL] : undefined;
          return (
            <div key={i} className={`operator-slot ${cd ? '' : 'empty'}`}>
              {cd ? <PunchCard card={c} slot={i} /> : <div className="operator-card operator-blank" />}
              <div className="operator-slot-text">
                <span className="operator-name">{cd ? cd.name : 'EMPTY SLOT'}</span>
                <span className="dim operator-at">{cd ? (st.running && ln ? `${p.stack.length > 1 ? `[${p.stack.length - 1}] ` : ''}${lineText(st, ln)}` : 'idle') : 'load a card'}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ch-row">
        <button className={st.running ? 'secondary' : ''} onClick={() => run(s => setRunning(s, !st.running))}>{st.running ? 'Pause the reader' : 'Run the reader'}</button>
        <button className="secondary" onClick={() => setOpen(true)}>Open the operator</button>
        {st.moths.length > 0 && <span className="operator-moth-note">{st.moths.length} moth{st.moths.length > 1 ? 's' : ''} in the cards</span>}
      </div>
      <p className="operator-caption">{st.running ? '"IT IS READING. IT READS FASTER THAN IT WAS TAUGHT."' : '"THE READER IS COLD. THE CARDS ARE ALREADY PUNCHED."'}</p>
      {open && <OperatorRoom onClose={() => setOpen(false)} />}
    </div>
  );
}

const ARGS: Partial<Record<Op, (cards: string[], lines: number) => { v: number; t: string }[]>> = {
  BUY: () => ZONES.map((z, i) => ({ v: i, t: `${i + 1} ${z.name}` })),
  MAX: () => ZONES.map((z, i) => ({ v: i, t: `${i + 1} ${z.name}` })),
  TUNE: () => FREQS.map((f, i) => ({ v: i, t: `${f.band} ${f.name}` })),
  WAIT: () => Array.from({ length: 8 }, (_, i) => ({ v: i + 1, t: `${i + 1} beat${i ? 's' : ''}` })),
  JUMP: (_, n) => Array.from({ length: n }, (_, i) => ({ v: i, t: `line ${i}` })),
  CALL: cards => cards.map((c, i) => ({ v: i, t: c })),
};
const DEFAULT_ARG: Partial<Record<Op, number>> = { WAIT: 1, BUY: 0, MAX: 0 };
const OP_HELP: Record<Op, string> = {
  NOP: 'Does nothing. Moths like it.', BUY: 'Buys one shaft in a zone.', MAX: 'Max-all for a zone, if you have opened it.',
  FEED: 'Feeds every hungry creature.', SING: 'Sings to the whole brood.', CATCH: 'Catches the warm flake, if one is falling.',
  TUNE: 'Tunes the dial to a frequency you have found.', WAIT: 'Idles for some beats. Moths like it.', JUMP: 'Goes to a line.',
  CALL: 'Runs another card, then comes back. Each level deepens the stack.', IF: 'Skips the next line unless the gate is open.',
};

function LineEditor({ c, l, line, cards, n, at }: { c: number; l: number; line: Line; cards: string[]; n: number; at?: boolean }) {
  const run = useGame(st => st.run);
  const set = (ln: Line) => run(s => setLine(s, c, l, ln));
  const setCond = (patch: Partial<Cond>) => set({ ...line, cond: { ...line.cond!, ...patch } });
  const args = ARGS[line.op]?.(cards, n);
  return (
    <div className={`op-line${at ? ' at' : ''}${line.op === 'WAIT' || line.op === 'NOP' ? ' idle' : ''}`}>
      <span className="op-ln" title={at ? 'The reader is on this line' : undefined}>{l}</span>
      <select className="op-op" value={line.op} title={OP_HELP[line.op]} onChange={e => { const o = e.target.value as Op; set({ op: o, arg: DEFAULT_ARG[o] ?? 0 }); }}>
        {OPS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {args && <select className="op-arg" value={line.arg} onChange={e => set({ ...line, arg: Number(e.target.value) })}>{args.map(a => <option key={a.v} value={a.v}>{a.t}</option>)}</select>}
      {line.op === 'IF' && line.cond && <>
        <button className={`op-not ${line.cond.na ? 'on' : ''}`} title="Invert this gate" onClick={() => setCond({ na: !line.cond!.na })}>NOT</button>
        <select value={line.cond.a} onChange={e => setCond({ a: e.target.value })}>{CONDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
        <select className="op-join" value={line.cond.join} onChange={e => setCond({ join: e.target.value as Join })}>
          <option value="">·</option><option value="AND">AND</option><option value="OR">OR</option>
        </select>
        {line.cond.join && <>
          <button className={`op-not ${line.cond.nb ? 'on' : ''}`} title="Invert this gate" onClick={() => setCond({ nb: !line.cond!.nb })}>NOT</button>
          <select value={line.cond.b} onChange={e => setCond({ b: e.target.value })}>{CONDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
        </>}
      </>}
      <span className="op-line-tools">
        <button aria-label="Move up" title="Move up" disabled={l === 0} onClick={() => run(s => moveLine(s, c, l, -1))}>↑</button>
        <button aria-label="Move down" title="Move down" disabled={l === n - 1} onClick={() => run(s => moveLine(s, c, l, 1))}>↓</button>
        <button aria-label="Delete line" title="Delete line" disabled={n <= 1} onClick={() => run(s => removeLine(s, c, l))}>×</button>
      </span>
    </div>
  );
}

/** A card in the cabinet, drawn small: its holes as a little grid, one column a line. */
function MiniHoles({ lines }: { lines: Line[] }) {
  const rects: JSX.Element[] = [];
  for (let l = 0; l < MAX_LINES; l++) {
    const b = l < lines.length ? lineBits(lines[l]) : 0;
    for (let r = 0; r < 12; r++) {
      const on = (b >> r) & 1;
      if (on) rects.push(<rect key={`${l}-${r}`} x={l * 4 + 1} y={r * 2} width={2.4} height={1.3} className="op-hole" />);
      else if (l < lines.length && (l + r) % 3 === 0) rects.push(<rect key={`${l}-${r}`} x={l * 4 + 1.8} y={r * 2 + 0.3} width={0.8} height={0.7} className="op-pin" />);
    }
  }
  return <svg className="op-mini" viewBox="0 0 32 24" preserveAspectRatio="none" aria-hidden>{rects}</svg>;
}

/** The clock: twelve ticks, a hand that steps once a beat, an arc for the work it wants before the next gear. */
function ClockDial({ gear, beat, running, learn }: { gear: number; beat: number; running: boolean; learn: number }) {
  const R = 44, arc = 2 * Math.PI * (R + 6);
  return (
    <svg className={`op-dial${running ? ' run' : ''}`} viewBox="-60 -60 120 120" aria-hidden style={{ '--beat-dur': `${(12 / Math.max(0.01, beat)).toFixed(2)}s` } as CSSProperties}>
      <circle r={R + 6} className="op-dial-track" />
      <circle r={R + 6} className="op-dial-arc" strokeDasharray={`${arc * Math.max(0, Math.min(1, learn))} ${arc}`} transform="rotate(-90)" />
      <circle r={R} className="op-dial-face" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
        return <line key={i} x1={Math.sin(a) * (R - (big ? 9 : 5))} y1={-Math.cos(a) * (R - (big ? 9 : 5))} x2={Math.sin(a) * (R - 2)} y2={-Math.cos(a) * (R - 2)} className={`op-dial-tick${big ? ' big' : ''}`} />;
      })}
      <g className="op-dial-hand"><line x1={0} y1={6} x2={0} y2={-R + 10} /><rect x={-2} y={-R + 8} width={4} height={4} /></g>
      <circle r={3.5} className="op-dial-hub" />
      <text y={22} className="op-dial-gear">{gear}</text>
    </svg>
  );
}

/** The stack, as plates: one per level the limit allows, lit as deep as the chosen card reaches. */
function StackTower({ limit, reach }: { limit: number; reach: number }) {
  const n = Math.min(limit, 10), h = 78 / Math.max(n, 4);
  return (
    <svg className="op-tower" viewBox="0 0 90 100" aria-hidden>
      <rect x={6} y={92} width={78} height={5} className="op-tower-base" />
      {Array.from({ length: n }, (_, i) => {
        const w = 70 - i * (30 / Math.max(1, n));
        return <rect key={i} x={45 - w / 2} y={90 - (i + 1) * h + 1.5} width={w} height={h - 3} className={`op-plate${i < reach ? ' lit' : ''}`} />;
      })}
      {limit > n && <text x={45} y={8} className="op-tower-more">+{limit - n}</text>}
    </svg>
  );
}

const PAGE = 9;

function OperatorRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const st = game.challenges.operator;
  const [sel, setSel] = useState(0);
  const c = Math.min(sel, st.cards.length - 1);
  const [page, setPage] = useState(0);
  const card = st.cards[c];
  const names = st.cards.map(k => k.name);
  const slots = readerSlots(game);
  const cyc = game.wiring.cycles;
  const sc = stackCost(st), bc = bankCost(st);
  const memo = new Map<number, number>();
  const live = activeSlots(game).length;
  const mothsHere = st.moths.filter(m => m.c === c).length;
  const ck = clockCost(st), cn = clockNeed(st);
  const readSlot = st.reader.findIndex((r, i) => r === c && i < slots);
  const ptr = readSlot >= 0 ? st.ptrs[readSlot] : undefined;
  const atLine = st.running && ptr && ptr.atC === c ? ptr.atL : -1;
  const pages = Math.max(1, Math.ceil(st.cards.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const pick = (i: number) => { setSel(i); setPage(Math.floor(i / PAGE)); };
  const reach = depthOf(st, c, memo);
  const wired = st.banks.filter(Boolean).length;
  const status = (
    <RoomStatus
      stats={[
        { label: 'Lines', value: fmt(Math.floor(st.lines)), rate: st.lines < GOAL_LINES ? `of ${fmt(GOAL_LINES)}` : `x${basePay(st).toFixed(2)} pay`, title: 'Lines the reader has executed' },
        { label: 'Beat', value: `${beatRate(st).toFixed(2)}/s`, rate: `x ${live} card${live === 1 ? '' : 's'}` },
        { label: 'Cycles', value: fmt(cyc), rate: <>−{fmt(st.burn)}/s{st.moths.length > 0 && ` (moths +${Math.round((mothTax(st) - 1) * 100)}%)`}</>, title: 'Cycles on hand, and what the reader burns' },
        { label: ZONES[ZONE].name, value: `x${operator.mult(game, 'zone6').toFixed(2)}`, rate: `ash x${operator.mult(game, 'ash').toFixed(2)} · cyc x${operator.mult(game, 'cycles').toFixed(2)}` },
        { label: 'Stack', value: `${st.depth}/${st.stack}`, rate: `signal ${st.sig.toFixed(2)} · ${st.parts} part${st.parts === 1 ? '' : 's'}`, title: 'Deepest CALL reached, of the stack limit' },
      ]}
      buy={{
        label: 'Faster clock', cost: ck, unit: 'cycles', afford: cyc >= ck && st.lines >= cn, onClick: () => run(buyClock),
        title: st.lines < cn ? `The clock only learns from work: it wants ${fmt(cn)} lines run first.` : `Beat ${beatRate(st).toFixed(2)}/s → ${(beatRate(st) * 1.2).toFixed(2)}/s`,
      }}
    />
  );
  return (
    <ChallengeRoom zone={ZONE} title="The Operator" note="cards, stack, memory" onClose={onClose} className="operator-room" status={status}>
      <div className="op-grid">
        {/* ---- the cabinet of cards, and the reader they go into ---- */}
        <section className="op-col" aria-label="Cabinet">
          <div className="op-head"><span className="op-cap">"THE CABINET"</span><span className="op-head-note">{st.cards.length} of {MAX_CARDS} cards</span></div>
          <div className="op-drawer">
            <div className="op-files">
              {st.cards.slice(pg * PAGE, pg * PAGE + PAGE).map((k, j) => {
                const i = pg * PAGE + j;
                const m = st.moths.filter(x => x.c === i).length;
                const inReader = st.reader.some((r, s) => r === i && s < slots);
                return (
                  <button key={i} className={`op-file${i === c ? ' on' : ''}${inReader ? ' loaded' : ''}`} onClick={() => pick(i)}
                    title={`${k.name}: ${k.lines.length} line${k.lines.length === 1 ? '' : 's'}, CALL depth ${depthOf(st, i, memo)}${inReader ? ', in the reader' : ''}${m ? `, ${m} moth${m > 1 ? 's' : ''}` : ''}`}>
                    <span className="op-file-top"><span className="op-file-name">{k.name}</span>{m > 0 && <i className="op-moth-dot">{m}</i>}</span>
                    <MiniHoles lines={k.lines} />
                    <span className="op-file-foot">{k.lines.length} ln · d{depthOf(st, i, memo)}</span>
                  </button>
                );
              })}
            </div>
            <span className="op-pull" aria-hidden />
            {pages > 1 && (
              <div className="op-pager">
                <button className="op-pm" disabled={pg <= 0} onClick={() => setPage(pg - 1)} aria-label="Earlier cards">‹</button>
                <span>drawer {pg + 1}/{pages}</span>
                <button className="op-pm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Later cards">›</button>
              </div>
            )}
          </div>
          <button className="op-btn op-wide" disabled={st.cards.length >= MAX_CARDS || cyc < punchCost(st)} onClick={() => run(s => { if (punchCard(s)) pick(s.challenges.operator.cards.length - 1); })}>
            Punch a blank card <span className="op-cost">{fmt(punchCost(st))} cyc</span>
          </button>

          <div className="op-head" title="More slots open as you compile."><span className="op-cap">"THE READER"</span><span className="op-head-note">{live} of {slots} slots fed</span></div>
          <div className="op-slots">
            {Array.from({ length: slots }, (_, i) => {
              const r = st.reader[i] ?? -1, has = !!st.cards[r];
              return (
                <label key={i} className={`op-slot${has ? ' fed' : ''}`} title={`Slot ${i + 1}`}>
                  <i className={`op-lamp${has && st.running ? ' lit' : ''}`} />
                  <span className="op-slot-no">{i + 1}</span>
                  <select value={r} onChange={e => run(s => loadCard(s, i, Number(e.target.value)))}>
                    <option value={-1}>empty</option>
                    {names.map((nm, k) => <option key={k} value={k}>{nm}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <button className={`op-btn op-wide op-run${st.running ? ' on' : ''}`} onClick={() => run(s => setRunning(s, !st.running))}>
            <i className={`op-lamp${st.running ? ' lit' : ''}`} />{st.running ? 'Pause the reader' : 'Run the reader'}
          </button>
        </section>

        {/* ---- the chosen card, big, and its lines ---- */}
        <section className="op-col op-editor" aria-label="Card editor">
          <div className="op-head">
            <span className="op-cap">"{card.name}"</span>
            <span className={`op-head-note${mothsHere ? ' hot' : ''}`} title="Moths nest in idle lines: WAIT and NOP. Click them off the card; each leaves a part.">
              {mothsHere ? `${mothsHere} moth${mothsHere > 1 ? 's' : ''} here · click them off` : 'moths nest in WAIT and NOP'}
            </span>
          </div>
          <div className="op-punch op-cardframe">
            <span className="op-rows" aria-hidden>{['12', '11', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(r => <i key={r}>{r}</i>)}</span>
            <PunchCard card={c} slot={readSlot} onSwat={id => run(s => swat(s, id))} />
            <span className="op-cols" aria-hidden>{Array.from({ length: MAX_LINES }, (_, l) => <i key={l} className={l === atLine ? 'at' : l < card.lines.length ? 'used' : ''}>{l}</i>)}</span>
          </div>
          <div className="op-lines">
            {card.lines.map((ln, l) => <LineEditor key={l} c={c} l={l} line={ln} cards={names} n={card.lines.length} at={l === atLine} />)}
            {Array.from({ length: MAX_LINES - card.lines.length }, (_, k) => k === 0
              ? <button key="add" className="op-line op-add" onClick={() => run(s => addLine(s, c))}><span className="op-ln">{card.lines.length}</span>+ Add a line</button>
              : <div key={k} className="op-line op-empty" aria-hidden><span className="op-ln">{card.lines.length + k}</span></div>)}
          </div>
          <p className="operator-caption op-caption">"ONE LINE A BEAT. IT NEVER SKIPS A BEAT. IT SKIPS LINES."</p>
        </section>

        {/* ---- the machine: clock, stack, memory banks ---- */}
        <section className="op-col" aria-label="Machine">
          <div className="op-head"><span className="op-cap">"THE MACHINE"</span><span className="op-head-note">gear {st.clock} · limit {st.stack}</span></div>
          <div className="op-machine">
            <div className="op-punch op-inst" title={`Clock: beat ${beatRate(st).toFixed(2)}/s. The arc fills with lines run toward the next gear (Faster clock, in the bar at the foot of the room).`}>
              <ClockDial gear={st.clock} beat={beatRate(st)} running={st.running} learn={cn > 0 ? st.lines / cn : 1} />
              <span className="op-inst-cap">"CLOCK"</span>
              <span className="op-inst-line">next <b>{(beatRate(st) * 1.2).toFixed(2)}/s</b></span>
              <span className={`op-inst-line${st.lines < cn ? ' hot' : ''}`}>{st.lines < cn ? `wants ${fmt(cn)} lines` : 'ready to learn'}</span>
            </div>
            <div className="op-punch op-inst" title={`Stack limit ${st.stack}. Each level of CALL a card can reach adds to every payout.`}>
              <StackTower limit={st.stack} reach={reach} />
              <span className="op-inst-cap">"STACK"</span>
              <span className="op-inst-line" title={`${card.name} reaches depth ${reach}`}>this card <b>d{reach}</b></span>
              <button className="op-btn op-wide op-stack-btn" disabled={cyc < sc.cycles || st.parts < sc.parts} onClick={() => run(buyStack)} title="One more level of CALL">
                Deeper stack <span className="op-cost"><span>{fmt(sc.cycles)} cyc</span> <span>+ {sc.parts} part{sc.parts > 1 ? 's' : ''}</span></span>
              </button>
            </div>
          </div>

          <div className="op-head" title="Banks read the station into a signal. Signals strengthen the payout, and IF BANKn opens above half.">
            <span className="op-cap">"MEMORY BANKS"</span><span className="op-head-note">{wired} wired · {st.banks.length} of {MAX_BANKS}</span>
          </div>
          <div className="op-banks">
            {st.banks.map((b, i) => {
              const v = b ? bankSignal(game, b) : 0;
              return (
                <label key={i} className={`op-bank${b ? ' wired' : ''}${v > 0.5 ? ' open' : ''}`} title={b ? `BANK${i + 1}: ${(v * 100).toFixed(0)}%${v > 0.5 ? ', open (IF BANK' + (i + 1) + ' passes)' : ', shut'}` : `BANK${i + 1}: unwired`}>
                  <span className="op-bank-top">
                    <span className="op-bank-name">BANK{i + 1}</span>
                    <span className="op-seg" aria-hidden>{Array.from({ length: 10 }, (_, k) => <i key={k} className={k < Math.round(v * 10) ? 'on' : ''} />)}</span>
                  </span>
                  <select value={b} onChange={e => run(s => setBank(s, i, e.target.value))}>
                    <option value="">unwired</option>
                    {SOURCES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              );
            })}
            {st.banks.length < MAX_BANKS && (
              <button className="op-bank op-bank-add" disabled={cyc < bc.cycles || st.parts < bc.parts} onClick={() => run(buyBank)} title="Wire another memory bank">
                <span>+ Wire a bank</span><span className="op-cost">{fmt(bc.cycles)} cyc · {bc.parts} part{bc.parts > 1 ? 's' : ''}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </ChallengeRoom>
  );
}
