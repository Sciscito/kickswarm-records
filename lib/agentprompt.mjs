// The setup prompt for coding agents (Claude Code, Codex, Gemini CLI…): it does the setup for the
// person, asks before every connection, and never goes around a provider's rules.

export function agentSetupPrompt(repo = 'https://github.com/Sciscito/kickswarm-records') {
  return `You are helping me set up a Kickswarm personal hive on this computer.
Kickswarm Records (${repo}) is a public swarm hunting open, exactly verifiable math records. The hive uses my processor and the AI sources I allow, within each service's own rules.

RULES FOR YOU
- Ask me before every step that installs or downloads anything, creates files outside the hive folder, stores a key, or creates a scheduled task. Wait for my clear yes.
- Never ask me to paste a password. API keys: I type them myself in the dashboard (or in .env.local); you never print or repeat them.
- Never work around a provider's limits or terms: no extra accounts, no automating web chat pages. Only official APIs, official CLIs and local models.
- Explain each step in one plain sentence, in my language.

STEPS
1. Check that git and Node.js 20 or later are installed. If not, tell me how to install them and stop there.
2. Ask me which folder to use (suggest a "kickswarm-records" folder in my home directory), then clone the repository there.
3. Run "npm run hunt -- --inventory" and tell me in plain words what it found: processor cores, graphics card, local models, API keys, subscriptions' CLIs, MCP tools. Say what is missing and what each missing item would add (for example a free Gemini API key).
4. Propose a preset (Discreet, Balanced, Free only, Full power) that fits what you found, explain each in one sentence, and let me choose.
5. Start the dashboard with "npm run hive" in the background, give me the link it prints, and show me where to change anything (sources on/off, quotas, schedule, hunts).
6. Ask whether I want the hive to run automatically every night. Only if I say yes, use the dashboard's "Run every night" button (or run the equivalent command) and tell me exactly how to remove it.
7. Finish with a short summary: what is set up, what the hive may use, what it will never do, and how to stop it.`;
}
