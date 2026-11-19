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
 * - `data/access-rule-tests`: a database function a resource declares (`writes`, `actions`, a
 *   `source: { rpc }`) with no access-rule test: no `accessRules({ fn: "<name>", … })` in any test
 *   file. The function holds who may call it, so a test proves who is allowed and who is refused.
 *
 * Tests, migrations and Edge Functions (`supabase/`) aren't checked for table writes: a test sets
 * up its rows, and the database's own code is the database's.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { lineAt } from "./scan.js";
import { blankStrings } from "./source.js";
import type { DoctorContext } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", "coverage", ".expo"]);
const TEST_FILE = /(^|\/)(__tests__\/|[^/]+\.(test|spec)\.[cm]?[jt]sx?$)/;
const DOCS = "docs/DATA-ACCESS.md";

/** A table write chained on `.from("…")` (or `.schema("…").from("…")`): the table and the verb. */
const TABLE_WRITE = /\.from\(\s*(["'`])([\w.]+)\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;

/** The text of the balanced `{…}` or `(…)` that opens at `start`, or "" when it doesn't close. */
export function balanced(code: string, start: number): string {
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

/** A declared database function: its name and where it's declared. */
export interface DeclaredFunction {
  readonly fn: string;
  readonly file: string;
  readonly line: number;
}

/**
 * The function names a block of a resource's config declares: a `keys: "name"` pair directly in
 * the block (`create: "x"`, an action's `archive: "x"`, `rpc: "x"`), and `fn: "x"` one level down
 * (`create: { fn: "x", args }`). Strings deeper in (an `args` object's values) are arguments, not
 * function names.
 */
function namesIn(block: string, keys: RegExp): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  const blank = blankStrings(block);
  const depthAt = (index: number) => {
    let depth = 0;
    for (let i = 0; i < index; i++) {
      const ch = blank[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    return depth;
  };
  const pair = /(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:\s*(["'`])([A-Za-z_][\w.]*)\2/g;
  for (const m of block.matchAll(pair)) {
    const at = m.index ?? 0;
    if (blank[at + m[0].indexOf(m[1]!)] === " ") continue;
    const depth = depthAt(at + m[0].indexOf(m[1]!));
    const key = m[1]!;
    const direct = depth === 1 && new RegExp(`^(?:${keys.source})$`).test(key);
    const nested = depth === 2 && key === "fn";
    if (direct || nested) out.push({ name: m[3]!, at });
  }
  return out;
}

/**
 * Every database function the app's resources declare: the names under `writes: {…}` and
 * `actions: {…}`, and a `source: { rpc: "…" }`.
 */
export function declaredFunctions(files: DoctorContext["files"]): DeclaredFunction[] {
  const out: DeclaredFunction[] = [];
  for (const file of files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    const blank = blankStrings(file.code);
    for (const m of blank.matchAll(/\b(writes|actions|source)\s*:\s*\{/g)) {
      const open = (m.index ?? 0) + m[0].length - 1;
      const block = balanced(file.code, open);
      if (!block) continue;
      const keys = m[1] === "writes" ? /create|update|delete/ : m[1] === "source" ? /rpc/ : /[A-Za-z_$][\w$]*/;
      for (const { name, at } of namesIn(block, keys)) {
        out.push({ fn: name, file: file.path, line: lineAt(file.code, open + at) });
      }
    }
  }
  return out;
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

/** The functions some test file gives an access-rule test: each `accessRules({ fn: "…" })`. */
export function testedFunctions(root: string): Set<string> {
  const out = new Set<string>();
  for (const abs of testFiles(root)) {
    let code: string;
    try {
      code = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!code.includes("accessRules")) continue;
    const blank = blankStrings(code);
    for (const m of blank.matchAll(/\baccessRules\s*(?:<[^>]*>)?\s*\(/g)) {
      const call = balanced(code, (m.index ?? 0) + m[0].length - 1);
      // The spec is the call's first argument: `fn` directly in it.
      const spec = call.indexOf("{");
      if (spec < 0) continue;
      for (const { name } of namesIn(balanced(call, spec), /fn/)) out.add(name);
    }
  }
  return out;
}

export function checkDataAccess(ctx: DoctorContext): void {
  // ── data/declared-access ─────────────────────────────────────────
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    const blank = blankStrings(file.code);
    for (const m of blank.matchAll(/\bcreateSupabaseProvider\s*\(/g)) {
      const call = balanced(file.code, (m.index ?? 0) + m[0].length - 1);
      if (/\baccess\s*:\s*(["'`])declared\1/.test(call)) continue;
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
  const declared = declaredFunctions(ctx.files);
  if (declared.length === 0) return;
  const tested = testedFunctions(ctx.root);
  const reported = new Set<string>();
  for (const d of declared) {
    if (tested.has(d.fn) || reported.has(d.fn)) continue;
    reported.add(d.fn);
    ctx.report({
      rule: "data/access-rule-tests",
      level: "warn",
      file: d.file,
      line: d.line,
      subject: d.fn,
      message:
        `${d.fn} has no access-rule test. Add accessRules({ fn: "${d.fn}", allowed, refused, … }) ` +
        `(@marktiderman/genesis-core/testing) to a test file: who may call it, and who is refused (${DOCS})`,
    });
  }
}
