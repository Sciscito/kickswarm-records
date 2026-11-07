// The public registry: one JSON line per event, each chained to the previous one by a SHA-256 hash,
// in the spirit of the Kickswarm (OSP) registry. Anyone can recompute every hash with `npm run audit`.
// Node only.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

export const REGISTRY = process.env.KS_REGISTRY ?? 'registry.jsonl';
export const GENESIS = '0'.repeat(64);

/** JSON with keys sorted at every level, so the same object always hashes the same. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function readRegistry(path = REGISTRY) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Append an event; fills seq, ts (if missing), prev and hash. Returns the entry. */
export function appendEntry(fields, path = REGISTRY) {
  const all = readRegistry(path);
  const last = all.at(-1);
  const body = { ...fields, seq: (last?.seq ?? 0) + 1, ts: fields.ts ?? new Date().toISOString(), prev: last?.hash ?? GENESIS };
  const entry = { ...body, hash: sha256(canonical(body)) };
  appendFileSync(path, JSON.stringify(entry) + '\n');
  return entry;
}

/** Recompute the chain. Returns { ok, count, error? }. */
export function auditRegistry(entries) {
  let prev = GENESIS;
  for (const [i, e] of entries.entries()) {
    const { hash, ...body } = e;
    if (e.seq !== i + 1) return { ok: false, count: i, error: `entry ${i + 1}: seq is ${e.seq}` };
    if (e.prev !== prev) return { ok: false, count: i, error: `entry ${e.seq}: prev does not match the previous hash` };
    if (sha256(canonical(body)) !== hash) return { ok: false, count: i, error: `entry ${e.seq}: hash does not match its content` };
    prev = hash;
  }
  return { ok: true, count: entries.length };
}
