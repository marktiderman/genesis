#!/usr/bin/env node
/**
 * check-workbench-coverage.mjs
 *
 * Every visual component a Genesis package exports for the phone has a screen in the native
 * workbench (`apps/native-workbench`), where it is built, checked on a simulator and proven with a
 * flow. A workbench screen says which exports it shows in its registry entry's `covers`
 * (`apps/native-workbench/src/workbench/screens/*.tsx`).
 *
 * A component with no screen yet is listed in `apps/native-workbench/workbench-coverage.json`
 * under `notYet`, by package. The list only shrinks:
 * - a new export with no screen and no entry fails (add its screen, or its `notYet` line);
 * - an entry whose component now has a screen, or is no longer exported, fails (remove it).
 *
 * The components are the ones check-code-connect counts as visual, for every package with a
 * native surface (NATIVE_PACKAGES).
 *
 *   node scripts/check-workbench-coverage.mjs          check
 *   node scripts/check-workbench-coverage.mjs --write  rewrite notYet to what has no screen (only to start a list)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGES, discoverComponents } from "./check-code-connect.mjs";

/** The check-code-connect packages with a native surface. */
export const NATIVE_PACKAGES = ["ui-native", "chat-native", "native", "notifications-native", "forms-native"];
export const COVERAGE_FILE = "apps/native-workbench/workbench-coverage.json";
const SCREENS_DIR = "apps/native-workbench/src/workbench/screens";

/** The names every workbench screen says it covers. */
export function coveredNames(root) {
  const dir = path.join(root, SCREENS_DIR);
  const names = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    for (const m of text.matchAll(/\bcovers:\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/"([^"]+)"/g)) names.add(n[1]);
  }
  return names;
}

export function nativeComponents(root) {
  const out = {};
  for (const pkg of PACKAGES.filter((p) => NATIVE_PACKAGES.includes(p.name))) out[pkg.name] = [...new Set(discoverComponents(root, pkg))].sort();
  return out;
}

export function checkCoverage(root) {
  const covered = coveredNames(root);
  const components = nativeComponents(root);
  const file = path.join(root, COVERAGE_FILE);
  const notYet = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).notYet ?? {}) : {};
  const problems = [];
  let screens = 0;
  let pending = 0;
  for (const [pkg, names] of Object.entries(components)) {
    const listed = new Set(notYet[pkg] ?? []);
    for (const name of names) {
      if (covered.has(name)) {
        screens++;
        if (listed.has(name)) problems.push(`${pkg}: ${name} has a workbench screen now: remove it from notYet in ${COVERAGE_FILE}`);
      } else if (listed.has(name)) pending++;
      else problems.push(`${pkg}: ${name} has no workbench screen: add one (apps/native-workbench/src/workbench/screens, its covers) or a notYet line in ${COVERAGE_FILE}`);
    }
    for (const name of listed) if (!names.includes(name)) problems.push(`${pkg}: ${name} is in notYet but isn't exported any more: remove it`);
  }
  for (const pkg of Object.keys(notYet)) if (!(pkg in components)) problems.push(`notYet names a package that isn't native: ${pkg}`);
  return { problems, screens, pending, components };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  if (process.argv.includes("--write")) {
    const covered = coveredNames(root);
    const notYet = Object.fromEntries(Object.entries(nativeComponents(root)).map(([pkg, names]) => [pkg, names.filter((n) => !covered.has(n))]));
    const body = { $comment: "Native components with no workbench screen yet (scripts/check-workbench-coverage.mjs). The list only shrinks: a package PR that adds or changes a native component adds its screen and removes its line.", notYet };
    fs.writeFileSync(path.join(root, COVERAGE_FILE), `${JSON.stringify(body, null, 2)}\n`);
    console.log(`check-workbench-coverage: wrote ${COVERAGE_FILE}.`);
    process.exit(0);
  }
  const { problems, screens, pending } = checkCoverage(root);
  if (problems.length) {
    console.error(`check-workbench-coverage: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`check-workbench-coverage: ${screens} native components on a workbench screen, ${pending} not yet.`);
}
