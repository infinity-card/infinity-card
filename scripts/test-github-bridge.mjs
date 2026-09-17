import assert from "node:assert/strict";
import {
  commitFiles,
  serializeClientModule,
  validateBackupPayload,
  validateClientPayload,
  validateWriteRequest,
  validSlug,
} from "../bridge/index.js";

assert.equal(validSlug("ic-001"), true);
assert.equal(validSlug("ic-200"), true);
assert.equal(validSlug("atelier-yassine"), true);
assert.equal(validSlug("ic-201"), false);
assert.equal(validSlug("../escape"), false);

const clientData = {
  slug: "ic-001",
  theme: "women",
  name: "Client test",
  description: "Test client",
  city: "Rabat",
  heroImage: "assets/clients/ic-001/hero.webp",
  logoImage: "assets/clients/ic-001/logo.webp",
  logoAlt: "Logo test",
  channels: {
    whatsapp: {
      label: "WhatsApp",
      value: "+212600000000",
      href: "https://wa.me/212600000000",
      external: true,
    },
  },
  quickActions: ["whatsapp"],
  detailItems: ["whatsapp"],
};
const clientFile = {
  path: "src/clients/data/ic-001/client.ts",
  content: serializeClientModule(clientData),
  encoding: "utf-8",
};
const clientJsonFile = {
  path: "public/clients/ic-001.json",
  content: `${JSON.stringify(clientData, null, 2)}\n`,
  encoding: "utf-8",
};
const client = validateClientPayload({
  client: clientData,
  files: [clientFile, clientJsonFile, {
    path: "public/assets/clients/ic-001/hero.webp",
    content: "AAAA",
    encoding: "base64",
  }, {
    path: "public/assets/clients/ic-001/logo.webp",
    content: "AAAA",
    encoding: "base64",
  }],
});
assert.equal(client.slug, "ic-001");
assert.deepEqual(client.files.map((file) => file.path), [
  "src/clients/data/ic-001/client.ts",
  "public/clients/ic-001.json",
  "public/assets/clients/ic-001/hero.webp",
  "public/assets/clients/ic-001/logo.webp",
]);
const legacyClient = validateClientPayload({ client: clientData, files: [clientFile] });
assert.deepEqual(legacyClient.files.map((file) => file.path), [
  "src/clients/data/ic-001/client.ts",
  "public/clients/ic-001.json",
]);
assert.throws(() => validateClientPayload({
  client: clientData,
  files: [{ ...clientFile, content: "export const client = {};" }, clientJsonFile],
}), /generated client data/);
assert.throws(() => validateClientPayload({
  client: clientData,
  files: [{ ...clientFile, path: "../../.env" }, clientJsonFile],
}), /path is not allowed/);
assert.throws(() => validateClientPayload({
  client: clientData,
  files: [{ path: "public/assets/clients/ic-001/logo.webp", content: "AAAA", encoding: "base64" }, clientJsonFile],
}), /data file is required/);
assert.throws(() => validateClientPayload({
  client: { ...clientData, channels: { whatsapp: { ...clientData.channels.whatsapp, href: "javascript:alert(1)" } } },
  files: [{ ...clientFile, content: serializeClientModule({ ...clientData, channels: { whatsapp: { ...clientData.channels.whatsapp, href: "javascript:alert(1)" } } }) }, {
    ...clientJsonFile,
    content: `${JSON.stringify({ ...clientData, channels: { whatsapp: { ...clientData.channels.whatsapp, href: "javascript:alert(1)" } } }, null, 2)}\n`,
  }],
}), /channel is invalid/);

const backup = validateBackupPayload({
  backup: { totalCardSlots: 200 },
  files: [{ path: "data/backups/infinity-card-backup.json", content: "{}", encoding: "utf-8" }],
});
assert.equal(backup.files.length, 1);
assert.throws(() => validateBackupPayload({
  backup: { totalCardSlots: 200 },
  files: [{ path: "src/clients/data/ic-001/client.ts", content: "{}", encoding: "utf-8" }],
}), /path or encoding is not allowed/);

const writeEnv = { PUBLIC_APP_ORIGIN: "https://infinity-card.github.io" };
assert.equal(validateWriteRequest(new Request("https://bridge.example/clients", {
  method: "POST",
  headers: { Origin: writeEnv.PUBLIC_APP_ORIGIN, "Content-Type": "application/json" },
}), writeEnv), null);
assert.equal(validateWriteRequest(new Request("https://bridge.example/clients", {
  method: "POST",
  headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
}), writeEnv)?.status, 403);
assert.equal(validateWriteRequest(new Request("https://bridge.example/clients", {
  method: "POST",
  headers: { Origin: writeEnv.PUBLIC_APP_ORIGIN, "Content-Type": "text/plain" },
}), writeEnv)?.status, 415);

const backupEnv = {
  GITHUB_BACKUP_OWNER: "infinity-card",
  GITHUB_BACKUP_REPO: "infinity-card-backups",
  GITHUB_BACKUP_BRANCH: "main",
  GITHUB_BACKUP_TOKEN: "backup-token",
};
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  return new Response(JSON.stringify({ private: false }), { status: 200, headers: { "content-type": "application/json" } });
};
await assert.rejects(
  commitFiles([{ path: "data/backups/infinity-card-backup.json", content: "{}", encoding: "utf-8" }], "Backup", "session-token", backupEnv, "backup"),
  /Backup repository must be private/,
);
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "https://api.github.com/repos/infinity-card/infinity-card-backups");
globalThis.fetch = originalFetch;

console.log("GitHub bridge validation passed");
