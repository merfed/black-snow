import { it } from 'vitest';
import { RITES, UPGRADES } from './data';
import * as e from './engine';
import { newGame, type GameState } from './state';
import { FIXTURES, FREQS, KILN, NURSERY_UPS, SINKS } from './systems';
import * as al from './alchemy';
import * as pt from './patterns';
import * as w from './wiring';

// Balance tool, not a test: `npm run sim` prints when each play style reaches each milestone.
// Env knobs: VITE_BOT (one bot), VITE_HOURS, VITE_CLOSED=1 (afk time goes through catchUp, like a
// closed tab), VITE_BOARD=none|trunk|greedy (how the bot uses the Compiler's board), VITE_BREW=0
// (never brew), VITE_SEED (the random seed: wild eggs, rare flakes and sirens all roll for real).
const env = import.meta.env;
const HOURS = Number(env.VITE_HOURS ?? 150), ACT = 5; // active bots act every ACT seconds
const ONLY = env.VITE_BOT as string | undefined;
const CLOSED = env.VITE_CLOSED === '1';
const BOARD = (env.VITE_BOARD ?? 'trunk') as 'none' | 'trunk' | 'greedy';
const BREW = env.VITE_BREW !== '0';
const SEED = Number(env.VITE_SEED ?? 7);
const AWAY_DT = 5; // seconds per tick while an open tab sits unattended

const run = env.MODE === 'sim' ? it : it.skip;

/** A small seeded generator, so runs repeat but every random roll still happens. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// afk plays for its first hour, then checks in every half hour for a minute: the pacing target.
const BOTS = [
  { label: 'clicker', cps: 6, doctrine: 'ear', active: Infinity, every: 0 },
  { label: 'idler', cps: 1, doctrine: 'spade', active: Infinity, every: 0 },
  { label: 'watcher', cps: 3, doctrine: 'eye', active: Infinity, every: 0 },
  { label: 'afk', cps: 2, doctrine: 'spade', active: 1, every: 1800 },
] as const;

/**
 * A sensible board: a trunk from the core along row 8 to a column beside the ports, relays where
 * the column meets each port. 'trunk' puts four amplifiers at the head of the trunk; 'greedy'
 * keeps adding amplifiers along it while cycles last. Tiers and the bus are bought as soon as
 * they can be, then everything is upgraded.
 */
function tendBoard(s: GameState, greedy: boolean) {
  if (!w.wiringOpen(s)) return;
  w.learnTier(s);
  w.extendBus(s);
  const t = s.wiring.tier;
  const amps = greedy ? 16 : 4;
  const lay = (x: number, y: number, kind: w.PartKind) => { if (!s.wiring.cells[w.key(x, y)]) w.place(s, x, y, kind, 1); };
  for (let x = 2; x <= 21; x++) lay(x, 8, x < 2 + amps ? 'amp' : x === 21 ? 'relay' : 'wire');
  const bottom = s.wiring.bus ? 15 : 11;
  for (let y = 1; y <= bottom; y++) lay(22, y, y % 2 === 1 ? 'relay' : 'wire');
  w.upgradeAll(s);
  if (t < 4) w.learnTier(s);
}

