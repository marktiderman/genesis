/**
 * `withGenesis()` — the Genesis Expo config plugin.
 *
 * Keeps an app's `app.config.ts` to a name, ids and plugins. It sets:
 *
 * 1. App variants: `APP_VARIANT` (`development` | `preview` | `production`,
 *    default `production`) suffixes the bundle id, Android package and name,
 *    so the three builds install side by side.
 * 2. Universal / app links from genesis.config.json `links`:
 *    `ios.associatedDomains` (`applinks:` and `webcredentials:`) and one
 *    Android `intentFilters` entry with `autoVerify`.
 * 3. The iOS privacy manifest, merged into what the app declares: the
 *    required-reason APIs of React Native, Expo and the packages the app's
 *    package.json lists; `NSPrivacyTracking: false`; and the collected data
 *    types, the union of what each Genesis block the app uses collects
 *    (`account`, `observability`, `push`), or the app's own list from
 *    genesis.config.json `privacy` or the plugin's `privacy` option.
 * 4. Export compliance: `ios.config.usesNonExemptEncryption = false`.
 * 5. `runtimeVersion: { policy: "fingerprint" }`.
 *
 * Anything the app already sets wins: the plugin fills gaps and appends to
 * lists, never overwrites or removes a value, and running it twice changes
 * nothing.
 *
 * Determinism: the plugin reads two committed files in the project root,
 * genesis.config.json and package.json, and one environment variable,
 * APP_VARIANT. No network, no clock, no other environment. The same commit
 * and variant always give the same config; the EAS fingerprint is stable only
 * if APP_VARIANT is set the same way for builds, `eas update` and fingerprint
 * checks (an EAS environment variable, not a build profile's `env`).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { ConfigPlugin } from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";
import {
  GenesisConfigError,
  PRIVACY_DATA_TYPES,
  PRIVACY_PURPOSES,
  readGenesisConfig,
  validatePrivacy,
  type GenesisDataUse,
  type GenesisLinks,
  type GenesisPrivacy,
} from "./doctor/config.js";

export {
  GenesisConfigError,
  PRIVACY_DATA_TYPES,
  PRIVACY_PURPOSES,
  validateLinks,
  validatePrivacy,
  readGenesisConfig,
  type GenesisDataUse,
  type GenesisLinks,
  type GenesisPrivacy,
} from "./doctor/config.js";

export const APP_VARIANTS = ["development", "preview", "production"] as const;
export type AppVariant = (typeof APP_VARIANTS)[number];

export interface VariantSuffix {
  /** Appended to `ios.bundleIdentifier` and `android.package`, e.g. `.dev`. */
  id: string;
  /** Appended to `name`, e.g. ` (Dev)`. */
  name: string;
}

/** A required-reason API category and the reasons for it, as in PrivacyInfo.xcprivacy. */
export interface PrivacyApi {
  NSPrivacyAccessedAPIType: string;
  NSPrivacyAccessedAPITypeReasons: string[];
}

export interface WithGenesisOptions {
  /**
   * The variant, overriding `APP_VARIANT`. Tests and scripts pass it; an app
   * leaves it out and sets `APP_VARIANT` per build profile in eas.json.
   */
  variant?: AppVariant;
  /** Suffixes per non-production variant. Default `.dev` / ` (Dev)` and `.preview` / ` (Preview)`. */
  variants?: Partial<Record<Exclude<AppVariant, "production">, Partial<VariantSuffix>>>;
  /** Where genesis.config.json and package.json live. Default: the Expo project root. */
  projectRoot?: string;
  /**
   * The manifest's collected data types, overriding genesis.config.json
   * `privacy` key by key (`blocks` here replaces the file's `blocks`; a
   * `collects` list, from either place, replaces every block's list). An app
   * passes `blocks` from its own feature switches, so a block turned off
   * declares nothing. Without `privacy` in either place, the blocks are found
   * from package.json and a warning says the app's own data isn't in the list.
   */
  privacy?: GenesisPrivacy;
  /** Turn single steps off. Every step is on by default. */
  links?: boolean;
  privacyManifest?: boolean;
  exportCompliance?: boolean;
  fingerprint?: boolean;
}

