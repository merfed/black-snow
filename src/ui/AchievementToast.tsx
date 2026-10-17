import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, type AchDef } from '../game/achievements';
import { useGame } from '../game/store';

/** A small card that slides in when the station records an achievement. Ones already earned at load stay quiet. */
export function AchievementToast() {
  const earned = useGame(st => st.game.achievements);
  useGame(st => st.rev);
  const known = useRef<Set<string> | null>(null);
  const [shown, setShown] = useState<{ a: AchDef; at: number }[]>([]);
  const ids = Object.keys(earned);

  useEffect(() => {
    if (!known.current) { known.current = new Set(ids); return; }
    const fresh = ids.filter(id => !known.current!.has(id));
    if (!fresh.length) return;
    fresh.forEach(id => known.current!.add(id));
    const now = Date.now();
    setShown(list => [...list, ...fresh.map((id, k) => ({ a: ACHIEVEMENTS.find(x => x.id === id)!, at: now + k }))].slice(-3));
    window.setTimeout(() => setShown(list => list.filter(t => t.at > now + fresh.length - 1)), 5200);
  }, [ids.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ach-toasts" aria-live="polite">
      {shown.map(({ a, at }) => (
        <div key={at} className="ach-toast">
          <small>Recorded · all ash +1%</small>
          <b>{a.name}</b>
          <span>{a.desc}</span>
        </div>
      ))}
    </div>
  );
}
