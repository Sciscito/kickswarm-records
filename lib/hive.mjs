// The personal hive engine (Node). Controlled by the command line (scripts/hunt.mjs) or the local
// dashboard (scripts/hive.mjs). Emits 'log', 'improve', 'state' and 'stats' events.
//
// Each round, every worker slot takes its own mission (the case tried least, a fresh strategy) and runs
// a searcher on it. Searchers are the built-in ones (solvers/), library programs that already won, or
// new programs written by AI models: the cascade asks the cheapest allowed source first and escalates
// only when a tier stalls. Programs that beat a record become the parents of the next ones.

import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { better, shortScore, toUnits } from './exact.mjs';
import { pickMission } from './mission.mjs';
import { inWindow } from './presets.mjs';
import { complete, TIER_ORDER } from './providers.mjs';
import { extractSearcher, searcherPrompt } from './searchgen.mjs';
import { signSubmission } from './keys.mjs';

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const today = () => new Date().toISOString().slice(0, 10);

export class Hive extends EventEmitter {
  constructor({ workspace = 'hunts', settings, sources = [], dry = false } = {}) {
    super();
    this.ws = resolve(workspace);
    mkdirSync(join(this.ws, 'programs'), { recursive: true });
    mkdirSync(join(this.ws, 'outbox'), { recursive: true });
    this.settings = settings;
    this.sources = sources;
    this.dry = dry;
    this.running = false;
    this.stopping = false;
    this.stats = readJson(join(this.ws, 'stats.json'), {});
    this.usage = readJson(join(this.ws, 'usage.json'), {});
    this.improvements = readJson(join(this.ws, 'improvements.json'), []);
    this.active = new Map(); // slot -> what it is doing
  }

  log(msg, slot = null) {
    const line = { t: new Date().toISOString(), slot, msg };
    this.emit('log', line);
  }

  save() {
    writeFileSync(join(this.ws, 'stats.json'), JSON.stringify(this.stats, null, 1));
    writeFileSync(join(this.ws, 'usage.json'), JSON.stringify(this.usage));
    writeFileSync(join(this.ws, 'improvements.json'), JSON.stringify(this.improvements.slice(-200)));
    this.emit('stats', this.snapshot());
  }

  snapshot() {
    return {
      running: this.running,
      stopping: this.stopping,
      active: [...this.active.entries()].map(([slot, a]) => ({ slot, ...a })),
      stats: this.stats,
      usage: this.usage[today()] ?? {},
      improvements: this.improvements.slice(-30).reverse(),
      waiting: this.running && !inWindow(this.settings.schedule),
    };
  }

