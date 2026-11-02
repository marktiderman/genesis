/**
 * Genesis's lint rules in an app's ESLint flat config, read and added in one place: the
 * `genesis-cli-eslint-config` codemod adds them and the doctor's `genesis-eslint-config` rule
 * reports an app that hasn't.
 *
 * Until genesis-cli 1.20, an app's eslint.config.js was copied once by `genesis init` and never
 * updated, so a rule Genesis added (React Native Testing Library 14's await rules) reached only new
 * apps. The rules now ship as `@marktiderman/genesis-cli/eslint`; an app that spreads
 * `genesis("native")` into its config gets new and changed rules with every CLI it installs.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { maskComments } from "./scope-names.js";
import type { GenesisPlatform } from "../eslint.js";

/** The subpath the lint pieces ship from. */
export const ESLINT_EXPORT = "@marktiderman/genesis-cli/eslint";
/** The plugin the native pieces need, and the range the starter installs. */
export const TESTING_LIBRARY = "eslint-plugin-testing-library";
export const TESTING_LIBRARY_RANGE = "^7.16.2";

/** ESLint's flat config file names, in the order ESLint looks for them. */
export const FLAT_CONFIG_FILES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts"] as const;

/** The app's flat config file (app-relative), or null when it has none. */
export function findEslintConfig(root: string): string | null {
  return FLAT_CONFIG_FILES.find((name) => existsSync(path.join(root, name))) ?? null;
}

type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

export function readPackageJson(root: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

const declares = (pkg: PackageJson | null, name: string) => Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? pkg?.peerDependencies?.[name]);

/** `"native"` for an Expo or React Native app, else `"web"`. */
export function appPlatform(pkg: PackageJson | null): GenesisPlatform {
  return declares(pkg, "expo") || declares(pkg, "react-native") ? "native" : "web";
}

/** Whether the app declares eslint-plugin-testing-library. */
export function hasTestingLibrary(pkg: PackageJson | null): boolean {
  return declares(pkg, TESTING_LIBRARY);
}

/** Whether a config already loads Genesis's lint pieces. */
export function usesGenesisLint(text: string): boolean {
  return text.includes(ESLINT_EXPORT);
}

/** Whether a config still inlines the starter's RNTL await rules (genesis-cli 1.19's starter), which Genesis now ships. */
export function inlinesRntlRules(text: string): boolean {
  return /testing-library\/await-async-events/.test(maskComments(text));
}

/** `text` with comments and the contents of strings and template literals blanked (quotes kept), offsets unchanged. */
export function maskCode(text: string): string {
  const masked = maskComments(text).split("");
  let quote: string | null = null;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]!;
    if (quote) {
      if (ch === "\\") {
        masked[i] = " ";
        if (i + 1 < masked.length && masked[i + 1] !== "\n") masked[i + 1] = " ";
        i++;
      } else if (ch === quote) quote = null;
      else if (ch !== "\n") masked[i] = " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
  }
  return masked.join("");
}

