import { STARTING_MONEY } from '../config/game';
import { isInGrid } from '../shared/grid';
import type { FactorySimulation, FactorySnapshot, GridSpec } from '../shared/types';

export function createSimulation(grid: GridSpec): FactorySimulation {
  let snapshot: FactorySnapshot = {
    tick: 0,
    money: STARTING_MONEY,
    inventory: { nectar: 0, comb: 0, honey: 0, jar: 0 },
    buildings: [],
    flowers: [{ col: 4, row: 3 }, { col: 5, row: 3 }, { col: 5, row: 4 }].filter(
      (tile) => isInGrid(tile, grid),
    ),
  };

  return {
    step() {
      snapshot = { ...snapshot, tick: snapshot.tick + 1 };
    },
    dispatch(command) {
      if (!isInGrid(command.tile, grid)) return { ok: false, reason: 'out-of-bounds' };
      return { ok: false, reason: 'not-implemented' };
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
