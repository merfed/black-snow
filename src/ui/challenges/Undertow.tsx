// The Undertow: the panel inside the zone 2 box, and the room behind it (tray and sets, the pipe and its leaks, bins and bore).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  APPROACHES, approach, BINS, binCost, binLevel, BORE_BUDGET, deliveryTime, depth, efficiency, emberYield, figureHere, gaugeMult,
  gaugeNow, hiss, keepMult, lengths, LORE, luckTilt, luckYield, nearness, nextShift, objDef, OBJECTS, patch, patchMult, PERKS,
  PIPE_CELLS, RARITY_NAMES, rarityOdds, setBore, setMult, setRule, SETS, setsKept, sightWait, sortByRules, sortObj, trayCap,
  upgradeBin, walkTime, zoneBonus, LEAK_CAP, MILESTONE_KEPT, type Bin,
} from '../../game/challenges/undertow';
import { fmt, fmtTime } from '../../game/format';
import { useGame } from '../../game/store';
import { ZONE_COLORS } from '../colors';
import { hex, threshold } from '../dither';
import { ChallengeRoom, RoomStatus, SaveHint } from './ChallengeSlot';
import './undertow.css';

const ZONE = 1;
const HUE = ZONE_COLORS[ZONE];
const RED = '#ff3030';
const INK_BG = '#05060b';
const BIN_NAMES: Record<Bin, string> = { keep: 'Keep', burn: 'Burn', down: 'Send down' };
const BIN_DESC: Record<Bin, (l: number) => string> = {
  keep: l => `Kept things count ${Math.round(25 * l)}% more.`,
  burn: l => `Embers +${Math.round(50 * l)}%.`,
  down: l => `Luck +${Math.round(50 * l)}%.`,
};

const mix = (a: string, b: string, k: number) => {
  const x = hex(a), y = hex(b);
  return x.map((v, i) => Math.round(v + (y[i] - v) * k)) as [number, number, number];
};
const PAL = [mix(HUE, INK_BG, 0.92), mix(HUE, INK_BG, 0.6), hex(HUE), mix(HUE, '#ffffff', 0.6)];
const ACC = hex(RED);
const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** A pixel's look: 0..1 is brightness in the hue's inks; 2..3 is the red ink, solid at 3. */
type Px = (x: number, y: number, t: number) => number;

/** A small canvas painted pixel by pixel with ordered dither, at a low frame rate, paused off screen. */
function DitherCanvas({ w, h, px, fps = 10, className, onPointer }: {
  w: number; h: number; px: () => Px; fps?: number; className?: string; onPointer?: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pxRef = useRef(px);
  pxRef.current = px;
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1e9, visible = true;
    const loop = (ms: number) => {
      if (ms - last >= 1000 / fps) {
        last = ms;
        const f = pxRef.current(), t = ms / 1000, d = img.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = f(x, y, t), th = threshold(x, y), i = (y * w + x) * 4;
          let col: [number, number, number];
          if (v >= 2) col = v - 2 > th ? ACC : PAL[0];
          else {
            const s = Math.max(0, Math.min(1, v)) * 3, lo = Math.floor(s);
            col = PAL[Math.min(3, lo + (s - lo > th ? 1 : 0))];
          }
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && !still) raf = requestAnimationFrame(loop);
      });
      io.observe(c);
    }
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [w, h, fps]);
  return (
    <canvas ref={ref} width={w} height={h} className={`undertow-canvas ${className ?? ''}`} data-nodrag
      onPointerDown={onPointer && (e => {
        const r = e.currentTarget.getBoundingClientRect();
        onPointer(Math.floor((e.clientX - r.left) / r.width * w), Math.floor((e.clientY - r.top) / r.height * h));
      })} />
  );
}

