// @feat:eas-workflows
/**
 * The native release lane as versioned templates: the `release` block rendered into them, the
 * plan script's decisions, adopting the templates into an app, and upgrading one (docs/NATIVE-RELEASE.md).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { renderOwned } from "../src/blocks/app-folder.js";
import { sha256 } from "../src/blocks/files.js";
import { readLock, writeLock } from "../src/blocks/lock.js";
import { ownedKeyProblem } from "../src/blocks/owned.js";
import { DEFAULT_RELEASE_CONTEXT, renderRelease, resolveRelease, type ReleaseContext } from "../src/blocks/release-render.js";
import { addTemplates } from "../src/blocks/add-template.js";
import { adoptTemplates, bumpCallerPins, competingReleaseWorkflows, hasPushTrigger, missingTemplateSets, renderPin, renderTemplate, resolveTemplateNames } from "../src/blocks/release.js";
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
  const MARKED = ["ci/native-release.yml", "eas/workflows/deploy-production.yml", "eas/workflows/pr-preview.yml"];

  it("the starter's copies are the default render, with no markup left", () => {
    const copies: [string, string][] = [
      ["eas/workflows/deploy-production.yml", ".eas/workflows/deploy-production.yml"],
      ["eas/workflows/pr-preview.yml", ".eas/workflows/pr-preview.yml"],
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
    const ios = yaml("eas/workflows/deploy-production.yml", ctx({ platforms: ["ios"] }));
    expect(Object.keys(ios.jobs).filter((j) => j.includes("android"))).toEqual([]);
    expect(Object.keys(ios.on.workflow_dispatch.inputs)).toEqual(["commit_sha", "repository", "ios", "ios_runtime_version"]);
    expect(ios.on.workflow_dispatch.inputs.ios_runtime_version).toMatchObject({ type: "string", required: true });
    expect(ios.jobs.update_ios.steps[2].run).not.toContain("sentry-expo-upload-sourcemaps");
    const full = yaml("eas/workflows/deploy-production.yml", ctx({ sentry: true, pushHook: { script: "scripts/push.mjs", secrets: [] }, profile: "store", channel: "live", easEnvironment: "prod" }));
    expect(full.jobs.update_android.steps[2].run).toContain('--channel "live" --platform android --environment "prod"');
    expect(full.jobs.update_android.steps[2].run).toContain("sentry-expo-upload-sourcemaps dist");
    expect(full.jobs.build_ios.params.profile).toBe("store");
    expect(full.jobs.build_ios.environment).toBe("prod");
    expect(full.jobs.hook_ios_update.steps[1].run).toBe("node scripts/push.mjs");
    expect(full.jobs.hook_android_build.needs).toEqual(["build_android", "submit_android"]);
    expect(full.jobs.hook_ios_update.env.RELEASE_UPDATE_GROUP).toBe("${{ needs.update_ios.outputs.update_group }}");
  });

  it("deploy-production publishes like GitHub does: the platform's profile env, the runtime checked before eas update", () => {
    const doc = yaml("eas/workflows/deploy-production.yml", ctx());
    // No fingerprint job of its own: it matches the runtime version GitHub computed with the profile's env.
    expect(doc.jobs.fingerprint).toBeUndefined();
    expect(doc.jobs.get_ios_build.params.fingerprint_hash).toBe("${{ inputs.ios_runtime_version }}");
    const run = doc.jobs.update_android.steps.find((st: { id?: string }) => st.id === "publish").run as string;
    const at = (needle: string) => run.indexOf(needle);
    expect(at('profile-env eas.json "production" android --shell')).toBeGreaterThan(-1);
    expect(at("profile-env")).toBeLessThan(at("runtimeversion:resolve --platform android"));
    expect(at("native-release.mjs runtime ")).toBeLessThan(at("eas-cli@26.0.0 update"));
    expect(doc.jobs.update_android.steps.map((st: { uses?: string }) => st.uses).slice(0, 2)).toEqual(["eas/checkout", "eas/install_node_modules"]);
  });

  it("names render as YAML strings, so a profile 123 or a channel null stay text", () => {
    const c = ctx({ profile: "123", channel: "null", environment: "007", easEnvironment: "true" });
    const deploy = yaml("eas/workflows/deploy-production.yml", c);
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
    const doc = yaml("eas/workflows/deploy-production.yml", ctx());
    for (const p of ["ios", "android"]) {
      expect(doc.on.workflow_dispatch.inputs[p]).toEqual({ type: "choice", options: ["true", "false"], default: "true", description: expect.any(String) });
      expect(doc.jobs[`get_${p}_build`].if).toBe(`\${{ inputs.${p} == 'true' }}`);
      expect(doc.jobs[`build_${p}`].if).toBe(`\${{ inputs.${p} == 'true' && !needs.get_${p}_build.outputs.build_id }}`);
      expect(doc.jobs[`update_${p}`].if).toBe(`\${{ inputs.${p} == 'true' && needs.get_${p}_build.outputs.build_id }}`);
    }
    // Every `inputs.<platform>` reference in the file is the text comparison.
    const text = renderRelease(template("eas/workflows/deploy-production.yml"), ctx());
    expect([...text.matchAll(/inputs\.(ios|android)\b(?!_)(?! == 'true')/g)]).toEqual([]);
    // No order check that could skip a release green: EAS's concurrency keeps the order.
    expect(doc.jobs.newest).toBeUndefined();
    expect(doc.concurrency).toEqual({ group: "${{ workflow.filename }}" });
  });

  it("deploy-production with the app's own runtime version: no fingerprint job, get-build by runtime_version", () => {
    const own = yaml("eas/workflows/deploy-production.yml", ctx({ runtimeCommand: "node scripts/rv.mjs" }));
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
    expect(root.concurrency).toEqual({ group: "native-release-${{ github.ref }}", "cancel-in-progress": false });
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
    expect(run).toMatch(/export RELEASE_PLATFORM="\$platform"\n\s*\{ node scripts\/rv\.mjs\n\s*\} > "\$RUNNER_TEMP\/release\/runtime-\$platform\.txt"/);
    expect(run).not.toContain("fingerprint:generate");
  });

  it("a piped runtime command sees RELEASE_PLATFORM in every part, and its whole output is written", () => {
    const run = (yaml("ci/native-release.yml", ctx({ runtimeCommand: 'echo "$RELEASE_PLATFORM" | tr a-z A-Z && echo "-$RELEASE_PLATFORM"' })).jobs.release.steps as { id?: string; run?: string }[]).find((st) => st.id === "plan")!.run!;
    const loop = run.slice(run.indexOf("export RELEASE_PLATFORM"), run.indexOf("runtime=$("));
    const dir = tempDir("genesis-runtime-");
    execFileSync("bash", ["-eo", "pipefail", "-c", `platform=ios\nRUNNER_TEMP=${dir}\nmkdir -p "$RUNNER_TEMP/release"\n${loop}`]);
    expect(readFileSync(path.join(dir, "release", "runtime-ios.txt"), "utf8")).toBe("IOS\n-ios\n");
  });

  it("native-release.yml publishes with the platform's build profile env, and checks the runtime version before publishing", () => {
    const steps = yaml("ci/native-release.yml", ctx()).jobs.release.steps as { name?: string; run?: string; if?: string }[];
    for (const [p, Name] of [["ios", "iOS"], ["android", "Android"]]) {
      const run = steps.find((st) => st.name === `Publish the ${Name} update`)!.run!;
      expect(run).toContain(`eval "$(node .eas/scripts/native-release.mjs profile-env eas.json "production" ${p} --shell)"`);
      expect(run.indexOf("profile-env")).toBeLessThan(run.indexOf(`runtimeversion:resolve --platform ${p}`));
      expect(run.indexOf("native-release.mjs runtime ")).toBeLessThan(run.indexOf("eas update --channel"));
    }
  });

  it("native-release.yml skips, out loud, a platform whose channel already carries this commit or a later one", () => {
    const doc = yaml("ci/native-release.yml", ctx());
    const steps = doc.jobs.release.steps as { name?: string; run?: string; if?: string; with?: Record<string, unknown> }[];
    expect((steps as { uses?: string; with?: Record<string, unknown> }[]).find((st) => st.uses?.startsWith("actions/checkout"))!.with!["fetch-depth"]).toBe(0);
    const plan = steps.find((st) => st.name === "Runtime versions, builds and EAS's release runs")!.run!;
    expect(plan).toContain('eas update:list --branch "$CHANNEL" --platform "$platform" --limit 1 --json --non-interactive');
    expect(plan).toContain('git merge-base --is-ancestor "$GITHUB_SHA" "$latest"');
    const shipped = steps.find((st) => st.name === "Already shipped")!;
    expect(shipped.if).toBe("steps.plan.outputs.skipped_platforms != ''");
    expect(shipped.run).toContain("::warning title=Not published::");
    expect(shipped.run).toContain("$GITHUB_STEP_SUMMARY");
  });

  it("pr-preview: release.paths join the app's own, kept from the repository root under appFolder; one platform drops the other", () => {
    const c = ctx({ platforms: ["ios"], paths: ["app/src"] }, "mobile");
    const raw = template("eas/workflows/pr-preview.yml");
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

  it("pins the CI callers to a release, and moves any caller's pin", () => {
    const text = renderPin(template("ci/app-ci.yml"), PIN);
    expect(text).toContain(`app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0`);
    expect(renderPin(template("vercel/ignore-build.sh"), PIN)).toContain(`ignore-build.sh @ ${PIN.sha} # @marktiderman/genesis@2.40.0`);
    const old = "    uses: marktiderman/genesis/.github/workflows/app-ci.yml@" + "b".repeat(40) + " # @marktiderman/genesis@2.31.0\n";
    expect(bumpCallerPins(old, PIN)).toBe(`    uses: marktiderman/genesis/.github/workflows/app-ci.yml@${PIN.sha} # @marktiderman/genesis@2.40.0\n`);
    expect(bumpCallerPins("uses: actions/checkout@v4\n", PIN)).toBe("uses: actions/checkout@v4\n");
  });

  it("every template goes where it says, Vercel's too", () => {
    expect(templateTarget("vercel/ignore-build.sh", template("vercel/ignore-build.sh"))).toBe("scripts/vercel-ignore-build.sh");
    expect(templateTarget("vercel/vercel.json", template("vercel/vercel.json"))).toBe("vercel.json");
    expect(templateTarget("ci/native-release.yml", template("ci/native-release.yml"))).toBe(".github/workflows/native-release.yml");
    expect(templateTarget("expo/fingerprint.config.js", template("expo/fingerprint.config.js"))).toBe("fingerprint.config.js");
    for (const [key, t] of [["vercel.json", "vercel/vercel.json"], ["scripts/vercel-ignore-build.sh", "vercel/ignore-build.sh"], ["fingerprint.config.js", "expo/fingerprint.config.js"], [".fingerprintignore", "expo/.fingerprintignore"]]) {
      expect(ownedKeyProblem(key!, `${CLI}:templates/${t}`)).toBeNull();
    }
    expect(resolveTemplateNames(["release"])).toEqual(["ci/native-release.yml", "eas/workflows/deploy-production.yml", "eas/workflows/pr-preview.yml", "eas/scripts/native-release.mjs", "expo/fingerprint.config.js", "expo/.fingerprintignore"]);
    expect(() => resolveTemplateNames(["nope"])).toThrow(/isn't a template set/);
  });
});

describe("the plan script", () => {
  const FP = "f".repeat(40);
  const AP = "e".repeat(40);
  const build = (platform: string, hash: string, extra: Record<string, unknown> = {}) => ({ id: `b-${platform}`, status: "FINISHED", platform: platform.toUpperCase(), buildProfile: "production", distribution: "STORE", appVersion: "1.2.0", fingerprint: { hash }, runtime: { version: hash }, ...extra });
  const outputs = (lines: string[]) => Object.fromEntries(lines.map((l) => l.split("=") as [string, string]));
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

  it("refuses to guess: a broken list, no fingerprint, or a build whose runtime isn't its fingerprint", () => {
    expect(() => both([build("ios", FP)], [build("android", AP)], null as unknown as unknown[])).toThrow(/list of runs/);
    expect(() => plan.planOutputs({ ios: { runtime: "", by: "fingerprint", builds: [] } }, [], "production")).toThrow(/fingerprint hash/);
    expect(() => plan.planOutputs({ ios: { runtime: FP, by: "fingerprint", builds: {} } }, [], "production")).toThrow(/list of ios builds/);
    expect(() => both([build("ios", FP, { runtime: { version: "1.0.0" } })], [])).toThrow(/would not reach it/);
  });

  it("with the app's own runtime version, matches builds by it", () => {
    const own = (builds: unknown[]) => outputs(plan.planOutputs({ ios: { runtime: "ios-7f3a", by: "runtime", builds } }, [], "production"));
    expect(own([build("ios", "x", { runtime: { version: "ios-7f3a" } })])).toMatchObject({ ios_action: "publish", ios_runtime_version: "ios-7f3a" });
    expect(own([build("ios", "x", { runtime: { version: "ios-0000" } })])).toMatchObject({ ios_action: "eas" });
    expect(() => plan.planOutputs({ ios: { runtime: "", by: "runtime", builds: [] } }, [], "production")).toThrow(/printed no ios runtime version/);
    // Any form Expo takes, the native version with its build in parentheses included.
    expect(outputs(plan.planOutputs({ ios: { runtime: "1.0.0(1)", by: "runtime", builds: [build("ios", "x", { runtime: { version: "1.0.0(1)" } })] } }, [], "production"))).toMatchObject({ ios_action: "publish", ios_runtime_version: "1.0.0(1)" });
    expect(() => plan.planOutputs({ ios: { runtime: "1.0 0", by: "runtime", builds: [] } }, [], "production")).toThrow(/printed no ios runtime version/);
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

  it("reads the channel's latest update's commit for a platform", () => {
    const sha = (c: string) => c.repeat(40);
    const list = [
      { platform: "android", gitCommitHash: sha("b"), createdAt: "2026-11-14T10:00:00Z" },
      { platform: "ios", gitCommitHash: sha("a"), createdAt: "2026-11-14T09:00:00Z" },
      { platform: "ios", gitCommitHash: sha("c"), createdAt: "2026-11-14T11:00:00Z" },
    ];
    expect(plan.latestCommit(list, "ios")).toBe(sha("c"));
    expect(plan.latestCommit(list, "android")).toBe(sha("b"));
    expect(plan.latestCommit([], "ios")).toBe("");
    expect(plan.latestCommit([{ platform: "ios", gitCommitHash: null }], "ios")).toBe("");
    expect(() => plan.latestCommit({ nope: 1 }, "ios")).toThrow(/list of updates/);
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
    expect(lock.files[".eas/workflows/deploy-production.yml"]).toMatchObject({ source: `${CLI}:templates/eas/workflows/deploy-production.yml`, sha256: sha256(next), pending: sha256(next), pendingMine: sha256("name: mine\n") });
    expect(lock.files[".github/workflows/native-release.yml"]!.sha256).toBe(sha256(read(root, ".github/workflows/native-release.yml")));
    // Run again: nothing new; .genesis-next is left for the app.
    expect(adoptTemplates(root, ["eas/workflows/deploy-production.yml"])[0]).toMatchObject({ outcome: "next" });
    // --replace, once the app's choices are in genesis.config.json.
    expect(adoptTemplates(root, ["eas/workflows/deploy-production.yml"], { replace: true })[0]).toMatchObject({ outcome: "replaced" });
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
    ship(root, "1.0.0", { "eas/workflows/deploy-production.yml": old });
    writeTree(root, { ".eas/workflows/deploy-production.yml": old });
    writeLock(root, { version: 1, blocks: {}, files: { ".eas/workflows/deploy-production.yml": { source: `${CLI}:templates/eas/workflows/deploy-production.yml`, sha256: sha256(old) } } });
    const release2 = (r: string) => void ship(r, "1.2.0", Object.fromEntries(resolveTemplateNames(["release"]).map((t) => [t, template(t)])));
    const report = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: release2, doctor: false });
    expect(report.refreshed.find((r) => r.path === ".eas/workflows/deploy-production.yml")).toMatchObject({ outcome: "held" });
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
