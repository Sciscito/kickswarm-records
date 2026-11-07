// Ask another model for a landing page design, to compare with ours.
// Uses your own OpenRouter key from .env.local (OPENROUTER_API_KEY=...), never printed.
// Usage: node scripts/design-lab.mjs [model]      default: qwen/qwen3.8-27b
// The page is saved in design-lab/ (not published); open it in a browser to compare.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { callModel } from '../lib/llm.mjs';
import { loadEnvFile } from '../lib/providers.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
loadEnvFile();
const model = process.argv[2] ?? 'qwen/qwen3.8-27b';
const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.log('No OPENROUTER_API_KEY. Create a key at https://openrouter.ai/keys, add a few cents of credit,\nthen put this line in .env.local (this file never leaves your computer):\nOPENROUTER_API_KEY=your-key');
  process.exit(1);
}
const brief = readFileSync('design-lab/brief.md', 'utf8');
console.log(`Asking ${model}… (a minute or two)`);
const t = Date.now();
const out = await callModel({ kind: 'openai', base: 'https://openrouter.ai/api/v1', auth: key, model }, brief, { timeoutMs: 600000 });
const html = (out.match(/```html\s*\n([\s\S]*?)```/) ?? [])[1] ?? out;
mkdirSync('design-lab', { recursive: true });
const file = `design-lab/${model.replace(/[^a-z0-9.-]+/gi, '_')}-${Date.now().toString(36)}.html`;
writeFileSync(file, html);
console.log(`Saved ${file} (${Math.round((Date.now() - t) / 1000)} s, ${html.length} characters). Open it in your browser.`);
