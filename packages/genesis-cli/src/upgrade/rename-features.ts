/**
 * `@marktiderman/genesis-features` is now `@marktiderman/genesis-config` (genesis-features 0.10.0,
 * the first release of the deprecated alias). The same source publishes under the new name, and the
 * old one re-exports it for two minor versions. This codemod moves an app over:
 *
 * - in the app's scripts, every mention of the package as a module name: quoted specifiers and
 *   subpaths (imports, `export … from`, `import()`, `require`, `vi.mock`, `declare module`, a
 *   bundler's list of names, a template literal), escaped in a regular expression
 *   (`/@marktiderman\/genesis-features/`), or anchored in a mapper key (`"^@marktiderman/genesis-features(.*)$"`);
 * - each package.json: the dependency (dependencies, devDependencies, peerDependencies,
 *   optionalDependencies), renamed in place to genesis-config with the release's genesis-config
 *   range, or dropped when genesis-config already covers it (listed in the same field, or in
 *   `dependencies` for a dev dependency); a production dependency stays one; and the keys of
 *   `overrides`, `pnpm.overrides` and `resolutions` (a key genesis-config already has is dropped,
 *   not doubled; an npm override of a direct dependency becomes `$@marktiderman/genesis-config`);
 * - `tsconfig*.json` (`paths`) and `pnpm-workspace.yaml` (`overrides`, `catalog`, with
 *   genesis-config's range as the value), leaving exact version pins of the old package (`'@marktiderman/genesis-features@0.10.0'`) alone: they name
 *   versions of the old package that may still be installed.
 *
 * What it leaves is printed as a checklist (docs, comments in other file types, a pin).
 * `genesis upgrade` runs it when genesis-features crosses 0.10.0 and whenever a package.json still
 * lists genesis-features (an app already on the alias); `genesis codemod
 * genesis-features-renamed-genesis-config` runs it by hand. The doctor's `deprecated-import` rule
 * reports any import of the old name that is left.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { appScripts, writeAppFile } from "./app-scripts.js";
import type { Codemod } from "./codemods.js";

export const OLD_FEATURES_PACKAGE = "@marktiderman/genesis-features";
export const CONFIG_PACKAGE = "@marktiderman/genesis-config";
export const FEATURES_RENAMED_CODEMOD = "genesis-features-renamed-genesis-config";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", ".expo", "coverage", "ios", "android"]);
/** Text files worth a look for what's left; lockfiles and changelogs are history. */
const CHECKLIST_FILE = /\.(?:[cm]?[jt]sx?|json|jsonc|ya?ml|md|mdx|toml)$/;
const CHECKLIST_SKIP = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|bun\.lockb?|yarn\.lock|CHANGELOG\.md)$/;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * The old name as a module name, not another package's (`genesis-features-extra`) and not an
 * exact pin of the old package (`@marktiderman/genesis-features@0.10.0`). The slash may be escaped,
 * as in a regular expression literal.
 */
const OLD_NAME = /@marktiderman(\\?\/)genesis-features(?![\w-]|@\d)/g;

/** The old package's exact name anywhere (an exact pin too), not another package's (`genesis-features-extra`). */
const MENTIONS_OLD = /@marktiderman\/genesis-features(?![\w-])/;

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** The genesis-config range a package.json's text already lists in a dependency field, if any (not a workspace or catalog one). */
function listedConfigRange(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    for (const field of DEP_FIELDS) {
      const deps = json[field];
      const range = isObject(deps) && Object.prototype.hasOwnProperty.call(deps, CONFIG_PACKAGE) ? deps[CONFIG_PACKAGE] : undefined;
      if (typeof range === "string" && !/^(?:workspace|link|file|catalog):/.test(range)) return range;
    }
  } catch {
    // Not JSON: nothing listed.
  }
  return undefined;
}

/** The text with every mention of genesis-features as a module name moved to genesis-config. */
export function rewriteFeaturesSpecifiers(text: string): string {
  return text.replace(OLD_NAME, (_all, slash: string) => `@marktiderman${slash}genesis-config`);
}

function walk(root: string, keep: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) visit(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        if (keep(rel) && statSync(abs).size <= MAX_BYTES) out.push(rel);
      }
    }
  };
  visit(root);
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A plain version (`0.11.2`) as a caret range; anything else (a range already, a tag) as is. */
const asRange = (version: string) => (/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version) ? `^${version}` : version);