/** Looking down the pipe: ribs sliding past, water running toward you, and sometimes someone standing in it. */
function pipeView(near: number, show: boolean, flow: number): Px {
  const W = 160, H = 64, cx = W / 2, cy = H * 0.42;
  const fh = H * (0.12 + 0.72 * near); // figure height
  const fw = fh * 0.32;
  const feet = cy + 2 + fh * 0.35;
  return (x, y, t) => {
    const dx = (x - cx) / W, dy = (y - cy) / H * 0.55;
    const r = Math.hypot(dx, dy), z = 1 / Math.max(r, 0.015), ang = Math.atan2(dy, dx);
    // the figure, in front of everything
    if (show) {
      const top = feet - fh, rel = (y - top) / fh;
      if (rel >= 0 && rel <= 1) {
        const headR = fw * 0.38, hy = top + headR;
        const inHead = Math.hypot(x - cx, (y - hy) * 1.1) < headR;
        const half = rel < 0.2 ? 0 : fw * (0.32 + 0.22 * Math.min(1, (rel - 0.2) * 3)) * (rel > 0.85 ? 0.8 : 1);
        if (inHead || Math.abs(x - cx) < half) return 2 + (near > 0.6 ? 0.95 : 0.6 + 0.35 * near);
      }
    }
    const fade = Math.min(1, r * 3.2);
    // water along the floor of the pipe
    if (ang > 0.55 && ang < Math.PI - 0.55) {
      const lane = Math.floor(ang * 18), seg = Math.floor(z * 2 - t * (1.5 + 4 * flow));
      const glint = hash(lane, seg) > 0.86 ? 0.95 : 0;
      return Math.max(glint * fade, (0.22 + 0.12 * Math.sin(z * 3 + t * 2)) * fade);
    }
    const rib = 0.5 + 0.5 * Math.sin(z * 5 - t * 1.2);
    return (0.12 + 0.55 * rib * rib) * fade + (r > 0.47 ? 0.15 : 0);
  };
}

function Plate({ px, w, h, caption, onPointer, className }: { px: () => Px; w: number; h: number; caption?: string; onPointer?: (x: number, y: number) => void; className?: string }) {
  return (
    <figure className={`artwork undertow-plate ${className ?? ''}`} style={{ '--ink': HUE, '--plate-bg': `rgb(${PAL[0].join(',')})` } as CSSProperties}>
      <div className="artwork-frame knots"><DitherCanvas w={w} h={h} px={px} onPointer={onPointer} /></div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function UndertowPanel() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [open, setOpen] = useState(false);
  const u = game.challenges.undertow;
  const near = nearness(game), here = figureHere(game), walking = u.walk > 0;
  const show = here || walking || u.approaches >= APPROACHES;
  const flow = efficiency(game);
  const newest = u.tray.length - 1;
  const obj = newest >= 0 ? objDef(u.tray[newest]) : null;
  const full = u.tray.length >= trayCap(game);

  return (
    <div className="undertow">
      <Plate w={160} h={64} px={() => pipeView(near, show, flow)}
        caption={u.approaches >= APPROACHES ? '"They are facing you now."' : show ? '"Someone is standing in the water."' : '"It gives back what it took. Mostly."'} />
      <div className="ch-row undertow-stats">
        <span className="ch-stat">Tray <b>{u.tray.length}/{trayCap(game)}</b></span>
        <span className="ch-stat">{full ? <span className="dim">pipe waiting</span> : <>next in <b>{fmtTime((1 - u.pull) * deliveryTime(game))}</b></>}</span>
        <span className="ch-stat">Conduit <b>x{zoneBonus(game).toFixed(2)}</b></span>
      </div>
      {obj ? (
        <div className="undertow-obj">
          <div><span className={`undertow-name r${obj.rarity}`}>{obj.name}</span> <span className="dim">({RARITY_NAMES[obj.rarity]})</span></div>
          <p className="dim small-note">{obj.note}</p>
          <div className="ch-row">
            <button className="undertow-btn" onClick={() => run(s => sortObj(s, newest, 'keep'))}>Keep</button>
            <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, newest, 'burn'))}>Burn +{emberYield(game, obj.id)} embers</button>
            <button className="undertow-btn alt" onClick={() => run(s => sortObj(s, newest, 'down'))}>Send down</button>
          </div>
        </div>
      ) : <p className="dim small-note">The tray is empty. Something is on its way up.</p>}
      <div className="ch-row undertow-figure">
        {here ? <button className="undertow-btn undertow-walk" onClick={() => run(approach)}>Walk toward them ({fmtTime(walkTime(u.approaches))})</button>
          : walking ? <span className="ch-stat">Walking. <b>{fmtTime(u.walk)}</b> left.</span>
            : u.approaches >= APPROACHES ? <span className="dim small-note">Nobody further down. Only them.</span>
              : <span className="dim small-note">The pipe is empty{u.approaches ? ` for ${fmtTime(Math.max(0, sightWait(game) - u.sight))}` : ''}.</span>}
        <span className="ch-stat undertow-count">Approached <b>{u.approaches}/{APPROACHES}</b></span>
      </div>
      {u.approaches > 0 && <p className="undertow-lore">"{LORE[u.approaches - 1]}"</p>}
      <button className="max-all" onClick={() => setOpen(true)}>Open the Undertow</button>
      {open && <UndertowRoom onClose={() => setOpen(false)} />}
    </div>
  );
}


