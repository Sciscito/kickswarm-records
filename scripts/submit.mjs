// Submit a solution file as a GitHub issue, which the robot judges.
// Uses the GitHub CLI (gh) if it is installed and logged in; otherwise prints what to do.
// Usage: npm run submit -- solution.json

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run submit -- solution.json');
  process.exit(2);
}
const sub = JSON.parse(readFileSync(file, 'utf8'));
const { repo } = JSON.parse(readFileSync('site/config.json', 'utf8'));
const title = `[solution] ${sub.problem} n=${sub.case}`;
const body = `### Solution\n\n\`\`\`json\n${JSON.stringify(sub)}\n\`\`\`\n`;
try {
  const url = execFileSync('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body-file', '-'], { input: body, encoding: 'utf8' }).trim();
  console.log(`Submitted: ${url}\nThe robot replies there within a minute or two.`);
} catch {
  console.log(`Could not use the GitHub CLI. Open https://github.com/${repo}/issues/new?template=solution.yml\nTitle: ${title}\nPaste the content of ${file} in the Solution field.`);
}
