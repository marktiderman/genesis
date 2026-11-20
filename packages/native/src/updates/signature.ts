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
 *
 * With `buildMetadata` (a module the app writes at publish time: the commit,
 * the OTA number, the release), the signature also carries `commit`,
 * `otaNumber` and `release`, and the text names them. Without it they are
 * null and the text is as before.
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
  /** The commit the bundle was built from (`buildMetadata`), or null. Optional for signatures made by hand. */
  commit?: string | null;
  /** The OTA number (`buildMetadata`), or null. */
  otaNumber?: string | null;
  /** The release's name (`buildMetadata`), or null. */
  release?: string | null;
  /** When it was built (`buildMetadata`), ISO, or null. */
  builtAt?: string | null;
  /** One line, for an About row. */
  short: string;
  /** Several lines, for a support report. */
  text: string;
}

/**
 * What the app stamps into its bundle when it publishes (a generated `build-metadata.ts` or JSON):
 * every field optional.
 */
export interface BuildMetadata {
  /** The app's version at build time (`genesis build-stamp`). */
  version?: string | null;
  /** The channel it was built or published for. */
  channel?: string | null;
  /** When it was built, ISO. */
  builtAt?: string | null;
  /** The commit the bundle was built from, full or short. */
  commit?: string | null;
  commitMessage?: string | null;
  branch?: string | null;
  /** The over-the-air update's number on its channel. */
  otaNumber?: string | number | null;
  /** The release's name (a tag, a date, a version). */
  release?: string | null;
  /** When the release or update was published, ISO. */
  publishedAt?: string | null;
}

export interface VersionSignatureInput {
  application?: ApplicationLike;
  updates?: UpdatesModuleLike;
  /** `Platform.OS`. */
  platform: string;
  requestedChannel?: string | null;
  /** The commit, OTA number and release the app stamped at publish time. */
  buildMetadata?: BuildMetadata | null;
}

const UNKNOWN = "unknown";

/** A module's value, or null when it gave none (undefined, null or an empty string). */
const given = (value: string | null | undefined): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

const metaText = (value: string | number | null | undefined): string | null => (typeof value === "number" && Number.isFinite(value) ? String(value) : given(typeof value === "string" ? value : null));

export function versionSignature({ application, updates, platform, requestedChannel = null, buildMetadata = null }: VersionSignatureInput): VersionSignature {
  const version = given(application?.nativeApplicationVersion) ?? metaText(buildMetadata?.version);
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
  const commit = metaText(buildMetadata?.commit);
  const otaNumber = metaText(buildMetadata?.otaNumber);
  const release = metaText(buildMetadata?.release);
  if (commit) lines.push(`Commit ${commit}`);
  if (otaNumber) lines.push(`OTA ${otaNumber}`);
  if (release) lines.push(`Release ${release}`);
  const builtAt = metaText(buildMetadata?.builtAt);
  const builtFor = metaText(buildMetadata?.channel);
  if (builtAt || builtFor) lines.push(`Built ${builtAt ?? UNKNOWN}${builtFor ? ` for ${builtFor}` : ""}`);
  return { version, build, platform, channel, requestedChannel, runtimeVersion, updateId, launch, emergency, commit, otaNumber, release, builtAt, short, text: lines.join("\n") };
}
