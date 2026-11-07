// The personal hive's inventory: every source of intelligence and compute this person has, used within
// each service's own rules. Keys stay on this machine (environment variables); nothing is sent anywhere
// except to the provider the key belongs to.
//
// Tiers, cheapest first (the cascade tries them in this order and escalates when a tier stalls):
//   cpu    - this computer's processor, running search programs (always available)
//   local  - models on this machine (Ollama)
//   free   - free API tiers (Gemini, Groq, OpenRouter free models)
//   paid   - paid APIs (Anthropic, OpenAI)
//   sub    - subscriptions through their official command-line tools (Claude Code, Codex, Gemini CLI)

import { spawn, spawnSync } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';

export const TIER_ORDER = ['local', 'free', 'paid', 'sub'];

const has = (cmd) => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
};

async function getJson(url, headers = {}, ms = 6000) {
  const ctl = AbortSignal.timeout(ms);
  const r = await fetch(url, { headers, signal: ctl });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Pick the most capable-looking model id from a list (bigger and newer names first). */
function rank(ids, prefer = []) {
  const score = (id) => {
    let s = 0;
    prefer.forEach((p, i) => { if (id.toLowerCase().includes(p)) s += 100 - i * 10; });
    const b = id.match(/(\d+(?:\.\d+)?)b/i);
    if (b) s += Math.min(Number(b[1]), 400) / 4;
    const v = id.match(/(\d+(?:\.\d+)?)/);
    if (v) s += Math.min(Number(v[1]), 10);
    return s;
  };
  return [...ids].sort((a, b) => score(b) - score(a));
}

/** Discover what is available. Returns a list of { key, tier, kind, model, ... }. */
export async function inventory() {
  const found = [];
  const env = process.env;

  // Local models.
  try {
    const t = await getJson('http://127.0.0.1:11434/api/tags', {}, 1500);
    const ids = rank((t.models ?? []).map((m) => m.name), ['coder', 'qwen', 'deepseek', 'llama', 'gemma']);
    if (ids.length) found.push({ key: `ollama:${ids[0]}`, tier: 'local', kind: 'ollama', model: ids[0], label: `Ollama (${ids[0]})` });
  } catch {}

  // Free API tiers.
  if (env.GEMINI_API_KEY) {
    let model = env.KS_GEMINI_MODEL;
    if (!model) {
      try {
        const m = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
        const ids = (m.models ?? []).filter((x) => (x.supportedGenerationMethods ?? []).includes('generateContent')).map((x) => x.name.replace(/^models\//, '')).filter((x) => /flash/.test(x) && !/lite|image|tts|live|exp|preview/.test(x));
        model = rank(ids, ['flash'])[0];
      } catch {}
    }
    if (model) found.push({ key: `gemini:${model}`, tier: 'free', kind: 'openai', model, base: 'https://generativelanguage.googleapis.com/v1beta/openai', auth: env.GEMINI_API_KEY, label: `Gemini API free tier (${model})` });
  }
  if (env.GROQ_API_KEY) {
    let model = env.KS_GROQ_MODEL;
    if (!model) {
      try {
        const m = await getJson('https://api.groq.com/openai/v1/models', { authorization: `Bearer ${env.GROQ_API_KEY}` });
        model = rank((m.data ?? []).map((x) => x.id).filter((x) => !/whisper|guard|tts/.test(x)), ['qwen', 'llama', 'deepseek', 'gpt-oss'])[0];
      } catch {}
    }
    if (model) found.push({ key: `groq:${model}`, tier: 'free', kind: 'openai', model, base: 'https://api.groq.com/openai/v1', auth: env.GROQ_API_KEY, label: `Groq free tier (${model})` });
  }
  if (env.OPENROUTER_API_KEY) {
    let model = env.KS_OPENROUTER_MODEL;
    if (!model) {
      try {
        const m = await getJson('https://openrouter.ai/api/v1/models');
        const free = (m.data ?? []).filter((x) => x.id.endsWith(':free')).sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0));
        model = rank(free.slice(0, 20).map((x) => x.id), ['coder', 'deepseek', 'qwen', 'llama'])[0];
      } catch {}
    }
    if (model) found.push({ key: `openrouter:${model}`, tier: 'free', kind: 'openai', model, base: 'https://openrouter.ai/api/v1', auth: env.OPENROUTER_API_KEY, label: `OpenRouter free model (${model})` });
  }

  // Paid APIs.
  if (env.ANTHROPIC_API_KEY) {
    const model = env.KS_ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
    found.push({ key: `anthropic:${model}`, tier: 'paid', kind: 'anthropic', model, auth: env.ANTHROPIC_API_KEY, label: `Anthropic API (${model})` });
  }
  if (env.OPENAI_API_KEY) {
    const model = env.KS_OPENAI_MODEL ?? 'gpt-5-mini';
    found.push({ key: `openai:${model}`, tier: 'paid', kind: 'openai', model, base: 'https://api.openai.com/v1', auth: env.OPENAI_API_KEY, label: `OpenAI API (${model})` });
  }

  // Subscriptions, through their official CLIs in non-interactive mode.
  if (has('claude')) found.push({ key: 'cli:claude', tier: 'sub', kind: 'cli', cmd: 'claude', args: ['-p', 'Follow the instructions given on standard input.', '--output-format', 'text'], label: 'Claude Code (your Claude subscription)' });
  if (has('codex')) found.push({ key: 'cli:codex', tier: 'sub', kind: 'cli', cmd: 'codex', args: ['exec', '--skip-git-repo-check', '-'], label: 'Codex CLI (your ChatGPT subscription)' });
  if (has('gemini')) found.push({ key: 'cli:gemini', tier: 'sub', kind: 'cli', cmd: 'gemini', args: ['-p', 'Follow the instructions given on standard input.'], label: 'Gemini CLI (your Google account)' });

  // For testing the pipeline without any AI: echoes the parent program back.
  if (env.KS_ECHO_AI) found.push({ key: 'echo:parent', tier: 'local', kind: 'echo', label: 'Echo (test source)' });

  return found;
}

export const cpuCount = () => Math.max(1, cpus().length);

/** Ask one source for a completion. Returns the text. */
export async function complete(src, prompt, { timeoutMs = 240000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  if (src.kind === 'echo') return '```js\n' + (prompt.match(/```js\n([\s\S]*?)```\s*$/) ?? [])[1] + '```';
  if (src.kind === 'ollama') {
    const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', signal, body: JSON.stringify({ model: src.model, stream: false, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    return (await r.json()).message?.content ?? '';
  }
  if (src.kind === 'openai') {
    const r = await fetch(`${src.base}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${src.auth}` },
      body: JSON.stringify({ model: src.model, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`${src.key} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices?.[0]?.message?.content ?? '';
  }
  if (src.kind === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': src.auth, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: src.model, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ((await r.json()).content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  if (src.kind === 'cli') {
    // The prompt goes on standard input (no quoting problems); the agent runs in a scratch directory
    // so it has nothing of yours to touch.
    return new Promise((resolve, reject) => {
      const child = spawn(src.cmd, src.args, { cwd: tmpdir(), shell: process.platform === 'win32', windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (!out.trim()) reject(new Error(`${src.cmd} exited ${code}: ${err.slice(0, 200)}`));
        else resolve(out);
      });
      child.stdin.end(prompt);
    });
  }
  throw new Error(`unknown source kind ${src.kind}`);
}
