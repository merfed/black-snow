import { camera, useView, type PanelId } from './view';

export interface DockItem { id: PanelId | 'ash'; label: string }

/**
 * Bottom-right controls for the board: jump to a panel, fold it away, zoom, go home.
 * Panels on the map fly into view; the log is pinned to the screen so it only folds.
 */
export function Dock({ items }: { items: DockItem[] }) {
  const { hidden, toggle, show, dragged } = useView();
  const go = (id: DockItem['id']) => {
    if (id === 'log' || id === 'resources') { toggle(id); return; }
    if (id !== 'ash') show(id);
    camera.flyTo(id === 'shafts' ? 'zone-0' : id);
  };

  return (
    <nav className="dock" aria-label="Station map">
      {!dragged && <div className="dock-hint">Drag the floor to look around</div>}
      <div className="dock-row">
        {items.map(it => {
          const off = it.id !== 'ash' && hidden[it.id];
          return (
            <div key={it.id} className={`dock-item ${off ? 'off' : ''}`}>
              <button className="dock-go" onClick={() => go(it.id)} title={it.id === 'log' || it.id === 'resources' ? `Show or hide the ${it.label.toLowerCase()}` : `Go to ${it.label}`}>
                {it.label}
              </button>
              {it.id !== 'ash' && it.id !== 'log' && it.id !== 'resources' && (
                <button className="dock-eye" onClick={() => toggle(it.id as PanelId)} aria-pressed={!off}
                  title={off ? `Show ${it.label}` : `Hide ${it.label}`}>
                  {off ? '○' : '●'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="dock-row dock-cam">
        <button onClick={() => camera.zoom(1 / 1.2)} aria-label="Zoom out">−</button>
        <button onClick={() => camera.home()} title="Frame every panel">Home</button>
        <button onClick={() => camera.zoom(1.2)} aria-label="Zoom in">+</button>
      </div>
    </nav>
  );
}
