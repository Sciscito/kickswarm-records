// Build the static website into _site/: the pages, the shared code (judges run in the browser),
// the records, trophies and registry, and data.json, the summary the pages read.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { loadProblem, PROBLEMS, readRecord } from '../lib/process.mjs';
import { readRegistry } from '../lib/registry.mjs';
import { computeBadges } from '../lib/badges.mjs';

const OUT = '_site';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
cpSync('site', OUT, { recursive: true });
for (const d of ['lib', 'problems', 'records', 'trophies', 'solvers']) if (existsSync(d)) cpSync(d, `${OUT}/${d}`, { recursive: true });
for (const f of ['registry.jsonl']) if (existsSync(f)) cpSync(f, `${OUT}/${f}`);
for (const f of ['process', 'registry', 'providers', 'hive', 'settings']) rmSync(`${OUT}/lib/${f}.mjs`, { force: true });
rmSync(`${OUT}/solvers/run.mjs`, { force: true });

const reg = readRegistry();
const problems = PROBLEMS.map(loadProblem);
const cases = {};
const journal = {};
for (const p of problems) {
  for (const c of p.cases) {
    const rec = readRecord(p.id, c.id);
    cases[`${p.id}/${c.id}`] = rec
      ? { score: rec.score, author: rec.author, credit: rec.credit, tier: rec.tier ?? (rec.reference ? 'reference' : 'valid'), seq: rec.seq, date: rec.date, attempts: 0, records: 0, methods: {} }
      : { attempts: 0, records: 0, methods: {} };
  }
}
const honey = {};
const people = new Set();
for (const e of reg) {
  if (e.nature === 'reference') continue;
  const k = `${e.problem}/${e.case}`;
  const s = cases[k];
  if (!s) continue;
  people.add(e.author);
  if (e.nature === 'attempt') s.attempts++;
  if (e.nature === 'record') s.records++;
  if (typeof e.strategy === 'number') s.methods[e.strategy] = (s.methods[e.strategy] ?? 0) + 1;
  (journal[k] ??= []).unshift({ seq: e.seq, nature: e.nature, author: e.author, score: e.score, method: e.method, model: e.model, tier: e.tier, ts: e.ts });
  if (e.honey) honey[e.author] = (honey[e.author] ?? 0) + e.honey;
}
const feed = reg.filter((e) => e.nature !== 'reference').slice(-60).reverse()
  .map(({ seq, nature, problem, case: c, author, score, previous, tier, honey: h, model, ts }) => ({ seq, nature, problem, case: c, author, score, previous, tier, honey: h, model, ts }));
const trophies = reg.filter((e) => e.nature === 'record').reverse()
  .map(({ seq, problem, case: c, author, tier, score, ts }) => ({ seq, problem, case: c, author, tier, score, ts }));
const leaderboard = Object.entries(honey).sort((a, b) => b[1] - a[1]).map(([author, h]) => ({ author, honey: h, records: trophies.filter((t) => t.author === author).length }));

// What worked, for whom: model and strategy statistics per problem. The hives read them to steer
// themselves (lib/mission.mjs picks strategies with them; hives prefer models that produce records).
const modelLabel = (m) => (!m ? 'unknown' : /built-in/i.test(m) ? 'Built-in searcher' : String(m).slice(0, 40));
const learn = { global: {}, problems: {} };
for (const p of problems) learn.problems[p.id] = { models: {}, strategies: p.strategies.map((label, i) => ({ i, label, tries: 0, records: 0 })), timeline: {} };
for (const e of reg) {
  if (e.nature !== 'record' && e.nature !== 'attempt') continue;
  const L = learn.problems[e.problem];
  if (!L) continue;
  const m = modelLabel(e.model);
  for (const bucket of [L.models, learn.global]) {
    const x = (bucket[m] ??= { model: m, attempts: 0, records: 0, honey: 0 });
    if (e.nature === 'record') { x.records++; x.honey += e.honey ?? 0; } else x.attempts++;
  }
  if (typeof e.strategy === 'number' && L.strategies[e.strategy]) {
    L.strategies[e.strategy].tries++;
    if (e.nature === 'record') L.strategies[e.strategy].records++;
  }
  if (e.nature === 'record') { const d = e.ts.slice(0, 10); L.timeline[d] = (L.timeline[d] ?? 0) + 1; }
}
const sortModels = (o) => Object.values(o).sort((a, b) => b.records - a.records || b.attempts - a.attempts);
const learning = {
  global: sortModels(learn.global),
  problems: Object.fromEntries(Object.entries(learn.problems).map(([id, L]) => [id, { models: sortModels(L.models), strategies: L.strategies, timeline: Object.entries(L.timeline).sort().map(([date, n]) => ({ date, n })) }])),
};

const config = JSON.parse(readFileSync('site/config.json', 'utf8'));
const data = {
  built: new Date().toISOString(),
  config,
  problems,
  cases,
  journal,
  feed,
  trophies,
  leaderboard,
  learning,
  badges: computeBadges(reg),
  stats: {
    hunters: people.size,
    records: trophies.length,
    world: trophies.filter((t) => t.tier === 'world').length,
    attempts: reg.filter((e) => e.nature === 'attempt').length,
    entries: reg.length,
    head: reg.at(-1)?.hash ?? null,
  },
};
writeFileSync(`${OUT}/data.json`, JSON.stringify(data));
writeFileSync(`${OUT}/.nojekyll`, '');
console.log(`Built ${OUT}/: ${problems.reduce((a, p) => a + p.cases.length, 0)} cases, ${reg.length} registry entries.`);
