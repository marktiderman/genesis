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
//   node .eas/scripts/native-release.mjs plan <dir> <platforms> <profile> [channel]
//     For each platform (`ios,android`): its runtime version, from <dir>/fingerprint-<platform>.json
//     (`eas fingerprint:generate --json`, the default) or <dir>/runtime-<platform>.txt (what
//     genesis.config.json release.runtimeVersion's command printed), and <dir>/builds-<platform>.json
//     (`eas build:list --json`); and <dir>/runs.json (`eas workflow:runs --json`). A platform with a
//     FINISHED store build of <profile> on that runtime version is published here
//     (<platform>_action=publish) unless an EAS release run is open; every other platform goes to
//     EAS (<platform>_action=eas). Writes key=value lines (GITHUB_OUTPUT format), with
//     publish_platforms and eas_platforms; exits 1 rather than guess when a file isn't what eas
//     printed, or a build's runtime isn't its fingerprint. A platform is skipped (<platform>_action=skip)
//     when <dir>/shipped-<platform>.txt says the channel's latest update already carries this commit,
//     or when the build it would publish on was made from this commit or a later one ($GITHUB_SHA,
//     checked with git against the build's gitCommitHash; published when git can't tell). Only builds
//     on [channel] count. A platform with <dir>/failed-<platform>.txt (its own planning failed) is
//     <platform>_action=failed, in failed_platforms: neither published nor handed to EAS.
//   node .eas/scripts/native-release.mjs update <update.json> <platform> <runtime version>
//     From `eas update --json`: the platform's update group, checked against the runtime version
//     the plan matched (an update for another runtime reaches no phone).
//   node .eas/scripts/native-release.mjs profile-env <eas.json> <profile> [platform] [--shell]
//     The build profile's `env` as EAS resolves it for the platform (along `extends`, with
//     `<platform>.env` over it), as NAME=value lines, or `export` lines to eval.
//   node .eas/scripts/native-release.mjs with-profile <eas.json> <profile> <platform> -- <command> [args…]
//     Runs the command with the build profile's env (as profile-env resolves it) over the environment
//     it was given (under `eas env:exec`, the EAS environment's): the precedence the build had. Only
//     that command gets it, so the shell around it keeps its own values.
//   node .eas/scripts/native-release.mjs channel <eas.json> <profile> <channel>
//     Fails when the build profile names another channel: its builds wouldn't take the updates.
//   node .eas/scripts/native-release.mjs latest-commit <channel> <platform>
//     The commits of the latest updates for the platform on the branches the channel serves
//     (`eas channel:view`, `eas update:list`, `eas update:view`), one per line; none before the
//     first release.
//   node .eas/scripts/native-release.mjs runtime-printed <file> <platform>
//     The runtime version release.runtimeVersion's command printed (its last line), refused when
//     empty or `undefined`/`null` (a variable the command read wasn't set).
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
import { execFileSync, spawnSync } from "node:child_process";
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
    .map((line) => `::add-mask::${escapeCommandData(line)}`);
}

/**
 * A workflow command's data as the runner reads it back: it decodes `%25`, `%0D` and `%0A`, so a
 * literal `%25` sent as is would register `%` and leave the real value unmasked.
 */
