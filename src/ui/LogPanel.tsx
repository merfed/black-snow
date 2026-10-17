import { useState } from 'react';
import { useGame } from '../game/store';

/** A quiet teletype strip pinned to the corner. Two lines by default; open it to read back. */
export function LogPanel() {
  const log = useGame(st => st.game.log);
  useGame(st => st.rev);
  const [open, setOpen] = useState(false);
  return (
    <section className={`panel log-panel framed ${open ? 'open' : ''}`}>
      <h2>
        Log <span className="h2-note">teletype, receiving</span>
        <button className="help-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'fold' : 'read back'}</button>
      </h2>
      <ol className="log" aria-live="polite">
        {log.slice(0, open ? 40 : 2).map((e, i) => (
          <li key={e.id} className={`log-${e.kind} ${i === 0 ? 'fresh' : ''}`}>
            <span className="prompt">&gt;</span> {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
