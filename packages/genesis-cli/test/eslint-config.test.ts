// @feat:cli-upgrade
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { genesis, rntlAwaitSelectors, testing, TEST_FILES } from "../src/eslint.js";
import { codemodById, codemodsFor, CODEMODS, genesisEslintConfig } from "../src/upgrade/codemods.js";
import { addGenesisLint, TESTING_LIBRARY_RANGE } from "../src/upgrade/eslint-config.js";
import { checkEslintConfig } from "../src/doctor/eslint-config.js";
import type { DoctorContext, FindingInput } from "../src/doctor/types.js";
import { makeApp, PACKAGES, read } from "./blocks-helpers.js";

const plugin = { rules: {} };

/** The starter's eslint.config.js as genesis-cli 1.19 shipped it: the RNTL rules inlined. */
const STARTER_1_19 = `// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const testingLibrary = require("eslint-plugin-testing-library");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", "supabase/functions/**"] },
  {
    files: ["**/*.test.{js,jsx,ts,tsx}"],
    plugins: { "testing-library": testingLibrary },
    rules: { "testing-library/await-async-events": ["error", { eventModule: ["fireEvent", "userEvent"] }] },
  },
]);
`;

/** What \`genesis init --template native\` wrote before testing rules: the Expo default. */
const PLAIN = `// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  }
]);
`;

const nativePackage = (dev: Record<string, string> = {}) =>
  `${JSON.stringify({ name: "acme", dependencies: { expo: "~58.0.19", "react-native": "0.88.0" }, devDependencies: { eslint: "^9.0.0", ...dev } }, null, 2)}\n`;

describe("@marktiderman/genesis-cli/eslint", () => {
  it("ships React Native Testing Library 14's await rules for test files", () => {
    const [piece, ...rest] = testing({ testingLibrary: plugin });
    expect(rest).toEqual([]);
    expect(piece!.name).toBe("genesis/testing");
    expect(piece!.files).toEqual(TEST_FILES);
    expect(piece!.plugins).toEqual({ "testing-library": plugin });
    expect(piece!.rules!["testing-library/await-async-events"]).toEqual(["error", { eventModule: ["fireEvent", "userEvent"] }]);
    const [level, ...selectors] = piece!.rules!["no-restricted-syntax"] as [string, ...{ selector: string; message: string }[]];
    expect(level).toBe("error");
    expect(selectors).toEqual(rntlAwaitSelectors());
    const all = selectors.map((s) => s.selector);
    // render calls and act, rerender/unmount as methods and destructured, chained userEvent.setup(): each as a statement, a declaration and an assignment.
    expect(all).toHaveLength(12);
    expect(all).toContain("ExpressionStatement > CallExpression[callee.name=/^(render|renderHook|renderRouter|renderApp|act)$/]");
    expect(all).toContain("AssignmentExpression > CallExpression[callee.property.name=/^(rerender|unmount)$/]");
    expect(all).toContain("VariableDeclarator > CallExpression[callee.name=/^(rerender|unmount)$/]");
    expect(all.filter((s) => s.includes('callee.object.callee.property.name="setup"'))).toHaveLength(3);
  });

  it("takes the app's own render helpers and test globs", () => {
    const [piece] = testing({ testingLibrary: plugin, renders: ["renderWithStore"], testFiles: ["src/**/*.spec.tsx"] });
    expect(piece!.files).toEqual(["src/**/*.spec.tsx"]);
    expect(JSON.stringify(piece!.rules)).toContain("renderApp|act|renderWithStore");
  });

  it("genesis(platform) returns every piece: the testing rules on native, none yet on web", () => {
    expect(genesis("native", { testingLibrary: plugin })).toEqual(testing({ testingLibrary: plugin }));
    expect(genesis("web")).toEqual([]);
    expect(() => genesis("tv" as never)).toThrow(/"native" or "web"/);
  });

  it("is a subpath for import and require, with eslint-plugin-testing-library an optional peer", () => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGES, "genesis-cli", "package.json"), "utf8"));
    expect(pkg.exports["./eslint"]).toEqual({
      import: { types: "./dist/eslint.d.ts", default: "./dist/eslint.js" },
      require: { types: "./dist/eslint.d.cts", default: "./dist/eslint.cjs" },
    });
    expect(pkg.peerDependencies["eslint-plugin-testing-library"]).toBeDefined();
    expect(pkg.peerDependenciesMeta["eslint-plugin-testing-library"]).toEqual({ optional: true });
  });

  it("is what the starter's config loads, at the plugin range the codemod adds", () => {
    const starter = path.join(PACKAGES, "..", "apps", "genesis-rn-starter");
    expect(readFileSync(path.join(starter, "eslint.config.js"), "utf8")).toContain('...genesis("native")');
    expect(JSON.parse(readFileSync(path.join(starter, "package.json"), "utf8")).devDependencies["eslint-plugin-testing-library"]).toBe(TESTING_LIBRARY_RANGE);
  });
});

