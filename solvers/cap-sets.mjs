// Built-in searcher for cap sets: randomized greedy with a priority, then remove-and-refill local search
// from the best set. Plain JavaScript (Node and Web Worker).

export async function search(input, report) {
  const { n, start, seconds } = input;
  const deadline = Date.now() + (seconds - 2) * 1000;
  let rnd = input.seed >>> 0 || 1;
  const rand = () => ((rnd = (Math.imul(rnd ^ (rnd >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  const N = 3 ** n;
  const digits = (c) => { const v = new Array(n); for (let k = n - 1; k >= 0; k--) { v[k] = c % 3; c = Math.floor(c / 3); } return v; };
  const D = Array.from({ length: N }, (_, c) => digits(c));
  const third = (a, b) => { let z = 0; const x = D[a], y = D[b]; for (let k = 0; k < n; k++) z = z * 3 + ((6 - x[k] - y[k]) % 3); return z; };

  // blocked[c] counts pairs in the set whose third point is c: a point can be added when blocked is 0.
  function grow(set, order) {
    const inSet = new Uint8Array(N);
    const blocked = new Uint16Array(N);
    const list = [];
    const add = (c) => { for (const s of list) blocked[third(s, c)]++; list.push(c); inSet[c] = 1; };
    for (const c of set) if (!inSet[c] && !blocked[c]) add(c);
    for (const c of order) if (!inSet[c] && !blocked[c]) add(c);
    return list;
  }
  const shuffled = () => { const o = Array.from({ length: N }, (_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

  let best = start?.points ? start.points.map((v) => v.reduce((a, d) => a * 3 + d, 0)) : [];
  const startSize = best.length;
  const emit = () => report({ points: best.map((c) => D[c]) });
  if (!best.length) { best = grow([], shuffled()); emit(); }
  while (Date.now() < deadline) {
    // Remove a random part of the best set, refill greedily in a random order.
    const keep = best.filter(() => rand() > 0.12 + rand() * 0.2);
    const cand = grow(keep, shuffled());
    if (cand.length > best.length) { best = cand; if (best.length > startSize) emit(); }
  }
}
