import { useEffect, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { camera, useView } from './view';

/** A column of panels pinned at a spot on the map. x is in world pixels; the ash panel sits near 0. */
export interface Column { id: string; x: number; w: number; y?: number; content: ReactNode; decor?: boolean }

// How far you can push the map off screen before it stops.
const KEEP = 140;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.4;

interface Box { x: number; y: number; w: number; h: number }

// Where the floor starts: just under the fixed top bar, which is taller on phones.
const top = () => (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 96) + 18;

/**
 * The station floor. Drag anywhere that isn't a control to look around, wheel or trackpad to pan,
 * ctrl+wheel or pinch to zoom. The camera lives in a ref and writes the transform directly so the
 * 20 Hz game re-render never fights the player's hand.
 */
export function Board({ columns, layoutKey }: { columns: Column[]; layoutKey: string }) {
  const vp = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: 0, y: 120, s: 1 });
  const anim = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; dist: number; moved: boolean } | null>(null);
  const markDragged = useView(st => st.markDragged);

  const apply = () => {
    const { x, y, s } = cam.current;
    world.current!.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    const bg = vp.current!.style;
    bg.backgroundPosition = `${x}px ${y}px`;
    bg.backgroundSize = `${48 * s}px ${48 * s}px`;
  };

  // World-space box of every panel on the map, read from layout.
  const bounds = (): Box | null => {
    const cols = Array.from(world.current!.children) as HTMLElement[];
    const live = cols.filter(c => c.offsetHeight > 0 && !c.classList.contains('decor'));
    if (!live.length) return null;
    const x = Math.min(...live.map(c => c.offsetLeft));
    const y = Math.min(...live.map(c => c.offsetTop));
    const r = Math.max(...live.map(c => c.offsetLeft + c.offsetWidth));
    const b = Math.max(...live.map(c => c.offsetTop + c.offsetHeight));
    return { x, y, w: r - x, h: b - y };
  };

  const panelBox = (id: string): Box | null => {
    const el = world.current!.querySelector<HTMLElement>(`[data-panel="${id}"]`);
    if (!el) return null;
    const col = el.offsetParent as HTMLElement;
    return { x: col.offsetLeft + el.offsetLeft, y: col.offsetTop + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };

  const clamp = (c: { x: number; y: number; s: number }) => {
    const b = bounds();
    if (!b) return c;
    const W = vp.current!.clientWidth, H = vp.current!.clientHeight;
    const x = Math.min(W - KEEP - b.x * c.s, Math.max(KEEP - (b.x + b.w) * c.s, c.x));
    const y = Math.min(H - KEEP - b.y * c.s, Math.max(KEEP - (b.y + b.h) * c.s, c.y));
    return { ...c, x, y };
  };

  const glide = (to: { x: number; y: number; s: number }, instant = false) => {
    cancelAnimationFrame(anim.current);
    if (instant) { cam.current = to; apply(); return; }
    const from = { ...cam.current };
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      const e = 1 - Math.pow(1 - k, 3);
      cam.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s: from.s + (to.s - from.s) * e };
      apply();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  // Frame a box: centred across, top just under the bar, zoomed out only as far as needed.
  const frame = (b: Box, minZoom: number, instant = false) => {
    const W = vp.current!.clientWidth;
    const s = Math.max(minZoom, Math.min(1, (W - 48) / b.w));
    glide({ s, x: W / 2 - (b.x + b.w / 2) * s, y: top() - b.y * s }, instant);
  };

  const home = (instant = false) => {
    const W = vp.current!.clientWidth;
    // Phones can't fit the floor, so home is the receiver itself.
    const b = W < 760 ? panelBox('ash') : bounds();
    if (!b) return;
    const s = Math.max(W < 760 ? 0.6 : 0.7, Math.min(1, (W - 48) / b.w));
    // Once the floor is wider than the screen, home centres on the receiver instead.
    const ash = panelBox('ash');
    const cx = b.w * s > W - 48 && ash ? ash.x + ash.w / 2 : b.x + b.w / 2;
    glide({ s, x: W / 2 - cx * s, y: top() - b.y * s }, instant);
  };

  const zoomAt = (factor: number, px: number, py: number) => {
    cancelAnimationFrame(anim.current);
    const c = cam.current;
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.s * factor));
    const k = s / c.s;
    cam.current = clamp({ s, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
    apply();
  };

  useEffect(() => {
    camera.home = () => home();
    camera.zoom = f => {
      const r = vp.current!.getBoundingClientRect();
      const from = { ...cam.current };
      zoomAt(f, r.width / 2, r.height / 2);
      const to = cam.current;
      cam.current = from;
      glide(to);
    };
    camera.flyTo = id => {
      // The panel may have just been un-hidden; wait a frame for it to lay out.
      requestAnimationFrame(() => {
        const b = panelBox(id);
        if (b) frame(b, 0.6);
      });
    };
  });

  // Frame everything on first paint, and again whenever the game unlocks a new panel.
  const first = useRef(true);
  useLayoutEffect(() => {
    const instant = first.current;
    first.current = false;
    requestAnimationFrame(() => home(instant));
  }, [layoutKey]);

  useEffect(() => {
    let t = 0;
    const onResize = () => { clearTimeout(t); t = window.setTimeout(() => home(), 150); };
    window.addEventListener('resize', onResize);
    // Wheel has to be non-passive to stop the browser scrolling or zooming the page.
    const el = vp.current!;
    const onWheel = (e: WheelEvent) => {
      // A list that can still scroll this way takes the wheel for itself.
      const sc = (e.target as Element).closest<HTMLElement>('[data-scroll]');
      if (sc && !e.ctrlKey && !e.metaKey && (e.deltaY > 0 ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1 : sc.scrollTop > 0)) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else {
        cancelAnimationFrame(anim.current);
        const line = e.deltaMode === 1 ? 32 : 1;
        cam.current = clamp({ ...cam.current, x: cam.current.x - e.deltaX * line, y: cam.current.y - e.deltaY * line });
        apply();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { window.removeEventListener('resize', onResize); el.removeEventListener('wheel', onWheel); };
  }, []);

  const spread = () => {
    const [a, b] = Array.from(pointers.current.values());
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Controls keep their clicks; everything else is floor you can grab.
    if ((e.target as Element).closest('button, a, input, textarea, select, [data-nodrag]')) return;
    cancelAnimationFrame(anim.current);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vp.current!.setPointerCapture(e.pointerId);
    const p = pointers.current.size === 2 ? spread() : { x: e.clientX, y: e.clientY, dist: 0 };
    drag.current = { ...p, moved: drag.current?.moved ?? false };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    const p = pointers.current.size === 2 ? spread() : { x: e.clientX, y: e.clientY, dist: 0 };
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > 4) {
      d.moved = true;
      vp.current!.classList.add('dragging');
      markDragged();
    }
    if (p.dist && d.dist) {
      zoomAt(p.dist / d.dist, p.x, p.y);
    }
    cam.current = clamp({ ...cam.current, x: cam.current.x + p.x - d.x, y: cam.current.y + p.y - d.y });
    apply();
    drag.current = { ...p, moved: d.moved };
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const [p] = Array.from(pointers.current.values());
      drag.current = { ...p, dist: 0, moved: true };
      return;
    }
    if (pointers.current.size === 0) {
      drag.current = null;
      vp.current!.classList.remove('dragging');
    }
  };

  return (
    <div className="board" ref={vp} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="world" ref={world}>
        {columns.map(c => (
          <div key={c.id} className={`column ${c.decor ? 'decor' : ''}`} style={{ left: c.x, top: c.y ?? 0, width: c.w }}>{c.content}</div>
        ))}
      </div>
    </div>
  );
}
