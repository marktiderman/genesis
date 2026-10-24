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
 * 3. The iOS privacy manifest's required-reason APIs for the packages the
 *    app's package.json lists, merged into what the app declares.
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
import { GenesisConfigError, readGenesisConfig, type GenesisLinks } from "./doctor/config.js";

export { GenesisConfigError, validateLinks, readGenesisConfig, type GenesisLinks } from "./doctor/config.js";

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

/**
 * The required-reason APIs each package needs the app to declare, copied from
 * the package's own PrivacyInfo.xcprivacy. A package is matched when the
 * app's package.json lists it in `dependencies`.
 *
 * - async-storage (2.2.0 `ios/PrivacyInfo.xcprivacy`): FileTimestamp, C617.1.
 *
 * expo-secure-store is not listed: the Keychain is not a required-reason API.
 */
export const PRIVACY_APIS: Record<string, PrivacyApi[]> = {
  "@react-native-async-storage/async-storage": [
    { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
  ],
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
  if (options.links !== false) next = applyLinks(next, readGenesisConfig(root)?.links);
  if (options.privacyManifest !== false) next = applyPrivacyApis(next, privacyApisFor(readDependencies(root)));
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
