// The zone guide popup: an index on the left, every section the player has reached on the right.
// Content and unlock rules live in src/game/guide.tsx; this file is only the frame around them.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ZONES } from '../game/data';
import { guideHasLocked, visibleGuide } from '../game/guide';
import { useGame } from '../game/store';
import { ZONE_COLORS } from './colors';
import './zone-guide.css';

export function ZoneGuide({ zone, onClose }: { zone: number; onClose: () => void }) {
  const game = useGame(st => st.game);
  // The game ticks 20 times a second; the guide's live numbers only need to move about once a second.
  const beat = useGame(st => Math.floor(st.rev / 20));
  const sections = useMemo(() => visibleGuide(game, zone), [game, zone, beat]);
  const locked = useMemo(() => guideHasLocked(game, zone), [game, zone, beat]);
  const [active, setActive] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const def = ZONES[zone];

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // Which section is being read: the last one whose top has scrolled past the top of the pane.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + 24;
    let cur = sections[0]?.id ?? null;
    for (const sec of sections) {
      const node = el.querySelector<HTMLElement>(`[data-guide="${sec.id}"]`);
      if (node && node.getBoundingClientRect().top <= top) cur = sec.id;
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && sections.length) cur = sections[sections.length - 1].id;
    setActive(cur);
  };

  const jump = (id: string) => {
    const el = scroller.current;
    const node = el?.querySelector<HTMLElement>(`[data-guide="${id}"]`);
    if (!el || !node) return;
    el.scrollTo({ top: el.scrollTop + node.getBoundingClientRect().top - el.getBoundingClientRect().top - 8, behavior: 'smooth' });
    setActive(id);
  };

  const groups: { name: string; items: typeof sections }[] = [];
  for (const sec of sections) {
    const last = groups[groups.length - 1];
    if (last && last.name === sec.group) last.items.push(sec);
    else groups.push({ name: sec.group, items: [sec] });
  }
  const current = active ?? sections[0]?.id;

  return createPortal(
    <div className="dialog-backdrop wiring-backdrop" data-nodrag onClick={onClose}>
      <div className="zone-guide panel plate-panel knots" role="dialog" aria-label={`How zone ${def.id} works`} onClick={e => e.stopPropagation()}
        style={{ '--hue': ZONE_COLORS[zone] } as CSSProperties}>
        <header className="zg-head">
          <span className="zone-num">{def.id}</span>
          <h2>{def.name} <span className="h2-note">how it works</span></h2>
          <button className="secondary close" onClick={onClose} aria-label="Close">x</button>
        </header>
        <div className="zg-body">
          <nav className="zg-index" data-scroll data-nodrag aria-label="Sections">
            {groups.map((g, gi) => (
              <div key={`${gi}-${g.name}`} className="zg-group">
                <span className="zg-group-name">{g.name}</span>
                {g.items.map(sec => (
                  <button key={sec.id} className={`zg-link ${sec.id === current ? 'on' : ''}`} onClick={() => jump(sec.id)}>{sec.title}</button>
                ))}
              </div>
            ))}
            {!sections.length && <span className="zg-group-name">Nothing yet</span>}
          </nav>
          <div className="zg-pages" ref={scroller} onScroll={onScroll} data-scroll data-nodrag>
            {!sections.length && <p className="g-voice">Nothing down here is written yet. Dig first.</p>}
            {sections.map(sec => (
              <section key={sec.id} className="zg-section" data-guide={sec.id}>
                <span className="zg-kicker">{sec.group}</span>
                <h3 className="zg-title">{sec.title}</h3>
                {sec.body(game)}
              </section>
            ))}
            {locked && sections.length > 0 && <p className="zg-more">More is written further down.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
