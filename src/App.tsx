import { useEffect, type ReactNode } from 'react';
import { useGame } from './game/store';
import { dialOpen, kilnOpen, stationOpen, zoneVisible } from './game/engine';
import { AchievementToast } from './ui/AchievementToast';
import { AshPanel } from './ui/AshPanel';
import { Board, type Column } from './ui/Board';
import { Dock, type DockItem } from './ui/Dock';
import { InstrumentsPanel } from './ui/InstrumentsPanel';
import { LogPanel } from './ui/LogPanel';
import { ResourcesHud } from './ui/ResourcesHud';
import { RitesPanel } from './ui/RitesPanel';
import { nextZone, ZonePanel, ZoneTeaser } from './ui/ShaftsPanel';
import { NurseryPanel } from './ui/Nursery';
import { Scenery } from './ui/Scenery';
import { DialPanel } from './ui/Dial';
import { ShopPanel, TvPanel } from './ui/TV';
import { KilnPanel, StationPanel } from './ui/SidePanels';
import { CitadelPanel, DreamEnginePanel, Omen } from './ui/CitadelPanel';
import { Snowfall } from './ui/Snowfall';
import { Sprite } from './ui/Sprite';
import { TOWER } from './ui/sprites';
import { Artwork } from './ui/Artwork';
import { SCENES } from './ui/scenes';
import { TopBar } from './ui/TopBar';
import { WarmFlake } from './ui/WarmFlake';
import { WeatherFx } from './ui/WeatherFx';
import { useView, type PanelId } from './ui/view';

const ZONE_X = [250, 690, 1130];

/*
 * The floor plan. The receiver (ash) is the middle of the room, with the dial and the rites under
 * it. Instruments and the kiln sit to its left; past them, by the relay mast, the back room and
 * the egg. The shafts open to the right, one box per zone, reading left to right and down.
 */
export function App() {
  useGame(st => st.rev);
  const game = useGame(st => st.game);
  const hidden = useView(st => st.hidden);
  const siren = game.siren.active;

  // The siren repaints the whole page, so it lives on <html> where the colour tokens are.
  useEffect(() => {
    document.documentElement.dataset.siren = siren ? 'on' : 'off';
  }, [siren]);

  const open = {
    shafts: zoneVisible(game, 0),
    rites: game.sirensSeen > 0,
    station: stationOpen(game),
    egg: game.nursery.found,
    kiln: kilnOpen(game),
    dial: dialOpen(game),
    citadel: game.citadel.awake,
  };
  const show = (id: PanelId) => !hidden[id] && (open[id as keyof typeof open] ?? true);

  const zoneCols: ReactNode[][] = [[], [], []];
  if (show('shafts')) {
    const next = nextZone(game);
    game.zones.forEach((_, i) => {
      if (zoneVisible(game, i)) zoneCols[i % 3].push(<ZonePanel key={i} i={i} />);
      else if (i === next) zoneCols[i % 3].push(<ZoneTeaser key={i} i={i} />);
    });
  }

  const columns: Column[] = [
    // Set dressing: the relay mast the station hangs from, and, once you are deep enough, someone else.
    { id: 'tower', x: -1560, y: 40, w: 180, decor: true, content: <Sprite rows={TOWER} px={10} className="decor-tower" /> },
    // Lull itself, past the last shaft: a dead town that gets more lit the deeper you go.
    { id: 'town', x: 1580, y: 60, w: 520, decor: true, content: <Scenery depth={game.zonesOpened} /> },
    // Two plates hung on the floor: the mast's keeper under the tower, and Lull from the road under the town.
    { id: 'keeper', x: -1620, y: 470, w: 300, decor: true, content: <Artwork scene={SCENES.keeper} ink="#7fd6c2" accent="#ff3030" caption='"The mast hears you back."' /> },
    { id: 'lull', x: 1640, y: 560, w: 440, decor: true, content: <Artwork scene={SCENES.lull} ink="#b9a8ff" accent="#ffcf6b" caption='"Lull was a town once. The lights still come on."' /> },
    { id: 'far', x: -1160, w: 420, content: <>{show('station') && <StationPanel />}{show('egg') && <NurseryPanel />}</> },
    { id: 'left', x: -700, w: 450, content: <>{show('instruments') && <InstrumentsPanel />}{show('kiln') && <KilnPanel />}</> },
    { id: 'center', x: -210, w: 420, content: <><AshPanel /><TvPanel /><ShopPanel />{show('dial') && <DialPanel />}{show('rites') && <RitesPanel />}</> },
    ...zoneCols.map((c, k) => ({ id: `zones${k}`, x: ZONE_X[k], w: 400, content: c.length ? c : null })),
    // Past Lull, once the gate is open: the Citadel, and the engine that keeps it from drinking everything.
    { id: 'citadel', x: 2180, w: 460, content: show('citadel') ? <><CitadelPanel /><DreamEnginePanel /></> : null },
  ];

  const dock: DockItem[] = [
    { id: 'instruments', label: 'Instruments' },
    { id: 'ash', label: 'Ash' },
    ...(['shafts', 'station', 'egg', 'kiln', 'dial', 'rites', 'citadel'] as const)
      .filter(id => open[id])
      .map(id => ({ id, label: { shafts: 'Shafts', station: 'Back room', egg: 'Nursery', kiln: 'Kiln', dial: 'Dial', rites: 'Rites', citadel: 'Citadel' }[id] })),
    { id: 'resources', label: 'Resources' },
    { id: 'log', label: 'Log' },
  ];

  const layoutKey = Object.values(open).join('-');

  return (
    <>
      <Snowfall />
      <WeatherFx />
      <div className="noise" aria-hidden="true" />
      <Board columns={columns} layoutKey={layoutKey} />
      <div className="crt" aria-hidden="true" />
      <TopBar />
      {!hidden.resources && <ResourcesHud />}
      {!hidden.log && <LogPanel />}
      <Dock items={dock} />
      <WarmFlake />
      <Omen />
      <AchievementToast />
    </>
  );
}
