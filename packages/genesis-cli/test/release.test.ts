// @feat:eas-workflows
/**
 * The native release lane as versioned templates: the `release` block rendered into them, the
 * plan script's decisions, adopting the templates into an app, and upgrading one (docs/NATIVE-RELEASE.md).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { renderOwned } from "../src/blocks/app-folder.js";
import { sha256 } from "../src/blocks/files.js";
import { readLock, substitute, writeLock } from "../src/blocks/lock.js";
import { ownedKeyProblem, refreshOwned } from "../src/blocks/owned.js";
import { DEFAULT_RELEASE_CONTEXT, renderRelease, resolveRelease, type ReleaseContext } from "../src/blocks/release-render.js";
import { addTemplates } from "../src/blocks/add-template.js";
import { adoptTemplates, bumpCallerPins, competingReleaseWorkflows, easProfileEnvironment, RELEASE_COMMAND, releaseContext, currentSource, MOVED_TEMPLATES, hasPushTrigger, missingTemplateSets, renderPin, renderTemplate, resolveTemplateNames } from "../src/blocks/release.js";
import { templateTarget } from "../src/blocks/templates.js";
import { GenesisConfigError, validateRelease } from "../src/doctor/config.js";
import { runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
import { fakePackage, makeApp, read, tempDir, writeTree } from "./blocks-helpers.js";
// @ts-expect-error: a plain .mjs template, tested as the app runs it.
import * as plan from "../../../templates/eas/scripts/native-release.mjs";

const REPO = path.resolve(__dirname, "..", "..", "..");
const TEMPLATES = path.join(REPO, "templates");
const STARTER = path.join(REPO, "apps", "genesis-rn-starter");
const CLI = "@marktiderman/genesis-cli";
const template = (rel: string) => readFileSync(path.join(TEMPLATES, rel), "utf8");
const ctx = (set: Parameters<typeof resolveRelease>[0] = {}, appFolder: string | null = null, pm: "pnpm" | "bun" | "npm" | "yarn" = "pnpm"): ReleaseContext => ({ release: resolveRelease(set, pm), appFolder });
const yaml = (rel: string, c: ReleaseContext) => parse(renderRelease(template(rel), c)) as Record<string, any>;
const PIN = { sha: "a".repeat(40), version: "2.40.0" };

describe("the release block", () => {
  it("validates every setting, and fails on a typo rather than doing nothing", () => {
    expect(validateRelease({ platforms: ["android", "ios"], paths: ["./packages/shared/"], sentry: true, pushHook: "scripts/push.mjs", runtimeVersion: { command: "node scripts/rv.mjs" } })).toEqual({
      platforms: ["ios", "android"],
      paths: ["packages/shared"],
      sentry: true,
      pushHook: { script: "scripts/push.mjs", secrets: [] },
      runtimeVersion: { command: "node scripts/rv.mjs" },
    });
    for (const bad of [{ platform: ["ios"] }, { platforms: [] }, { platforms: ["web"] }, { paths: ["../x"] }, { sentry: "yes" }, { pushHook: "push.sh" }, { pushHook: { script: "p.mjs", secrets: ["GITHUB_TOKEN"] } }, { environment: "prod env" }, { packageManager: "deno" }, { runtimeVersion: { command: "echo ${{ secrets.X }}" } }, { runtimeVersion: "policy" }]) {
      expect(() => validateRelease(bad), JSON.stringify(bad)).toThrow(GenesisConfigError);
    }
  });

  it("defaults: both platforms, production everywhere, no Sentry, no hook, the fingerprint", () => {
    expect(resolveRelease({}, "bun")).toEqual({ platforms: ["ios", "android"], environment: "production", paths: [], sentry: false, pushHook: null, profile: "production", channel: "production", easEnvironment: "production", packageManager: "bun", runtimeCommand: null });
    expect(resolveRelease({ profile: "store" }).easEnvironment).toBe("store");
  });
});

describe("rendering the templates", () => {
  const MARKED = ["ci/native-release.yml", "release/deploy-production.yml", "release/pr-preview.yml"];

  it("the starter's copies are the default render, with no markup left", () => {
    const copies: [string, string][] = [
      ["release/deploy-production.yml", ".eas/workflows/deploy-production.yml"],
      ["release/pr-preview.yml", ".eas/workflows/pr-preview.yml"],
      ["eas/scripts/native-release.mjs", ".eas/scripts/native-release.mjs"],
      ["expo/fingerprint.config.js", "fingerprint.config.js"],
      ["expo/.fingerprintignore", ".fingerprintignore"],
    ];
    for (const [t, copy] of copies) {
      const rendered = renderRelease(template(t), DEFAULT_RELEASE_CONTEXT);
      expect(readFileSync(path.join(STARTER, copy), "utf8"), copy).toBe(rendered);
      expect(rendered).not.toMatch(/^\s*#@|GENESIS_RELEASE_/m);
    }
  });

  it.each(MARKED)("%s renders to valid YAML for every combination, with no markup left", (rel) => {
    for (const platforms of [["ios", "android"], ["ios"], ["android"]] as const) {
      for (const sentry of [false, true]) {
        for (const pushHook of [null, { script: "scripts/push.mjs", secrets: ["PUSH_SECRET"] }]) {
          for (const runtimeCommand of [null, "node scripts/runtime-version.mjs"]) {
            for (const appFolder of [null, "mobile"]) {
              const text = renderRelease(template(rel), ctx({ platforms: [...platforms], sentry, pushHook, runtimeCommand, paths: ["app/src"] }, appFolder));
              expect(text).not.toMatch(/^\s*#@|GENESIS_RELEASE_/m);
              const doc = parse(text) as { jobs: Record<string, { needs?: string[]; after?: string[] }> };
              // Every job a job waits on is there, whatever was left out.
              for (const job of Object.values(doc.jobs)) for (const dep of [...(job.needs ?? []), ...(job.after ?? [])]) expect(Object.keys(doc.jobs), `${rel} ${platforms.join()} ${dep}`).toContain(dep);
            }
          }
        }
      }
    }
  });

  it("deploy-production: one platform drops the other's jobs and inputs; Sentry and the hook switch on", () => {
    const ios = yaml("release/deploy-production.yml", ctx({ platforms: ["ios"] }));
    expect(Object.keys(ios.jobs).filter((j) => j.includes("android"))).toEqual([]);
    expect(Object.keys(ios.on.workflow_dispatch.inputs)).toEqual(["commit_sha", "repository", "handoff", "manual", "ios", "ios_runtime_version"]);
    expect(ios.on.workflow_dispatch.inputs.ios_runtime_version).toMatchObject({ type: "string", required: true });
    expect(ios.jobs.update_ios.steps[2].run).not.toContain("sentry-expo-upload-sourcemaps");
    const full = yaml("release/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/push.mjs", secrets: [] }, profile: "store", channel: "live", easEnvironment: "prod" }));
    expect(full.jobs.update_android.steps[2].run).toContain('--channel "live" --platform android --message');
    expect(full.jobs.update_android.environment).toBe("prod");
    expect(full.jobs.update_android.steps[2].run).toContain("sentry-expo-upload-sourcemaps dist");
    expect(full.jobs.build_ios.params.profile).toBe("store");
    expect(full.jobs.build_ios.environment).toBe("prod");
    expect(full.jobs.hook_ios_update.steps[1].run).toBe("node scripts/push.mjs");
    expect(full.jobs.hook_android_build.needs).toEqual(["build_android", "submit_android"]);
    expect(full.jobs.hook_ios_update.env.RELEASE_UPDATE_GROUP).toBe("${{ needs.update_ios.outputs.update_group }}");
  });

  it("deploy-production releases only a commit on main, fail-closed, before anything else", () => {
    for (const platforms of [["ios", "android"], ["ios"], ["android"]] as const) {
      const doc = yaml("release/deploy-production.yml", ctx({ platforms: [...platforms] }));
      expect(Object.keys(doc.jobs)[0]).toBe("source");
      const run = (doc.jobs.source.steps as { run?: string }[])[1]!.run!;
      expect(run).toContain('if [ "$head" != "$COMMIT_SHA" ]; then');
      expect(run).toContain("git fetch --quiet origin main");
      expect(run).toContain('if ! git merge-base --is-ancestor "$COMMIT_SHA" FETCH_HEAD; then');
      // Every job waits on it, through get-build.
      for (const p of platforms) expect(doc.jobs[`get_${p}_build`].needs).toEqual(["source"]);
      const waits = (id: string): boolean => id === "source" || (doc.jobs[id].needs ?? []).some((n: string) => waits(n));
      for (const id of Object.keys(doc.jobs)) expect(waits(id), id).toBe(true);
    }
    // The check itself, on a real repository: a commit off main fails, one on main passes.
    const repo = tempDir("genesis-source-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "on main");
    const onMain = git("rev-parse", "HEAD");
    const remote = tempDir("genesis-source-remote-");
    execFileSync("git", ["clone", "-q", "--bare", repo, remote]);
    git("remote", "add", "origin", remote);
    git("switch", "-q", "-c", "feature");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "off main");
    const offMain = git("rev-parse", "HEAD");
    const script = (yaml("release/deploy-production.yml", ctx()).jobs.source.steps as { run?: string }[])[1]!.run!;
    const check = (sha: string, start: Record<string, string> = { HANDOFF: "native-release" }) => spawnSync("bash", ["-c", script], { cwd: repo, encoding: "utf8", env: { ...process.env, COMMIT_SHA: sha, HANDOFF: "", MANUAL: "", ...start } });
    expect(check(offMain).status).toBe(1);
    expect(check(offMain).stdout).toContain("isn't on main");
    git("switch", "-q", "main");
    expect(check(onMain).status).toBe(0);
    expect(check(offMain).stdout).toContain("start this workflow with --ref");
    // Only native-release.yml starts it (handoff), or a person who says so (manual=true).
    const direct = check(onMain, {});
    expect(direct.status).toBe(1);
    expect(direct.stdout).toContain("Start releases with native-release.yml");
    expect(check(onMain, { MANUAL: "true" }).status).toBe(0);
    expect(check(onMain, { MANUAL: "false", HANDOFF: "other" }).status).toBe(1);
    const doc = yaml("release/deploy-production.yml", ctx());
    expect(doc.on.workflow_dispatch.inputs.manual).toMatchObject({ type: "choice", options: ["false", "true"], default: "false" });
    expect(doc.jobs.source.env).toMatchObject({ HANDOFF: "${{ inputs.handoff }}", MANUAL: "${{ inputs.manual }}" });
    // native-release.yml sends the handoff.
    const handoff = (yaml("ci/native-release.yml", ctx()).jobs.release.steps as { name?: string; run?: string }[]).find((st) => st.name === "Hand the release to EAS")!.run!;
    expect(handoff).toContain('-F "handoff=native-release"');
  });

  it("every deploy-production run, a manual one too, checks eas.json's channel and environment for the platforms it releases", () => {
    const doc = yaml("release/deploy-production.yml", ctx({ easEnvironment: "production" }));
    const script = (doc.jobs.source.steps as { run?: string }[])[1]!.run!;
    expect(doc.jobs.source.env).toMatchObject({ RELEASE_IOS: "${{ inputs.ios == 'true' }}", RELEASE_ANDROID: "${{ inputs.android == 'true' }}" });
    const repo = tempDir("genesis-source-env-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    writeTree(repo, { ".eas/scripts/native-release.mjs": readFileSync(path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "utf8") });
    git("add", "-A");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "-m", "on main");
    const remote = tempDir("genesis-source-env-remote-");
    execFileSync("git", ["clone", "-q", "--bare", repo, remote]);
    git("remote", "add", "origin", remote);
    const sha = git("rev-parse", "HEAD");
    const start = (easJson: unknown, platforms: Record<string, string>) => {
      writeTree(repo, { "eas.json": JSON.stringify(easJson) });
      return spawnSync("bash", ["-c", script], { cwd: repo, encoding: "utf8", env: { ...process.env, COMMIT_SHA: sha, HANDOFF: "", MANUAL: "true", RELEASE_IOS: "false", RELEASE_ANDROID: "false", ...platforms } });
    };
    // A direct manual run on a profile whose builds read another environment stops before anything is built or published.
    const mismatched = start({ build: { production: { channel: "production", environment: "staging" } } }, { RELEASE_IOS: "true" });
    expect(mismatched.status).toBe(1);
    expect(mismatched.stderr).toContain('builds ios with the EAS environment "staging", but the release reads "production"');
    expect(start({ build: { production: { channel: "production" } } }, { RELEASE_IOS: "true", RELEASE_ANDROID: "true" }).status).toBe(0);
    // Only the platforms it releases: an Android-only override doesn't stop an iOS run.
    expect(start({ build: { production: { channel: "production", android: { environment: "staging" } } } }, { RELEASE_IOS: "true" }).status).toBe(0);
    expect(start({ build: { production: { channel: "stable" } } }, { RELEASE_IOS: "true" }).stderr).toContain('listen to the channel "stable"');
  });

  it("deploy-production's get-build matches only builds on the release channel", () => {
    for (const channel of ["production", "stable"]) {
      const doc = yaml("release/deploy-production.yml", ctx({ channel }));
      for (const p of ["ios", "android"]) {
        // The build lookup and the update name the same channel: an older build on another one isn't taken.
        expect(doc.jobs[`get_${p}_build`].params.channel).toBe(channel);
        const run = (doc.jobs[`update_${p}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
        expect(run).toContain(`update --channel "${channel}" --platform ${p}`);
        expect(doc.jobs[`get_${p}_build`].params.channel).not.toBe(channel === "production" ? "stable" : "production");
      }
    }
  });

  it("the EAS lane's order check fails closed: a channel it can't read stops the job before eas update", () => {
    const doc = yaml("release/deploy-production.yml", ctx({ sentry: true }));
    for (const p of ["ios", "android"]) {
      const run = (doc.jobs[`update_${p}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      const app = tempDir("genesis-fail-closed-");
      const bin = tempDir("genesis-fail-closed-bin-");
      const ran = path.join(bin, "ran.txt");
      // latest-commit fails (an API error); anything else the step would run records itself.
      writeTree(app, { ".eas/scripts/native-release.mjs": `import { appendFileSync } from "node:fs";\nif (process.argv[2] === "latest-commit") { console.error("eas: 500"); process.exit(1); }\nappendFileSync(${JSON.stringify(ran)}, process.argv.slice(2).join(" ") + "\\n");\n` });
      writeTree(bin, { npx: `#!/usr/bin/env bash\necho "npx $*" >> ${JSON.stringify(ran)}\n`, "set-output": `#!/usr/bin/env bash\necho "set-output $*" >> ${JSON.stringify(ran)}\n` });
      execFileSync("chmod", ["+x", path.join(bin, "npx"), path.join(bin, "set-output")]);
      const result = spawnSync("bash", ["-c", run], { cwd: app, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, COMMIT_SHA: "a".repeat(40), RUNTIME_VERSION: "f".repeat(40), BUILD_COMMIT: "" } });
      expect(result.status, p).toBe(1);
      expect(result.stdout).toContain("its order can't be checked: nothing was published.");
      // Nothing after the check ran: no eas update, no output.
      expect(existsSync(ran) ? readFileSync(ran, "utf8") : "").toBe("");
    }
  });

  it("the release reads the EAS environment its builds read: the default from eas.json, a mismatch refused before planning", () => {
    const eas = {
      build: {
        base: { distribution: "store" },
        store: { extends: "base" },
        named: { extends: "base", environment: "staging" },
        internal: { distribution: "internal" },
        dev: { distribution: "internal", developmentClient: true },
        split: { distribution: "internal", ios: { distribution: "store" } },
      },
    };
    // As eas-cli 26 resolves it for a build: the profile's environment, else by distribution.
    expect(plan.profileEnvironment(eas, "store", "ios")).toBe("production");
    expect(plan.profileEnvironment(eas, "named", "android")).toBe("staging");
    expect(plan.profileEnvironment(eas, "internal", "ios")).toBe("preview");
    expect(plan.profileEnvironment(eas, "dev", "ios")).toBe("development");
    expect(plan.profileEnvironment(eas, "split", "ios")).toBe("production");
    expect(plan.profileEnvironment(eas, "split", "android")).toBe("preview");
    expect(() => plan.checkProfileEnvironment(eas, "store", "production")).not.toThrow();
    expect(() => plan.checkProfileEnvironment(eas, "store", "store")).toThrow(/builds ios with the EAS environment "production", but the release reads "store"/);
    expect(() => plan.checkProfileEnvironment(eas, "split", "production")).toThrow(/builds android with the EAS environment "preview"/);
    expect(() => plan.checkProfileEnvironment(eas, "split", "production", ["ios"])).not.toThrow();
    // eas-json merges the whole chain, then the platform section over the common one: a platform
    // value anywhere along extends beats a common one, even the child's own.
    const chain = { build: { base: { ios: { environment: "preview", distribution: "internal" } }, child: { extends: "base", environment: "production", distribution: "store" }, dist: { extends: "base2", distribution: "store" }, base2: { ios: { distribution: "internal" } } } };
    expect(plan.profileEnvironment(chain, "child", "ios")).toBe("preview");
    expect(plan.profileEnvironment(chain, "dist", "ios")).toBe("preview");
    expect(plan.profileEnvironment(chain, "child", "android")).toBe("production");
    const chainApp = makeApp({ "eas.json": JSON.stringify(chain) });
    expect(easProfileEnvironment(chainApp, "child", "ios")).toBe("preview");
    expect(easProfileEnvironment(chainApp, "dist", "ios")).toBe("preview");
    expect(easProfileEnvironment(chainApp, "child", "android")).toBe("production");
    // eas.json's environment goes into the workflows only as a plain name.
    for (const bad of ["prod env", "a'b", "x\ny", "${{ secrets.X }}"]) {
      const badApp = makeApp({ "eas.json": JSON.stringify({ build: { production: { environment: bad } } }) });
      expect(() => easProfileEnvironment(badApp, "production", "ios"), bad).toThrow(/isn't a plain EAS environment name/);
      expect(() => releaseContext(badApp), bad).toThrow(/isn't a plain EAS environment name/);
    }
    // The CLI's default is the same: a store profile named "store" reads production, not "store".
    const root = makeApp({ "app.json": "{}", "pnpm-lock.yaml": "", "eas.json": JSON.stringify(eas), "genesis.config.json": JSON.stringify({ release: { profile: "store" } }) });
    expect(easProfileEnvironment(root, "store", "ios")).toBe("production");
    expect(releaseContext(root).release.easEnvironment).toBe("production");
    const explicit = makeApp({ "app.json": "{}", "pnpm-lock.yaml": "", "eas.json": JSON.stringify(eas), "genesis.config.json": JSON.stringify({ release: { profile: "store", easEnvironment: "custom" } }) });
    expect(releaseContext(explicit).release.easEnvironment).toBe("custom");
    // Without eas.json, the profile's name, as before.
    expect(releaseContext(makeApp({ "genesis.config.json": JSON.stringify({ release: { profile: "store" } }) })).release.easEnvironment).toBe("store");
    // The plan step checks it before anything else is read, with the platforms released.
    const run = (yaml("ci/native-release.yml", ctx({ easEnvironment: "custom" })).jobs.release.steps as { id?: string; run?: string }[]).find((st) => st.id === "plan")!.run!;
    expect(run).toContain('native-release.mjs environment eas.json "$PROFILE" "custom" "$PLATFORMS"');
    expect(run.indexOf("native-release.mjs environment")).toBeLessThan(run.indexOf("eas workflow:runs"));
  });

  it("GitHub runs the release hook, then the Sentry upload; EAS uploads in the update job, then runs the hook job; a re-run of a published commit runs the hook again with its group", () => {
    const steps = (yaml("ci/native-release.yml", ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } })).jobs.release.steps as { id?: string; name?: string; run?: string; if?: string; env?: Record<string, string> }[]);
    for (const [p, Name] of [["ios", "iOS"], ["android", "Android"]] as const) {
      const at = (name: string) => steps.findIndex((st) => st.name === name);
      expect(at(`Run the release hook (${Name} update)`)).toBeGreaterThan(at(`Publish the ${Name} update`));
      expect(at(`Run the release hook (${Name} update)`)).toBeLessThan(at(`Upload the ${Name} update's source maps to Sentry`));
      const recover = steps.find((st) => st.id === `recover_${p}`)!;
      expect(recover.if).toBe(`\${{ !cancelled() && steps.plan.outputs.${p}_shipped_by == github.sha }}`);
      expect(recover.run).toContain(`native-release.mjs published-group "production" ${p} "$GITHUB_SHA"`);
      // The source maps: kept after this run's update, fetched back on a re-run, then uploaded.
      const at2 = (pred: (st: { id?: string; name?: string; uses?: string }) => boolean) => steps.findIndex(pred);
      const keep = steps.find((st) => st.name === `Keep the ${Name} update's source maps for a re-run`) as { uses?: string; with?: Record<string, unknown>; if?: string };
      expect(keep.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
      expect(keep.with).toMatchObject({ name: `sourcemaps-${p}-\${{ github.sha }}`, path: "./dist", "retention-days": 7, "if-no-files-found": "error" });
      expect(keep.if).toBe(`\${{ !cancelled() && steps.update_${p}.outputs.${p}_update_group != '' }}`);
      const get = steps.find((st) => st.id === `sourcemaps_${p}`) as { uses?: string; with?: Record<string, unknown>; if?: string; "continue-on-error"?: boolean };
      expect(get.uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}$/);
      expect(get.with).toEqual({ name: `sourcemaps-${p}-\${{ github.sha }}`, path: "./dist" });
      expect(get["continue-on-error"]).toBe(true);
      expect(at2((st) => st.name === `Keep the ${Name} update's source maps for a re-run`)).toBeLessThan(at2((st) => st.id === `recover_${p}`));
      expect(at2((st) => st.id === `recover_${p}`)).toBeLessThan(at2((st) => st.id === `sourcemaps_${p}`));
      expect(at2((st) => st.id === `sourcemaps_${p}`)).toBeLessThan(at(`Upload the ${Name} update's source maps to Sentry`));
      expect(steps.find((st) => st.name === `The ${Name} update's source maps are gone`)!.run).toContain("Source maps not uploaded again");
      const hook = steps.find((st) => st.name === `Run the release hook (${Name} update)`)!;
      expect(hook.if).toContain(`steps.recover_${p}.outputs.${p}_update_group != ''`);
      expect(hook.env!.RELEASE_UPDATE_GROUP).toBe(`\${{ steps.update_${p}.outputs.${p}_update_group || steps.recover_${p}.outputs.${p}_update_group }}`);
      // Sentry after this run's own update, or after a re-run got the kept source maps back.
      expect(steps.find((st) => st.name === `Upload the ${Name} update's source maps to Sentry`)!.if).toBe(`\${{ !cancelled() && ((steps.update_${p}.outcome == 'success' && steps.update_${p}.outputs.${p}_update_group != '') || steps.sourcemaps_${p}.outcome == 'success') }}`);
    }
    // Sentry without a hook still recovers (for the source maps); neither, nothing to recover.
    const sentryOnly = yaml("ci/native-release.yml", ctx({ sentry: true })).jobs.release.steps as { id?: string; name?: string }[];
    expect(sentryOnly.filter((st) => st.id?.startsWith("recover_") || st.id?.startsWith("sourcemaps_")).map((st) => st.id)).toEqual(["recover_ios", "sourcemaps_ios", "recover_android", "sourcemaps_android"]);
    expect(sentryOnly.some((st) => st.name?.startsWith("Run the release hook"))).toBe(false);
    expect((yaml("ci/native-release.yml", ctx()).jobs.release.steps as { id?: string }[]).some((st) => st.id?.startsWith("recover_") || st.id?.startsWith("sourcemaps_"))).toBe(false);
    // On EAS the upload is in the update job, before the hook job, which needs it.
    const easOrder = yaml("release/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } }));
    expect(easOrder.jobs.hook_ios_update.needs).toContain("update_ios");
    expect((easOrder.jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run).toContain("sentry-expo-upload-sourcemaps dist");
    // On EAS: the hook job comes after the update job (and before the source-map failure is reported), and a re-run recovers the group.
    const eas = yaml("release/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } }));
    for (const p of ["ios", "android"]) {
      const run = (eas.jobs[`update_${p}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      expect(run).toContain('if [ "$carrier" = "$COMMIT_SHA" ]; then');
      expect(run).toContain(`native-release.mjs published-group "production" ${p} "$COMMIT_SHA"`);
      expect(run.indexOf("published-group")).toBeLessThan(run.indexOf("runtimeversion:resolve"));
    }
    expect((yaml("release/deploy-production.yml", ctx()).jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!).not.toContain("published-group");
    // The recovery reads the channel's latest update of this commit; another commit there is refused.
    const C = "c".repeat(40);
    const run = (args: string[]) => {
      if (args[0] === "channel:view") return JSON.stringify({ currentPage: { updateBranches: [{ name: "production" }] } });
      if (args[0] === "update:list") return JSON.stringify({ currentPage: [{ group: "g-7", platforms: "ios" }] });
      return JSON.stringify([{ platform: "ios", group: "g-7", gitCommitHash: C, runtimeVersion: "1.0.0(3)" }]);
    };
    expect(plan.publishedGroup(run, "production", "ios", C)).toEqual(["ios_update_group=g-7", "ios_runtime_version=1.0.0(3)"]);
    expect(() => plan.publishedGroup(run, "production", "ios", "d".repeat(40))).toThrow(/no update group to recover/);
  });

  it("both lanes read the channel's order again just before eas update", () => {
    const gh = yaml("ci/native-release.yml", ctx()).jobs.release.steps as { name?: string; run?: string; if?: string }[];
    const eas = yaml("release/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } }));
    for (const [p, Name] of [["ios", "iOS"], ["android", "Android"]] as const) {
      const ghRun = gh.find((st) => st.name === `Publish the ${Name} update`)!.run!;
      const easRun = (eas.jobs[`update_${p}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      for (const [run, check] of [[ghRun, `latest-commit "production" ${p}`], [easRun, "if channel_carries_this; then"]] as const) {
        const last = run.lastIndexOf(check);
        expect(last).toBeGreaterThan(run.indexOf("native-release.mjs runtime "));
        expect(last).toBeLessThan(run.indexOf(" update --channel"));
      }
      // On GitHub, a late skip publishes nothing, and Sentry and the hook only follow an update that went out.
      expect(ghRun).toContain("::warning title=Not published::");
      for (const st of gh.filter((s) => s.if?.includes(`steps.update_${p}.outcome`))) expect(st.if).toContain(`steps.update_${p}.outputs.${p}_update_group != ''`);
    }
    // The EAS check runs as written: the channel carrying a later commit stops the publish.
    const easRun = (eas.jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
    const fn = easRun.slice(easRun.indexOf("channel_carries_this() {"), easRun.indexOf("\n}\n", easRun.indexOf("channel_carries_this() {")) + 3);
    const repo = tempDir("genesis-recheck-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "A");
    const A = git("rev-parse", "HEAD");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "B");
    const B = git("rev-parse", "HEAD");
    writeTree(repo, { ".eas/scripts/native-release.mjs": `console.log(process.env.LATEST ?? "");\n` });
    const carries = (commit: string, latest: string) => spawnSync("bash", ["-c", `${fn}\nchannel_carries_this && echo CARRIED || echo FREE`], { cwd: repo, encoding: "utf8", env: { ...process.env, COMMIT_SHA: commit, LATEST: latest } }).stdout;
    expect(carries(A, B)).toContain("CARRIED");
    expect(carries(B, A)).toContain("FREE");
    expect(carries(B, "")).toContain("FREE");
  });

  it("deploy-production publishes like GitHub does: the platform's profile env, the runtime checked before eas update", () => {
    const doc = yaml("release/deploy-production.yml", ctx());
    // No fingerprint job of its own: it matches the runtime version GitHub computed with the profile's env.
    expect(doc.jobs.fingerprint).toBeUndefined();
    expect(doc.jobs.get_ios_build.params.fingerprint_hash).toBe("${{ inputs.ios_runtime_version }}");
    const run = doc.jobs.update_android.steps.find((st: { id?: string }) => st.id === "publish").run as string;
    const at = (needle: string) => run.indexOf(needle);
    // The profile's env only for the app's commands (with-profile), never eval'd into the shell that
    // holds RUNTIME_VERSION; eas update without --environment, so the profile's values win in the bundle.
    expect(run).toContain('native-release.mjs with-profile eas.json "production" android -- npx --no expo-updates runtimeversion:resolve --platform android > "$scratch/resolved-android.txt"');
    expect(run).toContain('native-release.mjs with-profile eas.json "production" android -- env CI=1 EXPO_NO_DOTENV=1 npx --yes eas-cli@26.0.0 update --channel "production" --platform android --message');
    expect(run).not.toMatch(/^(?!\s*#).*(?:\beval\b|--environment)/m);
    expect(at("native-release.mjs runtime ")).toBeLessThan(at("eas-cli@26.0.0 update"));
    expect(doc.jobs.update_android.steps.map((st: { uses?: string }) => st.uses).slice(0, 2)).toEqual(["eas/checkout", "eas/install_node_modules"]);
  });

  it("names render as YAML strings, so a profile 123 or a channel null stay text", () => {
    const c = ctx({ profile: "123", channel: "null", environment: "007", easEnvironment: "true" });
    const deploy = yaml("release/deploy-production.yml", c);
    expect(deploy.jobs.build_ios.params.profile).toBe("123");
    expect(deploy.jobs.build_ios.environment).toBe("true");
    expect(deploy.jobs.get_android_build.params.profile).toBe("123");
    const gh = yaml("ci/native-release.yml", { ...c, release: { ...c.release, pushHook: { script: "scripts/p.mjs", secrets: [] } } });
    expect(gh.jobs.release.environment.name).toBe("007");
    expect((gh.jobs.release.steps as { id?: string; env?: Record<string, unknown> }[]).find((st) => st.id === "plan")!.env).toEqual({ PLATFORMS: "ios,android", PROFILE: "123", CHANNEL: "null" });
    const hook = (gh.jobs.release.steps as { name?: string; env?: Record<string, unknown> }[]).find((st) => st.name === "Run the release hook (iOS update)")!;
    expect(hook.env!.RELEASE_CHANNEL).toBe("null");
  });

  it("deploy-production gates each platform on its input compared as text, since eas workflow:run -F sends strings", () => {
    const doc = yaml("release/deploy-production.yml", ctx());
    for (const p of ["ios", "android"]) {
      expect(doc.on.workflow_dispatch.inputs[p]).toEqual({ type: "choice", options: ["true", "false"], default: "true", description: expect.any(String) });
      expect(doc.jobs[`get_${p}_build`].if).toBe(`\${{ inputs.${p} == 'true' }}`);
      expect(doc.jobs[`build_${p}`].if).toBe(`\${{ inputs.${p} == 'true' && !needs.get_${p}_build.outputs.build_id }}`);
      expect(doc.jobs[`update_${p}`].if).toBe(`\${{ inputs.${p} == 'true' && needs.get_${p}_build.outputs.build_id }}`);
    }
    // Every `inputs.<platform>` reference in the file is the text comparison.
    const text = renderRelease(template("release/deploy-production.yml"), ctx());
    expect([...text.matchAll(/inputs\.(ios|android)\b(?!_)(?! == 'true')/g)]).toEqual([]);
    // No order check that could skip a release green: EAS's concurrency keeps the order.
    expect(doc.jobs.newest).toBeUndefined();
    // Every waiting run kept: a run for one platform never replaces a waiting run for the other.
    expect(doc.concurrency).toEqual({ group: "${{ workflow.filename }}", queue: "max" });
  });

  it("deploy-production with the app's own runtime version: no fingerprint job, get-build by runtime_version", () => {
    const own = yaml("release/deploy-production.yml", ctx({ runtimeCommand: "node scripts/rv.mjs" }));
    expect(own.jobs.fingerprint).toBeUndefined();
    expect(own.jobs.get_ios_build.params).toMatchObject({ runtime_version: "${{ inputs.ios_runtime_version }}" });
    expect(own.jobs.get_ios_build.params.fingerprint_hash).toBeUndefined();
    expect(own.on.workflow_dispatch.inputs.android_runtime_version.type).toBe("string");
  });

  it("native-release.yml: main only, [eas skip], serialized, paths from the repository root with appFolder", () => {
    const root = yaml("ci/native-release.yml", ctx());
    expect(root.on.push.branches).toEqual(["main"]);
    expect(root.on.push.paths).toBeUndefined();
    expect(root.on.push["paths-ignore"]).toEqual(["**/*.md", "docs/**", ".github/**", ".eas/**", ".maestro/**"]);
    expect(root.jobs.release.if).toBe("github.ref == 'refs/heads/main' && !contains(github.event.head_commit.message, '[eas skip]')");
    // On the job, so a skipped run ([eas skip]) never takes the waiting place from a release.
    expect(root.concurrency).toBeUndefined();
    expect(root.jobs.release.concurrency).toEqual({ group: "native-release-${{ github.ref }}", "cancel-in-progress": false });
    expect(root.jobs.release.defaults.run["working-directory"]).toBe(".");
    expect(root.permissions).toEqual({ contents: "read" });

    const mono = yaml("ci/native-release.yml", ctx({ paths: ["app/src", "packages/brand"], environment: "Release" }, "mobile"));
    // The root's package.json and lockfiles too: a workspace installs from there.
    expect(mono.on.push.paths).toEqual(["mobile/**", "app/src/**", "packages/brand/**", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "bun.lock", "bun.lockb", "yarn.lock", "package-lock.json"]);
    expect(mono.jobs.release.defaults.run["working-directory"]).toBe("mobile");
    expect(mono.jobs.release.environment).toEqual({ name: "Release", deployment: false });
    // EXPO_TOKEN only where it's needed: never in the job's env, which the install's scripts see.
    expect(mono.jobs.release.env).toBeUndefined();
    expect(mono.jobs.release.steps[0]).toMatchObject({ name: "EXPO_TOKEN is set", env: { EXPO_TOKEN: "${{ secrets.EXPO_TOKEN }}" } });
    const install = (mono.jobs.release.steps as { run?: string; env?: Record<string, string> }[]).find((st) => st.run === "pnpm install --frozen-lockfile")!;
    expect(install.env).toBeUndefined();
  });

  it("native-release.yml: per platform, publish steps only for the platforms on; the install for the package manager", () => {
    const steps = (c: ReleaseContext) => (yaml("ci/native-release.yml", c).jobs.release.steps as { name?: string; run?: string; uses?: string; env?: Record<string, string>; if?: string }[]);
    const names = (c: ReleaseContext) => steps(c).map((s) => s.name ?? s.uses ?? s.run);
    expect(names(ctx({ platforms: ["android"] })).filter((n) => /iOS/.test(n ?? ""))).toEqual([]);
    expect(names(ctx({ sentry: true }))).toContain("Upload the Android update's source maps to Sentry");
    expect(names(ctx())).not.toContain("Sentry can take the source maps");
    expect(steps(ctx({}, null, "bun")).some((s) => s.run === "bun install --frozen-lockfile")).toBe(true);
    expect(steps(ctx({}, null, "npm")).some((s) => s.run === "npm ci")).toBe(true);
    const hook = steps(ctx({ pushHook: { script: "scripts/push.mjs", secrets: ["PUSH_SECRET"] } })).find((s) => s.name === "Run the release hook (iOS update)")!;
    expect(hook.env).toMatchObject({ RELEASE_KIND: "update", RELEASE_PLATFORM: "ios", PUSH_SECRET: "${{ secrets.PUSH_SECRET }}" });
    expect(hook.run).toBe("eas env:exec production 'node scripts/push.mjs' --non-interactive");
    // An Android publish runs after an iOS failure, but never after a failed shared check.
    expect(steps(ctx()).find((s) => s.name === "Publish the Android update")!.if).toBe("${{ !cancelled() && steps.plan.outputs.android_action == 'publish' && steps.plan.outcome == 'success' }}");
    expect(steps(ctx({ sentry: true })).find((s) => s.name === "Publish the Android update")!.if).toBe("${{ !cancelled() && steps.plan.outputs.android_action == 'publish' && steps.plan.outcome == 'success' && steps.sentry_check.outcome == 'success' }}");
    expect(steps(ctx({ sentry: true })).find((s) => s.name === "Publish the iOS update")!.if).toContain("steps.sentry_check.outcome == 'success'");
    expect(steps(ctx()).find((s) => s.name === "Hand the release to EAS")!.if).toBe("${{ !cancelled() && steps.plan.outcome == 'success' && steps.plan.outputs.eas_platforms != '' }}");
    // Inputs reach the shell through env, never written into a script.
    for (const s of steps(ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } }))) expect(s.run ?? "", s.name).not.toMatch(/\$\{\{/);
  });

  it("native-release.yml with the app's own runtime version runs its command per platform", () => {
    const run = (yaml("ci/native-release.yml", ctx({ runtimeCommand: "node scripts/rv.mjs" })).jobs.release.steps as { id?: string; run?: string }[]).find((s) => s.id === "plan")!.run!;
    // The command as a script of its own, run with the EAS environment and the platform's profile env.
    expect(run).toContain("cat > \"$RUNNER_TEMP/release/runtime-version.sh\" <<'GENESIS_RUNTIME_COMMAND'\nnode scripts/rv.mjs\nGENESIS_RUNTIME_COMMAND\n");
    // The profile's env inside eas env:exec (with-profile), so it wins over the EAS environment's, as in the build.
    expect(run).toContain(`RELEASE_PLATFORM="$platform" eas env:exec production 'node .eas/scripts/native-release.mjs with-profile eas.json "$PROFILE" "$RELEASE_PLATFORM" -- bash "$RUNNER_TEMP/release/runtime-version.sh"' --non-interactive > "$RUNNER_TEMP/release/runtime-$platform.txt"`);
    expect(run).toContain('runtime=$(node .eas/scripts/native-release.mjs runtime-printed "$RUNNER_TEMP/release/runtime-$platform.txt" "$platform")');
    expect(run).not.toContain("fingerprint:generate");
  });

  it("a piped runtime command sees RELEASE_PLATFORM in every part, and its whole output is written", () => {
    const run = (yaml("ci/native-release.yml", ctx({ runtimeCommand: 'echo "$RELEASE_PLATFORM" | tr a-z A-Z && echo "-$RELEASE_PLATFORM"' })).jobs.release.steps as { id?: string; run?: string }[]).find((st) => st.id === "plan")!.run!;
    // The lines that write the script, then the script as eas env:exec runs it (bash <file>).
    const write = run.slice(run.indexOf("cat > "), run.indexOf("GENESIS_RUNTIME_COMMAND\n", run.indexOf("<<'GENESIS_RUNTIME_COMMAND'") + 30) + "GENESIS_RUNTIME_COMMAND\n".length);
    const dir = tempDir("genesis-runtime-");
    execFileSync("bash", ["-eo", "pipefail", "-c", `RUNNER_TEMP=${dir}\nmkdir -p "$RUNNER_TEMP/release"\n${write}`]);
    const out = execFileSync("bash", [path.join(dir, "release", "runtime-version.sh")], { encoding: "utf8", env: { ...process.env, RELEASE_PLATFORM: "ios" } });
    expect(out).toBe("IOS\n-ios\n");
    // What's taken is the last line it printed (eas env:exec may print before it), and an unset value is refused.
    const file = path.join(dir, "printed.txt");
    writeTree(dir, { "printed.txt": "Loading environment…\nios-7f3a\n\n" });
    expect(execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "runtime-printed", file, "ios"], { encoding: "utf8" })).toBe("ios-7f3a\n");
    for (const bad of ["undefined\n", "null\n", "\n"]) {
      writeTree(dir, { "printed.txt": bad });
      const refused = spawnSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "runtime-printed", file, "ios"], { encoding: "utf8" });
      expect(refused.status, bad).toBe(1);
      expect(refused.stderr).toContain("printed no ios runtime version");
    }
    expect(plan.isRuntimeVersion("undefined")).toBe(false);
    const errors: string[] = [];
    expect(plan.planOutputs({ ios: { runtime: "undefined", by: "runtime", builds: [] } }, [], "production", { onError: (_p: string, m: string) => errors.push(m) })).toContain("ios_action=failed");
    expect(errors.join()).toMatch(/printed no ios runtime version/);
  });

  it("native-release.yml publishes with the platform's build profile env, and checks the runtime version before publishing", () => {
    const steps = yaml("ci/native-release.yml", ctx()).jobs.release.steps as { name?: string; run?: string; if?: string }[];
    for (const [p, Name] of [["ios", "iOS"], ["android", "Android"]]) {
      const run = steps.find((st) => st.name === `Publish the ${Name} update`)!.run!;
      expect(run).toContain(`eas env:exec production 'node .eas/scripts/native-release.mjs with-profile eas.json "production" ${p} -- npx --no expo-updates runtimeversion:resolve --platform ${p}' --non-interactive`);
      expect(run).toContain(`eas env:exec production 'node .eas/scripts/native-release.mjs with-profile eas.json "production" ${p} -- env EXPO_NO_DOTENV=1 eas update --channel "production" --platform ${p} --message "$RELEASE_MESSAGE" --json --non-interactive' --non-interactive`);
      expect(run).not.toMatch(/^(?!\s*#).*(?:\beval\b|--environment)/m);
      expect(run.indexOf("native-release.mjs runtime ")).toBeLessThan(run.indexOf("eas update --channel"));
    }
  });

  // Expo's own .env loader, as the app's Expo CLI and config load it (the starter's expo depends on it).
  const expoEnv = (() => {
    try {
      const starter = createRequire(path.join(STARTER, "package.json"));
      return createRequire(starter.resolve("expo/package.json")).resolve("@expo/env");
    } catch {
      return null;
    }
  })();

  it.skipIf(!expoEnv)("Expo loads a value only in .env, but not under with-profile (EXPO_NO_DOTENV), as eas update's export doesn't", () => {
    const script = path.join(TEMPLATES, "eas/scripts/native-release.mjs");
    const app = tempDir("genesis-expo-dotenv-");
    writeTree(app, {
      "eas.json": JSON.stringify({ build: { production: { env: { FROM_PROFILE: "profile" } } } }),
      ".env": "ONLY_IN_DOTENV=from-dotenv\nFROM_PROFILE=dotenv\n",
      // Expo's loader, then what it left in the environment.
      "probe.cjs": `require(${JSON.stringify(expoEnv)}).load(process.cwd(), { silent: true, force: true });\nconsole.log(JSON.stringify({ dotenv: process.env.ONLY_IN_DOTENV ?? null, profile: process.env.FROM_PROFILE ?? null }));\n`,
    });
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
    for (const name of ["EXPO_NO_DOTENV", "ONLY_IN_DOTENV", "FROM_PROFILE"]) delete env[name];
    // Without the flag, Expo reads .env.
    expect(JSON.parse(execFileSync("node", ["probe.cjs"], { cwd: app, encoding: "utf8", env }))).toEqual({ dotenv: "from-dotenv", profile: "dotenv" });
    // Through with-profile it doesn't: only the profile's value.
    expect(JSON.parse(execFileSync("node", [script, "with-profile", "eas.json", "production", "ios", "--", "node", "probe.cjs"], { cwd: app, encoding: "utf8", env }))).toEqual({ dotenv: null, profile: "profile" });
  });

  it("the profile's env reaches only the app's commands, over the EAS environment, and a bad profile stops the step", () => {
    const script = path.join(TEMPLATES, "eas/scripts/native-release.mjs");
    const app = tempDir("genesis-with-profile-");
    const easJson = { build: { base: { env: { API: "base", RUNTIME_VERSION: "1.0.0", COPY: "first\nsecond" }, ios: { env: { API: "ios" } } }, production: { extends: "base" } } };
    writeTree(app, { "eas.json": JSON.stringify(easJson) });
    const printEnv = ["-e", "console.log(JSON.stringify({ API: process.env.API, RUNTIME_VERSION: process.env.RUNTIME_VERSION, COPY: process.env.COPY, FROM_EAS: process.env.FROM_EAS }))"];
    // As under eas env:exec: the EAS environment's API is there, and the profile's wins, as in the build.
    const out = execFileSync("node", [script, "with-profile", "eas.json", "production", "ios", "--", "node", ...printEnv], { cwd: app, encoding: "utf8", env: { ...process.env, API: "from-eas", FROM_EAS: "kept" } });
    expect(JSON.parse(out)).toEqual({ API: "ios", RUNTIME_VERSION: "1.0.0", COPY: "first\nsecond", FROM_EAS: "kept" });
    // What with-profile runs gets EXPO_NO_DOTENV=1 (Expo's own .env loader is tested below).
    const seen = execFileSync("node", [script, "with-profile", "eas.json", "production", "ios", "--", "node", "-e", "console.log(process.env.EXPO_NO_DOTENV)"], { cwd: app, encoding: "utf8" });
    expect(seen.trim()).toBe("1");
    // Every command that resolves a runtime version carries it, in every render of both lanes.
    for (const runtimeCommand of [null, "node scripts/rv.mjs"]) {
      for (const rel of ["ci/native-release.yml", "release/deploy-production.yml"]) {
        const text = renderRelease(template(rel), ctx({ runtimeCommand }));
        const lines = text.split("\n").filter((l) => !/^\s*#/.test(l) && /runtimeversion:resolve|fingerprint:generate|runtime-version\.sh"'|\beas update --channel|eas-cli@26\.0\.0 update --channel/.test(l));
        expect(lines.length, rel).toBeGreaterThan(0);
        for (const l of lines) expect(/native-release\.mjs with-profile |EXPO_NO_DOTENV=1 /.test(l), l.trim()).toBe(true);
      }
    }
    // The command's exit status is the step's; a missing profile fails before the command runs.
    expect(spawnSync("node", [script, "with-profile", "eas.json", "production", "ios", "--", "node", "-e", "process.exit(3)"], { cwd: app }).status).toBe(3);
    const missing = spawnSync("node", [script, "with-profile", "eas.json", "store", "ios", "--", "node", "-e", "console.log('ran')"], { cwd: app, encoding: "utf8" });
    expect(missing.status).toBe(1);
    expect(missing.stdout).not.toContain("ran");
    // The shell that compares runtime versions never takes the profile's: eas.json's RUNTIME_VERSION can't replace the plan's.
    for (const run of [
      ...(yaml("ci/native-release.yml", ctx()).jobs.release.steps as { run?: string }[]).map((st) => st.run ?? ""),
      ...Object.values(yaml("release/deploy-production.yml", ctx()).jobs as Record<string, { steps?: { run?: string }[] }>).flatMap((j) => (j.steps ?? []).map((st) => st.run ?? "")),
    ]) {
      expect(run).not.toMatch(/\beval\b|profile-env/);
    }
    // A multiline value goes through --shell too, kept inside its quotes; the line form still refuses it.
    expect(plan.profileEnv(easJson, "production", "ios", true)).toContain("export COPY='first\nsecond'");
    expect(() => plan.profileEnv(easJson, "production", "ios")).toThrow(/line break/);
  });

  it("native-release.yml skips, out loud, a platform whose channel already carries this commit or a later one", () => {
    const doc = yaml("ci/native-release.yml", ctx());
    const steps = doc.jobs.release.steps as { name?: string; run?: string; if?: string; with?: Record<string, unknown> }[];
    expect((steps as { uses?: string; with?: Record<string, unknown> }[]).find((st) => st.uses?.startsWith("actions/checkout"))!.with!["fetch-depth"]).toBe(0);
    const plan = steps.find((st) => st.name === "Runtime versions, builds and EAS's release runs")!.run!;
    expect(plan).toContain('latest=$(node .eas/scripts/native-release.mjs latest-commit "$CHANNEL" "$platform")');
    expect(plan).toContain("for commit in $latest; do");
    expect(plan).toContain('git merge-base --is-ancestor "$GITHUB_SHA" "$commit"');
    const shipped = steps.find((st) => st.name === "Already shipped")!;
    expect(shipped.if).toBe("steps.plan.outputs.skipped_platforms != ''");
    expect(shipped.run).toContain("::warning title=Not published::");
    expect(shipped.run).toContain("$GITHUB_STEP_SUMMARY");
  });

  it("pr-preview: release.paths join the app's own, kept from the repository root under appFolder; one platform drops the other", () => {
    const c = ctx({ platforms: ["ios"], paths: ["app/src"] }, "mobile");
    const raw = template("release/pr-preview.yml");
    const text = renderTemplate(".eas/workflows/pr-preview.yml", raw, { release: c, substitutions: { REPLACE_WITH_APP_FOLDER: "src" } });
    const doc = parse(text) as Record<string, any>;
    expect(doc.on.pull_request.paths[0]).toBe("mobile/src/**");
    expect(doc.on.pull_request.paths).toContain("app/src/**");
    expect(doc.on.pull_request.paths).not.toContain("mobile/app/src/**");
    expect(Object.keys(doc.jobs).filter((j) => j.includes("android"))).toEqual([]);
    expect(doc.jobs.comment.after).toEqual(["repack_ios", "build_ios", "publish_update"]);
    // renderOwned alone never prefixes a release.paths line.
    expect(renderOwned(".eas/workflows/x.yml", 'on:\n  push:\n    paths:\n      - "a/**" # release.paths\n', "mobile")).toContain('- "a/**" # release.paths');
  });

  it("pr-preview publishes the update for the platforms it builds", () => {
    const platformOf = (platforms: ("ios" | "android")[]) => yaml("release/pr-preview.yml", ctx({ platforms })).jobs.publish_update.params.platform;
    expect(platformOf(["android"])).toBe("android");
    expect(platformOf(["ios"])).toBe("ios");
    expect(platformOf(["ios", "android"])).toBe("all");
  });

  it("pins the CI callers to a release, and moves any caller's pin", () => {
    const text = renderPin(template("ci/app-ci.yml"), PIN);
    expect(text).toContain(`app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0`);
    expect(renderPin(template("vercel/ignore-build.sh"), PIN)).toContain(`ignore-build.sh @ ${PIN.sha} # @marktiderman/genesis@2.40.0`);
    const old = "    uses: marktiderman/genesis/.github/workflows/app-ci.yml@" + "b".repeat(40) + " # @marktiderman/genesis@2.31.0\n";
    expect(bumpCallerPins(old, PIN)).toBe(`    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0\n`);
    expect(bumpCallerPins("uses: actions/checkout@v4\n", PIN)).toBe("uses: actions/checkout@v4\n");
    // Never backwards: a caller already on a later release keeps it.
    const later = "    uses: marktiderman/genesis/.github/workflows/app-ci.yml@" + "d".repeat(40) + " # @marktiderman/genesis@2.41.0\n";
    expect(bumpCallerPins(later, PIN)).toBe(later);
    expect(bumpCallerPins("    uses: marktiderman/genesis/.github/workflows/app-ci.yml@GENESIS_SHA # @marktiderman/genesis@X.Y.Z\n", PIN)).toContain(`@${PIN.sha} # @marktiderman/genesis@2.40.0`);
  });

  it("every template goes where it says, Vercel's too", () => {
    expect(templateTarget("vercel/ignore-build.sh", template("vercel/ignore-build.sh"))).toBe("scripts/vercel-ignore-build.sh");
    expect(templateTarget("vercel/vercel.json", template("vercel/vercel.json"))).toBe("vercel.json");
    expect(templateTarget("ci/native-release.yml", template("ci/native-release.yml"))).toBe(".github/workflows/native-release.yml");
    expect(templateTarget("expo/fingerprint.config.js", template("expo/fingerprint.config.js"))).toBe("fingerprint.config.js");
    for (const [key, t] of [["vercel.json", "vercel/vercel.json"], ["scripts/vercel-ignore-build.sh", "vercel/ignore-build.sh"], ["fingerprint.config.js", "expo/fingerprint.config.js"], [".fingerprintignore", "expo/.fingerprintignore"]]) {
      expect(ownedKeyProblem(key!, `${CLI}:templates/${t}`)).toBeNull();
    }
    expect(resolveTemplateNames(["release"])).toEqual(["ci/native-release.yml", "release/deploy-production.yml", "release/pr-preview.yml", "eas/scripts/native-release.mjs", "expo/fingerprint.config.js", "expo/.fingerprintignore"]);
    expect(() => resolveTemplateNames(["nope"])).toThrow(/isn't a template set/);
  });
});

describe("the plan script", () => {
  const FP = "f".repeat(40);
  const AP = "e".repeat(40);
  const build = (platform: string, hash: string, extra: Record<string, unknown> = {}) => ({ id: `b-${platform}`, status: "FINISHED", platform: platform.toUpperCase(), buildProfile: "production", distribution: "STORE", appVersion: "1.2.0", fingerprint: { hash }, runtime: { version: hash }, ...extra });
  const outputs = (lines: string[]) => Object.fromEntries(lines.map((l) => l.split("=") as [string, string]));
  /** The reason one iOS plan is held back (its action `failed`), or "" when it isn't. */
  const refused = (ios: Record<string, unknown>) => {
    let reason = "";
    const out = outputs(plan.planOutputs({ ios }, [], "production", { onError: (_p: string, m: string) => (reason = m) }));
    return out.ios_action === "failed" ? reason : "";
  };
  const both = (iosBuilds: unknown[], androidBuilds: unknown[], runs: unknown[] = []) =>
    outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: iosBuilds }, android: { runtime: AP, by: "fingerprint", builds: androidBuilds } }, runs, "production"));

  it("publishes here when a finished store build has the runtime version and no EAS release run is open", () => {
    expect(both([build("ios", FP)], [build("android", AP)])).toMatchObject({ ios_action: "publish", android_action: "publish", publish_platforms: "ios,android", eas_platforms: "", lane_open: "false", ios_runtime_version: FP, ios_app_version: "1.2.0" });
  });

  it("hands a platform with no finished build to EAS, and publishes the other", () => {
    const out = both([build("ios", FP, { status: "IN_PROGRESS" })], [build("android", AP)]);
    expect(out).toMatchObject({ ios_action: "eas", ios_has_build: "false", android_action: "publish", publish_platforms: "android", eas_platforms: "ios" });
    expect(both([], [build("android", AP, { buildProfile: "preview" })])).toMatchObject({ eas_platforms: "ios,android" });
  });

  it("while an EAS release run is open, hands every platform to EAS", () => {
    expect(both([build("ios", FP)], [build("android", AP)], [{ workflowFileName: "deploy-production.yml", status: "IN_PROGRESS" }])).toMatchObject({ lane_open: "true", eas_platforms: "ios,android", publish_platforms: "" });
    expect(both([build("ios", FP)], [build("android", AP)], [{ workflowFileName: "deploy-production.yml", status: "SUCCESS" }, { workflowFileName: "e2e.yml", status: "IN_PROGRESS" }])).toMatchObject({ lane_open: "false" });
  });

  it("refuses to guess: a broken list of runs stops both; no fingerprint, a broken builds list or a build whose runtime isn't its fingerprint holds that platform back", () => {
    expect(() => both([build("ios", FP)], [build("android", AP)], null as unknown as unknown[])).toThrow(/list of runs/);
    expect(refused({ runtime: "", by: "fingerprint", builds: [] })).toMatch(/fingerprint hash/);
    expect(refused({ runtime: FP, by: "fingerprint", builds: {} })).toMatch(/list of ios builds/);
    expect(refused({ runtime: FP, by: "fingerprint", builds: [build("ios", FP, { runtime: { version: "1.0.0" } })] })).toMatch(/would not reach it/);
  });

  it("a platform with an undefined fingerprint hash is held back alone; the other still publishes", () => {
    const errors: string[] = [];
    const out = outputs(plan.planOutputs({ ios: { runtime: "undefined", by: "fingerprint", builds: [build("ios", FP)] }, android: { runtime: AP, by: "fingerprint", builds: [build("android", AP)] } }, [], "production", { onError: (p: string, m: string) => errors.push(`${p}: ${m}`) }));
    expect(out).toMatchObject({ ios_action: "failed", android_action: "publish", publish_platforms: "android", eas_platforms: "", failed_platforms: "ios" });
    expect(out.ios_runtime_version).toBeUndefined();
    expect(errors).toEqual(["ios: eas fingerprint:generate gave no ios fingerprint hash."]);
    // As a script: what `node -p '…hash'` wrote for a fingerprint file without one, and a builds file that isn't JSON.
    for (const files of [{ "fingerprint-ios.json": "{}", "builds-ios.json": "[]" }, { "fingerprint-ios.json": JSON.stringify({ hash: FP }), "builds-ios.json": "not json" }, { "fingerprint-ios.json": JSON.stringify({ hash: FP }), "builds-ios.json": "{}" }]) {
      const dir = tempDir("genesis-plan-one-");
      writeTree(dir, { ...files, "fingerprint-android.json": JSON.stringify({ hash: AP }), "builds-android.json": JSON.stringify([build("android", AP)]), "runs.json": "[]" });
      const run = spawnSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "plan", dir, "ios,android", "production"], { encoding: "utf8" });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).toContain("::error title=ios not planned::");
      expect(outputs(run.stdout.trim().split("\n"))).toMatchObject({ ios_action: "failed", android_action: "publish", failed_platforms: "ios" });
    }
  });

  it("with the app's own runtime version, matches builds by it", () => {
    const own = (builds: unknown[]) => outputs(plan.planOutputs({ ios: { runtime: "ios-7f3a", by: "runtime", builds } }, [], "production"));
    expect(own([build("ios", "x", { runtime: { version: "ios-7f3a" } })])).toMatchObject({ ios_action: "publish", ios_runtime_version: "ios-7f3a" });
    expect(own([build("ios", "x", { runtime: { version: "ios-0000" } })])).toMatchObject({ ios_action: "eas" });
    expect(refused({ runtime: "", by: "runtime", builds: [] })).toMatch(/printed no ios runtime version/);
    // Any form Expo takes, the native version with its build in parentheses included.
    expect(outputs(plan.planOutputs({ ios: { runtime: "1.0.0(1)", by: "runtime", builds: [build("ios", "x", { runtime: { version: "1.0.0(1)" } })] } }, [], "production"))).toMatchObject({ ios_action: "publish", ios_runtime_version: "1.0.0(1)" });
    expect(refused({ runtime: "1.0 0", by: "runtime", builds: [] })).toMatch(/printed no ios runtime version/);
  });

  it("skips a platform whose build was made from a later commit (B changed native code, built first, no update yet)", () => {
    const A = "a".repeat(40);
    const B = "b".repeat(40);
    // eas-cli 26's build:list --json prints the builds' GraphQL fields, gitCommitHash among them (graphql/types/Build.js).
    const builtFromB = [build("ios", FP, { gitCommitHash: B })];
    const contains = (commit: string, later: string) => (commit === A && later === B ? true : commit === later ? true : false);
    const skip = outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: builtFromB } }, [], "production", { commit: A, contains }));
    expect(skip).toMatchObject({ ios_action: "skip", ios_built_by: B, ios_build_commit: B, skipped_platforms: "ios", publish_platforms: "" });
    // A later commit than the build's: published as usual.
    expect(outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: builtFromB } }, [], "production", { commit: "c".repeat(40), contains }))).toMatchObject({ ios_action: "publish" });
    // Can't tell (null), or no commit recorded on the build: published.
    expect(outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: builtFromB } }, [], "production", { commit: A, contains: () => null }))).toMatchObject({ ios_action: "publish" });
    expect(outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: [build("ios", FP)] } }, [], "production", { commit: A, contains }))).toMatchObject({ ios_action: "publish" });
  });

  it("checks the build's commit with git, from GITHUB_SHA, when run as a script", () => {
    const repo = tempDir("genesis-order-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "A");
    const a = git("rev-parse", "HEAD");
    git("-c", "user.email=a@example.com", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "B");
    const b = git("rev-parse", "HEAD");
    const dir = tempDir("genesis-order-plan-");
    writeTree(dir, { "fingerprint-ios.json": JSON.stringify({ hash: FP }), "builds-ios.json": JSON.stringify([build("ios", FP, { gitCommitHash: b })]), "runs.json": "[]" });
    const run = (sha: string) => outputs(execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "plan", dir, "ios", "production"], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_SHA: sha } }).trim().split("\n"));
    expect(run(a)).toMatchObject({ ios_action: "skip", ios_built_by: b });
    expect(run(b)).toMatchObject({ ios_action: "skip" });
    // A commit git doesn't know: can't tell, so published.
    expect(run("e".repeat(40))).toMatchObject({ ios_action: "publish" });
  });

  it("skips a platform whose channel already carries this commit or a later one, and says which", () => {
    const out = outputs(plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: [build("ios", FP)], shipped: "d".repeat(40) }, android: { runtime: AP, by: "fingerprint", builds: [build("android", AP)] } }, [], "production"));
    expect(out).toMatchObject({ ios_action: "skip", ios_shipped_by: "d".repeat(40), android_action: "publish", skipped_platforms: "ios", publish_platforms: "android", eas_platforms: "" });
    // And from the files the workflow writes: shipped-<platform>.txt.
    const dir = tempDir("genesis-plan-skip-");
    writeTree(dir, { "fingerprint-ios.json": JSON.stringify({ hash: FP }), "builds-ios.json": "[]", "shipped-ios.txt": `${"d".repeat(40)}\n`, "runs.json": "[]" });
    const lines = execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "plan", dir, "ios", "production"], { encoding: "utf8" });
    expect(outputs(lines.trim().split("\n"))).toMatchObject({ ios_action: "skip", skipped_platforms: "ios", eas_platforms: "" });
  });

  it("checks the published update went to the runtime version the plan matched", () => {
    expect(plan.updateOutputs([{ platform: "ios", group: "g1", runtimeVersion: FP }], "ios", FP)).toEqual(["ios_update_group=g1", `ios_runtime_version=${FP}`]);
    expect(() => plan.updateOutputs([{ platform: "ios", group: "g1", runtimeVersion: AP }], "ios", FP)).toThrow(/No phone/);
    expect(() => plan.updateOutputs([], "android", AP)).toThrow(/no android update group/);
  });

  it("the build profile's env, following extends, as $GITHUB_ENV lines; a line break or a missing profile refused", () => {
    const eas = { build: { base: { env: { APP_VARIANT: "base", KEEP: "1" } }, production: { extends: "base", env: { APP_VARIANT: "production", EXPO_PUBLIC_APP_VARIANT: "production" } } } };
    expect(plan.profileEnv(eas, "production")).toEqual(["APP_VARIANT=production", "KEEP=1", "EXPO_PUBLIC_APP_VARIANT=production"]);
    expect(plan.profileEnv(JSON.parse(readFileSync(path.join(TEMPLATES, "eas/eas.json"), "utf8")), "production")).toEqual(["APP_VARIANT=production", "EXPO_PUBLIC_APP_VARIANT=production"]);
    expect(() => plan.profileEnv({ build: { production: { env: { X: "a\nb" } } } }, "production")).toThrow(/line break/);
    expect(() => plan.profileEnv({ build: {} }, "production")).toThrow(/no build profile/);
    expect(() => plan.profileEnv({ build: { a: { extends: "b" }, b: { extends: "a" } } }, "a")).toThrow(/loop/);
  });

  it("the platform's env overrides the common one, along extends, as EAS resolves it; --shell quotes for eval", () => {
    const eas = {
      build: {
        base: { env: { API: "common", A: "1" }, ios: { env: { API: "base-ios" } } },
        production: { extends: "base", env: { B: "2" }, android: { env: { API: "prod-android" } } },
      },
    };
    expect(plan.profileEnv(eas, "production", "ios")).toEqual(["API=base-ios", "A=1", "B=2"]);
    expect(plan.profileEnv(eas, "production", "android")).toEqual(["API=prod-android", "A=1", "B=2"]);
    expect(plan.profileEnv(eas, "production")).toEqual(["API=common", "A=1", "B=2"]);
    expect(plan.profileEnv({ build: { p: { env: { Q: "it's $HOME" } } } }, "p", "ios", true)).toEqual(["export Q='it'\\''s $HOME'"]);
    const out = execFileSync("bash", ["-c", `eval "$(printf '%s\\n' "$0")"; printf '%s' "$Q"`, plan.profileEnv({ build: { p: { env: { Q: "it's $HOME" } } } }, "p", "ios", true)[0]], { encoding: "utf8" });
    expect(out).toBe("it's $HOME");
    expect(() => plan.profileEnv(eas, "production", "web")).toThrow(/ios or android/);
  });

  // eas-cli 26.0.0's own output (build/update/queries.js renderUpdateGroupsOnBranch and
  // build/update/utils.js getUpdateGroupDescriptionsWithBranch; build/commands/update/view.js with
  // getUpdateWithFileUrlsJsonInfosForUpdates): update:list's entries have no commit, update:view's do.
  const sha = (c: string) => c.repeat(40);
  const LIST = {
    name: "production",
    id: "8c5b2a1e-0000-4000-8000-000000000001",
    currentPage: [
      { branch: "production", message: '"Fix the header" (1 hour ago by robot)', runtimeVersion: sha("f"), isRollBackToEmbedded: false, group: "group-new", platforms: "ios" },
      { branch: "production", message: '"Older" (2 hours ago by robot)', runtimeVersion: sha("f"), isRollBackToEmbedded: false, group: "group-old", platforms: "ios" },
    ],
  };
  const VIEW = [
    { id: "u-1", createdAt: "2026-11-14T11:00:00.000Z", group: "group-new", branch: "production", message: "Fix the header", runtimeVersion: sha("f"), platform: "ios", manifestPermalink: "https://u.expo.dev/x", isRollBackToEmbedded: false, gitCommitHash: sha("c"), assetMapUrl: null, sourceMapUrl: null },
    { id: "u-2", createdAt: "2026-11-14T11:00:00.000Z", group: "group-new", branch: "production", message: "Fix the header", runtimeVersion: sha("e"), platform: "android", manifestPermalink: "https://u.expo.dev/y", isRollBackToEmbedded: false, gitCommitHash: sha("c"), assetMapUrl: null, sourceMapUrl: null },
  ];

  // eas-cli 26.0.0's channel:view --json (channel/queries.js renderPageOfBranchesOnChannel): the
  // channel with its branches, which needn't be named after it.
  const CHANNEL = (...branches: string[]) => ({ currentPage: { id: "c-1", name: "production", isPaused: false, isProtected: false, branchMapping: "{}", updateBranches: branches.map((name, i) => ({ id: `b-${i}`, name, updateGroups: [] })) } });

  it("reads the latest group from update:list and its commit from update:view, as eas-cli 26 prints them", () => {
    expect(plan.latestGroup(LIST, "ios")).toBe("group-new");
    expect(plan.latestGroup({ name: "production", id: "N/A", currentPage: [] }, "ios")).toBe("");
    expect(() => plan.latestGroup([], "ios")).toThrow(/no currentPage/);
    expect(plan.groupCommit(VIEW, "android")).toBe(sha("c"));
    expect(plan.groupCommit([{ ...VIEW[0], gitCommitHash: null }], "ios")).toBe("");
    expect(plan.channelBranches(CHANNEL("stable"))).toEqual(["stable"]);
    expect(() => plan.channelBranches({ currentPage: {} })).toThrow(/updateBranches/);
  });

  it("resolves the channel's own branch (not one named after it), and every branch during a rollout", () => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === "channel:view") return JSON.stringify(CHANNEL("stable", "next"));
      if (args[0] === "update:list") return JSON.stringify(args[2] === "stable" ? LIST : { name: "next", id: "x", currentPage: [] });
      return JSON.stringify(VIEW);
    };
    expect(plan.latestCommits(run, "production", "ios")).toEqual([sha("c")]);
    expect(calls).toEqual([
      ["channel:view", "production", "--json", "--non-interactive"],
      ["update:list", "--branch", "stable", "--platform", "ios", "--limit", "1", "--json", "--non-interactive"],
      ["update:view", "group-new", "--json"],
      ["update:list", "--branch", "next", "--platform", "ios", "--limit", "1", "--json", "--non-interactive"],
    ]);
  });

  it("a channel or branch that doesn't exist yet (the first release) has no latest update; any other failure stops the plan", () => {
    const fails = (stderr: string) => () => {
      throw Object.assign(new Error("Command failed: eas"), { status: 1, stderr });
    };
    expect(plan.latestCommits(fails("Error: channel:view command failed.\nCould not find channel with the name production\n"), "production", "ios")).toEqual([]);
    expect(plan.branchCommit(fails('Could not find branch "production"\n'), "production", "ios")).toBe("");
    expect(() => plan.latestCommits(fails("Error: Entity not authorized\n"), "production", "ios")).toThrow(/Command failed/);
    // The command itself, with a stand-in `eas` that answers as eas-cli does: the channel names its
    // branch, which doesn't exist yet.
    const bin = tempDir("genesis-eas-bin-");
    writeTree(bin, { eas: `#!/usr/bin/env bash\nif [ "$1" = channel:view ]; then echo '${JSON.stringify(CHANNEL("production"))}'; exit 0; fi\necho "Could not find branch \\"$3\\"" >&2\nexit 1\n` });
    execFileSync("chmod", ["+x", path.join(bin, "eas")]);
    const out = execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "latest-commit", "production", "ios"], { encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    expect(out).toBe("");
  });

  it("refuses before publishing when this checkout's runtime version isn't the build's", () => {
    const out = (v: string) => `Using expo-updates\n{"runtimeVersion":"${v}","fingerprintSources":[]}\n`;
    expect(plan.checkRuntime(out(FP), "ios", FP)).toBe(FP);
    expect(() => plan.checkRuntime(out(AP), "ios", FP)).toThrow(/Nothing was published/);
    expect(() => plan.checkRuntime("nothing", "ios", FP)).toThrow(/printed no ios runtime version/);
  });

  it("masks what EAS handed over, never EXPO_PUBLIC_ values", () => {
    const base = plan.envDigests({ PATH: "/bin", SAME: "value" });
    expect(plan.maskLines({ PATH: "/bin", SAME: "value", SECRET: "s3cr3t-value", EXPO_PUBLIC_URL: "https://x", SHORT: "ab" }, base)).toEqual(["::add-mask::s3cr3t-value"]);
  });

  it("escapes a mask's value as the runner decodes it, so a literal %25 is masked as itself", () => {
    expect(plan.maskLines({ URL: "https://x.test/a%25b%20c" }, {})).toEqual(["::add-mask::https://x.test/a%2525b%2520c"]);
    expect(plan.escapeCommandData("50%\r\n")).toBe("50%25%0D%0A");
    // The runner's decoding (%0D, %0A, then %25) gives the value back.
    const decode = (t: string) => t.replace(/%0D/g, "\r").replace(/%0A/g, "\n").replace(/%25/g, "%");
    for (const value of ["a%25b", "%%25%0A", "plain"]) expect(decode(plan.escapeCommandData(value))).toBe(value);
  });

  it("matches only builds on the channel the updates go to, and refuses a profile on another channel", () => {
    const FPC = "c".repeat(40);
    const builds = [{ id: "b1", status: "FINISHED", platform: "IOS", buildProfile: "production", distribution: "STORE", channel: "production", fingerprint: { hash: FPC }, runtime: { version: FPC } }];
    const lines = (channel?: string) => Object.fromEntries(plan.planOutputs({ ios: { runtime: FPC, by: "fingerprint", builds } }, [], "production", channel ? { channel } : {}).map((l: string) => l.split("=")));
    expect(lines("production")).toMatchObject({ ios_action: "publish" });
    // A build that listens to "production" never takes an update published to "stable": EAS builds instead.
    expect(lines("stable")).toMatchObject({ ios_action: "eas", ios_has_build: "false" });
    expect(plan.pickBuildByRuntime([{ ...builds[0], runtime: { version: "1.0.0" } }], "1.0.0", "ios", "production", "stable")).toBeNull();
    const eas = { build: { base: { channel: "production" }, production: { extends: "base" }, own: { channel: "stable" } } };
    expect(() => plan.checkProfileChannel(eas, "production", "production")).not.toThrow();
    expect(() => plan.checkProfileChannel(eas, "production", "stable")).toThrow(/listen to the channel "production", but the release publishes to "stable"/);
    expect(() => plan.checkProfileChannel({ build: { production: {} } }, "production", "stable")).not.toThrow();
    // The plan step checks it first, and passes the channel to the plan.
    const run = (yaml("ci/native-release.yml", ctx({ channel: "stable" })).jobs.release.steps as { id?: string; run?: string }[]).find((st) => st.id === "plan")!.run!;
    expect(run.indexOf('native-release.mjs channel eas.json "$PROFILE" "$CHANNEL"')).toBe(run.indexOf("native-release.mjs"));
    expect(run).toContain('plan "$RUNNER_TEMP/release" "$PLATFORMS" "$PROFILE" "$CHANNEL"');
  });

  it("reads EAS's open release runs before the channel, so a run that finishes in between shows in the channel", () => {
    for (const runtimeCommand of [null, "node scripts/rv.mjs"]) {
      const run = (yaml("ci/native-release.yml", ctx({ runtimeCommand })).jobs.release.steps as { id?: string; run?: string }[]).find((st) => st.id === "plan")!.run!;
      expect(run.indexOf("eas workflow:runs")).toBeGreaterThan(-1);
      expect(run.indexOf("eas workflow:runs")).toBeLessThan(run.indexOf("latest-commit"));
      expect(run.indexOf("eas workflow:runs")).toBeLessThan(run.indexOf("for platform in"));
    }
  });

  it("a platform whose planning fails is held back alone: the other is planned, and the job fails at its end", () => {
    // planOutputs: the failed platform is neither published nor handed to EAS.
    const FPC = "c".repeat(40);
    const builds = [{ id: "b1", status: "FINISHED", platform: "IOS", buildProfile: "production", distribution: "STORE", fingerprint: { hash: FPC }, runtime: { version: FPC } }];
    const out = Object.fromEntries(plan.planOutputs({ ios: { runtime: FPC, by: "fingerprint", builds }, android: { failed: true } }, [], "production").map((l: string) => l.split("=")));
    expect(out).toMatchObject({ ios_action: "publish", android_action: "failed", publish_platforms: "ios", eas_platforms: "", failed_platforms: "android" });
    // The plan step itself, with an eas stand-in whose Android fingerprint fails.
    const steps = yaml("ci/native-release.yml", ctx()).jobs.release.steps as { id?: string; name?: string; run?: string; if?: string }[];
    const step = steps.find((st) => st.id === "plan")!;
    const app = tempDir("genesis-plan-isolated-");
    const bin = tempDir("genesis-plan-eas-");
    const build = JSON.stringify(builds);
    writeTree(app, { ".eas/scripts/native-release.mjs": readFileSync(path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "utf8"), "eas.json": JSON.stringify({ build: { production: { channel: "production" } } }) });
    writeTree(bin, {
      eas: `#!/usr/bin/env bash
case "$1" in
  workflow:runs) echo '[]' ;;
  fingerprint:generate) if [ "$3" = android ]; then echo "android prebuild failed" >&2; exit 1; fi; echo '{"hash":"${FPC}"}' ;;
  build:list) echo '${build}' ;;
  channel:view) echo "Could not find channel with the name production" >&2; exit 1 ;;
  *) exit 98 ;;
esac
`,
    });
    execFileSync("chmod", ["+x", path.join(bin, "eas")]);
    const temp = tempDir("genesis-plan-temp-");
    mkdirSync(path.join(temp, "release"));
    const output = path.join(temp, "output.txt");
    writeTree(temp, { "output.txt": "" });
    const result = spawnSync("bash", ["-eo", "pipefail", "-c", step.run!], {
      cwd: app,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: temp, GITHUB_OUTPUT: output, PLATFORMS: "ios,android", PROFILE: "production", CHANNEL: "production", GITHUB_SHA: "" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("::error title=android not planned::");
    expect(Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((l) => l.split("=")))).toMatchObject({ ios_action: "publish", android_action: "failed", failed_platforms: "android" });
    // Then the job fails, after the other platform went out; EAS gets a placeholder for a runtime version the plan never found.
    const last = steps.at(-1)!;
    expect(last.name).toBe("Every platform was planned");
    expect(last.if).toBe("${{ !cancelled() && steps.plan.outputs.failed_platforms != '' }}");
    expect(steps.find((st) => st.name === "Hand the release to EAS")!.run).toContain('"ios_runtime_version=${IOS_RUNTIME:-none}"');
  });

  it("runs as a script: plan reads the files eas printed", () => {
    const dir = tempDir("genesis-plan-");
    writeTree(dir, {
      "fingerprint-ios.json": JSON.stringify({ hash: FP }),
      "builds-ios.json": JSON.stringify([build("ios", FP)]),
      "runtime-android.txt": "android-1\n",
      "builds-android.json": JSON.stringify([build("android", "x", { runtime: { version: "android-1" } })]),
      "runs.json": "[]",
    });
    const out = execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "plan", dir, "ios,android", "production"], { encoding: "utf8" });
    expect(outputs(out.trim().split("\n"))).toMatchObject({ ios_action: "publish", android_action: "publish", android_runtime_version: "android-1" });
  });
});

