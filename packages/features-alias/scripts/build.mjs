#!/usr/bin/env node
/**
 * Builds the alias without a bundler: each `src/<entry>.ts` is already a one-line re-export of the
 * same subpath of @marktiderman/genesis-config (with its @deprecated doc comment), valid as both
 * JavaScript and a declaration file. It is written as `dist/<entry>.js` and `dist/<entry>.d.ts`
 * verbatim, so the types an app loads for `/blocks` are genesis-config's `/blocks` and nothing else
 * (a bundler's declaration build pulled every subpath, zod included, into each entry).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The React entries re-export client components, so they keep genesis-config's "use client". */
const CLIENT = new Set(["react", "gate-react"]);
const REEXPORT = /^export \* from "@marktiderman\/genesis-config(\/[\w/-]+)?";$/m;

rmSync(path.join(root, "dist"), { recursive: true, force: true });
mkdirSync(path.join(root, "dist"));
for (const file of readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
  const name = file.slice(0, -3);
  const source = readFileSync(path.join(root, "src", file), "utf8");
  const lines = source.trimEnd().split("\n");
  // Only a doc comment and the one re-export: anything else would need a real build.
  const code = lines.filter((l) => !/^\s*(?:\/\*\*|\*|\*\/)/.test(l));
  if (code.length !== 1 || !REEXPORT.test(code[0])) throw new Error(`src/${file} must be a doc comment and one \`export * from "@marktiderman/genesis-config…"\``);
  writeFileSync(path.join(root, "dist", `${name}.d.ts`), source);
  writeFileSync(path.join(root, "dist", `${name}.js`), CLIENT.has(name) ? `"use client";\n${source}` : source);
}
