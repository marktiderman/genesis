/**
 * Templates as the app has them, and adopting them into an app that doesn't have them yet.
 *
 * A template's text in an app is the template with, in order: the `release` block rendered in
 * (release-render.ts), the lock's substitutions (the starter's names, the code folder), the Genesis
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
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig } from "../doctor/config.js";
import { appFolderOf, folderSubstitutions, renderOwned } from "./app-folder.js";
import { CLI_PACKAGE } from "./discover.js";
import { readApp, replaceApp, sha256 } from "./files.js";
import { readLock, substitute, writeLock, type GenesisLock, type OwnedFile } from "./lock.js";
import { detectPackageManager } from "./pm.js";
import { renderRelease, resolveRelease, type ReleaseContext, type ReleasePackageManager } from "./release-render.js";
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

/** A workflow file's Genesis callers (only those of `only`, when given) moved to `pin`; the text unchanged when it calls none. */
export function bumpCallerPins(text: string, pin: ReleasePin, only?: readonly string[]): string {
  return text.replace(CALLER_PIN, (all, head: string, _sha: string, mid: string) => {
    const name = /workflows\/([\w.-]+\.ya?ml)@$/.exec(head)?.[1];
    if (only && (!name || !only.includes(name))) return all;
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

/** The release context for an app: its `release` block with the defaults, and its folder. */
export function releaseContext(root: string): ReleaseContext {
  const config = readGenesisConfig(root);
  const set = config?.release ?? {};
  const detected = detectPackageManager(root);
  return {
    release: resolveRelease(
      {
        ...(set.platforms ? { platforms: set.platforms } : {}),
        ...(set.environment ? { environment: set.environment } : {}),
        ...(set.paths ? { paths: set.paths } : {}),
        ...(set.sentry !== undefined ? { sentry: set.sentry } : {}),
        ...(set.pushHook ? { pushHook: set.pushHook } : {}),
        ...(set.profile ? { profile: set.profile } : {}),
        ...(set.channel ? { channel: set.channel } : {}),
        ...(set.easEnvironment ? { easEnvironment: set.easEnvironment } : {}),
        ...(set.packageManager ? { packageManager: set.packageManager } : {}),
        ...(set.runtimeVersion && set.runtimeVersion !== "fingerprint" ? { runtimeCommand: set.runtimeVersion.command } : {}),
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
  const text = renderPin(substitute(renderRelease(raw, options.release), folderSubstitutions(options.substitutions, folder)), options.pin);
  return renderOwned(target, text, folder);
}

/** Workflows that are Genesis's alone: with `appFolder`, written and refreshed at the repository's root. */
export const DEDICATED_WORKFLOWS: ReadonlySet<string> = new Set([".github/workflows/native-release.yml"]);

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
    summary: "the native release lane: native-release.yml (GitHub), deploy-production.yml and pr-preview.yml (EAS), its script, the fingerprint config",
    templates: ["ci/native-release.yml", "eas/workflows/deploy-production.yml", "eas/workflows/pr-preview.yml", "eas/scripts/native-release.mjs", "expo/fingerprint.config.js", "expo/.fingerprintignore"],
  },
  eas: { summary: "eas.json and every EAS workflow and script", templates: ["eas/"] },
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
export function resolveTemplateNames(names: readonly string[], dir = templatesDir()): string[] {
  const all = allTemplates(dir);
  const out: string[] = [];
  for (const name of names) {
    const set = TEMPLATE_SETS[name];
    const patterns = set ? set.templates : [name.replace(/^templates\//, "")];
    for (const p of patterns) {
      const hits = p.endsWith("/") ? all.filter((t) => t.startsWith(p)) : all.filter((t) => t === p);
      if (!hits.length) throw new Error(`"${name}" isn't a template set (${Object.keys(TEMPLATE_SETS).join(", ")}) or a template under templates/ (genesis add template --list)`);
      for (const h of hits) if (!out.includes(h)) out.push(h);
    }
  }
  return out;
}

export type AdoptOutcome = "created" | "adopted" | "updated" | "unchanged" | "next" | "replaced" | "pending" | "held";

const NATIVE_RELEASE = "ci/native-release.yml";

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
  /** The CLI version recorded in the lock. */
  version?: string;
  dir?: string;
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
 * - native-release.yml is written last, and held back while an EAS workflow still releases on push
 *   (the app's own deploy-production.yml, kept with the new text in .genesis-next): together they
 *   would publish every release twice.
 */
export function adoptTemplates(root: string, templates: readonly string[], options: AdoptOptions = {}): AdoptResult[] {
  const dir = options.dir ?? templatesDir();
  const lock = readLock(root);
  const ctx = releaseContext(root);
  const appFolder = ctx.appFolder;
  const results: AdoptResult[] = [];
  const ordered = [...templates.filter((t) => t !== NATIVE_RELEASE), ...templates.filter((t) => t === NATIVE_RELEASE)];
  for (const template of ordered) {
    if (template === NATIVE_RELEASE) {
      // In a dry run nothing was written: a workflow this run would write anew isn't a rival.
      const rewritten = (rel: string) => results.some((r) => r.path === rel && ["created", "updated", "replaced"].includes(r.outcome));
      const rivals = pushTriggeredEasWorkflows(root).filter((rel) => !(options.dryRun && rewritten(rel)));
      if (rivals.length) {
        results.push({ template, path: ".github/workflows/native-release.yml", location: ".github/workflows/native-release.yml", outcome: "held", detail: `not written: ${rivals.join(", ")} still releases on every push, and both would publish each release. Merge its .genesis-next (or move your edits into genesis.config.json and run again with --replace), then run this again` });
        continue;
      }
    }
    const raw = readFileSync(path.join(dir, template), "utf8");
    const target = templateTarget(template, raw);
    const text = renderTemplate(target, raw, { release: ctx, substitutions: lock.substitutions, pin: options.pin ?? null });
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
    record({ pending: sha256(text), pendingMine: sha256(mine) });
    done("next", `yours differs: the new text is in ${next}. Merge it in (or move your edits into genesis.config.json and run again with --replace)`);
  }
  if (options.pin && templates.some((t) => t.startsWith("ci/") || t.startsWith("vercel/"))) lock.pin = checkPin(options.pin);
  if (!options.dryRun) writeLock(root, lock);
  return results;
}

/** True when a workflow's top-level `on:` has a `push` trigger. */
export function hasPushTrigger(text: string): boolean {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (at < 0) return false;
  const inline = lines[at]!.replace(/^["']?on["']?\s*:/, "").replace(/#.*$/, "").trim();
  if (inline) return /(?:^|[\s,[{])push\b/.test(inline);
  let indent: number | null = null;
  for (const line of lines.slice(at + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) break;
    const own = line.length - line.trimStart().length;
    indent ??= own;
    if (own === indent && /^["']?push["']?\s*:/.test(line.trimStart())) return true;
  }
  return false;
}

/** The app's EAS workflows that release on push: a `push` trigger and an update or build job. */
export function pushTriggeredEasWorkflows(root: string): string[] {
  const dir = path.join(root, ".eas", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => {
      const text = readFileSync(path.join(dir, f), "utf8");
      return hasPushTrigger(text) && /^\s+type:\s*["']?(?:update|build)["']?\s*$/m.test(text);
    })
    .map((f) => `.eas/workflows/${f}`);
}

/**
 * Other workflows that publish EAS updates or start EAS runs on their own: in the repository's
 * .github/workflows, and the app's EAS workflows that release on push. Beside native-release.yml
 * they would release twice.
 */
export function competingReleaseWorkflows(root: string, appFolder: string | null): string[] {
  const dir = path.join(appFolder ? repositoryRoot(root, appFolder) : root, ".github", "workflows");
  const github = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f) && f !== "native-release.yml")
        .filter((f) => /\beas\s+(?:update|workflow:run|build)\b/.test(readFileSync(path.join(dir, f), "utf8")))
        .map((f) => `.github/workflows/${f}`)
    : [];
  return [...github, ...pushTriggeredEasWorkflows(root)];
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
    if (name === "database") return existsSync(path.join(root, "supabase"));
    if (name === "vercel") return !native;
    return true;
  });
  const appFolder = (() => {
    try {
      return appFolderOf(root);
    } catch {
      return null;
    }
  })();
  return wanted.filter((name) => {
    const templates = resolveTemplateNames([name], dir);
    return templates.some((t) => {
      const target = templateTarget(t, readFileSync(path.join(dir, t), "utf8"));
      return !lock.files[target] && readApp(ownedDir(root, target, appFolder), target) === null;
    });
  });
}
