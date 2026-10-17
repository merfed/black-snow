// The Operator: the panel inside the zone 7 box (the reader) and its room (the editor, the moths, the banks).
import { useEffect, useRef, useState, type MouseEvent } from 'react';
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
import { ChallengeRoom } from './ChallengeSlot';
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

function LineEditor({ c, l, line, cards, n }: { c: number; l: number; line: Line; cards: string[]; n: number }) {
  const run = useGame(st => st.run);
  const set = (ln: Line) => run(s => setLine(s, c, l, ln));
  const setCond = (patch: Partial<Cond>) => set({ ...line, cond: { ...line.cond!, ...patch } });
  const args = ARGS[line.op]?.(cards, n);
  return (
    <div className="operator-line">
      <span className="operator-ln">{l}</span>
      <select value={line.op} title={OP_HELP[line.op]} onChange={e => { const o = e.target.value as Op; set({ op: o, arg: DEFAULT_ARG[o] ?? 0 }); }}>
        {OPS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {args && <select value={line.arg} onChange={e => set({ ...line, arg: Number(e.target.value) })}>{args.map(a => <option key={a.v} value={a.v}>{a.t}</option>)}</select>}
      {line.op === 'IF' && line.cond && <>
        <button className={`secondary operator-not ${line.cond.na ? 'on' : ''}`} onClick={() => setCond({ na: !line.cond!.na })}>NOT</button>
        <select value={line.cond.a} onChange={e => setCond({ a: e.target.value })}>{CONDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
        <select value={line.cond.join} onChange={e => setCond({ join: e.target.value as Join })}>
          <option value="">·</option><option value="AND">AND</option><option value="OR">OR</option>
        </select>
        {line.cond.join && <>
          <button className={`secondary operator-not ${line.cond.nb ? 'on' : ''}`} onClick={() => setCond({ nb: !line.cond!.nb })}>NOT</button>
          <select value={line.cond.b} onChange={e => setCond({ b: e.target.value })}>{CONDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
        </>}
      </>}
      <span className="operator-line-tools">
        <button className="secondary" aria-label="Move up" disabled={l === 0} onClick={() => run(s => moveLine(s, c, l, -1))}>↑</button>
        <button className="secondary" aria-label="Move down" disabled={l === n - 1} onClick={() => run(s => moveLine(s, c, l, 1))}>↓</button>
        <button className="secondary" aria-label="Delete line" disabled={n <= 1} onClick={() => run(s => removeLine(s, c, l))}>×</button>
      </span>
    </div>
  );
}

function OperatorRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const st = game.challenges.operator;
  const [sel, setSel] = useState(0);
  const c = Math.min(sel, st.cards.length - 1);
  const card = st.cards[c];
  const names = st.cards.map(k => k.name);
  const slots = readerSlots(game);
  const cyc = game.wiring.cycles;
  const sc = stackCost(st), bc = bankCost(st);
  const memo = new Map<number, number>();
  const live = activeSlots(game).length;
  const mothsHere = st.moths.filter(m => m.c === c).length;
  return (
    <ChallengeRoom zone={ZONE} title="The Operator" note="cards, stack, memory" onClose={onClose} className="operator-room"
      stat={<>{fmt(cyc)} cycles · {st.parts} part{st.parts === 1 ? '' : 's'}</>}>
      <div className="ch-row operator-stats">
        <span className="ch-stat">Lines <b>{fmt(Math.floor(st.lines))}</b></span>
        <span className="ch-stat">Beat <b>{beatRate(st).toFixed(2)}</b>/s × {live} card{live === 1 ? '' : 's'}</span>
        <span className="ch-stat">Burn <b>{fmt(st.burn)}</b> cyc/s{st.moths.length > 0 && <span className="dim"> (moths +{Math.round((mothTax(st) - 1) * 100)}%)</span>}</span>
        <span className="ch-stat">Stack depth <b>{st.depth}</b></span>
        <span className="ch-stat">Signal <b>{st.sig.toFixed(2)}</b></span>
      </div>
      <div className="ch-row operator-stats">
        <span className="ch-stat">{ZONES[ZONE].name} <b>×{operator.mult(game, 'zone6').toFixed(2)}</b></span>
        <span className="ch-stat">Cycles <b>×{operator.mult(game, 'cycles').toFixed(2)}</b></span>
        <span className="ch-stat">All ash <b>×{operator.mult(game, 'ash').toFixed(2)}</b></span>
        <span className="ch-stat dim">lines ×{basePay(st).toFixed(2)}</span>
      </div>
      <div className="operator-room-grid">
        <section className="operator-col">
          <h3 className="sub-head">Cabinet</h3>
          <div className="operator-files" data-scroll>
            {st.cards.map((k, i) => (
              <button key={i} className={`secondary operator-file ${i === c ? 'on' : ''}`} onClick={() => setSel(i)}>
                <span>{k.name}</span><span className="dim">{k.lines.length} ln · d{depthOf(st, i, memo)}</span>
              </button>
            ))}
          </div>
          <button disabled={st.cards.length >= MAX_CARDS || cyc < punchCost(st)} onClick={() => run(s => { if (punchCard(s)) setSel(s.challenges.operator.cards.length - 1); })}>
            Punch a blank card <span className="cost">{fmt(punchCost(st))} cyc</span>
          </button>
          <h3 className="sub-head">Reader</h3>
          {Array.from({ length: slots }, (_, i) => (
            <label key={i} className="operator-slot-pick">
              <span className="dim">Slot {i + 1}</span>
              <select value={st.reader[i] ?? -1} onChange={e => run(s => loadCard(s, i, Number(e.target.value)))}>
                <option value={-1}>empty</option>
                {names.map((nm, k) => <option key={k} value={k}>{nm}</option>)}
              </select>
            </label>
          ))}
          <p className="small-note dim">More slots open as you compile.</p>
          <button className={st.running ? 'secondary' : ''} onClick={() => run(s => setRunning(s, !st.running))}>{st.running ? 'Pause the reader' : 'Run the reader'}</button>
        </section>

        <section className="operator-col operator-editor">
          <h3 className="sub-head">{card.name}</h3>
          <div className="operator-big">
            <PunchCard card={c} slot={st.reader.findIndex((r, i) => r === c && i < slots)} onSwat={id => run(s => swat(s, id))} />
          </div>
          <p className="small-note dim">{mothsHere ? `${mothsHere} moth${mothsHere > 1 ? 's' : ''} on this card. Click them off; each leaves a part.` : 'Moths nest in idle lines: WAIT and NOP.'}</p>
          <div className="operator-lines" data-scroll>
            {card.lines.map((ln, l) => <LineEditor key={l} c={c} l={l} line={ln} cards={names} n={card.lines.length} />)}
          </div>
          <button className="secondary" disabled={card.lines.length >= MAX_LINES} onClick={() => run(s => addLine(s, c))}>Add a line</button>
          <p className="operator-caption">"ONE LINE A BEAT. IT NEVER SKIPS A BEAT. IT SKIPS LINES."</p>
        </section>

        <section className="operator-col">
          <h3 className="sub-head">Machine</h3>
          <button disabled={cyc < clockCost(st) || st.lines < clockNeed(st)} onClick={() => run(buyClock)}>
            Faster clock <span className="cost">{fmt(clockCost(st))} cyc</span>
          </button>
          <p className="small-note dim">
            Beat {beatRate(st).toFixed(2)}/s → {(beatRate(st) * 1.2).toFixed(2)}/s.
            {st.lines < clockNeed(st) && <> The clock only learns from work: it wants {fmt(clockNeed(st))} lines run first.</>}
          </p>
          <button disabled={cyc < sc.cycles || st.parts < sc.parts} onClick={() => run(buyStack)}>
            Deeper stack <span className="cost">{fmt(sc.cycles)} cyc · {sc.parts} part{sc.parts > 1 ? 's' : ''}</span>
          </button>
          <p className="small-note dim">Stack limit {st.stack}. Each level of CALL a card can reach adds to every payout.</p>
          <h3 className="sub-head">Memory banks</h3>
          {st.banks.map((b, i) => (
            <label key={i} className="operator-bank">
              <span className="dim">BANK{i + 1}</span>
              <select value={b} onChange={e => run(s => setBank(s, i, e.target.value))}>
                <option value="">unwired</option>
                {SOURCES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <span className="operator-meter"><span style={{ width: `${(b ? bankSignal(game, b) : 0) * 100}%` }} /></span>
            </label>
          ))}
          <button disabled={st.banks.length >= MAX_BANKS || cyc < bc.cycles || st.parts < bc.parts} onClick={() => run(buyBank)}>
            Wire a bank <span className="cost">{fmt(bc.cycles)} cyc · {bc.parts} part{bc.parts > 1 ? 's' : ''}</span>
          </button>
          <p className="small-note dim">Banks read the station into a signal. Signals strengthen the payout, and IF BANKn opens above half.</p>
        </section>
      </div>
    </ChallengeRoom>
  );
}
