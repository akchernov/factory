import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game, newGame } from '../src/core/sim';
import { guideStep } from '../src/game/guide';

for (const seed of [7, 11, 123, 999, 20261124]) {
  test(`following the tutorial arrows sells a jar (seed ${seed})`, () => {
    const g = new Game(newGame(seed, true));
    for (let i = 0; i < 20; i++) {
      let s = guideStep(g);
      // Between quests the guide waits for production (e.g. 4 honey) before showing the next step.
      for (let k = 0; k < 3000 && !s && g.state.quest < 3; k++) { g.step(); s = guideStep(g); }
      if (!s) break;
      const r = s.rotate ? g.rotate(s.x, s.y, s.dir) : g.place(s.type, s.x, s.y, s.dir);
      assert.ok(r.ok, `step ${i} ${s.type} ${JSON.stringify(r)}`);
      for (let k = 0; k < 600 && g.state.quest < 3 && guideStep(g)?.type === s.type && guideStep(g)?.x === s.x; k++) g.step();
    }
    for (let k = 0; k < 3000 && !(g.state.stats.sold.jar ?? 0); k++) g.step();
    assert.ok((g.state.stats.sold.jar ?? 0) > 0, `sold ${JSON.stringify(g.state.stats.sold)} quest ${g.state.quest}`);
  });
}