/**
 * The range to write for genesis-config: the release's (`wanted`, from `genesis upgrade`), else
 * `^` the version installed beside the app (looking up from `dir`, as Node resolves), else the
 * installed alias's own dependency range on it, else the old range.
 */
export function configRangeFor(root: string, dir: string, oldRange: string, wanted?: (name: string) => string | null | undefined): string {
  const release = wanted?.(CONFIG_PACKAGE);
  if (release) return asRange(release);
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    const installed = path.join(at, "node_modules", CONFIG_PACKAGE, "package.json");
    if (existsSync(installed)) {
      const version = (JSON.parse(readFileSync(installed, "utf8")) as { version?: string }).version;
      if (version) return `^${version}`;
    }
    const alias = path.join(at, "node_modules", OLD_FEATURES_PACKAGE, "package.json");
    if (existsSync(alias)) {
      const range = (JSON.parse(readFileSync(alias, "utf8")) as { dependencies?: Record<string, string> }).dependencies?.[CONFIG_PACKAGE];
      if (range && !range.startsWith("workspace:")) return range;
    }
    if (at === path.resolve(root) || path.dirname(at) === at) break;
  }
  return oldRange;
}

/** The version an override of the old package gets: the genesis-config range, exact when the old one was exact. */
function overrideValue(old: string, rangeFor: (oldRange: string) => string): string {
  if (/^(?:workspace|link|file|npm|catalog):/.test(old)) return old;
  const range = rangeFor(old);
  return /^\d/.test(old) ? range.replace(/^[\^~]/, "") : range;
}

/** A key naming the old package (or a subpath, `name@range`, `**\/name`), not another package. */
const OLD_KEY = /^((?:.*\/)?)@marktiderman\/genesis-features(?![\w-])(.*)$/;

/**
 * An override map with each key that names the old package renamed in place, and its value moved
 * to genesis-config's range (the old value is a version of the alias: kept, it would pin
 * genesis-config to it). Nested maps (`"parent>child"` style objects) are walked too.
 */
function renameOverrideKeys(obj: Record<string, unknown>, rangeFor: (oldRange: string) => string): Record<string, unknown> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const m = OLD_KEY.exec(k);
    if (!m) {
      out.push([k, isObject(v) ? renameOverrideKeys(v, rangeFor) : v]);
      continue;
    }
    const key = `${m[1]}${CONFIG_PACKAGE}${m[2]}`;
    // genesis-config already has this override: it stays, and the old one goes (never two of one key).
    if (Object.prototype.hasOwnProperty.call(obj, key)) continue;
    out.push([key, isObject(v) ? renameOverrideKeys(v, rangeFor) : typeof v === "string" ? overrideValue(v, rangeFor) : v]);
  }
  return Object.fromEntries(out);
}

/**
 * pnpm-workspace.yaml with the old package moved: a mapping entry (`overrides`, `catalog`) gets the
 * new key and genesis-config's range; any other mention as a module name is renamed; exact pins of
 * the old package (`'@marktiderman/genesis-features@0.10.0'`, in `minimumReleaseAgeExclude`) stay.
 */
