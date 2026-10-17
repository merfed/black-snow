import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ZONES } from '../game/data';
import {
  matBoost, matOf, matRate, shaftsCost, zoneCost, zoneMaxOpen, zoneMult, zoneOutput, zoneUpCost, zoneUpDesc, zoneUpGate,
  zoneUpLevel, zoneUpMatCost, zoneUpMult, zoneUpName, zoneUpStatus, zoneVisible,
} from '../game/engine';
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
import { Artwork } from './Artwork';
import { ZONE_SCENES } from './scenes';
import { ChallengeSlot } from './challenges/ChallengeSlot';
import { ZoneGuide } from './ZoneGuide';

/** What each zone's plate says under it, and the second ink it is printed with. */
const ZONE_ART = [
  { caption: '"What falls, we keep."', accent: '#ff3030' },
  { caption: '"The pipes carry something up."', accent: '#ff3030' },
  { caption: '"It remembers your face wrong."', accent: '#ff3030' },
  { caption: '"The water is warm. Do not drink."', accent: '#ff5a3b' },
  { caption: '"Each turn lets one out."', accent: '#ff3030' },
  { caption: '"Left, forever, and above itself."', accent: '#ffe066' },
  { caption: '"It writes us in its sleep."', accent: '#ff3030' },
  { caption: '"The walls speak in your voice."', accent: '#ff3030' },
  { caption: '"Into the iron, dreaming."', accent: '#3bd8ff' },
];

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
      <button className="help-toggle" onClick={toggle} aria-expanded={show}>{show ? 'hide tips' : 'tips'}</button>
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

/** Hover help for a zone upgrade, like the pets': follows a mouse, never opens on a tap or a click. */
function UpTip({ i, k, x, y }: { i: number; k: number; x: number; y: number }) {
  const game = useGame(st => st.game);
  const lvl = zoneUpLevel(game, i, k);
  const gate = zoneUpGate(game, i, k);
  return createPortal(
    <div className="pet-tip zup-tip" role="tooltip"
      style={{ left: Math.min(x + 16, window.innerWidth - 300), top: Math.min(y + 18, window.innerHeight - 180), '--hue': ZONE_COLORS[i] } as CSSProperties}>
      <div className="zup-tip-name">{zoneUpName(i, k)}</div>
      <p>{zoneUpDesc(i, k)}</p>
      <div className="zup-tip-meta">Level {lvl} · next needs {gate} {ZONES[i].name}s dug</div>
    </div>,
    document.body,
  );
}

/** One zone upgrade: name, level, effect, both prices and a bar that fills toward it. */
function ZoneUpCard({ i, k }: { i: number; k: number }) {
  const game = useGame(st => st.game);
  const buyUp = useGame(st => st.buyZoneUp);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const def = ZONES[i];
  const st = zoneUpStatus(game, i, k);
  const cost = zoneUpCost(game, i, k);
  const mat = zoneUpMatCost(game, i, k);
  const have = matOf(game, i);
  const lvl = zoneUpLevel(game, i, k);
  const gate = zoneUpGate(game, i, k);
  const bought = game.zones[i].bought;
  const ashOk = game.ash.gte(cost), matOk = have >= mat;
  const ready = st === 'available' && ashOk && matOk;
  // Locked: how far toward the dig count. Open: how far toward the dearer of the two prices.
  const ashFrac = cost.gt(0) ? Math.min(1, game.ash.div(cost).toNumber()) : 1;
  const progress = st === 'locked' ? bought / gate : Math.min(ashFrac, mat > 0 ? have / mat : 1);
  const label = st === 'maxed' ? 'max' : st === 'locked' ? `${bought}/${gate} dug` : ready ? 'ready' : !matOk && ashOk ? `need ${def.matShort.toLowerCase()}` : 'saving';
  const hover = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setTip({ x: e.clientX, y: e.clientY }); };
  return (
    <button className={`zup zup-${st} ${ready ? 'zup-ready' : ''}`} disabled={!ready} onClick={() => buyUp(i, k)}
      onPointerEnter={hover} onPointerMove={hover} onPointerLeave={() => setTip(null)} onPointerDown={() => setTip(null)}
      aria-label={`${zoneUpName(i, k)}: ${zoneUpDesc(i, k)}`}>
      <span className="zup-top">
        <span className="zup-name">{zoneUpName(i, k)}</span>
        <span className="zup-lvl">{lvl > 0 ? `Lv ${lvl}` : 'new'}</span>
      </span>
      <span className="zup-tag">{EFFECT_TAG(i, k)}</span>
      <span className="zup-cost">
        <span className={ashOk ? '' : 'short'}>{fmt(cost)} ash</span>
        <span className={matOk ? '' : 'short'}>{fmt(mat)} {def.matShort.toLowerCase()}</span>
      </span>
      <span className="zup-bar" aria-hidden="true"><i style={{ width: `${Math.min(1, progress) * 100}%` }} /></span>
      <span className="zup-state">{label}</span>
      {tip && <UpTip i={i} k={k} x={tip.x} y={tip.y} />}
    </button>
  );
}