export const DEFAULT_VARIANT_SUFFIXES: Record<Exclude<AppVariant, "production">, VariantSuffix> = {
  development: { id: ".dev", name: " (Dev)" },
  preview: { id: ".preview", name: " (Preview)" },
};

const api = (category: string, ...reasons: string[]): PrivacyApi => ({
  NSPrivacyAccessedAPIType: `NSPrivacyAccessedAPICategory${category}`,
  NSPrivacyAccessedAPITypeReasons: reasons,
});

/**
 * The required-reason APIs each package needs the app to declare, copied from
 * the package's own PrivacyInfo.xcprivacy (read from the SDK 58 versions the
 * starter installs). A package is matched when the app's package.json lists
 * it in `dependencies`. CocoaPods also merges these manifests into the app's
 * at `pod install` (React Native's privacy manifest aggregation); declaring
 * them here keeps the app's manifest whole when that is off, or for a pod
 * that doesn't ship one.
 *
 * - react-native 0.88 (`React/Resources`, `ReactCommon/cxxreact`,
 *   `ReactCommon/react/timing` and the boost, glog and RCT-Folly podspecs):
 *   FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1.
 * - expo 58, for what it always installs: expo-file-system (FileTimestamp
 *   0A2A.1 and 3B52.1, DiskSpace E174.1 and 85F4.1) and expo-constants
 *   (UserDefaults CA92.1).
 * - expo-updates, through expo-eas-client: UserDefaults CA92.1.
 * - expo-application: FileTimestamp C617.1.
 * - expo-notifications: UserDefaults CA92.1.
 * - async-storage 2.2.0: FileTimestamp C617.1.
 *
 * - @sentry/react-native: UserDefaults CA92.1, SystemBootTime 35F9.1,
 *   FileTimestamp C617.1, as Sentry's "Apple Privacy Manifest" guide for
 *   React Native lists (sentry-cocoa ships in a pod, not in node_modules).
 *
 * Not listed, because their packages ship no required-reason API: expo-secure-store
 * (the Keychain is not one), expo-crypto, expo-haptics, expo-linking,
 * expo-apple-authentication, expo-router, netinfo, reanimated and the other
 * starter dependencies with no PrivacyInfo.xcprivacy.
 */
export const PRIVACY_APIS: Record<string, PrivacyApi[]> = {
  "react-native": [api("FileTimestamp", "C617.1"), api("UserDefaults", "CA92.1"), api("SystemBootTime", "35F9.1")],
  expo: [api("FileTimestamp", "0A2A.1", "3B52.1"), api("DiskSpace", "E174.1", "85F4.1"), api("UserDefaults", "CA92.1")],
  "expo-updates": [api("UserDefaults", "CA92.1")],
  "expo-application": [api("FileTimestamp", "C617.1")],
  "expo-notifications": [api("UserDefaults", "CA92.1")],
  "@react-native-async-storage/async-storage": [api("FileTimestamp", "C617.1")],
  "@sentry/react-native": [api("UserDefaults", "CA92.1"), api("SystemBootTime", "35F9.1"), api("FileTimestamp", "C617.1")],
};

/** A Genesis block's collected data, and the packages that mean the app uses it. */
export interface PrivacyBlock {
  /** The block is on when the app's `dependencies` list every one of these. */
  packages: string[];
  collects: GenesisDataUse[];
}

const appFunctionality = (type: string, ...more: string[]): GenesisDataUse => ({
  type,
  purposes: ["app functionality", ...more],
  linked: true,
  tracking: false,
});

