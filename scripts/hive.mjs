// The local dashboard: `npm run hive` opens http://localhost:7878 and lets you see and steer your
// personal hive (inventory, presets, sources, quotas, schedule, voice commands, live activity).
// It listens on 127.0.0.1 only and every API call needs the session token printed at start.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hive } from '../lib/hive.mjs';
import { PROVIDERS, listModels } from '../lib/llm.mjs';
import { fromPreset, PRESETS, ruleCommand } from '../lib/presets.mjs';
import { complete, cpuCount, inventory, loadEnvFile } from '../lib/providers.mjs';
import { clean, commandPrompt, loadSettings, saveSettings } from '../lib/settings.mjs';
import { fingerprint, newIdentity } from '../lib/keys.mjs';
import { gatePaid, nextApiMode } from '../lib/safety.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(ROOT);
loadEnvFile();
const PORT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 7878);
const TOKEN = randomBytes(16).toString('hex');
const cores = cpuCount();

spawnSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'ignore' });

let settings = loadSettings(cores);
let inv = await inventory();
if (process.env.KS_ECHO_AI) inv.sources.push({ key: 'echo:parent', tier: 'local', kind: 'echo', label: 'Echo (test source)' });
let hive = new Hive({ settings, sources: inv.sources });
const clients = new Set();
const send = (type, data) => { for (const c of clients) c.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
const wire = (h) => { for (const ev of ['log', 'state', 'improve', 'stats', 'result']) h.on(ev, (d) => send(ev, d)); };
wire(hive);

const publicInventory = () => ({
  machine: inv.machine,
  tools: inv.tools,
  missing: inv.missing,
  sources: inv.sources.map(({ key, tier, kind, label, model, models, masked }) => ({ key, tier, kind, label, model, models: (models ?? []).slice(0, 15), masked })),
});
let identity = null;
async function loadIdentity() {
  const f = join(ROOT, 'hunts', 'identity.json');
  if (existsSync(f)) { const id = JSON.parse(readFileSync(f, 'utf8')); identity = { name: id.name, fp: await fingerprint(id.publicKey) }; }
}
await loadIdentity();
const state = () => ({ settings, presets: PRESETS, inventory: publicInventory(), hive: hive.snapshot(), providers: PROVIDERS, cores, root: ROOT, schedule: scheduleStatus(), identity });

// ---------- the OS scheduled task (created only when the person asks for it) ----------
const TASK = 'Kickswarm Hive';
function scheduleStatus() {
  if (process.platform === 'win32') return { installed: spawnSync('schtasks', ['/Query', '/TN', TASK], { encoding: 'utf8' }).status === 0 };
  const r = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  return { installed: r.status === 0 && r.stdout.includes('kickswarm-hive') };
}
function minutesBetween(from, to) {
  const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  return (m(to) - m(from) + 1440) % 1440 || 1440;
}
function installSchedule(from, to) {
  const dur = minutesBetween(from, to);
  const node = process.execPath;
  const script = join(ROOT, 'scripts', 'hunt.mjs');
  if (process.platform === 'win32') {
    const r = spawnSync('schtasks', ['/Create', '/F', '/SC', 'DAILY', '/ST', from, '/TN', TASK, '/TR', `"${node}" "${script}" --minutes ${dur}`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return `Windows task "${TASK}" runs every day at ${from} for ${dur} minutes. Remove it here or in Task Scheduler.`;
  }
  const [h, mm] = from.split(':');
  const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const lines = (cur.status === 0 ? cur.stdout : '').split('\n').filter((l) => l && !l.includes('kickswarm-hive'));
  lines.push(`${Number(mm)} ${Number(h)} * * * cd "${ROOT}" && "${node}" scripts/hunt.mjs --minutes ${dur} # kickswarm-hive`);
  const r = spawnSync('crontab', ['-'], { input: lines.join('\n') + '\n', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return `Cron entry runs every day at ${from} for ${dur} minutes. Remove it here or with crontab -e.`;
}
function removeSchedule() {
  if (process.platform === 'win32') spawnSync('schtasks', ['/Delete', '/F', '/TN', TASK]);
  else {
    const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
    spawnSync('crontab', ['-'], { input: (cur.stdout ?? '').split('\n').filter((l) => l && !l.includes('kickswarm-hive')).join('\n') + '\n' });
  }
  return 'Scheduled task removed.';
}


// ---------- one-click installs (each runs only after the person confirms in the page) ----------
const has = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;
let installing = false;
function runStep(cmd, args) {
  return new Promise((resolve) => {
    hive.log(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { shell: process.platform === 'win32', windowsHide: true });
    const out = (d) => String(d).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-2).forEach((l) => hive.log(l.slice(0, 160)));
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}
async function installOllama() {
  if (installing) throw new Error('an install is already running');
  installing = true;
  try {
    if (!has('ollama')) {
      if (process.platform === 'win32' && has('winget')) await runStep('winget', ['install', '-e', '--id', 'Ollama.Ollama', '--source', 'winget']);
      else if (process.platform === 'darwin' && has('brew')) await runStep('brew', ['install', 'ollama']);
      else { hive.log('Please install Ollama from https://ollama.com/download, then press the button again.'); return; }
    }
    const ollama = has('ollama') ? 'ollama' : process.platform === 'win32' ? `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe` : 'ollama';
    const code = await runStep(ollama, ['pull', 'qwen2.5-coder:7b']);
    hive.log(code === 0 ? 'Local model ready: qwen2.5-coder:7b. It now appears in your sources.' : 'The model download did not finish; press the button again to resume.');
    await refreshInventory();
    send('state', hive.snapshot());
  } finally {
    installing = false;
  }
}
function claudeDesktopConfig() {
  return process.platform === 'win32' ? join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json') : process.platform === 'darwin' ? join(process.env.HOME ?? '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') : join(process.env.HOME ?? '', '.config', 'Claude', 'claude_desktop_config.json');
}
function connectClaudeDesktop() {
  const f = claudeDesktopConfig();
  let cfg = {};
  if (existsSync(f)) {
    cfg = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(`${f}.kickswarm-backup`, JSON.stringify(cfg, null, 2));
  }
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), kickswarm: { command: process.execPath, args: [join(ROOT, 'scripts', 'mcp.mjs')] } };
  writeFileSync(f, JSON.stringify(cfg, null, 2));
  return `Kickswarm is connected to Claude Desktop (${f}; the previous file is saved next to it as .kickswarm-backup). Restart Claude Desktop, then ask it: "get me a Kickswarm mission".`;
}

// ---------- keys (stored in .env.local, on this machine only) ----------
function saveKey(envName, value) {
  const file = '.env.local';
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith(`${envName}=`)) : [];
  if (value) lines.push(`${envName}=${value}`);
  writeFileSync(file, lines.join('\n') + '\n');
  if (value) process.env[envName] = value;
  else delete process.env[envName];
}

async function refreshInventory() {
  inv = await inventory();
  if (process.env.KS_ECHO_AI) inv.sources.push({ key: 'echo:parent', tier: 'local', kind: 'echo', label: 'Echo (test source)' });
  hive.sources = inv.sources;
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jsonl': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
const json = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const hostOk = [`localhost:${PORT}`, `127.0.0.1:${PORT}`].includes(req.headers.host);
  if (url.pathname.startsWith('/api/')) {
    if (!hostOk) return json(res, 403, { error: 'bad host' });
    if (url.pathname === '/api/hello') return json(res, 200, { ok: true, local: true });
    const tok = req.headers['x-hive-token'] ?? url.searchParams.get('t');
    if (tok !== TOKEN) return json(res, 401, { error: 'missing or wrong token: open the link printed in the terminal' });
    try {
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state());
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: state\ndata: ${JSON.stringify(hive.snapshot())}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'method' });
      const b = await body(req);
      if (url.pathname === '/api/preset') {
        settings = gatePaid({ ...fromPreset(b.name, cores), disabled: settings.disabled, problems: settings.problems, apiMode: settings.apiMode });
      } else if (url.pathname === '/api/apimode') {
        settings = gatePaid({ ...settings, apiMode: nextApiMode(settings.apiMode, b) });
        if (b.on === true && !settings.apiMode.on) return json(res, 400, { error: 'API mode stays off: tick the three boxes and type the phrase exactly.' });
      } else if (url.pathname === '/api/settings') {
        settings = clean(b.settings ?? {}, cores, settings);
      } else if (url.pathname === '/api/keys') {
        const p = PROVIDERS[b.provider];
        if (!p) return json(res, 400, { error: 'unknown provider' });
        if (p.tier === 'paid' && b.key && !settings.apiMode?.on) return json(res, 400, { error: 'This is a paid API: turn API mode on first (it explains the risks).' });
        if (b.key) await listModels(b.provider, b.key).catch((e) => { throw new Error(`the key did not work: ${e.message}`); });
        saveKey(p.env, b.key ? String(b.key).trim() : '');
        await refreshInventory();
      } else if (url.pathname === '/api/identity') {
        if (existsSync(join(ROOT, 'hunts', 'identity.json'))) return json(res, 400, { error: 'this computer already has a hunter identity' });
        const id = await newIdentity(String(b.name ?? ''));
        writeFileSync(join(ROOT, 'hunts', 'identity.json'), JSON.stringify(id));
        await loadIdentity();
      } else if (url.pathname === '/api/install/ollama') {
        installOllama().catch((e) => hive.log(`install: ${e.message}`));
        return json(res, 200, { ...state(), message: 'Installing in the background: follow it in the activity log.' });
      } else if (url.pathname === '/api/connect/claude-desktop') {
        return json(res, 200, { ...state(), message: connectClaudeDesktop() });
      } else if (url.pathname === '/api/inventory') {
        await refreshInventory();
      } else if (url.pathname === '/api/start') {
        settings = { ...settings, autostart: true };
        if (!hive.running) hive.run().catch((e) => hive.log(`error: ${e.message}`));
      } else if (url.pathname === '/api/stop') {
        settings = { ...settings, autostart: false };
        hive.stop(!!b.now);
      } else if (url.pathname === '/api/schedule') {
        const msg = b.install ? installSchedule(settings.schedule.from, settings.schedule.to) : removeSchedule();
        return json(res, 200, { ...state(), message: msg });
      } else if (url.pathname === '/api/command') {
        const text = String(b.text ?? '').slice(0, 500);
        const src = inv.sources.find((s) => hive.allowed(s) && s.kind !== 'echo');
        if (src) {
          try {
            const out = await complete(src, commandPrompt(text, settings, cores, inv.sources), { timeoutMs: 60000 });
            const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
            return json(res, 200, { patch: clean(j.patch ?? {}, cores, settings), explain: String(j.explain ?? '').slice(0, 300), by: src.label });
          } catch {}
        }
        const patch = ruleCommand(text, cores);
        return json(res, 200, patch ? { patch: clean(patch, cores, settings), explain: `Preset: ${patch.preset}`, by: 'built-in rules' } : { patch: null, explain: 'Not understood. Try "free only", "discreet", "full power", or connect a model for free-form commands.' });
      } else return json(res, 404, { error: 'unknown endpoint' });
      hive.settings = settings;
      saveSettings(settings);
      return json(res, 200, state());
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  // Static files: the built site.
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, '_site', p));
  if (!file.startsWith(normalize(join(ROOT, '_site')))) return res.writeHead(403).end();
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  if (settings.autostart) { hive.log('Starting automatically (you started it last time; press Stop to turn this off).'); hive.run().catch((e) => hive.log(`error: ${e.message}`)); }
  const link = `http://localhost:${PORT}/?t=${TOKEN}#/hive`;
  console.log(`\nKickswarm personal hive dashboard\n\n  Open: ${link}\n\n  (Local only. The link holds this session's token; keep it to yourself. Ctrl+C to quit.)\n`);
  if (!process.argv.includes('--no-open')) {
    const [cmd, args] = process.platform === 'win32' ? ['explorer', [link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch {}
  }
});
void resolve;
