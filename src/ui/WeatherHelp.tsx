import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { fmtTime } from '../game/format';
import { useGame } from '../game/store';
import { WEATHER } from '../game/systems';
import { SYSTEM_COLORS } from './colors';
import { Sprite } from './Sprite';
import { WEATHER_SPRITES } from './sprites';

/** What the weather is and what each kind does. Opened from the weather chip or the resources list. */
export function WeatherHelp({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  return createPortal(
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog panel framed" role="dialog" aria-label="Weather" onClick={e => e.stopPropagation()}
        style={{ '--hue': SYSTEM_COLORS.weather } as CSSProperties}>
        <div className="dialog-head">
          <h2>Weather <span className="h2-note">over Lull</span></h2>
          <button className="secondary close" onClick={onClose} aria-label="Close">x</button>
        </div>
        <p>
          The sky over the station changes on its own every few minutes. You cannot choose it; you can only make
          the most of it. The chip at the top shows what is falling now and how long it will last.
        </p>
        <ul className="weather-list">
          {WEATHER.map(w => (
            <li key={w.id} className={w.id === game.weather.id ? 'on' : ''}>
              <Sprite rows={WEATHER_SPRITES[w.id]} px={3} />
              <div>
                <b>{w.name}</b>{w.id === game.weather.id && <span className="weather-now"> now · {fmtTime(game.weather.timer)} left</span>}
                <p className="dim">{w.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="dim">
          <b>Ashfall</b> is the black snow coming down hard. There is more ash in the air than usual, so every press of
          Listen catches 1.5 times as much. It is the best time to click.
        </p>
      </div>
    </div>,
    document.body,
  );
}
