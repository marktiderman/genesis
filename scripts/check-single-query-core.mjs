#!/usr/bin/env node
/**
 * check-single-query-core.mjs
 *
 * Fails when the lockfile resolves more than one version of a TanStack Query
 * package. Two copies of `@tanstack/query-core` don't share a cache: the
 * offline cache would hydrate one QueryClient while the screens read from
 * another, and `QueryClientProvider` from one copy isn't seen by hooks from
 * the other. Every package takes react-query at one range (`^5.105.0` as a
 * dev dependency, a wide peer), so the workspace resolves one copy.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = readFileSync(process.argv[2] ?? path.join(root, "pnpm-lock.yaml"), "utf8");
const watched = ["@tanstack/query-core", "@tanstack/react-query", "@tanstack/query-persist-client-core", "@tanstack/query-async-storage-persister"];

const problems = [];
for (const name of watched) {
  const versions = new Set();
  const pattern = new RegExp(`^  '?${name.replace("/", "\\/")}@([^(':]+)`, "gm");
  for (const m of lock.matchAll(pattern)) versions.add(m[1]);
  if (versions.size > 1) problems.push(`${name}: ${[...versions].sort().join(", ")}`);
}

if (problems.length) {
  console.error("check-single-query-core: more than one version resolved:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nGive every package the same @tanstack/react-query dev dependency range, then run pnpm install.");
  process.exit(1);
}
console.log("OK One version of each TanStack Query package.");
