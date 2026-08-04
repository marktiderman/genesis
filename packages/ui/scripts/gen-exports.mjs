#!/usr/bin/env node
/**
 * Generate the per-component `exports` map for @marktiderman/genesis-ui.
 *
 * Importing a single primitive from the barrel drags the entire component set +
 * ~25 peer deps into the consumer graph. Per-component subpaths
 * (`@marktiderman/genesis-ui/button`, `/card`, `/dialog`, …) let a consumer pull
 * just the one component. The map is SCRIPT-GENERATED but committed static —
 * run `node scripts/gen-exports.mjs` after adding/removing a component.
 *
 * The curated subpaths (`.`, `./data`, `./patterns`, `./layout`, `./hooks`,
 * `./utils`, `./status-colors`, `./provider`) are preserved verbatim.
 *
 * PER-COMPONENT SUBPATHS NOW SPAN THREE FOLDERS. Since the layer split
 * (docs/FRAMEWORK.md), components live in the folder their tier names:
 * primitives in `components/ui/`, patterns in `components/patterns/`, page
 * templates in `components/layout/`. A per-component subpath has to point at
 * whichever folder actually holds the file, so this script resolves each name
 * to its real location.
 *
 * Scanning `components/ui/` alone — as this script did before the split —
 * turns it from a generator into a time bomb: the next maintainer to run it
 * after adding a component would silently drop `./patterns`, `./layout` and
 * every relocated pattern subpath from the map, publishing a breaking
 * `exports` that reads as a no-op diff because regenerating a generated file
 * always does. `scripts/check-exports-resolve.mjs` guards the other direction
 * (a declared subpath with nothing emitted for it) and CANNOT substitute for
 * this one: once a declaration is gone there is nothing left for it to fail
 * on. Observed, not assumed — with the four `components/layout/` subpaths
 * dropped it reports "OK — 132 concrete + 2 wildcard exports target(s)
 * resolve under dist/ (67 subpaths)" and exits 0, while
 * `@marktiderman/genesis-ui/detail-page` resolves to MODULE_NOT_FOUND for a
 * consumer. Every tier a per-component subpath can point into has to be
 * named here, or the next regeneration deletes it silently.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(pkgRoot, "package.json");
const uiDir = join(pkgRoot, "src", "components", "ui");
const patternsDir = join(pkgRoot, "src", "components", "patterns");
const layoutDir = join(pkgRoot, "src", "components", "layout");

/**
 * Patterns that carry a per-component subpath.
 *
 * Every primitive in `components/ui/` gets one automatically. The patterns
 * layer is an explicit list instead, because holding a per-component subpath
 * is a PUBLIC API FACT, not a consequence of which folder a file sits in.
 * Each of these had a subpath while it lived in `components/ui/` and kept it
 * across the move, so the name a consumer already imports keeps resolving.
 *
 * `view-toggle` and `view-settings` are deliberately absent: they came from
 * `components/data/`, which has never had per-component subpaths, so they
 * never had one to keep. Both are public through the `/patterns` barrel and
 * the package root. Adding them here would mint two brand-new public
 * entrypoints — a thing to decide on purpose, not to inherit from a glob.
 *
 * Anything added here must also be added to `tsup.config.ts`, or the build
 * fails in `check-exports-resolve.mjs`.
 */
const PATTERN_SUBPATH_COMPONENTS = [
  "empty-state",
  "form-field",
  "page-loading",
  "settings-row",
  "status-badge",
  "toggle-row",
  "user-avatar",
];

/**
 * Layouts that carry a per-component subpath.
 *
 * An explicit list for the same reason `PATTERN_SUBPATH_COMPONENTS` is one:
 * a per-component subpath is a public API fact, not a consequence of which
 * folder a file sits in. Only the four page templates (FRAMEWORK.md migration
 * step 8) have one.
 *
 * Deliberately absent, and each for its own reason:
 *
 * - `stack`, `grid`, `split`, `section`, `container` — step 7 shipped the
 *   layout primitives with the `/layout` barrel only. Minting five new public
 *   entrypoints from a glob is exactly the decision this list exists to keep
 *   deliberate, and it is step 7's surface to change, not step 8's.
 * - `AppShell`, `PageHeader` — came from `components/data/`, which has never
 *   had per-component subpaths, so neither had one to keep across the move.
 *   Same reasoning as `view-toggle` / `view-settings` above.
 * - `spacing` — not a component; it has no `.tsx` and never reaches the glob.
 *
 * All of them stay public through the `/layout` barrel and the package root.
 *
 * Anything added here must also be added to `tsup.config.ts`, or the build
 * fails in `check-exports-resolve.mjs`. Anything REMOVED from here silently
 * unpublishes a subpath that no check can see the absence of — see the header.
 */
