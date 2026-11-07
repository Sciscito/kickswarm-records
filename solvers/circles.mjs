// Built-in searcher for circles-in-square and circles-in-circle: perturb a few circles of the current
// best, then "inflate" all circles as soft disks and push overlaps apart (a Lubachevsky-Stillinger-like
// relaxation). Keeps any configuration whose true radius is larger. See README.md for the contract.
// Plain JavaScript, no imports: it runs in Node (solvers/run.mjs) and in a browser Web Worker.

export async function search(input, report) {
const { problem, n, start, seconds } = input;
const disc = problem === 'circles-in-circle';
const deadline = Date.now() + (seconds - 2) * 1000;
let rnd = input.seed >>> 0 || 1;
const rand = () => ((rnd = (Math.imul(rnd ^ (rnd >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);

/** True radius of a configuration (float). */
function radius(X, Y) {
  let wall = Infinity;
  for (let i = 0; i < n; i++) {
    wall = Math.min(wall, disc ? 1 - Math.hypot(X[i], Y[i]) : Math.min(X[i], 1 - X[i], Y[i], 1 - Y[i]));
  }
  let d2 = Infinity;
  const cell = 2 / Math.sqrt(n);
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.floor((X[i] + 1) / cell) * 4096 + Math.floor((Y[i] + 1) / cell);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  for (let i = 0; i < n; i++) {
    const gx = Math.floor((X[i] + 1) / cell), gy = Math.floor((Y[i] + 1) / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get((gx + a) * 4096 + gy + b) ?? []) {
      if (j <= i) continue;
      const dx = X[i] - X[j], dy = Y[i] - Y[j];
      d2 = Math.min(d2, dx * dx + dy * dy);
    }
  }
  return Math.min(wall, Math.sqrt(d2) / 2);
}

/** Soft-disk relaxation at target radius t: push overlapping pairs apart, clamp to the container. */
function relax(X, Y, t, sweeps) {
  const cell = 2 * t;
  for (let s = 0; s < sweeps; s++) {
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.floor((X[i] + 1) / cell) * 8192 + Math.floor((Y[i] + 1) / cell);
      (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
    }
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const gx = Math.floor((X[i] + 1) / cell), gy = Math.floor((Y[i] + 1) / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get((gx + a) * 8192 + gy + b) ?? []) {
        if (j <= i) continue;
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        const d = Math.hypot(dx, dy) || 1e-12;
        const o = 2 * t - d;
        if (o > 0) {
          const ux = dx / d, uy = dy / d, h = o * 0.5 * 1.02;
          X[i] -= ux * h; Y[i] -= uy * h; X[j] += ux * h; Y[j] += uy * h;
          moved += o;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (disc) {
        const r = Math.hypot(X[i], Y[i]);
        if (r > 1 - t) { X[i] *= (1 - t) / r; Y[i] *= (1 - t) / r; }
      } else {
        X[i] = Math.min(1 - t, Math.max(t, X[i]));
        Y[i] = Math.min(1 - t, Math.max(t, Y[i]));
      }
    }
    if (moved < 1e-15) break;
  }
}

let X, Y;
if (start?.centers?.length === n) {
  X = start.centers.map((c) => Number(c[0]));
  Y = start.centers.map((c) => Number(c[1]));
} else {
  // No start: a jittered grid.
  const k = Math.ceil(Math.sqrt(n));
  X = []; Y = [];
  for (let i = 0; i < n; i++) {
    const u = ((i % k) + 0.5) / k, v = (Math.floor(i / k) + 0.5) / k;
    X.push(disc ? (u * 2 - 1) * 0.7 : u); Y.push(disc ? (v * 2 - 1) * 0.7 : v);
  }
}
let bestR = radius(X, Y);
const fmt = (v) => v.toFixed(20).replace(/0+$/, '').replace(/\.$/, '.0');
const emit = () => report({ centers: X.map((x, i) => [fmt(x), fmt(Y[i])]) });
if (!start) emit();

while (Date.now() < deadline) {
  const X2 = X.slice(), Y2 = Y.slice();
  // Perturb a few circles (sometimes many, a little).
  const k = rand() < 0.7 ? 1 + Math.floor(rand() * 3) : Math.floor(n / 10);
  const amp = bestR * (rand() < 0.5 ? 0.4 : 0.05);
  for (let m = 0; m < k; m++) {
    const i = Math.floor(rand() * n);
    X2[i] += (rand() - 0.5) * amp * 2; Y2[i] += (rand() - 0.5) * amp * 2;
  }
  // Inflate in steps and relax.
  let t = bestR;
  for (let step = 0; step < 6; step++) {
    t *= 1 + 2e-5 * Math.pow(0.4, step);
    relax(X2, Y2, t, 60);
  }
  relax(X2, Y2, bestR * (1 + 1e-9), 200);
  const r = radius(X2, Y2);
  if (r > bestR * (1 + 1e-14)) {
    X = X2; Y = Y2; bestR = r;
    emit();
  }
}
}
