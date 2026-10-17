import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Decimal from 'break_eternity.js';
import { ACHIEVEMENTS, achievementCount, type AchCategory, type AchDef } from '../game/achievements';
import { ZONES } from '../game/data';
import { devUnlockAll, type DevResource } from '../game/engine';
import { fmt } from '../game/format';
import { useGame, devValue } from '../game/store';
import { RARITIES } from '../game/systems';
import { SYSTEM_COLORS, ZONE_COLORS } from './colors';
import { Sprite } from './Sprite';
import { EGG_SPRITES, FIXTURE_SPRITES, FLAKE, RARE_FLAKES, WEATHER_SPRITES, ZONE_ICONS } from './sprites';
import { clock } from './TopBar';

export const VERSION = __APP_VERSION__;
export const BUILD = __APP_BUILD__;

const CAT: Record<AchCategory, { color: string; icon: string[] }> = {
  ash: { color: SYSTEM_COLORS.ash, icon: FLAKE },
  shafts: { color: ZONE_COLORS[0], icon: ZONE_ICONS[0] },
  flakes: { color: SYSTEM_COLORS.embers, icon: RARE_FLAKES[1] },
  sirens: { color: SYSTEM_COLORS.rust, icon: WEATHER_SPRITES.thunder },
  nursery: { color: SYSTEM_COLORS.nursery, icon: EGG_SPRITES[0] },
  rooms: { color: SYSTEM_COLORS.comfort, icon: FIXTURE_SPRITES.kettle },
  board: { color: ZONE_COLORS[6], icon: ZONE_ICONS[6] },
  secret: { color: '#ff2a2a', icon: RARE_FLAKES[3] },
};

function Achievements() {
  const game = useGame(st => st.game);
  const [focus, setFocus] = useState<AchDef | null>(null);
  const got = achievementCount(game);
  const shown = focus ?? ACHIEVEMENTS.find(a => game.achievements[a.id] === undefined && !a.secret) ?? ACHIEVEMENTS[0];
  const earned = game.achievements[shown.id];
  const hiddenNow = shown.secret && earned === undefined;
  return (
    <div className="dialog-section ach">
      <h3>Achievements <span className="ach-count">{got} / {ACHIEVEMENTS.length} · all ash +{got}%</span></h3>
      <div className="ach-grid" onMouseLeave={() => setFocus(null)}>
        {ACHIEVEMENTS.map(a => {
          const on = game.achievements[a.id] !== undefined;
          const c = CAT[a.cat];
          return (
            <button key={a.id} className={`ach-tile ${on ? 'on' : ''} ${focus?.id === a.id ? 'focus' : ''}`} style={{ '--ac': c.color } as CSSProperties}
              onMouseEnter={() => setFocus(a)} onFocus={() => setFocus(a)} onClick={() => setFocus(a)}
              aria-label={on || !a.secret ? `${a.name}: ${a.desc}` : 'Secret achievement'}>
              {on || !a.secret ? <Sprite rows={c.icon} px={2} /> : <span className="ach-q">?</span>}
            </button>
          );
        })}
      </div>
      <div className="ach-detail" style={{ '--ac': CAT[shown.cat].color } as CSSProperties}>
        <b>{hiddenNow ? 'Secret' : shown.name}</b>
        <span>{hiddenNow ? 'Keep working the night shift.' : shown.desc}</span>
        <small>{earned !== undefined ? `Recorded at ${clock(earned)} on shift` : 'Not yet'}</small>
      </div>
    </div>
  );
}

