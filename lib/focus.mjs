// Which hunt a hive works on. Universal (Node and browser).
// While computing power is scarce, a swarm advances by working TOGETHER: by default ("follow the swarm")
// every hive goes where its friends are, else where most hunters are right now, else to the common hunt
// of the moment (config.focus). People who want to choose can give each hunt a share (a percentage);
// spreading over every hunt is a choice, never the default.

/** The mode of a hive's settings: 'swarm' (default), 'pick' (shares per hunt) or 'all'. */
export function huntMode(settings = {}) {
  if (['swarm', 'pick', 'all'].includes(settings.mode)) return settings.mode;
  return settings.problems?.length ? 'pick' : 'swarm';
}

/** The hunt the swarm works on now. */
export function focusHunt({ problems = [], hunters = [], me = null, friends = [], fallback = null }) {
  const ids = new Set(problems.map((p) => p.id));
  const tally = (list) => {
    const n = {};
    for (const h of list) for (const a of h.agents ?? []) if (ids.has(a.problem)) n[a.problem] = (n[a.problem] ?? 0) + 1;
    return Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  const others = hunters.filter((h) => h.name !== me && (h.agents ?? []).length);
  const byFriends = tally(others.filter((h) => friends.includes(h.name)));
  if (byFriends) return { id: byFriends, why: 'friends' };
  const byCrowd = tally(others);
  if (byCrowd) return { id: byCrowd, why: 'crowd' };
  const f = ids.has(fallback) ? fallback : problems.find((p) => p.flagship)?.id ?? problems[0]?.id ?? null;
  return { id: f, why: 'common' };
}

/** The shares of 'pick' mode, as { pid: weight } (missing weights count as equal shares). */
export function shares(settings = {}, problems = []) {
  const chosen = (settings.problems?.length ? settings.problems : problems.map((p) => p.id)).filter((id) => problems.some((p) => p.id === id));
  const w = settings.weights ?? {};
  const out = {};
  for (const id of chosen) out[id] = Math.max(0, Number(w[id] ?? 50));
  if (!Object.values(out).some((v) => v > 0)) for (const id of chosen) out[id] = 1;
  return out;
}

/** The hunt for the next mission (undefined = any hunt), and the focus when following the swarm. */
export function nextHunt(settings, ctx, rnd = Math.random) {
  const mode = huntMode(settings);
  if (mode === 'all') return { pid: undefined, focus: null };
  if (mode === 'pick') {
    const sh = Object.entries(shares(settings, ctx.problems)).filter(([, v]) => v > 0);
    const total = sh.reduce((t, [, v]) => t + v, 0);
    let x = rnd() * total;
    for (const [id, v] of sh) { x -= v; if (x <= 0) return { pid: id, focus: null }; }
    return { pid: sh[0]?.[0], focus: null };
  }
  const f = focusHunt(ctx);
  return { pid: f.id ?? undefined, focus: f };
}
