// Recompute the whole registry chain and re-judge every current record from scratch.
// Anyone can run it: `npm run audit`. Exit code 1 if anything does not hold.

import { readFileSync, readdirSync } from 'node:fs';
import { loadJudge, loadProblem, PROBLEMS } from '../lib/process.mjs';
import { auditRegistry, readRegistry } from '../lib/registry.mjs';

let ok = true;
const reg = readRegistry();
const chain = auditRegistry(reg);
console.log(chain.ok ? `Registry: ${chain.count} entries, chain intact.` : `Registry BROKEN: ${chain.error}`);
ok &&= chain.ok;

for (const id of PROBLEMS) {
  const p = loadProblem(id);
  const judge = await loadJudge(id);
  let n = 0;
  for (const f of readdirSync(`records/${id}`, { withFileTypes: true }).filter((d) => d.isFile())) {
    const rec = JSON.parse(readFileSync(`records/${id}/${f.name}`, 'utf8'));
    const cas = p.cases.find((c) => c.id === rec.case);
    const { score } = judge(cas, rec.solution);
    const e = reg.find((x) => x.seq === rec.seq);
    if (score !== rec.score || !e || e.score !== score) {
      console.log(`  ${id} n=${rec.case}: MISMATCH (judged ${score}, recorded ${rec.score}, registry ${e?.score})`);
      ok = false;
    }
    n++;
  }
  console.log(`${p.title}: ${n} record(s) re-judged.`);
}
console.log(ok ? 'All good.' : 'Problems found.');
process.exit(ok ? 0 : 1);