const LAYOUT_SUBPATH_COMPONENTS = [
  "dashboard-page",
  "detail-page",
  "form-page",
  "settings-page",
];

function readComponentNames(dir) {
  if (!existsSync(dir)) {
    throw new Error(`[gen-exports] expected layer folder is missing: ${dir}`);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""));
}

// `name -> dist folder`, so each subpath points at the layer that holds it.
const componentDirs = new Map();
for (const name of readComponentNames(uiDir)) {
  componentDirs.set(name, "components/ui");
}

/**
 * Register a curated tier's per-component subpaths.
 *
 * Shared by every non-primitive tier so the collision guard covers all of
 * them by construction: it reports the folder a name was ALREADY claimed by,
 * rather than naming two folders it was written against. A third tier added
 * without touching this guard is how "one subpath cannot point at both"
 * quietly stops being checked.
 */
function registerCuratedTier(dir, distFolder, listName, names) {
  const files = new Set(readComponentNames(dir));
  for (const name of names) {
    if (!files.has(name)) {
      throw new Error(
        `[gen-exports] "${name}" is listed in ${listName} but ${name}.tsx does not exist in ${distFolder}/; the file moved or was renamed — update the list.`,
      );
    }
    const claimedBy = componentDirs.get(name);
    if (claimedBy) {
      throw new Error(
        `[gen-exports] component "${name}" exists in both ${claimedBy}/ and ${distFolder}/; one subpath cannot point at both.`,
      );
    }
    componentDirs.set(name, distFolder);
  }
}

registerCuratedTier(
  patternsDir,
  "components/patterns",
  "PATTERN_SUBPATH_COMPONENTS",
  PATTERN_SUBPATH_COMPONENTS,
);
registerCuratedTier(
  layoutDir,
  "components/layout",
  "LAYOUT_SUBPATH_COMPONENTS",
  LAYOUT_SUBPATH_COMPONENTS,
);

const components = [...componentDirs.keys()].sort();

// Curated, hand-maintained subpaths — kept exactly as-is.
const baseExports = {
  ".": {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  },
  "./data": {
    types: "./dist/components/data/index.d.ts",
    import: "./dist/components/data/index.js",
  },
  "./patterns": {
    types: "./dist/components/patterns/index.d.ts",
    import: "./dist/components/patterns/index.js",
  },
  "./layout": {
    types: "./dist/components/layout/index.d.ts",
    import: "./dist/components/layout/index.js",
  },
  "./hooks": {
    types: "./dist/hooks/index.d.ts",
    import: "./dist/hooks/index.js",
  },
  "./hooks/*": {
    types: "./dist/hooks/*.d.ts",
    import: "./dist/hooks/*.js",
  },
  "./utils": {
    types: "./dist/utils.d.ts",
    import: "./dist/utils.js",
  },
  "./status-colors": {
    types: "./dist/status-colors.d.ts",
    import: "./dist/status-colors.js",
  },
  "./provider": {
    types: "./dist/provider/index.d.ts",
    import: "./dist/provider/index.js",
  },
};

const componentExports = {};
for (const name of components) {
  // Curated subpaths win: a component file named like a curated key (e.g.
  // `data.tsx`, `hooks.tsx`, `utils.tsx`) must not silently clobber the
  // hand-maintained entry when spread after baseExports below. Fail loud.
  if (Object.prototype.hasOwnProperty.call(baseExports, `./${name}`)) {
    throw new Error(
      `[gen-exports] component "${name}" collides with a curated subpath ("./${name}"); rename the file or the curated export.`,
    );
  }
  const dist = componentDirs.get(name);
  componentExports[`./${name}`] = {
    types: `./dist/${dist}/${name}.d.ts`,
    import: `./dist/${dist}/${name}.js`,
  };
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.exports = { ...baseExports, ...componentExports };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(
  `[gen-exports] wrote ${components.length} per-component subpaths + ${Object.keys(baseExports).length} curated subpaths`,
);
