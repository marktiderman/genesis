/**
 * Overlays: an app's local copy of a published Genesis package, listed in
 * genesis.config.json `localPackages` under the package's own name, so the app
 * can change it today and promote the change upstream later. Its package.json
 * carries the marker (validated by genesis-features, `readOverlayMarker`):
 *
 *   "genesis": { …, "overlay": { "upstream": "@marktiderman/genesis-support@0.2.6",
 *                                "since": "2026-10-30", "owner": "…", "reason": "…" } }
 *
 * The doctor already prefers a local package over an installed one of the same
 * name (package-rules.ts `discoverPackages`). The rules here keep overlays
 * visible and short-lived:
 *
 * - overlay-unmarked (error): a local package named like a Genesis package with no marker.
 * - overlay-invalid (error): a marker that doesn't validate, a `since` later than tomorrow, an
 *   overlay that isn't `private: true`, or an overlay folder that holds the app's own source.
 * - overlay-age: a marker older than 14 days is info (seen, never failing); older than 30 days it
 *   warns, which fails --strict. An overlay never blocks a release for its first month.
 * - overlay-version (warn): the version isn't the upstream version, `<upstream>+local.N` or `<upstream>-local.N`.
 * - overlay-behind (warn, failing --strict): the marker's `upstream` is older than the version the
 *   app now pins: the installed release's (the umbrella's versions.json), else the app's own
 *   dependency on the package. `genesis upgrade` rebases the overlay and clears it.
 *
 * A marked overlay (a valid marker, private, in a package folder of its own) IS the package it
 * shadows, so the rules that flag copies of a Genesis primitive (shadowed-export,
 * local-genesis-copy, raw-tag, native-raw-primitive) skip files inside an overlay of that
 * package, the packages pack's change gate skips the overlay, and version-skew compares the
 * release with the marker's upstream version instead of the overlay's own.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { overlayUpstream, readOverlayMarker, type OverlayMarker } from "@marktiderman/genesis-features";
import { inside } from "../blocks/files.js";
import { localPackages, type LocalPackage } from "../blocks/local.js";
import { DEFAULT_NATIVE_SRC, DEFAULT_SRC } from "./scan.js";
import { compareVersions, parseVersion } from "./semver.js";
import { readReleaseManifest } from "./versions.js";
import type { DoctorConfig, DoctorContext, SourceFile } from "./types.js";

export type { OverlayMarker } from "@marktiderman/genesis-features";

export const GENESIS_PACKAGE_NAME = /^@marktiderman\/genesis(?:-[a-z0-9-]+)?$/;
/** Days after which an overlay is reported (info), and after which it warns (failing --strict). */
export const OVERLAY_NOTICE_DAYS = 14;
export const OVERLAY_WARN_DAYS = 30;

/** What a package.json says about being an overlay. */
export type OverlayState = { kind: "none" } | { kind: "marked"; marker: OverlayMarker } | { kind: "invalid"; problems: string[] };

/** Read a package.json's `genesis.overlay`. */
export function overlayState(name: string, json: unknown): OverlayState {
  const raw = (json as { genesis?: { overlay?: unknown } } | null)?.genesis?.overlay;
  if (raw === undefined) return { kind: "none" };
  const problems: string[] = [];
  const marker = readOverlayMarker(name, raw, problems);
  return marker ? { kind: "marked", marker } : { kind: "invalid", problems };
}

/**
 * What keeps a validly marked package from counting as an overlay: it must be `private: true` (an
 * overlay never publishes), and its folder must be a package of its own, not one holding the app's
 * scanned source (`src` by default), so a marker can't switch the primitive-copy rules off for the app.
 */
export function overlaySetupProblems(root: string, config: Pick<DoctorConfig, "src" | "packs">, dir: string, name: string, json: { private?: unknown }): string[] {
  const problems: string[] = [];
  if (json.private !== true) problems.push(`${name}: an overlay is the app's own copy and never publishes; set "private": true`);
  const rel = path.relative(path.resolve(root), path.resolve(dir)).split(path.sep).join("/");
  const sources = (config.src ?? (config.packs?.includes("native") ? DEFAULT_NATIVE_SRC : DEFAULT_SRC)).map((s) => s.replace(/^\.\//, "").replace(/\/+$/, ""));
  const holds = sources.find((s) => rel === "" || s === rel || s.startsWith(`${rel}/`));
  if (holds !== undefined) problems.push(`${name}: an overlay lives in a package folder of its own, not in ${rel || "the app root"}, which holds the app's source (${holds})`);
  return problems;
}

/** A marked overlay the doctor treats as the package it shadows. */
export interface MarkedOverlay {
  dir: string;
  marker: OverlayMarker;
}

/** The app's marked overlays (valid marker, private, a package folder of its own): package name → overlay. */
export function markedOverlays(ctx: Pick<DoctorContext, "packages" | "root" | "config">): Map<string, MarkedOverlay> {
  const out = new Map<string, MarkedOverlay>();
  for (const p of ctx.packages) {
    if (!p.local || !p.overlay) continue;
    if (overlaySetupProblems(ctx.root, ctx.config, p.dir, p.name, { private: p.private }).length) continue;
    out.set(p.name, { dir: p.dir, marker: p.overlay });
  }
  return out;
}

/** Whether `file` is inside the app's marked overlay of `packageName`. */
export function insideOverlayOf(overlays: ReadonlyMap<string, MarkedOverlay>, file: SourceFile, packageName: string): boolean {
  const dir = overlays.get(packageName)?.dir;
  return dir !== undefined && inside(dir, file.absolutePath);
}

/** Whole days from `since` (YYYY-MM-DD, UTC) to `now`. */
export function overlayAgeDays(since: string, now: Date = new Date()): number {
  const [y, m, d] = since.split("-").map(Number) as [number, number, number];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - Date.UTC(y, m - 1, d)) / 86_400_000);
}

