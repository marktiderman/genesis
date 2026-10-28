// @feat:doctor-package-rules
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { checkContracts } from "../src/doctor/contracts.js";
import {
  agentGuideState,
  changedSince,
  clearPackageRulesCache,
  discoverPackages,
  formatReport,
  primitivesCatalog,
  renderSkill,
  ruleNamespace,
  runDoctor,
  SKILL_PATH,
  validateConfig,
  validateDeclaration,
  writeAgentGuide,
  type DoctorConfig,
  type DoctorContext,
  type Finding,
  type FindingInput,
} from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);
beforeEach(() => {
  clearPackageRulesCache();
  clearLocalPackagesCache();
});

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const brief = (findings: Finding[], prefix: string) =>
  findings.filter((f) => f.rule.startsWith(prefix)).map((f) => `${f.rule} ${f.level} ${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);

const LIST_RULE = {
  id: "lists-use-widget-view",
  need: "a list screen",
  level: "warn",
  files: ["src/**/*.tsx"],
  forbid: { jsx: ["DataTable", "DataGrid"], imports: ["legacy-grid", "@legacy/*"], pattern: "\\bfetchRows\\s*\\(" },
  unless: { renders: ["WidgetView"] },
  use: "<WidgetView>",
  import: "@marktiderman/genesis-widgets",
  docs: "https://example.com/widgets",
  why: "One description per list.",
};

/** A fake installed Genesis package declaring `doctor`. */
const widgets = (doctor: unknown, extra: Record<string, unknown> = {}) => ({
  "node_modules/@marktiderman/genesis-widgets/package.json": JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0", genesis: { doctor }, ...extra }),
});

const SCREEN = [
  'import { DataTable } from "@marktiderman/genesis-ui/data";',
  'import { grid } from "legacy-grid";',
  'import { x } from "@legacy/rows";',
  "// <DataGrid> in a comment never counts, nor fetchRows() here",
  "export function Screen() {",
  "  const rows = fetchRows();",
  "  return <DataTable rows={rows} />;",
  "}",
  "",
].join("\n");

describe("package declarations", () => {
  it("namespaces rule ids by package", () => {
    expect(ruleNamespace("@marktiderman/genesis-ui")).toBe("ui");
    expect(ruleNamespace("@marktiderman/genesis-forms-react")).toBe("forms-react");
    expect(ruleNamespace("@marktiderman/genesis")).toBe("genesis");
    expect(ruleNamespace("@acme/billing")).toBe("@acme/billing");
  });

  it("accepts a valid declaration and normalizes it", () => {
    const d = validateDeclaration({ prefer: [LIST_RULE], primitives: [{ need: "dates", use: "dayIn" }] }, "@marktiderman/genesis-widgets");
    expect(d.enforce).toBe(true);
    expect(d.prefer.map((r) => r.id)).toEqual(["lists-use-widget-view"]);
    expect(d.primitives).toHaveLength(1);
    expect(validateDeclaration({ enforce: false, reason: "Tooling only." }, "x").enforce).toBe(false);
  });

  it.each([
    [false, /say why/],
    [{ enforce: false }, /without a reason/],
    [{}, /declares no rules/],
    [{ prefer: [LIST_RULE], extra: 1 }, /unknown key "extra"/],
    [{ prefer: [{ ...LIST_RULE, why: "" }] }, /needs "why"/],
    [{ prefer: [{ ...LIST_RULE, id: "Bad Id" }] }, /lower-case words and dashes/],
    [{ prefer: [{ ...LIST_RULE, forbid: {} }] }, /needs jsx, imports or pattern/],
    [{ prefer: [{ ...LIST_RULE, forbid: { pattern: "(" } }] }, /not a valid regular expression/],
    [{ prefer: [{ ...LIST_RULE, forbid: { jsx: ["div"] } }] }, /component names/],
    [{ prefer: [{ ...LIST_RULE, level: "fatal" }] }, /level must be/],
    [{ prefer: [LIST_RULE, LIST_RULE] }, /twice/],
    [{ enforce: false, reason: "x", prefer: [LIST_RULE] }, /declares rules/],
    [{ prefer: [LIST_RULE], primitives: [{ need: "x" }] }, /needs "use"/],
  ])("refuses %j", (raw, error) => {
    expect(() => validateDeclaration(raw, "@marktiderman/genesis-widgets")).toThrow(error);
  });

  it("reads a declaration from a file the package points to, and only inside the package", () => {
    const root = makeApp(null, {
      "node_modules/@marktiderman/genesis-widgets/doctor.json": JSON.stringify({ prefer: [LIST_RULE] }),
      ...widgets("./doctor.json"),
    });
    const pkg = discoverPackages(root).find((p) => p.name === "@marktiderman/genesis-widgets")!;
    expect(pkg.declaration?.prefer[0]?.id).toBe("lists-use-widget-view");
    expect(() => validateDeclaration("../outside.json", "x", path.join(root, "node_modules"))).toThrow(/outside the package/);
  });

  it("finds Genesis packages installed beside the app's own in an isolated (pnpm) store", () => {
    const root = makeApp(null, {
      "node_modules/.pnpm/umbrella/node_modules/@marktiderman/genesis/package.json": JSON.stringify({ name: "@marktiderman/genesis", version: "1.0.0" }),
      "node_modules/.pnpm/umbrella/node_modules/@marktiderman/genesis-widgets/package.json": JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0", genesis: { doctor: { prefer: [LIST_RULE] } } }),
    });
    symlinkSync(path.join(root, "node_modules/.pnpm/umbrella/node_modules/@marktiderman/genesis"), path.join(root, "node_modules/@marktiderman/genesis"));
    expect(discoverPackages(root).find((p) => p.name === "@marktiderman/genesis-widgets")?.declaration?.prefer).toHaveLength(1);
  });

  it("every published package in this repository declares what it enforces, and each declaration is valid", () => {
    const missing: string[] = [];
    for (const dir of readdirSync(path.join(REPO, "packages"))) {
      const file = path.join(REPO, "packages", dir, "package.json");
      if (!existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, "utf8")) as { name: string; private?: boolean; genesis?: { doctor?: unknown } };
      if (json.private) continue;
      if (json.genesis?.doctor === undefined) missing.push(json.name);
      else validateDeclaration(json.genesis.doctor, json.name, path.dirname(file));
    }
    expect(missing).toEqual([]);
  });
});

describe("package rules in the doctor", () => {
  it("discovers an installed package's rules and runs them: JSX, imports and patterns, comments ignored", async () => {
    const root = makeApp(null, { ...widgets({ prefer: [LIST_RULE] }), "src/Screen.tsx": SCREEN });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/Screen.tsx:2 legacy-grid",
      "widgets/lists-use-widget-view warn src/Screen.tsx:3 @legacy/rows",
      "widgets/lists-use-widget-view warn src/Screen.tsx:6 fetchRows(",
      "widgets/lists-use-widget-view warn src/Screen.tsx:7 DataTable",
    ]);
    const message = result.findings.find((f) => f.subject === "DataTable")!.message;
    expect(message).toContain("use <WidgetView> (@marktiderman/genesis-widgets)");
    expect(message).toContain("https://example.com/widgets");
    expect(result.primitives).toEqual({ rules: 1, packages: 1 });
    expect(formatReport(result)).toContain("Primitives: 1 rules from 1 packages; see genesis primitives");
  });

  it("leaves a file that renders the primitive alone, and files outside the rule's globs", async () => {
    const root = makeApp(null, {
      ...widgets({ prefer: [LIST_RULE] }),
      "src/Wrapper.tsx": 'export const W = () => <WidgetView><DataTable /></WidgetView>;\n',
      "src/data.ts": "export const r = fetchRows();\n",
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "widgets/")).toEqual([]);
  });

  it("honours platform and the {routes} placeholder", async () => {
    const rule = { ...LIST_RULE, platform: "web", files: ["{routes}/**/*$*.tsx"] };
    const files = { ...widgets({ prefer: [rule] }), "src/routes/items.$id.tsx": "export const P = () => <DataTable />;\n", "src/routes/items.tsx": "export const L = () => <DataTable />;\n" };
    expect(brief((await runDoctor({ root: makeApp(null, files), config: {} })).findings, "widgets/")).toEqual(["widgets/lists-use-widget-view warn src/routes/items.$id.tsx:1 DataTable"]);
    expect(brief((await runDoctor({ root: makeApp(null, files), config: { packs: ["native"], src: ["src"] } })).findings, "widgets/")).toEqual([]);
  });

  it("works with rules levels, packageRules and allow like a built-in, and is never changed silently", async () => {
    const files = { ...widgets({ prefer: [LIST_RULE] }), "src/Screen.tsx": SCREEN };
    const off = await runDoctor({ root: makeApp(null, files), config: { rules: { "widgets/lists-use-widget-view": "off" } } });
    expect(brief(off.findings, "widgets/")).toEqual([]);
    expect(brief(off.findings, "package-rule-override")).toEqual(["package-rule-override warn genesis config:0 widgets/lists-use-widget-view"]);

    const reasoned: DoctorConfig = { packageRules: { "widgets/lists-use-widget-view": { level: "error", exclude: ["src/Screen.tsx"], reason: "Legacy screens move in the next phase." } } };
    const r = await runDoctor({ root: makeApp(null, { ...files, "src/Other.tsx": "export const O = () => <DataGrid />;\n" }), config: reasoned });
    expect(brief(r.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view error src/Other.tsx:1 DataGrid"]);
    expect(brief(r.findings, "package-rule-override")).toEqual([]);

    const allowed = await runDoctor({
      root: makeApp(null, files),
      config: {
        allow: [
          { rule: "widgets/lists-use-widget-view", file: "src/Screen.tsx", reason: "Moves next phase." },
          { rule: "widgets/lists-use-widget-view", file: "src/Gone.tsx", reason: "Was moved." },
        ],
      },
    });
    expect(brief(allowed.findings, "widgets/")).toEqual([]);
    expect(brief(allowed.findings, "stale-exception")).toEqual(["stale-exception warn src/Gone.tsx:0 widgets/lists-use-widget-view"]);
  });

  it("requires a reason in packageRules", () => {
    expect(() => validateConfig({ packageRules: { "ui/lists-use-resource-view": { level: "off" } } })).toThrow(/needs a "reason"/);
    expect(() => validateConfig({ packageRules: { "lists-use-resource-view": { reason: "x" } } })).toThrow(/namespaced/);
    expect(() => validateConfig({ packageRules: { "ui/x": { level: "off", reason: "x", extra: 1 } } })).toThrow(/unknown key/);
  });

  it("reports an invalid declaration without stopping the run", async () => {
    const root = makeApp("raw-tag", widgets({ prefer: [{ id: "x" }] }));
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "package-rules-invalid")).toEqual(["package-rules-invalid error @marktiderman/genesis-widgets/package.json:0 @marktiderman/genesis-widgets"]);
    expect(result.findings.some((f) => f.rule === "raw-tag")).toBe(true);
  });

  it("loads a package's plugin module and namespaces its findings", async () => {
    const root = makeApp(null, {
      ...widgets({ plugin: "./doctor-plugin.mjs" }),
      "node_modules/@marktiderman/genesis-widgets/doctor-plugin.mjs":
        'export default { name: "count", check(ctx) { for (const f of ctx.files) ctx.report({ rule: "seen", level: "info", file: f.path, message: "seen" }); } };\n',
      "src/a.ts": "export const a = 1;\n",
    });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "widgets/")).toEqual(["widgets/seen info src/a.ts:0"]);
  });

  it("reads local packages' rules, never on the package's own files", async () => {
    const pkg = { name: "@acme/kit", version: "0.1.0", private: true, genesis: { doctor: { prefer: [{ ...LIST_RULE, files: ["**/*.tsx"] }] } } };
    const root = makeApp(null, {
      "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }),
      "packages/kit/package.json": JSON.stringify(pkg),
      "packages/kit/src/Grid.tsx": "export const G = () => <DataTable />;\n",
      "src/Screen.tsx": "export const S = () => <DataTable />;\n",
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "@acme/kit/")).toEqual(["@acme/kit/lists-use-widget-view warn src/Screen.tsx:1 DataTable"]);
  });
});

describe("the real package declarations", () => {
  const install = (folder: string, name: string) => {
    const real = JSON.parse(readFileSync(path.join(REPO, "packages", folder, "package.json"), "utf8")) as { genesis: { doctor: unknown } };
    return { [`node_modules/@marktiderman/${name}/package.json`]: JSON.stringify({ name: `@marktiderman/${name}`, version: "9.9.9", genesis: { doctor: real.genesis.doctor } }) };
  };

  it("ui flags hand-rolled lists unless the file renders ResourceView; core flags direct data access in screens only", async () => {
    const root = makeApp(null, {
      ...install("ui", "genesis-ui-rules"),
      ...install("core", "genesis-core-rules"),
      "src/routes/goals.tsx": 'import { DataTable } from "@marktiderman/genesis-ui/data";\nexport const G = () => { const q = supabase.from("goals").select(); return <DataTable />; };\n',
      "src/routes/tasks.tsx": "export const T = () => <ResourceView view={tasks} />;\n",
      "src/components/RecordTable.tsx": "export function RecordTable<T>() { const [x] = useState<ResourcePage>(); return <ResourcePage<T> rows={[]} />; }\n",
      "src/routes/people.tsx": 'import { RecordTable } from "@/components/RecordTable";\nexport const P = () => <RecordTable rows={[]} />;\n',
      "src/components/TasksTable.tsx": "export const T = () => <ResourceView view={v} slots={{ table: () => <DataTable /> }} />;\n",
      "src/components/Rpc.tsx": 'export const R = () => { void db.schema("app").from("x"); void client.rpc("y"); return Array.from([1]).length; };\n',
      "src/lib/goals.ts": 'export const goals = () => supabase.from("goals").select();\n',
      "src/routes/api.server.tsx": 'export const s = () => supabase.from("goals");\n',
    });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "ui-rules/").concat(brief(result.findings, "core-rules/"))).toEqual([
      "ui-rules/lists-use-resource-view warn src/components/RecordTable.tsx:1 ResourcePage",
      "ui-rules/lists-use-resource-view warn src/routes/goals.tsx:2 DataTable",
      "ui-rules/lists-use-resource-view warn src/routes/people.tsx:2 RecordTable",
      "core-rules/direct-data-access warn src/components/Rpc.tsx:1 .schema(\"app\").from(",
      "core-rules/direct-data-access warn src/components/Rpc.tsx:1 client.rpc(",
      "core-rules/direct-data-access warn src/routes/goals.tsx:2 supabase.from(",
    ]);
  });
});

describe("package-doctor-declaration (packages pack)", () => {
  const app = (pkg: Record<string, unknown>) =>
    makeApp(null, {
      "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }),
      "packages/kit/package.json": JSON.stringify({ version: "0.1.0", ...pkg }),
    });
  const run = async (pkg: Record<string, unknown>) =>
    brief((await runDoctor({ root: app(pkg), config: { packs: ["packages"] } })).findings, "package-doctor-declaration");

  it("fails a published Genesis package that declares nothing, or declares badly", async () => {
    expect(await run({ name: "@marktiderman/genesis-kit" })).toEqual(["package-doctor-declaration error packages/kit/package.json:0 @marktiderman/genesis-kit"]);
    expect(await run({ name: "@marktiderman/genesis-kit", genesis: { doctor: { enforce: false } } })).toHaveLength(1);
  });

  it("accepts a declaration, or no enforcement with a reason; private and non-Genesis packages are exempt", async () => {
    expect(await run({ name: "@marktiderman/genesis-kit", genesis: { doctor: { prefer: [LIST_RULE] } } })).toEqual([]);
    expect(await run({ name: "@marktiderman/genesis-kit", genesis: { doctor: { enforce: false, reason: "Tooling only." } } })).toEqual([]);
    expect(await run({ name: "@marktiderman/genesis-kit", private: true })).toEqual([]);
    expect(await run({ name: "@acme/kit" })).toEqual([]);
  });
});

describe("ratchet", () => {
  const files = { ...widgets({ prefer: [{ ...LIST_RULE, newOnly: true }] }), "src/Old.tsx": "export const O = () => <DataTable />;\n", "src/New.tsx": "export const N = () => <DataGrid />;\n" };

  it("drops newOnly findings in unchanged files to info under --base, and leaves them alone without it", async () => {
    const root = makeApp(null, files);
    const ratcheted = await runDoctor({ root, config: {}, base: "origin/main", changedFiles: ["src/New.tsx"] });
    expect(brief(ratcheted.findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/New.tsx:1 DataGrid",
      "widgets/lists-use-widget-view info src/Old.tsx:1 DataTable",
    ]);
    expect(ratcheted.findings.find((f) => f.file === "src/Old.tsx")!.message).toContain("ratcheted: unchanged since origin/main");
    expect(brief((await runDoctor({ root, config: {} })).findings, "widgets/").every((f) => f.includes(" warn "))).toBe(true);
  });

  it("ratchets any rule with doctor.ratchet, app patterns declared newOnly, and keeps allow entries working", async () => {
    const root = makeApp("raw-tag", { "src/b.ts": "export const b = 1; // TODO\n" });
    const config: DoctorConfig = { ratchet: ["raw-tag"], patterns: [{ id: "no-todo", files: ["src/**"], forbid: "TODO", newOnly: true, level: "warn" }] };
    const result = await runDoctor({ root, config, base: "main", changedFiles: [] });
    const levels = new Set(result.findings.filter((f) => f.rule === "raw-tag" || f.rule === "no-todo").map((f) => f.level));
    expect([...levels]).toEqual(["info"]);
    const changed = await runDoctor({ root, config, base: "main", changedFiles: ["src/form.tsx", "src/b.ts"] });
    expect(changed.findings.filter((f) => f.rule === "raw-tag" || f.rule === "no-todo").every((f) => f.level !== "info")).toBe(true);
  });

  it("reads changed files from git: committed since the merge base, edited and untracked", () => {
    const root = makeApp(null, { "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 1;\n" });
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "src/a.ts"), "export const a = 2;\n");
    writeFileSync(path.join(root, "src/c.ts"), "export const c = 1;\n");
    expect([...(changedSince(root, "main") ?? [])].sort()).toEqual(["src/a.ts", "src/c.ts"]);
    expect(changedSince(root, "no-such-ref")).toBeNull();
  });

  it("warns that it ran at full levels when git can't compare", async () => {
    const root = makeApp(null, files);
    const result = await runDoctor({ root, config: {}, base: "no-such-ref" });
    expect(brief(result.findings, "ratchet-skipped")).toEqual(["ratchet-skipped warn genesis config:0"]);
  });
});

describe("primitives catalog and agent guide", () => {
  it("builds the catalog from the static core and every package's declarations", () => {
    const root = makeApp(null, widgets({ prefer: [LIST_RULE], primitives: [{ need: "dates", use: "dayIn(zone)", import: "@marktiderman/genesis-widgets/dates" }] }));
    const rows = primitivesCatalog(discoverPackages(root));
    expect(rows.some((r) => r.from === "genesis-cli" && r.rule === "page-layout")).toBe(true);
    expect(rows.filter((r) => r.from === "@marktiderman/genesis-widgets")).toEqual([
      { need: "a list screen", use: "<WidgetView>", import: "@marktiderman/genesis-widgets", docs: "https://example.com/widgets", rule: "widgets/lists-use-widget-view", from: "@marktiderman/genesis-widgets" },
      { need: "dates", use: "dayIn(zone)", import: "@marktiderman/genesis-widgets/dates", from: "@marktiderman/genesis-widgets" },
    ]);
    const skill = renderSkill(rows);
    expect(skill).toMatch(/^---\nname: genesis\n/);
    expect(skill).toContain("`widgets/lists-use-widget-view`");
    expect(skill).toContain("Never copy an older screen");
  });

  it("writes the skill and the AGENTS.md block, keeps the rest of AGENTS.md, and reports when they go stale", async () => {
    const root = makeApp(null, { ...widgets({ prefer: [LIST_RULE] }), "AGENTS.md": "# Notes\n\nOur own rules.\n" });
    expect(writeAgentGuide(root, discoverPackages(root))).toEqual([SKILL_PATH, "AGENTS.md"]);
    expect(writeAgentGuide(root, discoverPackages(root))).toEqual([]);
    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("Our own rules.");
    expect(agents).toContain("<!-- genesis-primitives:start -->");
    expect(agents).toContain("| a list screen | <WidgetView> | `@marktiderman/genesis-widgets` |");
    expect(agentGuideState(root, discoverPackages(root))).toEqual({ skill: "ok", agents: "ok" });
    expect(brief((await runDoctor({ root, config: {} })).findings, "agent-guide-stale")).toEqual([]);

    // The package changes what it enforces: the guide no longer matches.
    mkdirSync(path.join(root, "node_modules/@marktiderman/genesis-widgets"), { recursive: true });
    writeFileSync(path.join(root, "node_modules/@marktiderman/genesis-widgets/package.json"), JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.1.0", genesis: { doctor: { prefer: [{ ...LIST_RULE, use: "<WidgetList>" }] } } }));
    clearPackageRulesCache();
    expect(brief((await runDoctor({ root, config: {} })).findings, "agent-guide-stale")).toEqual([
      `agent-guide-stale warn ${SKILL_PATH}:0`,
      "agent-guide-stale warn AGENTS.md:0",
    ]);
  });

  it("stays quiet for an app that hasn't adopted the guide", async () => {
    expect(brief((await runDoctor({ root: makeApp("clean"), config: {} })).findings, "agent-guide-stale")).toEqual([]);
  });
});

describe("contracts-stale", () => {
  const ctx = (root: string, config: DoctorConfig) => {
    const found: FindingInput[] = [];
    const c = { root, files: [], config, packages: [], report: (f: FindingInput) => found.push(f) } as unknown as DoctorContext;
    return { c, found };
  };
  const config: DoctorConfig = { packs: ["supabase"], contracts: { out: "src/lib/resources.genesis.ts", databaseEnv: "GENESIS_TEST_DB_URL" } };

  it("is validated and needs the supabase pack", () => {
    expect(validateConfig(config).contracts).toEqual(config.contracts);
    expect(() => validateConfig({ contracts: {} })).toThrow(/supabase pack/);
    expect(() => validateConfig({ packs: ["supabase"], contracts: { out: "../x.ts" } })).toThrow(/inside the app/);
    expect(() => validateConfig({ packs: ["supabase"], contracts: { databaseEnv: "not a name" } })).toThrow(/environment variable/);
  });

  it("skips with info without the database, and compares what introspect would write with the file", async () => {
    const root = makeApp(null, { "src/lib/resources.genesis.ts": "// contract v1\n" });
    delete process.env.GENESIS_TEST_DB_URL;
    const skipped = ctx(root, config);
    await checkContracts(skipped.c, async () => ({ content: "// contract v1\n" }));
    expect(skipped.found.map((f) => `${f.rule} ${f.level}`)).toEqual(["contracts-stale info"]);

    process.env.GENESIS_TEST_DB_URL = "postgres://example.invalid/db";
    try {
      const same = ctx(root, config);
      await checkContracts(same.c, async () => ({ content: "// contract v1\n" }));
      expect(same.found).toEqual([]);
      const stale = ctx(root, config);
      await checkContracts(stale.c, async (_url, schemas) => ({ content: `// contract v2 ${schemas.join(",")}\n` }));
      expect(stale.found.map((f) => `${f.rule} ${f.level ?? "error"} ${f.file}`)).toEqual(["contracts-stale error src/lib/resources.genesis.ts"]);
      const broken = ctx(root, config);
      await checkContracts(broken.c, async () => {
        throw new Error("connection refused");
      });
      expect(broken.found.map((f) => `${f.rule} ${f.level}`)).toEqual(["contracts-stale warn"]);
    } finally {
      delete process.env.GENESIS_TEST_DB_URL;
    }
  });
});
