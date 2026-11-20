// @feat:setup-wizard
/**
 * The guided setup steps' runners, each with stubbed tools and a stubbed `fetch`: what each plans,
 * runs and checks, and that a secret's value reaches a tool on stdin and a service in a header,
 * never argv, a URL, a log line, a note, a message or an answer.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { RunToolOptions, ToolRunner } from "../src/exec/run.js";
import { supabaseQuery } from "../src/exec/supabase-query.js";
import { applyPlan, planFix } from "../src/fix/engine.js";
import { SecretVault } from "../src/exec/secret-vault.js";
import { createWizardHost } from "../src/wizard/host.js";
import { runStepCommand } from "../src/wizard/step-command.js";
import { runnerFor, stepFix, stepList, STEP_RUNNERS, verifyStep } from "../src/wizard/steps/index.js";
import type { FetchLike } from "../src/wizard/steps/framework.js";
import { printable } from "../src/wizard/steps/framework.js";
import { pendingMigrations } from "../src/wizard/steps/supabase-link.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

const SECRET = "tok_Steps_Secret_Value_0042";
const SUPPORT = "@marktiderman/genesis-support";

afterAll(() => cleanupApps());

/** A linked app; its catalogue names github.issues on support.githubRepo. */
function app(extra: Record<string, string> = {}): string {
  const settings = { namespace: "support", keys: { githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", setup: "github.issues" } } };
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "sample-app", dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings } }),
    "genesis.config.json": `${JSON.stringify({ doctor: { rules: { "genesis-behind": "off" } } }, null, 2)}\n`,
    "supabase/.temp/project-ref": "abcdefghijklmnopqrst\n",
    ...extra,
  });
}

interface Call {
  tool: string;
  args: readonly string[];
  stdin?: string;
}

/** Tools that answer per command, record argv and stdin, and echo stdin into their output (the worst case). */
function tools(answers: Record<string, { code?: number; stdout?: string; stderr?: string }> = {}) {
  const calls: Call[] = [];
  const run: ToolRunner = async (tool, args, options: RunToolOptions) => {
    calls.push({ tool, args, ...(options.stdin !== undefined ? { stdin: options.stdin } : {}) });
    const key = Object.keys(answers).find((k) => `${tool} ${args.join(" ")}`.startsWith(k));
    const a = key ? answers[key]! : {};
    const echo = options.stdin ? `got ${options.stdin}\n` : "";
    options.onOutput?.(echo, "stdout");
    return { code: a.code ?? 0, stdout: `${echo}${a.stdout ?? ""}`, stderr: a.stderr ?? "" };
  };
  return { run, calls };
}

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** A fetch that answers by "METHOD url" prefix and records each request. Its answers echo the secret back, the worst case. */
function web(answers: Record<string, { status?: number; body?: unknown }>) {
  const requests: Request[] = [];
  const fetch: FetchLike = async (url, init) => {
    requests.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, ...(init?.body ? { body: init.body } : {}) });
    const key = Object.keys(answers).find((k) => `${init?.method ?? "GET"} ${url}`.startsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { message: `nothing here for ${SECRET}` } };
    const status = a.status ?? 200;
    const text = JSON.stringify(a.body ?? {});
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) as unknown, text: async () => text };
  };
  return { fetch, requests };
}

/** Run a step through the fix engine as the wizard and the terminal do. Returns everything that came out. */
async function runStep(id: string, root: string, fields: Record<string, string>, deps: { run: ToolRunner; fetch: FetchLike }, secrets: Record<string, string>) {
  const fix = stepFix(runnerFor(id)!, fields, { ...deps, network: true });
  const logs: string[] = [];
  const context = { root, findings: [], network: true, log: (m: string) => logs.push(m) };
  const plan = await planFix(fix, context);
  const vault = new SecretVault();
  for (const [k, v] of Object.entries(secrets)) vault.set(k, v);
  const result = await applyPlan(fix, plan, { ...context, secrets: vault }, { keepSecrets: true, run: deps.run });
  const shown = JSON.stringify({ plan, result: { ...result, plan: undefined }, logs: logs.map((l) => vault.redact(l)) });
  vault.clear();
  return { plan, result, shown };
}

