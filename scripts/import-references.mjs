// One-time import of the published best packings that the swarm starts from.
// For each circle case: the published radius is the world record to beat, and the published centres
// (judged by our own judge) become the starting solution, credited to their source.
// For no-three-in-line: the cases and what is published, no starting solution.
// Usage: node scripts/import-references.mjs   (needs network access to www.packomania.com)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { S, fromUnits, toUnits } from '../lib/exact.mjs';
import { judge as jsq } from '../problems/circles-in-square/judge.mjs';
import { judge as jci } from '../problems/circles-in-circle/judge.mjs';
import { appendEntry, readRegistry } from '../lib/registry.mjs';

const TODAY = '2026-11-07';
const SETS = [
  { id: 'circles-in-square', code: 'csq', from: 480, to: 529, judge: jsq, shift: S / 2n },
  { id: 'circles-in-circle', code: 'cci', from: 250, to: 299, judge: jci, shift: 0n },
];

async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

const trim = (s) => s.replace(/0+$/, '').replace(/\.$/, '.0');

for (const set of SETS) {
  const file = `problems/${set.id}/problem.json`;
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const radii = new Map(
    (await text(`https://www.packomania.com/${set.code}/txt/radius.txt`))
      .split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => l.trim().split(/\s+/)).map(([n, r]) => [Number(n), r]),
  );
  p.cases = [];
  mkdirSync(`records/${set.id}`, { recursive: true });
  for (let n = set.from; n <= set.to; n++) {
    const world = radii.get(n);
    if (!world) continue;
    const coords = (await text(`https://www.packomania.com/${set.code}/txt/${set.code}${n}.txt`))
      .split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => l.trim().split(/\s+/))
      .map(([, x, y]) => [trim(fromUnits(toUnits(x) + set.shift)), trim(fromUnits(toUnits(y) + set.shift))]);
    const solution = { centers: coords };
    const cas = { id: String(n), n };
    const { score } = set.judge(cas, solution);
    p.cases.push({ id: String(n), n, world: { score: world, date: TODAY } });
    const rec = { problem: set.id, case: String(n), author: 'packomania', reference: true, score, solution, seq: null, date: TODAY };
    writeFileSync(`records/${set.id}/${n}.json`, JSON.stringify(rec));
    console.log(set.id, n, 'published', world, 'judged', score.slice(0, 16));
  }
  writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
}

// No three in line: n = 20..80; perfect (2n) solutions are published up to n = 60.
{
  const file = 'problems/no-three-in-line/problem.json';
  const p = JSON.parse(readFileSync(file, 'utf8'));
  p.cases = [];
  for (let n = 20; n <= 80; n++)
    p.cases.push({ id: String(n), n, max: String(2 * n), world: n <= 60 ? { score: String(2 * n), date: '2026-02' } : null });
  writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
}

// Record the starting points in the registry, once.
const reg = readRegistry();
if (!reg.some((e) => e.nature === 'reference')) {
  for (const set of SETS) {
    const p = JSON.parse(readFileSync(`problems/${set.id}/problem.json`, 'utf8'));
    for (const c of p.cases) {
      const rec = JSON.parse(readFileSync(`records/${set.id}/${c.id}.json`, 'utf8'));
      const e = appendEntry({ nature: 'reference', problem: set.id, case: c.id, author: 'packomania', score: rec.score, world: c.world.score, ts: `${TODAY}T00:00:00Z` });
      rec.seq = e.seq;
      writeFileSync(`records/${set.id}/${c.id}.json`, JSON.stringify(rec));
    }
  }
}
console.log('done');
