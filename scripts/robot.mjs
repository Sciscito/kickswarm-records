// The GitHub robot. Each run sweeps EVERY open "[solution]" issue not yet handled (oldest first), so
// nothing is lost when GitHub cancels queued runs during a burst. It judges each submission, updates the
// registry, records and trophies, and writes the replies to replies.json; scripts/reply.mjs posts them
// after the registry is pushed.
// Locally (tests): GITHUB_EVENT_PATH alone processes that one issue.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extractJson, processSubmission, resolveAuthor } from '../lib/process.mjs';
import { readRegistry } from '../lib/registry.mjs';

const HANDLED = ['record', 'world-record', 'attempt', 'rejected'];
const repo = process.env.GITHUB_REPOSITORY;

function openIssues() {
  if (!repo) {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return ev.issue ? [ev.issue] : [];
  }
  const out = execFileSync('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--search', '"[solution]" in:title sort:created-asc', '--json', 'number,title,body,author,labels,createdAt'], { encoding: 'utf8' });
  return JSON.parse(out)
    .filter((i) => i.title.startsWith('[solution]') && !i.labels.some((l) => HANDLED.includes(l.name)))
    .map((i) => ({ number: i.number, body: i.body, user: { login: i.author?.login } }));
}

const site = process.env.SITE_URL || JSON.parse(readFileSync('site/config.json', 'utf8')).site;
const replies = [];
let changed = false;
for (const issue of openIssues()) {
  let result;
  try {
    const sub = extractJson(issue.body ?? '');
    const who = await resolveAuthor(sub, issue.user?.login);
    result = await processSubmission(sub, { ...who, issue: issue.number, ts: new Date().toISOString() });
  } catch (e) {
    result = { status: 'rejected', message: `Rejected: ${e.message}` };
  }
  let reply = result.message;
  if (result.status === 'record' && site) reply += `\n\n![trophy](${site}/trophies/${result.entry.seq}.svg)\n\nSee it on the board: ${site}/#/p/${result.entry.problem}/${result.entry.case}`;
  if (result.status === 'rejected') reply += '\n\nNothing was recorded. Fix the solution and open a new submission. You can check it first on the site, where the same judge runs in your browser.';
  reply += '\n\n<sub>Kickswarm Records robot · every entry is chained in registry.jsonl and can be re-checked with `npm run audit`.</sub>';
  const label = { record: result.tier === 'world' ? 'world-record' : 'record', attempt: 'attempt', rejected: 'rejected' }[result.status];
  if (result.status !== 'rejected') changed = true;
  replies.push({ number: issue.number, label, reply });
  console.log(`#${issue.number}: ${result.message.split('\n')[0]}`);
}
// The relay queue: signed submissions from people without a GitHub account.
const relayUrl = JSON.parse(readFileSync('site/config.json', 'utf8')).relay;
if (relayUrl) {
  const done = new Set(readRegistry().map((e) => e.relay).filter(Boolean));
  const rejected = new Set(existsSync('relay-rejected.json') ? JSON.parse(readFileSync('relay-rejected.json', 'utf8')) : []);
  let cursor = null;
  try {
    do {
      const r = await fetch(`${relayUrl.replace(/\/$/, '')}/queue${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const page = await r.json();
      for (const it of page.items) {
        if (done.has(it.id) || rejected.has(it.id)) continue;
        let result;
        try {
          const who = await resolveAuthor(it.submission, null);
          result = await processSubmission(it.submission, { ...who, relay: it.id, ts: new Date().toISOString() });
        } catch (e) {
          result = { status: 'rejected', message: `Rejected: ${e.message}` };
        }
        if (result.status === 'rejected') rejected.add(it.id);
        else changed = true;
        console.log(`relay ${it.id}: ${result.message.split('\n')[0]}`);
      }
      cursor = page.cursor;
    } while (cursor);
  } catch (e) {
    console.log(`relay unreachable: ${e.message}`);
  }
  writeFileSync('relay-rejected.json', JSON.stringify([...rejected].slice(-2000)));
}

writeFileSync('replies.json', JSON.stringify(replies));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ncount=${replies.length}\n`);
