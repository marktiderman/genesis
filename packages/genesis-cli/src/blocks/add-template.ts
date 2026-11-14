/**
 * `genesis add template <set|template…>` (and `genesis add release`, the `release` set): write
 * Genesis's templates into an app that doesn't have them yet, or again with the app's current
 * genesis.config.json, and record them in genesis.lock.json so `genesis upgrade` refreshes them.
 * A file of the same name the app already has is never written over silently: the new text goes
 * beside it as `<file>.genesis-next` (or over it, with --replace).
 */
import { CLI_PACKAGE } from "./discover.js";
import { readLock } from "./lock.js";
import { pinnedVersion } from "./pm.js";
import { adoptTemplates, competingReleaseWorkflows, lookupPin, missingTemplateSets, releaseContext, resolveTemplateNames, TEMPLATE_SETS, type AdoptResult, type ReleasePin } from "./release.js";

export interface AddTemplateOptions {
  list?: boolean;
  dryRun?: boolean;
  replace?: boolean;
  /** The release the CI callers pin; default: the installed umbrella's tag, looked up with git. */
  pin?: ReleasePin | null;
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
};

/** Runs the command; the exit code (1 when something needs the app's attention). */
export async function addTemplates(root: string, names: string[], options: AddTemplateOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  if (options.list || !names.length) {
    const missing = new Set(missingTemplateSets(root, readLock(root)));
    log("Template sets (genesis add template <set>):");
    for (const [name, set] of Object.entries(TEMPLATE_SETS)) log(`  ${missing.has(name) ? " " : "✔"} ${name.padEnd(9)} ${set.summary}`);
    log("Or a single template by its path under templates/, such as eas/workflows/rollout.yml.");
    return names.length || options.list ? 0 : 1;
  }
  const templates = resolveTemplateNames(names);
  const pin = options.pin !== undefined ? options.pin : templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/")) ? installedPin(root) : null;
  const version = pinnedVersion(root, CLI_PACKAGE)?.version;
  const results = adoptTemplates(root, templates, { ...(options.dryRun ? { dryRun: true } : {}), ...(options.replace ? { replace: true } : {}), pin, ...(version ? { version } : {}) });
  const attention = (o: AdoptResult["outcome"]) => o === "next" || o === "pending" || o === "held";
  for (const r of results) log(`${attention(r.outcome) ? "!" : "✔"} ${r.location}: ${WORDS[r.outcome]}${r.detail ? ` (${r.detail})` : ""}`);
  const steps: string[] = [];
  if (templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/")) && !pin) steps.push("Replace GENESIS_SHA in the workflows with the commit of the Genesis release you run (docs/APP-CI.md, \"Which ref to call\"); genesis upgrade moves it from then on.");
  if (results.some((r) => r.path === ".github/workflows/native-release.yml" && r.outcome !== "held")) {
    const ctx = releaseContext(root);
    steps.push(`Add EXPO_TOKEN (an Expo robot token)${ctx.release.sentry ? ", SENTRY_AUTH_TOKEN" : ""}${ctx.release.pushHook?.secrets.length ? `, ${ctx.release.pushHook.secrets.join(", ")}` : ""} to the GitHub environment "${ctx.release.environment}", limited to main (docs/NATIVE-RELEASE.md, "One-time setup").`);
    const rivals = competingReleaseWorkflows(root, ctx.appFolder);
    if (rivals.length) steps.push(`Remove ${rivals.join(", ")} in the same change: they publish EAS updates or start EAS runs too, and beside native-release.yml a release would go out twice.`);
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
