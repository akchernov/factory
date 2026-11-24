import { BUILDINGS, type BuildingId } from '../core/data';
import { Terrain } from '../core/map';
import type { Dir, Game } from '../core/sim';

/** One "place this here" hint for the tutorial quests. */
export interface GuideStep {
  type: BuildingId;
  x: number;
  y: number;
  dir: Dir;
  label: string;
  /** Building of the right type is there but needs rotating. */
  rotate?: boolean;
}

type PlanItem = { type: BuildingId; dx: number; dy: number; dir: Dir; label: string };

/** Starter line layout relative to the hive, per direction (0 east, 1 south, 2 west, 3 north). */
function layout(d: Dir): PlanItem[] {
  const L: [BuildingId, number, string][] = [
    ['belt', 2, 'Конвейер от улья'], ['extractor', 3, 'Медогонка'], ['belt', 5, 'Конвейер'],
    ['packer', 6, 'Фасовка'], ['belt', 8, 'Конвейер'], ['market', 9, 'Рынок'],
  ];
  return L.map(([type, off, label]) => {
    const size = BUILDINGS[type].size;
    // East/south: offset counts from the hive's left/top edge. West/north: mirror it and shift by the item size.
    const o = d === 2 || d === 3 ? -(off - 2) - size : off;
    return { type, dx: d === 0 || d === 2 ? o : 0, dy: d === 1 || d === 3 ? o : 0, dir: d, label };
  });
}

function free(g: Game, x: number, y: number, size: number, allow?: BuildingId) {
  for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) {
    if (!g.inBounds(tx, ty) || g.map.terrain[g.idx(tx, ty)] !== Terrain.Grass || g.nestAt(tx, ty)) return false;
    const b = g.at(tx, ty);
    if (b && b.type !== allow) return false;
  }
  return true;
}

let cache: { hiveId: number; dir: Dir } | null = null;
let hiveSpot: { seed: number; x: number; y: number } | null = null;

function planFits(g: Game, hx: number, hy: number, d: Dir) {
  return layout(d).every((p) => free(g, hx + p.dx, hy + p.dy, BUILDINGS[p.type].size, p.type));
}

function bestHiveSpot(g: Game) {
  if (hiveSpot && hiveSpot.seed === g.state.seed && free(g, hiveSpot.x, hiveSpot.y, 2)) return hiveSpot;
  const s = g.map.start;
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = s.y - 12; y <= s.y + 12; y++) for (let x = s.x - 14; x <= s.x + 12; x++) {
    if (!free(g, x, y, 2)) continue;
    if (!([0, 1, 2, 3] as Dir[]).some((d) => planFits(g, x, y, d))) continue;
    const rate = g.estimateHive(x, y, 'forest');
    const score = rate - Math.hypot(x - s.x, y - s.y) * 0.015;
    if (!best || score > best.score) best = { x, y, score };
  }
  hiveSpot = best ? { seed: g.state.seed, x: best.x, y: best.y } : null;
  return hiveSpot;
}

/** Next hint for the first three quests, or null when the tutorial is over or can't be planned. */
export function guideStep(g: Game): GuideStep | null {
  const q = g.state.quest;
  if (q > 2) return null;
  const hive = g.state.buildings.find((b) => b.type === 'hive');
  if (!hive) {
    const spot = bestHiveSpot(g);
    return spot ? { type: 'hive', x: spot.x, y: spot.y, dir: 0, label: 'Улей сюда: тут много цветов' } : null;
  }
  if (!cache || cache.hiveId !== hive.id || !planFits(g, hive.x, hive.y, cache.dir)) {
    const d = ([0, 1, 2, 3] as Dir[]).find((dd) => planFits(g, hive.x, hive.y, dd));
    if (d === undefined) return null;
    cache = { hiveId: hive.id, dir: d };
  }
  const plan = layout(cache.dir);
  // Quest 1 needs only belt + extractor; quest 2 the rest.
  const steps = q === 0 || q === 1 ? plan.slice(0, 2) : plan;
  for (const p of steps) {
    const x = hive.x + p.dx;
    const y = hive.y + p.dy;
    const b = g.at(x, y);
    if (!b || b.type !== p.type) return { type: p.type, x, y, dir: p.dir, label: p.label };
    if (p.type === 'belt' && b.dir !== p.dir) return { type: p.type, x, y, dir: p.dir, label: 'Поверни конвейер (R)', rotate: true };
  }
  return null;
}
