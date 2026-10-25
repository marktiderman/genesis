/**
 * `@marktiderman/genesis-native/rich-push-plugin`: the Expo config plugin for
 * iOS rich push. It adds a Notification Service Extension target (the Swift in
 * `ios/notification-service/`) that downloads `data.image` / `data.senderAvatar`
 * and turns `messages` pushes into Communication Notifications (the sender's
 * photo, Focus treats them as messages), and it sets what they need:
 *
 * - the app: `com.apple.developer.usernotifications.communication` and
 *   `NSUserActivityTypes: [INSendMessageIntent]`;
 * - the extension: its own bundle id (`<app>.NotificationService`), Info.plist
 *   and entitlements, embedded in the app;
 * - EAS: `extra.eas.build.experimental.ios.appExtensions`, so EAS Build makes
 *   the extension's provisioning profile with the app's.
 *
 *   plugins: [..., "@marktiderman/genesis-cli", "@marktiderman/genesis-native/rich-push-plugin"]
 *
 * List it after any plugin that changes the bundle id (the Genesis plugin's
 * APP_VARIANT suffix): the extension's id is the app's plus a suffix, read
 * when this plugin runs. Running it twice changes nothing.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { withDangerousMod, withXcodeProject, type ConfigPlugin } from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";

export const COMMUNICATION_ENTITLEMENT = "com.apple.developer.usernotifications.communication";
export const SEND_MESSAGE_INTENT = "INSendMessageIntent";
export const DEFAULT_TARGET_NAME = "GenesisNotificationService";
export const DEFAULT_BUNDLE_SUFFIX = "NotificationService";
const SWIFT_FILE = "NotificationService.swift";

export interface RichPushPluginOptions {
  /** The extension's Xcode target and folder under ios/. Default `GenesisNotificationService`. */
  targetName?: string;
  /** Appended to the app's bundle id with a dot. Default `NotificationService`. */
  bundleIdSuffix?: string;
  /**
   * Communication Notifications (the sender's photo, Focus): the entitlement and
   * `NSUserActivityTypes`. Default true; false keeps image attachments only.
   */
  communication?: boolean;
  /** The extension's minimum iOS. Default: the app target's. */
  deploymentTarget?: string;
}

interface Resolved {
  targetName: string;
  bundleIdSuffix: string;
  communication: boolean;
  deploymentTarget: string | undefined;
}

function resolve(options: RichPushPluginOptions | undefined): Resolved {
  const targetName = options?.targetName ?? DEFAULT_TARGET_NAME;
  const bundleIdSuffix = options?.bundleIdSuffix ?? DEFAULT_BUNDLE_SUFFIX;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(targetName)) throw new Error(`rich-push-plugin: targetName "${targetName}" must be letters, digits and _`);
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/.test(bundleIdSuffix)) throw new Error(`rich-push-plugin: bundleIdSuffix "${bundleIdSuffix}" isn't a bundle id part`);
  return { targetName, bundleIdSuffix, communication: options?.communication ?? true, deploymentTarget: options?.deploymentTarget };
}

/** The extension's bundle id: the app's plus the suffix. */
export function extensionBundleId(appBundleId: string, suffix = DEFAULT_BUNDLE_SUFFIX): string {
  return `${appBundleId}.${suffix}`;
}

/** The extension's entitlements (also what EAS provisions it with). */
export function extensionEntitlements(communication: boolean): Record<string, unknown> {
  return communication ? { [COMMUNICATION_ENTITLEMENT]: true } : {};
}

/**
 * The config-time part, visible in `expo config`: the app's entitlement and
 * `NSUserActivityTypes`, and the extension for EAS. Fills gaps and appends;
 * never removes what the app set.
 */
