// The television in the corner and the video shop down the road. Tapes are only for watching:
// nothing here touches ash or any other resource.
import type { GameState } from './state';

export interface TapeDef { id: string; title: string; blurb: string; cost: number; secret?: boolean }

export const TAPES: TapeDef[] = [
  { id: 'snow', title: 'Snow on Channel 0', blurb: 'Taped off the air. It is just the snow, falling on the snow.', cost: 2e3 },
  { id: 'lull', title: 'Lull After Dark', blurb: 'The town from the hill. One window goes out every minute.', cost: 4e4 },
  { id: 'numbers', title: 'Numbers', blurb: 'A countdown that has been running since before the tape was made.', cost: 1e6 },
  { id: 'stair', title: 'The Stair', blurb: 'Filmed walking down the Barker Spiral. Nobody filmed walking back up.', cost: 3e7 },
  { id: 'pool', title: 'Municipal Pool', blurb: 'Closed for the winter. The water is still moving.', cost: 1e9 },
  { id: 'siren', title: 'Siren Tower', blurb: 'Civil defence footage. The sound has been removed. You can hear it anyway.', cost: 5e10 },
  { id: 'corridor', title: 'Corridor B', blurb: 'One long take toward a door. The door gets no closer.', cost: 3e12 },
  { id: 'weather', title: 'Tomorrow’s Weather', blurb: 'A forecast for a day that has not happened. It is accurate.', cost: 2e14 },
  { id: 'moths', title: 'Moth Lamp', blurb: 'A porch light and everything that came to it.', cost: 2e16 },
  { id: 'fire', title: 'The Fire, Not Yet', blurb: 'The fire the ash comes from, burning backwards.', cost: 3e18 },
  { id: 'sun', title: 'Black Sun', blurb: 'An eclipse that lasted all of one winter.', cost: 5e20 },
  { id: 'bars', title: 'Test Card', blurb: 'Colour bars and a tone. Somewhere under the tone, a voice.', cost: 1e23 },
  { id: 'relay', title: '████ ███████', blurb: 'No label. On it, another station like this one. Someone is watching a television.', cost: 1e26, secret: true },
];

export const tvOpen = (s: GameState) => !!s.upgrades.floor;
export const ownsTape = (s: GameState, id: string) => s.tapes.includes(id);
/** The thirteenth tape only turns up on the shelf once you own the other twelve. */
export const tapeOnShelf = (s: GameState, t: TapeDef) => !t.secret || TAPES.every(o => o.secret || ownsTape(s, o.id));

export function buyTape(s: GameState, id: string): boolean {
  const t = TAPES.find(x => x.id === id);
  if (!t || !tvOpen(s) || ownsTape(s, id) || !tapeOnShelf(s, t) || s.ash.lt(t.cost)) return false;
  s.ash = s.ash.sub(t.cost);
  s.tapes.push(id);
  s.tv = id;
  return true;
}

/** Put a tape in, or take it out (null) and go back to static. */
export function playTape(s: GameState, id: string | null): boolean {
  if (id !== null && !ownsTape(s, id)) return false;
  s.tv = id;
  return true;
}
