import assert from 'node:assert/strict';
import { test } from 'node:test';
import { play } from '../tools/bot';

test('smart bot wins with raids on within 20 days', () => {
  for (const seed of [7, 123]) {
    const r = play(seed, 20);
    assert.ok(r.won, `seed ${seed}: quest ${r.quest}, ${JSON.stringify(r.marks)}`);
    assert.ok(r.minutes > 15, `seed ${seed}: too fast, ${r.minutes} min`);
  }
});

test('lazy bot (one line, no research) never wins', () => {
  const r = play(7, 12, { defend: true, lazy: true });
  assert.equal(r.won, false);
});

test('peaceful mode is winnable and skips defence quests', () => {
  const r = play(11, 20, { defend: false, lazy: false }, true);
  assert.ok(r.won, `quest ${r.quest}`);
});
