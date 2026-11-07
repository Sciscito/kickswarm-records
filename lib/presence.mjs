// Live presence: what a hive's agents are doing right now, signed with the hunter key, sent to the relay
// every 30 seconds while the hive runs. Universal (Node and browser).

import { signSubmission } from './keys.mjs';

const kindOf = (key = '') => (key.startsWith('cpu') ? 'cpu' : /^(ollama|webllm)/.test(key) ? 'local' : key.startsWith('cli') ? 'sub' : /^(anthropic|openai|deepseek|moonshot|zai)/.test(key) ? 'paid' : 'free');

/** The note sent to the relay, from a hive's active slots. */
export async function presenceNote(identity, active, device = 'browser', invitedBy) {
  const agents = active.map((a) => ({
    problem: a.problem, case: a.case, phase: a.phase,
    model: String(a.model ?? a.source ?? '').replace(/^[a-z]+:/, ''),
    kind: kindOf(a.phase === 'writing' ? a.sourceKey : a.source),
    score: a.score ?? null, startScore: a.startScore ?? null, until: a.until ?? null,
  }));
  let by = invitedBy;
  if (!by) try { by = JSON.parse(globalThis.localStorage?.getItem('ks-invited-by') ?? 'null') ?? undefined; } catch {}
  return signSubmission({ ts: Date.now(), agents, device, by }, identity);
}

/** Send it; never throws (presence is a bonus). */
export async function sendPresence(relay, identity, active, device, invitedBy) {
  if (!relay || !identity) return false;
  try {
    const body = JSON.stringify(await presenceNote(identity, active, device, invitedBy));
    const r = await fetch(`${relay.replace(/\/$/, '')}/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(10000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Who is hunting what right now. */
export async function readPresence(relay) {
  if (!relay) return [];
  try {
    const r = await fetch(`${relay.replace(/\/$/, '')}/presence`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    return r.ok ? (await r.json()).hunters ?? [] : [];
  } catch {
    return [];
  }
}
