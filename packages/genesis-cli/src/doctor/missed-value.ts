/**
 * `missed-value`: what Genesis offers this app that it isn't getting. Every block of every Genesis
 * package (installed, and the CLI's catalog for packages the app doesn't have) for the app's
 * platforms is one of:
 *
 * - used: in genesis.lock.json, or a file imports one of its `detect.imports` from its packages;
 * - switched off: used, but a `detect.off` pattern matches (a consumer app had channel switching on
 *   only in development, where it can't work), reported at the line with what it costs;
 * - missed: its package isn't installed, or it declares `detect` and nothing imports it;
 * - unknown: installed, with no `detect` to tell (not reported).
 *
 * Plus the release lane's PR previews for a native app (`.eas/workflows/pr-preview.yml`, written by
 * `genesis add template release`): without it, no pull request can be tried on a phone.
 *
 * An app that doesn't want one says so, with a reason, in genesis.config.json:
 * `"doctor": { "declined": { "<block id>": "why" } }`; a declined id that matches nothing is
 * reported so the list stays true. Findings are `info` (raise with `doctor.rules`), and the report
 * always ends with the count, so missed value is never only in `--verbose`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { allBlocks, catalogBlocks } from "../blocks/discover.js";
import { readLock } from "../blocks/lock.js";
import type { BlockManifest } from "../blocks/manifest.js";
import type { DoctorContext } from "./types.js";

export const MISSED_VALUE_RULE = "missed-value";
/** The subject prefix of a stale doctor.declined entry's finding (not counted as missed value). */
export const STALE_DECLINED = "doctor.declined.";

export type MissedReason = "missed" | "off";

export interface MissedValue {
  id: string;
  name: string;
  summary: string;
  package: string;
  reason: MissedReason;
  /** What to do: the block's steps, or `genesis add block <id>`. */
  how: string;
}

type AppPlatform = "web" | "native";

/** The platforms this app builds for, from its package.json. */
export function appPlatforms(root: string): Set<AppPlatform> {
  const out = new Set<AppPlatform>();
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["expo"] || deps["react-native"]) out.add("native");
    if (deps["react-dom"] || deps["next"] || deps["vite"] || deps["@tanstack/react-start"]) out.add("web");
  } catch {
    // no package.json: nothing to say
  }
  return out;
}

/** `import { a, b as c } from "pkg"` and `export { a } from "pkg"`: each named import with the module it comes from. */
const NAMED_IMPORT = /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** The names `code` imports from `packages` (or their subpaths), each with the local names it's bound to (`a as b`). */
export function namesImportedFrom(code: string, packages: readonly string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of code.matchAll(NAMED_IMPORT)) {
    const from = m[2]!;
    if (!packages.some((p) => from === p || from.startsWith(`${p}/`))) continue;
    for (const part of m[1]!.split(",")) {
      const [imported, local] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).map((x) => x.trim());
      if (!imported) continue;
      const set = out.get(imported) ?? new Set<string>();
      set.add(local || imported);
      out.set(imported, set);
    }
  }
  return out;
}

/** `code` with the contents of every string, template literal and comment replaced by spaces (same length). */
export function blankStrings(code: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (quote) {
      if (c === "\\") {
        out += "  ";
        i++;
      } else if (c === quote) {
        quote = null;
        out += c;
      } else out += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
    } else if (c === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      const end = nl < 0 ? code.length : nl;
      out += " ".repeat(end - i);
      i = end - 1;
    } else if (c === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      const end = close < 0 ? code.length : close + 2;
      out += code.slice(i, end).replace(/[^\n]/g, " ");
      i = end - 1;
    } else out += c;
  }
  return out;
}

/** Whether `index` in `code` falls inside a string, a template literal or a comment. */
function inStringOrComment(code: string, index: number): boolean {
  let quote: string | null = null;
  for (let i = 0; i < index; i++) {
    const c = code[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      if (nl < 0 || nl >= index) return true;
      i = nl;
    } else if (c === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      if (close < 0 || close + 1 >= index) return true;
      i = close + 1;
    }
  }
  return quote !== null;
}

/**
 * The argument text of every call to `name` in `code` (`createUpdates({ … })`), with where it
 * starts: balanced parentheses; a mention inside a string or a comment isn't a call.
 */
export function callArguments(code: string, name: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  let from = 0;
  for (;;) {
    const at = code.indexOf(name, from);
    if (at < 0) return out;
    from = at + name.length;
    const before = at > 0 ? code[at - 1]! : "";
    if (/[A-Za-z0-9_$.]/.test(before) || inStringOrComment(code, at)) continue;
    let i = from;
    while (i < code.length && /\s/.test(code[i]!)) i++;
    if (code[i] !== "(") continue;
    const open = i;
    let depth = 0;
    let quote: string | null = null;
    for (; i < code.length; i++) {
      const c = code[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && code[i + 1] === "/") i = code.indexOf("\n", i) < 0 ? code.length : code.indexOf("\n", i);
      else if (c === "/" && code[i + 1] === "*") i = code.indexOf("*/", i + 2) < 0 ? code.length : code.indexOf("*/", i + 2) + 1;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
    }
    out.push({ start: open + 1, text: code.slice(open + 1, i) });
    from = i;
  }
}


