#!/usr/bin/env node
/**
 * check-testid-coverage.mjs
 *
 * PRD-07 Phase D6.2d enforcement guard. Computes the % of interactive
 * native primitives in the scanned app(s) that carry a `testID` prop and
 * fails CI when coverage is below the configured threshold.
 *
 * Why: Maestro flows + accessibility tooling rely on testIDs to find
 * tappable elements. Without them, every new screen forces the test
 * author to ship along test selectors as a separate PR. Treat testID as
 * a first-class API requirement rather than an afterthought.
 *
 * Interactive primitives (heuristic — element name appears as a JSX
 * opening tag):
 *   - Pressable, TouchableOpacity, TouchableHighlight,
 *     TouchableWithoutFeedback, TouchableNativeFeedback
 *   - Button (RN core), NativeButton (Genesis re-export)
 *
 * Coverage = primitives_with_testID / total_primitives.
 *
 * Threshold default: 80%. Override via `genesis.config.yml` → ci.testid-coverage.threshold (0-1 fraction per the schema; legacy 0-100 accepted):
 *
 *   testid-coverage:
 *     threshold: 90
 *
 * Allowlist:
 *   - Files under `**\/tokens/**`, `**\/__fixtures__/**`, `**\/__mocks__/**`.
 *   - `*.test.{ts,tsx,jsx}` — tests are themselves the consumers of testIDs.
 *
 * Output:
 *   - Human report on stdout.
 *   - JSON report at `coverage/testid-coverage.json` for downstream tooling
 *     (D-VR per-component coverage, dashboards).
 *
 * Exit codes:
 *   0 — coverage >= threshold OR no primitives in scope.
 *   1 — coverage < threshold.
 *
 * Usage:
 *   node scripts/check-testid-coverage.mjs                 # scans apps/
 *   node scripts/check-testid-coverage.mjs apps/sample-native
 *   node scripts/check-testid-coverage.mjs --self-test      # run built-in fixture checks, no scan
 *   pnpm check:testid-coverage
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml testid-coverage job.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const toPosix = (p) => p.split(path.sep).join('/');

const SCAN_EXTS = new Set(['.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '.expo']);

const ALLOWLIST_PATTERNS = [
  /(^|\/)tokens\//,
  /\.test\.(ts|tsx|jsx)$/,
  /(^|\/)__fixtures__\//,
  /(^|\/)__mocks__\//,
];

// Names a primitive can use. Bias for inclusion — better to over-count
// than to silently undercount. We'll ignore non-JSX text matches because
// the regex below requires a `<` prefix.
const INTERACTIVE_NAMES = [
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Button',
  'NativeButton',
];

const DEFAULT_THRESHOLD = 80;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

// Read threshold from genesis.config.yml (the DOCUMENTED contract, cm-0027):
//   ci:
//     testid-coverage: { threshold: 0.8 }   # fraction 0-1 per the schema/example
// Back-compat: a legacy top-level `testid-coverage: { threshold: 80 }` (0-100)
// and the legacy .genesis/config.yml location are still honored.
// Parse with the same real YAML loader `validate-genesis-config.mjs` uses so every
// schema-valid shape (block, flow-nested `ci: {testid-coverage: {threshold: 0.95}}`,
// inline) is honored instead of a narrow hand-rolled subset (CMT-150-003).
function readThreshold() {
  let configPath = path.join(REPO_ROOT, 'genesis.config.yml');
  if (!fs.existsSync(configPath)) configPath = path.join(REPO_ROOT, '.genesis/config.yml'); // legacy
  if (!fs.existsSync(configPath)) return DEFAULT_THRESHOLD;

  let config;
  try {
    config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    // Fail loud rather than silently gate on the default (cm-0022 warn-loud).
    console.error(
      `WARN could not parse ${toPosix(path.relative(REPO_ROOT, configPath))}: ${e.message}. ` +
        `Using default threshold ${DEFAULT_THRESHOLD}%.`,
    );
    return DEFAULT_THRESHOLD;
  }
  if (!config || typeof config !== 'object') return DEFAULT_THRESHOLD;

  // documented contract: ci.testid-coverage.threshold; legacy back-compat: top-level.
  const raw = config.ci?.['testid-coverage']?.threshold ?? config['testid-coverage']?.threshold;
  if (raw === undefined || raw === null) return DEFAULT_THRESHOLD;
  return normalizeThreshold(Number(raw));
}

// The documented unit is a 0-1 FRACTION (schema/example: threshold: 0.8); the script
// works in percent internally. Legacy top-level configs used 0-100 — accept both:
// values ≤ 1 are fractions, values > 1 are percents. Reject anything that is not a
// finite 0-100 gate after conversion (CMT-150-004) rather than enabling an impossible one.
function normalizeThreshold(v) {
  if (!Number.isFinite(v)) {
    console.error(`WARN non-numeric testid-coverage threshold. Using default ${DEFAULT_THRESHOLD}%.`);
    return DEFAULT_THRESHOLD;
  }
  const pct = v <= 1 ? v * 100 : v; // fraction → percent; 0-100 passes through
  if (pct < 0 || pct > 100) {
    console.error(
      `WARN testid-coverage threshold ${v} is out of range (want a 0-1 fraction or 0-100 percent). ` +
        `Using default ${DEFAULT_THRESHOLD}%.`,
    );
    return DEFAULT_THRESHOLD;
  }
  return pct;
}

// ---------------------------------------------------------------------
// JSX/JS-aware tag scanning.
//
// Find every JSX opening tag of an interactive primitive and check
// whether its OWN attribute list (not any nested element's) includes
// `testID`.
//
// A regex cannot reliably find the END of a JSX opening tag. Attribute
// values are arbitrary JS expressions — `onClick={(e) => {...}}`,
// `testID={`row-${id}`}` — and those routinely contain a bare, unquoted
// `>` that has nothing to do with the tag boundary: an arrow function
// (`=>`), a `>=` comparison, a nested JSX element's own closing `>`. An
// earlier version of this file used a quote-aware regex —
// `(?:"[^"]*"|'[^']*'|`[^`]*`|[^>])*?` — that correctly skips a `>`
// inside a quoted string (`label="a > b"`), but had no concept of a
// `{...}` JSX expression container, so it stopped dead at the `>` in
// `onClick={(e) => ...}`, truncating the tag before reaching any prop
// written after the handler — `testID` included. That was not
// hypothetical: `apps/dashboard/app/lib/cleanse/map-poc.tsx`'s `<Button>`
// at ~line 290 carries a correct `testID={`map-expand-${n.id}`}` a few
// lines below its `onClick`, but was scored as untagged purely because
// of prop ORDER.
//
// The fix for that (a flat brace/quote-depth stack — `>` only closes the
// tag when nothing is open) is necessary but not sufficient. Three more
// constructs can appear inside a `{...}` attribute value and look like
// brace/quote syntax without being it:
//   - a JS comment (`// ...` / `/* ... */`) whose TEXT happens to contain
//     a `{`, `}`, `'`, or `"` — e.g. `// don't retry` or `/* the {x} case */`.
//   - a regex literal (`/{/`, `/'/`, ...) — same problem: not brace/quote
//     syntax, but its contents can look like it.
//   - nested JSX whose text content contains an apostrophe or backtick
//     (`<span>Don't</span>`, or a short fragment `<>Don't</>`) — JSX text
//     is not a JS string; a bare `'` in it must not start a string, or
//     everything after it (up to the next stray `'`, possibly EOF) is
//     misread as string contents. Short fragments must be recognized as
//     JSX too: `<>` is never a TS generic, and missing that branch lets
//     `</>` be misread as a regex literal (`/` after `>`).
// All three fail the same way: the misread span never returns to "bare"
// depth, the scanner runs off the end of the file, and the tag is
// silently dropped from `total` entirely — worse than being miscounted
// as untagged, since it vanishes from the count altogether. Confirmed
// live: `apps/dashboard/app/components/features/FeedbackPanel.tsx:274-275`
// has a `//` comment inside a `<Button onClick={() => {...}}>` today
// (currently harmless — its text has no brace/quote characters — but one
// word choice away from tripping this).
//
// So this isn't one flat stack of interchangeable frames; it's a small
// set of mutually-recursive scanners, one per syntactic context, each
// given a start position and returning the index just past where that
// context ends (or null if it never ends before EOF):
//   scanStringLiteralEnd — a '...' / "..." string.
//   scanCommentEnd        — a // or /* */ comment (contents fully opaque).
//   scanRegexLiteralEnd   — a /.../ regex literal (contents fully opaque
//                           except its own [...] character class and \-escapes).
//   scanTemplateLiteralEnd — a `...` template literal; `${}` recurses into scanExprEnd.
//   scanExprEnd           — a `{...}` JS expression: aware of all of the
//                           above, nested `{...}`, and nested JSX
//                           (elements and short fragments).
//   scanJsxElementEnd     — one full nested JSX element (open tag, via
//                           scanOpenTag, plus children and closing tag).
//   scanJsxFragmentEnd    — one short fragment (`<>…</>`), children opaque
//                           like an element (quotes literal).
//   scanOpenTag           — a tag's own attribute list, ending at its `>`/`/>`.
//
// Distinguishing "this `/` starts a regex" from "this is division", and
// "this `<Name` starts nested JSX" from "this is a TS generic type
// argument" (`useRef<HTMLButtonElement>(null)`) or a less-than comparison,
// is the same ambiguity a real JS tokenizer resolves via full grammar
// context. Here it's approximated with one signal — `regexAllowed`: true
// at an "expression start" (after an operator, `(`, `{`, `,`, `=>`, the
// start of the expression, or a keyword that introduces an Expression /
// UnaryExpression / Statement — `return`, `typeof`, `void`, …), false
// right after something value-like (an ordinary identifier, `)`, `]`, a
// string/template/regex result). That is enough to tell `useRef<Foo>`
// (a `<` right after an identifier — not allowed) apart from
// `() => <Button />` (a `<` right after `=>` — allowed), and
// `return /{/.test(x)` (a `/` right after `return` — allowed) apart from
// `a / b` (division). A short fragment open (`<>`) needs no heuristic —
// it is never a type argument. It is a heuristic, not a parser, and is
// documented as such rather than claimed to be exact.
// ---------------------------------------------------------------------

// Keywords after which ECMA-262's lexer is in InputElementRegExp (a
// PrimaryExpression / UnaryExpression / Statement can start next). An
// ordinary identifier leaves regexAllowed false; these do not.
const REGEX_PERMITTING_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'else',
  'typeof',
  'void',
  'delete',
  'new',
  'await',
  'yield',
  'in',
  'of',
  'instanceof',
]);

