/**
 * Rules for how an app reaches its database (docs/DATA-ACCESS.md). Both warn.
 *
 * - `data/declared-access`: the app touches tables undeclared.
 *   - A `createSupabaseProvider(…)` call without `access: "declared"`: its resources may then read
 *     and write their tables with nothing saying so. Declared, every resource names its read (a
 *     view or a function, `source`) and its writes (named functions, `writes`), or opts in to its
 *     table (`table: { …, why }`), and anything else is refused at run time.
 *   - A table write in app code (`.from("t").insert/update/upsert/delete(…)`): writes go through
 *     a named database function, which holds the access rule. A write that must stay on the table
 *     is recorded as an exception: an `allow` entry for this rule, with its reason.
 * - `data/access-rule-tests`: the app configures the Supabase provider and no test file calls
 *   `expectAccessRulesCover` (`@marktiderman/genesis-core/testing`). That test reads the
 *   provider's own options and fails for each declared function (`writes`, `actions`, a
 *   `source: { rpc }`) without an `accessRules` test, so which functions are covered is decided
 *   at run time from the configuration, never guessed from the source text here.
 *
 * A provider's options are read where the call writes them, or from an object set in the same
 * file that the call names (`createSupabaseProvider(client, options)`), unless the file sets it
 * again or changes its `access`. Only the options object's own `access` counts.
 *
 * Tests, migrations and Edge Functions (`supabase/`) aren't checked for table writes: a test sets
 * up its rows, and the database's own code is the database's.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { stripBlockComments } from "../../../../scripts/lib/color-literals.mjs";
import { lineAt } from "./scan.js";
import { blankStrings } from "./source.js";
import type { DoctorContext } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", "coverage", ".expo"]);
const TEST_FILE = /(^|\/)(__tests__\/|[^/]+\.(test|spec)\.[cm]?[jt]sx?$)/;
const DOCS = "docs/DATA-ACCESS.md";

/** A table write chained on `.from("…")` (or `.schema("…").from("…")`): the table and the verb. */
const TABLE_WRITE = /\.from\(\s*(["'`])([\w.]+)\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;

/** `.from(` right after Supabase Storage (`supabase.storage.from("bucket")`): a bucket, not a table. */
const STORAGE_BEFORE = /\bstorage\s*\??\.?\s*$/;

/** The text of the balanced `{…}`, `(…)` or `[…]` that opens at `start`, or "" when it doesn't close. */
function balanced(code: string, start: number): string {
  const open = code[start];
  const close = open === "{" ? "}" : open === "(" ? ")" : open === "[" ? "]" : "";
  if (!close) return "";
  const blank = blankStrings(code);
  let depth = 0;
  for (let i = start; i < blank.length; i++) {
    const ch = blank[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return ch === close ? code.slice(start, i + 1) : "";
    }
  }
  return "";
}

/** The test files under the app (the doctor's own scan leaves tests out). */
function testFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(path.join(dir, entry.name));
        continue;
      }
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (SCRIPT_EXTS.has(path.extname(entry.name)) && TEST_FILE.test(rel)) out.push(abs);
    }
  };
  walk(root);
  return out;
}

/**
 * The string values of `key: "…"` written at bracket depth `depth` in `text` (1 is directly inside
 * the outer `{…}`, `(…)` or `[…]`), so a key in an object nested deeper is not one.
 */
function valuesAt(text: string, key: string, depth: number): string[] {
  const blank = blankStrings(text);
  const out: string[] = [];
  const pair = new RegExp(`(?:^|[\\s{,(])${key}\\s*:\\s*(["'\`])([A-Za-z_][\\w.]*)\\1`, "g");
  for (const m of text.matchAll(pair)) {
    const at = (m.index ?? 0) + m[0].indexOf(key);
    if (blank[at] !== key[0]) continue;
    let d = 0;
    for (let i = 0; i < at; i++) {
      const ch = blank[i];
      if (ch === "{" || ch === "(" || ch === "[") d++;
      else if (ch === "}" || ch === ")" || ch === "]") d--;
    }
    if (d === depth) out.push(m[2]!);
  }
  return out;
}

/** The object `{…}` a `const`/`let`/`var` named `name` is set to in the file, or null. */
function initializer(code: string, blank: string, name: string): { text: string; keyword: string; at: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decl = new RegExp(`\\b(const|let|var)\\s+${escaped}(?![\\w$])[^=;]*=\\s*\\{`).exec(blank);
  if (!decl) return null;
  const text = balanced(code, decl.index + decl[0].length - 1);
  return text ? { text, keyword: decl[1]!, at: decl.index } : null;
}

/** Whether the object `{…}` says `access: "declared"` itself, not in an object nested in it. */
const objectDeclares = (object: string) => valuesAt(object, "access", 1).includes("declared");

