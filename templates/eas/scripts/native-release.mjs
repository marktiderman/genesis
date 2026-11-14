#!/usr/bin/env node
// The decisions of the native release lane (docs/NATIVE-RELEASE.md in the Genesis repository):
// .github/workflows/native-release.yml (GitHub Actions) runs these on every push to main that
// changes the app. Kept here, not in the YAML, so they are tested and can be dry-run without
// publishing.
// Node's built-ins only.
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
//     printed, or a build's runtime isn't its fingerprint. A platform with <dir>/shipped-<platform>.txt
//     (the channel's latest update already carries this commit) is skipped (<platform>_action=skip).
//   node .eas/scripts/native-release.mjs update <update.json> <platform> <runtime version>
//     From `eas update --json`: the platform's update group, checked against the runtime version
//     the plan matched (an update for another runtime reaches no phone).
//   node .eas/scripts/native-release.mjs profile-env <eas.json> <profile> [platform] [--shell]
//     The build profile's `env` as EAS resolves it for the platform (along `extends`, with
//     `<platform>.env` over it), as NAME=value lines, or `export` lines to eval: eas update doesn't
//     apply it, and the build does.
//   node .eas/scripts/native-release.mjs latest-commit <branch> <platform>
//     The commit of the branch's latest update for the platform (`eas update:list`, then
//     `eas update:view` for its commit), or "" when there is none or no branch yet.
//   node .eas/scripts/native-release.mjs installed <package>
//     Fails, saying so, unless the package is installed (node_modules from here up): the release
//     runs only the app's own tools (npx --no), never one npx would fetch.
//   node .eas/scripts/native-release.mjs runtime <resolved.txt> <platform> <runtime version>
//     Before publishing: fails unless `expo-updates runtimeversion:resolve` (its output in
//     <resolved.txt>) gives the runtime version the plan matched, so a mismatched update is never
//     published.
//
// Genesis template (templates/eas/scripts/native-release.mjs). genesis upgrade refreshes it; change
// the lane through genesis.config.json `release`, not here.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
 * A platform whose channel already has an update carrying this commit or a later one (`shipped`,
 * the later commit) is skipped: GitHub can run a later commit's release first, and publishing
 * this one after it would put the older code back.
 * @param {Record<string, { runtime: string, by: "fingerprint" | "runtime", builds: unknown, shipped?: string }>} byPlatform
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
  const skipped = [];
  for (const platform of platforms) {
    const { runtime, by, builds, shipped } = byPlatform[platform];
    if (by === "fingerprint" && (typeof runtime !== "string" || !/^[0-9a-f]{40}$/i.test(runtime))) throw new Error(`eas fingerprint:generate gave no ${platform} fingerprint hash.`);
    // Any runtime version Expo takes (`1.0.0`, `1.0.0(1)`, …): up to 255 characters, no spaces.
    if (by === "runtime" && (typeof runtime !== "string" || !/^\S{1,255}$/.test(runtime))) throw new Error(`release.runtimeVersion's command printed no ${platform} runtime version (got "${runtime ?? ""}").`);
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
    const action = shipped ? "skip" : build && !open ? "publish" : "eas";
    out[`${platform}_action`] = action;
    if (shipped) out[`${platform}_shipped_by`] = shipped;
    (action === "publish" ? publish : action === "eas" ? eas : skipped).push(platform);
  }
  return Object.entries({ ...out, lane_open: open ? "true" : "false", publish_platforms: publish.join(","), eas_platforms: eas.join(","), skipped_platforms: skipped.join(",") }).map(([k, v]) => `${k}=${v}`);
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

/**
 * The build profile's `env` for `platform`, as EAS resolves it: along `extends`, each profile's
 * common `env` then its `<platform>.env` over it, the profile's own values over what it extends.
 * Lines `NAME=value`, or with `shell`, `export NAME='value'` lines to `eval`. A value with a line
 * break is refused.
 * @param {{ build?: Record<string, { extends?: string, env?: Record<string, unknown>, ios?: { env?: Record<string, unknown> }, android?: { env?: Record<string, unknown> } }> }} easJson
 */
export function profileEnv(easJson, profile, platform, shell = false) {
  if (platform !== undefined && !PLATFORMS.includes(platform)) throw new Error(`profile-env: platform must be ios or android (got "${platform}").`);
  const build = easJson?.build ?? {};
  const seen = new Set();
  const resolve = (name) => {
    if (seen.has(name)) throw new Error(`eas.json build profiles extend each other in a loop at "${name}".`);
    seen.add(name);
    const own = build[name];
    if (!own) throw new Error(`eas.json has no build profile "${name}".`);
    const base = own.extends ? resolve(own.extends) : { common: {}, platform: {} };
    return { common: { ...base.common, ...(own.env ?? {}) }, platform: { ...base.platform, ...((platform && own[platform]?.env) ?? {}) } };
  };
  const { common, platform: overrides } = resolve(profile);
  return Object.entries({ ...common, ...overrides }).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`eas.json build.${profile}.env has a name that isn't one: "${key}".`);
    const text = String(value);
    if (/[\r\n]/.test(text)) throw new Error(`eas.json build.${profile}.env.${key} has a line break; it can't be passed on.`);
    return shell ? `export ${key}='${text.replace(/'/g, "'\\''")}'` : `${key}=${text}`;
  });
}

/**
 * The latest update group on a branch, from eas-cli 26's `eas update:list --branch <b> --platform
 * <p> --limit 1 --json`: `{ name, id, currentPage: [{ group, platforms, runtimeVersion, … }] }`,
 * newest first. Its entries carry no commit (`latestCommit` reads it with `eas update:view`). ""
 * when the branch has none.
 * @param {unknown} list
 */
