import { FLOWER_IDS, MAP_H, MAP_W, type FlowerId } from './data';
import { fbm, hash2 } from './rng';

export const enum Terrain { Grass = 0, Water = 1, Tree = 2, Rock = 3 }

export interface MapData {
  readonly w: number;
  readonly h: number;
  /** Terrain per tile, row-major. */
  readonly terrain: number[];
  /** Flower index into FLOWER_IDS per tile, -1 = none. */
  readonly flower: number[];
  /** Decoration variant per tile (for trees/rocks/flowers art). */
  readonly variant: number[];
  readonly start: { x: number; y: number };
}

const F = (id: FlowerId) => FLOWER_IDS.indexOf(id);

/**
 * Hand-tuned procedural meadow: start clearing in the middle, clover/buckwheat close,
 * lavender east, sunflower south, heather north, linden groves at forest edges, lakes.
 * Rare flowers sit far away to push expansion (like ore patches in Factorio).
 */
export function generateMap(seed: number): MapData {
  const w = MAP_W;
  const h = MAP_H;
  const terrain = new Array<number>(w * h).fill(Terrain.Grass);
  const flower = new Array<number>(w * h).fill(-1);
  const variant = new Array<number>(w * h).fill(0);
  const sx = Math.floor(w / 2);
  const sy = Math.floor(h / 2);

  const fields: { id: FlowerId; x: number; y: number; r: number }[] = [
    { id: 'clover', x: sx - 7, y: sy - 4, r: 5.5 },
    { id: 'clover', x: sx + 6, y: sy + 5, r: 4.5 },
    { id: 'buckwheat', x: sx + 9, y: sy - 7, r: 5 },
    { id: 'buckwheat', x: sx - 13, y: sy + 8, r: 5 },
    { id: 'clover', x: sx - 2, y: sy + 11, r: 4 },
    { id: 'lavender', x: sx + 27, y: sy - 2, r: 7 },
    { id: 'lavender', x: sx + 33, y: sy + 13, r: 5 },
    { id: 'sunflower', x: sx - 6, y: sy + 22, r: 6.5 },
    { id: 'sunflower', x: sx + 16, y: sy + 21, r: 5 },
    { id: 'heather', x: sx - 4, y: sy - 23, r: 6.5 },
    { id: 'heather', x: sx - 29, y: sy - 16, r: 6 },
    { id: 'buckwheat', x: sx - 30, y: sy + 4, r: 6 },
    { id: 'clover', x: sx + 20, y: sy - 18, r: 5 },
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      variant[i] = Math.floor(hash2(x, y, seed + 99) * 1000);
      const dStart = Math.hypot(x - sx, y - sy);
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);

      // Lakes
      const lake = fbm(x, y, 14, seed + 1);
      if (dStart > 12 && lake > 0.72) { terrain[i] = Terrain.Water; continue; }

      // Forest belts + dense edge forest
      const forest = fbm(x, y, 11, seed + 2);
      const edgeForest = edge < 3 ? 1 : edge < 6 ? 0.25 : 0;
      if (dStart > 10 && (forest > 0.68 || hash2(x, y, seed + 3) < edgeForest)) {
        terrain[i] = Terrain.Tree;
        // Linden at forest edges: tree that also feeds bees.
        if (forest < 0.72 && hash2(x, y, seed + 4) < 0.35) flower[i] = F('linden');
        continue;
      }
      if (dStart > 6 && hash2(x, y, seed + 5) < 0.012) { terrain[i] = Terrain.Rock; continue; }
      if (dStart > 6 && hash2(x, y, seed + 6) < 0.008) { terrain[i] = Terrain.Tree; continue; }

      for (const f of fields) {
        const n = fbm(x, y, 4, seed + 10 + f.x) * 0.9;
        if (Math.hypot(x - f.x, y - f.y) < f.r * (0.55 + n)) {
          flower[i] = F(f.id);
          break;
        }
      }
    }
  }
  // Keep the start clearing free of obstacles (but keep its flowers).
  for (let y = sy - 3; y <= sy + 3; y++) for (let x = sx - 3; x <= sx + 3; x++) {
    terrain[y * w + x] = Terrain.Grass;
    flower[y * w + x] = -1;
  }
  return { w, h, terrain, flower, variant, start: { x: sx, y: sy } };
}
