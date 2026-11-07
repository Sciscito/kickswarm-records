// "Connect with OpenRouter": the official OAuth PKCE flow. The person logs in on openrouter.ai and
// approves; OpenRouter sends back a code that this page exchanges for a key of their own. No copy-paste.
// Free models (ids ending in ":free") cost nothing, within OpenRouter's daily limits.

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Send the person to OpenRouter; they come back to `callback` with ?code=… */
export async function startOpenRouterLogin(callback) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('ks-or-verifier', verifier);
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`;
}

/** If we are back from OpenRouter, exchange the code for a key. Returns the key or null. */
export async function finishOpenRouterLogin() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem('ks-or-verifier');
  if (!code || !verifier) return null;
  sessionStorage.removeItem('ks-or-verifier');
  params.delete('code');
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}#/hive`);
  const r = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.key) throw new Error(`OpenRouter did not give a key (${j.error?.message ?? r.status})`);
  return j.key;
}
