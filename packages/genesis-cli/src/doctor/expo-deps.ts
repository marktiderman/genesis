/**
 * `expo-native-deps` (native pack): an installed package the Expo SDK manages (one its
 * `bundledNativeModules.json` names) at a version outside the range the installed `expo` expects.
 * It is the comparison `npx expo install --check` makes (@expo/cli's
 * validateDependenciesVersions), done offline from what is installed: the installed expo's own
 * `bundledNativeModules.json` against each package's installed version, prereleases included, a
 * React Native TV install (`react-native-tvos`) by major.minor only.
 *
 * A drift compiles and bundles, then can fail at launch, before any JavaScript runs: an app on
 * react-native 0.88.0 under an expo whose expo-modules-core was built for 0.88.1 crashed in dyld
 * ("Symbol not found: _OBJC_CLASS_$_RCTStatusBarAppearance"). So react-native and
 * expo-modules-core are errors; the other packages are warnings (a mismatched native module fails
 * only where it is used, or not at all).
 *
 * Checked: the app's declared dependencies and devDependencies the SDK names, plus
 * expo-modules-core, which comes with expo (resolved from expo's real folder, as Node does, so
 * pnpm's isolated store is followed), whether or not the app declares a copy of its own. Skipped: an app without expo, one not installed yet, and
 * package.json `expo.install.exclude` entries with Expo's meaning: a name always, `name@version`
 * while the SDK suggests exactly that version, `name@range` while the SDK's range is inside it.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { findPackageDir } from "./genesis.js";
import { parseVersion, rangeSubset, satisfies } from "./semver.js";
import type { DoctorContext } from "./types.js";

export const EXPO_NATIVE_DEPS_RULE = "expo-native-deps";

/** A drift in one of these crashes the app at launch, before JS: an error. */
export const EXPO_LAUNCH_CRITICAL = new Set(["react-native", "expo-modules-core"]);

/** The folders that hold an install of their own (the ones discover.ts stops at). */
const INSTALL_ROOT_MARKERS = [".git", "pnpm-lock.yaml", "pnpm-workspace.yaml", "bun.lock", "bun.lockb", "yarn.lock", "package-lock.json"];

interface Manifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  resolutions?: Record<string, unknown>;
  pnpm?: { overrides?: Record<string, unknown> };
  expo?: { install?: { exclude?: unknown } };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** A package name and the version or range after it (`@s/x@^1` → `@s/x`, `^1`). */
export function splitSpec(entry: string): { name: string; spec: string | null } {
  const at = entry.indexOf("@", entry.startsWith("@") ? 1 : 0);
  return at > 0 ? { name: entry.slice(0, at), spec: entry.slice(at + 1) } : { name: entry, spec: null };
}

/** The package an override or resolution key names, and the range it applies to (`a>react-native@<1`, `**\/@s/x`). */
export function overrideTarget(key: string): { name: string; spec: string | null } {
  // pnpm's `parent>child`: the child. A `>` that starts a range (`x@>=1`, `x@> 1`) isn't a
  // separator. Yarn's paths (`**/x`, `a/x`, `a/@s/x`): the last package.
  const segments = key.split(/>(?![=\s\d])/).pop()!.trim().split("/");
  const last = segments.length >= 2 && segments[segments.length - 2]!.startsWith("@") ? segments.slice(-2).join("/") : segments[segments.length - 1]!;
  return splitSpec(last);
}

