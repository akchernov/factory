import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, type BuildingId } from '../src/core/data';
import { Game, newGame, type Dir } from '../src/core/sim';

function freeSpot(g: Game, size: number, near: { x: number; y: number }, pred: (x: number, y: number) => boolean = () => true) {
  for (let r = 0; r < 30; r++) {
    for (let y = near.y - r; y <= near.y + r; y++) for (let x = near.x - r; x <= near.x + r; x++) {
      let ok = true;
      for (let ty = y; ty < y + size && ok; ty++) for (let tx = x; tx < x + size && ok; tx++) {
        if (!g.inBounds(tx, ty) || g.at(tx, ty) || g.map.terrain[g.idx(tx, ty)] !== 0) ok = false;
      }
      if (ok && pred(x, y)) return { x, y };
    }
  }
  throw new Error('no spot');
}

function must(g: Game, type: BuildingId, x: number, y: number, dir: Dir = 0) {
  const r = g.place(type, x, y, dir);
  assert.ok(r.ok, `${type} at ${x},${y}: ${JSON.stringify(r)} money=${g.state.money}`);
}

/** Straight horizontal chain: hive -> belt -> extractor -> belt -> packer -> belt -> market at row y. */
function buildLine(g: Game, x: number, y: number) {
  must(g, 'hive', x, y);
  must(g, 'belt', x + 2, y);
  must(g, 'extractor', x + 3, y);
  must(g, 'belt', x + 5, y);
  must(g, 'packer', x + 6, y);
  must(g, 'belt', x + 8, y);
  must(g, 'market', x + 9, y);
}

function run(g: Game, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) g.step();
}

test('map has flowers near start and a clear start area', () => {
  const g = new Game(newGame(1));
  const s = g.map.start;
  let flowers = 0;
  for (let y = s.y - 12; y < s.y + 12; y++) for (let x = s.x - 12; x < s.x + 12; x++) if (g.map.flower[g.idx(x, y)]! >= 0) flowers++;
  assert.ok(flowers > 40, `flowers near start: ${flowers}`);
  assert.equal(g.map.terrain[g.idx(s.x, s.y)], 0);
});

test('basic line: hive -> extractor -> packer -> market earns money', () => {
  const g = new Game(newGame(7));
  // pick the spot with the best hive rate in the start region
  let best = { x: 0, y: 0, r: -1 };
  for (let y = g.map.start.y - 10; y < g.map.start.y + 10; y++) for (let x = g.map.start.x - 14; x < g.map.start.x + 4; x++) {
    let ok = true;
    for (let dx = 0; dx < 11 && ok; dx++) for (let dy = 0; dy < 2 && ok; dy++) if (g.map.terrain[g.idx(x + dx, y + dy)] !== 0) ok = false;
    if (!ok) continue;
    const r = g.estimateHive(x, y, 'forest');
    if (r > best.r) best = { x, y, r };
  }
  assert.ok(best.r > 0.2, `best hive rate ${best.r}`);
  const before = g.state.money;
  buildLine(g, best.x, best.y);
  const spent = before - g.state.money;
  assert.equal(spent, BUILDINGS.hive.cost + BUILDINGS.extractor.cost + BUILDINGS.packer.cost + BUILDINGS.market.cost + 3 * BUILDINGS.belt.cost);
  run(g, 120);
  assert.ok((g.state.stats.sold.jar ?? 0) > 0, `jars sold: ${JSON.stringify(g.state.stats)}`);
  assert.ok(g.state.quest >= 3, `quest index ${g.state.quest}`);
});

test('belt never overlaps items and keeps order', () => {
  const g = new Game(newGame(7));
  const p = freeSpot(g, 2, g.map.start, (x, y) => g.estimateHive(x, y, 'forest') > 0.1);
  must(g, 'hive', p.x, p.y);
  // long belt into nowhere: items must pile up with gaps, never overlap
  for (let i = 0; i < 4; i++) {
    const r = g.place('belt', p.x + 2 + i, p.y, 0);
    if (!r.ok) break;
  }
  run(g, 300);
  for (const b of g.state.buildings) {
    for (let i = 1; i < b.items.length; i++) assert.ok(b.items[i]!.pos - b.items[i - 1]!.pos >= 0.24, 'gap');
  }
});

test('breeding forest x meadow eventually yields common', () => {
  const g = new Game(newGame(3));
  g.state.techs.push('chandlery', 'breeding');
  g.state.money = 10000;
  const p = freeSpot(g, 2, g.map.start);
  must(g, 'breeder', p.x, p.y);
  const br = g.at(p.x, p.y)!;
  for (let i = 0; i < 12; i++) {
    br.inv.honey = 16;
    run(g, 19);
  }
  assert.ok(g.state.discovered.includes('common'), `discovered ${g.state.discovered}`);
});

test('removing returns cost, items and queen', () => {
  const g = new Game(newGame(3));
  const p = freeSpot(g, 2, g.map.start);
  const q = g.state.queens.forest ?? 0;
  const m = g.state.money;
  must(g, 'hive', p.x, p.y);
  assert.ok(g.remove(p.x + 1, p.y + 1).ok);
  assert.equal(g.state.money, m);
  assert.equal(g.state.queens.forest ?? 0, q);
});

test('research completes from jars on belt', () => {
  const g = new Game(newGame(7));
  g.state.money = 5000;
  g.setResearch('chandlery');
  const p = freeSpot(g, 2, g.map.start);
  must(g, 'lab', p.x, p.y);
  const lab = g.at(p.x, p.y)!;
  for (let i = 0; i < 40 && !g.state.techs.includes('chandlery'); i++) {
    lab.inv.jar = 4;
    run(g, 5);
  }
  assert.ok(g.state.techs.includes('chandlery'));
  assert.ok(g.isUnlocked('chandlery'));
});

test('deterministic', () => {
  const a = new Game(newGame(11));
  const b = new Game(newGame(11));
  for (const g of [a, b]) {
    const p = freeSpot(g, 2, g.map.start, (x, y) => g.estimateHive(x, y, 'forest') > 0.1);
    buildLine(g, p.x, p.y);
    run(g, 60);
  }
  assert.deepEqual(a.state, b.state);
});
