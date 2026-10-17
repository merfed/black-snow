import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ZONES } from '../game/data';
import { fmt } from '../game/format';
import type { GameState } from '../game/state';
import { useGame } from '../game/store';
import {
  BUS_COST, COLS, CORE, CORE_SIGNAL, cycleRate, extendBus, flowCached, key, learnTier, PART_KINDS, partCost, PARTS,
  place, portAt, portMult, PORTS, remove, ROWS, TIER_COLORS, TIER_COST, TIER_NAMES, upgradeAll, type Flow, type PartKind,
} from '../game/wiring';
import { ZONE_COLORS } from './colors';

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

/** The full workbench: a tray of parts, the board, and the controls for tiers and upgrades. */
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
  useLayoutEffect(() => {
    const r = svg.current!.getBoundingClientRect();
    const scale = Math.min(2, (r.width - 40) / (BW + 130), (r.height - 40) / (BH + 30));
    setView({ scale, x: (r.width - (BW + 110) * scale) / 2, y: (r.height - BH * scale) / 2 });
  }, []);

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
  const lower = Object.values(game.wiring.cells).filter(p => p.tier < game.wiring.tier).length;

  return createPortal(
    <div className="dialog-backdrop wiring-backdrop" data-nodrag onClick={onClose}>
      <div className="wiring-editor panel framed" role="dialog" aria-label="The Exchange" onClick={e => e.stopPropagation()}
        style={{ '--hue': ZONE_COLORS[6] } as CSSProperties}>
        <header className="we-head">
          <h2>The Exchange <span className="h2-note">every line the Compiler is trying to put through</span></h2>
          <span className="we-cycles"><b>{fmt(game.wiring.cycles)}</b> cycles <small>+{fmt(cycleRate(game))}/s</small></span>
          <div className="we-actions">
            <button className="secondary" disabled={!lower} onClick={() => runG(s => { const n = upgradeAll(s); setNote(n ? `Upgraded ${n} part${n > 1 ? 's' : ''}.` : 'Not enough cycles to upgrade anything.'); })}>
              Upgrade all{lower ? ` (${lower})` : ''}
            </button>
            {nextTier < TIER_COST.length && (
              <button disabled={game.wiring.cycles < TIER_COST[nextTier]} onClick={() => runG(s => { if (learnTier(s)) setTier(s.wiring.tier); })}>
                Learn {TIER_NAMES[nextTier].toLowerCase()} <span className="cost">{fmt(TIER_COST[nextTier])} cycles</span>
              </button>
            )}
            {!game.wiring.bus && (
              <button className="secondary" disabled={game.wiring.tier < 3 || game.wiring.cycles < BUS_COST} onClick={() => runG(extendBus)}
                title="Opens ports for Murmurs and Plexes, the zones past the Compiler. Needs gold.">
                Extend the bus <span className="cost">{fmt(BUS_COST)} cycles</span>
              </button>
            )}
            <button className="secondary close" onClick={onClose} aria-label="Close">x</button>
          </div>
        </header>

        <div className="we-body">
          <aside className="we-tray">
            <div className="we-tiers">
              {TIER_NAMES.map((n, i) => (
                <button key={n} className={`tier-chip ${t === i + 1 ? 'on' : ''}`} disabled={i + 1 > game.wiring.tier}
                  style={{ '--tc': TIER_COLORS[i] } as CSSProperties} onClick={() => setTier(i + 1)}>{n}</button>
              ))}
            </div>
            {PART_KINDS.map(k => (
              <button key={k} className={`we-part ${tool === k ? 'on' : ''}`} onPointerDown={grab(k)} onClick={() => setTool(k)}
                style={{ '--tc': TIER_COLORS[t - 1] } as CSSProperties}>
                <svg width={32} height={32} viewBox="-16 -16 32 32"><Glyph kind={k} tier={t} lit /></svg>
                <span><b>{PARTS[k].name}</b><small>{PARTS[k].desc(t)}</small></span>
                <span className="cost">{fmt(partCost(game, k, t))}</span>
              </button>
            ))}
            <button className={`we-part ${tool === 'erase' ? 'on' : ''}`} onClick={() => setTool('erase')}>
              <svg width={32} height={32} viewBox="-16 -16 32 32"><path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ff4f4f" strokeWidth={2.5} /></svg>
              <span><b>Pull up</b><small>Refunds every cycle it cost.</small></span>
            </button>
            <p className="dim we-help">
              Drag a part onto the Exchange, or pick one and paint. Drop a better tier on a part to upgrade it in place.
              Drag empty space, shift-drag or right-drag to pan; scroll to zoom; hold alt to pull up.
            </p>
            <p className="dim we-help">
              The core sends a signal of {CORE_SIGNAL}. Wires lose a little every tile, and a fork splits the signal
              between its branches unless it is a splitter. Whatever reaches a port makes that zone work harder.
            </p>
          </aside>

          <div className="we-board-wrap">
            <svg ref={svg} className="we-board" onPointerDown={down} onPointerMove={move} onWheel={wheel}
              onPointerUp={() => { gesture.current = null; }} onPointerLeave={() => setHover(null)} onContextMenu={e => e.preventDefault()}>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}><BoardSvg game={game} flow={flow} hover={hover} /></g>
            </svg>
            <div className="we-status">
              {hover ? (
                herePort ? <>Port: <b style={{ color: ZONE_COLORS[herePort.zone] }}>{ZONES[herePort.zone].name}s</b> · signal {fmt(hereSig ?? 0)} · x{portMult(herePort.zone, hereSig ?? 0).toFixed(2)}</>
                  : here ? <>{TIER_NAMES[here.tier - 1]} {PARTS[here.kind].name.toLowerCase()} · {hereSig !== undefined ? `signal ${hereSig.toFixed(2)}` : 'unpowered'}</>
                  : hover[0] === CORE.x && hover[1] === CORE.y ? <>The Compiler core. It sends {CORE_SIGNAL}.</>
                  : <>Empty · {hover[0]}, {hover[1]}</>
              ) : <>Ports lit: {Object.keys(flow.ports).length} of {PORTS.filter(p => !p.late || game.wiring.bus).length}</>}
              {note && <span className="we-note">{note}</span>}
            </div>
          </div>
        </div>
        {ghost && (
          <svg className="we-ghost" width={40} height={40} viewBox="-20 -20 40 40" style={{ left: ghost.x - 20, top: ghost.y - 20 }}>
            <Glyph kind={ghost.kind} tier={t} lit />
          </svg>
        )}
      </div>
    </div>,
    document.body,
  );
}
