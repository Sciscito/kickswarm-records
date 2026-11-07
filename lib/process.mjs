// Turning a submitted solution into registry entries. Used by the GitHub robot and by the tests.
// A submission is only data (numbers); nothing in it is ever executed.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { better, compareScores, fromUnits, shortScore, toUnits } from './exact.mjs';
import { appendEntry, canonical } from './registry.mjs';
import { TIERS, trophyCard } from './render.mjs';

export const PROBLEMS = ['circles-in-square', 'circles-in-circle', 'no-three-in-line'];
const MAX_BODY = 200_000;

export function loadProblem(id) {
  if (!PROBLEMS.includes(id)) throw new Error(`unknown problem "${id}" (known: ${PROBLEMS.join(', ')})`);
  return JSON.parse(readFileSync(`problems/${id}/problem.json`, 'utf8'));
}

export async function loadJudge(id) {
  return (await import(new URL(`../problems/${id}/judge.mjs`, import.meta.url))).judge;
}

/** The JSON object in an issue body: a ```json block if there is one, else the outermost braces. */
export function extractJson(body) {
  if (typeof body !== 'string' || !body.trim()) throw new Error('the submission is empty');
  if (body.length > MAX_BODY) throw new Error('the submission is too large');
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  let txt = fence ? fence[1] : body;
  const a = txt.indexOf('{');
  const b = txt.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object found in the submission');
  txt = txt.slice(a, b + 1);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`the JSON could not be read: ${e.message}`);
  }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

export function readRecord(problem, cas) {
  const p = `records/${problem}/${cas}.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** Smallest improvement that counts, so nobody farms records by adding digits to someone else's solution. */
function minGain(problem) {
  return problem.score_name === 'radius' ? '0.000000000001' : '1';
}

/** The world-record test: strictly above the published value plus one unit of its last digit. */
function beatsWorld(problem, cas, score) {
  if (problem.id === 'no-three-in-line') return Number(score) === 2 * cas.n && !cas.world;
  if (!cas.world?.score) return false;
  const w = cas.world.score;
  const digits = (w.split('.')[1] ?? '').length;
  const margin = 10n ** BigInt(30 - digits);
  return toUnits(score) > toUnits(w) + margin;
}

/**
 * Process one submission. `submission` is the parsed JSON; `author` the GitHub login.
 * Returns { status: 'record' | 'attempt' | 'rejected', tier?, entry?, message }.
 */
export async function processSubmission(submission, { author, issue, ts } = {}) {
  let problem;
  let cas;
  let score;
  try {
    if (!author || !/^[A-Za-z0-9-]{1,39}$/.test(author)) throw new Error('unknown author');
    problem = loadProblem(String(submission?.problem ?? ''));
    cas = problem.cases.find((c) => c.id === String(submission?.case ?? ''));
    if (!cas) throw new Error(`"${problem.id}" has no case "${submission?.case}"`);
    const judge = await loadJudge(problem.id);
    ({ score } = judge(cas, submission));
  } catch (e) {
    return { status: 'rejected', message: `Rejected: ${e.message}` };
  }

  const current = readRecord(problem.id, cas.id);
  const method = str(submission.method, 500);
  const notes = str(submission.notes, 2000);
  const model = str(submission.model, 60);
  const strategy = Number.isInteger(submission.strategy) && submission.strategy >= 0 && submission.strategy < problem.strategies.length ? submission.strategy : undefined;
  const solution = problem.id === 'no-three-in-line' ? { points: submission.points } : { centers: submission.centers };
  const solution_hash = createHash('sha256').update(canonical(solution)).digest('hex');
  const label = `${problem.title}, n = ${cas.n}`;

  let gainOk = true;
  if (current && better(score, current.score, problem.direction)) {
    const gain = toUnits(score) - toUnits(current.score);
    gainOk = (problem.direction === 'max' ? gain : -gain) >= toUnits(minGain(problem));
  }
  const improves = better(score, current?.score, problem.direction) && gainOk;

  if (!improves) {
    const entry = appendEntry({ nature: 'attempt', problem: problem.id, case: cas.id, author, score, best: current?.score, method, model, strategy, notes, solution_hash, issue, ts });
    const why = current && compareScores(score, current.score) === 0 ? 'equals' : current && better(score, current.score, problem.direction) ? 'is above by less than the minimum step of' : 'does not beat';
    return {
      status: 'attempt',
      entry,
      message: `Verified: ${label}, score ${shortScore(score)}. It ${why} the current best (${shortScore(current?.score ?? '-')}${why.includes('minimum') ? `; the minimum step is ${minGain(problem)}` : ''}). Logged as attempt #${entry.seq} in the hunting journal, so others know what was tried. Thank you.`,
    };
  }

  let tier;
  if (beatsWorld(problem, cas, score)) tier = 'world';
  else if (problem.id === 'no-three-in-line' && Number(score) === 2 * cas.n) tier = 'perfect';
  else tier = current ? 'swarm' : 'valid';
  const honey = TIERS[tier].honey;

  const entry = appendEntry({ nature: 'record', problem: problem.id, case: cas.id, author, score, previous: current?.score, tier, honey, method, model, strategy, notes, solution_hash, issue, ts });
  mkdirSync(`solutions/${problem.id}/${cas.id}`, { recursive: true });
  mkdirSync(`records/${problem.id}`, { recursive: true });
  mkdirSync('trophies', { recursive: true });
  const rec = { problem: problem.id, case: cas.id, author, score, tier, solution, seq: entry.seq, date: entry.ts.slice(0, 10), method, model };
  writeFileSync(`solutions/${problem.id}/${cas.id}/${entry.seq}.json`, JSON.stringify(rec));
  writeFileSync(`records/${problem.id}/${cas.id}.json`, JSON.stringify(rec));
  writeFileSync(
    `trophies/${entry.seq}.svg`,
    trophyCard({ problem: problem.id, n: cas.n, solution, tier, author, score: shortScore(score), scoreLabel: problem.score_name, date: entry.ts.slice(0, 10), seq: entry.seq, hash: entry.hash, title: problem.title }),
  );
  const head = { world: '🏆 WORLD RECORD', perfect: '💜 Perfect solution', swarm: '🐝 New swarm record', valid: '✅ First valid solution' }[tier];
  const world = tier === 'world'
    ? `\n\nThis beats the published record (${cas.world?.score ?? 'none published'}). Please tell the maintainers of the reference table: ${problem.world_source.url}`
    : '';
  return {
    status: 'record',
    tier,
    entry,
    message: `${head}: ${label}, score ${shortScore(score)}${current ? ` (previous best ${shortScore(current.score)})` : ''}. +${honey} honey. Registry entry #${entry.seq}. Your trophy card: trophies/${entry.seq}.svg${world}`,
  };
}

export { fromUnits };
