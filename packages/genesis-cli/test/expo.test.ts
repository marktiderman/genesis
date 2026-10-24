// @feat:expo-config-plugin
/**
 * withGenesis() on plain ExpoConfig objects, and the `links` block of
 * genesis.config.json it reads through the CLI's config loader.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpoConfig } from "@expo/config-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/doctor/config";
import {
  applyPrivacyApis,
  GenesisConfigError,
  privacyApisFor,
  readGenesisConfig,
  resolveVariant,
  validateLinks,
  withGenesis,
  type WithGenesisOptions,
} from "../src/expo";

const base = (): ExpoConfig => ({
  name: "Sample",
  slug: "sample",
  ios: { bundleIdentifier: "com.example.sample" },
  android: { package: "com.example.sample" },
});

let root: string;
const savedVariant = process.env.APP_VARIANT;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "genesis-expo-"));
  delete process.env.APP_VARIANT;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (savedVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = savedVariant;
});

function write(file: string, json: unknown) {
  writeFileSync(path.join(root, file), JSON.stringify(json));
}

function run(config: ExpoConfig = base(), options: WithGenesisOptions = {}) {
  return withGenesis(config, { projectRoot: root, ...options });
}

describe("app variants", () => {
  it("leaves production ids and name alone, and production is the default", () => {
    const out = run();
    expect(out.name).toBe("Sample");
    expect(out.ios?.bundleIdentifier).toBe("com.example.sample");
    expect(out.android?.package).toBe("com.example.sample");
  });

  it("suffixes ids and name per APP_VARIANT so the three builds install side by side", () => {
    process.env.APP_VARIANT = "development";
    const dev = run();
    process.env.APP_VARIANT = "preview";
    const preview = run();
    expect([dev.name, dev.ios?.bundleIdentifier, dev.android?.package]).toEqual([
      "Sample (Dev)",
      "com.example.sample.dev",
      "com.example.sample.dev",
    ]);
    expect([preview.name, preview.ios?.bundleIdentifier, preview.android?.package]).toEqual([
      "Sample (Preview)",
      "com.example.sample.preview",
      "com.example.sample.preview",
    ]);
  });

  it("does not suffix twice when it runs twice", () => {
    process.env.APP_VARIANT = "development";
    const once = run();
    expect(run(once)).toEqual(once);
    expect(once.ios?.bundleIdentifier).toBe("com.example.sample.dev");
  });

  it("takes configured suffixes and an explicit variant", () => {
    const out = run(base(), { variant: "development", variants: { development: { id: ".debug" } } });
    expect(out.ios?.bundleIdentifier).toBe("com.example.sample.debug");
    expect(out.name).toBe("Sample (Dev)");
  });

  it("does not invent ids the app doesn't set", () => {
    const out = run({ name: "Sample", slug: "sample" }, { variant: "preview" });
    expect(out.ios?.bundleIdentifier).toBeUndefined();
    expect(out.android?.package).toBeUndefined();
  });

  it("fails loud on an unknown APP_VARIANT", () => {
    process.env.APP_VARIANT = "staging";
    expect(() => run()).toThrow(GenesisConfigError);
    expect(() => resolveVariant("dev")).toThrow(/expected one of development, preview, production/);
  });
});

describe("links", () => {
  it("sets associated domains and a verified Android intent filter from genesis.config.json", () => {
    write("genesis.config.json", { links: { hosts: ["example.com", "app.example.com"], paths: ["/invite"] } });
    const out = run();
    expect(out.ios?.associatedDomains).toEqual([
      "applinks:example.com",
      "webcredentials:example.com",
      "applinks:app.example.com",
      "webcredentials:app.example.com",
    ]);
    expect(out.android?.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "example.com", pathPrefix: "/invite" },
          { scheme: "https", host: "app.example.com", pathPrefix: "/invite" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]);
  });

  it("keeps the app's own domains and filters, and running twice adds nothing", () => {
    write("genesis.config.json", { links: { hosts: ["example.com"] } });
    const own = { action: "VIEW", data: [{ scheme: "sample" }], category: ["DEFAULT"] };
    const config = base();
    config.ios!.associatedDomains = ["applinks:other.example.org", "applinks:example.com"];
    config.android!.intentFilters = [own];
    const once = run(config);
    expect(run(once)).toEqual(once);
    expect(once.ios?.associatedDomains).toEqual(["applinks:other.example.org", "applinks:example.com", "webcredentials:example.com"]);
    expect(once.android?.intentFilters?.[0]).toEqual(own);
    expect(once.android?.intentFilters).toHaveLength(2);
  });

  it("does nothing without a genesis.config.json or a links block", () => {
    expect(run().ios?.associatedDomains).toBeUndefined();
    write("genesis.config.json", { doctor: {} });
    expect(run().android?.intentFilters).toBeUndefined();
  });

  it("validates the block: a scheme, a path or an unknown key fails with the file named", () => {
    write("genesis.config.json", { links: { hosts: ["https://example.com"] } });
    expect(() => run()).toThrow(/genesis\.config\.json: links\.hosts: "https:\/\/example\.com" is not a bare/);
    expect(() => validateLinks({ hosts: [] })).toThrow(/non-empty list/);
    expect(() => validateLinks({ hosts: ["example.com/app"] })).toThrow(/bare lower-case host/);
    expect(() => validateLinks({ hosts: ["Example.com"] })).toThrow(/bare lower-case host/);
    expect(() => validateLinks({ hosts: ["example.com"], paths: ["invite"] })).toThrow(/must start with "\/"/);
    expect(() => validateLinks({ hosts: ["example.com"], host: "x" })).toThrow(/unknown setting "host"/);
    expect(() => validateLinks({ hosts: ["example.com"], webcredentials: "no" })).toThrow(/true or false/);
    expect(validateLinks({ hosts: ["*.example.com", "*.example.com"] })).toEqual({ hosts: ["*.example.com"] });
  });

  it("leaves out webcredentials: when links.webcredentials is false", () => {
    write("genesis.config.json", { links: { hosts: ["example.com"], webcredentials: false } });
    expect(run().ios?.associatedDomains).toEqual(["applinks:example.com"]);
  });

  it("is the same loader the doctor reads, so a bad links block fails the doctor too", () => {
    write("genesis.config.json", { doctor: { src: ["app"] }, links: { hosts: ["example.com"] } });
    expect(readGenesisConfig(root)?.links).toEqual({ hosts: ["example.com"] });
    expect(loadConfig(root).config).toEqual({ src: ["app"] });
    write("genesis.config.json", { doctor: {}, links: { hosts: "example.com" } });
    expect(() => loadConfig(root)).toThrow(GenesisConfigError);
  });
});

describe("privacy manifest", () => {
  it("declares FileTimestamp (C617.1) when async-storage is installed, as its own manifest does", () => {
    write("package.json", { dependencies: { "@react-native-async-storage/async-storage": "^2.2.0" } });
    expect(run().ios?.privacyManifests).toEqual({
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
      ],
    });
  });

  it("adds nothing for expo-secure-store (the Keychain is not a required-reason API) or other packages", () => {
    write("package.json", { dependencies: { expo: "~55.0.0", "expo-secure-store": "~55.0.0" } });
    expect(run().ios?.privacyManifests).toBeUndefined();
    expect(privacyApisFor({ "expo-secure-store": "*" })).toEqual([]);
  });

  it("merges into the app's entries without overwriting them", () => {
    const config = base();
    config.ios!.privacyManifests = {
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["3B52.1"] },
      ],
    };
    const before = JSON.stringify(config);
    const asyncStorage = privacyApisFor({ "@react-native-async-storage/async-storage": "*" });
    const out = applyPrivacyApis(config, asyncStorage);
    expect(JSON.stringify(config)).toBe(before);
    expect(out.ios?.privacyManifests).toEqual({
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["3B52.1", "C617.1"] },
      ],
    });
    expect(applyPrivacyApis(out, asyncStorage)).toEqual(out);
  });
});

describe("export compliance and fingerprint runtime", () => {
  it("sets both when the app doesn't", () => {
    const out = run();
    expect(out.ios?.config?.usesNonExemptEncryption).toBe(false);
    expect(out.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("keeps what the app sets", () => {
    const config = base();
    config.ios!.config = { usesNonExemptEncryption: true, googleMapsApiKey: "k" };
    config.runtimeVersion = "1.0.0";
    const out = run(config);
    expect(out.ios?.config).toEqual({ usesNonExemptEncryption: true, googleMapsApiKey: "k" });
    expect(out.runtimeVersion).toBe("1.0.0");
    config.runtimeVersion = undefined;
    config.ios!.runtimeVersion = { policy: "appVersion" };
    expect(run(config).runtimeVersion).toBeUndefined();
  });

  it("each step can be turned off", () => {
    write("genesis.config.json", { links: { hosts: ["example.com"] } });
    write("package.json", { dependencies: { "@react-native-async-storage/async-storage": "*" } });
    const out = run(base(), { links: false, privacyManifest: false, exportCompliance: false, fingerprint: false });
    expect(out).toEqual(base());
  });
});

describe("determinism", () => {
  it("gives the same config for the same files and variant, whatever else is in the environment", () => {
    write("genesis.config.json", { links: { hosts: ["example.com"] } });
    write("package.json", { dependencies: { "@react-native-async-storage/async-storage": "*" } });
    const first = JSON.stringify(run(base(), { variant: "preview" }));
    process.env.NODE_ENV = "something-else";
    process.env.EAS_BUILD_PROFILE = "other";
    try {
      expect(JSON.stringify(run(base(), { variant: "preview" }))).toBe(first);
    } finally {
      delete process.env.EAS_BUILD_PROFILE;
      process.env.NODE_ENV = "test";
    }
  });

  it("does not mutate the config it is given", () => {
    write("genesis.config.json", { links: { hosts: ["example.com"] } });
    const config = base();
    const before = JSON.stringify(config);
    run(config, { variant: "development" });
    expect(JSON.stringify(config)).toBe(before);
  });
});

// These two load the built plugin (app.plugin.js re-exports dist/expo.js), so
// they need `pnpm build:packages` first, as every test in this repo does. They
// fail rather than skip without it: a missing build must not read as a pass.
const here = path.dirname(fileURLToPath(import.meta.url));

describe("through Expo's own config loader", () => {
  it("resolves plugins: [\"@marktiderman/genesis-cli\"] from a project and applies every step", async () => {
    expect(existsSync(path.join(here, "../dist/expo.js")), "run pnpm build:packages first").toBe(true);
    // The fixture project sits inside this workspace, so Node finds
    // @marktiderman/genesis-cli (this package) the way an app's node_modules would.
    const project = path.join(here, "fixtures/expo-app");
    const { getConfig } = await import("@expo/config");
    process.env.APP_VARIANT = "preview";
    const { exp } = getConfig(project, { skipSDKVersionRequirement: true, isPublicConfig: false });
    expect(exp.name).toBe("Fixture (Preview)");
    expect(exp.ios?.bundleIdentifier).toBe("com.example.fixture.preview");
    expect(exp.android?.package).toBe("com.example.fixture.preview");
    expect(exp.ios?.associatedDomains).toEqual(["applinks:example.com", "webcredentials:example.com"]);
    expect(exp.android?.intentFilters?.[0]).toMatchObject({ autoVerify: true, data: [{ scheme: "https", host: "example.com", pathPrefix: "/invite" }] });
    expect(exp.ios?.privacyManifests?.NSPrivacyAccessedAPITypes).toEqual([
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
    ]);
    expect(exp.ios?.config?.usesNonExemptEncryption).toBe(false);
    expect(exp.runtimeVersion).toEqual({ policy: "fingerprint" });
  });
});

describe("app.plugin.js", () => {
  it("is what Expo require()s for plugins: [\"@marktiderman/genesis-cli\"], and its default export is withGenesis", () => {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { exports: Record<string, unknown>; files: string[] };
    expect(pkg.exports["./app.plugin.js"]).toBe("./app.plugin.js");
    expect(pkg.files).toContain("app.plugin.js");
    // Expo resolves the package's app.plugin.js and calls require() on it; Node's
    // require(esm) hands back the module namespace, whose `default` Expo uses.
    const mod = require("../app.plugin.js") as { default?: unknown };
    expect(typeof mod.default).toBe("function");
  });
});
