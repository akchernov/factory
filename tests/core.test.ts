import assert from 'node:assert/strict';
import { test } from 'node:test';
import { START_TILE, WORLD_GRID } from '../src/config/game';
import { DEFAULT_RULES, createSimulation } from '../src/core';
import type { BuildingKind, Direction, GridPosition } from '../src/shared/types';
import { generateTerrain, terrainAt, walkable } from '../src/world/terrain';

const GRID = { columns: 24, rows: 15, tileSizePx: 32 };
const FLOWERS: GridPosition[] = [{ col: 1, row: 0 }, { col: 1, row: 2 }, { col: 0, row: 0 }];

function place(sim: ReturnType<typeof createSimulation>, kind: BuildingKind, col: number, row: number, facing: Direction = 'east') {
  const r = sim.dispatch({ type: 'place', kind, tile: { col, row }, facing });
  assert.equal(r.ok, true, `place ${kind} at ${col},${row}: ${JSON.stringify(r)}`);
}

/** Hive at (1,1) next to 3 flowers, a straight belt line to the east with machines on it. */
function buildLine() {
  const sim = createSimulation(GRID, { ...DEFAULT_RULES, costs: { hive: 0, conveyor: 0, extractor: 0, packer: 0, market: 0 } }, FLOWERS);
  place(sim, 'hive', 1, 1);
  place(sim, 'conveyor', 2, 1);
  place(sim, 'conveyor', 3, 1);
  place(sim, 'extractor', 4, 1);
  place(sim, 'conveyor', 5, 1);
  place(sim, 'packer', 6, 1);
  place(sim, 'conveyor', 7, 1);
  place(sim, 'market', 8, 1);
  return sim;
}

test('placement rules: bounds, occupied, flowers, funds, refund', () => {
  const sim = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  const start = sim.getSnapshot().money;
  assert.deepEqual(sim.dispatch({ type: 'place', kind: 'hive', tile: { col: -1, row: 0 }, facing: 'east' }), { ok: false, reason: 'out-of-bounds' });
  assert.deepEqual(sim.dispatch({ type: 'place', kind: 'hive', tile: { col: 1, row: 0 }, facing: 'east' }), { ok: false, reason: 'occupied' });
  place(sim, 'hive', 5, 5);
  assert.equal(sim.getSnapshot().money, start - DEFAULT_RULES.costs.hive);
  assert.deepEqual(sim.dispatch({ type: 'place', kind: 'conveyor', tile: { col: 5, row: 5 }, facing: 'east' }), { ok: false, reason: 'occupied' });
  assert.deepEqual(sim.dispatch({ type: 'remove', tile: { col: 9, row: 9 } }), { ok: false, reason: 'missing' });
  assert.equal(sim.dispatch({ type: 'remove', tile: { col: 5, row: 5 } }).ok, true);
  assert.equal(sim.getSnapshot().money, start);
  assert.equal(sim.getSnapshot().buildings.length, 0);

  const poor = createSimulation(GRID, { ...DEFAULT_RULES, costs: { ...DEFAULT_RULES.costs, hive: 10_000 } }, FLOWERS);
  const before = poor.getSnapshot();
  assert.deepEqual(poor.dispatch({ type: 'place', kind: 'hive', tile: { col: 5, row: 5 }, facing: 'east' }), { ok: false, reason: 'insufficient-funds' });
  assert.equal(poor.getSnapshot(), before, 'failed command keeps the same snapshot');
});

test('snapshot is frozen and ids are stable', () => {
  const sim = buildLine();
  const s = sim.getSnapshot();
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.buildings) && Object.isFrozen(s.buildings[0]!.inventory));
  const ids = s.buildings.map((b) => b.id);
  sim.step();
  assert.deepEqual(sim.getSnapshot().buildings.map((b) => b.id), ids);
});

test('hive without flowers produces nothing', () => {
  const sim = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  place(sim, 'hive', 20, 10);
  for (let i = 0; i < 200; i++) sim.step();
  const hive = sim.getSnapshot().buildings[0]!;
  assert.equal(hive.inventory.nectar + hive.inventory.comb, 0);
});

test('full line sells jars and increases money', () => {
  const sim = buildLine();
  const start = sim.getSnapshot().money;
  let firstSaleTick = -1;
  for (let i = 0; i < 600; i++) {
    sim.step();
    if (firstSaleTick < 0 && sim.getSnapshot().money > start) firstSaleTick = sim.getSnapshot().tick;
  }
  const end = sim.getSnapshot().money;
  assert.ok(firstSaleTick > 0 && firstSaleTick < 200, `first sale at tick ${firstSaleTick}`);
  assert.ok(end - start >= DEFAULT_RULES.jarPrice * 5, `earned ${end - start} in 60 s`);
  assert.equal((end - start) % DEFAULT_RULES.jarPrice, 0);
});

