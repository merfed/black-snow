import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { ZONES } from '../game/data';
import { fmt, fmtTime } from '../game/format';
import type { GameState } from '../game/state';
import { useGame } from '../game/store';
import {
  BUS_COST, COLS, COMPILER, CORE, CORE_SIGNAL, cycleRate, extendBus, flowCached, key, learnTier, PART_KINDS, partCost, PARTS,
  place, portAt, portMult, PORTS, remove, ROWS, TIER_COLORS, TIER_COST, TIER_NAMES, upgradeAll, PART_GROWTH, type Flow, type PartKind,
} from '../game/wiring';
import { ZONE_COLORS } from './colors';
import { ChallengeRoom, RoomStatus } from './challenges/ChallengeSlot';
import './exchange.css';

export const CELL = 32;
const BW = COLS * CELL, BH = ROWS * CELL;
const N4 = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const mid = (n: number) => n * CELL + CELL / 2;

/** A part's little picture, centred on (0,0). */
function Glyph({ kind, tier, lit }: { kind: PartKind; tier: number; lit: boolean }) {
  const c = TIER_COLORS[tier - 1];
  const glow = lit ? { filter: `drop-shadow(0 0 4px ${c})` } : undefined;
  const pips = Array.from({ length: tier }, (_, i) => <rect key={i} x={-9 + i * 5} y={10} width={3} height={3} fill={c} />);
  if (kind === 'amp') return <g style={glow}><rect x={-12} y={-12} width={24} height={24} fill="#0b0c11" stroke={c} strokeWidth={1.5} /><path d="M-6 -7 L7 0 L-6 7 Z" fill={lit ? c : 'none'} stroke={c} strokeWidth={1.5} />{pips}</g>;
  if (kind === 'split') return <g style={glow}><rect x={-12} y={-12} width={24} height={24} fill="#0b0c11" stroke={c} strokeWidth={1.5} /><path d="M-7 0 H0 M0 0 L6 -6 M0 0 L6 6 M0 0 H7" stroke={c} strokeWidth={2} fill="none" /><circle r={2.5} fill={lit ? c : '#0b0c11'} stroke={c} />{pips}</g>;
  if (kind === 'relay') return <g style={glow}><rect x={-12} y={-12} width={24} height={24} fill="#0b0c11" stroke={c} strokeWidth={1.5} /><rect x={-7} y={-6} width={4} height={10} fill={lit ? c : 'none'} stroke={c} /><rect x={-1} y={-6} width={4} height={10} fill={lit ? c : 'none'} stroke={c} /><rect x={5} y={-6} width={2} height={10} fill={c} />{pips}</g>;
  return <g style={glow}><rect x={-4} y={-4} width={8} height={8} fill={c} /></g>;
}

