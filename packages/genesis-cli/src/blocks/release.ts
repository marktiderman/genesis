/**
 * Templates as the app has them, and adopting them into an app that doesn't have them yet.
 *
 * A template's text in an app is the template with, in order: the lock's substitutions (the
 * starter's names, the code folder), the `release` block rendered in (release-render.ts), the Genesis
 * release pin (`@GENESIS_SHA # @marktiderman/genesis@X.Y.Z` in the CI callers), and the app folder
 * (EAS workflows' `paths` from the repository root). `genesis init`, `genesis add template` and
 * `genesis upgrade` all write that text, so an app customises the release lane in
 * genesis.config.json, not by editing the files.
 *
 * With `appFolder`, GitHub reads workflows from the repository's root. A workflow that is Genesis's
 * alone (native-release.yml: its own file, holding none of the repository's other CI) is written,
 * refreshed and merged there like any owned file. The others (ci.yml, which an app's repository
 * fills with its own jobs) are only named on upgrade, and their pins moved in place.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { compareVersions } from "../upgrade/bump-core.mjs";
import { parseGenesisConfig, readGenesisConfig, sentryProject } from "../doctor/config.js";
import { appFolderOf, folderSubstitutions, renderOwned } from "./app-folder.js";
import { CLI_PACKAGE } from "./discover.js";
import { readApp, replaceApp, sha256 } from "./files.js";
import { readLock, substitute, writeLock, type GenesisLock, type OwnedFile } from "./lock.js";
import { detectPackageManager } from "./pm.js";
import { RELEASE_GITHUB_TOKEN, renderRelease, resolveRelease, type ReleaseContext, type ReleasePackageManager } from "./release-render.js";
import { linkSteps, type EasEnvironmentState, type GithubLink } from "./eas-link.js";
import { templateTarget, templatesDir, walk } from "./templates.js";

export { renderRelease, resolveRelease, RELEASE_DEFAULTS, DEFAULT_RELEASE_CONTEXT, type ReleaseContext, type ResolvedRelease } from "./release-render.js";

/** A Genesis release's commit, written into the CI callers in place of `GENESIS_SHA`. */
export interface ReleasePin {
  sha: string;
  /** The umbrella's version (`@marktiderman/genesis@<version>`). */
  version: string;
}

const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function checkPin(pin: ReleasePin): ReleasePin {
  if (!SHA.test(pin.sha) || !VERSION.test(pin.version)) throw new Error(`Not a Genesis release pin: ${JSON.stringify(pin)}`);
  return pin;
}

