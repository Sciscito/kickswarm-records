// Drawings of solutions and trophy cards, as SVG strings. Same code in the browser and in the robot.
// The solution itself is the artwork: its geometry decides the picture, so every card is unique.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f = (x) => (Math.round(x * 100) / 100).toString();

/** A stable pseudo-random number from a string (for per-solution palettes). */
function seed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export const TIERS = {
  valid: { label: 'Valid', honey: 1, ink: '#e8e2d6', hue: null },
  swarm: { label: 'Swarm record', honey: 10, ink: '#f2b33d', hue: 38 },
  perfect: { label: 'Perfect', honey: 25, ink: '#b98cff', hue: 268 },
  world: { label: 'World record', honey: 100, ink: '#ffd36b', hue: 45 },
  reference: { label: 'Published record', honey: 0, ink: '#9aa4b2', hue: 210 },
  attempt: { label: 'Attempt', honey: 0, ink: '#7d8590', hue: null },
};

/**
 * The drawing of a solution, fitted to a `size` x `size` box.
 * opts: { mono: boolean, hue: number, salt: string, background: boolean }
 */
export function drawSolution(problemId, n, solution, size = 400, opts = {}) {
  const salt = opts.salt ?? '';
  const base = opts.hue ?? Math.floor(seed(salt) * 360);
  const mono = !!opts.mono;
  const spread = opts.hue !== undefined ? 0.3 : 1; // a tier colour stays close to its hue
  const parts = [];
  if (problemId === 'no-three-in-line') {
    const pad = size * 0.06;
    const step = (size - 2 * pad) / Math.max(1, n - 1);
    const dot = Math.max(0.6, Math.min(step * 0.12, 2));
    const pts = solution?.points ?? [];
    // Faint grid of all positions, then the chosen points.
    if (n <= 90) {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) parts.push(`<circle cx="${f(pad + i * step)}" cy="${f(pad + j * step)}" r="${f(dot)}" fill="currentColor" opacity="0.18"/>`);
    }
    const big = Math.max(1.4, Math.min(step * 0.42, 7));
    pts.forEach(([x, y], k) => {
      const col = mono ? '#f4efe6' : `hsl(${(base + ((x / n) * 60 + (y / n) * 60) * spread) % 360} 85% 62%)`;
      parts.push(`<circle cx="${f(pad + x * step)}" cy="${f(pad + (n - 1 - y) * step)}" r="${f(big)}" fill="${col}"/>`);
      if (!mono && k % 1 === 0) parts.push(`<circle cx="${f(pad + x * step)}" cy="${f(pad + (n - 1 - y) * step)}" r="${f(big * 2.2)}" fill="${col}" opacity="0.12"/>`);
    });
  } else {
    const centers = (solution?.centers ?? []).map(([x, y]) => [Number(x), Number(y)]);
    const disc = problemId === 'circles-in-circle';
    // World coordinates: square [0,1]^2, or disc [-1,1]^2.
    const lo = disc ? -1 : 0;
    const span = disc ? 2 : 1;
    const pad = size * 0.04;
    const k = (size - 2 * pad) / span;
    const X = (x) => pad + (x - lo) * k;
    const Y = (y) => pad + (lo + span - y) * k;
    let r = Number(opts.radius ?? 0);
    if (!r && centers.length > 1) {
      let m = Infinity;
      for (let a = 0; a < Math.min(centers.length, 2000); a++)
        for (let b = a + 1; b < centers.length; b++) {
          const dx = centers[a][0] - centers[b][0];
          const dy = centers[a][1] - centers[b][1];
          m = Math.min(m, dx * dx + dy * dy);
        }
      r = Math.sqrt(m) / 2;
    }
    if (disc) parts.push(`<circle cx="${f(X(0))}" cy="${f(Y(0))}" r="${f(k)}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="${f(Math.max(1, size / 400))}"/>`);
    else parts.push(`<rect x="${f(pad)}" y="${f(pad)}" width="${f(k)}" height="${f(k)}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="${f(Math.max(1, size / 400))}"/>`);
    centers.forEach(([x, y]) => {
      const ang = disc ? Math.atan2(y, x) : Math.atan2(y - 0.5, x - 0.5);
      const rad = disc ? Math.hypot(x, y) : Math.hypot(x - 0.5, y - 0.5) * 1.41;
      const col = mono ? 'none' : `hsl(${(base + ((ang / Math.PI) * 14 + rad * 34) * spread + 360) % 360} ${58 + rad * 16}% ${40 + rad * 24}%)`;
      const stroke = mono ? '#f4efe6' : 'none';
      parts.push(`<circle cx="${f(X(x))}" cy="${f(Y(y))}" r="${f(r * k * 0.97)}" fill="${col}" stroke="${stroke}" stroke-width="${mono ? f(Math.max(0.5, size / 900)) : 0}"/>`);
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}

/** A 600 x 840 trophy card for a registry entry. */
export function trophyCard({ problem, n, solution, tier, author, score, scoreLabel, date, seq, hash, title }) {
  const t = TIERS[tier] ?? TIERS.valid;
  const salt = `${problem}|${n}|${author}|${seq}`;
  const art = drawSolution(problem, n, solution, 480, { mono: tier === 'valid', hue: t.hue ?? undefined, salt })
    .replace('<svg ', '<svg x="60" y="120" color="#f4efe6" ');
  const gold = tier === 'world';
  const frame = gold
    ? `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset="0.5" stop-color="#e0a526"><animate attributeName="offset" values="0.2;0.8;0.2" dur="6s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#fff2c4"/></linearGradient>`
    : '';
  const stroke = gold ? 'url(#g)' : t.ink;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840" font-family="Georgia, 'Times New Roman', serif">
<defs>${frame}<radialGradient id="bg" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#1d1a14"/><stop offset="1" stop-color="#0b0a08"/></radialGradient></defs>
<rect width="600" height="840" rx="28" fill="url(#bg)"/>
<rect x="12" y="12" width="576" height="816" rx="20" fill="none" stroke="${stroke}" stroke-width="${tier === 'valid' ? 1.5 : 3}"/>
<text x="60" y="78" fill="${t.ink}" font-size="15" letter-spacing="4" font-family="ui-monospace, Menlo, monospace">${esc(t.label.toUpperCase())}</text>
<text x="540" y="78" fill="#8b857a" font-size="15" text-anchor="end" font-family="ui-monospace, Menlo, monospace">#${esc(seq)}</text>
${art}
<text x="60" y="660" fill="#f4efe6" font-size="30">${esc(title)} · n = ${esc(n)}</text>
<text x="60" y="700" fill="${t.ink}" font-size="22" font-family="ui-monospace, Menlo, monospace">${esc(scoreLabel)} ${esc(score)}</text>
<text x="60" y="748" fill="#f4efe6" font-size="22">@${esc(author)}</text>
<text x="60" y="790" fill="#8b857a" font-size="13" font-family="ui-monospace, Menlo, monospace">${esc(date)} · registry ${esc(String(hash).slice(0, 16))}</text>
<text x="540" y="790" fill="#8b857a" font-size="13" text-anchor="end" font-family="ui-monospace, Menlo, monospace">KICKSWARM RECORDS</text>
</svg>`;
}