// ---------- the room: the tray and the sets, the pipe and its leaks, the bins and the bore ----------

function UndertowRoom({ onClose }: { onClose: () => void }) {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const full = u.tray.length >= trayCap(game);
  const here = figureHere(game);
  // The bar's buy: the bin with the fewest levels (the cheapest), so one press always teaches or deepens one.
  const bin = BINS.reduce((m, b) => (binLevel(game, b) < binLevel(game, m) ? b : m), BINS[0]);
  const bl = binLevel(game, bin);
  const status = (
    <RoomStatus
      stats={[
        { label: 'Tray', value: `${u.tray.length}/${trayCap(game)}`, rate: full ? 'pipe waiting' : `next in ${fmtTime((1 - u.pull) * deliveryTime(game))}` },
        { label: 'Kept', value: u.keptTotal < MILESTONE_KEPT ? `${u.keptTotal}/${MILESTONE_KEPT}` : u.keptTotal, rate: `x${keepMult(game).toFixed(2)} keep`, title: 'Objects kept, ever' },
        { label: 'Approached', value: `${u.approaches}/${APPROACHES}`,
          rate: here ? 'they are there' : u.walk > 0 ? `walking ${fmtTime(u.walk)}` : u.approaches >= APPROACHES ? 'only them' : 'pipe empty' },
        { label: 'Leaks', value: `${u.leaks.length}/${LEAK_CAP}`, rate: `${u.patched} patched` },
        { label: 'Conduit', value: `x${zoneBonus(game).toFixed(2)}`, rate: `luck ${fmt(u.luck)}`, title: 'What the Undertow pays the Conduit' },
      ]}
      buy={{
        label: `${bl ? 'Deepen' : 'Teach'} ${BIN_NAMES[bin]}`, cost: binCost(game, bin), onClick: () => run(s => upgradeBin(s, bin)),
        title: bl ? `${BIN_NAMES[bin]} bin, level ${bl + 1}. ${BIN_DESC[bin](bl + 1)}` : `Teach the ${BIN_NAMES[bin]} bin to sort by itself`,
      }}
    />
  );
  return (
    <ChallengeRoom zone={ZONE} title="The Undertow" note="what comes up" onClose={onClose} className="undertow-room" status={status}>
      <div className="ut-grid">
        <section className="ut-col" aria-label="The tray"><TrayCol /></section>
        <section className="ut-col" aria-label="The pipe"><PipeCol /><Leaks /></section>
        <section className="ut-col" aria-label="The bins and the bore"><Bins /><Gauge /></section>
      </div>
    </ChallengeRoom>
  );
}

function Head({ cap, children }: { cap: string; children?: ReactNode }) {
  return <div className="ut-head"><span className="ut-cap">"{cap}"</span>{children}</div>;
}

// Object sprites, 10x10: '#' hue ink, '+' dithered hue, 'w' bone, 'r' red ink.
const SPRITES: Record<string, string[]> = {
  key: ['..........', '..........', '.###......', '#+++#.....', '#+.+######', '#+++#.#.#.', '.###..#.#.', '..........', '..........', '..........'],
  button: ['..........', '...####...', '..#++++#..', '.#+r++r+#.', '.#++rr++#.', '.#++rr++#.', '.#+r++r+#.', '..#++++#..', '...####...', '..........'],
  photo: ['..........', '##########', '#wwwwwwww#', '#www##www#', '#www##www#', '#ww####ww#', '#ww####ww#', '#++++++++#', '##########', '..........'],
  cassette: ['..........', '##########', '#wwwwwwww#', '#.##..##.#', '#.##..##.#', '#wwwwwwww#', '#..####..#', '##########', '..........', '..........'],
  letter: ['..........', '..........', '##########', '##wwwwww##', '#w#wwww#w#', '#ww#rr#ww#', '#wwwrrwww#', '#wwwwwwww#', '##########', '..........'],
  glove: ['..#.#.#...', '..#.#.#...', '.##+#+#.#.', '.#+++++##.', '.#++++++#.', '.#+++++#..', '..#++++#..', '..#++++#..', '..######..', '..........'],
  band: ['..........', '...#ww#...', '..#....#..', '.#......#.', '.#......#.', '.#......#.', '..#....#..', '...####...', '..........', '..........'],
  hair: ['....#.....', '...#.#....', '...#..#...', '..#...#...', '..rrrrrr..', '..#.#.#...', '.#.#..#...', '.#..#..#..', '#...#...#.', '..........'],
  nail: ['..........', '.#####....', '...#......', '...#......', '...#......', '...#......', '....#.....', '.....##...', '.......#..', '..........'],
  tooth: ['..........', '..######..', '.#wwwwww#.', '.#wwwwww#.', '.#wwwwww#.', '..#wwww#..', '..#w##w#..', '..##..##..', '..........', '..........'],
  iron: ['..........', '..........', '...####...', '..#rrrr#..', '.#rr++rr#.', '.#r++++r#.', '.#rr++rr##', '..##rr##..', '....##....', '..........'],
  bell: ['....##....', '...#..#...', '..#++++#..', '..#++++#..', '.#++++++#.', '.#++++++#.', '##########', '....rr....', '.r..rr..r.', '..........'],
};
const BONE = '#ece6d2';

