// @feat:native-starter @feat:expo-config-plugin
/**
 * The config Expo builds from app.config.ts and the Genesis plugin, per APP_VARIANT: each
 * variant installs side by side and registers its own URL scheme, so a link opens the build it
 * names. Resolved through Expo's own `getConfig`, plugins and all.
 */
import { readdirSync, readFileSync } from "node:fs";
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

  it("the Maestro flows open links with the development variant's scheme (the build they run on)", () => {
    const scheme = configFor("development").scheme;
    const flows = readdirSync(join(root, ".maestro/flows")).map((f) => readFileSync(join(root, ".maestro/flows", f), "utf8"));
    const links = flows.flatMap((text) => [...text.matchAll(/openLink:\s*"?([a-z][a-z0-9+.-]*):\/\//g)].map((m) => m[1]));
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(links)).toEqual(new Set([scheme]));
  });
});

describe("chat's video messages", () => {
  // The plugins write these in their mods, so the config is introspected the way `expo config --type introspect` does.
  it("ask for the camera and microphone with the app's own sentences, which no other plugin deletes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = createRequire(join(root, "package.json"));
    const { getPrebuildConfigAsync } = load("@expo/prebuild-config") as { getPrebuildConfigAsync: (root: string, o: object) => Promise<{ exp: object }> };
    const { compileModsAsync } = load("@expo/config-plugins") as { compileModsAsync: (exp: object, o: object) => Promise<{ ios?: { infoPlist?: Record<string, string> } }> };
    const { exp } = await getPrebuildConfigAsync(root, { platforms: ["ios"] });
    const plist = (await compileModsAsync(exp, { projectRoot: root, introspect: true, platforms: ["ios"], assertMissingModProviders: false })).ios?.infoPlist ?? {};
    expect(plist.NSCameraUsageDescription).toBe("Record video messages to send in a conversation.");
    expect(plist.NSMicrophoneUsageDescription).toBe("Record voice and video messages to send in a conversation.");
  });
});

describe("iOS rich push (in the build whichever way the chat switch is)", () => {
  it.each([
    ["development", "com.example.genesisstarter.dev.NotificationService"],
    ["production", "com.example.genesisstarter.NotificationService"],
  ])("%s: Communication Notifications on the app, and the extension for EAS with the variant's id", (variant, extensionId) => {
    const config = configFor(variant);
    expect(config.ios?.entitlements?.["com.apple.developer.usernotifications.communication"]).toBe(true);
    expect(config.ios?.infoPlist?.NSUserActivityTypes).toContain("INSendMessageIntent");
    const extensions = (config.extra as { eas?: { build?: { experimental?: { ios?: { appExtensions?: { targetName: string; bundleIdentifier: string }[] } } } } })?.eas?.build?.experimental?.ios?.appExtensions;
    expect(extensions).toEqual([expect.objectContaining({ targetName: "GenesisNotificationService", bundleIdentifier: extensionId })]);
  });
});
