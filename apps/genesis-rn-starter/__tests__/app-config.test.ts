// @feat:native-starter @feat:expo-config-plugin
/**
 * The config Expo builds from app.config.ts and the Genesis plugin, per APP_VARIANT: each
 * variant installs side by side and registers its own URL scheme, so a link opens the build it
 * names. Resolved through Expo's own `getConfig`, plugins and all.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = join(__dirname, "..");
const { getConfig } = createRequire(join(root, "package.json"))("expo/config") as typeof import("expo/config");
const saved = process.env.APP_VARIANT;

function configFor(variant: string | undefined) {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  // The plugin warns about the privacy manifest's data types; not this test's subject.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return getConfig(root, { skipSDKVersionRequirement: true, isPublicConfig: true }).exp;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (saved === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = saved;
});

describe("app.config.ts per APP_VARIANT", () => {
  it.each([
    ["development", "genesis-starter-dev", "com.example.genesisstarter.dev", "Genesis Starter (Dev)"],
    ["preview", "genesis-starter-preview", "com.example.genesisstarter.preview", "Genesis Starter (Preview)"],
    ["production", "genesis-starter", "com.example.genesisstarter", "Genesis Starter"],
    [undefined, "genesis-starter", "com.example.genesisstarter", "Genesis Starter"],
  ])("%s registers scheme %s", (variant, scheme, bundleId, name) => {
    const config = configFor(variant);
    expect(config.scheme).toBe(scheme);
    expect(config.ios?.bundleIdentifier).toBe(bundleId);
    expect(config.android?.package).toBe(bundleId);
    expect(config.name).toBe(name);
  });
});
