import { useState, type CSSProperties } from 'react';
import { ZONES } from '../game/data';
import {
  ashPerSecond, comfort, comfortMult, dialOpen, echoRate, kilnOpen, pigmentRate, rustPerSecond, sirenEnabled, stationOpen,
} from '../game/engine';
import { fmt, fmtTime } from '../game/format';
import { useGame } from '../game/store';
import { WEATHER } from '../game/systems';
import { cycleRate, wiringOpen } from '../game/wiring';
import { alchemyOpen } from '../game/alchemy';
import { SYSTEM_COLORS, ZONE_COLORS } from './colors';
import { Sprite } from './Sprite';
import { WEATHER_SPRITES, ZONE_ICONS } from './sprites';
import { WeatherHelp } from './WeatherHelp';

/** Every resource at a glance, pinned to the corner of the screen. Only what you have unlocked shows. */
export function ResourcesHud() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  // Phones start with it folded so it does not cover the receiver.
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const weather = WEATHER.find(w => w.id === game.weather.id)!;

  const [help, setHelp] = useState(false);
  const C = SYSTEM_COLORS;
  const rows: [string, string, string | undefined, string][] = [['Ash', fmt(game.ash), `+${fmt(ashPerSecond(game))}/s`, C.ash]];
  if (sirenEnabled(game)) rows.push(['Rust', fmt(game.rust), game.siren.active ? `+${fmt(rustPerSecond(game))}/s` : 'in sirens', C.rust]);
  if (kilnOpen(game)) rows.push(['Embers', fmt(game.embers), undefined, C.embers]);
  if (dialOpen(game)) rows.push(['Echoes', fmt(game.echoes), echoRate(game) > 0 ? `+${fmt(echoRate(game))}/s` : undefined, C.echoes]);
  if (stationOpen(game)) rows.push(['Comfort', String(Math.round(comfort(game))), `+${Math.round((comfortMult(game) - 1) * 100)}% ash`, C.comfort]);
  if (wiringOpen(game)) rows.push(['Cycles', fmt(game.wiring.cycles), `+${fmt(cycleRate(game))}/s`, ZONE_COLORS[6]]);
  if (alchemyOpen(game)) rows.push(['Pigment', fmt(game.alchemy.pigment), `+${fmt(pigmentRate(game))}/s`, ZONE_COLORS[5]]);
  const n = game.nursery;
  if (n.found) {
    rows.push(['Eggs', String(n.eggs.length), n.eggs.length ? `${Math.floor(Math.max(...n.eggs.map(e => e.warmth)))}% warmest` : undefined, C.nursery]);
    rows.push(['Brood', String(n.brood.length), `${n.seen.length} species`, C.nursery]);
  }
  const dug = game.zones.filter(z => z.amount.gt(0));

  return (
    <aside className={`resources ${open ? 'open' : ''}`} aria-label="Resources">
      <button className="resources-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>Resources</span><span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <dl className="res-rows">
            {rows.map(([k, v, r, c]) => (
              <div key={k} style={{ '--hue': c } as CSSProperties}><dt><i className="res-dot" />{k}</dt><dd>{v}{r && <small>{r}</small>}</dd></div>
            ))}
          </dl>
          {dug.length > 0 && (
            <dl className="res-rows res-zones">
              {game.zones.map((z, i) => z.amount.gt(0) && (
                <div key={i} style={{ '--hue': ZONE_COLORS[i] } as CSSProperties}>
                  <dt><Sprite rows={ZONE_ICONS[i]} px={1.5} className="res-icon" />{ZONES[i].name}s</dt><dd>{fmt(z.amount)}</dd>
                </div>
              ))}
            </dl>
          )}
          <button className="res-weather" onClick={() => setHelp(true)} title="What is the weather?">
            <Sprite rows={WEATHER_SPRITES[weather.id]} px={2} />
            <span>{weather.name}<small className="res-weather-desc">{weather.desc}</small></span>
            <small>{fmtTime(game.weather.timer)}</small>
          </button>
          {help && <WeatherHelp onClose={() => setHelp(false)} />}
        </>
      )}
    </aside>
  );
}
