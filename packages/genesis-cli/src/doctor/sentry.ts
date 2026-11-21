/**
 * `cli/sentry-source-maps`: an app that reports to Sentry (an `@sentry/*` package in its
 * package.json) gets stack traces it can read, on every path its code reaches a phone or a browser.
 * Declared by genesis-cli in its package.json (`genesis.doctor.plugin`), so every Genesis app, web
 * or native, runs it; `genesis fix` applies what it can (src/fix/sentry.ts).
 *
 * One finding per missing piece (its `subject`):
 * - `metro`: a native app's Metro config without `getSentryExpoConfig` (`@sentry/react-native/metro`):
 *   bundles carry no Debug IDs, so Sentry can't match an error to its source map.
 * - `expo-plugin`: no `@sentry/react-native/expo` config plugin: EAS builds upload no source maps.
 * - `update-uploads`: a workflow with a job that publishes updates (`eas update`, an EAS `update`
 *   job) and uploads no source maps for them in that job (`sentry-expo-upload-sourcemaps`, `upload_sentry_sourcemaps: true`).
 * - `vite`: a web app's Vite config that calls no Sentry source maps plugin (`sentryVitePlugin`
 *   from `@sentry/vite-plugin`, or a framework wrapper such as `sentryTanstackStart`); an import alone
 *   doesn't count.
 *
 * An app whose genesis.config.json has `observability.sentry` with an empty organization or
 * project has said Sentry isn't set up yet: one `info` saying how to turn it on, nothing else.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { readGenesisConfig, sentryProject, type GenesisConfigFile, type GenesisSentry } from "./config.js";
import type { DoctorPlugin } from "./types.js";

export const SENTRY_RULE = "sentry-source-maps";

export type SentryPiece = "metro" | "expo-plugin" | "update-uploads" | "vite";

export interface SentryGap {
  piece: SentryPiece;
  /** App-relative (a repository workflow outside the app: relative to the app, `../.github/…`). */
  file: string;
  message: string;
}

export interface SentryState {
  /** The app has an `@sentry/*` package. */
  uses: boolean;
  /** `@sentry/react-native` is installed: the native checks run. */
  native: boolean;
  /** genesis.config.json `observability.sentry`, when it names a project. */
  project: GenesisSentry | null;
  /** `observability.sentry` is there with an empty organization or project: not set up yet. */
  placeholder: boolean;
  gaps: SentryGap[];
}

