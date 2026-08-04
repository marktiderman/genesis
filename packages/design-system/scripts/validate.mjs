#!/usr/bin/env node
/**
 * validate.mjs — Genesis brand-schema validator.
 *
 * Runs Ajv (JSON-Schema 2020-12) against `schema/brand.schema.json` for one
 * or more candidate brand JSON files. Used by:
 *
 *   1. CI lint of consumer `@<consumer>/brand` packages — any brand JSON
 *      that doesn't match the canonical schema fails the build.
 *   2. Local dev sanity check during brand-package authoring.
 *   3. The Genesis tooling story (per PRD-07 A2.9 — `genesis doctor` will
 *      eventually shell out to this validator).
 *
 * Usage:
 *   node packages/design-system/scripts/validate.mjs <path/to/brand.json> [...]
 *
 * Examples:
 *   node packages/design-system/scripts/validate.mjs \
 *     packages/design-system/__fixtures__/brand-canonical.json
 *
 *   # With extensions:
 *   node packages/design-system/scripts/validate.mjs \
 *     packages/design-system/__fixtures__/brand-with-extensions.json
 *
 * Exits 0 on success, 1 on any validation failure.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const schemaPath = resolve(__dirname, "..", "schema", "brand.schema.json");

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

const schema = loadJson(schemaPath);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  // Default: validate the canonical fixtures so `node validate.mjs` is a
  // smoke test even with no args.
  inputs.push(resolve(__dirname, "..", "__fixtures__", "brand-canonical.json"));
  inputs.push(resolve(__dirname, "..", "__fixtures__", "brand-with-extensions.json"));
  // PRD-07 A4.0: optional cross-platform fields (typography / spacing /
  // radius / shadow / gradient / platformOverrides) — guard against
  // schema regression.
  inputs.push(resolve(__dirname, "..", "__fixtures__", "brand-full-divergence.json"));
}

let failures = 0;

for (const arg of inputs) {
  const path = resolve(process.cwd(), arg);
  let json;
  try {
    json = loadJson(path);
  } catch (err) {
    console.error(`[validate] ${path}: cannot read JSON — ${err.message}`);
    failures += 1;
    continue;
  }

  const ok = validate(json);
  const rel = path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
  if (ok) {
    console.log(`[validate] ${rel}: ok`);
  } else {
    failures += 1;
    console.error(`[validate] ${rel}: FAILED`);
    for (const err of validate.errors ?? []) {
      console.error(`  - ${err.instancePath || "/"} ${err.message}`);
    }
  }
}

process.exit(failures === 0 ? 0 : 1);
