import { gatePaid } from './safety.mjs';
// Hive settings: loading, saving, and cleaning anything that comes from the dashboard or a voice command.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_PRESET, fromPreset } from './presets.mjs';

export const SETTINGS_FILE = 'hive.settings.json';
const PROBLEM_IDS = ['cap-sets', 'circles-in-square', 'circles-in-circle', 'no-three-in-line', 'protein-folding-2d'];
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;
const TIERS = ['local', 'free', 'paid', 'sub'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function loadSettings(cores) {
  const base = fromPreset(DEFAULT_PRESET, cores);
  if (!existsSync(SETTINGS_FILE)) return base;
  try {
    return clean({ ...base, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) }, cores, base);
  } catch {
    return base;
  }
}

export function saveSettings(s) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');
}

const int = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);

/** Merge a patch into settings, keeping only known fields within sane bounds. */
export function clean(s, cores, prev = s) {
  // apiMode is never changed here (only by the dedicated button: nextApiMode in safety.mjs).
  const out = { ...prev, apiMode: prev.apiMode?.on ? prev.apiMode : { on: false } };
  if ('preset' in s) out.preset = String(s.preset).slice(0, 20);
  out.workers = int(s.workers, 1, cores, prev.workers ?? 1);
  out.seconds = int(s.seconds, 20, 3600, prev.seconds ?? 120);
  out.tiers = { ...prev.tiers };
  for (const t of TIERS) if (typeof s.tiers?.[t] === 'boolean') out.tiers[t] = s.tiers[t];
  out.quotas = { ...prev.quotas };
  for (const t of TIERS) if (s.quotas?.[t] !== undefined) out.quotas[t] = int(s.quotas[t], 0, 100000, prev.quotas?.[t] ?? 0);
  out.schedule = { ...prev.schedule };
  if (typeof s.schedule?.enabled === 'boolean') out.schedule.enabled = s.schedule.enabled;
  if (HHMM.test(s.schedule?.from ?? '')) out.schedule.from = s.schedule.from;
  if (HHMM.test(s.schedule?.to ?? '')) out.schedule.to = s.schedule.to;
  if (Array.isArray(s.problems)) out.problems = s.problems.filter((p) => PROBLEM_IDS.includes(p));
  if (Array.isArray(s.disabled)) out.disabled = s.disabled.map(String).slice(0, 50);
  if (['improvements', 'none'].includes(s.submit)) out.submit = s.submit;
  if (typeof s.autostart === 'boolean') out.autostart = s.autostart;
  if (['swarm', 'pick', 'all'].includes(s.mode)) out.mode = s.mode;
  if (Array.isArray(s.friends)) out.friends = [...new Set(s.friends.map(String).filter((n) => NAME_RE.test(n)))].slice(0, 200);
  if (typeof s.invitedBy === 'string' && NAME_RE.test(s.invitedBy)) out.invitedBy = s.invitedBy;
  if (s.weights && typeof s.weights === 'object') out.weights = Object.fromEntries(Object.entries(s.weights).filter(([k]) => PROBLEM_IDS.includes(k)).map(([k, v]) => [k, int(v, 0, 100, 50)]));
  return gatePaid(out);
}

/** The prompt that turns a spoken or typed request into a settings patch. */
export function commandPrompt(text, settings, cores, sources) {
  return `You configure a "personal hive" that hunts math records with a person's computer and AI models.
Current settings (JSON): ${JSON.stringify(settings)}
Fields you may change: workers (1..${cores} processor workers), seconds (20..3600 per search run),
tiers {local, free, paid, sub: true/false}, quotas {local, free, paid, sub: calls per day per source},
schedule {enabled: bool, from: "HH:MM", to: "HH:MM"}, problems (subset of ${JSON.stringify(PROBLEM_IDS)}; [] = all),
disabled (list of source keys to switch off; known: ${JSON.stringify(sources.map((s) => s.key))}), submit ("improvements" or "none").
The person said (any language): ${JSON.stringify(text)}
Reply with ONLY one JSON object: {"patch": {only the fields to change}, "explain": "one short sentence in the person's language"}.`;
}