/** A template's `GENESIS_SHA` / `X.Y.Z` pin as `pin` names it; unchanged without one. */
export function renderPin(text: string, pin: ReleasePin | null | undefined): string {
  if (!pin) return text;
  return text.replace(/(@ ?)GENESIS_SHA(\s*#\s*@marktiderman\/genesis@)X\.Y\.Z/g, `$1${pin.sha}$2${pin.version}`);
}

/** A reusable Genesis workflow's pin in a caller, whatever release it names now. */
const CALLER_PIN = /(marktiderman\/genesis\/\.github\/workflows\/[\w.-]+\.ya?ml@)([0-9a-f]{40}|GENESIS_SHA)(\s*#\s*@marktiderman\/genesis@)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|X\.Y\.Z)/g;

/** The Genesis reusable workflows a workflow calls (`app-ci.yml`). */
export function calledWorkflows(text: string): string[] {
  return [...new Set([...text.matchAll(/marktiderman\/genesis\/\.github\/workflows\/([\w.-]+\.ya?ml)@/g)].map((m) => m[1]!))];
}

/**
 * A workflow file's Genesis callers (only those of `only`, when given) moved to `pin`; the text
 * unchanged when it calls none. Never backwards: a caller that already names a later release (the
 * repository's maintainer, or another app in it, moved it on) keeps its pin.
 */
export function bumpCallerPins(text: string, pin: ReleasePin, only?: readonly string[]): string {
  return text.replace(CALLER_PIN, (all, head: string, _sha: string, mid: string, version: string) => {
    const name = /workflows\/([\w.-]+\.ya?ml)@$/.exec(head)?.[1];
    if (only && (!name || !only.includes(name))) return all;
    if (version !== "X.Y.Z" && compareVersions(version, pin.version) > 0) return all;
    return `${head}${pin.sha}${mid}${pin.version}`;
  });
}

/** The commit a Genesis release is tagged at (`@marktiderman/genesis@<version>`), from the repository, or null. */
export function lookupPin(version: string, repo = "https://github.com/marktiderman/genesis"): ReleasePin | null {
  if (!VERSION.test(version)) return null;
  try {
    const out = execFileSync("git", ["ls-remote", repo, `refs/tags/@marktiderman/genesis@${version}^{}`, `refs/tags/@marktiderman/genesis@${version}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 });
    // An annotated tag lists its commit on the ^{} line; a lightweight one only the plain line.
    const lines = out.trim().split("\n").filter(Boolean);
    const sha = (lines.find((l) => l.endsWith("^{}")) ?? lines[0])?.split(/\s+/)[0];
    return sha && SHA.test(sha) ? { sha, version } : null;
  } catch {
    return null;
  }
}

/** An EAS environment's name as the lane writes it into the workflows. */
const EAS_ENVIRONMENT_NAME = /^[A-Za-z0-9_-]+$/;

type EasProfile = { extends?: string; environment?: unknown; distribution?: unknown; developmentClient?: unknown; ios?: Record<string, unknown>; android?: Record<string, unknown> };

/**
 * The EAS environment a build of `profile` reads, as eas-cli 26 resolves it: the profile's
 * `environment` (along `extends`, a platform's over the common one), else by its distribution:
 * `store` (the default) → production, a development client → development, anything else → preview.
 * Null when eas.json or the profile can't be read; throws when its `environment` isn't a plain name. The same rule as the release script's
 * profileEnvironment, which checks it again before every release.
 */
export function easProfileEnvironment(root: string, profile: string, platform: "ios" | "android"): string | null {
  let build: Record<string, EasProfile>;
  try {
    build = (JSON.parse(readFileSync(path.join(root, "eas.json"), "utf8")) as { build?: Record<string, EasProfile> }).build ?? {};
  } catch {
    return null;
  }
  const chain: EasProfile[] = [];
  for (let name: string | undefined = profile; name !== undefined; name = build[name]?.extends) {
    const own = build[name];
    if (!own || chain.includes(own)) return null;
    chain.push(own);
  }
  // As eas-json merges a profile: the whole chain first, then the platform section over the common
  // one, so a platform value anywhere along `extends` wins over any common one.
  const field = (key: "environment" | "distribution" | "developmentClient"): unknown => {
    const own = chain.find((p) => p[platform]?.[key] !== undefined);
    return own ? own[platform]![key] : chain.find((p) => p[key] !== undefined)?.[key];
  };
  const environment = field("environment");
  if (environment !== undefined) {
    // It goes into the workflows as a name: anything else is refused, not written.
    if (typeof environment !== "string" || !EAS_ENVIRONMENT_NAME.test(environment)) {
      throw new Error(`eas.json build.${profile} has an environment that isn't a plain EAS environment name (letters, digits, _ and -): ${JSON.stringify(environment)}. Fix it, or set genesis.config.json release.easEnvironment.`);
    }
    return environment;
  }
  return (field("distribution") ?? "store") === "store" ? "production" : field("developmentClient") === true ? "development" : "preview";
}

/**
 * The app's URL scheme from app.json (`expo.scheme`) when that is the whole config, or null. With
 * an app.config.* (code that can change the scheme), nothing is frozen into the workflow: its
 * publish step resolves the effective config instead. release.previews.scheme always wins.
 */
export function appScheme(root: string): string | null {
  if (["app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"].some((f) => existsSync(path.join(root, f)))) return null;
  try {
    const json = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")) as { expo?: { scheme?: unknown } };
    const scheme = Array.isArray(json.expo?.scheme) ? json.expo?.scheme[0] : json.expo?.scheme;
    // The same rule as release.previews.scheme: it's rendered into the workflow, so nothing else gets through.
    return typeof scheme === "string" && /^[a-z][a-z0-9+.-]*$/.test(scheme) ? scheme : null;
  } catch {
    return null;
  }
}

/** Where the app sits in its git repository ("mobile"), or null at its root or outside git. */
export function folderInRepository(root: string): string | null {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const rel = path.relative(realpathSync(top), realpathSync(root)).split(path.sep).join("/");
    return rel && !rel.startsWith("..") ? rel : null;
  } catch {
    return null;
  }
}

/** The fingerprint's own config files: written into an app that already builds, they change its runtime version. */
const FINGERPRINT_TEMPLATES = new Set(["expo/fingerprint.config.js", "expo/.fingerprintignore"]);
const FINGERPRINT_CONFIGS = ["fingerprint.config.js", "fingerprint.config.cjs", "fingerprint.config.mjs", ".fingerprintignore"];

/** EAS Workflows takes a workflow file of 16 KiB at most (docs.expo.dev/eas/workflows/syntax, "Workflow files"). */
export const EAS_WORKFLOW_MAX_BYTES = 16 * 1024;

/** Whether the app's pr-preview.yml has a job reading the release's EAS environment (previews before ADR 0026's split). */
export function previewsInReleaseEnvironment(root: string, ctx: ReleaseContext): boolean {
  const text = readApp(root, ".eas/workflows/pr-preview.yml");
  if (text === null) return false;
  const jobs = parseWorkflow(text)?.jobs;
  if (!jobs || typeof jobs !== "object") return false;
  return Object.values(jobs as Record<string, { environment?: unknown } | null>).some((job) => job?.environment === ctx.release.easEnvironment);
}

/** Why an app's previews stay as they are for now, or null once their own EAS environment exists. */
export function previewMoveHold(ctx: ReleaseContext, state: EasEnvironmentState | undefined): string | null {
  if (state?.state === "present") return null;
  const env = ctx.release.previews.easEnvironment;
  return `kept as it is, so previews keep running: the new pr-preview.yml runs on the Preview label only, in the EAS environment "${env}", and ${state ? state.why : "that environment wasn't checked"}. Meanwhile a pull request's code reads the release's environment (genesis doctor: preview-environment). To move: (1) create the EAS environment "${env}" on expo.dev (the project's environment variables) with the release environment's plain values (APP_VARIANT, the EXPO_PUBLIC_ ones), a robot EXPO_TOKEN${ctx.release.sentry ? " and SENTRY_AUTH_TOKEN" : ""}, and nothing else; (2) create the label Preview in GitHub; (3) run this again with EXPO_TOKEN set or after eas login, so the environment can be checked`;
}

/** Whether the app has the GitHub lane's native-release.yml (in genesis.lock.json, or the file itself). */
export function githubLaneInPlace(root: string, appFolder: string | null): boolean {
  try {
    if (readLock(root).files[NATIVE_RELEASE_PATH]) return true;
  } catch {
    // An unreadable lock: the file decides.
  }
  return existsSync(path.join(appFolder ? repositoryRoot(root, appFolder) : root, NATIVE_RELEASE_PATH));
}

/** The release context for an app: its `release` block with the defaults, and its folder. */
export function releaseContext(root: string, planned?: Record<string, unknown>): ReleaseContext {
  // `planned`: the genesis.config.json a command is about to write (a dry run plans with it).
  const config = planned ? parseGenesisConfig(planned, "genesis.config.json (planned)") : readGenesisConfig(root);
  const set = config?.release ?? {};
  const detected = detectPackageManager(root);
  // Unset, the EAS environment is the one the profile's builds read (eas.json), not its name.
  const profile = set.profile ?? "production";
  const built = set.easEnvironment ? null : easProfileEnvironment(root, profile, (set.platforms?.[0] as "ios" | "android" | undefined) ?? "ios");
  return {
    release: resolveRelease(
      {
        ...(built ? { easEnvironment: built } : {}),
        // Unset, an app whose releases already start on GitHub stays there: the move to EAS's
        // trigger is the app's choice (release.trigger "eas"), never a side effect of an upgrade.
        ...(set.trigger ? { trigger: set.trigger } : githubLaneInPlace(root, config?.appFolder ?? null) ? { trigger: "github" as const } : {}),
        ...(set.failureEmails ? { failureEmails: set.failureEmails } : {}),
        ...(set.platforms ? { platforms: set.platforms } : {}),
        ...(set.environment ? { environment: set.environment } : {}),
        ...(set.paths ? { paths: set.paths } : {}),
        // Unset, Sentry follows the observability block: a configured Sentry project uploads source maps.
        ...(set.sentry !== undefined ? { sentry: set.sentry } : sentryProject(config) ? { sentry: true } : {}),
        ...(set.pushHook ? { pushHook: set.pushHook } : {}),
        ...(set.profile ? { profile: set.profile } : {}),
        ...(set.channel ? { channel: set.channel } : {}),
        ...(set.easEnvironment ? { easEnvironment: set.easEnvironment } : {}),
        ...(set.packageManager ? { packageManager: set.packageManager } : {}),
        ...(set.runtimeVersion && set.runtimeVersion !== "fingerprint" ? { runtimeCommand: set.runtimeVersion.command } : {}),
        ...(set.previews || appScheme(root) ? { previews: { origin: set.previews?.origin ?? "", scheme: set.previews?.scheme ?? appScheme(root) ?? "", branches: set.previews?.branches ?? [], everyPullRequest: set.previews?.everyPullRequest ?? false, easEnvironment: set.previews?.easEnvironment ?? "preview-release" } } : {}),
      },
      detected as ReleasePackageManager,
    ),
    appFolder: config?.appFolder ?? null,
  };
}

export interface RenderOptions {
  release: ReleaseContext;
  substitutions?: Record<string, string> | undefined;
  pin?: ReleasePin | null | undefined;
}

/** A template's text as the app has it at `target` (see the file's comment for the order). */
export function renderTemplate(target: string, raw: string, options: RenderOptions): string {
  const folder = options.release.appFolder;
  // Substitutions first: they rename the starter's own text, never a value the app's `release`
  // block renders in (a path or a secret name that happens to hold a starter name stays as written).
  const text = renderPin(renderRelease(substitute(raw, folderSubstitutions(options.substitutions, folder)), options.release), options.pin);
  return renderOwned(target, text, folder);
}

/**
 * Templates that moved, by their old path under templates/. The release lane's EAS workflows moved
 * when they took the release markup: a previous genesis-cli refreshing an app from these templates
 * finds nothing at the old path ("gone upstream") and leaves the app's file as it is, instead of
 * writing unrendered markup or the dispatch-only lane over it. This CLI maps the lock over.
 */
export const MOVED_TEMPLATES: Readonly<Record<string, string>> = {
  "eas/workflows/deploy-production.yml": "release/deploy-production.yml",
  "eas/workflows/pr-preview.yml": "release/pr-preview.yml",
};

/** A lock source with a moved template's path brought to the new one; others unchanged. */
export function currentSource(source: string): string {
  const m = /^(@marktiderman\/genesis-cli:templates\/)(.+)$/.exec(source);
  const moved = m ? MOVED_TEMPLATES[m[2]!] : undefined;
  return moved ? `${m![1]}${moved}` : source;
}

/** Workflows that are Genesis's alone: with `appFolder`, written and refreshed at the repository's root. */
export const DEDICATED_WORKFLOWS: ReadonlySet<string> = new Set([".github/workflows/native-release.yml", ".github/workflows/pr-preview-teardown.yml"]);

export const isDedicatedWorkflow = (rel: string) => DEDICATED_WORKFLOWS.has(rel);

/** The repository's root for an app in `appFolder`. */
export function repositoryRoot(root: string, appFolder: string): string {
  return path.resolve(root, ...appFolder.split("/").map(() => ".."));
}

/** The folder a lock entry's file is read from and written to: the repository's root for any workflow under `appFolder`. */
export function ownedDir(root: string, rel: string, appFolder: string | null): string {
  return appFolder && rel.startsWith(".github/workflows/") ? repositoryRoot(root, appFolder) : root;
}

/**
 * The template sets `genesis add template` takes, by name. A set's templates are written together;
 * any single template is named by its path under templates/ (`eas/workflows/rollout.yml`).
 */
export const TEMPLATE_SETS: Readonly<Record<string, { summary: string; templates: readonly string[] }>> = {
  release: {
    summary: "the native release lane: deploy-production.yml and pr-preview.yml (EAS), its script, the fingerprint config, and native-release.yml (GitHub) only with release.trigger github",
    templates: ["ci/native-release.yml", "release/deploy-production.yml", "release/pr-preview.yml", "ci/pr-preview-teardown.yml", "eas/scripts/native-release.mjs", "expo/fingerprint.config.js", "expo/.fingerprintignore"],
  },
  previews: {
    summary: "pull request previews alone, for an app that ships its releases another way: pr-preview.yml (EAS), pr-preview-teardown.yml (GitHub), the script pr-preview.yml runs, the fingerprint config",
    templates: ["release/pr-preview.yml", "ci/pr-preview-teardown.yml", "eas/scripts/native-release.mjs", "expo/fingerprint.config.js", "expo/.fingerprintignore"],
  },
  "agentic-ci": {
    summary: "Agentic CI: agentic-ci.yml (EAS), on the Agent check label or by hand, where a coding agent tests a pull request on an Expo Simulators session (and runs the app's Maestro flows there) and comments its verdict, with the scripts and prompt in .eas/agents",
    templates: ["release/agentic-ci.yml", "eas/agents/"],
  },
  eas: { summary: "eas.json and every EAS workflow and script (Agentic CI only with its own set)", templates: ["eas/", "release/"] },
  expo: { summary: "the fingerprint config and .fingerprintignore", templates: ["expo/"] },
  maestro: { summary: "the Maestro smoke flows", templates: ["maestro/"] },
  ci: { summary: "app CI, Claude review and the weekly Genesis upgrade (GitHub)", templates: ["ci/app-ci.yml", "ci/claude-review.yml", "ci/genesis-upgrade.yml"] },
  database: { summary: "the database CI (GitHub)", templates: ["ci/supabase-ci.yml"] },
  vercel: { summary: "Vercel's preview gate (vercel.json and scripts/vercel-ignore-build.sh)", templates: ["vercel/"] },
};

/** Every template under templates/, relative. */
export function allTemplates(dir = templatesDir()): string[] {
  return walk(dir);
}

/** The templates `names` (sets or template paths) stand for, in order, without repeats. */
/**
 * Template sets an app gets only by naming them (`genesis add template agentic-ci`): never offered
 * as missing, and never part of a broader set such as eas. Agentic CI's runs are billed (a session,
 * a repack and an agent's tokens).
 */
export const OPT_IN_SETS: readonly string[] = ["agentic-ci"];

export function resolveTemplateNames(names: readonly string[], dir = templatesDir()): string[] {
  const all = allTemplates(dir);
  const out: string[] = [];
  for (const name of names) {
    const set = TEMPLATE_SETS[name];
    const patterns = set ? set.templates : [name.replace(/^templates\//, "")];
    // A folder pattern of another set (eas's eas/ and release/) never takes an opt-in template.
    const optIn = (t: string) => OPT_IN_SETS.some((o) => o !== name && TEMPLATE_SETS[o]!.templates.some((q) => (q.endsWith("/") ? t.startsWith(q) : t === q)));
    for (const p of patterns) {
      const hits = p.endsWith("/") ? all.filter((t) => t.startsWith(p) && !(set && optIn(t))) : all.filter((t) => t === p);
      if (!hits.length) throw new Error(`"${name}" isn't a template set (${Object.keys(TEMPLATE_SETS).join(", ")}) or a template under templates/ (genesis add template --list)`);
      for (const h of hits) if (!out.includes(h)) out.push(h);
    }
  }
  return out;
}

export type AdoptOutcome = "created" | "adopted" | "updated" | "unchanged" | "next" | "replaced" | "pending" | "held" | "removed";

const NATIVE_RELEASE = "ci/native-release.yml";
/** The GitHub release workflow, where the lane keeps it (the repository's .github/workflows). */
export const NATIVE_RELEASE_PATH = ".github/workflows/native-release.yml";
/** The workflow native-release.yml starts on EAS (`eas workflow:run`): the lane needs it, so it's never a file to remove. */
export const LANE_DISPATCH_TARGET = ".eas/workflows/deploy-production.yml";
const DEPLOY_PRODUCTION = "release/deploy-production.yml";

/** The GitHub release workflow in an app whose release.trigger is "eas": none, Genesis's own (unedited, so it can go), or one to keep. */
export type GithubLaneState = { state: "absent" } | { state: "removable"; text: string } | { state: "kept"; why: string };

/**
 * Whether the app's native-release.yml can be retired for EAS's push trigger: it is Genesis's
 * text unedited (its lock checksum, or the GitHub lane's render of today's template), or `replace`
 * says to write over the app's files (the old text is in git). Anything else is the app's, and
 * kept: the release then stays on GitHub until the app removes it or sets release.trigger "github".
 */
export function githubLaneState(root: string, options: { replace?: boolean; dir?: string; substitutions?: Record<string, string>; pin?: ReleasePin | null; config?: Record<string, unknown> } = {}): GithubLaneState {
  const ctx = releaseContext(root, options.config);
  const where = ownedDir(root, NATIVE_RELEASE_PATH, ctx.appFolder);
  const mine = readApp(where, NATIVE_RELEASE_PATH);
  if (mine === null) return { state: "absent" };
  // Edits are checked first: an edited one is kept whatever its trigger (a dispatch-only or
  // scheduled copy the app made is the app's).
  const entry = readLock(root).files[NATIVE_RELEASE_PATH];
  if (options.replace || (entry && sha256(mine) === entry.sha256)) return { state: "removable", text: mine };
  try {
    const raw = readFileSync(path.join(options.dir ?? templatesDir(), NATIVE_RELEASE), "utf8");
    const github = { ...ctx, release: { ...ctx.release, trigger: "github" as const } };
    if (renderTemplate(NATIVE_RELEASE_PATH, raw, { release: github, substitutions: options.substitutions, pin: options.pin ?? null }) === mine) return { state: "removable", text: mine };
  } catch {
    // No template to compare with: the app's copy is kept.
  }
  return { state: "kept", why: entry ? "it has your edits" : "it isn't in genesis.lock.json, so it may be your own" };
}

/**
 * Why moving an app from GitHub's trigger to EAS's must wait, or null. The move removes the
 * GitHub lane, so it needs what replaces it confirmed first: the EAS project's GitHub link (EAS's
 * push trigger starts nothing without it), and with a release hook, RELEASE_GITHUB_TOKEN listed in
 * pushHook.secrets (stored as an EAS secret: the hook loses the GitHub run's own token).
 */
export function moveToEasHold(ctx: ReleaseContext, link: GithubLink | undefined): string | null {
  const steps: string[] = [];
  if (!link || link.state !== "linked") steps.push(`EAS Workflows' push trigger needs the repository linked to the EAS project, and ${link ? link.why : "the link wasn't checked"}: ${linkSteps(ctx.appFolder)}`);
  const hook = ctx.release.pushHook;
  if (hook && !hook.secrets.includes(RELEASE_GITHUB_TOKEN)) {
    steps.push(`the release hook (${hook.script}) would lose GitHub's run token on EAS: create a fine-grained GitHub token (this repository, Pull requests: read), store it as the EAS secret RELEASE_GITHUB_TOKEN in the environment "${ctx.release.easEnvironment}", and add "RELEASE_GITHUB_TOKEN" to genesis.config.json release.pushHook.secrets`);
  }
  return steps.length ? `not moved to EAS's trigger yet (releases stay on GitHub until then): ${steps.join("; and ")}` : null;
}

export interface AdoptResult {
  template: string;
  /** App-relative path (the lock's key). */
  path: string;
  /** Where it was written, relative to the app (`../.github/workflows/…` for the repository's). */
  location: string;
  outcome: AdoptOutcome;
  detail?: string;
}

export interface AdoptOptions {
  dryRun?: boolean;
  /** Write over the app's file (after its choices moved to genesis.config.json): the old text is in git. */
  replace?: boolean;
  /** The release the CI callers pin; null leaves `GENESIS_SHA`. */
  pin?: ReleasePin | null;
  /**
   * Write native-release.yml even while another workflow still releases on push (the app removes it
   * in the same change). Without it, native-release.yml is held back then. Never while the rival is
   * the app's own push-triggered deploy-production.yml, the file native-release.yml dispatches to:
   * that one is merged into the lane's version (its .genesis-next), and native-release.yml stays held
   * until it is.
   */
  replaceRival?: boolean;
  /** The CLI version recorded in the lock. */
  version?: string;
  dir?: string;
  /** The genesis.config.json the command is about to write (its appFolder, release.trigger), to plan with in a dry run. */
  config?: Record<string, unknown>;
  /** Whether the previews' own EAS environment exists (eas-link.ts); unset holds an old pr-preview.yml's refresh. */
  previewEnvironment?: EasEnvironmentState;
  /** The EAS project's GitHub link, checked online (eas-link.ts) before an app's GitHub lane is retired; unset holds the move. */
  githubLink?: GithubLink;
}

/**
 * Write templates into an app and record them in genesis.lock.json.
 *
 * - Not in the lock: written when missing; adopted when the app's file already has the same text;
 *   otherwise the new text goes to `<file>.genesis-next` for the app to merge (never written over),
 *   and the lock records it as pending, so the next upgrade merges against it.
 * - In the lock (the app has it already): written again with the current genesis.config.json while
 *   the app hasn't edited it; an edited one gets `.genesis-next`. So after changing `release`,
 *   `genesis add template release` applies it.
 * - `replace`: the app's file is written over, and a `.genesis-next` beside it removed.
 * - native-release.yml is written last, and held back while another workflow still releases on
 *   push (the app's own deploy-production.yml, kept with the new text in .genesis-next, or a GitHub
 *   workflow running `eas update`): together they would publish every release twice. `replaceRival`
 *   writes it anyway beside other rivals, for an app removing them in the same change; never
 *   beside the app's own push-triggered deploy-production.yml, which it dispatches to and which is
 *   merged, not removed.
 */
export function adoptTemplates(root: string, templates: readonly string[], options: AdoptOptions = {}): AdoptResult[] {
  const dir = options.dir ?? templatesDir();
  const lock = readLock(root);
  const ctx = releaseContext(root, options.config);
  const appFolder = ctx.appFolder;
  // Whether the app already builds: read before this run writes an eas.json of its own.
  const alreadyBuilds = existsSync(path.join(root, "eas.json"));
  const results: AdoptResult[] = [];
  // release.trigger "eas" (the default): deploy-production.yml takes the push trigger, and the
  // GitHub lane's native-release.yml goes, both in this run or neither. Held while anything else
  // still releases on push (the two lanes would publish each release twice), unless --replace-rival
  // says the app removes those in the same change; never beside a native-release.yml with the app's
  // edits, which this command doesn't delete.
  const easLane = ctx.release.trigger === "eas";
  let easHold: string | null = null;
  let dispatcher: GithubLaneState = { state: "absent" };
  if (easLane && templates.includes(DEPLOY_PRODUCTION)) {
    dispatcher = githubLaneState(root, { ...(options.replace ? { replace: true } : {}), ...(options.config ? { config: options.config } : {}), dir, ...(lock.substitutions ? { substitutions: lock.substitutions } : {}), pin: options.pin ?? null });
    const others = [...githubReleaseWorkflows(root, appFolder), ...pushTriggeredEasWorkflows(root).filter((rel) => rel !== LANE_DISPATCH_TARGET)];
    const live = dispatcher.state !== "absent" && hasPushTrigger(readApp(ownedDir(root, NATIVE_RELEASE_PATH, appFolder), NATIVE_RELEASE_PATH) ?? "");
    // Kept with the app's edits while it still starts releases, or Genesis's but not retired by this run (the eas set alone).
    const nativeStays = live && (dispatcher.state === "kept" || !templates.includes(NATIVE_RELEASE));
    if (nativeStays) {
      easHold = `not written: ${NATIVE_RELEASE_PATH} still starts each release from GitHub${dispatcher.state === "kept" ? ` and ${dispatcher.why}` : ""}, and beside a push-triggered deploy-production.yml each release would go out twice. ${dispatcher.state === "kept" ? "Remove it in this change (or run with --replace), or set genesis.config.json release.trigger to \"github\" to keep releasing from GitHub, then run this again" : "Adopt the whole lane with `genesis add template release`, which retires it"}`;
    } else if (others.length && !options.replaceRival) {
      easHold = `not written: ${others.join(", ")} still release${others.length === 1 ? "s" : ""} on every push, and both lanes would publish each release. Remove ${others.length === 1 ? "it" : "them"}, then run this again; or, to write deploy-production.yml now, run it with --replace-rival and remove ${others.length === 1 ? "that workflow" : "those workflows"} in the same change`;
    } else if (live) {
      // Retiring a live GitHub lane: only once what replaces it is confirmed.
      easHold = moveToEasHold(ctx, options.githubLink);
    }
  }
  // The GitHub workflow goes last either way: written after the rest with GitHub's trigger, and
  // with EAS's retired only once deploy-production.yml has taken the push trigger in this run.
  const ordered = [...templates.filter((t) => t !== NATIVE_RELEASE), ...templates.filter((t) => t === NATIVE_RELEASE)];
  for (const template of ordered) {
    if (easLane && template === NATIVE_RELEASE) {
      const location = path.relative(root, path.join(ownedDir(root, NATIVE_RELEASE_PATH, appFolder), NATIVE_RELEASE_PATH)).split(path.sep).join("/");
      if (!templates.includes(DEPLOY_PRODUCTION)) {
        results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "held", detail: "not written: genesis.config.json release.trigger is \"eas\", so EAS Workflows starts each release (deploy-production.yml's push trigger). Set release.trigger to \"github\" to release from GitHub Actions instead" });
        continue;
      }
      if (dispatcher.state === "absent") {
        if (lock.files[NATIVE_RELEASE_PATH]) {
          delete lock.files[NATIVE_RELEASE_PATH];
          results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "removed", detail: "already gone; dropped from genesis.lock.json" });
        }
        continue;
      }
      if (easHold) {
        results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "held", detail: "kept: releases stay on GitHub until deploy-production.yml can take the push trigger (below)" });
        continue;
      }
      // deploy-production.yml must have taken the push trigger first: left in a .genesis-next (or
      // pending), removing this would leave a merge starting nothing.
      const deploy = results.find((r) => r.path === LANE_DISPATCH_TARGET);
      const taken = deploy && ["created", "adopted", "updated", "unchanged", "replaced"].includes(deploy.outcome) && (options.dryRun || hasPushTrigger(readApp(root, LANE_DISPATCH_TARGET) ?? ""));
      if (!taken) {
        results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "held", detail: "kept: deploy-production.yml hasn't taken the push trigger yet (its new text waits to be merged): merge it, then run this again, which retires this file" });
        continue;
      }
      if (dispatcher.state === "kept") {
        // No push trigger, so it releases nothing beside deploy-production.yml; but it's the app's, so it stays.
        results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "held", detail: `kept: ${dispatcher.why}, so it isn't removed; it has no push trigger, so it doesn't release beside deploy-production.yml. Remove it yourself when you no longer need it` });
        continue;
      }
      if (!options.dryRun) rmSync(path.join(ownedDir(root, NATIVE_RELEASE_PATH, appFolder), NATIVE_RELEASE_PATH));
      delete lock.files[NATIVE_RELEASE_PATH];
      results.push({ template, path: NATIVE_RELEASE_PATH, location, outcome: "removed", detail: "release.trigger is \"eas\": deploy-production.yml now starts each release on EAS, so the GitHub lane is retired (the old text is in git)" });
      continue;
    }
    if (easLane && template === DEPLOY_PRODUCTION && easHold) {
      results.push({ template, path: LANE_DISPATCH_TARGET, location: LANE_DISPATCH_TARGET, outcome: "held", detail: easHold });
      continue;
    }
    if (!easLane && template === NATIVE_RELEASE) {
      // In a dry run nothing was written: a workflow this run would write anew isn't a rival.
      const rewritten = (rel: string) => results.some((r) => r.path === rel && ["created", "updated", "replaced"].includes(r.outcome));
      const easRivals = pushTriggeredEasWorkflows(root).filter((rel) => !(options.dryRun && rewritten(rel)));
      const githubRivals = githubReleaseWorkflows(root, appFolder);
      const rivals = [...githubRivals, ...easRivals];
      // The app's own deploy-production.yml is the file native-release.yml dispatches to: it is
      // merged into the lane's version, never removed, so --replace-rival doesn't pass over it.
      const own: string[] = easRivals.filter((rel) => rel === LANE_DISPATCH_TARGET);
      const others = rivals.filter((rel) => !own.includes(rel));
      if (own.length || (others.length && !options.replaceRival)) {
        const fix = [
          // This run writes deploy-production.yml's .genesis-next only when it adopts that template too.
          ...(own.length
            ? [templates.includes(DEPLOY_PRODUCTION) ? "merge the .genesis-next beside deploy-production.yml (or move your edits into genesis.config.json and run again with --replace)" : "adopt the lane's deploy-production.yml with `genesis add template release` (it puts the new text in a .genesis-next beside yours to merge)"]
            : []),
          ...(others.length ? [`remove ${others.join(", ")}`] : []),
        ];
        // The flag is a way out only when the other rivals are all that hold it: with the app's own
        // deploy-production.yml still releasing on push, --replace-rival would be held again.
        const now = others.length && !own.length && !options.replaceRival ? `; or, to write native-release.yml now, run it with --replace-rival and remove ${others.length === 1 ? "that workflow" : "those workflows"} in the same change` : "";
        results.push({ template, path: ".github/workflows/native-release.yml", location: ".github/workflows/native-release.yml", outcome: "held", detail: `not written: ${rivals.join(", ")} still release${rivals.length === 1 ? "s" : ""} on every push, and both lanes would publish each release. ${fix.join(" and ").replace(/^./, (c) => c.toUpperCase())}, then run this again${now}` });
        continue;
      }
    }
    const raw = readFileSync(path.join(dir, template), "utf8");
    const target = templateTarget(template, raw);
    // GitHub reads workflows only from the repository's root: in an app below it with no appFolder
    // set, one written here would never run.
    if (!appFolder && target.startsWith(".github/workflows/")) {
      const below = folderInRepository(root);
      if (below) {
        results.push({ template, path: target, location: target, outcome: "held", detail: `not written: this app is in ${below}/ of its repository, and GitHub reads workflows only from the repository's root. Set "appFolder": "${below}" in genesis.config.json (genesis add template does it for you), then run this again` });
        continue;
      }
    }
    // Previews moved to the Preview label and an EAS environment of their own: an app whose
    // pr-preview.yml still runs in the release's environment keeps it until that environment exists,
    // so its previews never stop silently.
    if (template === "release/pr-preview.yml" && !options.replace && previewsInReleaseEnvironment(root, ctx)) {
      const hold = previewMoveHold(ctx, options.previewEnvironment);
      if (hold) {
        results.push({ template, path: target, location: target, outcome: "held", detail: hold });
        continue;
      }
    }
    // A fingerprint config the app never had changes what its runtime version hashes: every build it
    // has made stops taking updates until the next store build. Only on purpose (--replace).
    if (FINGERPRINT_TEMPLATES.has(template) && !lock.files[target] && !options.replace && readApp(root, target) === null) {
      // The app's own: not one Genesis wrote (this run's fingerprint.config.js beside its .fingerprintignore).
      const others = FINGERPRINT_CONFIGS.filter((f) => f !== target && !lock.files[f] && existsSync(path.join(root, f)));
      if (others.length || alreadyBuilds) {
        results.push({ template, path: target, location: target, outcome: "held", detail: `not written: ${others.length ? `the app has ${others.join(", ")}, and` : "the app already builds (eas.json), and"} ${target} would change its runtime version, so installed builds stop taking updates until the next store build. Write it with --replace when a store build is due${others.length ? ` (and merge ${others.join(", ")} into it)` : ""}` });
        continue;
      }
    }
    if (!easLane && template === DEPLOY_PRODUCTION && !templates.includes(NATIVE_RELEASE)) {
      // The dispatch-only lane over an app's push-triggered one, with nothing to start it
      // (native-release.yml isn't written here, and the app has none): merges would stop releasing.
      const current = readApp(root, target);
      const dispatcher = readApp(ownedDir(root, ".github/workflows/native-release.yml", appFolder), ".github/workflows/native-release.yml");
      if (current !== null && dispatcher === null && hasPushTrigger(current) && hasReleaseJob(current)) {
        results.push({ template, path: target, location: target, outcome: "held", detail: "kept as it is: it releases on every push, and the new one only runs when native-release.yml starts it, which this set doesn't write. Adopt the whole lane with `genesis add template release`" });
        continue;
      }
    }
    const text = renderTemplate(target, raw, { release: ctx, substitutions: lock.substitutions, pin: options.pin ?? null });
    // EAS refuses a workflow file over 16 KiB: never write one it would refuse.
    if (target.startsWith(".eas/workflows/") && Buffer.byteLength(text) > EAS_WORKFLOW_MAX_BYTES) {
      results.push({ template, path: target, location: target, outcome: "held", detail: `not written: it renders to ${Buffer.byteLength(text)} bytes, over EAS's 16 KiB limit for a workflow file. Shorten genesis.config.json release.paths or release.runtimeVersion's command` });
      continue;
    }
    const where = ownedDir(root, target, appFolder);
    const location = path.relative(root, path.join(where, target)).split(path.sep).join("/");
    const mine = readApp(where, target);
    const entry = lock.files[target];
    const source = `${CLI_PACKAGE}:templates/${template}`;
    const record = (extra: Partial<OwnedFile> = {}) => {
      lock.files[target] = { source, sha256: sha256(text), ...(options.version ? { version: options.version } : {}), ...extra };
    };
    const write = (rel: string, content: string) => {
      if (!options.dryRun) replaceApp(where, rel, content);
    };
    const next = `${target}.genesis-next`;
    const done = (outcome: AdoptOutcome, detail?: string) => results.push({ template, path: target, location, outcome, ...(detail ? { detail } : {}) });
    if (mine === null) {
      write(target, text);
      record();
      done(entry ? "updated" : "created", entry?.deleted ? "it was marked deleted; written again" : undefined);
      continue;
    }
    if (mine === text) {
      record();
      done(entry ? "unchanged" : "adopted");
      continue;
    }
    if (options.replace || (entry && sha256(mine) === entry.sha256)) {
      write(target, text);
      if (!options.dryRun && existsSync(path.join(where, next))) rmSync(path.join(where, next));
      record();
      done(options.replace ? "replaced" : "updated", options.replace ? "your file was written over (the old text is in git)" : undefined);
      continue;
    }
    const existingNext = readApp(where, next);
    if (existingNext !== null && existingNext !== text) {
      done("pending", `${next} is already there with other text; resolve it (and delete it) first`);
      continue;
    }
    write(next, text);
    // Only the pending markers change: the checksum stays what the app's file last took, so the next
    // upgrade merges against that, not against text the app hasn't merged. A file never in the
    // lock took no Genesis text: its checksum matches nothing, so no base is assumed.
    lock.files[target] = {
      ...(entry ?? { source }),
      sha256: entry?.sha256 ?? sha256(`genesis:not-merged-yet\n${text}`),
      ...(options.version && !entry ? { version: options.version } : {}),
      pending: sha256(text),
      pendingMine: sha256(mine),
    };
    done("next", `yours differs: the new text is in ${next}. Merge it in (or move your edits into genesis.config.json and run again with --replace)`);
  }
  if (options.pin && templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/"))) lock.pin = checkPin(options.pin);
  if (!options.dryRun) writeLock(root, lock);
  return results;
}

