# Infinity Card GitHub bridge

The public card pages are static and GitHub Pages is the source of truth. The
Builder uses a small private bridge for writes so a GitHub token never ships to
the phone or into the public bundle.

## Contract

Set `VITE_GITHUB_BRIDGE_URL` to the bridge origin when it is ready. The Builder
sends `POST /clients` with a JSON payload shaped like:

```json
{
  "client": { "slug": "client-slug", "theme": "women" },
  "files": [
    { "path": "src/clients/data/client-slug/client.ts", "content": "...", "encoding": "utf-8" },
    { "path": "public/assets/clients/client-slug/hero.webp", "content": "...", "encoding": "base64" }
  ],
  "commitMessage": "Add Infinity Card client: Client Name"
}
```

The bridge should authenticate the owner with GitHub OAuth or a GitHub App,
validate the slug and file paths, then commit the files to the configured
`infinity-card` repository. It may return `{ "ok": true, "url": "..." }`.

The Builder's **Backup** button sends `POST /backup` with the complete local
inventory snapshot (all 200 slot statuses plus every saved draft). The bridge
must write the supplied file to `data/backups/infinity-card-backup.json` in one
commit, after validating that the path is exactly that backup path. A backup
payload looks like this:

```json
{
  "backup": {
    "version": 1,
    "generatedAt": "2026-09-14T12:00:00.000Z",
    "totalCardSlots": 200,
    "slots": { "ic-001": { "status": "available" } },
    "drafts": {}
  },
  "files": [
    { "path": "data/backups/infinity-card-backup.json", "content": "...", "encoding": "utf-8" }
  ],
  "commitMessage": "Update Infinity Card backup · 2026-09-14"
}
```

This backup contains client contact details and may contain embedded image
data. The bridge must commit it to a private repository or encrypt it before
writing it to a public GitHub repository; never expose a GitHub token or an
encryption key in the browser bundle.

For inventory cards, accept only slot slugs from `ic-001` through `ic-200` and
keep the slug unchanged after the QR/NFC sticker is printed. A published slot
becomes a normal client module; an unassigned slot stays on the neutral
placeholder page.

## Recommended GitHub flow

1. Builder authenticates the owner through the bridge.
2. The bridge validates the client payload and rejects paths outside the two
   allowed client folders.
3. The bridge writes one commit containing the data module and any new images.
4. GitHub Actions runs `npm run build:pages` and deploys the Pages artifact.
5. The stable NFC URL remains `?client=<slug>` while the client information can
   be edited later through the Builder.

Until the bridge is configured, `Sauvegarder draft` stores a working draft on
the current device, **Backup** downloads a complete local JSON copy, and
`Exporter le payload` provides a local integration artifact. No GitHub write is
attempted until the bridge is configured.
