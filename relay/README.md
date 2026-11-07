# The relay: submissions without a GitHub account

Participants sign their solutions with a key their device creates (no account). The relay checks the
signature and opens the GitHub issue for them; the robot judges it as usual and credits their hunter name.

Only the person running the project sets this up, once (about 10 minutes, free):

1. Create a Cloudflare account (free) at https://dash.cloudflare.com/sign-up.
2. Create a fine-grained GitHub token: GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained → Generate. Repository access: only `kickswarm-records`. Permissions: **Issues: Read and
   write**, nothing else. Expiry: 90 days or more.
3. In this folder:
   ```
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN      # paste the token when asked; it is never shown again
   npx wrangler deploy
   ```
4. Put the URL it prints (e.g. `https://kickswarm-records-relay.<you>.workers.dev`) in `site/config.json`
   as `"relay"`, commit and push. From then on, the site, the hive and the connector submit through it.

What the relay can do: open issues on this one repository, nothing else. What it checks: size, known
problem, a valid Ed25519 signature. The robot still judges everything; a bad solution is only rejected.
