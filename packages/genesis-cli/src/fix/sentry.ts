/**
 * The fix for `cli/sentry-source-maps` (src/doctor/sentry.ts), declared by genesis-cli in its
 * package.json (`genesis.doctor.fixes`). Guided: it writes what it can and lists the rest.
 *
 * Writes:
 * - genesis.config.json `observability.sentry`, from the app's own `@sentry/react-native/expo`
 *   plugin options, when the config names no project yet (release.sentry then follows it);
 * - metro.config: `getSentryExpoConfig` (`@sentry/react-native/metro`) in place of Expo's
 *   `getDefaultConfig`, everything else in the file kept (NativeWind's wrapper stays outermost);
 * - the Expo config: the `@sentry/react-native/expo` plugin with the project (app.json, or the
 *   one `plugins: [` list in app.config.*);
 * - pnpm-workspace.yaml in the app: `"@sentry/cli": true` under allowBuilds.
 *
 * Leaves to you, and says how: SENTRY_AUTH_TOKEN (a secret; never asked for here), the release
 * workflows written again (`genesis add template release`), an app's own workflows and its Vite
 * config.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig, type GenesisSentry } from "../doctor/config.js";
import { SENTRY_RULE, sentryState, stripJsComments } from "../doctor/sentry.js";
import { plannedFile } from "./engine.js";
import type { Fix, FixPlanDraft, PlannedFile } from "./types.js";

const SDK = "@sentry/react-native/expo";
const METRO = ["metro.config.js", "metro.config.cjs", "metro.config.mjs", "metro.config.ts"];
const APP_CONFIG = ["app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs", "app.json"];

const read = (root: string, rel: string) => {
  try {
    return readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
};

const indentOf = (raw: string) => /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
const json = (value: unknown, raw: string) => `${JSON.stringify(value, null, indentOf(raw))}${raw.endsWith("\n") ? "\n" : ""}`;

/**
 * A Metro config on `getSentryExpoConfig`: the import of Expo's `getDefaultConfig` swapped for
 * Sentry's, and each one-argument `getDefaultConfig(root)` call with it. Null when there is nothing
 * it can change safely (already on it, no such call, or a call with Expo's options, which
 * getSentryExpoConfig reads differently).
 */
