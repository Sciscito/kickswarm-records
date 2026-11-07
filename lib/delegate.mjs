// Smart delegation: each task goes to a model that fits it. Big models (models in test, frontier
// models, paid APIs, subscriptions) think hard; small ones (local models, small free models) do the
// light work. Nothing is wasted: a hardcore open problem never gets a 2B model, and a warm-up or a small
// edit of a searcher that already works never burns a big model's daily quota.

/** Billions of parameters read from a model id or label, when it says so. */
export function paramsOf(id = '') {
  const m = String(id).match(/(\d+(?:\.\d+)?)\s?b(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

/** 'heavy', 'mid' or 'light'. */
export function weightOf(src = {}) {
  const key = String(src.key ?? ''), id = String(src.model ?? src.label ?? key);
  if (src.tier === 'sub' || src.tier === 'paid') return 'heavy';
  if (src.tier === 'local' || /^(ollama|webllm)/.test(key)) return 'light';
  if (/stealth\/|openrouter\/(?!free)/i.test(id)) return 'heavy';
  const b = paramsOf(id);
  if (b != null) return b >= 70 ? 'heavy' : b <= 20 ? 'light' : 'mid';
  if (/ultra|super|large|\bpro\b|max|opus|sonnet|gpt-5|r1|v3|k2/i.test(id)) return 'heavy';
  if (/mini|nano|small|lite|tiny|flash-8b|haiku/i.test(id)) return 'light';
  return 'mid';
}

/**
 * What a task needs. Hardcore open problems need hard thinking; a warm-up, or improving a searcher that
 * already won (a small edit), is light work; the rest takes any good model.
 */
export function needFor(problem = {}, { hasParent = false } = {}) {
  if (problem.level === 'hardcore') return 'heavy';
  if (problem.level === 'warm-up') return 'light';
  return hasParent ? 'light' : 'any';
}

/** Does a model of this weight fit a task with this need? (0 = no, higher = better) */
export function fit(weight, need) {
  if (need === 'heavy') return weight === 'heavy' ? 2 : weight === 'mid' ? 1 : 0;
  if (need === 'light') return weight === 'light' ? 2 : weight === 'mid' ? 1 : 0;
  return weight === 'heavy' ? 2 : 1;
}