describe("genesis add template", () => {
  const nativeApp = (files: Record<string, string> = {}) => makeApp({ "app.json": "{}", "pnpm-lock.yaml": "", ...files });

  it("writes the release lane, records it in the lock, and leaves a file the app already has as .genesis-next", () => {
    const root = nativeApp({ ".eas/workflows/deploy-production.yml": "name: mine\n", "genesis.config.json": JSON.stringify({ release: { platforms: ["ios"] } }) });
    const results = adoptTemplates(root, resolveTemplateNames(["release"]));
    expect(Object.fromEntries(results.map((r) => [r.path, r.outcome]))).toEqual({
      ".github/workflows/native-release.yml": "created",
      ".eas/workflows/deploy-production.yml": "next",
      ".eas/workflows/pr-preview.yml": "created",
      ".eas/scripts/native-release.mjs": "created",
      "fingerprint.config.js": "created",
      ".fingerprintignore": "created",
    });
    expect(read(root, ".eas/workflows/deploy-production.yml")).toBe("name: mine\n");
    const next = read(root, ".eas/workflows/deploy-production.yml.genesis-next");
    expect(Object.keys(parse(next).jobs).filter((j) => j.includes("android"))).toEqual([]);
    const lock = readLock(root);
    expect(lock.files[".eas/workflows/deploy-production.yml"]).toMatchObject({ source: `${CLI}:templates/release/deploy-production.yml`, pending: sha256(next), pendingMine: sha256("name: mine\n") });
    // The app's file never took that text: the checksum isn't it (nor the app's own), so no base is assumed.
    expect(lock.files[".eas/workflows/deploy-production.yml"]!.sha256).not.toBe(sha256(next));
    expect(lock.files[".eas/workflows/deploy-production.yml"]!.sha256).not.toBe(sha256("name: mine\n"));
    expect(lock.files[".github/workflows/native-release.yml"]!.sha256).toBe(sha256(read(root, ".github/workflows/native-release.yml")));
    // Run again: nothing new; .genesis-next is left for the app.
    expect(adoptTemplates(root, ["release/deploy-production.yml"])[0]).toMatchObject({ outcome: "next" });
    // --replace, once the app's choices are in genesis.config.json.
    expect(adoptTemplates(root, ["release/deploy-production.yml"], { replace: true })[0]).toMatchObject({ outcome: "replaced" });
    expect(read(root, ".eas/workflows/deploy-production.yml")).toBe(next);
    expect(existsSync(path.join(root, ".eas/workflows/deploy-production.yml.genesis-next"))).toBe(false);
  });

  it("holds native-release.yml back while the app's own deploy-production.yml still releases on push, and names it", () => {
    const old = "name: Deploy production\non:\n  push:\n    branches: [main]\njobs:\n  update:\n    type: update\n";
    const root = nativeApp({ ".eas/workflows/deploy-production.yml": old });
    const results = adoptTemplates(root, resolveTemplateNames(["release"]));
    expect(results.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "next" });
    expect(results.find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "held" });
    expect(existsSync(path.join(root, ".github/workflows/native-release.yml"))).toBe(false);
    expect(competingReleaseWorkflows(root, null)).toEqual([".eas/workflows/deploy-production.yml"]);
    // Once it takes the dispatch-only version, the lane goes in.
    const replaced = adoptTemplates(root, resolveTemplateNames(["release"]), { replace: true });
    expect(replaced.find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "created" });
    expect(competingReleaseWorkflows(root, null)).toEqual([]);
  });

  it("the eas set never swaps an app's push-triggered deploy-production.yml for the dispatch-only one without the dispatcher", () => {
    const old = "name: Deploy production\non:\n  push:\n    branches: [main]\njobs:\n  update:\n    type: update\n";
    const root = nativeApp({ ".eas/workflows/deploy-production.yml": old });
    // Even unedited and locked (so it would otherwise be updated), and with --replace.
    const lock = readLock(root);
    lock.files[".eas/workflows/deploy-production.yml"] = { source: `${CLI}:templates/eas/workflows/deploy-production.yml`, sha256: sha256(old) };
    writeLock(root, lock);
    for (const replace of [false, true]) {
      const results = adoptTemplates(root, resolveTemplateNames(["eas"]), { replace });
      expect(results.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "held", detail: expect.stringContaining("genesis add template release") });
      expect(read(root, ".eas/workflows/deploy-production.yml")).toBe(old);
      // The set's other templates still go in.
      expect(results.find((r) => r.path === ".eas/workflows/pr-preview.yml")?.outcome).toMatch(/created|unchanged|replaced/);
    }
    // With the release set, the lane goes in whole (its own adoption checks hold native-release.yml while the old file pushes).
    expect(adoptTemplates(root, resolveTemplateNames(["release"])).find((r) => r.path === ".eas/workflows/deploy-production.yml")?.outcome).toBe("updated");
    // An app without a push-triggered one (none, or the dispatch-only lane) takes it from the eas set as usual.
    expect(adoptTemplates(nativeApp(), resolveTemplateNames(["eas"])).find((r) => r.path === ".eas/workflows/deploy-production.yml")?.outcome).toBe("created");
  });

  it("a release command is eas update, build or workflow:run, never a query of the same family", () => {
    for (const yes of ['"./node_modules/.bin/eas" update --channel production', "'eas' update --auto", '"eas-cli@26.0.0" build', "./node_modules/.bin/eas update --auto", "node_modules/.bin/eas build -p ios", "/usr/local/bin/eas workflow:run d.yml", "eas update --auto", "eas build -p ios", "eas workflow:run deploy.yml", "npx --yes eas-cli@26.0.0 update --channel production", "npx eas-cli build", "x && eas update"]) expect(RELEASE_COMMAND.test(yes), yes).toBe(true);
    for (const no of ["eas build:list --json", "eas update:view g", "eas update:list --branch main", "eas workflow:runs --json", "eas build:view", "eas env:exec production x", "overseas update", "my-eas update", "./node_modules/.bin/eas build:list --json", "node_modules/.bin/eas update:view g", '"./node_modules/.bin/eas" build:list --json', "'eas' update:view g"]) expect(RELEASE_COMMAND.test(no), no).toBe(false);
    // A GitHub workflow on push to main that only queries EAS is no rival.
    const gh = makeApp({ ".github/workflows/status.yml": "on:\n  push:\n    branches: [main]\njobs:\n  a:\n    steps:\n      - run: eas build:list --json && eas update:view g --json\n" });
    expect(competingReleaseWorkflows(gh, null)).toEqual([]);
  });

  it("finds a push trigger however it's written", () => {
    expect(hasPushTrigger("on:\n  push:\n    branches: [main]\n")).toBe(true);
    expect(hasPushTrigger("on: [push, pull_request]\n")).toBe(true);
    expect(hasPushTrigger("on: push\n")).toBe(true);
    expect(hasPushTrigger("on:\n  workflow_dispatch:\n    inputs:\n      push:\n        type: string\n")).toBe(false);
    expect(hasPushTrigger("on:\n  pull_request:\n  # push:\n")).toBe(false);
  });

  it("counts a push trigger only when it can fire on main: no filter, a matching branches glob, not ignored", () => {
    const push = (filter: string) => `on:\n  push:\n${filter}jobs:\n  u:\n    type: update\n`;
    expect(hasPushTrigger(push(""))).toBe(true);
    expect(hasPushTrigger(push("    branches: [preview]\n"))).toBe(false);
    expect(hasPushTrigger(push("    branches:\n      - preview\n      - 'release/*'\n"))).toBe(false);
    expect(hasPushTrigger(push("    branches:\n      - preview\n      - \"ma*\"\n"))).toBe(true);
    expect(hasPushTrigger(push("    branches: ['**']\n"))).toBe(true);
    expect(hasPushTrigger(push("    branches: ['**', '!main']\n"))).toBe(false);
    expect(hasPushTrigger(push("    branches_ignore: [main]\n"))).toBe(false);
    expect(hasPushTrigger(push("    branches-ignore:\n      - 'feature/*'\n"))).toBe(true);
    expect(hasPushTrigger(push("    tags: ['v*']\n    branches: [main]\n"))).toBe(true);
    // A merge key brings its filters in: a preview-only push stays preview-only.
    expect(hasPushTrigger("x-push: &preview\n  branches: [preview]\non:\n  push:\n    <<: *preview\n")).toBe(false);
    expect(hasPushTrigger("x-push: &main\n  branches: [main]\non:\n  push:\n    <<: *main\n")).toBe(true);
    expect(hasPushTrigger("x: &defaults\n  branches: [preview]\non:\n  push: { <<: *defaults }\n")).toBe(false);
    // Tags alone: a tag push, not a branch push.
    expect(hasPushTrigger(push("    tags: ['v*']\n"))).toBe(false);
    // Flow forms, quoted or not.
    expect(hasPushTrigger('on: {"push": {"branches": ["main"]}}\n')).toBe(true);
    expect(hasPushTrigger("on: {push: {branches: [preview]}}\n")).toBe(false);
    expect(hasPushTrigger("on: {'push': {'tags': ['v*']}}\n")).toBe(false);
    expect(hasPushTrigger('on: ["push"]\n')).toBe(true);
    expect(hasPushTrigger("on: {pull_request: {}}\n")).toBe(false);
    expect(hasPushTrigger("on:\n  push: {branches: [main]}\n")).toBe(true);
    expect(hasPushTrigger("on:\n  push: {branches: [preview]}\n")).toBe(false);
    // A preview lane on its own branch is no rival: the lane goes in, and the doctor stays quiet.
    const root = makeApp({ "app.json": "{}", "pnpm-lock.yaml": "", ".eas/workflows/preview.yml": push("    branches: [preview]\n") });
    expect(competingReleaseWorkflows(root, null)).toEqual([]);
    expect(adoptTemplates(root, resolveTemplateNames(["release"])).find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "created" });
    // A job type with a comment after it is still a release job.
    const commented = makeApp({ ".eas/workflows/ship.yml": "on:\n  push:\n    branches: [main]\njobs:\n  u:\n    type: update # production\n" });
    expect(competingReleaseWorkflows(commented, null)).toEqual([".eas/workflows/ship.yml"]);
    // A GitHub workflow that only runs by hand can't double a release; one on push to main can.
    const gh = makeApp({
      ".github/workflows/manual.yml": "on:\n  workflow_dispatch: {}\njobs:\n  a:\n    steps:\n      - run: eas update --channel production\n",
      ".github/workflows/auto.yml": "on:\n  push:\n    branches: [main]\njobs:\n  a:\n    steps:\n      - run: eas update --channel production\n",
    });
    expect(competingReleaseWorkflows(gh, null)).toEqual([".github/workflows/auto.yml"]);
    const rival = makeApp({ "app.json": "{}", "pnpm-lock.yaml": "", ".eas/workflows/ship.yml": push("    branches: [main, preview]\n") });
    expect(competingReleaseWorkflows(rival, null)).toEqual([".eas/workflows/ship.yml"]);
    expect(adoptTemplates(rival, resolveTemplateNames(["release"])).find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "held" });
  });

  it("leaves the lock's checksum where the app's file was when the new text goes to .genesis-next", () => {
    const root = nativeApp();
    adoptTemplates(root, ["eas/workflows/rollout.yml"]);
    const taken = readLock(root).files[".eas/workflows/rollout.yml"]!.sha256;
    // The app edits the file; then the release block changes what the template renders.
    writeTree(root, { ".eas/workflows/rollout.yml": read(root, ".eas/workflows/rollout.yml").replace("name: Rollout", "name: Our rollout") });
    adoptTemplates(root, ["release/deploy-production.yml"]);
    writeTree(root, { ".eas/workflows/deploy-production.yml": read(root, ".eas/workflows/deploy-production.yml") + "# ours\n", "genesis.config.json": JSON.stringify({ release: { platforms: ["ios"] } }) });
    const deployTaken = readLock(root).files[".eas/workflows/deploy-production.yml"]!.sha256;
    const [result] = adoptTemplates(root, ["release/deploy-production.yml"]);
    expect(result).toMatchObject({ outcome: "next" });
    const entry = readLock(root).files[".eas/workflows/deploy-production.yml"]!;
    // Only the pending markers moved: the next upgrade still merges against what the file took.
    expect(entry.sha256).toBe(deployTaken);
    expect(entry.pending).toBe(sha256(read(root, ".eas/workflows/deploy-production.yml.genesis-next")));
    expect(readLock(root).files[".eas/workflows/rollout.yml"]!.sha256).toBe(taken);
  });

  it("applies a changed release block to the files the app hasn't edited", () => {
    const root = nativeApp();
    adoptTemplates(root, resolveTemplateNames(["release"]));
    expect(read(root, ".eas/workflows/deploy-production.yml")).toContain("update_android");
    writeTree(root, { "genesis.config.json": JSON.stringify({ release: { platforms: ["ios"], sentry: true } }) });
    const again = adoptTemplates(root, resolveTemplateNames(["release"]));
    expect(again.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "updated" });
    expect(again.find((r) => r.path === ".eas/scripts/native-release.mjs")).toMatchObject({ outcome: "unchanged" });
    expect(read(root, ".eas/workflows/deploy-production.yml")).not.toContain("update_android");
    expect(read(root, ".github/workflows/native-release.yml")).toContain("Sentry can take the source maps");
  });

  it("with appFolder, writes native-release.yml in the repository's .github/workflows", () => {
    const repo = tempDir();
    const root = path.join(repo, "mobile");
    mkdirSync(root);
    writeTree(root, { "app.json": "{}", "package.json": "{}", "bun.lock": "", "genesis.config.json": JSON.stringify({ appFolder: "mobile", release: { paths: ["app/src"] } }) });
    const [result] = adoptTemplates(root, ["ci/native-release.yml"]);
    expect(result).toMatchObject({ path: ".github/workflows/native-release.yml", location: "../.github/workflows/native-release.yml", outcome: "created" });
    const doc = parse(read(repo, ".github/workflows/native-release.yml")) as Record<string, any>;
    expect(doc.on.push.paths.slice(0, 3)).toEqual(["mobile/**", "app/src/**", "package.json"]);
    expect(doc.jobs.release.steps.some((s: { run?: string }) => s.run === "bun install --frozen-lockfile")).toBe(true);
    expect(existsSync(path.join(root, ".github"))).toBe(false);
  });

  it("keeps the lock's pin when the release's commit can't be looked up", async () => {
    const web = makeApp({ "vite.config.ts": "" });
    adoptTemplates(web, resolveTemplateNames(["ci"]), { pin: PIN });
    expect(read(web, ".github/workflows/ci.yml")).toContain(`@${PIN.sha}`);
    expect(await addTemplates(web, ["ci"], { findPin: () => null, log: () => {} })).toBe(0);
    expect(read(web, ".github/workflows/ci.yml")).toContain(`app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0`);
    expect(read(web, ".github/workflows/ci.yml")).not.toContain("@GENESIS_SHA");
  });

  it("writes Vercel's gate where it goes, pinned, and lists what an app doesn't have", () => {
    const web = makeApp({ "vite.config.ts": "" });
    expect(missingTemplateSets(web, readLock(web))).toEqual(["ci", "vercel"]);
    const results = adoptTemplates(web, resolveTemplateNames(["vercel", "ci"]), { pin: PIN });
    expect(results.map((r) => r.path)).toEqual(["scripts/vercel-ignore-build.sh", "vercel.json", ".github/workflows/ci.yml", ".github/workflows/claude-review.yml", ".github/workflows/genesis-upgrade.yml"]);
    expect(read(web, ".github/workflows/ci.yml")).toContain(`app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0`);
    expect(readLock(web).pin).toEqual(PIN);
    expect(missingTemplateSets(web, readLock(web))).toEqual([]);
  });
});

