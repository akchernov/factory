import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game, newGame } from '../src/core/sim';
import { DAY_SECONDS } from '../src/core/data';

function bestSpot(g: Game) {
  let best = { x: 0, y: 0, r: -1 };
  const s = g.map.start;
  for (let y = s.y - 10; y < s.y + 10; y++) for (let x = s.x - 14; x < s.x + 2; x++) {
    let ok = true;
    for (let dx = 0; dx < 12 && ok; dx++) for (let dy = -3; dy < 5 && ok; dy++) if (!g.inBounds(x + dx, y + dy) || g.map.terrain[g.idx(x + dx, y + dy)] !== 0) ok = false;
    if (!ok) continue;
    const r = g.estimateHive(x, y, 'forest');
    if (r > best.r) best = { x, y, r };
  }
  return best;
}

function line(g: Game, x: number, y: number) {
  for (const [t, dx] of [['hive', 0], ['belt', 2], ['extractor', 3], ['belt', 5], ['packer', 6], ['belt', 8], ['market', 9]] as const) {
    const r = g.place(t, x + dx, y, 0);
    assert.ok(r.ok, `${t} ${JSON.stringify(r)}`);
  }
}

function runDays(g: Game, days: number) {
  for (let i = 0; i < days * DAY_SECONDS * 10; i++) g.step();
}

test('bears raid an undefended base from day 2', () => {
  const g = new Game(newGame(7));
  const p = bestSpot(g);
  line(g, p.x, p.y);
  runDays(g, 2.2);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.t === 'raid' && e.kind === 'bear'), 'bear raid happened');
  assert.ok(g.state.stats.lost > 0, `undefended base should lose something, lost=${g.state.stats.lost}`);
});

test('one fed smoker protects the starter line for 4 days', () => {
  const g = new Game(newGame(7));
  g.state.money = 1000;
  const p = bestSpot(g);
  line(g, p.x, p.y);
  assert.ok(g.place('smoker', p.x + 3, p.y + 2, 0).ok);
  assert.ok(g.place('smoker', p.x + 7, p.y - 2, 0).ok);
  runDays(g, 4);
  const killed = g.state.stats.killed;
  assert.ok(killed > 0, 'smokers killed something');
  assert.equal(g.state.buildings.filter((b) => b.type === 'hive').length, 1, `hive survived, lost=${g.state.stats.lost}`);
});

test('peaceful mode has no raids', () => {
  const g = new Game(newGame(7, true));
  const p = bestSpot(g);
  line(g, p.x, p.y);
  runDays(g, 3);
  assert.equal(g.state.enemies.length, 0);
  assert.equal(g.state.stats.lost, 0);
});

test('nests exist far from start', () => {
  const g = new Game(newGame(7));
  assert.ok((g.state.nests ?? []).length >= 3);
  for (const n of g.state.nests!) assert.ok(Math.hypot(n.x - g.map.start.x, n.y - g.map.start.y) >= 24);
});

test('beekeeper alone drives off one bear but not a big pack', () => {
  const one = new Game(newGame(7));
  const p = bestSpot(one);
  line(one, p.x, p.y);
  const st = one.state;
  one.movePlayer(p.x + 1, p.y + 3);
  st.enemies.push({ id: st.nextId++, kind: 'bear', x: p.x + 1, y: p.y + 8, hp: 160, target: 0, flee: false, biting: 0 });
  for (let i = 0; i < 600; i++) one.step();
  assert.equal(st.enemies.length, 0, 'bear killed');
  assert.equal(st.stats.lost, 0, 'nothing lost');

  const many = new Game(newGame(7));
  line(many, p.x, p.y);
  const s2 = many.state;
  many.movePlayer(p.x + 1, p.y + 3);
  for (let i = 0; i < 6; i++) s2.enemies.push({ id: s2.nextId++, kind: 'bear', x: p.x + i, y: p.y + 8, hp: 160, target: 0, flee: false, biting: 0 });
  for (let i = 0; i < 1200; i++) many.step();
  assert.ok(s2.stats.lost > 0, 'a pack of 6 bears breaks through a lone beekeeper');
});