/** No value in argv, a URL or anything shown; it went on stdin or in a header. */
function expectContained(calls: Call[], requests: Request[], shown: string) {
  for (const c of calls) expect(c.args.join(" ")).not.toContain(SECRET);
  for (const r of requests) expect(r.url).not.toContain(SECRET);
  expect(shown).not.toContain(SECRET);
}

describe("the step framework", () => {
  it("has a runner for each of the six steps, each defined through defineSetupStep", () => {
    expect(STEP_RUNNERS.map((r) => r.step.id)).toEqual(["supabase.link", "github.issues", "resend.domain", "sentry", "ai.key-budget", "eas.push"]);
    for (const r of STEP_RUNNERS) expect(Object.isFrozen(r.step)).toBe(true);
  });

  it("lists the catalogue's steps with their runners, then the runners the app's services call for", () => {
    const root = app({ "eas.json": "{}" });
    expect(stepList(root).map((s) => [s.id, Boolean(s.runner)])).toEqual([
      ["supabase.link", true],
      ["github.issues", true],
      ["eas.push", true],
    ]);
  });

  it("refuses a field that doesn't fit its pattern before planning anything", async () => {
    const { run } = tools();
    await expect(planFix(stepFix(runnerFor("github.issues")!, { repo: "not a repo; rm -rf" }, { run }), { root: app(), findings: [] })).rejects.toThrow(/doesn't look right/);
    await expect(planFix(stepFix(runnerFor("github.issues")!, { repo: "a/b", extra: "x" }, { run }), { root: app(), findings: [] })).rejects.toThrow(/no field/);
  });

  it("sends supabase db query its SQL through a temp file it removes, never /dev/stdin", async () => {
    let file = "";
    let sql = "";
    const run: ToolRunner = async (_tool, args) => {
      file = args[args.length - 1]!;
      sql = readFileSync(file, "utf8");
      return { code: 0, stdout: "[]", stderr: "" };
    };
    await supabaseQuery("/", "select 1;\n", run, { args: ["-o", "json"] });
    expect(file).not.toBe("/dev/stdin");
    expect(sql).toBe("select 1;\n");
    expect(existsSync(file)).toBe(false);
  });
});

describe("supabase.link", () => {
  it("links, pushes the migrations and deploys each function, then checks none is pending", async () => {
    const root = app({ "supabase/migrations/20260101000000_init.sql": "select 1;", "supabase/functions/notify/index.ts": "", "supabase/functions/_shared/x.ts": "" });
    const { run, calls } = tools({
      "supabase migration list": { stdout: "  Local          | Remote         | Time\n  20260101000000 | 20260101000000 | 2026-01-01\n" },
      "supabase functions list": { stdout: JSON.stringify([{ slug: "notify" }]) },
    });
    const { plan, result } = await runStep("supabase.link", root, { projectRef: "abcdefghijklmnopqrst" }, { run, fetch: web({}).fetch }, {});
    expect(plan.commands.map((c) => c.args.join(" "))).toEqual(["link --project-ref abcdefghijklmnopqrst", "db push --yes", "functions deploy notify"]);
    expect(plan.secrets).toEqual([]);
    expect(result.verify).toMatchObject({ ok: true });
    expect(calls.map((c) => c.args.slice(0, 2).join(" "))).toEqual(["link --project-ref", "db push", "functions deploy", "migration list", "functions list"]);
  });

  it("names each migration and its content hash in the plan, so an edit makes the plan stale", async () => {
    const root = app({ "supabase/migrations/20260101000000_init.sql": "select 1;" });
    const fix = () => stepFix(runnerFor("supabase.link")!, { projectRef: "abcdefghijklmnopqrst" }, { run: tools().run });
    const before = await planFix(fix(), { root, findings: [] });
    const push = before.commands.find((c) => c.args[1] === "push")!;
    expect(push.why).toMatch(/20260101000000_init\.sql \(sha256 [0-9a-f]{12}\)/);
    writeFileSync(`${root}/supabase/migrations/20260101000000_init.sql`, "drop table users;");
    expect((await planFix(fix(), { root, findings: [] })).hash).not.toBe(before.hash);
  });

  it("says plainly there's no dry run on a first link, and lists the migrations instead", async () => {
    const root = makeApp(null, { "package.json": "{}", "supabase/migrations/20260101000000_init.sql": "select 1;" });
    const { run, calls } = tools({ "supabase projects list": { stdout: "[]" } });
    const fix = stepFix(runnerFor("supabase.link")!, { projectRef: "abcdefghijklmnopqrst" }, { run });
    const detected = await runnerFor("supabase.link")!.detect!({ root, fields: {}, run, fetch: web({}).fetch, network: true });
    expect(detected.join("\n")).toMatch(/No dry run: the app isn't linked yet[\s\S]*20260101000000_init\.sql/);
    expect(calls.map((c) => c.args.join(" "))).not.toContain("db push --dry-run");
    expect((await planFix(fix, { root, findings: [] })).commands.find((c) => c.args[1] === "push")!.why).toMatch(/no dry run/);
  });

  it("shows the dry run line by line, each line stripped of control characters", async () => {
    const root = app({ "supabase/migrations/20260101000000_init.sql": "select 1;" });
    const { run } = tools({ "supabase projects list": { stdout: "[]" }, "supabase db push --dry-run": { stdout: "Would push these migrations:\n \u001b[1m• 20260101000000_init.sql\u001b[0m\n" } });
    const detected = await runnerFor("supabase.link")!.detect!({ root, fields: {}, run, fetch: web({}).fetch, network: true });
    expect(detected.slice(-2)).toEqual(["Would push these migrations:", " • 20260101000000_init.sql"]);
  });

  it("isn't verified when the app is linked to another project than the one typed in", async () => {
    const root = app();
    const { run } = tools();
    const result = await verifyStep(root, "supabase.link", { projectRef: "zyxwvutsrqponmlkjihg" }, undefined, { run, network: true });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/linked to abcdefghijklmnopqrst, not zyxwvutsrqponmlkjihg/) });
  });

  it("strips control characters from the project list it prints", async () => {
    const root = app();
    const { run } = tools({ "supabase projects list": { stdout: JSON.stringify([{ id: "abcdefghijklmnopqrst", name: "app\u001b]0;pwned\u0007\u001b[2Jx", region: "us\u001b[31m-east" }]) } });
    const detected = await runnerFor("supabase.link")!.detect!({ root, fields: {}, run, fetch: web({}).fetch, network: true });
    expect(detected[0]).toBe("abcdefghijklmnopqrst  appx (us-east)");
    expect(printable("a\u009b31mb\tc\r\n")).toBe("ab c");
    expect(printable("x\u202eevil\u202c\u2066y\u2069\u200bz\u200f")).toBe("xevilyz");
  });

  it("reads pending migrations from the migration list", () => {
    expect(pendingMigrations("  Local | Remote | Time\n  ----|----|----\n  20260101000000 | 20260101000000 | t\n  20260202000000 |                | \n")).toEqual(["20260202000000"]);
  });
});

