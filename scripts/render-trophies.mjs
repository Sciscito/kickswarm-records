// Re-draw every trophy card from the registry and the stored solutions (after an art update).
// The registry is untouched: cards are pictures of entries, not part of them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { shortScore } from '../lib/exact.mjs';
import { loadProblem } from '../lib/process.mjs';
import { readRegistry } from '../lib/registry.mjs';
import { trophyCard } from '../lib/render.mjs';

let k = 0;
for (const e of readRegistry().filter((x) => x.nature === 'record')) {
  const f = `solutions/${e.problem}/${e.case}/${e.seq}.json`;
  if (!existsSync(f)) continue;
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  const p = loadProblem(e.problem);
  const n = p.cases.find((c) => c.id === e.case)?.n ?? Number(e.case);
  writeFileSync(`trophies/${e.seq}.svg`, trophyCard({ problem: e.problem, n, solution: rec.solution, tier: e.tier, author: e.author, score: shortScore(e.score), scoreLabel: p.score_name, date: e.ts.slice(0, 10), seq: e.seq, hash: e.hash, title: p.title, credit: e.credit }));
  k++;
}
console.log(`${k} trophy card(s) redrawn.`);
