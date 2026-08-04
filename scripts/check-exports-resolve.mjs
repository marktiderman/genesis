#!/usr/bin/env node
/**
 * check-exports-resolve.mjs — post-build gate for any workspace package.
 *
 * THE FAILURE THIS CATCHES
 *
 * `tsup` emits only the entries it is given. `package.json#exports` is a
 * separate, hand-and-script-maintained map. Nothing ties the two together, so
 * an `exports` subpath whose entry is missing from `tsup.config.ts` is
 * invisible to every other gate: the build succeeds, `tsc --noEmit` succeeds,
 * and the whole test suite succeeds, because none of them ever resolves a
 * subpath through `dist/`. The breakage surfaces for CONSUMERS ONLY, at
 * runtime, after install, as ERR_MODULE_NOT_FOUND.
 *
 * That is not hypothetical: the layer-folder split (#384) moved components out
 * of `components/ui/`, and the `ui/*.tsx` glob silently stopped covering them.
 * The build stayed green. It was caught by hand. This script is that hand
 * check, made mechanical so it cannot be skipped or forgotten.
 *
 * It runs for the UMBRELLA package too. The same PR showed the other half of
 * the failure: `genesis-ui` gained `/patterns` and `/layout`, but the
 * `@marktiderman/genesis` umbrella did not, so the migration path the new
 * deprecation pointed at did not exist for umbrella consumers.
 *
 * WHAT IT CHECKS
 *
 * Every target in the `exports` map — both the `types` and the `import`
 * condition — resolves to a file that actually exists under `dist/`.
 *
 * WILDCARDS
 *
 * A subpath pattern like `./hooks/*` does not name one file, so "does it
 * exist" is the wrong question. For those the check asserts the pattern
 * matches AT LEAST ONE emitted file, which catches a whole directory failing
 * to emit while still allowing the pattern's open-ended set. A wildcard that
 * matches nothing is reported as a failure.
 *
 * Usage:  node ../../scripts/check-exports-resolve.mjs [packageDir]
 *         (packageDir defaults to cwd, which is the package dir under `pnpm run`)
 * Wired into the `build` script of `packages/ui` and `packages/genesis`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const pkgRoot = resolve(process.argv[2] ?? process.cwd());
const pkgJsonPath = join(pkgRoot, "package.json");

if (!existsSync(pkgJsonPath)) {
  console.error(
    `[check-exports-resolve] no package.json at ${pkgRoot} — pass a package directory.`,
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
const label = pkg.name ?? relative(process.cwd(), pkgRoot) ?? "package";

/** Collect every file under `dir`, as paths relative to the package root. */
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(relative(pkgRoot, full).split("\\").join("/"));
  }
  return acc;
}

const distFiles = walk(join(pkgRoot, "dist"));

if (distFiles.length === 0) {
  console.error(
    `[check-exports-resolve] ${label}: dist/ is empty or missing — run the build first.`,
  );
  process.exit(1);
}

/** `./dist/hooks/*.js` -> regex matching `dist/hooks/<anything>.js`. */
function patternToRegExp(target) {
  const normalised = target.replace(/^\.\//, "");
  const escaped = normalised.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `\*` is the escaped form of the single `*` a subpath pattern may contain.
  return new RegExp(`^${escaped.replace(/\\\*/g, "(.+)")}$`);
}

const failures = [];
let concrete = 0;
let wildcard = 0;

for (const [subpath, conditions] of Object.entries(pkg.exports ?? {})) {
  const targets =
    typeof conditions === "string"
      ? { default: conditions }
      : (conditions ?? {});

  for (const [condition, target] of Object.entries(targets)) {
    if (typeof target !== "string") continue;

    if (target.includes("*")) {
      // Wildcard: require at least one emitted file to match.
      wildcard++;
      const re = patternToRegExp(target);
      if (!distFiles.some((f) => re.test(f))) {
        failures.push(
          `${subpath} [${condition}] -> ${target} : pattern matched no emitted file`,
        );
      }
      continue;
    }

    concrete++;
    const abs = join(pkgRoot, target.replace(/^\.\//, ""));
    if (!existsSync(abs)) {
      failures.push(`${subpath} [${condition}] -> ${target} : file not found`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\n[check-exports-resolve] ${label}: ${failures.length} exports target(s) do not resolve under dist/:\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    "\nAn `exports` subpath with no matching build entry 404s for consumers at\n" +
      "runtime while every local gate stays green. Add the missing entry to\n" +
      "this package's tsup.config.ts (or drop the exports entry).\n",
  );
  process.exit(1);
}

console.log(
  `[check-exports-resolve] ${label}: OK — ${concrete} concrete + ${wildcard} wildcard exports target(s) ` +
    `resolve under dist/ (${Object.keys(pkg.exports ?? {}).length} subpaths).`,
);
