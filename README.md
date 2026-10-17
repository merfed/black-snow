# Black Snow

A CCRU-flavored incremental game. One screen, no reloads.

## Run it

Needs Node 20.19+ (or 22.12+).

```
npm install
npm run dev      # play at http://localhost:5173
npm test         # engine tests
npm run build    # static site in dist/, host anywhere
npm run sim      # bots play 3 hours and print pacing
```

## Play it online

https://merfed.github.io/black-snow/ (deployed from `main` by `.github/workflows/deploy.yml`). The version and build time show on the Station page.

## Layout

- `src/game/data.ts`: zones, rites and every log line. Add content here.
- `src/game/engine.ts`: the rules. Pure functions that mutate a `GameState`; no React, timers or storage.
- `src/game/state.ts`: the save shape and `newGame()`.
- `src/game/save.ts`: localStorage save, export/import, migrations.
- `src/game/loop.ts`: fixed 20 Hz tick, autosave every 10 s, catch-up when the tab sleeps.
- `src/game/store.ts`: Zustand store that the UI reads.
- `src/game/systems.ts`, `genome.ts`, `wiring.ts`, `achievements.ts`: side systems, egg genetics, the Compiler board, achievements.
- `src/ui/`: one component per panel, plus the snowfall canvas.
- `fonts/`: Ivy Presto (display), TT Interphases (body), PP Fraktion Mono (numbers, buttons), KH Interference (log), GROUT (title). Ivy, PP, TT and KH need web licenses before a public release; the MEK fonts are CC0.

## Debugging

Erase your save from the Station menu, or run `localStorage.removeItem('black-snow-save')` in the console.
