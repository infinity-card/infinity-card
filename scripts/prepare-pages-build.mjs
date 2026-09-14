import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const pagesRoot = fileURLToPath(new URL("../dist/pages/", import.meta.url));
const textExtensions = new Set([".css", ".html", ".js"]);
let rewrittenReferences = 0;

async function rewriteDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await rewriteDirectory(path);
      continue;
    }

    if (!textExtensions.has(extname(entry.name))) continue;

    const source = await readFile(path, "utf8");
    const output = source.replace(/([("'`])\/assets\//g, (_match, prefix) => {
      rewrittenReferences += 1;
      return `${prefix}./assets/`;
    });

    if (output !== source) await writeFile(path, output, "utf8");
  }
}

await rewriteDirectory(pagesRoot);
console.log(`Prepared GitHub Pages build (${rewrittenReferences} root asset references made relative).`);