const METRO = ["metro.config.js", "metro.config.cjs", "metro.config.mjs", "metro.config.ts"];
const APP_CONFIG = ["app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs", "app.json"];
const VITE = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];
/** Packages that aren't a web SDK: native, tooling and the bundler plugins themselves. */
const NOT_WEB = new Set(["@sentry/react-native", "@sentry/cli", "@sentry/vite-plugin", "@sentry/webpack-plugin", "@sentry/esbuild-plugin", "@sentry/rollup-plugin", "@sentry/babel-plugin-component-annotate"]);
/** A Vite config that uploads source maps: the plugin, or a framework's wrapper around it, called (an import alone adds nothing to the build). */
const VITE_SENTRY = /\b(?:sentryVitePlugin|sentryTanstackStart|sentrySvelteKit|sentryReactRouter|sentrySolidStartVite|sentryAstro)\s*\(/;
/** A step that publishes an update: `eas update` (any eas-cli spelling), not `update:configure` or `update:roll-back`. */
const PUBLISHES = /\beas(?:-cli(?:@[\w.^~-]+)?)?\s+update(?![:\w-])/;
const UPDATE_JOB = /^\s*type:\s*["']?update["']?\s*$/m;
const UPLOADS = /sentry-expo-upload-sourcemaps|upload_sentry_sourcemaps:\s*true\b/;

/** Script text without comments (block, and line comments not inside a URL), for a string check. */
export function stripJsComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

/**
 * A workflow's jobs, each as its own YAML text, so an upload on one job never covers another; the
 * whole file as one when it has no `jobs` map (or doesn't parse).
 */
function jobTexts(text: string): string[] {
  try {
    const doc = parseYaml(text) as { jobs?: unknown } | null;
    if (doc && typeof doc === "object" && doc.jobs && typeof doc.jobs === "object" && !Array.isArray(doc.jobs)) {
      return Object.values(doc.jobs as Record<string, unknown>).map((job) => stringifyYaml(job ?? null));
    }
  } catch {
    // Not YAML we can read: the file as one.
  }
  return [text];
}

const stripYamlComments = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

const firstFile = (root: string, names: readonly string[]) => names.find((n) => existsSync(path.join(root, n))) ?? null;

function dependencies(root: string): string[] {
  const text = read(path.join(root, "package.json"));
  if (!text) return [];
  try {
    const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
    return [...new Set(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((k) => Object.keys(pkg[k] ?? {})))];
  } catch {
    return [];
  }
}

/** The workflow files that can publish this app's updates: its own `.eas/workflows` and `.github/workflows`, and its repository's. */
export function workflowFiles(root: string): string[] {
  const dirs = [path.join(root, ".eas", "workflows"), path.join(root, ".github", "workflows")];
  // The repository root (GitHub reads workflows only there): the nearest folder up with .git.
  for (let dir = path.resolve(root); ; ) {
    if (existsSync(path.join(dir, ".git"))) {
      if (dir !== path.resolve(root)) dirs.push(path.join(dir, ".github", "workflows"));
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const out: string[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries.sort()) if (/\.ya?ml$/.test(name)) out.push(path.join(dir, name));
  }
  return out;
}

const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

/** What the app has and lacks for readable Sentry stack traces. Reads the app; writes nothing. */
export function sentryState(root: string): SentryState {
  const deps = dependencies(root);
  const sentryDeps = deps.filter((d) => d.startsWith("@sentry/"));
  const native = sentryDeps.includes("@sentry/react-native");
  let config: GenesisConfigFile | null = null;
  try {
    config = readGenesisConfig(root);
  } catch {
    // An invalid genesis.config.json is the config rules' finding; here it reads as no block.
  }
  const project = sentryProject(config);
  const state: SentryState = { uses: sentryDeps.length > 0, native, project, placeholder: !project && config?.observability?.sentry !== undefined, gaps: [] };
  if (!state.uses || state.placeholder) return state;
  const gap = (piece: SentryPiece, file: string, message: string) => state.gaps.push({ piece, file, message });

  if (native) {
    const metro = firstFile(root, METRO);
    if (!metro) gap("metro", "metro.config.js", "no metro.config.js, so Metro uses Expo's default config and bundles carry no Debug IDs: Sentry can't match an error to its source map. Add one built on getSentryExpoConfig from @sentry/react-native/metro");
    else if (!/\bgetSentryExpoConfig\b/.test(stripJsComments(read(path.join(root, metro)) ?? ""))) {
      gap("metro", metro, `${metro} doesn't build on getSentryExpoConfig (@sentry/react-native/metro), so bundles carry no Debug IDs and Sentry can't match an error to its source map. Use it in place of getDefaultConfig, inside withNativeWind when the app has NativeWind`);
    }
    const appConfigs = APP_CONFIG.filter((n) => existsSync(path.join(root, n)));
    const hasPlugin = appConfigs.some((n) => {
      const text = read(path.join(root, n)) ?? "";
      return (n.endsWith(".json") ? text : stripJsComments(text)).includes("@sentry/react-native/expo");
    });
    if (!hasPlugin) {
      gap("expo-plugin", appConfigs[0] ?? "app.config.ts", `the Expo config has no @sentry/react-native/expo plugin, so EAS builds upload no source maps and their stack traces stay minified. Add ["@sentry/react-native/expo", { organization, project, url }]${project ? "" : " (and set genesis.config.json observability.sentry)"}`);
    }
    // release.sentry: false is the app's own choice (builds upload, updates don't): not a gap.
    const updatesOff = config?.release?.sentry === false;
    for (const file of updatesOff ? [] : workflowFiles(root)) {
      const text = stripYamlComments(read(file) ?? "");
      // Per publishing job: `ios` uploading doesn't cover `android` beside it.
      if (!jobTexts(text).some((job) => (PUBLISHES.test(job) || UPDATE_JOB.test(job)) && !UPLOADS.test(job))) continue;
      gap("update-uploads", rel(root, file), `${rel(root, file)} publishes updates with no source map upload that must succeed (an EAS update job with upload_sentry_sourcemaps unset tries it, and passes when it fails), so an update's errors can read minified with no sign of it. A Genesis release template: set genesis.config.json observability.sentry (release.sentry follows it) and run genesis add template release; your own: run npx --no sentry-expo-upload-sourcemaps dist after eas update, or set upload_sentry_sourcemaps: true on the update job`);
    }
  }

  const vite = firstFile(root, VITE);
  if (vite && sentryDeps.some((d) => !NOT_WEB.has(d)) && !VITE_SENTRY.test(stripJsComments(read(path.join(root, vite)) ?? ""))) {
    gap("vite", vite, `${vite} has no Sentry source maps plugin, so the web build's stack traces stay minified. Add sentryVitePlugin from @sentry/vite-plugin (or the framework's wrapper, such as sentryTanstackStart) with sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }, and build.sourcemap: "hidden"`);
  }
  return state;
}

const plugin: DoctorPlugin = {
  name: SENTRY_RULE,
  check(ctx) {
    const state = sentryState(ctx.root);
    if (!state.uses) return;
    if (state.placeholder) {
      ctx.report({
        rule: SENTRY_RULE,
        level: "info",
        file: "genesis.config.json",
        subject: "observability",
        message: "observability.sentry has no organization or project yet, so Sentry stack traces stay minified. Set both to turn source maps on (builds, Metro's Debug IDs, update uploads), then add SENTRY_AUTH_TOKEN",
      });
      return;
    }
    for (const g of state.gaps) ctx.report({ rule: SENTRY_RULE, level: "warn", file: g.file, subject: g.piece, message: g.message });
  },
};

export default plugin;
