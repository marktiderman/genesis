// @feat:eas-workflows @feat:maestro-smoke
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkStamp } from "../.eas/scripts/native-release.mjs";
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
const checkRun = () => workflow("agentic-ci.yml").jobs.check!.steps!.find((s) => (s.run ?? "").includes("start-session.sh"))!.run!;
const workflowFiles = readdirSync(join(root, ".eas/workflows")).filter((f) => f.endsWith(".yml"));
const easJson = JSON.parse(read("eas.json")) as {
  cli: { appVersionSource: string };
  build: Record<string, { extends?: string; environment?: string; channel?: string; env?: { APP_VARIANT?: string; GENESIS_CHANNEL?: string }; distribution?: string; uploadSourceMaps?: boolean; ios?: { simulator?: boolean } }>;
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
    ...workflowFiles.map((f): [string, string] => [`.eas/workflows/${f}`, ["deploy-production.yml", "pr-preview.yml", "agentic-ci.yml"].includes(f) ? `release/${f}` : `eas/workflows/${f}`]),
    ...readdirSync(join(root, ".eas/agents")).map((f): [string, string] => [`.eas/agents/${f}`, `eas/agents/${f}`]),
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

  it("deploy-production starts on EAS's own push to main (Expo's deploy lane), from main only, with no approval to wait on", () => {
    const { on, jobs } = workflow("deploy-production.yml");
    // release.trigger "eas" (the default render): EAS Workflows starts it; no GitHub workflow does.
    expect(Object.keys(on)).toEqual(["push", "workflow_dispatch"]);
    expect((on.push as { branches?: string[] }).branches).toEqual(["main"]);
    expect(Object.keys(jobs)[0]).toBe("source");
    // main's merge is the approval: an approval job would hold every merge's release.
    expect(Object.values(jobs).filter((j) => j.type === "require-approval")).toEqual([]);
    // One deploy at a time, and the running one always finishes: never cancel_in_progress. As
    // Expo recommends for deploys, the newest waiting run replaces those in between.
    const { concurrency } = parse(read(".eas/workflows/deploy-production.yml")) as { concurrency?: unknown };
    expect(concurrency).toEqual({ group: "${{ workflow.filename }}" });
  });

  it("deploy-production updates every install, and submits each build in the run that made it", () => {
    const { jobs } = workflow("deploy-production.yml");
    // Published by the lane's script (publishUpdate: the profile's env, the runtime checked), to
    // every install: eas update with no --rollout-percentage.
    const script = read(".eas/scripts/native-release.mjs");
    expect(script).toContain('deps.eas(["update", "--channel", channel, "--platform", platform, "--message", message, "--json", "--non-interactive"]');
    expect(script).not.toContain("rollout-percentage");
    for (const platform of ["ios", "android"]) {
      const publish = jobs[`update_${platform}`]?.steps?.map((st) => st.run ?? "").join("\n") ?? "";
      expect(publish).toContain(`node .eas/scripts/native-release.mjs publish ${platform}`);
      expect(jobs[`update_${platform}`]?.env).toMatchObject({ RELEASE_CHANNEL: "production", RELEASE_PROFILE: "production" });
      expect(jobs[`get_${platform}_build`]?.if).toBe(`\${{ needs.source.outputs.${platform} == 'true' }}`);
      expect(jobs[`update_${platform}`]?.if).toBe(`\${{ needs.source.outputs.${platform} == 'true' && needs.get_${platform}_build.outputs.build_id }}`);
      expect(jobs[`update_${platform}`]?.needs).toEqual(["source", `get_${platform}_build`]);
      expect(jobs[`build_${platform}`]?.if).toBe(`\${{ needs.source.outputs.${platform} == 'true' && !needs.get_${platform}_build.outputs.build_id }}`);
      expect(jobs[`submit_${platform}`]?.needs).toEqual([`build_${platform}`]);
      expect(jobs[`submit_${platform}`]?.params?.build_id).toBe(`\${{ needs.build_${platform}.outputs.build_id }}`);
    }
  });

  it.each(["pr-preview.yml", "e2e.yml"])("%s can't reach production", (file) => {
    // The one command of its own: pr-preview's update, to the pull request's channel (stamped first).
    const own = file === "pr-preview.yml" ? ["publish_update"] : [];
    const commands = [...read(`.eas/workflows/${file}`).matchAll(/eas(?:-cli)?(?:@[\d.]+)? (update|submit)\b.*/g)].map((m) => m[0]);
    // Only to the branch pr-<number>, which only the channel pr-<number> points at.
    expect(commands).toEqual(own.length ? [expect.stringMatching(/^eas-cli@[\d.]+ update --branch "\$PREVIEW_CHANNEL" /)] : []);
    if (own.length) {
      const run = workflow(file).jobs.publish_update!.steps!.map((s) => s.run ?? "").join("\n");
      expect(run).not.toMatch(/eas-cli@[\d.]+ update\b[^\n]*--channel\b/);
      expect([...run.matchAll(/channel:(?:create|edit) (\S+)/g)].map((m) => m[1])).toEqual(['"$PREVIEW_CHANNEL"', '"$PREVIEW_CHANNEL"']);
    }
    for (const [id, job] of Object.entries(workflow(file).jobs)) {
      expect(["submit", "testflight", "update-rollout"], `${file} ${id}`).not.toContain(job.type);
      if (!own.includes(id)) expect(job.steps, `${file} ${id}`).toBeUndefined();
      // The preview update, and the jobs that find the release build it loads on, read the
      // release's EAS environment (an update must match its build); no build job does.
      const readsRelease = file === "pr-preview.yml" && (id === "fingerprint" || id === "publish_update" || id.startsWith("get_release_"));
      if (!readsRelease) expect(job.environment ?? "", `${file} ${id}`).not.toBe("production");
      // get_release_* only looks a release build up (type get-build); it builds nothing.
      if (!(readsRelease && job.type === "get-build")) expect(job.params?.profile ?? "", `${file} ${id}`).not.toBe("production");
      expect(job.params?.channel ?? "", `${file} ${id}`).not.toBe("production");
    }
  });

  it("pr-preview runs only when someone labels a pull request Preview (every pull request is an opt-in)", () => {
    const { on } = workflow("pr-preview.yml");
    // A preview runs the pull request's own code: a reviewer decides when (release.previews.everyPullRequest widens it).
    expect(Object.keys(on)).toEqual(["pull_request_labeled"]);
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

  it("agentic-ci runs only on the Agent check label or by hand, never on every pull request", () => {
    const { on } = workflow("agentic-ci.yml");
    expect(Object.keys(on).sort()).toEqual(["pull_request_labeled", "workflow_dispatch"]);
    expect(on.pull_request_labeled).toEqual({ labels: ["Agent check"] });
  });

  it("agentic-ci can't reach production, and the agent never holds the tokens", () => {
    const text = read(".eas/workflows/agentic-ci.yml");
    expect(text).not.toMatch(/eas(?:-cli)?(?:@[\w.]+)? (update|submit)\b/);
    for (const [id, job] of Object.entries(workflow("agentic-ci.yml").jobs)) {
      expect(["submit", "testflight", "update", "update-rollout"], id).not.toContain(job.type);
      expect(job.environment ?? "", id).not.toBe("production");
      expect(job.params?.profile ?? "", id).not.toBe("production");
    }
    const run = checkRun();
    expect(run).toMatch(/env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN\s+\\?\s*timeout /);
  });

  it("agentic-ci runs the scripts from a read-only copy outside the project, so nothing the agent writes runs later", () => {
    const run = checkRun();
    const copy = run.indexOf('cp -R .eas/agents "$tools"');
    expect(run).toContain("tools=/tmp/agentic-ci-tools");
    expect(copy).toBeGreaterThan(-1);
    expect(run.indexOf('chmod -R a-w "$tools"')).toBeGreaterThan(copy);
    // After the copy, no step runs a script from the project's .eas/agents.
    const steps = workflow("agentic-ci.yml").jobs.check!.steps!.map((s) => s.run ?? "");
    expect(run.slice(copy + 30)).not.toMatch(/(?:bash|source) \.eas\/agents/);
    for (const step of steps.slice(1)) expect(step).not.toMatch(/(?:bash|source) \.eas\/agents/);
    expect(run).toMatch(/source "\$tools\/start-session\.sh"/);
    expect(run).toMatch(/bash "\$tools\/run-agent\.sh"/);
  });

  it("agentic-ci deletes old or committed evidence before the run, so a stale verdict can't pass", () => {
    const run = checkRun();
    expect(run.indexOf("rm -rf agent-output")).toBeGreaterThan(-1);
    expect(run.indexOf("rm -rf agent-output")).toBeLessThan(run.indexOf("start-session.sh"));
  });

  it("agentic-ci's agent always has a time limit shorter than the session's", () => {
    const run = checkRun();
    expect(run).toContain("case \"$AGENT_MAX_MINUTES\" in '' | *[!0-9]*)");
    expect(run).toMatch(/-lt 10 \][\s\S]*-gt 115 \]/);
    expect(run).toContain("agent_minutes=$(( AGENT_MAX_MINUTES - 5 ))");
    expect(run).toContain('timeout "${agent_minutes}m"');
  });

  it("every Expo Simulators session has a maximum duration and an idle limit, and is stopped on exit", () => {
    const start = read(".eas/agents/start-session.sh");
    const cmd = start.slice(start.indexOf("$EAS simulator:start"), start.indexOf("/tmp/session.json\n", start.indexOf("$EAS simulator:start")));
    expect(cmd).toContain("--max-duration-minutes");
    expect(cmd).toContain("--max-idle-time-minutes");
    expect(start).toMatch(/agentic_ci_stop\(\) \{[\s\S]*simulator:stop/);
    // The trap is set before the session starts: a start that creates a session and then fails still stops it.
    expect(start.indexOf("trap agentic_ci_stop EXIT")).toBeGreaterThan(-1);
    expect(start.indexOf("trap agentic_ci_stop EXIT")).toBeLessThan(start.indexOf("$EAS simulator:start"));
    expect(start.indexOf("rm -f .env.eas-simulator")).toBeLessThan(start.indexOf("$EAS simulator:start"));
  });

  it("the agent may read only the project, write only its evidence, and run only device.sh", () => {
    const runner = read(".eas/agents/run-agent.sh");
    expect(runner).toContain("tools='Read(./**),Edit(./agent-output/evidence/**),Bash(bash /tmp/agentic-ci-tools/device.sh *)'");
    // Where the job's secrets can still be read: the process environment, /tmp, home, .env files.
    for (const rule of ["Read(//proc/**)", "Read(//tmp/**)", "Read(//etc/**)", "Read(~/**)", "Read(./.env*)", "Bash(*$*)"]) expect(runner).toContain(rule);
    expect(runner).toContain('--disallowedTools "$denied"');
    expect(runner).toContain("--permission-mode dontAsk");
    // A bare Read, Write or Edit would reach anywhere (Write is governed by Edit rules), and a bare
    // Glob or Grep would search outside the project.
    expect(runner).not.toMatch(/tools='[^']*(?:,|')(?:Read|Write|Edit|Glob|Grep)(?:,|')/);
    expect(runner).not.toMatch(/agent-device@[\d.]+ \*/);
    expect(runner).not.toMatch(/dangerously|bypassPermissions/);
  });

  it("agentic-ci's comment carries only PASS or FAIL, and only redacted evidence is uploaded", () => {
    const { jobs } = workflow("agentic-ci.yml");
    const steps = jobs.check!.steps!;
    const run = checkRun();
    expect(run).toContain("PASS:*) verdict=PASS ;; *) verdict=FAIL ;;");
    expect(run).not.toMatch(/set-output verdict "\$\(head/);
    const redact = steps.findIndex((s) => (s.run ?? "").includes("/tmp/agentic-ci-tools/redact-evidence.sh"));
    const upload = steps.findIndex((s) => (s as { uses?: string }).uses === "eas/upload_artifact");
    expect(redact).toBeGreaterThan(steps.findIndex((s) => s.run === run));
    expect(upload).toBeGreaterThan(redact);
    expect((steps[redact] as { if?: string }).if).toContain("always()");
    expect((steps[upload] as { with?: { path?: string } }).with?.path).toBe("agent-output/upload/**/*");
  });

  it("every agent script parses", () => {
    for (const f of readdirSync(join(root, ".eas/agents")).filter((f) => f.endsWith(".sh"))) {
      const r = spawnSync("bash", ["-n", join(root, ".eas/agents", f)], { encoding: "utf8" });
      expect(r.status, `${f}: ${r.stderr}`).toBe(0);
    }
  });

  it("e2e runs only by hand", () => {
    expect(Object.keys(workflow("e2e.yml").on)).toEqual(["workflow_dispatch"]);
  });

  it("pr-preview's jobs list every job whose outputs they read, and fall back per platform", () => {
    const { jobs } = workflow("pr-preview.yml");
    for (const [id, job] of Object.entries(jobs)) {
      const read = new Set([...JSON.stringify(job).matchAll(/needs\.([a-z_]+)\./g)].map((m) => m[1]));
      const needs = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
      for (const r of read) expect(needs, `${id} reads needs.${r}`).toContain(r);
    }
    expect(jobs.get_android_build?.if).toContain("android_native == 'true'");
    expect(jobs.get_ios_build?.if).toContain("ios_native == 'true'");
    expect(jobs.get_android_build?.params?.fingerprint_hash).toContain("needs.fingerprint_preview.");
    // The update as the release lane publishes it: the release profile's env over the job's EAS
    // environment, and no --environment (it would put EAS's value back over the profile's).
    const run = jobs.publish_update!.steps!.map((s) => s.run ?? "").join("\n");
    const update = run.split("\n").find((l) => /eas-cli@[\d.]+ update\b/.test(l))!;
    expect(update).toMatch(/native-release\.mjs with-profile eas\.json "production" "\$p" -- /);
    expect(run.slice(run.indexOf(update), run.indexOf("done", run.indexOf(update)))).not.toContain("--environment");
    expect(run).toContain('fingerprint:generate --platform "$1" --build-profile "production"');
  });

  it("pr-preview publishes to the pull request's own channel", () => {
    const job = workflow("pr-preview.yml").jobs.publish_update!;
    expect(job.env?.PREVIEW_CHANNEL).toBe("pr-${{ github.event.pull_request.number }}");
    // An environment of its own, never the release's: the pull request's code runs in it. It holds
    // the release's plain values, so the update still matches the build it loads on.
    expect(job.environment).toBe("preview-release");
    for (const [id, j] of Object.entries(workflow("pr-preview.yml").jobs)) expect(j.environment ?? "", id).not.toBe("production");
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

/** Runs device.sh with a fake npx that prints the command it would run, one argument per line. */
function device(...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "agentic-ci-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "npx"), '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\nenv > "${HOME}/env.txt"\n');
  chmodSync(join(dir, "bin", "npx"), 0o755);
  const r = spawnSync("bash", [join(root, ".eas/agents/device.sh"), ...args], {
    encoding: "utf8",
    env: {
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      HOME: dir,
      AGENTIC_CI_APP_ID: "com.example.app",
      AGENTIC_CI_PLATFORM: "ios",
      AGENTIC_CI_PROJECT: dir,
      ANTHROPIC_API_KEY: "sk-ant-test-0123456789",
      EXPO_TOKEN: "expo-token-should-not-pass",
    },
  });
  const lines = r.stdout.trim().split("\n");
  const at = lines.indexOf("agent-device@0.21.41");
  const envFile = join(dir, "env.txt");
  const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  return { status: r.status, stderr: r.stderr, prefix: lines.slice(0, at + 1), device: at >= 0 ? lines.slice(at + 1) : [], stdout: r.stdout, env };
}

describe("device.sh, the agent's only shell command", () => {
  it("runs an allowed command through eas simulator:exec, with none of the job's variables", () => {
    const r = device("press", "@e2", "--settle");
    expect(r.status, r.stderr).toBe(0);
    expect(r.prefix).toEqual(["--yes", "eas-cli@27.11.0", "simulator:exec", "npx", "--yes", "agent-device@0.21.41"]);
    expect(r.device).toEqual(["press", "@e2", "--settle"]);
    expect(r.env).toMatch(/^PATH=/m);
    expect(r.env).not.toMatch(/EXPO_TOKEN|ANTHROPIC_API_KEY|AGENTIC_CI_/);
  });

  it.each([
    [["snapshot", "-i"], ["snapshot", "-i"]],
    [["fill", 'label="Email"', "a@example.com"], ["fill", 'label="Email"', "a@example.com"]],
    [["scroll", "down"], ["scroll", "down"]],
    [["swipe", "300", "500", "40", "500"], ["swipe", "300", "500", "40", "500"]],
    [["wait", "text", "Saved", "3000"], ["wait", "text", "Saved", "3000"]],
    [["screenshot", "01-home.png"], ["screenshot", "agent-output/evidence/01-home.png"]],
    [["open"], ["open", "com.example.app", "--platform", "ios"]],
  ])("allows %j", (args, expected) => {
    const r = device(...args);
    expect(r.status, r.stderr).toBe(0);
    expect(r.device).toEqual(expected);
  });

  it.each([
    [[]],
    [["install", "/tmp/evil.app"]],
    [["save-script", ".eas/agents/redact-evidence.sh"]],
    [["replay", "flow.ad"]],
    [["metro", "prepare"]],
    [["record", "stop"]],
    [["test", "--maestro", "flow.yaml"]],
    [["open", "https://attacker.example/"]],
    [["open", "--save-script=.eas/agents/redact-evidence.sh"]],
    [["screenshot", "../../.eas/agents/redact-evidence.sh"]],
    [["screenshot", "/tmp/x.png"]],
    [["screenshot", ".eas/agents/x.png"]],
    [["press", "@e2", "--save-script=x"]],
    [["fill", "@e1", "$ANTHROPIC_API_KEY"]],
    [["fill", "@e1", "sk-ant-test-0123456789"]],
    [["type", "`cat /proc/self/environ`"]],
    [["type", "--settle"]],
    [["snapshot", "--json"]],
    [["keyboard", "enter; open"]],
  ])("refuses %j", (args) => {
    const r = device(...args);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^Refused: /);
    expect(r.stdout).toBe("");
  });
});

/** Runs redact-evidence.sh in a scratch project with these evidence files and a secret in the environment. */
function redact(files: Record<string, string>, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agentic-ci-redact-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, "agent-output/evidence", name, ".."), { recursive: true });
    writeFileSync(join(dir, "agent-output/evidence", name), text);
  }
  const r = spawnSync("bash", [join(root, ".eas/agents/redact-evidence.sh")], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH, MY_API_KEY: "super-secret-value-123", ...extraEnv },
  });
  return { r, dir };
}

