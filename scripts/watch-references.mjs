// Daily watch of the reference tables: what the rest of the world has found.
// - If a published record improved, the case's world record is updated (registry: world_update).
// - If the published packing now beats the board, it becomes the starting point, credited to its
//   source (registry: reference). The swarm always starts from the best solution known anywhere.
// Usage: node scripts/watch-references.mjs   (run daily by .github/workflows/watch.yml)

import { readFileSync, writeFileSync } from 'node:fs';
import { S, better, fromUnits, toUnits } from '../lib/exact.mjs';
import { loadJudge, readRecord } from '../lib/process.mjs';
import { appendEntry } from '../lib/registry.mjs';

const SETS = [
  { id: 'circles-in-square', code: 'csq', shift: S / 2n },
  { id: 'circles-in-circle', code: 'cci', shift: 0n },
];
const text = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
};
const trim = (s) => s.replace(/0+$/, '').replace(/\.$/, '.0');
const today = new Date().toISOString().slice(0, 10);
let changes = 0;

for (const set of SETS) {
  const file = `problems/${set.id}/problem.json`;
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const judge = await loadJudge(set.id);
  let radii;
  try {
    radii = new Map((await text(`https://www.packomania.com/${set.code}/txt/radius.txt`)).split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => l.trim().split(/\s+/)).map(([n, r]) => [n, r]));
  } catch (e) {
    console.log(`${set.id}: table unreachable (${e.message}); nothing changed.`);
    continue;
  }
  for (const c of p.cases) {
    const pub = radii.get(c.id);
    if (!pub || !c.world) continue;
    if (better(pub, c.world.score, 'max') && toUnits(pub) > toUnits(c.world.score)) {
      appendEntry({ nature: 'world_update', problem: set.id, case: c.id, previous: c.world.score, world: pub, source: `https://www.packomania.com/${set.code}/` });
      console.log(`${set.id} n=${c.id}: published record ${c.world.score} -> ${pub}`);
      c.world = { score: pub, date: today };
      changes++;
    }
    const rec = readRecord(set.id, c.id);
    // Import the published packing when it beats the board by the minimum step.
    if (rec && toUnits(pub) - toUnits(rec.score) >= toUnits('0.000000000001')) {
      try {
        const coords = (await text(`https://www.packomania.com/${set.code}/txt/${set.code}${c.id}.txt`)).split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => l.trim().split(/\s+/))
          .map(([, x, y]) => [trim(fromUnits(toUnits(x) + set.shift)), trim(fromUnits(toUnits(y) + set.shift))]);
        const solution = { centers: coords };
        const { score } = judge(c, solution);
        if (better(score, rec.score, 'max')) {
          const e = appendEntry({ nature: 'reference', problem: set.id, case: c.id, author: 'packomania', score, world: pub, previous: rec.score });
          writeFileSync(`records/${set.id}/${c.id}.json`, JSON.stringify({ problem: set.id, case: c.id, author: 'packomania', reference: true, score, solution, seq: e.seq, date: today }));
          console.log(`${set.id} n=${c.id}: board now starts from the published packing (${score.slice(0, 14)})`);
          changes++;
        }
      } catch (e) {
        console.log(`${set.id} n=${c.id}: could not import (${e.message})`);
      }
    }
  }
  writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
}
console.log(changes ? `${changes} change(s).` : 'Nothing new elsewhere.');
