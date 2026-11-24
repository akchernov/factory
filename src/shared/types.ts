export interface GridPosition {
  readonly col: number;
  readonly row: number;
}

export interface WorldPosition {
  readonly x: number;
  readonly y: number;
}

export interface GridSpec {
  readonly columns: number;
  readonly rows: number;
  readonly tileSizePx: number;
}

export type Direction = 'north' | 'east' | 'south' | 'west';
export type Resource = 'nectar' | 'comb' | 'honey' | 'jar';
export type BuildingKind = 'hive' | 'conveyor' | 'extractor' | 'packer' | 'market';
export type Inventory = Readonly<Record<Resource, number>>;

export interface BuildingSnapshot {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly tile: GridPosition;
  readonly facing: Direction;
  readonly inventory: Inventory;
}

export interface FactorySnapshot {
  readonly tick: number;
  readonly money: number;
  readonly inventory: Inventory;
  readonly buildings: readonly BuildingSnapshot[];
  readonly flowers: readonly GridPosition[];
}

export type FactoryCommand =
  | { readonly type: 'place'; readonly kind: BuildingKind; readonly tile: GridPosition; readonly facing: Direction }
  | { readonly type: 'remove'; readonly tile: GridPosition };

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'out-of-bounds' | 'occupied' | 'missing' | 'insufficient-funds' | 'not-implemented' };

export interface FactorySimulation {
  /** Advances exactly one fixed tick. */
  step(): void;
  dispatch(command: FactoryCommand): CommandResult;
  getSnapshot(): FactorySnapshot;
}
