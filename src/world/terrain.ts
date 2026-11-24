import type { GridPosition, GridSpec } from '../shared/types';

export type TerrainTile = 'meadow' | 'water' | 'bridge' | 'rock' | 'tree';

export interface TerrainProp {
  readonly tile: GridPosition;
  readonly kind: 'tree' | 'rock';
  readonly variant: number;
  readonly size: number;
}

export interface RiverSection {
  readonly left: number;
  readonly right: number;
}

export interface Terrain {
  readonly seed: number;
  readonly grid: GridSpec;
  readonly tiles: readonly TerrainTile[];
  readonly river: readonly RiverSection[];
  readonly bridges: readonly number[];
  readonly props: readonly TerrainProp[];
  readonly flowers: readonly GridPosition[];
  readonly blocked: readonly GridPosition[];
}

export function terrainAt(terrain: Terrain, { col, row }: GridPosition): TerrainTile | undefined {
  const { columns, rows } = terrain.grid;
  if (col < 0 || col >= columns || row < 0 || row >= rows) return undefined;
  return terrain.tiles[row * columns + col];
}

export function walkable(tile: TerrainTile | undefined): boolean {
  return tile === 'meadow' || tile === 'bridge';
}

function randomAt(seed: number, x: number, y: number): number {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const top = randomAt(seed, ix, iy) * (1 - u) + randomAt(seed, ix + 1, iy) * u;
  const bottom = randomAt(seed, ix, iy + 1) * (1 - u) + randomAt(seed, ix + 1, iy + 1) * u;
  return top * (1 - v) + bottom * v;
}

export function generateTerrain(grid: GridSpec, start: GridPosition, seed: number): Terrain {
  const { columns, rows } = grid;
  const tiles = Array<TerrainTile>(columns * rows).fill('meadow');
  const props: TerrainProp[] = [];
  const flowers: GridPosition[] = [];
  const blocked: GridPosition[] = [];
  const bridges = [Math.floor(rows * 0.24), start.row + 5, Math.floor(rows * 0.79)];
  const phase = randomAt(seed, 8, 5) * Math.PI * 2;
  const river: RiverSection[] = [];

  for (let row = 0; row < rows; row++) {
    const offset = row - start.row;
    const center = start.col - 14 + (Math.sin(offset / 10 + phase) - Math.sin(phase)) * 5
      + Math.sin(offset / 5) * 1.8;
    const width = 4.5 + noise(seed + 1, 0.4, row / 9) * 3;
    const left = Math.floor(center - width / 2);
    const right = Math.ceil(center + width / 2);
    river.push({ left, right });
    const bridge = bridges.some((startRow) => row === startRow || row === startRow + 1);
    const ridge = start.col + 23 + Math.sin(offset / 12 + phase) * 5;

    for (let col = 0; col < columns; col++) {
      const tile = { col, row };
      const index = row * columns + col;
      const detail = randomAt(seed, col, row);
      const clearing = Math.abs(col - start.col) < 9 && Math.abs(row - start.row) < 6;
      if (col >= left && col < right) {
        tiles[index] = bridge ? 'bridge' : 'water';
      } else if (!clearing && Math.abs(col - ridge) < 3 + noise(seed + 2, col / 7, row / 7) * 8
        && noise(seed + 3, col / 11, row / 10) > 0.29 && Math.abs(offset) > 2) {
        tiles[index] = 'rock';
        if (col % 3 === 0 && row % 3 === 0 && detail > 0.12) {
          props.push({ tile, kind: 'rock', variant: detail > 0.54 ? 0 : 1, size: 130 + detail * 63 });
        }
      } else if (!clearing && Math.min(Math.abs(col - left), Math.abs(col - right)) > 1
        && noise(seed + 4, col / 10, row / 10) > 0.43 && detail > 0.87) {
        tiles[index] = 'tree';
        props.push({ tile, kind: 'tree', variant: Math.floor(randomAt(seed + 5, col, row) * 4), size: 75 + (detail - 0.87) * 280 });
      } else if (!clearing && Math.abs(col - ridge) < 18 && detail < 0.013) {
        tiles[index] = 'rock';
        props.push({ tile, kind: 'rock', variant: detail > 0.006 ? 2 : 3, size: 47 + detail * 1700 });
      } else if (!clearing && detail > 0.988) {
        flowers.push(tile);
      }
      if (!walkable(tiles[index])) blocked.push(tile);
    }
  }

  // The starting meadow always supports a straight eastbound production line.
  for (const [dx, dy] of [[-3, -2], [-2, -2], [-1, -2], [-2, -1], [-3, -1]] as const) {
    flowers.push({ col: start.col + dx, row: start.row + dy });
  }
  return { seed, grid, tiles, river, bridges, props, flowers, blocked };
}
