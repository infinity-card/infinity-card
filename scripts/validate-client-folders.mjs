import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "src", "clients", "data");
const publicRoot = path.join(projectRoot, "public");

const entries = await readdir(dataRoot, { withFileTypes: true });
const clientDirs = entries.filter((entry) => entry.isDirectory());
const errors = [];

if (!clientDirs.length) errors.push("No client data folders were found.");

for (const entry of clientDirs) {
  const slug = entry.name;
  const modulePath = path.join(dataRoot, slug, "client.ts");

  try {
    await stat(modulePath);
  } catch {
    errors.push(`${slug}: missing client.ts`);
    continue;
  }

  const source = await readFile(modulePath, "utf8");
  const slugMatch = source.match(/slug:\s*["']([^"']+)["']/);
  if (!slugMatch || slugMatch[1] !== slug) {
    errors.push(`${slug}: slug must match its folder name`);
  }

  for (const field of ["heroImage", "logoImage"]) {
    const match = source.match(new RegExp(`${field}:\\s*["']([^"']+)["']`));
    if (!match) {
      errors.push(`${slug}: missing ${field}`);
      continue;
    }

    try {
      await stat(path.join(publicRoot, match[1].replace(/^\//, "")));
    } catch {
      errors.push(`${slug}: ${field} asset does not exist at public/${match[1]}`);
    }
  }
}

if (errors.length) {
  console.error("Client folder validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Client folder validation passed (${clientDirs.length} clients).`);
