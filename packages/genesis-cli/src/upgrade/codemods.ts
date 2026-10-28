/**
 * Codemods for breaking changes. A release that breaks an app's code declares
 * it here, with the package and the first version that needs it; `genesis
 * upgrade` runs a codemod only when that package moves across that version,
 * and `genesis codemod <id>` runs one by hand.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { compareVersions } from "./bump-core.mjs";
import { augmentsResourceScope, IMPORTS_GENESIS, PRACTICE_ID_AUGMENTATION, readsPracticeId, rewriteScopeNames } from "./scope-names.js";
import type { BumpChange } from "./bump-core.mjs";

export interface CodemodContext {
  root: string;
  dryRun: boolean;
  log: (msg: string) => void;
}

export interface Codemod {
  /** Unique, e.g. `genesis-ui-2-button-variant`. */
  id: string;
  /** The package whose release breaks apps. */
  package: string;
  /** The first version with the break: a move from below it to it or above runs this. */
  version: string;
  /** What breaks, and what the codemod changes, in one sentence. */
  description: string;
  /** Change the app; returns the app-relative files it changed. */
  run(context: CodemodContext): Promise<string[]> | string[];
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", ".expo", "coverage", "ios", "android"]);
const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const MAX_BYTES = 2 * 1024 * 1024;

/** The app's script files (tests and declarations included: they use the same names), app-relative and sorted. */
export function appScripts(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
      } else if (entry.isFile() && SCRIPT.test(entry.name) && statSync(abs).size <= MAX_BYTES) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

/**
 * The scope-neutral names (genesis-core 2.0.0, genesis-ui-native 3.0.0). Genesis's word for "where
 * the viewer is working" was one app's tenant ("practice"); it is now whatever the app scopes to.
 * In files that import a Genesis package (scope-names.ts holds the patterns, shared with the
 * doctor's `removed-scope-name` rule):
 *
 * - a view field's `timeZone: "practice"` → `timeZone: "scope"`;
 * - NativeResourceView's `practiceTimeZone` (attribute or object key) → `scopeTimeZone`;
 * - `resolveZone("practice", …)` → `resolveZone("scope", …)`;
 * - DisplayTimeZones' `practice`: a `{ viewer, practice }` object's key, and `.practice` on a
 *   value from `useDisplayTimeZones()` or typed `DisplayTimeZones` → `scope`.
 *
 * `ResourceScope.practiceId` needs no rewrite: the value still travels in ViewerScope's open key
 * slot (`scope={{ practiceId }}`) and views read it as before. Reading it typed (`scope.practiceId`
 * as a string) takes one augmentation, which the codemod prints rather than writes, because only
 * the app knows where its declarations live.
 */
export const scopeNeutralNames: Codemod = {
  id: "genesis-core-2-scope-names",
  package: "@marktiderman/genesis-core",
  version: "2.0.0",
  description:
    'Renames the "practice" scope names: timeZone "practice" → "scope", practiceTimeZone → scopeTimeZone, DisplayTimeZones.practice → .scope.',
  run({ root, dryRun, log }) {
    const changed: string[] = [];
    let readsId = false;
    let augmented = false;
    for (const rel of appScripts(root)) {
      const abs = path.join(root, rel);
      const text = readFileSync(abs, "utf8");
      if (augmentsResourceScope(text)) augmented = true;
      if (!IMPORTS_GENESIS.test(text)) continue;
      if (readsPracticeId(text).length) readsId = true;
      const next = rewriteScopeNames(text);
      if (next === text) continue;
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, next);
    }
    if (readsId && !augmented) {
      log(`  practiceId is no longer a named ResourceScope key. Passing it still works; to read it typed, add once:\n  ${PRACTICE_ID_AUGMENTATION}`);
    }
    return changed;
  },
};

export const CODEMODS: readonly Codemod[] = [scopeNeutralNames];

/** A registered codemod by id, for `genesis codemod <id>`. */
export function codemodById(id: string, registry: readonly Codemod[] = CODEMODS): Codemod | undefined {
  return registry.find((mod) => mod.id === id);
}

const bare = (spec: string) => spec.replace(/^[\^~=]/, "");

/** The codemods a set of version changes crosses, in registry order. */
export function codemodsFor(changes: readonly BumpChange[], registry: readonly Codemod[] = CODEMODS): Codemod[] {
  return registry.filter((mod) =>
    changes.some((c) => c.name === mod.package && compareVersions(bare(c.from), mod.version) < 0 && compareVersions(bare(c.to), mod.version) >= 0),
  );
}

/** Changes that cross a major version (or a 0.x minor) with no codemod declared: worth reading the changelog. */
export function uncoveredBreaks(changes: readonly BumpChange[], registry: readonly Codemod[] = CODEMODS): BumpChange[] {
  const major = (v: string) => {
    const [a, b] = bare(v).split(".").map(Number);
    return a === 0 ? `0.${b}` : String(a);
  };
  return changes.filter((c) => major(c.from) !== major(c.to) && codemodsFor([c], registry).length === 0);
}
