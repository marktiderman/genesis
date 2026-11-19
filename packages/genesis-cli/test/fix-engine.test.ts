// @feat:doctor-fixes
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BUILTIN_RULES, formatReport, runDoctor, toJson, type Finding } from "../src/doctor/index.js";
import {
  applyPlan,
  attachFixes,
  builtinFixes,
  canonicalJson,
  defineFix,
  FileConflictError,
  FixError,
  loadFixes,
  planFix,
  sha256,
  StalePlanError,
  type Fix,
} from "../src/fix/index.js";
import { runFixCommand } from "../src/fix/command.js";
import { ALLOWED_TOOLS, childEnv, resolveTool, runTool, withValues, type ToolRunner } from "../src/exec/run.js";
import type { DeclaringPackage } from "../src/doctor/types.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";
import { removeTempDir } from "./temp.js";

const dirs: string[] = [];
function tmpApp(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-fix-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}
afterAll(() => {
  for (const d of dirs.splice(0)) removeTempDir(d);
  cleanupApps();
});

const read = (root: string, rel: string) => readFileSync(path.join(root, rel), "utf8");
const finding = (rule: string, extra: Partial<Finding> = {}): Finding => ({ rule, level: "warn", file: "a.txt", line: 0, message: "m", ...extra });

/** Upper-cases a.txt: the smallest real fix. */
const upper = defineFix({
  id: "test.upper",
  kind: "auto",
  rules: ["lower-case"],
  title: "upper-case a.txt",
  plan(ctx) {
    const text = read(ctx.root, "a.txt");
    return { summary: "upper-cases a.txt", files: [{ path: "a.txt", beforeHash: sha256(text), content: text.toUpperCase(), why: "shout" }] };
  },
});

