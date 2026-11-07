// Identity without accounts: each device holds an Ed25519 key pair (WebCrypto, Node 20+ and modern
// browsers). A hunter is a chosen name bound to a public key; submissions are signed with it. The first
// key to use a name owns it. Universal module.

const subtle = globalThis.crypto.subtle;
const b64 = (buf) => { let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const enc = (s) => new TextEncoder().encode(s);

/** JSON with keys sorted at every level (same rule as the registry). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;

/** A new identity: { name, publicKey (base64 raw), privateKey (JWK) }. */
export async function newIdentity(name) {
  if (!NAME_RE.test(name)) throw new Error('name: 2 to 24 letters, digits, - or _');
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return { name, publicKey: b64(await subtle.exportKey('raw', kp.publicKey)), privateKey: await subtle.exportKey('jwk', kp.privateKey) };
}

/** Short, stable fingerprint of a public key. */
export async function fingerprint(publicKey) {
  const h = new Uint8Array(await subtle.digest('SHA-256', unb64(publicKey)));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Sign a submission: adds hunter { name, key } and sig over everything else. */
export async function signSubmission(sub, identity) {
  const body = { ...sub, hunter: { name: identity.name, key: identity.publicKey } };
  delete body.sig;
  const key = await subtle.importKey('jwk', identity.privateKey, { name: 'Ed25519' }, false, ['sign']);
  const sig = b64(await subtle.sign({ name: 'Ed25519' }, key, enc(canonical(body))));
  return { ...body, sig };
}

/** Check a signed submission. Returns { name, key, fp } or throws. */
export async function verifySubmission(sub) {
  const { sig, ...body } = sub ?? {};
  const h = body.hunter;
  if (!h || typeof h.name !== 'string' || typeof h.key !== 'string' || typeof sig !== 'string') throw new Error('not a signed submission');
  if (!NAME_RE.test(h.name)) throw new Error('hunter name: 2 to 24 letters, digits, - or _');
  let ok = false;
  try {
    const key = await subtle.importKey('raw', unb64(h.key), { name: 'Ed25519' }, false, ['verify']);
    ok = await subtle.verify({ name: 'Ed25519' }, key, unb64(sig), enc(canonical(body)));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error('the signature does not match the submission');
  return { name: h.name, key: h.key, fp: await fingerprint(h.key) };
}
