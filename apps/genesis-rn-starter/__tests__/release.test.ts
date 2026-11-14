// @feat:eas-workflows @feat:maestro-smoke
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkRollout } from "../.eas/scripts/rollout-health.mjs";

const root = join(__dirname, "..");
const templates = join(root, "..", "..", "templates");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Job {
  type?: string;
  name?: string;
  needs?: string[];
  after?: string[];
  if?: string;
  environment?: string;
  env?: Record<string, string>;
  params?: Record<string, unknown>;
  steps?: { run?: string; uses?: string }[];
}
interface Workflow {
  name: string;
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}
const workflow = (file: string) => parse(read(`.eas/workflows/${file}`)) as Workflow;
const workflowFiles = readdirSync(join(root, ".eas/workflows")).filter((f) => f.endsWith(".yml"));
const easJson = JSON.parse(read("eas.json")) as {
  cli: { appVersionSource: string };
  build: Record<string, { extends?: string; environment?: string; channel?: string; env?: { APP_VARIANT?: string }; distribution?: string; uploadSourceMaps?: boolean; ios?: { simulator?: boolean } }>;
  submit: { production: { ios: Record<string, string>; android: Record<string, string> } };
};

/** A build profile with what it extends merged in, the way EAS resolves it. */
function profile(name: string): (typeof easJson.build)[string] {
  const own = easJson.build[name];
  if (!own) throw new Error(`no build profile ${name}`);
  return own.extends ? { ...profile(own.extends), ...own, ios: { ...profile(own.extends).ios, ...own.ios } } : own;
}

describe("templates", () => {
  // The starter's copies are the canonical templates' copies; `genesis upgrade` refreshes an
  // app's from templates/, so the two must not drift. A template with release markup (`#@if`,
  // GENESIS_RELEASE_…) is copied as its default render, which genesis-cli's tests check
  // (test/release.test.ts): here it's only listed.
  const pairs: [string, string][] = [
    ["eas.json", "eas/eas.json"],
    ...readdirSync(join(root, ".eas/scripts")).map((f): [string, string] => [`.eas/scripts/${f}`, `eas/scripts/${f}`]),
    // The release lane's workflows moved to templates/release/ when they took the release markup.
    ...workflowFiles.map((f): [string, string] => [`.eas/workflows/${f}`, ["deploy-production.yml", "pr-preview.yml"].includes(f) ? `release/${f}` : `eas/workflows/${f}`]),
    ["fingerprint.config.js", "expo/fingerprint.config.js"],
    [".fingerprintignore", "expo/.fingerprintignore"],
    [".maestro/config.yaml", "maestro/config.yaml"],
    ...readdirSync(join(root, ".maestro/flows")).map((f): [string, string] => [`.maestro/flows/${f}`, `maestro/flows/${f}`]),
    ...readdirSync(join(root, ".maestro/subflows")).map((f): [string, string] => [`.maestro/subflows/${f}`, `maestro/subflows/${f}`]),
  ];
  const marked = (template: string) => /^\s*#@(?:if|end|paths|extra-paths|hook-secrets)\b|\bGENESIS_RELEASE_[A-Z_]*[A-Z]\b/m.test(readFileSync(join(templates, template), "utf8"));

  it.each(pairs.filter(([, t]) => !marked(t)))("%s is templates/%s unchanged", (copy, template) => {
    expect(read(copy)).toBe(readFileSync(join(templates, template), "utf8"));
  });

  it("every template has its copy in the starter", () => {
    const listed = new Set(pairs.map(([, t]) => t));
    const all = ["eas", "expo", "maestro", "release"].flatMap((dir) =>
      readdirSync(join(templates, dir), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name).slice(templates.length + 1)),
    );
    expect(all.filter((t) => !listed.has(t))).toEqual([]);
  });
});

