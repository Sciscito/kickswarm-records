// The living hero: a swarm of circles packing itself in real time, the way the hive hunts a record.
// Soft-disk physics: every disc grows until the crowd jams, overlaps push apart, the pointer scatters
// them, and every few seconds a part of the crowd is shaken and settles again. Shading follows the
// number of contacts, like the plates; contacts are drawn as hairlines.

const PAL = [[61, 35, 6], [148, 85, 12], [225, 158, 44], [246, 207, 124], [255, 240, 204]];
const along = (t) => {
  t = Math.max(0, Math.min(1, t)) * (PAL.length - 1);
  const i = Math.min(PAL.length - 2, Math.floor(t));
  const k = t - i;
  return PAL[i].map((v, j) => Math.round(v + (PAL[i + 1][j] - v) * k));
};

export function startHero(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, N = 0, r = 0;
  let X, Y, VX, VY;
  const pointer = { x: -1e4, y: -1e4, active: false };
  let raf = 0;
  let running = true;

  function setup() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Target: enough discs to read as a crowd, few enough to stay smooth on a phone.
    N = Math.round(Math.min(520, Math.max(160, (W * H) / (W < 700 ? 900 : 2600))));
    r = Math.sqrt((W * H * 0.86) / (N * Math.PI * 1.1)) * 0.6; // start loose, grow to jam
    X = new Float32Array(N); Y = new Float32Array(N); VX = new Float32Array(N); VY = new Float32Array(N);
    for (let i = 0; i < N; i++) { X[i] = Math.random() * W; Y[i] = Math.random() * H; }
  }

  const target = () => Math.sqrt((W * H * 0.845) / (N * Math.PI)); // jammed: about 84% of the area covered
  let kickAt = performance.now() + 7000;

  function step(now) {
    const R = target();
    r += (R - r) * 0.035;
    if (now && now > kickAt) {
      // Shake one region: the swarm tries another arrangement there.
      const cx = Math.random() * W, cy = Math.random() * H, rad = Math.min(W, H) * 0.22;
      for (let i = 0; i < N; i++) { const dx = X[i] - cx, dy = Y[i] - cy; if (dx * dx + dy * dy < rad * rad) { VX[i] += (Math.random() - 0.5) * 6; VY[i] += (Math.random() - 0.5) * 6; } }
      kickAt = now + 6000 + Math.random() * 4000;
    }
    const cell = 2 * r;
    const cols = Math.ceil(W / cell) + 1;
    const grid = new Map();
    for (let i = 0; i < N; i++) {
      const k = Math.floor(Y[i] / cell) * cols + Math.floor(X[i] / cell);
      const a = grid.get(k);
      if (a) a.push(i); else grid.set(k, [i]);
    }
    const deg = new Uint8Array(N);
    const lines = [];
    for (let i = 0; i < N; i++) {
      const gx = Math.floor(X[i] / cell), gy = Math.floor(Y[i] / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = grid.get((gy + b) * cols + gx + a);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const dx = X[j] - X[i], dy = Y[j] - Y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 >= cell * cell) continue;
          const d = Math.sqrt(d2) || 0.001;
          const o = 2 * r - d;
          if (o > 0) {
            const ux = dx / d, uy = dy / d, f = o * 0.18;
            VX[i] -= ux * f; VY[i] -= uy * f; VX[j] += ux * f; VY[j] += uy * f;
          }
          if (d < 2 * r * 1.04) { deg[i]++; deg[j]++; lines.push(i, j); }
        }
      }
    }
    for (let i = 0; i < N; i++) {
      if (pointer.active) {
        const dx = X[i] - pointer.x, dy = Y[i] - pointer.y;
        const d2 = dx * dx + dy * dy, R2 = 110 * 110;
        if (d2 < R2) { const d = Math.sqrt(d2) || 1, f = (1 - d / 110) * 2.2; VX[i] += (dx / d) * f; VY[i] += (dy / d) * f; }
      }
      VX[i] *= 0.82; VY[i] *= 0.82;
      X[i] += VX[i]; Y[i] += VY[i];
      if (X[i] < r) { X[i] = r; VX[i] *= -0.3; } else if (X[i] > W - r) { X[i] = W - r; VX[i] *= -0.3; }
      if (Y[i] < r) { Y[i] = r; VY[i] *= -0.3; } else if (Y[i] > H - r) { Y[i] = H - r; VY[i] *= -0.3; }
    }
    return { deg, lines };
  }

  function draw({ deg, lines }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const d = deg[i];
      ctx.beginPath();
      ctx.arc(X[i], Y[i], r * 0.95, 0, Math.PI * 2);
      if (d === 0) {
        ctx.strokeStyle = 'rgba(255,240,204,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const [R, G, B] = along(0.12 + (Math.min(d, 6) / 6) * 0.75);
        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(30,18,4,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < lines.length; k += 2) { const i = lines[k], j = lines[k + 1]; ctx.moveTo(X[i], Y[i]); ctx.lineTo(X[j], Y[j]); }
    ctx.stroke();
  }

  function frame(now) {
    if (!running) return;
    const s = step(now);
    draw(s);
    raf = requestAnimationFrame(frame);
  }

  setup();
  // Settle before the first paint, so the swarm appears already packed.
  r = target() * 0.85;
  for (let k = 0; k < 160; k++) step(0);
  if (reduce) {
    for (let k = 0; k < 400; k++) step(performance.now());
    draw(step(performance.now()));
  } else raf = requestAnimationFrame(frame);

  const onMove = (e) => { const b = canvas.getBoundingClientRect(); pointer.x = e.clientX - b.left; pointer.y = e.clientY - b.top; pointer.active = true; };
  const onLeave = () => { pointer.active = false; };
  canvas.parentElement.addEventListener('pointermove', onMove);
  canvas.parentElement.addEventListener('pointerleave', onLeave);
  const ro = new ResizeObserver(() => { const w = canvas.clientWidth, h = canvas.clientHeight; if (Math.abs(w - W) > 40 || Math.abs(h - H) > 40) { setup(); r = target() * 0.85; for (let k = 0; k < 160; k++) step(0); } });
  ro.observe(canvas);
  const vis = new IntersectionObserver(([e]) => { const was = running; running = e.isIntersecting && !reduce; if (running && !was) raf = requestAnimationFrame(frame); });
  vis.observe(canvas);
  return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); vis.disconnect(); };
}
