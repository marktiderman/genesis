// @feat:eas-workflows @feat:observability
/**
 * cli/sentry-source-maps (src/doctor/sentry.ts) and its fix (src/fix/sentry.ts): an app on Sentry
 * gets readable stack traces from Metro's Debug IDs, the Expo plugin, update uploads and the web
 * build, and genesis fix writes what it can.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { renderRelease, resolveRelease } from "../src/blocks/release-render.js";
import { releaseContext } from "../src/blocks/release.js";
import { GenesisConfigError, readGenesisConfig, validateObservability } from "../src/doctor/config.js";
import plugin, { sentryState, SENTRY_RULE } from "../src/doctor/sentry.js";
import type { DoctorContext, FindingInput } from "../src/doctor/types.js";
import { projectFromAppConfig, sentryCliAllowed, sentrySourceMapsFix, withSentryMetro, withSentryPlugin } from "../src/fix/sentry.js";
import { makeApp, read } from "./blocks-helpers.js";

const REPO = path.resolve(__dirname, "..", "..", "..");
const STARTER_METRO = readFileSync(path.join(REPO, "apps", "genesis-rn-starter", "metro.config.js"), "utf8");
const PROJECT = { organization: "acme", project: "sample-app" };

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "sample-app", dependencies: deps }, null, 2);
const DEFAULT_METRO = `const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), "../../packages/shared"];

module.exports = withNativeWind(config, { input: "./global.css" });
`;
const APP_CONFIG = `export default ({ config }) => ({
  ...config,
  name: "Sample",
  plugins: [
    "expo-router",
    // ["@sentry/react-native/expo", { organization: "acme", project: "sample-app" }],
  ],
});
`;
const OTA = `name: OTA
on: { push: { branches: [main] } }
jobs:
  ota:
    runs-on: ubuntu-latest
    steps:
      - run: npx eas-cli@26.0.0 update --channel production --non-interactive
      # npx --no sentry-expo-upload-sourcemaps dist
`;

function check(root: string): FindingInput[] {
  const found: FindingInput[] = [];
  plugin.check({ root, report: (f: FindingInput) => found.push(f) } as unknown as DoctorContext);
  return found;
}

const nativeApp = (extra: Record<string, string> = {}) =>
  makeApp({ "package.json": pkg({ expo: "~58.0.0", "@sentry/react-native": "~8.35.0" }), "metro.config.js": DEFAULT_METRO, "app.config.ts": APP_CONFIG, ".github/workflows/ota.yml": OTA, ...extra });

describe("cli/sentry-source-maps", () => {
  it("leaves an app without Sentry alone", () => {
    expect(check(makeApp({ "package.json": pkg({ expo: "~58.0.0" }), "metro.config.js": DEFAULT_METRO }))).toEqual([]);
  });

  it("flags each missing native piece: Debug IDs, the Expo plugin, update uploads (comments don't count)", () => {
    const found = check(nativeApp());
    expect(found.map((f) => [f.rule, f.level, f.subject, f.file])).toEqual([
      [SENTRY_RULE, "warn", "metro", "metro.config.js"],
      [SENTRY_RULE, "warn", "expo-plugin", "app.config.ts"],
      [SENTRY_RULE, "warn", "update-uploads", ".github/workflows/ota.yml"],
    ]);
  });

  it("passes the reference setup: getSentryExpoConfig, the plugin, and uploads after eas update or on the EAS job", () => {
    const root = nativeApp({
      "metro.config.js": DEFAULT_METRO.replace('const { getDefaultConfig } = require("expo/metro-config");', 'const { getSentryExpoConfig } = require("@sentry/react-native/metro");').replace("getDefaultConfig(", "getSentryExpoConfig("),
      "app.config.ts": APP_CONFIG.replace('    // ["@sentry', '    ["@sentry'),
      ".github/workflows/ota.yml": OTA.replace("      # npx --no", "      - run: npx --no"),
      ".eas/workflows/deploy.yml": "jobs:\n  publish:\n    type: update\n    params:\n      channel: production\n      upload_sentry_sourcemaps: true\n",
    });
    expect(check(root)).toEqual([]);
    // An EAS update job that leaves the upload unset (or false) is a gap.
    writeFileSync(path.join(root, ".eas/workflows/deploy.yml"), "jobs:\n  publish:\n    type: update\n    params:\n      upload_sentry_sourcemaps: false\n");
    expect(check(root).map((f) => f.file)).toEqual([".eas/workflows/deploy.yml"]);
  });

  it("an app whose observability.sentry is still empty gets one info, nothing more", () => {
    const root = nativeApp({ "genesis.config.json": JSON.stringify({ observability: { sentry: { organization: "", project: "" } } }) });
    const found = check(root);
    expect(found.map((f) => [f.level, f.subject])).toEqual([["info", "observability"]]);
  });

  it("the starter's metro source calls getSentryExpoConfig before the monorepo's changes, with NativeWind outermost", () => {
    expect(STARTER_METRO).toMatch(/getSentryExpoConfig\(projectRoot\)/);
    // NativeWind is the outermost wrapper, around the monorepo's changes.
    expect(STARTER_METRO.trim().split("\n").at(-1)).toBe('module.exports = withNativeWind(config, { input: "./global.css" });');
    expect(STARTER_METRO.indexOf("getSentryExpoConfig")).toBeLessThan(STARTER_METRO.indexOf("config.watchFolders ="));
    expect(STARTER_METRO.indexOf("getSentryExpoConfig")).toBeLessThan(STARTER_METRO.indexOf("config.resolver.resolveRequest ="));
  });

  it("flags a web Vite build without Sentry's plugin; the plugin or a framework wrapper passes", () => {
    const vite = 'import { defineConfig } from "vite";\nimport { tanstackStart } from "@tanstack/react-start/plugin/vite";\nexport default defineConfig({ plugins: [tanstackStart()] });\n';
    const root = makeApp({ "package.json": pkg({ "@sentry/tanstackstart-react": "^10.0.0" }), "vite.config.ts": vite });
    expect(check(root).map((f) => [f.subject, f.file])).toEqual([["vite", "vite.config.ts"]]);
    writeFileSync(path.join(root, "vite.config.ts"), `import { wrapVinxiConfigWithSentry } from "@sentry/tanstackstart-react";\n${vite.replace("tanstackStart()]", "tanstackStart(), sentryTanstackStart({ org: 'acme', project: 'sample-app', sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN } })]")}`);
    expect(check(root)).toEqual([]);
    writeFileSync(path.join(root, "vite.config.ts"), `import { sentryVitePlugin } from "@sentry/vite-plugin";\n${vite.replace("tanstackStart()]", "tanstackStart(), sentryVitePlugin({ org: 'acme', project: 'sample-app', sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN } })]")}`);
    expect(check(root)).toEqual([]);
    // Imported and never called: nothing uploads.
    writeFileSync(path.join(root, "vite.config.ts"), `import { sentryVitePlugin } from "@sentry/vite-plugin";\n${vite}`);
    expect(check(root).map((f) => [f.subject, f.file])).toEqual([["vite", "vite.config.ts"]]);
  });

  it("checks each publishing job for its own upload: one job's upload doesn't cover another's", () => {
    const root = nativeApp({
      "metro.config.js": DEFAULT_METRO.replace('const { getDefaultConfig } = require("expo/metro-config");', 'const { getSentryExpoConfig } = require("@sentry/react-native/metro");').replace("getDefaultConfig(", "getSentryExpoConfig("),
      "app.config.ts": APP_CONFIG.replace('    // ["@sentry', '    ["@sentry'),
      ".github/workflows/ota.yml": OTA.replace("      # npx --no", "      - run: npx --no"),
      ".eas/workflows/deploy.yml": "jobs:\n  ios:\n    type: update\n    params:\n      platform: ios\n      upload_sentry_sourcemaps: true\n  android:\n    type: update\n    params:\n      platform: android\n      upload_sentry_sourcemaps: false\n",
    });
    expect(check(root).map((f) => [f.subject, f.file])).toEqual([["update-uploads", ".eas/workflows/deploy.yml"]]);
    writeFileSync(path.join(root, ".eas/workflows/deploy.yml"), "jobs:\n  ios:\n    type: update\n    params:\n      upload_sentry_sourcemaps: true\n  android:\n    type: update\n    params:\n      upload_sentry_sourcemaps: true\n");
    expect(check(root)).toEqual([]);
    // A GitHub job that publishes, beside one that only uploads: the publishing job lacks it.
    writeFileSync(path.join(root, ".github/workflows/ota.yml"), "jobs:\n  publish:\n    steps:\n      - run: npx eas-cli@26.0.0 update --channel production\n  maps:\n    steps:\n      - run: npx --no sentry-expo-upload-sourcemaps dist\n");
    expect(check(root).map((f) => f.file)).toEqual([".github/workflows/ota.yml"]);
  });
});

describe("genesis fix sentry-source-maps", () => {
  it("swaps getDefaultConfig for getSentryExpoConfig and keeps the rest (NativeWind outermost)", () => {
    const next = withSentryMetro(DEFAULT_METRO)!;
    expect(next).toContain('const { getSentryExpoConfig } = require("@sentry/react-native/metro");');
    expect(next).toContain("const config = getSentryExpoConfig(__dirname);");
    expect(next).toContain('module.exports = withNativeWind(config, { input: "./global.css" });');
    expect(next).not.toContain("getDefaultConfig");
    // Beside other names, Sentry's import is added; a call with Expo's options, or one already on Sentry, is left alone.
    expect(withSentryMetro('const { getDefaultConfig, mergeConfig } = require("expo/metro-config");\nmodule.exports = getDefaultConfig(__dirname);\n')).toContain('mergeConfig } = require("expo/metro-config");\nconst { getSentryExpoConfig } = require("@sentry/react-native/metro");');
    expect(withSentryMetro('const { getDefaultConfig } = require("expo/metro-config");\nmodule.exports = getDefaultConfig(__dirname, { isCSSEnabled: true });\n')).toBeNull();
    expect(withSentryMetro(STARTER_METRO)).toBeNull();
  });

  it("puts Sentry's binding before the first call in a one-line config, or leaves it to you", () => {
    const oneLine = 'const { getDefaultConfig, mergeConfig } = require("expo/metro-config"); module.exports = getDefaultConfig(__dirname);\n';
    const next = withSentryMetro(oneLine)!;
    expect(next.indexOf('const { getSentryExpoConfig } = require("@sentry/react-native/metro");')).toBeLessThan(next.indexOf("getSentryExpoConfig(__dirname)"));
    // It loads: the binding is initialized before the call.
    const exported: { module: { exports?: unknown } } = { module: {} };
    const fakeRequire = (id: string) => (id === "expo/metro-config" ? { getDefaultConfig: () => "expo", mergeConfig: () => null } : { getSentryExpoConfig: (root: string) => `sentry:${root}` });
    new Function("require", "module", "__dirname", next)(fakeRequire, exported.module, "/app");
    expect(exported.module.exports).toBe("sentry:/app");
    // No `;` ending the import before the call: nowhere safe to put it.
    expect(withSentryMetro('const { getDefaultConfig, mergeConfig } = require("expo/metro-config"), config = getDefaultConfig(__dirname);\nmodule.exports = config;\n')).toBeNull();
  });

  it("adds the Expo plugin to app.config's one plugins list, or to app.json", () => {
    expect(withSentryPlugin("app.config.ts", APP_CONFIG, PROJECT)).toContain('  plugins: [\n    ["@sentry/react-native/expo", { organization: "acme", project: "sample-app", url: "https://sentry.io/" }],\n    "expo-router",');
    const appJson = JSON.parse(withSentryPlugin("app.json", JSON.stringify({ expo: { plugins: ["expo-router"] } }, null, 2), PROJECT)!);
    expect(appJson.expo.plugins).toEqual(["expo-router", ["@sentry/react-native/expo", { ...PROJECT, url: "https://sentry.io/" }]]);
    expect(withSentryPlugin("app.config.ts", "export default { ios: { plugins: [] }, plugins: [] };", PROJECT)).toBeNull();
  });

  it("plans the files it can write, then the doctor finds only what it left to you; the token is always listed", async () => {
    const root = nativeApp({
      "app.config.ts": APP_CONFIG.replace('    // ["@sentry/react-native/expo", { organization: "acme", project: "sample-app" }],\n', ""),
      "genesis.config.json": `{\n  "observability": { "sentry": ${JSON.stringify(PROJECT)} }\n}\n`,
      "pnpm-workspace.yaml": 'allowBuilds:\n  "@sentry/cli": false\n  esbuild: true\n',
      "pnpm-lock.yaml": "",
    });
    const plan = await sentrySourceMapsFix.plan({ root, findings: [] });
    expect(plan.files!.map((f) => f.path)).toEqual(["metro.config.js", "app.config.ts", "pnpm-workspace.yaml"]);
    expect(plan.manual).toContain("SENTRY_AUTH_TOKEN");
    expect(plan.manual).toContain("eas env:create --name SENTRY_AUTH_TOKEN");
    expect(plan.manual).toContain(".github/workflows/ota.yml: after each eas update, run npx --no sentry-expo-upload-sourcemaps dist");
    for (const f of plan.files!) writeFileSync(path.join(root, f.path), f.content);
    expect(read(root, "pnpm-workspace.yaml")).toBe('allowBuilds:\n  "@sentry/cli": true\n  esbuild: true\n');
    expect(sentryState(root).gaps.map((g) => g.piece)).toEqual(["update-uploads"]);
  });

  it("takes release.sentry: false as the app's choice, and lists the pnpm step when the workspace doesn't name @sentry/cli", async () => {
    const off = nativeApp({
      "genesis.config.json": `{\n  "observability": { "sentry": ${JSON.stringify(PROJECT)} },\n  "release": { "sentry": false }\n}\n`,
      ".github/workflows/ota.yml": "jobs:\n  ota:\n    steps:\n      - run: eas update --branch production\n",
    });
    expect(sentryState(off).gaps.map((g) => g.piece)).not.toContain("update-uploads");
    const root = nativeApp({ "pnpm-workspace.yaml": "packages:\n  - apps/*\n", "pnpm-lock.yaml": "" });
    const plan = await sentrySourceMapsFix.plan({ root, findings: [] });
    expect(plan.manual).toContain("onlyBuiltDependencies (pnpm 10)");
  });

  it("reads whether pnpm lets @sentry/cli build: only allowBuilds and onlyBuiltDependencies, never comments or other lists", () => {
    const yes = [
      'allowBuilds:\n  "@sentry/cli": true\n',
      "allowBuilds:\n  '@sentry/cli': true # uploader\n",
      'allowBuilds: { "@sentry/cli": true, esbuild: true }\n',
      "onlyBuiltDependencies:\n  - '@sentry/cli' # uploader\n  - esbuild\n",
      "onlyBuiltDependencies: ['@sentry/cli', esbuild]\n",
    ];
    const no = [
      "packages:\n  - apps/*\n",
      "ignoredBuiltDependencies:\n  - '@sentry/cli'\n",
      'allowBuilds:\n  # "@sentry/cli": true\n  esbuild: true\n',
      'allowBuilds:\n  "@sentry/cli": false\n',
      "packages:\n  - '@sentry/cli'\n",
    ];
    for (const y of yes) expect(sentryCliAllowed(y), y).toBe(true);
    for (const n of no) expect(sentryCliAllowed(n), n).toBe(false);
  });

  it("adopts the project from the app's own plugin options into genesis.config.json", async () => {
    const root = nativeApp({ "app.config.ts": APP_CONFIG.replace('    // ["@sentry', '    ["@sentry'), "genesis.config.json": '{\n  "links": { "hosts": ["example.com"] }\n}\n' });
    const plan = await sentrySourceMapsFix.plan({ root, findings: [] });
    const config = plan.files!.find((f) => f.path === "genesis.config.json")!;
    expect(JSON.parse(config.content).observability).toEqual({ sentry: PROJECT });
    expect(JSON.parse(config.content).links).toEqual({ hosts: ["example.com"] });
    writeFileSync(path.join(root, "genesis.config.json"), config.content);
    // release.sentry follows it: the release lane uploads update source maps.
    expect(releaseContext(root).release.sentry).toBe(true);
  });

  it("adopts only the Sentry plugin's own options, never a neighbouring plugin's", () => {
    const other = (sentry: string) => `export default { plugins: [\n  ${sentry},\n  ["other-plugin", { organization: "other-org", project: "other-project" }],\n] };\n`;
    expect(projectFromAppConfig(makeApp({ "app.config.ts": other('"@sentry/react-native/expo"') }))).toBeNull();
    expect(projectFromAppConfig(makeApp({ "app.config.ts": other('["@sentry/react-native/expo", sentryOptions]') }))).toBeNull();
    expect(projectFromAppConfig(makeApp({ "app.config.ts": other('["@sentry/react-native/expo", { url: "https://sentry.io/" }]') }))).toBeNull();
    expect(projectFromAppConfig(makeApp({ "app.config.ts": other('["@sentry/react-native/expo", { organization: "acme", project: "sample-app", note: "a } in a string" }]') }))).toEqual(PROJECT);
  });
});

describe("observability.sentry: the one switch", () => {
  it("validates the block", () => {
    expect(validateObservability({ sentry: { ...PROJECT, url: "https://sentry.io/" } })).toEqual({ sentry: { ...PROJECT, url: "https://sentry.io/" } });
    expect(validateObservability({ sentry: { organization: "", project: "" } })).toEqual({ sentry: { organization: "", project: "" } });
    for (const bad of [[], { sentry: "acme" }, { sentry: { organization: "Acme", project: "x" } }, { sentry: { ...PROJECT, dsn: "x" } }, { sentry: { ...PROJECT, url: "http://sentry.io" } }, { sentri: {} }]) {
      expect(() => validateObservability(bad), JSON.stringify(bad)).toThrow(GenesisConfigError);
    }
  });

  it("release.sentry defaults to on with a configured project; an explicit false wins", () => {
    const on = makeApp({ "genesis.config.json": JSON.stringify({ observability: { sentry: PROJECT } }) });
    expect(readGenesisConfig(on)?.observability?.sentry).toEqual(PROJECT);
    expect(releaseContext(on).release.sentry).toBe(true);
    expect(releaseContext(makeApp({ "genesis.config.json": JSON.stringify({ observability: { sentry: PROJECT }, release: { sentry: false } }) })).release.sentry).toBe(false);
    expect(releaseContext(makeApp({ "genesis.config.json": JSON.stringify({ observability: { sentry: { organization: "", project: "" } } }) })).release.sentry).toBe(false);
  });

  it("pr-preview: with Sentry on, the token and uploader are checked before publishing and each platform's update uploads", () => {
    const text = (sentry: boolean) => renderRelease(readFileSync(path.join(REPO, "templates", "release", "pr-preview.yml"), "utf8"), { release: resolveRelease({ sentry }), appFolder: null });
    const run = (sentry: boolean) => (parse(text(sentry)).jobs.publish_update.steps as { id?: string; run?: string }[]).find((s) => s.id === "publish")!.run!;
    const on = run(true);
    expect(on.indexOf("native-release.mjs require SENTRY_AUTH_TOKEN")).toBeGreaterThan(-1);
    expect(on.indexOf("native-release.mjs require SENTRY_AUTH_TOKEN")).toBeLessThan(on.indexOf("eas-cli@26.0.0 update --branch"));
    expect(on.indexOf("installed @sentry/react-native")).toBeLessThan(on.indexOf("eas-cli@26.0.0 update --branch"));
    expect(on.indexOf("if ! npx --no sentry-expo-upload-sourcemaps dist; then")).toBeGreaterThan(on.indexOf("eas-cli@26.0.0 update --branch"));
    expect(on.indexOf("if ! npx --no sentry-expo-upload-sourcemaps dist; then")).toBeLessThan(on.indexOf("done"));
    expect(run(false)).not.toContain("sentry");
  });
});
