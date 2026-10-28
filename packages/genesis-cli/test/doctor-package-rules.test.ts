// @feat:doctor-package-rules
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { checkContracts } from "../src/doctor/contracts.js";
import { applyRatchet } from "../src/doctor/ratchet.js";
import { compilePatternRules, parseRulesMarkdown } from "../src/doctor/patterns.js";
import {
  agentGuideState,
  catalogTable,
  changedSince,
  loadConfig,
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

/** git in a test repo, with no hooks (a global hook would write into the temp folder) and no commit signing (a global key would prompt). */
const gitIn =
  (root: string) =>
  (...args: string[]) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });

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

  it("reads a package.json doctor block with an app setting as the app's, so a typo like plugin fails", () => {
    const root = makeApp(null, { "package.json": JSON.stringify({ name: "app", genesis: { doctor: { rules: { "raw-tag": "warn" }, plugin: ["./rules.mjs"] } } }) });
    expect(() => loadConfig(root)).toThrow(/unknown setting "plugin"/);
    const pkg = makeApp(null, { "package.json": JSON.stringify({ name: "@acme/kit", genesis: { doctor: { enforce: false, reason: "Nothing to enforce." } } }) });
    expect(loadConfig(pkg).config).toEqual({});
  });

  it("refuses a packs value that isn't a list with a config error, contracts or not", () => {
    expect(() => validateConfig({ packs: 5, contracts: {} })).toThrow(/"packs" must be a list/);
    expect(() => validateConfig({ packs: { supabase: true }, contracts: {} })).toThrow(/"packs" must be a list/);
  });

  it("refuses a rules-doc newOnly that isn't true or false", () => {
    const doc = (v: string) => parseRulesMarkdown(`### no-todo\n- level: warn\n- files: src/**\n- forbid: TODO\n- newOnly: ${v}\n`);
    expect(() => compilePatternRules(doc("tru"), "DESIGN_RULES.md")).toThrow(/newOnly "tru"/);
    expect(compilePatternRules(doc("false"), "DESIGN_RULES.md")).toHaveLength(1);
  });

  it("requires a reason in packageRules", () => {
    expect(() => validateConfig({ packageRules: { "ui/lists-use-resource-view": { level: "off" } } })).toThrow(/needs a "reason"/);
    expect(() => validateConfig({ packageRules: { "lists-use-resource-view": { reason: "x" } } })).toThrow(/namespaced/);
    expect(() => validateConfig({ packageRules: { "ui/x": { level: "off", reason: "x", extra: 1 } } })).toThrow(/unknown key/);
  });

  it("reports an invalid declaration without stopping the run", async () => {
    const root = makeApp("raw-tag", widgets({ prefer: [{ id: "x" }] }));
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "package-rules-invalid")).toEqual(["package-rules-invalid warn @marktiderman/genesis-widgets/package.json:0 @marktiderman/genesis-widgets"]);
    expect(result.findings.some((f) => f.rule === "raw-tag")).toBe(true);
  });

  it("reads a newer package's declaration forward-compatibly: unknown keys and rules it can't read are skipped with a warning", async () => {
    const declaration = {
      future: true,
      prefer: [
        { ...LIST_RULE, forbid: { ...LIST_RULE.forbid, calls: ["fetchRows"] } },
        { ...LIST_RULE, id: "no-calls", forbid: { calls: ["fetchRows"] } },
      ],
    };
    const root = makeApp(null, { ...widgets(declaration), "src/Screen.tsx": SCREEN });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "widgets/")).toHaveLength(4);
    const notes = result.findings.filter((f) => f.rule === "package-rules-invalid");
    expect(notes.map((f) => f.level)).toEqual(["warn", "warn", "warn", "warn"]);
    expect(notes.map((f) => f.message).join("\n")).toMatch(/unknown key "future"[\s\S]*unknown key "calls"[\s\S]*unknown key "calls"[\s\S]*no-calls\)\.forbid needs jsx, imports or pattern; that entry is skipped/);
    expect(result.ok).toBe(true);
    // Authoring (the packages pack, validateDeclaration without a collector) stays strict.
    expect(() => validateDeclaration(declaration, "@marktiderman/genesis-widgets")).toThrow(/unknown key "future"/);
  });

  it("skips a newer rule whole when an unknown key could narrow it (rule level or unless), instead of running it wider", async () => {
    const declaration = {
      prefer: [
        { ...LIST_RULE, id: "only-in", onlyIn: "server" },
        { ...LIST_RULE, id: "unless-more", unless: { renders: ["WidgetView"], importsFrom: ["./server"] } },
      ],
    };
    const root = makeApp(null, { ...widgets(declaration), "src/Screen.tsx": SCREEN });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "widgets/")).toEqual([]);
    const notes = result.findings.filter((f) => f.rule === "package-rules-invalid").map((f) => f.message);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/prefer\[0\] has an unknown key "onlyIn".*that entry is skipped/);
    expect(notes[1]).toMatch(/unless-more\)\.unless has an unknown key "importsFrom".*that entry is skipped/);
  });

  it("lists packages in code-point order, the same on every machine", () => {
    const root = makeApp(null, {
      "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }),
      "packages/a/package.json": JSON.stringify({ name: "@acme/aa", version: "0.1.0", private: true }),
      "packages/b/package.json": JSON.stringify({ name: "@acme/Kit", version: "0.1.0", private: true }),
    });
    expect(discoverPackages(root).map((p) => p.name).filter((n) => n.startsWith("@acme/"))).toEqual(["@acme/Kit", "@acme/aa"]);
  });

  it("flags a wrapper only where its own body renders the element, and its use only where it is imported from that file", async () => {
    const root = makeApp(null, {
      ...widgets({ prefer: [LIST_RULE] }),
      "src/components/Tables.tsx": [
        "export function RecordTable() {",
        "  return <DataTable rows={[]} />;",
        "}",
        "export const Empty = () => <p>Nothing yet</p>;",
        "",
      ].join("\n"),
      "src/routes/people.tsx": 'import { RecordTable as Table, Empty } from "../components/Tables";\nexport const P = () => <><Table /><Empty /></>;\n',
      "src/routes/teams.tsx": 'import { RecordTable } from "@/components/Tables";\nexport const T = () => <RecordTable />;\n',
      "src/routes/own.tsx": "const RecordTable = () => null;\nexport const O = () => <RecordTable />;\n",
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/components/Tables.tsx:2 DataTable",
      "widgets/lists-use-widget-view warn src/routes/people.tsx:2 Table",
      "widgets/lists-use-widget-view warn src/routes/teams.tsx:2 RecordTable",
    ]);
  });

  it("counts a component declared first and default-exported by name as a wrapper", async () => {
    const root = makeApp(null, {
      ...widgets({ prefer: [LIST_RULE] }),
      "src/components/RecordTable.tsx": "function RecordTable() {\n  return <DataTable rows={[]} />;\n}\nexport default RecordTable;\n",
      "src/routes/people.tsx": 'import Table from "../components/RecordTable";\nexport const P = () => <Table />;\n',
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/components/RecordTable.tsx:2 DataTable",
      "widgets/lists-use-widget-view warn src/routes/people.tsx:2 Table",
    ]);
  });

  it("warns about a packageRules entry that names no rule, but not one in a plugin package's namespace", async () => {
    const root = makeApp(null, { ...widgets({ prefer: [LIST_RULE] }), "src/Screen.tsx": SCREEN });
    const config: DoctorConfig = {
      packageRules: {
        "widgets/lists-use-widget-veiw": { level: "off", reason: "Typo." },
        "widgets/lists-use-widget-view": { level: "error", reason: "Real." },
      },
    };
    const result = await runDoctor({ root, config });
    expect(brief(result.findings, "stale-exception")).toEqual(["stale-exception warn genesis config:0 widgets/lists-use-widget-veiw"]);
    expect(result.findings.find((f) => f.rule === "stale-exception")!.message).toContain("no installed package declares");

    const plugin = makeApp(null, {
      ...widgets({ plugin: "./doctor-plugin.mjs" }),
      "node_modules/@marktiderman/genesis-widgets/doctor-plugin.mjs": "export default { name: 'quiet', check() {} };\n",
    });
    expect(brief((await runDoctor({ root: plugin, config: { packageRules: { "widgets/from-plugin": { level: "off", reason: "x" } } } })).findings, "stale-exception")).toEqual([]);
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

  it("ui checks record pages named [id] and .jsx routes too, and a list inside a record page doesn't exempt it", async () => {
    const root = makeApp(null, {
      ...install("ui", "genesis-ui-rules"),
      "src/routes/records/[id].tsx": "export const R = () => <><DetailPage title=\"x\" /><ResourceView view={v} /></>;\n",
      "src/routes/items.$id.jsx": "export const I = () => <DetailPage title=\"x\" />;\n",
      "src/routes/builder.$id.tsx": "export const B = () => <BuilderLayout><DetailPage title=\"x\" /></BuilderLayout>;\n",
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/record-pages")).toEqual([
      "ui-rules/record-pages-use-resource-workspace warn src/routes/items.$id.jsx:1 DetailPage",
      "ui-rules/record-pages-use-resource-workspace warn src/routes/records/[id].tsx:1 DetailPage",
    ]);
  });

  it("forms and studio-server flag their server modules in screens as warnings, never in a route module's loader, action or server function", async () => {
    const root = makeApp(null, {
      ...install("forms", "genesis-forms-rules"),
      ...install("studio-server", "genesis-studio-server-rules"),
      "src/routes/survey.tsx": 'import { validateSubmission } from "@marktiderman/genesis-forms/server";\nexport async function action() { return validateSubmission(); }\nexport default function S() { return null; }\n',
      "src/routes/studio.tsx": 'import { createStudioHandler } from "@marktiderman/genesis-studio-server";\nexport const handle = createServerFn().handler(() => createStudioHandler());\n',
      "src/components/Preview.tsx": 'import { validateSubmission } from "@marktiderman/genesis-forms/server";\nexport const P = () => { validateSubmission(); return null; };\n',
      "src/components/Admin.tsx": 'import { createStudioHandler } from "@marktiderman/genesis-studio-server";\nexport const A = () => null;\n',
      "src/routes/listed.tsx": 'import { validateSubmission } from "@marktiderman/genesis-forms/server";\nconst loader = () => validateSubmission();\nexport { loader };\n',
      "src/routes/directive.tsx": '// Server actions\n"use server";\nimport { validateSubmission } from "@marktiderman/genesis-forms/server";\nexport async function save() { return validateSubmission(); }\n',
      "src/routes/client.tsx": 'import { validateSubmission } from "@marktiderman/genesis-forms/server";\nexport async function clientLoader() { return validateSubmission(); }\nexport const C = ({ loaderData }) => null;\n',
      "src/routes/named.tsx": 'import { createStudioHandler } from "@marktiderman/genesis-studio-server";\n// createServerFn is mentioned, not called\nconst createServerFnLike = 1;\nexport const N = () => createServerFnLike;\n',
    });
    const result = await runDoctor({ root, config: {} });
    expect(brief(result.findings, "forms-rules/").concat(brief(result.findings, "studio-server-rules/"))).toEqual([
      "forms-rules/server-check-on-server warn src/components/Preview.tsx:1 @marktiderman/genesis-forms/server",
      "forms-rules/server-check-on-server warn src/routes/client.tsx:1 @marktiderman/genesis-forms/server",
      "studio-server-rules/handler-on-server warn src/components/Admin.tsx:1 @marktiderman/genesis-studio-server",
      "studio-server-rules/handler-on-server warn src/routes/named.tsx:1 @marktiderman/genesis-studio-server",
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
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "src/a.ts"), "export const a = 2;\n");
    writeFileSync(path.join(root, "src/c.ts"), "export const c = 1;\n");
    expect([...(changedSince(root, "main") ?? [])].sort()).toEqual(["src/a.ts", "src/c.ts"]);
    expect(changedSince(root, "no-such-ref")).toBeNull();
  });

  it("warns that it ran at full levels when git can't compare, and fails when the config went uncompared", async () => {
    const root = makeApp(null, files);
    const result = await runDoctor({ root, config: {}, base: "no-such-ref" });
    expect(brief(result.findings, "ratchet-skipped")).toEqual(["ratchet-skipped warn genesis config:0"]);
    const guarded = makeApp(null, { ...files, "genesis.config.json": JSON.stringify({ doctor: { rules: { "raw-tag": "error" } } }) });
    const failed = await runDoctor({ root: guarded, base: "no-such-ref" });
    expect(brief(failed.findings, "ratchet-skipped")).toEqual(["ratchet-skipped error genesis config:0"]);
    expect(failed.findings.find((f) => f.rule === "ratchet-skipped")!.message).toContain("fetch-depth: 0");
    expect(failed.ok).toBe(false);
  });

  it("says nothing about the config when git can't compare and it holds nothing to compare", async () => {
    const root = makeApp(null, { "genesis.config.json": JSON.stringify({ doctor: { packs: [] } }) });
    expect(brief((await runDoctor({ root, base: "no-such-ref" })).findings, "ratchet-skipped")).toEqual([]);
  });

  it("never lets allow or rules switch off the rules that guard them", async () => {
    expect(() => validateConfig({ allow: [{ rule: "allow-grew", reason: "x" }] })).toThrow(/can't allow allow-grew/);
    expect(() => validateConfig({ rules: { "ratchet-skipped": "off" } })).toThrow(/can't set ratchet-skipped/);
    expect(() => validateConfig({ rules: { "rules-weakened": "warn" } })).toThrow(/can't set rules-weakened/);
    // A config passed in directly (not validated) is ignored for them too.
    const root = makeApp(null, files);
    const config: DoctorConfig = { rules: { "ratchet-skipped": "off" }, allow: [{ rule: "ratchet-skipped", reason: "x" }] };
    expect(brief((await runDoctor({ root, config, base: "no-such-ref" })).findings, "ratchet-skipped")).toEqual(["ratchet-skipped warn genesis config:0"]);
  });

  it("never ratchets the rules about the config, packages and generated files, even with ratchet: true", () => {
    const at = (rule: string, file: string): Finding => ({ rule, level: "error", file, line: 0, message: "m" });
    const findings = [
      at("allow-grew", "src/a.tsx"),
      at("rules-weakened", "src/a.tsx"),
      at("stale-exception", "src/a.tsx"),
      at("agent-guide-stale", "AGENTS.md"),
      at("package-doctor-declaration", "packages/x/package.json"),
      at("contracts-stale", "src/lib/resources.genesis.ts"),
      at("raw-tag", "src/a.tsx"),
    ];
    const out = applyRatchet(findings, { config: { ratchet: true }, newOnly: new Set(), changed: new Set(), base: "main", isAppPath: () => true });
    expect(out.map((f) => `${f.rule} ${f.level}`)).toEqual([
      "allow-grew error",
      "rules-weakened error",
      "stale-exception error",
      "agent-guide-stale error",
      "package-doctor-declaration error",
      "contracts-stale error",
      "raw-tag info",
    ]);
  });

  it("keeps allow-grew an error under ratchet: true when the allowed file didn't change", async () => {
    const config = (allow: unknown[]) => JSON.stringify({ doctor: { ratchet: true, allow } });
    const root = makeApp(null, { "genesis.config.json": config([]), "src/a.tsx": "export const A = () => <button>x</button>;\n" });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "genesis.config.json"), config([{ rule: "raw-tag", file: "src/a.tsx", reason: "Hide it." }]));
    git("commit", "-q", "-am", "grow");
    const result = await runDoctor({ root, base: "main" });
    expect(brief(result.findings, "allow-grew")).toEqual(["allow-grew error src/a.tsx:0 raw-tag"]);
    expect(result.ok).toBe(false);
  });

  /** A git repo at `files` on main, then `head` committed on a work branch; the doctor run with --base main. */
  const branch = async (files: Record<string, string>, head: Record<string, string | null>, fixture: string | null = null) => {
    const root = makeApp(fixture, files);
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    for (const [file, content] of Object.entries(head)) {
      if (content === null) git("rm", "-q", file);
      else {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), content);
      }
    }
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", "head");
    clearPackageRulesCache();
    return runDoctor({ root, base: "main" });
  };
  const guards = (r: { findings: Finding[] }) => [...brief(r.findings, "rules-weakened"), ...brief(r.findings, "allow-grew"), ...brief(r.findings, "ratchet-skipped")];
  const doctorConfig = (doctor: Record<string, unknown>) => JSON.stringify({ doctor });

  it("doesn't compare a config the base didn't have: adopting the doctor, or adding the doctor block", async () => {
    const adopted = doctorConfig({
      rules: { "raw-tag": "off" },
      packageRules: { "widgets/lists-use-widget-view": { exclude: ["src/Screen.tsx"], reason: "Legacy." } },
      allow: [{ rule: "raw-tag", file: "src/form.tsx", reason: "Legacy." }],
    });
    expect(guards(await branch({ ...widgets({ prefer: [LIST_RULE] }), "src/Screen.tsx": SCREEN }, { "genesis.config.json": adopted }, "raw-tag"))).toEqual([]);
    const noBlock = await branch({ "genesis.config.json": JSON.stringify({ features: {} }) }, { "genesis.config.json": JSON.stringify({ features: {}, doctor: { rules: { "raw-tag": "off" } } }) }, "raw-tag");
    expect(guards(noBlock)).toEqual([]);
  });

  it("compares a config moved between package.json and genesis.config.json with where it was", async () => {
    const pkg = (doctor?: Record<string, unknown>) => JSON.stringify({ name: "app", version: "1.0.0", ...(doctor ? { genesis: { doctor } } : {}) });
    const same = { rules: { "raw-tag": "warn" } };
    expect(guards(await branch({ "package.json": pkg(same) }, { "package.json": pkg(), "genesis.config.json": doctorConfig(same) }, "raw-tag"))).toEqual([]);
    const lowered = await branch({ "package.json": pkg(same) }, { "package.json": pkg(), "genesis.config.json": doctorConfig({ rules: { "raw-tag": "info" } }) }, "raw-tag");
    expect(guards(lowered)).toEqual(["rules-weakened error genesis config:0 raw-tag"]);
  });

  it("compares with the base config only: pinning a rule its package raised, a new non-off setting, a renamed entry and wider files all pass", async () => {
    const files = { ...widgets({ prefer: [LIST_RULE] }), "src/Screen.tsx": SCREEN, "genesis.config.json": doctorConfig({}) };
    // The package raises its rule to error; the app keeps it at warn for now.
    const raised = { "node_modules/@marktiderman/genesis-widgets/package.json": JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "2.0.0", genesis: { doctor: { prefer: [{ ...LIST_RULE, level: "error" }] } } }) };
    const pinned = doctorConfig({ packageRules: { "widgets/lists-use-widget-view": { level: "warn", reason: "Migrating." } } });
    expect(guards(await branch(files, { ...raised, "genesis.config.json": pinned }))).toEqual([]);
    // A new entry at info (a no-op for an info rule) isn't compared; a new "off" is.
    const added = await branch(files, { "genesis.config.json": doctorConfig({ rules: { "scope-practice-id": "info", "raw-tag": "off" } }) });
    expect(guards(added)).toEqual(["rules-weakened error genesis config:0 raw-tag"]);
    // A package renames its rule and the app renames its entry: a new entry, not "off", so not flagged.
    const before = doctorConfig({ packageRules: { "widgets/lists-use-widget-view": { level: "info", reason: "Legacy." } } });
    const renamed = { "node_modules/@marktiderman/genesis-widgets/package.json": JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "2.0.0", genesis: { doctor: { prefer: [{ ...LIST_RULE, id: "lists-use-widget-views" }] } } }) };
    const after = doctorConfig({ packageRules: { "widgets/lists-use-widget-views": { level: "info", reason: "Legacy." } } });
    expect(guards(await branch({ ...files, "genesis.config.json": before }, { ...renamed, "genesis.config.json": after }))).toEqual([]);
    // Files changed to something wider isn't compared; only a new exclude glob is.
    const wider = doctorConfig({ packageRules: { "widgets/lists-use-widget-view": { files: ["**/*"], reason: "Everything." } } });
    expect(guards(await branch(files, { "genesis.config.json": wider }))).toEqual([]);
  });

  it("reports rules and packageRules that lower or narrow a rule since the base (rules-weakened); tightening is fine", async () => {
    const config = (doctor: Record<string, unknown>) => JSON.stringify({ doctor });
    const root = makeApp("raw-tag", {
      ...widgets({ prefer: [LIST_RULE] }),
      "src/Screen.tsx": SCREEN,
      "genesis.config.json": config({ rules: { "raw-tag": "warn" }, packageRules: { "widgets/lists-use-widget-view": { level: "error", reason: "Strict." } } }),
    });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(
      path.join(root, "genesis.config.json"),
      config({
        rules: { "raw-tag": "error", "stale-exception": "off" },
        packageRules: { "widgets/lists-use-widget-view": { level: "warn", exclude: ["src/Screen.tsx"], reason: "Later." } },
      }),
    );
    const result = await runDoctor({ root, base: "main" });
    expect(brief(result.findings, "rules-weakened")).toEqual([
      "rules-weakened error genesis config:0 stale-exception",
      "rules-weakened error genesis config:0 widgets/lists-use-widget-view",
      "rules-weakened error genesis config:0 widgets/lists-use-widget-view",
    ]);
    const messages = result.findings.filter((f) => f.rule === "rules-weakened").map((f) => f.message);
    expect(messages.join("\n")).toMatch(/"warn", lower than "error" since main[\s\S]*excludes src\/Screen\.tsx/);
    expect(brief((await runDoctor({ root })).findings, "rules-weakened")).toEqual([]);
  });

  it("reads paths with non-ASCII characters as themselves", () => {
    const root = makeApp(null, { "src/naïve.ts": "export const a = 1;\n" });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "src/naïve.ts"), "export const a = 2;\n");
    writeFileSync(path.join(root, "src/café.ts"), "export const c = 1;\n");
    expect([...(changedSince(root, "main") ?? [])].sort()).toEqual(["src/café.ts", "src/naïve.ts"]);
  });

  it("reports an allow entry the base ref's config didn't have (allow-grew); a changed reason is fine", async () => {
    const config = (allow: unknown[]) => JSON.stringify({ doctor: { allow } });
    const root = makeApp(null, { "genesis.config.json": config([{ rule: "raw-tag", file: "src/a.tsx", reason: "Old." }]) });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(
      path.join(root, "genesis.config.json"),
      config([
        { rule: "raw-tag", file: "src/a.tsx", reason: "Reworded." },
        { rule: "raw-tag", file: "src/b.tsx", match: "button", reason: "New." },
      ]),
    );
    const grew = await runDoctor({ root, base: "main" });
    expect(brief(grew.findings, "allow-grew")).toEqual(["allow-grew error src/b.tsx:0 raw-tag"]);
    expect(grew.findings.find((f) => f.rule === "allow-grew")!.message).toContain("raw-tag (button) since main");
    expect(brief((await runDoctor({ root })).findings, "allow-grew")).toEqual([]);
    const unreadable = await runDoctor({ root, base: "no-such-ref" });
    expect(brief(unreadable.findings, "allow-grew")).toEqual([]);
    expect(brief(unreadable.findings, "ratchet-skipped")).toEqual(["ratchet-skipped error genesis config:0"]);
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
    expect(agents).toContain("| a list screen | `<WidgetView>` | `@marktiderman/genesis-widgets` |");
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

  it("calls a lone end marker broken, writes nothing when it can't merge, and keeps AGENTS.md's line endings", async () => {
    const root = makeApp(null, { ...widgets({ prefer: [LIST_RULE] }), "AGENTS.md": "# Notes\n\n<!-- genesis-primitives:end -->\n" });
    expect(agentGuideState(root, discoverPackages(root)).agents).toBe("broken");
    expect(() => writeAgentGuide(root, discoverPackages(root))).toThrow(/broken/);
    expect(existsSync(path.join(root, SKILL_PATH))).toBe(false);
    expect(brief((await runDoctor({ root, config: {} })).findings, "agent-guide-stale")).toHaveLength(2);

    writeFileSync(path.join(root, "AGENTS.md"), "# Notes\r\n\r\nOur own rules.\r\n");
    writeAgentGuide(root, discoverPackages(root));
    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents.replace(/\r\n/g, "")).not.toContain("\n");
    expect(agentGuideState(root, discoverPackages(root))).toEqual({ skill: "ok", agents: "ok" });
    expect(writeAgentGuide(root, discoverPackages(root))).toEqual([]);
  });

  it("calls a repeated marker broken, so a copied start marker never eats the text after it", async () => {
    const root = makeApp(null, {
      ...widgets({ prefer: [LIST_RULE] }),
      "AGENTS.md": `# Notes\n\nQuoted: <!-- genesis-primitives:start -->\n\nOur own rules.\n\n<!-- genesis-primitives:start -->\nold\n<!-- genesis-primitives:end -->\n`,
    });
    expect(agentGuideState(root, discoverPackages(root)).agents).toBe("broken");
    expect(() => writeAgentGuide(root, discoverPackages(root))).toThrow(/broken/);
    expect(readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("Our own rules.");
    const stale = (await runDoctor({ root, config: {} })).findings.find((f) => f.rule === "agent-guide-stale" && f.file === "AGENTS.md");
    expect(stale!.message).toContain("missing, repeated or out of order");
  });

  it("writes an import as one code span, even when it names several with backticks or a pipe", () => {
    const table = catalogTable([{ need: "a page", use: "a layout", import: "`@acme/ui` (layouts), `@acme/ui/data` | more", from: "x" }]);
    expect(table).toContain("| `@acme/ui (layouts), @acme/ui/data \\| more` |");
  });

  it("writes JSX names in catalog cells as code, so Markdown doesn't read them as tags", () => {
    const table = catalogTable([{ need: "a list", use: "a view rendered by <ResourceView> or `<Kept>`", from: "x" }]);
    expect(table).toContain("| a list | a view rendered by `<ResourceView>` or `<Kept>` |");
  });

  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
  it.skipIf(!existsSync(cli))("fails genesis primitives and genesis agents when a package's declaration doesn't validate", () => {
    const root = makeApp(null, widgets({}));
    const json = spawnSync(process.execPath, [cli, "primitives", "--json", "--dir", root], { encoding: "utf8" });
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout).errors[0]).toContain("@marktiderman/genesis-widgets");
    for (const args of [["agents"], ["agents", "--check"]]) {
      const run = spawnSync(process.execPath, [cli, ...args, "--dir", root], { encoding: "utf8" });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("@marktiderman/genesis-widgets");
    }
    expect(existsSync(path.join(root, SKILL_PATH))).toBe(false);
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

  it("compares with the schemas the contract was generated from when config names none, and advises with them", async () => {
    process.env.GENESIS_TEST_DB_URL = "postgres://example.invalid/db";
    try {
      const contract = "// Generated by `genesis introspect` — do not edit by hand.\n// Source: Postgres (public, private)\nexport {};\n";
      const asked: string[][] = [];
      const app = makeApp(null, { "src/lib/resources.genesis.ts": contract });
      const stale = ctx(app, config);
      await checkContracts(stale.c, async (_url, schemas) => {
        asked.push(schemas);
        return { content: `${contract}// changed\n` };
      });
      expect(asked).toEqual([["public", "private"]]);
      expect(stale.found[0]!.message).toContain("-s public,private --database-env GENESIS_TEST_DB_URL");
      // The command names the checked app's file from where the doctor ran, not the app-relative path.
      expect(stale.found[0]!.message).toContain(`-o ${path.relative(process.cwd(), path.join(app, "src/lib/resources.genesis.ts"))} `);
      const named = ctx(makeApp(null, { "src/lib/resources.genesis.ts": contract }), { ...config, contracts: { ...config.contracts, schemas: ["app"] } });
      await checkContracts(named.c, async (_url, schemas) => {
        asked.push(schemas);
        return { content: contract };
      });
      expect(asked[1]).toEqual(["app"]);
    } finally {
      delete process.env.GENESIS_TEST_DB_URL;
    }
  });

  it("fails a contract it can't generate, and only warns about a database it can't reach", async () => {
    process.env.GENESIS_TEST_DB_URL = "postgres://example.invalid/db";
    try {
      const { EmitError } = await import("../src/introspect/emit.js");
      const root = makeApp(null, { "src/lib/resources.genesis.ts": "// contract v1\n" });
      const bad = ctx(root, config);
      await checkContracts(bad.c, async () => {
        throw new EmitError('public.t: @genesis labelField "nmae" isn\'t one of its columns.');
      });
      expect(bad.found.map((f) => `${f.rule} ${f.level}`)).toEqual(["contracts-stale error"]);
      expect(bad.found[0]!.message).toContain("couldn't be generated");
    } finally {
      delete process.env.GENESIS_TEST_DB_URL;
    }
  });

  it("matches a contract checked out with CRLF, and doesn't compare one generated from OpenAPI with Postgres", async () => {
    process.env.GENESIS_TEST_DB_URL = "postgres://example.invalid/db";
    try {
      const contract = "// Generated by `genesis introspect` — do not edit by hand.\n// Source: Postgres (public)\nexport {};\n";
      const crlf = ctx(makeApp(null, { "src/lib/resources.genesis.ts": contract.replace(/\n/g, "\r\n") }), config);
      await checkContracts(crlf.c, async () => ({ content: contract }));
      expect(crlf.found).toEqual([]);

      let read = false;
      const openapi = ctx(makeApp(null, { "src/lib/resources.genesis.ts": contract.replace("Postgres (public)", "OpenAPI https://example.invalid/rest/v1/") }), config);
      await checkContracts(openapi.c, async () => {
        read = true;
        return { content: contract };
      });
      expect(read).toBe(false);
      expect(openapi.found.map((f) => `${f.rule} ${f.level}`)).toEqual(["contracts-stale info"]);
      expect(openapi.found[0]!.message).toContain("generated from OpenAPI");
    } finally {
      delete process.env.GENESIS_TEST_DB_URL;
    }
  });
});
