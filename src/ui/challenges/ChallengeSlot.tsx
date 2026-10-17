// The challenge box inside each zone panel: a sealed teaser until it opens, then the challenge's own panel.
import { type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { challengesBegin, chByZone, chUnlocked, chWaitingOn, CHALLENGES } from '../../game/challenges';
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

export function ChallengeSlot({ zone }: { zone: number }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const c = chByZone(zone);
  if (!c || !challengesBegin(game)) return null;
  const open = chUnlocked(game, c.id);
  const prev = CHALLENGES.findIndex(x => x.id === c.id) - 1;
  // Only show the sealed box for the next one in line, so later zones stay quiet.
  if (!open && prev >= 0 && !chUnlocked(game, CHALLENGES[prev].id)) return null;
  const Panel = PANELS[zone];
  const done = c.milestone.done(game);
  return (
    <div className={`challenge ${open ? '' : 'sealed'}`} data-nodrag style={{ '--hue': ZONE_COLORS[zone] } as CSSProperties}>
      <div className="challenge-head">
        <span className="sub-head">{c.name}</span>
        {open && <span className={`challenge-goal ${done ? 'done' : ''}`} title="Reaching this opens the next challenge">{done ? '✓ ' : '◇ '}{c.milestone.text}</span>}
      </div>
      {open ? <Panel /> : <p className="dim small-note">Sealed. {c.tagline} Opens after {chWaitingOn(game, c.id)}</p>}
    </div>
  );
}

/** A full-screen room for a challenge, in the same shape as the Exchange and the spiral. */
export function ChallengeRoom({ zone, title, note, stat, onClose, children, className }: {
  zone: number; title: string; note?: string; stat?: ReactNode; onClose: () => void; children: ReactNode; className?: string;
}) {
  return createPortal(
    <div className="dialog-backdrop wiring-backdrop" data-nodrag onClick={onClose}>
      <div className={`challenge-room panel framed ${className ?? ''}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
        style={{ '--hue': ZONE_COLORS[zone] } as CSSProperties}>
        <header className="we-head">
          <h2>{title}{note && <span className="h2-note">{note}</span>}</h2>
          {stat && <span className="we-cycles">{stat}</span>}
          <div className="we-actions"><button className="secondary" onClick={onClose}>Close</button></div>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
