import type { GridPosition, GridSpec } from '../shared/types';

export const WORLD_GRID: GridSpec = { columns: 112, rows: 80, tileSizePx: 32 };
export const START_TILE: GridPosition = { col: 55, row: 39 };
export const PLAYER_SPEED_PX_PER_SECOND = 180;
export const TICK_MS = 100;
export const MAX_FRAME_DELTA_MS = 250;
export const STARTING_MONEY = 100;
