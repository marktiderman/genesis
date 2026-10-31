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
 * - overlay-invalid (error): a marker that doesn't validate.
 * - overlay-age: a marker older than 14 days warns; older than 30 days is an error under --strict.
 * - overlay-version (warn): the version isn't the upstream version, `<upstream>+local.N` or `<upstream>-local.N`.
 *
 * A marked overlay IS the package it shadows, so the rules that flag copies of a
 * Genesis primitive (shadowed-export, local-genesis-copy, raw-tag) skip files inside
 * an overlay of that package, and version-skew and the packages pack's change gate
 * skip the overlay itself.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { overlayUpstream, readOverlayMarker, type OverlayMarker } from "@marktiderman/genesis-features";
import { inside } from "../blocks/files.js";
import { localPackages, type LocalPackage } from "../blocks/local.js";
import type { DoctorContext, SourceFile } from "./types.js";

export type { OverlayMarker } from "@marktiderman/genesis-features";

export const GENESIS_PACKAGE_NAME = /^@marktiderman\/genesis(?:-[a-z0-9-]+)?$/;
/** Days after which an overlay warns, and after which it is an error under --strict. */
export const OVERLAY_WARN_DAYS = 14;
export const OVERLAY_ERROR_DAYS = 30;

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

/** The marker of the package.json in `dir`, when it carries a valid one. */
export function markerAt(dir: string): OverlayMarker | null {
  try {
    const json = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: unknown };
    if (typeof json.name !== "string") return null;
    const state = overlayState(json.name, json);
    return state.kind === "marked" ? state.marker : null;
  } catch {
    return null;
  }
}

/** The app's marked overlays: package name → folder. */
export function markedOverlays(ctx: Pick<DoctorContext, "packages">): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of ctx.packages) if (p.local && p.overlay) out.set(p.name, p.dir);
  return out;
}

/** Whether `file` is inside the app's marked overlay of `packageName`. */
export function insideOverlayOf(overlays: ReadonlyMap<string, string>, file: SourceFile, packageName: string): boolean {
  const dir = overlays.get(packageName);
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
const LOCAL_VERSION = /^(\d+\.\d+\.\d+(?:-(?!local\.)[0-9A-Za-z.-]+?)?)(?:[+-]local\.\d+)?$/;

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
    let json: { version?: unknown };
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
    const age = overlayAgeDays(marker.since, now);
    if (age > OVERLAY_WARN_DAYS) {
      const error = age > OVERLAY_ERROR_DAYS && ctx.strict === true;
      ctx.report({
        rule: "overlay-age",
        level: error ? "error" : "warn",
        file,
        subject: pkg.name,
        message: `the overlay of ${marker.upstream} is ${age} days old (since ${marker.since}, owner ${marker.owner}); promote its change to Genesis and adopt the release, or drop it (overlays warn after ${OVERLAY_WARN_DAYS} days and fail --strict after ${OVERLAY_ERROR_DAYS})`,
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
  }
}
