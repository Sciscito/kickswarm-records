// Asking a model to write a searcher. Universal (Node and browser).

import { huntPrompt } from './mission.mjs';

export const CONTRACT = `A searcher is a JavaScript ES module that exports one function:

  export async function search(input, report) { ... }

- input = { problem, n, sequence (protein folding only), start, seconds, seed }. "start" is the current best solution on the board
  ({ centers: [["x","y"], ...] }, { points: [[x,y], ...] } or { moves: "RUL..." }), or null.
- Call report(solution) each time you have a better solution, with the same shape as "start".
  Coordinates as decimal strings (up to 30 digits) are best; integers for points.
- Return before input.seconds have elapsed (check Date.now()). You are stopped a little later anyway.
- Plain JavaScript only: no imports, no network, no files, no process, no DOM. It runs in a sandbox
  (a Node process without permissions, or a browser Web Worker).`;

/** The prompt that asks for a better searcher, given a mission and a parent program. */
export function searcherPrompt(mission, parentCode, parentInfo = 'the built-in searcher') {
  return `You write search programs for Kickswarm Records. Reply with ONE JavaScript code block and nothing else.

${CONTRACT}

THE TASK THIS PROGRAM WILL RUN ON:
${huntPrompt({ ...mission, site: '' }).split('HOW TO WORK:')[0].replace(/SHOW YOUR PROGRESS:[\s\S]*?give the JSON\.\n?/, '')}
PARENT PROGRAM (${parentInfo}). Improve on it following the strategy above: change the algorithm, not just constants. Keep the contract exactly.

\`\`\`js
${parentCode}
\`\`\``;
}

/** The code block of a model's answer, if it looks like a searcher. */
export function extractSearcher(text) {
  const code = (String(text).match(/```(?:js|javascript|mjs)?\s*\n([\s\S]*?)```/) ?? [])[1] ?? null;
  if (!code || !/export\s+(async\s+)?function\s+search/.test(code)) return null;
  if (/^\s*import\s/m.test(code) || /require\s*\(/.test(code)) return null;
  return code;
}
