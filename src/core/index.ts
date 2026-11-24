import { STARTING_MONEY } from '../config/game';
import { isInGrid } from '../shared/grid';
import type {
  BuildingKind,
  BuildingSnapshot,
  CommandResult,
  Direction,
  FactoryCommand,
  FactorySimulation,
  FactorySnapshot,
  GridPosition,
  GridSpec,
  Inventory,
  Resource,
} from '../shared/types';
import { DEFAULT_RULES, type CoreRules, type Recipe } from './rules';

export { DEFAULT_RULES } from './rules';
export type { CoreRules, Recipe } from './rules';

const RESOURCES: readonly Resource[] = ['nectar', 'comb', 'honey', 'jar'];
const OFFSETS: Readonly<Record<Direction, GridPosition>> = {
  north: { col: 0, row: -1 },
  east: { col: 1, row: 0 },
  south: { col: 0, row: 1 },
  west: { col: -1, row: 0 },
};

export const STARTER_FLOWERS: readonly GridPosition[] = [
  { col: 4, row: 3 }, { col: 5, row: 3 }, { col: 5, row: 4 },
];

type MutableInventory = Record<Resource, number>;

interface Building {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly tile: GridPosition;
  facing: Direction;
  readonly inventory: MutableInventory;
  /** Ticks spent on the current job: harvest timer, recipe or belt travel. */
  progress: number;
  /** Tick when an item entered this conveyor; an item moves at most one tile per tick. */
  receivedAt: number;
}

function emptyInventory(): MutableInventory {
  return { nectar: 0, comb: 0, honey: 0, jar: 0 };
}

function total(inventory: Inventory): number {
  return RESOURCES.reduce((sum, r) => sum + inventory[r], 0);
}

function key(tile: GridPosition): string {
  return `${tile.col},${tile.row}`;
}

function front(building: Building): GridPosition {
  const o = OFFSETS[building.facing];
  return { col: building.tile.col + o.col, row: building.tile.row + o.row };
}

