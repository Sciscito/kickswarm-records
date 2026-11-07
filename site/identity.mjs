// This device's hunter identity (browser): a name and an Ed25519 key pair kept in this browser.
import { fingerprint, NAME_RE, newIdentity, signSubmission } from './lib/keys.mjs';

const KEY = 'ks-identity';
export function getIdentity() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export async function createIdentity(name) {
  const id = await newIdentity(name.trim());
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch {}
  return id;
}
/** The identity, asking for a name the first time. */
export async function ensureIdentity() {
  let id = getIdentity();
  while (!id) {
    const name = prompt('Pick your hunter name (2 to 24 letters, digits, - or _). It signs your records on this device; no account needed.');
    if (name === null) throw new Error('A hunter name is needed to submit.');
    if (NAME_RE.test(name.trim())) id = await createIdentity(name);
  }
  return id;
}
export async function identitySummary() {
  const id = getIdentity();
  return id ? { name: id.name, fp: await fingerprint(id.publicKey) } : null;
}
/** Sign and send: through the relay when the project has one, otherwise a prefilled GitHub form. */
export async function sendSolution(sub, { relay, repo, copy, toast }) {
  const signed = await signSubmission(sub, await ensureIdentity());
  if (relay) {
    const r = await fetch(`${relay.replace(/\/$/, '')}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `relay HTTP ${r.status}`);
    toast('Sent. The robot answers within a minute or two.');
    return j.url;
  }
  const json = JSON.stringify(signed);
  const base = `https://github.com/${repo}/issues/new?template=solution.yml&title=${encodeURIComponent(`[solution] ${sub.problem} n=${sub.case}`)}`;
  const full = `${base}&solution=${encodeURIComponent(json)}`;
  if (full.length < 7500) window.open(full, '_blank', 'noopener');
  else { await copy(json, 'Solution copied: paste it in the form'); window.open(base, '_blank', 'noopener'); }
  return null;
}
