// The planet of a hunt, in pixel art: thousands of small hex tiles in relief on a globe. Each case of the hunt is a
// territory (a region of tiles) in the colour of the hunter who holds its record. Tiles jump when a territory is
// taken or attacked, embers and smoke rise over the fights, live agents fly around as pixel bees, and beams of
// honey show where your own computing power goes. Plain canvas 2D, no dependency.

const S3 = Math.sqrt(3);
const W = 480, P = 178, CX = W / 2, CY = W / 2 + 2, S = 3.8, SPAN = 0.985;
const POP = { life: 0.9, rise: 9 };
const popH = (a) => (a < 0.12 ? a / 0.12 : Math.max(-0.08, Math.exp(-(a - 0.12) * 6.5) * Math.cos((a - 0.12) * 15)) * (1 - Math.min(1, a / POP.life)));

function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, y) => noise(x, y) * 0.6 + noise(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + noise(x * 4.3 + 11, y * 4.3 + 3) * 0.1;
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c, f = 1) => `rgb(${cl(c[0] * f)},${cl(c[1] * f)},${cl(c[2] * f)})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
let probe;
function toRgb(css) {
  probe ??= document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000'; probe.fillStyle = css;
  const v = probe.fillStyle;
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const m = v.match(/[\d.]+/g) ?? [0, 0, 0];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
// Pixel sprites (one char = one pixel).
const SPR = {
  crown: ['1..1..1', '11.1.11', '1111111', '1111111', '.11111.'],
  star: ['..1..', '.111.', '11111', '.111.', '1...1'],
  bee: ['..ww.ww.', '..wwwww.', '.bkbkbk.', 'bkbkbkbo', '.bkbkbk.'],
};
function sprite(g, rows, x, y, cols, px = 2, flip = false) {
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][flip ? w - 1 - i : i];
    if (ch === '.' || !cols[ch]) continue;
    g.fillStyle = cols[ch];
    g.fillRect(Math.round(x + i * px), Math.round(y + j * px), px, px);
  }
}

/**
 * Mount a planet on a canvas.
 * regions: [{ label, color (css or null for wild), mine, friend, crown: 'world'|'perfect'|null }]
 * Returns { setLive(attacks, myTargets), ripple(region, css), destroy() }.
 */
export function mountPlanet(cv, { regions, onPick, onHover, compact = false }) {
  cv.width = W; cv.height = W;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = Math.max(1, regions.length);
  const Rs = P * 0.74, spacing = (Rs * 1.77) / Math.sqrt(n), warp = spacing * 0.55;
  const seeds = regions.map((_, i) => { const rr = n === 1 ? 0 : Rs * Math.sqrt((i + 0.5) / n); const a = i * 2.399963; return [rr * Math.cos(a), rr * Math.sin(a)]; });
  function regionAt(x, y) {
    const wx = x + (fbm(x / 40, y / 40) - 0.5) * warp * 2, wy = y + (fbm(x / 40 + 31, y / 40 + 17) - 0.5) * warp * 2;
    let best = -1, bd = 1e9;
    for (let j = 0; j < seeds.length; j++) { const d = Math.hypot(wx - seeds[j][0], wy - seeds[j][1]); if (d < bd) { bd = d; best = j; } }
    const coast = spacing * 0.68 + (fbm(x / 26 + 7, y / 26 + 3) - 0.5) * spacing * 0.6;
    return bd < coast ? best : -1;
  }
  const proj = (fx, fy) => { const rho = Math.hypot(fx, fy); if (!rho) return [CX, CY, 1]; const th = (rho / P) * (Math.PI / 2) * SPAN; const k = (Math.sin(th) * P) / rho; return [CX + fx * k, CY + fy * k, Math.cos(th)]; };
  const L = (() => { const v = [-0.42, -0.55, 0.72], l = Math.hypot(...v); return v.map((x) => x / l); })();

  // ---- the tiles ----
  const cells = [], idx = new Map();
  const N = Math.ceil(P / (1.5 * S)) + 1;
  for (let r = -N; r <= N; r++) for (let q = -2 * N; q <= 2 * N; q++) {
    const fx = S * S3 * (q + r / 2), fy = 1.5 * S * r;
    if (Math.hypot(fx, fy) > P - S * 0.3) continue;
    idx.set(`${q},${r}`, cells.length);
    const [sx, sy, cz] = proj(fx, fy);
    const poly = Array.from({ length: 6 }, (_, i) => { const a = ((-90 + 60 * i) * Math.PI) / 180; return proj(fx + Math.cos(a) * S * 1.03, fy + Math.sin(a) * S * 1.03); });
    const d = (L[0] * (sx - CX)) / P + (L[1] * (sy - CY)) / P + L[2] * cz;
    cells.push({ q, r, fx, fy, sx, sy, cz, poly, bright: 0.4 + 0.8 * Math.max(0, d), reg: regionAt(fx, fy), t: fbm(fx / 34 + 50, fy / 34 + 50), tri: ((q - r) % 3 + 3) % 3 });
  }
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const c of cells) c.nb = DIRS.map(([a, b]) => idx.get(`${c.q + a},${c.r + b}`) ?? -1);
  // Every territory gets at least its seed tile.
  regions.forEach((_, j) => {
    if (cells.some((c) => c.reg === j)) return;
    let best = null, bd = 1e9;
    for (const c of cells) { const dd = Math.hypot(c.fx - seeds[j][0], c.fy - seeds[j][1]); if (dd < bd) { bd = dd; best = c; } }
    if (best) best.reg = j;
  });
  // Sea depth (distance to land, in tiles).
  const depth = cells.map((c) => (c.reg >= 0 ? 0 : 99));
  let front = cells.map((c, i) => (c.reg >= 0 ? i : -1)).filter((i) => i >= 0);
  for (let dd = 1; dd <= 4 && front.length; dd++) {
    const nx = [];
    for (const i of front) for (const m of cells[i].nb) if (m >= 0 && depth[m] > dd) { depth[m] = dd; nx.push(m); }
    front = nx;
  }
  const byReg = regions.map(() => []);
  cells.forEach((c, i) => { if (c.reg >= 0) byReg[c.reg].push(i); });
  const cent = byReg.map((list) => { if (!list.length) return [CX, CY]; let x = 0, y = 0; for (const i of list) { x += cells[i].sx; y += cells[i].sy; } return [x / list.length, y / list.length]; });
  const regRgb = regions.map((r) => (r.color ? toRgb(r.color) : null));
  const order = cells.map((_, i) => i).sort((a, b) => cells[a].sy - cells[b].sy);

  let hover = -1;
  function look(i) {
    const c = cells[i];
    const triF = [1, 0.95, 1.05][c.tri];
    if (c.reg < 0) {
      const dp = depth[i];
      const col = dp === 1 ? [96, 196, 238] : dp === 2 ? [58, 146, 224] : dp === 3 ? [42, 112, 206] : [30, 84, 184];
      return { col: col.map((v) => v * triF), z: 0 };
    }
    const R = regions[c.reg], own = regRgb[c.reg];
    let col = own ? own.map((v) => v * (1 + (c.t - 0.5) * 0.14)) : c.t < 0.45 ? [88, 152, 66] : c.t < 0.62 ? [118, 170, 74] : [182, 166, 104];
    col = col.map((v) => v * triF);
    let coast = false, otherReg = false, otherOwner = false;
    for (const m of c.nb) {
      if (m < 0) continue;
      const o = cells[m].reg;
      if (o < 0) coast = true;
      else if (o !== c.reg) { otherReg = true; if ((regions[o].color || '') !== (R.color || '')) otherOwner = true; }
    }
    if (own && (R.mine || R.friend) && (coast || otherReg)) col = mix(col, R.mine ? [255, 240, 190] : [255, 255, 255], 0.5);
    else if (otherOwner && own) col = col.map((v) => v * 0.55);
    else if (otherReg) col = col.map((v) => v * 0.78);
    else if (coast) col = col.map((v) => v * 0.86);
    let z = (own ? 2.4 : 1.6) * c.cz;
    if (c.reg === hover) { col = col.map((v) => v * 1.2); z += 1.6 * c.cz; }
    return { col, z };
  }
  function drawCell(g, i, col, z) {
    const c = cells[i], p = c.poly, b = c.bright;
    if (z > 0.4) {
      const sides = [[1, 2, 0.62], [2, 3, 0.5], [3, 4, 0.58], [4, 5, 0.72]];
      for (const [a, e, f] of sides) {
        g.fillStyle = rgb(col, b * f);
        g.beginPath(); g.moveTo(p[a][0], p[a][1]); g.lineTo(p[e][0], p[e][1]); g.lineTo(p[e][0], p[e][1] - z); g.lineTo(p[a][0], p[a][1] - z); g.closePath(); g.fill();
      }
    }
    g.fillStyle = rgb(col, b);
    g.beginPath(); p.forEach(([x, y], k) => (k ? g.lineTo(x, y - z) : g.moveTo(x, y - z))); g.closePath(); g.fill();
  }

  // ---- static layers ----
  const space = document.createElement('canvas'); space.width = W; space.height = W;
  {
    const g = space.getContext('2d');
    g.fillStyle = '#05060f'; g.fillRect(0, 0, W, W);
    const neb = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); };
    neb(W * 0.85, W * 0.9, W * 0.55, 'rgba(70,30,140,.45)');
    neb(W * 0.1, W * 0.05, W * 0.5, 'rgba(20,50,120,.4)');
    for (let k = 0; k < 140; k++) { const x = hash(k, 1) * W, y = hash(k, 2) * W; if (Math.hypot(x - CX, y - CY) < P + 10) continue; g.fillStyle = `rgba(225,235,255,${0.3 + hash(k, 3) * 0.7})`; const s = hash(k, 4) > 0.85 ? 2 : 1; g.fillRect(Math.round(x), Math.round(y), s, s); }
    const at = g.createRadialGradient(CX, CY, P * 0.97, CX, CY, P * 1.16);
    at.addColorStop(0, 'rgba(140,215,255,.85)'); at.addColorStop(0.35, 'rgba(90,170,255,.35)'); at.addColorStop(1, 'rgba(60,120,255,0)');
    g.fillStyle = at; g.beginPath(); g.arc(CX, CY, P * 1.16, 0, Math.PI * 2); g.fill();
  }
  const base = document.createElement('canvas'); base.width = W; base.height = W;
  function paintBase() {
    const g = base.getContext('2d');
    g.clearRect(0, 0, W, W);
    g.drawImage(space, 0, 0);
    g.fillStyle = '#123c8c'; g.beginPath(); g.arc(CX, CY, P, 0, Math.PI * 2); g.fill();
    for (const i of order) { const { col, z } = look(i); drawCell(g, i, col, z); }
    g.strokeStyle = 'rgba(180,225,255,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(CX, CY, P + 0.5, 0, Math.PI * 2); g.stroke();
  }
  paintBase();

  // ---- live state ----
  let pops = []; // { i, t0, flash }
  let parts = []; // embers and smoke
  let attacks = []; // [{ region, agents: [{ color, me }] }]
  let targets = [];
  const t00 = performance.now() / 1000;
  if (!reduce) for (const i of order) { const c = cells[i]; if (c.reg >= 0) pops.push({ i, t0: t00 + 0.1 + Math.hypot(c.fx, c.fy) * 0.0042 }); }
  const acc = new Map();
  const HX = CX - P * 0.9, HY = CY + P * 0.9;

  function ripple(region, css) {
    if (reduce || region == null || !byReg[region]) return;
    const now = performance.now() / 1000, col = css ? toRgb(css) : null, [cx, cy] = cent[region];
    for (const i of byReg[region]) pops.push({ i, t0: now + Math.hypot(cells[i].sx - cx, cells[i].sy - cy) * 0.012, flash: col });
  }
  function frame() {
    if (!cv.isConnected) return; // the page changed: stop
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - (frame.last ?? now)); frame.last = now;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0);
    // Fights: tiles of attacked territories jump now and then, embers rise from them.
    if (!reduce) for (const a of attacks) {
      const list = byReg[a.region]; if (!list?.length) continue;
      const rate = Math.min(12, 3 * a.agents.length);
      const v = (acc.get(a.region) ?? 0) + rate * dt;
      let k = Math.floor(v); acc.set(a.region, v - k);
      while (k-- > 0) {
        const i = list[Math.floor(Math.random() * list.length)], ag = a.agents[Math.floor(Math.random() * a.agents.length)];
        pops.push({ i, t0: now, flash: toRgb(ag.color) });
        const c = cells[i];
        parts.push({ x: c.sx, y: c.sy - 3, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 12, age: 0, life: 1.3, smoke: false, spin: Math.random() * 6 });
        if (Math.random() < 0.5) parts.push({ x: c.sx, y: c.sy - 3, vx: (Math.random() - 0.5) * 5, vy: -8 - Math.random() * 6, age: -0.3, life: 2.2, smoke: true, spin: Math.random() * 6 });
      }
    }
    // Jumping tiles (sorted back to front).
    pops = pops.filter((p) => now - p.t0 < POP.life);
    const live = pops.filter((p) => now >= p.t0).sort((a, b) => cells[a.i].sy - cells[b.i].sy);
    for (const p of live) {
      const age = now - p.t0, h = popH(age);
      if (h < 0.02) continue;
      const { col, z } = look(p.i), fl = Math.max(0, 1 - age / 0.35);
      let top = p.flash ? mix(col, p.flash, 0.6) : col;
      top = mix(top, [255, 255, 255], (0.15 + 0.45 * fl) * (p.flash ? 1 : 0.5));
      drawCell(ctx, p.i, top, z + POP.rise * h * cells[p.i].cz);
    }
    // Embers and smoke: small spinning hexagons.
    parts = parts.filter((q) => q.age < q.life);
    for (const q of parts) {
      q.age += dt; if (q.age < 0) continue;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const u = q.age / q.life, r = q.smoke ? 2 + u * 4 : 1.8 * (1 - u * 0.5), an = q.spin + q.age * (q.smoke ? 0.8 : 4);
      const flick = 0.5 + 0.5 * Math.sin(now * 22 + q.spin * 9);
      ctx.fillStyle = q.smoke ? `rgba(${cl(90 + 60 * (1 - u))},${cl(86 + 60 * (1 - u))},${cl(95 + 60 * (1 - u))},${0.7 * (1 - u)})` : rgb(mix([255, 110, 20], [255, 225, 120], flick));
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = an + (k * Math.PI) / 3, x = q.x + Math.cos(a) * r, y = q.y + Math.sin(a) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
    }
    // Beams of honey: where your computing power goes.
    for (const reg of targets) {
      const [tx, ty] = cent[reg]; if (tx == null) continue;
      const len = Math.hypot(tx - HX, ty - HY), ux = (tx - HX) / len, uy = (ty - HY) / len;
      for (let d = 14; d < len - 6; d += 4) {
        if (((d - now * 60) % 16 + 16) % 16 > 7) continue;
        ctx.fillStyle = d % 8 < 4 ? '#ffd66e' : '#f2b33d';
        ctx.fillRect(Math.round(HX + ux * d) - 1, Math.round(HY + uy * d) - 1, 3, 3);
      }
    }
    // Labels, crowns.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${compact ? 8 : 8}px Silkscreen, monospace`;
    regions.forEach((R, j) => {
      if (!byReg[j].length) return;
      const [x, y0] = cent[j], y = Math.round(y0 - 3);
      if (!compact || n <= 20) {
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,20,.9)'; ctx.strokeText(R.label, Math.round(x), y);
        ctx.fillStyle = R.color ? '#ffffff' : '#e9f5d8'; ctx.fillText(R.label, Math.round(x), y);
      }
      if (R.crown) { const s = R.crown === 'world' ? SPR.crown : SPR.star; sprite(ctx, s, x - s[0].length, y - 18, { 1: '#ffd34d' }, 2); }
    });
    // Pixel bees flying around the territories they attack. A crowd is summarised so a big swarm never
    // slows the page: you and your friends first (with your names), then up to a few others, then "+N".
    let drawn = 0;
    const tags = [];
    for (const a of attacks) {
      const [x, y] = cent[a.region] ?? []; if (x == null) continue;
      const list = [...a.agents].sort((p2, q2) => (q2.me - p2.me) || (q2.friend - p2.friend));
      const vip = list.filter((ag) => ag.me || ag.friend);
      const room = Math.max(vip.length, Math.min(6, 60 - drawn));
      const show = list.slice(0, room);
      const rest = list.length - show.length;
      show.forEach((ag, k) => {
        const ang = now * (1.4 + (k % 3) * 0.25) + (k * Math.PI * 2) / Math.max(1, show.length) + a.region;
        const rad = 14 + (k % 3) * 5;
        const bx = x + Math.cos(ang) * rad, by = y - 6 + Math.sin(ang) * rad * 0.55 + Math.sin(now * 9 + k) * 1.2;
        sprite(ctx, SPR.bee, bx - 8, by - 5, { w: 'rgba(235,245,255,.85)', b: ag.color, k: '#15120c', o: '#000' }, ag.me || ag.friend ? 2 : 1.4, Math.sin(ang) > 0);
        if ((ag.me || ag.friend) && ag.name) tags.push([bx, by - 9, ag.me ? 'YOU' : ag.name.slice(0, 10).toUpperCase(), ag.color]);
      });
      drawn += show.length;
      if (rest > 0) {
        const label = `+${rest}`;
        ctx.font = '8px Silkscreen, monospace';
        const w2 = ctx.measureText(label).width + 6;
        ctx.fillStyle = '#0c0b09'; ctx.fillRect(Math.round(x + 14), Math.round(y - 22), Math.round(w2), 11);
        ctx.fillStyle = '#ffd34d'; ctx.fillText(label, Math.round(x + 14 + w2 / 2), Math.round(y - 16));
      }
    }
    for (const [tx, ty, label, color] of tags) {
      ctx.font = '8px Silkscreen, monospace';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,20,.95)'; ctx.strokeText(label, Math.round(tx), Math.round(ty));
      ctx.fillStyle = color; ctx.fillText(label, Math.round(tx), Math.round(ty));
    }
    // Your hive.
    if (targets.length || compact === false) {
      ctx.fillStyle = '#0c0b09'; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = ((-90 + 60 * k) * Math.PI) / 180; const x = HX + Math.cos(a) * 15, y = HY + Math.sin(a) * 15; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = targets.length ? '#f2b33d' : '#7a6a48'; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = ((-90 + 60 * k) * Math.PI) / 180; const x = HX + Math.cos(a) * 12.5, y = HY + Math.sin(a) * 12.5; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.font = '8px Silkscreen, monospace'; ctx.fillStyle = '#0c0b09'; ctx.fillText('YOU', HX, HY + 1);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.fonts?.load?.('8px Silkscreen').catch(() => {});

  // ---- pointer ----
  function pick(e) {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width - CX, y = ((e.clientY - r.top) * W) / r.height - CY;
    const rr = Math.hypot(x, y) / P;
    if (rr >= 1) return -1;
    const th = Math.asin(rr), rho = (th / ((Math.PI / 2) * SPAN)) * P, k = rho / (rr * P || 1);
    return regionAt(x * k, y * k);
  }
  cv.addEventListener('pointermove', (e) => {
    const j = pick(e);
    cv.style.cursor = j >= 0 ? 'pointer' : 'default';
    if (j !== hover) { hover = j; paintBase(); }
    onHover?.(j >= 0 ? j : null, e);
  });
  cv.addEventListener('pointerleave', () => { if (hover !== -1) { hover = -1; paintBase(); } onHover?.(null); });
  cv.addEventListener('click', (e) => { const j = pick(e); if (j >= 0) { ripple(j, regions[j].color); onPick?.(j); } });

  return {
    setLive(a, mine) { attacks = a ?? []; targets = mine ?? []; },
    ripple,
  };
}
