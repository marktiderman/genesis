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
 *   `source: { rpc }`) with no access-rule test: no `accessRules` call in a test file given
 *   `fn: "<name>"`, written in the call or in a spec it names (directly, spread, or through a
 *   `for (… of specs)` loop over a list set in the same file). The function holds who may call
 *   it, so a test proves who is allowed and who is refused. Resources are read from files that
 *   configure the Supabase provider (they name `createSupabaseProvider`, `SupabaseResourceConfig`
 *   or `SupabaseProviderOptions`), so another `actions: {…}` (a labels object) is not taken for one.
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

/** A file that configures the Supabase provider's resources. */
const PROVIDER_CONFIG = /\b(createSupabaseProvider|SupabaseResourceConfig|SupabaseProviderOptions)\b/;

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
 * The opening brace of each object literal the file gives the type `type`:
 * - annotated: `const x: Type = {…}` (or `Record<string, Type>`, any type naming it);
 * - checked: `const x = {…} satisfies …Type…`, and `export default {…} satisfies …Type…`;
 * - returned by a function annotated to return it (`Promise<Type>` too): `(): Type => ({…})`,
 *   `(): Type => { return {…} }`, or `function f(): Type { … return {…} }`. Only the function's
 *   own `return`s count, not one in a function nested in it (a `.map` callback, say).
 */
