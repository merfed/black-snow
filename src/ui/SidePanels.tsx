import type { CSSProperties } from 'react';
import { comfort, comfortMult, fixtureCost, fixtureLevel, stationMaxOpen } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { COMFORT_PERKS, FIXTURES, KILN } from '../game/systems';
import { Card } from './Card';
import { SYSTEM_COLORS } from './colors';
import { Sprite } from './Sprite';
import { FIXTURE_SPRITES, FLAKE } from './sprites';

const hue = (c: string) => ({ '--hue': c } as CSSProperties);

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  return (
    <div className="meter" style={{ '--tone': tone } as CSSProperties}>
      <div style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
    </div>
  );
}

/** The back room. Every fixture you build shows up in the pixel room at the top. */
export function StationPanel() {
  const game = useGame(st => st.game);
  const build = useGame(st => st.buildFixture);
  const maxAll = useGame(st => st.maxStation);
  const c = comfort(game);
  const built = FIXTURES.filter(f => fixtureLevel(game, f.id) > 0);
  const next = COMFORT_PERKS.find(p => c < p.at);

  return (
    <section className="panel station-panel framed reveal" data-panel="station" style={hue(SYSTEM_COLORS.comfort)}>
      <h2>The back room <span className="h2-note">make it somewhere to stay</span></h2>
      <div className={`room ${built.length ? '' : 'empty'}`}>
        {built.length === 0 && <span className="room-empty">Bare boards. A draught from nowhere.</span>}
        {built.map(f => (
          <span key={f.id} className="room-item" title={f.name}>
            <Sprite rows={FIXTURE_SPRITES[f.id]} px={4} />
          </span>
        ))}
      </div>
      <div className="comfort-line">
        <span className="big-number small hue-text">{c}</span> comfort
        <small>All ash +{Math.round((comfortMult(game) - 1) * 100)}%{next ? ` · next at ${next.at}: ${next.desc}` : ' · every comfort perk reached'}</small>
      </div>
      <ul className="perks">
        {COMFORT_PERKS.map(p => (
          <li key={p.at} className={c >= p.at ? 'on' : ''}><b>{p.at}</b> {p.desc}</li>
        ))}
      </ul>
      {stationMaxOpen(game) && (
        <button className="max-all" onClick={maxAll} title="Build the cheapest fixture level, again and again, until nothing is affordable">Max all fixtures</button>
      )}
      <div className="cards">
        {FIXTURES.map(f => {
          const lvl = fixtureLevel(game, f.id);
          const cost = fixtureCost(game, f.id);
          return (
            <Card key={f.id} title={f.name} desc={f.desc} level={lvl} tag={lvl >= f.full ? `+${f.comfort / 4}` : `+${f.comfort}`} cost={`${fmt(cost)} ash`}
              icon={<Sprite rows={FIXTURE_SPRITES[f.id]} px={2} />}
              state="available" disabled={game.ash.lt(cost)} onClick={() => build(f.id)}>
              <span className="fixture-pips">
                {Array.from({ length: f.full }, (_, k) => <span key={k} className={k < lvl ? 'on' : ''} />)}
                {lvl > f.full && <small className="fixture-extra">+{lvl - f.full}</small>}
              </span>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/** Embers from caught warm flakes, spent on kiln upgrades. */
export function KilnPanel() {
  const game = useGame(st => st.game);
  const buy = useGame(st => st.buyKiln);
  return (
    <section className="panel kiln-panel framed reveal" data-panel="kiln" style={hue(SYSTEM_COLORS.embers)}>
      <h2>Kiln <span className="h2-note">what the warm flakes leave behind</span></h2>
      <div className="res-line">
        <Sprite rows={FLAKE} px={3} className="warm-ink" />
        <span className="big-number small hue-text">{fmt(game.embers)}</span> embers
        <small>One for every warm flake you catch. Embers also warm eggs and pay for breeding.</small>
      </div>
      <div className="cards">
        {KILN.map(k => {
          const owned = !!game.kiln[k.id];
          return (
            <Card key={k.id} title={k.name} desc={k.desc} cost={`${k.cost} embers`} state={owned ? 'owned' : 'available'}
              disabled={owned || game.embers < k.cost} onClick={() => buy(k.id)} />
          );
        })}
      </div>
    </section>
  );
}
