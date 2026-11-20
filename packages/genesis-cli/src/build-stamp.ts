/**
 * `genesis build-stamp`: writes the build's metadata (version, git commit, branch, build time,
 * channel) into a JSON file the app imports and hands to genesis-native's
 * `createUpdates({ buildMetadata })` and genesis-support's `nativeSections({ buildMetadata })`, so
 * the devtools overlay and the context dump show which commit a phone runs (support-features 8.5).
 *
 * Run it just before the bundle is made. The smallest hook is EAS Build's own
 * `eas-build-post-install` script in the app's package.json (EAS runs it in every build), and the
 * same command before `eas update`:
 *
 *   "eas-build-post-install": "genesis build-stamp"
 *   genesis build-stamp --channel production && eas update --channel production
 *
 * Not in the Expo config: `withGenesis()` stays deterministic (no clock, no git), so the runtime
 * fingerprint doesn't change on every build. Commit and branch come from CI's environment first
 * (GitHub Actions, EAS Build), then from git; anything unknown is written as null.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

/** What the file holds: genesis-native's `BuildMetadata` fields it knows at build time. */
export interface BuildStamp {
  version: string | null;
  commit: string | null;
  branch: string | null;
  builtAt: string;
  channel: string | null;
}

export interface BuildStampOptions {
  /** The app's folder. Default the working directory. */
  cwd?: string;
  /** The channel it is built or published for. Default `GENESIS_CHANNEL`, else null. */
  channel?: string | null;
  /** The version. Default the app's package.json `version`. */
  version?: string | null;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  /** Runs git; null when it can't. Tests pass their own. */
  git?: (args: string[]) => string | null;
}

/** The default output path, relative to the app's folder. */
export const BUILD_STAMP_FILE = "build-metadata.json";

const nonEmpty = (value: string | null | undefined): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function runGit(cwd: string) {
  return (args: string[]): string | null => {
    try {
      return nonEmpty(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch {
      return null;
    }
  };
}

/** The stamp, without writing it. */
export function buildStamp(options: BuildStampOptions = {}): BuildStamp {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const git = options.git ?? runGit(cwd);
  let version = options.version === undefined ? null : nonEmpty(options.version);
  if (options.version === undefined) {
    try {
      version = nonEmpty((JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as { version?: string }).version);
    } catch {
      version = null;
    }
  }
  const commit = nonEmpty(env["GITHUB_SHA"]) ?? nonEmpty(env["EAS_BUILD_GIT_COMMIT_HASH"]) ?? git(["rev-parse", "HEAD"]);
  // GitHub's head ref on a pull request, its ref name otherwise; then git (not on a detached HEAD).
  const branch = nonEmpty(env["GITHUB_HEAD_REF"]) ?? nonEmpty(env["GITHUB_REF_NAME"]) ?? ((b) => (b === "HEAD" ? null : b))(git(["rev-parse", "--abbrev-ref", "HEAD"]));
  const channel = options.channel === undefined ? nonEmpty(env["GENESIS_CHANNEL"]) : nonEmpty(options.channel);
  return { version, commit, branch, builtAt: (options.now ?? (() => new Date()))().toISOString(), channel };
}

/** Write the stamp to `out` (default `build-metadata.json` in the app's folder). Returns the path and the stamp. */
export function writeBuildStamp(options: BuildStampOptions & { out?: string } = {}): { file: string; stamp: BuildStamp } {
  const cwd = options.cwd ?? process.cwd();
  const file = path.resolve(cwd, options.out ?? BUILD_STAMP_FILE);
  const stamp = buildStamp(options);
  writeFileSync(file, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
  return { file, stamp };
}
