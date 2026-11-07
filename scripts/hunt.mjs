// The personal hive: put everything you have to work, within each service's rules.
//
//   npm run hunt -- --inventory        what this machine can use
//   npm run hunt                       hunt until Ctrl+C (submits improvements with the GitHub CLI)
//   npm run hunt -- --minutes 60 --dry hunt for an hour, submit nothing
//   options: --problem <id>  --cpu-only  --workers <k>  --seconds <s>  --rounds <k>
//
// Each round, every CPU worker takes its own mission (the case tried least, a fresh strategy) and runs a
// searcher on it. Searchers are the built-in ones (solvers/), or programs written by AI models: the
// cascade asks the cheapest source first (local, then free tiers, then paid APIs, then subscriptions)
// and escalates only when a tier stalls. Programs that improve a record join the library and become
// the parents of the next ones: the hive improves its own tools.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { better, shortScore, toUnits } from '../lib/exact.mjs';
import { huntPrompt, pickMission } from '../lib/mission.mjs';
import { complete, cpuCount, inventory, TIER_ORDER } from '../lib/providers.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const HERE = resolve('.');
const H = 'hunts';
mkdirSync(join(H, 'programs'), { recursive: true });
mkdirSync(join(H, 'outbox'), { recursive: true });

const CONFIG_FILE = 'hunt.config.json';
const config = {
  workers: Math.max(1, cpuCount() - 1),
  seconds: 120,
  aiEvery: 1, // ask an AI for a new searcher every k rounds (per worker slot)
  quotas: { local: 1000, free: 60, paid: 20, sub: 12 }, // calls per day per source
  submit: 'improvements',
  ...(existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {}),
};
if (opt('workers')) config.workers = Number(opt('workers'));
if (opt('seconds')) config.seconds = Number(opt('seconds'));
const DRY = flag('dry') || config.submit === 'none';
const CPU_ONLY = flag('cpu-only');

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const stats = readJson(join(H, 'stats.json'), {});
const usage = readJson(join(H, 'usage.json'), {});
const today = () => new Date().toISOString().slice(0, 10);
const save = () => { writeFileSync(join(H, 'stats.json'), JSON.stringify(stats, null, 1)); writeFileSync(join(H, 'usage.json'), JSON.stringify(usage)); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- the board ----------
async function board() {
  const site = JSON.parse(readFileSync('site/config.json', 'utf8')).site;
  try {
    const r = await fetch(`${site}/data.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (r.ok) return { data: await r.json(), site, live: true };
  } catch {}
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'ignore' });
  return { data: JSON.parse(readFileSync('_site/data.json', 'utf8')), site, live: false };
}
async function currentBest(b, pid, cid) {
  if (b.live) {
    try {
      const r = await fetch(`${b.site}/records/${pid}/${cid}.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
  }
  const f = `records/${pid}/${cid}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

// ---------- sources and the cascade ----------
function quotaLeft(src) {
  const u = (usage[today()] ??= {});
  return (u[src.key] ?? 0) < (config.quotas[src.tier] ?? 10);
}
function pickSource(sources) {
  for (const tier of TIER_ORDER) {
    const inTier = sources.filter((s) => s.tier === tier && quotaLeft(s));
    // A tier stalls after 3 straight failures of a source; the cascade then moves up.
    const fresh = inTier.filter((s) => (stats[s.key]?.streak ?? 0) < 3);
    if (!fresh.length) continue;
    // Within a tier: the best success rate, with a bonus for little-tried sources.
    fresh.sort((a, b) => score(b) - score(a));
    return fresh[0];
  }
  // Everything stalled: reset streaks and start again from the bottom next time.
  for (const s of sources) if (stats[s.key]) stats[s.key].streak = 0;
  return null;
}
function score(s) {
  const st = stats[s.key] ?? { calls: 0, valid: 0, improved: 0 };
  return (st.improved * 3 + st.valid + 1) / (st.calls + 2) + Math.sqrt(2 / (st.calls + 1)) * 0.3;
}
function note(key, field) {
  const st = (stats[key] ??= { calls: 0, ran: 0, valid: 0, improved: 0, streak: 0 });
  st[field] = (st[field] ?? 0) + 1;
  if (field === 'improved' || field === 'valid') st.streak = 0;
  return st;
}

// ---------- programs ----------
function library(pid) {
  const dir = join(H, 'programs');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f), null)).filter((m) => m && m.problem === pid).sort((a, b) => (b.wins - a.wins) || (b.valid - a.valid));
}
function builtin(pid) {
  return resolve('solvers', pid === 'no-three-in-line' ? 'no-three-in-line.mjs' : 'circles.mjs');
}

async function writeProgram(src, m) {
  const parents = library(m.problem.id);
  const parent = parents[0];
  const parentCode = readFileSync(parent ? parent.file : builtin(m.problem.id), 'utf8');
  const contract = readFileSync('solvers/README.md', 'utf8');
  const prompt = `You write search programs for Kickswarm Records. Reply with ONE JavaScript code block and nothing else.

${contract}

THE TASK THIS PROGRAM WILL RUN ON:
${huntPrompt({ ...m, site: '' }).split('HOW TO WORK:')[0]}
PARENT PROGRAM (${parent ? `from the library: ${parent.wins} record(s), ${parent.valid} valid run(s), by ${parent.source}` : 'the built-in searcher'}). Improve on it following the strategy above: change the algorithm, not just constants. Keep the contract exactly.

\`\`\`js
${parentCode}
\`\`\``;
  note(src.key, 'calls');
  (usage[today()] ??= {})[src.key] = (usage[today()][src.key] ?? 0) + 1;
  const text = await complete(src, prompt);
  const code = (text.match(/```(?:js|javascript|mjs)?\s*\n([\s\S]*?)```/) ?? [])[1] ?? (text.includes('BEST') ? text : null);
  if (!code || !code.includes('BEST')) throw new Error('no usable program in the answer');
  const id = `${m.problem.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const dir = resolve(H, 'programs', id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'search.mjs');
  writeFileSync(file, code);
  const meta = { id, problem: m.problem.id, file, source: src.key, parent: parent?.id ?? 'builtin', strategy: m.strategyIndex, wins: 0, valid: 0, runs: 0, created: new Date().toISOString() };
  writeFileSync(join(H, 'programs', `${id}.json`), JSON.stringify(meta, null, 1));
  return meta;
}

/** Run a searcher; returns the last BEST solution (or null) and stderr. */
function runSearcher(file, input, trusted) {
  return new Promise((done) => {
    const major = Number(process.versions.node.split('.')[0]);
    const sandbox = trusted ? [] : [major >= 22 ? '--permission' : '--experimental-permission', `--allow-fs-read=${dirname(file)}`];
    const child = spawn(process.execPath, [...sandbox, file], { cwd: dirname(file), windowsHide: true });
    let out = '';
    let err = '';
    let last = null;
    const kill = setTimeout(() => child.kill('SIGKILL'), (input.seconds + 8) * 1000);
    child.stdout.on('data', (d) => {
      out += d;
      const lines = out.split('\n');
      out = lines.pop();
      for (const l of lines) if (l.startsWith('BEST ')) last = l.slice(5);
    });
    child.stderr.on('data', (d) => (err += d).length > 4000 && (err = err.slice(-4000)));
    child.on('close', () => {
      clearTimeout(kill);
      if (out.startsWith('BEST ')) last = out.slice(5);
      let sol = null;
      try { sol = last ? JSON.parse(last) : null; } catch {}
      done({ sol, err });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function submit(sub) {
  const file = join(H, 'outbox', `${sub.problem}-${sub.case}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(sub));
  if (DRY) return `saved ${file} (dry run, not submitted)`;
  try {
    return execFileSync(process.execPath, ['scripts/submit.mjs', file], { encoding: 'utf8' }).trim().split('\n')[0];
  } catch (e) {
    return `saved ${file}; submit failed: ${e.message.slice(0, 120)}`;
  }
}

// ---------- one worker slot ----------
async function slot(i, round, sources, b) {
  const m = pickMission(b.data, Math.random, opt('problem'));
  if (!m) return;
  const p = m.problem;
  const cur = await currentBest(b, p.id, m.cas.id);
  const start = cur?.solution ?? null;
  let prog = { file: builtin(p.id), source: 'cpu:builtin', trusted: true };
  // Ask an AI for a new searcher on some slots, so the CPU keeps working with the best known tools too.
  const useAi = !CPU_ONLY && sources.length && (round + i) % (config.aiEvery + 1) !== 0;
  if (useAi) {
    const src = pickSource(sources);
    if (src) {
      try {
        const meta = await writeProgram(src, m);
        prog = { ...meta, trusted: false };
        log(`[${i}] ${src.label} wrote a searcher (${meta.id})`);
      } catch (e) {
        note(src.key, 'streak');
        log(`[${i}] ${src.label}: ${e.message.slice(0, 120)}; using a library or built-in searcher`);
      }
    }
  }
  if (prog.source === 'cpu:builtin') {
    const lib = library(p.id).filter((x) => x.wins > 0 || x.valid > 2);
    if (lib.length && Math.random() < 0.5) prog = { ...lib[Math.floor(Math.random() * Math.min(3, lib.length))], trusted: false };
  }
  const input = { problem: p.id, n: m.cas.n, start, seconds: config.seconds, seed: Math.floor(Math.random() * 2 ** 31) };
  log(`[${i}] ${p.title} n=${m.cas.n} · ${prog.source} · ${config.seconds}s · best ${cur ? shortScore(cur.score) : 'none'}`);
  const { sol, err } = await runSearcher(prog.file, input, prog.trusted);
  const metaFile = prog.id ? join(H, 'programs', `${prog.id}.json`) : null;
  const meta = metaFile ? readJson(metaFile, null) : null;
  if (meta) meta.runs++;
  if (!sol) {
    if (prog.source !== 'cpu:builtin' && stats[prog.source]) stats[prog.source].streak = (stats[prog.source].streak ?? 0) + 1;
    log(`[${i}] no improvement found${err ? `: ${err.trim().split('\n').pop().slice(0, 140)}` : ''}`);
    if (meta) writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    return;
  }
  const { judge } = await import(new URL(`../problems/${p.id}/judge.mjs`, import.meta.url));
  let s;
  try {
    ({ score: s } = judge(m.cas, sol));
  } catch (e) {
    log(`[${i}] rejected by the judge: ${e.message}`);
    if (prog.source !== 'cpu:builtin' && stats[prog.source]) stats[prog.source].streak = (stats[prog.source].streak ?? 0) + 1;
    if (meta) writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    return;
  }
  if (prog.source !== 'cpu:builtin') note(prog.source, 'valid');
  if (meta) meta.valid++;
  const fresh = await currentBest(b, p.id, m.cas.id); // someone may have improved it meanwhile
  const min = p.score_name === 'radius' ? '0.000000000001' : '1';
  const improves = !fresh || (better(s, fresh.score, p.direction) && toUnits(s) - toUnits(fresh.score) >= toUnits(min));
  if (!improves) {
    log(`[${i}] valid, ${shortScore(s)}: does not beat ${shortScore(fresh.score)}`);
  } else {
    if (prog.source !== 'cpu:builtin') note(prog.source, 'improved');
    if (meta) meta.wins++;
    const model = prog.source.startsWith('cpu') ? 'cpu (built-in searcher)' : prog.source.replace(/^[a-z]+:/, '');
    const sub = { problem: p.id, case: m.cas.id, ...sol, strategy: m.strategyIndex, method: `Personal hive: ${prog.source === 'cpu:builtin' ? 'built-in searcher' : `searcher written by ${prog.source}`} run ${config.seconds}s from the current best.`, model };
    log(`[${i}] 🐝 IMPROVES ${p.title} n=${m.cas.n}: ${shortScore(s)} > ${fresh ? shortScore(fresh.score) : 'none'} · ${await submit(sub)}`);
  }
  if (meta) writeFileSync(metaFile, JSON.stringify(meta, null, 1));
}

// ---------- main ----------
const sources = CPU_ONLY ? [] : await inventory();
console.log(`\nKickswarm personal hive\n  CPU: ${config.workers} worker(s) of ${cpuCount()} cores, ${config.seconds}s per run`);
if (!sources.length) console.log('  AI: none found (set GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY, run Ollama, or install Claude Code / Codex / Gemini CLI). The CPU hunts on its own.');
for (const s of sources) console.log(`  AI [${s.tier}] ${s.label} · ${(usage[today()]?.[s.key] ?? 0)}/${config.quotas[s.tier]} calls today`);
console.log(`  Submitting: ${DRY ? 'no (dry run)' : 'improvements, with the GitHub CLI'}\n`);
if (flag('inventory')) process.exit(0);
if (flag('init')) {
  writeFileSync(CONFIG_FILE, JSON.stringify({ workers: config.workers, seconds: config.seconds, aiEvery: config.aiEvery, quotas: config.quotas, submit: config.submit }, null, 2));
  console.log(`Wrote ${CONFIG_FILE}. Edit it to change workers, run length, and daily quotas per tier.`);
  process.exit(0);
}

const until = Date.now() + Number(opt('minutes', 1e9)) * 60000;
const rounds = Number(opt('rounds', 1e9));
let stop = false;
process.on('SIGINT', () => { if (stop) process.exit(1); stop = true; log('Finishing the current round (Ctrl+C again to quit now)…'); });
for (let round = 0; round < rounds && Date.now() < until && !stop; round++) {
  const b = await board();
  await Promise.all(Array.from({ length: config.workers }, (_, i) => slot(i, round, sources, b).catch((e) => log(`[${i}] error: ${e.message}`))));
  save();
}
save();
log('Hive stopped. Stats in hunts/stats.json, programs in hunts/programs/.');
void HERE;
