// Built-in searcher for no-three-in-line: min-conflicts local search with two points per row,
// seeded from the current best when there is one. See README.md for the contract.

const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); }));
const { n, start, seconds } = input;
const deadline = Date.now() + (seconds - 2) * 1000;
let rnd = input.seed >>> 0 || 1;
const rand = () => ((rnd = (Math.imul(rnd ^ (rnd >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
const ri = (k) => Math.floor(rand() * k);

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
function conflictsAt(P, skip, x, y) {
  const m = new Map(); let c = 0;
  for (let i = 0; i < P.length; i++) {
    if (i === skip) continue;
    let dx = P[i][0] - x, dy = P[i][1] - y;
    if (dx === 0 && dy === 0) return 1e9;
    const g = gcd(dx, dy); dx /= g; dy /= g;
    if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; }
    const k = dx * 4096 + dy; const v = m.get(k) ?? 0; c += v; m.set(k, v + 1);
  }
  return c;
}
function validSubset(P) {
  const Q = P.map((p) => [...p]);
  for (;;) {
    const conf = Q.map((p, i) => conflictsAt(Q, i, p[0], p[1]));
    const mx = Math.max(0, ...conf); if (mx === 0) return Q;
    Q.splice(conf.indexOf(mx), 1);
  }
}
let best = start?.points?.length ?? 0;
const emit = (P) => { if (P.length > best) { best = P.length; console.log('BEST ' + JSON.stringify({ points: P })); } };

while (Date.now() < deadline && best < 2 * n) {
  // Two points per row; rows that the start solution covers keep its points as a seed.
  const byRow = new Map();
  for (const [x, y] of start?.points ?? []) (byRow.get(x) ?? byRow.set(x, []).get(x)).push(y);
  const P = [];
  for (let x = 0; x < n; x++) {
    const seed = rand() < 0.7 ? (byRow.get(x) ?? []) : [];
    const a = seed[0] ?? ri(n);
    let b = seed[1] ?? ri(n);
    while (b === a) b = ri(n);
    P.push([x, a], [x, b]);
  }
  for (let it = 0; it < 60000 && Date.now() < deadline; it++) {
    const conf = P.map((p, i) => conflictsAt(P, i, p[0], p[1]));
    const bad = []; conf.forEach((c, i) => c > 0 && bad.push(i));
    if (!bad.length) break;
    if (it % 500 === 0) emit(validSubset(P));
    const i = bad[ri(bad.length)];
    const other = P[i ^ 1][1];
    let cand = [], bc = Infinity;
    for (let y = 0; y < n; y++) {
      if (y === other) continue;
      const c = conflictsAt(P, i, P[i][0], y) + (y === P[i][1] ? 0.5 : 0);
      if (c < bc) { bc = c; cand = [y]; } else if (c === bc) cand.push(y);
    }
    let y = rand() < 0.08 ? ri(n) : cand[ri(cand.length)];
    if (y === other) y = cand[0];
    P[i][1] = y;
  }
  emit(validSubset(P));
}
