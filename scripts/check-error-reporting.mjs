#!/usr/bin/env node
/**
 * check-error-reporting.mjs
 *
 * Fails CI when a package's source handles an error in a way nobody will
 * ever see:
 *
 *   1. `console.error(` / `console.warn(` in package code. A caught error
 *      goes through `reportError(error, "package:part")` from
 *      `@marktiderman/genesis-core/errors`, so the host app's reporter (the
 *      native observability block → Sentry) gets it; with no reporter it is
 *      still written to the console in development.
 *   2. An empty `catch {}`. Say why it is safe to ignore, in a comment
 *      inside the block, or report it.
 *
 * A console call that is right where it is (a CLI's output, a development
 * set-up hint, the reporting seam's own fallback) carries a marker comment
 * on its line or within the three lines above:
 *
 *   // genesis-allow-console: <why the console is the right place>
 *
 * Code that predates this rule is listed in ALLOW below, by path, with the
 * most console calls each file may keep. Lower a count (or remove the
 * entry) when you move a call to `reportError`; an entry whose file no
 * longer has any is an error, so the list only shrinks.
 *
 * Scanned: packages/*\/src, without tests, fixtures, mocks and test utils.
 *
 * Usage:
 *   node scripts/check-error-reporting.mjs
 *   pnpm check:error-reporting
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const toPosix = (p) => p.split(path.sep).join('/');
const SCAN_EXTS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', '__fixtures__', '__mocks__', 'test-utils', 'coverage']);
const SKIP_FILE = /\.generated\.[cm]?[jt]sx?$|\.(test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;

const CONSOLE = /\bconsole\.(error|warn)\s*\(/g;
const EMPTY_CATCH = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const MARKER = /genesis-allow-console:\s*\S/;

/**
 * Existing code, by path prefix (a directory ends in "/"). `max` caps how
 * many console calls a single file may keep; a prefix entry without `max`
 * allows any number (tools whose output is the console).
 */
