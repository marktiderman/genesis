/**
 * `@marktiderman/genesis-cli/eslint`: Genesis's lint rules for apps, as ESLint flat-config pieces.
 * An app spreads them into its `eslint.config.js`, and `genesis upgrade` delivers new and changed
 * rules with the CLI, so the app's config never has to change for them:
 *
 * ```js
 * const { genesis } = require("@marktiderman/genesis-cli/eslint");
 * module.exports = defineConfig([expoConfig, ...genesis("native")]);
 * ```
 *
 * Built for `require` and `import` alike. Plugins are loaded only when a piece that needs them is
 * built, never on import: `testing` needs `eslint-plugin-testing-library` (an optional peer
 * dependency of genesis-cli; install it in the app's devDependencies).
 */
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** One flat-config object, as much of ESLint's `Linter.Config` as the pieces use. */
export interface GenesisLintConfig {
  name?: string;
  files?: string[];
  ignores?: string[];
  plugins?: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

/** The platform an app is built for. */
export type GenesisPlatform = "native" | "web";

export interface GenesisLintOptions {
  /**
   * The test files the testing rules cover. Default: files under `__tests__/` and
   * `*.test.*` files ({@link TEST_FILES}).
   */
  testFiles?: string[];
  /**
   * The app's own helpers that wrap React Native Testing Library's `render` (and so return a
   * promise), checked like `render`. `renderApp` (the starter's helper) and expo-router's
   * `renderRouter` are always checked.
   */
  renders?: string[];
  /**
   * `eslint-plugin-testing-library`, when the app loads it itself (say, to configure more of its
   * rules). Otherwise it is resolved from the app (the working directory), then from genesis-cli.
   */
  testingLibrary?: unknown;
}

/** The test files the testing rules cover by default. */
export const TEST_FILES = ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"];

/** What React Native Testing Library 14 made async, beyond fireEvent: render calls and act. */
export const RNTL_ASYNC_CALLS = ["render", "renderHook", "renderRouter", "renderApp", "act"] as const;

/** The plugin's package name, for the error when it isn't installed. */
export const TESTING_LIBRARY_PLUGIN = "eslint-plugin-testing-library";

const here = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);

/** `eslint-plugin-testing-library`, from the app first (the copy its own config would load), then from genesis-cli. */
function loadTestingLibrary(): unknown {
  const from = [path.join(process.cwd(), "package.json"), here];
  for (const base of from) {
    try {
      const mod = createRequire(base)(TESTING_LIBRARY_PLUGIN) as { default?: unknown };
      return mod && typeof mod === "object" && "rules" in mod ? mod : (mod.default ?? mod);
    } catch {
      // try the next place
    }
  }
  throw new Error(
    `@marktiderman/genesis-cli/eslint: Genesis's testing rules need ${TESTING_LIBRARY_PLUGIN}. Install it in the app's devDependencies (pnpm add -D ${TESTING_LIBRARY_PLUGIN}), or pass it as { testingLibrary: require("${TESTING_LIBRARY_PLUGIN}") }.`,
  );
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One `no-restricted-syntax` entry per place a call's promise is dropped: a statement, a declaration, an assignment. */
function unawaited(message: string, ...callees: string[]): { selector: string; message: string }[] {
  return callees.flatMap((callee) => [
    { selector: `ExpressionStatement > CallExpression${callee}`, message },
    { selector: `VariableDeclarator > CallExpression${callee}`, message },
    { selector: `AssignmentExpression > CallExpression${callee}`, message },
  ]);
}

/**
 * The `no-restricted-syntax` entries for React Native Testing Library 14's async calls: render,
 * renderHook, renderRouter, renderApp (plus `renders`) and act; rerender and unmount, as methods
 * and destructured; and a chained `userEvent.setup().press(…)`, which await-async-events doesn't
 * follow. Each flags a call whose promise is dropped (a statement, a declaration, an assignment).
 * Exported so an app with its own `no-restricted-syntax` for test files can keep both.
 */
export function rntlAwaitSelectors(options: Pick<GenesisLintOptions, "renders"> = {}): { selector: string; message: string }[] {
  const calls = [...new Set([...RNTL_ASYNC_CALLS, ...(options.renders ?? [])])].map(escape).join("|");
  return [
    ...unawaited(
      "React Native Testing Library 14's render calls (render, renderHook, renderRouter, renderApp) and act return promises: await them.",
      `[callee.name=/^(${calls})$/]`,
    ),
    ...unawaited(
      "React Native Testing Library 14's rerender and unmount return promises: await them.",
      "[callee.property.name=/^(rerender|unmount)$/]",
      "[callee.name=/^(rerender|unmount)$/]",
    ),
    ...unawaited(
      "userEvent's events return promises: await them.",
      '[callee.object.type="CallExpression"][callee.object.callee.object.name="userEvent"][callee.object.callee.property.name="setup"]',
    ),
  ];
}

/**
 * React Native Testing Library 14's await rules, for test files. RNTL 14 made render, renderHook,
 * fireEvent, act, rerender and unmount async; left unawaited, a test reads the screen before React
 * has updated it, and React logs "overlapping act() calls".
 *
 * - `testing-library/await-async-events` with `eventModule: ["fireEvent", "userEvent"]` (its
 *   React preset assumes fireEvent is sync, so only this rule is turned on);
 * - `no-restricted-syntax` for what the plugin has no rule for ({@link rntlAwaitSelectors}).
 *
 * The piece sets `no-restricted-syntax` for test files, so an app's own setting of that rule for
 * the same files, later in the array, replaces it: spread `rntlAwaitSelectors()` into yours.
 */
export function testing(options: GenesisLintOptions = {}): GenesisLintConfig[] {
  return [
    {
      name: "genesis/testing",
      files: options.testFiles ?? TEST_FILES,
      plugins: { "testing-library": options.testingLibrary ?? loadTestingLibrary() },
      rules: {
        "testing-library/await-async-events": ["error", { eventModule: ["fireEvent", "userEvent"] }],
        "no-restricted-syntax": ["error", ...rntlAwaitSelectors(options)],
      },
    },
  ];
}

/**
 * Every Genesis lint piece for the platform, so rules a release adds arrive without an app edit:
 *
 * - `"native"`: {@link testing}.
 * - `"web"`: none yet. Testing Library for React keeps `render` and `fireEvent` synchronous, so the
 *   RNTL await rules don't apply; spreading it now means web rules arrive when Genesis has some.
 */
export function genesis(platform: GenesisPlatform, options: GenesisLintOptions = {}): GenesisLintConfig[] {
  if (platform === "native") return [...testing(options)];
  if (platform === "web") return [];
  throw new Error(`@marktiderman/genesis-cli/eslint: genesis("${String(platform)}"): the platform is "native" or "web".`);
}