/**
 * A branch glob (`main`, `release/*`, `**`, `m[ae]in`) as a regular expression. `*` (within a
 * segment), `**` (across them) and `[…]` (a character class) match as GitHub reads them; `?` is
 * read as any one character and `+` as itself, not as GitHub's quantifiers.
 */
export function branchGlob(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    const close = c === "[" ? glob.indexOf("]", i + 2) : -1;
    if (close > i) {
      // A class: its characters and ranges (a-z), with anything regex-special inside escaped.
      re += `[${glob.slice(i + 1, close).replace(/[\\\]^[]/g, "\\$&")}]`;
      i = close;
    } else if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += /[.+^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

interface PushFilter {
  branches?: string[] | undefined;
  ignore?: string[] | undefined;
  tags?: string[] | undefined;
}

/** Whether a push trigger with these filters runs for a push to `branch`. */
function pushFires(filter: PushFilter, branch: string): boolean {
  if (filter.ignore?.some((p) => branchGlob(p).test(branch))) return false;
  // Tags alone: a tag push, never a branch push (an empty branch list, as EAS and GitHub read it).
  if (!filter.branches) return !filter.tags;
  // GitHub's order rule: the last pattern that matches decides; `!` excludes.
  let fires = false;
  for (const p of filter.branches) {
    const negated = p.startsWith("!");
    if (branchGlob(negated ? p.slice(1) : p).test(branch)) fires = !negated;
  }
  return fires;
}

const asList = (v: unknown): string[] | undefined => (v === undefined || v === null ? undefined : (Array.isArray(v) ? v : [v]).map(String));

/** The filters of a parsed `push` value: null or {} for none. */
function filterOf(push: unknown): PushFilter {
  if (!push || typeof push !== "object") return {};
  const o = push as Record<string, unknown>;
  return { branches: asList(o.branches), ignore: asList(o.branches_ignore ?? o["branches-ignore"]), tags: asList(o.tags ?? o.tags_ignore ?? o["tags-ignore"]) };
}

/** A workflow file, parsed (YAML 1.2, so `on` is a key, not a boolean), or null when it isn't a mapping YAML can read. */
function parseWorkflow(text: string): Record<string, unknown> | null {
  try {
    // `merge`: a `<<: *defaults` merge key is read, so a filter it brings in counts (yaml v2 ignores it by default).
    const doc = parseYaml(text, { merge: true }) as unknown;
    return doc && typeof doc === "object" && !Array.isArray(doc) ? (doc as Record<string, unknown>) : null;
  } catch {
    return null; // Not a workflow EAS or GitHub would run either.
  }
}

/**
 * True when a workflow's `on:` has a `push` trigger that can fire on `branch` (default `main`): no
 * branch filter (and no tag filter, which makes it a tag push), or a `branches` pattern that
 * matches it (globs, with `!` excluding), and no `branches_ignore` (or `branches-ignore`) pattern
 * that does. A push trigger only for other branches (a preview lane on `preview`), or only for
 * tags, isn't one. Read with the `yaml` package, so every YAML form counts the same.
 */
export function hasPushTrigger(text: string, branch = "main"): boolean {
  const on = parseWorkflow(text)?.on;
  if (typeof on === "string") return on === "push";
  if (Array.isArray(on)) return on.map(String).includes("push");
  if (!on || typeof on !== "object" || !("push" in on)) return false;
  return pushFires(filterOf((on as Record<string, unknown>).push), branch);
}

/**
 * A command that releases: `eas update`, `eas build` or `eas workflow:run` (also as `eas-cli` or
 * `eas-cli@<version>`, through npx say, or by a path such as `./node_modules/.bin/eas`, quoted
 * or not), never a
 * query of the same family (`eas build:list`, `eas update:view`, …), which only reads.
 */
export const RELEASE_COMMAND = /(?:(?<=\/)|(?<![\w@.-]))eas(?:-cli(?:@[\w.-]+)?)?["']?\s+(?:update|build|workflow:run)(?![\w:-])/;

/**
 * True when a workflow (EAS) has a job of type update or build, or a custom job whose steps run a
 * release command themselves ({@link RELEASE_COMMAND}).
 */
export function hasReleaseJob(text: string): boolean {
  const jobs = parseWorkflow(text)?.jobs;
  if (!jobs || typeof jobs !== "object") return false;
  return (
    Object.values(jobs as Record<string, unknown>).some((job) => {
      const type = job && typeof job === "object" ? (job as Record<string, unknown>).type : undefined;
      return type === "update" || type === "build";
    }) || stepRuns(text).some((run) => RELEASE_COMMAND.test(run))
  );
}

/** The `run` scripts of a workflow's steps (`jobs.*.steps[].run`), parsed: what it runs, never a comment. */
export function stepRuns(text: string): string[] {
  const jobs = parseWorkflow(text)?.jobs;
  if (!jobs || typeof jobs !== "object") return [];
  return Object.values(jobs as Record<string, unknown>).flatMap((job) => {
    const steps = job && typeof job === "object" ? (job as Record<string, unknown>).steps : undefined;
    return Array.isArray(steps) ? steps.map((step) => (step && typeof step === "object" ? (step as Record<string, unknown>).run : undefined)).filter((run): run is string => typeof run === "string") : [];
  });
}

/** The app's EAS workflows that release on push: a `push` trigger and an update or build job. */
export function pushTriggeredEasWorkflows(root: string): string[] {
  const dir = path.join(root, ".eas", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => {
      const text = readFileSync(path.join(dir, f), "utf8");
      return hasPushTrigger(text) && hasReleaseJob(text);
    })
    .map((f) => `.eas/workflows/${f}`);
}

/**
 * Other workflows that publish EAS updates or start EAS runs on their own: in the repository's
 * .github/workflows, and the app's EAS workflows that release on push. Beside native-release.yml
 * they would release twice.
 */
export function competingReleaseWorkflows(root: string, appFolder: string | null): string[] {
  return [...githubReleaseWorkflows(root, appFolder), ...pushTriggeredEasWorkflows(root)];
}

/** The repository's GitHub workflows (not native-release.yml) that run a release command on a push to main. */
export function githubReleaseWorkflows(root: string, appFolder: string | null): string[] {
  const dir = path.join(appFolder ? repositoryRoot(root, appFolder) : root, ".github", "workflows");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f) && f !== "native-release.yml")
        .filter((f) => {
          // Only one that releases by itself on a push to main: a manual-only one can't double a release.
          const text = readFileSync(path.join(dir, f), "utf8");
          return hasPushTrigger(text) && stepRuns(text).some((run) => RELEASE_COMMAND.test(run));
        })
        .map((f) => `.github/workflows/${f}`)
    : [];
}

/** The lock's GitHub workflows under `appFolder` that are the repository's (not Genesis's alone). */
export function repositoryWorkflowsIn(lock: GenesisLock): string[] {
  return Object.keys(lock.files).filter((f) => f.startsWith(".github/workflows/") && !isDedicatedWorkflow(f));
}

/** Template sets an app doesn't have any of, worth naming: native ones only in a native app, the database one only with supabase/. */
export function missingTemplateSets(root: string, lock: GenesisLock, dir = templatesDir()): string[] {
  const native = ["app.json", "app.config.ts", "app.config.js", "eas.json"].some((f) => existsSync(path.join(root, f)));
  const wanted = Object.keys(TEMPLATE_SETS).filter((name) => {
    if (["release", "eas", "expo", "maestro"].includes(name)) return native;
    // Previews alone is the release lane's subset: an app offered the lane isn't offered both.
    if (name === "previews") return false;
    // Opt-in sets (Agentic CI: each run is billed) are never offered.
    if (OPT_IN_SETS.includes(name)) return false;
    if (name === "database") return existsSync(path.join(root, "supabase"));
    if (name === "vercel") return !native;
    return true;
  });
  return wanted.filter((name) => setIsMissing(root, lock, name, dir));
}

/** Whether the app lacks any of a set's templates (not in the lock, no file of its own there). */
export function setIsMissing(root: string, lock: GenesisLock, name: string, dir = templatesDir()): boolean {
  const appFolder = (() => {
    try {
      return appFolderOf(root);
    } catch {
      return null;
    }
  })();
  // With EAS's trigger (the default) the GitHub release workflow is never written: not missing.
  const githubTrigger = (() => {
    try {
      return releaseContext(root).release.trigger === "github";
    } catch {
      return false;
    }
  })();
  const templates = resolveTemplateNames([name], dir).filter((t) => githubTrigger || t !== NATIVE_RELEASE);
  return templates.some((t) => {
    const target = templateTarget(t, readFileSync(path.join(dir, t), "utf8"));
    return !lock.files[target] && readApp(ownedDir(root, target, appFolder), target) === null;
  });
}
