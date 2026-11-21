/**
 * `expo-native-deps` (native pack): an installed package the Expo SDK manages (one its
 * `bundledNativeModules.json` names) at a version outside the range the installed `expo` expects.
 * It is the comparison `npx expo install --check` makes, done offline from what is installed: the
 * installed expo's own `bundledNativeModules.json` against each package's installed version.
 *
 * A drift compiles and bundles, then can fail at launch, before any JavaScript runs: an app on
 * react-native 0.88.0 under an expo whose expo-modules-core was built for 0.88.1 crashed in dyld
 * ("Symbol not found: _OBJC_CLASS_$_RCTStatusBarAppearance"). So react-native and
 * expo-modules-core are errors; the other packages are warnings (a mismatched native module fails
 * only where it is used, or not at all).
 *
 * Checked: the app's declared dependencies and devDependencies the SDK names, plus
 * expo-modules-core, which comes with expo (looked up from expo's own folder). Skipped: an app
 * without expo, one not installed yet, and names in package.json `expo.install.exclude` (Expo's own
 * opt-out, which `expo install --check` honours too).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { findPackageDir } from "./genesis.js";
import { satisfies } from "./semver.js";
import type { DoctorContext } from "./types.js";

export const EXPO_NATIVE_DEPS_RULE = "expo-native-deps";

/** A drift in one of these crashes the app at launch, before JS: an error. */
export const EXPO_LAUNCH_CRITICAL = new Set(["react-native", "expo-modules-core"]);

interface Manifest {
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

/** The package an override or resolution key names (`react-native`, `a>react-native`, `react-native@<1`, `**\/react-native`). */
export function overrideTarget(key: string): string {
  // pnpm's `parent>child`: the child. Yarn's paths (`**/x`, `a/x`, `a/@s/x`): the last package.
  const segments = key.split(">").pop()!.trim().split("/");
  const name = segments.length >= 2 && segments[segments.length - 2]!.startsWith("@") ? segments.slice(-2).join("/") : segments[segments.length - 1]!;
  const at = name.indexOf("@", name.startsWith("@") ? 1 : 0);
  return at > 0 ? name.slice(0, at) : name;
}

/**
 * Where the app pins a package past its own package.json range: pnpm-workspace.yaml `overrides`,
 * package.json `pnpm.overrides`, `overrides` (npm, bun) and `resolutions` (yarn). An override wins
 * over what `expo install --fix` writes, so the finding names it.
 */
export function overridesPinning(root: string, manifest: Manifest | null): Map<string, string> {
  const pins = new Map<string, string>();
  const add = (where: string, table: unknown) => {
    if (!table || typeof table !== "object") return;
    for (const key of Object.keys(table)) {
      const name = overrideTarget(key);
      if (!pins.has(name)) pins.set(name, where);
    }
  };
  const workspace = path.join(root, "pnpm-workspace.yaml");
  if (existsSync(workspace)) {
    try {
      add("pnpm-workspace.yaml overrides", (parseYaml(readFileSync(workspace, "utf8")) as { overrides?: unknown } | null)?.overrides);
    } catch {
      // Not YAML pnpm would read either.
    }
  }
  add("package.json pnpm.overrides", manifest?.pnpm?.overrides);
  add("package.json overrides", manifest?.overrides);
  add("package.json resolutions", manifest?.resolutions);
  return pins;
}

/** What the installed expo expects: its version and `bundledNativeModules.json`, or null when expo isn't installed. */
export function bundledNativeModules(root: string): { expoDir: string; expoVersion: string; modules: Record<string, string> } | null {
  const expoDir = findPackageDir(root, "expo");
  if (!expoDir) return null;
  const expoVersion = readJson<Manifest>(path.join(expoDir, "package.json"))?.version;
  const modules = readJson<Record<string, unknown>>(path.join(expoDir, "bundledNativeModules.json"));
  if (!expoVersion || !modules) return null;
  return { expoDir, expoVersion, modules: Object.fromEntries(Object.entries(modules).filter((e): e is [string, string] => typeof e[1] === "string")) };
}

export function checkExpoNativeDeps(ctx: DoctorContext): void {
  const manifest = readJson<Manifest>(path.join(ctx.root, "package.json"));
  if (!manifest) return;
  const declared = { ...manifest.devDependencies, ...manifest.dependencies };
  if (!("expo" in declared)) return;
  const sdk = bundledNativeModules(ctx.root);
  if (!sdk) return; // Not installed yet: nothing to compare, and no network to ask.
  const exclude = new Set(Array.isArray(manifest.expo?.install?.exclude) ? manifest.expo.install.exclude.filter((e): e is string => typeof e === "string") : []);
  const pins = overridesPinning(ctx.root, manifest);

  // expo-modules-core comes with expo: the copy expo loads is the one beside it, not the app's.
  const checks: Array<{ name: string; from: string; declared: boolean }> = Object.keys(declared)
    .filter((name) => name !== "expo" && name in sdk.modules)
    .sort()
    .map((name) => ({ name, from: ctx.root, declared: true }));
  if (!("expo-modules-core" in declared) && "expo-modules-core" in sdk.modules) checks.push({ name: "expo-modules-core", from: sdk.expoDir, declared: false });

  for (const { name, from, declared: own } of checks) {
    if (exclude.has(name)) continue;
    const range = sdk.modules[name]!;
    const dir = findPackageDir(from, name);
    const installed = dir && readJson<Manifest>(path.join(dir, "package.json"))?.version;
    if (!installed) continue; // A missing install is the install's own error.
    if (satisfies(installed, range) !== false) continue;
    const pin = pins.get(name);
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