describe("addGenesisLint", () => {
  it("adds the require and spreads the native piece last into a defineConfig array", () => {
    const result = addGenesisLint(PLAIN, "native");
    expect(result).toEqual({
      ok: true,
      text: `// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const { genesis } = require("@marktiderman/genesis-cli/eslint");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  ...genesis("native"),
]);
`,
    });
  });

  it("edits an ES module's exported array, and a variadic config call", () => {
    const esm = `import js from "@eslint/js";\nimport {\n  a,\n} from "./a.js";\n\nexport default [js.configs.recommended, a];\n`;
    expect(addGenesisLint(esm, "web", "eslint.config.mjs")).toEqual({
      ok: true,
      text: `import js from "@eslint/js";\nimport {\n  a,\n} from "./a.js";\nimport { genesis } from "@marktiderman/genesis-cli/eslint";\n\nexport default [js.configs.recommended, a, ...genesis("web")];\n`,
    });
    const variadic = `import tseslint from "typescript-eslint";\nexport default tseslint.config(\n  tseslint.configs.recommended,\n);\n`;
    expect(addGenesisLint(variadic, "web", "eslint.config.ts")).toMatchObject({
      ok: true,
      text: `import tseslint from "typescript-eslint";\nimport { genesis } from "@marktiderman/genesis-cli/eslint";\nexport default tseslint.config(\n  tseslint.configs.recommended,\n  ...genesis("web"),\n);\n`,
    });
    expect(addGenesisLint("module.exports = [];\n", "native")).toEqual({ ok: true, text: `const { genesis } = require("@marktiderman/genesis-cli/eslint");\nmodule.exports = [...genesis("native")];\n` });
  });

  it("isn't fooled by brackets in strings and comments, and renames around an app's own genesis", () => {
    const text = `const genesis = require("./genesis");\n// module.exports = [old];\nmodule.exports = [\n  { ignores: ["a]"] }, // ] here\n  genesis,\n];\n`;
    const result = addGenesisLint(text, "native");
    expect(result.ok && result.text).toBe(
      `const genesis = require("./genesis");\nconst { genesis: genesisLint } = require("@marktiderman/genesis-cli/eslint");\n// module.exports = [old];\nmodule.exports = [\n  { ignores: ["a]"] }, // ] here\n  genesis,\n  ...genesisLint("native"),\n];\n`,
    );
  });

  it("leaves an unusual config alone and says why", () => {
    expect(addGenesisLint("const config = [];\nmodule.exports = config;\n", "native")).toEqual({ ok: false, kind: "cjs", reason: "it doesn't export an array or a `defineConfig(...)` call" });
    expect(addGenesisLint("export default async () => [];\n", "web")).toMatchObject({ ok: false, kind: "esm" });
    expect(addGenesisLint("module.exports = [];\nmodule.exports = [];\n", "native")).toMatchObject({ ok: false, reason: "it exports its config more than once" });
    expect(addGenesisLint("module.exports = [\n", "native")).toMatchObject({ ok: false, reason: "its exported array doesn't close where expected" });
  });
});

