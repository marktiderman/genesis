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
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Extensions where `//` opens a genuine line comment (C-style langs, plus the
// CSS supersets SCSS/LESS which DO have `//`). Plain `.css` is deliberately
// absent: CSS has NO `//` line comment, and an unquoted `url(https://cdn/x.svg)`
// contains `//`. Treating that `//` as a comment blanks the rest of the line, so
// a real hex after it (`... color: #ff0000;`) never gets scanned and the gate is
// bypassed. Only files with this extension run the `//` branch in
// stripBlockComments(); `/* ... */` block comments are stripped for ALL types.
const LINE_COMMENT_EXTS = new Set(['.ts', '.tsx', '.jsx', '.js', '.mjs', '.cjs', '.scss', '.less']);

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
const HTML_ENTITY_RE = /&#\d+;/g;

// Blank out `/* ... */` block comments (JS/TS JSDoc AND CSS comments) while
// preserving line numbers, so hex inside a comment is ignored without skipping
// any `*`-prefixed CSS selector line. Uses escape-aware lexical scanning to
// avoid removing comment-like sequences inside string and template literals.
//
// `hasLineComments` gates the `//` line-comment branch: pass `true` only for
// file types where `//` is a real line comment (see LINE_COMMENT_EXTS). For
// plain CSS it must be `false`, otherwise `url(https://…)` gets blanked from the
// `//` onward and any hex after it slips past the gate. String/template/`/* */`
// handling is unaffected by this flag and runs for ALL file types.
/** Blank out C-style block comments (and `//` line comments when enabled) while preserving line numbers and skipping string/template literals. */
function stripBlockComments(content, hasLineComments = true) {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];
    const next = i + 1 < len ? content[i + 1] : '';
    const prevIsColon = i > 0 && content[i - 1] === ':';
    const prevIsBackslash = i > 0 && content[i - 1] === '\\';

    // Handle string literals: "..." with escape support
    if (ch === '"') {
      result += ch;
      i++;
      while (i < len) {
        const c = content[i];
        result += c;
        if (c === '\\' && i + 1 < len) {
          result += content[i + 1]; // escaped character
          i += 2;
        } else if (c === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle string literals: '...' with escape support
    if (ch === "'") {
      result += ch;
      i++;
      while (i < len) {
        const c = content[i];
        result += c;
        if (c === '\\' && i + 1 < len) {
          result += content[i + 1]; // escaped character
          i += 2;
        } else if (c === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle template literals: `...` with escape support
    if (ch === '`') {
      result += ch;
      i++;
      while (i < len) {
        const c = content[i];
        result += c;
        if (c === '\\' && i + 1 < len) {
          result += content[i + 1]; // escaped character
          i += 2;
        } else if (c === '`') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle CSS/SCSS/LESS `url(...)` tokens. The contents of `url(...)` are
    // NEVER a comment regardless of scheme, so consume the whole token verbatim
    // through to the matching `)` and do NOT let the `//` inside it open a line
    // comment. This structurally closes the entire `url()`-`//` bypass class in
    // one place — `url(//cdn/x)` (protocol-relative), `url(https://…)` and
    // `url(http://…)` all stay scannable, so a trailing `color: #ff0000;` on the
    // same line is still caught (CMT-250-004 + Codex protocol-relative P2).
    // Detect an `url` identifier (case-insensitive) directly followed by `(`,
    // where `u` starts the identifier (previous char is not an identifier char,
    // so `blurUrl(` / `baseurl(` don't match). Quotes inside are respected via
    // the same escape rules as string state, so a `)` inside `url("a)b")` does
    // not end the token early; `/* */` is left intact (never appears in url()).
    if (
      (ch === 'u' || ch === 'U') &&
      content.slice(i, i + 4).toLowerCase() === 'url(' &&
      !/[\w$]/.test(content[i - 1] ?? '')
    ) {
      result += content.slice(i, i + 4); // 'url('
      i += 4;
      while (i < len && content[i] !== ')') {
        const c = content[i];
        if (c === '"' || c === "'") {
          // Consume a quoted segment (escape-aware) so a `)` inside it is not
          // mistaken for the url() close.
          result += c;
          i++;
          while (i < len) {
            const q = content[i];
            result += q;
            if (q === '\\' && i + 1 < len) {
              result += content[i + 1];
              i += 2;
            } else if (q === c) {
              i++;
              break;
            } else {
              i++;
            }
          }
        } else {
          result += c;
          i++;
        }
      }
      if (i < len && content[i] === ')') {
        result += ')';
        i++;
      }
      continue;
    }

    // Handle line comments: // ... to end of line
    // A `//` at top level must NOT open string/template/block state: an
    // apostrophe in a contraction ("don't") inside a line comment would
    // otherwise enter string-mode and consume across the newline, corrupting
    // the stripping of a following real block comment (CMT-250-001).
    // Gated on `hasLineComments`: plain CSS has no `//` comment (an unquoted
    // `url(https://…)` contains `//`), so this branch is skipped there and the
    // `//` is treated as ordinary content, keeping any following hex scannable.
    // The `url(...)` branch above already neutralizes `//` inside url() for ALL
    // file types; the guards below are defense-in-depth for `//` sequences that
    // arise OUTSIDE url(). Skip when the `//` is immediately preceded by `:` — a
    // URL scheme separator (`http://`, `https://`), not a comment (CMT-250-004).
    // AND skip when the `//` is immediately preceded by `\` — strings/templates
    // are already lexed above, so a backslash in code state means we are inside
    // a regex literal (e.g. `/https?:\/\//`), where the escaped `\/` + closing
    // `/` read as `//`. Without this the rest of the line (and any hex on it)
    // would be blanked and slip past the gate (Codex P2, same bypass class).
    if (hasLineComments && ch === '/' && next === '/' && !prevIsColon && !prevIsBackslash) {
      let j = i + 2;
      while (j < len && content[j] !== '\n') {
        j++;
      }
      const commentLen = j - i;
      // Blank comment chars to spaces; the trailing `\n` (if any) is left for
      // the next iteration so line numbers are preserved.
      const commentText = content.slice(i, i + commentLen);
      result += commentText.replace(/[^\n]/g, ' ');
      i += commentLen;
      continue;
    }

    // Handle block comments: /* ... */
    if (ch === '/' && next === '*') {
      let commentLen = 2;
      let j = i + 2;
      while (j < len) {
        if (content[j] === '*' && j + 1 < len && content[j + 1] === '/') {
          commentLen = j + 2 - i;
          break;
        }
        j++;
      }
      // Replace non-newline chars with spaces to preserve line numbers
      const commentText = content.slice(i, i + commentLen);
      result += commentText.replace(/[^\n]/g, ' ');
      i += commentLen;
      continue;
    }

    // Regular character
    result += ch;
    i++;
  }

  return result;
}

// Hex color literal: `#` + 3, 4, 6, or 8 hex digits, NOT inside an HTML
// entity (which is `&#1234;` — pure decimal). The match is intentionally
// generous (any hex run in {3,4,6,8}); the all-digits-in-3/4 case is
// filtered out post-match because pure-decimal `#163` / `#1284`
// overwhelmingly appears in natural language as issue / order refs
// ("Merged PR #163", "Order #1284") rather than as colors. CSS
// developers writing literal short-hand colors almost always include a
// letter (`#fff`, `#a1b`, `#0af`). For 6- and 8-digit forms we accept
// all-digit hex (`#000000` is a real color). False-negative tradeoff:
// `#123` written as a short-hand for `#112233` will pass — but the
// long-form is the dominant style, and the alternative (false-positive
// every issue reference) is worse.
const HEX_RE = /(^|[^\w&])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const HEX_LETTER_RE = /[a-fA-F]/;

// Color-function literal: rgb()/rgba()/hsl()/hsla() whose first argument is a
// number or percentage — e.g. `rgba(0,0,0,0.08)`, `rgb(0 0 0 / 0.1)`,
// `hsl(160 84% 39%)`. Raw color-function literals sneak past the hex check
// (finding #4: `rgba(0,0,0,0.08)` borders), so they're flagged the same way.
// Requiring a digit/`.` right after `(` deliberately spares token-backed forms
// like `hsl(var(--primary))` — those reference a CSS variable, not a raw
// literal — and non-color CSS functions (translate(), scale(), matrix()) never
// match the rgb/rgba/hsl/hsla names. The match is captured up to the first
// closing paren for the reported literal.
const COLOR_FN_RE = /\b(rgba?|hsla?)\(\s*[\d.][^)\n]*\)?/gi;

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

/** Strip numeric HTML entities (`&#1234;`) from a line so they are not mistaken for hex color literals. */
function stripHtmlEntities(line) {
  return line.replace(HTML_ENTITY_RE, '');
}

/** Find raw hex color literals in a line, filtering out decimal-only 3/4-digit matches (likely issue/order refs). */
function findHexLiterals(line) {
  const cleaned = stripHtmlEntities(line);
  const matches = [];
  let m;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(cleaned)) !== null) {
    const digits = m[2];
    // Filter pure-decimal 3/4-digit matches as likely issue refs (#163,
    // #1284). 6/8-digit forms are accepted unconditionally.
    if (digits.length <= 4 && !HEX_LETTER_RE.test(digits)) continue;
    const literal = `#${digits}`;
    const idx = m.index + m[1].length;
    matches.push({ literal, column: idx + 1 });
  }
  return matches;
}

function findColorFunctions(line) {
  const cleaned = stripHtmlEntities(line);
  const matches = [];
  let m;
  COLOR_FN_RE.lastIndex = 0;
  while ((m = COLOR_FN_RE.exec(cleaned)) !== null) {
    matches.push({ literal: m[0], column: m.index + 1 });
  }
  return matches;
}

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
