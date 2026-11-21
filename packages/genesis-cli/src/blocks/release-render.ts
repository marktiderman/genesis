/**
 * The native release lane's templates, rendered with the app's `release` block
 * (genesis.config.json; docs/NATIVE-RELEASE.md, "The release block").
 *
 * The templates under `templates/` hold a small markup, all of it on YAML or JS comment lines, so
 * a template stays a valid file:
 *
 * - `#@if <cond> [<cond>…]` … `#@end`: the lines between are kept only when every condition holds
 *   (nesting allowed). A condition is `ios`, `android`, `sentry`, `pushHook`, `appFolder`,
 *   `fingerprint` (the runtime version is Expo's fingerprint), a package manager (`pnpm`, `bun`,
 *   `npm`, `yarn`), or one of these with `!` in front; `a|b` holds when either does.
 * - `#@paths`: replaced by the release's source folders (the app's folder and `paths`) as YAML list
 *   items, at its indent.
 * - `#@extra-paths`: replaced by `paths` alone, each marked `# release.paths` so the app-folder
 *   rendering (app-folder.ts) leaves them from the repository root.
 * - `#@root-install-paths`: with `appFolder`, the repository root's package.json and lockfiles (a
 *   workspace installs from there), each marked `# repository root` so app-folder.ts leaves them;
 *   nothing for an app at the root.
 * - `#@hook-secrets`: replaced by `NAME: ${{ secrets.NAME }}` for each of `pushHook.secrets`.
 * - `GENESIS_RELEASE_<NAME>` tokens: replaced by the settings' values (see {@link releaseTokens}).
 *
 * The marker lines themselves never reach the app. Rendering with the defaults gives the default
 * pipeline (the starter's copies are that render). Pure: no imports, so it can run anywhere the
 * templates are read.
 */

export type ReleasePlatform = "ios" | "android";
export type ReleasePackageManager = "pnpm" | "bun" | "npm" | "yarn";
export type ReleaseTrigger = "eas" | "github";

/** The `release` block with every default filled in. */
export interface ResolvedRelease {
  /** What starts a release on a merge to main: EAS Workflows' push trigger, or GitHub Actions. */
  trigger: ReleaseTrigger;
  platforms: ReleasePlatform[];
  environment: string;
  paths: string[];
  sentry: boolean;
  pushHook: { script: string; secrets: string[] } | null;
  profile: string;
  channel: string;
  easEnvironment: string;
  packageManager: ReleasePackageManager;
  /** A command that prints the runtime version of `$RELEASE_PLATFORM`, or null for Expo's fingerprint. */
  runtimeCommand: string | null;
  /** What a preview's links open: the web origin (universal link) and the app's scheme (QR). */
  previews: { origin: string; scheme: string };
}

/** What a template is rendered with: the resolved block and where the app sits in its repository. */
export interface ReleaseContext {
  release: ResolvedRelease;
  /** genesis.config.json `appFolder`, or null for an app at its repository's root. */
  appFolder: string | null;
}

export const RELEASE_DEFAULTS: Readonly<Omit<ResolvedRelease, "easEnvironment" | "packageManager">> = {
  // Expo's documented lane: EAS Workflows starts each release itself (docs/adr/0026).
  trigger: "eas",
  runtimeCommand: null,
  previews: { origin: "", scheme: "" },
  platforms: ["ios", "android"],
  environment: "production",
  paths: [],
  sentry: false,
  pushHook: null,
  profile: "production",
  channel: "production",
};