describe("plans", () => {
  it("hash the canonical JSON: key order never changes the hash", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("plan, apply and verify", async () => {
    const root = tmpApp({ "a.txt": "hello" });
    const plan = await planFix(upper, { root, findings: [] });
    expect(plan).toMatchObject({ fixId: "test.upper", files: [{ path: "a.txt", beforeHash: sha256("hello"), content: "HELLO" }], commands: [], secrets: [] });
    expect(plan.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await planFix(upper, { root, findings: [] })).hash).toBe(plan.hash);
    expect(read(root, "a.txt")).toBe("hello"); // planning writes nothing
    const result = await applyPlan(upper, plan, { root, findings: [] });
    expect(read(root, "a.txt")).toBe("HELLO");
    expect(result).toMatchObject({ written: ["a.txt"], verify: { ok: true } });
  });

  it("verify re-checks the fix's rules when the caller can", async () => {
    const root = tmpApp({ "a.txt": "hello" });
    const plan = await planFix(upper, { root, findings: [] });
    const left = [{ ...finding("lower-case"), fix: { id: "test.upper", kind: "auto" as const, title: "t" } }];
    const result = await applyPlan(upper, plan, { root, findings: [], recheck: async () => left });
    expect(result.verify).toMatchObject({ ok: false, remaining: left, message: "1 finding left" });
  });

  it("refuses a stale plan: the app changed after it was read, and nothing is written", async () => {
    const root = tmpApp({ "a.txt": "hello" });
    const plan = await planFix(upper, { root, findings: [] });
    writeFileSync(path.join(root, "a.txt"), "changed");
    await expect(applyPlan(upper, plan, { root, findings: [] })).rejects.toBeInstanceOf(StalePlanError);
    expect(read(root, "a.txt")).toBe("changed");
  });

  it("refuses a plan whose content doesn't match its hash, and an --expect that isn't the plan", async () => {
    const root = tmpApp({ "a.txt": "hello" });
    const plan = await planFix(upper, { root, findings: [] });
    await expect(applyPlan(upper, { ...plan, files: [{ ...plan.files[0]!, content: "EVIL" }] }, { root, findings: [] })).rejects.toBeInstanceOf(StalePlanError);
    await expect(applyPlan(upper, plan, { root, findings: [] }, { expect: "0".repeat(64) })).rejects.toBeInstanceOf(StalePlanError);
    expect(read(root, "a.txt")).toBe("hello");
  });

  it("checks every file's beforeHash before writing any (a change between plan and write)", async () => {
    const root = tmpApp({ "a.txt": "a", "b.txt": "b" });
    // A plan read once and replayed: the file changes under it, the plan doesn't.
    let snapshot: ReturnType<Fix["plan"]> | null = null;
    const racy = defineFix({
      id: "test.racy",
      kind: "auto",
      rules: ["r"],
      title: "racy",
      plan: (ctx) => (snapshot ??= { summary: "two files", files: [{ path: "a.txt", beforeHash: sha256(read(ctx.root, "a.txt")), content: "A", why: "x" }, { path: "b.txt", beforeHash: sha256(read(ctx.root, "b.txt")), content: "B", why: "x" }] }),
    });
    const plan = await planFix(racy, { root, findings: [] });
    writeFileSync(path.join(root, "b.txt"), "someone else");
    await expect(applyPlan(racy, plan, { root, findings: [] })).rejects.toBeInstanceOf(FileConflictError);
    expect(read(root, "a.txt")).toBe("a");
    expect(read(root, "b.txt")).toBe("someone else");
  });

  it("creates a file the plan expects absent, and refuses when it appeared", async () => {
    const root = tmpApp();
    let snapshot: ReturnType<Fix["plan"]> | null = null;
    const create = defineFix({ id: "test.create", kind: "auto", rules: ["r"], title: "create", plan: () => (snapshot ??= { summary: "c", files: [{ path: "dir/new.txt", beforeHash: null, content: "new", why: "x" }] }) });
    const plan = await planFix(create, { root, findings: [] });
    mkdirSync(path.join(root, "dir"));
    writeFileSync(path.join(root, "dir/new.txt"), "theirs");
    await expect(applyPlan(create, plan, { root, findings: [] })).rejects.toThrow(/now exists/);
    const fresh = tmpApp();
    await applyPlan(create, await planFix(create, { root: fresh, findings: [] }), { root: fresh, findings: [] });
    expect(read(fresh, "dir/new.txt")).toBe("new");
  });

  it.each(["../outside.txt", "/etc/passwd", "a/../../b", "a\\b", "./a.txt"])("refuses to plan a write to %s", async (bad) => {
    const fix = defineFix({ id: "test.bad", kind: "auto", rules: ["r"], title: "bad", plan: () => ({ summary: "s", files: [{ path: bad, beforeHash: null, content: "x", why: "x" }] }) });
    await expect(planFix(fix, { root: tmpApp(), findings: [] })).rejects.toBeInstanceOf(FixError);
  });

  it("refuses a manual fix and a plan with a tool outside the allowlist", async () => {
    const manual = defineFix({ id: "test.manual", kind: "manual", rules: ["r"], title: "by hand", plan: () => ({ summary: "s", manual: "do it" }) });
    const root = tmpApp();
    await expect(applyPlan(manual, await planFix(manual, { root, findings: [] }), { root, findings: [] })).rejects.toThrow(/manual fix/);
    const shell = defineFix({ id: "test.sh", kind: "auto", rules: ["r"], title: "sh", plan: () => ({ summary: "s", commands: [{ tool: "sh", args: ["-c", "rm -rf /"], why: "no" }] }) });
    await expect(planFix(shell, { root, findings: [] })).rejects.toThrow(/isn't a tool a fix may run/);
  });
});

describe("commands", () => {
  const calls: Array<{ tool: string; args: readonly string[]; stdin?: string }> = [];
  const runner: ToolRunner = async (tool, args, options) => {
    calls.push({ tool, args, ...(options.stdin !== undefined ? { stdin: options.stdin } : {}) });
    return { code: 0, stdout: "", stderr: "" };
  };
  const secretFix = defineFix({
    id: "test.secret",
    kind: "guided",
    rules: ["r"],
    title: "set a secret",
    plan: () => ({ summary: "sets API_KEY", commands: [{ tool: "gh", args: ["secret", "set", "API_KEY"], stdinSecret: "API_KEY", why: "the edge function reads it" }] }),
  });

  it("names secrets only, sends the value on stdin, and refuses without it", async () => {
    const root = tmpApp();
    const plan = await planFix(secretFix, { root, findings: [] });
    expect(plan.secrets).toEqual(["API_KEY"]);
    expect(JSON.stringify(plan)).not.toContain("s3cret-value");
    await expect(applyPlan(secretFix, plan, { root, findings: [] }, { run: runner })).rejects.toThrow(/needs API_KEY/);
    expect(calls).toEqual([]);
    await applyPlan(secretFix, plan, { root, findings: [], secrets: { API_KEY: "s3cret-value" } }, { run: runner });
    expect(calls).toEqual([{ tool: "gh", args: ["secret", "set", "API_KEY"], stdin: "s3cret-value" }]);
  });

  it("redacts a secret from a failing command's output", async () => {
    const root = tmpApp();
    const plan = await planFix(secretFix, { root, findings: [] });
    const failing: ToolRunner = async () => ({ code: 1, stdout: "", stderr: "bad key s3cret-value" });
    await expect(applyPlan(secretFix, plan, { root, findings: [], secrets: { API_KEY: "s3cret-value" } }, { run: failing })).rejects.toThrow("bad key [redacted]");
  });

  it("runs only allowlisted tools, without a shell, in a scrubbed environment", async () => {
    expect(ALLOWED_TOOLS).not.toContain("sh");
    await expect(runTool("sh" as never, ["-c", "echo hi"], { cwd: tmpdir() })).rejects.toThrow(/isn't a tool a fix may run/);
    const env = childEnv({ passEnv: ["GH_TOKEN"] }, { PATH: "/bin", HOME: "/h", GH_TOKEN: "t", AWS_SECRET_ACCESS_KEY: "nope" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", GH_TOKEN: "t" });
    // An argument with shell syntax reaches git as one plain argument.
    const r = await runTool("git", ["--version", "; echo pwned"], { cwd: tmpdir() });
    expect(r.stdout).not.toContain("pwned");
  });
});

describe("attachFixes", () => {
  it("gives every finding a fix: the first that applies, else manual:<rule>", () => {
    const narrow = defineFix({ id: "test.narrow", kind: "auto", rules: ["a"], title: "narrow", appliesTo: (f) => f.subject === "yes", plan: () => ({ summary: "" }) });
    const out = attachFixes([finding("a", { subject: "yes" }), finding("a", { subject: "no" }), finding("b")], [narrow], { root: "/" });
    expect(out.map((f) => f.fix)).toEqual([
      { id: "test.narrow", kind: "auto", title: "narrow", command: "genesis fix test.narrow" },
      { id: "manual:a", kind: "manual", title: "follow the finding's message" },
      { id: "manual:b", kind: "manual", title: "follow the finding's message" },
    ]);
  });

  it("runDoctor attaches one to every finding, and the reports show genesis fix <id>", async () => {
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app" }),
      "src/screen.ts": 'import { resolveZone } from "@marktiderman/genesis-core";\nexport const b = resolveZone("practice", zones);\n',
    });
    const result = await runDoctor({ root, config: {} });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.fix)).toBe(true);
    const scope = result.findings.find((f) => f.rule === "removed-scope-name")!;
    expect(scope.fix).toMatchObject({ id: "codemod.scope-names", kind: "auto", command: "genesis fix codemod.scope-names" });
    expect(formatReport(result)).toContain("→ genesis fix codemod.scope-names");
    expect(toJson(result).findings.find((f) => f.rule === "removed-scope-name")?.fix?.command).toBe("genesis fix codemod.scope-names");
  });
});

