import type { GridPosition, GridSpec, WorldPosition } from './types';

export function tileCenter(tile: GridPosition, grid: GridSpec): WorldPosition {
  return { x: (tile.col + 0.5) * grid.tileSizePx, y: (tile.row + 0.5) * grid.tileSizePx };
}

export function worldToTile(position: WorldPosition, grid: GridSpec): GridPosition {
  return { col: Math.floor(position.x / grid.tileSizePx), row: Math.floor(position.y / grid.tileSizePx) };
}

export function isInGrid(tile: GridPosition, grid: GridSpec): boolean {
  return Number.isInteger(tile.col) && Number.isInteger(tile.row)
    && tile.col >= 0 && tile.col < grid.columns
    && tile.row >= 0 && tile.row < grid.rows;
}