// The upstream version itself, `<upstream>+local.N` (build metadata: still satisfies the peer ranges of
// the package's own family, so it's the recommended form) or `<upstream>-local.N` (a prerelease, which
// `^x.y.z` peer ranges exclude).
const LOCAL_VERSION = /^(\d+\.\d+\.\d+(?:-(?!local\.)[0-9A-Za-z.-]+?)?)(?:[+-]local\.(?:0|[1-9]\d*))?$/;

/**
 * The version the app now pins for a package its overlay shadows: the installed release's, else the
 * highest plain version (`1.2.3`, `^1.2.3`, `~1.2.3`) any of the app's package.json files depends on.
 */
export function pinnedVersion(root: string, name: string, manifests: readonly string[] = ["package.json"]): string | null {
  let manifest = null;
  try {
    manifest = readReleaseManifest(root);
  } catch {
    // An unreadable versions.json is version-skew's to report.
  }
  const released = manifest?.packages[name];
  if (released && parseVersion(released)) return released;
  let best: string | null = null;
  for (const file of manifests) {
    let json: Record<string, Record<string, unknown> | undefined>;
    try {
      json = JSON.parse(readFileSync(path.join(root, file), "utf8")) as typeof json;
    } catch {
      continue;
    }
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const spec = json[section]?.[name];
      const v = typeof spec === "string" ? /^[\^~=]?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(spec)?.[1] : undefined;
      const parsed = v && parseVersion(v);
      if (parsed && (!best || compareVersions(parsed, parseVersion(best)!) > 0)) best = v!;
    }
  }
  return best;
}

/** The overlay rules, over every local package named like a Genesis package. */
export function checkOverlays(ctx: DoctorContext, now: Date = new Date()): void {
  let packages: LocalPackage[];
  try {
    packages = localPackages(ctx.root);
  } catch {
    return; // A broken localPackages setting is the packages pack's to report.
  }
  for (const pkg of packages) {
    if (!GENESIS_PACKAGE_NAME.test(pkg.name)) continue;
    const file = `${pkg.rel}/package.json`;
    let json: { version?: unknown; private?: unknown };
    try {
      json = JSON.parse(readFileSync(path.join(pkg.dir, "package.json"), "utf8")) as typeof json;
    } catch {
      continue;
    }
    const state = overlayState(pkg.name, json);
    if (state.kind === "none") {
      ctx.report({
        rule: "overlay-unmarked",
        file,
        subject: pkg.name,
        message:
          `${pkg.name} is a local package with a Genesis package's name, so it shadows the published one, but it carries no overlay marker; ` +
          `add "genesis": { "overlay": { "upstream": "${pkg.name}@<version copied>", "since": "YYYY-MM-DD", "owner": "…", "reason": "…" } }, or rename it`,
      });
      continue;
    }
    if (state.kind === "invalid") {
      for (const problem of state.problems) ctx.report({ rule: "overlay-invalid", file, subject: pkg.name, message: problem });
      continue;
    }
    const { marker } = state;
    for (const problem of overlaySetupProblems(ctx.root, ctx.config, pkg.dir, pkg.name, json)) ctx.report({ rule: "overlay-invalid", file, subject: pkg.name, message: problem });
    const age = overlayAgeDays(marker.since, now);
    // A day of slack for time zones; a later `since` would keep overlay-age quiet for good.
    if (age < -1) {
      ctx.report({ rule: "overlay-invalid", file, subject: pkg.name, message: `${pkg.name} genesis.overlay.since: ${marker.since} is in the future; use the day the overlay was made` });
    } else if (age > OVERLAY_NOTICE_DAYS) {
      ctx.report({
        rule: "overlay-age",
        level: age > OVERLAY_WARN_DAYS ? "warn" : "info",
        file,
        subject: pkg.name,
        message: `the overlay of ${marker.upstream} is ${age} days old (since ${marker.since}, owner ${marker.owner}); promote its change to Genesis and adopt the release, or drop it (an overlay is reported after ${OVERLAY_NOTICE_DAYS} days, and after ${OVERLAY_WARN_DAYS} it warns, which fails --strict)`,
      });
    }
    const upstream = overlayUpstream(marker).version;
    const version = typeof json.version === "string" ? json.version : "";
    if (LOCAL_VERSION.exec(version)?.[1] !== upstream) {
      ctx.report({
        rule: "overlay-version",
        level: "warn",
        file,
        subject: version || "(none)",
        message: `the overlay of ${marker.upstream} is version ${version || "(none)"}; use ${upstream}+local.N (or ${upstream} itself) so it reads as a local build of ${upstream} and still satisfies peer ranges`,
      });
    }
    const pinned = pinnedVersion(ctx.root, pkg.name);
    const from = parseVersion(upstream);
    const to = pinned ? parseVersion(pinned) : null;
    if (from && to && compareVersions(from, to) < 0) {
      ctx.report({
        rule: "overlay-behind",
        level: "warn",
        file,
        subject: pkg.name,
        message: `the overlay of ${marker.upstream} is behind ${pkg.name}@${pinned}, the version the app now pins; run genesis upgrade, which rebases the overlay onto it (dropping what Genesis now ships) and moves the marker's upstream, or rebase it by hand`,
      });
    }
  }
}