export function applyRichPushConfig(config: ExpoConfig, options?: RichPushPluginOptions): ExpoConfig {
  const o = resolve(options);
  const bundleId = config.ios?.bundleIdentifier;
  if (!bundleId) throw new Error("rich-push-plugin: ios.bundleIdentifier is required (the extension's id is built from it)");
  const ios = { ...config.ios };
  if (o.communication) {
    ios.entitlements = { ...ios.entitlements, [COMMUNICATION_ENTITLEMENT]: true };
    const types = Array.isArray(ios.infoPlist?.NSUserActivityTypes) ? (ios.infoPlist!.NSUserActivityTypes as unknown[]) : [];
    ios.infoPlist = { ...ios.infoPlist, NSUserActivityTypes: types.includes(SEND_MESSAGE_INTENT) ? types : [...types, SEND_MESSAGE_INTENT] };
  }
  const extra = { ...config.extra };
  const eas = { ...(extra.eas as Record<string, unknown> | undefined) };
  const build = { ...(eas.build as Record<string, unknown> | undefined) };
  const experimental = { ...(build.experimental as Record<string, unknown> | undefined) };
  const easIos = { ...(experimental.ios as Record<string, unknown> | undefined) };
  const existing = Array.isArray(easIos.appExtensions) ? (easIos.appExtensions as { targetName?: string }[]) : [];
  const entry = { targetName: o.targetName, bundleIdentifier: extensionBundleId(bundleId, o.bundleIdSuffix), entitlements: extensionEntitlements(o.communication) };
  easIos.appExtensions = [...existing.filter((e) => e?.targetName !== o.targetName), entry];
  extra.eas = { ...eas, build: { ...build, experimental: { ...experimental, ios: easIos } } };
  return { ...config, ios, extra };
}

/** The extension's Info.plist. Versions follow the app's (App Store Connect rejects a mismatch). */
export function extensionInfoPlist(displayName: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${esc(displayName)}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
}

