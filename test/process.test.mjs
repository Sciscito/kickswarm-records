import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Work in a scratch copy: the robot writes records, solutions, trophies and the registry in the cwd.
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ksr-'));
cpSync(join(root, 'problems'), join(dir, 'problems'), { recursive: true });
cpSync(join(root, 'lib'), join(dir, 'lib'), { recursive: true });
cpSync(join(root, 'records', 'circles-in-square', '480.json'), join(dir, 'records', 'circles-in-square', '480.json'), { recursive: true });
process.chdir(dir);
// A small case in the scratch copy only, so a perfect solution is found instantly by brute force.
{
  const f = join(dir, 'problems', 'no-three-in-line', 'problem.json');
  const p = JSON.parse(readFileSync(f, 'utf8'));
  p.cases.unshift({ id: '6', n: 6, max: '12', world: { score: '12', date: '1917' } }, { id: '5', n: 5, max: '10', world: { score: '10', date: '1917' } });
  writeFileSync(f, JSON.stringify(p));
}
const { extractJson, processSubmission } = await import(join(dir, 'lib', 'process.mjs').replace(/\\/g, '/').replace(/^([A-Z]):/, 'file:///$1:'));
const { auditRegistry, readRegistry } = await import(join(dir, 'lib', 'registry.mjs').replace(/\\/g, '/').replace(/^([A-Z]):/, 'file:///$1:'));

/** A valid 2n-point solution for small n, found by brute force. */
function perfect(n) {
  const pts = [];
  const ok = (p) => {
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
      const [x1, y1] = pts[a];
      const [x2, y2] = pts[b];
      if ((x2 - x1) * (p[1] - y1) === (y2 - y1) * (p[0] - x1)) return false;
    }
    return true;
  };
  const go = (row) => {
    if (row === n) return true;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (!ok([row, a])) continue;
      pts.push([row, a]);
      if (ok([row, b])) {
        pts.push([row, b]);
        if (go(row + 1)) return true;
        pts.pop();
      }
      pts.pop();
    }
    return false;
  };
  go(0);
  return pts;
}

test('the JSON is found in an issue form body', () => {
  const body = '### Solution\n\n```json\n{"problem":"no-three-in-line","case":"20","points":[[0,1]]}\n```\n\n### Notes\n\n_No response_';
  assert.equal(extractJson(body).case, '20');
  assert.throws(() => extractJson(''), /empty/);
  assert.throws(() => extractJson('```json\n{oops}\n```'), /could not be read/);
});

test('valid, swarm record, perfect, attempt, rejection: each lands where it should', async () => {
  const pts = perfect(6).slice(0, 8);
  let r = await processSubmission({ problem: 'no-three-in-line', case: '6', points: pts, method: 'backtracking', model: 'test' }, { author: 'alice', issue: 1 });
  assert.equal(r.status, 'record');
  assert.equal(r.tier, 'valid');
  assert.ok(existsSync(`trophies/${r.entry.seq}.svg`));
  assert.match(readFileSync(`trophies/${r.entry.seq}.svg`, 'utf8'), /@alice/);

  r = await processSubmission({ problem: 'no-three-in-line', case: '6', points: perfect(6).slice(0, 10) }, { author: 'bob', issue: 2 });
  assert.equal(r.tier, 'swarm');

  r = await processSubmission({ problem: 'no-three-in-line', case: '6', points: perfect(6) }, { author: 'carol', issue: 3 });
  assert.equal(r.tier, 'perfect', r.message);
  assert.equal(r.entry.honey, 25);

  r = await processSubmission({ problem: 'no-three-in-line', case: '6', points: pts }, { author: 'dave', issue: 4 });
  assert.equal(r.status, 'attempt');
  assert.match(r.message, /does not beat/);

  r = await processSubmission({ problem: 'no-three-in-line', case: '6', points: [[0, 0], [1, 1], [2, 2]] }, { author: 'eve', issue: 5 });
  assert.equal(r.status, 'rejected');
  r = await processSubmission({ problem: 'nope', case: '1' }, { author: 'eve' });
  assert.match(r.message, /unknown problem/);

  const reg = readRegistry();
  assert.deepEqual(reg.map((e) => e.nature), ['record', 'record', 'record', 'attempt']);
  assert.ok(auditRegistry(reg).ok);
});

test('circles: resubmitting the published packing is only an attempt; a world record needs a real margin', async () => {
  const ref = JSON.parse(readFileSync('records/circles-in-square/480.json', 'utf8'));
  let r = await processSubmission({ problem: 'circles-in-square', case: '480', centers: ref.solution.centers }, { author: 'frank' });
  assert.equal(r.status, 'attempt');
  assert.match(r.message, /equals/);
  // Shrink everything towards the centre: worse, still verified, still an attempt.
  const shrunk = ref.solution.centers.map(([x, y]) => [String(0.5 + (Number(x) - 0.5) * 0.99), String(0.5 + (Number(y) - 0.5) * 0.99)]);
  r = await processSubmission({ problem: 'circles-in-square', case: '480', centers: shrunk }, { author: 'frank' });
  assert.equal(r.status, 'attempt');
  assert.match(r.message, /does not beat/);
});

test('a better solution known elsewhere is credited to its authors and becomes the one to beat', async () => {
  const r = await processSubmission({ problem: 'no-three-in-line', case: '5', points: perfect(5), credit: 'H. Dudeney (1917)' }, { author: 'scout' });
  assert.equal(r.tier, 'known');
  assert.equal(r.entry.honey, 2);
  assert.equal(r.entry.credit, 'H. Dudeney (1917)');
  assert.match(readFileSync(`trophies/${r.entry.seq}.svg`, 'utf8'), /H. Dudeney \(1917\), found by @scout/);
});
