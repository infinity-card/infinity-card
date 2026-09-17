# Published client data

Each `<slug>.json` file is the cache-safe runtime copy of one client card.
The Builder updates this file together with the source module and uploaded
images. Public card URLs stay stable (`?client=ic-###`); the page requests the
JSON with a cache-busting query so edits reach phones without reprinting QR or
NFC cards.
