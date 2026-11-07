# The relay: submissions without any account

Participants sign their solutions with a key their device creates (no account). The relay checks the
signature and keeps the submission in a public queue (Cloudflare KV, 14 days). The GitHub robot reads
the queue every 10 minutes and judges each one like any other; the registry records which queue items
it handled. **The relay holds no secret**: nothing in it can write to GitHub.

Set up once by the project owner (free Cloudflare account):

```
cd relay
npx wrangler login                         # opens Cloudflare in the browser: click Allow
npx wrangler kv namespace create QUEUE     # prints an id: put it in wrangler.toml
npx wrangler deploy                        # prints the relay URL
```

Then put the URL in `site/config.json` as `"relay"`, commit and push.