describe("genesis upgrade and the release lane", () => {
  const release = (packages: Record<string, string>, version = "2.0.0"): ReleaseLookup => ({ release: () => ({ version, packages }), latest: () => null });
  /** An app in mobile/ whose CLI ships `templates` (relative to templates/). */
  const monorepo = (config: Record<string, unknown>) => {
    const repo = tempDir();
    const root = path.join(repo, "mobile");
    mkdirSync(root);
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeTree(root, { "package.json": JSON.stringify({ name: "a", devDependencies: { [CLI]: "^1.0.0" } }), "app.json": "{}", "pnpm-lock.yaml": "", "genesis.config.json": JSON.stringify({ appFolder: "mobile", ...config }) });
    return { repo, root };
  };
  const ship = (root: string, version: string, files: Record<string, string>) => fakePackage(root, CLI, { version }, Object.fromEntries(Object.entries(files).map(([k, v]) => [`dist/templates/${k}`, v])));

  it("refreshes native-release.yml in the repository's .github/workflows under appFolder, and merges the app's edits", async () => {
    const { repo, root } = monorepo({ release: { platforms: ["ios"] } });
    const v1 = template("ci/native-release.yml");
    ship(root, "1.0.0", { "ci/native-release.yml": v1 });
    adoptTemplates(root, ["ci/native-release.yml"], { dir: path.join(root, "node_modules", CLI, "dist", "templates") });
    const file = path.join(".github", "workflows", "native-release.yml");
    // The app adds a line of its own.
    writeTree(repo, { [file]: read(repo, file).replace("name: Native release\n", "name: Native release\n# ours\n") });
    const v2 = v1.replace("timeout-minutes: 30", "timeout-minutes: 40");
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/native-release.yml": v2 }), doctor: false, pin: () => PIN });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "merged" });
    const text = read(repo, file);
    expect(text).toContain("# ours");
    expect(text).toContain("timeout-minutes: 40");
    expect(text).toContain('- "mobile/**"');
    expect(text).not.toContain("Publish the Android update");
  });

  it("keeps naming a shared workflow under appFolder; moves its Genesis pin only when the template didn't change", async () => {
    const setup = () => {
      const { repo, root } = monorepo({});
      const ci = template("ci/app-ci.yml");
      ship(root, "1.0.0", { "ci/app-ci.yml": ci });
      writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(ci) } } });
      const theirs = `jobs:\n  mine: {}\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0\n  other:\n    uses: marktiderman/genesis/.github/workflows/supabase-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0\n`;
      writeTree(repo, { ".github/workflows/ci.yml": theirs });
      return { repo, root, ci, theirs };
    };
    // The template changed: the reusable workflow may want new inputs, so the pin stays, and the note says to move it.
    const changed = setup();
    const report = await runUpgrade({ root: changed.root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": changed.ci.replace("name: CI", "name: App CI") }), doctor: false, pin: () => PIN });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "repository" });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")!.detail).toContain(`move its Genesis pin to 2.40.0 (${PIN.sha})`);
    expect(read(changed.repo, ".github/workflows/ci.yml")).toBe(changed.theirs);
    expect(readLock(changed.root).pin).toEqual(PIN);
    // Unchanged: the pin moves, only for the workflow the template calls.
    const same = setup();
    const moved = await runUpgrade({ root: same.root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": same.ci }), doctor: false, pin: () => PIN });
    expect(moved.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "updated" });
    expect(read(same.repo, ".github/workflows/ci.yml")).toBe(same.theirs.replace(`app-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0`, `app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0`));
    expect(moved.files).toContain("../.github/workflows/ci.yml");
  });

  it("keeps a shared workflow's unapplied template change pending, so a later release can't move its pin past it", async () => {
    const { repo, root } = monorepo({});
    const v1 = template("ci/app-ci.yml");
    const v2 = v1.replace("name: CI", "name: App CI");
    ship(root, "1.0.0", { "ci/app-ci.yml": v1 });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(v1) } } });
    const old = `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0\n`;
    writeTree(repo, { ".github/workflows/ci.yml": old });
    // P2 changes the template: the pin stays, and the lock still records P1's.
    const p2 = { sha: "2".repeat(40), version: "2.0.0" };
    await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p2 });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.sha256).toBe(sha256(v1));
    // P3 leaves it as P2 had it: still the change to apply, so the pin still stays.
    const p3 = { sha: "3".repeat(40), version: "3.0.0" };
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.3.0" }), install: (r) => void ship(r, "1.3.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p3 });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "repository" });
    expect(read(repo, ".github/workflows/ci.yml")).toBe(old);
    // Once the app moves the pin itself (with the change), the lock takes it.
    writeTree(repo, { ".github/workflows/ci.yml": old.replace(`${"b".repeat(40)} # @marktiderman/genesis@1.9.0`, `${p3.sha} # @marktiderman/genesis@3.0.0`) });
    const done = await runUpgrade({ root, lookup: release({ [CLI]: "1.4.0" }), install: (r) => void ship(r, "1.4.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p3 });
    expect(done.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "updated" });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.sha256).not.toBe(sha256(v1));
  });

  it("records which release a shared workflow waits on, and takes it once the app pins that release", async () => {
    const { repo, root } = monorepo({});
    const v1 = template("ci/app-ci.yml");
    const v2 = v1.replace("name: CI", "name: App CI");
    ship(root, "1.0.0", { "ci/app-ci.yml": v1 });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(v1) } } });
    const old = `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0\n`;
    writeTree(repo, { ".github/workflows/ci.yml": old });
    const p2 = { sha: "2".repeat(40), version: "2.0.0" };
    await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p2 });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toEqual(p2);
    // The app applies P2's change by hand, pinning P2.
    writeTree(repo, { ".github/workflows/ci.yml": old.replace(`${"b".repeat(40)} # @marktiderman/genesis@1.9.0`, `${p2.sha} # @marktiderman/genesis@2.0.0`) });
    // P3 doesn't change the template: the change P2 brought is applied, so the lock takes it and the pin moves on.
    const p3 = { sha: "3".repeat(40), version: "3.0.0" };
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.3.0" }), install: (r) => void ship(r, "1.3.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p3 });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "updated" });
    const entry = readLock(root).files[".github/workflows/ci.yml"]!;
    expect(entry.awaiting).toBeUndefined();
    expect(entry.sha256).not.toBe(sha256(v1));
    // Settled: the next release with the same template moves the pin by itself.
    const p4 = { sha: "4".repeat(40), version: "4.0.0" };
    await runUpgrade({ root, lookup: release({ [CLI]: "1.4.0" }), install: (r) => void ship(r, "1.4.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p4 });
    expect(read(repo, ".github/workflows/ci.yml")).toContain(`app-ci.yml@${p4.sha} # @marktiderman/genesis@4.0.0`);
  });

  it("moves `awaiting` to the newest release that changes the template: applying P2 isn't applying P3", async () => {
    const { repo, root } = monorepo({});
    const v1 = template("ci/app-ci.yml");
    const v2 = v1.replace("name: CI", "name: App CI");
    const v3 = v2.replace("name: App CI", "name: App CI 3");
    ship(root, "1.0.0", { "ci/app-ci.yml": v1 });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(v1) } } });
    const caller = (pin: { sha: string; version: string }) => `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${pin.sha} # @marktiderman/genesis@${pin.version}\n`;
    writeTree(repo, { ".github/workflows/ci.yml": caller({ sha: "b".repeat(40), version: "1.9.0" }) });
    const p2 = { sha: "2".repeat(40), version: "2.0.0" };
    const p3 = { sha: "3".repeat(40), version: "3.0.0" };
    await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p2 });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toEqual(p2);
    // The app applies P2's change and pins P2; then P3 changes the template again.
    writeTree(repo, { ".github/workflows/ci.yml": caller(p2) });
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.3.0" }), install: (r) => void ship(r, "1.3.0", { "ci/app-ci.yml": v3 }), doctor: false, pin: () => p3 });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "repository" });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")!.detail).toContain("Until its pin names 3.0.0 or later");
    const entry = readLock(root).files[".github/workflows/ci.yml"]!;
    expect(entry.awaiting).toEqual(p3);
    expect(entry.sha256).toBe(sha256(v1));
    expect(read(repo, ".github/workflows/ci.yml")).toBe(caller(p2));
    // Applying P3 (pinning it) settles it.
    writeTree(repo, { ".github/workflows/ci.yml": caller(p3) });
    const settled = await runUpgrade({ root, lookup: release({ [CLI]: "1.4.0" }), install: (r) => void ship(r, "1.4.0", { "ci/app-ci.yml": v3 }), doctor: false, pin: () => p3 });
    expect(settled.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "updated" });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toBeUndefined();
  });

  it("without the release's commit, a template change still moves `awaiting` to this release, by version", async () => {
    const { repo, root } = monorepo({});
    const v1 = template("ci/app-ci.yml");
    const v2 = v1.replace("name: CI", "name: App CI");
    const v3 = v2.replace("name: App CI", "name: App CI 3");
    ship(root, "1.0.0", { "ci/app-ci.yml": v1 });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(v1) } } });
    const caller = (pin: { sha: string; version: string }) => `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${pin.sha} # @marktiderman/genesis@${pin.version}\n`;
    writeTree(repo, { ".github/workflows/ci.yml": caller({ sha: "b".repeat(40), version: "1.9.0" }) });
    const p2 = { sha: "2".repeat(40), version: "2.0.0" };
    await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }, "2.0.0"), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": v2 }), doctor: false, pin: () => p2 });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toEqual(p2);
    writeTree(repo, { ".github/workflows/ci.yml": caller(p2) });
    // P3 changes the template again, and git ls-remote fails: the marker still moves, to 3.0.0.
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.3.0" }, "3.0.0"), install: (r) => void ship(r, "1.3.0", { "ci/app-ci.yml": v3 }), doctor: false, pin: () => null });
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "repository" });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toEqual({ sha: "", version: "3.0.0" });
    // The copy pinned at P2 doesn't settle it; one pinned at 3.0.0 does, by version.
    await runUpgrade({ root, lookup: release({ [CLI]: "1.3.1" }, "3.0.1"), install: (r) => void ship(r, "1.3.1", { "ci/app-ci.yml": v3 }), doctor: false, pin: () => null });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toEqual({ sha: "", version: "3.0.0" });
    writeTree(repo, { ".github/workflows/ci.yml": caller({ sha: "3".repeat(40), version: "3.0.0" }) });
    const settled = await runUpgrade({ root, lookup: release({ [CLI]: "1.3.2" }, "3.0.2"), install: (r) => void ship(r, "1.3.2", { "ci/app-ci.yml": v3 }), doctor: false, pin: () => null });
    expect(settled.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "updated" });
    expect(readLock(root).files[".github/workflows/ci.yml"]!.awaiting).toBeUndefined();
  });

  it("never moves a shared workflow's pin back to an older release", async () => {
    const { repo, root } = monorepo({});
    const ci = template("ci/app-ci.yml");
    ship(root, "1.0.0", { "ci/app-ci.yml": ci });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(ci) } } });
    // The repository's caller already names P4; this app upgrades to P3 with an unchanged template.
    const p4 = `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${"4".repeat(40)} # @marktiderman/genesis@4.0.0\n`;
    writeTree(repo, { ".github/workflows/ci.yml": p4 });
    await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }, "3.0.0"), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": ci }), doctor: false, pin: () => ({ sha: "3".repeat(40), version: "3.0.0" }) });
    expect(read(repo, ".github/workflows/ci.yml")).toBe(p4);
  });

  it("never writes a pin through a symlinked workflow", async () => {
    const { repo, root } = monorepo({});
    const ci = template("ci/app-ci.yml");
    ship(root, "1.0.0", { "ci/app-ci.yml": ci });
    writeLock(root, { version: 1, blocks: {}, files: { ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256(ci) } } });
    const outside = tempDir("genesis-outside-");
    const target = path.join(outside, "ci.yml");
    const theirs = `jobs:\n  app:\n    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${"b".repeat(40)} # @marktiderman/genesis@1.9.0\n`;
    writeTree(outside, { "ci.yml": theirs });
    mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true });
    symlinkSync(target, path.join(repo, ".github", "workflows", "ci.yml"));
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "ci/app-ci.yml": ci }), doctor: false, pin: () => PIN });
    expect(readFileSync(target, "utf8")).toBe(theirs);
    expect(report.summary).toMatch(/symlink/);
  });

  it("an app on the push-triggered EAS lane isn't switched by an upgrade: its deploy-production.yml is held, and the summary says how to adopt", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", devDependencies: { [CLI]: "^1.0.0" } }), "app.json": "{}", "pnpm-lock.yaml": "" });
    const old = "name: Deploy production\non:\n  push:\n    branches: [main]\njobs: {}\n";
    // The previous release shipped it at its old path, and the lock says so.
    ship(root, "1.0.0", { "eas/workflows/deploy-production.yml": old });
    writeTree(root, { ".eas/workflows/deploy-production.yml": old });
    writeLock(root, { version: 1, blocks: {}, files: { ".eas/workflows/deploy-production.yml": { source: `${CLI}:templates/eas/workflows/deploy-production.yml`, sha256: sha256(old) } } });
    const release2 = (r: string) => void ship(r, "1.2.0", Object.fromEntries(resolveTemplateNames(["release"]).map((t) => [t, template(t)])));
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: release2, doctor: false });
    expect(report.refreshed.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "held" });
    expect(readLock(root).files[".eas/workflows/deploy-production.yml"]!.source).toBe(`${CLI}:templates/release/deploy-production.yml`);
    expect(read(root, ".eas/workflows/deploy-production.yml")).toBe(old);
    expect(existsSync(path.join(root, ".github/workflows/native-release.yml"))).toBe(false);
    expect(readLock(root).files[".github/workflows/native-release.yml"]).toBeUndefined();
    expect(report.oldLane).toBe(true);
    expect(report.summary).toContain("`genesis add release`");
    // Adopting it then switches the app: the unedited old file takes the new one, and the lane goes in.
    const adopted = adoptTemplates(root, resolveTemplateNames(["release"]), { dir: path.join(root, "node_modules", CLI, "dist", "templates") });
    expect(adopted.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "updated" });
    expect(adopted.find((r) => r.path === ".github/workflows/native-release.yml")).toMatchObject({ outcome: "created" });
    expect(Object.keys(parse(read(root, ".eas/workflows/deploy-production.yml")).on)).toEqual(["workflow_dispatch"]);
  });

  it("puts the lock in the pull request whenever this run changed it", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", devDependencies: { [CLI]: "^1.0.0" } }), "app.json": "{}" });
    const v1 = template("eas/workflows/rollout.yml");
    ship(root, "1.0.0", { "eas/workflows/rollout.yml": v1 });
    writeTree(root, { ".eas/workflows/rollout.yml": v1 });
    writeLock(root, { version: 1, blocks: {}, files: { ".eas/workflows/rollout.yml": { source: `${CLI}:templates/eas/workflows/rollout.yml`, sha256: sha256(v1) } } });
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: (r) => void ship(r, "1.2.0", { "eas/workflows/rollout.yml": v1.replace("name: Rollout", "name: Rollout 2") }), doctor: false });
    expect(report.files).toContain("genesis.lock.json");
  });
});

