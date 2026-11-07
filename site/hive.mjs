// The Hive page: one dashboard for two engines.
// - Local mode: the page is served by `npm run hive` on this computer; it steers the Node hive (every
//   core, local models, API keys, subscriptions' CLIs, scheduled nights).
// - Browser mode: anywhere else (phone included); the hive runs in this tab with Web Workers, and calls
//   AI models with keys kept on this device only. No prompt to paste.

import { better, shortScore, toUnits } from './lib/exact.mjs';
import { callModel, listModels, OPENROUTER_FREE_MAX, PROVIDERS, sourceFor } from './lib/llm.mjs';
import { pickMission } from './lib/mission.mjs';
import { fromPreset, inWindow, PRESETS, ruleCommand } from './lib/presets.mjs';
import { extractSearcher, searcherPrompt } from './lib/searchgen.mjs';
import { agentSetupPrompt } from './lib/agentprompt.mjs';
import { BEE, icon } from './icons.mjs';
import { createIdentity, getIdentity, identitySummary } from './identity.mjs';
import { sendPresence } from './lib/presence.mjs';

const PRESET_ICON = { discreet: 'moon', balanced: 'hive', free: 'leaf', full: 'flame' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const TIER_LABEL = { cpu: 'Processor', local: 'On this machine', free: 'Free tiers', paid: 'Paid APIs', sub: 'Subscriptions' };
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------
// Local backend: talks to `npm run hive` on this computer.
function localBackend(token) {
  const api = async (path, body) => {
    const r = await fetch(`/api/${path}`, body === undefined ? { headers: { 'x-hive-token': token } } : { method: 'POST', headers: { 'x-hive-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  };
  return {
    mode: 'local',
    state: () => api('state'),
    preset: (name) => api('preset', { name }),
    settings: (settings) => api('settings', { settings }),
    key: (provider, key) => api('keys', { provider, key }),
    refresh: () => api('inventory', {}),
    start: () => api('start', {}),
    stop: (now) => api('stop', { now }),
    schedule: (install) => api('schedule', { install }),
    command: (text) => api('command', { text }),
    identity: (name) => api('identity', { name }),
    installOllama: () => api('install/ollama', {}),
    connectClaude: () => api('connect/claude-desktop', {}),
    events(on) {
      const es = new EventSource(`/api/events?t=${token}`);
      for (const ev of ['log', 'state', 'improve', 'stats']) es.addEventListener(ev, (e) => on(ev, JSON.parse(e.data)));
      return () => es.close();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Browser backend: the hive runs in this tab.
function browserBackend(DATA) {
  const cores = Math.max(1, navigator.hardwareConcurrency || 2);
  let settings = store.get('ks-hive-settings', null) ?? { ...fromPreset('balanced', cores), workers: Math.max(1, Math.min(4, cores - 1)) };
  let keys = store.get('ks-hive-keys', {});
  let sources = [];
  const stats = store.get('ks-hive-stats', {});
  const usage = store.get('ks-hive-usage', {});
  const improvements = store.get('ks-hive-improvements', []);
  const library = store.get('ks-hive-library', []);
  const listeners = new Set();
  const emit = (ev, d) => listeners.forEach((f) => f(ev, d));
  const active = new Map();
  let runs = store.get('ks-hive-runs', 0);
  const workers = new Set();
  let running = false;
  let stopping = false;
  let wake = null;
  const log = (msg, slot = null) => emit('log', { t: new Date().toISOString(), slot, msg });
  const save = () => { store.set('ks-hive-settings', settings); store.set('ks-hive-stats', stats); store.set('ks-hive-usage', usage); store.set('ks-hive-improvements', improvements.slice(-100)); store.set('ks-hive-library', library.slice(-40)); };
  const snapshot = () => ({ running, stopping, runs, active: [...active.entries()].map(([slot, a]) => ({ slot, ...a })), stats, usage: usage[today()] ?? {}, improvements: improvements.slice(-30).reverse(), waiting: running && !inWindow(settings.schedule) });

  // An AI model running on this device's graphics chip (WebGPU): no key, no account, free.
  // Downloaded once (about 1 GB) after the person asks for it, then cached by the browser.
  const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';
  let engine = null;
  async function webllmModel() {
    const lib = await import(WEBLLM);
    const ids = lib.prebuiltAppConfig.model_list.map((m) => m.model_id);
    const prefs = [/Qwen2\.5-Coder-1\.5B.*q4f16_1/i, /Qwen3-1\.7B.*q4f16_1/i, /Qwen2\.5-1\.5B.*q4f16_1/i];
    for (const re of prefs) { const m = ids.find((x) => re.test(x)); if (m) return m; }
    return ids.find((x) => /q4f16_1/.test(x)) ?? ids[0];
  }
  async function webllmCall(model, prompt) {
    if (!engine) {
      const lib = await import(WEBLLM);
      log(`Loading the on-device model ${model} (first time: a download of about 1 GB)…`);
      engine = await lib.CreateMLCEngine(model, { initProgressCallback: (p) => emit('state', { ...snapshot(), loading: p.text }) });
      log('On-device model ready.');
    }
    const r = await engine.chat.completions.create({ messages: [{ role: 'user', content: prompt }], temperature: 0.7 });
    return r.choices?.[0]?.message?.content ?? '';
  }
  const askModel = (src, prompt, opts) => (src.kind === 'webllm' ? webllmCall(src.model, prompt) : callModel(src, prompt, opts));

  async function discover() {
    const out = [];
    const local = store.get('ks-webllm', null);
    if (local && navigator.gpu) out.push({ key: `webllm:${local}`, tier: 'local', kind: 'webllm', model: local, label: `On this device (WebGPU, ${local.split('-').slice(0, 3).join('-')})` });
    for (const [id, key] of Object.entries(keys)) {
      if (!key || !PROVIDERS[id]) continue;
      try {
        const models = await listModels(id, key);
        if (id === 'openrouter') for (const m of models.slice(0, OPENROUTER_FREE_MAX)) out.push({ ...sourceFor(id, key, m), label: `OpenRouter free · ${m.replace(/:free$/, '')}`, models: models.slice(0, 15), masked: `…${key.slice(-4)}` });
        else if (models[0]) out.push({ ...sourceFor(id, key, models[0]), models: models.slice(0, 15), masked: `…${key.slice(-4)}` });
      } catch (e) { log(`${PROVIDERS[id].label}: ${e.message}`); }
    }
    sources = out;
  }
  let ident = null;
  identitySummary().then((x) => { ident = x; });
  const publicState = () => ({
    settings, presets: PRESETS, providers: PROVIDERS, cores, identity: ident,
    inventory: {
      machine: { cores, memoryGb: navigator.deviceMemory ?? null, platform: navigator.userAgentData?.platform ?? navigator.platform, browser: true },
      sources: sources.map(({ key, tier, kind, label, model, models, masked }) => ({ key, tier, kind, label, model, models, masked })),
      missing: Object.entries(PROVIDERS).filter(([id]) => !keys[id]).map(([id, p]) => ({ key: id, label: p.label, how: `${p.note}. Get a key at ${p.keyUrl}.` })),
      tools: [],
    },
    hive: snapshot(),
  });
  const allowed = (s) => settings.tiers?.[s.tier] !== false && !(settings.disabled ?? []).includes(s.key);
  const quotaLeft = (s) => ((usage[today()] ??= {})[s.key] ?? 0) < (settings.quotas?.[s.tier] ?? 0);
  function pickSource(busy = new Set()) {
    for (const tier of ['local', 'free', 'paid', 'sub']) {
      const all = sources.filter((s) => s.tier === tier && allowed(s) && quotaLeft(s) && (stats[s.key]?.streak ?? 0) < 3);
      const ok = all.filter((s) => !busy.has(s.key)).length ? all.filter((s) => !busy.has(s.key)) : all;
      // Prefer models with a track record across the swarm (records per try), then this device's own.
      const g = (s) => { const x = (DATA.learning?.global ?? []).find((m) => m.model === s.model); return x ? (x.records + 1) / (x.records + x.attempts + 2) : 0.3; };
      const own = (s) => { const x = stats[s.key]; return x ? (x.improved * 3 + x.valid + 1) / (x.calls + 2) : 0.5; };
      if (ok.length) return ok.map((s) => ({ s, v: g(s) + own(s) + Math.random() * 0.25 })).sort((a, b) => b.v - a.v)[0].s;
    }
    for (const s of sources) if (stats[s.key]) stats[s.key].streak = 0;
    return null;
  }
  const note = (key, f) => { const st = (stats[key] ??= { calls: 0, valid: 0, improved: 0, streak: 0 }); if (f === 'fail') st.streak++; else { st[f]++; if (f !== 'calls') st.streak = 0; } };
  const builtinUrl = (pid) => new URL(`solvers/${pid === 'no-three-in-line' ? 'no-three-in-line' : pid === 'protein-folding-2d' ? 'protein-folding-2d' : pid === 'cap-sets' ? 'cap-sets' : 'circles'}.mjs`, location.href).href;

  /** Run a searcher in a module Web Worker: no page, no storage, no keys; stopped after its time. */
  function runInWorker(code, url, input, onBest = () => {}) {
    return new Promise((done) => {
      const modUrl = code ? URL.createObjectURL(new Blob([code], { type: 'text/javascript' })) : url;
      const wrapper = `import { search } from ${JSON.stringify(modUrl)};
self.onmessage = async (e) => { try { await search(e.data, (s) => self.postMessage({ best: s })); } catch (err) { self.postMessage({ error: String(err && err.message || err) }); } self.postMessage({ done: true }); };`;
      const wUrl = URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' }));
      const w = new Worker(wUrl, { type: 'module' });
      workers.add(w);
      let best = null;
      let error = null;
      const end = () => { clearTimeout(t); w.terminate(); workers.delete(w); URL.revokeObjectURL(wUrl); if (code) URL.revokeObjectURL(modUrl); done({ sol: best, err: error }); };
      const t = setTimeout(end, (input.seconds + 3) * 1000);
      w.onmessage = (e) => { if (e.data.best) { best = e.data.best; onBest(best); } if (e.data.error) error = e.data.error; if (e.data.done) end(); };
      w.onerror = (e) => { error = e.message || 'the searcher crashed'; end(); };
      w.postMessage(input);
    });
  }

  async function slot(i, round, data) {
    const only = settings.problems?.length ? settings.problems : null;
    const m = pickMission(data, Math.random, only ? only[Math.floor(Math.random() * only.length)] : undefined);
    if (!m) return;
    const p = m.problem;
    const cur = await fetch(`records/${p.id}/${m.cas.id}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let prog = { url: builtinUrl(p.id), source: 'cpu:builtin' };
    if (sources.some(allowed)) {
      const src = pickSource(new Set([...active.values()].map((a) => a.sourceKey).filter(Boolean)));
      if (src) {
        active.set(i, { phase: 'writing', problem: p.id, case: m.cas.id, source: src.label, sourceKey: src.key, startScore: cur?.score ?? null });
        emit('state', snapshot());
        try {
          const parent = library.filter((x) => x.problem === p.id).sort((a, b) => b.wins - a.wins)[0];
          const parentCode = parent?.code ?? (await fetch(builtinUrl(p.id)).then((r) => r.text()));
          note(src.key, 'calls');
          (usage[today()] ??= {})[src.key] = (usage[today()][src.key] ?? 0) + 1;
          const code = extractSearcher(await askModel(src, searcherPrompt(m, parentCode, parent ? `from your library: ${parent.wins} record(s), by ${parent.source}` : 'the built-in searcher'), { browser: true }));
          if (!code) throw new Error('no usable searcher in the answer');
          prog = { code, source: src.key, entry: { id: Date.now().toString(36), problem: p.id, code, source: src.key, wins: 0, valid: 0 } };
          log(`${src.label} wrote a searcher`, i);
        } catch (e) { note(src.key, 'fail'); log(`${src.label}: ${e.message.slice(0, 140)}`, i); }
      }
    }
    if (prog.source === 'cpu:builtin') {
      const won = library.filter((x) => x.problem === p.id && x.wins > 0);
      if (won.length && Math.random() < 0.5) { const e = won[Math.floor(Math.random() * won.length)]; prog = { code: e.code, source: e.source, entry: e }; }
    }
    const seconds = settings.seconds ?? 120;
    const { judge: judgeLive } = await import(`./problems/${p.id}/judge.mjs`);
    active.set(i, { phase: 'searching', problem: p.id, case: m.cas.id, source: prog.source, model: prog.source.replace(/^[a-z]+:/, ''), started: Date.now(), until: Date.now() + seconds * 1000, startScore: cur?.score ?? null, score: null });
    emit('state', snapshot());
    log(`${p.title} n=${m.cas.n} · ${prog.source} · best ${cur ? shortScore(cur.score) : 'none'}`, i);
    let lastEmit = 0;
    const onBest = (sol) => {
      try { const a = active.get(i); if (a) { a.score = judgeLive(m.cas, sol).score; if (Date.now() - lastEmit > 800) { lastEmit = Date.now(); emit('state', snapshot()); } } } catch {}
    };
    const { sol, err } = await runInWorker(prog.code, prog.url, { problem: p.id, n: m.cas.n, ...(m.cas.sequence ? { sequence: m.cas.sequence } : {}), start: cur?.solution ?? null, seconds, seed: Math.floor(Math.random() * 2 ** 31) }, onBest);
    active.delete(i);
    runs++;
    store.set('ks-hive-runs', runs);
    if (!sol) { if (prog.source !== 'cpu:builtin') note(prog.source, 'fail'); return log(`no improvement found${err ? `: ${err.slice(0, 120)}` : ''}`, i); }
    const { judge } = await import(`./problems/${p.id}/judge.mjs`);
    let s;
    try { ({ score: s } = judge(m.cas, sol)); } catch (e) { if (prog.source !== 'cpu:builtin') note(prog.source, 'fail'); return log(`rejected by the judge: ${e.message}`, i); }
    if (prog.source !== 'cpu:builtin') note(prog.source, 'valid');
    if (prog.entry) prog.entry.valid++;
    const fresh = await fetch(`records/${p.id}/${m.cas.id}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => cur);
    const min = p.score_name === 'radius' ? '0.000000000001' : '1';
    if (fresh && !(better(s, fresh.score, p.direction) && toUnits(s) - toUnits(fresh.score) >= toUnits(min))) return log(`valid, ${shortScore(s)}: does not beat ${shortScore(fresh.score)}`, i);
    if (prog.source !== 'cpu:builtin') note(prog.source, 'improved');
    if (prog.entry) { prog.entry.wins++; if (!library.includes(prog.entry)) library.push(prog.entry); }
    const model = prog.source.startsWith('cpu') ? 'browser (built-in searcher)' : prog.source.replace(/^[a-z]+:/, '');
    const sub = { problem: p.id, case: m.cas.id, ...sol, strategy: m.strategyIndex, method: `Browser hive: ${prog.source === 'cpu:builtin' ? 'built-in searcher' : `searcher written by ${prog.source}`}, ${seconds}s from the current best.`, model };
    const imp = { t: new Date().toISOString(), problem: p.id, title: p.title, case: m.cas.id, score: s, previous: fresh?.score ?? null, source: prog.source, status: 'ready to submit', sub };
    improvements.push(imp);
    emit('improve', imp);
    log(`🐝 improves ${p.title} n=${m.cas.n}: ${shortScore(s)} > ${fresh ? shortScore(fresh.score) : 'none'}`, i);
  }

  async function run() {
    running = true;
    stopping = false;
    // Live presence: tell the swarm what this hive's agents are doing, every 30 seconds.
    const beat = () => running && sendPresence(DATA.config.relay, getIdentity(), [...active.values()], 'browser');
    const beater = setInterval(beat, 30000);
    setTimeout(beat, 3000);
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
    emit('state', snapshot());
    try {
      for (let round = 0; !stopping; round++) {
        if (!inWindow(settings.schedule)) { emit('state', snapshot()); await new Promise((r) => setTimeout(r, 30000)); continue; }
        const data = await fetch('data.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => DATA);
        await Promise.all(Array.from({ length: Math.max(1, settings.workers) }, (_, i) => slot(i, round, data).catch((e) => log(`error: ${e.message}`, i))));
        save();
        emit('stats', snapshot());
      }
    } finally {
      clearInterval(beater);
      running = false;
      stopping = false;
      active.clear();
      sendPresence(DATA.config.relay, getIdentity(), [], 'browser');
      try { await wake?.release(); } catch {}
      save();
      emit('state', snapshot());
      log('Hive stopped.');
    }
  }

  return {
    mode: 'browser',
    async state() { if (!sources.length) await discover(); return publicState(); },
    async preset(name) { settings = { ...fromPreset(name, cores), workers: Math.max(1, Math.min(cores - 1 || 1, Math.round(cores * PRESETS[name].cores))), disabled: settings.disabled, problems: settings.problems }; save(); return publicState(); },
    async settings(s) { settings = { ...settings, ...s, tiers: { ...settings.tiers, ...(s.tiers ?? {}) }, quotas: { ...settings.quotas, ...(s.quotas ?? {}) }, schedule: { ...settings.schedule, ...(s.schedule ?? {}) } }; settings.workers = Math.max(1, Math.min(cores, Number(settings.workers) || 1)); save(); return publicState(); },
    async key(provider, key) {
      if (key) await listModels(provider, key).catch((e) => { throw new Error(`the key did not work: ${e.message}`); });
      keys = { ...keys, [provider]: key || undefined };
      if (!key) delete keys[provider];
      store.set('ks-hive-keys', keys);
      await discover();
      return publicState();
    },
    async refresh() { await discover(); return publicState(); },
    async webllm(on) {
      if (on) {
        if (!navigator.gpu) throw new Error('This browser has no WebGPU: use a recent Chrome or Edge, or add a free key instead.');
        store.set('ks-webllm', await webllmModel());
      } else { store.set('ks-webllm', null); engine = null; }
      await discover();
      return publicState();
    },
    async identity(name) { await createIdentity(name); ident = await identitySummary(); return publicState(); },
    async start() { settings = { ...settings, autostart: true }; save(); if (!running) run(); return publicState(); },
    async stop(now) { settings = { ...settings, autostart: false }; save(); stopping = true; if (now) workers.forEach((w) => w.terminate()); emit('state', snapshot()); return publicState(); },
    async schedule() { throw new Error('Scheduled nights need the hive on a computer (npm run hive). In the browser, the hive runs while this tab is open.'); },
    async command(text) {
      const src = sources.find(allowed);
      if (src) {
        try {
          const out = await askModel(src, `You configure a personal hive. Current settings: ${JSON.stringify(settings)}. Fields: workers (1..${cores}), seconds (20..3600), tiers {local,free,paid,sub: bool}, quotas {...: calls/day}, schedule {enabled, from "HH:MM", to "HH:MM"}, problems (subset of ["circles-in-square","circles-in-circle","no-three-in-line"]). The person said: ${JSON.stringify(text)}. Reply ONLY with JSON {"patch": {fields to change}, "explain": "one short sentence in their language"}.`, { browser: true, timeoutMs: 60000 });
          const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
          return { patch: j.patch, explain: j.explain, by: src.label };
        } catch {}
      }
      const patch = ruleCommand(text, cores);
      return patch ? { patch, explain: `Preset: ${patch.preset}`, by: 'built-in rules' } : { patch: null, explain: 'Not understood. Try "free only", "discreet", "full power", or add a model for free-form commands.' };
    },
    events(on) { listeners.add(on); return () => listeners.delete(on); },
  };
}


// ---------- the control room: helpers ----------
let SITE = { problems: [] }; // the site data, set when the page opens
const SOURCE_KIND = (key = '') => {
  if (key.startsWith('cpu')) return ['Processor', 'k-cpu'];
  if (/^(ollama|webllm)/.test(key)) return ['Local model', 'k-local'];
  if (key.startsWith('cli')) return ['Subscription', 'k-sub'];
  if (/^(anthropic|openai|deepseek|moonshot|zai)/.test(key)) return ['Paid API', 'k-paid'];
  if (key.startsWith('echo')) return ['Test', 'k-cpu'];
  return ['Free model', 'k-free'];
};
const shortModel = (m = '') => (m === 'builtin' ? 'Built-in searcher' : m.replace(/^openrouter[:/]/, '').replace(/:free$/, '').split('/').pop().slice(0, 28));
const initials = (m = '') => shortModel(m).replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'AI';
function joursDeChasse(running) {
  const d = store.get('ks-hive-days', []);
  const t = today();
  if (running && !d.includes(t)) { d.push(t); store.set('ks-hive-days', d.slice(-400)); }
  let k = 0;
  for (let day = new Date(); d.includes(day.toISOString().slice(0, 10)); day.setUTCDate(day.getUTCDate() - 1)) k++;
  return { streak: k, days: d.length };
}
function niveau(xp) {
  const lvl = Math.floor(Math.sqrt(xp / 5));
  const base = lvl * lvl * 5;
  const next = (lvl + 1) * (lvl + 1) * 5;
  return { lvl, pct: Math.round(((xp - base) / (next - base)) * 100), toNext: next - xp };
}
function agentCard(a) {
  const [kind, cls] = SOURCE_KIND(a.phase === 'writing' ? a.sourceKey ?? '' : a.source ?? '');
  const p = SITE.problems.find((x) => x.id === a.problem);
  const model = a.phase === 'writing' ? a.source : shortModel(a.model ?? a.source);
  const better = a.score != null && a.startScore != null && a.score !== a.startScore;
  const sc = a.phase === 'writing' ? '<span class="aw">writing its search program…</span>'
    : a.score != null ? `<span class="${better ? 'up' : ''}">${esc(shortScore(a.startScore ?? '—'))} → <b>${esc(shortScore(a.score))}</b>${better ? ' ▲' : ''}</span>`
    : `<span>best on the board ${esc(a.startScore != null ? shortScore(a.startScore) : 'none yet')}</span>`;
  return `<div class="agent ph-${a.phase}">
    <div class="ahead"><span class="aav ${cls}">${esc(initials(model))}</span><div class="aname"><b>${esc(model)}</b><small class="kind ${cls}">${kind}</small></div><span class="aphase">${a.phase === 'writing' ? icon('pen') : icon('search')}</span></div>
    <div class="atask">${esc(p?.title ?? a.problem)} · ${p?.id === 'protein-folding-2d' ? esc(String(a.case).toUpperCase()) : `n = ${esc(a.case)}`}</div>
    <div class="ascore">${sc}</div>
    ${a.until ? `<div class="bar"><i style="animation-duration:${Math.max(1, Math.round((a.until - Date.now()) / 1000))}s"></i></div><small class="arem" data-until="${a.until}"></small>` : '<div class="bar ind"><i></i></div>'}
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// The page.
export async function hivePage(app, DATA, { toast, copy, submitUrl }) {
  SITE = DATA;
  const token = new URLSearchParams(location.search).get('t') ?? sessionStorage.getItem('ks-hive-token');
  let local = false;
  try { local = !!token && (await fetch('/api/hello', { signal: AbortSignal.timeout(1500) }).then((r) => r.json())).local; } catch {}
  if (token) sessionStorage.setItem('ks-hive-token', token);
  const be = local ? localBackend(token) : browserBackend(DATA);
  if (new URLSearchParams(location.search).get('code')) {
    try {
      const { finishOpenRouterLogin } = await import('./openrouter.mjs');
      const key = await finishOpenRouterLogin();
      if (key) { await be.key('openrouter', key); toast('OpenRouter connected: free models added to your hive'); }
    } catch (e) { toast(e.message); }
  }
  let st;
  try { st = await be.state(); } catch (e) { app.innerHTML = `<h1>Your hive</h1><p class="verdict bad">${esc(e.message)}</p>`; return; }
  const logLines = [];

  const render = () => {
    const s = st.settings;
    const inv = st.inventory;
    const h = st.hive;
    const srcByTier = (t) => inv.sources.filter((x) => x.tier === t);
    const on = (src) => s.tiers?.[src.tier] !== false && !(s.disabled ?? []).includes(src.key);
    app.innerHTML = `
    <div class="hive-head">
      <div>
        <p class="crumbs"><a href="#/">Hunts</a> / Your hive</p>
        <h1>Your hive</h1>
        ${!local ? `<p class="hint">${window.__ksInstall ? `<button class="btn small" id="installapp">${icon('install')} Install the app</button>` : /iphone|ipad/i.test(navigator.userAgent) ? `${icon('install')} To install: Share, then “Add to Home Screen”.` : `${icon('install')} Install it from your browser menu (“Install app” or “Add to Home screen”).`}</p>` : ''}
        <p class="mode">${local ? `${icon('laptop')} Local hive on this computer: every core, your models, keys and subscriptions.` : `${icon('phone')} Browser hive on this device: it runs in this tab. For the full power of a computer, see “On a computer” below.`}</p>
      </div>
      <button class="go ${h.running ? 'on' : ''}" id="go" aria-pressed="${h.running}"><span class="orbit" style="--n:${Math.min(12, s.workers)}">${BEE}${Array.from({ length: Math.min(12, s.workers) }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span><b>${h.running ? (h.stopping ? 'Stopping…' : h.waiting ? 'Waiting for its hours' : 'Hunting') : 'Start'}</b><small>${h.running ? 'tap to stop' : `${s.workers} worker${s.workers > 1 ? 's' : ''} · ${esc(PRESETS[s.preset]?.label ?? 'custom')}`}</small></button>
    </div>

    <div class="cta-row" style="margin-top:10px"><button class="btn small" id="invite2">${icon('share')} Invite friends</button><a class="btn small" href="#/start">Help me set up</a></div>

    ${(() => {
      const runs = h.runs ?? 0;
      const imps = h.improvements?.length ?? 0;
      const xp = runs + imps * 10;
      const L = niveau(xp);
      const J = joursDeChasse(h.running);
      const n = Math.max(1, s.workers);
      const cards = (h.active ?? []).map(agentCard);
      while (cards.length < n) cards.push(`<div class="agent idle"><div class="ahead"><span class="aav">${BEE}</span><div class="aname"><b>${h.running ? 'Getting a mission…' : 'Asleep'}</b><small class="kind">worker ${cards.length + 1}</small></div></div><div class="atask">${h.running ? 'picking a case few people tried' : 'press Start to wake the swarm'}</div></div>`);
      return `<section class="control">
        <div class="cbar">
          <div class="clevel"><span class="lvl mono">LV ${L.lvl}</span><div class="xp"><i style="width:${L.pct}%"></i></div><small>${xp} XP · ${L.toNext} to level ${L.lvl + 1}</small></div>
          <div class="cstat"><b>${runs}</b><small>searches</small></div>
          <div class="cstat"><b>${imps}</b><small>records found</small></div>
          <div class="cstat"><b>${J.streak}</b><small>day streak ${icon('flame')}</small></div>
          <div class="cstat"><b>${(h.active ?? []).length}/${n}</b><small>agents at work</small></div>
        </div>
        ${h.loading ? `<p class="hint">${esc(h.loading)}</p>` : ''}
        <div class="agents">${cards.join('')}</div>
      </section>`;
    })()}
    ${(() => {
      const ps = (s.problems ?? []).map((id) => DATA.problems.find((x) => x.id === id)).filter(Boolean);
      if (ps.length !== 1) return '';
      const p = ps[0];
      return `<div class="epic"><span class="mono">YOUR EPIC</span><b>${esc(p.title)}</b><small>${p.cases.length} cases · ${esc(p.level ?? '')}</small><a class="btn small" href="#/map/${p.id}">Territory map</a><button class="btn small" id="epic-invite">${icon('share')} Invite friends</button><button class="btn small ghost" id="epic-all">Hunt everything</button></div>`;
    })()}
    ${(() => {
      const hasHunt = (s.problems ?? []).length > 0;
      const hasName = !!st.identity;
      const hasAI = inv.sources.length > 0;
      const steps = [
        [hasHunt, 'Pick your hunt', 'Join one from the <a href="#/catalogue">hunts</a> (or keep “everything”).', '#/catalogue'],
        [hasName, 'Pick your hunter name', 'It signs your records and shows you live to the swarm (below, in Rules).', null],
        [hasAI, 'Add free AI power', 'One click: “Connect with OpenRouter” below. Without it, your processor hunts alone.', null],
        [h.running, 'Press Start', 'Then watch your agents work, live, right here.', null],
      ];
      const next = steps.find((x) => !x[0]);
      if (!next) return '';
      return `<div class="todo"><span class="mono">WHAT TO DO NOW</span><ol>${steps.map(([ok, t, d]) => `<li class="${ok ? 'ok' : next[1] === t ? 'now' : ''}"><b>${ok ? '✓ ' : ''}${t}</b><small>${d}</small></li>`).join('')}</ol></div>`;
    })()}
    <div class="voice">
      <button class="btn icon-btn" id="mic" title="Speak" aria-label="Speak a command">${icon('mic')}</button>
      <input id="cmd" placeholder='Tell your hive what to do: "only free models, at night", "full power for 2 hours"…' aria-label="Command">
      <button class="btn" id="cmdgo">Go</button>
    </div>
    <div id="proposal"></div>

    <h2>Presets</h2>
    <div class="presets">${Object.entries(st.presets).map(([k, p]) => `<button class="preset ${s.preset === k ? 'sel' : ''}" data-preset="${k}"><span class="pi">${icon(PRESET_ICON[k])}</span><b>${esc(p.label)}</b><small>${esc(p.blurb)}</small></button>`).join('')}</div>

    <div class="two" style="margin-top:28px">
      <section class="panel">
        <h3>What you give</h3>
        <div class="src on"><span class="pi">${icon('cpu')}</span><div><b>${TIER_LABEL.cpu}</b><small>${esc(inv.machine.cores)} cores${inv.machine.cpu ? ` · ${esc(inv.machine.cpu)}` : ''}${inv.machine.memoryGb ? ` · ${esc(inv.machine.memoryGb)} GB` : ''}${inv.machine.gpu?.length ? ` · GPU ${esc(inv.machine.gpu.join(', '))}` : ''}</small></div>
          <label class="num">workers <input type="range" min="1" max="${st.cores}" value="${s.workers}" id="workers"><output>${s.workers}</output></label></div>
        ${['local', 'free', 'paid', 'sub'].map((t) => `
          <div class="tier"><label class="switch"><input type="checkbox" data-tier="${t}" ${s.tiers?.[t] !== false ? 'checked' : ''}><span></span></label><b>${TIER_LABEL[t]}</b><small>${s.quotas?.[t] ?? 0} calls/day per source</small></div>
          ${srcByTier(t).map((x) => `<div class="src ${on(x) ? 'on' : ''}"><label class="switch"><input type="checkbox" data-src="${esc(x.key)}" ${!(s.disabled ?? []).includes(x.key) ? 'checked' : ''}><span></span></label><div><b>${esc(x.label)}</b><small>${h.usage?.[x.key] ?? 0} calls today${x.masked ? ` · key ${esc(x.masked)}` : ''}${h.stats?.[x.key] ? ` · ${h.stats[x.key].improved} record(s) from ${h.stats[x.key].calls} call(s)` : ''}</small></div>${x.masked ? `<button class="btn small" data-forget="${esc(x.key.split(':')[0])}">Forget key</button>` : ''}${x.kind === 'webllm' ? '<button class="btn small" id="webllm-off">Remove</button>' : ''}</div>`).join('')}`).join('')}
        <div class="connect">
          <h4>Connect your AI <small>most people already have one of these</small></h4>
          ${inv.sources.some((x) => x.key.startsWith('openrouter:')) ? '' : `<div class="addrow hero-row"><b>${icon('spark')} OpenRouter, free models</b><small>Every free model of the moment (models in test, DeepSeek, Qwen, Nemotron, Gemma…) behind one login; the hive uses up to 6 at once and learns which works best. Log in with Google or GitHub, approve, done: nothing to copy. Free within OpenRouter's daily limits.</small><div class="addkey"><button class="btn primary small" id="or-login">Connect with OpenRouter</button></div></div>`}
          <div class="addrow hero-row"><b>${icon('hive')} Your subscription: ChatGPT, Claude, Gemini</b>
            <small>${local
              ? `Detected here: ${['cli:claude', 'cli:codex', 'cli:gemini'].map((k) => inv.sources.some((x) => x.key === k) ? `<span class="ok">${k.slice(4)} ✓</span>` : `<span class="dimmed">${k.slice(4)}</span>`).join(' · ')}. The hive drives them through their official command-line tools, within your plan's own limits. Missing one? <a href="https://docs.anthropic.com/en/docs/claude-code/overview" target="_blank" rel="noopener">Claude Code</a> (Claude Pro/Max), <a href="https://github.com/openai/codex" target="_blank" rel="noopener">Codex</a> (ChatGPT plans), <a href="https://github.com/google-gemini/gemini-cli" target="_blank" rel="noopener">Gemini CLI</a> (any Google account).`
              : 'Hunt with the chat app you pay for: the mission page copies the prompt and opens ChatGPT, Claude or Gemini for you. Paste their answer back to check it.'}</small>
            <div class="addkey">${local ? '<button class="btn small" id="claude-connect">Also connect Claude Desktop</button>' : '<a class="btn small" href="#/mission">Hunt with my chat app</a>'}</div></div>
          ${inv.sources.some((x) => x.key.startsWith('gemini:')) ? '' : `<div class="addrow"><b>${icon('key')} Google Gemini, free tier</b><small>With your Google account: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">AI Studio</a> → “Create API key” → paste it here.</small><div class="addkey"><input type="password" autocomplete="off" placeholder="paste your Gemini key" data-keyfor="gemini"><button class="btn small" data-savekey="gemini">Connect</button></div></div>`}
          <p class="hint">Keys are ${local ? 'saved in .env.local on this computer' : 'kept in this browser only'} and sent only to their provider${local ? '' : '; search programs never see them'}.</p>
        </div>
        <details class="add"><summary>More free providers, cheap Chinese APIs, local models</summary>
          ${local ? (inv.sources.some((x) => x.kind === 'ollama') ? '<p class="hint">Ollama detected: its best model is in your sources.</p>' : '<div class="addrow"><b>Local models (optional)</b><small>Only if you want to: installs Ollama and qwen2.5-coder 7B (about 5 GB) to run models on this computer.</small><div class="addkey"><button class="btn small" id="ollama-install">Install it for me</button></div></div>') : ''}
          ${!local && !inv.sources.some((x) => x.kind === 'webllm') ? `<div class="addrow"><b>On-device model (no key, no account)</b><small>${navigator.gpu ? 'Runs on this device’s graphics chip. Downloads about 1 GB once. Best on a computer or a recent phone, on Wi-Fi.' : 'Needs WebGPU (recent Chrome or Edge).'}</small>${navigator.gpu ? '<div class="addkey"><button class="btn small" id="webllm-on">Download and use</button></div>' : ''}</div>` : ''}
          ${['groq', 'mistral', 'cerebras', 'sambanova', 'github', 'deepseek', 'moonshot', 'zai', 'anthropic', 'openai'].filter((id) => !inv.sources.some((x) => x.key.startsWith(`${id}:`))).map((id) => { const p = st.providers[id]; return `<div class="addrow"><b>${esc(p.label)}</b><small>${esc(p.note)} · <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener">get a key ↗</a></small><div class="addkey"><input type="password" autocomplete="off" placeholder="paste your ${esc(p.label)} key" data-keyfor="${id}"><button class="btn small" data-savekey="${id}">Connect</button></div></div>`; }).join('')}
        </details>
        ${local && inv.tools?.length ? `<p class="hint">Tools your agents already have (MCP): ${inv.tools.map((t) => esc(t.name)).join(', ')}. The hive does not use them for searching; the setup prompt below may.</p>` : ''}
      </section>

      <section class="panel">
        <h3>Rules</h3>
        <div class="row">${st.identity ? `Hunter <b>${esc(st.identity.name)}</b> <small class="hint mono">key ${esc(st.identity.fp)}</small>` : `<span>Your hunter name</span> <input id="hname" placeholder="e.g. kev" maxlength="24" style="background:var(--bg2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px"> <button class="btn small" id="hsave">Save</button><small class="hint">No account: this device gets a key that signs your records.</small>`}</div>
        <label class="row">Minutes per search <input type="number" min="1" max="60" value="${Math.round((s.seconds ?? 120) / 60) || 1}" id="minutes"></label>
        ${['local', 'free', 'paid', 'sub'].map((t) => `<label class="row">${TIER_LABEL[t]}: calls per day <input type="number" min="0" max="100000" value="${s.quotas?.[t] ?? 0}" data-quota="${t}"></label>`).join('')}
        <div class="row"><label class="switch"><input type="checkbox" id="sched" ${s.schedule?.enabled ? 'checked' : ''}><span></span></label> Only between <input type="time" id="from" value="${esc(s.schedule?.from ?? '23:00')}"> and <input type="time" id="to" value="${esc(s.schedule?.to ?? '07:00')}"></div>
        ${local ? `<div class="row">${st.schedule?.installed ? 'Runs every night on this computer, even with this page closed. <button class="btn small" id="unsched">Remove</button>' : '<button class="btn small" id="install">Run every night on this computer</button><small class="hint">Creates a scheduled task (Windows Task Scheduler or cron) at the start time above. You can remove it here.</small>'}</div>` : ''}
        ${local ? `<div class="row"><label class="switch"><input type="checkbox" id="autosub" ${s.submit !== 'none' ? 'checked' : ''}><span></span></label> Publish improvements automatically on GitHub (with your GitHub CLI login). Off: they wait in hunts/outbox.</div>` : '<div class="row hint">In the browser, each improvement waits for your click on Submit.</div>'}
        <div class="row hunts">Hunts: ${DATA.problems.map((p) => `<label><input type="checkbox" data-problem="${p.id}" ${!s.problems?.length || s.problems.includes(p.id) ? 'checked' : ''}> ${esc(p.title)}</label>`).join('')}</div>
      </section>
    </div>

    <div class="two" style="margin-top:24px">
      <section class="panel">
        <h3>Activity</h3>
        <ul class="feed hivelog" id="log">${logLines.slice(0, 40).map((l) => `<li><time>${l.t.slice(11, 19)}</time> ${l.slot === null ? '' : `<b>#${l.slot + 1}</b> `}${esc(l.msg)}</li>`).join('')}</ul>
      </section>
      <section class="panel">
        <h3>Your improvements</h3>
        ${h.improvements?.length ? `<ul class="feed">${h.improvements.map((x, k) => `<li><span>${icon('hive')} <b>${esc(x.title)}, n = ${esc(x.case)}</b> ${esc(shortScore(x.score))}${x.previous ? ` <small>(was ${esc(shortScore(x.previous))})</small>` : ''}<br><small>${esc(x.source)} · ${esc(x.status)}</small></span>${x.sub ? `<button class="btn small" data-submit="${k}">Submit</button>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet. Records found by your hive land here.</p>'}
      </section>
    </div>

    ${(() => {
      const day = new Date(Date.now() - 86400000).toISOString();
      const recent = DATA.feed.filter((e) => e.ts >= day);
      const hunters = new Set(recent.map((e) => e.author)).size;
      return `<section class="panel swarmnow" style="margin-top:24px">
        <h3>The swarm right now</h3>
        <div class="livestrip inline" data-live="strip"></div>
        <p class="hint" style="margin-top:12px">Last 24 hours, everyone:</p>
        <div class="cbar" style="grid-template-columns:repeat(3,1fr)"><div class="cstat"><b>${hunters}</b><small>hunters active</small></div><div class="cstat"><b>${recent.filter((e) => e.nature === 'record').length}</b><small>records</small></div><div class="cstat"><b>${recent.length}</b><small>verified tries</small></div></div>
        ${recent.length ? `<ul class="feed">${recent.slice(0, 6).map((e) => `<li>${e.nature === 'record' ? `<span class="badge t-${esc(e.tier)}">${esc(e.tier)}</span>` : '<span class="badge t-attempt">try</span>'} <a href="#/u/${esc(e.author)}">@${esc(e.author)}</a> · ${esc(DATA.problems.find((x) => x.id === e.problem)?.title ?? e.problem)} · ${esc(shortScore(e.score))}${e.model ? ` <small class="kind">${esc(shortModel(e.model))}</small>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Quiet for now. Start your hive and be the first today.</p>'}
      </section>`;
    })()}
    <details class="panel" style="margin-top:24px" ${local ? '' : 'open'}><summary><b>On a computer: let your agent set everything up</b></summary>
      <p class="hint">Paste this once into Claude Code, Codex or Gemini CLI. It installs the hive, shows you what it found, asks before every connection, and schedules nights only if you say yes.</p>
      <div class="cta-row"><button class="btn primary" id="copyagent">Copy the setup prompt</button><a class="btn" href="#/start">Simple setup, no agent</a></div>
      <pre class="prompt">${esc(agentSetupPrompt())}</pre>
    </details>`;
    wire();
  };

  const apply = async (fn) => { try { st = await fn(); render(); } catch (e) { toast(e.message); } };
  const patch = (p) => apply(() => be.settings({ ...p }));
  function wire() {
    const $ = (q) => app.querySelector(q);
    $('#go').onclick = async () => {
      if (st.hive.running) return apply(() => be.stop(false));
      if (local && st.settings.submit !== 'none' && !store.get('ks-consent-submit', false)) {
        const ok = confirm('When your hive beats a record, it will publish the solution on GitHub under your account (public, permanent, credited to you). OK? Cancel = keep improvements on this computer only.');
        store.set('ks-consent-submit', true);
        if (!ok) st = await be.settings({ submit: 'none' });
      }
      apply(() => be.start());
    };
    $('#or-login')?.addEventListener('click', async () => {
      const { startOpenRouterLogin } = await import('./openrouter.mjs');
      startOpenRouterLogin(`${location.origin}${location.pathname}`); // the local session token stays in sessionStorage, never in a third-party URL
    });
    $('#ollama-install')?.addEventListener('click', async () => {
      if (!confirm('Install Ollama and download the qwen2.5-coder 7B model (about 5 GB) on this computer?')) return;
      try { const r = await be.installOllama(); st = r; render(); toast(r.message); } catch (e) { toast(e.message); }
    });
    $('#claude-connect')?.addEventListener('click', async () => {
      if (!confirm('Add Kickswarm to Claude Desktop\'s connectors? Your current settings file is backed up first.')) return;
      try { const r = await be.connectClaude(); st = r; render(); toast(r.message); } catch (e) { toast(e.message); }
    });
    $('#webllm-on')?.addEventListener('click', () => { if (confirm('Download a free AI model to this device (about 1 GB, once)? It runs locally; nothing is sent anywhere.')) apply(() => be.webllm(true)); });
    $('#webllm-off')?.addEventListener('click', () => apply(() => be.webllm(false)));
    $('#hsave')?.addEventListener('click', () => { const v = $('#hname').value.trim(); if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/.test(v)) return toast('2 to 24 letters, digits, - or _'); apply(() => be.identity(v)); });
    $('#autosub')?.addEventListener('change', (e) => patch({ submit: e.target.checked ? 'improvements' : 'none' }));
    app.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => apply(() => be.preset(b.dataset.preset))));
    const w = $('#workers');
    w.oninput = () => (w.nextElementSibling.textContent = w.value);
    w.onchange = () => patch({ workers: Number(w.value), preset: 'custom' });
    app.querySelectorAll('[data-tier]').forEach((c) => (c.onchange = () => patch({ tiers: { ...st.settings.tiers, [c.dataset.tier]: c.checked }, preset: 'custom' })));
    app.querySelectorAll('[data-src]').forEach((c) => (c.onchange = () => {
      const d = new Set(st.settings.disabled ?? []);
      c.checked ? d.delete(c.dataset.src) : d.add(c.dataset.src);
      patch({ disabled: [...d] });
    }));
    app.querySelectorAll('[data-quota]').forEach((c) => (c.onchange = () => patch({ quotas: { ...st.settings.quotas, [c.dataset.quota]: Number(c.value) }, preset: 'custom' })));
    $('#minutes').onchange = (e) => patch({ seconds: Math.max(1, Number(e.target.value)) * 60 });
    const sched = () => patch({ schedule: { enabled: $('#sched').checked, from: $('#from').value, to: $('#to').value } });
    $('#sched').onchange = sched;
    $('#from').onchange = sched;
    $('#to').onchange = sched;
    app.querySelectorAll('[data-problem]').forEach((c) => (c.onchange = () => patch({ problems: [...app.querySelectorAll('[data-problem]:checked')].map((x) => x.dataset.problem) })));
    app.querySelectorAll('[data-savekey]').forEach((b) => (b.onclick = async () => {
      const id = b.dataset.savekey;
      const v = app.querySelector(`[data-keyfor="${id}"]`).value.trim();
      if (!v) return;
      b.disabled = true;
      b.textContent = 'Checking…';
      await apply(() => be.key(id, v));
      toast(`${st.providers[id].label} connected`);
    }));
    app.querySelectorAll('[data-forget]').forEach((b) => (b.onclick = () => apply(() => be.key(b.dataset.forget, ''))));
    $('#install')?.addEventListener('click', async () => {
      if (!confirm(`Create a scheduled task that starts the hive every day at ${st.settings.schedule.from}? You can remove it here at any time.`)) return;
      try { const r = await be.schedule(true); st = r; render(); toast(r.message); } catch (e) { toast(e.message); }
    });
    $('#unsched')?.addEventListener('click', async () => { try { const r = await be.schedule(false); st = r; render(); toast(r.message); } catch (e) { toast(e.message); } });
    app.querySelectorAll('[data-submit]').forEach((b) => (b.onclick = () => submitUrl(st.hive.improvements[Number(b.dataset.submit)].sub)));
    $('#installapp')?.addEventListener('click', async () => { await window.__ksInstall.prompt(); window.__ksInstall = null; render(); });
    $('#invite2').onclick = async () => {
      const url = `${DATA.config.site}/#/start`;
      const text = 'Join my hive on Kickswarm Records: our computers and AIs hunt open math world records together. Two minutes to join.';
      try { if (navigator.share) await navigator.share({ title: 'Kickswarm Records', text, url }); else await copy(`${text} ${url}`, 'Invitation copied: send it to your friends'); } catch {}
    };
    $('#epic-invite')?.addEventListener('click', async () => {
      const pid = st.settings.problems[0];
      const p = DATA.problems.find((x) => x.id === pid);
      const url = `${DATA.config.site}/#/join/${pid}`;
      const text = `Join me on the ${p.title} hunt on Kickswarm: one click, no account.`;
      try { if (navigator.share) await navigator.share({ title: `Kickswarm · ${p.title}`, text, url }); else await copy(`${text} ${url}`, 'Invitation copied: send it to your friends'); } catch {}
    });
    $('#epic-all')?.addEventListener('click', () => patch({ problems: [] }));
    $('#copyagent').onclick = () => copy(agentSetupPrompt(), 'Setup prompt copied: paste it into your agent');
    // Commands, typed or spoken.
    const run = async (text) => {
      if (!text.trim()) return;
      $('#proposal').innerHTML = '<p class="hint">Thinking…</p>';
      try {
        const r = await be.command(text);
        if (!r.patch) { $('#proposal').innerHTML = `<p class="verdict bad">${esc(r.explain)}</p>`; return; }
        $('#proposal').innerHTML = `<div class="verdict ok"><b>${esc(r.explain || 'Proposed change')}</b><br><small>by ${esc(r.by)}</small><pre class="prompt">${esc(JSON.stringify(r.patch, null, 1))}</pre><div class="cta-row"><button class="btn primary" id="applyp">Apply</button><button class="btn" id="cancelp">Cancel</button></div></div>`;
        $('#applyp').onclick = () => { patch({ ...r.patch, preset: r.patch.preset ?? 'custom' }); };
        $('#cancelp').onclick = () => ($('#proposal').innerHTML = '');
      } catch (e) { $('#proposal').innerHTML = `<p class="verdict bad">${esc(e.message)}</p>`; }
    };
    $('#cmdgo').onclick = () => run($('#cmd').value);
    $('#cmd').onkeydown = (e) => e.key === 'Enter' && run($('#cmd').value);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) $('#mic').style.display = 'none';
    else $('#mic').onclick = () => {
      const r = new SR();
      r.lang = navigator.language || 'en-US';
      r.interimResults = false;
      $('#mic').innerHTML = icon('rec');
      r.onresult = (e) => { const t = e.results[0][0].transcript; $('#cmd').value = t; run(t); };
      r.onend = () => ($('#mic').innerHTML = icon('mic'));
      r.start();
    };
  }

  // Joined from a hunt: set the hive on it and start at once.
  const joined = (() => { try { const v = sessionStorage.getItem('ks-join'); sessionStorage.removeItem('ks-join'); return v; } catch { return null; } })();
  if (joined && DATA.problems.some((x) => x.id === joined)) {
    try {
      st = await be.settings({ problems: [joined], autostart: true });
      if (!st.hive.running) st = await be.start();
      toast(`You joined the ${DATA.problems.find((x) => x.id === joined).title} hunt`);
    } catch (e) { toast(e.message); }
  }
  render();
  const tick = setInterval(() => {
    if (!document.body.contains(app) || !location.hash.startsWith('#/hive')) return clearInterval(tick);
    app.querySelectorAll('.arem').forEach((el) => { const r = Math.max(0, Math.round((Number(el.dataset.until) - Date.now()) / 1000)); el.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} left`; });
  }, 1000);
  // Start by itself when the person started it last time (Stop turns this off).
  if (st.settings.autostart && !st.hive.running) apply(() => be.start());
  const off = be.events((ev, d) => {
    if (!document.body.contains(app) || !location.hash.startsWith('#/hive')) { off(); return; }
    if (ev === 'log') {
      logLines.unshift(d);
      logLines.length = Math.min(logLines.length, 200);
      const ul = app.querySelector('#log');
      if (ul) ul.insertAdjacentHTML('afterbegin', `<li><time>${d.t.slice(11, 19)}</time> ${d.slot === null ? '' : `<b>#${d.slot + 1}</b> `}${esc(d.msg)}</li>`);
      return;
    }
    if (ev === 'improve') toast(`New record: ${d.title}, n = ${d.case}`);
    st = { ...st, hive: { ...st.hive, ...(ev === 'improve' ? {} : d) } };
    if (ev === 'improve') be.state().then((x) => { st = x; render(); });
    else if (!app.contains(document.activeElement) || document.activeElement === document.body || document.activeElement.id === 'go') render();
  });
}
