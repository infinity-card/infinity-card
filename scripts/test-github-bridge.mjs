import assert from "node:assert/strict";
import { validateBackupPayload, validateClientPayload, validSlug } from "../bridge/index.js";

assert.equal(validSlug("ic-001"), true);
assert.equal(validSlug("ic-200"), true);
assert.equal(validSlug("atelier-yassine"), true);
assert.equal(validSlug("ic-201"), false);
assert.equal(validSlug("../escape"), false);

const clientFile = {
  path: "src/clients/data/ic-001/client.ts",
  content: "export const client = {};",
  encoding: "utf-8",
};
const client = validateClientPayload({
  client: { slug: "ic-001" },
  files: [clientFile, {
    path: "public/assets/clients/ic-001/logo.webp",
    content: "AAAA",
    encoding: "base64",
  }],
});
assert.equal(client.slug, "ic-001");
assert.throws(() => validateClientPayload({
  client: { slug: "ic-001" },
  files: [{ ...clientFile, path: "../../.env" }],
}), /path is not allowed/);
assert.throws(() => validateClientPayload({
  client: { slug: "ic-001" },
  files: [{ path: "public/assets/clients/ic-001/logo.webp", content: "AAAA", encoding: "base64" }],
}), /data file is required/);

const backup = validateBackupPayload({
  backup: { totalCardSlots: 200 },
  files: [{ path: "data/backups/infinity-card-backup.json", content: "{}", encoding: "utf-8" }],
});
assert.equal(backup.files.length, 1);
assert.throws(() => validateBackupPayload({
  backup: { totalCardSlots: 200 },
  files: [{ path: "src/clients/data/ic-001/client.ts", content: "{}", encoding: "utf-8" }],
}), /path or encoding is not allowed/);

console.log("GitHub bridge validation passed");