/** The defaults over what the app set. The package manager is the app's (its lockfile) unless set. */
export function resolveRelease(
  set: Partial<Omit<ResolvedRelease, "pushHook">> & { pushHook?: { script: string; secrets: string[] } | null } = {},
  detected: ReleasePackageManager = "pnpm",
): ResolvedRelease {
  const profile = set.profile ?? RELEASE_DEFAULTS.profile;
  return {
    trigger: set.trigger ?? RELEASE_DEFAULTS.trigger,
    platforms: set.platforms?.length ? [...set.platforms] : [...RELEASE_DEFAULTS.platforms],
    environment: set.environment ?? RELEASE_DEFAULTS.environment,
    paths: [...(set.paths ?? RELEASE_DEFAULTS.paths)],
    sentry: set.sentry ?? RELEASE_DEFAULTS.sentry,
    pushHook: set.pushHook ?? null,
    profile,
    channel: set.channel ?? RELEASE_DEFAULTS.channel,
    easEnvironment: set.easEnvironment ?? profile,
    packageManager: set.packageManager ?? detected,
    runtimeCommand: set.runtimeCommand ?? null,
    previews: { origin: set.previews?.origin ?? "", scheme: set.previews?.scheme ?? "" },
  };
}

/** The default render: both platforms, no Sentry, no hook, pnpm, an app at its repository's root. */
export const DEFAULT_RELEASE_CONTEXT: ReleaseContext = { release: resolveRelease(), appFolder: null };

/**
 * Files an app at its repository's root never ships (no path filter there, so every other change
 * counts): `on.push.paths-ignore` in native-release.yml.
 */
export const ROOT_APP_IGNORED = ["**/*.md", "docs/**", ".github/**", ".eas/**", ".maestro/**"];

/** A workspace's root files an app's install reads, in a repository with the app in a folder. */
export const ROOT_INSTALL_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "bun.lock", "bun.lockb", "yarn.lock", "package-lock.json"];

/**
 * What the app's bundle is built from, from the repository root: the app's folder, `paths`, and the
 * root's package.json and lockfiles (a workspace installs from there). Empty for an app at the
 * root: everything but {@link ROOT_APP_IGNORED}.
 */
export function releaseSourcePaths(ctx: ReleaseContext): string[] {
  if (!ctx.appFolder) return [];
  return [...[...new Set([ctx.appFolder, ...ctx.release.paths])].map((p) => `${p}/**`), ...ROOT_INSTALL_FILES];
}

/** The `GENESIS_RELEASE_*` tokens and their values. */
export function releaseTokens(ctx: ReleaseContext): Record<string, string> {
  const r = ctx.release;
  return {
    GENESIS_RELEASE_ENVIRONMENT: r.environment,
    GENESIS_RELEASE_EAS_ENVIRONMENT: r.easEnvironment,
    GENESIS_RELEASE_PROFILE: r.profile,
    GENESIS_RELEASE_CHANNEL: r.channel,
    GENESIS_RELEASE_PLATFORMS: r.platforms.join(","),
    GENESIS_RELEASE_UPDATE_PLATFORM: r.platforms.length === 2 ? "all" : r.platforms[0]!,
    GENESIS_RELEASE_WORKING_DIRECTORY: ctx.appFolder ?? ".",
    GENESIS_RELEASE_PUSH_HOOK: r.pushHook?.script ?? "",
    GENESIS_RELEASE_RUNTIME_COMMAND: r.runtimeCommand ?? "",
    GENESIS_RELEASE_PREVIEW_ORIGIN: r.previews.origin,
    GENESIS_RELEASE_PREVIEW_SCHEME: r.previews.scheme,
  };
}

function holds(cond: string, ctx: ReleaseContext): boolean {
  const negated = cond.startsWith("!");
  const name = negated ? cond.slice(1) : cond;
  const r = ctx.release;
  let value: boolean;
  switch (name) {
    case "ios":
    case "android":
      value = r.platforms.includes(name);
      break;
    case "sentry":
      value = r.sentry;
      break;
    case "pushHook":
      value = r.pushHook !== null;
      break;
    case "appFolder":
      value = ctx.appFolder !== null;
      break;
    case "githubTrigger":
      value = r.trigger === "github";
      break;
    case "fingerprint":
      value = r.runtimeCommand === null;
      break;
    case "pnpm":
    case "bun":
    case "npm":
    case "yarn":
      value = r.packageManager === name;
      break;
    default:
      throw new Error(`release template: unknown condition "${cond}" in #@if`);
  }
  return negated ? !value : value;
}

