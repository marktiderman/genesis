#!/usr/bin/env node
// The decisions of the native release lane (docs/NATIVE-RELEASE.md in the Genesis repository):
// .github/workflows/native-release.yml (GitHub Actions) runs these on every push to main that
// changes the app, and .eas/workflows/deploy-production.yml (EAS, started by that job) runs
// `newest`. Kept here, not in the YAML, so they are tested and can be dry-run without publishing.
// Node's built-ins only: EAS runs it without installing the app's packages.
//
//   node .eas/scripts/native-release.mjs snapshot <env.json>
//     Run first, outside `eas env:exec`: writes a SHA-256 of every value in the runner's environment.
//   node .eas/scripts/native-release.mjs mask <env.json>
//     Run under `eas env:exec <environment>`: prints `::add-mask::` for every value EAS added or
//     changed (all but EXPO_PUBLIC_ ones, which ship inside the app anyway), so GitHub hides them in
//     later logs. Prints nothing else.
//   node .eas/scripts/native-release.mjs require <NAME>
//     Run under `eas env:exec <environment>`: fails, saying where to set it, when NAME is empty.
//   node .eas/scripts/native-release.mjs plan <dir> <platforms> <profile>
//     For each platform (`ios,android`): its runtime version, from <dir>/fingerprint-<platform>.json
//     (`eas fingerprint:generate --json`, the default) or <dir>/runtime-<platform>.txt (what
//     genesis.config.json release.runtimeVersion's command printed), and <dir>/builds-<platform>.json
//     (`eas build:list --json`); and <dir>/runs.json (`eas workflow:runs --json`). A platform with a
//     FINISHED store build of <profile> on that runtime version is published here
//     (<platform>_action=publish) unless an EAS release run is open; every other platform goes to
//     EAS (<platform>_action=eas). Writes key=value lines (GITHUB_OUTPUT format), with
//     publish_platforms and eas_platforms; exits 1 rather than guess when a file isn't what eas
//     printed, or a build's runtime isn't its fingerprint.
//   node .eas/scripts/native-release.mjs update <update.json> <platform> <runtime version>
//     From `eas update --json`: the platform's update group, checked against the runtime version
//     the plan matched (an update for another runtime reaches no phone).
//   node .eas/scripts/native-release.mjs newest <commit>
//     Run by the EAS lane before it publishes: newest=false when the release branch has a later
//     commit that changes what the app bundles (that commit's release ships this one's code too),
//     else newest=true. Reads GitHub with RELEASE_GITHUB_TOKEN (RELEASE_REPOSITORY, RELEASE_BRANCH,
//     RELEASE_PATHS, RELEASE_PATHS_IGNORE); without a token it prints newest=true and says so. Refuses
//     a commit that isn't on the release branch.
//
// Genesis template (templates/eas/scripts/native-release.mjs). genesis upgrade refreshes it; change
// the lane through genesis.config.json `release`, not here.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest("hex");

/** A SHA-256 of each value in `env`, so `maskLines` can tell what `eas env:exec` added. */
export function envDigests(env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([, value]) => typeof value === "string")
      .map(([name, value]) => [name, digest(value)]),
  );
}

// Lines this short would mask common words all over the log, and protect nothing.
const MIN_MASK = 4;

/**
 * `::add-mask::` lines for every value in `env` that isn't in `base` (the runner's environment
 * before `eas env:exec`) with the same value. EXPO_PUBLIC_ values stay readable: they ship in the app.
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string>} base
 */
export function maskLines(env, base) {
  if (!base || typeof base !== "object") throw new Error("mask needs the runner's environment from snapshot.");
  return Object.entries(env)
    .filter(([name, value]) => typeof value === "string" && !name.startsWith("EXPO_PUBLIC_") && base[name] !== digest(value))
    .flatMap(([, value]) => value.split(/\r?\n/).filter((line) => line.trim().length >= MIN_MASK))
    .map((line) => `::add-mask::${line}`);
}

export const PLATFORMS = ["ios", "android"];

/** `ios,android` → the platforms, checked. */
export function parsePlatforms(list) {
  const platforms = String(list ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!platforms.length || platforms.some((p) => !PLATFORMS.includes(p)) || new Set(platforms).size !== platforms.length) {
    throw new Error(`platforms must be ios, android or ios,android (got "${list ?? ""}").`);
  }
  return platforms;
}

/**
 * The finished store build of `profile` for `platform` an update for `hash` can reach, or null:
 * native code changed, or the build with this fingerprint is still being made. Either way GitHub
 * publishes nothing and the EAS lane takes the commit (its get-build waits for a build in progress).
 */