/**
 * The ratchet: built-in rules whose findings only a person can fix today. It may only shrink:
 * a new built-in rule ships with a fix, and a rule that gains one leaves this list.
 */
const RULES_WITHOUT_A_FIX = [
  "local-primitives", "figma-routes", "starter-leftover", "forbidden-import", "raw-tag", "palette-color", "arbitrary-color", "raw-color",
  "undefined-token", "shadowed-export", "duplicate-genesis-package", "peer-range-mismatch", "hand-rolled-sub-nav", "local-genesis-copy",
  "resource-workspace", "page-layout", "iso-date-slice", "resource-view-tree", "studio-server-auth-import", "scope-practice-id", "beta-import",
  "native-raw-primitive", "native-literal-color", "native-custom-header", "native-screen-layout", "store-readiness", "eas-placeholder",
  "fingerprint-plugin-files", "release-lane-twice", "migration-grants", "migration-rls", "migration-definer-search-path", "migration-edited",
  "migration-testing-kit", "migration-view-rls", "exposed-schema-created-later", "package-app-import", "package-undeclared-dependency",
  "package-migration-test", "package-migration-number", "package-migration-edited", "package-unregistered", "package-unversioned-change",
  "package-export-missing", "package-block-invalid", "package-untagged-tests", "package-doctor-declaration", "overlay-unmarked", "overlay-invalid",
  "overlay-age", "overlay-version", "package-rules-invalid", "package-rule-override", "ratchet-skipped", "allow-grew", "rules-weakened",
  "extension-added", "stale-extension", "extension-invalid", "lock-files", "database-elsewhere", "genesis-config-unknown-key", "app-part-colors", "app-part-name",
  "custom-view-states", "client/layer", "client/one-view-per-resource", "data/declared-access", "data/access-rule-tests",
];