// Scans a single/double-quoted string starting at `pos` (the opening
// quote). Returns the index just past the matching unescaped closing
// quote, or null if it runs off the end of the file first.
function scanStringLiteralEnd(content, pos) {
  const quote = content[pos];
  const n = content.length;
  let i = pos + 1;
  while (i < n) {
    const ch = content[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return null;
}

// Scans a `// ...` or `/* ... */` comment starting at `pos` (its first
// `/`). Returns the index just past it, or null if `pos` isn't actually a
// comment start (caller falls back to treating `/` as an operator).
function scanCommentEnd(content, pos) {
  if (content[pos] !== '/') return null;
  if (content[pos + 1] === '/') {
    const nl = content.indexOf('\n', pos + 2);
    return nl === -1 ? content.length : nl + 1;
  }
  if (content[pos + 1] === '*') {
    const close = content.indexOf('*/', pos + 2);
    return close === -1 ? content.length : close + 2;
  }
  return null;
}

// Scans a regex literal starting at `pos` (the opening `/`; the caller's
// `regexAllowed` heuristic already decided a regex is plausible here).
// Honors a `[...]` character class (where `/` doesn't end the literal)
// and `\`-escapes, then consumes trailing flags. Returns the index just
// past the flags, or null if it hits a raw newline or EOF first (a regex
// literal can't span lines — treat that as "not actually a regex").
function scanRegexLiteralEnd(content, pos) {
  const n = content.length;
  let i = pos + 1;
  let inClass = false;
  while (i < n) {
    const ch = content[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '\n') return null;
    if (inClass) {
      if (ch === ']') inClass = false;
      i += 1;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      i += 1;
      continue;
    }
    if (ch === '/') {
      i += 1;
      while (i < n && /[a-zA-Z]/.test(content[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return null;
}

// Scans a template literal starting at `pos` (the opening backtick).
// `${...}` interpolations recurse into scanExprEnd, so anything valid in
// a JS expression — including nested JSX — is valid inside one. Returns
// the index just past the matching closing backtick, or null.
function scanTemplateLiteralEnd(content, pos) {
  const n = content.length;
  let i = pos + 1;
  while (i < n) {
    const ch = content[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return i + 1;
    if (ch === '$' && content[i + 1] === '{') {
      const end = scanExprEnd(content, i + 2);
      if (end === null) return null;
      i = end;
      continue;
    }
    i += 1;
  }
  return null;
}

const JSX_NAME_CHAR_RE = /[A-Za-z0-9_.:$-]/;

// Consumes a JSX tag name starting at `pos` (its first character).
// Returns the index just past it.
function consumeJsxTagName(content, pos) {
  const n = content.length;
  let i = pos;
  while (i < n && JSX_NAME_CHAR_RE.test(content[i])) i += 1;
  return i;
}

// Scans one complete nested JSX element — its own opening tag (attrs via
// scanOpenTag) plus, if it isn't self-closing, its children and closing
// tag — starting at `pos` (the first character of its tag name, i.e.
// just after the `<`). Returns the index just past the element's end, or
// null if it never closes before EOF.
//
// Closing tags are matched positionally (the next `</...>` at this
// nesting depth), not by name: this is a coverage heuristic scanning
// realistic, presumably-valid TSX, not a full parser, and JSX that
// reaches a build can't have mismatched tag names.
function scanJsxElementEnd(content, pos) {
  const n = content.length;
  const nameEnd = consumeJsxTagName(content, pos);
  const open = scanOpenTag(content, nameEnd);
  if (open === null) return null;
  if (open.selfClosing) return open.closeIndex + 1;

  let i = open.closeIndex + 1;
  while (i < n) {
    const ch = content[i];
    if (ch === '{') {
      const end = scanExprEnd(content, i + 1);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '<') {
      if (content[i + 1] === '/') {
        const gt = content.indexOf('>', i + 2);
        if (gt === -1) return null;
        return gt + 1;
      }
      if (content[i + 1] === '>') {
        // Nested short fragment — enter so its children stay opaque JSX
        // text and so its `</>` is not treated as THIS element's close.
        const end = scanJsxFragmentEnd(content, i + 2);
        if (end === null) return null;
        i = end;
        continue;
      }
      if (/[A-Za-z]/.test(content[i + 1])) {
        const end = scanJsxElementEnd(content, i + 1);
        if (end === null) return null;
        i = end;
        continue;
      }
    }
    i += 1; // opaque JSX text — quotes/braces here are not JS syntax
  }
  return null;
}

// Scans one short JSX fragment (`<>…</>`) starting at `pos` (just AFTER
// the opening `<>`). Children follow the same opaque-text rules as
// scanJsxElementEnd. Returns the index just past `</>`, or null if the
// fragment never closes before EOF.
function scanJsxFragmentEnd(content, pos) {
  const n = content.length;
  let i = pos;
  while (i < n) {
    const ch = content[i];
    if (ch === '{') {
      const end = scanExprEnd(content, i + 1);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '<') {
      if (content[i + 1] === '/' && content[i + 2] === '>') {
        return i + 3;
      }
      if (content[i + 1] === '>') {
        const end = scanJsxFragmentEnd(content, i + 2);
        if (end === null) return null;
        i = end;
        continue;
      }
      if (/[A-Za-z]/.test(content[i + 1])) {
        const end = scanJsxElementEnd(content, i + 1);
        if (end === null) return null;
        i = end;
        continue;
      }
    }
    i += 1; // opaque JSX text — quotes/backticks here are not JS syntax
  }
  return null;
}

// Does the character just consumed leave us at a "value" position (so a
// following `/` means divide and a following `<` means less-than / a
// generic type argument, not a new expression)? Identifiers, digits, `)`,
// and `]` do; everything else (operators, `(`, `{`, `,`, whitespace is
// handled separately) leaves us at an expression-start instead.
function endsExpression(ch) {
  return /[A-Za-z0-9_$)\]]/.test(ch);
}

// Scans a `{...}` JS expression starting at `pos` (just AFTER the opening
// `{`). Aware of strings, template literals, comments, regex literals
// (heuristically distinguished from division via `regexAllowed`), nested
// `{...}`, and nested JSX elements/fragments (the regexAllowed heuristic
// distinguishes a named JSX start from a generic type argument /
// less-than; `<>` needs no heuristic). Returns the index just past the
// matching closing `}`, or null if it never closes before EOF.
function scanExprEnd(content, pos) {
  const n = content.length;
  let i = pos;
  let regexAllowed = true; // true at the start of an expression

  while (i < n) {
    const ch = content[i];

    if (ch === '/') {
      const comment = scanCommentEnd(content, i);
      if (comment !== null) {
        i = comment; // a comment is not a token; regexAllowed is unchanged
        continue;
      }
      if (regexAllowed) {
        const end = scanRegexLiteralEnd(content, i);
        if (end !== null) {
          i = end;
          regexAllowed = false;
          continue;
        }
      }
      i += 1;
      regexAllowed = true; // division operator
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = scanStringLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      regexAllowed = false;
      continue;
    }
    if (ch === '`') {
      const end = scanTemplateLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      regexAllowed = false;
      continue;
    }
    if (ch === '<' && regexAllowed) {
      if (content[i + 1] === '>') {
        const end = scanJsxFragmentEnd(content, i + 2);
        if (end === null) return null;
        i = end;
        regexAllowed = false;
        continue;
      }
      if (/[A-Za-z]/.test(content[i + 1])) {
        const end = scanJsxElementEnd(content, i + 1);
        if (end === null) return null;
        i = end;
        regexAllowed = false;
        continue;
      }
    }
    if (ch === '{') {
      const end = scanExprEnd(content, i + 1);
      if (end === null) return null;
      i = end;
      regexAllowed = false;
      continue;
    }
    if (ch === '}') {
      return i + 1;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue; // whitespace doesn't change regexAllowed
    }
    // Consume a whole identifier so keyword-vs-value can be decided on
    // the word, not on its last letter. `return /{/.test(v)` must keep
    // regexAllowed true; `foo /{/` must not (division / mis-nest).
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(content[j])) j += 1;
      const word = content.slice(i, j);
      i = j;
      regexAllowed = REGEX_PERMITTING_KEYWORDS.has(word);
      continue;
    }
    regexAllowed = !endsExpression(ch);
    i += 1;
  }
  return null;
}

// Scans a balanced `<...>` group starting at `pos` (the opening `<`).
// At bare tag level the only construct this can be is a TypeScript generic
// type argument list on the component itself — `<Button<Option> testID="x">`
// — where the group's own `>` is NOT the opening tag's terminator. Without
// this, the first `>` closes the tag and every attribute after it (testID
// included) becomes invisible, exactly like the arrow-fn `=>` case this
// file's scanner was written for.
//
// Returns the index just past the matching `>`, or null when the group is
// unbalanced (malformed input) so the caller can fall back to treating the
// `<` as ordinary text rather than consuming the rest of the file.
function scanAngleGroupEnd(content, pos) {
  const n = content.length;
  let depth = 0;
  let i = pos;

  while (i < n) {
    const ch = content[i];

    // String/template literal *types* are legal here (`<"a" | "b">`), and a
    // `>` inside one is text, not structure.
    if (ch === '"' || ch === "'") {
      const end = scanStringLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = scanTemplateLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    // A function type argument (`<(a: string) => void>`) contains a `>` that
    // belongs to the arrow, not to the group.
    if (ch === '=' && content[i + 1] === '>') {
      i += 2;
      continue;
    }
    // Any OTHER bare `=` means this is not a type-argument list at all — a
    // usage-site type argument has no assignment (only `extends X = Y`
    // *declarations* do, and those never appear in JSX). Almost certainly
    // an attribute (`testID="x"`) after a malformed/unclosed `<`. Bail so
    // the caller falls back to text, rather than consuming attributes into
    // a phantom generic and dropping the tag from the count entirely.
    if (ch === '=') return null;
    if (ch === '<') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '>') {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return null; // unbalanced: ran off the end of the file
}

// Scans a JSX opening tag's attribute list starting at `pos` (just after
// the tag name). `{...}` attribute values delegate to scanExprEnd, so
// everything it understands — comments, regex literals, nested JSX — is
// understood here too. Only characters seen at bare (non-string,
// non-template, non-expression) level accumulate into `attrs`, so a
// `testID` inside a *nested* element passed as a prop value (e.g.
// `trigger={<Button testID="x" />}`) correctly does not count toward the
// outer tag — it's scored as its own, independent element instead (see
// scanJsxElementEnd / findInteractiveOpenTags).
//
// Returns `{ closeIndex, selfClosing, attrs }`, or null if the tag never
// closes before EOF (unterminated/malformed input).
function scanOpenTag(content, pos) {
  const n = content.length;
  let attrs = '';
  let i = pos;

  while (i < n) {
    const ch = content[i];

    if (ch === '"' || ch === "'") {
      const end = scanStringLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = scanTemplateLiteralEnd(content, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '/') {
      const comment = scanCommentEnd(content, i);
      if (comment !== null) {
        i = comment;
        continue;
      }
      // Not a comment: either the `/` of a self-closing `/>` (handled via
      // attrs.endsWith('/') below) or, defensively, a stray character —
      // either way it's ordinary text at bare tag level.
      attrs += ch;
      i += 1;
      continue;
    }
    if (ch === '{') {
      const end = scanExprEnd(content, i + 1);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (ch === '}') {
      attrs += ch; // stray brace at bare level (malformed input); keep as literal text
      i += 1;
      continue;
    }
    if (ch === '<') {
      const end = scanAngleGroupEnd(content, i);
      if (end !== null) {
        i = end;
        continue;
      }
      // Unbalanced — malformed input. Treat as literal text rather than
      // swallowing the remainder of the file.
      attrs += ch;
      i += 1;
      continue;
    }
    if (ch === '>') {
      const selfClosing = attrs.endsWith('/');
      return {
        closeIndex: i,
        selfClosing,
        attrs: selfClosing ? attrs.slice(0, -1) : attrs,
      };
    }
    attrs += ch;
    i += 1;
  }
  return null; // ran off the end of the file: unterminated/malformed tag
}

const TAG_START_RE = new RegExp(`<(${INTERACTIVE_NAMES.join('|')})\\b`, 'g');

// Returns [{ index, name, attrs }] for every interactive opening tag found
// in `content`. `index` is the offset of the tag's `<` (for line-number
// lookup); `attrs` is the tag's own bare-level attribute text (see
// scanOpenTag above).
//
// Deliberately does NOT fast-forward the search past a tag's closing `>`
// once found: a nested interactive element embedded in this tag's own
// prop expression (`onPress={() => <Button testID="x" />}`) is itself a
// real, independently-renderable interactive primitive, and skipping
// ahead would silently swallow it from the count. Each occurrence of
// `<InteractiveName` — top-level or nested — gets its own independent
// scan for its own closing `>`.
function findInteractiveOpenTags(content) {
  const results = [];
  TAG_START_RE.lastIndex = 0;
  let m;
  while ((m = TAG_START_RE.exec(content)) !== null) {
    const name = m[1];
    const tag = scanOpenTag(content, TAG_START_RE.lastIndex);
    if (tag === null) continue; // unterminated tag; skip just this occurrence
    results.push({ index: m.index, name, attrs: tag.attrs });
  }
  return results;
}

function tagHasTestID(tagAttrs) {
  return /\btestID\s*=/.test(tagAttrs);
}

function lineNumberAtIndex(content, idx) {
  return content.slice(0, idx).split('\n').length;
}

// ---------------------------------------------------------------------
// --self-test: a small, dependency-free fixture check the script can run
// on itself, with no pytest/node-test-runner required. There's no test
// runner wired to scripts/*.mjs directly (no sibling *.test.* files, no
// pnpm -r test package for scripts/), but tests/harness/ does have a
// working convention for regression-testing these check-*.mjs gates —
// see tests/harness/test_check_token_usage.py, which drives
// scripts/check-token-usage.mjs the same way. This script follows that
// convention too: tests/harness/test_check_testid_coverage.py drives this
// file end-to-end via subprocess (the primary regression coverage). This
// --self-test mode is a lighter, complementary in-process check — no
// Python/pytest required, useful while iterating on the scanner itself.
// ---------------------------------------------------------------------
const SELF_TEST_CASES = [
  {
    name: 'arrow-function prop before testID (the reported bug)',
    source: `
      <Button
        onClick={(e) => {
          e.stopPropagation();
          doThing();
        }}
        testID="my-button"
      >
        Click me
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'template-literal interpolation before testID (map-poc.tsx shape)',
    source: `
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        data-testid={\`map-expand-\${n.id}\`}
        testID={\`map-expand-\${n.id}\`}
      >
        Expand
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'nested braces (style object) before testID',
    source: `
      <Button style={{ color: theme.danger, opacity: disabled ? 0.5 : 1 }} testID="z">
        Go
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'quoted string containing a bare > before testID (regression check)',
    source: `<Button aria-label="a > b" testID="y">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'self-closing tag with testID',
    source: `<Pressable testID="x" onPress={() => go()} />`,
    expected: [{ component: 'Pressable', hasTestID: true }],
  },
  {
    name: 'genuinely missing testID despite an arrow-function prop',
    source: `<Button onClick={(e) => handle(e)}>No test id here</Button>`,
    expected: [{ component: 'Button', hasTestID: false }],
  },
  {
    name: 'nested interactive element inside a prop expression scores independently',
    source: `
      <Pressable onPress={() => <Button testID="inner">Y</Button>}>
        Outer text
      </Pressable>
    `,
    expected: [
      { component: 'Pressable', hasTestID: false },
      { component: 'Button', hasTestID: true },
    ],
  },
  {
    name: 'unterminated tag does not throw and is skipped',
    source: `<Button testID="x" onClick={() => {`,
    expected: [],
  },
  // The four cases below close a review finding (Codex, PR #375): the
  // brace/quote-depth stack that fixes the arrow-function case above is
  // not enough on its own. A regex literal, a comment, or nested JSX text
  // can each contain a `{`, `}`, `'`, or `"` that ISN'T brace/quote syntax
  // but was being read as if it were — not just miscounting the tag as
  // untagged (the original bug), but silently dropping it from `total`
  // entirely, since the misread span never returns to bare depth and the
  // scanner runs off the end of the file.
  {
    name: 'regex literal containing a brace does not swallow the rest of the tag',
    source: `<Button disabled={/{/.test(value)} testID="regex-button">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'line comment containing a brace does not swallow the rest of the tag',
    source: `
      <Button
        onClick={() => {
          // a comment with a } brace in it
          doThing();
        }}
        testID="comment-button"
      >
        Click
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'block comment containing a brace and a quote does not swallow the rest of the tag',
    source: `
      <Button
        onClick={() => {
          /* the {value} isn't simple */
          doThing();
        }}
        testID="block-comment-button"
      >
        Click
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'nested JSX text containing an apostrophe does not start a phantom string',
    source: `<Button icon={<span>Don't</span>} testID="x">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'nested JSX text containing a backtick does not start a phantom template literal',
    source: '<Button icon={<span>`raw`</span>} testID="x">Click</Button>',
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'short fragment JSX text with an apostrophe does not drop the outer tag',
    source: `<Button icon={<>Don't</>} testID="x">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'short fragment without quotes still does not misread </> as a regex',
    source: '<Button icon={<>ok</>} testID="x">Click</Button>',
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'named element wrapping a short fragment with apostrophe text stays intact',
    source: `<Button icon={<div><>Don't</></div>} testID="x">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after return keyword containing a brace does not drop the tag',
    source: `<Button onClick={() => { return /{/.test(v); }} testID="ret">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after typeof keyword containing a brace does not drop the tag',
    source: `<Button disabled={typeof /{/.exec === 'function'} testID="typeof">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after instanceof keyword containing a brace does not drop the tag',
    source: `<Button disabled={v instanceof /{/.constructor} testID="io">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after new keyword containing a brace does not drop the tag',
    source: `<Button disabled={new RegExp(/{/.source).test(v)} testID="new">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after await keyword containing a brace does not drop the tag',
    source: `<Button onClick={async () => { await /{/.test(v); }} testID="await">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'regex literal after yield keyword containing a brace does not drop the tag',
    source: `<Button onClick={function* () { yield /{/.source; }} testID="yield">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'a TS generic type argument in an attribute expression is not mistaken for nested JSX',
    source: `<Button ref={useRef<HTMLButtonElement>(null)} testID="c">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    // CMT-375-002: the group's own `>` is not the opening tag's terminator.
    name: 'a generic type argument on the tag itself does not hide later attributes',
    source: `<Button<Option> testID="generic">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'a nested generic type argument on the tag itself is skipped as one balanced group',
    source: `<Button<Record<string, number>> testID="nested-generic">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'a function type in a tag generic does not close the group at its arrow',
    source: `<Button<(a: string) => void> testID="fn-generic">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'an unbalanced angle group is treated as text, not swallowed to EOF',
    source: `<Button<Option testID="unbalanced">Click</Button>`,
    expected: [{ component: 'Button', hasTestID: true }],
  },
  {
    name: 'genuinely missing testID is still flagged even with a comment and a regex present',
    source: `
      <Button
        onClick={() => {
          // just a comment, no brace
          const ok = /^ok$/.test("ok");
        }}
      >
        No test id here
      </Button>
    `,
    expected: [{ component: 'Button', hasTestID: false }],
  },
];

function runSelfTest() {
  let failures = 0;
  for (const testCase of SELF_TEST_CASES) {
    let actual;
    try {
      actual = findInteractiveOpenTags(testCase.source).map((t) => ({
        component: t.name,
        hasTestID: tagHasTestID(t.attrs),
      }));
    } catch (e) {
      failures += 1;
      console.error(`FAIL ${testCase.name}: threw ${e.stack || e}`);
      continue;
    }
    const expectedStr = JSON.stringify(testCase.expected);
    const actualStr = JSON.stringify(actual);
    if (actualStr === expectedStr) {
      console.log(`OK   ${testCase.name}`);
    } else {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(`  expected: ${expectedStr}`);
      console.error(`  actual:   ${actualStr}`);
    }
  }
  console.log();
  if (failures === 0) {
    console.log(`self-test OK: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} passed.`);
    return true;
  }
  console.error(`self-test FAILED: ${failures}/${SELF_TEST_CASES.length} case(s) failed.`);
  return false;
}

const SELF_TEST_FLAG = '--self-test';
const rawArgs = process.argv.slice(2);

if (rawArgs.includes(SELF_TEST_FLAG)) {
  const ok = runSelfTest();
  process.exit(ok ? 0 : 1);
}

const args = rawArgs;
const scanRoots = args.length > 0 ? args.map((a) => path.resolve(REPO_ROOT, a)) : [path.join(REPO_ROOT, 'apps')];

const threshold = readThreshold();

let total = 0;
let covered = 0;
const missing = [];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const rel = toPosix(path.relative(REPO_ROOT, file));
    if (isAllowlisted(rel)) continue;
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const { index, name, attrs } of findInteractiveOpenTags(content)) {
      total += 1;
      if (tagHasTestID(attrs)) {
        covered += 1;
      } else {
        missing.push({ file: rel, line: lineNumberAtIndex(content, index), component: name });
      }
    }
  }
}

const coverage = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;

// Always emit the JSON report so downstream tooling can pick it up even
// when the gate passes.
const reportDir = path.join(REPO_ROOT, 'coverage');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'testid-coverage.json'),
  JSON.stringify({ total, covered, coverage, threshold, missing }, null, 2),
);

console.log(`testID coverage: ${coverage}% (${covered}/${total}, threshold ${threshold}%)`);

if (total === 0) {
  console.log('NOTE No interactive primitives found in the scanned tree.');
  process.exit(0);
}

if (coverage < threshold) {
  console.error(`FAIL testID coverage ${coverage}% below threshold ${threshold}%.`);
  console.error();
  console.error('Missing testID on:');
  for (const m of missing.slice(0, 20)) {
    console.error(`  ${m.file}:${m.line}: <${m.component}> needs testID`);
  }
  if (missing.length > 20) {
    console.error(`  ... and ${missing.length - 20} more.`);
  }
  console.error();
  console.error('Add `testID="..."` to each interactive primitive so Maestro');
  console.error('flows and accessibility tooling can address them. Override the');
  console.error('threshold via genesis.config.yml ci.testid-coverage.threshold (0-1 fraction).');
  process.exit(1);
}

console.log(`OK testID coverage ${coverage}% meets threshold.`);
process.exit(0);