export function rewriteWorkspaceYaml(text: string, rangeFor: (oldRange: string) => string): string {
  const entry = /^(\s*)(['"]?)@marktiderman\/genesis-features(?![\w-])([^'":]*)\2(\s*:\s*)(['"]?)([^'"\s#]+)\5(.*)$/;
  // An entry of a flow mapping (`catalog: { '@marktiderman/genesis-features': ^0.11.0 }`).
  const inline = /(['"]?)@marktiderman\/genesis-features(?![\w-])([^'":,{}]*)\1(\s*:\s*)(['"]?)([^'",{}\s#]+)\4/g;
  const configEntry = /^(\s*)(['"]?)@marktiderman\/genesis-config(?![\w-])([^'":]*)\2\s*:/;
  const lines = text.split("\n");
  // The block-mapping keys genesis-config already has (indent and subpath): the old entry beside one goes.
  const taken = new Set(
    lines
      .map((l) => configEntry.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]}|${m[3]}`),
  );
  const out: string[] = [];
  for (const line of lines) {
    const m = entry.exec(line);
    if (m) {
      const [, indent, q, rest, colon, vq, value, tail] = m;
      if (taken.has(`${indent}|${rest}`)) continue;
      out.push(`${indent}${q}${CONFIG_PACKAGE}${rest}${q}${colon}${vq}${overrideValue(value!, rangeFor)}${vq}${tail}`);
      continue;
    }
    if (/\{[^}]*@marktiderman\/genesis-features(?![\w-])/.test(line)) {
      // A flow mapping: the old entry goes when genesis-config is already in it, else it is renamed with the new range.
      const hasConfig = /@marktiderman\/genesis-config(?![\w-])['"]?\s*:/.test(line);
      const next = hasConfig
        ? line.replace(new RegExp(`,?\\s*${inline.source}`, "g"), "").replace(/\{\s*,\s*/, "{ ")
        : line.replace(inline, (_all, q: string, rest: string, colon: string, vq: string, value: string) => `${q}${CONFIG_PACKAGE}${rest}${q}${colon}${vq}${overrideValue(value, rangeFor)}${vq}`);
      out.push(rewriteFeaturesSpecifiers(next));
      continue;
    }
    out.push(rewriteFeaturesSpecifiers(line));
  }
  return out.join("\n");
}

/**
 * One package.json's text with genesis-features moved to genesis-config, in place (same position,
 * same indent):
 *
 * - each dependency field: renamed, with `rangeFor(oldRange)` (a `workspace:`, `link:` or `file:`
 *   range kept as is), or dropped when genesis-config is already listed in any dependency field;
 * - the keys of `overrides`, `pnpm.overrides` and `resolutions` (nested ones too), with their
 *   values moved to `rangeFor` as well (exact when the old value was exact).
 */
export function renameFeaturesDependency(raw: string, rangeFor: (oldRange: string) => string): string {
  const json = JSON.parse(raw) as Record<string, unknown>;
  let changed = false;
  const lists = (field: string) => isObject(json[field]) && Object.prototype.hasOwnProperty.call(json[field], CONFIG_PACKAGE);
  // A plain range genesis-config already has in another field: the renamed entry takes it.
  const listed = DEP_FIELDS.map((field) => (lists(field) ? (json[field] as Record<string, unknown>)[CONFIG_PACKAGE] : undefined)).find(
    (r): r is string => typeof r === "string" && !/^(?:workspace|link|file|npm|catalog):/.test(r),
  );
  for (const field of DEP_FIELDS) {
    const deps = json[field];
    if (!isObject(deps) || !(OLD_FEATURES_PACKAGE in deps)) continue;
    // Covered already: genesis-config in the same field, or in `dependencies` for a dev dependency.
    // Otherwise the entry is renamed where it is, so a production dependency stays one.
    const covered = lists(field) || (field === "devDependencies" && lists("dependencies"));
    const next: Array<[string, unknown]> = [];
    for (const [name, range] of Object.entries(deps)) {
      if (name !== OLD_FEATURES_PACKAGE) next.push([name, range]);
      else if (!covered) next.push([CONFIG_PACKAGE, typeof range === "string" && /^(?:workspace|link|file|catalog):/.test(range) ? range : (listed ?? rangeFor(String(range)))]);
    }
    json[field] = Object.fromEntries(next);
    changed = true;
  }
  // Now a production dependency, genesis-config needs no dev entry as well.
  if (changed && lists("dependencies") && lists("devDependencies")) {
    json.devDependencies = Object.fromEntries(Object.entries(json.devDependencies as Record<string, unknown>).filter(([name]) => name !== CONFIG_PACKAGE));
  }
  const renameIn = (holder: Record<string, unknown>, key: string) => {
    const value = holder[key];
    if (!isObject(value)) return;
    const next = renameOverrideKeys(value, rangeFor);
    if (JSON.stringify(next) !== JSON.stringify(value)) {
      holder[key] = next;
      changed = true;
    }
  };
  renameIn(json, "overrides");
  renameIn(json, "resolutions");
  if (isObject(json.pnpm)) renameIn(json.pnpm, "overrides");
  // npm refuses an override of a direct dependency whose spec differs from it (EOVERRIDE); a
  // reference to the dependency's own spec (`$name`) is npm's way to say "the same".
  const npmOverrides = json.overrides;
  const directFields = DEP_FIELDS.filter((f) => f !== "peerDependencies" && lists(f));
  if (isObject(npmOverrides) && typeof npmOverrides[CONFIG_PACKAGE] === "string" && !String(npmOverrides[CONFIG_PACKAGE]).startsWith("$") && directFields.length) {
    const direct = directFields.map((f) => (json[f] as Record<string, unknown>)[CONFIG_PACKAGE]);
    if (!direct.includes(npmOverrides[CONFIG_PACKAGE])) {
      json.overrides = { ...npmOverrides, [CONFIG_PACKAGE]: `$${CONFIG_PACKAGE}` };
      changed = true;
    }
  }
  if (!changed) return raw;
  const indent = /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
  return `${JSON.stringify(json, null, indent)}${raw.endsWith("\n") ? "\n" : ""}`;
}

/** Whether any package.json in the app still lists genesis-features as a dependency. */
export function listsOldFeaturesPackage(root: string): boolean {
  return walk(root, (rel) => rel === "package.json" || rel.endsWith("/package.json")).some((rel) => {
    try {
      const json = JSON.parse(readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
      return DEP_FIELDS.some((field) => isObject(json[field]) && OLD_FEATURES_PACKAGE in (json[field] as object));
    } catch {
      return false;
    }
  });
}

export const featuresRenamedConfig: Codemod = {
  id: FEATURES_RENAMED_CODEMOD,
  package: OLD_FEATURES_PACKAGE,
  version: "0.10.0",
  description: "@marktiderman/genesis-features is now @marktiderman/genesis-config: rewrites its imports (and subpaths), the package.json dependency and overrides, tsconfig paths and pnpm-workspace.yaml.",
  applies: listsOldFeaturesPackage,
  run(context) {
    const { root, dryRun, log, wanted } = context;
    const changed: string[] = [];
    const write = (rel: string, next: string) => {
      changed.push(rel);
      writeAppFile(context, rel, next);
    };
    for (const rel of appScripts(root)) {
      const text = readFileSync(path.join(root, rel), "utf8");
      if (!text.includes("genesis-features")) continue;
      const next = rewriteFeaturesSpecifiers(text);
      if (next !== text) write(rel, next);
    }
    const configFiles = walk(root, (rel) => /(?:^|\/)(?:package\.json|tsconfig[\w.-]*\.json|pnpm-workspace\.yaml)$/.test(rel));
    for (const rel of configFiles) {
      const abs = path.join(root, rel);
      const raw = readFileSync(abs, "utf8");
      if (!raw.includes(OLD_FEATURES_PACKAGE)) continue;
      // The release's range; else one genesis-config already has in this package.json or the
      // app's own (a hand run with nothing installed); else what's installed.
      const listed = listedConfigRange(raw) ?? listedConfigRange(readText(path.join(root, "package.json")));
      const rangeFor = (old: string) => {
        const release = wanted?.(CONFIG_PACKAGE);
        return release ? configRangeFor(root, path.dirname(abs), old, wanted) : (listed ?? configRangeFor(root, path.dirname(abs), old));
      };
      // tsconfig may hold comments (its paths are rewritten as text); YAML isn't JSON.
      const next = rel.endsWith("package.json") ? renameFeaturesDependency(raw, rangeFor) : rel.endsWith(".yaml") ? rewriteWorkspaceYaml(raw, rangeFor) : rewriteFeaturesSpecifiers(raw);
      if (next !== raw) write(rel, next);
    }
    // What's left, for a person to look at: the old name anywhere else it's still written.
    const done = new Set(changed);
    const after = (rel: string) => {
      const text = readFileSync(path.join(root, rel), "utf8");
      if (!dryRun || !done.has(rel)) return text;
      return rel.endsWith("package.json") ? renameFeaturesDependency(text, (old) => old) : rewriteFeaturesSpecifiers(text);
    };
    const left = walk(root, (rel) => CHECKLIST_FILE.test(rel) && !CHECKLIST_SKIP.test(rel)).filter((rel) => MENTIONS_OLD.test(after(rel)));
    if (changed.length) log(`  ${OLD_FEATURES_PACKAGE} → ${CONFIG_PACKAGE}: feature ids, features.json, flags.json and the AGENTS.md block keep their format.`);
    if (left.length) {
      log(`  Still mentions ${OLD_FEATURES_PACKAGE} (docs, comments, or an exact version pin of the old package): check by hand:\n${left.map((f) => `    - [ ] ${f}`).join("\n")}`);
    }
    return changed;
  },
};
