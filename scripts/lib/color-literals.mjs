/**
 * color-literals.mjs — the raw-color lexer shared by scripts/check-token-usage.mjs
 * and `genesis doctor` (packages/genesis-cli, which bundles this file at build
 * time). One implementation, so a bypass fixed here is fixed in both gates.
 *
 * Pure functions only: no filesystem, no process state.
 */

// Extensions where `//` opens a genuine line comment (C-style langs, plus the
// CSS supersets SCSS/LESS which DO have `//`). Plain `.css` is deliberately
// absent: CSS has NO `//` line comment, and an unquoted `url(https://cdn/x.svg)`
// contains `//`. Treating that `//` as a comment blanks the rest of the line, so
// a real hex after it (`... color: #ff0000;`) never gets scanned and the gate is
// bypassed. Only files with this extension run the `//` branch in
// stripBlockComments(); `/* ... */` block comments are stripped for ALL types.
export const LINE_COMMENT_EXTS = new Set(['.ts', '.tsx', '.jsx', '.js', '.mjs', '.cjs', '.scss', '.less']);

// Numeric HTML entities (`&#1234;`) are not colors.
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
export function stripBlockComments(content, hasLineComments = true) {
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

/** Strip numeric HTML entities (`&#1234;`) from a line so they are not mistaken for hex color literals. */
function stripHtmlEntities(line) {
  return line.replace(HTML_ENTITY_RE, '');
}

/** Find raw hex color literals in a line, filtering out decimal-only 3/4-digit matches (likely issue/order refs). */
export function findHexLiterals(line) {
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

/** Find raw rgb()/rgba()/hsl()/hsla() literals with numeric arguments in a line (token-backed `hsl(var(--x))` is spared). */
export function findColorFunctions(line) {
  const cleaned = stripHtmlEntities(line);
  const matches = [];
  let m;
  COLOR_FN_RE.lastIndex = 0;
  while ((m = COLOR_FN_RE.exec(cleaned)) !== null) {
    matches.push({ literal: m[0], column: m.index + 1 });
  }
  return matches;
}
