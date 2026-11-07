// The personal hive's inventory (Node): every source of intelligence and compute this person has, and
// what their machine offers, used within each service's own rules. Keys stay on this machine.
//
// Tiers, cheapest first (the cascade tries them in this order and escalates when a tier stalls):
//   cpu    - this computer's processor, running search programs (always available)
//   local  - models on this machine (Ollama)
//   free   - free API tiers (Gemini, Groq, OpenRouter free models)
//   paid   - paid APIs (Anthropic, OpenAI)
//   sub    - subscriptions through their official command-line tools (Claude Code, Codex, Gemini CLI)

import { spawn, spawnSync } from 'node:child_process';
import { envWithoutApiKeys } from './safety.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { cpus, freemem, homedir, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { callModel, listModels, OPENROUTER_FREE_MAX, PROVIDERS, sourceFor } from './llm.mjs';

export const TIER_ORDER = ['local', 'free', 'paid', 'sub'];
export const cpuCount = () => Math.max(1, cpus().length);

const has = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;

/** Read KEY=value lines from .env.local into process.env (keys typed in the dashboard live there). */
export function loadEnvFile(file = '.env.local') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const CLIS = [
  { cmd: 'claude', key: 'cli:claude', label: 'Claude Code', account: 'your Claude subscription', args: ['-p', 'Follow the instructions given on standard input.', '--output-format', 'text'] },
  { cmd: 'codex', key: 'cli:codex', label: 'Codex CLI', account: 'your ChatGPT subscription', args: ['exec', '--skip-git-repo-check', '-'] },
  { cmd: 'gemini', key: 'cli:gemini', label: 'Gemini CLI', account: 'your Google account', args: ['-p', 'Follow the instructions given on standard input.'] },
];

/** Names of MCP servers already configured for the person's agents (names only, never their secrets). */
function mcpServers() {
  const out = [];
  const files = [
    ['Claude Code', join(homedir(), '.claude.json')],
    ['Claude Desktop', process.platform === 'win32' ? join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json') : join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')],
    ['Cursor', join(homedir(), '.cursor', 'mcp.json')],
  ];
  for (const [app, f] of files) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      for (const name of Object.keys(j.mcpServers ?? {})) out.push({ app, name });
    } catch {}
  }
  return out;
}

function gpu() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean) : [];
}

/**
 * Everything the hive could use. Sources are { key, tier, kind, label, model?, ... }.
 * `machine` describes the computer; `tools` lists agent tools (MCP) already set up.
 */
export async function inventory() {
  const sources = [];
  const missing = [];
  // Local models.
  try {
    const ids = await listModels('ollama');
    if (ids.length) sources.push({ ...sourceFor('ollama', null, ids[0]), models: ids });
  } catch {
    missing.push({ key: 'ollama', label: 'Ollama (local models)', how: 'Install Ollama from ollama.com and pull a coding model, e.g. "ollama pull qwen2.5-coder".' });
  }
  // API keys.
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const key = process.env[p.env];
    if (!key) {
      missing.push({ key: id, label: p.label, how: `Create a key at ${p.keyUrl} and add it in the dashboard (or set ${p.env}). ${p.note}.` });
      continue;
    }
    let ids = [];
    try { ids = await listModels(id, key); } catch {}
    const model = process.env[`KS_${id.toUpperCase()}_MODEL`] ?? ids[0];
    if (id === 'openrouter' && !process.env.KS_OPENROUTER_MODEL) {
      for (const m of ids.slice(0, OPENROUTER_FREE_MAX)) sources.push({ ...sourceFor(id, key, m), label: `OpenRouter free · ${m.replace(/:free$/, '')}`, models: ids, masked: `…${key.slice(-4)}` });
    } else if (model) sources.push({ ...sourceFor(id, key, model), models: ids, masked: `…${key.slice(-4)}` });
    else missing.push({ key: id, label: p.label, how: 'The key is set but no model could be listed: check the key or its limits.' });
  }
  // Subscriptions through official CLIs.
  for (const c of CLIS) {
    if (has(c.cmd)) sources.push({ key: c.key, tier: 'sub', kind: 'cli', cmd: c.cmd, args: c.args, label: `${c.label} (${c.account})` });
    else missing.push({ key: c.key, label: c.label, how: `Install ${c.label} and log in with ${c.account}; the hive then uses it through its official non-interactive mode.` });
  }
  const machine = { cores: cpuCount(), cpu: cpus()[0]?.model ?? 'unknown', memoryGb: Math.round(totalmem() / 2 ** 30), freeGb: Math.round(freemem() / 2 ** 30), gpu: gpu(), platform: process.platform, node: process.versions.node };
  return { sources, missing, machine, tools: mcpServers() };
}

/** Ask one source for a completion. */
export async function complete(src, prompt, { timeoutMs = 240000 } = {}) {
  if (src.kind !== 'cli') return callModel(src, prompt, { timeoutMs });
  // The prompt goes on standard input; the agent runs in a scratch directory with nothing of yours.
  return new Promise((resolve, reject) => {
    // No API key in its environment: the tool uses your plan, never pay-per-use billing.
    const child = spawn(src.cmd, src.args, { cwd: tmpdir(), shell: process.platform === 'win32', windowsHide: true, env: envWithoutApiKeys(process.env) });
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