function typedObjects(code: string, blank: string, type: string): number[] {
  const out: number[] = [];
  const t = `\\b${type}\\b`;
  for (const m of blank.matchAll(new RegExp(`${t}[^=;{()]*=\\s*\\{`, "g"))) out.push((m.index ?? 0) + m[0].length - 1);
  for (const m of blank.matchAll(/(?:\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\bexport\s+default)\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const block = balanced(code, open);
    if (block && new RegExp(`^\\s*satisfies\\b[^;]*${t}`).test(blank.slice(open + block.length))) out.push(open);
  }
  // The return type: anything up to the body that names the type and has no `=`, `;`, `{` or
  // parenthesis (so `Promise<Type>` and `Record<string, Type>` count), then `=> ({`, `=> {` or `{`.
  const returns = `\\)\\s*:\\s*[^=;{()]*${t}[^=;{()]*`;
  for (const m of blank.matchAll(new RegExp(`${returns}=>\\s*\\(\\s*\\{`, "g"))) out.push((m.index ?? 0) + m[0].length - 1);
  for (const m of blank.matchAll(new RegExp(`${returns}(?:=>\\s*)?\\{`, "g"))) {
    const bodyOpen = (m.index ?? 0) + m[0].length - 1;
    for (const at of ownReturns(code, bodyOpen)) out.push(at);
  }
  return out;
}

/**
 * The opening brace of each `return {…}` a function body (its `{` at `bodyOpen`) makes itself: in
 * its own blocks (`if (…) { return {…} }`), not in a function nested in it (an arrow, a
 * `function`, a method) or inside a call's parentheses.
 */
function ownReturns(code: string, bodyOpen: number): number[] {
  const body = balanced(code, bodyOpen);
  const blank = blankStrings(body);
  const out: number[] = [];
  // Per open bracket: whether it is a nested function's body, or a ( or [ (an expression).
  const stack: ("block" | "nested")[] = [];
  const BLOCK_KEYWORDS = /\b(?:if|for|while|switch|catch|with)\s*$/;
  for (let i = 0; i < blank.length; i++) {
    const ch = blank[i]!;
    if (ch === "{") {
      if (i === 0) {
        stack.push("block");
        continue;
      }
      const before = blank.slice(0, i).trimEnd();
      let nested = stack.includes("nested") || before.endsWith("=>");
      if (!nested && before.endsWith(")")) {
        // The `(` that closes here: a block statement's condition, or a function's parameters.
        let depth = 0;
        let j = before.length - 1;
        for (; j >= 0; j--) {
          if (blank[j] === ")") depth++;
          else if (blank[j] === "(" && --depth === 0) break;
        }
        nested = !BLOCK_KEYWORDS.test(blank.slice(0, j));
      }
      stack.push(nested ? "nested" : "block");
    } else if (ch === "(" || ch === "[") stack.push("nested");
    else if (ch === "}" || ch === ")" || ch === "]") stack.pop();
    else if (ch === "r" && !stack.includes("nested") && /^return\s*\{/.test(blank.slice(i)) && !/[\w$]/.test(blank[i - 1] ?? " ")) {
      const r = /^return\s*\{/.exec(blank.slice(i))!;
      out.push(bodyOpen + i + r[0].length - 1);
    }
  }
  return out;
}

/**
 * The provider's options objects in the file (each one's opening brace): written in a
 * `createSupabaseProvider(…)` call, set to a name the call passes, or typed `SupabaseProviderOptions`
 * (annotated, or with `satisfies`).
 */
function providerOptions(code: string, blank: string): number[] {
  const out: number[] = [];
  for (const m of blank.matchAll(/\bcreateSupabaseProvider\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const call = balanced(code, open);
    const callBlank = blankStrings(call);
    let depth = 0;
    for (let i = 0; i < callBlank.length; i++) {
      const ch = callBlank[i];
      if (ch === "{" && depth === 1) out.push(open + i);
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    for (const [, name] of callBlank.slice(1, -1).matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=,|$)/g)) {
      const found = initializer(code, blank, name!);
      if (found?.text.startsWith("{")) out.push(found.open);
    }
  }
  out.push(...typedObjects(code, blank, "SupabaseProviderOptions"));
  return out;
}

/**
 * Where the file configures resources:
 * - the `resources` of a provider options object (`providerOptions`): written there, or the object
 *   set in the same file that `resources: name` or a shorthand `{ resources }` names;
 * - each object typed `SupabaseResourceConfig` (one resource, or a map of them), annotated
 *   (`const r: Record<string, SupabaseResourceConfig> = {…}`) or with `satisfies`.
 * Any other `resources` or `actions` object (labels, say) is not resource configuration.
 */
function resourceConfigRanges(code: string, blank: string): [number, number][] {
  const out: [number, number][] = [];
  const add = (open: number) => {
    const block = balanced(code, open);
    if (block) out.push([open, open + block.length]);
  };
  for (const open of providerOptions(code, blank)) {
    const object = balanced(code, open);
    const objectBlank = blankStrings(object);
    let depth = 0;
    for (let i = 0; i < objectBlank.length; i++) {
      const ch = objectBlank[i];
      if (depth === 1 && /[\s{,]/.test(objectBlank[i - 1] ?? " ") && objectBlank.startsWith("resources", i)) {
        const rest = objectBlank.slice(i + "resources".length);
        const literal = /^\s*:\s*\{/.exec(rest);
        const named = /^\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(rest);
        if (literal) add(open + i + "resources".length + literal[0].length - 1);
        else {
          const name = named ? named[1]! : /^\s*[,}]/.test(rest) ? "resources" : null;
          const found = name ? initializer(code, blank, name) : null;
          if (found?.text.startsWith("{")) add(found.open);
        }
      }
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
  }
  for (const open of typedObjects(code, blank, "SupabaseResourceConfig")) add(open);
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
    if (!PROVIDER_CONFIG.test(blank)) continue;
    const configs = resourceConfigRanges(file.code, blank);
    for (const m of blank.matchAll(/\b(writes|actions|source)\s*:\s*\{/g)) {
      const open = (m.index ?? 0) + m[0].length - 1;
      // Only inside a resource's configuration: a labels object beside the provider isn't one.
      if (!configs.some(([from, to]) => open > from && open < to)) continue;
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
      // Comments blanked, `//` ones included (every test file read here is a script, .mts and .cts
      // too): a name in a comment is not a test.
      code = stripBlockComments(readFileSync(abs, "utf8"), true);
    } catch {
      continue;
    }
    if (!code.includes("accessRules")) continue;
    const blank = blankStrings(code);
    for (const m of blank.matchAll(/\baccessRules\s*(?:<[^>]*>)?\s*\(/g)) {
      const call = balanced(code, (m.index ?? 0) + m[0].length - 1);
      // The `fn` the call is given: written in it, or in a spec it names, directly or through a
      // loop over a list of specs (`for (const s of specs) accessRules({ ...s, as })`).
      for (const name of fnNames(call)) out.add(name);
      for (const name of specsNamedIn(code, blank, call)) for (const fn of fnNames(name)) out.add(fn);
    }
  }
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

/**
 * The function names a spec gives: its own top-level `fn`, not one in its `args`. `text` is the
 * call `(…)` (the spec at depth 2), an object `{…}` (depth 1) or a list of specs `[…]` (depth 2).
 */
function fnNames(text: string): string[] {
  return valuesAt(text, "fn", text.startsWith("{") ? 1 : 2);
}

/** The `[…]` or `{…}` a `const`/`let`/`var` named `name` is set to in the file, or "". */
function initializer(code: string, blank: string, name: string): { text: string; keyword: string; at: number; open: number } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decl = new RegExp(`\\b(const|let|var)\\s+${escaped}(?![\\w$])[^=;]*=\\s*[[{]`).exec(blank);
  if (!decl) return null;
  const open = decl.index + decl[0].length - 1;
  const text = balanced(code, open);
  return text ? { text, keyword: decl[1]!, at: decl.index, open } : null;
}

/**
 * The spec objects or lists an `accessRules(…)` call names: an identifier in it set in this file to
 * an object or list, or the list a `for (… of list)` loop takes that identifier from.
 */
function specsNamedIn(code: string, blank: string, call: string): string[] {
  const out: string[] = [];
  // The spec itself (`accessRules(spec)`) and what the spec object spreads at its top level
  // (`accessRules({ ...spec, as })`); a name elsewhere (in `args`, say) is not a spec.
  const callBlank = blankStrings(call);
  const names = new Set<string>();
  const direct = /^\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(callBlank);
  if (direct) names.add(direct[1]!);
  let depth = 0;
  for (let i = 0; i < callBlank.length; i++) {
    const ch = callBlank[i];
    if (depth === 2 && callBlank.startsWith("...", i)) {
      const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(callBlank.slice(i));
      if (spread) names.add(spread[1]!);
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
  }
  for (const name of names) {
    const own = initializer(code, blank, name);
    if (own) out.push(own.text);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const loop of blank.matchAll(new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${escaped}\\s+of\\s+([A-Za-z_$][\\w$]*)`, "g"))) {
      const list = initializer(code, blank, loop[1]!);
      if (list) out.push(list.text);
    }
  }
  return out;
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
    if (!found || !found.text.startsWith("{") || !objectDeclares(found.text)) continue;
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