export function pickBuild(builds, hash, platform, profile) {
  if (!Array.isArray(builds) || !hash) return null;
  const matching = builds.filter(
    (b) =>
      b &&
      b.status === "FINISHED" &&
      String(b.platform ?? platform).toLowerCase() === platform &&
      (b.buildProfile ?? profile) === profile &&
      (b.distribution ?? "STORE") === "STORE" &&
      b.fingerprint?.hash === hash,
  );
  return matching[0] ?? null;
}

export const RELEASE_WORKFLOW = "deploy-production.yml";
// Run states that may still publish: queued, running, or paused for approval.
const OPEN_RUN = new Set(["NEW", "IN_PROGRESS", "WAITING", "ACTION_REQUIRED"]);

/**
 * Whether an EAS release run is still open. While one is, every later commit goes to EAS too, so
 * an older commit EAS publishes later can't land on top of a newer one GitHub published in minutes.
 */
export function laneOpen(runs) {
  // Read as "none open", a broken list would let GitHub publish out of order.
  if (!Array.isArray(runs)) throw new Error("eas workflow:runs --json did not print a list of runs.");
  return runs.some((r) => (r?.workflowFileName ?? RELEASE_WORKFLOW) === RELEASE_WORKFLOW && OPEN_RUN.has(r?.status ?? ""));
}

/**
 * The plan's outputs, as `key=value` lines.
 * @param {Record<string, { runtime: string, by: "fingerprint" | "runtime", builds: unknown }>} byPlatform
 * @param {unknown} runs
 * @param {string} profile
 */
export function planOutputs(byPlatform, runs, profile) {
  const platforms = Object.keys(byPlatform);
  if (!platforms.length) throw new Error("plan needs at least one platform.");
  const open = laneOpen(runs);
  const out = {};
  const publish = [];
  const eas = [];
  for (const platform of platforms) {
    const { runtime, by, builds } = byPlatform[platform];
    if (by === "fingerprint" && (typeof runtime !== "string" || !/^[0-9a-f]{40}$/i.test(runtime))) throw new Error(`eas fingerprint:generate gave no ${platform} fingerprint hash.`);
    if (by === "runtime" && (typeof runtime !== "string" || !/^[\w.+-]{1,200}$/.test(runtime))) throw new Error(`release.runtimeVersion's command printed no ${platform} runtime version (got "${runtime ?? ""}").`);
    // Read as "no build", a broken list would start a native build on every merge.
    if (!Array.isArray(builds)) throw new Error(`eas build:list --json did not print a list of ${platform} builds.`);
    const build = by === "fingerprint" ? pickBuild(builds, runtime, platform, profile) : pickBuildByRuntime(builds, runtime, platform, profile);
    // With the fingerprint policy the runtime version is the fingerprint. A build recorded with
    // another one wouldn't take this commit's update: stop before publishing anything.
    if (build && by === "fingerprint" && build.runtime?.version && build.runtime.version !== runtime) {
      throw new Error(`The ${platform} build ${build.id} has fingerprint ${runtime} but runtime ${build.runtime.version}: an update from this commit would not reach it. Nothing was published.`);
    }
    out[`${platform}_runtime_version`] = runtime;
    out[`${platform}_has_build`] = build ? "true" : "false";
    if (build) {
      out[`${platform}_build_id`] = build.id;
      out[`${platform}_app_version`] = build.appVersion ?? "";
    }
    const action = build && !open ? "publish" : "eas";
    out[`${platform}_action`] = action;
    (action === "publish" ? publish : eas).push(platform);
  }
  return Object.entries({ ...out, lane_open: open ? "true" : "false", publish_platforms: publish.join(","), eas_platforms: eas.join(",") }).map(([k, v]) => `${k}=${v}`);
}

/** The finished store build of `profile` for `platform` recorded with `runtime` (an app's own runtime version), or null. */
export function pickBuildByRuntime(builds, runtime, platform, profile) {
  if (!Array.isArray(builds) || !runtime) return null;
  return (
    builds.find(
      (b) =>
        b &&
        b.status === "FINISHED" &&
        String(b.platform ?? platform).toLowerCase() === platform &&
        (b.buildProfile ?? profile) === profile &&
        (b.distribution ?? "STORE") === "STORE" &&
        (b.runtime?.version ?? b.runtimeVersion) === runtime,
    ) ?? null
  );
}

/**
 * The update group `eas update --json` published for `platform`, after checking it went to the
 * runtime version the plan matched.
 * @param {Array<{ group?: string, runtimeVersion?: string, platform?: string }>} updates
 */
export function updateOutputs(updates, platform, runtime) {
  if (!Array.isArray(updates)) throw new Error("eas update --json did not print a list of updates.");
  const update = updates.find((u) => u?.platform === platform);
  if (!update?.group) throw new Error(`eas update --json listed no ${platform} update group.`);
  if (runtime && update.runtimeVersion !== runtime) {
    throw new Error(`The ${platform} update went to runtime ${update.runtimeVersion}, but the build found has ${runtime}: the runtime version computed here differs from eas update's. No phone with that build will get it.`);
  }
  return [`${platform}_update_group=${update.group}`, `${platform}_runtime_version=${update.runtimeVersion}`];
}

