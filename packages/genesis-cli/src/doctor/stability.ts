/**
 * What an app imports from Genesis that isn't stable yet (feature `stability-tags`).
 *
 * Export maturity is a JSDoc tag, not a name prefix or a subpath: `@deprecated` (with what to use
 * instead), or `@stability Experimental | Beta | Stable | Deprecated`. The doctor reads the tags
 * from each imported Genesis package's published declarations (`dist/**\/*.d.ts`) and reports:
 *
 * - `deprecated-import` (warn): a named import of an export tagged `@deprecated` or
 *   `@stability Deprecated`. It goes at the next major; the message carries the tag's advice.
 * - `beta-import` (info): a named import of an export tagged `@stability Beta` or
 *   `Experimental`, which may still change in a minor. Info by default, since most of Genesis is
 *   beta today; an app that wants it louder sets `"rules": { "beta-import": "warn" }`.
 *
 * Only top-level declarations count: a deprecated prop inside an interface is the type checker's
 * to show.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
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

/** The tags of the top-level declarations in one declaration file. */
export function stabilityTagsIn(dts: string): Map<string, StabilityTag> {
  const tags = new Map<string, StabilityTag>();
  for (const m of dts.matchAll(DECLARATION)) {
    const doc = m[1]!.replace(/^\s*\* ?/gm, "");
    const deprecated = /@deprecated\b\s*([^\n@]*)/.exec(doc);
    const stability = /@stability\s+(Experimental|Beta|Stable|Deprecated)\b/i.exec(doc)?.[1]?.toLowerCase() as Stability | undefined;
    if (deprecated) tags.set(m[2]!, { stability: "deprecated", ...(deprecated[1]!.trim() ? { note: deprecated[1]!.trim() } : {}) });
    else if (stability) tags.set(m[2]!, { stability });
  }
  return tags;
}

/** Named imports from Genesis packages in one file: the package, the imported names and the line. */
export function genesisNamedImports(code: string): Array<{ pkg: string; names: string[]; line: number }> {
  const out: Array<{ pkg: string; names: string[]; line: number }> = [];
  const re = /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["'](@marktiderman\/genesis[\w-]*)(?:\/[^"']*)?["']/g;
  for (const m of code.matchAll(re)) {
    const names = m[1]!
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
      .filter(Boolean);
    out.push({ pkg: m[2]!, names, line: code.slice(0, m.index).split("\n").length });
  }
  return out;
}

function declarationFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) declarationFiles(full, out);
    else if (/\.d\.[cm]?ts$/.test(name)) out.push(full);
  }
  return out;
}

/** The installed package's folder, looking up from the app root. */
function packageDir(root: string, pkg: string): string | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", ...pkg.split("/"));
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

export function checkStabilityImports(ctx: DoctorContext): void {
  const cache = new Map<string, Map<string, StabilityTag>>();
  const tagsOf = (pkg: string) => {
    let tags = cache.get(pkg);
    if (!tags) {
      tags = new Map();
      const dir = packageDir(ctx.root, pkg);
      const dist = dir && path.join(dir, "dist");
      if (dist && existsSync(dist)) {
        for (const file of declarationFiles(dist)) for (const [name, tag] of stabilityTagsIn(readFileSync(file, "utf8"))) if (!tags.has(name)) tags.set(name, tag);
      }
      cache.set(pkg, tags);
    }
    return tags;
  };
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    for (const { pkg, names, line } of genesisNamedImports(file.code)) {
      const tags = tagsOf(pkg);
      for (const name of names) {
        const tag = tags.get(name);
        if (tag?.stability === "deprecated") {
          ctx.report({ rule: "deprecated-import", level: "warn", file: file.path, line, subject: name, message: `${name} from ${pkg} is deprecated and goes at the next major${tag.note ? `: ${tag.note}` : ""}` });
        } else if (tag && (tag.stability === "beta" || tag.stability === "experimental")) {
          ctx.report({ rule: "beta-import", level: "info", file: file.path, line, subject: name, message: `${name} from ${pkg} is ${tag.stability}: it may still change in a minor release` });
        }
      }
    }
  }
}
