// Judge: points on the n x n grid {0..n-1}^2, no three on a common straight line (any slope).
// Score = number of points (higher is better). No solution can have more than 2n points.
// Input: { "points": [[x, y], ...] } with integer coordinates.

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function judge(cas, solution) {
  const n = cas.n;
  const p = solution?.points;
  if (!Array.isArray(p)) throw new Error('"points" must be a list of [x, y] pairs');
  if (p.length === 0) throw new Error('no points');
  if (p.length > 2 * n) throw new Error(`more than 2n = ${2 * n} points: some row must then hold three`);
  const seen = new Set();
  p.forEach((q, i) => {
    if (!Array.isArray(q) || q.length !== 2 || !q.every((v) => Number.isInteger(v) && v >= 0 && v < n))
      throw new Error(`point ${i + 1}: expected [x, y] with integers from 0 to ${n - 1}`);
    const k = q[0] * n + q[1];
    if (seen.has(k)) throw new Error(`point ${i + 1} (${q[0]}, ${q[1]}) is given twice`);
    seen.add(k);
  });
  // For each point, the directions to all others, reduced; a repeated direction means three in a line.
  for (let a = 0; a < p.length; a++) {
    const dirs = new Map();
    for (let b = 0; b < p.length; b++) {
      if (b === a) continue;
      let dx = p[b][0] - p[a][0];
      let dy = p[b][1] - p[a][1];
      const g = gcd(dx, dy);
      dx /= g;
      dy /= g;
      if (dx < 0 || (dx === 0 && dy < 0)) {
        dx = -dx;
        dy = -dy;
      }
      const k = `${dx},${dy}`;
      if (dirs.has(k)) {
        const c = dirs.get(k);
        throw new Error(`three points in a line: (${p[a]}) (${p[c]}) (${p[b]})`);
      }
      dirs.set(k, b);
    }
  }
  return { score: String(p.length) };
}
