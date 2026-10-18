// The challenge box inside each zone panel: a sealed teaser until it opens, then the challenge's own panel.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type Decimal from 'break_eternity.js';
import { challengesBegin, chByZone, chNeeds, chUnlocked, CHALLENGES } from '../../game/challenges';
import { passiveRate } from '../../game/engine';
import { fmt, fmtTime } from '../../game/format';
import type { GameState } from '../../game/state';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { SurveyPanel } from './Survey';
import { UndertowPanel } from './Undertow';
import { ArchivePanel } from './Archive';
import { StairPanel } from './Stair';
import { SealPanel } from './Seal';
import { RingPanel } from './Ring';
import { OperatorPanel } from './Operator';
import { ScriptoriumPanel } from './Scriptorium';
import { SyzygyPanel } from './Syzygy';
import './challenges.css';

const PANELS = [SurveyPanel, UndertowPanel, ArchivePanel, StairPanel, SealPanel, RingPanel, OperatorPanel, ScriptoriumPanel, SyzygyPanel];

const SEEN_KEY = 'black-snow-ch-seen';
/**
 * Challenges this browser has already shown open, so each one is revealed once (even if it opened while away).
 * The first time it looks, whatever is open already counts as seen, so an older save doesn't light up at once.
 */
function firstSight(id: string, open: boolean, unlocked: string[]): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) { localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked)); return false; }
    const seen: string[] = JSON.parse(raw);
    if (!open || seen.includes(id)) return false;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
    return true;
  } catch { return false; }
}

/** Shown on an item a player can't afford yet: about how long the shafts take to bring it in. */
export function SaveHint({ game, cost }: { game: GameState; cost: Decimal }) {
  if (game.ash.gte(cost)) return null;
  const rate = passiveRate(game);
  if (!rate.gt(0)) return null;
  const sec = cost.sub(game.ash).div(rate).toNumber();
  return <span className="ch-save" title="Hold back other spending this long to afford it">save ~{fmtTime(Math.max(1, sec))}</span>;
}

export function ChallengeSlot({ zone }: { zone: number }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const c = chByZone(zone);
  const open = !!c && challengesBegin(game) && chUnlocked(game, c.id);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!c || !firstSight(c.id, open, useGame.getState().game.chUnlocked)) return;
    setReveal(true);
    const t = setTimeout(() => setReveal(false), 6000);
    return () => clearTimeout(t);
  }, [open, c]);
  if (!c || !challengesBegin(game)) return null;
  const prev = CHALLENGES.findIndex(x => x.id === c.id) - 1;
  // Only show the sealed box for the next one in line, so later zones stay quiet.
  if (!open && prev >= 0 && !chUnlocked(game, CHALLENGES[prev].id)) return null;
  const Panel = PANELS[zone];
  const done = c.milestone.done(game);
  return (
    <div className={`challenge ${open ? '' : 'sealed'} ${reveal ? 'ch-reveal' : ''}`} data-nodrag style={{ '--hue': ZONE_COLORS[zone] } as CSSProperties}>
      {reveal && <div className="ch-reveal-banner" aria-live="polite">IT OPENS.</div>}
      <div className="challenge-head">
        <span className="sub-head">{c.name}</span>
        {open && <span className={`challenge-goal ${done ? 'done' : ''}`} title="Reaching this opens the next challenge">{done ? '✓ ' : '◇ '}{c.milestone.text}</span>}
      </div>
      {open ? <Panel /> : (
        <div className="ch-sealed">
          <p className="dim small-note">Sealed. {c.tagline}</p>
          <ul className="ch-needs" aria-label="Opens when">
            {chNeeds(game, c.id).map(n => <li key={n.text} className={n.done ? 'done' : ''}>{n.done ? '✓' : '◇'} {n.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One stat in a room's status bar: a small label, a big number, and an optional rate or note under it. */
export interface RoomStat { label: ReactNode; value: ReactNode; rate?: ReactNode; title?: string }
/** A room's major buy: the verb, its price, and whether it is the mode the room is in now. */
export interface RoomBuy { label: ReactNode; cost: Decimal; unit?: string; onClick: () => void; disabled?: boolean; pressed?: boolean; title?: string }

/**
 * The bar pinned at the foot of every challenge room: the numbers that matter on the left, the room's major
 * buy on the right, so each room has the same place to look. Pass it to ChallengeRoom as `status`.
 */
export function RoomStatus({ stats, buy, children }: { stats: RoomStat[]; buy?: RoomBuy; children?: ReactNode }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const short = buy ? game.ash.lt(buy.cost) : false;
  return (
    <footer className="room-status" aria-label="Status">
      <dl className="rs-stats">
        {stats.map((x, i) => (
          <div key={i} className="rs-stat" title={x.title}>
            <dt>{x.label}</dt>
            <dd><b>{x.value}</b>{x.rate != null && <small>{x.rate}</small>}</dd>
          </div>
        ))}
      </dl>
      {children}
      {buy && (
        <div className="rs-buy-wrap">
          <button className={`rs-buy${buy.pressed ? ' pressed' : ''}`} disabled={buy.disabled ?? short} onClick={buy.onClick}
            aria-pressed={buy.pressed} title={buy.title}>
            <span className="btn-label">{buy.label}</span>
            <span className="btn-cost">{fmt(buy.cost)} {buy.unit ?? 'ash'}</span>
          </button>
          {short && <SaveHint game={game} cost={buy.cost} />}
        </div>
      )}
    </footer>
  );
}

/** A full-screen room for a challenge, in the same shape as the Exchange and the spiral. With `status`, the
 *  room's body takes the space between the header and a RoomStatus bar pinned at the bottom. */
export function ChallengeRoom({ zone, title, note, stat, status, onClose, children, className }: {
  zone: number; title: string; note?: string; stat?: ReactNode; status?: ReactNode; onClose: () => void; children: ReactNode; className?: string;
}) {
  return createPortal(
    <div className="dialog-backdrop wiring-backdrop" data-nodrag onClick={onClose}>
      <div className={`challenge-room panel framed${status ? ' has-status' : ''} ${className ?? ''}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ '--hue': ZONE_COLORS[zone] } as CSSProperties}>
        <header className="we-head">
          <h2>{title}{note && <span className="h2-note">{note}</span>}</h2>
          {stat && <span className="we-cycles">{stat}</span>}
          <div className="we-actions"><button className="secondary" onClick={onClose}>Close</button></div>
        </header>
        {status ? <><div className="room-body">{children}</div>{status}</> : children}
      </div>
    </div>,
    document.body,
  );
}