function Sprite({ id, dim }: { id: string; dim?: boolean }) {
  const rows = SPRITES[id] ?? SPRITES.key;
  return (
    <svg className={`ut-sprite${dim ? ' dim' : ''}`} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) => [...row].map((c, x) => {
        if (c === '.' || (c === '+' && (x + y) % 2)) return null;
        return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === 'r' ? RED : c === 'w' ? BONE : HUE} />;
      }))}
    </svg>
  );
}

type Pick = { tray: number } | { obj: string } | null;
const MAX_TRAY = 18;

/** The tray as a rack of slots, the three sets as a ledger of the twelve things, and a card for whichever is picked. */
function TrayCol() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [pick, setPick] = useState<Pick>(null);
  const u = game.challenges.undertow;
  const cap = trayCap(game);
  const sets = setsKept(game);
  const odds = rarityOdds(u.luck);
  const ruled = u.tray.some(id => u.rules[id] && binLevel(game, u.rules[id]) >= 1);
  let ti = pick && 'tray' in pick && pick.tray < u.tray.length ? pick.tray : -1;
  let id = pick && 'obj' in pick ? pick.obj : null;
  if (ti < 0 && !id && u.tray.length) ti = u.tray.length - 1;
  if (ti >= 0) id = u.tray[ti];
  const o = id ? objDef(id) : null;
  const sort = (b: Bin) => { run(s => sortObj(s, ti, b)); setPick(null); };
  const ruleLabel = (r?: Bin) => (r ? BIN_NAMES[r] : 'by hand');
  return (
    <>
      <Head cap="THE TRAY">
        {ruled ? <button className="undertow-btn alt ut-head-btn" onClick={() => run(sortByRules)} title="Sort everything in the tray that has a rule">Sort by the rules</button>
          : <span className="ut-head-note">oldest first</span>}
      </Head>
      <div className="ut-tray" title={`The tray holds ${cap}. When it is full the pipe waits.`}>
        {Array.from({ length: MAX_TRAY }, (_, i) => {
          if (i >= cap) return <span key={i} className="ut-slot locked" title="The figure's first gift: the tray holds four more" />;
          const tid = u.tray[i];
          if (!tid) {
            const next = i === u.tray.length;
            return <span key={i} className={`ut-slot empty${next ? ' next' : ''}`} style={next ? { '--pull': `${(u.pull * 100).toFixed(1)}%` } as CSSProperties : undefined}
              title={next ? 'Something is on its way up' : undefined} />;
          }
          const d = objDef(tid);
          return (
            <button key={i} className={`ut-slot r${d.rarity}${i === ti ? ' sel' : ''}${i === u.tray.length - 1 ? ' newest' : ''}`}
              onClick={() => setPick({ tray: i })} title={`${d.name} (${RARITY_NAMES[d.rarity]})`} aria-pressed={i === ti}>
              <Sprite id={tid} />
            </button>
          );
        })}
      </div>

      <div className="ut-odds" title={`What comes up, by luck (${fmt(u.luck)}). Luck tilt ${luckTilt(u.luck).toFixed(2)}. A common sent down brings +${luckYield(game, 'key').toFixed(0)} luck.`}>
        <span className="ut-odds-bar" aria-hidden>
          {odds.map((p, r) => <i key={r} className={`r${r}`} style={{ flexGrow: Math.max(p, 0.004) }} />)}
        </span>
        <span className="ut-odds-key">
          {odds.map((p, r) => <span key={r} className={`r${r}`}>{RARITY_SHORT[r]} <b>{(p * 100).toFixed(p < 0.1 ? 1 : 0)}%</b></span>)}
        </span>
      </div>
      <div className={`ut-card${o ? ` r${o.rarity}` : ''}`}>
        {o ? <>
          <div className="ut-card-top">
            <span className="ut-card-icon"><Sprite id={o.id} /></span>
            <div className="ut-card-text">
              <div><span className={`undertow-name r${o.rarity}`}>{o.name}</span> <span className="ut-rar">{RARITY_NAMES[o.rarity]}</span></div>
              <p className="ut-note">{o.note}</p>
            </div>
          </div>
          {ti >= 0 ? (
            <div className="ut-card-btns">
              <button className="undertow-btn" onClick={() => sort('keep')}>Keep</button>
              <button className="undertow-btn alt" onClick={() => sort('burn')}>Burn +{emberYield(game, o.id)}</button>
              <button className="undertow-btn alt" onClick={() => sort('down')}>Send down</button>
            </div>
          ) : <p className="ut-card-hint">Not in the tray. {u.kept[o.id] ? `${u.kept[o.id]} kept.` : 'None kept yet.'}</p>}
          <div className="ut-card-rule">
            <span title="A taught bin sorts this by itself as it comes up">Sorts itself into</span>
            <span className="undertow-select">
              <select value={u.rules[o.id] ?? ''} data-nodrag onChange={e => run(s => setRule(s, o.id, (e.target.value || null) as Bin | null))}>
                <option value="">by hand</option>
                {BINS.map(b => <option key={b} value={b} disabled={binLevel(game, b) < 1}>{BIN_NAMES[b]}</option>)}
              </select>
            </span>
          </div>
        </> : <p className="ut-card-hint">The tray is empty. Something is on its way up. Pick one of the twelve below to set its rule.</p>}
      </div>

      <Head cap="THE SETS"><span className="ut-head-note" title="Each set kept whole pays the Undertow">sets x{setMult(game).toFixed(2)}</span></Head>
      <div className="ut-sets">
        {SETS.map((name, si) => (
          <div key={name} className={`ut-set${sets[si] ? ' whole' : ''}`} title={`${name}: ${sets[si]} kept whole`}>
            <span className="ut-set-name">{name.replace(/^The /, '').toUpperCase()}<b>×{sets[si]}</b></span>
            <div className="ut-set-grid">
              {OBJECTS.filter(x => x.set === si).map(x => {
                const n = u.kept[x.id] ?? 0, r = u.rules[x.id];
                return (
                  <button key={x.id} className={`ut-obj r${x.rarity}${n ? '' : ' none'}${id === x.id ? ' sel' : ''}`}
                    onClick={() => setPick({ obj: x.id })} title={`${x.name} · ${n} kept · ${ruleLabel(r)}`} aria-pressed={id === x.id}>
                    <Sprite id={x.id} dim={!n} />
                    <span className="ut-obj-n">{n}</span>
                    {r && <i className={`ut-rule ${r}`} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** The pipe itself, with the figure in it, and the walk toward them. */
function PipeCol() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [seen, setSeen] = useState<number | null>(null);
  const u = game.challenges.undertow;
  const near = nearness(game), here = figureHere(game), walking = u.walk > 0;
  const show = here || walking || u.approaches >= APPROACHES;
  const flow = efficiency(game);
  const lore = seen != null && seen < u.approaches ? seen : u.approaches - 1;
  const walked = walking ? 1 - u.walk / walkTime(u.approaches) : 0;
  return (
    <>
      <Head cap="THE PIPE">
        <span className="ut-pips" role="group" aria-label="Approaches" title="Each approach takes longer than the last. Nothing happens to you there.">
          {PERKS.map((_, i) => (
            <button key={i} className={`ut-pip${i < u.approaches ? ' on' : ''}${i === lore ? ' sel' : ''}${i === u.approaches && (here || walking) ? ' due' : ''}`}
              disabled={i >= u.approaches} onClick={() => setSeen(i)} title={i < u.approaches ? PERKS[i] : '? ? ?'}>{i + 1}</button>
          ))}
        </span>
      </Head>
      <Plate className="ut-pipe" w={160} h={64} px={() => pipeView(near, show, flow)} />
      <p className="ut-caption">{u.approaches >= APPROACHES ? '"THEY ARE FACING YOU NOW."' : show ? '"SOMEONE IS STANDING IN THE WATER."' : '"IT GIVES BACK WHAT IT TOOK. MOSTLY."'}</p>
      <div className="ut-walk">
        {here ? <button className="undertow-btn undertow-walk" onClick={() => run(approach)}>Walk toward them · {fmtTime(walkTime(u.approaches))}</button>
          : walking ? <span className="ut-walking"><span>Walking · <b>{fmtTime(u.walk)}</b></span><i style={{ '--w': `${(walked * 100).toFixed(1)}%` } as CSSProperties} /></span>
            : u.approaches >= APPROACHES ? <span className="ut-walk-note">Nobody further down. Only them.</span>
              : <span className="ut-walk-note">The pipe is empty{u.approaches ? ` for ${fmtTime(Math.max(0, sightWait(game) - u.sight))}` : ''}.</span>}
      </div>
      <div className="ut-lore">
        {lore >= 0 ? <>
          <p className="undertow-lore">"{LORE[lore]}"</p>
          <p className="ut-perk"><b>{lore + 1}.</b> {PERKS[lore]}</p>
        </> : <p className="ut-perk">Nobody approached yet. Each walk is longer than the last, and each leaves you something.</p>}
      </div>
    </>
  );
}

// The leak schematic: the pipe snakes across a grid; cell n of the pipe sits at (col, row).
const SC = 16, SR = PIPE_CELLS / SC, CELL = 24;
const cellPos = (n: number) => {
  const row = Math.floor(n / SC), k = n % SC;
  return { x: row % 2 ? SC - 1 - k : k, y: row };
};
const cellAt = (x: number, y: number) => (y % 2 ? y * SC + (SC - 1 - x) : y * SC + x);
const PIPE_PATH = Array.from({ length: PIPE_CELLS }, (_, n) => {
  const p = cellPos(n);
  return `${n ? 'L' : 'M'}${p.x * CELL + CELL / 2} ${p.y * CELL + CELL / 2}`;
}).join(' ');
const LEDS = 14;

function Leaks() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const [taps, setTaps] = useState<{ n: number; v: number }[]>([]);
  const [last, setLast] = useState<{ v: number; found: boolean } | null>(null);
  const tap = (n: number) => {
    const v = hiss(game, n);
    let found = false;
    run(s => { found = patch(s, n); });
    setLast({ v: found ? 1 : v, found });
    setTaps(t => (found ? t.filter(x => Math.abs(x.n - n) > 10) : [...t.filter(x => x.n !== n), { n, v }].slice(-12)));
  };
  const meter = last?.v ?? 0;
  const lit = Math.round(meter * LEDS);
  return (
    <>
      <Head cap="THE LEAKS">
        <span className="ut-head-note" title={`Each open leak takes 5% off the Undertow (never below nothing). Patches stay. New leaks seep in slowly, never more than ${LEAK_CAP}.`}>
          patches x{patchMult(game).toFixed(2)}
        </span>
      </Head>
      <svg className="ut-schem" data-nodrag viewBox={`0 0 ${SC * CELL} ${SR * CELL}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The pipe, cell by cell: tap and listen">
        <path d={PIPE_PATH} className="ut-pipe-outer" />
        <path d={PIPE_PATH} className="ut-pipe-inner" />
        <path d={PIPE_PATH} className="ut-pipe-flow" />
        {Array.from({ length: SR * SC }, (_, i) => {
          const x = i % SC, y = Math.floor(i / SC), n = cellAt(x, y), t = taps.find(q => q.n === n);
          return (
            <rect key={i} x={x * CELL + 5} y={y * CELL + 5} width={CELL - 10} height={CELL - 10} className={`ut-cell${t ? ' tapped' : ''}`}
              style={t ? { fill: t.v > 0.95 ? RED : HUE, fillOpacity: 0.2 + 0.8 * t.v } : undefined}
              onPointerDown={e => { e.stopPropagation(); tap(n); }} />
          );
        })}
      </svg>
      <div className="ut-meter">
        <span className="ut-leds" aria-hidden>
          {Array.from({ length: LEDS }, (_, k) => <i key={k} className={`${k < lit ? 'on' : ''}${k >= LEDS - 3 ? ' hot' : ''}`} />)}
        </span>
        <span className="ut-meter-text">{last ? (last.found ? 'Patched.' : meter > 0.8 ? 'Loud. Right here, nearly.' : meter > 0.3 ? 'A hiss.' : meter > 0.02 ? 'Faint.' : 'Nothing.') : 'Tap along the pipe and listen.'}</span>
      </div>
    </>
  );
}

// Bin icons, 12x12: '#' hue ink, '+' dithered hue, 'r' red ink.
const ICONS: Record<Bin, string[]> = {
  keep: [
    '....####....', '....#..#....', '...######...', '..#......#..', '.#........#.', '.#.++++++.#.',
    '.#.+.+.+.+#.', '.#.++++++.#.', '.#.+.+.+.+#.', '.#........#.', '..########..', '............',
  ],
  burn: [
    '......#.....', '.....##.....', '.....#.#....', '....#..#..#.', '...#...#.##.', '..#..r..#.#.',
    '..#.rrr...#.', '.#.rrrrr..#.', '.#.rr+rr..#.', '.#..r+r..#..', '..#.....#...', '...#####....',
  ],
  down: [
    '...######...', '...#.++.#...', '...#.++.#...', '...#.++.#...', '...#.++.#...', '...#.++.#...',
    '.###.++.###.', '.#..++++..#.', '..#..++..#..', '...#....#...', '....#..#....', '.....##.....',
  ],
};

function PixelIcon({ bin }: { bin: Bin }) {
  const rows = ICONS[bin];
  return (
    <svg className="undertow-icon" viewBox="0 0 12 12" width={32} height={32} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) => [...row].map((c, x) => {
        if (c === '.' || (c === '+' && (x + y) % 2)) return null;
        return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === 'r' ? RED : HUE} />;
      }))}
    </svg>
  );
}

/** A framed well with the bin's icon; a dithered level rises as things go in (tapering, never quite full). */
function BinWell({ bin, n, l }: { bin: Bin; n: number; l: number }) {
  const fill = n / (n + 60);
  return (
    <div className={`undertow-well ${bin}`} style={{ '--fill': `${(fill * 100).toFixed(1)}%` } as CSSProperties}
      title={`${n} gone in`}>
      <span className="undertow-well-level" />
      <PixelIcon bin={bin} />
      <span className="undertow-well-n">{n} in</span>
      <span className="ut-well-lv">lv {l}</span>
      <i className="k tl" /><i className="k tr" /><i className="k bl" /><i className="k br" />
    </div>
  );
}

const BIN_SHORT: Record<Bin, (l: number) => string> = {
  keep: l => `+${Math.round(25 * l)}% kept`,
  burn: l => `+${Math.round(50 * l)}% embers`,
  down: l => `+${Math.round(50 * l)}% luck`,
};
const RARITY_SHORT = ['common', 'uncommon', 'rare', 'strange'];

function Bins() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const binCount: Record<Bin, number> = { keep: u.keptTotal, burn: u.burned, down: u.sentDown };
  return (
    <>
      <Head cap="THE BINS"><span className="ut-head-note">{BINS.filter(b => binLevel(game, b) > 0).length} of 3 taught</span></Head>
      <div className="ut-bins">
        {BINS.map(b => {
          const l = binLevel(game, b), cost = binCost(game, b);
          return (
            <div key={b} className={`undertow-bin ${l ? 'on' : ''}`} title={l ? `Sorts by itself. ${BIN_DESC[b](l)}` : 'Sorts only by hand.'}>
              <BinWell bin={b} n={binCount[b]} l={l} />
              <div className="undertow-bin-head"><b>{BIN_NAMES[b]}</b></div>
              <span className="ut-bin-line">{l ? BIN_SHORT[b](l) : 'by hand only'}</span>
              <button className="undertow-btn alt ut-bin-btn" disabled={game.ash.lt(cost)} onClick={() => run(s => upgradeBin(s, b))}
                title={l ? `Level ${l + 1}. ${BIN_DESC[b](l + 1)}` : 'Teach it to sort by itself'}>
                <span>{l ? 'Deepen' : 'Teach it'}</span><small>{fmt(cost)} ash</small>
              </button>
              <span className="ut-save"><SaveHint game={game} cost={cost} /></span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The three bores as a stream: narrow runs go fast and broken, wide runs slow and full. */
function streamView(bore: number[], L: number[], eff: number): Px {
  const W = 180, H = 48;
  const tot = L.reduce((a, b) => a + b, 0);
  const edges = [0, L[0] / tot, (L[0] + L[1]) / tot, 1].map(f => f * W);
  return (x, y, t) => {
    const i = x < edges[1] ? 0 : x < edges[2] ? 1 : 2;
    const half = (bore[i] / BORE_BUDGET) * H * 0.95;
    const dy = Math.abs(y - H / 2);
    if (dy > half + 1.5) return 0.04;
    if (dy > half - 0.5) return 0.7; // the wall
    const speed = 6 + 30 / Math.max(1, bore[i]);
    const p = hash(Math.floor((x - t * speed * 8) / 3), y);
    const rough = (1 - eff) * 0.5 * (bore[i] < 4 ? 1 : 0.4);
    if (p > 0.9 - rough * 0.3) return rough > 0.25 && p > 0.985 ? 2.9 : 0.95;
    return 0.18 + 0.1 * Math.sin((x - t * speed * 4) * 0.2);
  };
}

/** A pressure dial for the flow: a half ring of ticks, a filled arc and a needle. */
function FlowDial({ eff }: { eff: number }) {
  const R = 40, cx = 50, cy = 50, k = Math.max(0, Math.min(1, eff));
  const at = (f: number, r: number) => [cx - Math.cos(f * Math.PI) * r, cy - Math.sin(f * Math.PI) * r];
  const [ex, ey] = at(k, R);
  const [nx, ny] = at(k, R - 8);
  return (
    <svg className="ut-dial" viewBox="0 0 100 74" role="img" aria-label={`Efficiency ${(eff * 100).toFixed(1)}%`}>
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} className="ut-dial-track" />
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${ex} ${ey}`} className="ut-dial-arc" />
      {Array.from({ length: 11 }, (_, i) => {
        const [x1, y1] = at(i / 10, R + 4), [x2, y2] = at(i / 10, R + (i % 5 ? 7 : 10));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`ut-dial-tick${i >= 9 ? ' hot' : ''}`} />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} className="ut-dial-needle" />
      <rect x={cx - 3} y={cy - 3} width={6} height={6} className="ut-dial-hub" />
      <text x={cx} y={cy + 20} className="ut-dial-num">{(eff * 100).toFixed(1)}%</text>
    </svg>
  );
}

function Gauge() {
  const game = useGame(st => st.game);
  useGame(st => st.rev);
  const run = useGame(st => st.run);
  const u = game.challenges.undertow;
  const d = depth(game), L = lengths(d), eff = efficiency(game);
  const used = u.bore.reduce((a, b) => a + b, 0);
  const holds = gaugeNow(game) < u.held - 1e-6;
  return (
    <>
      <Head cap="THE BORE">
        <span className="ut-head-note" title={`The best mix moves when the Conduit goes deeper: next at ${nextShift(game)} Conduits.`}>depth {d} · shifts at {nextShift(game)}</span>
      </Head>
      <div className="ut-flow">
        <Plate className="ut-stream" w={180} h={48} px={() => streamView(u.bore, L, eff)} />
        <div className="ut-flow-side">
          <FlowDial eff={eff} />
          <span className="ut-dial-cap">"EFFICIENCY"</span>
        </div>
      </div>
      <div className="ut-bores">
        {u.bore.map((b, i) => (
          <label key={i} className="ut-bore">
            <span className="ut-bore-label">Run {i + 1} · {L[i]} m · bore <b>{b}</b></span>
            <span className="undertow-slider">
              <input type="range" min={1} max={BORE_BUDGET - 2} value={b} data-nodrag className="undertow-range"
                style={{ '--pct': `${((b - 1) / (BORE_BUDGET - 3)) * 100}%` } as CSSProperties}
                onChange={e => run(s => setBore(s, i, Number(e.target.value)))} />
              <span className="undertow-ticks" aria-hidden>
                {Array.from({ length: BORE_BUDGET - 2 }, (_, k) => <i key={k} className={(k + 1) % 5 === 0 || k === 0 ? 'big' : ''} />)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="ut-readouts">
        <span>metal <b>{used}/{BORE_BUDGET}</b></span>
        <span>gauge <b>x{gaugeMult(game).toFixed(2)}</b></span>
        {holds && <span className="ut-held" title="The best gauge reached stays when the optimum moves. Retune to go past it.">old bore holds <b>x{u.held.toFixed(2)}</b></span>}
      </div>
    </>
  );
}
