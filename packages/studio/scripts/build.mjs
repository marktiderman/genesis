#!/usr/bin/env node
/**
 * Builds the alias without a bundler: each `src/<entry>.ts` is a doc comment and one re-export of
 * the same entry of @marktiderman/genesis-data, valid as both JavaScript and a declaration file, written verbatim as
 * `dist/<entry>.js` and `dist/<entry>.d.ts`. Other files in `src/` (stylesheets, the CommonJS entry
 * and the command) are copied as they are.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = new Set(["index"]);
const REEXPORT = /^export \* from "@marktiderman\/genesis-data(\/[\w/-]+)?";$/m;

rmSync(path.join(root, "dist"), { recursive: true, force: true });
mkdirSync(path.join(root, "dist"));
for (const file of readdirSync(path.join(root, "src"))) {
  if (file.endsWith(".test.ts")) continue;
  // Stylesheets, the CommonJS entry, the command and declaration files are copied as they are.
  if (!file.endsWith(".ts") || /\.d\.[cm]?ts$/.test(file)) {
    cpSync(path.join(root, "src", file), path.join(root, "dist", file));
    continue;
  }
  const name = file.slice(0, -3);
  const source = readFileSync(path.join(root, "src", file), "utf8");
  const code = source.trimEnd().split("\n").filter((l) => !/^\s*(?:\/\*\*|\*|\*\/)/.test(l));
  if (code.length !== 1 || !REEXPORT.test(code[0])) throw new Error(`src/${file} must be a doc comment and one \`export * from "@marktiderman/genesis-data…"\``);
  writeFileSync(path.join(root, "dist", `${name}.d.ts`), source);
  writeFileSync(path.join(root, "dist", `${name}.js`), CLIENT.has(name) ? `"use client";\n${source}` : source);
}

// An app set up under the old name scans this package's dist for Tailwind classes (`@source
// ".../genesis-studio/dist"`). The re-export holds none, so genesis-data's built module sits here
// too, unimported, for that scan to find.
const require = createRequire(import.meta.url);
const built = path.join(path.dirname(require.resolve("@marktiderman/genesis-data/package.json")), "dist", "index.js");
writeFileSync(path.join(root, "dist", "tailwind-classes.js"), `// Not imported: Genesis Data's classes, for a Tailwind @source on this package.\n${readFileSync(built, "utf8")}`);