describe("eas.json", () => {
  it("takes app versions from EAS (appVersionSource remote)", () => {
    expect(easJson.cli.appVersionSource).toBe("remote");
  });

  it.each([
    ["development", "development"],
    ["preview", "preview"],
    ["production", "production"],
    ["e2e", "development"],
  ])("profile %s builds the %s variant on its own channel and EAS environment", (name, variant) => {
    const p = profile(name);
    expect(p.env?.APP_VARIANT).toBe(variant);
    expect(p.environment).toBe(variant);
    expect(p.channel).toBe(variant);
  });

  it("only production is a store build; e2e is a simulator build", () => {
    expect(profile("production").distribution).toBe("store");
    for (const name of ["development", "preview", "e2e"]) expect(profile(name).distribution).toBe("internal");
    expect(profile("e2e").ios?.simulator).toBe(true);
  });

  it("uploads each preview and production build's source map to EAS (EAS Observe symbolication)", () => {
    for (const name of ["preview", "production"]) expect(profile(name).uploadSourceMaps, name).toBe(true);
  });

  it("ships placeholders, never real store ids", () => {
    const values = [...Object.values(easJson.submit.production.ios), easJson.submit.production.android.serviceAccountKeyPath];
    for (const value of values) expect(value).toMatch(/^REPLACE_WITH_/);
    expect(easJson.submit.production.android.releaseStatus).toBe("draft");
  });
});

