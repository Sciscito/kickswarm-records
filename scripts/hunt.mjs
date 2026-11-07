// The personal hive from the command line (no dashboard). Settings come from hive.settings.json
// (written by the dashboard) or the default preset; flags override them.
//
//   npm run hunt -- --inventory        what this machine can use
//   npm run hunt                       hunt until Ctrl+C
//   npm run hunt -- --minutes 60 --dry hunt for an hour, submit nothing
//   options: --preset discreet|balanced|free|full  --problem <id>  --cpu-only  --workers <k>  --seconds <s>  --rounds <k>

import { fileURLToPath } from 'node:url';
import { Hive } from '../lib/hive.mjs';
import { fromPreset } from '../lib/presets.mjs';
import { cpuCount, inventory, loadEnvFile } from '../lib/providers.mjs';
import { clean, loadSettings } from '../lib/settings.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url))); // scheduled tasks start elsewhere
loadEnvFile();
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const cores = cpuCount();

let settings = opt('preset') ? fromPreset(opt('preset'), cores) : loadSettings(cores);
settings = clean({ ...settings, workers: opt('workers') ?? settings.workers, seconds: opt('seconds') ?? settings.seconds, problems: opt('problem') ? [opt('problem')] : settings.problems }, cores, settings);
if (flag('scheduled')) settings.schedule = { ...settings.schedule, enabled: false };

const inv = flag('cpu-only') ? { sources: [], missing: [], machine: { cores }, tools: [] } : await inventory();
if (process.env.KS_ECHO_AI) inv.sources.push({ key: 'echo:parent', tier: 'local', kind: 'echo', label: 'Echo (test source)' });

console.log(`\nKickswarm personal hive · preset ${settings.preset}\n  CPU: ${settings.workers} worker(s) of ${cores} cores, ${settings.seconds}s per run`);
for (const s of inv.sources) console.log(`  AI [${s.tier}] ${s.label}${settings.tiers[s.tier] === false ? '  (tier off)' : ''}`);
if (!inv.sources.length) console.log('  AI: none found. The CPU hunts on its own. Run `npm run hive` for the dashboard.');
for (const t of inv.tools ?? []) console.log(`  Tool: ${t.name} (MCP, ${t.app})`);
console.log(`  Submitting: ${flag('dry') || settings.submit === 'none' ? 'no (dry run)' : 'improvements, with the GitHub CLI'}\n`);
if (flag('inventory')) process.exit(0);

const hive = new Hive({ settings, sources: inv.sources, dry: flag('dry') });
hive.on('log', (l) => console.log(l.t.slice(11, 19), l.slot === null ? '' : `[${l.slot}]`, l.msg));
let stops = 0;
process.on('SIGINT', () => { if (++stops > 1) process.exit(1); console.log('Finishing the current round (Ctrl+C again to quit now)…'); hive.stop(); });
await hive.run({ minutes: Number(opt('minutes', Infinity)), rounds: Number(opt('rounds', Infinity)) });