export function latestGroup(list, platform) {
  const page = list && typeof list === "object" ? list.currentPage : undefined;
  if (!Array.isArray(page)) throw new Error("eas update:list --json printed no currentPage.");
  const latest = page.find((g) => !g?.platforms || String(g.platforms).split(/,\s*/).includes(platform));
  return typeof latest?.group === "string" ? latest.group : "";
}

/**
 * The commit of `platform`'s update in a group, from eas-cli 26's `eas update:view <group> --json`:
 * a list of `{ id, group, platform, gitCommitHash, createdAt, … }`. "" when it records none.
 * @param {unknown} updates
 */
export function groupCommit(updates, platform) {
  const list = Array.isArray(updates) ? updates : Array.isArray(updates?.updates) ? updates.updates : null;
  if (!list) throw new Error("eas update:view --json did not print a list of updates.");
  const sha = list.find((u) => u?.platform === platform)?.gitCommitHash ?? "";
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : "";
}

/**
 * The commit of the channel's latest update for `platform`, read with eas-cli (`run(args)` runs
 * `eas <args>` and returns its output): "" when there is none, including a branch that doesn't
 * exist yet (the first release, which eas-cli reports as `Could not find branch`).
 * @param {(args: string[]) => string} run
 */
export function latestCommit(run, branch, platform) {
  let listed;
  try {
    listed = run(["update:list", "--branch", branch, "--platform", platform, "--limit", "1", "--json", "--non-interactive"]);
  } catch (error) {
    const said = [error?.stderr, error?.stdout, error?.message].map((v) => (v == null ? "" : String(v))).join("\n");
    if (/Could not find branch/.test(said)) return "";
    throw error;
  }
  const group = latestGroup(JSON.parse(listed), platform);
  if (!group) return "";
  // update:view takes no --non-interactive (eas-cli 26 refuses an unknown flag); it never prompts with a group id.
  return groupCommit(JSON.parse(run(["update:view", group, "--json"])), platform);
}

/** The folder `name` is installed in, looking up from `dir` the way Node resolves packages, or null. */
export function installedAt(dir, name) {
  for (let at = resolve(dir); ; at = dirname(at)) {
    const pkg = join(at, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(pkg)) return dirname(pkg);
    if (dirname(at) === at) return null;
  }
}

/** The runtime version in `expo-updates runtimeversion:resolve`'s output, or null. */
export function resolvedRuntime(text) {
  return /"runtimeVersion"\s*:\s*"([^"]+)"/.exec(String(text ?? ""))?.[1] ?? null;
}

/** Refuses, before publishing, an update whose runtime version isn't the build's. */
export function checkRuntime(text, platform, expected) {
  const resolved = resolvedRuntime(text);
  if (!resolved) throw new Error(`expo-updates runtimeversion:resolve printed no ${platform} runtime version. Nothing was published.`);
  if (expected && resolved !== expected) {
    throw new Error(`This commit's ${platform} runtime version here is ${resolved}, but the build found has ${expected}: an update would reach no phone with that build. Nothing was published.`);
  }
  return resolved;
}

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
        const shippedFile = join(dir, `shipped-${p}.txt`);
        const shipped = existsSync(shippedFile) ? readFileSync(shippedFile, "utf8").trim() : "";
        return [p, { runtime, by: existsSync(own) ? "runtime" : "fingerprint", builds: readJson(join(dir, `builds-${p}.json`)), ...(shipped ? { shipped } : {}) }];
      }),
    );
    for (const line of planOutputs(byPlatform, readJson(join(dir, "runs.json")), profile)) console.log(line);
  } else if (command === "update") {
    const [file, platform, runtime] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("update needs <update.json> <platform> <runtime version>.");
    for (const line of updateOutputs(readJson(file), platform, runtime)) console.log(line);
  } else if (command === "profile-env") {
    const [file, profile] = args;
    const [, , platform, flag] = args;
    if (!file || !profile) throw new Error("profile-env needs <eas.json> <profile> [platform] [--shell].");
    for (const line of profileEnv(readJson(file), profile, platform === "--shell" ? undefined : platform, platform === "--shell" || flag === "--shell")) console.log(line);
  } else if (command === "latest-commit") {
    const [branch, platform] = args;
    if (!branch || !PLATFORMS.includes(platform)) throw new Error("latest-commit needs <branch> <platform>.");
    // RELEASE_EAS: how to run eas-cli where it isn't on PATH (EAS's workers: a pinned `npx --yes eas-cli@<version>`).
    const [cmd, ...pre] = (env.RELEASE_EAS?.trim() || "eas").split(/\s+/);
    const run = (eas) => execFileSync(cmd, [...pre, ...eas], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log(latestCommit(run, branch, platform));
  } else if (command === "installed") {
    const name = args[0] ?? "";
    if (!name) throw new Error("installed needs a package name.");
    if (!installedAt(process.cwd(), name)) throw new Error(`${name} isn't installed here (looked in node_modules from ${process.cwd()} up). Install it in the app: the release only runs tools the app installed, never one fetched for the run. Nothing was published.`);
  } else if (command === "runtime") {
    const [file, platform, expected] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("runtime needs <resolved.txt> <platform> <runtime version>.");
    checkRuntime(readFileSync(file, "utf8"), platform, expected);
  } else {
    throw new Error(`Unknown command "${command ?? ""}": snapshot, mask, require, plan, update, profile-env, latest-commit, installed or runtime.`);
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
