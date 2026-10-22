#!/usr/bin/env node
/**
 * check-navigation-reimplementation.mjs
 *
 * Fails CI when app code declares its own `resolveNavigation` or
 * `NavigationNode`. Genesis ships both (`@marktiderman/genesis-ui/layout`),
 * and `AppShell navigation={tree}` derives the sidebar, contextual nav,
 * mobile tab bar and back-to-parent link from them. A local copy drifts:
 * Breakthrough wrote one before genesis-ui 2.6 and had to migrate off it.
 *
 * Flags DECLARATIONS only (`function resolveNavigation`, `const
 * resolveNavigation =`, `interface NavigationNode`, `type NavigationNode =`),
 * never imports or calls of the Genesis versions.
 *
 * Allowlist:
 *   - `packages/ui/**` — Genesis itself owns the originals.
 *   - Test files and `__fixtures__` / `__mocks__`.
 *
 * Exit codes:
 *   0 — clean.
 *   1 — at least one local re-implementation, printed with file:line.
 *
 * Usage:
 *   node scripts/check-navigation-reimplementation.mjs
 *   node scripts/check-navigation-reimplementation.mjs apps/sample
 *   pnpm check:navigation-reimplementation
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml token-usage job.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const toPosix = (p) => p.split(path.sep).join('/');

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '.expo', '.output']);

const ALLOWLIST_PATTERNS = [
  /^packages\/ui\//, // Genesis itself owns the originals.
  /\.test\.(ts|tsx|js|jsx|mts)$/,
  /(^|\/)__fixtures__\//,
  /(^|\/)__mocks__\//,
];

const DECLARATIONS = [
  { name: 'resolveNavigation', re: /\b(?:function\s*\*?\s*resolveNavigation\b|(?:const|let|var)\s+resolveNavigation\s*[=:])/ },
  { name: 'NavigationNode', re: /\b(?:interface\s+NavigationNode\b|type\s+NavigationNode\b\s*(?:<.*?>)?\s*=)/ },
];

/**
 * Local `resolveNavigation` / `NavigationNode` declarations in `source`.
 * @param {string} source
 * @returns {{ line: number, name: string, content: string }[]}
 */
export function findNavigationReimplementations(source) {
  const found = [];
  source.split('\n').forEach((text, i) => {
    for (const { name, re } of DECLARATIONS) {
      if (re.test(text)) found.push({ line: i + 1, name, content: text.trim() });
    }
  });
  return found;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  if (!fs.statSync(dir).isDirectory()) {
    if (SCAN_EXTS.has(path.extname(dir))) yield dir;
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && SCAN_EXTS.has(path.extname(entry.name))) yield full;
  }
}

function main() {
  const args = process.argv.slice(2);
  const roots = args.length > 0
    ? args.map((a) => path.resolve(REPO_ROOT, a))
    : [path.join(REPO_ROOT, 'apps'), path.join(REPO_ROOT, 'packages')];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = toPosix(path.relative(REPO_ROOT, file));
      if (ALLOWLIST_PATTERNS.some((pat) => pat.test(rel))) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const v of findNavigationReimplementations(source)) violations.push({ file: rel, ...v });
    }
  }

  if (violations.length === 0) {
    console.log('OK No local resolveNavigation / NavigationNode re-implementations.');
    process.exit(0);
  }

  console.error(`FAIL Found ${violations.length} local navigation re-implementation(s):`);
  console.error();
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: local ${v.name}`);
    console.error(`    ${v.content}`);
  }
  console.error();
  console.error('Import resolveNavigation / NavigationNode from @marktiderman/genesis-ui/layout,');
  console.error('and pass the tree to AppShell as `navigation` (see packages/ui/SKILL.md).');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
