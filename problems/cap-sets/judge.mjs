// Judge: cap sets in F_3^n. Points are words of length n over {0,1,2}; three distinct points x, y, z
// form a line when x + y + z = 0 (mod 3) in every position. A cap set has no line.
// Score = number of points (higher is better). Integers only: exact.
// Input: { "points": [[0,1,2,...], ...] }

export function judge(cas, solution) {
  const n = cas.n;
  const p = solution?.points;
  if (!Array.isArray(p) || !p.length) throw new Error('"points" must be a non-empty list of words over {0, 1, 2}');
  if (p.length > 3 ** n) throw new Error('more points than the space holds');
  const code = (v) => v.reduce((a, d) => a * 3 + d, 0);
  const seen = new Set();
  const codes = p.map((v, i) => {
    if (!Array.isArray(v) || v.length !== n || !v.every((d) => d === 0 || d === 1 || d === 2)) throw new Error(`point ${i + 1}: expected ${n} numbers among 0, 1, 2`);
    const c = code(v);
    if (seen.has(c)) throw new Error(`point ${i + 1} (${v.join('')}) is given twice`);
    seen.add(c);
    return c;
  });
  // For every pair, the third point of their line is -(x + y) mod 3; it must not be in the set.
  for (let a = 0; a < p.length; a++) {
    for (let b = a + 1; b < p.length; b++) {
      const z = p[a].map((d, k) => (6 - d - p[b][k]) % 3);
      if (seen.has(code(z))) throw new Error(`three points on a line: ${p[a].join('')}, ${p[b].join('')}, ${z.join('')}`);
    }
  }
  return { score: String(codes.length) };
}