for (const { label, cps: activeCps, doctrine, active, every } of BOTS) {
  (ONLY && ONLY !== label ? it.skip : run)(`pacing ${label}`, () => {
    const rng = mulberry(SEED);
    const s = newGame(rng);
    const marks: string[] = [];
    const seen = new Set<string>();
    const mark = (k: string) => { if (!seen.has(k)) { seen.add(k); marks.push(`${k}@${(s.playTime / 3600).toFixed(2)}h`); } };
    let wall = 0; // wall-clock seconds, which is what the targets are in
    const spend = (passes: number) => {
      for (let pass = 0; pass < passes; pass++) {
        const before = s.ash.toString();
        for (const r of RITES) if (e.buyRite(s, r.id)) mark(r.id);
        for (const u of UPGRADES) {
          if (u.fork === 'doctrine' && u.id !== doctrine) continue;
          if (u.fork === 'feed' && u.id !== 'name_feed') continue;
          if (e.buyUpgrade(s, u.id)) mark(u.id);
        }
        for (const f of FIXTURES) if (e.fixtureCost(s, f.id).lt(s.ash.mul(0.2)) && e.buildFixture(s, f.id)) mark(`${f.id}${s.fixtures[f.id]}`);
        for (let i = 0; i < 9; i++) for (let k = 0; k < 4; k++) if (e.zoneUpCost(s, i, k).lt(s.ash.mul(0.5)) && e.buyZoneUp(s, i, k)) mark(`z${i + 1}up${k}`);
        for (const k of KILN) if (e.buyKiln(s, k.id)) mark(k.id);
        for (const f of FREQS) if (!s.freqs[f.id] && e.tune(s, f.id)) mark(f.id);
        for (const k of SINKS) while (e.buySink(s, k.id)) mark(`${k.id}${e.sinkLevel(s, k.id)}`);
        if (s.freqs.hum) s.tuned = 'hum';
        for (const g of s.nursery.eggs) e.warmEgg(s, g.id);
        for (const c of s.nursery.brood) { if (c.hunger < 50) e.feedCreature(s, c.id); e.singTo(s, c.id); }
        const adults = s.nursery.brood.filter(e.canBreed);
        if (adults.length >= 2 && e.breedPair(s, adults[0].id, adults[1].id, rng)) mark(`bred${s.nursery.seen.length}`);
        for (const u of NURSERY_UPS) if (e.nurseryUpCost(s, u.id).lt(s.ash.mul(0.1)) && e.buyNurseryUp(s, u.id)) mark(`${u.id}`);
        // cheapest shaft first
        const cheapest = () => { let best = -1; for (let i = 0; i < 9; i++) if (e.zoneVisible(s, i) && (best < 0 || e.zoneCost(s, i).lt(e.zoneCost(s, best)))) best = i; return best; };
        for (let n = 0, b = cheapest(); n < 50 && b >= 0 && e.buyShaft(s, b); n++, b = cheapest()) mark(`zone${b + 1}`);
        // A player who has solved the buffer and knows the recipes: an upper bound on speed.
        pt.SLOT_AT.forEach((_, k) => { if (k < pt.patternSlots(s) && !s.patterns.slots[k]?.target) { const t = (['ash', 'pigment', 'cycles'] as const)[k]; pt.setSlot(s, k, { target: t, ...pt.signature(s, t) }); mark(`pattern${k}`); } });
        if (al.alchemyOpen(s)) {
          mark('alchemy');
          al.researchQuick(s); al.researchColor(s); if (s.alchemy.colors.length >= 16) al.researchSlot(s);
          const r = al.RECIPES.find(r => !s.alchemy.found[r.id] && r.mix.length <= al.maxSlots(s) && r.mix.every(id => al.hasIngredient(s, id)));
          if (r && al.wind(s, r.mix)) mark(`wind-${r.id}`);
          const cheap = al.RECIPES.filter(r => s.alchemy.found[r.id]).sort((a, b) => al.brewCost(s, a) - al.brewCost(s, b))[0];
          if (BREW && cheap) al.brew(s, cheap.id);
        }
        if (BOARD !== 'none' && w.wiringOpen(s)) { mark('exchange'); tendBoard(s, BOARD === 'greedy'); }
        if (s.ash.toString() === before) break;
      }
    };
    const watch = (secs: number, cps: number) => {
      let clickAcc = 0;
      for (let k = 0; k < secs; k++) {
        clickAcc += cps;
        while (clickAcc >= 1) { e.listen(s); clickAcc--; }
        if (s.warmFlake.active && s.warmFlake.ttl < 8) { if ((s.warmFlake.rarity ?? 0) > 0) mark(`rare${s.warmFlake.rarity}`); e.catchWarmFlake(s, rng); }
        if (Math.round(wall) % ACT === 0) spend(1);
        e.tick(s, 1, rng);
        wall++;
      }
    };
    let sirens = 0;
    while (wall < HOURS * 3600 && s.zones[8].bought === 0) {
      if (wall < active * 3600) { watch(60, activeCps); continue; }
      // A check-in: spend everything, watch for a minute, spend again, then leave.
      spend(40);
      watch(60, 0);
      spend(40);
      const away = every - 60;
      const before = s.sirensSeen;
      if (CLOSED) e.catchUp(s, away, rng);
      else for (let k = 0; k < away; k += AWAY_DT) e.tick(s, AWAY_DT, rng);
      sirens += s.sirensSeen - before;
      wall += away;
      if (!s.ash.isFinite()) { mark('INFINITY'); break; }
    }
    const h = (k: string) => marks.find(m => m.startsWith(`${k}@`))?.split('@')[1] ?? '-';
    const zones = Array.from({ length: 9 }, (_, i) => h(`zone${i + 1}`));
    const ports = w.wiringOpen(s) ? Object.entries(w.flow(s).ports).map(([z, v]) => `${Number(z) + 1}:x${w.portMult(Number(z), v).toFixed(2)}`).join(' ') : '';
    console.log(`${label}${CLOSED ? ' closed' : ''} board=${BOARD} brew=${BREW} seed=${SEED} | zones ${zones.join(' ')} | wall ${(wall / 3600).toFixed(1)}h`
      + ` | modulator ${h('pattern0')} alchemy ${h('alchemy')} exchange ${h('exchange')} | rites leave ${h('leave')} stop ${h('stop')} dead ${h('dead')}`
      + ` | species ${s.nursery.seen.length} brood ${s.nursery.brood.length} flakes ${s.stats.flakes.join('/')} sirens ${s.sirensSeen}`
      + ` | rust ${s.rust.toExponential(1)} echoes ${s.echoes.toExponential(1)} sinks ${JSON.stringify(s.sinks)} tinct ${Object.values(s.alchemy.found).reduce((a, b) => a + b, 0)} ports ${ports}`);
  }, 3_600_000);
}