describe("EAS workflows", () => {
  it.each(workflowFiles)("%s: every update job says whether it uploads Sentry source maps (off until Sentry is on)", (file) => {
    // Unset, EAS tries an upload whenever @sentry/react-native is installed and hides a failure.
    for (const [id, job] of Object.entries(workflow(file).jobs)) {
      if (job.type === "update") expect(job.params?.upload_sentry_sourcemaps, `${file} ${id}`).toBe(false);
      // The release lane's scripted updates upload source maps only with release.sentry.
      for (const step of job.steps ?? []) expect(step.run ?? "", `${file} ${id}`).not.toContain("sentry-expo-upload-sourcemaps");
    }
  });

  it.each(workflowFiles)("%s: every needs and after names a job", (file) => {
    const { jobs } = workflow(file);
    for (const job of Object.values(jobs)) {
      for (const dep of [...(job.needs ?? []), ...(job.after ?? [])]) expect(Object.keys(jobs)).toContain(dep);
    }
  });

  it.each(workflowFiles)("%s: build and repack profiles exist, and APP_VARIANT matches the EAS environment", (file) => {
    for (const [id, job] of Object.entries(workflow(file).jobs)) {
      const name = job.params?.profile;
      if ((job.type === "build" || job.type === "repack") && typeof name === "string") {
        expect(easJson.build, `${file} ${id}`).toHaveProperty(name);
        if (job.environment) expect(profile(name).environment, `${file} ${id}`).toBe(job.environment);
      }
      if (job.env?.APP_VARIANT) expect(job.env.APP_VARIANT, `${file} ${id}`).toBe(job.environment);
    }
  });

  it.each(workflowFiles)("%s: no secret is written in the file", (file) => {
    for (const [id, job] of Object.entries(workflow(file).jobs)) {
      for (const key of Object.keys(job.env ?? {})) expect(key, `${file} ${id}`).not.toMatch(/TOKEN|SECRET|PASSWORD|KEY/i);
    }
    expect(read(`.eas/workflows/${file}`)).not.toMatch(/expo_[A-Za-z0-9]{20,}|-----BEGIN/);
  });

  it("deploy-production runs only when started (by native-release.yml), for a named commit, with no approval to wait on", () => {
    const { on, jobs } = workflow("deploy-production.yml");
    // On push it would race native-release.yml on every merge.
    expect(Object.keys(on)).toEqual(["workflow_dispatch"]);
    const inputs = (on.workflow_dispatch as { inputs: Record<string, { type?: string; required?: boolean }> }).inputs;
    expect(inputs.commit_sha).toMatchObject({ type: "string", required: true });
    // Choices compared as text: eas workflow:run -F sends every value as a string.
    expect(inputs.ios?.type).toBe("choice");
    expect(inputs.android?.type).toBe("choice");
    // main's merge is the approval: an approval job would hold every merge's release.
    expect(Object.values(jobs).filter((j) => j.type === "require-approval")).toEqual([]);
    // One deploy at a time, and the running one always finishes: never cancel_in_progress.
    const { concurrency } = parse(read(".eas/workflows/deploy-production.yml")) as { concurrency?: unknown };
    expect(concurrency).toEqual({ group: "${{ workflow.filename }}" });
  });

  it("deploy-production updates every install, and submits each build in the run that made it", () => {
    const { jobs } = workflow("deploy-production.yml");
    // Published by the lane's script (the profile's env, the runtime checked), to every install:
    // eas update with no --rollout-percentage.
    for (const platform of ["ios", "android"]) {
      const publish = jobs[`update_${platform}`]?.steps?.map((st) => st.run ?? "").join("\n") ?? "";
      expect(publish).toContain(`update --channel "production" --platform ${platform}`);
      expect(publish).not.toContain("rollout-percentage");
      expect(publish).toContain(`profile-env eas.json "production" ${platform} --shell`);
      expect(jobs[`get_${platform}_build`]?.if).toBe(`\${{ inputs.${platform} == 'true' }}`);
      expect(jobs[`update_${platform}`]?.if).toBe(`\${{ inputs.${platform} == 'true' && needs.get_${platform}_build.outputs.build_id }}`);
      expect(jobs[`update_${platform}`]?.needs).toEqual([`get_${platform}_build`]);
      expect(jobs[`build_${platform}`]?.if).toBe(`\${{ inputs.${platform} == 'true' && !needs.get_${platform}_build.outputs.build_id }}`);
      expect(jobs[`submit_${platform}`]?.needs).toEqual([`build_${platform}`]);
      expect(jobs[`submit_${platform}`]?.params?.build_id).toBe(`\${{ needs.build_${platform}.outputs.build_id }}`);
    }
  });

  it.each(["pr-preview.yml", "e2e.yml"])("%s can't reach production", (file) => {
    expect(read(`.eas/workflows/${file}`)).not.toMatch(/eas(-cli)?(@[\d.]+)? (update|submit)/);
    for (const [id, job] of Object.entries(workflow(file).jobs)) {
      expect(["submit", "testflight", "update-rollout"], `${file} ${id}`).not.toContain(job.type);
      expect(job.steps, `${file} ${id}`).toBeUndefined();
      expect(job.environment ?? "", `${file} ${id}`).not.toBe("production");
      expect(job.params?.profile ?? "", `${file} ${id}`).not.toBe("production");
      expect(job.params?.channel ?? "", `${file} ${id}`).not.toBe("production");
    }
  });

  it("pr-preview runs only for app changes into main, or a Preview label", () => {
    const { on } = workflow("pr-preview.yml");
    expect(Object.keys(on).sort()).toEqual(["pull_request", "pull_request_labeled"]);
    const pr = on.pull_request as { branches?: string[]; paths?: string[] };
    expect(pr.branches).toEqual(["main"]);
    // The app's code folder (genesis init fills it in), then the config a build reads.
    expect(pr.paths).toEqual([
      "REPLACE_WITH_APP_FOLDER/**",
      "app.json",
      "app.config.*",
      "eas.json",
      "package.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "package-lock.json",
      "bun.lock",
      "bun.lockb",
    ]);
    expect(on.pull_request_labeled).toEqual({ labels: ["Preview"] });
  });

  it("pr-preview keeps one run per branch, so a label on a matching pull request doesn't build twice", () => {
    const { concurrency } = parse(read(".eas/workflows/pr-preview.yml")) as { concurrency?: unknown };
    expect(concurrency).toEqual({ group: "${{ workflow.filename }}-${{ github.ref }}", cancel_in_progress: true });
  });

  it("pr-preview builds iOS only once PREVIEW_IOS is on", () => {
    const { jobs } = workflow("pr-preview.yml");
    for (const id of ["get_ios_build", "repack_ios", "build_ios"]) {
      expect(jobs[id]?.environment, id).toBe("preview");
      expect(jobs[id]?.if, id).toMatch(/^\$\{\{ env\.PREVIEW_IOS == 'true'( && | \}\}$)/);
    }
    for (const id of ["get_android_build", "repack_android", "build_android"]) expect(jobs[id]?.if ?? "", id).not.toContain("PREVIEW_IOS");
  });

  it("e2e runs only by hand", () => {
    expect(Object.keys(workflow("e2e.yml").on)).toEqual(["workflow_dispatch"]);
  });

  it("pr-preview publishes to the pull request's own channel", () => {
    expect(workflow("pr-preview.yml").jobs.publish_update?.params?.channel).toBe("pr-${{ github.event.pull_request.number }}");
  });

  it("rollout promotes only after the health check, whose limits no input can change", () => {
    const { on, jobs } = workflow("rollout.yml");
    expect(Object.keys(on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys((on.workflow_dispatch as { inputs: object }).inputs)).toEqual(["update_group_id", "action", "percentage"]);
    expect(jobs.health_check?.env).toMatchObject({ MAX_FAILED_LAUNCH_PERCENT: "1", MIN_LAUNCHES: "200" });
    for (const [id, job] of Object.entries(jobs)) {
      expect(job.environment, id).toBe("production");
      if (job.type === "update-rollout") expect(job.needs, id).toEqual(["health_check"]);
    }
    // Inputs reach the shell only through env, never written into a script.
    for (const job of Object.values(jobs)) for (const step of job.steps ?? []) expect(step.run ?? "").not.toContain("${{");
  });
});

describe("rollout health check", () => {
  const limits = { maxFailedLaunchPercent: 1, minLaunches: 100 };
  const insights = (...platforms: [string, number, number][]) => ({
    platforms: platforms.map(([platform, installs, failedInstalls]) => ({ platform, totals: { installs, failedInstalls } })),
  });

  it("passes when every platform has enough launches and few failed", () => {
    expect(checkRollout(insights(["ios", 990, 5], ["android", 500, 0]), limits).ok).toBe(true);
  });

  it("stops on too many failed launches on any platform", () => {
    const result = checkRollout(insights(["ios", 990, 5], ["android", 480, 20]), limits);
    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toMatch(/android: 20 of 500 launches failed \(4\.00%\).*don't promote/);
  });

  it("stops when it is too early to tell", () => {
    expect(checkRollout(insights(["ios", 40, 0]), limits).ok).toBe(false);
  });

  it("stops on no data, a missing count or a threshold that isn't a number", () => {
    expect(checkRollout({ platforms: [] }, limits).ok).toBe(false);
    expect(checkRollout({}, limits).ok).toBe(false);
    expect(checkRollout({ platforms: [{ platform: "ios", totals: {} }] }, limits).ok).toBe(false);
    expect(checkRollout(insights(["ios", 990, 0]), { ...limits, maxFailedLaunchPercent: Number.NaN }).ok).toBe(false);
    expect(checkRollout(insights(["ios", 990, 0]), { ...limits, minLaunches: Number.NaN }).ok).toBe(false);
    // Zero launches can't pass by asking for zero.
    expect(checkRollout(insights(["ios", 0, 0]), { ...limits, minLaunches: 0 }).ok).toBe(false);
  });
});

describe("Maestro flows", () => {
  const flows = readdirSync(join(root, ".maestro/flows"));
  const appId = parse(read(".maestro/config.yaml")).appId as string;

  it("cover launch, the sign-in screen, Settings' version row and a deep link", () => {
    expect(flows.sort()).toEqual(["deep-link.yaml", "launch.yaml", "settings-version.yaml", "sign-in-screen.yaml"]);
    expect(read(".maestro/flows/settings-version.yaml")).toContain('id: "settings-row-version"');
  });

  it.each([...flows.map((f) => `.maestro/flows/${f}`), ".maestro/subflows/sign-in.yaml"])("%s names the development bundle id", (file) => {
    expect(read(file).match(/^appId: (.+)$/m)?.[1]).toBe(appId);
  });

  it("the development bundle id is the starter's with .dev (what APP_VARIANT=development builds)", async () => {
    const starter = (await import("../starter.config")).default;
    expect(appId).toBe(`${starter.app.bundleId}.dev`);
  });
});