/**
 * What each Genesis block collects, mirroring its `defineBlock`
 * `privacy.collects` (the blocks themselves are React Native code, which a
 * config plugin can't load). "Collected" is Apple's sense: sent off the
 * phone, to the app's own backend or a vendor. Purposes follow Apple's
 * definitions: crash and performance data that keep the app working are app
 * functionality ("minimize app crashes, improve scalability and
 * performance"); analytics is the typed product events.
 *
 * - `account` (`@marktiderman/genesis-supabase` `accountBlock`): the
 *   sign-in email, the account id, and the name (Sign in with Apple's, or
 *   one typed in).
 * - `observability` (`@marktiderman/genesis-native` `createObservability`
 *   with `events`, reporting through Sentry): crash and performance data,
 *   and the other diagnostic data Sentry sends with them (device and OS
 *   details, breadcrumbs, sessions), the three Sentry's own privacy-manifest
 *   guide lists; the user id; and the typed analytics events (product
 *   interaction), all linked because the sink sets the user id. Found by
 *   `@sentry/react-native`; an app that never sets a DSN sends nothing and
 *   should leave this block out.
 * - `push` (`@marktiderman/genesis-native` `createPush`): the device's push
 *   token against the person (a device-level id).
 */
export const PRIVACY_BLOCKS: Record<string, PrivacyBlock> = {
  account: {
    packages: ["@marktiderman/genesis-supabase"],
    collects: [appFunctionality("email address"), appFunctionality("user id"), appFunctionality("name")],
  },
  observability: {
    packages: ["@marktiderman/genesis-native", "@sentry/react-native"],
    collects: [
      appFunctionality("crash data"),
      appFunctionality("performance data"),
      appFunctionality("other diagnostic data"),
      appFunctionality("user id", "analytics"),
      { type: "product interaction", purposes: ["analytics"], linked: true, tracking: false },
    ],
  },
  push: {
    packages: ["@marktiderman/genesis-native", "expo-notifications"],
    collects: [appFunctionality("device ID")],
  },
};

/** The variant from options, else `APP_VARIANT`, else production. An unknown value throws. */
export function resolveVariant(given?: string): AppVariant {
  const value = given ?? process.env.APP_VARIANT ?? "production";
  if (!(APP_VARIANTS as readonly string[]).includes(value)) {
    throw new GenesisConfigError(`APP_VARIANT is "${value}"; expected one of ${APP_VARIANTS.join(", ")}`);
  }
  return value as AppVariant;
}

export function applyVariant(config: ExpoConfig, variant: AppVariant, options: WithGenesisOptions["variants"] = {}): ExpoConfig {
  if (variant === "production") return config;
  const suffix = { ...DEFAULT_VARIANT_SUFFIXES[variant], ...options[variant] };
  // A value that already ends in the suffix was suffixed by an earlier run: leave it.
  const add = (value: string, end: string) => (end && value.endsWith(end) ? value : value + end);
  const next: ExpoConfig = { ...config, name: add(config.name, suffix.name) };
  if (config.ios?.bundleIdentifier) next.ios = { ...config.ios, bundleIdentifier: add(config.ios.bundleIdentifier, suffix.id) };
  if (config.android?.package) next.android = { ...config.android, package: add(config.android.package, suffix.id) };
  return next;
}

export function applyLinks(config: ExpoConfig, links: GenesisLinks | undefined): ExpoConfig {
  if (!links) return config;
  const services = links.webcredentials === false ? ["applinks"] : ["applinks", "webcredentials"];
  const domains = links.hosts.flatMap((host) => services.map((service) => `${service}:${host}`));
  const associatedDomains = union(config.ios?.associatedDomains ?? [], domains);

  const data = links.hosts.flatMap((host) =>
    links.paths?.length ? links.paths.map((pathPrefix) => ({ scheme: "https", host, pathPrefix })) : [{ scheme: "https", host }],
  );
  const filter = { action: "VIEW", autoVerify: true, data, category: ["BROWSABLE", "DEFAULT"] };
  const existing = config.android?.intentFilters ?? [];
  const intentFilters = existing.some((f) => JSON.stringify(f) === JSON.stringify(filter)) ? existing : [...existing, filter];

  return {
    ...config,
    ios: { ...config.ios, associatedDomains },
    android: { ...config.android, intentFilters },
  };
}

/** The required-reason APIs for the packages listed in package.json `dependencies`. */
export function privacyApisFor(dependencies: Record<string, unknown>): PrivacyApi[] {
  return Object.keys(PRIVACY_APIS)
    .filter((pkg) => pkg in dependencies)
    .flatMap((pkg) => PRIVACY_APIS[pkg]!);
}

