// Drawings of solutions and trophy cards, as SVG strings. Same code in the browser and in the robot.
// Art direction: the observatory notebook. Each solution is drawn like a scientific plate: a curated
// palette per tier (no rainbow), circles shaded by how many neighbours they touch, the contact graph
// in hairlines, rattlers (circles touching nothing) left open. The geometry decides the picture.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f = (x) => (Math.round(x * 100) / 100).toString();

export const TIERS = {
  valid: { label: 'Valid', honey: 1, ink: '#e8e2d6', glyph: 'V', palette: null },
  swarm: { label: 'Swarm record', honey: 10, ink: '#f2b33d', glyph: 'SR', palette: ['#3d2306', '#94550c', '#e19e2c', '#f6cf7c', '#fff0cc'] },
  perfect: { label: 'Perfect', honey: 25, ink: '#b98cff', glyph: 'P', palette: ['#21143f', '#563aa6', '#9a73f0', '#cdb4ff', '#f3ecff'] },
  world: { label: 'World record', honey: 100, ink: '#ffd36b', glyph: 'WR', palette: ['#4a3204', '#b67c0e', '#f0c14b', '#ffe49a', '#fffaf0'] },
  reference: { label: 'Published record', honey: 0, ink: '#9fb3c8', glyph: 'R', palette: ['#141f2b', '#2d4660', '#58799a', '#a3bdd4', '#e6eef5'] },
  known: { label: 'Known elsewhere', honey: 2, ink: '#7fd1c4', glyph: 'K', palette: ['#0c2e2a', '#226e65', '#4fae9f', '#9fe0d4', '#e6f7f3'] },
  attempt: { label: 'Attempt', honey: 0, ink: '#7d8590', glyph: 'A', palette: null },
};

