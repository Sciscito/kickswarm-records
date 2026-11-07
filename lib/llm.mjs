// Calling language models over HTTP, the same code in Node and in the browser.
// Each provider is used with the person's own key, sent only to that provider.

export const PROVIDERS = {
  gemini: { label: 'Google Gemini API', tier: 'free', base: 'https://generativelanguage.googleapis.com/v1beta/openai', env: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', note: 'Free tier with daily limits' },
  groq: { label: 'Groq', tier: 'free', base: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY', keyUrl: 'https://console.groq.com/keys', note: 'Free tier, very fast open models' },
  openrouter: { label: 'OpenRouter', tier: 'free', base: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/keys', note: 'Free models (ids ending in :free) and paid ones' },
  anthropic: { label: 'Anthropic API', tier: 'paid', env: 'ANTHROPIC_API_KEY', keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Paid, pay per use' },
  openai: { label: 'OpenAI API', tier: 'paid', base: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid, pay per use' },
  mistral: { label: 'Mistral', tier: 'free', base: 'https://api.mistral.ai/v1', env: 'MISTRAL_API_KEY', keyUrl: 'https://console.mistral.ai/api-keys', note: 'Free "Experiment" plan with limits' },
  cerebras: { label: 'Cerebras', tier: 'free', base: 'https://api.cerebras.ai/v1', env: 'CEREBRAS_API_KEY', keyUrl: 'https://cloud.cerebras.ai', note: 'Free tier, very fast open models' },
  sambanova: { label: 'SambaNova', tier: 'free', base: 'https://api.sambanova.ai/v1', env: 'SAMBANOVA_API_KEY', keyUrl: 'https://cloud.sambanova.ai/apis', note: 'Free tier, large open models' },
  github: { label: 'GitHub Models', tier: 'free', base: 'https://models.github.ai/inference', env: 'GITHUB_MODELS_TOKEN', keyUrl: 'https://github.com/settings/personal-access-tokens', note: 'Free with a GitHub account (token with the "Models" permission)' },
  deepseek: { label: 'DeepSeek', tier: 'paid', base: 'https://api.deepseek.com', env: 'DEEPSEEK_API_KEY', keyUrl: 'https://platform.deepseek.com/api_keys', note: 'Very cheap, strong at code' },
  moonshot: { label: 'Kimi (Moonshot)', tier: 'paid', base: 'https://api.moonshot.ai/v1', env: 'MOONSHOT_API_KEY', keyUrl: 'https://platform.moonshot.ai/console/api-keys', note: 'Cheap, long context' },
  zai: { label: 'GLM (Z.ai)', tier: 'paid', base: 'https://api.z.ai/api/paas/v4', env: 'ZAI_API_KEY', keyUrl: 'https://z.ai/manage-apikey/apikey-list', note: 'Cheap, strong at code' },
};

/** A hive uses every free OpenRouter model at once (each with its own statistics). */
export const OPENROUTER_FREE_MAX = 100;

const getJson = async (url, headers = {}, ms = 8000) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** Rank model ids: bigger and newer-looking names first, preferred families boosted. */
export function rank(ids, prefer = []) {
  const score = (id) => {
    let s = 0;
    prefer.forEach((p, i) => { if (id.toLowerCase().includes(p)) s += 100 - i * 10; });
    const b = id.match(/(\d+(?:\.\d+)?)b\b/i);
    if (b) s += Math.min(Number(b[1]), 400) / 4;
    const v = id.match(/(\d+(?:\.\d+)?)/);
    if (v) s += Math.min(Number(v[1]), 10);
    return s;
  };
  return [...ids].sort((a, b) => score(b) - score(a));
}

/** List the usable models of a provider for this key; the first one is the default choice. */
export async function listModels(provider, key) {
  if (provider === 'gemini') {
    const m = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const ids = (m.models ?? []).filter((x) => (x.supportedGenerationMethods ?? []).includes('generateContent')).map((x) => x.name.replace(/^models\//, '')).filter((x) => /gemini/.test(x) && !/image|tts|live|embedding|aqa/.test(x));
    return rank(ids.filter((x) => !/lite|exp|preview/.test(x)), ['flash', 'pro']).concat(ids.filter((x) => /lite|exp|preview/.test(x)));
  }
  if (provider === 'groq') {
    const m = await getJson('https://api.groq.com/openai/v1/models', { authorization: `Bearer ${key}` });
    return rank((m.data ?? []).map((x) => x.id).filter((x) => !/whisper|guard|tts|playai/.test(x)), ['qwen', 'gpt-oss', 'llama', 'deepseek']);
  }
  if (provider === 'openrouter') {
    // Every free text model, the strongest first: models in test ("stealth", often big frontier models
    // offered free for a while) first, then by size; one per vendor first so the swarm tries many families.
    // Small models stay: the hive gives them the light work (see delegate.mjs).
    const m = await getJson('https://openrouter.ai/api/v1/models');
    // Truly free only: EVERY price field is zero (Google Lyria shows 0 per token but bills each song) and
    // the model answers with text only. Never a model that could cost money.
    const free = (m.data ?? []).filter((x) => x.pricing && Object.values(x.pricing).length && Object.values(x.pricing).every((v) => Number(v) === 0)
      && (x.architecture?.output_modalities ?? ['text']).every((o) => o === 'text')
      && (x.architecture?.output_modalities ?? ['text']).includes('text') && (x.architecture?.input_modalities ?? ['text']).includes('text') && x.id !== 'openrouter/free' && !/lyria|music|song|audio|image|tts|veo|video|sora/i.test(x.id));
    const stealth = (x) => x.id.startsWith('stealth/') || (x.id.startsWith('openrouter/') && x.id !== 'openrouter/free') || /stealth|cloaked/i.test(x.description ?? '');
    const size = (x) => {
      const t = `${x.id} ${(x.description ?? '').slice(0, 200)}`.match(/(\d+(?:\.\d+)?)\s?b(?:illion)?(?![-\w]*a\d)/i) ?? x.id.match(/(\d+(?:\.\d+)?)b/i);
      return t ? Number(t[1]) : /ultra|super|large|pro|max/i.test(x.id) ? 200 : /mini|nano|small|lite|tiny/i.test(x.id) ? 8 : 40;
    };
    const ok = free;
    ok.sort((a, b) => (stealth(b) - stealth(a)) || (size(b) - size(a)) || (b.created ?? 0) - (a.created ?? 0));
    const seen = new Set();
    const first = [];
    const rest = [];
    for (const x of ok) { const v = x.id.split('/')[0]; (seen.has(v) ? rest : first).push(x.id); seen.add(v); }
    return [...first, ...rest];
  }
  if (provider === 'github') {
    const m = await getJson('https://models.github.ai/catalog/models', { authorization: `Bearer ${key}` });
    return rank((Array.isArray(m) ? m : m.data ?? []).map((x) => x.id ?? x.name).filter(Boolean), ['deepseek', 'qwen', 'gpt', 'llama', 'mistral']);
  }
  if (['mistral', 'cerebras', 'sambanova', 'deepseek', 'moonshot', 'zai'].includes(provider)) {
    const m = await getJson(`${PROVIDERS[provider].base}/models`, { authorization: `Bearer ${key}` });
    return rank((m.data ?? []).map((x) => x.id).filter((x) => !/embed|moderation|ocr|tts|whisper|vision-only/i.test(x)), ['coder', 'codestral', 'qwen', 'deepseek', 'kimi', 'glm', 'llama', 'large']);
  }
  if (provider === 'anthropic') return ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'];
  if (provider === 'openai') return ['gpt-5-mini', 'gpt-5'];
  if (provider === 'ollama') {
    const t = await getJson('http://127.0.0.1:11434/api/tags', {}, 1500);
    return rank((t.models ?? []).map((m) => m.name), ['coder', 'qwen', 'deepseek', 'llama', 'gemma']);
  }
  return [];
}

/** One completion. `src` = { kind: 'openai'|'anthropic'|'ollama'|'echo', base?, auth?, model }. */
export async function callModel(src, prompt, { timeoutMs = 240000, browser = false } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  if (src.kind === 'echo') return '```js\n' + ((prompt.match(/```js\n([\s\S]*?)```\s*$/) ?? [])[1] ?? '') + '```';
  if (src.kind === 'ollama') {
    const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', signal, body: JSON.stringify({ model: src.model, stream: false, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    return (await r.json()).message?.content ?? '';
  }
  if (src.kind === 'openai') {
    const r = await fetch(`${src.base}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${src.auth}` },
      body: JSON.stringify({ model: src.model, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices?.[0]?.message?.content ?? '';
  }
  if (src.kind === 'anthropic') {
    const headers = { 'content-type': 'application/json', 'x-api-key': src.auth, 'anthropic-version': '2023-06-01' };
    if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers, body: JSON.stringify({ model: src.model, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ((await r.json()).content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  throw new Error(`unknown model kind ${src.kind}`);
}

/** A source object for a provider + key + model. */
export function sourceFor(provider, key, model) {
  const p = PROVIDERS[provider];
  if (provider === 'anthropic') return { key: `anthropic:${model}`, tier: p.tier, kind: 'anthropic', auth: key, model, label: `${p.label} (${model})` };
  if (provider === 'ollama') return { key: `ollama:${model}`, tier: 'local', kind: 'ollama', model, label: `Ollama (${model})` };
  return { key: `${provider}:${model}`, tier: p.tier, kind: 'openai', base: p.base, auth: key, model, label: `${p.label} (${model})` };
}
