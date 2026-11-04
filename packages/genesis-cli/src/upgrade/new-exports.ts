/**
 * A release can add an export the app builds by hand (the doctor's `shadowed-export` then fails on
 * a file nobody touched). The swap isn't mechanical (the two rarely share props), so the upgrade
 * compares the component package before and after the install and names each one, ahead of the doctor.
 */
import { loadConfig } from "../doctor/config.js";
import { readPackageExports, uiPackageFor } from "../doctor/genesis.js";
import { discoverPackages, clearPackageRulesCache } from "../doctor/package-rules.js";
import { checkShadowedExports } from "../doctor/rules.js";
import { scanFiles } from "../doctor/scan.js";
import type { FindingInput } from "../doctor/types.js";

export interface HandBuiltSwap {
  name: string;
  file: string;
  line: number;
  package: string;
}

/** The exported values of the app's component package, or null when they can't be read. */
export function componentValues(root: string): Set<string> | null {
  try {
    const { config } = loadConfig(root);
    return readPackageExports(root, uiPackageFor(config))?.values ?? null;
  } catch {
    return null;
  }
}

/** The app's own exports whose names the component package gained since `before`. */
export function handBuiltSwaps(root: string, before: ReadonlySet<string> | null): HandBuiltSwap[] {
  if (!before) return [];
  try {
    const { config } = loadConfig(root);
    if (config.rules?.["shadowed-export"] === "off") return [];
    const uiPackage = uiPackageFor(config);
    const after = readPackageExports(root, uiPackage)?.values;
    const gained = new Set([...(after ?? [])].filter((name) => !before.has(name)));
    if (!gained.size) return [];
    clearPackageRulesCache();
    const found: FindingInput[] = [];
    checkShadowedExports({ root, config, files: scanFiles(root, config), packages: discoverPackages(root), genesis: { uiPackage, values: gained }, report: (f) => found.push(f) });
    return found.map((f) => ({ name: f.subject!, file: f.file, line: f.line ?? 0, package: uiPackage }));
  } catch {
    return []; // The doctor reports what it can't read.
  }
}

export function swapLines(swaps: readonly HandBuiltSwap[]): string[] {
  return swaps.map((s) => `- \`${s.name}\` in ${s.file}${s.line ? `:${s.line}` : ""}: ${s.package} now exports it. Compare the two and swap to \`import { ${s.name} } from "${s.package}"\`, or rename yours if it's a different thing.`);
}
