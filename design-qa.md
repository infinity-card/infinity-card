# Infinity Card — Design QA

## Reference and capture evidence

- Women source: `reference/women-template.png` (`853 × 1852`).
- Men source: `reference/men-template.png` (`853 × 1844`).
- Normal-page implementation captures: `http://localhost:4174/?client=maison-lina` and `http://localhost:4174/?client=atelier-yassine`, captured in the Codex in-app browser with the page filling the viewport.
- Responsive implementation capture: `http://localhost:4177/pages/?client=atelier-yassine`, captured from the static Pages build at `390 × 844` CSS pixels.
- Side-by-side full-view comparisons: `work/qa-compare.html?template=women` and `work/qa-compare.html?template=men`.
- Focused responsive comparison: `work/mobile-live.html`, with an exact `390 × 844` live iframe.
- State tested: default contact button, three quick actions, six detail rows, women and men themes, normal desktop rendering, and exact `390 × 844` mobile rendering.

## Surface review

- Typography: Georgia display face and Roboto UI face match the editorial direction; business names, labels, and values remain legible without clipping.
- Spacing and geometry: asymmetric curved hero, circular overlapping logo, full-width primary CTA, compact action grid, divided detail rows, and restrained footer follow the approved hierarchy. There is no horizontal overflow at `390 × 844`, `393 × 852`, or the Pixel content size of `427 × 904`.
- Color: women uses ivory, plum, and muted rose; men uses warm stone, navy, and cognac. WhatsApp remains consistently green and the main CTA has sufficient contrast against white text.
- Images: both themes use generated, optimized WebP hero and logo assets plus the paper texture. All images reported complete with non-zero natural width in the browser.
- Copy and controls: business hours are absent; reviews replace directions; TikTok is supported but disabled in both defaults; all missing channel entries are filtered before rendering and therefore leave no empty buttons or rows.
- Responsive delivery: the page shell fills the real browser viewport at both desktop and mobile widths, with the card centered at a readable max width on larger screens and edge-to-edge on smaller screens. All simulated iPhone/Pixel chrome is hidden while the underlying mobile runtime stays intact.
- Browser health: no console warnings or errors were recorded for either theme or for the GitHub Pages subdirectory build.

## Interaction checks

- Client selection works through the `client` query parameter for both sample clients.
- The contact button generated a `.vcf` download and changed to the success label `Contact prêt`.
- Phone, email, WhatsApp, social, address, and reviews links expose the configured destinations.
- The removed iPhone/Pixel device picker and chrome no longer appear in the normal-page deliverable.
- The real browser cursor is visible again; only the simulated runtime cursor remains hidden.
- The Pages build loaded all runtime and client assets from `/pages/assets/...` when served from a repository-like subdirectory.

## Comparison and fix history

1. P2 — Initial content density extended beyond the intended iPhone viewport. Hero, actions, rows, and footer spacing were tightened; the footer is now visible without scrolling.
2. P2 — The taller Pixel preview exposed a white area below the card. The paper background and content minimum height now fill the viewport.
3. P1 — The deliverable initially nested the page inside a simulated phone. The normal-page shell now presents the card directly at every viewport size, with no iPhone/Pixel frame, picker, status bar, or camera chrome.
4. P1 — Protected runtime assets used root-relative URLs that would fail in a GitHub Pages project subdirectory. The Pages post-build step now rewrites them to relative paths; the subdirectory test loaded every image successfully.
5. P3 — The reference footer uses a decorative corner flourish. The implementation uses a low-opacity client logo mark so the flourish remains theme-specific without adding an uneditable decorative asset.

No unresolved P0, P1, or P2 findings remain.

Final result: passed
