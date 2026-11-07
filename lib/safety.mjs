// Money safety. Kickswarm must never cost anyone money by surprise. Universal (Node and browser).
// - Paid APIs (pay per use) are OFF and locked unless "API mode" is turned on by hand, with the risks
//   read, three boxes ticked and a phrase typed. Presets, voice commands and AI-written patches can never
//   turn it on: only the dedicated button can (setApiMode), and turning it off is always one click.
// - Even in API mode, paid calls stay at 0 per day until a daily limit is set by hand.
// - Subscription tools (Claude Code, Codex, Gemini CLI) are started WITHOUT any API key in their
//   environment, so they use the person's plan and never switch to pay-per-use billing.
// - "Free" providers are free only on free accounts: a key from an account with billing turned on can be
//   charged by the provider. The dashboard says so next to every key field.

export const ACCEPT_PHRASE = 'I ACCEPT THE COSTS';

/** API mode after a request from the dedicated button. Off is always allowed; on needs everything. */
export function nextApiMode(prev, req = {}) {
  if (req.on === false) return { on: false };
  if (req.on === true && req.checks === 3 && String(req.phrase ?? '').trim().toUpperCase() === ACCEPT_PHRASE) return { on: true, at: new Date().toISOString() };
  return prev?.on ? prev : { on: false };
}

/** Settings with the paid tier forced off unless API mode is on. */
export function gatePaid(settings) {
  if (settings.apiMode?.on) return settings;
  return { ...settings, apiMode: { on: false }, tiers: { ...settings.tiers, paid: false }, quotas: { ...settings.quotas, paid: 0 } };
}

/** Can this source be used at all, money-wise? */
export const moneyOk = (src, settings) => src.tier !== 'paid' || !!settings.apiMode?.on;

/** Environment variables that would make a subscription tool bill per use instead of using the plan. */
const API_KEY_VARS = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_API_KEY|OPENAI_API_KEY|OPENAI_ORG_ID|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_CLOUD_PROJECT|AWS_BEARER_TOKEN_BEDROCK|CLAUDE_CODE_USE_BEDROCK|CLAUDE_CODE_USE_VERTEX|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|ZAI_API_KEY|GROQ_API_KEY|MISTRAL_API_KEY|CEREBRAS_API_KEY|SAMBANOVA_API_KEY|GITHUB_MODELS_TOKEN)$/i;
export function envWithoutApiKeys(env = {}) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !API_KEY_VARS.test(k)));
}

export const BILLING_WARNING = 'Free only on a free account: use a key from an account or project WITHOUT billing turned on. If billing is on, the provider can charge you, and Kickswarm cannot see or stop it.';

export const API_MODE_RISKS = [
  'Every call is billed by the provider to the account that owns the key, at its prices. Kickswarm cannot see your bill, cannot refund anything and cannot stop a provider from charging.',
  'A hive runs many calls, all day if you let it. Set a hard spending limit in the provider console (OpenRouter, OpenAI, Anthropic…) BEFORE pasting a key here, and keep the daily call limit low.',
  'For companies, labs and public bodies: use a dedicated key on a dedicated project with its own budget, check that your organisation allows sending these prompts to this provider (data, contracts, export rules), and keep someone responsible for the bill.',
  'You are responsible for the keys you add and for the provider’s terms of use. Kickswarm is offered as is, with no warranty.',
];
