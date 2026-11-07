// Post the robot's replies (replies.json): comment, label, close. Runs after the registry is pushed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY;
const replies = JSON.parse(readFileSync('replies.json', 'utf8'));
const gh = (...a) => execFileSync('gh', [...a, '--repo', repo], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
for (const r of replies) {
  try { gh('label', 'create', r.label, '--force'); } catch {}
  writeFileSync('reply.md', r.reply);
  gh('issue', 'comment', String(r.number), '--body-file', 'reply.md');
  gh('issue', 'edit', String(r.number), '--add-label', r.label);
  gh('issue', 'close', String(r.number));
  console.log(`#${r.number}: ${r.label}`);
}
