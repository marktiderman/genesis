/**
 * Codemods for breaking changes. A release that breaks an app's code declares
 * it here, with the package and the first version that needs it; `genesis
 * upgrade` runs a codemod only when that package moves across that version,
 * and `genesis codemod <id>` runs one by hand.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { compareVersions } from "./bump-core.mjs";
import { addGenesisLint, appPlatform, findEslintConfig, hasTestingLibrary, inlinesRntlRules, manualLines, readPackageJson, TESTING_LIBRARY, TESTING_LIBRARY_RANGE, usesGenesisLint } from "./eslint-config.js";
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

/**
 * Genesis's lint rules from the CLI (genesis-cli 1.20.0). An app's eslint.config.js used to be
 * copied once at `genesis init`; the rules now ship as `@marktiderman/genesis-cli/eslint`, so an
 * app that loads them gets new and changed rules with each CLI. For an app with a flat config that
 * doesn't load them yet (eslint-config.ts reads and edits it):
 *
 * - adds the import and spreads `genesis("native")` (or `"web"`) last into the exported array;
 * - in a native app, adds `eslint-plugin-testing-library` to devDependencies when it's missing.
 *
 * A config too unusual to edit safely (built in a variable or a function, exported twice) is left
 * as it is, and the lines to add are printed. A config that already loads the export is left alone.
 */
export const genesisEslintConfig: Codemod = {
  id: "genesis-cli-eslint-config",
  package: "@marktiderman/genesis-cli",
  version: "1.20.0",
  description: "Loads Genesis's lint rules from @marktiderman/genesis-cli/eslint in the app's eslint.config, so genesis upgrade delivers new ones.",
  run({ root, dryRun, log }) {
    const file = findEslintConfig(root);
    if (!file) return [];
    const changed: string[] = [];
    const pkg = readPackageJson(root);
    const platform = appPlatform(pkg);
    const abs = path.join(root, file);
    const text = readFileSync(abs, "utf8");
    if (!usesGenesisLint(text)) {
      const result = addGenesisLint(text, platform, file);
      if (result.ok) {
        changed.push(file);
        if (!dryRun) writeFileSync(abs, result.text);
        if (inlinesRntlRules(text)) {
          log(`  ${file} still has its own React Native Testing Library await rules (testing-library/await-async-events and the no-restricted-syntax selectors); genesis("${platform}") now brings them, so delete that block.`);
        }
      } else {
        log(`  ${file}: not edited, because ${result.reason}. Add Genesis's lint rules by hand:\n${manualLines(result.kind, platform).map((l) => `    ${l}`).join("\n")}`);
      }
    }
    if (platform === "native" && pkg && !hasTestingLibrary(pkg)) {
      const pkgFile = path.join(root, "package.json");
      const raw = readFileSync(pkgFile, "utf8");
      const indent = /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
      const json = JSON.parse(raw) as { devDependencies?: Record<string, string> };
      const names = Object.keys(json.devDependencies ?? {});
      const sorted = names.every((name, i) => i === 0 || names[i - 1]!.localeCompare(name) <= 0);
      const dev = Object.entries({ ...json.devDependencies, [TESTING_LIBRARY]: TESTING_LIBRARY_RANGE });
      // Kept in order when the app keeps them sorted (as npm and pnpm write them), else added last.
      json.devDependencies = Object.fromEntries(sorted ? dev.sort(([a], [b]) => a.localeCompare(b)) : dev);
      changed.push("package.json");
      if (!dryRun) writeFileSync(pkgFile, `${JSON.stringify(json, null, indent)}${raw.endsWith("\n") ? "\n" : ""}`);
      log(`  package.json: added ${TESTING_LIBRARY}@${TESTING_LIBRARY_RANGE} to devDependencies (Genesis's native lint rules use it); install to fetch it.`);
    }
    return changed;
  },
};

/** `empty` → `hasContent` inside each `<NativeComposerBar …>` tag. Its opposite sense: an expression is negated. */
export function rewriteComposerBarEmpty(text: string): string {
  const open = /<NativeComposerBar\b/g;
  let out = "";
  let at = 0;
  for (let m = open.exec(text); m; m = open.exec(text)) {
    // The tag runs to the first `>` outside braces (an arrow function's `=>` sits inside them).
    let depth = 0;
    let end = m.index + m[0].length;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const tag = text.slice(m.index, end);
    let next = tag;
    // Attributes only: an attribute's value in braces can't be matched past a nested brace, so those are left to the type error.
    next = next.replace(/(\s)empty=\{false\}/, "$1hasContent");
    next = next.replace(/(\s)empty=\{true\}/, "$1hasContent={false}");
    next = next.replace(/(\s)empty=\{([^{}]+)\}/, "$1hasContent={!($2)}");
    next = next.replace(/(\s)empty(?=[\s/]|$)/, "$1hasContent={false}");
    out += text.slice(at, m.index) + next;
    at = end;
  }
  return out + text.slice(at);
}

/**
 * NativeComposerBar's `empty` is `hasContent`, with the opposite sense (genesis-ui-native 3.8.0).
 * A spread (`{...bar}`) can't be read from here: its `empty` shows up as a type error.
 */
export const composerBarHasContent: Codemod = {
  id: "genesis-ui-native-3-8-composer-has-content",
  package: "@marktiderman/genesis-ui-native",
  version: "3.8.0",
  description: "NativeComposerBar's empty is now hasContent, with the opposite sense: empty={false} → hasContent.",
  run({ root, dryRun }) {
    const changed: string[] = [];
    for (const rel of appScripts(root)) {
      const abs = path.join(root, rel);
      const text = readFileSync(abs, "utf8");
      if (!text.includes("NativeComposerBar")) continue;
      const next = rewriteComposerBarEmpty(text);
      if (next === text) continue;
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, next);
    }
    return changed;
  },
};

export const CODEMODS: readonly Codemod[] = [scopeNeutralNames, genesisEslintConfig, composerBarHasContent];

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
