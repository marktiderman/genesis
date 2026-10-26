/**
 * Follows what a file renders through the app's own modules: the imports of
 * components it renders, dynamic imports (`lazy(() => import(…))`,
 * `lazyRouteComponent(…)`), re-exports and barrels, through relative paths and the app's aliases
 * (tsconfig/jsconfig `paths`, package.json `imports`, and `@/`, `~/`, `#/`).
 *
 * An answer is `yes`, `no` or `unknown`. `unknown` means the trail ran out
 * (an import that resolves to neither an app file nor an installed package, or
 * the depth limit) before an answer: rules that would report on `no` stay quiet.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { readSource, renderedElements, SCRIPT_EXTS } from "./source.js";
import type { DoctorContext, SourceFile } from "./types.js";

export type Reach = "yes" | "no" | "unknown";

/** How many modules deep a trail goes: a route, its page component, a barrel, the layout wrapper. */
export const TRAIL_DEPTH = 6;
const RESOLVE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];
/** `import <bindings> from "x"` (type-only imports excluded by the caller). Anchored at the statement, so "Start from" in a string isn't one. */
const IMPORT_FROM = /^[ \t]*import\s+(type\s+)?([^;"'`]*?)\s*from\s*["']([^"']+)["']/gm;
/** `export … from "x"`: a barrel's re-exports. */
const EXPORT_FROM = /^[ \t]*export\s+(type\s+)?[^;"'`]*?\bfrom\s*["']([^"']+)["']/gm;
/** `import("x")`: `lazy(() => import(…))`, `lazyRouteComponent(() => import(…))`. */
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']/g;

/**
 * The code with comments, string, template and regex-literal contents blanked
 * (same length, newlines kept), except module specifiers (`from "x"`,
 * `import "x"`, `import("x")`, `require("x")`): so `"Start from"`, a
 * `// import("./Old")` comment or a `"import('./Page')"` string is never read as
 * an import. Template `${…}` expressions are kept.
 *
 * Whether a quote, backtick or slash opens a literal follows the usual
 * preceding-token rule: it does at the start of an expression (after an
 * operator, punctuation or a keyword like `return`), and not after a word or
 * `)` / `]`, which is how JSX text reads (`Rock 'n roll`, `use \`npm i\``,
 * `and/or`). A backtick right after a word is a tagged template (css`…`).
 * Closing tags (`</p>`) and self-closing `/>` are never regexes.
 *
 * Returns null when it can't be sure where literals end (one runs past the end
 * of its line, or the file): callers then treat the file as unknown.
 */
export function stripForImports(code: string): string | null {
  const out: string[] = [];
  const blank = (ch: string) => (ch === "\n" ? "\n" : " ");
  const n = code.length;
  /** Brace depth at each open template `${`, to know which `}` resumes the template. */
  const templates: number[] = [];
  let depth = 0;
  let i = 0;
  let sure = true;
  const isSpecifier = () => /(?:\bfrom|(?:^|[;{}\n])\s*import|\bimport\s*\(|\brequire\s*\()\s*$/.test(out.slice(-40).join(""));
  /** The code just before `i`, as written so far. */
  const before = () => out.slice(-24).join("");
  const KEYWORD = /(?:^|[^\w$.])(?:return|typeof|instanceof|case|do|else|in|of|new|delete|void|throw|yield|await|from|import|export|default|require)\s*$/;
  /** At the start of an expression, after the text `b`: a literal can begin here. */
  const startsExpression = (b: string) => {
    const t = b.replace(/\s+$/, "");
    if (!t) return true;
    if (KEYWORD.test(b)) return true;
    return /[([{,;:=!&|?+\-*%<>~^}]$/.test(t);
  };
  const exprStart = () => startsExpression(before());
  /**
   * A tagged template: a name (css, styled.div, String.raw) right before the backtick, itself where an
   * expression can start. `use npm i` + backtick in JSX text is two words in a row, which isn't.
   */
  const taggedTemplate = () => {
    const b = out.slice(-48).join("");
    const m = /([A-Za-z_$][\w$.]*)$/.exec(b);
    return m !== null && startsExpression(b.slice(0, b.length - m[1].length));
  };
  /** The body of a template literal, from `i`, up to and including its closing backtick or a `${`. */
  const templateBody = () => {
    while (i < n) {
      const ch = code[i];
      if (ch === "\\") {
        out.push(" ", blank(code[i + 1] ?? ""));
        i += 2;
      } else if (ch === "`") {
        out.push("`");
        i++;
        return;
      } else if (ch === "$" && code[i + 1] === "{") {
        out.push("${");
        i += 2;
        templates.push(depth);
        depth++;
        return;
      } else {
        out.push(blank(ch));
        i++;
      }
    }
    sure = false; // ran off the end of the file
  };
  while (i < n && sure) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && code[i] !== "\n") {
        out.push(" ");
        i++;
      }
    } else if (ch === "/" && next === "*") {
      out.push("  ");
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        out.push(blank(code[i]));
        i++;
      }
      if (i < n) {
        out.push("  ");
        i += 2;
      }
    } else if (ch === "/" && next !== ">" && code[i - 1] !== "<" && exprStart()) {
      // A regex literal: up to the unescaped `/` outside a [class], then its flags.
      // After a `}` or a tag's `>` it may be JSX text instead (`{done}/{total}`, `<p> / </p>`): if it
      // doesn't close on its line, or its "body" holds a tag, it was a slash.
      const afterBrace = /[}>]\s*$/.test(before());
      const start = i;
      const mark = out.length;
      out.push("/");
      i++;
      let inClass = false;
      for (;;) {
        const c = code[i];
        if (c === undefined || c === "\n") {
          if (afterBrace) {
            out.length = mark;
            out.push("/");
            i = start + 1;
          } else sure = false;
          break;
        }
        if (c === "\\") {
          out.push(" ", blank(code[i + 1] ?? ""));
          i += 2;
          continue;
        }
        i++;
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          // After a `}` or `>`, a "regex" spanning JSX (`{a}/{b} <Foo />`) was text and a slash.
          if (afterBrace && /[<>]/.test(code.slice(start + 1, i - 1))) {
            out.length = mark;
            out.push("/");
            i = start + 1;
            break;
          }
          out.push("/");
          break;
        }
        out.push(" ");
      }
      if (out.length > mark + 1 || i > start + 1) while (i < n && /[a-z]/.test(code[i])) out.push(code[i++]);
    } else if ((ch === '"' || ch === "'") && exprStart()) {
      const keep = isSpecifier();
      out.push(ch);
      i++;
      while (i < n && code[i] !== ch && code[i] !== "\n") {
        if (code[i] === "\\") {
          out.push(keep ? code[i] : " ", keep ? (code[i + 1] ?? "") : blank(code[i + 1] ?? ""));
          i += 2;
        } else {
          out.push(keep ? code[i] : blank(code[i]));
          i++;
        }
      }
      if (code[i] !== ch) sure = false; // a string can't run past its line
      else {
        out.push(code[i]);
        i++;
      }
    } else if (ch === "`" && (exprStart() || taggedTemplate())) {
      out.push("`");
      i++;
      templateBody();
    } else if (ch === "}" && templates.length && depth - 1 === templates[templates.length - 1]) {
      templates.pop();
      depth--;
      out.push("}");
      i++;
      templateBody();
    } else {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      out.push(ch);
      i++;
    }
  }
  return sure && templates.length === 0 ? out.join("") : null;
}