describe("coverage ratchet", () => {
  it("lists exactly the built-in rules without an automatic or guided fix (so it can only shrink)", () => {
    const covered = new Set(builtinFixes().filter((f) => f.kind !== "manual").flatMap((f) => f.rules));
    const uncovered = BUILTIN_RULES.filter((r) => !covered.has(r));
    // A new rule without a fix fails here: give it one (src/fix/builtin.ts).
    expect(uncovered.filter((r) => !RULES_WITHOUT_A_FIX.includes(r))).toEqual([]);
    // A rule that gained a fix fails here: take it off the list.
    expect(RULES_WITHOUT_A_FIX.filter((r) => covered.has(r) || !(BUILTIN_RULES as readonly string[]).includes(r))).toEqual([]);
  });

  it("every built-in fix covers built-in rules, with a unique id", () => {
    const fixes = builtinFixes();
    expect(new Set(fixes.map((f) => f.id)).size).toBe(fixes.length);
    for (const f of fixes) for (const r of f.rules) expect(BUILTIN_RULES).toContain(r);
  });
});

describe("package fixes (genesis.doctor.fixes)", () => {
  function pkg(dir: string, fixes: string): DeclaringPackage {
    return { name: "@marktiderman/genesis-widgets", version: "1.0.0", dir, namespace: "widgets", local: false, private: false, declaration: { enforce: true, prefer: [], primitives: [], fixes } };
  }
  it("loads them namespaced, so a package fixes only its own rules", async () => {
    const dir = tmpApp({
      "fixes.mjs": 'export default [{ id: "swap", kind: "auto", rules: ["use-widget"], title: "swap", plan: () => ({ summary: "s" }) }, { id: "Bad Id", kind: "auto", rules: ["x"], title: "t", plan() {} }];',
    });
    const { fixes, problems } = await loadFixes([pkg(dir, path.join(dir, "fixes.mjs"))]);
    expect(fixes.map((f) => [f.id, f.rules])).toEqual([["widgets/swap", ["widgets/use-widget"]]]);
    expect(problems).toEqual([{ package: "@marktiderman/genesis-widgets", message: expect.stringContaining("id must be") }]);
  });

  it("reports a module that won't load instead of throwing", async () => {
    const dir = tmpApp();
    const { fixes, problems } = await loadFixes([pkg(dir, path.join(dir, "missing.mjs"))]);
    expect(fixes).toEqual([]);
    expect(problems[0]?.message).toMatch(/could not load its fixes/);
  });
});

