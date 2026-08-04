#!/usr/bin/env node
/**
 * check-legacy-imports.mjs
 *
 * PRD-07 enforcement guard (Phase D6.1). Fails CI if any source file
 * imports from the legacy `@genesis/*` scope. The published packages now
 * live under `@marktiderman/genesis-*` per round-6 user direction.
 *
 * Why a CI check, not just docs: per genesis CLAUDE.md rule #2 —
 * "Enforcement > documentation. If a rule matters, it gets a hook or
 * script." This is the script.
 *
 * Scans:
 *   - All `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`, `*.mts` files
 *     under apps/, packages/ (excluding node_modules/, dist/, build/, .git/)
 *   - All `package.json` files (dependency-name fields)
 *   - All `*.yml`, `*.yaml` files (workflow + config refs)
 *
 * Markdown is INTENTIONALLY excluded from SCAN_EXTS. Generated CHANGELOG.md
 * files (Changesets output) and historical migration prose legitimately
 * reference the legacy `@genesis/*` names. If `.md` is ever added to
 * SCAN_EXTS, expand ALLOWLIST_PATTERNS to include `CHANGELOG.md` paths.
 *
 * Allowlist (intentional references to the deferred future namespace flip,
 * NOT actual code imports):
 *   - PRD documentation files under docs/prds/ (architectural prose)
 *   - Migration guide docs/MIGRATION.md (talks about the rename history)
 *
 * Exit codes:
 *   0 — clean. No legacy imports found.
 *   1 — violations found. Prints each violation with file:line + the
 *       suggested replacement.
 *
 * Usage:
 *   node scripts/check-legacy-imports.mjs
 *   pnpm check:legacy-imports
 *
 * Wired into:
 *   .github/workflows/lint.yml (runs on every PR)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// All allowlist + report paths use forward slashes regardless of OS so
// Windows runs of CI behave identically to POSIX. Without this, regexes
// like /^docs\/prds\// would never match a backslash-separated rel path.
const toPosix = (p) => p.split(path.sep).join('/');

// Directories that may contain code/config to scan.
const SCAN_DIRS = ['apps', 'packages', 'scripts', '.github', 'context7.json', 'package.json'];

// Directories never scanned.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage']);

// File globs to scan.
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.json', '.yml', '.yaml']);

// Allowlist — paths where `@genesis/*` is intentional architectural prose.
const ALLOWLIST_PATTERNS = [
  /^docs\/prds\//,            // PRD architectural narrative
  /^docs\/MIGRATION\.md$/,    // migration history references the rename
  /^scripts\/check-legacy-imports\.mjs$/, // this very file
];

// Escape a string for safe inclusion in a RegExp. Tiny helper so we don't
// pull in lodash for one rule.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Map legacy → canonical. Each entry compiles to a boundary-safe pattern
// so `@genesis/core` doesn't false-match `@genesis/core-utils` (and so on).
// The negative-lookahead `(?![a-z0-9-])` makes legacy a full package token
// rather than a prefix.
const RENAMES = [
  { legacy: '@genesis/ui-native', canonical: '@marktiderman/genesis-ui-native' },
  { legacy: '@genesis/ui-web', canonical: '@marktiderman/genesis-ui' },
  { legacy: '@genesis/design-system', canonical: '@marktiderman/genesis-design-system' },
  { legacy: '@genesis/core', canonical: '@marktiderman/genesis-core' },
].map((entry) => ({
  ...entry,
  pattern: new RegExp(`${escapeRegExp(entry.legacy)}(?![a-z0-9-])`, 'i'),
}));

// Catch-all for any future `@genesis/<pkg>` reference that isn't in
// RENAMES yet. The whole namespace was retired in Phase A6, so a new
// `@genesis/<anything>` import is a regression by definition. This guard
// makes the script enforcement-complete instead of allowlist-shaped.
// Boundary lookahead matches the per-rename pattern (line 81) so a name
// like `@genesis/config-legacy` reports its full token, not the `@genesis/config`
// prefix.
const LEGACY_SCOPE_RE = /@genesis\/[a-z0-9][a-z0-9-]*(?![a-z0-9-])/i;

// Hard cap on per-file read size. Real source files are well under this;
// the cap protects against pathological cases (lock-file fragments,
// committed minified bundles, build artifacts in non-excluded dirs) where
// a synchronous full-file read could OOM a constrained CI runner.
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Walk a directory recursively and yield candidate file paths. */
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

const violations = [];
// Files we couldn't fully scan because of the size cap. A silent skip is a
// hole in enforcement — a regression could hide in an oversized file and
// pass the guard. We collect skips here and fail closed at the end of the
// run instead of warning + continuing.
const oversizedSkips = [];

for (const scanTarget of SCAN_DIRS) {
  const fullTarget = path.join(REPO_ROOT, scanTarget);
  for (const file of walk(fullTarget)) {
    const rel = toPosix(path.relative(REPO_ROOT, file));
    if (isAllowlisted(rel)) continue;

    const fileStat = fs.statSync(file);
    if (fileStat.size > MAX_FILE_BYTES) {
      oversizedSkips.push({ file: rel, size: fileStat.size });
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let matched = false;
      for (const { legacy, canonical, pattern } of RENAMES) {
        if (pattern.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            content: line.trim(),
            legacy,
            canonical,
          });
          matched = true;
          break; // one violation per line is enough
        }
      }
      if (!matched) {
        // Catch any `@genesis/<pkg>` reference not in RENAMES — the entire
        // namespace was retired, so an unmapped match is also a violation.
        const generic = line.match(LEGACY_SCOPE_RE);
        if (generic) {
          violations.push({
            file: rel,
            line: i + 1,
            content: line.trim(),
            legacy: generic[0],
            canonical: '(no mapping — add to RENAMES or use @marktiderman/genesis-*)',
          });
        }
      }
    }
  }
}

// Fail closed if any file was skipped due to the size cap. A silent skip
// would let a legacy import hide in an oversized file and pass the guard.
// Resolve by one of: reduce the file's size, add the path to
// ALLOWLIST_PATTERNS explicitly, or raise MAX_FILE_BYTES with justification.
if (oversizedSkips.length > 0) {
  console.error(
    `✗ ${oversizedSkips.length} file(s) skipped because they exceed the ${MAX_FILE_BYTES}-byte scan cap:`,
  );
  console.error();
  for (const skip of oversizedSkips) {
    console.error(`  ${skip.file} (size ${skip.size} > MAX_FILE_BYTES ${MAX_FILE_BYTES})`);
  }
  console.error();
  console.error(
    'Legacy-import enforcement is incomplete. Reduce file size, add to ALLOWLIST_PATTERNS explicitly, or raise MAX_FILE_BYTES.',
  );
  process.exit(1);
}

if (violations.length === 0) {
  console.log('✓ No legacy `@genesis/*` imports found. PRD-07 namespace migration intact.');
  process.exit(0);
}

console.error(`✗ Found ${violations.length} legacy @genesis/* reference(s):`);
console.error();
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.content}`);
  console.error(`    → replace ${v.legacy} with ${v.canonical}`);
  console.error();
}
console.error('PRD-07 Phase A6 retired the @genesis/* namespace. The published');
console.error('packages live under @marktiderman/genesis-*. Update the imports above.');
console.error('If a reference is intentionally architectural (PRD prose, migration');
console.error('docs), add the path to ALLOWLIST_PATTERNS in this script.');
process.exit(1);