/** Colour along a palette, t in [0,1]. */
function along(pal, t) {
  t = Math.max(0, Math.min(1, t)) * (pal.length - 1);
  const i = Math.min(pal.length - 2, Math.floor(t));
  const k = t - i;
  const h = (c) => [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16));
  const a = h(pal[i]);
  const b = h(pal[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
}

/** Touching pairs (float, with a small tolerance) via a grid; returns [pairs, contactsPerCircle]. */
function contacts(c, r) {
  const n = c.length;
  const cell = 2 * r * 1.01;
  const grid = new Map();
  c.forEach(([x, y], i) => {
    const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  });
  const pairs = [];
  const deg = new Array(n).fill(0);
  const lim = 2 * r * (1 + 1e-6);
  c.forEach(([x, y], i) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${gx + a},${gy + b}`) ?? []) {
      if (j <= i) continue;
      if (Math.hypot(x - c[j][0], y - c[j][1]) <= lim) { pairs.push([i, j]); deg[i]++; deg[j]++; }
    }
  });
  return [pairs, deg];
}

/**
 * The drawing of a solution, fitted to a `size` x `size` box.
 * opts: { tier, mono, radius, contacts (draw the contact graph; default when size >= 300) }
 */
export function drawSolution(problemId, n, solution, size = 400, opts = {}) {
  const tier = TIERS[opts.tier] ?? TIERS.swarm;
  const pal = opts.mono ? null : tier.palette;
  const ink = tier.ink;
  const parts = [];
  const hair = Math.max(0.5, size / 900);
  if (problemId === 'protein-folding-2d') {
    // The fold: backbone, H-H contacts (dashed), H residues filled, P residues open.
    const seq = opts.sequence ?? '';
    const STEP = { R: [1, 0], L: [-1, 0], U: [0, 1], D: [0, -1] };
    const pos = [[0, 0]];
    for (const c of String(solution?.moves ?? '')) { const d = STEP[c]; if (!d) break; const [x, y] = pos.at(-1); pos.push([x + d[0], y + d[1]]); }
    const xs = pos.map((p) => p[0]);
    const ys = pos.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const span = Math.max(x1 - x0, y1 - y0, 1);
    const pad = size * 0.1;
    const k = (size - 2 * pad) / span;
    const X = (x) => pad + (x - x0 + (span - (x1 - x0)) / 2) * k;
    const Y = (y) => pad + (y1 - y + (span - (y1 - y0)) / 2) * k;
    const at = new Map(pos.map((p, i) => [`${p[0]},${p[1]}`, i]));
    let dd = '';
    for (let i = 0; i < pos.length; i++) {
      if (seq[i] !== 'H') continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) { const j = at.get(`${pos[i][0] + dx},${pos[i][1] + dy}`); if (j !== undefined && seq[j] === 'H' && Math.abs(i - j) > 1) dd += `M${f(X(pos[i][0]))} ${f(Y(pos[i][1]))}L${f(X(pos[j][0]))} ${f(Y(pos[j][1]))}`; }
    }
    const col = pal ? along(pal, 0.62) : ink;
    if (dd) parts.push(`<path d="${dd}" stroke="${col}" stroke-width="${f(Math.max(1, k * 0.08))}" stroke-dasharray="${f(k * 0.12)} ${f(k * 0.1)}" stroke-opacity="0.8"/>`);
    parts.push(`<path d="${pos.map((p, i) => `${i ? 'L' : 'M'}${f(X(p[0]))} ${f(Y(p[1]))}`).join('')}" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="${f(Math.max(1.2, k * 0.1))}" stroke-linejoin="round" stroke-linecap="round"/>`);
    const r = Math.max(1.6, k * 0.26);
    pos.forEach(([x, y], i) => {
      if (seq[i] === 'H') parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r)}" fill="${pal ? along(pal, 0.35 + 0.5 * (i / Math.max(1, pos.length - 1))) : ink}"/>`);
      else parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r * 0.8)}" fill="var(--bg, #0c0b09)" stroke="currentColor" stroke-opacity="0.75" stroke-width="${f(Math.max(0.8, k * 0.06))}"/>`);
    });
    if (pos.length) parts.push(`<circle cx="${f(X(pos[0][0]))}" cy="${f(Y(pos[0][1]))}" r="${f(r * 1.6)}" fill="none" stroke="currentColor" stroke-opacity="0.35"/>`);
  } else if (problemId === 'no-three-in-line') {
    const pad = size * 0.07;
    const step = (size - 2 * pad) / Math.max(1, n - 1);
    const pts = solution?.points ?? [];
    // The grid as fine crosses, like graph paper.
    if (n <= 90) {
      const t = Math.max(0.6, Math.min(step * 0.12, 1.6));
      let d = '';
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = pad + i * step; const y = pad + j * step; d += `M${f(x - t)} ${f(y)}h${f(2 * t)}M${f(x)} ${f(y - t)}v${f(2 * t)}`; }
      parts.push(`<path d="${d}" stroke="currentColor" stroke-opacity="0.22" stroke-width="${f(hair)}"/>`);
    }
    const big = Math.max(1.3, Math.min(step * 0.36, 7));
    pts.forEach(([x, y]) => {
      const cx = pad + x * step;
      const cy = pad + (n - 1 - y) * step;
      const col = pal ? along(pal, 0.45 + 0.5 * ((x + y) / Math.max(1, 2 * n - 2))) : ink;
      parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(big * 2.1)}" fill="none" stroke="${col}" stroke-opacity="0.35" stroke-width="${f(hair)}"/>`);
      parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(big)}" fill="${col}"/>`);
    });
  } else {
    const centers = (solution?.centers ?? []).map(([x, y]) => [Number(x), Number(y)]);
    const disc = problemId === 'circles-in-circle';
    const lo = disc ? -1 : 0;
    const span = disc ? 2 : 1;
    const pad = size * 0.05;
    const k = (size - 2 * pad) / span;
    const X = (x) => pad + (x - lo) * k;
    const Y = (y) => pad + (lo + span - y) * k;
    let r = Number(opts.radius ?? 0);
    if (!r && centers.length > 1) {
      let m = Infinity;
      for (let a = 0; a < centers.length; a++) for (let b = a + 1; b < centers.length; b++) m = Math.min(m, Math.hypot(centers[a][0] - centers[b][0], centers[a][1] - centers[b][1]));
      r = m / 2;
    }
    const [pairs, deg] = r ? contacts(centers, r) : [[], []];
    if (disc) parts.push(`<circle cx="${f(X(0))}" cy="${f(Y(0))}" r="${f(k)}" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="${f(hair * 1.4)}"/>`);
    else parts.push(`<rect x="${f(pad)}" y="${f(pad)}" width="${f(k)}" height="${f(k)}" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="${f(hair * 1.4)}"/>`);
    centers.forEach(([x, y], i) => {
      const d = deg[i] ?? 0;
      if (!pal) {
        parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r * k * 0.94)}" fill="none" stroke="${ink}" stroke-width="${f(hair)}"/>`);
        return;
      }
      if (d === 0) {
        // A rattler: free to move, drawn open.
        parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r * k * 0.9)}" fill="none" stroke="${along(pal, 0.95)}" stroke-width="${f(hair * 1.2)}" stroke-dasharray="${f(hair * 3)} ${f(hair * 2)}"/>`);
        return;
      }
      parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r * k * 0.96)}" fill="${along(pal, 0.18 + (Math.min(d, 6) / 6) * 0.72)}"/>`);
    });
    if ((opts.contacts ?? size >= 300) && pal) {
      let dd = '';
      for (const [i, j] of pairs) dd += `M${f(X(centers[i][0]))} ${f(Y(centers[i][1]))}L${f(X(centers[j][0]))} ${f(Y(centers[j][1]))}`;
      if (dd) parts.push(`<path d="${dd}" stroke="${along(pal, 0.05)}" stroke-opacity="0.55" stroke-width="${f(hair * 0.9)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}

/** Corner ticks of a plate frame. */
function ticks(x, y, w, h, len, color) {
  const p = [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]];
  return `<path d="${p.map(([a, b, sx, sy]) => `M${a + sx * len} ${b}H${a}V${b + sy * len}`).join('')}" stroke="${color}" stroke-width="1.5" fill="none"/>`;
}

/** A 600 x 840 trophy card: a plate from the observatory notebook. */
export function trophyCard({ problem, n, solution, tier, author, score, scoreLabel, date, seq, hash, title, credit, sequence }) {
  const t = TIERS[tier] ?? TIERS.valid;
  const art = drawSolution(problem, n, solution, 456, { tier, mono: tier === 'valid', radius: scoreLabel === 'radius' ? Number(score) : undefined, sequence })
    .replace('<svg ', '<svg x="72" y="132" color="#efe8da" ');
  const gold = tier === 'world';
  const defs = `<defs>${gold ? '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset="0.5" stop-color="#d99a1e"><animate attributeName="offset" values="0.15;0.85;0.15" dur="6s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#fff2c4"/></linearGradient>' : ''}<radialGradient id="bg" cx="0.5" cy="0.3" r="0.9"><stop offset="0" stop-color="#1b1914"/><stop offset="1" stop-color="#0b0a08"/></radialGradient><pattern id="hex" width="28" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(0.6)"><path d="M14 0l14 8.1v16.2L14 32.4 0 24.3V8.1zM14 32.4v16.1" fill="none" stroke="#ffffff" stroke-opacity="0.03"/></pattern></defs>`;
  const stroke = gold ? 'url(#g)' : t.ink;
  const label = scoreLabel === 'radius' ? 'r' : scoreLabel === 'energy' ? 'E' : 'points';
  const who = credit ? `${esc(String(credit).slice(0, 38))}, found by @${esc(author)}` : `found by @${esc(author)}`;
  const seal = `<g transform="translate(512 80)"><path d="M0 -26l22.5 13v26L0 26l-22.5-13v-26z" fill="none" stroke="${stroke}" stroke-width="1.6"/><text y="6" text-anchor="middle" fill="${t.ink}" font-size="${t.glyph.length > 1 ? 15 : 18}" font-family="Georgia, serif" font-style="italic">${t.glyph}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840">
${defs}
<rect width="600" height="840" rx="26" fill="url(#bg)"/>
<rect width="600" height="840" rx="26" fill="url(#hex)"/>
<rect x="14" y="14" width="572" height="812" rx="18" fill="none" stroke="${stroke}" stroke-width="${tier === 'valid' ? 1 : 2}" stroke-opacity="${tier === 'valid' ? 0.6 : 1}"/>
<text x="60" y="72" fill="#8b857a" font-size="12" letter-spacing="3" font-family="ui-monospace, Menlo, monospace">KICKSWARM RECORDS</text>
<text x="60" y="94" fill="${t.ink}" font-size="12" letter-spacing="3" font-family="ui-monospace, Menlo, monospace">${esc(t.label.toUpperCase())}</text>
${seal}
${ticks(60, 120, 480, 480, 14, '#6f6a60')}
${art}
<text x="60" y="648" fill="#8b857a" font-size="14" font-family="Georgia, serif" font-style="italic">Fig. ${esc(seq)}</text>
<text x="60" y="682" fill="#f4efe6" font-size="29" font-family="Georgia, serif">${esc(title)}, <tspan font-style="italic">n</tspan> = ${esc(n)}</text>
<text x="60" y="722" fill="${t.ink}" font-size="21" font-family="ui-monospace, Menlo, monospace">${label} = ${esc(score)}</text>
<text x="60" y="760" fill="#d9d2c4" font-size="17" font-family="Georgia, serif" font-style="italic">${who}</text>
<line x1="60" y1="784" x2="540" y2="784" stroke="#2c2820"/>
<text x="60" y="806" fill="#6f6a60" font-size="11" font-family="ui-monospace, Menlo, monospace">${esc(date)} · registry ${esc(String(hash).slice(0, 16))}</text>
<text x="540" y="806" fill="#6f6a60" font-size="11" text-anchor="end" font-family="ui-monospace, Menlo, monospace">sciscito.github.io/kickswarm-records</text>
</svg>`;
}
