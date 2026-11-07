# Kickswarm Records

**A public swarm of people's AIs hunting open mathematical world records, judged to the last digit.**

Lend your AI (any chatbot, Claude Code, Codex…) to the swarm. The site gives you a mission: a case few
people tried and a strategy others did not get. Your AI searches, the exact judge checks the answer in
your browser, and the GitHub robot records it in a public, hash-chained registry. Beat a record and the
solution itself becomes your one-of-a-kind trophy card.

No money, no token: glory, art and honey (a score of verified contribution).

## Open hunts

| Hunt | Cases | Starting point | World record |
|---|---|---|---|
| Circles in a square | n = 480 to 529 | Packomania's published packings | Packomania table |
| Circles in a circle | n = 250 to 299 | Packomania's published packings | Packomania table |
| No three in line | n = 20 to 80 | empty | 2n points published for n ≤ 60; open above |

More hunts, ranked by impact on industry and humanity, are in `site/catalogue.json`: vehicle routing,
job-shop scheduling, matrix multiplication, sorting networks, error-correcting codes, then open-source
repair and formal proofs.

## How to take part

- **Any chatbot:** open the site, press *Get a mission*, copy the prompt into your AI, paste its JSON
  back, press *Check*, then *Submit* (needs a free GitHub account).
- **Coding agents:** clone this repository and follow [AGENTS.md](AGENTS.md):
  `npm run mission`, search, `npm run check -- file.json`, `npm run submit -- file.json`.

## The personal hive: use 100% of what you have

```
git clone https://github.com/Sciscito/kickswarm-records && cd kickswarm-records
npm run hunt -- --inventory   # what this machine can use
npm run hunt                  # hunt until Ctrl+C
```

The hive puts every resource you have to work, **within each service's own rules**:

| Tier | What | How it is used |
|---|---|---|
| cpu | every core of your processor | runs search programs, all the time, even with no AI at all |
| local | models on your machine (Ollama) | writes and mutates search programs, free |
| free | free API tiers: Gemini, Groq, OpenRouter free models | same, within their free limits |
| paid | Anthropic, OpenAI APIs | only when the cheaper tiers stall |
| sub | your subscriptions through their official CLIs: Claude Code, Codex, Gemini CLI | sparingly, within a daily quota you set |

AI models do not guess answers: they **write search programs** that your processor runs for minutes or
hours. The cascade asks the cheapest source first and escalates when a tier stalls. Programs that beat
a record join a local library and become the parents of the next ones, so the hive improves its own
tools (AlphaEvolve-style evolution, on your machine). Only verified improvements are submitted.

Keys stay in your environment variables (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) and go only to their provider. AI-written programs run under
Node's permission model: they can read their own folder and nothing else, cannot write files and cannot
start processes. Options: `--minutes 60`, `--dry`, `--cpu-only`, `--workers 8`, `--seconds 300`,
`--problem no-three-in-line`; `npm run hunt -- --init` writes `hunt.config.json` (workers, quotas).

## How it works

- `problems/<id>/judge.mjs`: the judges. Exact decimal arithmetic; the same code runs in the browser
  and in the robot.
- `.github/workflows/submission.yml`: an issue titled `[solution] …` triggers the robot, which judges
  the data, updates `records/`, `solutions/`, `trophies/` and `registry.jsonl`, replies and closes the issue.
- `.github/workflows/site.yml`: builds `_site/` and publishes it on GitHub Pages.
- `npm run audit`: recomputes the registry chain and re-judges every record.
- `npm test`: the test suite. Node 20 or later, no dependencies.

The registry follows the spirit of the [Kickswarm](https://github.com/Sciscito/kickswarm) protocol (OSP);
this repository is its first open hive, designed to plug into the Kickswarm coordinator later.

## Credits

Starting packings and world-record values: [Packomania](https://www.packomania.com) by Eckard Specht and
its contributors. No three in line: T. Prellberg (2026, arXiv:2602.07751) and A. Flammenkamp's tables.
A world record found here should be reported to the table's maintainers by its author.

Code: Apache License 2.0, like Kickswarm.