describe("genesis fix", () => {
  function io() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  }
  const scopeApp = () =>
    makeApp(null, {
      "package.json": JSON.stringify({ name: "app" }),
      "src/screen.tsx": 'import { NativeResourceView } from "@marktiderman/genesis-ui-native";\nexport const A = () => <NativeResourceView view={v} practiceTimeZone={zone} />;\n',
    });

  it("lists the fixes the findings declare", async () => {
    const root = scopeApp();
    const t = io();
    expect(await runFixCommand({ root, network: false }, t.io)).toBe(0);
    expect(t.out.join("\n")).toContain("genesis fix codemod.scope-names  (auto, 1 finding)");
  });

  it("plans with --plan and writes nothing; applies with --yes and verifies with the doctor", async () => {
    const root = scopeApp();
    const before = read(root, "src/screen.tsx");
    const planned = io();
    expect(await runFixCommand({ root, target: "removed-scope-name", plan: true, network: false }, planned.io)).toBe(0);
    expect(planned.out.join("\n")).toMatch(/write  src\/screen\.tsx/);
    expect(read(root, "src/screen.tsx")).toBe(before);
    const hash = /plan ([0-9a-f]{64})/.exec(planned.out.join("\n"))![1]!;

    // Without --yes and without a terminal: the plan and how to apply it, nothing written.
    const asked = io();
    expect(await runFixCommand({ root, target: "codemod.scope-names", network: false }, asked.io)).toBe(0);
    expect(asked.out.join("\n")).toContain(`genesis fix codemod.scope-names --yes --expect ${hash}`);
    expect(read(root, "src/screen.tsx")).toBe(before);

    const applied = io();
    expect(await runFixCommand({ root, target: "codemod.scope-names", yes: true, expect: hash, network: false }, applied.io)).toBe(0);
    expect(read(root, "src/screen.tsx")).toContain("scopeTimeZone={zone}");
    expect(applied.out.join("\n")).toContain("✔ Verified");
    const after = await runDoctor({ root, config: {} });
    expect(after.findings.filter((f) => f.rule === "removed-scope-name")).toEqual([]);
  });

  it("refuses --expect with a stale hash and writes nothing", async () => {
    const root = scopeApp();
    const before = read(root, "src/screen.tsx");
    const t = io();
    expect(await runFixCommand({ root, target: "codemod.scope-names", yes: true, expect: "f".repeat(64), network: false }, t.io)).toBe(1);
    expect(t.err.join("\n")).toMatch(/the app changed since that plan was read/);
    expect(read(root, "src/screen.tsx")).toBe(before);
  });

  it("prints a manual fix's findings and runs nothing", async () => {
    const root = makeApp(null, { "package.json": JSON.stringify({ name: "app" }), "src/x.tsx": "export const X = () => <button>x</button>;\n" });
    const t = io();
    expect(await runFixCommand({ root, target: "raw-tag", network: false }, t.io)).toBe(0);
    expect(t.out.join("\n")).toMatch(/manual:raw-tag: nothing runs; fix by hand/);
  });

  it("removes settings no package declares (settings.remove-unknown), keeping the file's format", async () => {
    const SUPPORT = "@marktiderman/genesis-support";
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0" } }),
      [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings: { namespace: "support", keys: { inbox: { type: "boolean", default: true } } } } }),
      "genesis.config.json": `{\n    "settings": {\n        "support.inbox": false,\n        "support.inbx": true\n    }\n}\n`,
    });
    const t = io();
    expect(await runFixCommand({ root, target: "invalid-setting", yes: true, network: false }, t.io)).toBe(0);
    expect(read(root, "genesis.config.json")).toBe(`{\n    "settings": {\n        "support.inbox": false\n    }\n}\n`);
  });

  it("regenerates a stale agent guide (agents.guide)", async () => {
    const root = makeApp(null, { "package.json": JSON.stringify({ name: "app" }), ".claude/skills/genesis/SKILL.md": "old\n", "AGENTS.md": "# Agent notes\n", "CLAUDE.md": "@AGENTS.md\n" });
    const t = io();
    expect(await runFixCommand({ root, target: "agent-guide-stale", yes: true, network: false }, t.io)).toBe(0);
    expect(read(root, "AGENTS.md")).toContain("genesis-primitives:start");
    expect(read(root, ".claude/skills/genesis/SKILL.md")).not.toBe("old\n");
    expect(t.out.join("\n")).toContain("✔ Verified");
  });
});

describe("codemod fixes plan what the codemod would write", () => {
  it("codemod.eslint-config: the import and spread, and the install left to the person", async () => {
    const root = tmpApp({ "package.json": JSON.stringify({ name: "app", dependencies: { expo: "55.0.0" } }, null, 2) + "\n", "eslint.config.js": "module.exports = [\n  { rules: {} },\n];\n" });
    const fix = builtinFixes().find((f) => f.id === "codemod.eslint-config")!;
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.files.map((f) => f.path).sort()).toEqual(["eslint.config.js", "package.json"]);
    expect(plan.files.find((f) => f.path === "eslint.config.js")?.content).toContain('genesis("native")');
    expect(plan.manual).toMatch(/Then install \(package\.json changed\): /);
    expect(read(root, "eslint.config.js")).toBe("module.exports = [\n  { rules: {} },\n];\n");
    await applyPlan(fix, plan, { root, findings: [] });
    expect(read(root, "eslint.config.js")).toContain('genesis("native")');
  });

  it("codemod.features-renamed: covers only imports of the renamed package", async () => {
    const root = tmpApp({ "package.json": JSON.stringify({ name: "app" }), "src/a.ts": 'import { featureOn } from "@marktiderman/genesis-features/gate";\n' });
    const fix = builtinFixes().find((f) => f.id === "codemod.features-renamed")!;
    expect(fix.appliesTo!(finding("deprecated-import", { subject: "@marktiderman/genesis-features/gate" }), { root })).toBe(true);
    expect(fix.appliesTo!(finding("deprecated-import", { subject: "OldButton" }), { root })).toBe(false);
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.files).toEqual([expect.objectContaining({ path: "src/a.ts", content: 'import { featureOn } from "@marktiderman/genesis-config/gate";\n' })]);
  });
});

