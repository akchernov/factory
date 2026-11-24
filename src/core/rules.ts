import type { BuildingKind, Resource } from '../shared/types';

/** Production recipe of a machine. Durations are in whole ticks (1 tick = 100 ms). */
export interface Recipe {
  readonly input: Resource;
  readonly inputAmount: number;
  readonly output: Resource;
  readonly outputAmount: number;
  readonly ticks: number;
}

/**
 * All balance numbers used by the simulation.
 * Gameplay may pass its own values: createSimulation(grid, { ...DEFAULT_RULES, ...overrides }).
 */
export interface CoreRules {
  /** Price of each building in coins. */
  readonly costs: Readonly<Record<BuildingKind, number>>;
  /** Share of the price returned on removal, 0..1. */
  readonly refundRate: number;
  /** Max amount of one resource inside a building buffer. */
  readonly bufferCap: number;
  readonly hive: {
    /** Chebyshev radius to look for flowers (1 = 8 neighbours). */
    readonly flowerRadius: number;
    /** Every N ticks a hive gets 1 nectar per flower in radius. */
    readonly ticksPerHarvest: number;
    /** Nectar needed for one comb. */
    readonly nectarPerComb: number;
  };
  /** Ticks for one item to travel across one conveyor tile. */
  readonly conveyorTicks: number;
  readonly recipes: {
    readonly extractor: Recipe;
    readonly packer: Recipe;
  };
  /** Coins for one jar accepted by the market. */
  readonly jarPrice: number;
}

export const DEFAULT_RULES: CoreRules = {
  costs: { hive: 20, conveyor: 1, extractor: 25, packer: 25, market: 15 },
  refundRate: 1,
  bufferCap: 10,
  hive: { flowerRadius: 2, ticksPerHarvest: 10, nectarPerComb: 3 },
  conveyorTicks: 4,
  recipes: {
    extractor: { input: 'comb', inputAmount: 1, output: 'honey', outputAmount: 1, ticks: 15 },
    packer: { input: 'honey', inputAmount: 2, output: 'jar', outputAmount: 1, ticks: 20 },
  },
  jarPrice: 12,
};