const IF = /^\s*#@if\s+(.+?)\s*$/;
const END = /^\s*#@end\s*$/;
const PATHS = /^(\s*)#@paths\s*$/;
const EXTRA_PATHS = /^(\s*)#@extra-paths\s*$/;
const ROOT_INSTALL_PATHS = /^(\s*)#@root-install-paths\s*$/;
const HOOK_SECRETS = /^(\s*)#@hook-secrets\s*$/;
/** The comment on a path item `#@extra-paths` writes: app-folder.ts leaves these as they are. */
export const EXTRA_PATH_MARK = "# release.paths";
/** The comment on a path item `#@root-install-paths` writes: from the repository root too. */
export const ROOT_PATH_MARK = "# repository root";
/** A token's name: GENESIS_RELEASE_ and capitals, never part of a longer word. */
const TOKEN = /\bGENESIS_RELEASE_[A-Z_]*[A-Z]\b/g;

/** True when the text holds release markup (a template, not a rendered copy). */
export function hasReleaseMarkup(text: string): boolean {
  return /^\s*#@(?:if|end|paths|extra-paths|root-install-paths|hook-secrets)\b/m.test(text) || /\bGENESIS_RELEASE_[A-Z_]*[A-Z]\b/.test(text);
}

/**
 * Render a template's markup with `ctx`. Text without markup comes back unchanged, so this is
 * safe to run on every template.
 */
export function renderRelease(text: string, ctx: ReleaseContext): string {
  if (!hasReleaseMarkup(text)) return text;
  const tokens = releaseTokens(ctx);
  const out: string[] = [];
  const stack: boolean[] = [];
  const keeping = () => stack.every(Boolean);
  let dropped = false;
  for (const [i, line] of text.split("\n").entries()) {
    const open = IF.exec(line);
    if (open) {
      // Every condition must hold; one written `a|b` holds when either does.
      stack.push(open[1]!.split(/\s+/).every((c) => c.split("|").some((alt) => holds(alt, ctx))));
      continue;
    }
    if (END.test(line)) {
      if (!stack.length) throw new Error(`release template: #@end without #@if on line ${i + 1}`);
      stack.pop();
      continue;
    }
    if (!keeping()) {
      dropped = true;
      continue;
    }
    const paths = PATHS.exec(line);
    if (paths) {
      for (const p of releaseSourcePaths(ctx)) out.push(`${paths[1]}- "${p}"`);
      continue;
    }
    const extra = EXTRA_PATHS.exec(line);
    if (extra) {
      for (const p of ctx.release.paths) out.push(`${extra[1]}- "${p}/**" ${EXTRA_PATH_MARK}`);
      continue;
    }
    const rootInstall = ROOT_INSTALL_PATHS.exec(line);
    if (rootInstall) {
      // From the repository root already, so app-folder.ts leaves them as they are.
      if (ctx.appFolder) for (const f of ROOT_INSTALL_FILES) out.push(`${rootInstall[1]}- "${f}" ${ROOT_PATH_MARK}`);
      continue;
    }
    const secrets = HOOK_SECRETS.exec(line);
    if (secrets) {
      // GitHub's expression, written out: "$" and "{{" apart, so nothing reads it as a template.
      for (const name of ctx.release.pushHook?.secrets ?? []) out.push(secrets[1] + name + ": $" + "{{ secrets." + name + " }}");
      continue;
    }
    out.push(
      line.replace(TOKEN, (name) => {
        const value = tokens[name];
        if (value === undefined) throw new Error(`release template: unknown token ${name} on line ${i + 1}`);
        return value;
      }),
    );
  }
  if (stack.length) throw new Error("release template: #@if without #@end");
  // A dropped block between two blank lines leaves one blank line, not two.
  return dropped ? out.join("\n").replace(/\n{3,}/g, "\n\n") : out.join("\n");
}
