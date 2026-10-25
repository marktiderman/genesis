/**
 * The version signature: which binary and which update this is, in one
 * line for Settings "About" and in a few lines for a support report.
 *
 *   1.4.0 (37) · preview · 3f2a9c1b
 *   1.4.0 (37) · production · embedded
 *   1.4.0 (37) · updates off
 *
 * A value the modules can't give is printed as `unknown`, never left out
 * (an empty string counts as not given: expo-updates gives `""` for the
 * runtime version in a development build); one that doesn't apply, with
 * updates off, as `none`.
 */
import type { ApplicationLike, UpdatesModuleLike } from "./modules";

export interface VersionSignature {
  version: string | null;
  build: string | null;
  platform: string;
  /** The build's channel (expo-updates). */
  channel: string | null;
  /** A channel picked on this device (a test build switched channels); `null` when it follows the build. */
  requestedChannel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  /** `update`: a downloaded update runs. `embedded`: the binary's own code. `off`: updates are off (development, Expo Go). */
  launch: "update" | "embedded" | "off";
  /** expo-updates fell back to the embedded code after a failed launch. */
  emergency: boolean;
  /** One line, for an About row. */
  short: string;
  /** Several lines, for a support report. */
  text: string;
}

export interface VersionSignatureInput {
  application?: ApplicationLike;
  updates?: UpdatesModuleLike;
  /** `Platform.OS`. */
  platform: string;
  requestedChannel?: string | null;
}

const UNKNOWN = "unknown";

/** A module's value, or null when it gave none (undefined, null or an empty string). */
const given = (value: string | null | undefined): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

export function versionSignature({ application, updates, platform, requestedChannel = null }: VersionSignatureInput): VersionSignature {
  const version = given(application?.nativeApplicationVersion);
  const build = given(application?.nativeBuildVersion);
  const on = Boolean(updates?.isEnabled);
  const channel = on ? given(updates?.channel) : null;
  const updateId = on ? given(updates?.updateId) : null;
  const runtimeVersion = given(updates?.runtimeVersion);
  const launch: VersionSignature["launch"] = !on ? "off" : updates?.isEmbeddedLaunch ? "embedded" : "update";
  const emergency = on && updates?.isEmergencyLaunch === true;
  const shownChannel = requestedChannel ?? channel;

  const head = `${version ?? UNKNOWN} (${build ?? UNKNOWN})`;
  const parts = [head];
  if (launch === "off") {
    parts.push("updates off");
  } else {
    parts.push(shownChannel ?? "no channel");
    parts.push(launch === "embedded" ? "embedded" : (updateId?.slice(0, 8) ?? UNKNOWN));
  }
  if (emergency) parts.push("emergency launch");
  const short = parts.join(" · ");

  const lines = [
    `Version ${head}`,
    `Platform ${platform}`,
    `Channel ${channel ?? (on ? UNKNOWN : "none")}${requestedChannel && requestedChannel !== channel ? ` (switched to ${requestedChannel})` : ""}`,
    `Runtime ${runtimeVersion ?? (on ? UNKNOWN : "none")}`,
    `Update ${launch === "off" ? "updates off" : launch === "embedded" ? "embedded" : (updateId ?? UNKNOWN)}`,
  ];
  if (emergency) lines.push(`Emergency launch: ${updates?.emergencyLaunchReason ?? UNKNOWN}`);
  return { version, build, platform, channel, requestedChannel, runtimeVersion, updateId, launch, emergency, short, text: lines.join("\n") };
}
