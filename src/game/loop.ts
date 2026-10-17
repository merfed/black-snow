import { catchUp, tick } from './engine';
import { writeLocal } from './save';
import { useGame } from './store';

export const TICK_RATE = 20;
const STEP = 1 / TICK_RATE;
const AUTOSAVE_MS = 10_000;
const MAX_FRAME = 1; // seconds; longer gaps (tab asleep) are caught up in one coarse pass

/** Fixed-step loop: frame rate never changes the math. Returns a stop function. */
export function startLoop(): () => void {
  let last = performance.now();
  let acc = 0;
  let frame = 0;

  const onFrame = (now: number) => {
    let dt = (now - last) / 1000;
    last = now;
    const { game } = useGame.getState();
    if (dt > MAX_FRAME) {
      // Background tab: long gaps count as time away (no sirens); short ones run in coarse ticks.
      if (dt > 60) catchUp(game, dt);
      else for (let k = 0, n = Math.ceil(dt); k < n; k++) tick(game, dt / n);
      dt = 0;
      useGame.setState(st => ({ rev: st.rev + 1 }));
    }
    acc += dt;
    let ticked = false;
    while (acc >= STEP) {
      tick(game, STEP);
      acc -= STEP;
      ticked = true;
    }
    if (ticked) useGame.setState(st => ({ rev: st.rev + 1 }));
    frame = requestAnimationFrame(onFrame);
  };

  const save = () => writeLocal(useGame.getState().game);
  const interval = window.setInterval(save, AUTOSAVE_MS);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', save);
  frame = requestAnimationFrame(onFrame);

  return () => {
    cancelAnimationFrame(frame);
    window.clearInterval(interval);
    window.removeEventListener('beforeunload', save);
    document.removeEventListener('visibilitychange', save);
  };
}