describe("genesis-cli-eslint-config", () => {
  it("is registered for genesis-cli 1.20.0, and runs when the CLI crosses it", () => {
    expect(codemodById("genesis-cli-eslint-config")).toBe(genesisEslintConfig);
    expect(CODEMODS).toContain(genesisEslintConfig);
    expect(codemodsFor([{ file: "package.json", name: "@marktiderman/genesis-cli", from: "^1.19.0", to: "^1.20.0" }])).toEqual([genesisEslintConfig]);
    expect(codemodsFor([{ file: "package.json", name: "@marktiderman/genesis-cli", from: "^1.20.0", to: "^1.21.0" }])).toEqual([]);
  });

  it("wires a plain native config and adds eslint-plugin-testing-library, in order", async () => {
    const root = makeApp({ "eslint.config.js": PLAIN, "package.json": nativePackage({ "eslint-config-expo": "~58.0.4", jest: "~30.5.2" }) });
    const logs: string[] = [];
    const changed = await genesisEslintConfig.run({ root, dryRun: false, log: (m) => logs.push(m) });
    expect(changed).toEqual(["eslint.config.js", "package.json"]);
    expect(read(root, "eslint.config.js")).toBe((addGenesisLint(PLAIN, "native") as { text: string }).text);
    const pkg = JSON.parse(read(root, "package.json"));
    expect(Object.keys(pkg.devDependencies)).toEqual(["eslint", "eslint-config-expo", "eslint-plugin-testing-library", "jest"]);
    expect(pkg.devDependencies["eslint-plugin-testing-library"]).toBe(TESTING_LIBRARY_RANGE);
    expect(read(root, "package.json").endsWith("}\n")).toBe(true);
  });

  it("says to delete the starter's inlined rules, which Genesis now brings", async () => {
    const root = makeApp({ "eslint.config.js": STARTER_1_19, "package.json": nativePackage({ "eslint-plugin-testing-library": "^7.16.2" }) });
    const logs: string[] = [];
    expect(await genesisEslintConfig.run({ root, dryRun: false, log: (m) => logs.push(m) })).toEqual(["eslint.config.js"]);
    expect(read(root, "eslint.config.js")).toContain('  },\n  ...genesis("native"),\n]);');
    expect(logs.join("\n")).toMatch(/delete that block/);
  });

  it("leaves a config that already loads the export, and a dry run, unchanged", async () => {
    const migrated = read(path.join(PACKAGES, "..", "apps", "genesis-rn-starter"), "eslint.config.js");
    const root = makeApp({ "eslint.config.js": migrated, "package.json": nativePackage({ "eslint-plugin-testing-library": "^7.16.2" }) });
    expect(await genesisEslintConfig.run({ root, dryRun: false, log: () => {} })).toEqual([]);
    expect(read(root, "eslint.config.js")).toBe(migrated);

    const dry = makeApp({ "eslint.config.js": PLAIN, "package.json": nativePackage() });
    expect(await genesisEslintConfig.run({ root: dry, dryRun: true, log: () => {} })).toEqual(["eslint.config.js", "package.json"]);
    expect(read(dry, "eslint.config.js")).toBe(PLAIN);
    expect(read(dry, "package.json")).toBe(nativePackage());
  });

  it("prints the lines to add for an unusual config, and still adds the plugin", async () => {
    const unusual = `const config = require("./lint/base");\nmodule.exports = config;\n`;
    const root = makeApp({ "eslint.config.js": unusual, "package.json": nativePackage() });
    const logs: string[] = [];
    expect(await genesisEslintConfig.run({ root, dryRun: false, log: (m) => logs.push(m) })).toEqual(["package.json"]);
    expect(read(root, "eslint.config.js")).toBe(unusual);
    expect(logs.join("\n")).toContain(`not edited, because it doesn't export an array`);
    expect(logs.join("\n")).toContain(`    const { genesis } = require("@marktiderman/genesis-cli/eslint");\n    ...genesis("native"),`);
  });

  it("gives a web app the web piece and no plugin, and skips an app without a flat config", async () => {
    const web = makeApp({ "eslint.config.js": "export default [];\n", "package.json": `${JSON.stringify({ name: "acme-web", type: "module", dependencies: { react: "19.3.0" } })}\n` });
    expect(await genesisEslintConfig.run({ root: web, dryRun: false, log: () => {} })).toEqual(["eslint.config.js"]);
    expect(read(web, "eslint.config.js")).toBe(`import { genesis } from "@marktiderman/genesis-cli/eslint";\nexport default [...genesis("web")];\n`);
    expect(await genesisEslintConfig.run({ root: makeApp({ ".eslintrc.json": "{}" }), dryRun: false, log: () => {} })).toEqual([]);
  });
});

describe("doctor: genesis-eslint-config", () => {
  const check = (root: string) => {
    const found: FindingInput[] = [];
    checkEslintConfig({ root, config: {}, report: (f) => found.push(f) } as unknown as DoctorContext);
    return found;
  };

  it("warns a native app whose config doesn't load the export, with the fix", () => {
    const [finding, ...rest] = check(makeApp({ "eslint.config.js": PLAIN, "package.json": nativePackage() }));
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ rule: "genesis-eslint-config", level: "warn", file: "eslint.config.js" });
    expect(finding!.message).toContain("genesis codemod genesis-cli-eslint-config");
    expect(finding!.message).toContain('...genesis("native")');
  });

  it("warns when the config loads it without the plugin installed", () => {
    const migrated = read(path.join(PACKAGES, "..", "apps", "genesis-rn-starter"), "eslint.config.js");
    expect(check(makeApp({ "eslint.config.js": migrated, "package.json": nativePackage() }))).toMatchObject([{ rule: "genesis-eslint-config", file: "package.json", subject: "eslint-plugin-testing-library" }]);
    // Listed but not installed (the codemod edits package.json, nothing more): the lint can't load yet.
    expect(check(makeApp({ "eslint.config.js": migrated, "package.json": nativePackage({ "eslint-plugin-testing-library": "^7.16.2" }), "pnpm-lock.yaml": "" }))).toMatchObject([{ rule: "genesis-eslint-config", file: "package.json", message: expect.stringContaining("run pnpm install") }]);
    expect(check(makeApp({ "eslint.config.js": migrated, "package.json": nativePackage({ "eslint-plugin-testing-library": "^7.16.2" }), "node_modules/eslint-plugin-testing-library/package.json": "{}" }))).toEqual([]);
  });

  it("leaves web apps and apps without a flat config alone", () => {
    expect(check(makeApp({ "eslint.config.js": PLAIN }))).toEqual([]);
    expect(check(makeApp({ "package.json": nativePackage() }))).toEqual([]);
  });
});
