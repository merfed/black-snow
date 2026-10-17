import { useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { answerCost, ashPerSecond, listenPower, owns } from '../game/engine';
import { fmt, fmtTime } from '../game/format';
import { useGame } from '../game/store';
import { FloaterLayer, SIGNAL, useFloaters } from './Floaters';
import { Sprite } from './Sprite';
import { RECEIVER } from './sprites';

export function AshPanel() {
  const game = useGame(st => st.game);
  const listen = useGame(st => st.listen);
  const answer = useGame(st => st.answerSiren);
  const { items, spawn, burst } = useFloaters();
  const [pop, setPop] = useState(0);
  const [flash, setFlash] = useState<{ x: number; y: number; color: string } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const { siren } = game;
  const cost = answerCost(game);
  const rate = ashPerSecond(game);

  const onListen = (e: MouseEvent<HTMLButtonElement>) => {
    const caught = listen();
    const el = panel.current!;
    const box = el.getBoundingClientRect();
    // The board may be zoomed, so screen pixels have to be turned back into panel pixels.
    const scale = box.width / el.offsetWidth || 1;
    // Keyboard presses have no pointer position; float from the button's centre instead.
    const btn = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX || btn.left + btn.width / 2;
    const cy = e.clientY || btn.top + btn.height / 2;
    const x = (cx - box.left) / scale;
    const y = (cy - box.top) / scale;
    const color = SIGNAL[pop % SIGNAL.length];
    spawn(x, y - 14, `+${fmt(caught)}`, false, color);
    burst(x, y, 7 + Math.round(game.resonance * 9), [color, SIGNAL[(pop + 2) % SIGNAL.length], '#ffffff']);
    setFlash({ x: (cx - btn.left) / scale, y: (cy - btn.top) / scale, color });
    setPop(p => p + 1);
  };

  return (
    <section className="panel ash-panel framed" ref={panel} data-panel="ash">
      <h2>Ash <span className="h2-note">black snow, decoded</span></h2>
      <div className="receiver" key={`r${pop}`}><Sprite rows={RECEIVER} px={5} title="The receiver" /></div>
      <div className="big-number glow" key={pop} style={{ '--c': flash?.color ?? '#fff' } as CSSProperties}>{fmt(game.ash)}</div>
      <div className="rate">
        {siren.active && rate.eq(0) ? 'The snow has stopped. The shafts bleed rust.'
          : rate.gt(0) ? <><b>+{fmt(rate)}</b> per second</> : 'Nothing is digging yet.'}
        {game.kindled > 0 && <span className="kindled"> · kindled x2 {fmtTime(game.kindled)}</span>}
      </div>

      <button className="listen" onClick={onListen}>
        {flash && (
          <span key={pop} className="listen-flash" aria-hidden="true"
            style={{ '--c': flash.color, '--fx': `${flash.x}px`, '--fy': `${flash.y}px` } as CSSProperties} />
        )}
        Listen <span className="listen-gain">+{fmt(listenPower(game))}</span>
      </button>

      {!owns(game, 'thaw') && (
        <p className="hint">Press <b>Listen</b> to catch the snow as it falls. Each flake is ash.</p>
      )}

      {owns(game, 'coil') && (
        <div className="resonance" title="Listen quickly to build resonance. It fades when you stop.">
          <div className="resonance-label">
            <span>Resonance</span>
            <span>x{(1 + game.resonance).toFixed(2)}</span>
          </div>
          <div className="resonance-bar"><div style={{ width: `${game.resonance * 100}%` }} /></div>
        </div>
      )}

      {game.sirensSeen > 0 && !siren.active && (
        <button className="secondary answer" disabled={game.ash.lt(cost)} onClick={answer} title="Start the siren now">
          Answer the phone in corridor B <span className="cost">{fmt(cost)} ash</span>
        </button>
      )}
      <FloaterLayer items={items} />
    </section>
  );
}