export function withSentryMetro(code: string): string | null {
  if (/\bgetSentryExpoConfig\b/.test(stripJsComments(code))) return null;
  if (!/\bgetDefaultConfig\(\s*[\w.$]+\s*\)/.test(code) || /\bgetDefaultConfig\([^)]*,/.test(code)) return null;
  let out = code.replace(/require\((["'])expo\/metro-config\1\)\.getDefaultConfig\(/g, 'require("@sentry/react-native/metro").getSentryExpoConfig(');
  const cjs = /^([ \t]*)(const|let|var)\s*\{\s*getDefaultConfig\s*\}\s*=\s*require\((["'])expo\/metro-config\3\);?[ \t]*$/m;
  const esm = /^([ \t]*)import\s*\{\s*getDefaultConfig\s*\}\s*from\s*(["'])expo\/metro-config\2;?[ \t]*$/m;
  if (cjs.test(out)) out = out.replace(cjs, (_m, ind: string, kw: string) => `${ind}${kw} { getSentryExpoConfig } = require("@sentry/react-native/metro");`);
  else if (esm.test(out)) out = out.replace(esm, (_m, ind: string) => `${ind}import { getSentryExpoConfig } from "@sentry/react-native/metro";`);
  else if (/\bgetDefaultConfig\(/.test(out)) {
    // Imported beside other names: Sentry's import goes on the line after.
    const line = /^.*(?:require\((["'])expo\/metro-config\1\)|from\s*(["'])expo\/metro-config\2).*$/m.exec(out);
    if (!line) return null;
    const add = /^\s*import\b/.test(line[0]) ? 'import { getSentryExpoConfig } from "@sentry/react-native/metro";' : 'const { getSentryExpoConfig } = require("@sentry/react-native/metro");';
    const at = line.index + line[0].length;
    out = `${out.slice(0, at)}\n${add}${out.slice(at)}`;
  }
  out = out.replace(/\bgetDefaultConfig\(/g, "getSentryExpoConfig(");
  return out === code ? null : out;
}

/** The plugin entry, as app.config source. */
const pluginSource = (p: GenesisSentry) => `["${SDK}", { organization: ${JSON.stringify(p.organization)}, project: ${JSON.stringify(p.project)}, url: ${JSON.stringify(p.url ?? "https://sentry.io/")} }]`;

/** The Expo config with the Sentry plugin added, or null when it can't be placed safely (no single `plugins: [`). */
export function withSentryPlugin(file: string, code: string, p: GenesisSentry): string | null {
  const entry = { organization: p.organization, project: p.project, url: p.url ?? "https://sentry.io/" };
  if (file.endsWith(".json")) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(code) as Record<string, unknown>;
    } catch {
      return null;
    }
    const expo = (parsed.expo && typeof parsed.expo === "object" ? parsed.expo : parsed) as Record<string, unknown>;
    if (expo.plugins !== undefined && !Array.isArray(expo.plugins)) return null;
    expo.plugins = [...((expo.plugins as unknown[] | undefined) ?? []), [SDK, entry]];
    return json(parsed, code);
  }
  const lists = [...code.matchAll(/^([ \t]*)plugins\s*:\s*\[/gm)];
  if (lists.length !== 1) return null;
  const m = lists[0]!;
  const at = m.index! + m[0].length;
  return `${code.slice(0, at)}\n${m[1]}  ${pluginSource(p)},${code.slice(at)}`;
}

/** The project the app's own `@sentry/react-native/expo` options name, to adopt into genesis.config.json. */
export function projectFromAppConfig(root: string): GenesisSentry | null {
  for (const name of APP_CONFIG) {
    const text = read(root, name);
    if (!text) continue;
    if (name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text) as { expo?: { plugins?: unknown[] }; plugins?: unknown[] };
        for (const entry of parsed.expo?.plugins ?? parsed.plugins ?? []) {
          if (!Array.isArray(entry) || entry[0] !== SDK || !entry[1] || typeof entry[1] !== "object") continue;
          const o = entry[1] as Record<string, unknown>;
          if (typeof o.organization === "string" && typeof o.project === "string") return { organization: o.organization, project: o.project, ...(typeof o.url === "string" ? { url: o.url } : {}) };
        }
      } catch {
        // Not JSON: nothing to adopt.
      }
      continue;
    }
    const code = stripJsComments(text);
    const at = code.indexOf(SDK);
    if (at < 0) continue;
    const near = code.slice(at, at + 400);
    const value = (key: string) => new RegExp(`\\b${key}\\s*:\\s*["']([^"'\\s]+)["']`).exec(near)?.[1];
    const organization = value("organization");
    const project = value("project");
    const url = value("url");
    if (organization && project && /^[a-z0-9][a-z0-9_-]*$/.test(organization) && /^[a-z0-9][a-z0-9_-]*$/.test(project)) return { organization, project, ...(url ? { url } : {}) };
  }
  return null;
}

/** The secret step, which is always yours. */
export function tokenSteps(native: boolean, web: boolean): string {
  const lines = [
    "Add SENTRY_AUTH_TOKEN, a Sentry organization token (Settings → Auth Tokens, scope org:ci), where builds and uploads run. `genesis setup --step sentry` sets the GitHub one and checks it:",
  ];
  if (native) {
    lines.push("- each EAS environment that builds or publishes updates: `eas env:create --name SENTRY_AUTH_TOKEN --visibility secret --environment production --environment preview` (EAS takes the value only there or in the dashboard). A build or release without it fails instead of shipping unreadable stack traces;");
    lines.push("- the GitHub environment the release lane runs in (genesis.config.json release.environment, default production): `gh secret set SENTRY_AUTH_TOKEN --env production`;");
  }
  if (web) lines.push("- the web build's CI or host (Vercel: the project's environment variables), so the Vite plugin uploads; without it the plugin skips the upload (sourcemaps.disable).");
  return lines.join("\n");
}

export const sentrySourceMapsFix: Fix = {
  id: "sentry-source-maps",
  kind: "guided",
  rules: [SENTRY_RULE],
  title: "wire Sentry source maps (Metro's Debug IDs, the Expo plugin, update uploads) and list the secret step",
  plan(ctx): FixPlanDraft {
    const root = ctx.root;
    const state = sentryState(root);
    const files: PlannedFile[] = [];
    const manual: string[] = [];
    let project = state.project;

    // The project, into genesis.config.json, when the app's own plugin options already name it.
    const configText = read(root, "genesis.config.json");
    if (!project) {
      const adopted = projectFromAppConfig(root);
      if (adopted && configText !== null) {
        const parsed = JSON.parse(configText) as Record<string, unknown>;
        const observability = { ...((parsed.observability as Record<string, unknown> | undefined) ?? {}), sentry: adopted };
        files.push(plannedFile(root, "genesis.config.json", json({ ...parsed, observability }, configText), `observability.sentry from the app's own ${SDK} options: the one switch the starter, the release lane (release.sentry) and the doctor read`));
        project = adopted;
      } else {
        manual.push(`Set genesis.config.json observability.sentry to your Sentry project: { "organization": "<org slug>", "project": "<project slug>", "url": "https://sentry.io/" }. Then run genesis fix cli/sentry-source-maps again.`);
      }
    }

    const byPiece = (piece: string) => state.gaps.filter((g) => g.piece === piece);
    for (const g of byPiece("metro")) {
      const name = METRO.find((n) => existsSync(path.join(root, n)));
      const next = name ? withSentryMetro(read(root, name) ?? "") : null;
      if (name && next) files.push(plannedFile(root, name, next, "getSentryExpoConfig writes a Debug ID into each bundle and its source map, which Sentry matches errors on"));
      else manual.push(`${g.file}: build the config on getSentryExpoConfig(__dirname) from @sentry/react-native/metro in place of getDefaultConfig, keep the app's own changes on it, and wrap it last in withNativeWind(…) when the app has NativeWind.`);
    }

    for (const g of byPiece("expo-plugin")) {
      const name = APP_CONFIG.find((n) => existsSync(path.join(root, n)));
      const next = name && project ? withSentryPlugin(name, read(root, name) ?? "", project) : null;
      if (name && next) files.push(plannedFile(root, name, next, `the ${SDK} plugin uploads each EAS build's source maps (and its native debug files) to Sentry`));
      else if (project) manual.push(`${g.file}: add ${pluginSource(project)} to the Expo config's plugins.`);
    }

    if (state.native) {
      const workspace = read(root, "pnpm-workspace.yaml");
      const blocked = /^(\s*)(["']?)@sentry\/cli\2\s*:\s*false\s*$/m;
      if (workspace && blocked.test(workspace)) {
        files.push(plannedFile(root, "pnpm-workspace.yaml", workspace.replace(blocked, (_m, ind: string, q: string) => `${ind}${q}@sentry/cli${q}: true`), "pnpm runs @sentry/cli's install script, which downloads the uploader builds and releases run"));
      } else if (!workspace && existsSync(path.join(root, "pnpm-lock.yaml"))) {
        manual.push(`With pnpm 11, allow @sentry/cli's install script (it downloads the uploader): "@sentry/cli": true under allowBuilds in pnpm-workspace.yaml.`);
      }
    }

    const uploads = byPiece("update-uploads");
    if (uploads.length) {
      let explicitOff = false;
      try {
        explicitOff = readGenesisConfig(root)?.release?.sentry === false;
      } catch {
        // An invalid config is its own finding.
      }
      for (const g of uploads) {
        const text = read(root, g.file) ?? "";
        if (/Genesis template \(templates\/(?:release|ci)\//.test(text)) {
          manual.push(
            explicitOff
              ? `${g.file}: genesis.config.json release.sentry is false. Remove it (it then follows observability.sentry) or set it to true, then run genesis add template release to write the release workflows again.`
              : `${g.file}: run genesis add template release to write the release workflows again with Sentry on (release.sentry follows observability.sentry).`,
          );
        } else {
          manual.push(`${g.file}: after each eas update, run npx --no sentry-expo-upload-sourcemaps dist (with SENTRY_AUTH_TOKEN in that step's environment, and failing the job when it fails); on an EAS update job, set upload_sentry_sourcemaps: true.`);
        }
      }
    }

    for (const g of byPiece("vite")) {
      manual.push(
        `${g.file}: add Sentry's source maps plugin and keep the maps out of the deploy: import { sentryVitePlugin } from "@sentry/vite-plugin" (or the framework's wrapper, such as sentryTanstackStart), then build: { sourcemap: "hidden" } and plugins: [..., sentryVitePlugin({ org, project, authToken: process.env.SENTRY_AUTH_TOKEN, sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, filesToDeleteAfterUpload: ["./dist/**/*.map"] } })], last in the list.`,
      );
    }

    const web = byPiece("vite").length > 0;
    if (state.uses) manual.push(tokenSteps(state.native, web));
    const summary = files.length
      ? `writes ${files.map((f) => f.path).join(", ")}${manual.length ? "; the rest is listed for you" : ""}`
      : state.gaps.length || !state.project
        ? "nothing it can write safely; the steps are listed for you"
        : "nothing to change";
    return { summary, files, ...(manual.length ? { manual: manual.join("\n") } : {}) };
  },
  async verify(ctx) {
    // Guided: the secret and any step listed as yours can stay; what this fix wrote must be gone from the findings.
    if (!ctx.recheck) return { ok: true };
    const remaining = await ctx.recheck(this.rules);
    return { ok: true, remaining, ...(remaining.length ? { message: `${remaining.length} left for you: ${remaining.map((f) => f.subject ?? f.file).join(", ")}` } : {}) };
  },
};

export default [sentrySourceMapsFix];
