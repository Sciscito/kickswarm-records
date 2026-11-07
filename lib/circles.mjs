// Shared exact core for the circle-packing judges.
// The participant gives only the centres. The judge computes the largest radius those centres allow,
// rounded DOWN to 10^-30, so the score is always a radius that really fits.

import { S, csqrt, isqrt, toUnits } from './exact.mjs';

/** Read `solution.centers` as exactly `n` pairs of exact coordinates. */
export function readCenters(solution, n) {
  const c = solution?.centers;
  if (!Array.isArray(c)) throw new Error('"centers" must be a list of [x, y] pairs');
  if (c.length !== n) throw new Error(`expected ${n} centers, got ${c.length}`);
  return c.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) throw new Error(`center ${i + 1}: expected [x, y]`);
    return [toUnits(p[0], `center ${i + 1} x`), toUnits(p[1], `center ${i + 1} y`)];
  });
}

/**
 * Smallest squared distance between two centres, exactly, in units^2.
 * A float pass finds the candidates; only near-minimal pairs are computed exactly, which is safe
 * because float error is far below the margin kept (relative 1e-9).
 */
export function minSquaredDistance(pts) {
  const n = pts.length;
  const f = pts.map(([x, y]) => [Number(x) / 1e30, Number(y) / 1e30]);
  // Grid hashing keeps this near-linear for large n.
  let minf = Infinity;
  const cell = 2 / Math.sqrt(n);
  const grid = new Map();
  const key = (i, j) => i * 1000003 + j;
  f.forEach(([x, y], k) => {
    const g = key(Math.floor(x / cell), Math.floor(y / cell));
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g).push(k);
  });
  const pairs = [];
  const scan = (visit) => {
    f.forEach(([x, y], a) => {
      const gi = Math.floor(x / cell);
      const gj = Math.floor(y / cell);
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++)
          for (const b of grid.get(key(gi + di, gj + dj)) ?? []) if (b > a) visit(a, b);
    });
  };
  scan((a, b) => {
    const dx = f[a][0] - f[b][0];
    const dy = f[a][1] - f[b][1];
    const d = dx * dx + dy * dy;
    if (d < minf) minf = d;
  });
  if (minf === Infinity) {
    // Fewer neighbours than the grid expects (very spread out): fall back to all pairs.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const dx = f[a][0] - f[b][0];
      const dy = f[a][1] - f[b][1];
      minf = Math.min(minf, dx * dx + dy * dy);
    }
  }
  if (minf >= cell * cell) {
    // The closest pair may straddle more than one cell: check all pairs.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
  } else {
    const lim = minf * (1 + 1e-9) + 1e-24;
    scan((a, b) => {
      const dx = f[a][0] - f[b][0];
      const dy = f[a][1] - f[b][1];
      if (dx * dx + dy * dy <= lim) pairs.push([a, b]);
    });
  }
  let best = null;
  for (const [a, b] of pairs) {
    const dx = pts[a][0] - pts[b][0];
    const dy = pts[a][1] - pts[b][1];
    const d2 = dx * dx + dy * dy;
    if (best === null || d2 < best) best = d2;
  }
  if (best === 0n) throw new Error('two centers are identical');
  return best;
}

/** Radius allowed by the pairwise distances, rounded down: floor(sqrt(d2)) / 2. */
export function pairRadius(d2) {
  return isqrt(d2) / 2n;
}

/** Square [0,1]^2: distance from each centre to the nearest wall, minimum over all. */
export function squareWall(pts) {
  let m = null;
  for (const [x, y] of pts) {
    const w = [x, S - x, y, S - y].reduce((a, b) => (a < b ? a : b));
    if (m === null || w < m) m = w;
  }
  return m;
}

/** Unit disc centred at the origin: 1 - |c|, with |c| rounded UP, minimum over all centres. */
export function discWall(pts) {
  let m = null;
  for (const [x, y] of pts) {
    const w = S - csqrt(x * x + y * y);
    if (m === null || w < m) m = w;
  }
  return m;
}
