import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromPreset, inWindow, PRESETS, ruleCommand } from '../lib/presets.mjs';
import { clean } from '../lib/settings.mjs';
import { extractSearcher } from '../lib/searchgen.mjs';
import { agentSetupPrompt } from '../lib/agentprompt.mjs';

test('presets: sane settings for any machine', () => {
  for (const name of Object.keys(PRESETS)) for (const cores of [1, 2, 8, 64]) {
    const s = fromPreset(name, cores);
    assert.ok(s.workers >= 1 && s.workers <= cores, `${name} on ${cores} cores`);
  }
  assert.equal(fromPreset('full', 16).workers, 15, 'full power keeps one core for you');
  assert.equal(fromPreset('free', 8).quotas.paid, 0, 'free only never pays');
});

test('schedule windows, including across midnight', () => {
  const at = (h, m = 0) => new Date(2026, 10, 7, h, m);
  const night = { enabled: true, from: '23:00', to: '07:00' };
  assert.ok(inWindow(night, at(23, 30)) && inWindow(night, at(3)) && !inWindow(night, at(12)));
  assert.ok(inWindow({ enabled: true, from: '09:00', to: '17:00' }, at(10)));
  assert.ok(inWindow({ enabled: false, from: '09:00', to: '17:00' }, at(20)));
});

test('settings from the dashboard or a voice command are cleaned', () => {
  const base = fromPreset('balanced', 8);
  const s = clean({ workers: 999, seconds: 5, tiers: { paid: true, evil: true }, quotas: { sub: -3 }, schedule: { from: '25:00', to: '06:30' }, problems: ['no-three-in-line', 'rm -rf'], submit: 'everything' }, 8, base);
  assert.equal(s.workers, 8);
  assert.equal(s.seconds, 20);
  assert.equal(s.tiers.paid, false, 'a patch can never turn paid APIs on: only API mode can');
  assert.equal(s.tiers.evil, undefined);
  assert.equal(s.quotas.sub, 0);
  assert.equal(s.schedule.from, base.schedule.from);
  assert.equal(s.schedule.to, '06:30');
  assert.deepEqual(s.problems, ['no-three-in-line']);
  assert.equal(s.submit, base.submit);
  assert.equal(ruleCommand('gratuit uniquement', 8).preset, 'free');
  assert.equal(ruleCommand('discret la nuit', 8).preset, 'discreet');
  assert.equal(ruleCommand('bonjour', 8), null);
});

test('only plain searchers are accepted from a model', () => {
  assert.ok(extractSearcher('Here:\n```js\nexport async function search(input, report) { report({points: []}); }\n```'));
  assert.equal(extractSearcher('```js\nimport fs from "node:fs";\nexport async function search() {}\n```'), null);
  assert.equal(extractSearcher('```js\nconst fs = require("fs"); export function search() {}\n```'), null);
  assert.equal(extractSearcher('no code here'), null);
});

test('the agent setup prompt asks before acting and respects providers', () => {
  const p = agentSetupPrompt();
  assert.match(p, /Ask me before every step/);
  assert.match(p, /Never ask me to paste a password/);
  assert.match(p, /Never work around a provider's limits or terms/);
  assert.match(p, /Only if I say yes/);
});

test('money safety: paid APIs stay locked unless API mode is turned on by hand', async () => {
  const { nextApiMode, gatePaid, moneyOk, envWithoutApiKeys, ACCEPT_PHRASE } = await import('../lib/safety.mjs');
  const base = fromPreset('full', 8);
  assert.equal(base.tiers.paid, false, 'no preset pays');
  assert.equal(base.quotas.paid, 0);
  // A patch (voice command, AI suggestion) cannot turn API mode on.
  const s = clean({ apiMode: { on: true, checks: 3, phrase: ACCEPT_PHRASE }, tiers: { paid: true }, quotas: { paid: 50 } }, 8, base);
  assert.equal(s.apiMode.on, false);
  assert.equal(s.tiers.paid, false);
  assert.equal(s.quotas.paid, 0);
  assert.equal(moneyOk({ tier: 'paid' }, s), false);
  assert.equal(moneyOk({ tier: 'free' }, s), true);
  // The button: everything is needed to turn it on, nothing to turn it off.
  assert.equal(nextApiMode({ on: false }, { on: true, checks: 2, phrase: ACCEPT_PHRASE }).on, false);
  assert.equal(nextApiMode({ on: false }, { on: true, checks: 3, phrase: 'yes' }).on, false);
  const on = nextApiMode({ on: false }, { on: true, checks: 3, phrase: 'i accept the costs' });
  assert.equal(on.on, true);
  assert.equal(nextApiMode(on, { on: false }).on, false);
  assert.equal(gatePaid({ ...base, apiMode: on, tiers: { ...base.tiers, paid: true } }).tiers.paid, true);
  // Subscription tools never get an API key.
  const env = envWithoutApiKeys({ PATH: '/bin', ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y', GEMINI_API_KEY: 'z' });
  assert.deepEqual(Object.keys(env), ['PATH']);
});
