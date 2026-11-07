// Built-in searcher for 2D HP folding: simulated annealing over relative turns (straight, left,
// right), restarting from the current best when there is one. Plain JavaScript (Node and Web Worker).

export async function search(input, report) {
  const { n, start, seconds } = input;
  const seq = input.sequence;
  const deadline = Date.now() + (seconds - 2) * 1000;
  let rnd = input.seed >>> 0 || 1;
  const rand = () => ((rnd = (Math.imul(rnd ^ (rnd >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // R U L D
  const LET = 'RULD';

  // Relative turns t[i] in {0: straight, 1: left, 3: right} for i = 1..n-2; the first move is R.
  const toAbs = (t) => { let d = 0; let s = 'R'; for (let i = 0; i < t.length; i++) { d = (d + t[i]) % 4; s += LET[d]; } return s; };
  const fromAbs = (m) => { const t = []; let d = LET.indexOf(m[0]); for (let i = 1; i < m.length; i++) { const e = LET.indexOf(m[i]); t.push((e - d + 4) % 4); d = e; } return { t, first: LET.indexOf(m[0]) }; };
  function energy(first, t) {
    const seen = new Map();
    let x = 0, y = 0, d = first;
    seen.set(0, 0);
    const key = (a, b) => a * 4096 + b;
    const pos = [[0, 0]];
    for (let i = 0; i < n - 1; i++) {
      if (i > 0) { if (t[i - 1] === 2) return null; d = (d + t[i - 1]) % 4; }
      x += DIRS[d][0]; y += DIRS[d][1];
      const k = key(x, y);
      if (seen.has(k)) return null;
      seen.set(k, i + 1);
      pos.push([x, y]);
    }
    let e = 0;
    for (let i = 0; i < n; i++) {
      if (seq[i] !== 'H') continue;
      const [a, b] = pos[i];
      for (const [dx, dy] of [[1, 0], [0, 1]]) { const j = seen.get(key(a + dx, b + dy)); if (j !== undefined && seq[j] === 'H' && Math.abs(i - j) > 1) e--; }
    }
    return e;
  }
  const absOf = (first, t) => { let d = first; let s = LET[first]; for (let i = 0; i < t.length; i++) { d = (d + t[i]) % 4; s += LET[d]; } return s; };

  let first = 0;
  let cur = new Array(n - 2).fill(0);
  if (start?.moves?.length === n - 1) ({ t: cur, first } = fromAbs(start.moves));
  let ce = energy(first, cur);
  if (ce === null) { cur = new Array(n - 2).fill(0); first = 0; ce = energy(first, cur); }
  let best = cur.slice(), be = ce;
  const startScore = start?.moves ? ce : Infinity;
  if (!start) report({ moves: absOf(first, best) });
  const turns = [0, 1, 3];
  let T = 2.0;
  while (Date.now() < deadline) {
    for (let k = 0; k < 2000; k++) {
      const cand = cur.slice();
      const m = 1 + Math.floor(rand() * 3);
      for (let q = 0; q < m; q++) cand[Math.floor(rand() * cand.length)] = turns[Math.floor(rand() * 3)];
      const e = energy(first, cand);
      if (e === null) continue;
      if (e <= ce || rand() < Math.exp((ce - e) / T)) { cur = cand; ce = e; }
      if (ce < be) { be = ce; best = cur.slice(); if (be < startScore) report({ moves: absOf(first, best) }); }
    }
    T = Math.max(0.15, T * 0.97);
    if (T <= 0.16 && rand() < 0.05) { cur = best.slice(); ce = be; T = 1.2; }
  }
  void toAbs;
}