export function entitlementsPlist(entitlements: Record<string, unknown>): string {
  const body = Object.entries(entitlements)
    .map(([k, v]) => `  <key>${k}</key>\n  <${v ? "true" : "false"}/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

/** This package's root, found from this file (src/plugin in tests, dist when built). */
export function packageRoot(from = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (;;) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg) && (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === "@marktiderman/genesis-native") return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("rich-push-plugin: can't find @marktiderman/genesis-native's folder");
    dir = parent;
  }
}

/** The extension's Swift source, shipped in this package. */
export function serviceSwiftPath(root = packageRoot()): string {
  return path.join(root, "ios", "notification-service", SWIFT_FILE);
}

/** Writes the extension's folder under ios/: the Swift, its Info.plist and its entitlements. */
export function writeExtensionFiles(iosRoot: string, options: { targetName: string; displayName: string; communication: boolean; swiftSource?: string }): void {
  const dir = path.join(iosRoot, options.targetName);
  mkdirSync(dir, { recursive: true });
  copyFileSync(options.swiftSource ?? serviceSwiftPath(), path.join(dir, SWIFT_FILE));
  writeFileSync(path.join(dir, "Info.plist"), extensionInfoPlist(options.displayName));
  writeFileSync(path.join(dir, `${options.targetName}.entitlements`), entitlementsPlist(extensionEntitlements(options.communication)));
}

/** The parts of the `xcode` package's project this uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XcodeProject = any;

const unquote = (v: unknown) => (typeof v === "string" ? v.replace(/^"(.*)"$/, "$1") : v);

/** The app target's build setting (its first configuration that has it). */
function appSetting(project: XcodeProject, key: string): string | undefined {
  const app = project.getFirstTarget();
  const listId = app?.firstTarget?.buildConfigurationList;
  const lists = project.pbxXCConfigurationList();
  const configs = project.pbxXCBuildConfigurationSection();
  for (const ref of lists[listId]?.buildConfigurations ?? []) {
    const value = configs[ref.value]?.buildSettings?.[key];
    if (value !== undefined) return String(unquote(value));
  }
  return undefined;
}

/**
 * Adds the extension target to the project (once): its group and files, the
 * sources, frameworks and resources phases, its build settings, a dependency
 * from the app and the app's phase that embeds it.
 */
export function addNotificationServiceTarget(
  project: XcodeProject,
  options: { targetName: string; bundleId: string; deploymentTarget?: string; developmentTeam?: string; marketingVersion?: string; buildNumber?: string },
): { added: boolean } {
  const { targetName } = options;
  if (project.pbxTargetByName(targetName) || project.pbxTargetByName(`"${targetName}"`)) return { added: false };

  const objects = project.hash.project.objects;
  // The xcode package assumes these sections exist; Expo's template has none.
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};

  const deploymentTarget = options.deploymentTarget ?? appSetting(project, "IPHONEOS_DEPLOYMENT_TARGET") ?? "15.1";
  const marketingVersion = options.marketingVersion ?? appSetting(project, "MARKETING_VERSION") ?? "1.0";
  const buildNumber = options.buildNumber ?? appSetting(project, "CURRENT_PROJECT_VERSION") ?? "1";
  const developmentTeam = options.developmentTeam ?? appSetting(project, "DEVELOPMENT_TEAM");

  // The Swift is compiled; the Info.plist and entitlements are build settings, so they are in the group only.
  const group = project.addPbxGroup([SWIFT_FILE], targetName, targetName);
  project.addFile("Info.plist", group.uuid, { lastKnownFileType: "text.plist.xml" });
  project.addFile(`${targetName}.entitlements`, group.uuid, { lastKnownFileType: "text.plist.entitlements" });
  const mainGroup = project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup(group.uuid, mainGroup);

  const target = project.addTarget(targetName, "app_extension", targetName, options.bundleId);
  project.addBuildPhase([SWIFT_FILE], "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);

  const configs = project.pbxXCBuildConfigurationSection();
  const listId = target.pbxNativeTarget.buildConfigurationList;
  for (const ref of project.pbxXCConfigurationList()[listId].buildConfigurations) {
    const settings = configs[ref.value].buildSettings;
    Object.assign(settings, {
      INFOPLIST_FILE: `${targetName}/Info.plist`,
      CODE_SIGN_ENTITLEMENTS: `${targetName}/${targetName}.entitlements`,
      CODE_SIGN_STYLE: "Automatic",
      IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
      TARGETED_DEVICE_FAMILY: '"1,2"',
      SWIFT_VERSION: "5.0",
      MARKETING_VERSION: marketingVersion,
      CURRENT_PROJECT_VERSION: buildNumber,
      GENERATE_INFOPLIST_FILE: "NO",
      PRODUCT_BUNDLE_IDENTIFIER: `"${options.bundleId}"`,
      SDKROOT: "iphoneos",
      CLANG_ENABLE_MODULES: "YES",
      SWIFT_EMIT_LOC_STRINGS: "YES",
      ...(developmentTeam ? { DEVELOPMENT_TEAM: developmentTeam } : {}),
    });
  }
  if (developmentTeam) project.addTargetAttribute("DevelopmentTeam", developmentTeam, target);
  return { added: true };
}

const withRichPush: ConfigPlugin<RichPushPluginOptions | void> = (config, options) => {
  const o = resolve(options ?? undefined);
  config = applyRichPushConfig(config, o);
  const bundleId = extensionBundleId(config.ios!.bundleIdentifier!, o.bundleIdSuffix);

  config = withDangerousMod(config, [
    "ios",
    (c) => {
      writeExtensionFiles(c.modRequest.platformProjectRoot, { targetName: o.targetName, displayName: c.name, communication: o.communication });
      return c;
    },
  ]);
  config = withXcodeProject(config, (c) => {
    addNotificationServiceTarget(c.modResults, {
      targetName: o.targetName,
      bundleId,
      ...(o.deploymentTarget ? { deploymentTarget: o.deploymentTarget } : {}),
      ...(c.ios?.appleTeamId ? { developmentTeam: c.ios.appleTeamId } : {}),
      ...(c.version ? { marketingVersion: c.version } : {}),
      ...(c.ios?.buildNumber ? { buildNumber: c.ios.buildNumber } : {}),
    });
    return c;
  });
  return config;
};

export default withRichPush;
