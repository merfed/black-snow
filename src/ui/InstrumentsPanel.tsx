import { FORKS, UPGRADES, ZONES, type UpgradeDef } from '../game/data';
import { forkMerged, upgradeCost, upgradeStatus, type UpgradeStatus } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { Card } from './Card';
import { SYSTEM_COLORS } from './colors';
import { Artwork } from './Artwork';
import { SCENES } from './scenes';
import type { CSSProperties } from 'react';

/**
 * The early path. Bought instruments shrink to chips; what you can buy now is up top; the next
 * step shows greyed with what it needs. Forks render as a row of choices.
 */
export function InstrumentsPanel() {
  const game = useGame(st => st.game);
  const buy = useGame(st => st.buyUpgrade);
  const status = new Map(UPGRADES.map(u => [u.id, upgradeStatus(game, u)] as [string, UpgradeStatus]));
  const owned = UPGRADES.filter(u => ['owned', 'dormant'].includes(status.get(u.id)!));
  const open = UPGRADES.filter(u => ['available', 'locked', 'swap'].includes(status.get(u.id)!));
  if (!owned.length && !open.length) return null;

  // Group fork options together, keep everything else in path order.
  const seen = new Set<string>();
  const blocks: (UpgradeDef | UpgradeDef[])[] = [];
  for (const u of open) {
    if (!u.fork) { blocks.push(u); continue; }
    if (seen.has(u.fork)) continue;
    seen.add(u.fork);
    blocks.push(open.filter(o => o.fork === u.fork));
  }

  const card = (u: UpgradeDef) => {
    const st = status.get(u.id)!;
    const z = u.gate ? game.zones[u.gate.zone].bought : 0;
    const need = st === 'locked'
      ? u.gate && z < u.gate.bought
        ? { text: `Needs ${u.gate.bought} ${ZONES[u.gate.zone].name}${u.gate.bought > 1 ? 's' : ''} (${z}/${u.gate.bought})`, progress: z / u.gate.bought }
        : { text: 'Needs the step before it' }
      : undefined;
    const cost = upgradeCost(game, u);
    const buyable = st === 'available' || st === 'swap';
    return (
      <Card key={u.id} title={u.name} desc={u.desc} cost={`${fmt(cost)} ash`} need={need}
        tag={st === 'swap' ? (forkMerged(game, u) ? 'add' : 'switch') : undefined}
        state={buyable ? 'available' : 'locked'} disabled={!buyable || game.ash.lt(cost)}
        onClick={() => buy(u.id)} />
    );
  };

  return (
    <section className="panel instruments-panel plate-panel knots reveal" data-panel="instruments" style={{ '--hue': SYSTEM_COLORS.instruments } as CSSProperties}>
      <h2>Instruments <span className="h2-note">what the station can be made to do</span></h2>
      <Artwork scene={SCENES.instruments} ink={SYSTEM_COLORS.instruments} accent="#ff3030" caption='"The receiver hears more than it says."' className="panel-art" />
      <div className="instruments">
        {blocks.map(b => Array.isArray(b) ? (
          <div key={b[0].fork} className="fork">
            <div className="fork-title">{FORKS[b[0].fork!].title}</div>
            <div className="fork-note">{FORKS[b[0].fork!].note}</div>
            <div className="fork-options">{b.map(u => card(u))}</div>
          </div>
        ) : card(b))}
      </div>
      {owned.length > 0 && (
        <div className="owned-chips" aria-label="Instruments owned">
          {owned.map(u => status.get(u.id) === 'dormant'
            ? <span key={u.id} className="chip dormant" title={`Dormant: switch back to its doctrine or feed to wake it. ${u.desc}`}>{u.name}</span>
            : <span key={u.id} className="chip" title={u.desc}>{u.name}</span>)}
        </div>
      )}
    </section>
  );
}
