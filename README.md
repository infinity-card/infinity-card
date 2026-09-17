# Infinity Card

Reusable NFC business-card template with two base themes and one data file per client.

The card opens as a normal responsive web page at every width; the simulated iPhone/Pixel preview frame is removed from the deliverable.

## Preview clients

- `/?client=maison-lina` — women’s shop theme
- `/?client=atelier-yassine` — men’s shop theme
- `/?builder=1` — private-first mobile Builder workspace

## Card inventory and QR pack

The Builder includes 200 numbered card slots, from `IC-001` through `IC-200`,
shown in an **Inventaire** mode. Work through the inventory in batches of 10:
open a lot, customize any card with **Modifier**, and download only that lot's
PNG/SVG QR or printable HTML sheet. Each QR stores only the stable
`?client=ic-###` URL. Set `VITE_PUBLIC_SITE_URL` before printing so generated
QR codes use the final GitHub Pages address. If it is missing, the builder falls
back to the Infinity Card Pages URL instead of generating a phone-inaccessible
`localhost` QR. Every card now exposes a selectable link with **Copier le lien**
and **Ouvrir** actions.

The **Backup** button saves a JSON snapshot of all 200 slots and saved client
drafts. With the GitHub bridge configured, it commits only to a separately
configured **private** backup repository; if that repository is not configured
or is public, it downloads the same snapshot locally instead.

Each inventory card can be marked **Vendue** after the physical sale. Saving
or publishing that card keeps the sold status, and **Annuler vente** returns it
to its previous working state.

The inventory search accepts an IC number, slug, or client name, and the state
filter narrows the 10-card view to available, in-preparation, published, or
sold cards.

Because the snapshot can contain phone numbers, links, and logo data, the
GitHub bridge should store it in a private repository or encrypt it before
committing it to a public repository.

An unused slot resolves to a neutral “page à activer” placeholder. Once a slot
is saved or published, its client data lives in the normal per-client folder and
the same QR/NFC URL remains valid.

## Add a client

1. Create `src/clients/data/<client-slug>/client.ts`.
2. Add the matching images in `public/assets/clients/<client-slug>/hero.webp` and `logo.webp`.
3. Change the identity, links, and enabled channels in that client file.

The new client is discovered automatically—there is no registry to edit and no new repository to create. Every client keeps its data and images together in one folder. Every channel is optional. Remove a key from `channels` and it disappears everywhere. Control where enabled channels appear with `quickActions` and `detailItems`. A detail row needs a `value`; a channel with only an `href` can still be used as a quick action.

Example for a client with only WhatsApp and TikTok:

```ts
channels: {
  whatsapp: { label: "WhatsApp", value: "+212 6 00 00 00 00", href: "https://wa.me/212600000000" },
  tiktok: { label: "TikTok", value: "@client", href: "https://tiktok.com/@client", external: true },
},
contactCard: undefined,
quickActions: ["whatsapp", "tiktok"],
detailItems: ["tiktok"],
```

Business hours are not part of the template. Reviews replace the old directions quick action. TikTok and LinkedIn are supported but disabled in the two default samples.

When `contactCard` is enabled, `Ajouter aux contacts` downloads a vCard with the
client name, available phone/WhatsApp number, email, address, website, and the
shop logo as the contact photo. Missing fields are omitted; the phone then asks
the user to confirm saving the contact.

The Builder is designed for phone-first intake: choose a base theme, fill the client profile, upload the hero/logo, toggle channels, preview, save a local draft, or publish through `VITE_GITHUB_BRIDGE_URL` when the secure GitHub bridge is configured. When a channel value is filled but its action URL is left empty, the Builder generates the usual WhatsApp, phone, e-mail, Instagram, TikTok, social, maps, reviews, or website link automatically. The browser never receives a GitHub token.

Published clients also have a matching `public/clients/<slug>.json` runtime file. Public card pages load this file with a cache-busting request, while `public/sw.js` uses network-first navigation and client-asset rules. This keeps the permanent `?client=ic-###` QR/NFC URL current on phones after an edit; the bundled TypeScript module remains a safe offline/fallback copy.

`npm run build:pages` creates a relative-path static build in `dist/pages`, including the preview assets, ready for a GitHub Pages project subdirectory. It does not publish anything.

See [`docs/repository-setup.md`](docs/repository-setup.md) for the one-time GitHub Pages setup and [`docs/github-bridge.md`](docs/github-bridge.md) for the secure Builder publish contract.