/** One Numogram zone as its own box: name and counts, the plate, what it does, dig buttons, upgrades, its machines, max all. */
export function ZonePanel({ i }: { i: number }) {
  const game = useGame(st => st.game);
  const buy = useGame(st => st.buyShaft);
  const buyTen = useGame(st => st.buyShaftsToTen);
  const maxAll = useGame(st => st.maxZone);
  const [how, setHow] = useState(false);
  const def = ZONES[i];
  const hue = ZONE_COLORS[i];
  const z = game.zones[i];
  const cost = zoneCost(game, i);
  const afford = game.ash.gte(cost);
  const step = z.bought % 10;
  const more = 10 - step;
  const moreCost = shaftsCost(game, i, more);
  const out = zoneOutput(game, i);
  const each = zoneMult(game, i).mul(def.rate);
  const above = i > 0 ? ZONES[i - 1].name : '';
  const below = i < 8 ? ZONES[i + 1].name : '';
  const mRate = matRate(game, i);
  const boost = matBoost(game, i);
  const maxOpen = zoneMaxOpen(game, i);

  return (
    <section className={`panel zone-panel plate-panel knots reveal ${afford ? 'affordable' : ''}`} data-panel={`zone-${i}`}
      style={{ '--hue': hue } as CSSProperties}>
      <h2>
        <span className="zone-num">{def.id}</span> Zone {def.id}
        {i === 0 && <ShaftHelp />}
        <button className="help-toggle" onClick={() => setHow(true)} aria-haspopup="dialog">how it works</button>
      </h2>
      {how && <ZoneGuide zone={i} onClose={() => setHow(false)} />}

      <header className="zone-head">
        <Sprite rows={ZONE_ICONS[i]} px={4} className="zone-icon" />
        <div className="zone-ident">
          <div className="zone-name">{def.name}</div>
          <div className="zone-each">{i === 0 ? `Each catches ${fmt(each)} ash / s` : `Each digs ${fmt(each)} ${above}s / s`}</div>
        </div>
        <div className="zone-count">
          <span className="zone-amount">{fmt(z.amount)}</span>
          <small>owned · <b>{z.bought}</b> dug</small>
        </div>
      </header>
      <div className="zone-stats">
        <div className="zstat zstat-out" title={i === 0 ? 'Ash this zone catches every second' : `New ${above}s this zone digs every second`}>
          <span className="zstat-k">output</span>
          <span className="zstat-v">{out.gt(0) ? `+${fmt(out)}` : '—'}</span>
          <span className="zstat-u">{i === 0 ? 'ash' : `${above}s`} / s</span>
          <span className="zstat-note">x{fmt(zoneMult(game, i))} from boosts</span>
        </div>
        <div className="zstat zstat-boost" title={`${step} of 10 toward the next x${def.bonus}`}>
          <span className="zstat-k">next boost</span>
          <span className="zstat-v">x{def.bonus}</span>
          <span className="zstat-u">in {more}</span>
          <span className="zstat-pips">{Array.from({ length: 10 }, (_, k) => <i key={k} className={k < step ? 'on' : ''} />)}</span>
        </div>
        <div className="zstat zstat-mat" title={`${def.matLore} Spent on this zone's upgrades.${below ? ` Every ${below} dug speeds it up.` : ''}`}>
          <span className="zstat-k">{def.mat}</span>
          <span className="zstat-v">{fmt(matOf(game, i))}</span>
          <span className="zstat-u">{mRate > 0 ? `+${fmt(mRate)} / s` : 'dig to gather'}</span>
          {below && <span className="zstat-note">x{fmt(boost)} from {below}s</span>}
        </div>
      </div>

      <Artwork scene={ZONE_SCENES[i]} ink={hue} accent={ZONE_ART[i].accent} caption={ZONE_ART[i].caption} className="zone-art" />

      <p className="zone-lore">{def.lore}</p>
      {i > 0 && z.bought === 0 && (
        <div className="zone-how">
          <b>How it works.</b> Each {def.name} digs {fmt(each)} new {above}s every second, on its own, forever.
          More {above}s means more of everything above them, all the way up to ash. That is why deep zones are slow
          to start and then take over. Every 10 you dig multiplies this zone by x{def.bonus}, and owning 5 opens the next zone down.
        </div>
      )}

      <div className="zone-buttons">
        <button className="dig" disabled={!afford} onClick={() => buy(i)}>
          <span className="btn-label">{def.verb}</span><span className="btn-cost">{fmt(cost)} ash</span>
        </button>
        <button className="dig dig-more" disabled={!afford} onClick={() => buyTen(i)} title="Dig up to the next boost, as far as your ash goes">
          <span className="btn-label">{def.verb} {more} more</span><span className="btn-cost">{fmt(moreCost)} ash</span>
        </button>
      </div>

      <div className="zone-ups">
        <div className="zone-ups-head"><span>Upgrades</span><small>ash + {def.mat}</small></div>
        <div className="zup-grid">{ZONE_UP_SLOTS.map(slot => <ZoneUpCard key={slot.k} i={i} k={slot.k} />)}</div>
      </div>

      {i === COMPILER && wiringOpen(game) && <WiringPreview />}
      {i === BUFFER && z.bought > 0 && <PatternBuffer />}
      {i === SPIRAL && alchemyOpen(game) && <SpiralPreview />}
      {i === COMPILER && z.bought > 0 && !wiringOpen(game) && <p className="dim small-note wake-note">The Exchange is dark. It lights up when the first <b>Murmur</b> is transcribed (zone 8), and then its lines can be patched.</p>}
      {i === SPIRAL && z.bought > 0 && !alchemyOpen(game) && <p className="dim small-note wake-note">The spiral is grey. It takes colour when the first <b>Compiler</b> runs (zone 7).</p>}
      <ChallengeSlot zone={i} />

      <button className={`zone-max zone-max-${i + 1}`} disabled={!maxOpen} onClick={() => maxAll(i)}
        title={maxOpen ? 'Spend ash and material on the cheapest shaft or upgrade here until nothing is affordable' : 'Opens once every upgrade here has a level'}>
        <span>{maxOpen ? `Max all · zone ${def.id}` : 'Max all · give every upgrade a level'}</span>
      </button>
    </section>
  );
}

