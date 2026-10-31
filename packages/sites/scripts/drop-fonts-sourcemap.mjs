#!/usr/bin/env node
/**
 * Runs after tsup. The font chunk (`dist/fonts.generated-*.js`) is base64
 * woff2 data, so its sourcemap (about 1.1 MB) maps nothing worth reading:
 * drop that map and the comments that name it. Every other sourcemap stays.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const chunks = readdirSync(dist).filter((f) => /^fonts\.generated-[\w-]+\.js$/.test(f));
if (chunks.length !== 1) throw new Error(`Expected one fonts.generated chunk in dist, found ${chunks.length}: ${chunks.join(", ")}.`);
for (const chunk of chunks) {
  rmSync(join(dist, `${chunk}.map`), { force: true });
  const js = readFileSync(join(dist, chunk), "utf8");
  // Every comment: tsup writes it twice.
  const stripped = js.replace(/\n\/\/# sourceMappingURL=\S+/g, "");
  if (stripped === js) throw new Error(`${chunk} has no sourceMappingURL comment to drop.`);
  writeFileSync(join(dist, chunk), stripped);
  console.log(`genesis-sites: dropped the sourcemap of ${chunk}`);
}
