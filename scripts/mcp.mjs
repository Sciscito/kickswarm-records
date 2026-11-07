// Kickswarm Records as an MCP server (stdio): lets the AI you already use (Claude Desktop, Claude Code,
// Cursor…) take a mission, fetch the current best, check a solution with the exact judge and submit it,
// signed with this computer's hunter key. No copy-paste. No dependencies.
//
// Add to your AI app's MCP config:  { "command": "node", "args": ["<this folder>/scripts/mcp.mjs"] }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { better, shortScore, toUnits } from '../lib/exact.mjs';
import { newIdentity, signSubmission } from '../lib/keys.mjs';
import { huntPrompt, pickMission } from '../lib/mission.mjs';
import { loadJudge, loadProblem, PROBLEMS } from '../lib/process.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const config = JSON.parse(readFileSync('site/config.json', 'utf8'));
const ID_FILE = join('hunts', 'identity.json');

async function board() {
  try {
    const r = await fetch(`${config.site}/data.json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
  } catch {}
  return JSON.parse(readFileSync('_site/data.json', 'utf8'));
}
async function currentBest(pid, cid) {
  try {
    const r = await fetch(`${config.site}/records/${pid}/${cid}.json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
    if (r.status === 404) return null;
  } catch {}
  const f = `records/${pid}/${cid}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

const TOOLS = [
  { name: 'get_mission', description: 'Get a Kickswarm Records mission: an open math record case few people tried, a strategy, the exact scoring rule and the current best. Optionally choose the problem (circles-in-square, circles-in-circle, no-three-in-line) and case (n).', inputSchema: { type: 'object', properties: { problem: { type: 'string', enum: PROBLEMS }, case: { type: 'string' } } } },
  { name: 'get_current_best', description: 'The current best solution on the board for a case, as JSON (start from it and improve it).', inputSchema: { type: 'object', properties: { problem: { type: 'string', enum: PROBLEMS }, case: { type: 'string' } }, required: ['problem', 'case'] } },
  { name: 'check_solution', description: 'Check a solution with the exact judge and say whether it beats the current best. Nothing is recorded.', inputSchema: { type: 'object', properties: { solution: { type: 'object', description: '{"problem", "case", "centers" or "points", "method", "model"}' } }, required: ['solution'] } },
  { name: 'set_hunter_name', description: "Create this computer's hunter identity (a name and a signing key, no account). Needed once before submitting.", inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'submit_solution', description: 'Submit a verified solution to the public registry, signed with this computer\'s hunter key. Ask the user before calling it: it publishes under their hunter name.', inputSchema: { type: 'object', properties: { solution: { type: 'object' } }, required: ['solution'] } },
];

async function call(name, a = {}) {
  if (name === 'get_mission') {
    const data = await board();
    let m;
    if (a.problem && a.case) {
      const p = data.problems.find((x) => x.id === a.problem);
      const c = p?.cases.find((x) => x.id === String(a.case));
      if (!c) throw new Error('no such case');
      const i = Math.floor(Math.random() * p.strategies.length);
      m = { problem: p, cas: c, summary: data.cases[`${p.id}/${c.id}`] ?? {}, strategy: p.strategies[i], strategyIndex: i };
    } else m = pickMission(data, Math.random, a.problem);
    return huntPrompt({ ...m, journal: data.journal[`${m.problem.id}/${m.cas.id}`] ?? [], site: config.site })
      .replace(/If you cannot open links, ask me to paste it\./, 'Use the get_current_best tool to load it.')
      .replace(/ANSWER WITH ONE JSON OBJECT AND NOTHING ELSE:/, 'WHEN YOU HAVE A RESULT, check it with the check_solution tool, then ask the user before submitting it with submit_solution. The solution object:')
      .replace(/The person running you checks it on .* and submits it\./, '');
  }
  if (name === 'get_current_best') {
    const rec = await currentBest(a.problem, String(a.case));
    return rec ? JSON.stringify({ score: rec.score, author: rec.author, solution: rec.solution }) : 'No solution on the board yet for this case.';
  }
  if (name === 'check_solution' || name === 'submit_solution') {
    const sub = a.solution ?? {};
    const p = loadProblem(String(sub.problem));
    const c = p.cases.find((x) => x.id === String(sub.case));
    if (!c) throw new Error(`${p.id} has no case ${sub.case}`);
    const { score } = (await loadJudge(p.id))(c, sub);
    const cur = await currentBest(p.id, c.id);
    const min = p.score_name === 'radius' ? '0.000000000001' : '1';
    const beats = !cur || (better(score, cur.score, p.direction) && toUnits(score) - toUnits(cur.score) >= toUnits(min));
    const verdict = `Valid. ${p.title}, n = ${c.n}: ${p.score_name} ${shortScore(score)}. ${cur ? (beats ? `BEATS the current best (${shortScore(cur.score)} by @${cur.author}).` : `Does not beat the current best (${shortScore(cur.score)} by @${cur.author}).`) : 'First solution on this case.'}`;
    if (name === 'check_solution') return verdict;
    if (!existsSync(ID_FILE)) throw new Error('No hunter identity yet: ask the user for a hunter name, then call set_hunter_name.');
    const signed = await signSubmission(sub, JSON.parse(readFileSync(ID_FILE, 'utf8')));
    if (config.relay) {
      const r = await fetch(`${config.relay.replace(/\/$/, '')}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`relay: ${j.error ?? r.status}`);
      return `${verdict}\nSent through the relay. It joins the public registry within about 10 minutes.`;
    }
    mkdirSync('hunts/outbox', { recursive: true });
    const file = `hunts/outbox/${sub.problem}-${sub.case}-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(signed));
    return `${verdict}\nNo relay is configured yet, so it was saved to ${file}. Submit it with: npm run submit -- ${file} (needs the GitHub CLI), or paste it on the site.`;
  }
  if (name === 'set_hunter_name') {
    if (existsSync(ID_FILE)) return `This computer already hunts as ${JSON.parse(readFileSync(ID_FILE, 'utf8')).name}.`;
    mkdirSync('hunts', { recursive: true });
    const id = await newIdentity(String(a.name ?? ''));
    writeFileSync(ID_FILE, JSON.stringify(id));
    return `Hunter identity created: ${id.name}. The key stays on this computer.`;
  }
  throw new Error(`unknown tool ${name}`);
}

// JSON-RPC 2.0 over stdio, one message per line.
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
let buf = '';
process.stdin.on('data', async (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const { id, method, params } = msg;
    if (id === undefined) continue; // notifications
    try {
      if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kickswarm-records', version: '0.1.0' } } });
      else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
      else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      else if (method === 'tools/call') {
        try {
          const text = await call(params?.name, params?.arguments);
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
        } catch (e) {
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true } });
        }
      } else send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
    }
  }
});