/** The local names an import statement binds: default, `* as NS`, and `{ A, B as C }` (inline `type` names left out). */
function bindings(clause: string): string[] {
  const out: string[] = [];
  const named = /\{([^}]*)\}/.exec(clause);
  for (const part of named?.[1].split(",") ?? []) {
    const p = part.trim();
    if (!p || p.startsWith("type ")) continue;
    out.push(p.split(/\s+as\s+/).pop()!.trim());
  }
  const rest = clause.replace(/\{[^}]*\}/, "");
  const ns = /\*\s*as\s+([\w$]+)/.exec(rest);
  if (ns) out.push(ns[1]);
  const def = /^\s*([\w$]+)/.exec(rest);
  if (def && def[1] !== "as") out.push(def[1]);
  return out;
}

type Code = Pick<SourceFile, "absolutePath" | "code">;

interface Aliases {
  table: Array<{ prefix: string; exact: boolean; targets: string[] }>;
  /** tsconfig/jsconfig `baseUrl`, absolute: bare specifiers resolve against it first. */
  baseUrl: string | null;
}

/** JSONC as tsconfig takes it: comments (outside strings) and trailing commas dropped. */
function readJsonc(file: string): Record<string, unknown> | null {
  try {
    const text = readFileSync(file, "utf8")
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * A tsconfig's `baseUrl` and `paths`, following `extends` (a relative file or a
 * package's config, one or a list). Each is resolved where it's written: `baseUrl`
 * against its own config's folder, `paths` against `baseUrl` when one is set,
 * else against the config that holds them.
 */
function readTsconfig(root: string, file: string, seen = new Set<string>()): { baseUrl?: string; paths?: Record<string, string[]>; pathsDir?: string } {
  if (seen.has(file) || seen.size > 10) return {};
  seen.add(file);
  const json = readJsonc(file);
  if (!json) return {};
  const dir = path.dirname(file);
  let merged: { baseUrl?: string; paths?: Record<string, string[]>; pathsDir?: string } = {};
  const parents = typeof json.extends === "string" ? [json.extends] : Array.isArray(json.extends) ? (json.extends as unknown[]) : [];
  for (const ext of parents) {
    if (typeof ext !== "string") continue;
    let target: string | null = null;
    if (ext.startsWith(".") || path.isAbsolute(ext)) {
      const abs = path.resolve(dir, ext);
      target = existsSync(abs) && statSync(abs).isFile() ? abs : existsSync(`${abs}.json`) ? `${abs}.json` : null;
    } else {
      const parts = ext.split("/");
      const nameLength = ext.startsWith("@") ? 2 : 1;
      const pkgDir = findPackageDir(root, parts.slice(0, nameLength).join("/"));
      if (pkgDir) {
        const sub = parts.slice(nameLength).join("/");
        const abs = path.join(pkgDir, sub || "tsconfig.json");
        target = existsSync(abs) && statSync(abs).isFile() ? abs : existsSync(`${abs}.json`) ? `${abs}.json` : null;
      }
    }
    if (target) merged = { ...merged, ...readTsconfig(root, target, seen) };
  }
  const opts = (json.compilerOptions ?? {}) as { baseUrl?: unknown; paths?: unknown };
  if (typeof opts.baseUrl === "string") merged.baseUrl = path.resolve(dir, opts.baseUrl);
  if (opts.paths && typeof opts.paths === "object") {
    merged.paths = opts.paths as Record<string, string[]>;
    merged.pathsDir = dir;
  }
  return merged;
}

/** Reads the app's aliases: tsconfig/jsconfig `paths` and `baseUrl` (with `extends`), and package.json `imports`. */
function aliases(root: string): Aliases {
  const table: Aliases["table"] = [];
  let baseUrl: string | null = null;
  for (const name of ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"]) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    const config = readTsconfig(root, file);
    baseUrl ??= config.baseUrl ?? null;
    const base = config.baseUrl ?? config.pathsDir ?? root;
    for (const [pattern, targets] of Object.entries(config.paths ?? {})) {
      if (!Array.isArray(targets)) continue;
      const exact = !pattern.endsWith("*");
      table.push({ prefix: pattern.replace(/\*$/, ""), exact, targets: targets.map((t) => path.join(base, String(t).replace(/\*$/, ""))) });
    }
  }
  const pkg = readJsonc(path.join(root, "package.json")) as { imports?: Record<string, unknown> } | null;
  for (const [pattern, target] of Object.entries(pkg?.imports ?? {})) {
    if (typeof target !== "string") continue;
    table.push({ prefix: pattern.replace(/\*.*$/, ""), exact: !pattern.includes("*"), targets: [path.join(root, target.replace(/\*.*$/, ""))] });
  }
  // The common defaults, after the app's own.
  for (const prefix of ["@/", "~/", "#/"]) table.push({ prefix, exact: false, targets: [path.join(root, "src") + path.sep, root + path.sep] });
  return { table, baseUrl };
}

function resolveFile(base: string): string | null {
  const tries = [base, ...RESOLVE_EXTS.map((e) => base + e), ...RESOLVE_EXTS.map((e) => path.join(base, `index${e}`))];
  // `./x.js` written for a `./x.ts` source (TS ESM style).
  if (/\.[mc]?js$/.test(base)) tries.push(...[".ts", ".tsx"].map((e) => base.replace(/\.[mc]?js$/, e)));
  for (const p of tries) {
    if (SCRIPT_EXTS.has(path.extname(p)) && existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export interface Trail {
  /** Whether `test` holds for the file or a module it reaches (within `depth`). */
  reach(file: Code, test: (code: string) => boolean, depth?: number): Reach;
}

const trails = new WeakMap<readonly SourceFile[], Trail>();

/** One trail per doctor run (keyed by its scanned files), so every rule shares the cache. */
export function trailFor(ctx: Pick<DoctorContext, "root" | "files">): Trail {
  let t = trails.get(ctx.files);
  if (!t) trails.set(ctx.files, (t = createTrail(ctx)));
  return t;
}

export function createTrail(ctx: Pick<DoctorContext, "root" | "files">): Trail {
  const { table, baseUrl } = aliases(ctx.root);
  // The app's declared packages (null without a package.json: then a bare specifier is taken as a package).
  let declared: Set<string> | null = null;
  try {
    const pkg = JSON.parse(readFileSync(path.join(ctx.root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    declared = new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => Object.keys(pkg[k] ?? {})));
  } catch {
    declared = null;
  }
  const byPath = new Map(ctx.files.map((f) => [f.absolutePath, f as Code]));
  const read = (abs: string): Code | null => byPath.get(abs) ?? readSource(abs);
  /**
   * The app modules a file's rendering goes through, and whether one couldn't be placed:
   * imports whose bindings it renders (`<CoursesPage>`, `<UI.Frame>`) or names as a route
   * component (`component: CoursesPage`), dynamic imports, and a barrel's re-exports.
   * Imports it only calls (data helpers, hooks) aren't followed: a layout is rendered.
   */
  const importsCache = new Map<string, { files: string[]; lost: boolean }>();
  const importsOf = (file: Code) => {
    const hit = importsCache.get(file.absolutePath);
    if (hit) return hit;
    const files: string[] = [];
    let lost = false;
    const code = stripped(file);
    if (code === null) {
      // The tokenizer couldn't be sure of this file: don't guess what it imports.
      const out = { files: [], lost: true };
      importsCache.set(file.absolutePath, out);
      return out;
    }
    const used = new Set(renderedElements(code).map((e) => e.split(".")[0]));
    for (const m of code.matchAll(/\b\w*[cC]omponent\s*:\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
    for (const m of code.matchAll(/\bexport\s+default\s+([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
    for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}\s*;/g)) for (const n of m[1].split(",")) used.add(n.trim().split(/\s+as\s+/)[0]!);
    const specs: string[] = [];
    for (const m of code.matchAll(IMPORT_FROM)) if (!m[1] && bindings(m[2]).some((b) => used.has(b))) specs.push(m[3]);
    for (const m of code.matchAll(EXPORT_FROM)) if (!m[1]) specs.push(m[2]);
    for (const m of code.matchAll(DYNAMIC)) specs.push(m[1]);
    for (const spec of specs) {
      if (/^(?:node:|https?:|data:|virtual:)/.test(spec) || /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|json|md|mdx)(?:\?.*)?$/.test(spec)) continue;
      let resolved: string | null = null;
      if (spec.startsWith(".")) {
        resolved = resolveFile(path.resolve(path.dirname(file.absolutePath), spec));
        if (!resolved) lost = true;
      } else {
        const alias = table.find((a) => (a.exact ? spec === a.prefix : spec.startsWith(a.prefix)));
        if (alias) {
          for (const t of alias.targets) {
            resolved = resolveFile(alias.exact ? t : path.join(t, spec.slice(alias.prefix.length)));
            if (resolved) break;
          }
        }
        // `baseUrl` makes `components/Card` an app path.
        if (!resolved && baseUrl && !spec.startsWith("#")) resolved = resolveFile(path.join(baseUrl, spec));
        if (!resolved) {
          const pkg = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
          // An installed or declared package ends the app's trail; anything else is an alias we couldn't read.
          if (spec.startsWith("#") || (declared && !declared.has(pkg) && !findPackageDir(ctx.root, pkg))) lost = true;
        }
      }
      if (resolved && !files.includes(resolved)) files.push(resolved);
    }
    const out = { files, lost };
    importsCache.set(file.absolutePath, out);
    return out;
  };
  const strippedCache = new Map<string, string | null>();
  const stripped = (file: Code): string | null => {
    if (!strippedCache.has(file.absolutePath)) strippedCache.set(file.absolutePath, stripForImports(file.code));
    return strippedCache.get(file.absolutePath)!;
  };
  /** Per test: answers that hold on any path, and answers that hold while their cut modules are on the path. */
  const memo = new WeakMap<(code: string) => boolean, { free: Map<string, Reach>; cut: Map<string, Array<{ cut: string[]; result: Reach }>> }>();

  /**
   * The answer, and the modules it skipped because they were already on the
   * current path (its cut). An answer with an empty cut holds on any path. One
   * with a cut holds whenever every cut module is again on the path: each of
   * those is then being explored by an ancestor, with at least as much depth
   * left, so skipping it loses nothing. Both are cached; a cut answer is
   * reused only under that condition, so the result never depends on the
   * order routes are checked in (the bug a plain cache had).
   */
  const reach = (file: Code, test: (code: string) => boolean, depth: number, seen: Set<string>): [Reach, Set<string>] => {
    let cache = memo.get(test);
    if (!cache) memo.set(test, (cache = { free: new Map(), cut: new Map() }));
    const k = `${file.absolutePath}\0${depth}`;
    const free = cache.free.get(k);
    if (free) return [free, new Set()];
    const reusable = cache.cut.get(k)?.find((e) => e.cut.every((m) => seen.has(m)));
    if (reusable) return [reusable.result, new Set(reusable.cut)];
    let result: Reach;
    const cut = new Set<string>();
    const code = stripped(file);
    if (code === null) result = "unknown";
    else if (test(code)) result = "yes";
    else {
      const { files, lost } = importsOf(file);
      // An import we couldn't place matters only where the trail would have followed it.
      let unknown = lost && depth > 0;
      result = "no";
      // Past the depth limit the trail ends as main's one-hop check did: not found, so the rule reports.
      if (depth > 0) {
        seen.add(file.absolutePath);
        for (const abs of files) {
          if (seen.has(abs)) {
            cut.add(abs);
            continue;
          }
          const target = read(abs);
          if (!target) {
            unknown = true;
            continue;
          }
          const [r, c] = reach(target, test, depth - 1, seen);
          for (const m of c) cut.add(m);
          if (r === "yes") {
            result = "yes";
            break;
          }
          if (r === "unknown") unknown = true;
        }
        seen.delete(file.absolutePath);
        // Skipping this module itself, deeper down, is covered right here.
        cut.delete(file.absolutePath);
      }
      if (result === "no" && unknown) result = "unknown";
    }
    // A "yes" is a real path, true on any path.
    if (result === "yes" || cut.size === 0) {
      cache.free.set(k, result);
      return [result, new Set()];
    }
    const entries = cache.cut.get(k) ?? [];
    entries.push({ cut: [...cut], result });
    cache.cut.set(k, entries);
    return [result, cut];
  };
  return { reach: (file, test, depth = TRAIL_DEPTH) => reach(file, test, depth, new Set())[0] };
}
