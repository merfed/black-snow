// The zone guide: how everything in each zone works, written out in full. Content as data: each section has
// an unlock predicate so the guide only ever describes what the player has already reached, and a body
// that reads the live game so the numbers it prints are the numbers the engine uses.
// Styles live in src/ui/zone-guide.css (loaded by the popup); this file only emits markup.
import Decimal from 'break_eternity.js';
import type { ReactNode } from 'react';
import { ZONES, UPGRADES, RITES } from './data';
import {
  AWAY_BONUS, MAT_BELOW, MAT_RATE, UNDERPIN_MAX, comfort, comfortMult, comfortPerk, giftTotal, globalMult, has, listenBase,
  matBoost, matOf, matRate, owns, passiveRate, pigmentRate, sinkLevel, sinkMult, sinkOpen, tunedTo, underpin, weatherMult,
  zoneCost, zoneGrowth, zoneMaxOpen, zoneMult, zoneOutput, zoneUpCost, zoneUpGate, zoneUpKey, zoneUpLevel, zoneUpMatCost,
  zoneUpMult, zoneVisible,
} from './engine';
import { COMFORT_PERKS, SINKS, ZONE_UP_NAMES, ZONE_UP_SLOTS } from './systems';
import { fmt, fmtTime } from './format';
import type { GameState } from './state';
import { achievementMult } from './achievements';
import { quirkMult } from './familiars';
import * as PT from './patterns';
import * as AL from './alchemy';
import * as WR from './wiring';
import * as CT from './citadel';
import { challengesBegin, chByZone, chMult, chUnlocked, CHALLENGES, PLEX_AT, plexNeeded, type ChallengeId } from './challenges';
import { PRICE_CLIMB, PRICE_LAG } from './challenges/types';
import * as SV from './challenges/survey';
import * as UT from './challenges/undertow';
import * as AR from './challenges/archive';
import * as ST from './challenges/stair';
import * as SE from './challenges/seal';
import * as RG from './challenges/ring';
import * as OP from './challenges/operator';
import * as SC from './challenges/scriptorium';
import * as SY from './challenges/syzygy';

export interface GuideSection {
  id: string;
  /** The heading this section sits under in the index. */
  group: string;
  title: string;
  unlocked: (s: GameState) => boolean;
  body: (s: GameState) => ReactNode;
}

// ---------------------------------------------------------------- little blocks

