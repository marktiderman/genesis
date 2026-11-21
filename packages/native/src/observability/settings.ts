/**
 * Error reporting's settings (`observability.*`), declared with genesis-config, so a platform admin
 * turns Sentry on from the in-app Settings screen with no build: the DSN, a switch, and the
 * organization the diagnostics viewer links to. The same declaration is in this package's
 * package.json (`genesis.settings`) for the CLI's doctor and the manifest; a test keeps the two the
 * same.
 *
 * Where the DSN comes from, highest first:
 *
 *   1. the build: `EXPO_PUBLIC_SENTRY_DSN` (`sentrySink`'s `dsn`), as before;
 *   2. the settings: `observability.sentryDsn` through the layers (database, then
 *      genesis.config.json, then the default, none);
 *   3. this device's last settings, kept by `sentrySink`'s `cache` until the settings are read.
 *
 * `observability.enabled` false stops reporting whichever of them gave the DSN.
 *
 * No React or React Native here.
 *
 * @stability Beta
 */
import { defineSettings, settingValueProblem, type ResolvedSettings, type SettingSpec } from "@marktiderman/genesis-config/settings";

/**
 * A Sentry DSN's shape: `https://<public key>@<host>[:port][/path]/<project id>`. A DSN is a public
 * client key (it ships in the app), so it is a setting, not a secret. Read the same way by
 * JavaScript and Postgres (the database checks it too).
 *
 * @stability Beta
 */
export const SENTRY_DSN_PATTERN = "^https?://[0-9a-f]{16,64}@[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*/[0-9]+$";

/** A Sentry organization's slug (`acme` in `https://acme.sentry.io`). @stability Beta */
export const SENTRY_ORG_PATTERN = "^[a-z0-9][a-z0-9_-]{0,99}$";

/** `observability.*`, as declared (and as package.json `genesis.settings` repeats it). @stability Beta */
export const OBSERVABILITY_SETTING_SPECS = {
  enabled: {
    type: "boolean",
    default: true,
    summary: "Report errors to Sentry when a DSN is set. Off stops it, whether the DSN comes from the build (EXPO_PUBLIC_SENTRY_DSN) or the setting below.",
  },
  sentryDsn: {
    type: "string",
    default: null,
    pattern: SENTRY_DSN_PATTERN,
    setup: "sentry",
    summary: "The Sentry project's DSN (Project Settings → Client Keys): errors are reported there, with no build. A public client key, not a secret. EXPO_PUBLIC_SENTRY_DSN in the build wins over it.",
  },
  sentryOrg: {
    type: "string",
    default: null,
    pattern: SENTRY_ORG_PATTERN,
    setup: "sentry",
    summary: "The Sentry organization's slug (acme in https://acme.sentry.io): a support dump's \"Open in Sentry\" link goes to its event there.",
  },
} as const satisfies Record<string, SettingSpec>;

/** @stability Beta */
export const observabilitySettings = defineSettings("observability", OBSERVABILITY_SETTING_SPECS);

/** Error reporting's settings, typed. @stability Beta */
export interface ObservabilitySettingValues {
  enabled: boolean;
  sentryDsn: string | null;
  sentryOrg: string | null;
}

/** What the settings functions here take: `resolveSettings`' result, or the values alone by full key. @stability Beta */
export type ObservabilitySettingsInput = Pick<ResolvedSettings, "values"> | { readonly [key: string]: unknown };