export function escapeCommandData(text) {
  return String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
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
export function pickBuild(builds, hash, platform, profile, channel) {
  if (!Array.isArray(builds) || !hash) return null;
  const matching = builds.filter(
    (b) =>
      b &&
      b.status === "FINISHED" &&
      String(b.platform ?? platform).toLowerCase() === platform &&
      (b.buildProfile ?? profile) === profile &&
      (b.distribution ?? "STORE") === "STORE" &&
      onChannel(b, channel) &&
      b.fingerprint?.hash === hash,
  );
  return matching[0] ?? null;
}

/** Whether a build listens to `channel` (the one updates are published to); any build when no channel is given or the build records none. */
function onChannel(build, channel) {
  return !channel || build.channel == null || build.channel === channel;
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
 * A platform is skipped when its channel already has an update carrying this commit or a later one
 * (`shipped`, the later commit), or when the build it would publish on was made from this commit or
 * a later one (a later commit that changed native code ran first and built, with no update yet):
 * GitHub can run a later commit's release first, and publishing this one after it would put the
 * older code back. `order.contains(commit, buildCommit)` says whether the build's commit carries
 * this one (true), doesn't (false) or can't tell (null, and the platform is published).
 * Only builds on `order.channel` (the channel updates go to) count. A platform whose own planning
 * failed (`failed`) is neither published nor handed to EAS (<platform>_action=failed, listed in
 * failed_platforms); the other is planned as usual.
 * @param {Record<string, { runtime?: string, by?: "fingerprint" | "runtime", builds?: unknown, shipped?: string, failed?: boolean }>} byPlatform
 * @param {unknown} runs
 * @param {string} profile
 * @param {{ commit?: string, contains?: (commit: string, later: string) => boolean | null, channel?: string }} [order]
 */
export function planOutputs(byPlatform, runs, profile, order = {}) {
  const platforms = Object.keys(byPlatform);
  if (!platforms.length) throw new Error("plan needs at least one platform.");
  const open = laneOpen(runs);
  const out = {};
  const publish = [];
  const eas = [];
  const skipped = [];
  const failed = [];
  for (const platform of platforms) {
    if (byPlatform[platform].failed) {
      out[`${platform}_action`] = "failed";
      failed.push(platform);
      continue;
    }
    const { runtime, by, builds, shipped } = byPlatform[platform];
    if (by === "fingerprint" && (typeof runtime !== "string" || !/^[0-9a-f]{40}$/i.test(runtime))) throw new Error(`eas fingerprint:generate gave no ${platform} fingerprint hash.`);
    // Any runtime version Expo takes (`1.0.0`, `1.0.0(1)`, …): up to 255 characters, no spaces.
    if (by === "runtime" && !isRuntimeVersion(runtime)) throw new Error(`release.runtimeVersion's command printed no ${platform} runtime version (got "${runtime ?? ""}").`);
    // Read as "no build", a broken list would start a native build on every merge.
    if (!Array.isArray(builds)) throw new Error(`eas build:list --json did not print a list of ${platform} builds.`);
    const build = by === "fingerprint" ? pickBuild(builds, runtime, platform, profile, order.channel) : pickBuildByRuntime(builds, runtime, platform, profile, order.channel);
    // With the fingerprint policy the runtime version is the fingerprint. A build recorded with
    // another one wouldn't take this commit's update: stop before publishing anything.
    if (build && by === "fingerprint" && build.runtime?.version && build.runtime.version !== runtime) {
      throw new Error(`The ${platform} build ${build.id} has fingerprint ${runtime} but runtime ${build.runtime.version}: an update from this commit would not reach it. Nothing was published.`);
    }
    out[`${platform}_runtime_version`] = runtime;
    out[`${platform}_has_build`] = build ? "true" : "false";
    const buildCommit = build && /^[0-9a-f]{40}$/i.test(build.gitCommitHash ?? "") ? build.gitCommitHash : "";
    if (build) {
      out[`${platform}_build_id`] = build.id;
      out[`${platform}_app_version`] = build.appVersion ?? "";
      if (buildCommit) out[`${platform}_build_commit`] = buildCommit;
    }
    const built = Boolean(buildCommit && order.commit && order.contains?.(order.commit, buildCommit) === true);
    const action = shipped || built ? "skip" : build && !open ? "publish" : "eas";
    out[`${platform}_action`] = action;
    if (shipped) out[`${platform}_shipped_by`] = shipped;
    else if (built) out[`${platform}_built_by`] = buildCommit;
    (action === "publish" ? publish : action === "eas" ? eas : skipped).push(platform);
  }
  return Object.entries({ ...out, lane_open: open ? "true" : "false", publish_platforms: publish.join(","), eas_platforms: eas.join(","), skipped_platforms: skipped.join(","), failed_platforms: failed.join(",") }).map(([k, v]) => `${k}=${v}`);
}

/** The finished store build of `profile` for `platform` recorded with `runtime` (an app's own runtime version), or null. */
export function pickBuildByRuntime(builds, runtime, platform, profile, channel) {
  if (!Array.isArray(builds) || !runtime) return null;
  return (
    builds.find(
      (b) =>
        b &&
        b.status === "FINISHED" &&
        String(b.platform ?? platform).toLowerCase() === platform &&
        (b.buildProfile ?? profile) === profile &&
        (b.distribution ?? "STORE") === "STORE" &&
        onChannel(b, channel) &&
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

/** The build profiles `profile` extends, itself first, checked: eas.json's `build[name]` for each. */
function profileChain(easJson, profile) {
  const build = easJson?.build ?? {};
  const chain = [];
  for (let name = profile; name !== undefined; name = build[name].extends) {
    if (chain.some(([n]) => n === name)) throw new Error(`eas.json build profiles extend each other in a loop at "${name}".`);
    if (!build[name]) throw new Error(`eas.json has no build profile "${name}".`);
    chain.push([name, build[name]]);
  }
  return chain.map(([, own]) => own);
}

/**
 * The build profile's `env` for `platform`, as EAS resolves it: along `extends`, each profile's
 * common `env` then its `<platform>.env` over it, the profile's own values over what it extends.
 * @returns {Record<string, string>}
 */
export function profileEnvValues(easJson, profile, platform) {
  if (platform !== undefined && !PLATFORMS.includes(platform)) throw new Error(`profile-env: platform must be ios or android (got "${platform}").`);
  const chain = profileChain(easJson, profile).reverse();
  const common = Object.assign({}, ...chain.map((own) => own.env ?? {}));
  const overrides = Object.assign({}, ...chain.map((own) => (platform && own[platform]?.env) ?? {}));
  return Object.fromEntries(
    Object.entries({ ...common, ...overrides }).map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`eas.json build.${profile}.env has a name that isn't one: "${key}".`);
      return [key, String(value)];
    }),
  );
}

/**
 * The build profile's `env` for `platform` (profileEnvValues) as lines: `NAME=value` (a value with a
 * line break is refused, since a line is one variable), or with `shell`, `export NAME='value'`
 * lines to `eval`, a line break kept inside the quotes.
 * @param {{ build?: Record<string, { extends?: string, env?: Record<string, unknown>, ios?: { env?: Record<string, unknown> }, android?: { env?: Record<string, unknown> } }> }} easJson
 */
export function profileEnv(easJson, profile, platform, shell = false) {
  return Object.entries(profileEnvValues(easJson, profile, platform)).map(([key, text]) => {
    if (!shell && /[\r\n]/.test(text)) throw new Error(`eas.json build.${profile}.env.${key} has a line break; it can't be passed on as a line (use --shell).`);
    return shell ? `export ${key}='${text.replace(/'/g, "'\\''")}'` : `${key}=${text}`;
  });
}

/**
 * Refuses a build profile whose builds listen to another channel than the one updates are published
 * to: an update there would reach none of them. The channel is the profile's own or the one it
 * extends; a profile naming none isn't refused (the build list's channel is checked too).
 */
export function checkProfileChannel(easJson, profile, channel) {
  const named = profileChain(easJson, profile).find((own) => typeof own.channel === "string")?.channel;
  if (named !== undefined && named !== channel) {
    throw new Error(`eas.json build.${profile} builds listen to the channel "${named}", but the release publishes to "${channel}": no build would take its updates. Make genesis.config.json release.channel and the profile's channel the same. Nothing was published or built.`);
  }
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

/** Whether eas-cli's failure says `pattern` (stderr, stdout or the message). */
const easSaid = (error, pattern) => pattern.test([error?.stderr, error?.stdout, error?.message].map((v) => (v == null ? "" : String(v))).join("\n"));

/**
 * The branches a channel serves, from eas-cli 26's `eas channel:view <channel> --json`:
 * `{ currentPage: { name, …, updateBranches: [{ id, name, updateGroups }] } }` (channel/queries.js
 * renderPageOfBranchesOnChannel). More than one while a branch rollout is on.
 * @param {unknown} view
 */
export function channelBranches(view) {
  const branches = view && typeof view === "object" ? view.currentPage?.updateBranches : undefined;
  if (!Array.isArray(branches)) throw new Error("eas channel:view --json printed no updateBranches.");
  return branches.map((b) => b?.name).filter((n) => typeof n === "string" && n);
}

/** The commit of `branch`'s latest update for `platform` (update:list, then update:view), or "" when it has none or doesn't exist. */
export function branchCommit(run, branch, platform) {
  let listed;
  try {
    listed = run(["update:list", "--branch", branch, "--platform", platform, "--limit", "1", "--json", "--non-interactive"]);
  } catch (error) {
    if (easSaid(error, /Could not find branch/)) return "";
    throw error;
  }
  const group = latestGroup(JSON.parse(listed), platform);
  if (!group) return "";
  // update:view takes no --non-interactive (eas-cli 26 refuses an unknown flag); it never prompts with a group id.
  return groupCommit(JSON.parse(run(["update:view", group, "--json"])), platform);
}

/**
 * The commits of the latest `platform` updates a channel serves, read with eas-cli (`run(args)`
 * runs `eas <args>` and returns its output): the channel's linked branch (or branches, during a
 * rollout), which needn't be named after it, each branch's latest update, and its commit. Empty
 * before the first release (no channel yet, or no update on its branch).
 * @param {(args: string[]) => string} run
 */
export function latestCommits(run, channel, platform) {
  let viewed;
  try {
    viewed = run(["channel:view", channel, "--json", "--non-interactive"]);
  } catch (error) {
    if (easSaid(error, /Could not find channels? with the name/)) return [];
    throw error;
  }
  return channelBranches(JSON.parse(viewed))
    .map((branch) => branchCommit(run, branch, platform))
    .filter(Boolean);
}

/**
 * Whether `later` carries `commit` (git merge-base --is-ancestor): true, false, or null when git
 * can't tell (a commit this checkout doesn't have).
 */
export function gitContains(commit, later, cwd = process.cwd()) {
  const known = (c) => spawnSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd, stdio: "ignore" }).status === 0;
  if (!known(commit) || !known(later)) return null;
  const status = spawnSync("git", ["merge-base", "--is-ancestor", commit, later], { cwd, stdio: "ignore" }).status;
  return status === 0 ? true : status === 1 ? false : null;
}

/** A runtime version Expo takes (`1.0.0`, `1.0.0(1)`, …): up to 255 characters, no spaces, and not what an unset value prints. */
export function isRuntimeVersion(value) {
  return typeof value === "string" && /^\S{1,255}$/.test(value) && !["undefined", "null", "NaN"].includes(value);
}

/** What release.runtimeVersion's command printed: its last non-empty line (eas env:exec may print before it), trimmed. */
export function printedRuntime(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
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
    if (!env[name]?.trim()) throw new Error(`${name} is not set. Add it where the release reads its secrets: the GitHub environment for native-release.yml, the EAS environment for deploy-production.yml (docs/NATIVE-RELEASE.md, "One-time setup"). Nothing was published.`);
  } else if (command === "plan") {
    const [dir, list, profile, channel] = args;
    if (!dir || !profile) throw new Error("plan needs <dir> <platforms> <profile> [channel].");
    const byPlatform = Object.fromEntries(
      parsePlatforms(list).map((p) => {
        // Its own planning failed (the workflow wrote failed-<platform>.txt): nothing else of it is read.
        if (existsSync(join(dir, `failed-${p}.txt`))) return [p, { failed: true }];
        const own = join(dir, `runtime-${p}.txt`);
        const runtime = existsSync(own) ? printedRuntime(readFileSync(own, "utf8")) : readJson(join(dir, `fingerprint-${p}.json`))?.hash;
        const shippedFile = join(dir, `shipped-${p}.txt`);
        const shipped = existsSync(shippedFile) ? readFileSync(shippedFile, "utf8").trim() : "";
        return [p, { runtime, by: existsSync(own) ? "runtime" : "fingerprint", builds: readJson(join(dir, `builds-${p}.json`)), ...(shipped ? { shipped } : {}) }];
      }),
    );
    // The commit being released (GitHub's), checked against each build's commit with git.
    const commit = env.GITHUB_SHA?.trim();
    const order = { ...(commit ? { commit, contains: gitContains } : {}), ...(channel ? { channel } : {}) };
    for (const line of planOutputs(byPlatform, readJson(join(dir, "runs.json")), profile, order)) console.log(line);
  } else if (command === "update") {
    const [file, platform, runtime] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("update needs <update.json> <platform> <runtime version>.");
    for (const line of updateOutputs(readJson(file), platform, runtime)) console.log(line);
  } else if (command === "profile-env") {
    const [file, profile] = args;
    const [, , platform, flag] = args;
    if (!file || !profile) throw new Error("profile-env needs <eas.json> <profile> [platform] [--shell].");
    for (const line of profileEnv(readJson(file), profile, platform === "--shell" ? undefined : platform, platform === "--shell" || flag === "--shell")) console.log(line);
  } else if (command === "with-profile") {
    // with-profile <eas.json> <profile> <platform> -- <command> [args…]: the command with the build
    // profile's env over this environment, as the build had it, and nothing else changed.
    const [file, profile, platform, dashes, cmd, ...rest] = args;
    if (!file || !profile || !PLATFORMS.includes(platform) || dashes !== "--" || !cmd) throw new Error("with-profile needs <eas.json> <profile> <platform> -- <command> [args…].");
    const result = spawnSync(cmd, rest, { stdio: "inherit", env: { ...env, ...profileEnvValues(readJson(file), profile, platform) } });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else if (command === "channel") {
    const [file, profile, channel] = args;
    if (!file || !profile || !channel) throw new Error("channel needs <eas.json> <profile> <channel>.");
    checkProfileChannel(readJson(file), profile, channel);
  } else if (command === "latest-commit") {
    const [channel, platform] = args;
    if (!channel || !PLATFORMS.includes(platform)) throw new Error("latest-commit needs <channel> <platform>.");
    // RELEASE_EAS: how to run eas-cli where it isn't on PATH (EAS's workers: a pinned `npx --yes eas-cli@<version>`).
    const [cmd, ...pre] = (env.RELEASE_EAS?.trim() || "eas").split(/\s+/);
    const run = (eas) => execFileSync(cmd, [...pre, ...eas], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    for (const commit of latestCommits(run, channel, platform)) console.log(commit);
  } else if (command === "runtime-printed") {
    const [file, platform] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("runtime-printed needs <file> <platform>.");
    const printed = printedRuntime(readFileSync(file, "utf8"));
    if (!isRuntimeVersion(printed)) throw new Error(`release.runtimeVersion's command printed no ${platform} runtime version (got "${printed}"). Nothing was published.`);
    console.log(printed);
  } else if (command === "installed") {
    const name = args[0] ?? "";
    if (!name) throw new Error("installed needs a package name.");
    if (!installedAt(process.cwd(), name)) throw new Error(`${name} isn't installed here (looked in node_modules from ${process.cwd()} up). Install it in the app: the release only runs tools the app installed, never one fetched for the run. Nothing was published.`);
  } else if (command === "runtime") {
    const [file, platform, expected] = args;
    if (!file || !PLATFORMS.includes(platform)) throw new Error("runtime needs <resolved.txt> <platform> <runtime version>.");
    checkRuntime(readFileSync(file, "utf8"), platform, expected);
  } else {
    throw new Error(`Unknown command "${command ?? ""}": snapshot, mask, require, plan, update, profile-env, with-profile, channel, latest-commit, runtime-printed, installed or runtime.`);
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