/** The offset of the bracket closing the one at `open`, in masked code; -1 when it doesn't close. */
function matching(code: string, open: number): number {
  const pairs: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
  const stack: string[] = [];
  for (let i = open; i < code.length; i++) {
    const ch = code[i]!;
    if (ch in pairs) stack.push(pairs[ch]!);
    else if (ch === "]" || ch === ")" || ch === "}") {
      if (stack.pop() !== ch) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

export type ModuleKind = "cjs" | "esm";

/** The import line for the config's module kind. */
export function importLine(kind: ModuleKind, local = "genesis"): string {
  const binding = local === "genesis" ? "genesis" : `genesis: ${local}`;
  return kind === "cjs" ? `const { ${binding} } = require("${ESLINT_EXPORT}");` : `import { ${local === "genesis" ? "genesis" : `genesis as ${local}`} } from "${ESLINT_EXPORT}";`;
}

/** The entry spread into the exported array. */
export function spreadLine(platform: GenesisPlatform, local = "genesis"): string {
  return `...${local}("${platform}")`;
}

export type AddResult = { ok: true; text: string } | { ok: false; reason: string; kind: ModuleKind };

/**
 * Adds the import and `...genesis(platform)` to a flat config: as the last entry of the array it
 * exports (`module.exports = [...]`, `export default [...]`), or of the array or argument list of
 * a `defineConfig(...)` / `tseslint.config(...)` call it exports. Anything else (a config built in
 * a variable or a function, more than one export) is reported unusual, with nothing changed.
 */
export function addGenesisLint(text: string, platform: GenesisPlatform, file = "eslint.config.js"): AddResult {
  const code = maskCode(text);
  const ext = path.extname(file);
  const exportsCjs = [...code.matchAll(/(?:^|[\n;])\s*module\.exports\s*=\s*/g)];
  const exportsEsm = [...code.matchAll(/(?:^|[\n;])\s*export\s+default\s+/g)];
  const kind: ModuleKind = ext === ".cjs" || ext === ".cts" ? "cjs" : ext === ".mjs" || ext === ".mts" ? "esm" : exportsCjs.length && !exportsEsm.length ? "cjs" : "esm";
  const found = [...exportsCjs, ...exportsEsm];
  if (found.length !== 1) return { ok: false, kind, reason: found.length ? "it exports its config more than once" : "it has no `module.exports =` or `export default`" };
  const local = /(?<![\w$])genesis(?![\w$])/.test(code) ? "genesisLint" : "genesis";
  if (local === "genesisLint" && /(?<![\w$])genesisLint(?![\w$])/.test(code)) return { ok: false, kind, reason: "it already declares `genesis` and `genesisLint`" };

  // What the export is: an array, or a call whose first argument is an array or whose arguments are configs.
  let at = found[0]!.index! + found[0]![0].length;
  let close: number;
  const call = /^(?!(?:async|function)\b)[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(\s*/.exec(code.slice(at));
  if (code[at] === "[") {
    close = matching(code, at);
  } else if (call) {
    const paren = at + call[0].lastIndexOf("(");
    at += call[0].length;
    close = code[at] === "[" ? matching(code, at) : matching(code, paren);
    if (code[at] !== "[") at = paren;
  } else {
    return { ok: false, kind, reason: "it doesn't export an array or a `defineConfig(...)` call" };
  }
  if (close < 0) return { ok: false, kind, reason: "its exported array doesn't close where expected" };

  // Insert before the closing bracket, after the last entry, in the file's own layout.
  let last = close - 1;
  while (last > at && /\s/.test(code[last]!)) last--;
  const entry = spreadLine(platform, local);
  let next: string;
  if (last === at) {
    next = `${text.slice(0, at + 1)}${entry}${text.slice(close)}`;
  } else {
    const comma = code[last] === "," ? "" : ",";
    const multiline = code.slice(last, close).includes("\n");
    const lineStart = code.lastIndexOf("\n", last) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
    next = multiline
      ? `${text.slice(0, last + 1)}${comma}\n${indent}${entry},${text.slice(last + 1)}`
      : `${text.slice(0, last + 1)}${comma} ${entry}${text.slice(last + 1)}`;
  }

  // The import: after the last top-level import or require before the export, else at the top (after a shebang).
  const exportAt = found[0]!.index! + found[0]![0].search(/module|export/);
  const head = maskCode(next).slice(0, exportAt);
  const imports = [...head.matchAll(kind === "cjs" ? /^(?:const|let|var)\s[^\n]*\brequire\s*\([^\n]*$/gm : /^import\b[\s\S]*?(?:from\s*)?["'][^"'\n]*["'][^\n]*$/gm)];
  const line = importLine(kind, local);
  if (imports.length) {
    const end = imports.at(-1)!.index! + imports.at(-1)![0].length;
    return { ok: true, text: `${next.slice(0, end)}\n${line}${next.slice(end)}` };
  }
  const shebang = next.startsWith("#!") ? next.indexOf("\n") + 1 : 0;
  return { ok: true, text: `${next.slice(0, shebang)}${line}\n${next.slice(shebang)}` };
}

/** The lines to add by hand when the config is too unusual to edit. */
export function manualLines(kind: ModuleKind, platform: GenesisPlatform): string[] {
  return [importLine(kind), `${spreadLine(platform)},  // last in the array the config exports`];
}