const cleanGit: ToolRunner = async () => ({ code: 0, stdout: "", stderr: "" });

describe("in-process fixes", () => {
  it("migrate.copy plans from a dry run and applies genesis migrate", async () => {
    const calls: unknown[] = [];
    const runMigrate = async (o: { root: string; dryRun?: boolean }) => {
      calls.push(o);
      return { plan: { rows: [{ package: "@marktiderman/genesis-support", file: "0001_support.sql", state: "new" as const, target: `supabase/migrations/${Date.now()}_support.sql` }], creates: [] }, written: o.dryRun ? [] : ["supabase/migrations/x.sql"], warnings: [], switchedOff: [], attention: false };
    };
    const fix = builtinFixes({ runMigrate: runMigrate as never }).find((f) => f.id === "migrate.copy")!;
    const root = tmpApp();
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.commands).toEqual([expect.objectContaining({ tool: "genesis", args: ["migrate"] })]);
    // The hash doesn't depend on the timestamped target, so a plan read a second ago still applies.
    const result = await applyPlan(fix, plan, { root, findings: [], recheck: async () => [] });
    expect(result.notes[0]).toBe("Created supabase/migrations/x.sql");
    expect(calls).toEqual([{ root, dryRun: true }, { root, dryRun: true }, { root }]);
  });

  it("upgrade.release plans a dry run and applies with a pull request, never merging", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const runUpgrade = async (o: Record<string, unknown>) => {
      calls.push(o);
      return { version: "2.4.0", changes: [{ name: "@marktiderman/genesis-ui", from: "2.1.0", to: "2.4.0" }], codemods: [], breaks: [], summary: "moved", ...(o.pr ? { pr: "https://github.com/acme/sample-app/pull/7" } : {}) };
    };
    const fix = builtinFixes({ runUpgrade: runUpgrade as never, run: cleanGit }).find((f) => f.id === "upgrade.release")!;
    const root = tmpApp();
    const findings = [finding("genesis-behind")];
    const plan = await planFix(fix, { root, findings });
    expect(calls[0]).toMatchObject({ version: "latest", dryRun: true, install: false });
    expect(plan.commands).toEqual([expect.objectContaining({ tool: "genesis", args: ["upgrade", "--version", "2.4.0", "--pr"] })]);
    expect(plan.manual).toMatch(/merge the pull request yourself/);
    const result = await applyPlan(fix, plan, { root, findings, recheck: async () => [] });
    expect(calls.at(-1)).toEqual({ root, version: "2.4.0", pr: true });
    expect(result.ran).toEqual(["genesis upgrade --version 2.4.0 --pr"]);
    expect(result.notes[0]).toContain("pull/7 (not merged)");
    expect(result.verify).toMatchObject({ ok: true, message: expect.stringContaining("pull/7") });
    expect(calls.some((c) => "merge" in c)).toBe(false);
  });

  it("contracts.introspect writes what the database reader returns", async () => {
    const root = tmpApp({ "genesis.config.json": JSON.stringify({ doctor: { packs: ["supabase"], contracts: {} } }) });
    const fix = builtinFixes({ env: { DATABASE_URL: "postgres://x" }, readContract: async (_url, schemas) => ({ content: `// Source: Postgres (${schemas.join(", ")})\nexport {};\n` }) }).find((f) => f.id === "contracts.introspect")!;
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.files).toEqual([expect.objectContaining({ path: "resources.genesis.ts", beforeHash: null })]);
    await applyPlan(fix, plan, { root, findings: [] });
    expect(existsSync(path.join(root, "resources.genesis.ts"))).toBe(true);
  });
});

