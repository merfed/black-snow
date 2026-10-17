import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  BREED_EMBERS, breedCost, broodSlots, canBreed, eggSlots, eggWarmRate, feedCost, feedMany, growthRate, isFed, moodTarget,
  nurseryMaxOpen, nurseryUpCost, nurseryUpLevel, singMany,
} from '../game/engine';
import {
  candleCost, FAMILIAR_GIFT, familiarPower, lightCandle, openSlot, QUIRK_TEXT, quirkOf, recallFamiliar, renderCreatures,
  setFamiliar, SLOT_COST, waxFor,
} from '../game/familiars';
import { fmt, fmtTime } from '../game/format';
import {
  creatureRows, eggRows, GIFT_TEXT, giftOf, GIFTS, HUES, speciesName, SPECIES_COUNT, type Genome, type Gift,
} from '../game/genome';
import type { Creature, EggItem } from '../game/state';
import { useGame } from '../game/store';
import { BREED_STAGE, EGG_GROWTH, EGG_STAGES, NURSERY_UPS } from '../game/systems';
import { Card } from './Card';
import { SYSTEM_COLORS } from './colors';
import { Bar } from './SidePanels';
import { Sprite } from './Sprite';

/** Paint a creature or egg in its genome's colours: body, markings, eyes. */
const genomeStyle = (g: Genome) => ({
  color: HUES[g.hue].hex, '--accent': HUES[g.accent].hex, '--warm': g.hue === 3 ? '#e0283a' : '#ffffff',
} as CSSProperties);

function EggCard({ egg }: { egg: EggItem }) {
  const game = useGame(st => st.game);
  const { warmEgg, discardEgg } = useGame.getState();
  const rate = eggWarmRate(game);
  const left = rate > 0 ? (100 - egg.warmth) / rate : Infinity;
  const full = game.nursery.brood.length >= broodSlots(game);
  const shake = egg.warmth >= 90 ? 'shake-hard' : egg.warmth >= 60 ? 'shake' : '';
  return (
    <div className="egg-card">
      <div className={`egg-shell ${shake}`} style={genomeStyle(egg.genome)}>
        <Sprite rows={eggRows(egg.genome)} px={5} />
        {egg.warmth >= 75 && <span className="egg-crack" aria-hidden="true" />}
      </div>
      <div className="egg-info">
        <div className="meter-label"><span>Warmth</span><span>{Math.floor(egg.warmth)}%</span></div>
        <Bar value={egg.warmth} tone="var(--warm-fixed)" />
        <small className="dim">
          {egg.warmth >= 100 && full ? 'Ready. No room in the brood.' : Number.isFinite(left) ? `Hatches in ${fmtTime(left)}` : 'Needs comfort or embers'}
        </small>
        <div className="row">
          <button onClick={() => warmEgg(egg.id)} disabled={game.embers < 1 || egg.warmth >= 100}>Warm <span className="cost">1 ember</span></button>
          <button className="secondary tiny" onClick={() => discardEgg(egg.id)} title="Leave it in the snow to make room">Leave</button>
        </div>
      </div>
    </div>
  );
}

type Sort = 'newest' | 'oldest' | 'stage' | 'species' | 'gift' | 'hungry';
type Show = 'all' | 'hungry' | 'breedable' | 'growing' | 'grown';

const SORTS: Record<Sort, (a: Creature, b: Creature) => number> = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  stage: (a, b) => b.stage - a.stage || b.growth - a.growth,
  species: (a, b) => speciesName(a.genome).localeCompare(speciesName(b.genome)),
  gift: (a, b) => giftOf(a.genome).localeCompare(giftOf(b.genome)) || b.stage - a.stage,
  hungry: (a, b) => a.hunger - b.hunger,
};
const SHOWS: Record<Show, (c: Creature) => boolean> = {
  all: () => true,
  hungry: c => !isFed(c) || c.hunger < 60,
  breedable: c => canBreed(c),
  growing: c => c.stage < 1 + EGG_GROWTH.length,
  grown: c => c.stage >= 1 + EGG_GROWTH.length,
};

