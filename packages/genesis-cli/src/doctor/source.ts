/**
 * Source helpers shared by the rules that follow a file into what it renders:
 * local imports (one hop), and where a JSX element opens and what it sits in.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { SourceFile } from "./types.js";

export const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
export const JSX_EXTS = new Set([".tsx", ".jsx"]);
const RESOLVE_EXTS = [".tsx", ".ts", ".jsx", ".js"];

/** Files a source imports by relative path or the `@/` / `~/` root aliases, resolved to absolute paths that exist. */
export function localImports(root: string, file: Pick<SourceFile, "absolutePath" | "code">): string[] {
  const out: string[] = [];
  for (const m of file.code.matchAll(/\bfrom\s*["']((?:\.{1,2}|[@~])\/[^"']+)["']/g)) {
    const spec = m[1];
    const bases = spec.startsWith(".")
      ? [path.resolve(path.dirname(file.absolutePath), spec)]
      : [path.join(root, spec.slice(2)), path.join(root, "src", spec.slice(2))];
    for (const base of bases) {
      const hit = [base, ...RESOLVE_EXTS.map((e) => base + e), ...RESOLVE_EXTS.map((e) => path.join(base, `index${e}`))].find(
        (p) => SCRIPT_EXTS.has(path.extname(p)) && existsSync(p),
      );
      if (hit) {
        out.push(hit);
        break;
      }
    }
  }
  return out;
}

export function readSource(abs: string): Pick<SourceFile, "absolutePath" | "code"> | null {
  try {
    return { absolutePath: abs, code: readFileSync(abs, "utf8") };
  } catch {
    return null;
  }
}

/**
 * Whether `test` holds for the file itself or for one file it imports locally.
 * `files` are the scanned files, reused before reading from disk.
 */
export function viaOneImport(
  root: string,
  files: readonly SourceFile[],
  file: Pick<SourceFile, "absolutePath" | "code">,
  test: (code: string) => boolean,
): boolean {
  if (test(file.code)) return true;
  const byPath = new Map(files.map((f) => [f.absolutePath, f]));
  return localImports(root, file).some((abs) => {
    const target = byPath.get(abs) ?? readSource(abs);
    return target !== null && test(target.code);
  });
}

/** Index just past the `>` that ends the JSX tag opening at `start` (the `<`), and whether it self-closes. */
function tagEnd(code: string, start: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) {
      let j = i - 1;
      while (j > start && /\s/.test(code[j])) j--;
      return { end: i + 1, selfClosing: code[j] === "/" };
    }
  }
  return { end: code.length, selfClosing: false };
}

/**
 * The elements (by name) still open at `index`, counting only names `track`
 * accepts. Self-closing tags and closed ones don't count. A light scan, not a
 * parser: good enough to tell a page-level element from one inside a card.
 */
export function openElementsAt(code: string, index: number, track: (name: string) => boolean): string[] {
  const open: string[] = [];
  const re = /<(\/?)([A-Z][\w.]*)(?=[\s>/])/g;
  for (let m = re.exec(code); m && m.index < index; m = re.exec(code)) {
    const name = m[2];
    if (!track(name)) continue;
    // A generic (useState<Card>, Array<Dialog>) follows an identifier; JSX doesn't.
    if (!m[1] && /[\w$.]$/.test(code.slice(Math.max(0, m.index - 1), m.index))) continue;
    if (m[1]) {
      const at = open.lastIndexOf(name);
      if (at !== -1) open.splice(at, 1);
      continue;
    }
    const { end, selfClosing } = tagEnd(code, m.index);
    if (end > index) break; // index is inside this tag's attributes
    if (!selfClosing) open.push(name);
  }
  return open;
}

/** JSX element names a file renders (`<Name …>` / `<Name>` / `<Name/>`), generics excluded. */
export function renderedElements(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?<![\w$.])<([A-Z][\w.]*)(?=[\s>/])/g)) out.push(m[1]);
  return out;
}

/** Whether code renders JSX: a component element, a host element (`<main>`, `<div …>`) or a fragment. */
export function rendersJsx(code: string): boolean {
  return renderedElements(code).length > 0 || /(?<![\w$.])<(?:[a-z][\w-]*(?=[\s>/])|>)/.test(code);
}

/** Names a file imports from packages matching `pkg` (named imports, aliases resolved to the local name). */
export function namedImportsFrom(code: string, pkg: RegExp): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!pkg.test(m[2])) continue;
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p || p.startsWith("type ")) continue;
      const local = p.split(/\s+as\s+/).pop()?.trim();
      if (local) out.push(local);
    }
  }
  return out;
}
