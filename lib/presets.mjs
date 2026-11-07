// Ready-made settings most people can accept as they are. Universal (Node and browser).
// `cores` is a share of the processor; quotas are calls per day for each source of a tier.

export const PRESETS = {
  discreet: {
    label: 'Discreet',
    emoji: '🌙',
    blurb: 'A quarter of your processor, free sources only, at night. You will not notice it.',
    cores: 0.25, tiers: { local: true, free: true, paid: false, sub: false },
    quotas: { local: 200, free: 20, paid: 0, sub: 0 }, schedule: { enabled: true, from: '23:00', to: '07:00' }, seconds: 180,
  },
  balanced: {
    label: 'Balanced',
    emoji: '🐝',
    blurb: 'Half your processor, local and free models first, a few calls to your subscriptions.',
    cores: 0.5, tiers: { local: true, free: true, paid: false, sub: true },
    quotas: { local: 500, free: 60, paid: 0, sub: 6 }, schedule: { enabled: false, from: '23:00', to: '07:00' }, seconds: 120,
  },
  free: {
    label: 'Free only',
    emoji: '🆓',
    blurb: 'Everything that costs nothing: processor, local models, free API tiers. Never a paid call.',
    cores: 0.75, tiers: { local: true, free: true, paid: false, sub: false },
    quotas: { local: 1000, free: 100, paid: 0, sub: 0 }, schedule: { enabled: false, from: '23:00', to: '07:00' }, seconds: 120,
  },
  full: {
    label: 'Full power',
    emoji: '🚀',
    blurb: 'All cores but one and every source you allow, within the quotas below. For record nights.',
    cores: 1, tiers: { local: true, free: true, paid: true, sub: true },
    quotas: { local: 2000, free: 200, paid: 30, sub: 20 }, schedule: { enabled: false, from: '23:00', to: '07:00' }, seconds: 240,
  },
};

export const DEFAULT_PRESET = 'balanced';

/** Settings from a preset: a plain object the hive and the dashboard both understand. */
export function fromPreset(name, totalCores) {
  const p = PRESETS[name] ?? PRESETS[DEFAULT_PRESET];
  return {
    preset: name in PRESETS ? name : DEFAULT_PRESET,
    workers: Math.max(1, Math.min(totalCores - (p.cores >= 1 ? 1 : 0), Math.round(totalCores * p.cores))),
    seconds: p.seconds,
    tiers: { ...p.tiers },
    quotas: { ...p.quotas },
    schedule: { ...p.schedule },
    disabled: [], // source keys the person switched off
    problems: [], // empty = all hunts
    submit: 'improvements',
  };
}

/** Is `now` inside the daily window? Windows may cross midnight. */
export function inWindow(schedule, now = new Date()) {
  if (!schedule?.enabled) return true;
  const m = now.getHours() * 60 + now.getMinutes();
  const [a, b] = [schedule.from, schedule.to].map((t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; });
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

/** Simple voice/text commands understood without any AI. Returns a settings patch or null. */
export function ruleCommand(text, totalCores) {
  const t = text.toLowerCase();
  for (const [k, p] of Object.entries(PRESETS)) if (t.includes(p.label.toLowerCase()) || t.includes(k)) return { ...fromPreset(k, totalCores) };
  if (/discr|nuit|night/.test(t)) return fromPreset('discreet', totalCores);
  if (/gratuit|free/.test(t)) return fromPreset('free', totalCores);
  if (/(à|a) fond|full|max/.test(t)) return fromPreset('full', totalCores);
  if (/équilibr|equilibr|balanced|normal/.test(t)) return fromPreset('balanced', totalCores);
  return null;
}