export const ALLOW = [
  // Command-line tools and server code: the console (stdout / the server log) is their output.
  { path: 'packages/genesis-cli/src/', reason: 'command-line tool: the console is its output' },
  { path: 'packages/product/src/cli.ts', reason: 'command-line tool: the console is its output' },
  { path: 'packages/product/src/node.ts', reason: 'Node-only tooling: the console is its output' },
  { path: 'packages/chat/src/server/', reason: 'server code: the default log goes to the server log' },
  { path: 'packages/supabase/src/jobs.ts', reason: 'server code (edge functions): the default log goes to the function log' },
  { path: 'packages/supabase/src/web-handoff-server.ts', reason: 'server code: logs to the server log' },
  { path: 'packages/supabase/src/web-crypto.ts', reason: 'server code: logs to the server log' },
  { path: 'packages/sites/src/web/handler.ts', reason: 'server code (the site request handler): logs to the server log' },
  { path: 'packages/sites/src/web/document.tsx', reason: 'server rendering: a section left out is logged to the server log' },
  { path: 'packages/sites/src/supabase/index.ts', reason: 'server code: a release or post that does not parse is logged to the server log' },
  { path: 'packages/sites/src/core/store.ts', reason: 'server code: a cache purge that failed is logged to the server log' },
  { path: 'packages/sites/src/core/schemas.ts', reason: 'the default of the `report` option, the server log' },
  { path: 'packages/sites/src/import/index.ts', reason: 'server code: a refused import is logged to the server log' },
  { path: 'packages/sites/src/sections/', reason: 'server rendering: a refused link or form is logged to the server log' },
  { path: 'packages/sites/src/islands/', reason: 'a published site page in the visitor\'s browser: no app reporter exists there' },

  // The default of an option the host replaces (`log`, `onError`, `onChatUnavailable`).
  { path: 'packages/forms/src/drafts.ts', max: 1, reason: 'the default of the `onError` option' },
  { path: 'packages/forms/src/outbox.ts', max: 1, reason: 'the default of the `log` option' },
  { path: 'packages/forms/src/upload-handler.ts', max: 1, reason: 'the default of the `log` option (server)' },
  { path: 'packages/forms/src/edit-link.ts', max: 1, reason: 'the default of the `log` option (server)' },
  { path: 'packages/forms/src/rate-limit.ts', max: 1, reason: 'the default of the `log` option (server)' },
  { path: 'packages/forms/src/submit.ts', max: 1, reason: 'the default of the `log` option (server)' },
  { path: 'packages/forms-react/src/drafts.ts', max: 1, reason: 'the default of the `onError` option' },
  { path: 'packages/support/src/client.ts', max: 1, reason: 'the default of the `onChatUnavailable` option' },

  // Development set-up hints: a mistake in how the package is wired, not an error at run time.
  { path: 'packages/core/src/provider/context.tsx', max: 1, reason: 'development hint: both `provider` and `mock` passed' },
  { path: 'packages/core/src/resource-view/workspace.ts', max: 1, reason: 'development hint: an unknown readiness tone' },
  { path: 'packages/design-system/src/theme/provider.native.tsx', max: 1, reason: 'development hint: theme set-up' },
  { path: 'packages/design-system/src/theme/provider.web.tsx', max: 1, reason: 'development hint: theme set-up' },
  { path: 'packages/design-system/src/presets/nativewind.ts', max: 1, reason: 'build-time hint: a listed package is not installed' },
  { path: 'packages/ui-native/src/components/icon.tsx', max: 1, reason: 'development hint: an unknown icon name' },
  { path: 'packages/ui-native/src/components/sheet.tsx', max: 1, reason: 'development hint: sheet set-up' },
  { path: 'packages/ui-native/src/components/glass-surface.tsx', max: 1, reason: 'development hint: glass set-up' },
  { path: 'packages/ui-native/src/layouts/auth-screen.tsx', max: 1, reason: 'development hint: auth screen set-up' },
  { path: 'packages/ui/src/components/data/use-resource-table.ts', max: 2, reason: 'development hints: table set-up' },
  { path: 'packages/chat/src/web/emoji-picker.tsx', max: 1, reason: 'development hint: `emojibaseUrl` missing' },
  { path: 'packages/sites/src/editor/fields.ts', max: 1, reason: 'development hint: a section prop with no editor field' },
  { path: 'packages/data-switchboard/src/resolver.ts', max: 1, reason: 'development hint: resolver set-up' },

  // Caught errors still written to the console on the web, where hosts register no reporter yet.
  // Move each to `reportError` once web apps register one (a web observability block).
  { path: 'packages/core/src/hooks/mutation-mode.ts', max: 2, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/hooks/related-keys.ts', max: 1, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/hooks/use-live.ts', max: 3, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/hooks/use-resource-form.ts', max: 5, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/hooks/use-resource.ts', max: 1, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/hooks/use-write.ts', max: 1, reason: 'web and native hook: move to reportError' },
  { path: 'packages/core/src/provider/supabase-provider.ts', max: 4, reason: 'web and native provider: move to reportError' },
  { path: 'packages/core/src/storage/adapters.ts', max: 3, reason: 'web storage adapter: move to reportError' },
  { path: 'packages/data-switchboard/src/data-provider.ts', max: 1, reason: 'web data provider: move to reportError' },
  { path: 'packages/data-switchboard/src/adapters/airtable.ts', max: 1, reason: 'server adapter: move to reportError' },
  { path: 'packages/data-switchboard/src/adapters/notion.ts', max: 1, reason: 'server adapter: move to reportError' },
  { path: 'packages/forms-react/src/outbox.ts', max: 1, reason: 'web and native hook (no genesis-core dependency yet): move to reportError' },
  { path: 'packages/chat/src/web/attachments.tsx', max: 1, reason: 'web UI: move to reportError' },
  { path: 'packages/chat/src/web/cards.tsx', max: 1, reason: 'web UI: move to reportError' },
  { path: 'packages/ui/src/components/data/RelationField.tsx', max: 1, reason: 'web UI: move to reportError' },
  { path: 'packages/ui-native/src/data/NativeResourcePage.tsx', max: 1, reason: 'native UI: move to reportError' },
  { path: 'packages/sites/src/editor/asset-picker.tsx', max: 1, reason: 'web editor: move to reportError' },
  { path: 'packages/sites/src/editor/config.tsx', max: 1, reason: 'web editor: move to reportError' },
  { path: 'packages/sites/src/editor/site-editor.tsx', max: 4, reason: 'web editor: move to reportError' },
];

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** True when the line is inside a comment: a `//` before the match, or a `*` / `/*` line. */
function inComment(lineText, column) {
  const trimmed = lineText.trimStart();
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return true;
  const slashes = lineText.indexOf('//');
  return slashes !== -1 && slashes < column && !/['"`]/.test(lineText.slice(0, slashes).replace(/(['"`]).*?\1/g, ''));
}

/**
 * Every console call and empty catch in one file's text, with the console
 * calls that carry a marker set aside.
 * @returns {{ console: {line: number, text: string}[], marked: number, emptyCatch: {line: number, text: string}[] }}
 */
export function scanSource(text) {
  const lines = text.split('\n');
  const out = { console: [], marked: 0, emptyCatch: [] };
  for (const m of text.matchAll(CONSOLE)) {
    const line = lineOf(text, m.index);
    const lineText = lines[line - 1] ?? '';
    const column = m.index - (text.lastIndexOf('\n', m.index - 1) + 1);
    if (inComment(lineText, column)) continue;
    const window = lines.slice(Math.max(0, line - 4), line).join('\n');
    if (MARKER.test(window)) out.marked++;
    else out.console.push({ line, text: lineText.trim() });
  }
  for (const m of text.matchAll(EMPTY_CATCH)) {
    const line = lineOf(text, m.index);
    out.emptyCatch.push({ line, text: (lines[line - 1] ?? '').trim() });
  }
  return out;
}

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // A package without a src directory has nothing to scan.
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (SCAN_EXTS.has(path.extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

function allowFor(rel, allow) {
  return allow.find((a) => (a.path.endsWith('/') ? rel.startsWith(a.path) : rel === a.path));
}

/**
 * Scan every package. `allow` defaults to ALLOW.
 * @returns {{ problems: string[], scanned: number }}
 */
export function checkRepo(root = REPO_ROOT, allow = ALLOW) {
  const problems = [];
  const counts = new Map(allow.map((a) => [a, 0]));
  let scanned = 0;
  const packages = path.join(root, 'packages');
  for (const pkg of fs.existsSync(packages) ? fs.readdirSync(packages) : []) {
    for (const file of walk(path.join(packages, pkg, 'src'))) {
      scanned++;
      const rel = toPosix(path.relative(root, file));
      const found = scanSource(fs.readFileSync(file, 'utf8'));
      for (const hit of found.emptyCatch) {
        problems.push(`${rel}:${hit.line}: empty catch block. Say in a comment inside it why the error is safe to ignore, or report it with reportError. (${hit.text})`);
      }
      if (found.console.length === 0) continue;
      const entry = allowFor(rel, allow);
      if (entry) {
        counts.set(entry, (counts.get(entry) ?? 0) + found.console.length);
        if (entry.max !== undefined && found.console.length > entry.max) {
          problems.push(
            `${rel}: ${found.console.length} console.error/warn calls; the allow list keeps at most ${entry.max}. Use reportError from @marktiderman/genesis-core/errors for the new one.`,
          );
        }
        continue;
      }
      for (const hit of found.console) {
        problems.push(
          `${rel}:${hit.line}: console.error/warn in package code. Report a caught error with reportError(error, "package:part") from @marktiderman/genesis-core/errors, or mark a deliberate console call with "// genesis-allow-console: <reason>". (${hit.text})`,
        );
      }
    }
  }
  for (const [entry, count] of counts) {
    if (count === 0) problems.push(`scripts/check-error-reporting.mjs: the allow-list entry "${entry.path}" matches no console call any more; remove it.`);
  }
  return { problems, scanned };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const { problems, scanned } = checkRepo();
  if (problems.length > 0) {
    console.error(`check-error-reporting: ${problems.length} problem(s) in ${scanned} files:\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check-error-reporting: OK (${scanned} files).`);
}