/** A path glob (`apps/mobile/**`, `**\/*.md`) as a regular expression on repository paths. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else re += /[.+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

/**
 * Whether a file changes what the app bundles: it matches one of `paths` (when there are any) and
 * none of `ignore`. The same lists as native-release.yml's `paths` / `paths-ignore`.
 */
export function shipsFile(file, paths, ignore) {
  const name = String(file ?? "");
  if (paths.length && !paths.some((p) => globToRegExp(p).test(name))) return false;
  return !ignore.some((p) => globToRegExp(p).test(name));
}

/**
 * From GitHub's compare of `<commit>...<branch>`: whether the branch has a later change to what the
 * app bundles. Throws when the commit isn't on the branch (a run started from another commit).
 * @param {{ status?: string, files?: Array<{ filename?: string }> }} compare
 */
export function newerBundleChange(compare, paths = [], ignore = []) {
  if (!compare || typeof compare !== "object") throw new Error("GitHub's compare gave no result.");
  if (compare.status === "identical") return false;
  if (compare.status !== "ahead") throw new Error(`The commit isn't on the release branch (compare status "${compare.status}"). Nothing was published.`);
  const files = Array.isArray(compare.files) ? compare.files : [];
  // GitHub lists at most 300 files; a list that long most likely includes the app.
  if (files.length >= 300) return true;
  return files.some((f) => shipsFile(f?.filename, paths, ignore));
}

const words = (value) => String(value ?? "").split(/\s+/).filter(Boolean);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

async function main(command, args, env) {
  if (command === "snapshot") {
    if (!args[0]) throw new Error("snapshot needs a file to write.");
    writeFileSync(args[0], JSON.stringify(envDigests(env)));
  } else if (command === "mask") {
    for (const line of maskLines(env, readJson(args[0]))) console.log(line);
  } else if (command === "require") {
    const name = args[0] ?? "";
    if (!name) throw new Error("require needs a variable name.");
    if (!env[name]?.trim()) throw new Error(`${name} is not set. Add it to the GitHub environment that holds the release secrets (docs/NATIVE-RELEASE.md, "One-time setup"). Nothing was published.`);
  } else if (command === "plan") {
    const [dir, list, profile] = args;
    if (!dir || !profile) throw new Error("plan needs <dir> <platforms> <profile>.");
    const byPlatform = Object.fromEntries(
      parsePlatforms(list).map((p) => {
        const own = join(dir, `runtime-${p}.txt`);
        const runtime = existsSync(own) ? readFileSync(own, "utf8").trim() : readJson(join(dir, `fingerprint-${p}.json`))?.hash;
        return [p, { runtime, by: existsSync(own) ? "runtime" : "fingerprint", builds: readJson(join(dir, `builds-${p}.json`)) }];
      }),
    );
    for (const line of planOutputs(byPlatform, readJson(join(dir, "runs.json")), profile)) console.log(line);
  } else if (command === "update") {
    const [file, platform, runtime] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("update needs <update.json> <platform> <runtime version>.");
    for (const line of updateOutputs(readJson(file), platform, runtime)) console.log(line);
  } else if (command === "newest") {
    const sha = args[0] ?? "";
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`newest needs the full commit being released (got "${sha}").`);
    const token = env.RELEASE_GITHUB_TOKEN?.trim();
    const repo = env.RELEASE_REPOSITORY?.trim();
    if (!token || !repo) {
      console.error(`No ${token ? "RELEASE_REPOSITORY" : "RELEASE_GITHUB_TOKEN"}: can't check for a newer commit, so publishing (order unchecked).`);
      console.log("newest=true");
      return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`RELEASE_REPOSITORY must be owner/name (got "${repo}").`);
    const branch = env.RELEASE_BRANCH?.trim() || "main";
    const api = env.GITHUB_API_URL || "https://api.github.com";
    const res = await fetch(`${api}/repos/${repo}/compare/${sha}...${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GitHub compare ${sha}...${branch} answered ${res.status}. Nothing was published.`);
    const newer = newerBundleChange(await res.json(), words(env.RELEASE_PATHS), words(env.RELEASE_PATHS_IGNORE));
    if (newer) console.error(`${branch} has a later app change than ${sha}; its release ships this code. Not publishing.`);
    console.log(`newest=${newer ? "false" : "true"}`);
  } else {
    throw new Error(`Unknown command "${command ?? ""}": snapshot, mask, require, plan, update or newest.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    await main(command, args, process.env);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
