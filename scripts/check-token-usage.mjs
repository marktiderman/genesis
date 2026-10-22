#!/usr/bin/env node
/**
 * check-token-usage.mjs
 *
 * PRD-07 Phase D6.2 enforcement guard. Fails CI when consumer code uses
 * raw color literals instead of design-system tokens. Two literal shapes are
 * caught: hex (`#abc`, `#abcd`, `#abcdef`, `#abcdef00`) and CSS color
 * functions with numeric arguments (`rgb()`, `rgba()`, `hsl()`, `hsla()` —
 * e.g. `rgba(0,0,0,0.08)`). Token-backed forms like `hsl(var(--primary))`
 * are intentionally spared (they reference a variable, not a raw literal).
 *
 * Why a CI check, not just docs: per genesis CLAUDE.md rule #2 —
 * "Enforcement > documentation." Brand-agnostic tokens only work if raw
 * colors can't sneak back in. Consumers should pull colors from
 * `@marktiderman/genesis-design-system` token slots (or their own
 * `@<consumer>/brand` extensions).
 *
 * Scans (default):
 *   - `apps/<scope>/**\/*.{ts,tsx,jsx,css,scss,less}` under the path passed on
 *     the CLI (defaults to `apps/`). CSS/SCSS/LESS are scanned because raw hex
 *     sneaks back in through stylesheets just as easily as through TS/JSX — the dashboard
 *     CSS this repo tokenized (PR #240 WS-A) must stay hex-free too. Build
 *     artifacts (`build/`, `dist/`, `.next/`, `.expo/`) are skipped, so
 *     compiled CSS is never scanned. The script is also safe to run on a
 *     single file for editor integration.
 *
 * Allowlist (intentional / harmless hex):
 *   - Files under `**\/tokens/**` — token definitions own raw color values.
 *   - Files under `**\/themes/**` — generated theme CSS is the compiled
 *     token output; it owns raw hex by construction (same rationale as
 *     `tokens/`).
 *   - Files matching `**\/*.test.{ts,tsx,jsx}` — tests may assert on hex
 *     output produced by the tokens layer.
 *   - Files under `**\/__fixtures__/**` — fixture data is not shipped UI.
 *   - Comments — C-style block comments (JS/TS JSDoc AND CSS comments) are
 *     stripped before scanning, and full-line `//` comments are skipped.
 *     A lone `*` at line-start is NOT treated as a comment: in CSS it is the
 *     universal selector (`* { ... }`), so raw hex there is still caught.
 *   - HTML entities like `&#1234;` — numeric entities are not colors.
 *   - Pure-decimal `#163` / `#1284` — almost always issue refs in prose;
 *     a real 3- or 4-digit hex color overwhelmingly contains a-f.
 *
 * Exit codes:
 *   0 — clean.
 *   1 — at least one violation. Prints up to the first 20 with file:line.
 *
 * Usage:
 *   node scripts/check-token-usage.mjs               # scans apps/
 *   node scripts/check-token-usage.mjs apps/sample-native
 *   pnpm check:token-usage
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml token-usage job.
 *
 * The lexer (comment stripping, hex and color-function detection) lives in
 * ./lib/color-literals.mjs, shared with `genesis doctor`. Vendoring this
 * script into another repo means copying that file too.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LINE_COMMENT_EXTS,
  findColorFunctions,
  findHexLiterals,
  stripBlockComments,
} from './lib/color-literals.mjs';

// Re-exported for checks that import it from here (check-navigation-reimplementation.mjs).
export { stripBlockComments };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/** Normalize an OS filesystem path to POSIX separators (backslashes -> forward slashes). */
const toPosix = (p) => p.split(path.sep).join('/');

// File extensions scanned for raw hex. SCSS/LESS are scanned alongside CSS so a
// raw color can't dodge the gate by living in a preprocessor stylesheet; their
// `//` line comments are handled via LINE_COMMENT_EXTS below.
const SCAN_EXTS = new Set(['.ts', '.tsx', '.jsx', '.css', '.scss', '.less']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '.expo']);

// Structural allowlist: files that legitimately own ANY raw color literal —
// hex OR color function. Applies to BOTH detectors.
const ALLOWLIST_PATTERNS = [
  /(^|\/)tokens\//,
  /(^|\/)themes\//,
  /\.test\.(ts|tsx|jsx)$/,
  /(^|\/)__fixtures__\//,
  /(^|\/)__mocks__\//,
];

// Color-function-only allowlist: narrow, temporary exemptions for specific app
// files that carry KNOWN rgb()/rgba()/hsl()/hsla() literals we are not
// rewriting yet. These exempt ONLY the color-function detection — findHexLiterals
// still runs on these files, so a raw hex sneaking in is still caught (the hex
// gate must not regress). Scoped to the exact file on purpose, and tracked for
// removal.
const COLOR_FN_ALLOWLIST_PATTERNS = [
  // TEMP: current dashboard/sample-native are being refactored (Next/Expo);
  // remove after. Both are `rgba(0,0,0,0.08)` hairline borders that should
  // become `theme.colors.border` once the Expo refactor lands.
  /(^|\/)apps\/sample-native\/app\/components\/token-row\.tsx$/,
  /(^|\/)apps\/sample-native\/app\/\(tabs\)\/settings\.tsx$/,

  // apps/sample display-only literals (not shipped product UI):
  //  - Storybook `backgrounds` toolbar config (Storybook chrome; cannot
  //    consume runtime CSS-var tokens).
  //  - The token showcase page, where the literals ARE the shadow-token
  //    values being displayed (same rationale as the tokens/ allowlist).
  /(^|\/)apps\/sample\/\.storybook\/preview\.tsx$/,
  /(^|\/)apps\/sample\/app\/routes\/showcase\.tokens\.\$category\.tsx$/,
];

