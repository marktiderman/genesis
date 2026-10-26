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

/** Reads the app's alias table: tsconfig/jsconfig `compilerOptions.paths` (+ `baseUrl`) and package.json `imports`. */
function aliases(root: string): Array<{ prefix: string; exact: boolean; targets: string[] }> {
  const out: Array<{ prefix: string; exact: boolean; targets: string[] }> = [];
  for (const name of ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"]) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    try {
      // JSONC: drop comments (not inside strings, close enough for config) and trailing commas.
      const text = readFileSync(file, "utf8")
        .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s ?? "")
        .replace(/,(\s*[}\]])/g, "$1");
      const opts = (JSON.parse(text) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }).compilerOptions ?? {};
      const base = path.join(root, opts.baseUrl ?? ".");
      for (const [pattern, targets] of Object.entries(opts.paths ?? {})) {
        const exact = !pattern.endsWith("*");
        out.push({ prefix: pattern.replace(/\*$/, ""), exact, targets: targets.map((t) => path.join(base, t.replace(/\*$/, ""))) });
      }
    } catch {
      // An unreadable tsconfig adds no aliases.
    }
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { imports?: Record<string, unknown> };
    for (const [pattern, target] of Object.entries(pkg.imports ?? {})) {
      if (typeof target !== "string") continue;
      out.push({ prefix: pattern.replace(/\*.*$/, ""), exact: !pattern.includes("*"), targets: [path.join(root, target.replace(/\*.*$/, ""))] });
    }
  } catch {
    // no package.json
  }
  // The common defaults, after the app's own.
  for (const prefix of ["@/", "~/", "#/"]) out.push({ prefix, exact: false, targets: [path.join(root, "src") + path.sep, root + path.sep] });
  return out;
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
  const table = aliases(ctx.root);
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
    const used = new Set(renderedElements(file.code).map((e) => e.split(".")[0]));
    for (const m of file.code.matchAll(/\b\w*[cC]omponent\s*:\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
    for (const m of file.code.matchAll(/\bexport\s+default\s+([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
    for (const m of file.code.matchAll(/\bexport\s*\{([^}]*)\}\s*;/g)) for (const n of m[1].split(",")) used.add(n.trim().split(/\s+as\s+/)[0]!);
    const specs: string[] = [];
    for (const m of file.code.matchAll(IMPORT_FROM)) if (!m[1] && bindings(m[2]).some((b) => used.has(b))) specs.push(m[3]);
    for (const m of file.code.matchAll(EXPORT_FROM)) if (!m[1]) specs.push(m[2]);
    for (const m of file.code.matchAll(DYNAMIC)) specs.push(m[1]);
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
  const memo = new WeakMap<(code: string) => boolean, Map<string, Reach>>();

  const reach = (file: Code, test: (code: string) => boolean, depth = TRAIL_DEPTH, seen = new Set<string>()): Reach => {
    let cache = memo.get(test);
    if (!cache) memo.set(test, (cache = new Map()));
    const k = `${file.absolutePath}\0${depth}`;
    const cached = cache.get(k);
    if (cached) return cached;
    let result: Reach;
    if (test(file.code)) result = "yes";
    else {
      const { files, lost } = importsOf(file);
      let unknown = lost;
      result = "no";
      if (files.length && depth === 0) unknown = true;
      else {
        seen.add(file.absolutePath);
        for (const abs of files) {
          if (seen.has(abs)) continue;
          const target = read(abs);
          if (!target) {
            unknown = true;
            continue;
          }
          const r = reach(target, test, depth - 1, seen);
          if (r === "yes") {
            result = "yes";
            break;
          }
          if (r === "unknown") unknown = true;
        }
        seen.delete(file.absolutePath);
      }
      if (result === "no" && unknown) result = "unknown";
    }
    cache.set(k, result);
    return result;
  };
  return { reach: (file, test, depth) => reach(file, test, depth) };
}
