/**
 * What an app imports from Genesis that isn't stable yet (feature `stability-tags`).
 *
 * Export maturity is a JSDoc tag, not a name prefix or a subpath: `@deprecated` (with what to use
 * instead), or `@stability Experimental | Beta | Stable | Deprecated`. The doctor reads the tags
 * from each imported Genesis package's published declarations (`dist/**\/*.d.ts`) and reports:
 *
 * - `deprecated-import` (warn): a named import of an export tagged `@deprecated` or
 *   `@stability Deprecated`. It goes at the next major; the message carries the tag's advice.
 *   A whole package can be deprecated too: one renamed by Genesis (`RENAMED_PACKAGES`), or one whose
 *   installed package.json carries npm's `deprecated` notice. Every import of it is reported, named
 *   or not, with the notice as the advice.
 * - `beta-import` (info): a named import of an export tagged `@stability Beta` or
 *   `Experimental`, which may still change in a minor. Info by default, since most of Genesis is
 *   beta today; an app that wants it louder sets `"rules": { "beta-import": "warn" }`.
 *
 * Only top-level declarations count: a deprecated prop inside an interface is the type checker's
 * to show.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { stripForImports } from "./trail.js";
import type { DoctorContext } from "./types.js";

export type Stability = "experimental" | "beta" | "stable" | "deprecated";

/** A declaration's tag: its stability and, for a deprecation, the advice that follows the tag. */
export interface StabilityTag {
  stability: Stability;
  note?: string;
}

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const DECLARATION =
  /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\n(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;

/** A named re-export with its own doc comment: `/** @deprecated … *\/ export { Old } from "./old"`. */
const REEXPORT = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\nexport\s+(?:type\s+)?\{([^}]*)\}/g;

/** One `{ … }` specifier as `[name]` or `[name, alias]`: `type A as B` gives `["A", "B"]`. */
function specifierParts(spec: string): string[] {
  return spec.trim().replace(/^type\s+/, "").split(/\s+as\s+/).map((part) => part.trim());
}

/** The tag one doc comment carries, if any. */
function tagOf(comment: string): StabilityTag | undefined {
  const doc = comment.replace(/^[ \t]*\*?[ \t]*/gm, "");
  // A tag starts a line; "see the `@deprecated` block" in prose isn't one. The advice runs to the next tag.
  const deprecated = /^@deprecated\b[ \t]*([\s\S]*?)(?=^@|(?![\s\S]))/m.exec(doc);
  const stability = /^@stability\s+(Experimental|Beta|Stable|Deprecated)\b/im.exec(doc)?.[1]?.toLowerCase() as Stability | undefined;
  const note = deprecated?.[1]!.replace(/\s+/g, " ").trim();
  if (deprecated) return { stability: "deprecated", ...(note ? { note } : {}) };
  return stability ? { stability } : undefined;
}

/**
 * The tags of the top-level declarations in one declaration file, and of its named re-exports
 * (by the name they export, so `export { Old as Legacy }` tags `Legacy`).
 */
export function stabilityTagsIn(dts: string): Map<string, StabilityTag> {
  const tags = new Map<string, StabilityTag>();
  for (const m of dts.matchAll(DECLARATION)) {
    const tag = tagOf(m[1]!);
    if (tag) tags.set(m[2]!, tag);
  }
  for (const [name, tag] of taggedReexports(dts)) tags.set(name, tag);
  return tags;
}

/** Each name a tagged named re-export exports, with its tag. */
function* taggedReexports(dts: string): Generator<[string, StabilityTag]> {
  for (const m of dts.matchAll(REEXPORT)) {
    const tag = tagOf(m[1]!);
    if (!tag) continue;
    for (const spec of m[2]!.split(",")) {
      const name = specifierParts(spec).pop()!;
      if (name) yield [name, tag];
    }
  }
}

/**
 * Named imports from Genesis packages in one file: the package, the imported names and the line.
 * String, template and comment contents are blanked first, so an import written as an example in a
 * string isn't read as one; a file whose literals can't be told apart is read as written.
 */
export function genesisNamedImports(source: string): Array<{ pkg: string; specifier: string; names: string[]; line: number }> {
  const out: Array<{ pkg: string; specifier: string; names: string[]; line: number }> = [];
  const code = stripForImports(source) ?? source;
  const re = /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']((@marktiderman\/genesis[\w-]*)(?:\/[^"']*)?)["']/g;
  for (const m of code.matchAll(re)) {
    const names = m[1]!
      .split(",")
      .map((n) => specifierParts(n)[0]!)
      .filter(Boolean);
    out.push({ pkg: m[3]!, specifier: m[2]!, names, line: code.slice(0, m.index).split("\n").length });
  }
  return out;
}

/**
 * Genesis packages renamed in place: the old name is a deprecated re-export of the new one for two
 * minor versions, and `genesis upgrade` rewrites the imports. Listed here as well as read from the
 * package's `deprecated` notice, so an import left behind is reported even when the old package
 * isn't installed any more.
 */
export const RENAMED_PACKAGES: Readonly<Record<string, string>> = {
  "@marktiderman/genesis-features": "@marktiderman/genesis-config",
};

/**
 * Every import of a Genesis package in one file, named or not: `import … from`, `export … from`,
 * a bare `import "…"`, `import("…")` and `require("…")`. Literals and comments are blanked first, as
 * for named imports.
 */
