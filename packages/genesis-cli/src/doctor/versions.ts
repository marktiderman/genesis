/**
 * The release train: `@marktiderman/genesis` ships `dist/versions.json`, the
 * exact version of every Genesis package it was released with. When an app
 * has the umbrella installed, every other Genesis package it has installed
 * should be that version, so the app runs a set that was tested together.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { findPackageDir } from "./genesis.js";
import { markedOverlays } from "./overlays.js";
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

/** `version-skew`: an installed Genesis package isn't the version the installed umbrella was released with. The app's marked overlay is compared by the release it was copied from. */
export function checkVersionSkew(ctx: DoctorContext): void {
  const manifest = readReleaseManifest(ctx.root);
  if (!manifest) return;
  const overlays = markedOverlays(ctx);
  for (const [name, want] of Object.entries(manifest.packages)) {
    // The app's marked overlay is meant to differ from the release: what it was copied from must match.
    const overlay = overlays.get(name);
    if (overlay) {
      const from = overlay.marker.upstream.slice(overlay.marker.upstream.lastIndexOf("@") + 1);
      if (from !== want) {
        ctx.report({
          rule: "version-skew",
          level: "warn",
          file: "package.json",
          subject: name,
          message: `the app's overlay of ${name} was copied from ${from}, but ${UMBRELLA_PACKAGE} ${manifest.version} was released with ${want}. Bring the overlay onto ${want} (or promote it and adopt the release).`,
        });
      }
      continue;
    }
    const dir = findPackageDir(ctx.root, name);
    if (!dir) continue;
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
