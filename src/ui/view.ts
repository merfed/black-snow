import { create } from 'zustand';

/** Panels the player can fold away. The ash panel always stays. */
export type PanelId = 'instruments' | 'shafts' | 'rites' | 'log' | 'station' | 'egg' | 'kiln' | 'dial' | 'resources' | 'citadel';

const KEY = 'black-snow-view';

interface Prefs { hidden: Partial<Record<PanelId, boolean>>; dragged: boolean }

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { hidden: {}, dragged: false, ...JSON.parse(raw) };
  } catch { /* per-viewer nicety only */ }
  return { hidden: {}, dragged: false };
}

function persist(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* per-viewer nicety only */ }
}

interface View extends Prefs {
  toggle: (id: PanelId) => void;
  show: (id: PanelId) => void;
  markDragged: () => void;
}

export const useView = create<View>((set, get) => {
  const save = (patch: Partial<Prefs>) => {
    set(patch);
    const { hidden, dragged } = get();
    persist({ hidden, dragged });
  };
  return {
    ...load(),
    toggle: id => save({ hidden: { ...get().hidden, [id]: !get().hidden[id] } }),
    show: id => save({ hidden: { ...get().hidden, [id]: false } }),
    markDragged: () => { if (!get().dragged) save({ dragged: true }); },
  };
});

/** The board registers its camera here so the dock can steer it. */
export const camera = {
  home: () => {},
  zoom: (_factor: number) => {},
  flyTo: (_id: string) => {},
};
