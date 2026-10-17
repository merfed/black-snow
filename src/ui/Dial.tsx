import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { echoRate } from '../game/engine';
import { fmt } from '../game/format';
import { useGame } from '../game/store';
import { FREQS, type FreqId } from '../game/systems';
import { SYSTEM_COLORS } from './colors';
import { Dither, hex, paint, type Shade } from './dither';
import { Sprite } from './Sprite';

const LO = 0, HI = 110; // MHz across the glass
/** Where a frequency sits on the glass, in percent. The scale runs from 4% to 96%. */
const pos = (band: string) => 4 + ((parseFloat(band) - LO) / (HI - LO)) * 92;

/** Each station has its own voice on the scope. Returns -1..1 for x (0..1) at time t. */
const VOICES: Record<FreqId | 'static', (x: number, t: number) => number> = {
  numbers: (x, t) => { const beat = Math.floor((x * 6 + t * 1.5) % 6); return (beat % 2 ? 0.75 : -0.05) * Math.sign(Math.sin(x * 90 + t * 20)); },
  hum: (x, t) => 0.55 * Math.sin(x * 12 + t * 5) + 0.2 * Math.sin(x * 36 + t * 15) + 0.08 * Math.sin(x * 70 - t * 9),
  forecast: (x, t) => Math.sin(x * 60 + t * 12) * (0.25 + 0.55 * Math.abs(Math.sin(x * 4 - t * 1.3))),
  lullaby: (x, t) => 0.45 * Math.sin(x * 8 + t * 1.6) + 0.25 * Math.sin(x * 12.7 + t * 2.4),
  dead: (x, t) => { const k = (x * 40 + t * 3) % 40; return k < 0.4 ? 0.9 * Math.sin(k * 20) : 0.02 * Math.sin(x * 300 + t * 40); },
  static: () => (Math.random() * 2 - 1) * 0.7,
};

/** A low-resolution phosphor scope: the trace leaves an afterglow that is dithered down as it fades. */
function Scope({ voice, color }: { voice: FreqId | 'static'; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const v = useRef(voice);
  v.current = voice;
  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const glow = new Float32Array(W * H);
    const img = g.createImageData(W, H);
    const ramp = ['#040a08', '#0b2a1f', color === '#7dffc8' ? '#2a9a6e' : '#4d5c56', color].map(hex);
    let raf = 0, last = 0;
    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw);
      if (ms - last < 1000 / 20) return;
      last = ms;
      const t = ms / 1000;
      for (let k = 0; k < glow.length; k++) glow[k] *= 0.55;
      const f = VOICES[v.current];
      let py = -1;
      for (let x = 0; x < W; x++) {
        const y = Math.round(H / 2 - f(x / W, t) * (H / 2 - 2));
        const a = py < 0 ? y : py;
        for (let yy = Math.min(a, y); yy <= Math.max(a, y); yy++) if (yy >= 0 && yy < H) glow[yy * W + x] = 1;
        py = y;
      }
      paint(img, (x, y) => Math.max(glow[y * W + x], (x % 14 === 0 || y % 8 === 0) && (x + y) % 2 === 0 ? 0.3 : 0), t, ramp);
      g.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={canvas} className="scope" width={112} height={30} />;
}

const KNOB = [
  '....####....',
  '..##++++##..',
  '.#+++##+++#.',
  '.#++####++#.',
  '#++######++#',
  '#+########+#',
  '#+########+#',
  '#++######++#',
  '.#++####++#.',
  '.#+++++:++#.',
  '..##++++##..',
  '....####....',
];
const GRILLE = Array.from({ length: 6 }, (_, y) => Array.from({ length: 64 }, (_, x) => ((x + (y % 2) * 2) % 4 === 0 ? '#' : '.')).join(''));
const glass: Shade = (x, y, t, w, h) => 0.95 - Math.hypot((x - w * 0.5) / w, (y - h * 0.15) / h) * 0.9 + 0.03 * Math.sin(t * 0.7);

/**
 * The dial is one old radio, not a list: a glass scale with a needle, a scope that shows what is
 * playing, and a readout. Only one station can play, so the radio only ever shows one.
 */
