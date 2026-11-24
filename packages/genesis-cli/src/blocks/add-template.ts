/**
 * `genesis add template <set|template…>` (and `genesis add release`, the `release` set): write
 * Genesis's templates into an app that doesn't have them yet, or again with the app's current
 * genesis.config.json, and record them in genesis.lock.json so `genesis upgrade` refreshes them.
 * A file of the same name the app already has is never written over silently: the new text goes
 * beside it as `<file>.genesis-next` (or over it, with --replace).
 */
import { CLI_PACKAGE } from "./discover.js";
import { checkEasEnvironment, checkGithubLink, type EasEnvironmentState, type GithubLink } from "./eas-link.js";
import { readApp, replaceApp } from "./files.js";
import { readLock } from "./lock.js";
import { pinnedVersion } from "./pm.js";
import { adoptTemplates, competingReleaseWorkflows, folderInRepository, githubLaneInPlace, previewsInReleaseEnvironment, LANE_DISPATCH_TARGET, lookupPin, missingTemplateSets, OPT_IN_SETS, releaseContext, resolveTemplateNames, setIsMissing, TEMPLATE_SETS, type AdoptResult, type ReleasePin } from "./release.js";

export interface AddTemplateOptions {
  list?: boolean;
  dryRun?: boolean;
  replace?: boolean;
  /** Write native-release.yml even while another workflow releases on push (removed in the same change). */
  replaceRival?: boolean;
  /** The release the CI callers pin; default: the installed umbrella's tag, looked up with git, else the lock's. */
  pin?: ReleasePin | null;
  /** Write genesis.config.json release.trigger first ("eas" or "github"). */
  trigger?: string;
  /** How the EAS project's GitHub link is checked before a move to EAS's trigger (default: Expo's API). */
  checkGithubLink?: (root: string) => Promise<GithubLink>;
  /** How the previews' own EAS environment is checked before an old pr-preview.yml moves to it (default: Expo's API). */
  checkEasEnvironment?: (root: string, name: string) => Promise<EasEnvironmentState>;
  /** How the installed release's pin is found (default: git ls-remote); null when it can't be. */
  findPin?: (root: string) => ReleasePin | null;
  log?: (msg: string) => void;
}

/** The release the app's Genesis is on, for the CI callers' pins; null when it can't be found. */
export function installedPin(root: string): ReleasePin | null {
  const version = pinnedVersion(root, "@marktiderman/genesis")?.version;
  return version ? lookupPin(version) : null;
}

const WORDS: Record<AdoptResult["outcome"], string> = {
  created: "written",
  adopted: "already the same; now in genesis.lock.json",
  updated: "written again with genesis.config.json",
  unchanged: "unchanged",
  next: "yours kept",
  replaced: "written over",
  pending: "left alone",
  held: "held back",
  removed: "removed",
};