/** The app's install root: the nearest folder from the app up with a lockfile, a workspace file or .git; the app when none has. */
export function installRoot(root: string): string {
  let dir = path.resolve(root);
  for (;;) {
    if (INSTALL_ROOT_MARKERS.some((m) => existsSync(path.join(dir, m)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(root);
    dir = parent;
  }
}

/**
 * Where an override or resolution pins a package at its installed version: pnpm-workspace.yaml
 * `overrides`, package.json `pnpm.overrides`, `overrides` (npm and bun, nested objects walked) and
 * `resolutions` (yarn), in the app and at its install root (where pnpm and npm apply them). A
 * range-keyed entry (`foo@<1.2.3`, a security floor) counts only when the installed version is in
 * its range. An override wins over what `expo install --fix` writes, so the finding names it.
 */
export function overridePin(root: string, name: string, installed: string): string | null {
  const roots = [...new Set([path.resolve(root), installRoot(root)])];
  for (const dir of roots) {
    const shown = (file: string) => path.relative(root, path.join(dir, file)).split(path.sep).join("/") || file;
    const tables: Array<[string, unknown]> = [];
    const workspace = path.join(dir, "pnpm-workspace.yaml");
    if (existsSync(workspace)) {
      try {
        tables.push([`${shown("pnpm-workspace.yaml")} overrides`, (parseYaml(readFileSync(workspace, "utf8")) as { overrides?: unknown } | null)?.overrides]);
      } catch {
        // Not YAML pnpm would read either.
      }
    }
    const manifest = readJson<Manifest>(path.join(dir, "package.json"));
    tables.push([`${shown("package.json")} pnpm.overrides`, manifest?.pnpm?.overrides], [`${shown("package.json")} overrides`, manifest?.overrides], [`${shown("package.json")} resolutions`, manifest?.resolutions]);
    for (const [where, table] of tables) if (pins(table, name, installed)) return where;
  }
  return null;
}

function pins(table: unknown, name: string, installed: string): boolean {
  if (!table || typeof table !== "object") return false;
  for (const [key, value] of Object.entries(table)) {
    if (key === ".") continue;
    const target = overrideTarget(key);
    if (target.name === name && (!target.spec || satisfies(installed, target.spec, { includePrerelease: true }) !== false)) return true;
    // npm's nested form: `"overrides": { "foo": { "react-native": "…" } }`.
    if (value && typeof value === "object" && pins(value, name, installed)) return true;
  }
  return false;
}

/** Whether an `expo.install.exclude` entry keeps `name` off the check while the SDK suggests `range`, as Expo reads it. */
export function excluded(entries: readonly string[], name: string, range: string): boolean {
  return entries.some((entry) => {
    const { name: n, spec } = splitSpec(entry.trim());
    if (n !== name) return false;
    if (!spec || spec === "*") return true;
    if (parseVersion(spec)) return range === spec;
    return spec === range || rangeSubset(range, spec) === true;
  });
}

/** What the installed expo expects: its version and `bundledNativeModules.json`, or null when expo isn't installed. */
export function bundledNativeModules(root: string): { expoDir: string; expoVersion: string; modules: Record<string, string> } | null {
  const found = findPackageDir(root, "expo");
  if (!found) return null;
  const expoDir = real(found);
  const expoVersion = readJson<Manifest>(path.join(expoDir, "package.json"))?.version;
  const modules = readJson<Record<string, unknown>>(path.join(expoDir, "bundledNativeModules.json"));
  if (!expoVersion || !modules) return null;
  return { expoDir, expoVersion, modules: Object.fromEntries(Object.entries(modules).filter((e): e is [string, string] => typeof e[1] === "string")) };
}

/** Whether `installed` (of the package at `dir`) is in what the SDK expects, as @expo/cli compares. */
function inRange(name: string, manifest: Manifest, installed: string, range: string): boolean {
  if (name === "react-native" && manifest.name === "react-native-tvos") {
    // A TV install follows React Native's major.minor with its own patches.
    const v = parseVersion(installed);
    const want = /(\d+)\.(\d+)/.exec(range);
    if (v && want) return v.major === +want[1]! && v.minor === +want[2]!;
  }
  return satisfies(installed, range, { includePrerelease: true }) !== false;
}

export function checkExpoNativeDeps(ctx: DoctorContext): void {
  const manifest = readJson<Manifest>(path.join(ctx.root, "package.json"));
  if (!manifest) return;
  const declared = { ...manifest.devDependencies, ...manifest.dependencies };
  if (!("expo" in declared)) return;
  const sdk = bundledNativeModules(ctx.root);
  if (!sdk) return; // Not installed yet: nothing to compare, and no network to ask.
  const exclude = Array.isArray(manifest.expo?.install?.exclude) ? manifest.expo.install.exclude.filter((e): e is string => typeof e === "string") : [];

  // expo-modules-core comes with expo: the copy expo loads is the one Node finds from expo's real
  // folder, checked even when the app declares a copy of its own (that one is checked too, when it
  // is another folder).
  const checks: Array<{ name: string; from: string; declared: boolean }> = Object.keys(declared)
    .filter((name) => name !== "expo" && name in sdk.modules)
    .sort()
    .map((name) => ({ name, from: ctx.root, declared: true }));
  if ("expo-modules-core" in sdk.modules) checks.push({ name: "expo-modules-core", from: sdk.expoDir, declared: false });

  const seen = new Set<string>();
  for (const { name, from, declared: own } of checks) {
    const range = sdk.modules[name]!;
    if (excluded(exclude, name, range)) continue;
    const dir = findPackageDir(from, name);
    if (dir) {
      const at = real(dir);
      if (seen.has(at)) continue;
      seen.add(at);
    }
    const pkg = dir ? readJson<Manifest>(path.join(dir, "package.json")) : null;
    const installed = pkg?.version;
    if (!pkg || !installed) continue; // A missing install is the install's own error.
    if (inRange(name, pkg, installed, range)) continue;
    const pin = overridePin(ctx.root, name, installed);
    const critical = EXPO_LAUNCH_CRITICAL.has(name);
    const fix = own
      ? `Run \`npx expo install --fix\`${pin ? ` and change the ${pin} entry that pins it` : ""}, then reinstall`
      : `It comes with expo: reinstall so it resolves the version expo ${sdk.expoVersion} ships with${pin ? ` (the ${pin} entry pins it)` : ""}`;
    ctx.report({
      rule: EXPO_NATIVE_DEPS_RULE,
      level: critical ? "error" : "warn",
      file: "package.json",
      subject: name,
      message:
        `${name} ${installed} is installed, but expo ${sdk.expoVersion} expects ${range} (its bundledNativeModules.json, what \`npx expo install --check\` compares). ` +
        (critical
          ? "Native code built for another version can crash the app at launch, before any JavaScript runs. "
          : "A native module built for another version can fail where the app uses it. ") +
        `${fix}, and make a new native build (an update can't change native code). To keep it on purpose, list it in package.json expo.install.exclude`,
    });
  }
}