/** Whether a `createSupabaseProvider(…)` call's options object, written in the call, says `access: "declared"`. */
function inlineDeclares(call: string): boolean {
  const blank = blankStrings(call);
  let depth = 0;
  for (let i = 0; i < blank.length; i++) {
    const ch = blank[i];
    if (ch === "{" && depth === 1 && objectDeclares(balanced(call, i))) return true;
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
  }
  return false;
}

/**
 * Whether a `createSupabaseProvider(client, options)` call names an object set in this file that
 * says `access: "declared"`, and nothing in the file sets it again or changes its `access`.
 */
function optionsConstDeclares(code: string, blank: string, call: string): boolean {
  const args = blankStrings(call).slice(1, -1);
  for (const [, name] of args.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=,|$)/g)) {
    const found = initializer(code, blank, name!);
    if (!found || !objectDeclares(found.text)) continue;
    const escaped = name!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Set again (a `let` or `var`), its `access` changed, or merged into: what the call gets is no longer known.
    const reassigned = found.keyword !== "const" && new RegExp(`(?<![\\w$.])${escaped}\\s*=(?!=)`, "g").test(blank.slice(found.at + found.keyword.length + 1 + name!.length));
    const changed = new RegExp(
      `(?<![\\w$.])${escaped}\\s*(?:\\.\\s*access|\\[[^\\]]*\\])\\s*=(?!=)` +
        `|\\bdelete\\s+${escaped}\\s*(?:\\.\\s*access|\\[)` +
        `|Object\\.assign\\(\\s*${escaped}(?![\\w$])`,
    ).test(blank);
    if (!reassigned && !changed) return true;
  }
  return false;
}

/** Whether some test file under the app calls `expectAccessRulesCover(…)` (comments left out). */
function coverageTested(root: string): boolean {
  for (const abs of testFiles(root)) {
    let code: string;
    try {
      code = stripBlockComments(readFileSync(abs, "utf8"), true);
    } catch {
      continue;
    }
    if (!code.includes("expectAccessRulesCover")) continue;
    if (/\bexpectAccessRulesCover\s*\(/.test(blankStrings(code))) return true;
  }
  return false;
}

export function checkDataAccess(ctx: DoctorContext): void {
  // ── data/declared-access ─────────────────────────────────────────
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    const blank = blankStrings(file.code);
    for (const m of blank.matchAll(/\bcreateSupabaseProvider\s*\(/g)) {
      const call = balanced(file.code, (m.index ?? 0) + m[0].length - 1);
      if (inlineDeclares(call) || optionsConstDeclares(file.code, blank, call)) continue;
      ctx.report({
        rule: "data/declared-access",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index ?? 0),
        subject: "createSupabaseProvider",
        message:
          `leaves its resources free to read and write their tables undeclared. Pass access: "declared", give each resource ` +
          `its read (source: a view or a function) and its writes (writes: named database functions), and opt a table in ` +
          `only with table: { …, why } (${DOCS})`,
      });
    }
    if (file.path.startsWith("supabase/") || file.path.includes("/supabase/functions/")) continue;
    // Strings blanked except the table name the pattern reads: match on the real code, keep calls outside comments.
    for (const m of file.code.matchAll(TABLE_WRITE)) {
      const at = m.index ?? 0;
      if (blank[at] !== ".") continue;
      if (STORAGE_BEFORE.test(blank.slice(Math.max(0, at - 40), at))) continue;
      ctx.report({
        rule: "data/declared-access",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, at),
        subject: `${m[2]}.${m[3]}`,
        message:
          `writes the ${m[2]} table directly (${m[3]}). Write through a named database function (the resource's ` +
          `writes, or a call to it), which holds the access rule; a write that must stay on the table is an allow entry ` +
          `for data/declared-access with its reason (${DOCS})`,
      });
    }
  }

  // ── data/access-rule-tests ───────────────────────────────────────
  const providers = providerCalls(ctx.files);
  if (providers.length === 0 || coverageTested(ctx.root)) return;
  const first = providers[0]!;
  ctx.report({
    rule: "data/access-rule-tests",
    level: "warn",
    file: first.file,
    line: first.line,
    subject: "expectAccessRulesCover",
    message:
      `no test checks that every database function the provider declares has an access-rule test. Add ` +
      `expectAccessRulesCover(providerOptions, [/* each accessRules spec */]) (@marktiderman/genesis-core/testing) ` +
      `to a test file: it fails for each declared function without one (${DOCS})`,
  });
}

/** Each `createSupabaseProvider(…)` call in the app's code. */
function providerCalls(files: DoctorContext["files"]): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const file of files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    for (const m of blankStrings(file.code).matchAll(/\bcreateSupabaseProvider\s*\(/g)) {
      out.push({ file: file.path, line: lineAt(file.code, m.index ?? 0) });
    }
  }
  return out;
}