describe("writes stay inside the app", () => {
  const outsideFix = (rel: string, beforeHash: string | null = null) =>
    defineFix({ id: "test.link", kind: "auto", rules: ["r"], title: "link", plan: () => ({ summary: "s", files: [{ path: rel, beforeHash, content: "pwned", why: "x" }] }) });

  it("refuses a write through a symlinked folder", async () => {
    const outside = tmpApp();
    const root = tmpApp();
    symlinkSync(outside, path.join(root, ".claude"));
    await expect(planFix(outsideFix(".claude/settings.json"), { root, findings: [] })).rejects.toThrow(/resolves outside the app/);
    expect(existsSync(path.join(outside, "settings.json"))).toBe(false);
  });

  it("refuses a dangling symlink as a new file (it would create its target outside)", async () => {
    const outside = tmpApp();
    const root = tmpApp();
    symlinkSync(path.join(outside, "made.txt"), path.join(root, "new.txt"));
    await expect(planFix(outsideFix("new.txt"), { root, findings: [] })).rejects.toThrow(/symbolic link/);
    expect(existsSync(path.join(outside, "made.txt"))).toBe(false);
  });

  it("re-checks just before writing: a folder swapped for a link after planning", async () => {
    const outside = tmpApp();
    const root = tmpApp({ "d/keep.txt": "k" });
    let snapshot: ReturnType<Fix["plan"]> | null = null;
    const fix = defineFix({ id: "test.swap", kind: "auto", rules: ["r"], title: "swap", plan: () => (snapshot ??= { summary: "s", files: [{ path: "d/new.txt", beforeHash: null, content: "x", why: "x" }] }) });
    const plan = await planFix(fix, { root, findings: [] });
    const { renameSync } = await import("node:fs");
    renameSync(path.join(root, "d"), path.join(root, "d-old"));
    symlinkSync(outside, path.join(root, "d"));
    await expect(applyPlan(fix, plan, { root, findings: [] })).rejects.toThrow(/outside the app/);
    expect(existsSync(path.join(outside, "new.txt"))).toBe(false);
  });
});

