import { useLayoutEffect, useRef, useState } from 'react';
import { sirenEnabled, staticLevel } from '../game/engine';
import { fmtTime } from '../game/format';
import { useGame } from '../game/store';
import { WEATHER } from '../game/systems';
import { Sprite } from './Sprite';
import { WEATHER_SPRITES } from './sprites';
import { WeatherHelp } from './WeatherHelp';
import { StationDialog } from './Station';

const CELLS = 24;

export function clock(seconds: number) {
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function TopBar() {
  const game = useGame(st => st.game);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const weather = WEATHER.find(w => w.id === game.weather.id)!;

  // Pinned overlays sit under the bar, whose height changes with the screen.
  useLayoutEffect(() => {
    const el = bar.current!;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="topbar" ref={bar}>
      <div className="brand">
        <h1 className="glow">Black Snow</h1>
        <div className="brand-sub">Lull relay station 04 · night shift <span className="clock">{clock(game.playTime)}</span></div>
      </div>
      <StaticMeter />
      <div className="top-right">
      <button className={`weather-chip weather-${weather.id}`} title={`${weather.desc} Click for more.`} onClick={() => setHelp(true)}>
        <Sprite rows={WEATHER_SPRITES[weather.id]} px={2} />
        <span className="weather-name">{weather.name}</span>
        <span className="weather-time">{fmtTime(game.weather.timer)}</span>
      </button>
      <button className="station-button" onClick={() => setOpen(true)}>
        <span className="station-dot" /> Station
      </button>
      </div>
      {open && <StationDialog onClose={() => setOpen(false)} />}
      {help && <WeatherHelp onClose={() => setHelp(false)} />}
    </header>
  );
}

function StaticMeter() {
  const game = useGame(st => st.game);
  const level = staticLevel(game);
  const { siren } = game;
  // Hidden until the player has met the siren or it is close enough to be felt.
  if (!sirenEnabled(game)) return <div />;

  const lit = Math.round(level * CELLS);
  const state = siren.active ? 'siren' : level > 0.85 ? 'close' : level > 0.5 ? 'rising' : 'quiet';
  const status = {
    siren: `SIREN · ${fmtTime(siren.timer)} · it will pass`,
    close: 'siren close',
    rising: 'rising',
    quiet: 'quiet',
  }[state];

  return (
    <div className={`static static-${state}`} title="Static climbs as the siren gets close">
      <div className="static-head">
        <span className="static-label">Static</span>
        <span className="static-status">{status}</span>
      </div>
      <div className="static-cells">
        {Array.from({ length: CELLS }, (_, k) => (
          <span key={k} className={k < lit ? 'on' : ''} style={{ ['--k' as string]: k / CELLS }} />
        ))}
      </div>
    </div>
  );
}