/** Whether the app uses `block`, and where it switched it off. */
export function classify(
  block: Pick<BlockManifest, "id" | "packages" | "detect">,
  ctx: Pick<DoctorContext, "files">,
  locked: ReadonlySet<string>,
  installed: boolean,
): { state: "used" | "missed" | "unknown"; off: { file: string; line: number; message: string }[] } {
  const off: { file: string; line: number; message: string }[] = [];
  const names = block.detect?.imports ?? [];
  // A detector name counts only when it is imported from one of the block's own packages.
  const adopting = names.length ? ctx.files.filter((f) => { const got = namesImportedFrom(f.code, block.packages); return names.some((n) => got.has(n)); }) : [];
  /** The local names a file calls the block's detectors by (`createUpdates as makeUpdates` included). */
  const locals = (code: string) => {
    const got = namesImportedFrom(code, block.packages);
    return names.flatMap((n) => [...(got.get(n) ?? [])]);
  };
  const used = locked.has(block.id) || adopting.length > 0;
  if (used) {
    for (const o of block.detect?.off ?? []) {
      const re = new RegExp(o.pattern, "m");
      // Only inside the block's own setup call (`createUpdates({ … })`): another config's
      // `enabled: __DEV__`, in the same file or not, isn't this block's.
      for (const f of adopting) {
        const calls = locals(f.code).flatMap((n) => callArguments(f.code, n));
        for (const call of calls) {
          // Strings in the call (a log message quoting a config) aren't configuration: blank them, keeping positions.
          const m = re.exec(blankStrings(call.text));
          if (!m) continue;
          off.push({ file: f.path, line: f.code.slice(0, call.start + m.index).split("\n").length, message: o.message });
          break;
        }
      }
    }
    return { state: "used", off };
  }
  if (!installed) return { state: "missed", off };
  return { state: block.detect ? "missed" : "unknown", off };
}

export function missedValueCheck(deps: { blocks?: (root: string) => Promise<{ manifest: BlockManifest; from: string }[]>; catalog?: () => BlockManifest[] } = {}) {
  return async (ctx: DoctorContext): Promise<void> => {
    const platforms = appPlatforms(ctx.root);
    if (!platforms.size) return;
    const declined = ctx.config.declined ?? {};
    const seen = new Set<string>();
    const lock = readLock(ctx.root);
    const locked = new Set(Object.keys(lock.blocks));
    const found = await (deps.blocks ?? ((root) => allBlocks(root)))(ctx.root);
    // An installed package older than this CLI may not say how to detect its blocks: this CLI's
    // catalog does, so an app is told what it misses before it upgrades (that's when it matters).
    const known = new Map((deps.catalog ?? (() => catalogBlocks()))().map((m) => [m.id, m.detect]));
    for (const { manifest: found1, from } of found) {
      const block = found1.detect || !known.get(found1.id) ? found1 : { ...found1, detect: known.get(found1.id)! };
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      if (block.platforms && !block.platforms.some((p) => platforms.has(p as AppPlatform))) continue;
      if (!block.feature) continue;
      const { state, off } = classify(block, ctx, locked, from !== "catalog");
      const label = `${block.feature.name} (${block.id}, ${block.package})`;
      for (const o of off) {
        if (declined[block.id]) continue;
        ctx.report({ rule: MISSED_VALUE_RULE, level: "info", file: o.file, line: o.line, subject: block.id, message: `${label} is adopted but switched off here: ${o.message}` });
      }
      if (state !== "missed" || declined[block.id]) continue;
      const how = block.steps.length ? block.steps.join(" ") : `genesis add block ${block.id}`;
      ctx.report({
        rule: MISSED_VALUE_RULE,
        level: "info",
        file: from === "catalog" ? "package.json" : "genesis.config.json",
        subject: block.id,
        message: `${label} is available and unused: ${block.feature.summary} To adopt: ${how} Not wanted? Add it to doctor.declined with the reason`,
      });
    }
    if (platforms.has("native") && !declined["pr-previews"]) {
      const repo = repoRoot(ctx.root);
      const lane = [ctx.root, repo].some((dir) => existsSync(path.join(dir, ".eas", "workflows", "pr-preview.yml")));
      if (!lane) {
        ctx.report({
          rule: MISSED_VALUE_RULE,
          level: "info",
          file: ".eas/workflows",
          subject: "pr-previews",
          message:
            "PR previews (the release lane's pr-preview.yml) are missing: no pull request can be tried on a phone. Run genesis add template release, or genesis add template previews for an app that keeps its own release workflow (docs/NATIVE-RELEASE.md, \"Previews\"). Not wanted? Add pr-previews to doctor.declined with the reason",
        });
      }
    }
    for (const id of Object.keys(declined)) {
      if (id !== "pr-previews" && !seen.has(id)) {
        // Its own subject, so the "Missed value" count leaves it out: it's housekeeping, not a feature to adopt.
        ctx.report({ rule: MISSED_VALUE_RULE, level: "info", file: "genesis.config.json", subject: `${STALE_DECLINED}${id}`, message: `doctor.declined names ${id}, which no Genesis package offers any more; remove it` });
      }
    }
  };
}

function repoRoot(root: string): string {
  let dir = root;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return root;
}