/** The whole board as one SVG in board units (CELL per tile). Pulses run along every powered edge. */
export const BoardSvg = memo(function BoardSvg({ game, flow, hover }: { game: GameState; flow: Flow; hover?: [number, number] | null }) {
  const cells = game.wiring.cells;
  const linked = (x: number, y: number) => !!cells[key(x, y)] || (x === CORE.x && y === CORE.y) || !!portAt(game, x, y);
  return (
    <g>
      <rect x={0} y={0} width={BW} height={BH} fill="#07080c" stroke="#24252b" />
      {/* the grid, as dots, like a breadboard */}
      <g fill="#24252b">
        {Array.from({ length: COLS * ROWS }, (_, i) => <rect key={i} x={mid(i % COLS) - 1} y={mid(Math.floor(i / COLS)) - 1} width={2} height={2} />)}
      </g>
      {/* traces */}
      <g strokeLinecap="square">
        {Object.entries(cells).map(([k, p]) => {
          const [x, y] = k.split(',').map(Number);
          const lit = flow.strength[k] !== undefined;
          const c = TIER_COLORS[p.tier - 1];
          return N4.filter(([dx, dy]) => linked(x + dx, y + dy)).map(([dx, dy]) => (
            <line key={`${k}-${dx}${dy}`} x1={mid(x)} y1={mid(y)} x2={mid(x) + dx * CELL / 2} y2={mid(y) + dy * CELL / 2}
              stroke={c} strokeWidth={2 + p.tier} opacity={lit ? 0.95 : 0.35} />
          ));
        })}
      </g>
      {/* pulses travelling with the signal */}
      <g className="pulses" fill="none" strokeLinecap="round">
        {flow.edges.map((e, n) => (
          <line key={n} x1={mid(e.from[0])} y1={mid(e.from[1])} x2={mid(e.to[0])} y2={mid(e.to[1])}
            stroke="#fff" strokeWidth={Math.min(5, 1.5 + Math.log10(1 + e.s))} strokeDasharray="3 13"
            style={{ animationDuration: `${Math.max(0.25, 1.4 - Math.log10(1 + e.s) * 0.4)}s` }} />
        ))}
      </g>
      {Object.entries(cells).map(([k, p]) => {
        if (p.kind === 'wire') return null;
        const [x, y] = k.split(',').map(Number);
        return <g key={k} transform={`translate(${mid(x)} ${mid(y)})`} className={flow.strength[k] ? 'chip lit' : 'chip'}><Glyph kind={p.kind} tier={p.tier} lit={!!flow.strength[k]} /></g>;
      })}
      {/* the core */}
      <g transform={`translate(${mid(CORE.x)} ${mid(CORE.y)})`} className="core">
        <rect x={-14} y={-14} width={28} height={28} fill="#1a0c08" stroke={ZONE_COLORS[6]} strokeWidth={2} />
        <rect className="core-heart" x={-6} y={-6} width={12} height={12} fill={ZONE_COLORS[6]} />
        <text y={28} textAnchor="middle" className="board-label">core {CORE_SIGNAL}</text>
      </g>
      {/* ports */}
      {PORTS.map(p => {
        const open = !p.late || game.wiring.bus;
        const sig = flow.ports[p.zone] ?? 0;
        const c = ZONE_COLORS[p.zone];
        return (
          <g key={p.zone} transform={`translate(${mid(p.x)} ${mid(p.y)})`} opacity={open ? 1 : 0.25} className={sig ? 'port lit' : 'port'}>
            <rect x={-13} y={-11} width={26} height={22} fill="#0b0c11" stroke={c} strokeWidth={2} style={sig ? { filter: `drop-shadow(0 0 6px ${c})` } : undefined} />
            <text y={4} textAnchor="middle" className="board-num" fill={c}>{ZONES[p.zone].id}</text>
            <text x={18} y={4} textAnchor="start" className="board-label" fill={sig ? c : undefined}>
              {open ? (sig ? `x${portMult(p.zone, sig).toFixed(2)}` : ZONES[p.zone].name) : 'bus closed'}
            </text>
          </g>
        );
      })}
      {hover && <rect x={hover[0] * CELL + 1} y={hover[1] * CELL + 1} width={CELL - 2} height={CELL - 2} fill="none" stroke="#fff" strokeDasharray="3 3" opacity={0.6} />}
    </g>
  );
});

/** The small window onto the Exchange inside the Compiler box. Drag it to look around. */
export function WiringPreview() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: CORE.y * CELL - 90 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const flow = flowCached(game);
  const W = 352, H = 200, scale = 0.8;
  const maxX = BW + 120 - W / scale;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const lit = Object.values(flow.ports).filter(v => v > 0).length;
  const down = (e: RPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    setPan({ x: clamp(d.px - (e.clientX - d.x) / scale, maxX), y: clamp(d.py - (e.clientY - d.y) / scale, BH - H / scale) });
  };

  return (
    <div className="wiring-box">
      <div className="wiring-head">
        <span className="sub-head">The Exchange</span>
        <span className="wiring-cycles"><b>{fmt(game.wiring.cycles)}</b> cycles · +{fmt(cycleRate(game))}/s</span>
      </div>
      <svg className="wiring-preview" data-nodrag width="100%" viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move}
        onPointerUp={() => { drag.current = null; }} onDoubleClick={() => setOpen(true)}>
        <g transform={`scale(${scale}) translate(${-pan.x} ${-pan.y})`}><BoardSvg game={game} flow={flow} /></g>
      </svg>
      <p className="dim small-note">
        {lit ? `Signal reaches ${lit} zone${lit > 1 ? 's' : ''}.` : 'Nothing is wired yet.'} Drag to look around; open the Exchange to patch it.
      </p>
      <button className="max-all" onClick={() => setOpen(true)}>Open the Exchange</button>
      {open && <WiringEditor onClose={() => setOpen(false)} />}
    </div>
  );
}