function Stats() {
  const game = useGame(st => st.game);
  const s = game.stats;
  const rows: [string, ReactNode][] = [
    ['Night shift', clock(game.playTime)],
    ['Ash caught, all time', fmt(game.lifetimeAsh)],
    ['Ash this run', fmt(game.ashThisRun)],
    ['Best ash per second', fmt(new Decimal(s.bestAps))],
    ['Listens', fmt(s.listens)],
    ['Shafts dug', fmt(game.shaftsDug)],
    ['Deepest zone', game.zonesOpened ? `${game.zonesOpened} · ${ZONES[game.zonesOpened - 1].name}` : 'none'],
    ['Zone upgrade levels', fmt(Object.values(game.zoneUps).reduce((n, v) => n + v, 0))],
    ['Sirens survived', fmt(game.sirensSeen)],
    ['Rust gathered', fmt(s.rustTotal)],
    ['Warm flakes missed', fmt(s.missed)],
    ['Eggs hatched', fmt(s.hatched)],
    ['Creatures bred', fmt(s.bred)],
    ['Species recorded', fmt(game.nursery.seen.length)],
  ];
  return (
    <div className="dialog-section">
      <h3>Records</h3>
      <dl className="stat-list">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h3>Warm flakes caught</h3>
      <div className="flake-tally">
        {RARITIES.map((r, i) => (
          <span key={r.name} className={s.flakes[i] ? 'seen' : ''} style={{ '--rc': r.color } as CSSProperties} title={i ? `${r.name}: about 1 in ${Math.round(1 / r.chance)} flakes, worth x${r.mult}` : 'Warm: the common orange flake'}>
            <i />{s.flakes[i] || i === 0 ? r.name : '???'} <b>{fmt(s.flakes[i] ?? 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The station page: records, achievements, the save and the dev tools, all on one wide sheet so
 * it never needs to scroll.
 */
export function StationDialog({ onClose }: { onClose: () => void }) {
  const { save, exportSave, importSave, hardReset } = useGame.getState();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');

  return createPortal(
    <div className="dialog-backdrop station-backdrop" onClick={onClose}>
      <div className="dialog station-sheet panel framed" role="dialog" aria-label="Station" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Station 04 <span className="h2-note">Lull relay, buried</span></h2>
          <span className="version" title={`Built ${BUILD}`}>v{VERSION} · {BUILD}</span>
          <button className="secondary close" onClick={onClose} aria-label="Close">x</button>
        </div>
        <div className="station-cols">
          <Stats />
          <Achievements />
          <div className="station-side">
            <div className="dialog-section">
              <h3>Save</h3>
              <p className="dim">The station writes itself down every 10 seconds and when you leave.</p>
              <div className="row">
                <button onClick={() => { save(); setNote('SAVED.'); }}>Save now</button>
                <button onClick={() => { setText(exportSave()); setNote('COPY THIS SOMEWHERE SAFE.'); }}>Export</button>
                <button onClick={() => setNote(importSave(text) ? 'LOADED.' : 'THAT IS NOT A SAVE. OR IT IS NOT YOURS.')}>Import</button>
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Exported saves appear here. Paste one to import." rows={3} />
              {note && <p className="note">&gt; {note}</p>}
            </div>
            <DevTools />
            <div className="dialog-section danger-zone">
              <h3>Erase</h3>
              <p className="dim">Wipes every record. The station will forget you. It will pretend to.</p>
              <button className="danger" onClick={() => {
                if (confirm('Erase everything? This cannot be undone.')) { hardReset(); onClose(); }
              }}>Erase save</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Only the SHA-256 of the dev password ships, not the password itself. It still runs in the
// browser, so it keeps out casual players, not anyone determined.
const DEV_HASH = '71675babe2b3cf2bb0f749fba8cd796854d7e5cb2c4374b5336e2e9175b273c6';
const DEV_KEY = 'black-snow-dev';

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function readUnlocked() {
  try { return sessionStorage.getItem(DEV_KEY) === '1'; } catch { return false; }
}

const DEV_RESOURCES: [DevResource, string][] = [
  ['ash', 'Ash'], ['rust', 'Rust'], ['embers', 'Embers'], ['echoes', 'Echoes'],
  ...ZONES.map((z, i) => [`zone${i + 1}`, `${z.name}s`] as [DevResource, string]),
];

function DevTools() {
  const game = useGame(st => st.game);
  const devSet = useGame(st => st.devSet);
  const [unlocked, setUnlocked] = useState(readUnlocked);
  const [pass, setPass] = useState('');
  const [res, setRes] = useState<DevResource>('ash');
  const [amount, setAmount] = useState('1000');
  const [note, setNote] = useState('');

  const unlock = async () => {
    if (!crypto.subtle) { setNote('This page needs https or localhost to check the password.'); return; }
    if (await sha256(pass) !== DEV_HASH) { setNote('WRONG.'); return; }
    setUnlocked(true);
    setPass('');
    setNote('');
    try { sessionStorage.setItem(DEV_KEY, '1'); } catch { /* unlock just lasts until the dialog closes */ }
  };

  const apply = (mode: 'set' | 'add') => {
    const ok = devSet(res, amount, mode);
    const label = DEV_RESOURCES.find(r => r[0] === res)![1];
    setNote(ok ? `${label.toUpperCase()} NOW ${fmt(devValue(useGame.getState().game, res))}.` : 'Type a number, like 5000, -200 or 1e12. Amounts cannot go below zero.');
  };

  return (
    <details className="dialog-section dev-tools">
      <summary>Dev tools</summary>
      {!unlocked ? (
        <form className="row" onSubmit={e => { e.preventDefault(); unlock(); }}>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" autoComplete="off" />
          <button type="submit">Unlock</button>
        </form>
      ) : (
        <>
          <div className="row">
            <select value={res} onChange={e => setRes(e.target.value as DevResource)}>
              {DEV_RESOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <span className="dim">now {fmt(devValue(game, res))}</span>
          </div>
          <form className="row" onSubmit={e => { e.preventDefault(); apply('add'); }}>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount, e.g. 1e9" inputMode="decimal" />
            <button type="submit">Add</button>
            <button type="button" onClick={() => apply('set')}>Set to</button>
          </form>
          <p className="dim">Comfort comes from the back room, so build fixtures to change it.</p>
          <div className="row">
            <button type="button" onClick={() => {
              if (!confirm('Open every system and top up every resource? This changes your save for good.')) return;
              useGame.getState().run(devUnlockAll);
              setNote('EVERYTHING IS OPEN. THE CITADEL IS AWAKE.');
            }}>Unlock everything</button>
          </div>
        </>
      )}
      {note && <p className="note">&gt; {note}</p>}
    </details>
  );
}
