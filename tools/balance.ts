/** Balance report: node .tmp/balance.mjs [seeds] [maxDays] [mode: smart|short|lazy|nodefense|peaceful] */
import { play } from './bot';

const n = Number(process.argv[2] ?? 3);
const maxDays = Number(process.argv[3] ?? 30);
const mode = process.argv[4] ?? 'smart';
const verbose = process.argv[5] === 'v';
const seeds = [7, 11, 123, 999, 20261124, 5, 42, 314].slice(0, n);

let wins = 0;
for (const seed of seeds) {
  const t0 = Date.now();
  const r = play(seed, maxDays, { defend: mode !== 'nodefense' && mode !== 'peaceful', lazy: mode === 'lazy' }, mode === 'peaceful', mode === 'short' ? 'short' : 'full');
  if (r.won) wins++;
  console.log(`seed ${seed}: ${r.won ? 'WIN' : 'no win'} at ${r.minutes} min (day ${r.days}), quest ${r.quest}, hives ${r.hives}, buildings ${r.buildings}, lost ${r.lost}, killed ${r.killed}, money ${r.money}, ${Date.now() - t0} ms`);
  if (verbose || !r.won) console.log('  ' + Object.entries(r.marks).map(([k, v]) => `${k}@${v}`).join(' · '));
  if (r.notes.length) console.log('  notes: ' + r.notes.join('; '));
}
console.log(`${mode}: ${wins}/${seeds.length} wins`);