const P = ({ children }: { children: ReactNode }) => <p className="g-p">{children}</p>;
/** The station talking. Short, strange, never mechanics. */
const V = ({ children }: { children: ReactNode }) => <p className="g-voice">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h4 className="g-h">{children}</h4>;
/** A formula, set apart and in the instrument face. */
const F = ({ children }: { children: ReactNode }) => <div className="g-formula">{children}</div>;
/** A live readout from the save. */
const Now = ({ children }: { children: ReactNode }) => <div className="g-now"><span className="g-now-tag">now</span><div>{children}</div></div>;
const UL = ({ items }: { items: ReactNode[] }) => <ul className="g-list">{items.map((x, k) => <li key={k}>{x}</li>)}</ul>;
const OL = ({ items }: { items: ReactNode[] }) => <ol className="g-list g-ol">{items.map((x, k) => <li key={k}>{x}</li>)}</ol>;
function T({ head, rows, note }: { head: ReactNode[]; rows: ReactNode[][]; note?: ReactNode }) {
  return (
    <div className="g-table-wrap">
      <table className="g-table">
        <thead><tr>{head.map((h, k) => <th key={k}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
      {note && <p className="g-table-note">{note}</p>}
    </div>
  );
}
const B = ({ children }: { children: ReactNode }) => <b className="g-b">{children}</b>;

const x = (v: Decimal | number, p = 2) => `x${fmt(v, p)}`;
const pct = (v: number) => {
  const p = v * 100;
  return `${p !== 0 && Math.abs(p) < 0.1 ? +p.toPrecision(2) : +p.toFixed(p < 10 ? 2 : 1)}%`;
};
const n2 = (v: number) => (Math.abs(v) >= 1000 ? fmt(v) : String(+v.toFixed(3)));
const hours = (sec: number) => (sec >= 3600 ? `${+(sec / 3600).toFixed(2)} h` : sec >= 60 ? `${+(sec / 60).toFixed(1)} min` : `${+sec.toFixed(1)} s`);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const zoneName = (i: number) => ZONES[i].name;
const upName = (id: string) => UPGRADES.find(u => u.id === id)?.name ?? id;
const riteName = (id: string) => RITES.find(r => r.id === id)?.name ?? id;
const chOpen = (id: ChallengeId) => (s: GameState) => chUnlocked(s, id);

/** A state that only knows one zone upgrade's level, for printing the price and gate ladders. */
const atLevel = (i: number, k: number, l: number) => ({ zoneUps: { [zoneUpKey(i, k)]: l } }) as unknown as GameState;

/** What "slow income" means, for the challenges that price their items off it. */
const SlowIncome = () => (
  <P>
    <i>Slow income</i> is your passive ash per second, held back: it starts at your income when the challenge opens, follows a
    drop at once, but climbs at most {PRICE_CLIMB} orders of magnitude an hour and never trails live income by more
    than {PRICE_LAG}. Saving up for something never chases an income that doubles every half hour.
  </P>
);

// ---------------------------------------------------------------- shafts

function shaftSection(i: number): GuideSection {
  return {
    id: `z${i}-shaft`, group: 'The shaft', title: ZONES[i].name, unlocked: s => zoneVisible(s, i),
    body: s => {
      const d = ZONES[i];
      const z = s.zones[i];
      const g = zoneGrowth(s, i);
      const above = i > 0 ? ZONES[i - 1].name : '';
      const per10 = Decimal.pow(d.bonus, Math.floor(z.bought / 10));
      const ladder = [0, 9, 24, 49, 99, 199].map(b => [`#${b + 1}`, `${fmt(new Decimal(d.baseCost).mul(Decimal.pow(g, b)).floor())} ash`]);
      const away = (12 + CT.awayHours(s)) * 3600;
      return (
        <>
          <V>{d.lore}</V>
          <P>
            Zone {d.id} is the <B>{d.name}</B>. {i === 0
              ? <>Each one catches ash on its own, every second, forever. This is where every passive ash in the station finally comes from: the deeper zones never touch ash themselves, they only make more of the zone above.</>
              : <>Each one bores new <B>{above}s</B> on its own, every second, forever. It does not catch ash itself: it makes more of the zone above, and those make more of the zone above them, all the way up to the Shallow Bores that catch the ash.</>}
          </P>
          <T head={['', 'value']} rows={[
            ['Base rate, per shaft', i === 0 ? `${d.rate} ash / s` : `${d.rate} ${above}s / s`],
            ['First shaft costs', `${fmt(d.baseCost)} ash`],
            ['Each shaft bought multiplies the next price by', `x${d.growth} (base)`],
            ['Every 10 bought multiplies this zone by', `x${d.bonus}`],
            ['Each shaft bought trickles', `${MAT_RATE} ${d.mat} / s`],
            ['Opens the next zone down at', i < 8 ? '5 bought' : 'nothing below: this is the bottom'],
          ]} />
          <H>Price</H>
          <F>price = floor( {fmt(d.baseCost)} × growth ^ bought )</F>
          <P>
            Only shafts you <i>buy</i> raise the price. Shafts that the zone below bores into this one add to the amount you
            own and to the output, but they never raise the price, never count toward the every-10 boost, never trickle
            {' '}{d.mat} and never count toward the zone upgrade requirements. The "bought" number is the one under the count in the box ("dug").
          </P>
          <P>The growth starts at x{d.growth}. The second upgrade of this zone ({ZONE_UP_NAMES[i][1]}) shaves it down level by level.</P>
          <T head={['Shaft', 'price at today’s growth']} rows={ladder} note={`Growth now: x${n2(g)} per shaft bought.`} />
          <P>The button beside the dig button buys shafts one by one up to the next multiple of 10, as far as your ash goes.</P>
          <H>Output</H>
          <F>{i === 0 ? `ash / s = owned × ${d.rate} × zone multiplier × all-ash multiplier` : `${above}s / s = owned × ${d.rate} × zone multiplier`}</F>
          <P>
            The zone multiplier is everything that makes this zone work harder: the every-10 boost
            (x{d.bonus} for every 10 bought, compounding), this zone's upgrades, {i < 8 ? <>the {zoneName(i + 1)}s dug below it, </> : null}and
            whatever else in the station is aimed at it. The section <i>How this zone connects</i> lists every part of it you have
            reached, with today's numbers.
            {i === 0 && <> Shallow Bore output is then multiplied once more by the all-ash multiplier, which every ash source shares.</>}
          </P>
          {i > 0 && (
            <P>
              The cascade runs deepest first every tick (20 times a second), so a {d.name} bores {above}s that are already
              digging by the next tick. That is why a deep zone is slow to matter and then takes over: each zone multiplies
              the one above it, and the effect compounds all the way up.
            </P>
          )}
          <Now>
            You own <B>{fmt(z.amount)}</B> ({z.bought} bought). Each makes <B>{fmt(zoneMult(s, i).mul(d.rate))}</B>
            {i === 0 ? ' ash / s before the all-ash multiplier' : ` ${above}s / s`}. All together:
            <B> {fmt(zoneOutput(s, i))}</B> {i === 0 ? 'ash' : `${above}s`} / s. Every-10 boost {x(per10)}.
            Next shaft <B>{fmt(zoneCost(s, i))} ash</B>.
          </Now>
          <H>The next zone</H>
          <P>
            {i < 8
              ? <>When you own 5 bought {d.name}s, the next zone down shows itself, and its first shaft can be bought. A zone also stays visible once you have bought one there.</>
              : <>The Plex is the bottom. Nothing lies below it to open.</>}
            {i === 0 && <> Shafts themselves open with the instrument <B>{upName('floor')}</B> ({fmt(UPGRADES.find(u => u.id === 'floor')!.cost)} ash).</>}
            {owns(s, 'coil') && <> The first shaft bought in any zone also widens the station: echoes trickle 0.05 / s faster for every zone opened.</>}
            {owns(s, 'antenna') && <> Siren rust grows 25% for every zone opened, and with the square root of all shafts bought.</>}
          </P>
          {i === 8 && challengesBegin(s) && (
            <P>Your first Plex began the zone challenges: one late system in each zone's box, opening one after another, starting with the Shallow Bore. Each waits for more Plex dug ({PLEX_AT.join(', ')}).</P>
          )}
          {i > 0 && has(s, 'stop') && (
            <P>
              The rite <B>{riteName('stop')}</B> is held: every {d.name} you own (bought or bored) also catches 1 ash / s directly,
              multiplied by the all-ash multiplier. At {fmt(z.amount)} owned that is {fmt(z.amount.mul(globalMult(s)))} ash / s from this zone.
            </P>
          )}
          <H>Time away</H>
          <P>
            While the game is closed the station runs by the same rules as when you watch it, in steps of about ten seconds
            (a long absence is cut into at most 2,000 steps): the cascade digs, {owns(s, 'antenna') && <>sirens still come, stop the
            shafts' ash while they sound{has(s, 'wire') ? ' (a quarter gets through)' : ''} and pay rust, </>}echoes,
            the weather, the nursery, pigment, cycles, the challenges{s.citadel.awake ? ' and the Citadel' : ''} all move. Only warm
            flakes are missed: nobody is there to catch them, and one that was up when you left melts.
            Up to 12 hours are counted{s.citadel.awake && <>, plus 6 more for each level of the Citadel's sealed room</>}. Away for
            less than 10 seconds counts for nothing.
          </P>
          {owns(s, 'backroom') && (
            <P>
              At {COMFORT_PERKS[3].at} comfort the station keeps working for you: while you are away, sirens no longer stop the
              shafts, and passive ash comes in x{AWAY_BONUS}. {comfortPerk(s, 3) ? 'You have it.' : `You have ${n2(comfort(s))} comfort.`}
            </P>
          )}
          <Now>Up to <B>{hours(away)}</B> of absence count.</Now>
        </>
      );
    },
  };
}

// ---------------------------------------------------------------- zone upgrades

function upgradesSection(i: number): GuideSection {
  return {
    id: `z${i}-ups`, group: 'The shaft', title: 'Its four upgrades', unlocked: s => zoneVisible(s, i),
    body: s => {
      const d = ZONES[i];
      const name = zoneName(i);
      const eff = [
        `${name}s work x${zoneUpMult(i, 0)} as hard`,
        `the price growth of ${name}s shrinks`,
        `${name}s work x${zoneUpMult(i, 2)} as hard`,
        'all ash x1.02, everywhere',
      ];
      const growth = zoneGrowth(s, i);
      return (
        <>
          <P>
            Four upgrades sit at the bottom of the box. Each can be bought again and again with no cap. A level needs
            more {name}s <i>bought</i> before it opens, and costs ash and this zone's own material, <B>{d.mat}</B>. Every level
            compounds with the ones before it.
          </P>
          <T head={['Upgrade', 'each level', 'level 1 needs', 'level 1 costs']}
            rows={ZONE_UP_SLOTS.map(sl => [
              <B key="n">{ZONE_UP_NAMES[i][sl.k]}</B>, eff[sl.k], `${sl.gate} bought`,
              `${fmt(zoneUpCost(atLevel(i, sl.k, 0), i, sl.k))} ash + ${fmt(zoneUpMatCost(atLevel(i, sl.k, 0), i, sl.k))} ${d.matShort.toLowerCase()}`,
            ])} />
          <H>Requirements</H>
          <F>bought needed = ceil( first × 1.5 ^ level + step × level )</F>
          <T head={['Upgrade', 'step', 'levels 1 to 7 need (bought)']}
            rows={ZONE_UP_SLOTS.map(sl => [ZONE_UP_NAMES[i][sl.k], String(sl.gateStep),
              Array.from({ length: 7 }, (_, l) => zoneUpGate(atLevel(i, sl.k, l), i, sl.k)).join(', ')])} />
          <H>Prices</H>
          <F>ash = {fmt(d.baseCost)} × slot factor × growth ^ (level²) · {d.mat} = round( first × growth ^ level )</F>
          <P>The square in the ash exponent means each level's price climbs a little faster than the last; levels never stop, they just slow down.</P>
          <T head={['Upgrade', 'ash growth', `${d.matShort.toLowerCase()} first`, `${d.matShort.toLowerCase()} growth`]}
            rows={ZONE_UP_SLOTS.map(sl => [ZONE_UP_NAMES[i][sl.k], `x${sl.growth} ^ (level²)`, String(sl.mat), `x${sl.matGrowth} a level`])} />
          <T head={['Upgrade', 'levels 1 to 5 cost']}
            rows={ZONE_UP_SLOTS.map(sl => [ZONE_UP_NAMES[i][sl.k],
              Array.from({ length: 5 }, (_, l) => `${fmt(zoneUpCost(atLevel(i, sl.k, l), i, sl.k))} + ${fmt(zoneUpMatCost(atLevel(i, sl.k, l), i, sl.k))}`).join(' · ')])}
            note={`Ash + ${d.mat}.`} />
          <H>What each does</H>
          <UL items={[
            <><B>{ZONE_UP_NAMES[i][0]}</B>: this zone's multiplier x{zoneUpMult(i, 0)} per level, compounding ({i === 0 ? 'the Shallow Bore gets the large version' : 'deep zones get a small one, because their output compounds up the cascade'}).</>,
            <><B>{ZONE_UP_NAMES[i][1]}</B>: shrinks the part of the price growth above 1. Each of the first 8 levels takes 3% off it, every level after that 1%. <F>growth = 1 + ({d.growth} − 1) × 0.97 ^ min(level, 8) × 0.99 ^ max(0, level − 8)</F></>,
            <><B>{ZONE_UP_NAMES[i][2]}</B>: this zone's multiplier x{zoneUpMult(i, 2)} per level, compounding.</>,
            <><B>{ZONE_UP_NAMES[i][3]}</B>: all ash x1.02 per level. It is part of the all-ash multiplier, so it counts the same in every zone's box and they all stack.</>,
          ]} />
          <H>{cap(d.mat)}</H>
          <V>{d.matLore}</V>
          <P>
            Every {name} you buy trickles {MAT_RATE} {d.mat} a second, forever.
            {i < 8
              ? <> Every {zoneName(i + 1)} bought in the zone below makes it come faster, {pct(MAT_BELOW)} more each, without end.</>
              : <> Nothing lies below the Plex to hurry it.</>}
            {' '}It is spent only on this box's upgrades.
          </P>
          <F>{d.mat} / s = {MAT_RATE} × bought{i < 8 ? ` × (1 + ${zoneName(i + 1)}s bought ÷ ${n2(1 / MAT_BELOW)})` : ''}</F>
          <Now>
            Levels: {ZONE_UP_SLOTS.map(sl => `${ZONE_UP_NAMES[i][sl.k]} ${zoneUpLevel(s, i, sl.k)}`).join(' · ')}.<br />
            Next levels need {ZONE_UP_SLOTS.map(sl => zoneUpGate(s, i, sl.k)).join(' / ')} bought (you have {s.zones[i].bought}) and
            cost {ZONE_UP_SLOTS.map(sl => fmt(zoneUpCost(s, i, sl.k))).join(' / ')} ash
            and {ZONE_UP_SLOTS.map(sl => fmt(zoneUpMatCost(s, i, sl.k))).join(' / ')} {d.mat}. Price growth now x{n2(growth)}.<br />
            {cap(d.mat)} held <B>{fmt(matOf(s, i))}</B>, +{fmt(matRate(s, i))} / s{i < 8 ? ` (the zone below ${x(matBoost(s, i), 3)})` : ''}.
          </Now>
        </>
      );
    },
  };
}

function maxSection(i: number): GuideSection {
  return {
    id: `z${i}-max`, group: 'The shaft', title: 'Max all', unlocked: s => zoneMaxOpen(s, i),
    body: () => (
      <>
        <P>
          <B>Max all in zone {ZONES[i].id}</B> appears once each of the four upgrades in this box has at least one level.
          One press spends ash on the cheapest thing in the box (the next {zoneName(i)}, or any upgrade level that is open and
          whose {ZONES[i].mat} you have), then the cheapest again, and so on until nothing left is affordable. It will make up
          to 5,000 purchases in one press.
        </P>
        <P>
          It spends ash, and {ZONES[i].mat} on the upgrade levels; a level whose {ZONES[i].mat} you lack is skipped, never
          waited for. It never buys in any other zone. The Operator's MAX line presses this same button.
        </P>
      </>
    ),
  };
}

// ---------------------------------------------------------------- how a zone connects

interface Source { name: ReactNode; value: (s: GameState) => Decimal | number; on: (s: GameState) => boolean; note?: ReactNode }

function zoneSources(i: number): Source[] {
  const tin = (t: AL.TinctureTarget) => (s: GameState) => AL.tinctureMult(s, t);
  const list: Source[] = [
    { name: `Every 10 bought (x${ZONES[i].bonus} each)`, value: s => Decimal.pow(ZONES[i].bonus, Math.floor(s.zones[i].bought / 10)), on: () => true },
    { name: ZONE_UP_NAMES[i][0], value: s => Math.pow(zoneUpMult(i, 0), zoneUpLevel(s, i, 0)), on: () => true },
    { name: ZONE_UP_NAMES[i][2], value: s => Math.pow(zoneUpMult(i, 2), zoneUpLevel(s, i, 2)), on: () => true },
  ];
  if (i < 8) list.push({
    name: `${zoneName(i + 1)}s bought below (up to x${1 + UNDERPIN_MAX}: 1 + ${UNDERPIN_MAX} × b ÷ (b + 100))`,
    value: s => underpin(s, i), on: () => true,
  });
  if (i <= 1) list.push({ name: upName('spade'), value: () => 2, on: s => owns(s, 'spade') });
  if (i === 1) list.push({ name: upName('spade2'), value: () => 1.5, on: s => owns(s, 'spade2') });
  list.push({ name: upName('name_feed'), value: () => 1.5, on: s => owns(s, 'name_feed') });
  if (i === 0) {
    list.push(
      { name: upName('copper'), value: () => 2, on: s => owns(s, 'copper') },
      { name: `Rite: ${riteName('name')}`, value: () => 2, on: s => has(s, 'name') },
      { name: `${upName('spade3')} (1% per shaft ever dug, up to x2)`, value: s => 1 + Math.min(1, 0.01 * s.shaftsDug), on: s => owns(s, 'spade3') },
      { name: 'Brood with the bore gift (+10% per point; past 40 points, a cube-root taper)', value: s => 1 + 0.1 * giftTotal(s, 'bores'), on: s => giftTotal(s, 'bores') > 0 },
      { name: 'The hum, while tuned (x2)', value: s => (tunedTo(s, 'hum') ? 2 : 1), on: s => !!s.freqs.hum },
      { name: 'Black wind weather (x1.5, x2 with the Weather service)', value: s => weatherMult(s, 'wind', 1.5), on: s => owns(s, 'floor') },
    );
  }
  if (i !== WR.COMPILER) list.push({
    name: WR.PORTS.find(p => p.zone === i)?.late ? 'The Exchange port (needs the bus extended)' : 'The Exchange port',
    value: s => WR.wiringMult(s, i), on: WR.wiringOpen,
  });
  if (i <= 4) list.push({ name: 'Tinctures aimed at this zone', value: tin(`zone${i}` as AL.TinctureTarget), on: s => AL.tinctureMult(s, `zone${i}` as AL.TinctureTarget) > 1 });
  list.push({ name: 'Tinctures aimed at every zone', value: tin('zones'), on: s => AL.tinctureMult(s, 'zones') > 1 });
  list.push({ name: 'Familiars with the zones quirk', value: s => quirkMult(s, 'zones'), on: s => quirkMult(s, 'zones') > 1 });
  list.push({
    name: 'Challenges and the Citadel aimed at this zone', value: s => chMult(s, `zone${i}` as 'zone0'),
    on: s => CHALLENGES.some(c => chUnlocked(s, c.id)),
    note: 'This zone’s own challenge, plus any seal, foreman, Syzygy current or dream pointed here.',
  });
  list.push({
    name: 'Challenges and the Citadel aimed at every zone', value: s => chMult(s, 'zones'),
    on: s => chUnlocked(s, 'syzygy'), note: 'The black sun’s totality, the Hollow choir, the Citadel’s own dream.',
  });
  return list;
}

const tower = SINKS.find(k => k.id === 'tower')!;

function ashSources(): Source[] {
  return [
    { name: upName('lights'), value: () => 1.5, on: s => owns(s, 'lights') },
    { name: `${upName('eye3')} (+2% per warm flake caught, up to +300%)`, value: s => 1 + Math.min(3, 0.02 * s.warmCaught), on: s => owns(s, 'eye3') },
    { name: 'Kindled (a caught warm flake doubles all ash for a while)', value: s => (s.kindled > 0 ? 2 : 1), on: s => owns(s, 'eye2') || !!s.kiln.kindling },
    { name: 'Comfort (1% a point to 200, then a cube-root taper)', value: comfortMult, on: s => owns(s, 'backroom') },
    { name: 'Brood with the ash gift (+5% per point; past 40 points, a cube-root taper)', value: s => 1 + giftTotal(s, 'ash') * 0.05, on: s => giftTotal(s, 'ash') > 0 },
    { name: 'Ember tithe (1% per ember kept, up to +50%)', value: s => (s.kiln.tithe ? 1 + Math.min(0.5, 0.01 * s.embers) : 1), on: s => !!s.kiln.tithe },
    { name: 'Dry thunder weather (x1.1, x1.2 with the Weather service)', value: s => weatherMult(s, 'thunder', 1.1), on: s => owns(s, 'floor') },
    { name: 'The fourth upgrade of every zone (x1.02 a level)', value: s => Array.from({ length: 9 }, (_, k) => Math.pow(1.02, zoneUpLevel(s, k, 3))).reduce((a, b) => a * b, 1), on: s => owns(s, 'floor') },
    { name: 'Achievements (+1% each)', value: achievementMult, on: s => Object.keys(s.achievements).length > 0 },
    { name: `${tower.name} (x${tower.per} a level, ${fmt(tower.base)} rust and x${tower.growth} each)`, value: s => sinkMult(s, 'tower'), on: s => sinkOpen(s, 'tower') || sinkLevel(s, 'tower') > 0 },
    { name: 'The modulator and its tapes, on ash', value: s => PT.patternMult(s, 'ash'), on: PT.patternsOpen },
    { name: 'Tinctures aimed at ash', value: s => AL.tinctureMult(s, 'ash'), on: s => AL.tinctureMult(s, 'ash') > 1 },
    { name: 'Challenges and the Citadel, on ash', value: s => chMult(s, 'ash'), on: s => CHALLENGES.some(c => chUnlocked(s, c.id)) },
  ];
}

function SourceTable({ s, list, total, totalLabel }: { s: GameState; list: Source[]; total: Decimal | number; totalLabel: string }) {
  const rows = list.filter(r => r.on(s)).map(r => [<>{r.name}{r.note && <span className="g-sub">{r.note}</span>}</>, x(r.value(s))]);
  return <T head={['Source', 'now']} rows={[...rows, [<B key="t">{totalLabel}</B>, <B key="v">{x(total)}</B>]]} />;
}

function linksSection(i: number): GuideSection {
  return {
    id: `z${i}-links`, group: 'Connections', title: 'How this zone connects', unlocked: s => zoneVisible(s, i) && s.zones[i].bought > 0,
    body: s => {
      const above = i > 0 ? zoneName(i - 1) : '';
      return (
        <>
          <P>
            Everything below multiplies together into this zone's multiplier. Only what you have reached is listed; a source at x1
            is reached but not doing anything yet.
          </P>
          <SourceTable s={s} list={zoneSources(i)} total={zoneMult(s, i)} totalLabel="Zone multiplier" />
          {i < 8 && (
            <P>
              The zone below holds this one up twice over: every {zoneName(i + 1)} bought steadies this zone's output a little
              (the row above, which tapers toward x{1 + UNDERPIN_MAX}) and makes its {ZONES[i].mat} come faster.
            </P>
          )}
          {i === 0 ? (
            <>
              <P>
                Shallow Bore output is ash, and ash passes through one more multiplier on its way in: the <B>all-ash multiplier</B>.
                It multiplies everything that gives ash at a rate: the bores, rites that catch ash directly, and the slice of passive ash some instruments add to Listen.
              </P>
              <SourceTable s={s} list={ashSources()} total={globalMult(s)} totalLabel="All-ash multiplier" />
              <Now>Passive ash: <B>{fmt(passiveRate(s))}</B> / s (not counting the siren). Listen base: {fmt(listenBase(s))}.</Now>
            </>
          ) : (
            <P>
              What this zone makes goes straight into the {above}s' amount. Doubling this zone's multiplier doubles the rate new
              {' '}{above}s arrive, which over time grows everything above, so a bonus on a deep zone is worth more the longer it runs.
            </P>
          )}
          {i === 3 && s.citadel.awake && <P>The Drowning dream multiplies Rampant Wells x{CT.DREAMS.drowning.mult.zone3} while it burns.</P>}
        </>
      );
    },
  };
}

// ---------------------------------------------------------------- the Pattern Buffer's modulator

const bufferSections: GuideSection[] = [
  {
    id: 'z2-buffer', group: 'The modulator', title: 'Bending the pattern', unlocked: PT.patternsOpen,
    body: s => {
      const strength = PT.patternStrength(s);
      return (
        <>
          <V>It records the shaft and plays it back. Played back near enough to something else, it becomes that.</V>
          <P>
            The modulator woke when the first {zoneName(PT.MODULATOR_ZONE)} was sealed below it. It has slots; each slot plays a
            wave set by three dials and is pointed at one resource. Every resource has a hidden signature, different in every save.
            The closer a slot's wave matches its target's signature, the more that resource grows.
          </P>
          <T head={['Dial', 'range']} rows={[
            ['Freq', `1 to ${PT.FREQ_MAX}`],
            ['Phase', `0 to ${PT.PHASE_STEPS - 1}, around a circle (${PT.PHASE_STEPS - 1} sits next to 0)`],
            ['Harm', `1 to ${PT.HARM_MAX}`],
          ]} />
          <H>The match</H>
          <F>match = f × p × h</F>
          <UL items={[
            <>f = 1 − |freq − signature freq| / {PT.FREQ_MAX - 1}</>,
            <>p = 1 − (distance around the circle between phases) / {PT.PHASE_STEPS / 2}</>,
            <>h = 1 − |harm − signature harm| / {PT.HARM_MAX - 1}</>,
          ]} />
          <P>
            Each dial counts on its own, so you can tune by ear: turn one dial, watch the meter, keep the direction that raises it.
            A dial that is as far off as it can be zeroes the whole match, so get all three roughly right first, then refine.
          </P>
          <H>What it pays</H>
          <F>bonus = 1 + max × strength × match⁴ × (1.5 for an exact lock)</F>
          <P>
            The fourth power means only a close match pays much: 90% pays 66% of the full amount, 70% only 24%. An exact match
            (all three dials home) is a lock and pays half again. Strength grows with Pattern Buffers bought:
          </P>
          <F>strength = 1 + log10( max(1, bought / {PT.SLOT_AT[0]}) )</F>
          <T head={['Target', 'max', 'what it multiplies']} rows={PT.PATTERN_TARGETS.map(t => [t.name, String(t.max), {
            ash: 'the all-ash multiplier', listen: 'ash per Listen', echoes: 'echoes per second', rust: 'rust during sirens',
            cycles: 'the Compiler’s cycles', pigment: 'the spiral’s pigment', embers: 'embers from each warm flake',
          }[t.id]])} />
          <P>Two slots can never point at the same target.</P>
          <Now>
            Strength <B>{n2(strength)}</B> ({s.zones[PT.BUFFER].bought} bought). Slots open: {PT.patternSlots(s)}.
            {s.patterns.slots.slice(0, PT.patternSlots(s)).map((sl, k) => sl.target
              ? <span key={k}><br />Slot {k + 1}: {sl.target}, match {pct(PT.match(s, sl))}, {sl.target} {x(PT.patternMult(s, sl.target), 3)}</span>
              : <span key={k}><br />Slot {k + 1}: empty</span>)}
          </Now>
        </>
      );
    },
  },
  {
    id: 'z2-slots', group: 'The modulator', title: 'More slots', unlocked: s => PT.patternSlots(s) >= 2,
    body: s => (
      <>
        <P>
          The first slot came with the modulator. A second opened at {PT.SLOT_AT[1]} Pattern Buffers
          bought{PT.patternSlots(s) >= 3 ? <>, and a third at {PT.SLOT_AT[2]}</> : null}.
          Each slot has its own dials and its own target; bonuses on different targets are separate multipliers.
        </P>
        <P>Switch between slots with the buttons above the targets. A slot left without a target does nothing.</P>
      </>
    ),
  },
];

// ---------------------------------------------------------------- the Barker Spiral's alchemy

const TINCT_TEXT: Record<AL.TinctureTarget, string> = {
  ash: 'all ash', listen: 'ash per Listen', echoes: 'echoes', rust: 'siren rust', embers: 'embers per warm flake', cycles: 'cycles',
  pigment: 'pigment', comfort: 'comfort', luck: 'the chance of rare warm flakes', eggs: 'how fast eggs warm',
  zone0: 'Shallow Bores', zone1: 'Conduits', zone2: 'Pattern Buffers', zone3: 'Rampant Wells', zone4: 'Vacuum Locks', zones: 'every zone',
};

const spiralSections: GuideSection[] = [
  {
    id: 'z5-spiral', group: 'The spiral', title: 'Pigment and winding', unlocked: AL.alchemyOpen,
    body: s => {
      const a = s.alchemy;
      return (
        <>
          <V>Turn left forever and the colours come out mixed.</V>
          <P>
            The spiral took colour when the first {zoneName(AL.ALCHEMY_ZONE)} ran below it, with at least {AL.SPIRAL_AT} Barker
            Spirals bought. The Spirals make <B>pigment</B>, which pays for everything here.
          </P>
          <F>pigment / s = (0.4 + 1.2 × log10(owned + 1) + 0.1 × bought) × modulator × tinctures × challenges and the Citadel</F>
          <P>
            There are {AL.COLORS.length} base colours: twelve hues a twelfth of the wheel apart and four with no hue. You start with
            {' '}{AL.START_COLORS.map(c => AL.COLORS[c].name).join(', ')}.
          </P>
          <H>Winding</H>
          <OL items={[
            <>Drop two different ingredients into the spiral (three once the third slot is researched).</>,
            <>Each base colour dropped costs {AL.dropCost('c0')} pigment. A tincture you have found can be an ingredient too; it costs nothing and is not used up.</>,
            <>The wind takes {AL.windTime({ alchemy: { quick: 0 } } as unknown as GameState)} seconds (x0.7 for each level of quicker winding).</>,
            <>If the mix is a recipe you have not found, you find it: a <B>tincture</B> at level 1. If you already know it, winding it again only shows it. Anything else is <B>mud</B>, and the spiral remembers the mix so you never pay for it twice by accident.</>,
          ]} />
          <P>Order never matters: the same ingredients in any order are the same mix.</P>
          <H>Tinctures</H>
          <F>a tincture multiplies its target by 1 + per × level</F>
          <P>
            Every found tincture is in the grimoire, where it can be brewed again to raise its level. A brew costs pigment,
            x{AL.BREW_GROWTH} more each level. Tinctures aimed at the same target multiply together.
          </P>
          <F>brew = round( base × {AL.BREW_GROWTH} ^ level )</F>
          <Now>
            Pigment <B>{fmt(a.pigment)}</B>, +{fmt(pigmentRate(s))} / s. Colours {a.colors.length}/{AL.COLORS.length}.
            Found {Object.keys(a.found).length}/{AL.RECIPES.length} recipes, {a.tried.length} mud mixes remembered.
          </Now>
          {Object.keys(a.found).length > 0 && (
            <T head={['Tincture', 'mix', 'aimed at', 'per level', 'level', 'next brew']}
              rows={AL.RECIPES.filter(r => a.found[r.id]).map(r => [r.name, r.mix.map(AL.ingredientName).join(' + '), TINCT_TEXT[r.target],
                `+${r.per}`, String(a.found[r.id]), `${fmt(AL.brewCost(s, r))} pigment`])} />
          )}
          <P>Recipes not yet found stay unwritten here. Research hints if you are stuck.</P>
          <H>Time away</H>
          <P>
            Pigment keeps flowing while you are away, and a wind in progress finishes on its own, just as it would with you watching.
          </P>
        </>
      );
    },
  },
  {
    id: 'z5-research', group: 'The spiral', title: 'Research', unlocked: AL.alchemyOpen,
    body: s => (
      <>
        <P>Research spends pigment.</P>
        <T head={['Research', 'cost', 'does']} rows={[
          ['A new colour', `60 × 2.4 ^ (colours found beyond the first ${AL.START_COLORS.length}); now ${fmt(AL.colorCost(s))}`, 'reveals the next colour in wheel order'],
          ['A third slot', `${fmt(AL.SLOT3_COST)} once`, 'three-part recipes can be wound'],
          ['Quicker winding', `250 × 4 ^ level; now ${fmt(AL.quickCost(s))}`, `wind time x0.7 per level, at most ${AL.QUICK_MAX} levels`],
          ['A hint', `150 × 1.6 ^ (hints bought); now ${fmt(AL.hintCost(s))}`, 'reveals one ingredient of the first recipe you have not found that you could already make'],
        ]} />
        <P>A hint only ever points at a recipe whose ingredients you already hold, so it is never wasted on something out of reach.</P>
      </>
    ),
  },
];

// ---------------------------------------------------------------- the Compiler's Exchange

const exchangeSections: GuideSection[] = [
  {
    id: 'z6-exchange', group: 'The Exchange', title: 'Cycles and the board', unlocked: WR.wiringOpen,
    body: s => (
      <>
        <V>Every line the Compiler is trying to put through.</V>
        <P>
          The Exchange lit up when the first {zoneName(WR.EXCHANGE_ZONE)} reached the Compiler, with at least {WR.EXCHANGE_AT} Compilers
          bought. Compilers make <B>cycles</B>, and cycles buy parts that you lay on a {WR.COLS} × {WR.ROWS} board. The core on the
          left sends a signal out through whatever you lay; signal that reaches a zone's port on the right edge makes that zone
          work harder.
        </P>
        <F>cycles / s = (0.5 + 2 × log10(owned + 1) + 0.25 × bought) × modulator × tinctures × challenges and the Citadel</F>
        <P>
          The core puts out a signal of {WR.CORE_SIGNAL}. Ports run down the right edge for Shallow Bores, Conduits, Pattern Buffers,
          Rampant Wells, Vacuum Locks and Barker Spirals. The Compiler has no port of its own.
          {' '}Murmurs and Plexes have ports too, once the bus is extended.
        </P>
        <H>Parts</H>
        <T head={['Part', 'Copper', 'Silver', 'Gold', 'Void']} rows={WR.PART_KINDS.map(k => [WR.PARTS[k].name, ...[1, 2, 3, 4].map(t => WR.PARTS[k].desc(t))])} />
        <T head={['Part', 'price (cycles)']} rows={WR.PART_KINDS.map(k => [WR.PARTS[k].name, `${WR.PARTS[k].base} × 10 ^ (tier − 1)${k === 'wire' ? '' : `, then x${WR.PART_GROWTH} for every one of that kind already on the board; now ${fmt(WR.partCost(s, k, 1))} at Copper`}`])} />
        <H>How the signal travels</H>
        <UL items={[
          <>It spreads out from the core one step at a time, breadth first. Each part is fed by the nearest powered neighbour; a loop can never feed itself.</>,
          <>A part that has several unpowered neighbours <i>divides</i> its signal equally between them. A splitter divides too, but only between its first N neighbours (N is its branch count), checked in the order right, down, left, up, and it adds a little as it shares. Extra neighbours get nothing.</>,
          <>A wire loses a fixed amount per tile. A relay lifts a weak signal back up to its floor (a stronger one passes through unchanged).</>,
          <>An amplifier multiplies, but each one further along the same line gives less: the k-th amplifier on a line adds only 1/k² of its gain (the second a quarter, the third a ninth), so a chain of them levels off.</>,
          <>A signal that falls to 0 or below stops. A port takes all the signal that arrives, from every side, added up.</>,
        ]} />
        <F>amplifier k: signal × (1 + (gain − 1) ÷ k²)</F>
        <H>What a port pays</H>
        <F>Shallow Bores: 1 + {WR.PORT_GAIN.first} × log2(1 + signal) · every other zone: 1 + {WR.PORT_GAIN.deep} × log2(1 + signal)</F>
        <P>
          A logarithm, so every doubling of signal adds the same, and a board can never run away with the cascade. A signal of 100 at
          the Shallow Bore port is {x(WR.portMult(0, 100), 3)}; at a deep port, {x(WR.portMult(1, 100), 3)}.
        </P>
        <H>Laying, replacing, pulling</H>
        <UL items={[
          <>Dropping the same kind at a higher tier on a part upgrades it in place: you pay only the difference.</>,
          <>Dropping a different kind replaces it and refunds what was there.</>,
          <>Pulling a part refunds it in full, at today's price, so rewiring is free to try.</>,
          <><B>Upgrade all</B> brings every part up to the best tier you know, cheapest first, while cycles last.</>,
        ]} />
        <Now>
          Cycles <B>{fmt(s.wiring.cycles)}</B>, +{fmt(WR.cycleRate(s))} / s. Tier known: {WR.TIER_NAMES[s.wiring.tier - 1]}.
          {' '}{Object.entries(WR.flowCached(s).ports).map(([z, v]) => `${zoneName(Number(z))} port ${n2(v)} (${x(WR.portMult(Number(z), v), 3)})`).join(' · ') || 'No signal reaches a port yet.'}
        </Now>
        <H>Time away</H>
        <P>Cycles keep coming while you are away. The board itself never changes on its own.</P>
      </>
    ),
  },
  {
    id: 'z6-tiers', group: 'The Exchange', title: 'Tiers and the bus', unlocked: WR.wiringOpen,
    body: s => (
      <>
        <T head={['Tier', 'cycles to learn']} rows={WR.TIER_NAMES.map((n, k) => [n, k === 0 ? 'known from the start' : fmt(WR.TIER_COST[k])])} />
        <P>A tier, once learned, lets you lay parts of that tier. Better tiers lose less, amplify more, split wider and relay higher (see the parts table).</P>
        <P>
          <B>Extend the bus</B> costs {fmt(WR.BUS_COST)} cycles and needs {WR.TIER_NAMES[2]} learned. It opens two more ports, for
          Murmurs and Plexes, the zones past the Compiler.{s.wiring.bus ? ' Your bus is extended.' : ''}
        </P>
        <P>The Citadel, if it ever wakes, drinks a slice of held cycles. Spending them on the board keeps them safe from it.</P>
      </>
    ),
  },
];

// ---------------------------------------------------------------- challenges: shared

/** What each challenge's level counts: its node's strength on the Syzygy's plate, and the gate's offering. */
const LEVEL_TEXT: Record<ChallengeId, string> = {
  survey: 'cores read, plus bore heads placed',
  undertow: `approaches, patches, whole sets, every ${UT.MILESTONE_KEPT} things kept and every bin level, added up`,
  archive: 'tapes on the shelf, plus album sets, plus channels found',
  stair: 'landings reached, plus wishes granted, plus lanterns in the tank',
  seal: 'tiers opened, plus seals pressed, plus a tenth of every harvest',
  ring: 'the longest Barker code locked, plus catalysts dropped, plus refines',
  operator: 'cards punched beyond the first three, stack and banks beyond the first, clock levels, and floor(√(lines run ÷ 500))',
  scriptorium: 'glyphs solved, plus foremen seated, plus sentences solved',
  syzygy: 'live currents, plus pages written, plus 10 once the gate is open',
};

function chIntro(id: ChallengeId, s: GameState): ReactNode {
  const i = CHALLENGES.findIndex(c => c.id === id);
  const c = CHALLENGES[i];
  const need = plexNeeded(id);
  return (
    <>
      <V>{c.tagline}</V>
      <P>
        <B>{c.name}</B> is this zone's challenge: a late system that lives in the box and runs alongside the shafts.
        {i === 0
          ? ` It opened when your first Plex was bought. The challenges open one at a time, in zone order: each one waits for the milestone of the one before, and for more Plex dug (${PLEX_AT.join(', ')}).`
          : ` It opened once ${CHALLENGES[i - 1].name} had reached its milestone and ${need} Plex were dug.`}
      </P>
      <T head={['', '']} rows={[
        ['Opens at', `${need} Plex dug${i > 0 ? `, and ${CHALLENGES[i - 1].name}'s milestone` : ''}`],
        ['Milestone', <>{c.milestone.text}{c.milestone.done(s) ? ' (reached)' : ''}</>],
        ['Level now', n2(c.level(s))],
      ]} note={`The level counts ${LEVEL_TEXT[id]}.`} />
      {chUnlocked(s, 'syzygy') && id !== 'syzygy' && <P>Its level is also its node's strength on the Syzygy's plate (log2 of 1 + level).</P>}
    </>
  );
}

// ---------------------------------------------------------------- the Survey

const surveySections: GuideSection[] = [
  {
    id: 'ch-survey', group: 'The Survey', title: 'The Survey', unlocked: chOpen('survey'),
    body: s => {
      const v = s.challenges.survey;
      return (
        <>
          {chIntro('survey', s)}
          <P>Two halves: cores, which the bore pulls up on its own for you (or a core reader) to read, and bore heads on the snow map, which gather survey.</P>
          <H>What it pays</H>
          <T head={['Bonus', 'formula', 'now']} rows={[
            ['All ash, from cores read', '1 + 0.12 × (tally total)^0.45', x(SV.coreMult(v), 3)],
            ['Shallow Bores, from survey', '1 + 0.25 × log10(1 + survey ever gathered)', x(SV.zoneBonus(v), 3)],
          ]} />
          <H>Prices</H>
          <P>Everything here costs a span of slow income, counted as at least {fmt(1e7)} ash a second.</P>
          <SlowIncome />
          <H>Time away</H>
          <P>Cores keep arriving until the rack is full, the reader keeps reading, and bore heads keep gathering, while the game is closed. The map's drift runs on the Survey's own clock, so it is the same however the time passed.</P>
        </>
      );
    },
  },
  {
    id: 'ch-survey-cores', group: 'The Survey', title: 'Reading cores', unlocked: chOpen('survey'),
    body: s => {
      const v = s.challenges.survey;
      const w = SV.STRATA.reduce((n, k) => n + k.weight, 0);
      return (
        <>
          <P>
            The bore pulls up one core every {SV.CORE_EVERY / 60} minutes of the Survey's clock and racks it. The rack holds {SV.RACK_BASE},
            plus {SV.RACK_STEP} for each widening; cores stop coming while it is full. It starts with one core waiting.
          </P>
          <P>
            Open a core to read it. A core is {SV.KINDS_PER * SV.RUN} bands: {SV.KINDS_PER} strata, {SV.RUN} bands of each, shuffled so no
            run of {SV.RUN} is made yet. Swap any band with the one below it (two identical bands cannot swap). When {SV.RUN} of a kind
            line up, that run is read and drops out, and anything that closes up behind it can read too. A core with nothing left
            is finished and counts as read.
          </P>
          <T head={['Stratum', 'how often (weight)', 'value per run']} rows={SV.STRATA.map(k => [
            <>{k.name}{k.rare ? <span className="g-sub">rare: {k.lore?.length} lore lines, one per run read</span> : null}</>,
            `${n2(k.weight)} (${pct(k.weight / w)})`, String(k.value),
          ])} note="Strata are drawn by weight, three different ones per core." />
          <P>Each run read adds its value to that stratum's tally. The tally total drives the core bonus on all ash, tapering: about x2 at the milestone.</P>
          <H>The core reader</H>
          <P>
            Bought with ash, the reader takes racked cores and reads them whole by itself: one every {hours(SV.READ_EVERY)} at level 1,
            half again as fast each level after. It is slow and careless: a core it reads keeps only {pct(SV.AUTO_SHARE)} of its tally.
            Reading by hand keeps it all.
          </P>
          <F>cores / s = (1 + 0.5 × (level − 1)) ÷ {SV.READ_EVERY}</F>
          <H>Prices</H>
          <T head={['Buy', 'slow income', 'now']} rows={[
            ['Widen the rack', '5 min × 2.5 ^ widenings', `${fmt(SV.rackCost(s))} ash`],
            ['The core reader', '10 min × 3 ^ level', `${fmt(SV.readerCost(s))} ash`],
          ]} />
          <Now>
            Rack {v.rack}/{SV.rackSize(s)}, next core in {fmtTime((1 - v.coreProg) * SV.CORE_EVERY)}.
            Cores read <B>{v.read}</B>. Tally total {n2(SV.tallyTotal(v))}. Lore found {v.lore.length}.
            Reader level {v.reader}{v.reader ? `, a core every ${hours(1 / SV.readerRate(s))}` : ''}.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-survey-map', group: 'The Survey', title: 'Bore heads and the snow map', unlocked: chOpen('survey'),
    body: s => {
      const v = s.challenges.survey;
      return (
        <>
          <P>
            The map is {SV.MAP_W} × {SV.MAP_H} tiles of snowfield. Each tile has a density: how thickly the ash falls there right now.
            Every bore head gathers survey at its tile's density, per second.
          </P>
          <F>density = 0.3 + three drifts, each a soft round patch</F>
          <UL items={[
            'Each drift has its own strength (0.7 to 1.3) and size (1.6 to 3 tiles across from centre to edge).',
            'The drifts wander the field on slow looping paths; each loop takes somewhere between about four and sixteen hours.',
            'The paths are fixed by your save, so the same moment always looks the same.',
          ]} />
          <P>Buy a head and set it on an empty tile. Moving a head is free and instant, so follow the drifts. Two heads cannot share a tile.</P>
          <F>head price = slow income × 60 s × 1.6 ^ heads, up to the sixth; then × 3 for each head past six</F>
          <P>The milestone asks for six heads; past those, each one costs three times the last.</P>
          <Now>
            {v.heads.length} heads gathering <B>{n2(SV.surveyRate(s))}</B> survey / s. Survey ever gathered {fmt(v.surveyed)}.
            Next head {fmt(SV.headCost(s))} ash.
          </Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Undertow

const undertowSections: GuideSection[] = [
  {
    id: 'ch-undertow', group: 'The Undertow', title: 'The Undertow', unlocked: chOpen('undertow'),
    body: s => {
      const u = s.challenges.undertow;
      return (
        <>
          {chIntro('undertow', s)}
          <P>Four parts: the tray (objects rising up the pipe), the figure (someone far down the pipe), leaks, and the bore gauge.</P>
          <H>What it pays</H>
          <F>raw = gauge × kept × sets × patches{u.approaches >= 9 ? ' × 1.5' : ''}</F>
          <F>Conduits × taper(raw) × (1 − 0.05 × open leaks), never below x1</F>
          <F>taper(r) = r up to x{UT.TAPER_AT}, then {UT.TAPER_AT} × (1 + ln(r ÷ {UT.TAPER_AT}))</F>
          <P>Past x{UT.TAPER_AT} the Undertow grows only by a logarithm, so its many parts never compound away.</P>
          <T head={['Part', 'formula', 'now']} rows={[
            ['Gauge', `best of: 1 + efficiency³ × (0.8 + 0.25 × log2(1 + depth))${u.approaches >= 6 ? ' × 1.25' : ''}`, x(UT.gaugeMult(s), 3)],
            ['Kept', `1 + 0.06 × kept^0.6 × (1 + 0.25 × keep bin level)${u.approaches >= 7 ? ' × 1.5' : ''}`, x(UT.keepMult(s), 3)],
            ['Sets', '1 + 0.25 × sets^0.7', x(UT.setMult(s), 3)],
            ['Patches', `1 + 0.1 × patched^0.6${u.approaches >= 5 ? ' × 1.5' : ''}`, x(UT.patchMult(s), 3)],
            ['Raw', '', x(UT.rawBonus(s), 3)],
            [<B key="t">Conduits, all told</B>, '', <B key="v">{x(UT.zoneBonus(s), 3)}</B>],
          ]} />
          <H>Time away</H>
          <P>
            Objects keep rising while you are away. Any with a rule sort themselves; the rest fill the tray, and once it is full the
            next object waits in the pipe. A walk toward the figure finishes on its own, and leaks reopen.
          </P>
        </>
      );
    },
  },
  {
    id: 'ch-undertow-tray', group: 'The Undertow', title: 'The tray and the bins', unlocked: chOpen('undertow'),
    body: s => {
      const u = s.challenges.undertow;
      const odds = UT.rarityOdds(u.luck);
      const byR = (r: number) => UT.OBJECTS.find(o => o.rarity === r)!.id;
      return (
        <>
          <P>
            Something rises up the pipe every {hours(UT.deliveryTime(s))} into a tray that holds {UT.trayCap(s)} ({UT.TRAY}, and 4 more
            after the first approach). Sort each into a bin:
          </P>
          <UL items={[
            <><B>Keep</B>: it counts toward the kept bonus, and toward its set.</>,
            <><B>Burn</B>: it becomes embers, more for rarer things.</>,
            <><B>Send it back down</B>: it becomes luck, which tilts what comes up toward the rare end.</>,
          ]} />
          <T head={['Rarity', 'chance now', 'embers if burned', 'luck if sent down']} rows={UT.RARITY_NAMES.map((n, r) => [
            n, pct(odds[r]), String(UT.emberYield(s, byR(r))), n2(UT.luckYield(s, byR(r))),
          ])} note={`Base odds 60 / 28 / 10 / 2. Luck tilts them: each rarity step is weighted by (1 + √luck / 10). Luck now ${n2(u.luck)}.`} />
          <H>Sets</H>
          <P>Three sets of four. A whole set is one of each member; the sets count is, for each set, how many complete copies you hold.</P>
          <T head={['Set', 'members']} rows={UT.SETS.map((name, k) => [name, UT.OBJECTS.filter(o => o.set === k).map(o => `${o.name} (${UT.RARITY_NAMES[o.rarity]})`).join(', ')])} />
          <H>Bin upgrades</H>
          <F>price = max(1e30, slow income × 300 s × 3 ^ level) ash</F>
          <SlowIncome />
          <UL items={[
            'Level 1 teaches the bin to sort by itself: give an object kind a rule and it goes straight into that bin as it arrives (and the sort button clears the tray by rule).',
            'Every level of Keep adds 25% to the kept bonus; every level of Burn and Send down adds 50% to embers and luck.',
          ]} />
          <Now>
            Delivered {u.delivered}. Kept {u.keptTotal}, burned {u.burned}, sent down {u.sentDown}. Whole sets {UT.totalSets(s)}.
            Bins: keep {u.bins.keep}, burn {u.bins.burn}, down {u.bins.down}. Next levels {UT.BINS.map(b => fmt(UT.binCost(s, b))).join(' / ')} ash.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-undertow-figure', group: 'The Undertow', title: 'The figure', unlocked: chOpen('undertow'),
    body: s => {
      const u = s.challenges.undertow;
      return (
        <>
          <V>Someone is standing in the water. They do not turn.</V>
          <P>
            A figure stands far down the pipe. It is first seen two minutes after the Undertow opens, and again ten minutes after each
            approach. When it is there you can walk toward it. Each walk is longer than the last; you cannot start another until it
            is over. There are {UT.APPROACHES} approaches in all, and each one leaves a perk.
          </P>
          <T head={['Approach', 'walk']} rows={Array.from({ length: UT.APPROACHES }, (_, n) => [String(n + 1), hours(UT.walkTime(n))])} />
          {u.approaches > 0 && (
            <>
              <H>Perks earned</H>
              <OL items={UT.PERKS.slice(0, u.approaches).map((p, k) => <>{p} <span className="g-sub">"{UT.LORE[k]}"</span></>)} />
            </>
          )}
          {u.approaches < UT.APPROACHES && <P>What the next approach leaves is only known once you have walked it.</P>}
          <Now>
            {u.approaches}/{UT.APPROACHES} approaches. {u.walk > 0 ? `Walking: ${fmtTime(u.walk)} left.` : UT.figureHere(s) ? 'The figure is there now.' : `Seen again in ${fmtTime(UT.sightWait(s) - u.sight)}.`}
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-undertow-pipe', group: 'The Undertow', title: 'Leaks and the gauge', unlocked: chOpen('undertow'),
    body: s => {
      const u = s.challenges.undertow;
      const d = UT.depth(s);
      return (
        <>
          <H>Leaks</H>
          <P>
            The pipe is drawn as {UT.PIPE_CELLS} cells. Leaks hiss somewhere along it; you cannot see them, only hear them. The hiss at
            a cell is loudest on the leak and fades over about seven cells either side. Click the exact cell to patch it.
          </P>
          <UL items={[
            `Two leaks are open when the Undertow opens. A new one opens every ${hours(UT.LEAK_PERIOD * (u.approaches >= 5 ? 2 : 1))}, never more than ${UT.LEAK_CAP} at once.`,
            'Each open leak takes 5% off the whole Undertow bonus, after the taper. Every patch ever made counts toward the patch bonus.',
          ]} />
          <H>The bore gauge</H>
          <P>
            Three runs of pipe in series, each with a bore. The three bores share {UT.BORE_BUDGET} units of metal, at least 1 each.
            Each run costs its length divided by its bore; the gauge compares your setting with the best possible one.
          </P>
          <F>efficiency = best resistance / your resistance, resistance = Σ length ÷ bore</F>
          <P>
            The lengths (1 to 12) are fixed by the <B>depth</B>, which is Conduits bought ÷ {UT.DEPTH_STEP}, rounded down. Every
            {' '}{UT.DEPTH_STEP} Conduits bought the depth moves and the lengths change. The gauge <i>keeps</i> the best bonus it ever
            reached, so a shift never takes anything away; it only offers more if you retune.
          </P>
          <P>The best mix gives each run a bore in proportion to the square root of its length.</P>
          <Now>
            Depth {d} (next shift at {UT.nextShift(s)} Conduits). Lengths {UT.lengths(d).join(', ')}. Your bores {u.bore.join(', ')};
            best {UT.bestBore(d).bore.join(', ')}. Efficiency {pct(UT.efficiency(s))}. Open leaks {u.leaks.length}, patched {u.patched}.
          </Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Archive

const archiveSections: GuideSection[] = [
  {
    id: 'ch-archive', group: 'The Archive', title: 'The Archive', unlocked: chOpen('archive'),
    body: s => {
      const a = s.challenges.archive;
      return (
        <>
          {chIntro('archive', s)}
          <P>
            The Archive works on the modulator. A good lock can be recorded onto a blank reel and shelved, where it keeps paying a
            share while the slot is freed for something new. The plate also glitches, leaving wrong frames for an album, and the
            signatures drift a little each station day.
          </P>
          <H>What it pays</H>
          <UL items={[
            `Each modulator target: x(its tapes) × ${AR.CHANNEL_MULT} if its channel has been found.`,
            'Pattern Buffers: the album bonus, 1 + 0.5 × √sets.',
          ]} />
          <Now>Tapes {a.shelf.length}/{AR.shelfSize(s)}. Blank reels {a.blanks}/{AR.BLANK_CAP}. Album sets {AR.albumSets(s)} (Pattern Buffers {x(AR.albumMult(s), 3)}). Channels {a.channels.length}/{PT.PATTERN_TARGETS.length}.</Now>
          <H>Time away</H>
          <P>The archive's clock, its blank reels, its frames, its drift and any fresh-lock countdown all run while you are away.</P>
        </>
      );
    },
  },
  {
    id: 'ch-archive-tapes', group: 'The Archive', title: 'Tapes and the shelf', unlocked: chOpen('archive'),
    body: s => {
      const a = s.challenges.archive;
      return (
        <>
          <P>
            A modulator slot matching at least {pct(AR.RECORD_MIN)} can be recorded, if there is a blank reel and room on the shelf.
            The tape keeps the target and the match quality; a match of {pct(AR.GOLD_AT)} or better is a <B>gold</B> tape and weighs
            x{AR.GOLD_MULT}. Recording lets go of the slot's target and spins its dials back to rest, so the same lock has to be
            found again. Erasing a tape is free.
          </P>
          <H>Blank reels</H>
          <P>
            Every recording uses a blank reel. You start with {AR.BLANK_START}; another comes every {hours(AR.BLANK_EVERY)}, and no
            more than {AR.BLANK_CAP} wait at once. The record button says what is missing when it cannot record.
          </P>
          <F>tape weight = quality⁴ (× {AR.GOLD_MULT} for gold)</F>
          <F>target bonus = 1 + share × max × modulator strength × Σ (weight of k-th best tape ÷ k){a.freshLeft > 0 ? ` × ${AR.FRESH_MULT} (fresh)` : ''}</F>
          <P>The best tape of a target pays in full, the second half, the third a third, and so on.</P>
          <F>share = 0.35 × √(1 + 0.5 × tape stock)</F>
          <T head={['Buy', 'price', 'does']} rows={[
            ['Shelf space', `max(1e15, slow income × 300 s × 2.2 ^ spaces); now ${AR.shelfFull(s) ? 'full' : fmt(AR.shelfCost(s))}`, `one more tape (starts at ${AR.SHELF_BASE}, at most ${AR.SHELF_MAX})`],
            ['Tape stock', `max(1e15, slow income × 600 s × 1.8 ^ stock); now ${fmt(AR.stockCost(s))}`, 'raises the share every tape keeps paying'],
          ]} />
          <SlowIncome />
          <Now>
            Share now {pct(AR.tapeShare(s))}. Next reel {a.blanks >= AR.BLANK_CAP ? 'waits: the reels are full' : `in ${fmtTime((1 - a.blankProg) * AR.BLANK_EVERY)}`}.
            {' '}{PT.PATTERN_TARGETS.filter(t => a.shelf.some(tp => tp.target === t.id)).map(t => `${t.name} ${x(AR.tapeMult(s, t.id), 3)}`).join(' · ') || 'No tapes yet.'}
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-archive-drift', group: 'The Archive', title: 'Drift, fresh locks and channels', unlocked: chOpen('archive'),
    body: s => {
      const a = s.challenges.archive;
      return (
        <>
          <H>Drift</H>
          <P>
            Every station day ({hours(AR.STATION_DAY)} of the archive's clock) each target's signature seems to wander: freq up to 2 either
            way, phase up to 2 around the circle, harm up to 1. It is never quite where the real one is. The real signature, which the
            modulator pays on, does not move.
          </P>
          <H>Fresh locks</H>
          <P>
            Set a live slot exactly onto today's drifted signature and the shelf runs fresh: every tape pays x{AR.FRESH_MULT} for
            {' '}{hours(AR.FRESH_TIME)}. This can happen once per station day.
          </P>
          <H>Channels</H>
          <P>
            Each target has a hidden channel. It is found the first time you record a gold tape of it, or a live slot locks it exactly.
            A found channel multiplies that target x{AR.CHANNEL_MULT} for good.
          </P>
          <Now>
            Station day {AR.stationDay(s)}, next drift in {fmtTime(AR.dayLeft(s))}. {a.freshLeft > 0 ? `Fresh for ${fmtTime(a.freshLeft)}.` : 'Not fresh.'}
            {' '}Channels: {a.channels.join(', ') || 'none yet'}.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-archive-album', group: 'The Archive', title: 'Wrong frames and the album', unlocked: chOpen('archive'),
    body: s => (
      <>
        <P>
          The plate glitches on its own and develops a wrong frame: one of {AR.SITTERS} sitters, wrong in one of {AR.WRONGS} ways.
          One frame every {AR.FRAME_EVERY / 60} minutes at {PT.SLOT_AT[0]} Pattern Buffers; faster with more (the rate scales with modulator strength).
        </P>
        <P>A full set is one sitter in all {AR.WRONGS} wrongnesses. The album counts, for each sitter, how many complete sets of them you hold, added up.</P>
        <F>Pattern Buffers × (1 + 0.5 × √sets)</F>
        <P>A square root: x1.5 for the first set, and it keeps climbing slowly after.</P>
        <Now>Frames developed {s.challenges.archive.frames}, one every {hours(1 / AR.frameRate(s))}. Sets {AR.albumSets(s)}.</Now>
      </>
    ),
  },
];

// ---------------------------------------------------------------- the Drowned Stair

const stairSections: GuideSection[] = [
  {
    id: 'ch-stair', group: 'The Drowned Stair', title: 'The Drowned Stair', unlocked: chOpen('stair'),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          {chIntro('stair', s)}
          <P>A bucket draws water by depth, someone walks the stair down the well wall, the well grants wishes, and the water shows the station in another timeline.</P>
          <H>The tide</H>
          <P>
            The water rises and falls on a {hours(ST.TIDE)} tide, starting high; low tide comes {hours(ST.TIDE / 2)} in. Everything drawn
            is multiplied by 0.7 at the lowest to 1.3 at the highest. While the level is under a quarter it is <B>low tide</B>, and
            rooms reached on the stair then are below the waterline.
          </P>
          <F>level = 0.5 + 0.5 × cos(2π × t / {ST.TIDE / 3600} h) · draw × (0.7 + 0.6 × level)</F>
          <H>Perks taper</H>
          <P>Some perks here count linearly up to 16, then by a square root: <span className="g-code">16 × √(n / 16)</span> past that. This is written "tap(n)" below. The rest, and every wish, pay by a plain square root.</P>
          <H>What it pays</H>
          <T head={['Target', 'from', 'now']} rows={[
            ['Rampant Wells', 'jars of teeth, ember and water wishes, the lantern tank, reflections', x(ST.stairMult(st, 'zone3'), 3)],
            ['All ash', 'wet keys, ash wishes, reflections', x(ST.stairMult(st, 'ash'), 3)],
            ['Comfort', '1 + 0.03 × √candles lit', x(ST.stairMult(st, 'comfort'), 3)],
          ]} />
          <H>Time away</H>
          <P>The bucket draws (the tide is averaged exactly), the walker keeps walking until {ST.QUEUE_MAX} rooms are waiting, lanterns breed, and reflections change while you are gone.</P>
          <Now>Tide {pct(ST.tide(s))}{ST.lowTide(s) ? ' (low)' : ''}, turns in {fmtTime(ST.tideTurn(s))}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-stair-bucket', group: 'The Drowned Stair', title: 'The bucket', unlocked: chOpen('stair'),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          <P>Rope is bought in metres. Each kind of water is drawn once the rope reaches its depth, faster with every metre past it.</P>
          <F>water / s = rate × (1 + 0.2 × (rope − depth)) × water bonus × tide</F>
          <T head={['Water', 'depth', 'rate', 'wish points per unit']} rows={ST.WATERS.map((w, k) => ST.bandOpen(s, k)
            ? [`${w.name}`, `${w.at} m`, `${w.rate} / s`, String(w.pts)] : null).filter((r): r is string[] => !!r)} />
          <H>Rope</H>
          <P>
            A metre costs ash and warm water. The ash stays a minute or so of income; the warm water climbs with the depth, so how deep
            the bucket goes is paced by time spent in the well. The first metre needs no water.
          </P>
          <F>ash = max(1e9, passive ash / s × 60 × 1.04 ^ metres) · warm water = round(1.6 × metres^1.6)</F>
          <P>Turning the winch by hand draws three seconds' worth at once, as often as you like.</P>
          <F>water bonus = (1 + 0.1 × tap(hymnals)) × (1 + 0.6 × ln(1 + water wishes ÷ 5))</F>
          <P>Water wishes feed the bucket only by a logarithm, so water buying wishes buying water settles instead of running away.</P>
          <Now>
            Rope {st.rope} m (next {fmt(ST.ropeCost(s))} ash + {ST.ropeWater(st.rope)} warm water). Water bonus {x(ST.waterMult(s), 3)}.
            Held: {ST.WATERS.map((w, k) => ST.bandOpen(s, k) ? `${w.name} ${n2(st.water[k])}` : null).filter(Boolean).join(', ') || 'nothing yet'}.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-stair-stair', group: 'The Drowned Stair', title: 'The stair', unlocked: chOpen('stair'),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          <P>
            Once there is a metre of rope, someone can be sent down the stair. They walk on their own, one landing at a time; each
            landing holds a small room and a thing. Up to {ST.QUEUE_MAX} rooms wait for your answer; with {ST.QUEUE_MAX} waiting the walker stops.
          </P>
          <F>seconds to the next landing = 150 × (1 + landing / 5)^1.5 ÷ (1 + 0.1 × tap(walked on))</F>
          <T head={['Walk to landing', '1', '5', '10', '12', '20']} rows={[['at normal pace', ...[0, 4, 9, 11, 19].map(n => hours(ST.landingTime(n)))]]} />
          <P>Each room asks for one answer. A room reached at low tide counts double, whatever you answer.</P>
          <UL items={[
            <><B>Take</B> the thing: one of its perk (below).</>,
            <><B>Leave it</B> and walk on: the walker gets 10% quicker per tap.</>,
            <><B>Light a candle</B>, paying warm water (round(4 × (1 + landing / 4)^1.6)): you take the thing twice over in the light, and comfort grows with the candles lit.</>,
          ]} />
          <T head={['Thing', 'perk at one']} rows={(Object.keys(ST.ITEMS) as ST.Item[]).map(k => [ST.ITEMS[k].name, ST.ITEMS[k].text(1)])}
            note="Wet keys and jars of teeth pay by the square root of how many you hold; the rest by tap(). What each landing holds is fixed by its number, so it is the same however you got there." />
          <Now>
            {st.sent ? `Landing ${st.landing}, ${st.queue.length} room${st.queue.length === 1 ? '' : 's'} waiting${st.queue[0] ? `; a candle here costs ${ST.candleCost(st.queue[0].n)} warm water` : ''}.` : 'Nobody on the stair yet.'} Candles lit {st.candles}.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-stair-wishes', group: 'The Drowned Stair', title: 'Wishes', unlocked: chOpen('stair'),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          <P>Drop things into the well. Every drop is worth points, and each kind of drop fills its own track: when a track passes its next mark, the well grants a wish of that kind. Points past the mark carry over.</P>
          <T head={['Drop', 'cost', 'points']} rows={[
            ['Ash', `max(1e9, passive ash / s × 300); now ${fmt(ST.ashDropCost(s))}`, String(ST.DROP_PTS)],
            ['Embers', `${ST.EMBER_DROP} embers`, String(ST.DROP_PTS)],
            ['Water', 'all you hold of one kind', 'per unit, by kind (see the bucket)'],
          ]} note="Points are multiplied by the weight of warm coins: 1 + 0.08 × tap(coins)." />
          <F>ash and embers: wish n (counting from 0) needs 10 × (n + 1) points · water: round(60 × (n + 1)^1.5)</F>
          <P>
            n is the wishes of that kind already granted. Ash marks: {Array.from({ length: 5 }, (_, k) => ST.wishNeed(k, 'ash')).join(', ')}, …
            Water marks: {Array.from({ length: 5 }, (_, k) => ST.wishNeed(k, 'water')).join(', ')}, …
          </P>
          <T head={['Boon', 'pays']} rows={[
            ['Ash', 'all ash × (1 + 0.1 × √ash wishes)'],
            ['Embers', 'Rampant Wells × (1 + 0.15 × √ember wishes)'],
            ['Water', 'Rampant Wells × (1 + 0.08 × √water wishes), and the water bonus on the bucket'],
          ]} />
          <Now>
            Wishes {st.wishes}. Ash {st.boons.ash} ({pct(ST.wishProgress(s, 'ash'))} to the next), embers {st.boons.embers} ({pct(ST.wishProgress(s, 'embers'))}),
            water {st.boons.water} ({pct(ST.wishProgress(s, 'water'))}).
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-stair-lanterns', group: 'The Drowned Stair', title: 'The lantern tank', unlocked: s => chUnlocked(s, 'stair') && ST.bandOpen(s, 1),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          <P>
            Lanterns swim in the black water. Net one for black water: round(8 × (1 + netted / 2)^1.4). Each has a glow (1 or 2), one of
            {' '}{ST.HUES.length} colours, and a pace (1 to 3). The tank holds {ST.TANK_MAX}; once it is full nothing more is netted or born.
          </P>
          <P>With two or more in the tank they breed by themselves, slowly:</P>
          <F>births / s = 0.00004 × √(lanterns − 1) × (average pace ÷ 2) × (1 + 0.12 × tap(small shoes))</F>
          <P>A child takes the brighter parent's glow, sometimes one brighter (more likely when the glow is low), rarely one dimmer; its pace is the parents' average, nudged; about one in eight is a new colour.</P>
          <F>Rampant Wells × (1 + 0.6 × (total glow)^0.3 × (1 + 0.05 × colours in the tank))</F>
          <P>Quick at first, slow by the time the tank is full.</P>
          <Now>Lanterns {st.tank.length}/{ST.TANK_MAX}, glow {st.glow}, colours {st.hues}. Tank {x(ST.tankMult(st), 3)}. Next net {ST.netCost(s)} black water. {ST.breedRate(s) > 0 ? `A birth every ${hours(1 / ST.breedRate(s))}.` : 'No births.'}</Now>
        </>
      );
    },
  },
  {
    id: 'ch-stair-reflect', group: 'The Drowned Stair', title: 'Reflections', unlocked: chOpen('stair'),
    body: s => {
      const st = s.challenges.stair;
      return (
        <>
          <P>
            The water shows two pictures of the station: this one and another. They differ in {ST.DIFFS} places. Click a difference on
            either picture to spot it. A new reflection forms every {hours(ST.REFLECT)}; differences not spotted by then are lost.
          </P>
          <P>Each spot is worth 1 + 0.1 × tap(photographs). The spots add up for good:</P>
          <F>sight = √spots · Rampant Wells × (1 + 0.04 × sight) · all ash × (1 + 0.03 × sight)</F>
          {ST.bandOpen(s, 3) && <P>Stilling the water with singing water forms a new reflection at once: round(15 × 1.25 ^ stills) singing water.</P>}
          <Now>Spotted {st.found.length}/{ST.DIFFS} here, {n2(st.spots)} ever (sight {n2(ST.sightPow(st))}). Next reflection in {fmtTime(ST.reflLeft(st))}.</Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Seal

const sealSections: GuideSection[] = [
  {
    id: 'ch-seal', group: 'The Seal', title: 'The Seal', unlocked: chOpen('seal'),
    body: s => {
      const c = s.challenges.seal;
      return (
        <>
          {chIntro('seal', s)}
          <P>A safe dial on the hatch, opened tier by tier with void ash; wax seals drawn for every tier opened; a three-chamber airlock that makes void ash and rime; and a frost garden on the walls.</P>
          <H>What it pays</H>
          <T head={['Target', 'formula', 'now']} rows={[
            ['All ash', `(1 + 0.5 × tiers^0.85) × ninth-digit seals`, x(SE.seal.mult(s, 'ash'), 3)],
            ['Vacuum Locks', '(1 + 0.3 × tiers^0.8) × fifth-digit seals', x(SE.seal.mult(s, 'zone4'), 3)],
            ['Any other zone', 'seals of its digit', 'see seals'],
          ]} />
          <Now>Tiers opened <B>{c.tier}</B>. Seals pressed {c.seals.length}. Void ash {n2(c.voidAsh)}, rime {n2(c.rime)}, frost {n2(c.frost)}.</Now>
          <H>Time away</H>
          <P>The airlock, the garden and a patient hand on the wheel all keep working while you are away (the garden processes at most 40 generations per catch-up step).</P>
        </>
      );
    },
  },
  {
    id: 'ch-seal-dial', group: 'The Seal', title: 'The dial', unlocked: chOpen('seal'),
    body: s => {
      const c = s.challenges.seal;
      return (
        <>
          <P>
            The wheel is a safe dial of {SE.DIAL} marks. Each tier of the lock has a combination; deeper tiers are longer
            ({Array.from({ length: 6 }, (_, t) => SE.comboLength(t)).join(', ')}, … numbers). Combinations are different in every save.
          </P>
          <UL items={[
            'Find each number by feel: the meter twitches harder the nearer the dial is to it, and not at all beyond its reach. On the number itself it kicks.',
            'Turn the dial, then press Let it rest. It catches if it rests exactly on the number, turned the right way: the first number turning right (↻), the second left (↺), and so on, alternating.',
            'A number is never within 3 marks of the one before it.',
          ]} />
          <F>twitch = 0.8 × (1 − distance ÷ reach)² + 0.2 on the number · reach = 5 + 8 × (1 − 0.8 ^ stethoscope) + 0.2 × stethoscope</F>
          <H>A rest costs a little</H>
          <P>
            A rest that catches costs nothing. A rest that misses costs void ash, and you need that much in hand to rest at all, so
            reading the meter is nearly free and guessing every mark is slow. The stethoscope softens it.
          </P>
          <F>a miss = max(1, round(3% × this tier's void ash × 0.85 ^ stethoscope))</F>
          <P>The stethoscope costs void ash: round(60 × 2.5 ^ level). Now reach is {n2(SE.earReach(s))} marks; next level {SE.earCost(c)} void ash.</P>
          <H>A patient hand</H>
          <P>
            Bought with void ash (round(300 × 3 ^ level)), a hand on the wheel finds the next number by itself, slowly: one every
            {' '}{hours(SE.handTime(1))} at level 1, half again as fast each level after. It never turns the wheel for you, and it
            rests once the combination is whole.
          </P>
          <H>Turning the wheel</H>
          <P>With the whole combination found, turn the wheel by paying void ash. The tier opens, pays a burst of ash and its permanent bonus, and asks for a seal.</P>
          <F>void ash = round({SE.tierCost(0)} × 3.6 ^ tier) · burst = max(1e6, passive ash / s × 600 × (tier + 1))</F>
          <T head={['Tier', '1', '2', '3', '4', '5', '6']} rows={[
            ['void ash', ...[0, 1, 2, 3, 4, 5].map(t => fmt(SE.tierCost(t)))],
            ['burst (min. of income)', ...[0, 1, 2, 3, 4, 5].map(t => `${SE.burstSeconds(t) / 60}`)],
          ]} />
          <Now>
            Combination for tier {c.tier + 1}: {c.found.length}/{SE.comboLength(c.tier)} found. A miss costs {SE.restCost(s)} void ash.
            {c.hand ? ` Hand level ${c.hand}, a number every ${hours(SE.handTime(c.hand))}.` : ''} Next hand {SE.handCost(c)} void ash. Burst now {fmt(SE.burstFor(s))} ash.
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-seal-seals', group: 'The Seal', title: 'Wax seals', unlocked: s => chUnlocked(s, 'seal') && (s.challenges.seal.tier > 0 || s.challenges.seal.seals.length > 0),
    body: s => {
      const c = s.challenges.seal;
      const targets = Array.from(new Set(c.seals.map(x2 => SE.sealTarget(SE.digitOf(x2.bits)))));
      return (
        <>
          <P>Every tier opened owes a seal. Draw it on a {SE.SEAL_N} × {SE.SEAL_N} grid and press it.</P>
          <UL items={[
            <><B>Digit</B>: the number of lit pixels reduced to one digit, 1 to 9 (10 lit is a 1, 18 lit a 9). Digit d strengthens zone d; digit 9, the Plex's number, reaches all ash instead and is 1.6 times as strong.</>,
            <><B>Symmetry</B>: for each of {SE.SYMS.map(y => y.name.toLowerCase()).join(', ')}, the share of lit pixels whose image is lit too. Their average is the seal's score.</>,
          ]} />
          <F>seal power = (0.2 + 0.8 × score²) × (1.6 for digit 9)</F>
          <F>a target's bonus = 1 + {n2(SE.powerMult('zone0', 1) - 1)} × (summed power of its seals)^0.8 ({n2(SE.powerMult('ash', 1) - 1)} for all ash)</F>
          <P>A fifth-digit seal also speeds the airlock. A pressed seal can be melted and pressed again with a new design for {SE.REPRESS_COST} rime.</P>
          <Now>
            {SE.sealsPending(s)} seal{SE.sealsPending(s) === 1 ? '' : 's'} owed. {targets.map(t => `${t === 'ash' ? 'all ash' : zoneName(Number(t.slice(4)))} ${x(SE.sealMult(c, t), 3)}`).join(' · ') || 'No seals yet.'}
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-seal-airlock', group: 'The Seal', title: 'The airlock', unlocked: chOpen('seal'),
    body: s => {
      const c = s.challenges.seal;
      return (
        <>
          <P>Three chambers cycle by themselves. Choose what they work on:</P>
          <T head={['Stance', 'void ash / s', 'frost taken / s']} rows={SE.STANCES.map(t => [t.name, t.id === 'frost' ? '0' : t.id === 'ash' ? '0.5 × speed' : '0.25 × speed', t.id === 'ash' ? '0' : t.id === 'frost' ? '1 × speed' : '0.5 × speed'])}
            note={`Frost taken comes out as rime, ${SE.RIME_PER_FROST} per frost. Frost comes from the garden.`} />
          <F>speed = (1 + 0.35 × pumps) × fifth-digit seals</F>
          <P>Pumps cost rime: round(30 × 2 ^ pumps).</P>
          <Now>Stance {c.stance}. Speed {n2(SE.airlockSpeed(c))}: {n2(SE.voidRate(c))} void ash / s, {n2(SE.frostIntake(c))} frost / s. Next pump {SE.pumpCost(c)} rime.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-seal-garden', group: 'The Seal', title: 'The frost garden', unlocked: chOpen('seal'),
    body: s => {
      const c = s.challenges.seal;
      return (
        <>
          <P>A wall of {SE.GW} × {SE.GH} cells by a crystal automaton. Plant seeds (you have {SE.seedMax(c)}); frost grows from them by one rule:</P>
          <F>every {n2(SE.genTime(c))} s, a bare cell frosts over when exactly one of its four neighbours is lit</F>
          <P>Lit cells never melt on their own. Clicking a cell plants a seed, takes one back, or prunes frost. <B>Thaw</B> melts every frost cell and keeps the seeds, so the wall grows again from them.</P>
          <F>crystals / s = lit cells × (1 + 2 × symmetry³) × 0.004</F>
          <P>Symmetry is the average, over mirror, flip and half-turn, of the share of lit cells whose image is lit. A perfectly symmetric wall pays x3.</P>
          <P>Harvest once at least {SE.HARVEST_MIN} crystals have grown: they become frost, plus rime worth 0.1 × symmetry per crystal.</P>
          <T head={['Upgrade (rime)', 'price', 'does']} rows={[
            ['Another seed', `round(40 × 2.2 ^ n); now ${SE.seedUpCost(c)}`, 'one more seed to plant'],
            ['Colder', `round(50 × 2.4 ^ n); now ${SE.coldCost(c)}`, 'generations come 30% sooner per level'],
          ]} />
          <Now>Lit {SE.gardenLit(c.garden)}, symmetry {pct(SE.gardenSymmetry(c.garden))}, {n2(SE.crystalRate(c))} crystals / s. Waiting {n2(c.crystals)}. Harvests {c.harvests}.</Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Barker Ring

const BARKERS: Record<number, string> = { 2: '+ +', 3: '+ + −', 4: '+ + − +', 5: '+ + + − +', 7: '+ + + − − + −', 11: '+ + + − − − + − − + −', 13: '+ + + + + − − + + − + − +' };

const ringSections: GuideSection[] = [
  {
    id: 'ch-ring', group: 'The Barker Ring', title: 'The Barker Ring', unlocked: chOpen('ring'),
    body: s => {
      const r = s.challenges.ring;
      const rd = RG.reading(s);
      return (
        <>
          {chIntro('ring', s)}
          <P>
            The spiral grows rings, each set + or −. Read from the inside, they spell a code. Set them to a <B>Barker code</B> and the
            spiral runs cleaner.
          </P>
          <H>Rings</H>
          <P>
            {RG.BASE_RINGS} to start, one more for every {RG.FREE_PER} Barker Spirals bought after the Ring opened (at most 4 this way),
            and more bought with pigment, up to {RG.MAX_RINGS}. The span is how many rings, from the inside, are read.
          </P>
          <F>a ring = round(max(4000, raw pigment / s × 750) × 2 ^ rings bought)</F>
          <P>Prices here follow your pigment rate. <i>Raw</i> pigment is what the spiral makes without the Ring's own share, so the prices never chase the Ring's payout.</P>
          <H>Barker codes</H>
          <P>
            For a code of length n, the sidelobe at shift k is the sum of each sign times the one k places further on. A Barker code is
            one where every sidelobe is −1, 0 or +1. They exist only at lengths {RG.BARKER_LENGTHS.join(', ')}.
          </P>
          <T head={['Length', 'a Barker code', 'power']} rows={RG.BARKER_LENGTHS.map(n => [String(n), BARKERS[n] ?? '', String(RG.POWER[n])])}
            note="Reversed or with every sign flipped, a Barker code is still one." />
          <F>quality = 1 for a Barker code · 0.3 ÷ (peak sidelobe − 1) otherwise · 0 when the peak is n − 1</F>
          <P>A reading's power is its length's power times its quality. Holding a Barker code makes it hum louder, slowly, forever:</P>
          <F>hold = 1 + 0.2 × log2(1 + held ÷ 3600) · held grows by (length ÷ 7) a second while a Barker code is set</F>
          <H>What it pays</H>
          <F>code power = power × hold · pigment × (1 + code power) · all ash × (1 + {RG.ASH_SHARE} × code power) · Barker Spirals × (1 + 0.4 × code power)</F>
          <Now>
            Rings {RG.rings(s)} ({RG.freeRings(s)} free from {RG.newSpirals(s)} new Spirals), reading {RG.spanOf(s)}: {rd.code.map(v => (v > 0 ? '+' : '−')).join(' ')}. Peak sidelobe {rd.psl}{rd.barker ? ' (Barker)' : ''}.
            Code power {n2(RG.codePower(s))}, hold {x(RG.holdMult(s), 3)}. Longest locked {r.best}. Next ring {RG.rings(s) >= RG.MAX_RINGS ? 'none: the spiral is full' : `${fmt(RG.ringCost(s))} pigment`}.
          </Now>
          <H>Time away</H>
          <P>Holding time and catalyst silt both build while you are away.</P>
        </>
      );
    },
  },
  {
    id: 'ch-ring-catalysts', group: 'The Barker Ring', title: 'Catalysts', unlocked: chOpen('ring'),
    body: s => {
      const r = s.challenges.ring;
      return (
        <>
          <P>Deep winds shed silt. Each time the silt reaches the next drop's size, a <B>catalyst</B> falls: a rare colour that is never used up.</P>
          <F>silt / s = 0.0003 × √(1 + tincture levels brewed) × (1 + 0.25 × reading power) · drop n needs 5 + 3 × n silt</F>
          <P>Pouring pigment into the deep wind adds 1 silt at once, for round(max(2000, raw pigment / s × 240) × 1.2 ^ pours) pigment. The first eight drops are all different; after that they fall where they fall.</P>
          <P>A catalyst sits in a socket. It multiplies its target, more strongly the more tincture is already aimed there. The first one found goes straight into the empty socket.</P>
          <F>catalyst = 1 + strength × (1 + 0.2 × ln(tinctures on that target)) · strength = base × (1 + refines)^0.6</F>
          <T head={['Catalyst', 'target', 'base', 'held']} rows={RG.CATALYSTS.map((c, k) => [c.name, c.target, String(c.base), r.cats[k] ? String(r.cats[k]) : '—'])} />
          <P>Refining melts one spare copy into the catalyst, with pigment: round(max(20000, raw pigment / s × 600) × 2.2 ^ refines).</P>
          <Now>Silt {n2(r.dust)}/{RG.dropCost(r.found)}, +{n2(RG.dustRate(s) * 3600)} an hour. Drops {r.found}, kinds {RG.kindsFound(s)}. Pour {fmt(RG.pourCost(s))} pigment.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-ring-socket2', group: 'The Barker Ring', title: 'The second socket', unlocked: s => chUnlocked(s, 'ring') && (s.challenges.ring.found >= RG.SOCK2_FOUND || s.challenges.ring.sock2),
    body: s => (
      <>
        <P>
          After {RG.SOCK2_FOUND} drops, a second socket can be opened for max({fmt(RG.SOCK2_COST)}, raw pigment / s × 1800) pigment.
          Two catalysts then work at once; moving one into the other socket moves it, never copies it.
        </P>
        <Now>{s.challenges.ring.sock2 ? 'Open.' : `Not opened yet: ${fmt(RG.sock2Cost(s))} pigment.`}</Now>
      </>
    ),
  },
];

// ---------------------------------------------------------------- the Operator

const OP_TEXT: Record<OP.Op, string> = {
  NOP: 'does nothing',
  BUY: 'buys one shaft in zone N, if you can afford it',
  MAX: 'presses Max all in zone N',
  FEED: 'feeds every creature whose hunger is under 60',
  SING: 'sings to every creature that can be sung to',
  CATCH: 'catches the warm flake, if one is up',
  TUNE: 'tunes the dial to frequency N, if found',
  WAIT: 'waits N beats',
  JUMP: 'jumps to line N of this card',
  CALL: 'runs another card, then comes back',
  IF: 'skips the next line unless the condition holds',
};

const operatorSections: GuideSection[] = [
  {
    id: 'ch-operator', group: 'The Operator', title: 'The Operator', unlocked: chOpen('operator'),
    body: s => {
      const o = s.challenges.operator;
      return (
        <>
          {chIntro('operator', s)}
          <P>
            A tiny assembly language punched onto cards. The reader runs the cards a line per beat, burning the Compiler's cycles, and
            does the station's chores for you. Three cards come already punched: WATCHMAN, DIGGER and SPIRAL.
          </P>
          <H>What it pays</H>
          <F>base = 1 + 0.5 × log10(1 + lines run ÷ 200) · depth = 1 + 0.3 × √stack depth · signal = 1 + 0.2 × bank signal</F>
          <T head={['Target', 'formula', 'now']} rows={[
            ['Compilers', 'base × depth × signal', x(OP.operator.mult(s, 'zone6'), 3)],
            ['Cycles', '√(base × depth)', x(OP.operator.mult(s, 'cycles'), 3)],
            ['All ash', '√(depth × signal)', x(OP.operator.mult(s, 'ash'), 3)],
          ]} note="Stack depth and bank signal are summed over the cards in the reader and the wired banks." />
          <Now>{o.running ? 'Running' : 'Stopped'}. Lines run {fmt(o.lines)} of {fmt(OP.GOAL_LINES)}. Burning {n2(o.burn)} cycles / s. Depth {o.depth}, signal {n2(o.sig)}.</Now>
          <H>Time away</H>
          <P>The reader keeps running and burning cycles while you are away. Lines count in full, but only a few beats are actually acted on per catch-up step, so chores done offline are sparse.</P>
        </>
      );
    },
  },
  {
    id: 'ch-operator-cards', group: 'The Operator', title: 'Cards and the reader', unlocked: chOpen('operator'),
    body: s => {
      const o = s.challenges.operator;
      return (
        <>
          <P>
            A card holds up to {OP.MAX_LINES} lines; the cabinet holds up to {OP.MAX_CARDS} cards. Punching a new card costs
            round(200 × 2 ^ (cards − 3)) cycles. The reader has slots, one card in each, all running side by side.
          </P>
          <F>reader slots = min({OP.MAX_SLOTS}, 2 + floor(√(max(0, Compilers bought − 10) ÷ 6)))</F>
          <T head={['Line', 'does']} rows={OP.OPS.map(k => [k, OP_TEXT[k]])} />
          <P>A card runs top to bottom and starts over. Every line does one thing only, so nothing can loop forever within a beat.</P>
          <H>Conditions</H>
          <P>An IF line holds one or two conditions, either negated, joined by AND or OR.</P>
          <T head={['Condition', 'true when']} rows={[
            ['SIREN', 'the siren is sounding'], ['FLAKE', 'a warm flake is up'],
            ['ASH>10s / 1m / 10m', 'you hold 10 seconds / a minute / 10 minutes of passive ash'],
            ['CYC>100 / 1k / 10k', 'you hold more than that many cycles'],
            ['BANK1 … BANK8', 'that memory bank reads above 0.5'],
          ]} />
          <H>The burn</H>
          <F>cycles / s = Σ over slots of {OP.LINE_COST} × (1 + card depth) × beats / s, × (1 + {OP.MOTH_TAX} × moths)</F>
          <P>If the cycles run short, the whole reader runs proportionally slower.</P>
          <H>The clock</H>
          <P>
            Beats / s = 1.2 ^ clock. A faster clock costs round(300 × 2.4 ^ clock) cycles, and waits on the machine's own work: the
            reader must have run {fmt(OP.CLOCK_LINES)} × 2 ^ clock lines first, so a hoard of cycles cannot skip ahead.
          </P>
          <Now>
            Slots {OP.readerSlots(s)} ({OP.activeSlots(s).length} loaded). Cards {o.cards.length}. Clock {o.clock}: {n2(OP.beatRate(o))} beats / s.
            Next card {OP.punchCost(o)} cycles; next clock {OP.clockCost(o)} cycles, after {fmt(OP.clockNeed(o))} lines run ({fmt(Math.min(o.lines, OP.clockNeed(o)))} so far).
          </Now>
        </>
      );
    },
  },
  {
    id: 'ch-operator-stack', group: 'The Operator', title: 'Stack, banks and moths', unlocked: chOpen('operator'),
    body: s => {
      const o = s.challenges.operator;
      const sc = OP.stackCost(o), bc = OP.bankCost(o);
      return (
        <>
          <H>The stack</H>
          <P>CALL nests one card inside another. A card's depth is how deep its CALLs go, up to the stack limit; a card that calls itself goes all the way down. Deeper cards pay more (by a square root) and burn more.</P>
          <P>Raising the stack limit costs round(500 × 4 ^ (limit − 1)) cycles and as many parts as the current limit.</P>
          <H>Memory banks</H>
          <P>A bank reads another system into a signal from 0 to 1. Banks add to the signal pay and can be tested with BANKn. A new bank costs round(400 × 3 ^ (banks − 1)) cycles and as many parts as banks you have, up to {OP.MAX_BANKS}.</P>
          <T head={['Source', 'reads']} rows={[
            ['Siren', '1 while it sounds'], ['Resonance', 'the resonance bar, 0 to 1'], ['Warm flake', '1 while one is up'],
            ['Comfort', 'comfort ÷ (comfort + 150)'], ['Pigment', 'p ÷ (p + 4), p = log10(1 + pigment)'],
            ['Cycles', 'p ÷ (p + 4), p = log10(1 + cycles)'], ['Zone N bought', 'bought ÷ (bought + 40)'],
          ]} />
          <H>Moths</H>
          <P>Moths nest in idle lines (WAIT and NOP) on loaded cards, about one per idle line every {OP.MOTH_RATE ** -1 / 60} minutes, never more than {OP.MOTH_CAP}. Each eats {pct(OP.MOTH_TAX)} more burn. Swat one and it leaves a part; the stack and the banks need parts.</P>
          <Now>Stack limit {o.stack} (next {fmt(sc.cycles)} cycles + {sc.parts} parts). Banks {o.banks.length} (next {fmt(bc.cycles)} + {bc.parts} parts). Parts {o.parts}. Moths {o.moths.length}, swatted {o.swatted}.</Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Scriptorium

const scriptoriumSections: GuideSection[] = [
  {
    id: 'ch-scriptorium', group: 'The Scriptorium', title: 'The Scriptorium', unlocked: chOpen('scriptorium'),
    body: s => {
      const c = s.challenges.scriptorium;
      return (
        <>
          {chIntro('scriptorium', s)}
          <P>The walls of the gallery talk in the voices of the people who dug them, written in a script that is different in every save. Transcribe it, collect the voices and seat them as foremen, hush the murmur to bank silence, and answer what the walls ask.</P>
          <H>What it pays</H>
          <T head={['Target', 'formula', 'now']} rows={[
            ['All ash', `(1 + 0.5 × ln(1 + glyphs ÷ 6)) × (1 + √(loudness ÷ ${SC.LOUD_CAP})) × (1 + ${SC.GREEDY_K} × √greedy)`, x(SC.scriptorium.mult(s, 'ash'), 3)],
            ['Comfort and rust', '1 + 0.1 × √patient', x(SC.scriptorium.mult(s, 'comfort'), 3)],
            ['Echoes', '1 + 0.1 × √curious', x(SC.scriptorium.mult(s, 'echoes'), 3)],
            ['Listen', '1 + 0.15 × √curious', x(SC.scriptorium.mult(s, 'listen'), 3)],
            ['Any zone', 'its foreman', 'see voices'],
          ]} note="Glyphs here counts every glyph confirmed in finished strata plus every correct guess in the current one, confirmed or not. The first dozen matter; the thousandth barely does." />
          <Now>Stratum {c.stratum + 1}. Glyphs solved {SC.glyphsSolved(s)}. Sentences {c.sentences}. Foremen {SC.foremen(s)}.</Now>
          <H>Time away</H>
          <P>Words, hints, voices and questions keep arriving while you are away, loudness grows, and hints past the bank write themselves in, slowly, so the cipher never quite stalls.</P>
        </>
      );
    },
  },
  {
    id: 'ch-scriptorium-cipher', group: 'The Scriptorium', title: 'The cipher', unlocked: chOpen('scriptorium'),
    body: s => {
      const c = s.challenges.scriptorium;
      return (
        <>
          <P>
            Each stratum is one hand: {SC.PER_STRATUM} sentences in a substitution cipher, 26 glyphs for 26 letters. Words are heard one
            at a time, about one every {n2(SC.WORD_SECS / 60)} minutes (sooner with Ear to the stone and a patient profile); a stratum starts
            with 3 heard.
          </P>
          <UL items={[
            'Write a letter under any glyph you have heard. Each letter can sit under one glyph only; writing it elsewhere moves it.',
            'When every glyph of a heard word is right, the word resolves and its glyphs are confirmed, locked in for good.',
            `A sentence is solved when all its words are heard and confirmed. All ${SC.PER_STRATUM} solved, and the hand changes: a new key, new glyph shapes, 3 words heard.`,
          ]} />
          <H>Hints</H>
          <P>
            A hint comes every {SC.HINT_SECS / 60} minutes (sooner with the same speed-ups). Spending one makes the walls say the most
            common unconfirmed glyph heard so far. You can bank {SC.HINT_CAP}. Past the bank hints still come, {SC.SPILL_SLOW} times
            slower, and each one writes itself in: idle help, not a solver.
          </P>
          <F>speed of words, hints and voices = (1 + 0.4 × √Ear to the stone) × (1 + 0.05 × √patient)</F>
          <Now>Words heard {SC.wordsHeard(s)}/{SC.lay(s).words.length}. Confirmed {c.conf.length}, correct {c.correct}. Hints banked {n2(c.hints)}. Speed {x(SC.giveRate(s), 3)}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-scriptorium-silence', group: 'The Scriptorium', title: 'Loudness and silence', unlocked: chOpen('scriptorium'),
    body: s => {
      const c = s.challenges.scriptorium;
      return (
        <>
          <P>
            The murmur grows louder by itself toward its cap ({SC.LOUD_CAP}, +25% per Widen the gallery), closing 63% of the gap every
            {' '}{SC.LOUD_TAU / 60} minutes. Loudness multiplies all ash by 1 + √(loudness ÷ {SC.LOUD_CAP}), so widening the gallery tapers.
            {' '}<B>Hush</B> turns all the loudness into silence and starts it again from nothing: the choice is between ash now and silence to spend.
          </P>
          <P>Wax in the horn gathers silence by itself while it is loud: 0.0001 silence a second per level per point of loudness.</P>
          <T head={['Upgrade', 'does', 'price (silence)']} rows={SC.UPGRADES.map(u => [u.name, u.desc, `${u.base} × ${u.growth} ^ level; now ${SC.upCost(s, u.id)}`])} />
          <Now>Loudness {n2(c.loud)}/{n2(SC.loudCap(s))} (all ash {x(SC.loudMult(s), 3)}). Silence {n2(c.silence)}. Hushes {c.hushes}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-scriptorium-voices', group: 'The Scriptorium', title: 'Voices and the confessional', unlocked: chOpen('scriptorium'),
    body: s => {
      const c = s.challenges.scriptorium;
      return (
        <>
          <H>Voices</H>
          <P>A voice is heard about every {SC.VOICE_SECS / 60} minutes (same speed-ups), while there is room: {SC.ROSTER_BASE} chairs, one more per Another chair. Each has a zone it knows best and a quality: 0.8 to 1.2, times 1 + 0.1 × ln(1 + voices heard before it).</P>
          <P>Seat a voice as foreman of any zone:</P>
          <F>that zone × (1 + 0.04 × quality × (2 in its own zone) × strength) · strength = (1 + 0.15 × √Lamp oil) × (1 + 0.1 × ∛tally)</F>
          <P>Retire a voice into silence (25 × quality) or onto the tally, which strengthens every foreman for good.</P>
          <H>The confessional</H>
          <P>A question comes every {SC.QUESTION_SECS / 60} minutes, up to {SC.QUEUE_CAP} waiting. Each answer leans you one point toward patient, greedy or curious.</P>
          <T head={['Trait', 'strengthens']} rows={SC.TRAITS.map(t => [t, SC.TRAIT_TEXT[t]])} />
          <Now>Voices {c.voices.length}/{SC.rosterCap(s)}, tally {c.tally}, foreman strength {n2(SC.foremanStrength(s))}. Profile: patient {c.prof.patient}, greedy {c.prof.greedy}, curious {c.prof.curious}.</Now>
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Syzygy

const syzygySections: GuideSection[] = [
  {
    id: 'ch-syzygy', group: 'The Syzygy', title: 'The Syzygy', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      return (
        <>
          {chIntro('syzygy', s)}
          <P>The Numogram drawn as ten nodes. Nodes 1 to 8 are the other eight challenges, node 9 is this one, node 0 is the gate. Below it the iron dreams: a pilgrim walks a map that reshapes every night. A black sun eclipses the plate on a long cycle.</P>
          <H>What it pays</H>
          <T head={['Target', 'formula', 'now']} rows={[
            ['All ash', `1 + ${n2(SY.ashPay(1) - 1)} × (Σ wired edge weights)^0.7`, x(SY.syzygy.mult(s, 'ash'), 3)],
            ['Each zone', '1 + 0.05 × √(summed weight of the wired edges touching its node)', 'by zone'],
            ['Every zone, in totality', SY.totality(z) ? 'black sun' : 'only while the sun is black', x(SY.syzygy.mult(s, 'zones'), 3)],
          ]} note="The powers and roots mean more wires keep paying, but never run away." />
          <H>Time away</H>
          <P>The pilgrim walks, nights turn over and the black sun keeps its cycle while you are away.</P>
        </>
      );
    },
  },
  {
    id: 'ch-syzygy-plate', group: 'The Syzygy', title: 'The plate', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      return (
        <>
          <F>node strength = log2(1 + level)</F>
          <UL items={[
            'Node k (1 to 8): the level of the challenge in zone k.',
            'Node 9: this challenge’s own progress, rooms walked ÷ 10 + pages × 3 + finds.',
            `Node 0: dark until the gate opens${z.gateOpen ? '; now log2(1 + 30 + pages × 3)' : ''}.`,
          ]} />
          <P>Touch two nodes to lay a wire along the edge between them; touch them again to take it back. A wire pulls by the weaker of its two ends; a second wire on the same edge braids it.</P>
          <P>Nodes 7 and 1 are joined twice: by a Surge current and by the Gt-28 gate. Touching them lays the wire on the current; touching them again moves it onto the gate; a third touch takes it back.</P>
          <F>edge weight = weaker node × √wires on it × kind weight</F>
          <T head={['Edge', 'kind', 'nodes', 'weight now']} rows={SY.EDGES.map(e => [e.name, e.kind, `${e.a} – ${e.b}`, n2(SY.edgeWeight(z, e))])}
            note="Kind weights: syzygy 1.25, current 1, gate 0.85." />
          <P>You start with two wires, the second for nothing. Each one more costs dreams: 120 for the first, then x2.4 each. Cutting a wire is free, so rerouting costs nothing.</P>
          <Now>Wires {SY.wiresLaid(z)}/{SY.wiresTotal(z)} laid. Live currents {SY.liveCurrents(z)}. Next wire {SY.wireCost(z)} dreams. Dreams held {fmt(z.dreams)}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-syzygy-dream', group: 'The Syzygy', title: 'The dream and the pilgrim', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      return (
        <>
          <P>
            Each station night ({hours(SY.NIGHT)}) a new map of {SY.COLS} × {SY.ROWS} rooms forms, and the pilgrim walks it from the door,
            nearest rooms first, bringing back dreams.
          </P>
          <F>rooms / s = 1/60 × (1 + 0.5 × lanterns)</F>
          <T head={['Room', 'dreams', 'also']} rows={[
            ['Hall', '10', ''], ['Chamber', '30', ''], ['Relic', '15', 'a find, kept for good'], ['Page', '50', 'a page in the dream log (one per night)'],
          ]} note="Every map has one page room." />
          <P>Once every room is known the pilgrim wanders, bringing back 6.4 dreams for each room's length walked.</P>
          <F>dreams × (1 + 0.2 × √finds) × (2 in totality)</F>
          <P>Lanterns cost ash, priced in seconds of income on a power curve, so the tenth is hours of income, not days:</P>
          <F>lantern = max(1e9, passive ash / s × 120 × (1 + lanterns)^1.8)</F>
          <Now>Night {z.night + 1}: {Math.min(SY.ROOMS, Math.floor(z.explored))}/{SY.ROOMS} rooms. Rooms ever {z.rooms}, finds {z.finds}, dreams ever {fmt(z.dreamsEver)}. Next lantern {fmt(SY.lanternCost(s))} ash ({hours(SY.lanternSecs(z.lanterns))} of income).</Now>
        </>
      );
    },
  },
  {
    id: 'ch-syzygy-sun', group: 'The Syzygy', title: 'The black sun', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      return (
        <>
          <P>A long dark ({hours(SY.DARK)} at first), then totality ({hours(SY.TOTALITY)} at first). The first totality came an hour after the Syzygy opened.</P>
          <F>totality: every zone × (1.2 + 0.04 × √(shades + lenses)), and dreams × 2</F>
          <T head={['Buy', 'price', 'does']} rows={[
            ['Shade', `round(300 × 1.9 ^ shades) dreams; now ${SY.shadeCost(z)}`, 'totality lasts 30% longer per shade'],
            ['Lens', `max(1e10, passive ash / s × 600 × (1 + lenses)^1.6); now ${fmt(SY.lensCost(s))}`, 'the dark between is shorter: ÷ (1 + 0.2 × lenses)'],
          ]} />
          <Now>{SY.totality(z) ? `Totality: ${fmtTime(SY.totalityLeft(z))} left, zones ${x(SY.totalityMult(z), 3)}.` : `Dark: totality in ${fmtTime(SY.untilTotality(z))}.`} Totality lasts {hours(SY.totalityLen(z))}, dark {hours(SY.darkLen(z))}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-syzygy-log', group: 'The Syzygy', title: 'The dream log', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      const ch = SY.chapters(z);
      return (
        <>
          <P>Every page room writes a page, at most one a night. Every {SY.PAGES_PER_CHAPTER} pages close a chapter, and a closed chapter gives a perk for good.</P>
          {ch > 0 && <OL items={SY.CHAPTERS.slice(0, ch).map(c => <><B>{c.title}</B>: {c.perk}</>)} />}
          {ch < SY.CHAPTERS.length ? <P>A chapter's gift is only written when its last page is.</P> : <P>Past the sixth, every chapter adds 10% to dreams.</P>}
          <Now>Pages {z.pages}, chapters {ch}.</Now>
        </>
      );
    },
  },
  {
    id: 'ch-syzygy-gate', group: 'The Syzygy', title: 'The gate', unlocked: chOpen('syzygy'),
    body: s => {
      const z = s.challenges.syzygy;
      const offs = SY.offerings(s);
      const cost = SY.gateCost(s);
      return (
        <>
          <P>Node 0 is the gate. To open it:</P>
          <UL items={[
            `every other challenge has reached its milestone and stands at level ${SY.GATE_LEVEL} or more,`,
            `at least ${SY.GATE_CURRENTS} edges carry a live current,`,
            `and you pay ${fmt(SY.GATE_DREAMS)} dreams and a token of ash: max(1e15, passive ash / s × ${SY.GATE_ASH_SECS}), ${hours(SY.GATE_ASH_SECS)} of income (now ${fmt(cost.ash)}).`,
          ]} />
          <T head={['Offering', 'milestone', 'level']} rows={offs.map(o => [o.name, o.done ? 'reached' : 'not yet', `${n2(o.level)}${o.ok ? ' ✓' : ''}`])} />
          <Now>{z.gateOpen ? 'The gate is open.' : SY.gateReady(s) ? 'Everything is in place.' : 'Not ready.'}</Now>
          {z.gateOpen && <P>Opened, node 0 lights at log2(1 + 30 + pages × 3), so the wires through it carry weight, and the Black Citadel woke.</P>}
        </>
      );
    },
  },
];

// ---------------------------------------------------------------- the Black Citadel and the Dream Engine

const citadelSections: GuideSection[] = [
  {
    id: 'z8-citadel', group: 'The Black Citadel', title: 'Nul and the drain', unlocked: s => s.citadel.awake,
    body: s => {
      const c = s.citadel;
      const drain = CT.drainRate(s);
      return (
        <>
          <V>Something behind the gate has opened its eyes. It is thirsty.</V>
          <P>The Citadel woke when the gate opened. It grows <B>nul</B> out of nothing, and it drinks a slice of everything the station holds, a little more the longer it is awake.</P>
          <F>nul / s = 0.004 × (1 + √hours awake) × (1 + 0.6 × Eye in the keep) × dream nul factors</F>
          <F>appetite = 0.00001 × (1 + 1.2 × ln(1 + hours awake ÷ 12)) × (1 + {CT.FLOOR_BITE} × unanswered floors), of each held resource, per second</F>
          <P>
            It drinks held ash, embers, echoes, rust, pigment and cycles, all at the same rate. The drink is exact for any length of time
            (what is kept is e^(−rate × seconds)), so time away is drunk the same as time watched. Income is never touched; only what you hold.
          </P>
          <H>What holds it back</H>
          <F>mortar = 0.5 × level ÷ (level + 4) · ward = {CT.WARD_CAP} × (1 − (1 − mortar) × (1 − {CT.RITE_WARD}) ^ rites × Π over burning dreams (1 − its ward))</F>
          <P>
            Bitter mortar tapers toward a half, each rite answered holds back {pct(CT.RITE_WARD)} more for good, and the dreams stack on
            top. However much is stacked, the wards never hold back more than {pct(CT.WARD_CAP)}: it always gets a tenth of its appetite.
          </P>
          <F>raw = appetite × (1 − ward) · drain = raw × C ÷ (raw + C), C = 1 ÷ (4 hours)</F>
          <P>
            The drain has a ceiling: however hungry it gets, it stays under one part in {fmt(1 / CT.DRAIN_CEIL)} a second, so what you
            hold always settles at no less than four hours of income. At the bare appetite and no ward, held amounts halve in
            about {hours(Math.LN2 / CT.ease(1e-5))}. Spending keeps things out of reach.
          </P>
          <H>The Citadel's works</H>
          <T head={['Work', 'does', 'price (nul)']} rows={CT.CITADEL_UPS.map(u => [u.name, u.desc, `${u.base} × ${u.growth} ^ level${u.id === 'snow' ? ', once only' : ''}; now ${fmt(CT.citadelUpCost(s, u))}`])}
            note="Each level adds a fixed amount, not a multiple: with prices growing by a power, the gains taper like everything else this late." />
          <Now>
            Awake {hours(c.time)}. Nul <B>{n2(c.nul)}</B>, +{n2(CT.nulRate(s))} / s ({fmt(c.nulTotal)} ever). Appetite {pct(CT.appetite(s))} / s;
            held back {pct(CT.ward(s))}; drain {pct(drain)} / s{drain > 0 ? `, half-life ${hours(Math.LN2 / drain)}` : ''}.
          </Now>
        </>
      );
    },
  },
  {
    id: 'z8-floors', group: 'The Black Citadel', title: 'Floors and rites', unlocked: s => s.citadel.awake,
    body: s => {
      const done = s.citadel.rites ?? 0;
      const reached = CT.floorsReached(s);
      const due = CT.riteDue(s);
      return (
        <>
          <P>
            Now and then the Citadel climbs another floor, and drinks harder: every floor it has climbed that no rite has answered adds
            {' '}{pct(CT.FLOOR_BITE)} to its appetite. One rite answers each floor, in order, paid in nul and dreams. There are {CT.FLOORS.length} floors.
          </P>
          <T head={['Floor', 'climbed at', 'rite', 'nul', 'dreams']} rows={CT.FLOORS.slice(0, Math.min(CT.FLOORS.length, reached + 1)).map((h, k) => [
            String(k + 1), `${h} h awake${k < reached ? '' : ' (not yet)'}`, k < reached ? CT.RITES[k].name : '…',
            k < reached ? fmt(CT.RITES[k].nul) : '…', k < reached ? fmt(CT.RITES[k].dreams) : '…',
          ])} note="What a floor asks for is only known once it has been climbed." />
          {done > 0 && <OL items={CT.RITES.slice(0, done).map(r => <><B>{r.name}</B>: {r.text}</>)} />}
          {CT.citadelEnded(s) && <V>{CT.ENDING}</V>}
          <Now>
            Floors climbed {reached}/{CT.FLOORS.length}, rites answered {done}, unanswered {CT.unanswered(s)}.
            {due ? ` Waiting for: ${due.name} (${fmt(due.nul)} nul, ${fmt(due.dreams)} dreams).` : CT.citadelEnded(s) ? '' : ' Nothing is due.'}
          </Now>
        </>
      );
    },
  },
  {
    id: 'z8-dreams', group: 'The Black Citadel', title: 'The Dream Engine', unlocked: s => s.citadel.awake,
    body: s => {
      const d = s.dreams;
      return (
        <>
          <P>The Dream Engine slows the drinking by feeding the Citadel dreams. Each kind of dream also bends the station, for better and for worse.</P>
          <UL items={[
            'Dreams are the fuel: the same dreams the Syzygy’s pilgrim brings back.',
            `Beds: one to start, a second for ${CT.SLOT_NUL[1]} nul, a third for ${CT.SLOT_NUL[2]} nul. A dream must be learned (with nul) before it can be put to bed, and one dream can only be in one bed.`,
            'The engine woke with the Lucid dream already in the first bed, so a station that never opens it still has a ward.',
            'A dream in a bed burns while there is fuel. When the fuel runs out, every dream goes quiet: no ward, no effects, good or bad.',
            'Taking a dream out of its bed resets how long it has burned unbroken.',
          ]} />
          <F>dreams burned / s = Σ (burn per minute ÷ 60) × (1 + 0.3 × ln(1 + hours awake ÷ 24))</F>
          <P>A logarithm, so the pilgrim can always keep a bed or two lit.</P>
          <T head={['Dream', 'learn', 'holds back', 'burn / min', 'good', 'bad']} rows={CT.DREAM_ORDER.map(id => {
            const v = CT.DREAMS[id];
            return [v.name, v.cost ? `${v.cost} nul` : 'known', id === 'recurring' ? '10% rising to 60%' : pct(v.ward), String(v.burn), v.good, v.bad];
          })} note="The Recurring dream holds back 10% plus up to 50% more over six hours of burning unbroken. The Citadel's own dream also makes the Citadel's hours pass 1.5 times as fast." />
          <Now>
            Dreams held {fmt(CT.dreamsHeld(s))}, burning {n2(CT.burnRate(s) * 60)} / min. Beds {d.slotCount}: {d.slots.slice(0, d.slotCount).map(id => (id ? CT.DREAMS[id].name : 'empty')).join(', ')}. Burned {fmt(d.burned)} ever.
          </Now>
        </>
      );
    },
  },
  {
    id: 'z8-omens', group: 'The Black Citadel', title: 'Omens and ghostwax', unlocked: s => s.citadel.awake,
    body: s => (
      <>
        <H>Bad ashes</H>
        <P>While the Nightmare or the Citadel's own dream burns, bad ashes fall: they look almost exactly like warm flakes, a touch greyer, turning the wrong way, not pulsing. Touch one and it takes {pct(CT.BAD_TAKE.ash)} of your ash, {pct(CT.BAD_TAKE.embers)} of your embers and {pct(CT.BAD_TAKE.echoes)} of your echoes.</P>
        <H>Bright flakes</H>
        <P>While the Childhood dream burns, bright flakes fall (violet). Touch one for ten minutes of what the engine burns in dreams, never less than 3 + floor(√dreams burned ÷ 4), and 10 ghostwax. If both kinds are due, each fall is one or the other at even odds.</P>
        <P>One omen at a time; a new one every 50 to 120 seconds; each lasts 9 seconds and leaves if its dream stops. Omens that fall while you are away vanish untouched.</P>
        <H>Melting ghostwax</H>
        <P>Ghostwax melts down into dreams: {CT.WAX_PER_DREAM} ghostwax a dream. Ghostwax comes from rendering creatures down in the nursery (2 × stage² each) and from bright flakes; the same wax lights the familiars' candles.</P>
        <Now>Ghostwax {fmt(s.nursery.ghostwax)} ({fmt(Math.floor(s.nursery.ghostwax / CT.WAX_PER_DREAM))} dreams). A bright flake now brings {fmt(CT.brightGift(s))} dreams. Bad ashes touched {s.dreams.badClicked}, bright flakes caught {s.dreams.omensCaught}.</Now>
      </>
    ),
  },
];

// ---------------------------------------------------------------- per zone

const CH_SECTIONS: Record<ChallengeId, GuideSection[]> = {
  survey: surveySections, undertow: undertowSections, archive: archiveSections, stair: stairSections, seal: sealSections,
  ring: ringSections, operator: operatorSections, scriptorium: scriptoriumSections, syzygy: syzygySections,
};

const cache = new Map<number, GuideSection[]>();
/** Every section written for a zone, locked or not, in reading order. */
export function zoneGuide(zone: number): GuideSection[] {
  const hit = cache.get(zone);
  if (hit) return hit;
  const out: GuideSection[] = [shaftSection(zone), upgradesSection(zone), maxSection(zone)];
  if (zone === PT.BUFFER) out.push(...bufferSections);
  if (zone === AL.SPIRAL) out.push(...spiralSections);
  if (zone === WR.COMPILER) out.push(...exchangeSections);
  const ch = chByZone(zone);
  if (ch) out.push(...CH_SECTIONS[ch.id]);
  if (zone === 8) out.push(...citadelSections);
  out.push(linksSection(zone));
  cache.set(zone, out);
  return out;
}

/** The sections the player has reached. */
export const visibleGuide = (s: GameState, zone: number) => zoneGuide(zone).filter(x2 => x2.unlocked(s));
/** True while anything in this zone's guide is still unwritten for this player. */
export const guideHasLocked = (s: GameState, zone: number) => zoneGuide(zone).some(x2 => !x2.unlocked(s));