describe("github.issues", () => {
  it("keeps the token as an Edge Function secret on stdin, saves the repo, and reads the repo with the token", async () => {
    const root = app();
    const { run, calls } = tools();
    const { fetch, requests } = web({ "GET https://api.github.com/repos/acme/app": { body: { full_name: "acme/app", has_issues: true, echoed: SECRET } } });
    const { plan, result, shown } = await runStep("github.issues", root, { repo: "acme/app" }, { run, fetch }, { GITHUB_TOKEN: SECRET });
    expect(plan.secrets).toEqual(["GITHUB_TOKEN"]);
    expect(plan.files.map((f) => f.path)).toEqual(["genesis.config.json"]);
    expect(JSON.parse(readFileSync(`${root}/genesis.config.json`, "utf8")).settings).toEqual({ "support.githubRepo": "acme/app" });
    expect(calls).toEqual([{ tool: "supabase", args: ["secrets", "set", "--env-file", "/dev/stdin"], stdin: `GITHUB_TOKEN='${SECRET}'\n` }]);
    expect(requests[0]!.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(result.verify).toMatchObject({ ok: true });
    expectContained(calls, requests, shown);
  });

  it("says when the token can't see the repository, redacting what came back", async () => {
    const { run, calls } = tools();
    const { fetch, requests } = web({});
    const { result, shown } = await runStep("github.issues", app(), { repo: "acme/app" }, { run, fetch }, { GITHUB_TOKEN: SECRET });
    expect(result.verify).toMatchObject({ ok: false, message: expect.stringMatching(/can't see acme\/app/) });
    expectContained(calls, requests, shown);
  });

  it("says write access to Issues wasn't checked, and fails when the token can't read the issues", async () => {
    const { run } = tools();
    const ok = await runStep("github.issues", app(), { repo: "acme/app" }, { run, fetch: web({ "GET https://api.github.com/repos/acme/app": { body: { full_name: "acme/app\u001b[2J", has_issues: true } } }).fetch }, { GITHUB_TOKEN: SECRET });
    expect(ok.result.verify).toMatchObject({ ok: true, message: expect.stringMatching(/reads acme\/app and its issues[\s\S]*Write access to Issues wasn't checked/) });
    expect(ok.result.verify.message).not.toContain("\u001b");
    const noIssues = web({ "GET https://api.github.com/repos/acme/app/issues": { status: 403, body: {} }, "GET https://api.github.com/repos/acme/app": { body: { full_name: "acme/app", has_issues: true } } });
    const denied = await runStep("github.issues", app(), { repo: "acme/app" }, { run, fetch: noIssues.fetch }, { GITHUB_TOKEN: SECRET });
    expect(denied.result.verify).toMatchObject({ ok: false, message: expect.stringMatching(/not its issues \(403\)/) });
  });

  it("refuses a repository named . or ..", async () => {
    for (const repo of ["acme/..", "acme/."]) await expect(planFix(stepFix(runnerFor("github.issues")!, { repo }, {}), { root: app(), findings: [] })).rejects.toThrow(/doesn't look right/);
    await expect(planFix(stepFix(runnerFor("github.issues")!, { repo: "acme/.github" }, { run: tools().run }), { root: app(), findings: [] })).resolves.toMatchObject({ secrets: ["GITHUB_TOKEN"] });
  });

  it("needs the Supabase project linked first", async () => {
    const root = makeApp(null, { "package.json": "{}" });
    await expect(planFix(stepFix(runnerFor("github.issues")!, { repo: "acme/app" }, {}), { root, findings: [] })).rejects.toThrow(/supabase\.link first/);
  });
});

describe("sentry", () => {
  it("sets the token for GitHub Actions on stdin, leaves EAS to the person, and checks the project and the DSN", async () => {
    const root = app({ "eas.json": "{}" });
    const { run, calls } = tools();
    const { fetch, requests } = web({ "GET https://sentry.io/api/0/projects/acme/app/": { body: { slug: "app" } }, "POST https://o1.ingest.sentry.io/api/7/envelope/": { body: { id: "x" } } });
    const dsn = "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/7";
    const { plan, result, shown } = await runStep("sentry", root, { org: "acme", project: "app", dsn }, { run, fetch }, { SENTRY_AUTH_TOKEN: SECRET });
    expect(plan.commands).toEqual([expect.objectContaining({ tool: "gh", args: ["secret", "set", "SENTRY_AUTH_TOKEN"], stdinSecret: "SENTRY_AUTH_TOKEN" })]);
    expect(plan.manual).toMatch(/eas env:create --name SENTRY_AUTH_TOKEN/);
    expect(plan.manual).not.toContain(SECRET);
    expect(calls[0]!.stdin).toBe(SECRET);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["GET https://sentry.io/api/0/projects/acme/app/", "POST https://o1.ingest.sentry.io/api/7/envelope/"]);
    // The DSN's key is public; the auth token goes only to the API, in its header.
    expect(requests[1]!.headers["x-sentry-auth"]).toContain("sentry_key=0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(requests[1])).not.toContain(SECRET);
    expect(result.verify).toMatchObject({ ok: true });
    expectContained(calls, requests, shown);
  });
});

describe("sentry's DSN", () => {
  it("is sentry.io's only: a private, loopback or other host is refused before any request", async () => {
    for (const host of ["127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1:9000", "sentry.io.evil.example", "evilsentry.io"]) {
      await expect(planFix(stepFix(runnerFor("sentry")!, { org: "acme", project: "app", dsn: `https://0123456789abcdef0123456789abcdef@${host}/7` }, { run: tools().run }), { root: app(), findings: [] })).rejects.toThrow(/DSN doesn't look right/);
    }
  });
});

describe("resend.domain", () => {
  it("adds the domain when Resend hasn't it, shows its DNS records, and stays open until verified", async () => {
    const { run, calls } = tools();
    const { fetch, requests } = web({
      "GET https://api.resend.com/domains/d1": { body: { id: "d1", name: "mail.example.com", status: "pending", records: [{ type: "TXT", name: "send", value: "v=spf1 include:x ~all" }] } },
      "GET https://api.resend.com/domains": { body: { data: [] } },
      "POST https://api.resend.com/domains": { body: { id: "d1", name: "mail.example.com", status: "not_started", records: [{ type: "MX", name: "send", value: "feedback.example", priority: 10 }] } },
    });
    const { result, shown } = await runStep("resend.domain", app(), { domain: "mail.example.com" }, { run, fetch }, { RESEND_API_KEY: SECRET });
    expect(result.notes.join("\n")).toMatch(/Added mail\.example\.com to Resend[\s\S]*MX {2}send {2}feedback\.example {2}\(priority 10\)/);
    expect(requests.find((r) => r.method === "POST")!.body).toBe(JSON.stringify({ name: "mail.example.com" }));
    // Not verified yet: the list now is empty again in this stub, so it says to run it.
    expect(result.verify.ok).toBe(false);
    expectContained(calls, requests, shown);
  });

  it("is verified once Resend says so", async () => {
    const { run } = tools();
    const { fetch } = web({ "GET https://api.resend.com/domains/d1": { body: { id: "d1", name: "mail.example.com", status: "verified" } }, "GET https://api.resend.com/domains": { body: { data: [{ id: "d1", name: "mail.example.com" }] } } });
    const { result } = await runStep("resend.domain", app(), { domain: "mail.example.com" }, { run, fetch }, { RESEND_API_KEY: SECRET });
    expect(result.notes[0]).toMatch(/already in Resend/);
    expect(result.verify).toMatchObject({ ok: true });
  });
});

describe("ai.key-budget", () => {
  it("keeps the key as an Edge Function secret and lists the models with it", async () => {
    const { run, calls } = tools();
    const { fetch, requests } = web({ "GET https://api.anthropic.com/v1/models": { body: { data: [] } } });
    const { result, shown } = await runStep("ai.key-budget", app(), { budgetUsd: "50" }, { run, fetch }, { ANTHROPIC_API_KEY: SECRET });
    expect(calls[0]!.stdin).toBe(`ANTHROPIC_API_KEY='${SECRET}'\n`);
    expect(requests[0]!.headers["x-api-key"]).toBe(SECRET);
    expect(result.verify).toMatchObject({ ok: true });
    expectContained(calls, requests, shown);
  });
});

describe("eas.push", () => {
  it("is manual: nothing runs, and its check is that EAS is signed in", async () => {
    const root = app({ "eas.json": "{}" });
    const { run, calls } = tools({ "eas whoami": { stdout: "someone\n" } });
    const fix = stepFix(runnerFor("eas.push")!, {}, { run, network: true });
    expect(fix.kind).toBe("manual");
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.commands).toEqual([]);
    expect(plan.manual).toMatch(/eas credentials -p ios/);
    await expect(applyPlan(fix, plan, { root, findings: [] })).rejects.toThrow(/manual/);
    // Signed in isn't a push that arrived: the step stays open, so the terminal shows ✗ and exits 1.
    expect(await fix.verify!({ root, findings: [] })).toMatchObject({ ok: false, message: expect.stringMatching(/^Not verified: send a test push from a device build[\s\S]*as someone/) });
    expect(calls.map((c) => c.args.join(" "))).toEqual(["whoami"]);
  });
});

describe("the wizard's Guided steps ops", () => {
  it("starts, plans, applies with the secret, and re-checks, never answering with the value", async () => {
    const root = app();
    const { run, calls } = tools({ "supabase projects list": { stdout: JSON.stringify([{ id: "abcdefghijklmnopqrst", name: "app" }]) } });
    const { fetch, requests } = web({ "GET https://api.github.com/repos/acme/app": { body: { full_name: "acme/app", echoed: SECRET } } });
    const events: unknown[] = [];
    const h = createWizardHost({ mode: "setup", root, network: true, deps: { doctor: async () => ({ findings: [] }), run, fetch }, publish: (e, d) => events.push({ e, d }) });
    const call = async (op: string, body: Record<string, unknown> = {}) => h.handle({ v: 1, op, ...body });
    const bodies: unknown[] = [];
    const keep = <T>(r: T) => (bodies.push(r), r);

    expect(keep(await call("step.start", { id: "supabase.link" })).body).toMatchObject({ step: { id: "supabase.link" }, detected: ["abcdefghijklmnopqrst  app"] });
    expect(keep(await call("step.submit", { id: "github.issues", fields: { repo: "bad repo" } })).status).toBe(400);
    const { plan } = keep(await call("step.submit", { id: "github.issues", fields: { repo: "acme/app" } })).body as { plan: { fixId: string; hash: string; secrets: string[] } };
    expect(plan).toMatchObject({ fixId: "setup.github.issues", secrets: ["GITHUB_TOKEN"] });
    expect(keep(await call("apply", { fixId: plan.fixId, expect: plan.hash })).body).toMatchObject({ error: { code: "bad_request" } });
    expect(keep(await call("apply", { fixId: plan.fixId, expect: plan.hash, secrets: { GITHUB_TOKEN: SECRET } })).body).toMatchObject({ result: { verified: true } });
    expect(keep(await call("step.verify", { id: "github.issues", fields: { repo: "acme/app" } })).body).toMatchObject({ result: { verified: false, message: expect.stringMatching(/needs GITHUB_TOKEN/) } });
    expect(keep(await call("step.verify", { id: "github.issues", fields: { repo: "acme/app" }, secrets: { GITHUB_TOKEN: SECRET } })).body).toMatchObject({ result: { verified: true } });
    expect(keep(await call("step.verify", { id: "github.issues", fields: { repo: "acme/app" }, secrets: { OTHER: SECRET } })).status).toBe(400);
    expect(keep(await call("step.start", { id: "nope" })).status).toBe(404);

    expect(JSON.stringify(bodies)).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expectContained(calls, requests, "");
  });
});

describe("a long secret (1,520 characters)", () => {
  // One regular expression per value used to throw past ~1,500 characters, with the value in its message.
  const LONG = `sk-${"Ab3/+x9Z".repeat(190)}`.slice(0, 1520);
  // The old error spelled it out one escaped unit at a time, `(?:A|\\u0041)(?:b|…)…`: undo that shape too.
  const squash = (text: string) => text.replace(/\|[^)]*\)/g, "").replace(/\(\?:/g, "").replace(/\\/g, "");
  const leaks = (text: string) => text.includes(LONG.slice(100, 140)) || squash(text).includes(LONG.slice(100, 140)) || /Invalid regular expression/.test(text);

  it("is redacted, in every JSON-escaped form, without a regular expression", () => {
    expect(LONG).toHaveLength(1520);
    const vault = new SecretVault();
    vault.set("ANTHROPIC_API_KEY", LONG);
    const text = `a ${LONG} b ${JSON.stringify(LONG)} c ${LONG.split("/").join("\\/")} d ${LONG.replace(/A/g, "\\u0041")}`;
    expect(() => vault.redact(text)).not.toThrow();
    expect(vault.redact(text)).toBe('a [redacted] b "[redacted]" c [redacted] d [redacted]');
  });

  it("never comes back from step.verify, even when the service echoes it", async () => {
    const root = app();
    const { run } = tools();
    const { fetch } = web({ "GET https://api.anthropic.com/v1/models": { status: 500, body: { error: `bad key ${LONG}` } } });
    const h = createWizardHost({ mode: "setup", root, network: true, deps: { doctor: async () => ({ findings: [] }), run, fetch } });
    const res = await h.handle({ v: 1, op: "step.verify", id: "ai.key-budget", fields: { budgetUsd: "50" }, secrets: { ANTHROPIC_API_KEY: LONG } });
    expect(leaks(JSON.stringify(res))).toBe(false);
    expect(JSON.stringify(res)).toMatch(/typed in for ANTHROPIC_API_KEY, not the one stored/);
  });

  it("never comes back from genesis setup --step, even when the tool echoes it", async () => {
    const { run, calls } = tools();
    const { fetch } = web({ "GET https://api.anthropic.com/v1/models": { body: { echoed: LONG } } });
    const out: string[] = [];
    const code = await runStepCommand(
      { root: app(), id: "ai.key-budget", network: true },
      { out: (l) => out.push(l), err: (l) => out.push(l), ask: async () => "50", confirm: async () => true, askSecret: async () => LONG, deps: { run, fetch } },
    );
    expect(code).toBe(0);
    expect(calls[0]!.stdin).toContain(LONG);
    expect(leaks(out.join("\n"))).toBe(false);
  });

  it("redacts a match that starts inside another and runs past it, with two values or one periodic value", () => {
    const two = new SecretVault();
    two.set("FIRST_KEY", "abcdefgh12345678");
    two.set("SECOND_KEY", "12345678zyxwvuts");
    expect(two.redact("x abcdefgh12345678zyxwvuts y")).toBe("x [redacted] y");
    expect(two.redact(`x ${JSON.stringify("abcdefgh12345678zyxwvuts").replace(/z/g, "\\u007a")} y`)).toBe('x "[redacted]" y');
    const periodic = new SecretVault();
    periodic.set("PERIODIC_KEY", "abababab");
    expect(periodic.redact("ababababab")).toBe("[redacted]");
    expect(periodic.redact("abababab\\u0061b!")).toBe("[redacted]!");
  });

  it("stays linear when the value and the text share long runs of one character", () => {
    const vault = new SecretVault();
    vault.set("RUN_KEY", "a".repeat(4096));
    const near = new SecretVault();
    near.set("NEAR_KEY", `${"a".repeat(4095)}b`);
    const started = performance.now();
    // Every match inside the run overlaps the next, so the whole run is one span.
    expect(vault.redact("a".repeat(40_960))).toBe("[redacted]");
    expect(vault.redact(`${"a".repeat(40_960)}\\n`)).toBe("[redacted]\\n");
    expect(near.redact("a".repeat(40_000))).toBe("a".repeat(40_000));
    expect(near.redact(`\\n${"a".repeat(40_000)}`)).toBe(`\\n${"a".repeat(40_000)}`);
    expect(near.redact(`${"a".repeat(40_000)}\\n`)).toBe(`${"a".repeat(40_000)}\\n`);
    expect(near.redact(`${"a".repeat(20_000)}\\n${"a".repeat(20_000)}`)).toBe(`${"a".repeat(20_000)}\\n${"a".repeat(20_000)}`);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("is refused past the cap, without the value in the error", () => {
    const vault = new SecretVault();
    const huge = "x".repeat(70_000);
    expect(() => vault.set("BIG_KEY", huge)).toThrow(/longer than 65536/);
    try {
      vault.set("BIG_KEY", huge);
    } catch (err) {
      expect((err as Error).message).not.toContain("xxxxxxxxxx");
    }
  });
});

describe("genesis setup --step at a terminal", () => {
  it("prints what to do, asks the values and the secret, runs the plan and checks it, printing no value", async () => {
    const root = app();
    const { run, calls } = tools();
    const { fetch, requests } = web({ "GET https://api.github.com/repos/acme/app": { body: { full_name: "acme/app" } } });
    const out: string[] = [];
    const code = await runStepCommand(
      { root, id: "github.issues", network: true },
      { out: (l) => out.push(l), err: (l) => out.push(l), ask: async () => "acme/app", confirm: async () => true, askSecret: async () => SECRET, deps: { run, fetch } },
    );
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toMatch(/Issues, Read and write/);
    expect(text).toMatch(/run {4}supabase secrets set --env-file \/dev\/stdin < GITHUB_TOKEN/);
    expect(text).toMatch(/✔ github\.issues/);
    expect(text).not.toContain(SECRET);
    expectContained(calls, requests, text);
  });

  it("runs nothing when the plan isn't approved, and names the steps for an unknown id", async () => {
    const { run, calls } = tools();
    const out: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => out.push(l), ask: async () => "acme/app", confirm: async () => false, askSecret: async () => SECRET, deps: { run } };
    expect(await runStepCommand({ root: app(), id: "github.issues", network: false }, io)).toBe(1);
    expect(calls).toEqual([]);
    expect(await runStepCommand({ root: app(), id: "nope", network: false }, io)).toBe(1);
    expect(out.join("\n")).toMatch(/No guided step nope \(the steps: supabase\.link, github\.issues/);
  });
});