/** What the first shaft of a zone wakes further up, so the teaser can say so. */
const WAKES: Record<number, string> = { 4: 'the modulator in the Pattern Buffer', 6: 'the colours of the Barker Spiral', 7: 'the Exchange in the Compiler' };

/** The dashed box for the next zone down, so the player can see what they are working toward. */
export function ZoneTeaser({ i }: { i: number }) {
  const game = useGame(st => st.game);
  const above = ZONES[i - 1];
  return (
    <section className="panel zone-panel plate-panel zone-teaser knots" data-panel={`zone-${i}`} style={{ '--hue': ZONE_COLORS[i] } as CSSProperties}>
      <h2><span className="zone-num">{i + 1}</span> Zone {i + 1}</h2>
      <Artwork scene={ZONE_SCENES[i]} ink={ZONE_COLORS[i]} accent={ZONE_ART[i].accent} veil={0.82} caption="? ? ?" className="zone-art" />
      <p className="zone-desc">Opens at 5 {above.name}s ({game.zones[i - 1].bought}/5). It will dig {above.name}s.</p>
      {WAKES[i] && <p className="dim small-note wake-note">Its first shaft also wakes {WAKES[i]}.</p>}
    </section>
  );
}

export const nextZone = (game: Parameters<typeof zoneVisible>[0]) => ZONES.findIndex((_, i) => !zoneVisible(game, i));
