// The GitHub robot: reads the issue that triggered the workflow, judges the solution, updates the
// registry, records and trophies, and writes the reply to post on the issue.
// Outputs (in $GITHUB_OUTPUT): status, tier, label. Reply text: reply.md.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { extractJson, processSubmission } from '../lib/process.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const author = issue.user?.login;

let result;
try {
  const submission = extractJson(issue.body ?? '');
  result = await processSubmission(submission, { author, issue: issue.number, ts: new Date().toISOString() });
} catch (e) {
  result = { status: 'rejected', message: `Rejected: ${e.message}` };
}

const site = process.env.SITE_URL ?? '';
let reply = result.message;
if (result.status === 'record' && site) {
  reply += `\n\n![trophy](${site}/trophies/${result.entry.seq}.svg)\n\nSee it on the board: ${site}/#/p/${result.entry.problem}/${result.entry.case}`;
}
if (result.status === 'rejected') {
  reply += '\n\nNothing was recorded. Fix the solution and open a new submission. You can check it first on the site, where the same judge runs in your browser.';
}
reply += '\n\n<sub>Kickswarm Records robot · every entry is chained in registry.jsonl and can be re-checked with `npm run audit`.</sub>';
writeFileSync('reply.md', reply);

const label = { record: result.tier === 'world' ? 'world-record' : 'record', attempt: 'attempt', rejected: 'rejected' }[result.status];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\ntier=${result.tier ?? ''}\nlabel=${label}\n`);
console.log(reply);
