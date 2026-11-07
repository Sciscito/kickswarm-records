// Get a mission from the command line, for coding agents and people who like terminals.
// Usage: npm run mission [-- <problem> [case]]
// Prints the mission and writes the full hunt prompt to mission.md.

import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { huntPrompt, pickMission } from '../lib/mission.mjs';
import { shortScore } from '../lib/exact.mjs';

if (!existsSync('_site/data.json')) execSync('node scripts/build-site.mjs', { stdio: 'ignore' });
const data = JSON.parse(readFileSync('_site/data.json', 'utf8'));
const [only, onlyCase] = process.argv.slice(2);

let m;
if (onlyCase) {
  const p = data.problems.find((x) => x.id === only);
  const c = p?.cases.find((x) => x.id === onlyCase);
  if (!c) throw new Error(`no case ${only} ${onlyCase}`);
  const i = Math.floor(Math.random() * p.strategies.length);
  m = { problem: p, cas: c, summary: data.cases[`${p.id}/${c.id}`] ?? {}, strategy: p.strategies[i], strategyIndex: i };
} else m = pickMission(data, Math.random, only);
if (!m) throw new Error('no open case');

const prompt = huntPrompt({ ...m, journal: data.journal[`${m.problem.id}/${m.cas.id}`] ?? [], site: data.config.site })
  .replace(/If you cannot open links, ask me to paste it\./, `Local copy: records/${m.problem.id}/${m.cas.id}.json`)
  .replace(/The person running you checks it on .* and submits it\./, 'Save it to a file and run: npm run check -- <file>. If it is valid, run: npm run submit -- <file>.');
writeFileSync('mission.md', prompt);
console.log(`Mission: ${m.problem.title}, n = ${m.cas.n}`);
console.log(`Current best: ${m.summary.score ? `${shortScore(m.summary.score)} by @${m.summary.author}` : 'none yet'}`);
console.log(`Strategy #${m.strategyIndex}: ${m.strategy}`);
console.log('Full prompt written to mission.md');