/** Runs the command; the exit code (1 when something needs the app's attention). */
export async function addTemplates(root: string, names: string[], options: AddTemplateOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  if (options.list || !names.length) {
    const lock = readLock(root);
    const missing = new Set(missingTemplateSets(root, lock));
    log("Template sets (genesis add template <set>):");
    // An opt-in set is never "missing", so it's ticked only when the app has all of it.
    const has = (name: string) => (OPT_IN_SETS.includes(name) ? !setIsMissing(root, lock, name) : !missing.has(name));
    for (const [name, set] of Object.entries(TEMPLATE_SETS)) log(`  ${has(name) ? "✔" : " "} ${name.padEnd(9)} ${set.summary}${OPT_IN_SETS.includes(name) ? " (opt-in: only when you add it)" : ""}`);
    log("Or a single template by its path under templates/, such as eas/workflows/rollout.yml.");
    return names.length || options.list ? 0 : 1;
  }
  // The config edits this run makes, planned together and written once: appFolder for an app
  // below its repository's root (GitHub workflows go to the root's .github, EAS workflows' paths
  // start there), and --trigger. A dry run plans with them too.
  let planned: Record<string, unknown> | undefined;
  {
    const text = readApp(root, "genesis.config.json");
    const config = (text === null ? {} : JSON.parse(text)) as Record<string, unknown>;
    let changed = false;
    const below = config.appFolder === undefined ? folderInRepository(root) : null;
    if (below) {
      config.appFolder = below;
      changed = true;
      log(`✔ genesis.config.json: "appFolder": "${below}" (the app is in ${below}/ of its repository)${options.dryRun ? " (dry run: not written)" : ""}`);
    }
    if (options.trigger !== undefined) {
      if (options.trigger !== "eas" && options.trigger !== "github") throw new Error(`--trigger must be eas or github (got ${JSON.stringify(options.trigger)})`);
      const set = typeof config.release === "object" && config.release !== null ? (config.release as Record<string, unknown>) : {};
      if (set.trigger !== options.trigger) {
        config.release = { ...set, trigger: options.trigger };
        changed = true;
        log(`✔ genesis.config.json: release.trigger is "${options.trigger}"${options.dryRun ? " (dry run: not written)" : ""}`);
      }
    }
    if (changed) {
      planned = config;
      if (!options.dryRun) replaceApp(root, "genesis.config.json", `${JSON.stringify(config, null, 2)}\n`);
    }
  }
  const templates = resolveTemplateNames(names);
  const pin = options.pin !== undefined ? options.pin : templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/")) ? ((options.findPin ?? installedPin)(root) ?? readLock(root).pin ?? null) : null;
  const version = pinnedVersion(root, CLI_PACKAGE)?.version;
  // Moving off GitHub's trigger: the EAS project's GitHub link is checked online first.
  const laneCtx = releaseContext(root, planned);
  const moving = laneCtx.release.trigger === "eas" && templates.includes("release/deploy-production.yml") && githubLaneInPlace(root, laneCtx.appFolder);
  const githubLink = moving ? await (options.checkGithubLink ?? checkGithubLink)(root) : undefined;
  if (githubLink?.state === "linked") log(`✔ The EAS project is linked to ${githubLink.repository} on GitHub.`);
  // An old pr-preview.yml (previews in the release's environment) moves only once theirs exists.
  const previewEnvironment = templates.includes("release/pr-preview.yml") && previewsInReleaseEnvironment(root, laneCtx) ? await (options.checkEasEnvironment ?? checkEasEnvironment)(root, laneCtx.release.previews.easEnvironment) : undefined;
  const results = adoptTemplates(root, templates, {
    ...(planned ? { config: planned } : {}),
    ...(githubLink ? { githubLink } : {}),
    ...(previewEnvironment ? { previewEnvironment } : {}), ...(options.dryRun ? { dryRun: true } : {}), ...(options.replace ? { replace: true } : {}), ...(options.replaceRival ? { replaceRival: true } : {}), pin, ...(version ? { version } : {}) });
  const attention = (o: AdoptResult["outcome"]) => o === "next" || o === "pending" || o === "held";
  for (const r of results) log(`${attention(r.outcome) ? "!" : "✔"} ${r.location}: ${WORDS[r.outcome]}${r.detail ? ` (${r.detail})` : ""}`);
  const steps: string[] = [];
  if (templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/")) && !pin) steps.push("Replace GENESIS_SHA in the workflows with the commit of the Genesis release you run (docs/APP-CI.md, \"Which ref to call\"); genesis upgrade moves it from then on.");
  if (results.some((r) => r.path === ".github/workflows/native-release.yml" && r.outcome !== "held")) {
    const ctx = releaseContext(root, planned);
    steps.push(`Add EXPO_TOKEN (an Expo robot token)${ctx.release.sentry ? ", SENTRY_AUTH_TOKEN" : ""}${ctx.release.pushHook?.secrets.length ? `, ${ctx.release.pushHook.secrets.join(", ")}` : ""} to the GitHub environment "${ctx.release.environment}", limited to main (docs/NATIVE-RELEASE.md, "One-time setup").`);
    // Only reached with --replace-rival (otherwise native-release.yml is held while one is there).
    // Never deploy-production.yml: native-release.yml dispatches to it (an old push-triggered one
    // holds native-release.yml back until its .genesis-next is merged).
    const rivals = competingReleaseWorkflows(root, ctx.appFolder).filter((rel) => rel !== LANE_DISPATCH_TARGET);
    if (rivals.length) steps.push(`Remove ${rivals.join(", ")} in the same change, before it merges: ${rivals.length === 1 ? "it publishes" : "they publish"} EAS updates or start EAS runs too, and beside native-release.yml a release would go out twice (genesis doctor fails with release-lane-twice until then).`);
  }
  const easDeploy = results.find((r) => r.path === LANE_DISPATCH_TARGET && ["created", "adopted", "updated", "replaced"].includes(r.outcome));
  const ctxNow = easDeploy ? releaseContext(root, planned) : null;
  if (easDeploy && ctxNow?.release.trigger === "eas") {
    const r = ctxNow.release;
    steps.push(`Connect the GitHub repository to the EAS project (expo.dev, project settings, GitHub${ctxNow.appFolder ? `; base directory ${ctxNow.appFolder}` : ""}): EAS Workflows starts each release from its push trigger, and without the link a merge starts nothing (docs/NATIVE-RELEASE.md, "One-time setup").`);
    steps.push(`Add EXPO_TOKEN (an Expo robot token, a secret)${r.sentry ? ", SENTRY_AUTH_TOKEN" : ""}${r.pushHook?.secrets.length ? `, ${r.pushHook.secrets.join(", ")}` : ""} to the EAS environment "${r.easEnvironment}".${r.pushHook ? " The release hook reads GitHub with RELEASE_GITHUB_TOKEN there: a fine-grained token for this repository with Pull requests: read, stored as an EAS secret." : ""}`);
    steps.push(`Say where a failed release goes (EAS sets a failed commit status on GitHub, but emails nobody by default): list who gets an email in genesis.config.json release.failureEmails, and/or add RELEASE_FAILURE_WEBHOOK (a Slack-compatible incoming webhook, a secret) to "${r.easEnvironment}" (docs/NATIVE-RELEASE.md, "When a release fails").`);
    if (results.some((x) => x.path === ".github/workflows/native-release.yml" && x.outcome === "removed")) steps.push("JavaScript-only updates now wait for an EAS worker (minutes on a paid plan's priority queue, longer on the free plan) instead of a GitHub runner.");
    const rivals = competingReleaseWorkflows(root, ctxNow.appFolder).filter((rel) => rel !== LANE_DISPATCH_TARGET);
    if (rivals.length) steps.push(`Remove ${rivals.join(", ")} in the same change, before it merges: beside deploy-production.yml's push trigger a release would go out twice (genesis doctor fails with release-lane-twice until then).`);
  }
  if (results.some((r) => r.outcome === "next")) steps.push("Merge each .genesis-next into its file and delete it; or move your edits into genesis.config.json `release` and run again with --replace.");
  if (steps.length) {
    log("");
    log("To finish:");
    steps.forEach((s, i) => log(`  ${i + 1}. ${s}`));
  }
  if (options.dryRun) log("\nDry run: nothing written.");
  return results.some((r) => attention(r.outcome)) ? 1 : 0;
}