/** Merge required-reason APIs into `ios.privacyManifests`, keeping every entry and reason the app declares. */
export function applyPrivacyApis(config: ExpoConfig, apis: PrivacyApi[]): ExpoConfig {
  if (apis.length === 0) return config;
  const manifests = config.ios?.privacyManifests ?? {};
  const types = (manifests.NSPrivacyAccessedAPITypes ?? []).map((t) => ({ ...t, NSPrivacyAccessedAPITypeReasons: [...t.NSPrivacyAccessedAPITypeReasons] }));
  for (const api of apis) {
    const found = types.find((t) => t.NSPrivacyAccessedAPIType === api.NSPrivacyAccessedAPIType);
    if (found) found.NSPrivacyAccessedAPITypeReasons = union(found.NSPrivacyAccessedAPITypeReasons, api.NSPrivacyAccessedAPITypeReasons);
    else types.push({ ...api, NSPrivacyAccessedAPITypeReasons: [...api.NSPrivacyAccessedAPITypeReasons] });
  }
  return { ...config, ios: { ...config.ios, privacyManifests: { ...manifests, NSPrivacyAccessedAPITypes: types } } };
}

/** The Genesis blocks whose packages are all in `dependencies`. */
export function privacyBlocksFor(dependencies: Record<string, unknown>): string[] {
  return Object.keys(PRIVACY_BLOCKS).filter((id) => PRIVACY_BLOCKS[id]!.packages.every((pkg) => pkg in dependencies));
}

/**
 * The data the app collects: `privacy.collects` when given, else the union of
 * the blocks' (`privacy.blocks`, else those found in `dependencies`). A type
 * two blocks collect appears once, with every purpose either gives, linked or
 * tracking if either says so. An unknown block id throws.
 */
export function collectedDataFor(privacy: GenesisPrivacy, dependencies: Record<string, unknown>): GenesisDataUse[] {
  if (privacy.collects) return mergeDataUses(privacy.collects);
  const blocks = privacy.blocks ?? privacyBlocksFor(dependencies);
  const unknown = blocks.filter((id) => !(id in PRIVACY_BLOCKS));
  if (unknown.length) {
    throw new GenesisConfigError(`privacy.blocks: ${unknown.map((id) => `"${id}"`).join(", ")} not one of ${Object.keys(PRIVACY_BLOCKS).join(", ")}; list other data in privacy.collects`);
  }
  return mergeDataUses(blocks.flatMap((id) => PRIVACY_BLOCKS[id]!.collects));
}

function mergeDataUses(uses: readonly GenesisDataUse[]): GenesisDataUse[] {
  const byType = new Map<string, GenesisDataUse>();
  for (const use of uses) {
    const seen = byType.get(use.type);
    byType.set(
      use.type,
      seen
        ? { type: use.type, purposes: union(seen.purposes, use.purposes), linked: seen.linked || use.linked, tracking: seen.tracking || use.tracking }
        : { ...use, purposes: [...use.purposes] },
    );
  }
  return [...byType.values()];
}

/**
 * Write the collected data types and `NSPrivacyTracking` into
 * `ios.privacyManifests`. The app's own entries win: a type it already lists
 * is left as it wrote it, and an `NSPrivacyTracking` it set stays. Tracking
 * defaults to whether any entry tracks; an entry that tracks with tracking
 * set false throws, since the manifest would contradict itself.
 */
