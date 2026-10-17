import { useGame } from '../game/store';

/**
 * Screen-wide weather layers over the snow canvas: drifting fog banks, silent lightning, a dark
 * ashfall sky and wind streaks. Pure CSS animation; the canvas handles the flakes themselves.
 */
export function WeatherFx() {
  const id = useGame(st => st.game.weather.id);
  const siren = useGame(st => st.game.siren.active);
  return (
    <div className={`weather-fx wx-${siren ? 'siren' : id}`} aria-hidden="true">
      <div className="wx-a" />
      <div className="wx-b" />
    </div>
  );
}