export function DialPanel() {
  const game = useGame(st => st.game);
  const tune = useGame(st => st.tune);
  const rate = echoRate(game);
  const tuned = FREQS.find(f => f.id === game.tuned && game.freqs[f.id]);
  const [needle, setNeedle] = useState(tuned ? pos(tuned.band) : 50);
  const [sweeping, setSweeping] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (tuned && !sweeping) setNeedle(pos(tuned.band)); }, [tuned, sweeping]);

  const turnTo = (id: FreqId) => {
    const f = FREQS.find(x => x.id === id)!;
    if (!game.freqs[id] && game.echoes < f.cost) return;
    setSweeping(true);
    setNeedle(pos(f.band));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { tune(id); setSweeping(false); }, 700);
  };
  const step = (d: 1 | -1) => {
    const found = FREQS.filter(f => game.freqs[f.id]).sort((a, b) => parseFloat(a.band) - parseFloat(b.band));
    if (!found.length) return;
    const at = found.findIndex(f => f.id === tuned?.id);
    turnTo(found[(at + d + found.length) % found.length].id);
  };
  const voice = sweeping || !tuned ? 'static' : tuned.id;

  return (
    <section className="panel dial-panel reveal" data-panel="dial" style={{ '--hue': SYSTEM_COLORS.echoes } as CSSProperties}>
      <div className="radio">
        <div className="radio-top">
          <span className="radio-brand">LULL·TONE</span>
          <span className="radio-model">model 04 receiver · {fmt(game.echoes)} echoes · +{fmt(rate)}/s</span>
        </div>

        <div className="glass">
          <Dither className="glass-bg" shade={glass} ramp={['#b07a3c', '#c8924a', '#dcaa60', '#ecc47e']} cols={120} rows={24} animate fps={4} />
          <div className="glass-scale">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className={`tick ${i % 2 ? '' : 'major'}`} style={{ left: `${4 + (i / 22) * 92}%` }}>{i % 4 ? '' : (i * 5).toString()}</span>
            ))}
          </div>
          {[...FREQS].sort((a, b) => parseFloat(a.band) - parseFloat(b.band)).map((f, n) => (
            <span key={f.id} className={`station ${game.freqs[f.id] ? 'found' : ''} ${tuned?.id === f.id ? 'on' : ''}`}
              style={{ left: `${pos(f.band)}%`, bottom: n % 2 ? 30 : 8 }}>{f.band}</span>
          ))}
          <div className={`needle ${sweeping ? 'moving' : ''}`} style={{ left: `${needle}%` }} />
        </div>

        <div className="presets">
          {FREQS.map(f => {
            const found = !!game.freqs[f.id];
            const afford = game.echoes >= f.cost;
            return (
              <button key={f.id} className={`preset ${found ? 'found' : ''} ${tuned?.id === f.id ? 'on' : ''} ${!found && afford ? 'afford' : ''}`}
                onClick={() => turnTo(f.id)} disabled={!found && !afford}
                title={found ? `${f.band} · ${f.name}: ${f.desc}` : `${f.band} is static. Spend ${fmt(f.cost)} echoes to find what is there.`}>
                <span className="preset-band">{f.band}</span>
                <span className="preset-name">{found ? f.name : `find · ${fmt(f.cost)}`}</span>
              </button>
            );
          })}
        </div>

        <div className="radio-face">
          <div className="scope-wrap">
            <Scope voice={voice} color={voice === 'static' ? '#9fb0a8' : '#7dffc8'} />
            <span className="scope-tag">{sweeping ? 'tuning…' : tuned ? `${tuned.band} MHz` : 'no station'}</span>
          </div>
          <div className="radio-knobs">
            <button className="knob" onClick={() => step(-1)} aria-label="Previous station"><Sprite rows={KNOB} px={4} /></button>
            <button className="knob" onClick={() => step(1)} aria-label="Next station"><Sprite rows={KNOB} px={4} /></button>
          </div>
        </div>

        <div className="vfd">
          {tuned && !sweeping ? (
            <><b>{tuned.name.toUpperCase()}</b><span>{tuned.desc}</span></>
          ) : sweeping ? <b>· · ·</b> : (
            <><b>STATIC</b><span>Echoes drift in on their own, faster for every zone you open and while resonance is high. Spend them to find a station.</span></>
          )}
        </div>
        <div className="grille" aria-hidden="true"><Sprite rows={GRILLE} px={4} /></div>
      </div>
    </section>
  );
}