/** Everything about one creature, for the hover card and the selected strip. */
function CreatureFacts({ c }: { c: Creature }) {
  const game = useGame(st => st.game);
  const need = EGG_GROWTH[c.stage - 1];
  return (
    <>
      <div className="creature-name" style={{ color: HUES[c.genome.hue].hex }}>{speciesName(c.genome)}</div>
      <div className="creature-sub">{EGG_STAGES[c.stage].name} · <b>{GIFT_TEXT[giftOf(c.genome)](c.stage)}</b>{!isFed(c) && ' (hungry)'}</div>
      <div className="creature-sub dim">As a familiar: {QUIRK_TEXT[quirkOf(c.genome)](c.stage)}</div>
      <div className="meter-label"><span>Fed</span><span>{Math.floor(c.hunger)}</span></div>
      <Bar value={c.hunger} tone="#b8ff3b" />
      <div className="meter-label"><span>Mood</span><span>{Math.floor(c.mood)} · settles at {Math.floor(moodTarget(game))}</span></div>
      <Bar value={c.mood} tone="#ff6bd0" />
      {need !== undefined ? (
        <>
          <div className="meter-label"><span>Growing</span><span>{fmtTime((need - c.growth) / growthRate(game, c))} left</span></div>
          <Bar value={c.growth} max={need} tone="var(--soft)" />
        </>
      ) : <small className="dim">Fully grown.</small>}
    </>
  );
}

/** One creature as a small icon. Dots under it show hunger and mood at a glance. */
function PetIcon({ c, selected, picked, onClick, onHover }: {
  c: Creature; selected: boolean; picked: boolean; onClick: () => void; onHover: (c: Creature | null, x?: number, y?: number) => void;
}) {
  const mood = !isFed(c) ? 'hungry' : c.mood > 70 ? 'happy' : c.mood < 30 ? 'sad' : '';
  return (
    <button className={`pet ${mood} ${selected ? 'selected' : ''} ${picked ? 'picked' : ''}`} onClick={onClick}
      onPointerEnter={e => onHover(c, e.clientX, e.clientY)} onPointerMove={e => onHover(c, e.clientX, e.clientY)} onPointerLeave={() => onHover(null)}
      aria-label={speciesName(c.genome)}>
      <span className="pet-sprite" style={genomeStyle(c.genome)}><Sprite rows={creatureRows(c.genome)} px={2 + Math.min(c.stage, 2) * 0.5} /></span>
      <span className="pet-dots"><i className={isFed(c) ? 'on' : 'off'} /><i className={c.mood > 50 ? 'on' : 'off'} /><i className={canBreed(c) ? 'on' : ''} /></span>
      <span className="pet-stage">{c.stage}</span>
    </button>
  );
}

