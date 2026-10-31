/**
 * The release train: `@marktiderman/genesis` ships `dist/versions.json`, the
 * exact version of every Genesis package it was released with. When an app
 * has the umbrella installed, every other Genesis package it has installed
 * should be that version, so the app runs a set that was tested together.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { markerAt } from "./overlays.js";
import type { DoctorContext } from "./types.js";

export const UMBRELLA_PACKAGE = "@marktiderman/genesis";

/** The shape of the umbrella's `dist/versions.json`. */
export interface ReleaseManifest {
  version: string;
  packages: Record<string, string>;
}

/** The installed umbrella's manifest, or null when there's no umbrella or no manifest. */
export function readReleaseManifest(root: string): ReleaseManifest | null {
  const dir = findPackageDir(root, UMBRELLA_PACKAGE);
  const file = dir && path.join(dir, "dist", "versions.json");
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ReleaseManifest;
}

/** `version-skew`: an installed Genesis package isn't the version the installed umbrella was released with. A marked overlay is skipped. */
export function checkVersionSkew(ctx: DoctorContext): void {
  const manifest = readReleaseManifest(ctx.root);
  if (!manifest) return;
  for (const [name, want] of Object.entries(manifest.packages)) {
    const dir = findPackageDir(ctx.root, name);
    if (!dir) continue;
    // The app's marked overlay of the package is meant to differ from the release (overlays.ts).
    if (markerAt(dir)) continue;
    const have = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string }).version;
    if (have === want) continue;
    ctx.report({
      rule: "version-skew",
      level: "warn",
      file: "package.json",
      subject: name,
      message: `${name} is ${have}, but ${UMBRELLA_PACKAGE} ${manifest.version} was released with ${want}. Install ${name}@${want}, or move every Genesis package to one release.`,
    });
  }
}
