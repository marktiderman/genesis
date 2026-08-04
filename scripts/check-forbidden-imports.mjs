#!/usr/bin/env node
/**
 * check-forbidden-imports.mjs
 *
 * PRD-07 Phase D6.2b enforcement guard. Fails CI when consumer code imports
 * a primitive directly from `react-native` that Genesis re-exports as a
 * tokenized / themed wrapper.
 *
 * Why: Genesis owns the visual language. If consumers reach past the
 * Genesis surface to grab a raw RN primitive, they bypass token theming
 * and a11y defaults. The check is intentionally narrow — `View`, `Text`,
 * `Pressable`, `ScrollView`, `StyleSheet` etc. remain free imports because
 * they are foundational and often need raw-RN access for layout or perf.
 *
 * Forbidden today (Genesis re-exports these as themed wrappers):
 *   - `Modal`             → `<NativeModal />` from `@marktiderman/genesis-ui-native`
 *   - `ActivityIndicator` → `<NativeSpinner />` (theme-aware)
 *
 * Allowlist:
 *   - Files under `**\/tokens/**` — token tooling can introspect anything.
 *   - Files matching `**\/*.test.{ts,tsx,jsx}` — tests may import raw RN.
 *   - Files under `**\/__fixtures__/**` — fixture data.
 *   - Genesis itself (`packages/ui-native/**`) — that IS the wrapper layer.
 *
 * Exit codes:
 *   0 — clean.
 *   1 — at least one violation. Prints up to the first 20 with file:line.
 *
 * Usage:
 *   node scripts/check-forbidden-imports.mjs
 *   node scripts/check-forbidden-imports.mjs apps/sample-native
 *   pnpm check:forbidden-imports
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml token-usage job (runs after the
 *   hex scan; both feed the same gate).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const toPosix = (p) => p.split(path.sep).join('/');

const SCAN_EXTS = new Set(['.ts', '.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '.expo']);

const ALLOWLIST_PATTERNS = [
  /(^|\/)tokens\//,
  /\.test\.(ts|tsx|jsx)$/,
  /(^|\/)__fixtures__\//,
  /(^|\/)__mocks__\//,
  /^packages\/ui-native\//, // Genesis itself owns the re-exports.
];

// Symbols Genesis re-exports as tokenized wrappers. Importing the raw RN
// version skips theming. Keep this list small + intentional; expanding it
// is a design-system decision, not a CI tweak.
const FORBIDDEN_NAMED_IMPORTS = new Set(['Modal', 'ActivityIndicator']);

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_VIOLATIONS_PRINTED = 20;

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    if (SCAN_EXTS.has(path.extname(dir))) yield dir;
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && SCAN_EXTS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function isAllowlisted(relPath) {
  return ALLOWLIST_PATTERNS.some((pat) => pat.test(relPath));
}

// Match `import { ... } from "react-native"` — single line, basic shape.
// We deliberately don't try to handle multi-line imports or `* as RN`
// imports here because every codebase using react-native single-line-
// imports the named primitives, and `* as RN` followed by `RN.Modal` is
// rare enough to handle later if it shows up.
const RN_IMPORT_RE = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"]react-native['"]/;

function findForbiddenInImport(line) {
  const m = line.match(RN_IMPORT_RE);
  if (!m) return [];
  const names = m[1]
    .split(',')
    .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
  return names.filter((n) => FORBIDDEN_NAMED_IMPORTS.has(n));
}

const args = process.argv.slice(2);
const scanRoots = args.length > 0 ? args.map((a) => path.resolve(REPO_ROOT, a)) : [path.join(REPO_ROOT, 'apps')];

const violations = [];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const rel = toPosix(path.relative(REPO_ROOT, file));
    if (isAllowlisted(rel)) continue;

    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bad = findForbiddenInImport(line);
      for (const symbol of bad) {
        violations.push({
          file: rel,
          line: i + 1,
          symbol,
          content: line.trim(),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log('OK No forbidden react-native imports found.');
  process.exit(0);
}

console.error(`FAIL Found ${violations.length} forbidden react-native import(s):`);
console.error();
for (const v of violations.slice(0, MAX_VIOLATIONS_PRINTED)) {
  console.error(`  ${v.file}:${v.line}: ${v.symbol} should come from @marktiderman/genesis-ui-native`);
  console.error(`    ${v.content}`);
}
if (violations.length > MAX_VIOLATIONS_PRINTED) {
  console.error(`  ... and ${violations.length - MAX_VIOLATIONS_PRINTED} more.`);
}
console.error();
console.error('Genesis re-exports these primitives as tokenized wrappers.');
console.error('Import them from @marktiderman/genesis-ui-native instead. See');
console.error('scripts/check-forbidden-imports.mjs FORBIDDEN_NAMED_IMPORTS');
console.error('for the current list.');
process.exit(1);