export function genesisImportSpecifiers(source: string): Array<{ pkg: string; specifier: string; line: number }> {
  const code = stripForImports(source) ?? source;
  const out: Array<{ pkg: string; specifier: string; line: number }> = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']((@marktiderman\/genesis[\w-]*)(?:\/[^"']*)?)["']/g;
  for (const m of code.matchAll(re)) out.push({ pkg: m[2]!, specifier: m[1]!, line: code.slice(0, m.index).split("\n").length });
  return out;
}

/** Why a whole package is deprecated, or undefined when it isn't. */
function packageDeprecation(root: string, pkg: string): string | undefined {
  const renamed = RENAMED_PACKAGES[pkg];
  const dir = findPackageDir(root, pkg);
  let notice: string | undefined;
  if (dir) {
    try {
      const deprecated = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { deprecated?: unknown }).deprecated;
      if (typeof deprecated === "string" && deprecated.trim()) notice = deprecated.trim();
    } catch {
      // An unreadable package.json says nothing.
    }
  }
  if (notice) return notice;
  return renamed ? `renamed to ${renamed}: run \`genesis codemod genesis-features-renamed-genesis-config\` to move the imports and the dependency` : undefined;
}

function declarationFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) declarationFiles(full, out);
    else if (/\.d\.[cm]?ts$/.test(name)) out.push(full);
  }
  return out;
}

/** One package's declarations: each file's tags, every file that declares a name, and its exports. */
interface PackageTags {
  dir: string;
  byFile: Map<string, Map<string, StabilityTag>>;
  declaredIn: Map<string, string[]>;
  exports: Record<string, unknown>;
}

function readPackageTags(dir: string): PackageTags {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { exports?: unknown };
  const tags: PackageTags = { dir, byFile: new Map(), declaredIn: new Map(), exports: typeof pkg.exports === "object" && pkg.exports ? (pkg.exports as Record<string, unknown>) : {} };
  const dist = path.join(dir, "dist");
  if (!existsSync(dist)) return tags;
  for (const file of declarationFiles(dist)) {
    const text = readFileSync(file, "utf8");
    tags.byFile.set(file, stabilityTagsIn(text));
    const names = new Set<string>();
    for (const m of text.matchAll(/^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1]!);
    }
    // A tagged re-export counts as a declaration of its name in that file; an untagged one doesn't,
    // so a chunk's tag still shows through a plain `export { X } from "./chunk"`.
    for (const [name] of taggedReexports(text)) names.add(name);
    for (const name of names) tags.declaredIn.set(name, [...(tags.declaredIn.get(name) ?? []), file]);
  }
  return tags;
}

/** The declaration file an import specifier's subpath points at (`exports[subpath].types`). */
function entryFile(tags: PackageTags, pkg: string, specifier: string): string | null {
  const subpath = `.${specifier.slice(pkg.length)}` || ".";
  const target = tags.exports[subpath === "." ? "." : subpath];
  const types = typeof target === "object" && target ? (target as Record<string, unknown>).types : null;
  return typeof types === "string" ? path.join(tags.dir, types) : null;
}

/**
 * A name's tag as imported from a specifier: the tag on its declaration in that subpath's own
 * entry file when it is declared there, else the tag every declaration of it agrees on (so a
 * deprecated alias on one subpath doesn't mark the real declaration elsewhere).
 */
export function tagFor(tags: PackageTags, entry: string | null, name: string): StabilityTag | undefined {
  if (entry && tags.declaredIn.get(name)?.includes(entry)) return tags.byFile.get(entry)?.get(name);
  const all = (tags.declaredIn.get(name) ?? []).map((f) => tags.byFile.get(f)?.get(name));
  if (!all.length || all.some((t) => !t)) return undefined;
  return all.every((t) => t!.stability === all[0]!.stability) ? all[0] : undefined;
}

export function checkStabilityImports(ctx: DoctorContext): void {
  const cache = new Map<string, PackageTags | null>();
  const tagsOf = (pkg: string) => {
    if (!cache.has(pkg)) {
      const dir = findPackageDir(ctx.root, pkg);
      cache.set(pkg, dir ? readPackageTags(dir) : null);
    }
    return cache.get(pkg)!;
  };
  const deprecatedPackages = new Map<string, string | undefined>();
  const deprecationOf = (pkg: string) => {
    if (!deprecatedPackages.has(pkg)) deprecatedPackages.set(pkg, packageDeprecation(ctx.root, pkg));
    return deprecatedPackages.get(pkg);
  };
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    const wholePackage = new Set<string>();
    for (const { pkg, specifier, line } of genesisImportSpecifiers(file.code)) {
      const notice = deprecationOf(pkg);
      if (!notice) continue;
      wholePackage.add(pkg);
      ctx.report({ rule: "deprecated-import", level: "warn", file: file.path, line, subject: specifier, message: `${pkg} is deprecated: ${notice}` });
    }
    for (const { pkg, specifier, names, line } of genesisNamedImports(file.code)) {
      // A deprecated package is reported once per import above, not once per name.
      if (wholePackage.has(pkg)) continue;
      const tags = tagsOf(pkg);
      if (!tags) continue;
      const entry = entryFile(tags, pkg, specifier);
      for (const name of names) {
        const tag = tagFor(tags, entry, name);
        if (tag?.stability === "deprecated") {
          ctx.report({ rule: "deprecated-import", level: "warn", file: file.path, line, subject: name, message: `${name} from ${pkg} is deprecated and goes at the next major${tag.note ? `: ${tag.note}` : ""}` });
        } else if (tag && (tag.stability === "beta" || tag.stability === "experimental")) {
          ctx.report({ rule: "beta-import", level: "info", file: file.path, line, subject: name, message: `${name} from ${pkg} is ${tag.stability}: it may still change in a minor release` });
        }
      }
    }
  }
}