  // ---------- the board ----------
  async board() {
    const site = JSON.parse(readFileSync('site/config.json', 'utf8')).site;
    try {
      const r = await fetch(`${site}/data.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (r.ok) return { data: await r.json(), site, live: true };
    } catch {}
    execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'ignore' });
    return { data: JSON.parse(readFileSync('_site/data.json', 'utf8')), site, live: false };
  }
  async currentBest(b, pid, cid) {
    if (b.live) {
      try {
        const r = await fetch(`${b.site}/records/${pid}/${cid}.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
        if (r.ok) return await r.json();
        if (r.status === 404) return null;
      } catch {}
    }
    const f = `records/${pid}/${cid}.json`;
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  // ---------- the cascade ----------
  allowed(src) {
    const s = this.settings;
    return s.tiers?.[src.tier] !== false && !(s.disabled ?? []).includes(src.key);
  }
  quotaLeft(src) {
    const u = (this.usage[today()] ??= {});
    return (u[src.key] ?? 0) < (this.settings.quotas?.[src.tier] ?? 0);
  }
  score(src) {
    const st = this.stats[src.key] ?? { calls: 0, valid: 0, improved: 0 };
    // What the whole swarm learned about this model (records per try), as a prior.
    const g = (this.prior ?? []).find((x) => src.model && x.model === src.model);
    const prior = g ? (g.records + 1) / (g.records + g.attempts + 2) : 0.3;
    return (st.improved * 3 + st.valid + 1) / (st.calls + 2) + Math.sqrt(2 / (st.calls + 1)) * 0.3 + prior * 0.5;
  }
  pickSource() {
    for (const tier of TIER_ORDER) {
      const fresh = this.sources.filter((s) => s.tier === tier && this.allowed(s) && this.quotaLeft(s) && (this.stats[s.key]?.streak ?? 0) < 3);
      if (fresh.length) return fresh.sort((a, b) => this.score(b) - this.score(a))[0];
    }
    for (const s of this.sources) if (this.stats[s.key]) this.stats[s.key].streak = 0;
    return null;
  }
  note(key, field) {
    const st = (this.stats[key] ??= { calls: 0, valid: 0, improved: 0, streak: 0 });
    if (field === 'fail') st.streak = (st.streak ?? 0) + 1;
    else st[field] = (st[field] ?? 0) + 1;
    if (field === 'improved' || field === 'valid') st.streak = 0;
  }

  // ---------- programs ----------
  library(pid) {
    const dir = join(this.ws, 'programs');
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f), null)).filter((m) => m && m.problem === pid).sort((a, b) => b.wins - a.wins || b.valid - a.valid);
  }
  builtin(pid) {
    return resolve('solvers', pid === 'no-three-in-line' ? 'no-three-in-line.mjs' : 'circles.mjs');
  }
  async writeProgram(src, m) {
    const parent = this.library(m.problem.id)[0];
    const code = readFileSync(parent ? parent.file : this.builtin(m.problem.id), 'utf8');
    const info = parent ? `from the library: ${parent.wins} record(s), ${parent.valid} valid run(s), written by ${parent.source}` : 'the built-in searcher';
    this.note(src.key, 'calls');
    (this.usage[today()] ??= {})[src.key] = (this.usage[today()][src.key] ?? 0) + 1;
    const text = await complete(src, searcherPrompt(m, code, info));
    const prog = extractSearcher(text);
    if (!prog) throw new Error('no usable searcher in the answer');
    const id = `${m.problem.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const dir = join(this.ws, 'programs', id);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'search.mjs');
    writeFileSync(file, prog);
    const meta = { id, problem: m.problem.id, file, source: src.key, parent: parent?.id ?? 'builtin', strategy: m.strategyIndex, wins: 0, valid: 0, runs: 0, created: new Date().toISOString() };
    writeFileSync(join(this.ws, 'programs', `${id}.json`), JSON.stringify(meta, null, 1));
    return meta;
  }

  /** Run a searcher through the harness; AI-written ones without any permission but reading their folder. */
  runSearcher(file, input, trusted) {
    return new Promise((done) => {
      const major = Number(process.versions.node.split('.')[0]);
      const harness = resolve('solvers', 'run.mjs');
      const sandbox = trusted ? [] : [major >= 22 ? '--permission' : '--experimental-permission', `--allow-fs-read=${resolve(file, '..')}`, `--allow-fs-read=${harness}`];
      const child = spawn(process.execPath, [...sandbox, harness, file], { windowsHide: true });
      let out = '';
      let err = '';
      let last = null;
      const kill = setTimeout(() => child.kill('SIGKILL'), (input.seconds + 8) * 1000);
      this._children.add(child);
      child.stdout.on('data', (d) => {
        out += d;
        const lines = out.split('\n');
        out = lines.pop();
        for (const l of lines) if (l.startsWith('BEST ')) last = l.slice(5);
      });
      child.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
      child.on('close', () => {
        clearTimeout(kill);
        this._children.delete(child);
        if (out.startsWith('BEST ')) last = out.slice(5);
        let sol = null;
        try { sol = last ? JSON.parse(last) : null; } catch {}
        done({ sol, err });
      });
      child.stdin.end(JSON.stringify(input));
    });
  }

  /** This machine's hunter identity (hunts/identity.json), if one was created. */
  identity() {
    return readJson(join(this.ws, 'identity.json'), null);
  }

  async submit(sub) {
    const id = this.identity();
    const signed = id ? await signSubmission(sub, id) : sub;
    const file = join(this.ws, 'outbox', `${sub.problem}-${sub.case}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(signed));
    if (this.dry || this.settings.submit === 'none') return { file, status: 'saved (not submitted)' };
    const relay = readJson('site/config.json', {}).relay;
    if (relay && id) {
      try {
        const r = await fetch(`${relay.replace(/\/$/, '')}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed), signal: AbortSignal.timeout(30000) });
        const j = await r.json().catch(() => ({}));
        return { file, status: r.ok ? `Submitted: ${j.url}` : `saved; relay said ${j.error ?? r.status}` };
      } catch (e) {
        return { file, status: `saved; relay unreachable (${e.message})` };
      }
    }
    try {
      const out = execFileSync(process.execPath, ['scripts/submit.mjs', file], { encoding: 'utf8' }).trim().split('\n')[0];
      return { file, status: out };
    } catch (e) {
      return { file, status: `saved; submit failed: ${e.message.slice(0, 120)}` };
    }
  }

  // ---------- one worker slot ----------
  async slot(i, round, b) {
    const only = this.settings.problems?.length ? this.settings.problems : null;
    let m = null;
    for (let k = 0; k < 10 && !m; k++) {
      const c = pickMission(b.data, Math.random, only ? only[Math.floor(Math.random() * only.length)] : undefined);
      m = c;
    }
    if (!m) return;
    const p = m.problem;
    const cur = await this.currentBest(b, p.id, m.cas.id);
    let prog = { file: this.builtin(p.id), source: 'cpu:builtin', trusted: true };
    const aiOn = this.sources.some((s) => this.allowed(s));
    if (aiOn && (round + i) % 2 === 1) {
      const src = this.pickSource();
      if (src) {
        this.active.set(i, { phase: 'writing', problem: p.id, case: m.cas.id, source: src.label });
        this.emit('state', this.snapshot());
        try {
          prog = { ...(await this.writeProgram(src, m)), trusted: false };
          this.log(`${src.label} wrote a searcher`, i);
        } catch (e) {
          this.note(src.key, 'fail');
          this.log(`${src.label}: ${e.message.slice(0, 140)}`, i);
        }
      }
    }
    if (prog.source === 'cpu:builtin') {
      const lib = this.library(p.id).filter((x) => x.wins > 0 || x.valid > 2);
      if (lib.length && Math.random() < 0.5) prog = { ...lib[Math.floor(Math.random() * Math.min(3, lib.length))], trusted: false };
    }
    const seconds = this.settings.seconds ?? 120;
    const input = { problem: p.id, n: m.cas.n, start: cur?.solution ?? null, seconds, seed: Math.floor(Math.random() * 2 ** 31) };
    this.active.set(i, { phase: 'searching', problem: p.id, case: m.cas.id, source: prog.source, until: Date.now() + seconds * 1000 });
    this.emit('state', this.snapshot());
    this.log(`${p.title} n=${m.cas.n} · ${prog.source} · best ${cur ? shortScore(cur.score) : 'none'}`, i);
    const { sol, err } = await this.runSearcher(prog.file, input, prog.trusted);
    this.active.delete(i);
    const metaFile = prog.id ? join(this.ws, 'programs', `${prog.id}.json`) : null;
    const meta = metaFile ? readJson(metaFile, null) : null;
    if (meta) meta.runs++;
    const fail = (msg) => {
      if (!prog.trusted && prog.source !== 'cpu:builtin') this.note(prog.source, 'fail');
      this.log(msg, i);
      if (meta) writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    };
    if (!sol) return fail(`no improvement found${err ? `: ${err.trim().split('\n').pop().slice(0, 140)}` : ''}`);
    const { judge } = await import(new URL(`../problems/${p.id}/judge.mjs`, import.meta.url));
    let s;
    try { ({ score: s } = judge(m.cas, sol)); } catch (e) { return fail(`rejected by the judge: ${e.message}`); }
    if (prog.source !== 'cpu:builtin') this.note(prog.source, 'valid');
    if (meta) meta.valid++;
    const fresh = await this.currentBest(b, p.id, m.cas.id);
    const min = p.score_name === 'radius' ? '0.000000000001' : '1';
    const improves = !fresh || (better(s, fresh.score, p.direction) && toUnits(s) - toUnits(fresh.score) >= toUnits(min));
    if (!improves) {
      this.log(`valid, ${shortScore(s)}: does not beat ${shortScore(fresh.score)}`, i);
    } else {
      if (prog.source !== 'cpu:builtin') this.note(prog.source, 'improved');
      if (meta) meta.wins++;
      const model = prog.source.startsWith('cpu') ? 'cpu (built-in searcher)' : prog.source.replace(/^[a-z]+:/, '');
      const sub = { problem: p.id, case: m.cas.id, ...sol, strategy: m.strategyIndex, method: `Personal hive: ${prog.source === 'cpu:builtin' ? 'built-in searcher' : `searcher written by ${prog.source}`}, ${seconds}s from the current best.`, model };
      const r = await this.submit(sub);
      const imp = { t: new Date().toISOString(), problem: p.id, title: p.title, case: m.cas.id, score: s, previous: fresh?.score ?? null, source: prog.source, status: r.status };
      this.improvements.push(imp);
      this.emit('improve', imp);
      this.log(`🐝 improves ${p.title} n=${m.cas.n}: ${shortScore(s)} > ${fresh ? shortScore(fresh.score) : 'none'} · ${r.status}`, i);
    }
    if (meta) writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  }

  // ---------- run ----------
  async run({ minutes = Infinity, rounds = Infinity } = {}) {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this._children = new Set();
    this.emit('state', this.snapshot());
    const until = Date.now() + minutes * 60000;
    try {
      for (let round = 0; round < rounds && Date.now() < until && !this.stopping; round++) {
        if (!inWindow(this.settings.schedule)) {
          this.emit('state', this.snapshot());
          await new Promise((r) => setTimeout(r, 30000));
          round--;
          continue;
        }
        const b = await this.board();
        this.prior = b.data.learning?.global ?? [];
        const k = Math.max(1, this.settings.workers ?? 1);
        await Promise.all(Array.from({ length: k }, (_, i) => this.slot(i, round, b).catch((e) => this.log(`error: ${e.message}`, i))));
        this.save();
      }
    } finally {
      this.running = false;
      this.stopping = false;
      this.active.clear();
      this.save();
      this.emit('state', this.snapshot());
      this.log('Hive stopped.');
    }
  }

  stop(now = false) {
    this.stopping = true;
    if (now) for (const c of this._children ?? []) c.kill('SIGKILL');
    this.emit('state', this.snapshot());
  }
}