type Tool = PartKind | 'erase';

/** Segments in each port's meter, and the signal that lights them all. */
const SEGS = 10, METER_TOP = Math.log2(1 + 64);

/** A bank of LED meters, one per port: how much signal reaches each zone and what it makes of it. */
function SignalBank({ game, flow }: { game: GameState; flow: Flow }) {
  const W = 216, H = 178, colW = W / PORTS.length, SH = 12;
  return (
    <svg className="ex-bank" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signal at each port">
      {PORTS.map((p, i) => {
        const open = !p.late || game.wiring.bus;
        const sig = flow.ports[p.zone] ?? 0;
        const c = ZONE_COLORS[p.zone];
        const lit = open ? Math.min(SEGS, Math.ceil(Math.log2(1 + sig) / METER_TOP * SEGS)) : 0;
        const x = i * colW + colW / 2;
        return (
          <g key={p.zone} className={`ex-meter${open ? '' : ' shut'}${sig ? ' on' : ''}`} style={{ '--zc': c } as CSSProperties}>
            <title>{open ? `${ZONES[p.zone].name}s: signal ${fmt(sig)}, x${portMult(p.zone, sig).toFixed(2)}` : `${ZONES[p.zone].name}s: needs the bus extended`}</title>
            <text x={x} y={12} className="ex-meter-x">{open && sig ? portMult(p.zone, sig).toFixed(2) : '-'}</text>
            <rect x={x - 10} y={19} width={20} height={SEGS * SH + 3} className="ex-meter-well" />
            {Array.from({ length: SEGS }, (_, k) => (
              <rect key={k} x={x - 7} y={20 + (SEGS - 1 - k) * SH + 2} width={14} height={SH - 4} className={k < lit ? 'ex-seg lit' : 'ex-seg'} />
            ))}
            <rect x={x - 10} y={H - 21} width={20} height={19} className="ex-meter-plug" />
            <text x={x} y={H - 7} className="ex-meter-id">{ZONES[p.zone].id}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The four tiers as a ladder of lamps, best at the top. */
function TierLadder({ game, t, pick }: { game: GameState; t: number; pick: (n: number) => void }) {
  return (
    <div className="ex-ladder" role="radiogroup" aria-label="Tier to lay">
      {TIER_NAMES.map((n, i) => {
        const known = i + 1 <= game.wiring.tier;
        return (
          <button key={n} role="radio" aria-checked={t === i + 1} className={`ex-rung${t === i + 1 ? ' on' : ''}${known ? ' known' : ''}`}
            disabled={!known} style={{ '--tc': TIER_COLORS[i] } as CSSProperties} onClick={() => pick(i + 1)}
            title={known ? `Lay ${n.toLowerCase()} parts` : `Learn it for ${fmt(TIER_COST[i])} cycles`}>
            <i className="ex-lamp" />
            <b>{n}</b>
            <small>{known ? (t === i + 1 ? 'laying' : 'known') : fmt(TIER_COST[i])}</small>
          </button>
        );
      })}
    </div>
  );
}

/** A dial filling toward the next thing cycles can buy on the tier side: the next tier, then the bus. */
function NextGauge({ game }: { game: GameState }) {
  const w = game.wiring;
  const goal = w.tier < TIER_COST.length ? { name: TIER_NAMES[w.tier], cost: TIER_COST[w.tier] }
    : !w.bus ? { name: 'the bus', cost: BUS_COST } : null;
  if (!goal) return null;
  const f = Math.max(0, Math.min(1, w.cycles / goal.cost));
  const rate = cycleRate(game);
  const left = Math.max(0, goal.cost - w.cycles);
  const R = 34, C = 2 * Math.PI * R, SWEEP = 0.75;
  return (
    <div className={`ex-gauge${f >= 1 ? ' full' : ''}`} title={`${fmt(w.cycles)} of ${fmt(goal.cost)} cycles`}>
      <svg viewBox="-44 -44 88 88" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (135 + i * 270 / 15) * Math.PI / 180;
          return <line key={i} className="ex-gauge-tick" x1={Math.cos(a) * 39} y1={Math.sin(a) * 39} x2={Math.cos(a) * (i % 5 === 0 ? 44 : 42)} y2={Math.sin(a) * (i % 5 === 0 ? 44 : 42)} />;
        })}
        <circle r={R} className="ex-gauge-track" strokeDasharray={`${C * SWEEP} ${C}`} transform="rotate(135)" />
        <circle r={R} className="ex-gauge-arc" strokeDasharray={`${C * SWEEP * f} ${C}`} transform="rotate(135)" />
        <text y={5} className="ex-gauge-pct">{Math.floor(f * 100)}%</text>
      </svg>
      <div className="ex-gauge-side">
        <span className="ex-card-no">toward {goal.name.toLowerCase()}</span>
        <b>{f >= 1 ? 'ready' : rate > 0 ? `~${fmtTime(left / rate)}` : `${fmt(left)} to go`}</b>
        <small>{fmt(goal.cost)} cycles</small>
      </div>
    </div>
  );
}

/** The full workbench: the parts bin and tiers, the board, the signal at each port. */
export function WiringEditor({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const runG = useGame(st => st.run);
  const [tool, setTool] = useState<Tool>('wire');
  const [tier, setTier] = useState(game.wiring.tier);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [ghost, setGhost] = useState<{ kind: PartKind; x: number; y: number } | null>(null);
  const [note, setNote] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ mode: 'pan' | 'paint'; x: number; y: number; vx: number; vy: number; last: string } | null>(null);
  const flow = flowCached(game);
  const t = Math.min(tier, game.wiring.tier);

  // Start with the whole board in view, port names included.
  const fit = useCallback(() => {
    const r = svg.current!.getBoundingClientRect();
    const scale = Math.min(2, (r.width - 16) / (BW + 112), (r.height - 16) / (BH + 24));
    setView({ scale, x: (r.width - (BW + 100) * scale) / 2, y: (r.height - BH * scale) / 2 });
  }, []);
  useLayoutEffect(fit, [fit]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const cellAt = useCallback((cx: number, cy: number): [number, number] | null => {
    const r = svg.current!.getBoundingClientRect();
    const x = Math.floor((cx - r.left - view.x) / (CELL * view.scale));
    const y = Math.floor((cy - r.top - view.y) / (CELL * view.scale));
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? [x, y] : null;
  }, [view]);

  const apply = (c: [number, number], use: Tool = tool) => {
    runG(s => {
      if (use === 'erase') { remove(s, c[0], c[1]); return; }
      if (!place(s, c[0], c[1], use, t)) {
        const here = s.wiring.cells[key(c[0], c[1])];
        if (!(here && here.kind === use && here.tier >= t)) setNote(`Not enough cycles for a ${TIER_NAMES[t - 1].toLowerCase()} ${PARTS[use].name.toLowerCase()}.`);
      } else setNote('');
    });
  };

  const down = (e: RPointerEvent<SVGSVGElement>) => {
    svg.current!.setPointerCapture(e.pointerId);
    const c = cellAt(e.clientX, e.clientY);
    const pan = e.button !== 0 || !c || e.shiftKey;
    gesture.current = { mode: pan ? 'pan' : 'paint', x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, last: c ? key(...c) : '' };
    if (!pan && c) apply(c, e.altKey ? 'erase' : tool);
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const c = cellAt(e.clientX, e.clientY);
    setHover(c);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pan') setView(v => ({ ...v, x: g.vx + e.clientX - g.x, y: g.vy + e.clientY - g.y }));
    else if (c && key(...c) !== g.last) { g.last = key(...c); apply(c, e.altKey ? 'erase' : tool); }
  };
  const wheel = (e: React.WheelEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView(v => {
      const scale = Math.max(0.4, Math.min(2.5, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      return { scale, x: mx - (mx - v.x) * (scale / v.scale), y: my - (my - v.y) * (scale / v.scale) };
    });
  };

  // Drag a part out of the tray and drop it on the board (or on a part to upgrade or replace it).
  const grab = (kind: PartKind) => (e: RPointerEvent) => {
    e.preventDefault();
    setTool(kind);
    setGhost({ kind, x: e.clientX, y: e.clientY });
    const mv = (ev: PointerEvent) => { setGhost({ kind, x: ev.clientX, y: ev.clientY }); setHover(cellAt(ev.clientX, ev.clientY)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      const c = cellAt(ev.clientX, ev.clientY);
      if (c) apply(c, kind);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const here = hover ? game.wiring.cells[key(...hover)] : undefined;
  const herePort = hover ? portAt(game, ...hover) : undefined;
  const hereSig = hover ? flow.strength[key(...hover)] : undefined;
  const nextTier = game.wiring.tier;
  const parts = Object.values(game.wiring.cells);
  const lowerParts = parts.filter(p => p.tier < game.wiring.tier);
  const lower = lowerParts.length;
  // The cheapest single step Upgrade all would take first, priced as upgradeAll prices it.
  const step = lowerParts.reduce((m, p) => Math.min(m, partCost(game, p.kind, p.tier + 1) - partCost(game, p.kind, p.tier)), Infinity);
  const openPorts = PORTS.filter(p => !p.late || game.wiring.bus);
  const litPorts = Object.keys(flow.ports).length;
  const best = Object.entries(flow.ports).reduce<[number, number] | null>((b, [z, v]) => (!b || v > b[1] ? [Number(z), v] : b), null);
  const circuits = parts.filter(p => p.kind !== 'wire').length;
  const help = 'Drag a part onto the Exchange, or pick one and paint. Drop a better tier on a part to upgrade it in place. '
    + 'Drag empty space, shift-drag or right-drag to pan; scroll to zoom; hold alt to pull up.';
  const rules = `The core sends a signal of ${CORE_SIGNAL}. Wires lose a little every tile, and a fork splits the signal `
    + 'between its branches unless it is a splitter. Whatever reaches a port makes that zone work harder.';

  const status = (
    <RoomStatus
      stats={[
        { label: 'Cycles', value: fmt(game.wiring.cycles), rate: `+${fmt(cycleRate(game))}/s`, title: 'Compilers make cycles; cycles buy parts' },
        { label: 'Ports lit', value: `${litPorts}/${openPorts.length}`, rate: game.wiring.bus ? 'bus extended' : 'bus closed', title: 'Zones the signal reaches' },
        best
          ? { label: 'Best port', value: `x${portMult(best[0], best[1]).toFixed(2)}`, rate: `${ZONES[best[0]].name}s`, title: `Signal ${fmt(best[1])} reaches it` }
          : { label: 'Best port', value: 'x1.00', rate: 'nothing reaches', title: 'Run a line from the core to a port' },
        { label: 'Laid', value: parts.length, rate: `${circuits} circuit${circuits === 1 ? '' : 's'}`, title: 'Parts on the board; circuits are everything but wire' },
      ]}
      buy={{
        label: lower ? `Upgrade all (${lower})` : 'Upgrade all', cost: lower ? step : 0, unit: 'cycles',
        afford: lower > 0 && game.wiring.cycles >= step, disabled: !lower || game.wiring.cycles < step,
        title: lower ? `Brings every part up to ${TIER_NAMES[game.wiring.tier - 1].toLowerCase()}, cheapest first, while cycles last` : 'Every part is already at the best tier you know',
        onClick: () => runG(s => { const n = upgradeAll(s); setNote(n ? `Upgraded ${n} part${n > 1 ? 's' : ''}.` : 'Not enough cycles to upgrade anything.'); }),
      }}
    />
  );

  const inspect: Tool = tool;
  return (
    <ChallengeRoom zone={COMPILER} title="The Exchange" note="every line the Compiler is trying to put through" onClose={onClose}
      className="exchange-room" status={status}>
      <div className="ex-grid">
        {/* ---- the bin: tiers, parts, and the one you hold ---- */}
        <section className="ex-col ex-side" aria-label="Parts">
          <div className="ex-head"><span className="ex-cap">"THE TIERS"</span><span className="ex-head-note">{TIER_NAMES[game.wiring.tier - 1].toLowerCase()} known</span></div>
          <TierLadder game={game} t={t} pick={setTier} />
          <div className="ex-keys">
            {nextTier < TIER_COST.length ? (
              <button className="ex-btn" disabled={game.wiring.cycles < TIER_COST[nextTier]} onClick={() => runG(s => { if (learnTier(s)) setTier(s.wiring.tier); })}
                title={`Lets you lay ${TIER_NAMES[nextTier].toLowerCase()} parts`}>
                Learn {TIER_NAMES[nextTier].toLowerCase()} <span className="ex-cost">{fmt(TIER_COST[nextTier])}</span>
              </button>
            ) : <span className="ex-key-done">every tier known</span>}
            {!game.wiring.bus ? (
              <button className="ex-btn" disabled={game.wiring.tier < 3 || game.wiring.cycles < BUS_COST} onClick={() => runG(extendBus)}
                title="Opens ports for Murmurs and Plexes, the zones past the Compiler. Needs gold.">
                Extend bus <span className="ex-cost">{fmt(BUS_COST)}</span>
              </button>
            ) : <span className="ex-key-done">bus extended</span>}
          </div>

          <div className="ex-head"><span className="ex-cap">"THE PARTS BIN"</span><span className="ex-head-note" title={help}>drag · paint</span></div>
          <div className="ex-bin">
            {PART_KINDS.map(k => (
              <button key={k} className={`ex-part${tool === k ? ' on' : ''}`} onPointerDown={grab(k)} onClick={() => setTool(k)}
                style={{ '--tc': TIER_COLORS[t - 1] } as CSSProperties} title={PARTS[k].desc(t)}>
                <svg width={30} height={30} viewBox="-16 -16 32 32"><Glyph kind={k} tier={t} lit /></svg>
                <b>{PARTS[k].name}</b>
                <span className="ex-part-cost">{fmt(partCost(game, k, t))}</span>
              </button>
            ))}
            <button className={`ex-part ex-erase${tool === 'erase' ? ' on' : ''}`} onClick={() => setTool('erase')} title="Refunds every cycle it cost. Or hold alt while you paint.">
              <svg width={30} height={30} viewBox="-16 -16 32 32"><path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ff4f4f" strokeWidth={2.5} /></svg>
              <b>Pull up</b>
              <span className="ex-part-cost">refund</span>
            </button>
            <button className="ex-part ex-fit" onClick={fit} title="Bring the whole board back into view">
              <svg width={30} height={30} viewBox="-16 -16 32 32"><path d="M-11 -5 V-11 H-5 M5 -11 H11 V-5 M11 5 V11 H5 M-5 11 H-11 V5" stroke="currentColor" strokeWidth={2} fill="none" /><rect x={-4} y={-4} width={8} height={8} fill="currentColor" /></svg>
              <b>Fit</b>
              <span className="ex-part-cost">view</span>
            </button>
          </div>
          <div className="ex-card" style={{ '--tc': inspect === 'erase' ? '#ff4f4f' : TIER_COLORS[t - 1] } as CSSProperties}>
            <span className="ex-card-no">in hand</span>
            <b>{inspect === 'erase' ? 'Pull up' : `${TIER_NAMES[t - 1]} ${PARTS[inspect].name.toLowerCase()}`}</b>
            <p>{inspect === 'erase' ? 'Refunds every cycle it cost.' : PARTS[inspect].desc(t)}</p>
            {inspect !== 'erase' && (
              <dl className="ex-spec">
                <div><dt>on the board</dt><dd>{parts.filter(p => p.kind === inspect).length}</dd></div>
                <div><dt>this one</dt><dd>{fmt(partCost(game, inspect, t))}</dd></div>
                <div><dt>each more</dt><dd>{inspect === 'wire' ? 'same' : `x${PART_GROWTH}`}</dd></div>
              </dl>
            )}
            <small className="ex-card-help" title={help}>Drop a better tier on a part to upgrade it in place.</small>
          </div>
        </section>

        {/* ---- the board ---- */}
        <section className="ex-col ex-main" aria-label="The board">
          <div className="ex-board-frame knots">
            <span className="ex-board-cap">"THE BOARD"</span>
            <span className="ex-board-zoom">x{view.scale.toFixed(2)}</span>
            <svg ref={svg} className="ex-board" onPointerDown={down} onPointerMove={move} onWheel={wheel}
              onPointerUp={() => { gesture.current = null; }} onPointerLeave={() => setHover(null)} onContextMenu={e => e.preventDefault()}>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}><BoardSvg game={game} flow={flow} hover={hover} /></g>
            </svg>
          </div>
          <div className="ex-readout" title={help}>
            <span className="ex-readout-at">{hover ? `${String(hover[0]).padStart(2, '0')}·${String(hover[1]).padStart(2, '0')}` : '--·--'}</span>
            <span className="ex-readout-text">
              {hover ? (
                herePort ? <>Port: <b style={{ color: ZONE_COLORS[herePort.zone] }}>{ZONES[herePort.zone].name}s</b> · signal {fmt(hereSig ?? 0)} · x{portMult(herePort.zone, hereSig ?? 0).toFixed(2)}</>
                  : here ? <>{TIER_NAMES[here.tier - 1]} {PARTS[here.kind].name.toLowerCase()} · {hereSig !== undefined ? `signal ${hereSig.toFixed(2)}` : 'unpowered'}</>
                  : hover[0] === CORE.x && hover[1] === CORE.y ? <>The Compiler core. It sends {CORE_SIGNAL}.</>
                  : <>Empty tile</>
              ) : <>Shift-drag or right-drag to pan · scroll to zoom · alt pulls up</>}
            </span>
            {note && <span className="ex-note">{note}</span>}
          </div>
        </section>

        {/* ---- the signal at every port ---- */}
        <section className="ex-col ex-side" aria-label="The signal">
          <div className="ex-head"><span className="ex-cap">"THE SIGNAL"</span><span className="ex-head-note">core {CORE_SIGNAL}</span></div>
          <div className="ex-bank-frame"><SignalBank game={game} flow={flow} /></div>
          <ul className="ex-ports">
            {openPorts.map(p => {
              const sig = flow.ports[p.zone] ?? 0;
              return (
                <li key={p.zone} className={sig ? 'on' : ''} style={{ '--zc': ZONE_COLORS[p.zone] } as CSSProperties}
                  title={sig ? `Signal ${fmt(sig)}` : 'No signal reaches it'}>
                  <i>{ZONES[p.zone].id}</i><span>{ZONES[p.zone].name}s</span><b>{sig ? fmt(sig) : '-'}</b>
                </li>
              );
            })}
          </ul>
          <NextGauge game={game} />
          <p className="ex-rule" title={rules}>“Wires lose a little every tile. Whatever reaches a port makes that zone work harder.”</p>
        </section>
      </div>
      {ghost && (
        <svg className="we-ghost" width={40} height={40} viewBox="-20 -20 40 40" style={{ left: ghost.x - 20, top: ghost.y - 20 }}>
          <Glyph kind={ghost.kind} tier={t} lit />
        </svg>
      )}
    </ChallengeRoom>
  );
}
