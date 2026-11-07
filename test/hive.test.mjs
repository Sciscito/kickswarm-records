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
  assert.equal(s.tiers.paid, true);
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
