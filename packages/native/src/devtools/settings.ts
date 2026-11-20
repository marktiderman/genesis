/**
 * The devtools overlay's settings (`devtools.*`), declared with genesis-config. The same
 * declaration is in this package's package.json (`genesis.settings`) for the CLI's doctor; a test
 * keeps the two the same.
 *
 * A setting can only take things away: `devtools.overlay` off hides the overlay, but nothing here
 * turns it on in a production build (`createDevtools({ enabled })` stays a fact of the binary).
 *
 * @stability Beta
 */
import { defineSettings, settingValueProblem, type ResolvedSettings, type SettingSpec } from "@marktiderman/genesis-config/settings";

/** `devtools.*`, as declared. @stability Beta */
export const DEVTOOLS_SETTING_SPECS = {
  overlay: { type: "boolean", default: true, summary: "The Development overlay in development and preview builds. Off hides it; no setting turns it on in a production build." },
  shakeToOpen: { type: "boolean", default: true, requires: ["devtools.overlay"], summary: "Shake to open the overlay (development and preview builds)." },
  hold: { type: "boolean", default: true, requires: ["devtools.overlay"], summary: "A three-finger hold opens the overlay." },
  flags: { type: "boolean", default: true, requires: ["devtools.overlay"], summary: "Show the app's switches and flags in the overlay." },
  signOut: { type: "boolean", default: true, requires: ["devtools.overlay"], summary: "Offer Sign out in the overlay." },
} as const satisfies Record<string, SettingSpec>;

/** @stability Beta */
export const devtoolsSettings = defineSettings("devtools", DEVTOOLS_SETTING_SPECS);

/** The devtools overlay's settings, typed. @stability Beta */
export interface DevtoolsSettingValues {
  overlay: boolean;
  shakeToOpen: boolean;
  hold: boolean;
  flags: boolean;
  signOut: boolean;
}

/**
 * The overlay's settings from `resolveSettings`' result (or the values alone, by full key). A key
 * that's missing, or whose value doesn't fit, takes its default (every one on).
 *
 * @stability Beta
 */
export function devtoolsSettingValues(input?: Pick<ResolvedSettings, "values"> | { readonly [key: string]: unknown } | null): DevtoolsSettingValues {
  const raw = (input ?? {}) as { readonly [key: string]: unknown };
  const nested = Object.prototype.hasOwnProperty.call(raw, "values") ? raw.values : undefined;
  const values = (typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested : raw) as { readonly [key: string]: unknown };
  const out: Record<string, unknown> = {};
  for (const def of Object.values(devtoolsSettings.keys)) {
    const v = Object.prototype.hasOwnProperty.call(values, def.key) ? values[def.key] : undefined;
    out[def.key.slice("devtools.".length)] = v !== undefined && settingValueProblem(def, v) === null ? v : def.defaults.max;
  }
  return out as unknown as DevtoolsSettingValues;
}