function sameTile(a: GridPosition, b: GridPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

function byReadingOrder(a: Building, b: Building): number {
  return a.tile.row - b.tile.row || a.tile.col - b.tile.col;
}

/**
 * Factory simulation. Pure TS, no Phaser/DOM, deterministic.
 * Flow: hive -> (front tile) conveyor... -> extractor -> conveyor... -> packer -> conveyor... -> market.
 * Every building outputs only to the tile it faces. Machines and the market accept input from any side.
 */
export function createSimulation(
  grid: GridSpec,
  rules: CoreRules = DEFAULT_RULES,
  flowers: readonly GridPosition[] = STARTER_FLOWERS,
  blockedTiles: readonly GridPosition[] = [],
): FactorySimulation {
  const flowerTiles = Object.freeze(flowers.filter((tile) => isInGrid(tile, grid)));
  const flowerKeys = new Set(flowerTiles.map(key));
  const blockedKeys = new Set(blockedTiles.map(key));
  const byTile = new Map<string, Building>();
  const player = emptyInventory();
  let money = STARTING_MONEY;
  let tick = 0;
  let nextId = 1;
  let snapshot = makeSnapshot();

  function makeSnapshot(): FactorySnapshot {
    const buildings: BuildingSnapshot[] = [...byTile.values()].sort(byReadingOrder).map((b) => Object.freeze({
      id: b.id,
      kind: b.kind,
      tile: b.tile,
      facing: b.facing,
      inventory: Object.freeze({ ...b.inventory }),
    }));
    return Object.freeze({
      tick,
      money,
      inventory: Object.freeze({ ...player }),
      buildings: Object.freeze(buildings),
      flowers: flowerTiles,
    });
  }

  function flowersAround(tile: GridPosition): number {
    const r = rules.hive.flowerRadius;
    let count = 0;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (flowerKeys.has(key({ col: tile.col + dc, row: tile.row + dr }))) count++;
      }
    }
    return count;
  }

  function recipeOf(kind: BuildingKind): Recipe | undefined {
    if (kind === 'extractor') return rules.recipes.extractor;
    if (kind === 'packer') return rules.recipes.packer;
    return undefined;
  }

  /** Can `target` take one `resource` coming from tile `from`? */
  function accepts(target: Building, resource: Resource, from: GridPosition): boolean {
    switch (target.kind) {
      case 'conveyor':
        // One item per belt tile; a belt never takes items from the tile it points to.
        return total(target.inventory) === 0 && !sameTile(front(target), from);
      case 'extractor':
      case 'packer': {
        const recipe = recipeOf(target.kind)!;
        return resource === recipe.input && target.inventory[resource] < rules.bufferCap;
      }
      case 'market':
        return resource === 'jar';
      case 'hive':
        return false;
    }
  }

  function deliver(target: Building, resource: Resource) {
    if (target.kind === 'market') {
      money += rules.jarPrice;
      return;
    }
    target.inventory[resource] += 1;
    if (target.kind === 'conveyor') {
      target.progress = 0;
      target.receivedAt = tick;
    }
  }

  /** Move one `resource` from `source` into the tile it faces. */
  function pushForward(source: Building, resource: Resource): boolean {
    if (source.inventory[resource] <= 0) return false;
    const target = byTile.get(key(front(source)));
    if (!target || !accepts(target, resource, source.tile)) return false;
    source.inventory[resource] -= 1;
    deliver(target, resource);
    return true;
  }

  function stepHive(hive: Building) {
    hive.progress += 1;
    if (hive.progress >= rules.hive.ticksPerHarvest) {
      hive.progress = 0;
      const room = Math.max(0, rules.bufferCap - hive.inventory.nectar);
      hive.inventory.nectar += Math.min(room, flowersAround(hive.tile));
    }
    while (hive.inventory.nectar >= rules.hive.nectarPerComb && hive.inventory.comb < rules.bufferCap) {
      hive.inventory.nectar -= rules.hive.nectarPerComb;
      hive.inventory.comb += 1;
    }
    pushForward(hive, 'comb');
  }

  function stepMachine(machine: Building, recipe: Recipe) {
    const inv = machine.inventory;
    const outputFull = inv[recipe.output] + recipe.outputAmount > rules.bufferCap;
    if (inv[recipe.input] >= recipe.inputAmount && !outputFull) {
      machine.progress += 1;
      if (machine.progress >= recipe.ticks) {
        machine.progress = 0;
        inv[recipe.input] -= recipe.inputAmount;
        inv[recipe.output] += recipe.outputAmount;
      }
    } else {
      machine.progress = 0;
    }
    pushForward(machine, recipe.output);
  }

  function stepConveyor(belt: Building) {
    const item = RESOURCES.find((r) => belt.inventory[r] > 0);
    if (!item || belt.receivedAt === tick) return;
    if (belt.progress < rules.conveyorTicks) belt.progress += 1;
    if (belt.progress >= rules.conveyorTicks) pushForward(belt, item);
  }

  function place(kind: BuildingKind, tile: GridPosition, facing: Direction): CommandResult {
    if (byTile.has(key(tile)) || flowerKeys.has(key(tile))) return { ok: false, reason: 'occupied' };
    if (blockedKeys.has(key(tile))) return { ok: false, reason: 'blocked-terrain' };
    const cost = rules.costs[kind];
    if (money < cost) return { ok: false, reason: 'insufficient-funds' };
    money -= cost;
    byTile.set(key(tile), {
      id: `b${nextId++}`,
      kind,
      tile: { col: tile.col, row: tile.row },
      facing,
      inventory: emptyInventory(),
      progress: 0,
      receivedAt: -1,
    });
    return { ok: true };
  }

  function remove(tile: GridPosition): CommandResult {
    const building = byTile.get(key(tile));
    if (!building) return { ok: false, reason: 'missing' };
    byTile.delete(key(tile));
    money += Math.floor(rules.costs[building.kind] * rules.refundRate);
    // Like Factorio: contents of a removed building go to the player's inventory.
    for (const r of RESOURCES) player[r] += building.inventory[r];
    return { ok: true };
  }

  function rotate(tile: GridPosition, facing: Direction): CommandResult {
    const building = byTile.get(key(tile));
    if (!building) return { ok: false, reason: 'missing' };
    building.facing = facing;
    return { ok: true };
  }

  return {
    step() {
      tick += 1;
      for (const b of [...byTile.values()].sort(byReadingOrder)) {
        if (b.kind === 'hive') stepHive(b);
        else if (b.kind === 'conveyor') stepConveyor(b);
        else {
          const recipe = recipeOf(b.kind);
          if (recipe) stepMachine(b, recipe);
        }
      }
      snapshot = makeSnapshot();
    },
    dispatch(command: FactoryCommand): CommandResult {
      if (!isInGrid(command.tile, grid)) return { ok: false, reason: 'out-of-bounds' };
      let result: CommandResult;
      switch (command.type) {
        case 'place': result = place(command.kind, command.tile, command.facing); break;
        case 'rotate': result = rotate(command.tile, command.facing); break;
        case 'remove': result = remove(command.tile); break;
      }
      if (result.ok) snapshot = makeSnapshot();
      return result;
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
