import { useState, type CSSProperties } from 'react';
import { ZONES } from '../game/data';
import {
  zoneCost, zoneMaxOpen, zoneMult, zoneOutput, zoneUpCost, zoneUpDesc, zoneUpGate, zoneUpLevel, zoneUpMult, zoneUpName,
  zoneUpStatus, zoneVisible,
} from '../game/engine';
import { Card } from './Card';
import { ZONE_COLORS } from './colors';
import { WiringPreview } from './Circuit';
import { COMPILER, wiringOpen } from '../game/wiring';
import { BUFFER } from '../game/patterns';
import { alchemyOpen, SPIRAL } from '../game/alchemy';
import { PatternBuffer } from './Buffer';
import { SpiralPreview } from './Spiral';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { ZONE_UP_SLOTS } from '../game/systems';
import { Sprite } from './Sprite';
import { ZONE_ICONS } from './sprites';

const HELP_KEY = 'black-snow-shaft-help';

function readHelpPref(): boolean | null {
  try {
    const v = localStorage.getItem(HELP_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function ShaftHelp() {
  const zonesOpened = useGame(st => st.game.zonesOpened);
  // Help starts open for new players and folds itself away once three zones are open.
  const [pref, setPref] = useState(readHelpPref);
  const show = pref ?? zonesOpened < 3;
  const toggle = () => {
    setPref(!show);
    try { localStorage.setItem(HELP_KEY, !show ? '1' : '0'); } catch { /* per-viewer nicety only */ }
  };
  return (
    <>
      <button className="help-toggle" onClick={toggle} aria-expanded={show}>{show ? 'hide help' : 'how shafts work'}</button>
      {show && (
        <div className="shaft-help">
          <p>Shafts dig on their own, every second.</p>
          <ol>
            <li><span className="zone-chip">1</span><span>A <b>Shallow Bore</b> catches ash.</span></li>
            <li><span className="zone-chip">2+</span><span>Deeper zones dig shafts in the zone above.</span></li>
            <li><span className="zone-chip">10</span><span>Every 10 bought boosts the zone.</span></li>
            <li><span className="zone-chip">5</span><span>Own 5 to open the next zone down.</span></li>
          </ol>
        </div>
      )}
    </>
  );
}

const EFFECT_TAG = (i: number, k: number) => ['x' + zoneUpMult(i, 0), '-3% cost', 'x' + zoneUpMult(i, 2), 'x1.02 all'][k];

/** One Numogram zone as its own box: what it does, count, output, dig buttons and its four upgrades. */
export function ZonePanel({ i }: { i: number }) {
  const game = useGame(st => st.game);
  const buy = useGame(st => st.buyShaft);
  const buyTen = useGame(st => st.buyShaftsToTen);
  const buyUp = useGame(st => st.buyZoneUp);
  const maxAll = useGame(st => st.maxZone);
  const [how, setHow] = useState(false);
  const def = ZONES[i];
  const hue = ZONE_COLORS[i];
  const z = game.zones[i];
  const cost = zoneCost(game, i);
  const afford = game.ash.gte(cost);
  const step = z.bought % 10;
  const out = zoneOutput(game, i);
  const each = zoneMult(game, i).mul(def.rate);
  const above = i > 0 ? ZONES[i - 1].name : '';

  return (
    <section className={`panel zone-panel framed reveal ${afford ? 'affordable' : ''}`} data-panel={`zone-${i}`}
      style={{ '--hue': hue } as CSSProperties}>
      <h2>
        <span className="zone-num">{def.id}</span> Zone {def.id}
        {i === 0 ? <ShaftHelp /> : (
          <button className="help-toggle" onClick={() => setHow(h => !h)} aria-expanded={how}>{how ? 'hide' : 'how it works'}</button>
        )}
      </h2>

      <div className="zone-head">
        <Sprite rows={ZONE_ICONS[i]} px={4} className="zone-icon" />
        <div>
          <div className="zone-name">{def.name}</div>
          <div className="zone-desc">
            {i === 0 ? `Each catches ${fmt(each)} ash / s` : `Each digs ${fmt(each)} ${above}s / s`}
          </div>
        </div>
        <div className="zone-count">
          <span className="zone-amount">{fmt(z.amount)}</span>
          <small>owned · {z.bought} dug</small>
        </div>
      </div>

      <p className="zone-lore">{def.lore}</p>
      {(how || (i > 0 && z.bought === 0)) && i > 0 && (
        <div className="zone-how">
          <b>How it works.</b> Each {def.name} digs {fmt(each)} new {above}s every second, on its own, forever.
          More {above}s means more of everything above them, all the way up to ash. That is why deep zones are slow
          to start and then take over. Every 10 you dig multiplies this zone by x{def.bonus}, and owning 5 opens the next zone down.
        </div>
      )}

      <div className="zone-out">
        {out.gt(0) ? <><b>+{fmt(out)}</b> {i === 0 ? 'ash' : `${above}s`} / s right now</> : 'not digging yet'}
      </div>
      <div className="pips" title={`${step} of 10 toward the next boost`}>
        {Array.from({ length: 10 }, (_, k) => <span key={k} className={k < step ? 'on' : ''} />)}
        <span className="pips-label">x{def.bonus} in {10 - step}</span>
      </div>

      <div className="zone-buttons">
        <button className="dig" disabled={!afford} onClick={() => buy(i)}>
          {def.verb} <span className="cost">{fmt(cost)} ash</span>
        </button>
        <button className="secondary" disabled={!afford} onClick={() => buyTen(i)} title="Dig up to the next boost, as far as your ash goes">
          {def.verb} {10 - step} more
        </button>
      </div>
      {i === COMPILER && wiringOpen(game) && <WiringPreview />}
      {i === BUFFER && z.bought > 0 && <PatternBuffer />}
      {i === SPIRAL && alchemyOpen(game) && <SpiralPreview />}
      {zoneMaxOpen(game, i) && (
        <button className="max-all" onClick={() => maxAll(i)} title="Spend ash on the cheapest shaft or upgrade here until nothing is affordable">
          Max all in zone {def.id}
        </button>
      )}

      <div className="cards zone-ups">
        {ZONE_UP_SLOTS.map(slot => {
          const st = zoneUpStatus(game, i, slot.k);
          const upCost = zoneUpCost(game, i, slot.k);
          const lvl = zoneUpLevel(game, i, slot.k);
          const gate = zoneUpGate(game, i, slot.k);
          return (
            <Card key={slot.k} hue={hue} title={zoneUpName(i, slot.k)} desc={zoneUpDesc(i, slot.k)} level={lvl}
              tag={EFFECT_TAG(i, slot.k)} cost={`${fmt(upCost)} ash`}
              state={st === 'maxed' ? 'maxed' : st === 'available' ? 'available' : 'locked'}
              disabled={st !== 'available' || game.ash.lt(upCost)} onClick={() => buyUp(i, slot.k)}
              need={st === 'locked' ? { text: `Level ${lvl + 1} needs ${gate} dug (${z.bought}/${gate})`, progress: z.bought / gate } : undefined} />
          );
        })}
      </div>
    </section>
  );
}

/** The dashed box for the next zone down, so the player can see what they are working toward. */
export function ZoneTeaser({ i }: { i: number }) {
  const game = useGame(st => st.game);
  const above = ZONES[i - 1];
  return (
    <section className="panel zone-panel zone-teaser" data-panel={`zone-${i}`} style={{ '--hue': ZONE_COLORS[i] } as CSSProperties}>
      <h2><span className="zone-num">{i + 1}</span> Zone {i + 1}</h2>
      <div className="zone-name">? ? ?</div>
      <p className="zone-desc">Opens at 5 {above.name}s ({game.zones[i - 1].bought}/5). It will dig {above.name}s.</p>
    </section>
  );
}

export const nextZone = (game: Parameters<typeof zoneVisible>[0]) => ZONES.findIndex((_, i) => !zoneVisible(game, i));