/** The three slots by the stove. */
function Familiars({ selected, onSet }: { selected: Creature | null; onSet: (slot: number) => void }) {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const n = game.nursery;
  const room = broodSlots(game);
  return (
    <div className="familiars">
      {Array.from({ length: 3 }, (_, i) => {
        if (i >= n.slots) {
          const cost = SLOT_COST[i];
          const can = i === n.slots && game.ash.gte(cost.ash) && game.embers >= cost.embers;
          return (
            <div key={i} className="familiar locked">
              <span className="familiar-label">Slot {i + 1}</span>
              {i === n.slots ? (
                <button className="tiny" disabled={!can} onClick={() => run(s => openSlot(s))}>Open <span className="cost">{fmt(cost.ash)} ash + {cost.embers} embers</span></button>
              ) : <small className="dim">opens after slot {i}</small>}
            </div>
          );
        }
        const c = n.familiars[i];
        const p = familiarPower(game, i);
        const wax = candleCost(game, i);
        return (
          <div key={i} className={`familiar ${c ? '' : 'empty'}`}>
            <span className="familiar-label">Slot {i + 1}{n.candles[i] ? ` · ${n.candles[i]} candle${n.candles[i] > 1 ? 's' : ''}` : ''}</span>
            {c ? (
              <>
                <span className="pet-sprite" style={genomeStyle(c.genome)}><Sprite rows={creatureRows(c.genome)} px={3} /></span>
                <div className="familiar-name" style={{ color: HUES[c.genome.hue].hex }}>{speciesName(c.genome)}</div>
                <small><b>{GIFT_TEXT[giftOf(c.genome)](Math.round(FAMILIAR_GIFT * p))}</b></small>
                <small>{QUIRK_TEXT[quirkOf(c.genome)](p)}</small>
              </>
            ) : <small className="dim">Empty. Pick a creature below to set it here.</small>}
            <div className="row">
              {selected && <button className="tiny" onClick={() => onSet(i)}>Set {c ? 'instead' : 'here'}</button>}
              {c && <button className="tiny secondary" disabled={n.brood.length >= room} onClick={() => run(s => recallFamiliar(s, i, room))}>Recall</button>}
              {c && <button className="tiny secondary" disabled={n.ghostwax < wax} onClick={() => run(s => lightCandle(s, i))} title="Each candle makes this familiar 25% stronger">Candle <span className="cost">{wax} wax</span></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Wild eggs turn up in the ash. Warm them until they hatch, feed and sing to what comes out, and
 * breed grown ones for new species. Up to three can sit by the stove as familiars; any can be
 * rendered down into ghostwax. Nothing here can die.
 */
export function NurseryPanel() {
  const game = useGame(st => st.game);
  const run = useGame(st => st.run);
  const { breed, buyNurseryUp, tendAll } = useGame.getState();
  const [picked, setPicked] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [gift, setGift] = useState<Gift | 'all'>('all');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [tip, setTip] = useState<{ c: Creature; x: number; y: number } | null>(null);
  const n = game.nursery;
  const pickedLive = picked.filter(id => n.brood.some(c => c.id === id && canBreed(c)));
  const pick = (id: number) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p.filter(x => pickedLive.includes(x)), id].slice(-2));
  const cost = breedCost(game);
  const canPay = game.ash.gte(cost) && game.embers >= BREED_EMBERS && n.eggs.length < eggSlots(game);
  const room = broodSlots(game);
  const shown = useMemo(
    () => n.brood.filter(c => (gift === 'all' || giftOf(c.genome) === gift) && SHOWS[show](c)).sort(SORTS[sort]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.brood, n.brood.length, gift, show, sort, game],
  );
  const ids = shown.map(c => c.id);
  const selected = n.brood.find(c => c.id === sel) ?? null;
  const wax = shown.reduce((w, c) => w + waxFor(c), 0);
  const feedAllCost = feedCost(game).mul(shown.filter(c => c.hunger < 100).length);

  return (
    <section className="panel nursery-panel framed reveal" data-panel="egg" style={{ '--hue': SYSTEM_COLORS.nursery } as CSSProperties}>
      <h2>Nursery <span className="h2-note">things found in the ash</span></h2>
      <div className="nursery-stats">
        <span><b>{n.eggs.length}</b>/{eggSlots(game)} eggs</span>
        <span><b>{n.brood.length}</b>/{room} brood</span>
        <span><b>{n.seen.length}</b> of {SPECIES_COUNT.toLocaleString()} species</span>
        {(n.ghostwax > 0 || n.rendered > 0) && <span><b>{fmt(n.ghostwax)}</b> ghostwax</span>}
      </div>
      <p className="dim">
        Wild eggs turn up when you catch warm flakes and after sirens. Each creature has a gift that helps while it is fed.
        Two grown ones ({EGG_STAGES[BREED_STAGE].name} or older) can breed. Familiars by the stove need no feeding and do not count toward the brood.
      </p>
      {nurseryMaxOpen(game) && (
        <button className="max-all" onClick={tendAll} title="Buy affordable nursery upgrades, feed the hungry, sing to everyone, warm eggs with spare embers">
          Tend to everything
        </button>
      )}

      <h3 className="sub-head">By the stove</h3>
      <Familiars selected={selected} onSet={slot => { if (selected) run(s => setFamiliar(s, slot, selected.id, room)); setSel(null); }} />

      {pickedLive.length > 0 && (
        <div className="breed-bar">
          <span>{pickedLive.length === 2 ? 'Breed these two?' : 'Pick one more grown creature.'}</span>
          <button disabled={pickedLive.length < 2 || !canPay} onClick={() => { breed(pickedLive[0], pickedLive[1]); setPicked([]); }}>
            Breed <span className="cost">{fmt(cost)} ash + {BREED_EMBERS} embers</span>
          </button>
        </div>
      )}

      {n.eggs.length > 0 && <h3 className="sub-head">Eggs</h3>}
      <div className="egg-grid">{n.eggs.map(e => <EggCard key={e.id} egg={e} />)}</div>

      {n.brood.length > 0 && (
        <>
          <h3 className="sub-head">Brood</h3>
          <div className="brood-tools">
            <select value={gift} onChange={e => setGift(e.target.value as Gift | 'all')} aria-label="Filter by gift">
              <option value="all">Every gift</option>
              {GIFTS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={show} onChange={e => setShow(e.target.value as Show)} aria-label="Filter by state">
              <option value="all">All</option><option value="hungry">Hungry</option><option value="breedable">Ready to breed</option>
              <option value="growing">Still growing</option><option value="grown">Fully grown</option>
            </select>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="stage">Most grown</option>
              <option value="species">Species</option><option value="gift">Gift</option><option value="hungry">Hungriest</option>
            </select>
            <span className="dim">{shown.length} shown</span>
          </div>
          <div className="brood-tools">
            <button className="tiny" disabled={!shown.length || game.ash.lt(feedCost(game))} onClick={() => run(s => feedMany(s, ids))}>
              Feed shown <span className="cost">{fmt(feedAllCost)} ash</span>
            </button>
            <button className="tiny" disabled={!shown.some(c => c.singIn <= 0)} onClick={() => run(s => singMany(s, ids))}>Sing to shown</button>
            <button className="tiny danger" disabled={!shown.length}
              onClick={() => { if (confirm(`Render ${shown.length} creature${shown.length > 1 ? 's' : ''} into ${wax} ghostwax? They will not come back.`)) { run(s => renderCreatures(s, ids)); setSel(null); } }}>
              Render shown <span className="cost">+{wax} wax</span>
            </button>
          </div>
          <div className="pet-grid scroll-list" data-scroll>
            {shown.map(c => (
              <PetIcon key={c.id} c={c} selected={c.id === sel} picked={pickedLive.includes(c.id)}
                onClick={() => setSel(s => (s === c.id ? null : c.id))} onHover={(h, x, y) => setTip(h ? { c: h, x: x!, y: y! } : null)} />
            ))}
          </div>
          {selected && (
            <div className="pet-detail">
              <span className="pet-sprite" style={genomeStyle(selected.genome)}><Sprite rows={creatureRows(selected.genome)} px={2 + selected.stage} /></span>
              <div className="creature-info">
                <CreatureFacts c={selected} />
                <div className="row">
                  <button onClick={() => run(s => feedMany(s, [selected.id]))} disabled={selected.hunger >= 100 || game.ash.lt(feedCost(game))}>Feed <span className="cost">{fmt(feedCost(game))} ash</span></button>
                  <button className="secondary" onClick={() => run(s => singMany(s, [selected.id]))} disabled={selected.singIn > 0}>Sing{selected.singIn > 0 && <span className="cost">{Math.ceil(selected.singIn)}s</span>}</button>
                  {selected.stage >= BREED_STAGE && (
                    <button className={`secondary ${pickedLive.includes(selected.id) ? 'on' : ''}`} onClick={() => pick(selected.id)} disabled={!canBreed(selected)}>
                      {pickedLive.includes(selected.id) ? 'Picked' : canBreed(selected) ? 'Pick to breed' : `Resting ${Math.ceil(selected.breedIn)}s`}
                    </button>
                  )}
                  <button className="secondary tiny" onClick={() => { if (confirm(`Render the ${speciesName(selected.genome)} into ${waxFor(selected)} ghostwax?`)) { run(s => renderCreatures(s, [selected.id])); setSel(null); } }}>
                    Render <span className="cost">+{waxFor(selected)} wax</span>
                  </button>
                </div>
                <small className="dim">To make it a familiar, press Set on a slot by the stove.</small>
              </div>
            </div>
          )}
        </>
      )}

      <h3 className="sub-head">Nursery</h3>
      <div className="cards">
        {NURSERY_UPS.map(u => {
          const lvl = nurseryUpLevel(game, u.id);
          const maxed = lvl >= u.max || (u.id === 'wing' && room >= 255);
          const c = nurseryUpCost(game, u.id);
          return (
            <Card key={u.id} title={u.name} desc={u.desc} level={lvl} cost={`${fmt(c)} ash`}
              state={maxed ? 'maxed' : 'available'} disabled={maxed || game.ash.lt(c)} onClick={() => buyNurseryUp(u.id)} />
          );
        })}
      </div>
      {n.seen.length > 1 && <p className="dim bestiary">Species seen: {n.seen.length}. Latest: {n.brood.length ? speciesName(n.brood[n.brood.length - 1].genome) : '-'}</p>}
      {tip && createPortal(
        <div className="pet-tip" style={{ left: Math.min(tip.x + 16, window.innerWidth - 280), top: Math.min(tip.y + 16, window.innerHeight - 220), '--hue': SYSTEM_COLORS.nursery } as CSSProperties}>
          <CreatureFacts c={tip.c} />
        </div>, document.body)}
    </section>
  );
}
