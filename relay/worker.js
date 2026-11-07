// Kickswarm Records relay (Cloudflare Worker + KV, free tier): submissions WITHOUT any account.
// It holds no secret at all. It accepts only solutions signed by a device key (see lib/keys.mjs), checks
// the signature, and keeps them in a public queue for 14 days. The GitHub robot reads the queue every
// few minutes and judges each submission like any other; the registry remembers which ones it handled.
//
// Bindings: QUEUE (KV namespace). Vars: ALLOWED_ORIGIN (the site's origin).

const enc = (s) => new TextEncoder().encode(s);
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;
const PROBLEMS = ['circles-in-square', 'circles-in-circle', 'no-three-in-line'];
const PER_KEY_PER_DAY = 300;

async function verify(sub) {
  const { sig, ...body } = sub;
  const h = body.hunter;
  if (!h || !NAME_RE.test(h.name ?? '') || typeof h.key !== 'string' || typeof sig !== 'string') return false;
  try {
    const key = await crypto.subtle.importKey('raw', unb64(h.key), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64(sig), enc(canonical(body)));
  } catch {
    return false;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    const reply = (code, data) => new Response(JSON.stringify(data), { status: code, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // The public queue: everything here is public data anyway (it ends up in the public registry).
    if (req.method === 'GET' && url.pathname === '/queue') {
      const list = await env.QUEUE.list({ prefix: 'sub:', limit: 100, cursor: url.searchParams.get('cursor') ?? undefined });
      const items = [];
      for (const k of list.keys) {
        const v = await env.QUEUE.get(k.name);
        if (v) items.push({ id: k.name, submission: JSON.parse(v) });
      }
      return reply(200, { items, cursor: list.list_complete ? null : list.cursor });
    }

    if (req.method !== 'POST' || url.pathname !== '/submit') return reply(404, { error: 'POST /submit or GET /queue' });
    const text = await req.text();
    if (text.length > 200000) return reply(413, { error: 'too large' });
    let sub;
    try { sub = JSON.parse(text); } catch { return reply(400, { error: 'not JSON' }); }
    if (!PROBLEMS.includes(sub.problem) || !/^\d{1,5}$/.test(String(sub.case))) return reply(400, { error: 'unknown problem or case' });
    if (!(await verify(sub))) return reply(401, { error: 'missing or wrong signature' });
    // A simple daily cap per key, so one device cannot flood the queue.
    const day = new Date().toISOString().slice(0, 10);
    const rk = `rate:${sub.hunter.key.slice(0, 24)}:${day}`;
    const used = Number((await env.QUEUE.get(rk)) ?? 0);
    if (used >= PER_KEY_PER_DAY) return reply(429, { error: 'daily limit reached for this device' });
    await env.QUEUE.put(rk, String(used + 1), { expirationTtl: 172800 });
    const id = `sub:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
    await env.QUEUE.put(id, JSON.stringify(sub), { expirationTtl: 14 * 86400 });
    return reply(201, { id, status: 'queued', note: 'The robot judges queued submissions every few minutes.' });
  },
};
