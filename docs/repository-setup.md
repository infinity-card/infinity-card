# Infinity Card repository setup

The intended repository is one project under the `infinity-card` GitHub
account. It contains the card template, every client folder, the Builder, and
the Pages workflow.

## First-time GitHub setup

1. Create one repository named `infinity-card` under the account.
2. Push this project to the `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. The workflow in `.github/workflows/deploy-pages.yml` publishes `dist/pages`.
5. The public card URL is
   `https://infinity-card.github.io/infinity-card/?client=<slug>`.

Before printing any QR lot, set `VITE_PUBLIC_SITE_URL` to the final Pages base
URL. The Builder uses that value for every QR; if it is empty, it uses the
current local preview origin instead and shows a warning. The inventory is
split into 20 lots of 10 cards so you can print only the batch you are selling.

The Builder can be opened with `?builder=1`. Its GitHub publish button stays in
local-draft mode until `VITE_GITHUB_BRIDGE_URL` points to the private bridge
described in `github-bridge.md`. The same bridge activates the Builder's
**Backup** button, which commits the complete inventory snapshot to
`data/backups/infinity-card-backup.json`.
