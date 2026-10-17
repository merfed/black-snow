import type { CSSProperties } from 'react';
import { RITES } from '../game/data';
import { rustPerSecond } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { Card } from './Card';
import { SYSTEM_COLORS } from './colors';

export function RitesPanel() {
  const game = useGame(st => st.game);
  const buy = useGame(st => st.buyRite);

  return (
    <section className="panel rites-panel framed reveal" data-panel="rites" style={{ '--hue': SYSTEM_COLORS.rust } as CSSProperties}>
      <h2>Rites <span className="h2-note">paid for in rust</span></h2>
      <div className="res-line">
        <span className="big-number small hue-text">{fmt(game.rust)}</span> rust
        <small>{fmt(rustPerSecond(game))} / s while the siren sounds. Rust only comes from sirens.</small>
      </div>
      <div className="cards">
        {RITES.map(r => {
          const owned = !!game.rites[r.id];
          return (
            <Card key={r.id} title={r.name} desc={r.desc} cost={`${r.cost} rust`} state={owned ? 'owned' : 'available'}
              disabled={owned || game.rust < r.cost} onClick={() => buy(r.id)} />
          );
        })}
      </div>
    </section>
  );
}