/** @internal */
export function own(values: { readonly [key: string]: unknown }, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/** The values by full key, from `resolveSettings`' result or the values alone. @internal */
export function settingsValuesOf(input: ObservabilitySettingsInput | null | undefined): { readonly [key: string]: unknown } {
  if (!input) return {};
  // A ResolvedSettings (or `{ values }`): no full key is ever called `values` (keys are `namespace.key`).
  const nested = own(input as { readonly [key: string]: unknown }, "values");
  return (typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested : input) as { readonly [key: string]: unknown };
}

/**
 * Error reporting's settings from `resolveSettings`' result (or the values alone, by full key). A
 * key that's missing, or whose value doesn't fit (a DSN of the wrong shape), takes its default:
 * on, and no DSN or organization.
 *
 * @stability Beta
 */
export function observabilitySettingValues(input?: ObservabilitySettingsInput | null): ObservabilitySettingValues {
  const values = settingsValuesOf(input);
  const out: Record<string, unknown> = {};
  for (const def of Object.values(observabilitySettings.keys)) {
    const v = own(values, def.key);
    out[def.key.slice("observability.".length)] = v !== undefined && settingValueProblem(def, v) === null ? v : def.defaults.max;
  }
  return out as unknown as ObservabilitySettingValues;
}

/** A DSN's parts. @stability Beta */
export interface SentryDsnParts {
  publicKey: string;
  /** `o1.ingest.us.sentry.io`, or a self-hosted Sentry's host (with its port). */
  host: string;
  projectId: string;
}

/**
 * Why `dsn` isn't a Sentry DSN, or null when it is (`SENTRY_DSN_PATTERN`). Missing or empty is
 * "not set", not a problem: null.
 *
 * @stability Beta
 */
export function sentryDsnProblem(dsn: string | null | undefined): string | null {
  if (dsn === null || dsn === undefined || dsn.trim() === "") return null;
  return new RegExp(SENTRY_DSN_PATTERN).test(dsn.trim()) ? null : "isn't a Sentry DSN (https://<public key>@<host>/<project id>, from Project Settings → Client Keys)";
}

/** A DSN's key, host and project, or null when it isn't one. @stability Beta */
export function parseSentryDsn(dsn: string | null | undefined): SentryDsnParts | null {
  const text = dsn?.trim();
  if (!text || sentryDsnProblem(text) !== null) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // The shape fits but a URL can't hold it (a port over 65535): not a DSN.
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  return { publicKey: url.username, host: url.host, projectId: segments[segments.length - 1]! };
}

/** Where the DSN in use came from. @stability Beta */
export type SentryDsnSource = "build" | "settings" | "cache";

/** The DSN to use and where it came from, or why there is none. @stability Beta */
export interface ResolvedSentryDsn {
  /** The DSN to start Sentry with, or null: Sentry stays off. */
  dsn: string | null;
  source: SentryDsnSource | null;
  /** False when `observability.enabled` is off. */
  enabled: boolean;
  /**
   * A DSN that was given but can't be used (it isn't a DSN, or a settings layer refused it), or
   * null. A refused layer is reported even when `dsn` is set from another layer.
   */
  problem: string | null;
}

/**
 * The DSN by precedence: the build's (`EXPO_PUBLIC_SENTRY_DSN`), then the settings'
 * (`observability.sentryDsn`), and none while `observability.enabled` is off. A build DSN of the
 * wrong shape is still used, as before, and reported as a problem; a setting of the wrong shape is
 * not used (resolveSettings skips it too) and is reported.
 *
 * ```ts
 * resolveSentryDsn({ build: process.env.EXPO_PUBLIC_SENTRY_DSN, settings: resolved });
 * ```
 *
 * @stability Beta
 */
export function resolveSentryDsn(input: { build?: string | null; settings?: ObservabilitySettingsInput | null; source?: "settings" | "cache" }): ResolvedSentryDsn {
  const values = settingsValuesOf(input.settings);
  const { enabled } = observabilitySettingValues(values);
  const raw = own(values, "observability.sentryDsn");
  const fromSettings = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const settingsProblem = settingProblem(input.settings, fromSettings);
  const build = input.build?.trim() || null;
  if (build) {
    const bad = sentryDsnProblem(build);
    return { dsn: enabled ? build : null, source: enabled ? "build" : null, enabled, problem: bad ? `EXPO_PUBLIC_SENTRY_DSN ${bad}` : null };
  }
  if (!enabled) return { dsn: null, source: null, enabled, problem: settingsProblem };
  // The value in effect is used when it is a DSN, even while a lower layer's refused value is reported.
  if (fromSettings && sentryDsnProblem(fromSettings) === null) return { dsn: fromSettings, source: input.source ?? "settings", enabled, problem: settingsProblem };
  return { dsn: null, source: null, enabled, problem: settingsProblem };
}

/** Why the settings' DSN can't be used: its own shape, or what resolveSettings said of it. */
function settingProblem(input: ObservabilitySettingsInput | null | undefined, dsn: string | null): string | null {
  const bad = sentryDsnProblem(dsn);
  if (bad) return `observability.sentryDsn ${bad}`;
  const problems = input && Array.isArray((input as Partial<ResolvedSettings>).problems) ? (input as ResolvedSettings).problems : [];
  const refused = problems.find((p) => p.key === "observability.sentryDsn" && p.kind !== "requires");
  return refused ? refused.message : null;
}
