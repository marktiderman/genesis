#!/usr/bin/env node
/**
 * Post-build: re-attach "use client" directives that esbuild strips during
 * bundling.
 *
 * tsup (via esbuild with write:true) drops per-file directive prologues, and
 * the esbuild-plugin-preserve-directives family only works with write:false —
 * incompatible with how tsup writes output. So we drive it from the emitted
 * metafile instead: for every output chunk, if ANY of its source inputs began
 * with "use client", we prepend the directive to that chunk.
 *
 * Result: interactive component chunks (Radix/cmdk/vaul/hooks/etc.) carry
 * "use client"; pure presentational primitives (Button, Card, Badge …) and the
 * neutral barrel stay directive-free and remain server-importable.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(pkgRoot, "dist");

// Locate the tsup/esbuild metafile(s) in dist. Guard against a missing dist/
// (fresh clone / cache miss / run before tsup) so we emit a friendly message
// instead of a raw ENOENT stack.
let metaFiles = [];
try {
  metaFiles = readdirSync(distDir).filter(
    (f) => f.startsWith("metafile-") && f.endsWith(".json"),
  );
} catch {
  console.error(
    `[stamp-use-client] dist dir not found at ${distDir} — did the build run?`,
  );
  process.exit(1);
}
if (metaFiles.length === 0) {
  console.error("[stamp-use-client] no metafile-*.json in dist — is metafile:true set?");
  process.exit(1);
}

const DIRECTIVE = '"use client";';
const clientInputs = new Set();
const clientCache = new Map();

function inputIsClient(inputPath) {
  if (clientCache.has(inputPath)) return clientCache.get(inputPath);
  let isClient = false;
  try {
    const abs = resolve(pkgRoot, inputPath);
    const src = readFileSync(abs, "utf8");
    const head = src.slice(0, 64).trimStart();
    isClient = head.startsWith('"use client"') || head.startsWith("'use client'");
  } catch {
    isClient = false;
  }
  clientCache.set(inputPath, isClient);
  return isClient;
}

let stamped = 0;
const stampedFiles = [];

for (const metaFile of metaFiles) {
  const meta = JSON.parse(readFileSync(join(distDir, metaFile), "utf8"));
  for (const [outPath, out] of Object.entries(meta.outputs)) {
    if (!outPath.endsWith(".js")) continue;
    const inputs = Object.keys(out.inputs ?? {});
    const hasClient = inputs.some((i) => inputIsClient(i));
    if (!hasClient) continue;

    const absOut = resolve(pkgRoot, outPath);
    let code;
    try {
      code = readFileSync(absOut, "utf8");
    } catch {
      continue;
    }
    const trimmed = code.trimStart();
    if (trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")) {
      continue; // already present
    }
    writeFileSync(absOut, `${DIRECTIVE}\n${code}`);
    stamped += 1;
    stampedFiles.push(outPath.replace(/^dist\//, ""));
    inputs.forEach((i) => inputIsClient(i) && clientInputs.add(i));
  }
}

console.log(
  `[stamp-use-client] stamped "use client" onto ${stamped} chunk(s):\n` +
    stampedFiles.sort().map((f) => `  ${f}`).join("\n"),
);
