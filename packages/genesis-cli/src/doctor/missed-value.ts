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

/** `import * as ns from "pkg"`: a namespace, each of whose names is called as `ns.name`. */
const NAMESPACE_IMPORT = /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g;

/**
 * The names `code` imports from `packages` (or their subpaths), each with the local names it's bound
 * to (`a as b`). Of `names`, one a namespace import reaches is bound to `ns.name` when the code uses it.
 */
export function namesImportedFrom(code: string, packages: readonly string[], names: readonly string[] = []): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of code.matchAll(NAMESPACE_IMPORT)) {
    if (inStringOrComment(code, m.index ?? 0)) continue;
    const from = m[2]!;
    if (!packages.some((p) => from === p || from.startsWith(`${p}/`))) continue;
    for (const name of names) {
      const local = `${m[1]!}.${name}`;
      if (!new RegExp(`(?<![\\w$.])${local.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}(?![\\w$])`).test(code)) continue;
      const set = out.get(name) ?? new Set<string>();
      set.add(local);
      out.set(name, set);
    }
  }
  for (const m of code.matchAll(NAMED_IMPORT)) {
    // An import written inside a string or a comment (an example in docs) isn't one.
    if (inStringOrComment(code, m.index ?? 0)) continue;
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

/**
 * Which characters of `code` are code (1) rather than inside a string, a template literal's text,
 * a comment or a regex literal (0). A `/` starts a regex where an expression can begin (after an
 * operator, `(`, `,`, `=`, `return` and the like), else it divides. Template `${…}` holes are code.
 */
export function codeMask(code: string): Uint8Array {
  const mask = new Uint8Array(code.length).fill(1);
  const templates: number[] = []; // brace depth at each open `${`
  let depth = 0;
  let lastSignificant = ""; // the last code character that isn't space
  let lastWord = "";
  const regexCanStart = () => lastSignificant === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(lastWord);
  let i = 0;
  const skipQuoted = (quote: string) => {
    mask[i] = 0;
    i++;
    while (i < code.length && code[i] !== quote) {
      mask[i] = 0;
      if (code[i] === "\\") {
        if (i + 1 < code.length) mask[i + 1] = 0;
        i++;
      }
      i++;
    }
    if (i < code.length) mask[i] = 0;
    i++;
  };
  /** From just after a backtick (or a hole's closing `}`) to the next backtick (true) or `${` (false). */
  const skipTemplateText = (): boolean => {
    while (i < code.length) {
      const c = code[i]!;
      if (c === "\\") {
        mask[i] = 0;
        if (i + 1 < code.length) mask[i + 1] = 0;
        i += 2;
        continue;
      }
      if (c === "`") {
        mask[i] = 0;
        i++;
        return true;
      }
      if (c === "$" && code[i + 1] === "{") {
        mask[i] = 0;
        mask[i + 1] = 0;
        i += 2;
        templates.push(depth);
        depth++;
        lastSignificant = "{";
        lastWord = "";
        return false;
      }
      mask[i] = 0;
      i++;
    }
    return true;
  };
  while (i < code.length) {
    const c = code[i]!;
    if (c === '"' || c === "'") {
      skipQuoted(c);
      lastSignificant = "a";
      lastWord = "";
      continue;
    }
    if (c === "`") {
      mask[i] = 0;
      i++;
      // Closed: the template is a value. Opened a hole: skipTemplateText left "an expression starts".
      if (skipTemplateText()) {
        lastSignificant = "a";
        lastWord = "";
      }
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") mask[i++] = 0;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      const stop = close < 0 ? code.length : close + 2;
      while (i < stop) mask[i++] = 0;
      continue;
    }
    if (c === "/" && regexCanStart()) {
      mask[i] = 0;
      i++;
      let inClass = false;
      while (i < code.length && code[i] !== "\n") {
        const r = code[i]!;
        mask[i] = 0;
        if (r === "\\") {
          if (i + 1 < code.length) mask[i + 1] = 0;
          i += 2;
          continue;
        }
        i++;
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
      }
      while (i < code.length && /[a-z]/i.test(code[i]!)) mask[i++] = 0; // flags
      lastSignificant = "a";
      lastWord = "";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (templates.length && templates[templates.length - 1] === depth) {
        // The end of a `${…}` hole: back into the template's text.
        templates.pop();
        mask[i] = 0;
        i++;
        if (skipTemplateText()) {
          lastSignificant = "a";
          lastWord = "";
        }
        continue;
      }
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j]!)) j++;
      lastWord = code.slice(i, j);
      lastSignificant = "a";
      i = j;
      continue;
    }
    // `++` / `--`: one token. After a value (postfix) the expression goes on as a value, so a `/`
    // next divides; before one (prefix) it's an operator.
    if ((c === "+" || c === "-") && code[i + 1] === c) {
      const postfix = lastSignificant === "a" || lastSignificant === ")" || lastSignificant === "]";
      lastSignificant = postfix ? "a" : c;
      lastWord = "";
      i += 2;
      continue;
    }
    lastSignificant = c;
    lastWord = "";
    i++;
  }
  return mask;
}

const masks = new Map<string, Uint8Array>();
function maskOf(code: string): Uint8Array {
  let m = masks.get(code);
  if (!m) {
    m = codeMask(code);
    if (masks.size > 200) masks.clear();
    masks.set(code, m);
  }
  return m;
}

/** `code` with every string, template text, comment and regex literal replaced by spaces (same length, newlines kept). */
export function blankStrings(code: string): string {
  const mask = maskOf(code);
  let out = "";
  for (let i = 0; i < code.length; i++) out += mask[i] || code[i] === "\n" ? code[i] : " ";
  return out;
}

/** Whether `index` in `code` falls inside a string, a template's text, a comment or a regex literal. */
function inStringOrComment(code: string, index: number): boolean {
  return maskOf(code)[index] === 0;
}

/**
 * The argument text of every call to `name` in `code` (`createUpdates({ … })`), with where it
 * starts: balanced parentheses counted in code only; a mention inside a string, a comment or a
 * regex literal isn't a call.
 */
export function callArguments(code: string, name: string): { start: number; text: string }[] {
  const mask = maskOf(code);
  const out: { start: number; text: string }[] = [];
  let from = 0;
  for (;;) {
    const at = code.indexOf(name, from);
    if (at < 0) return out;
    from = at + name.length;
    const before = at > 0 ? code[at - 1]! : "";
    if (/[A-Za-z0-9_$.]/.test(before) || !mask[at]) continue;
    let i = from;
    while (i < code.length && /\s/.test(code[i]!)) i++;
    if (code[i] !== "(") continue;
    const open = i;
    let depth = 0;
    for (; i < code.length; i++) {
      if (!mask[i]) continue;
      if (code[i] === "(") depth++;
      else if (code[i] === ")" && --depth === 0) break;
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
  const adopting = names.length ? ctx.files.filter((f) => { const got = namesImportedFrom(f.code, block.packages, names); return names.some((n) => got.has(n)); }) : [];
  /** The local names a file calls the block's detectors by (`createUpdates as makeUpdates` included). */
  const locals = (code: string) => {
    const got = namesImportedFrom(code, block.packages, names);
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
          const m = re.exec(blankStrings(f.code).slice(call.start, call.start + call.text.length));
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
