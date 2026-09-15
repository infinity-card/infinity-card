# Infinity Card GitHub Bridge

This Worker is the only component that can write to the configured GitHub
repositories. The public GitHub Pages bundle never receives a GitHub token.

## One-time setup

1. Create a GitHub OAuth App in `Settings → Developer settings → OAuth Apps`.
   Use `https://<your-worker-domain>/auth/github/callback` as the callback URL.
   The bridge requests the `public_repo` scope for client pages. Backups use a
   separate private repository configured below.
2. Install Wrangler and log in to the Cloudflare account that will host the
   Worker: `npm install --global wrangler` then `wrangler login`.
3. Edit `wrangler.toml` and replace `BRIDGE_PUBLIC_URL` with the real Worker
   URL. Keep `PUBLIC_APP_ORIGIN` as the GitHub Pages origin (without a path).
4. Set the secrets from the `bridge` directory:

   ```text
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler secret put SESSION_SECRET
   ```

   `SESSION_SECRET` should be a long random value. It encrypts the short-lived
   HttpOnly session cookie that contains the OAuth token.
5. Configure `GITHUB_BACKUP_OWNER`, `GITHUB_BACKUP_REPO`, and optionally
   `GITHUB_BACKUP_BRANCH` as Worker variables for a **private** backup
   repository. Create a separate fine-grained GitHub token limited to that
   repository with Contents: Read and write, then store it with
   `wrangler secret put GITHUB_BACKUP_TOKEN`. The Worker checks repository
   visibility before every backup; if these variables or the token are missing,
   or the repository is public, the Builder falls back to a local download.
6. Deploy from this directory with `wrangler deploy` and copy the resulting
   Worker URL.
7. Add the repository variable `VITE_GITHUB_BRIDGE_URL` in GitHub under
   `Settings → Secrets and variables → Actions → Variables`, using the Worker
   origin (for example `https://infinity-card-github-bridge.example.workers.dev`).
   The Pages workflow injects that value into the static Builder at build time.

## Endpoints

- `GET /health` — public health check.
- `GET /auth/github/start?return=...` — starts the owner-only GitHub OAuth flow.
- `GET /auth/github/callback` — completes OAuth and creates an encrypted,
  HttpOnly session cookie.
- `POST /clients` — validates the generated client paths and commits one client
  module plus optional images.
- `POST /backup` — validates and commits only
  `data/backups/infinity-card-backup.json`.

The bridge accepts browser write requests only from `PUBLIC_APP_ORIGIN` with
`Content-Type: application/json`, checks the authenticated GitHub login,
rejects path traversal and unknown files, validates the generated client module
as data-only content, limits payload sizes, and uses the Git Data API so each
publish is one commit. A concurrent update returns a conflict instead of
force-pushing over someone else's work.