describe("redact-evidence.sh", () => {
  it("writes redacted copies to agent-output/upload, the only folder uploaded", () => {
    const { r, dir } = redact({ "verdict.md": "PASS: saw super-secret-value-123 on screen", "nested/log.jsonl": "x super-secret-value-123 y", "01.png": "super-secret-value-123" });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(dir, "agent-output/upload/verdict.md"), "utf8")).toBe("PASS: saw [redacted] on screen");
    expect(readFileSync(join(dir, "agent-output/upload/nested/log.jsonl"), "utf8")).toBe("x [redacted] y");
    // Images and video are copied as they are (nothing reads text out of them).
    expect(readFileSync(join(dir, "agent-output/upload/01.png"), "utf8")).toBe("super-secret-value-123");
  });

  it("fails closed: when redaction fails, there is nothing to upload", () => {
    const { r, dir } = redact({ "verdict.md": "PASS: x" }, { PATH: "/nonexistent" });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "agent-output/upload"))).toBe(false);
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

describe("the build stamp", () => {
  const stamp = { version: "0.1.0", commit: "3f2a9c1b".padEnd(40, "0"), branch: "main", builtAt: "2026-11-20T00:00:00.000Z", channel: "production" };

  it("lets a release through only when the stamp names its commit, its build time and the release's channel", () => {
    expect(() => checkStamp(stamp, "production")).not.toThrow();
    expect(() => checkStamp({ ...stamp, commit: null }, "production")).toThrow(/no commit/);
    expect(() => checkStamp({ ...stamp, builtAt: "" }, "production")).toThrow(/no builtAt/);
    expect(() => checkStamp({ ...stamp, channel: null }, "production")).toThrow(/no channel/);
    expect(() => checkStamp(stamp, "preview")).toThrow(/stamped for channel "production", not "preview"/);
    expect(() => checkStamp(stamp, "")).toThrow(/set GENESIS_CHANNEL/);
  });

  it("is stamped and checked by every EAS build, on the channel its profile builds for", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["eas-build-post-install"]).toBe('genesis build-stamp && node .eas/scripts/native-release.mjs stamped build-metadata.json "$GENESIS_CHANNEL"');
    for (const name of Object.keys(easJson.build)) expect(profile(name).env?.GENESIS_CHANNEL, name).toBe(profile(name).channel);
  });

  it("is stamped for the channel, and checked, before every update is published", () => {
    // deploy-production's update jobs stamp and check in publishUpdate, before eas update.
    const script = read(".eas/scripts/native-release.mjs");
    const body = script.slice(script.indexOf("export function publishUpdate("));
    expect(body.indexOf('"build-stamp", "--channel", channel')).toBeGreaterThan(-1);
    expect(body.indexOf("checkStamp(")).toBeGreaterThan(body.indexOf('"build-stamp"'));
    expect(body.indexOf('deps.eas(["update"')).toBeGreaterThan(body.indexOf("checkStamp("));
    const publishing = [{ job: "publish_update", channel: "$PREVIEW_CHANNEL", run: workflow("pr-preview.yml").jobs["publish_update"]!.steps!.map((s) => s.run ?? "").join("\n") }];
    for (const { job, channel, run } of publishing) {
      const stamped = run.indexOf(`node .eas/scripts/native-release.mjs genesis build-stamp --channel "${channel}"`);
      const checked = run.indexOf(`node .eas/scripts/native-release.mjs stamped build-metadata.json "${channel}"`);
      const published = run.search(/eas-cli@[\d.]+ update/);
      expect(stamped, job).toBeGreaterThan(-1);
      expect(checked, job).toBeGreaterThan(stamped);
      expect(published, job).toBeGreaterThan(checked);
    }
  });
});
