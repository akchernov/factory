import type { BuildingId, SpeciesId } from '../core/data';
import { Game, newGame, type Dir, type GameEvent, type GameState } from '../core/sim';

const SAVE_KEY = 'beefactory_save_v3';

export type UiEvent =
  | { t: 'toast'; text: string; kind?: 'error' | 'info' | 'good' }
  | { t: 'select'; id: number | null }
  | { t: 'tool'; tool: BuildingId | null }
  | { t: 'open'; panel: 'tech' | 'bees' | null };

type Listener = (e: GameEvent | UiEvent) => void;

/** Shared state between the Phaser scene and the DOM UI. */
export const ctl = {
  game: new Game(newGame()),
  tool: null as BuildingId | null,
  dir: 0 as Dir,
  selected: null as number | null,
  hiveSpecies: null as SpeciesId | null,
  speed: 1,
  paused: false,
  started: false,
  hover: null as { x: number; y: number } | null,
  /** Building the tutorial wants placed next (hotbar highlights it). */
  guideType: null as BuildingId | null,
  listeners: [] as Listener[],

  on(fn: Listener) { this.listeners.push(fn); },
  emit(e: GameEvent | UiEvent) { for (const l of this.listeners) l(e); },

  setTool(tool: BuildingId | null) {
    this.tool = tool;
    if (tool) this.select(null);
    this.emit({ t: 'tool', tool });
  },
  select(id: number | null) {
    this.selected = id;
    this.emit({ t: 'select', id });
  },
  toast(text: string, kind: 'error' | 'info' | 'good' = 'info') { this.emit({ t: 'toast', text, kind }); },

  hasSave() { return !!localStorage.getItem(SAVE_KEY); },
  save() {
    if (!this.started) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.state)); } catch { /* quota or private mode */ }
  },
  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const st = JSON.parse(raw) as GameState;
      if (st.version !== 3) return false;
      this.game = new Game(st);
      return true;
    } catch {
      return false;
    }
  },
  reset(peaceful = false, seed = Math.floor(Math.random() * 1e9)) {
    this.game = new Game(newGame(seed, peaceful));
    this.selected = null;
    this.tool = null;
  },
};

declare global {
  interface Window { __bf: typeof ctl }
}
window.__bf = ctl;
