import type { CSSProperties, ReactNode } from 'react';

export type CardState = 'available' | 'locked' | 'owned' | 'maxed';

interface CardProps {
  title: string;
  desc: ReactNode;
  state: CardState;
  hue?: string;
  cost?: string; // already formatted, e.g. "2.00M ash"
  ownedLabel?: string;
  tag?: string; // effect badge, e.g. "x1.5"
  level?: number; // shown as "Lv 3" for repeatable unlocks
  icon?: ReactNode;
  need?: { text: string; progress?: number };
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * Every unlock in the game uses this card: a tinted header strip (icon, name, level, effect badge,
 * price) over a plain body, with an optional footer showing what it still needs.
 */
export function Card({ title, desc, state, hue, cost, ownedLabel = 'owned', tag, level, icon, need, disabled, onClick, children }: CardProps) {
  return (
    <button className={`card card-${state}`} style={hue ? { '--hue': hue } as CSSProperties : undefined}
      disabled={disabled ?? state !== 'available'} onClick={onClick}>
      <span className="card-head">
        {icon && <span className="card-icon">{icon}</span>}
        <span className="card-title">{title}</span>
        {level !== undefined && level > 0 && <span className="card-level">Lv {level}</span>}
        {tag && <span className="card-tag">{tag}</span>}
        <span className="card-cost">{state === 'owned' ? ownedLabel : state === 'maxed' ? 'max' : cost}</span>
      </span>
      <span className="card-body">
        {desc}
        {children}
      </span>
      {need && (
        <span className="card-foot">
          <span>{need.text}</span>
          {need.progress !== undefined && <span className="card-progress"><i style={{ width: `${Math.min(1, need.progress) * 100}%` }} /></span>}
        </span>
      )}
    </button>
  );
}