describe("rollback", () => {
  it("puts every file back when a later step fails, and says what it did", async () => {
    const root = tmpApp({ "a.txt": "a" });
    const fix = defineFix({
      id: "test.rollback",
      kind: "auto",
      rules: ["r"],
      title: "two writes then a failing command",
      plan: (ctx) => ({ summary: "s", files: [{ path: "a.txt", beforeHash: sha256(read(ctx.root, "a.txt")), content: "A", why: "x" }, { path: "new/dir/b.txt", beforeHash: null, content: "B", why: "x" }], commands: [{ tool: "genesis", args: ["boom"], why: "x" }] }),
      apply: () => {
        throw new Error("--pr needs a clean working tree");
      },
    });
    const plan = await planFix(fix, { root, findings: [] });
    const err = await applyPlan(fix, plan, { root, findings: [] }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(FixError);
    expect(err.message).toMatch(/--pr needs a clean working tree\. It wrote a\.txt, new\/dir\/b\.txt; may have partly run genesis boom .*; rolled back new\/dir\/b\.txt, a\.txt/);
    expect(read(root, "a.txt")).toBe("a");
    expect(existsSync(path.join(root, "new"))).toBe(false);
  });

  it("rolls back when a command fails, and when verify throws", async () => {
    const root = tmpApp({ "a.txt": "a" });
    const failing: ToolRunner = async () => ({ code: 2, stdout: "", stderr: "nope" });
    const fix = defineFix({ id: "test.cmd", kind: "auto", rules: ["r"], title: "t", plan: (ctx) => ({ summary: "s", files: [{ path: "a.txt", beforeHash: sha256(read(ctx.root, "a.txt")), content: "A", why: "x" }], commands: [{ tool: "git", args: ["status"], why: "x" }] }) });
    await expect(applyPlan(fix, await planFix(fix, { root, findings: [] }), { root, findings: [] }, { run: failing })).rejects.toThrow(/git status failed \(exit 2\): nope\. It wrote a\.txt; ran git status \(not undone\); rolled back a\.txt/);
    expect(read(root, "a.txt")).toBe("a");
    const throwing = defineFix({ ...upper, id: "test.verify", verify: () => {
      throw new Error("doctor crashed");
    } });
    const root2 = tmpApp({ "a.txt": "hello" });
    await expect(applyPlan(throwing, await planFix(throwing, { root: root2, findings: [] }), { root: root2, findings: [] })).rejects.toThrow(/doctor crashed/);
    expect(read(root2, "a.txt")).toBe("hello");
  });

  it("redacts secrets from apply's notes", async () => {
    const root = tmpApp();
    const fix = defineFix({ id: "test.notes", kind: "guided", rules: ["r"], title: "t", plan: () => ({ summary: "s", commands: [{ tool: "genesis", args: ["x"], stdinSecret: "KEY", why: "x" }] }), apply: () => ({ ran: ["genesis x"], notes: ["used s3cret-value"] }) });
    const result = await applyPlan(fix, await planFix(fix, { root, findings: [] }), { root, findings: [], secrets: { KEY: "s3cret-value" } });
    expect(result.notes).toEqual(["used [redacted]"]);
    expect(result.ran).toEqual(["genesis x"]);
  });
});

describe("genesis fix never crashes", () => {
  it("reports an apply failure as JSON with exit 1, and a dirty tree as a step for you", async () => {
    const root = tmpApp({ "package.json": "{}" });
    const out: string[] = [];
    const runUpgrade = async (o: Record<string, unknown>) => {
      if (o.pr) throw new Error("--pr needs a clean working tree (commit or stash your changes first).");
      return { version: "2.4.0", changes: [], codemods: [], breaks: [], summary: "" };
    };
    const doctor = async () => ({ findings: [{ ...finding("genesis-behind"), fix: { id: "upgrade.release", kind: "auto" as const, title: "t" } }] });
    const code = await runFixCommand({ root, target: "upgrade.release", yes: true, json: true, network: true }, { out: (l) => out.push(l), err: () => {}, doctor, deps: { runUpgrade: runUpgrade as never, run: cleanGit } });
    expect(code).toBe(1);
    const json = JSON.parse(out.join("\n")) as { fixes: Array<{ applied: boolean; error: string }> };
    expect(json.fixes[0]).toMatchObject({ applied: false, error: expect.stringContaining("--pr needs a clean working tree") });

    const dirty: ToolRunner = async () => ({ code: 0, stdout: " M src/a.ts\n", stderr: "" });
    const fix = builtinFixes({ runUpgrade: runUpgrade as never, run: dirty }).find((f) => f.id === "upgrade.release")!;
    const plan = await planFix(fix, { root, findings: [] });
    expect(plan.commands).toEqual([]);
    expect(plan.manual).toMatch(/Commit or stash your changes first \(src\/a\.ts\)/);
  });

  it("turns an unexpected error into exit 1 (JSON too)", async () => {
    const out: string[] = [];
    const code = await runFixCommand({ root: tmpApp(), json: true }, { out: (l) => out.push(l), err: () => {}, doctor: async () => {
      throw new Error("disk on fire");
    } });
    expect(code).toBe(1);
    expect(JSON.parse(out.join("\n"))).toEqual({ ok: false, error: "disk on fire" });
  });
});

describe("the runner", () => {
  it("resolves a tool from PATH outside the app and its node_modules/.bin, and refuses Windows clearly", () => {
    const app = tmpApp();
    const plant = (dir: string) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "git"), "#!/bin/sh\n", { mode: 0o755 });
      return dir;
    };
    const inApp = plant(path.join(app, "bin"));
    const bin = plant(path.join(app, "node_modules", ".bin"));
    const real = plant(path.join(tmpApp(), "tools"));
    expect(resolveTool("git", app, [".", inApp, bin, real].join(path.delimiter), "darwin")).toBe(path.join(real, "git"));
    expect(resolveTool("git", app, [inApp, bin].join(path.delimiter), "darwin")).toBe(null);
    expect(() => resolveTool("git", app, real, "win32")).toThrow(/isn't supported on Windows yet/);
  });

  it("puts -- before values", () => {
    expect(withValues(["secret", "set"], ["-rf"])).toEqual(["secret", "set", "--", "-rf"]);
  });
});
