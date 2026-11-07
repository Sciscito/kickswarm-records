// Kickswarm Records relay (Cloudflare Worker, free tier): lets anyone submit WITHOUT a GitHub account.
// It accepts only solutions signed by a device key (see lib/keys.mjs), checks the signature, and opens the
// "[solution]" issue that the robot judges like any other. It holds one secret: a fine-grained GitHub
// token limited to "Issues: write" on this one repository.
//
// Environment: GITHUB_TOKEN (secret), REPO ("owner/name"), ALLOWED_ORIGIN (the site's origin).

const enc = (s) => new TextEncoder().encode(s);
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;
const PROBLEMS = ['circles-in-square', 'circles-in-circle', 'no-three-in-line'];

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
    const cors = { 'access-control-allow-origin': env.ALLOWED_ORIGIN, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
    const reply = (code, data) => new Response(JSON.stringify(data), { status: code, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/submit') return reply(404, { error: 'POST /submit' });
    const text = await req.text();
    if (text.length > 200000) return reply(413, { error: 'too large' });
    let sub;
    try { sub = JSON.parse(text); } catch { return reply(400, { error: 'not JSON' }); }
    if (!PROBLEMS.includes(sub.problem) || !/^\d{1,5}$/.test(String(sub.case))) return reply(400, { error: 'unknown problem or case' });
    if (!(await verify(sub))) return reply(401, { error: 'missing or wrong signature' });
    const title = `[solution] ${sub.problem} n=${sub.case} · ${sub.hunter.name}`;
    const body = `Submitted through the relay by **${sub.hunter.name}** (device key, no GitHub account).\n\n### Solution\n\n\`\`\`json\n${JSON.stringify(sub)}\n\`\`\`\n`;
    const r = await fetch(`https://api.github.com/repos/${env.REPO}/issues`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'kickswarm-records-relay', 'content-type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!r.ok) return reply(502, { error: `GitHub said ${r.status}` });
    const issue = await r.json();
    return reply(201, { url: issue.html_url, number: issue.number });
  },
};
