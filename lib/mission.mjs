// Missions: which case and which strategy to give the next hunter, and the prompt for their AI.
// Shared by the website and the command line. The data is the site's data.json.

import { shortScore } from './exact.mjs';

/**
 * Pick a case: favour cases tried least, skip cases where no improvement is possible (already 2n),
 * then pick a strategy, avoiding the ones already tried most on that case.
 */
export function pickMission(data, rand = Math.random, only) {
  const pool = [];
  for (const p of data.problems) {
    if (only && p.id !== only) continue;
    for (const c of p.cases) {
      const s = data.cases[`${p.id}/${c.id}`] ?? {};
      if (c.max && s.score === c.max) continue;
      const empty = !s.score;
      const w = (empty ? 3 : 1) / (1 + (s.attempts ?? 0) + (s.records ?? 0) * 0.5);
      pool.push({ p, c, s, w });
    }
  }
  if (!pool.length) return null;
  let x = rand() * pool.reduce((a, b) => a + b.w, 0);
  let pick = pool.at(-1);
  for (const it of pool) if ((x -= it.w) <= 0) { pick = it; break; }
  // Strategy: an upper-confidence bound on the problem-wide success rate (what worked, from the
  // registry), minus a little for strategies already tried on this very case, plus a little noise.
  const tried = pick.s.methods ?? {};
  const stats = data.learning?.problems?.[pick.p.id]?.strategies ?? [];
  const total = stats.reduce((a, x) => a + x.tries, 0);
  const scored = pick.p.strategies.map((t, i) => {
    const st = stats[i] ?? { tries: 0, records: 0 };
    const ucb = (st.records + 1) / (st.tries + 2) + Math.sqrt((2 * Math.log(total + 2)) / (st.tries + 1)) * 0.35;
    return { t, i, v: ucb - (tried[i] ?? 0) * 0.15 + rand() * 0.05 };
  });
  const strategy = scored.sort((a, b) => b.v - a.v)[0];
  return { problem: pick.p, cas: pick.c, summary: pick.s, strategy: strategy.t, strategyIndex: strategy.i };
}

const RULES = {
  'circles-in-square':
    'Score = the largest radius r such that every circle of radius r around your centres stays inside [0,1]x[0,1] and no two overlap. ' +
    'Exactly: r = min( min over centres of min(x, 1-x, y, 1-y), (min distance between two centres) / 2 ), rounded down to 10^-30. ' +
    'Coordinates: decimals with at most 30 digits after the point (strings are best for precision).',
  'circles-in-circle':
    'Score = the largest radius r such that every circle of radius r around your centres stays inside the unit circle (radius 1, centre 0,0) and no two overlap. ' +
    'Exactly: r = min( min over centres of (1 - |c|), (min distance between two centres) / 2 ), rounded down to 10^-30. ' +
    'Coordinates: decimals with at most 30 digits after the point (strings are best for precision).',
  'no-three-in-line':
    'Score = the number of points, if no three of them lie on one straight line of any slope (horizontal, vertical, diagonal or any rational slope). ' +
    'Coordinates are integers from 0 to n-1. At most two points per row and per column are possible, so 2n is the maximum.',
};

/** The prompt to paste into any AI. `site` is the base URL of the website. */
export function huntPrompt({ problem, cas, summary = {}, strategy, strategyIndex, journal = [], site = '' }) {
  const key = problem.id === 'no-three-in-line' ? 'points' : 'centers';
  const best = summary.score
    ? `${problem.score_name} ${summary.score} (by @${summary.author}${summary.tier === 'reference' ? ', the published record' : ''})`
    : 'none yet: any valid solution is a first on this board';
  const world = problem.id === 'no-three-in-line'
    ? cas.world ? `Perfect solutions (2n = ${2 * cas.n} points) are published for this n; reaching 2n here earns the Perfect tier.` : `Nobody has published a perfect solution (2n = ${2 * cas.n} points) for n = ${cas.n}. Finding one would be a world first.`
    : `Published world record: ${cas.world.score}. Beating it by more than one unit of its last digit is a WORLD RECORD.`;
  const start = summary.score ? `${site}/records/${problem.id}/${cas.id}.json` : null;
  const tried = journal.length
    ? journal.slice(0, 8).map((j) => `- ${j.method ?? '(no method given)'} -> ${shortScore(j.score)}${j.model ? ` [${j.model}]` : ''}`).join('\n')
    : '- nothing recorded yet';
  return `You are hunting a mathematical record for Kickswarm Records, a public swarm of people's AIs. Work autonomously and do not ask me questions until you have a result.

PROBLEM: ${problem.title}, n = ${cas.n}.
${problem.statement}

HOW IT IS SCORED (exactly what the robot checks):
${RULES[problem.id]}

CURRENT BEST ON THE BOARD: ${best}.
${world}
${start ? `The current best solution, to start from: ${start} (JSON with a "solution" field). If you cannot open links, ask me to paste it.\n` : ''}
YOUR STRATEGY (other hunters received different ones, so the swarm explores in parallel):
${strategy}

WHAT OTHERS ALREADY TRIED ON THIS CASE:
${tried}

HOW TO WORK:
1. Write a program (Python or JavaScript) that searches, and run it if you can execute code. Never invent coordinates by hand.
2. Score every candidate with the exact rule above, in your program. Keep the best one.
3. Spend up to about 20 minutes of computation, or stop as soon as you beat the current best.
4. Before answering, re-check your best candidate with the rule${problem.id === 'no-three-in-line' ? ' (test every triple)' : ' (all pairs and all walls)'}.

ANSWER WITH ONE JSON OBJECT AND NOTHING ELSE:
{"problem": "${problem.id}", "case": "${cas.id}", "${key}": [...], "strategy": ${strategyIndex ?? 0}, "method": "one sentence on what you did", "model": "your model name"}

Even if you do not beat the current best, give your best valid result: it goes into the hunting journal and tells the swarm what does not work. The person running you checks it on ${site || 'the website'} and submits it.`;
}