test('belt holds one item, moves one tile per conveyorTicks, does not flow backwards', () => {
  const sim = buildLine();
  for (let i = 0; i < 300; i++) {
    sim.step();
    for (const b of sim.getSnapshot().buildings) {
      if (b.kind !== 'conveyor') continue;
      const n = b.inventory.nectar + b.inventory.comb + b.inventory.honey + b.inventory.jar;
      assert.ok(n <= 1, `belt ${b.id} holds ${n}`);
    }
  }
  // A belt facing west into the hive must not get combs from it.
  const sim2 = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  place(sim2, 'hive', 1, 1, 'east');
  place(sim2, 'conveyor', 2, 1, 'west');
  for (let i = 0; i < 100; i++) sim2.step();
  const belt = sim2.getSnapshot().buildings.find((b) => b.kind === 'conveyor')!;
  assert.equal(belt.inventory.comb, 0);
});

test('blocked line saturates buffers at bufferCap, nothing is lost', () => {
  const sim = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  place(sim, 'hive', 1, 1);
  place(sim, 'conveyor', 2, 1);
  place(sim, 'extractor', 3, 1); // output faces empty tile
  for (let i = 0; i < 3000; i++) sim.step();
  const [hive, belt, ex] = sim.getSnapshot().buildings;
  assert.equal(ex!.inventory.honey, DEFAULT_RULES.bufferCap);
  assert.equal(ex!.inventory.comb, DEFAULT_RULES.bufferCap);
  assert.equal(belt!.inventory.comb, 1);
  assert.equal(hive!.inventory.comb, DEFAULT_RULES.bufferCap);
});

test('removing a building moves its buffer to player inventory', () => {
  const sim = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  place(sim, 'hive', 1, 1);
  for (let i = 0; i < 100; i++) sim.step();
  const hive = sim.getSnapshot().buildings[0]!;
  const stored = hive.inventory.comb;
  assert.ok(stored > 0);
  sim.dispatch({ type: 'remove', tile: { col: 1, row: 1 } });
  assert.equal(sim.getSnapshot().inventory.comb, stored);
});

test('deterministic: same commands give same snapshot', () => {
  const a = buildLine();
  const b = buildLine();
  for (let i = 0; i < 400; i++) { a.step(); b.step(); }
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
});

test('rotating a loaded conveyor preserves its item, ID and price and reroutes its output', () => {
  const sim = createSimulation(GRID, DEFAULT_RULES, FLOWERS);
  place(sim, 'hive', 1, 1);
  place(sim, 'conveyor', 2, 1);
  place(sim, 'extractor', 2, 2);
  for (let i = 0; i < 15; i++) sim.step();
  const before = sim.getSnapshot();
  const belt = before.buildings[1]!;
  assert.equal(belt.inventory.comb, 1);
  assert.deepEqual(sim.dispatch({ type: 'rotate', tile: { col: 8, row: 1 }, facing: 'south' }), { ok: false, reason: 'missing' });
  assert.equal(sim.dispatch({ type: 'rotate', tile: belt.tile, facing: 'south' }).ok, true);
  const after = sim.getSnapshot();
  assert.equal(after.money, before.money);
  assert.deepEqual(after.buildings[1], { ...belt, facing: 'south' });
  sim.step();
  assert.equal(sim.getSnapshot().buildings[2]!.inventory.comb, 1);
});

test('generated maps reproduce by seed and leave a working starting production line', () => {
  const terrain = generateTerrain(WORLD_GRID, START_TILE, 12345);
  assert.deepEqual(terrain, generateTerrain(WORLD_GRID, START_TILE, 12345));
  assert.notDeepEqual(terrain.river, generateTerrain(WORLD_GRID, START_TILE, 12346).river);
  assert.ok(terrain.props.some((prop) => prop.kind === 'tree'));
  assert.ok(terrain.props.some((prop) => prop.kind === 'rock'));
  for (const row of terrain.bridges) {
    const section = terrain.river[row]!;
    for (let col = section.left - 1; col <= section.right; col++) {
      assert.ok(walkable(terrainAt(terrain, { col, row })));
    }
  }

  const sim = createSimulation(WORLD_GRID, DEFAULT_RULES, terrain.flowers, terrain.blocked);
  const water = { col: terrain.river[START_TILE.row]!.left, row: START_TILE.row };
  assert.deepEqual(sim.dispatch({ type: 'place', tile: water, kind: 'hive', facing: 'east' }), { ok: false, reason: 'blocked-terrain' });
  const line = ['hive', 'conveyor', 'extractor', 'conveyor', 'packer', 'conveyor', 'market'] as const;
  for (const [i, kind] of line.entries()) place(sim, kind, START_TILE.col - 1 + i, START_TILE.row);
  const investment = sim.getSnapshot().money;
  for (let i = 0; i < 160; i++) sim.step();
  assert.ok(sim.getSnapshot().money > investment);
});
