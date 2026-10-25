// @feat:push
/**
 * The rich push config plugin: what it sets in the app's config (seen by
 * `expo config` and EAS), the extension's files, and the Xcode target it adds
 * to an Expo-generated project (a prebuild of the starter, in fixtures/).
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { IOSConfig } from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";
import { afterEach, describe, expect, it } from "vitest";
import withRichPush, {
  COMMUNICATION_ENTITLEMENT,
  addNotificationServiceTarget,
  applyRichPushConfig,
  extensionInfoPlist,
  packageRoot,
  serviceSwiftPath,
  writeExtensionFiles,
} from "../rich-push";

const base: ExpoConfig = { name: "Sample", slug: "sample", version: "2.3.0", ios: { bundleIdentifier: "com.example.sample" } };
const fixture = path.join(__dirname, "fixtures", "project.pbxproj");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function project(): any {
  const dir = mkdtempSync(path.join(tmpdir(), "rich-push-"));
  dirs.push(dir);
  const xcodeproj = path.join(dir, "ios", "App.xcodeproj");
  mkdirSync(xcodeproj, { recursive: true });
  copyFileSync(fixture, path.join(xcodeproj, "project.pbxproj"));
  return IOSConfig.XcodeUtils.getPbxproj(dir);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function settingsOf(p: any, name: string): Record<string, string>[] {
  const target = p.pbxTargetByName(`"${name}"`) ?? p.pbxTargetByName(name);
  const list = p.pbxXCConfigurationList()[target.buildConfigurationList];
  return list.buildConfigurations.map((ref: { value: string }) => p.pbxXCBuildConfigurationSection()[ref.value].buildSettings);
}

describe("the app's config", () => {
  it("adds the communication entitlement, INSendMessageIntent and the extension for EAS", () => {
    const c = applyRichPushConfig(base);
    expect(c.ios?.entitlements?.[COMMUNICATION_ENTITLEMENT]).toBe(true);
    expect(c.ios?.infoPlist?.NSUserActivityTypes).toEqual(["INSendMessageIntent"]);
    expect((c.extra as any).eas.build.experimental.ios.appExtensions).toEqual([
      { targetName: "GenesisNotificationService", bundleIdentifier: "com.example.sample.NotificationService", entitlements: { [COMMUNICATION_ENTITLEMENT]: true } },
    ]);
  });

  it("keeps what the app set, and running twice changes nothing", () => {
    const app: ExpoConfig = {
      ...base,
      ios: { ...base.ios, entitlements: { "aps-environment": "production" }, infoPlist: { NSUserActivityTypes: ["com.example.open"], UIBackgroundModes: ["remote-notification"] } },
      extra: { eas: { projectId: "p", build: { experimental: { ios: { appExtensions: [{ targetName: "Widget", bundleIdentifier: "com.example.sample.widget" }] } } } } },
    };
    const once = applyRichPushConfig(app);
    expect(applyRichPushConfig(once)).toEqual(once);
    expect(once.ios?.entitlements?.["aps-environment"]).toBe("production");
    expect(once.ios?.infoPlist?.NSUserActivityTypes).toEqual(["com.example.open", "INSendMessageIntent"]);
    expect(once.ios?.infoPlist?.UIBackgroundModes).toEqual(["remote-notification"]);
    expect((once.extra as any).eas.projectId).toBe("p");
    expect((once.extra as any).eas.build.experimental.ios.appExtensions.map((e: { targetName: string }) => e.targetName)).toEqual(["Widget", "GenesisNotificationService"]);
  });

  it("communication: false keeps attachments only: no entitlement, no intent type", () => {
    const c = applyRichPushConfig(base, { communication: false });
    expect(c.ios?.entitlements).toBeUndefined();
    expect(c.ios?.infoPlist).toBeUndefined();
    expect((c.extra as any).eas.build.experimental.ios.appExtensions[0].entitlements).toEqual({});
  });

  it("needs a bundle id, and refuses a target name Xcode can't take", () => {
    expect(() => applyRichPushConfig({ name: "x", slug: "x" })).toThrow(/bundleIdentifier/);
    expect(() => applyRichPushConfig(base, { targetName: "../evil" })).toThrow(/targetName/);
  });

  it("the plugin itself applies the config part and registers the iOS mods", () => {
    const c = withRichPush(base) as ExpoConfig & { mods?: { ios?: Record<string, unknown> } };
    expect(c.ios?.entitlements?.[COMMUNICATION_ENTITLEMENT]).toBe(true);
    expect(Object.keys(c.mods?.ios ?? {})).toEqual(expect.arrayContaining(["dangerous", "xcodeproj"]));
  });
});

describe("the extension's files", () => {
  it("ships the Swift, and writes it with its Info.plist and entitlements", () => {
    expect(packageRoot()).toBe(path.resolve(__dirname, "../../.."));
    const swift = readFileSync(serviceSwiftPath(), "utf8");
    expect(swift).toContain("class NotificationService: UNNotificationServiceExtension");
    const ios = mkdtempSync(path.join(tmpdir(), "rich-push-ios-"));
    dirs.push(ios);
    writeExtensionFiles(ios, { targetName: "Svc", displayName: "Sample", communication: true });
    expect(readFileSync(path.join(ios, "Svc", "NotificationService.swift"), "utf8")).toBe(swift);
    expect(readFileSync(path.join(ios, "Svc", "Svc.entitlements"), "utf8")).toContain(`<key>${COMMUNICATION_ENTITLEMENT}</key>\n  <true/>`);
    const plist = readFileSync(path.join(ios, "Svc", "Info.plist"), "utf8");
    expect(plist).toContain("<string>com.apple.usernotifications.service</string>");
    expect(plist).toContain("<string>$(PRODUCT_MODULE_NAME).NotificationService</string>");
  });

  it("escapes the display name", () => {
    expect(extensionInfoPlist("A & <B>")).toContain("<string>A &amp; &lt;B&gt;</string>");
  });
});

describe("the Swift service", () => {
  const swift = readFileSync(serviceSwiftPath(), "utf8");

  it("turns messages pushes into Communication Notifications", () => {
    expect(swift).toContain('private let messagesCategory = "messages"');
    expect(swift).toContain("INSendMessageIntent(");
    expect(swift).toContain("content.updating(from: intent)");
    expect(swift).toContain("interaction.direction = .incoming");
  });

  it("reads the fields chatPushPayload and richPushMessage send", () => {
    for (const field of ["image", "senderAvatar", "senderName", "senderId", "groupName", "conversationId"]) expect(swift).toContain(`data["${field}"]`);
    // Expo puts data under `body`.
    expect(swift).toContain('userInfo["body"]');
  });

  it("always shows the notification: on time running out and on every failure", () => {
    expect(swift).toContain("override func serviceExtensionTimeWillExpire()");
    expect(swift).toMatch(/catch \{[\s\S]*?plain\(\)/);
  });

  it("downloads https only and fetches nothing but the two images", () => {
    expect(swift).toContain('components.scheme?.lowercased() == "https"');
    expect(swift.match(/downloadTask\(/g)).toHaveLength(1);
    expect(swift.match(/download\((imageURL|avatarURL)/g)).toEqual(["download(imageURL", "download(avatarURL"]);
    expect(swift).not.toMatch(/dataTask\(/);
  });
});

describe("the Xcode target", () => {
  it("adds an app extension the app depends on and embeds, with its own bundle id and settings", () => {
    const p = project();
    expect(addNotificationServiceTarget(p, { targetName: "GenesisNotificationService", bundleId: "com.example.app.NotificationService", marketingVersion: "2.3.0" })).toEqual({ added: true });
    const target = p.pbxTargetByName('"GenesisNotificationService"');
    expect(target.productType).toBe('"com.apple.product-type.app-extension"');
    for (const s of settingsOf(p, "GenesisNotificationService")) {
      expect(s).toMatchObject({
        PRODUCT_BUNDLE_IDENTIFIER: '"com.example.app.NotificationService"',
        INFOPLIST_FILE: "GenesisNotificationService/Info.plist",
        CODE_SIGN_ENTITLEMENTS: "GenesisNotificationService/GenesisNotificationService.entitlements",
        SWIFT_VERSION: "5.0",
        MARKETING_VERSION: "2.3.0",
        // The app's, read from the project.
        IPHONEOS_DEPLOYMENT_TARGET: "16.4",
      });
    }
    const targetId = Object.keys(p.pbxNativeTargetSection()).find((k) => p.pbxNativeTargetSection()[k] === target);
    const app = p.getFirstTarget().firstTarget;
    const deps = p.hash.project.objects.PBXTargetDependency;
    expect(app.dependencies.map((d: { value: string }) => deps[d.value].target)).toContain(targetId);
    const copy = Object.values<Record<string, unknown>>(p.hash.project.objects.PBXCopyFilesBuildPhase).find((ph) => typeof ph === "object" && ph.dstSubfolderSpec === 13) as { files: { comment: string }[] };
    expect(copy.files.map((f) => f.comment)).toContain("GenesisNotificationService.appex in Copy Files");
    const sources = p.pbxSourcesBuildPhaseObj(targetId);
    expect(sources.files).toHaveLength(1);
    expect(sources.files[0].comment).toMatch(/NotificationService\.swift"? in Sources/);
    // It parses back.
    expect(p.writeSync()).toContain("GenesisNotificationService.appex");
  });

  it("is added once", () => {
    const p = project();
    addNotificationServiceTarget(p, { targetName: "Svc", bundleId: "com.example.app.Svc" });
    const before = p.writeSync();
    expect(addNotificationServiceTarget(p, { targetName: "Svc", bundleId: "com.example.app.Svc" })).toEqual({ added: false });
    expect(p.writeSync()).toBe(before);
  });

  it("copies the development team to the extension", () => {
    const p = project();
    addNotificationServiceTarget(p, { targetName: "Svc", bundleId: "com.example.app.Svc", developmentTeam: "ABCDE12345" });
    for (const s of settingsOf(p, "Svc")) expect(s.DEVELOPMENT_TEAM).toBe("ABCDE12345");
  });
});