describe("every eas command the lane runs exists in eas-cli 26.0.0", () => {
  // The commands' flag definitions, read from eas-cli 26.0.0's command classes
  // (test/fixtures/eas-cli-commands.cjs writes this file from an installed eas-cli).
  const FIXTURE = path.join(__dirname, "fixtures", "eas-cli-26.0.0-commands.json");
  const spec = JSON.parse(readFileSync(FIXTURE, "utf8")) as { "eas-cli": string; commands: Record<string, { args: string[]; flags: Record<string, { char?: string }> }> };

  /** Each `eas <command> …` (or `npx --yes eas-cli@26.0.0 <command> …`) in a shell text, with its flags; quoted strings removed first. */
  const easCalls = (text: string) => {
    const calls: { command: string; flags: string[]; line: string }[] = [];
    for (const raw of text.split("\n")) {
      // A command eas env:exec runs is written in single quotes: checked too.
      for (const quoted of raw.matchAll(/'([^']*)'/g)) if (/\beas\s/.test(quoted[1]!)) calls.push(...easCalls(quoted[1]!));
      const line = raw.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
      const args = /^\s*args\+?=\((.*)\)\s*$/.exec(line);
      if (args) {
        calls.push({ command: "workflow:run", flags: [...args[1]!.matchAll(/(?:^|\s)(-{1,2}[A-Za-z][\w-]*)/g)].map((m) => m[1]!), line: raw });
        continue;
      }
      for (const m of line.matchAll(/(?:^|[\s;(&|])(?:eas|npx --yes eas-cli@26\.0\.0)\s+([a-z][a-z:-]*)((?:\s+[^\s;|&<>]+)*)/g)) {
        const tokens = (m[2] ?? "").trim().split(/\s+/).filter(Boolean);
        calls.push({ command: m[1]!, flags: tokens.filter((t) => /^-{1,2}[A-Za-z]/.test(t)).map((t) => t.replace(/=.*$/, "")), line: raw });
      }
    }
    return calls;
  };
  const check = (calls: ReturnType<typeof easCalls>, where: string) => {
    for (const call of calls) {
      const command = spec.commands[call.command];
      expect(command, `${where}: eas ${call.command} isn't a command this test knows (${call.line.trim()})`).toBeDefined();
      for (const flag of call.flags) {
        const known = flag.startsWith("--") ? flag.slice(2) in command!.flags : Object.values(command!.flags).some((f) => f.char === flag.slice(1));
        expect(known, `${where}: eas ${call.command} has no flag ${flag} in eas-cli 26.0.0 (${call.line.trim()})`).toBe(true);
      }
    }
  };

  it("the fixture is eas-cli 26.0.0's, and matches an installed copy when there is one", () => {
    expect(spec["eas-cli"]).toBe("26.0.0");
    const caches = path.join(process.env.HOME ?? "", ".npm", "_npx");
    const installed = existsSync(caches)
      ? readdirSync(caches).map((d) => path.join(caches, d, "node_modules", "eas-cli")).find((d) => {
          try {
            return JSON.parse(readFileSync(path.join(d, "package.json"), "utf8")).version === "26.0.0";
          } catch {
            return false;
          }
        })
      : undefined;
    if (!installed) return;
    const fresh = execFileSync("node", [path.join(__dirname, "fixtures", "eas-cli-commands.cjs"), installed], { encoding: "utf8" });
    expect(JSON.parse(fresh)).toEqual(spec);
  });

  it("finds the calls it checks, and catches a flag that doesn't exist", () => {
    expect(easCalls(`eas env:exec production 'x -- env A=1 eas update --channel "c" --json' --non-interactive`).map((c) => c.command)).toEqual(["update", "env:exec"]);
    expect(easCalls('eas update:view "$g" --json --non-interactive')).toEqual([{ command: "update:view", flags: ["--json", "--non-interactive"], line: 'eas update:view "$g" --json --non-interactive' }]);
    const bad = easCalls("eas update:view group --non-interactive")[0]!;
    expect(bad.flags.some((f) => !(f.slice(2) in spec.commands["update:view"]!.flags))).toBe(true);
  });

  it("in every render of the workflows", () => {
    for (const platforms of [["ios", "android"], ["ios"], ["android"]] as const) {
      for (const sentry of [false, true]) {
        for (const runtimeCommand of [null, "node scripts/rv.mjs"]) {
          for (const pushHook of [null, { script: "scripts/p.mjs", secrets: [] }]) {
            const c = ctx({ platforms: [...platforms], sentry, runtimeCommand, pushHook });
            for (const rel of ["ci/native-release.yml", "release/deploy-production.yml"]) {
              const doc = parse(renderRelease(template(rel), c)) as { jobs: Record<string, { steps?: { run?: string }[] }> };
              const runs = Object.values(doc.jobs).flatMap((j) => (j.steps ?? []).map((st) => st.run ?? "")).join("\n");
              const calls = easCalls(runs);
              expect(calls.length, rel).toBeGreaterThanOrEqual(rel.startsWith("ci/") ? 6 : 1);
              check(calls, rel);
            }
          }
        }
      }
    }
  });

  it("in the script", () => {
    const seen: string[][] = [];
    const run = (args: string[]) => {
      seen.push(args);
      if (args[0] === "channel:view") return JSON.stringify({ currentPage: { name: "production", updateBranches: [{ name: "production" }] } });
      return JSON.stringify(args[0] === "update:list" ? { name: "production", id: "x", currentPage: [{ group: "g", platforms: "ios" }] } : [{ platform: "ios", gitCommitHash: "c".repeat(40) }]);
    };
    plan.latestCommits(run, "production", "ios");
    expect(seen.map((a) => a[0])).toEqual(["channel:view", "update:list", "update:view"]);
    check(seen.map((a) => ({ command: a[0]!, flags: a.filter((t) => t.startsWith("-")), line: `eas ${a.join(" ")}` })), "native-release.mjs");
    // The script runs a command only through latestCommit's runner (eas, or RELEASE_EAS).
    expect([...readFileSync(path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "utf8").matchAll(/execFileSync\(/g)]).toHaveLength(1);
    // Its only other command is git, for the order check.
    expect([...readFileSync(path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "utf8").matchAll(/spawnSync\("([^"]+)"/g)].map((m) => m[1])).toEqual(["git", "git"]);
  });
});

describe("npx never fetches a package the lane didn't pin", () => {
  // An npx call may run the app's own installed tool (`npx --no <bin>`, which never installs), or a
  // package pinned to an exact version from this list (`npx --yes <package>@<x.y.z>`). Anything
  // else could fetch whatever npm serves under that name and run it with the release's secrets.
  const PINNABLE = new Set(["eas-cli"]);
  const files = [
    ...walkFiles(TEMPLATES),
    ...walkFiles(path.join(STARTER, ".eas")),
    ...walkFiles(path.join(STARTER, ".maestro")),
    path.join(STARTER, "package.json"),
  ];
  function walkFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  }
  /** Each npx call in a text (comment lines skipped), as the words after `npx`. */
  const npxCalls = (text: string) =>
    text
      .split("\n")
      .filter((l) => !/^\s*(#|\/\/|\*)/.test(l))
      .flatMap((l) => [...l.matchAll(/\bnpx\s+([^'"`;|&)\n]*)/g)].map((m) => m[1]!.trim().split(/\s+/)));
  const safe = (words: string[]) => {
    if (words[0] === "--no") return words.length > 1 && !words[1]!.startsWith("-");
    if (words[0] === "--yes") {
      const pin = /^((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+)$/.exec(words[1] ?? "");
      return Boolean(pin && PINNABLE.has(pin[1]!));
    }
    return false;
  };

  it("finds the calls it checks, and refuses the unsafe forms", () => {
    expect(npxCalls("run: npx --no expo-updates x\n# npx anything\n")).toEqual([["--no", "expo-updates", "x"]]);
    for (const bad of ["npx sentry-expo-upload-sourcemaps dist", "npx --yes sentry-expo-upload-sourcemaps dist", "npx --yes eas-cli update", "npx --yes eas-cli@latest update", "npx --yes left-pad@1.0.0", "npx -y eas-cli@26.0.0 update"]) {
      expect(npxCalls(bad).every(safe), bad).toBe(false);
    }
    expect(npxCalls("npx --yes eas-cli@26.0.0 update").every(safe)).toBe(true);
  });

  it.each(files.map((f) => [path.relative(REPO, f), f]))("%s", (_rel, file) => {
    for (const words of npxCalls(readFileSync(file, "utf8"))) expect(safe(words), `npx ${words.join(" ")}`).toBe(true);
  });

  it("in every render of the release templates", () => {
    for (const sentry of [false, true]) {
      for (const runtimeCommand of [null, "node scripts/rv.mjs"]) {
        for (const rel of ["ci/native-release.yml", "release/deploy-production.yml"]) {
          const text = renderRelease(template(rel), ctx({ sentry, runtimeCommand }));
          for (const words of npxCalls(text)) expect(safe(words), `${rel}: npx ${words.join(" ")}`).toBe(true);
        }
      }
    }
  });

  it("checks the app's own Sentry uploader is installed before running it", () => {
    const gh = (yaml("ci/native-release.yml", ctx({ sentry: true })).jobs.release.steps as { name?: string; run?: string }[]).find((st) => st.name === "Sentry can take the source maps")!.run!;
    expect(gh).toContain("native-release.mjs installed @sentry/react-native");
    const eas = (yaml("release/deploy-production.yml", ctx({ sentry: true })).jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
    // Before anything is published, not only before the upload: the token and the uploader.
    expect(eas.indexOf("native-release.mjs require SENTRY_AUTH_TOKEN")).toBeGreaterThan(-1);
    expect(eas.indexOf("native-release.mjs require SENTRY_AUTH_TOKEN")).toBeLessThan(eas.indexOf("eas-cli@26.0.0 update --channel"));
    expect(eas.indexOf("installed @sentry/react-native")).toBeGreaterThan(-1);
    expect(eas.indexOf("installed @sentry/react-native")).toBeLessThan(eas.indexOf("eas-cli@26.0.0 update --channel"));
    const easAndroid = (yaml("release/deploy-production.yml", ctx({ sentry: true })).jobs.update_android.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
    expect(easAndroid.indexOf("installed @sentry/react-native")).toBeLessThan(easAndroid.indexOf("eas-cli@26.0.0 update --channel"));
    // Without Sentry, no check.
    expect((yaml("release/deploy-production.yml", ctx()).jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!).not.toContain("installed @sentry/react-native");
    const script = path.join(TEMPLATES, "eas/scripts/native-release.mjs");
    const app = tempDir("genesis-installed-");
    writeTree(app, { "node_modules/@sentry/react-native/package.json": "{}" });
    mkdirSync(path.join(app, "src"));
    expect(spawnSync("node", [script, "installed", "@sentry/react-native"], { cwd: path.join(app, "src"), encoding: "utf8" }).status).toBe(0);
    const missing = spawnSync("node", [script, "installed", "@sentry/react-native"], { cwd: tempDir("genesis-not-installed-"), encoding: "utf8" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("isn't installed here");
  });
});

describe("the EAS lane's updates check the channel's order too", () => {
  it("before publishing, skips out loud when the channel's latest update carries this commit or a later one", () => {
    for (const platform of ["ios", "android"]) {
      const doc = yaml("release/deploy-production.yml", ctx({ pushHook: { script: "scripts/p.mjs", secrets: [] } }));
      const run = (doc.jobs[`update_${platform}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      const at = (needle: string) => run.indexOf(needle);
      expect(at(`RELEASE_EAS="npx --yes eas-cli@26.0.0" node .eas/scripts/native-release.mjs latest-commit "production" ${platform}`)).toBeGreaterThan(-1);
      expect(at('git merge-base --is-ancestor "$COMMIT_SHA" "$latest"')).toBeLessThan(at("eas-cli@26.0.0 update --channel"));
      expect(run).toContain("Not published: the channel's latest");
      // The hook runs only when an update went out.
      expect(doc.jobs[`hook_${platform}_update`].if).toBe(`\${{ needs.update_${platform}.outputs.update_group }}`);
    }
  });

  it("writes its scratch files outside the checkout, so eas update's clean-checkout check (cli.requireCommit) passes", () => {
    for (const platform of ["ios", "android"]) {
      const run = (yaml("release/deploy-production.yml", ctx()).jobs[`update_${platform}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      expect(run).toContain("scratch=$(mktemp -d)");
      expect(run.indexOf("scratch=$(mktemp -d)")).toBeLessThan(run.indexOf("runtimeversion:resolve"));
      // Every file it writes is in $scratch.
      for (const m of run.matchAll(/>\s*("?)([^\s"]+)\1/g)) if (!m[2]!.startsWith("/dev/null")) expect(m[2], m[0]).toMatch(/^\$scratch\//);
    }
  });

  it("a failed source map upload after the update went out doesn't keep the release hook from running; the run still fails", () => {
    const hooked = yaml("release/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/p.mjs", secrets: [] } }));
    for (const p of ["ios", "android"]) {
      const run = (hooked.jobs[`update_${p}`].steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      expect(run).toContain("if ! npx --no sentry-expo-upload-sourcemaps dist; then");
      expect(run).toContain("set-output sourcemaps failed");
      expect(run.indexOf("set-output update_group")).toBeLessThan(run.indexOf("sentry-expo-upload-sourcemaps"));
      expect(hooked.jobs[`update_${p}`].outputs.sourcemaps).toBe("${{ steps.publish.outputs.sourcemaps }}");
      const hook = hooked.jobs[`hook_${p}_update`];
      expect(hook.env.SOURCEMAPS).toBe(`\${{ needs.update_${p}.outputs.sourcemaps }}`);
      // The hook first, then the failure said out loud.
      expect(hook.steps.map((st: { name?: string; uses?: string }) => st.name ?? st.uses)).toEqual(["eas/checkout", "Run scripts/p.mjs", "The source maps reached Sentry"]);
      const check = spawnSync("bash", ["-c", hook.steps[2].run], { encoding: "utf8", env: { ...process.env, SOURCEMAPS: "failed", RELEASE_UPDATE_GROUP: "g1" } });
      expect(check.status).toBe(1);
      expect(check.stdout).toContain("g1 is published, but its source maps didn't upload");
      expect(spawnSync("bash", ["-c", hook.steps[2].run], { env: { ...process.env, SOURCEMAPS: "" } }).status).toBe(0);
    }
    // Without a hook, the upload's failure fails the update job itself.
    const run = (yaml("release/deploy-production.yml", ctx({ sentry: true })).jobs.update_ios.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
    expect(run).not.toContain("set-output sourcemaps");
    expect(run).toMatch(/if ! npx --no sentry-expo-upload-sourcemaps dist; then\n[^\n]*\n\s*exit 1\nfi/);
  });

  it("also skips when the build it would run on was made from this commit or a later one", () => {
    for (const platform of ["ios", "android"]) {
      const job = yaml("release/deploy-production.yml", ctx()).jobs[`update_${platform}`];
      expect(job.env.BUILD_COMMIT).toBe(`\${{ needs.get_${platform}_build.outputs.git_commit_hash }}`);
      const run = (job.steps as { id?: string; run?: string }[]).find((st) => st.id === "publish")!.run!;
      expect(run.indexOf('git merge-base --is-ancestor "$COMMIT_SHA" "$BUILD_COMMIT"')).toBeGreaterThan(-1);
      expect(run.indexOf('git merge-base --is-ancestor "$COMMIT_SHA" "$BUILD_COMMIT"')).toBeLessThan(run.indexOf("eas-cli@26.0.0 update --channel"));
    }
  });

  it("runs eas-cli the way RELEASE_EAS says, where eas isn't on PATH", () => {
    const bin = tempDir("genesis-eas-wrapper-");
    writeTree(bin, { "fake-eas": '#!/usr/bin/env bash\nshift\necho "Could not find channel with the name $2" >&2\nexit 1\n' });
    execFileSync("chmod", ["+x", path.join(bin, "fake-eas")]);
    const out = execFileSync("node", [path.join(TEMPLATES, "eas/scripts/native-release.mjs"), "latest-commit", "production", "ios"], {
      encoding: "utf8",
      env: { ...process.env, RELEASE_EAS: `${path.join(bin, "fake-eas")} --pinned` },
    });
    expect(out).toBe("");
  });
});

describe("tests never reach the network", () => {
  it("npx and eas fail at once here (test/setup-no-network.ts)", () => {
    for (const name of ["npx", "eas"]) {
      const result = spawnSync(name, ["--yes", "eas-cli@26.0.0", "--version"], { encoding: "utf8" });
      expect(result.status, name).toBe(97);
      expect(result.stderr).toContain("blocked, a test never reaches the network");
    }
  });
});

describe("a previous genesis-cli refreshing an app from these templates", () => {
  // genesis-cli 1.28.0's templates: the paths a previous CLI reads its lock entries from. Its
  // `genesis upgrade` installs this release and refreshes from its templates with its own code,
  // which has no release renderer and no old-lane hold (the weekly upgrade workflow does just that).
  const PREVIOUS = [
    "ci/app-ci.yml", "ci/claude-review.yml", "ci/genesis-upgrade.yml", "ci/supabase-ci.yml", "eas/eas.json", "eas/scripts/rollout-health.mjs",
    "eas/workflows/deploy-production.yml", "eas/workflows/e2e.yml", "eas/workflows/pr-preview.yml", "eas/workflows/rollout.yml",
    "maestro/config.yaml", "maestro/flows/deep-link.yaml", "maestro/flows/launch.yaml", "maestro/flows/settings-version.yaml", "maestro/flows/sign-in-screen.yaml", "maestro/subflows/sign-in.yaml",
    "vercel/ignore-build.sh", "vercel/vercel.json",
  ];
  const MARKUP = /^\s*#@(?:if|end|paths|extra-paths|hook-secrets)\b|\bGENESIS_RELEASE_[A-Z_]*[A-Z]\b/m;

  it("finds no release markup at any path it knows: the templated ones moved", () => {
    for (const rel of PREVIOUS) {
      const file = path.join(TEMPLATES, rel);
      if (existsSync(file)) expect(readFileSync(file, "utf8"), rel).not.toMatch(MARKUP);
    }
    expect(Object.keys(MOVED_TEMPLATES).every((old) => !existsSync(path.join(TEMPLATES, old)))).toBe(true);
    for (const now of Object.values(MOVED_TEMPLATES)) expect(readFileSync(path.join(TEMPLATES, now), "utf8"), now).toMatch(MARKUP);
  });

  it("leaves an unedited app on the old lane as it is, then this CLI maps its lock over", async () => {
    const old = "name: Deploy production\non:\n  push:\n    branches: [main]\njobs: {}\n";
    const preview = "name: PR preview\non:\n  pull_request:\n    branches: [main]\njobs: {}\n";
    const root = makeApp({ "app.json": "{}", ".eas/workflows/deploy-production.yml": old, ".eas/workflows/pr-preview.yml": preview });
    const files = {
      ".eas/workflows/deploy-production.yml": { source: `${CLI}:templates/eas/workflows/deploy-production.yml`, sha256: sha256(old) },
      ".eas/workflows/pr-preview.yml": { source: `${CLI}:templates/eas/workflows/pr-preview.yml`, sha256: sha256(preview) },
    };
    writeLock(root, { version: 1, blocks: {}, files });
    // What the previous CLI does for each entry: read its source from the installed templates
    // (substituted, never rendered) and refresh three ways.
    const lock = readLock(root);
    for (const [file, entry] of Object.entries(lock.files)) {
      const at = path.join(TEMPLATES, entry.source.slice(`${CLI}:templates/`.length));
      const theirs = existsSync(at) ? substitute(readFileSync(at, "utf8"), lock.substitutions) : null;
      const outcome = refreshOwned(root, lock, { path: file, theirs, base: file.endsWith("deploy-production.yml") ? old : preview });
      expect(outcome.outcome, file).toBe("gone-upstream");
    }
    expect(read(root, ".eas/workflows/deploy-production.yml")).toBe(old);
    expect(read(root, ".eas/workflows/pr-preview.yml")).toBe(preview);
    expect(existsSync(path.join(root, ".github/workflows/native-release.yml"))).toBe(false);
    // And no file anywhere in the app carries unrendered markup.
    expect(read(root, ".eas/workflows/deploy-production.yml")).not.toMatch(MARKUP);
    // This CLI names the moved templates at their new paths.
    expect(currentSource(files[".eas/workflows/deploy-production.yml"].source)).toBe(`${CLI}:templates/release/deploy-production.yml`);
    expect(currentSource(files[".eas/workflows/pr-preview.yml"].source)).toBe(`${CLI}:templates/release/pr-preview.yml`);
  });
});
