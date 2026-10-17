import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BREED_EMBERS, breedCost, broodSlots, canBreed, eggSlots, eggWarmRate, feedCost, growthRate, isFed, moodTarget,
  nurseryMaxOpen, nurseryUpCost, nurseryUpLevel,
} from '../game/engine';
import { fmt, fmtTime } from '../game/format';
import {
  creatureRows, eggRows, GIFT_TEXT, giftOf, HUES, speciesName, SPECIES_COUNT, type Genome,
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

function CreatureCard({ c, picked, onPick }: { c: Creature; picked: boolean; onPick: () => void }) {
  const game = useGame(st => st.game);
  const { feed, sing, release } = useGame.getState();
  const [fx, setFx] = useState<'' | 'fed' | 'sung'>('');
  const born = useRef(c.stage === 1 && c.growth < 3);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const play = (k: 'fed' | 'sung') => { setFx(k); clearTimeout(timer.current); timer.current = window.setTimeout(() => setFx(''), 1600); };
  const need = EGG_GROWTH[c.stage - 1];
  const gift = giftOf(c.genome);
  const mood = !isFed(c) ? 'hungry' : c.mood > 70 ? 'happy' : c.mood < 30 ? 'sad' : '';
  const cost = feedCost(game);

  return (
    <div className={`creature-card ${picked ? 'picked' : ''}`}>
      <div className={`creature ${mood} ${born.current ? 'born' : ''} fx-${fx}`} style={genomeStyle(c.genome)}>
        <Sprite rows={creatureRows(c.genome)} px={2 + c.stage} />
        {fx === 'sung' && <span className="notes" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i></span>}
        {fx === 'fed' && <span className="crumbs" aria-hidden="true"><i /><i /><i /><i /></span>}
      </div>
      <div className="creature-info">
        <div className="creature-name" style={{ color: HUES[c.genome.hue].hex }}>{speciesName(c.genome)}</div>
        <div className="creature-sub">{EGG_STAGES[c.stage].name} · <b>{GIFT_TEXT[gift](c.stage)}</b>{!isFed(c) && ' (hungry)'}</div>
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
        <div className="row">
          <button onClick={() => { if (feed(c.id) !== undefined) play('fed'); }} disabled={c.hunger >= 100 || game.ash.lt(cost)}>
            Feed <span className="cost">{fmt(cost)} ash</span>
          </button>
          <button className="secondary" onClick={() => { sing(c.id); play('sung'); }} disabled={c.singIn > 0}>
            Sing{c.singIn > 0 && <span className="cost">{Math.ceil(c.singIn)}s</span>}
          </button>
          {c.stage >= BREED_STAGE && (
            <button className={`secondary ${picked ? 'on' : ''}`} onClick={onPick} disabled={!canBreed(c)}
              title={canBreed(c) ? 'Pick two to breed' : `Resting ${Math.ceil(c.breedIn)}s`}>
              {picked ? 'Picked' : canBreed(c) ? 'Pick' : `${Math.ceil(c.breedIn)}s`}
            </button>
          )}
          <button className="secondary tiny" onClick={() => { if (confirm(`Let the ${speciesName(c.genome)} go?`)) release(c.id); }}>Release</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wild eggs turn up in the ash. Warm them until they hatch, feed and sing to what comes out, and
 * breed grown ones for new species. Nothing here can die.
 */
export function NurseryPanel() {
  const game = useGame(st => st.game);
  const { breed, buyNurseryUp, tendAll } = useGame.getState();
  const [picked, setPicked] = useState<number[]>([]);
  const n = game.nursery;
  const pickedLive = picked.filter(id => n.brood.some(c => c.id === id && canBreed(c)));
  const pick = (id: number) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p.filter(x => pickedLive.includes(x)), id].slice(-2));
  const cost = breedCost(game);
  const canPay = game.ash.gte(cost) && game.embers >= BREED_EMBERS && n.eggs.length < eggSlots(game);
  const recent = n.brood.slice(-1)[0];

  return (
    <section className="panel nursery-panel framed reveal" data-panel="egg" style={{ '--hue': SYSTEM_COLORS.nursery } as CSSProperties}>
      <h2>Nursery <span className="h2-note">things found in the ash</span></h2>
      <div className="nursery-stats">
        <span><b>{n.eggs.length}</b>/{eggSlots(game)} eggs</span>
        <span><b>{n.brood.length}</b>/{broodSlots(game)} brood</span>
        <span><b>{n.seen.length}</b> of {SPECIES_COUNT.toLocaleString()} species</span>
      </div>
      <p className="dim">
        Wild eggs turn up when you catch warm flakes and after sirens. Comfort warms them slowly; embers warm them fast.
        Each creature has a gift that helps while it is fed. Two grown ones ({EGG_STAGES[BREED_STAGE].name} or older) can breed.
      </p>
      {nurseryMaxOpen(game) && (
        <button className="max-all" onClick={tendAll} title="Buy affordable nursery upgrades, feed the hungry, sing to everyone, warm eggs with spare embers">
          Tend to everything
        </button>
      )}

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

      {n.brood.length > 0 && <h3 className="sub-head">Brood</h3>}
      <div className="brood">{n.brood.map(c => <CreatureCard key={c.id} c={c} picked={pickedLive.includes(c.id)} onPick={() => pick(c.id)} />)}</div>

      <h3 className="sub-head">Nursery</h3>
      <div className="cards">
        {NURSERY_UPS.map(u => {
          const lvl = nurseryUpLevel(game, u.id);
          const maxed = lvl >= u.max;
          const c = nurseryUpCost(game, u.id);
          return (
            <Card key={u.id} title={u.name} desc={u.desc} level={lvl} cost={`${fmt(c)} ash`}
              state={maxed ? 'maxed' : 'available'} disabled={maxed || game.ash.lt(c)} onClick={() => buyNurseryUp(u.id)} />
          );
        })}
      </div>
      {recent && n.seen.length > 1 && <p className="dim bestiary">Latest species: {speciesName(recent.genome)}</p>}
    </section>
  );
}
