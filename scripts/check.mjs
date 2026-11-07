// Check a solution file with the exact judge, and say what it would earn. Nothing is recorded.
// Usage: npm run check -- solution.json

import { readFileSync } from 'node:fs';
import { better, shortScore, toUnits } from '../lib/exact.mjs';
import { loadJudge, loadProblem, readRecord } from '../lib/process.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run check -- solution.json');
  process.exit(2);
}
const sub = JSON.parse(readFileSync(file, 'utf8'));
const p = loadProblem(sub.problem);
const c = p.cases.find((x) => x.id === String(sub.case));
if (!c) throw new Error(`${p.id} has no case ${sub.case}`);
const judge = await loadJudge(p.id);
let score;
try {
  ({ score } = judge(c, sub));
} catch (e) {
  console.log(`REJECTED: ${e.message}`);
  process.exit(1);
}
const cur = readRecord(p.id, c.id);
console.log(`VALID. ${p.title}, n = ${c.n}: ${p.score_name} ${shortScore(score)}`);
if (!cur) console.log('No solution on the board yet: this would be the first (Valid tier).');
else if (better(score, cur.score, p.direction)) {
  const gain = toUnits(score) - toUnits(cur.score);
  const min = toUnits(p.score_name === 'radius' ? '0.000000000001' : '1');
  console.log(gain >= min ? `BEATS the current best (${shortScore(cur.score)} by @${cur.author}). Submit it: npm run submit -- ${file}` : `Above the current best by less than the minimum step; it would be an attempt.`);
} else console.log(`Does not beat the current best (${shortScore(cur.score)} by @${cur.author}). It can still be submitted as an attempt for the journal.`);
