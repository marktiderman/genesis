/**
 * The native modules the updates block reads, as the shapes it needs. Pass
 * the real ones (`import * as Updates from "expo-updates"`,
 * `import * as Application from "expo-application"`); tests pass fakes.
 * Both are optional peers: without `expo-updates` there is no update banner
 * and no channel switching, and without `expo-application` no force upgrade.
 */

/** `expo-updates` (SDK 58): the constants and calls this block uses. */
export interface UpdatesModuleLike {
  /** False in development, Expo Go, or a build without updates configured. */
  readonly isEnabled: boolean;
  /** The running update's id; `null` when updates are off. */
  readonly updateId: string | null;
  /** The build's channel; `null` in development builds and Expo Go. */
  readonly channel: string | null;
  readonly runtimeVersion: string | null;
  /** True when the code that shipped in the binary is running, not a downloaded update. */
  readonly isEmbeddedLaunch: boolean;
  /** True when expo-updates fell back to the embedded update after a failed launch. */
  readonly isEmergencyLaunch?: boolean;
  readonly emergencyLaunchReason?: string | null;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; isRollBackToEmbedded?: boolean; manifest?: unknown }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; isRollBackToEmbedded?: boolean; manifest?: unknown }>;
  reloadAsync(options?: { reloadScreenOptions?: object }): Promise<void>;
  /** Overrides the `expo-channel-name` header (persists on the device); `null` removes the override. */
  setUpdateRequestHeadersOverride?(requestHeaders: Record<string, string> | null): void;
}

/** `expo-application`: the installed store version and build number. */
export interface ApplicationLike {
  /** `CFBundleShortVersionString` / `versionName`, e.g. `"1.4.0"`. */
  readonly nativeApplicationVersion: string | null;
  /** `CFBundleVersion` / `versionCode`, e.g. `"37"`. */
  readonly nativeBuildVersion: string | null;
}

/** AsyncStorage, MMKV's async adapter, or a stand-in. */
export interface UpdatesStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

/** React Native's `AppState`. */
export interface UpdatesAppStateLike {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/** Where a reported error came from. */
export type UpdatesErrorSource = "policy" | "check" | "reload" | "storage" | "channel";

export type UpdatesOnError = (error: Error, source: UpdatesErrorSource) => void;

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(typeof value === "string" ? value : "Unknown error");
}

/** The `id` (and `runtimeVersion`) of an update manifest, when it has them. */
export function manifestField(manifest: unknown, field: "id" | "runtimeVersion"): string | null {
  if (!manifest || typeof manifest !== "object") return null;
  const value = (manifest as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}
