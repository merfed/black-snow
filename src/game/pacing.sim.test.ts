import { it } from 'vitest';
import { UPGRADES } from './data';
import * as e from './engine';
import { newGame } from './state';
import { FIXTURES, FREQS, KILN, NURSERY_UPS } from './systems';
import * as al from './alchemy';
import * as pt from './patterns';

// Coarse steps so a 150 hour run stays quick. The bot acts once a step.
const DT = 1, HOURS = Number(import.meta.env.VITE_HOURS ?? 150), ACT = 5; // the bot acts every ACT steps
const ONLY = import.meta.env.VITE_BOT as string | undefined;

// Balance tool, not a test: `npm run sim` prints when each play style reaches each milestone.
const run = import.meta.env.MODE === 'sim' ? it : it.skip;

for (const [label, cps, doctrine] of [['clicker', 6, 'ear'], ['idler', 1, 'spade'], ['watcher', 3, 'eye']] as const) {
  (ONLY && ONLY !== label ? it.skip : run)(`pacing ${label}`, () => {
    const s = newGame(() => 0.5);
    const marks: string[] = [];
    const seen = new Set<string>();
    const mark = (k: string) => { if (!seen.has(k)) { seen.add(k); marks.push(`${k}@${(s.playTime / 3600).toFixed(2)}h`); } };
    let clickAcc = 0;
    for (let t = 0; t < HOURS * 3600; t += DT) {
      clickAcc += cps * DT;
      while (clickAcc >= 1) { e.listen(s); clickAcc--; }
      if (s.warmFlake.active && s.warmFlake.ttl < 8) e.catchWarmFlake(s, () => 0.5);
      if (Math.round(t / DT) % ACT !== 0) { e.tick(s, DT, () => 0.5); continue; }
      for (const u of UPGRADES) {
        if (u.fork === 'doctrine' && u.id !== doctrine) continue;
        if (u.fork === 'feed' && u.id !== 'name_feed') continue;
        if (e.buyUpgrade(s, u.id)) mark(u.id);
      }
      for (const f of FIXTURES) if (e.fixtureCost(s, f.id).lt(s.ash.mul(0.2)) && e.buildFixture(s, f.id)) mark(`${f.id}${s.fixtures[f.id]}`);
      for (let i = 0; i < 9; i++) for (let k = 0; k < 4; k++) if (e.zoneUpCost(s, i, k).lt(s.ash.mul(0.5)) && e.buyZoneUp(s, i, k)) mark(`z${i + 1}up${k}`);
      for (const k of KILN) if (e.buyKiln(s, k.id)) mark(k.id);
      for (const f of FREQS) if (!s.freqs[f.id] && e.tune(s, f.id)) mark(f.id);
      if (s.freqs.hum) s.tuned = 'hum';
      for (const g of s.nursery.eggs) e.warmEgg(s, g.id);
      for (const c of s.nursery.brood) { if (c.hunger < 50) e.feedCreature(s, c.id); e.singTo(s, c.id); mark(`brood${c.id}s${c.stage}`); }
      const adults = s.nursery.brood.filter(e.canBreed);
      if (adults.length >= 2 && e.breedPair(s, adults[0].id, adults[1].id, () => Math.random())) mark(`bred${s.nursery.seen.length}`);
      for (const u of NURSERY_UPS) if (e.nurseryUpCost(s, u.id).lt(s.ash.mul(0.1)) && e.buyNurseryUp(s, u.id)) mark(`${u.id}`);
      // cheapest shaft first
      let best = -1;
      for (let i = 0; i < 9; i++) if (e.zoneVisible(s, i) && (best < 0 || e.zoneCost(s, i).lt(e.zoneCost(s, best)))) best = i;
      for (let n = 0; n < 50 && best >= 0 && e.buyShaft(s, best); n++) { mark(`zone${best + 1}`); best = -1; for (let i = 0; i < 9; i++) if (e.zoneVisible(s, i) && (best < 0 || e.zoneCost(s, i).lt(e.zoneCost(s, best)))) best = i; }
      for (const n of [1e3, 1e5, 1e8, 1e12, 1e20, 1e30, 1e50, 1e100, 1e200]) if (s.ashThisRun.gte(n)) mark(`ash${n.toExponential(0)}`);
      if (Math.round(t) % (36000) === 0 && t % 1 === 0) mark(`h${t / 3600}:z${s.zones.filter(z => z.bought > 0).length}`);
      // A player who has solved the buffer and knows the recipes: an upper bound on speed.
      pt.SLOT_AT.forEach((_, k) => { if (k < pt.patternSlots(s) && !s.patterns.slots[k]?.target) { const t = (['ash', 'pigment', 'cycles'] as const)[k]; pt.setSlot(s, k, { target: t, ...pt.signature(s, t) }); mark(`pattern${k}`); } });
      if (al.alchemyOpen(s)) {
        al.researchQuick(s); al.researchColor(s); if (s.alchemy.colors.length >= 16) al.researchSlot(s);
        const r = al.RECIPES.find(r => !s.alchemy.found[r.id] && r.mix.length <= al.maxSlots(s) && r.mix.every(id => al.hasIngredient(s, id)));
        if (r && al.wind(s, r.mix)) mark(`wind-${r.id}`);
        const cheap = al.RECIPES.filter(r => s.alchemy.found[r.id]).sort((a, b) => al.brewCost(s, a) - al.brewCost(s, b))[0];
        if (cheap) al.brew(s, cheap.id);
      }
      e.tick(s, DT, () => 0.5);
      if (!s.ash.isFinite()) { mark('INFINITY'); break; }
    }
    console.log(label, marks.filter(m => /^(zone|h\d|ash|pattern|INF)/.test(m)).join('  '), '| final ash/s', e.ashPerSecond(s).toNumber().toExponential(2), 'comfort', e.comfort(s), 'species', s.nursery.seen.length, 'zoneUps', JSON.stringify(s.zoneUps));
  }, 3_600_000);
}