// Per-line ignores. `//` full-line comments + HTML entities + bare PR refs are
// not colors. NOTE: a lone `*` at line-start is deliberately NOT matched here —
// in CSS that is the universal selector (`* { color: #fff }`), and treating it
// as a comment let raw hex hide behind the exact surface this gate protects.
// JSDoc/CSS `/* ... */` blocks are removed up front by stripBlockComments().
const COMMENT_LINE_RE = /^\s*\/\//;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_VIOLATIONS_PRINTED = 20;

/** Recursively yield scannable files under `dir` (or `dir` itself if it is a file), skipping ignored directories. */
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

/** Return true when the file's path matches a structural allowlist pattern (raw hex OR color fn legitimate). */
function isHexAllowlisted(relPath) {
  return ALLOWLIST_PATTERNS.some((pat) => pat.test(relPath));
}

/** Also allow the color-function-only exemptions — hex detection still runs on these files. */
function isColorFnAllowlisted(relPath) {
  return (
    isHexAllowlisted(relPath) ||
    COLOR_FN_ALLOWLIST_PATTERNS.some((pat) => pat.test(relPath))
  );
}

// Exported helpers (stripBlockComments) are reused by other checks, so the
// scan runs only when this file is executed, not when it is imported.
function main() {
  const args = process.argv.slice(2);
  const scanRoots = args.length > 0 ? args.map((a) => path.resolve(REPO_ROOT, a)) : [path.join(REPO_ROOT, 'apps')];

  const violations = [];

  for (const root of scanRoots) {
    for (const file of walk(root)) {
      const rel = toPosix(path.relative(REPO_ROOT, file));
      const hexAllowed = isHexAllowlisted(rel);
      const colorFnAllowed = isColorFnAllowlisted(rel);
      // Only skip the file outright when BOTH detectors are exempt. A file on the
      // color-function-only allowlist is still scanned for raw hex.
      if (hexAllowed && colorFnAllowed) continue;

      const stat = fs.statSync(file);
      if (stat.size > MAX_FILE_BYTES) continue;

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      // Scan with block comments blanked out; report from the original lines.
      // `//` line comments are only stripped for file types where `//` is a real
      // line comment — never for plain CSS (see LINE_COMMENT_EXTS / stripBlockComments).
      const hasLineComments = LINE_COMMENT_EXTS.has(path.extname(file));
      const scanLines = stripBlockComments(content, hasLineComments).split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Scan the block-comment-stripped line (url()-aware; #250) through BOTH
        // detectors (#253), each gated by its own allowlist.
        const scanLine = scanLines[i] ?? line;
        if (COMMENT_LINE_RE.test(scanLine)) continue;
        const hits = [
          ...(hexAllowed ? [] : findHexLiterals(scanLine)),
          ...(colorFnAllowed ? [] : findColorFunctions(scanLine)),
        ];
        for (const hit of hits) {
          violations.push({
            file: rel,
            line: i + 1,
            column: hit.column,
            literal: hit.literal,
            content: line.trim(),
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log('OK No raw color literals found. Token usage is clean.');
    process.exit(0);
  }

  console.error(`FAIL Found ${violations.length} raw color literal(s):`);
  console.error();
  const printed = violations.slice(0, MAX_VIOLATIONS_PRINTED);
  for (const v of printed) {
    console.error(`  ${v.file}:${v.line}:${v.column}: raw color ${v.literal}`);
    console.error(`    ${v.content}`);
  }
  if (violations.length > MAX_VIOLATIONS_PRINTED) {
    console.error(`  ... and ${violations.length - MAX_VIOLATIONS_PRINTED} more.`);
  }
  console.error();
  console.error('Use a token from @marktiderman/genesis-design-system or a brand');
  console.error('extension instead of inlining a hex value. If a literal is');
  console.error('legitimate (token definition, generated theme, test fixture),');
  console.error('place the file under tokens/, themes/, __fixtures__/, or');
  console.error('*.test.* — see ALLOWLIST');
  console.error('in scripts/check-token-usage.mjs.');
  process.exit(1);
}

// Run only when executed, not when imported. Compare REAL paths: through a
// symlinked checkout (macOS /tmp -> /private/tmp) `process.argv[1]` differs
// from `__filename` and the check would silently pass without scanning (see
// verify-no-workspace-protocol.mjs).
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const invoked = invokedPath && fs.existsSync(invokedPath) ? fs.realpathSync(invokedPath) : invokedPath;
if (invoked === fs.realpathSync(__filename)) main();