export function applyPrivacyData(config: ExpoConfig, uses: GenesisDataUse[], tracking?: boolean): ExpoConfig {
  const manifests = config.ios?.privacyManifests ?? {};
  if (tracking !== undefined && manifests.NSPrivacyTracking !== undefined && tracking !== manifests.NSPrivacyTracking) {
    throw new GenesisConfigError(`privacy.tracking is ${tracking} but app.config sets ios.privacyManifests.NSPrivacyTracking to ${manifests.NSPrivacyTracking}; set it in one place`);
  }
  const tracks = uses.some((u) => u.tracking);
  const NSPrivacyTracking = manifests.NSPrivacyTracking ?? tracking ?? tracks;
  if (tracks && NSPrivacyTracking === false) {
    const which = uses.filter((u) => u.tracking).map((u) => u.type);
    throw new GenesisConfigError(`privacy: ${which.join(", ")} is used for tracking but NSPrivacyTracking is false; set privacy.tracking to true and list NSPrivacyTrackingDomains`);
  }
  const existing = (manifests.NSPrivacyCollectedDataTypes ?? []).map((t) => ({ ...t, NSPrivacyCollectedDataTypePurposes: [...t.NSPrivacyCollectedDataTypePurposes] }));
  const listed = new Set(existing.map((t) => t.NSPrivacyCollectedDataType));
  const added = uses
    .map((u) => ({
      NSPrivacyCollectedDataType: PRIVACY_DATA_TYPES[u.type]!,
      NSPrivacyCollectedDataTypeLinked: u.linked,
      NSPrivacyCollectedDataTypeTracking: u.tracking,
      NSPrivacyCollectedDataTypePurposes: u.purposes.map((p) => PRIVACY_PURPOSES[p]!),
    }))
    .filter((t) => !listed.has(t.NSPrivacyCollectedDataType));
  return {
    ...config,
    ios: { ...config.ios, privacyManifests: { ...manifests, NSPrivacyTracking, NSPrivacyCollectedDataTypes: [...existing, ...added] } },
  };
}

export function applyExportCompliance(config: ExpoConfig): ExpoConfig {
  if (config.ios?.config?.usesNonExemptEncryption !== undefined) return config;
  return { ...config, ios: { ...config.ios, config: { ...config.ios?.config, usesNonExemptEncryption: false } } };
}

export function applyFingerprint(config: ExpoConfig): ExpoConfig {
  if (config.runtimeVersion !== undefined || config.ios?.runtimeVersion !== undefined || config.android?.runtimeVersion !== undefined) {
    return config;
  }
  return { ...config, runtimeVersion: { policy: "fingerprint" } };
}

/** The Genesis config plugin. Use it in `plugins` or call it directly in app.config.ts. */
export const withGenesis: ConfigPlugin<WithGenesisOptions | void> = (config, props) => {
  const options = props ?? {};
  const root = options.projectRoot ?? (config as { _internal?: { projectRoot?: string } })._internal?.projectRoot ?? process.cwd();
  let next = applyVariant(config, resolveVariant(options.variant), options.variants);
  const file = options.links !== false || options.privacyManifest !== false ? readGenesisConfig(root) : null;
  if (options.links !== false) next = applyLinks(next, file?.links);
  if (options.privacyManifest !== false) {
    const dependencies = readDependencies(root);
    const privacy = { ...file?.privacy, ...(options.privacy ? validatePrivacy(options.privacy, "withGenesis({ privacy })") : {}) };
    next = applyPrivacyApis(next, privacyApisFor(dependencies));
    if (!privacy.blocks && !privacy.collects && !config.ios?.privacyManifests?.NSPrivacyCollectedDataTypes) {
      // Not a throw: the default is right for an app that is only Genesis blocks. Loud, because
      // anything else the app sends is missing from it.
      console.warn(
        `[genesis] privacy manifest: collected data types are only those of the Genesis blocks found in package.json (${privacyBlocksFor(dependencies).join(", ") || "none"}). If the app sends anything else, list everything it collects in genesis.config.json privacy.collects; to keep this list, set privacy.blocks.`,
      );
    }
    next = applyPrivacyData(next, collectedDataFor(privacy, dependencies), privacy.tracking);
  }
  if (options.exportCompliance !== false) next = applyExportCompliance(next);
  if (options.fingerprint !== false) next = applyFingerprint(next);
  return next;
};

export default withGenesis;

function readDependencies(root: string): Record<string, unknown> {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return {};
  try {
    const deps = JSON.parse(readFileSync(file, "utf8"))?.dependencies;
    return deps && typeof deps === "object" ? deps : {};
  } catch (err) {
    throw new GenesisConfigError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
