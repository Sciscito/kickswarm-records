import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compareScores, csqrt, fromUnits, isqrt, toUnits } from '../lib/exact.mjs';
import { judge as square } from '../problems/circles-in-square/judge.mjs';
import { judge as disc } from '../problems/circles-in-circle/judge.mjs';
import { judge as nothree } from '../problems/no-three-in-line/judge.mjs';

test('exact decimals: parse, print, square roots', () => {
  assert.equal(toUnits('0.5'), 5n * 10n ** 29n);
  assert.equal(fromUnits(toUnits('-1.25')), '-1.250000000000000000000000000000');
  assert.equal(toUnits(0.1), toUnits('0.1'));
  assert.throws(() => toUnits('1e-3'), /plain decimal/);
  assert.throws(() => toUnits('0.' + '1'.repeat(31)), /at most 30/);
  for (const n of [0n, 1n, 2n, 99n, 100n, 10n ** 60n + 12345n, 2n ** 200n]) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n);
    const c = csqrt(n);
    assert.ok(c * c >= n && (c === 0n || (c - 1n) * (c - 1n) < n));
  }
  assert.equal(compareScores('0.10', '0.1'), 0);
  assert.equal(compareScores('7', '6'), 1);
});

test('circles in a square: the radius is computed, exact, and always fits', () => {
  // 4 circles: the known optimum is r = 1/4 with centres at 1/4 and 3/4.
  const four = { centers: [['0.25', '0.25'], ['0.75', '0.25'], ['0.25', '0.75'], ['0.75', '0.75']] };
  assert.equal(square({ n: 4 }, four).score, '0.250000000000000000000000000000');
  // 2 circles on the diagonal: r = (2 - sqrt 2) / 2 / ... the judge rounds the irrational value down.
  const s = 0.2928932188134524;
  const two = square({ n: 2 }, { centers: [[s, s], [1 - s, 1 - s]] }).score;
  assert.ok(two.startsWith('0.29289321881345'));
  assert.throws(() => square({ n: 2 }, { centers: [['0', '0.5'], ['0.5', '0.5']] }), /on or outside/);
  assert.throws(() => square({ n: 2 }, { centers: [['0.5', '0.5'], ['0.5', '0.5']] }), /identical/);
  assert.throws(() => square({ n: 3 }, four), /expected 3 centers/);
});

test('circles in a square: a published packing of 300 circles scores its published radius', () => {
  const L = readFileSync(new URL('../ref/csq300.txt', import.meta.url), 'utf8').split('\n').filter((l) => /^\s*\d/.test(l)).map((l) => l.trim().split(/\s+/));
  const centers = L.map(([, x, y]) => [fromUnits(toUnits(x) + toUnits('0.5')), fromUnits(toUnits(y) + toUnits('0.5'))]);
  const t = Date.now();
  assert.equal(square({ n: 300 }, { centers }).score, '0.030219555704000000000000000000');
  assert.ok(Date.now() - t < 2000, 'fast enough for a browser');
});

test('circles in a circle: boundary uses |c| rounded up', () => {
  // 2 circles of radius 1/2 at (±1/2, 0) fit exactly.
  assert.equal(disc({ n: 2 }, { centers: [['0.5', '0'], ['-0.5', '0']] }).score, '0.500000000000000000000000000000');
  // 3 circles: r = 2*sqrt(3) - 3 = 0.4641016151...
  const d = 1 - 0.46410161513775466;
  const pts = [0, 1, 2].map((k) => [d * Math.cos((2 * Math.PI * k) / 3), d * Math.sin((2 * Math.PI * k) / 3)]);
  assert.ok(disc({ n: 3 }, { centers: pts }).score.startsWith('0.464101615'));
  assert.throws(() => disc({ n: 1 }, { centers: [['1', '0']] }), /outside/);
});

test('no three in line: collinear triples of any slope are caught', () => {
  assert.equal(nothree({ n: 3 }, { points: [[0, 0], [0, 1], [1, 0], [1, 2], [2, 1], [2, 2]] }).score, '6');
  assert.throws(() => nothree({ n: 3 }, { points: [[0, 0], [1, 1], [2, 2]] }), /three points in a line/);
  assert.throws(() => nothree({ n: 5 }, { points: [[0, 0], [2, 1], [4, 2]] }), /three points in a line/);
  assert.throws(() => nothree({ n: 3 }, { points: [[0, 0], [0, 0]] }), /twice/);
  assert.throws(() => nothree({ n: 3 }, { points: [[0, 3]] }), /integers from 0 to 2/);
  assert.throws(() => nothree({ n: 2 }, { points: [[0, 0], [0, 1], [1, 0], [1, 1], [0, 0]] }), /more than 2n/);
});
