// @feat:doctor-package-rules
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { applyRatchet } from "../src/doctor/ratchet.js";
import {
  clearPackageRulesCache,
  dedupeFindings,
  discoverPackages,
  extensionProblem,
  formatReport,
  validateDeclaration,
  runDoctor,
  validateConfig,
  type DoctorConfig,
  type ExtensionEntry,
  type Finding,
} from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);
beforeEach(() => {
  clearPackageRulesCache();
  clearLocalPackagesCache();
});

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const gitIn =
  (root: string) =>
  (...args: string[]) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });

const brief = (findings: Finding[], prefix: string) =>
  findings.filter((f) => f.rule.startsWith(prefix)).map((f) => `${f.rule} ${f.level} ${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);

const RULE = {
  id: "lists-use-widget-view",
  level: "warn",
  files: ["src/**/*.tsx"],
  forbid: { jsx: ["DataTable", "DataGrid"] },
  unless: { renders: ["WidgetView"] },
  use: "<WidgetView>",
  why: "One description per list.",
  extensible: ["useBoardColumns", "WidgetView.slots"],
};

/** A fake installed Genesis package declaring `doctor`. */
const pkg = (name: string, doctor: unknown) => ({
  [`node_modules/@marktiderman/${name}/package.json`]: JSON.stringify({ name: `@marktiderman/${name}`, version: "1.0.0", genesis: { doctor } }),
});
const widgets = (rule: Record<string, unknown> = RULE) => pkg("genesis-widgets", { prefer: [rule] });

const REASON = "The board groups rows by a computed lane, which the view's board block can't express yet.";
const extension = (over: Partial<ExtensionEntry> = {}): ExtensionEntry => ({ rule: "widgets/lists-use-widget-view", file: "src/Board.tsx", buildsOn: "useBoardColumns", reason: REASON, ...over });

const BOARD = 'import { useBoardColumns } from "@marktiderman/genesis-ui/data";\nexport const B = () => { const c = useBoardColumns(v); return <DataGrid columns={c} />; };\n';

describe("declared extensions: the config", () => {
  it("accepts { rule, file, buildsOn, reason, upstream? }", () => {
    expect(validateConfig({ extend: [extension({ upstream: "https://example.com/issues/1" })] }).extend).toHaveLength(1);
  });

  it("refuses a short reason, a glob, a meta rule, an unknown key, a bad buildsOn and a duplicate", () => {
    expect(() => validateConfig({ extend: [extension({ reason: "Needed here." })] })).toThrow(/at least 6 words and 40 characters/);
    expect(() => validateConfig({ extend: [extension({ file: "src/**/*.tsx" })] })).toThrow(/one file, not a glob/);
    expect(() => validateConfig({ extend: [extension({ rule: "allow-grew" })] })).toThrow(/can't extend allow-grew/);
    expect(() => validateConfig({ extend: [extension({ rule: "stale-extension" })] })).toThrow(/can't extend stale-extension/);
    for (const rule of ["deprecated-import", "removed-scope-name", "raw-tag"]) {
      expect(() => validateConfig({ extend: [extension({ rule })] })).toThrow(/only package rules declare extension points/);
    }
    expect(() => validateConfig({ extend: [{ ...extension(), match: "x" }] })).toThrow(/unknown key "match"/);
    expect(() => validateConfig({ extend: [extension({ buildsOn: "<FormBuilder>" })] })).toThrow(/buildsOn must name a Genesis export/);
    expect(() => validateConfig({ extend: [{ rule: "raw-tag", file: "src/a.tsx", reason: REASON }] })).toThrow(/needs "buildsOn"/);
    expect(() => validateConfig({ extend: [extension(), extension()] })).toThrow(/twice/);
    expect(() => validateConfig({ rules: { "extension-invalid": "off" } })).toThrow(/can't set extension-invalid/);
  });
});

describe("declared extensions: the package side", () => {
  it("validates a rule's extension points and unless.inside", () => {
    expect(validateDeclaration({ prefer: [RULE] }, "@marktiderman/genesis-widgets").prefer[0]!.extensible).toEqual(["useBoardColumns", "WidgetView.slots"]);
    expect(() => validateDeclaration({ prefer: [{ ...RULE, extensible: ["<Bad>"] }] }, "@marktiderman/genesis-widgets")).toThrow(/extensible must be a list of export names/);
    expect(() => validateDeclaration({ prefer: [{ ...RULE, unless: { inside: ["lower"] } }] }, "@marktiderman/genesis-widgets")).toThrow(/unless.inside must be a list of component names/);
  });
});

describe("declared extensions: in the doctor", () => {
  it("removes the findings an extension covers, when the file imports what it builds on from Genesis", async () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": BOARD, "src/Other.tsx": "export const O = () => <DataGrid />;\n" });
    const result = await runDoctor({ root, config: { extend: [extension()] } });
    expect(brief(result.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view warn src/Other.tsx:1 DataGrid"]);
    expect(brief(result.findings, "extension-")).toEqual([]);
    expect(brief(result.findings, "stale-")).toEqual([]);
  });

  it("refuses an extension whose file doesn't import what it builds on, or that builds on a component a rule replaces", async () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": "export const B = () => <DataGrid />;\n" });
    const missing = await runDoctor({ root, config: { extend: [extension()] } });
    expect(brief(missing.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view warn src/Board.tsx:1 DataGrid"]);
    expect(brief(missing.findings, "extension-invalid")).toEqual(["extension-invalid error src/Board.tsx:0 widgets/lists-use-widget-view"]);
    expect(missing.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("doesn't import useBoardColumns from a Genesis package");
    expect(missing.ok).toBe(false);
    const legacy = makeApp(null, { ...widgets({ ...RULE, extensible: ["DataGrid"] }), "src/Board.tsx": 'import { DataGrid } from "@marktiderman/genesis-ui/data";\nexport const B = () => <DataGrid />;\n' });
    const refused = await runDoctor({ root: legacy, config: { extend: [extension({ buildsOn: "DataGrid" })] } });
    expect(refused.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("DataGrid is what widgets/lists-use-widget-view replaces");
  });

  it("only extends a rule's declared extension points: any other Genesis import, or a rule with none, is refused", async () => {
    const lazy = 'import { Button } from "@marktiderman/genesis-ui";\nexport const B = () => <><DataTable /><DataTable /><DataTable /><Button /></>;\n';
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": lazy });
    const button = await runDoctor({ root, config: { extend: [extension({ buildsOn: "Button", reason: "We need these tables here for now, it is ok really." })] } });
    expect(brief(button.findings, "widgets/")).toHaveLength(3);
    expect(button.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("Button isn't one of widgets/lists-use-widget-view's extension points (useBoardColumns, WidgetView.slots)");
    const closed = makeApp(null, { ...widgets({ ...RULE, extensible: undefined }), "src/Board.tsx": BOARD });
    const none = await runDoctor({ root: closed, config: { extend: [extension()] } });
    expect(brief(none.findings, "widgets/")).toHaveLength(1);
    expect(none.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("declares no extension points");
  });

  it("refuses an extension of a rule without points even when the file has no finding of it", async () => {
    const root = makeApp(null, { ...widgets({ ...RULE, extensible: undefined }), "src/Board.tsx": "export const B = () => null;\n" });
    const result = await runDoctor({ root, config: { extend: [extension()] } });
    expect(brief(result.findings, "extension-invalid")).toEqual(["extension-invalid error src/Board.tsx:0 widgets/lists-use-widget-view"]);
    expect(brief(result.findings, "stale-extension")).toEqual([]);
  });

  it("refuses building on something the doctor flags in that file, a deprecated import say", () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": BOARD });
    const files = [{ path: "src/Board.tsx", absolutePath: path.join(root, "src/Board.tsx"), ext: ".tsx", text: BOARD, code: BOARD }];
    const ctx = { config: {}, files, packages: discoverPackages(root) };
    expect(extensionProblem(extension(), { ...ctx, raw: [] })).toBeNull();
    const raw = [{ rule: "deprecated-import", file: "src/Board.tsx", line: 1, subject: "useBoardColumns", message: "deprecated" }];
    expect(extensionProblem(extension(), { ...ctx, raw })).toMatch(/flagged in this file by deprecated-import/);
  });

  it("reports an extension whose file no longer has the finding (stale-extension), unless its rule is off", async () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": 'import { useBoardColumns } from "@marktiderman/genesis-ui/data";\nexport const B = () => <WidgetView />;\n' });
    const stale = await runDoctor({ root, config: { extend: [extension()] } });
    expect(brief(stale.findings, "stale-extension")).toEqual(["stale-extension warn src/Board.tsx:0 widgets/lists-use-widget-view"]);
    const off = await runDoctor({ root, config: { extend: [extension()], packageRules: { "widgets/lists-use-widget-view": { level: "off", reason: "Not yet." } } } });
    expect(brief(off.findings, "stale-extension")).toEqual([]);
  });

  it("isn't allow-grew or rules-weakened: a new extension is extension-added (info), listed with its reason in the summary", async () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": BOARD, "genesis.config.json": JSON.stringify({ doctor: { rules: { "raw-tag": "warn" } } }) });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ doctor: { rules: { "raw-tag": "warn" }, extend: [extension({ upstream: "https://example.com/issues/1" })] } }));
    git("commit", "-q", "-am", "extend");
    const result = await runDoctor({ root, base: "main" });
    expect([...brief(result.findings, "allow-grew"), ...brief(result.findings, "rules-weakened"), ...brief(result.findings, "widgets/")]).toEqual([]);
    expect(brief(result.findings, "extension-added")).toEqual(["extension-added info src/Board.tsx:0 widgets/lists-use-widget-view"]);
    expect(result.findings.find((f) => f.rule === "extension-added")!.message).toContain(REASON);
    expect(result.extensionsAdded?.map((e) => e.file)).toEqual(["src/Board.tsx"]);
    expect(formatReport(result)).toMatch(/Extensions added on this branch \(1\)[^\n]*\n  src\/Board\.tsx  \[widgets\/lists-use-widget-view\] builds on useBoardColumns: The board groups/);
    expect((await runDoctor({ root, base: "main", strict: true })).ok).toBe(true);
  });

  it("shows every extension as added when the base had no doctor settings", async () => {
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": BOARD, "genesis.config.json": JSON.stringify({ features: {} }) });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ features: {}, doctor: { extend: [extension()] } }));
    git("commit", "-q", "-am", "adopt");
    const result = await runDoctor({ root, base: "main" });
    expect(brief(result.findings, "extension-added")).toEqual(["extension-added info src/Board.tsx:0 widgets/lists-use-widget-view"]);
    expect(brief(result.findings, "allow-grew")).toEqual([]);
  });

  it("requires the file to use the point, not only import it: rendered, called, or the slot passed on its element", async () => {
    const importOnly = 'import { useBoardColumns } from "@marktiderman/genesis-ui/data";\nexport const B = () => <DataGrid />;\n';
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": importOnly });
    const result = await runDoctor({ root, config: { extend: [extension()] } });
    expect(result.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("imports useBoardColumns but doesn't render or call it");
    const slots = (body: string) => makeApp(null, { ...widgets(), "src/Board.tsx": `import { WidgetView } from "@marktiderman/genesis-widgets";\n${body}` });
    const slotExt = extension({ buildsOn: "WidgetView.slots" });
    // slots is passed, but to another element, and WidgetView is only referenced.
    const elsewhere = await runDoctor({ root: slots('export const B = () => <><DataGrid /><Other slots={{}} /></>;\nconst W = WidgetView;\n'), config: { extend: [slotExt] } });
    expect(elsewhere.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("doesn't pass slots to <WidgetView>");
    const files = (code: string) => [{ path: "src/Board.tsx", absolutePath: "/x/src/Board.tsx", ext: ".tsx", text: code, code }];
    const ctx = { config: {}, packages: discoverPackages(root), raw: [] };
    const used = 'import { WidgetView } from "@marktiderman/genesis-widgets";\nexport const B = () => <WidgetView view={v} slots={{ empty: () => null }} />;\n';
    expect(extensionProblem(slotExt, { ...ctx, files: files(used) })).toBeNull();
    const inString = 'import { useBoardColumns } from "@marktiderman/genesis-ui/data";\nconst s = "useBoardColumns(v)";\n';
    expect(extensionProblem(extension(), { ...ctx, files: files(inString) })).toMatch(/doesn't render or call it/);
  });

  it("covers only the findings its file had when it was declared: under --base, a count above the merge base's fails", async () => {
    const config = JSON.stringify({ doctor: { extend: [extension()] } });
    const root = makeApp(null, { ...widgets(), "src/Board.tsx": BOARD, "genesis.config.json": config });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    writeFileSync(path.join(root, "src/Board.tsx"), `${BOARD}// a fix\n`);
    git("commit", "-q", "-am", "edit");
    const same = await runDoctor({ root, base: "main" });
    expect(brief(same.findings, "widgets/")).toEqual([]);
    writeFileSync(path.join(root, "src/Board.tsx"), `${BOARD}export const More = () => <><DataTable /><DataTable /></>;\n`);
    git("commit", "-q", "-am", "grow");
    const grown = await runDoctor({ root, base: "main" });
    expect(brief(grown.findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/Board.tsx:2 DataGrid",
      "widgets/lists-use-widget-view warn src/Board.tsx:3 DataTable",
      "widgets/lists-use-widget-view warn src/Board.tsx:3 DataTable",
    ]);
    expect(grown.findings.find((f) => f.rule.startsWith("widgets/"))!.message).toContain("covers the 1 at the merge base; this file now has 3");
  });
});

describe("one finding per element", () => {
  it("merges different rules' findings on the same file, line and subject, at the higher level, listing both", () => {
    const at = (rule: string, level: Finding["level"], line: number, subject?: string): Finding => ({ rule, level, file: "src/a.tsx", line, message: `${rule} says so`, ...(subject ? { subject } : {}) });
    const out = dedupeFindings([at("app-rule", "warn", 3, "DataTable"), at("ui/lists", "error", 3, "DataTable"), at("ui/lists", "error", 3, "DataTable"), at("app-rule", "warn", 4, "DataTable"), at("no-subject", "warn", 3)]);
    expect(out.map((f) => `${f.rule} ${f.level} ${f.line} ${(f.rules ?? []).join("+")}`)).toEqual([
      "ui/lists error 3 ui/lists+app-rule",
      "ui/lists error 3 ",
      "app-rule warn 4 ",
      "no-subject warn 3 ",
    ]);
    expect(out[0]!.message).toBe("ui/lists says so (also app-rule)");
  });

  it("reports an element two packages' rules both flag once, naming both rules", async () => {
    const other = pkg("genesis-gadgets", { prefer: [{ ...RULE, id: "no-data-grids" }] });
    const root = makeApp(null, { ...widgets(), ...other, "src/Screen.tsx": "export const S = () => <DataGrid />;\n" });
    const result = await runDoctor({ root, config: {} });
    const hits = result.findings.filter((f) => f.file === "src/Screen.tsx");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.rules).toEqual(["gadgets/no-data-grids", "widgets/lists-use-widget-view"]);
    expect(formatReport(result)).toContain("[gadgets/no-data-grids, widgets/lists-use-widget-view]");
  });
});

describe("ui/records-use-record-view", () => {
  const ui = () => {
    const real = JSON.parse(readFileSync(path.join(REPO, "packages", "ui", "package.json"), "utf8")) as { genesis: { doctor: unknown } };
    return { "node_modules/@marktiderman/genesis-ui-rules/package.json": JSON.stringify({ name: "@marktiderman/genesis-ui-rules", version: "9.9.9", genesis: { doctor: real.genesis.doctor } }) };
  };

  it("accepts ResourceHeader in AppShellPageHeader (the page around one publishable thing), and still flags DetailPage", async () => {
    const root = makeApp(null, {
      ...ui(),
      "src/routes/forms.$formId.tsx": "export const F = () => <AppShellPageHeader><ResourceHeader title=\"x\" /></AppShellPageHeader>;\n",
      "src/routes/items.$id.tsx": "export const I = () => <DetailPage title=\"x\" />;\n",
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/records-use")).toEqual(["ui-rules/records-use-record-view warn src/routes/items.$id.tsx:1 DetailPage"]);
  });

  it("exempts only what renders inside BuilderLayout, or inside an app component around it, not the whole file", async () => {
    const root = makeApp(null, {
      ...ui(),
      "src/components/FormBuilderPage.tsx": 'import { BuilderLayout } from "@marktiderman/genesis-ui";\nexport function FormBuilderPage({ children }) { return <BuilderLayout>{children}</BuilderLayout>; }\nexport const Plain = ({ children }) => <div>{children}</div>;\n',
      "src/routes/direct.$id.tsx": "export const D = () => <BuilderLayout><DetailPage title=\"x\" /></BuilderLayout>;\n",
      "src/routes/wrapped.$id.tsx": 'import { FormBuilderPage } from "@/components/FormBuilderPage";\nexport const B = () => (\n  <FormBuilderPage>\n    <DetailPage title="x" />\n  </FormBuilderPage>\n);\n',
      "src/routes/beside.$id.tsx": 'import { FormBuilderPage } from "@/components/FormBuilderPage";\nexport const B = () => <><DetailPage title="x" /><FormBuilderPage /></>;\n',
      "src/routes/dead.$id.tsx": "export const D = () => <>{false && <BuilderLayout />}<DetailPage title=\"x\" /></>;\n",
      "src/routes/plain.$id.tsx": 'import { Plain } from "@/components/FormBuilderPage";\nexport const P = () => <Plain><DetailPage title="x" /></Plain>;\n',
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/records-use")).toEqual([
      "ui-rules/records-use-record-view warn src/routes/beside.$id.tsx:2 DetailPage",
      "ui-rules/records-use-record-view warn src/routes/dead.$id.tsx:1 DetailPage",
      "ui-rules/records-use-record-view warn src/routes/plain.$id.tsx:2 DetailPage",
    ]);
  });

  it("never reads a tag in a string as an element, and counts a wrapper as a builder only when it renders its children inside BuilderLayout", async () => {
    const root = makeApp(null, {
      ...ui(),
      "src/components/Fakes.tsx": [
        'import { BuilderLayout } from "@marktiderman/genesis-ui";',
        "export function Dead({ children }) { return <>{false && <BuilderLayout />}{children}</>; }",
        "export function Beside({ children }) { return <><BuilderLayout />{children}</>; }",
        "export function Real({ children }) { return <BuilderLayout>{children}</BuilderLayout>; }",
        "",
      ].join("\n"),
      "src/routes/string.$id.tsx": 'const s = "<BuilderLayout>";\nexport const S = () => <DetailPage title="x" />;\n',
      "src/routes/template.$id.tsx": "const t = `<BuilderLayout>`;\nexport const T = () => <DetailPage title=\"x\" />;\n",
      "src/routes/dead.$id.tsx": 'import { Dead } from "@/components/Fakes";\nexport const D = () => <Dead><DetailPage title="x" /></Dead>;\n',
      "src/routes/beside.$id.tsx": 'import { Beside } from "@/components/Fakes";\nexport const B = () => <Beside><DetailPage title="x" /></Beside>;\n',
      "src/routes/real.$id.tsx": 'import { Real } from "@/components/Fakes";\nexport const R = () => <Real><DetailPage title="x" /></Real>;\n',
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/records-use")).toEqual([
      "ui-rules/records-use-record-view warn src/routes/beside.$id.tsx:2 DetailPage",
      "ui-rules/records-use-record-view warn src/routes/dead.$id.tsx:2 DetailPage",
      "ui-rules/records-use-record-view warn src/routes/string.$id.tsx:2 DetailPage",
      "ui-rules/records-use-record-view warn src/routes/template.$id.tsx:2 DetailPage",
    ]);
  });

  it("keeps unless.renders file-wide and direct only: a screen composing a ResourceView-backed component still flags its own DataTable", async () => {
    const root = makeApp(null, {
      ...ui(),
      "src/components/TasksList.tsx": 'import { ResourceView } from "@marktiderman/genesis-ui/data";\nexport const TasksList = () => <ResourceView view={v} />;\n',
      "src/routes/home.tsx": 'import { TasksList } from "@/components/TasksList";\nexport const H = () => <><TasksList /><DataTable rows={[]} /></>;\n',
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/lists-use")).toEqual(["ui-rules/lists-use-resource-view warn src/routes/home.tsx:2 DataTable"]);
  });
});

describe("the count-based ratchet", () => {
  const ratcheted = { ...RULE, newOnly: true };
  /** A repo at `files` on main, then `head` committed on a work branch; the doctor run with --base main. */
  const branch = async (files: Record<string, string>, head: Record<string, string>) => {
    const root = makeApp(null, { ...widgets(ratcheted), ...files });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    for (const [file, content] of Object.entries(head)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "head");
    clearPackageRulesCache();
    return runDoctor({ root, config: {}, base: "main" });
  };
  const OLD = "export const O = () => <DataTable />;\n";

  it("doesn't fail an edit to a file with old debt, as long as the debt doesn't grow", async () => {
    const result = await branch({ "src/Old.tsx": OLD }, { "src/Old.tsx": `// a one-line fix\n${OLD}` });
    expect(brief(result.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view info src/Old.tsx:2 DataTable"]);
    expect(result.findings[0]!.message).toContain("ratcheted: 1 in this file, 1 at the merge base with main");
  });

  it("fails when a file's count of a rule grows, and when a new file has findings", async () => {
    const result = await branch({ "src/Old.tsx": OLD }, { "src/Old.tsx": `${OLD}export const P = () => <DataGrid />;\n`, "src/New.tsx": "export const N = () => <DataGrid />;\n" });
    expect(brief(result.findings, "widgets/")).toEqual([
      "widgets/lists-use-widget-view warn src/New.tsx:1 DataGrid",
      "widgets/lists-use-widget-view warn src/Old.tsx:1 DataTable",
      "widgets/lists-use-widget-view warn src/Old.tsx:2 DataGrid",
    ]);
    expect(result.findings.find((f) => f.file === "src/Old.tsx")!.message).toContain("2 widgets/lists-use-widget-view findings in this file, 1 at the merge base");
  });

  it("keeps a renamed or moved file's base counts, and never lends them to a copy", async () => {
    const big = (n: number) => Array.from({ length: n }, (_, i) => `export const Row${i} = () => <span>row ${i} of a long and similar file body</span>;`).join("\n");
    // Move src/Old.tsx to src/lists/Moved.tsx with a small edit.
    const root = makeApp(null, { ...widgets(ratcheted), "src/Old.tsx": `${OLD}${big(12)}\n` });
    const git = gitIn(root);
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "work");
    mkdirSync(path.join(root, "src/lists"), { recursive: true });
    git("mv", "src/Old.tsx", "src/lists/Moved.tsx");
    writeFileSync(path.join(root, "src/lists/Moved.tsx"), `// moved\n${OLD}${big(12)}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "move");
    clearPackageRulesCache();
    const result = await runDoctor({ root, config: {}, base: "main" });
    expect(brief(result.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view info src/lists/Moved.tsx:2 DataTable"]);
    expect(result.findings[0]!.message).toContain("1 in the files from src/Old.tsx, 1 at the merge base");
    // A copy (here, a split that moves the debt out) is a new file: its findings are new debt.
    const splitRoot = makeApp(null, { ...widgets(ratcheted), "src/Old.tsx": `${OLD}${big(12)}\n` });
    const g = gitIn(splitRoot);
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-q", "-m", "base");
    g("checkout", "-q", "-b", "work");
    writeFileSync(path.join(splitRoot, "src/Part.tsx"), `${OLD}${big(12)}\n// the copy\n`);
    writeFileSync(path.join(splitRoot, "src/Old.tsx"), `${big(12)}\n`);
    g("add", "-A");
    g("commit", "-q", "-m", "split");
    clearPackageRulesCache();
    const split = await runDoctor({ root: splitRoot, config: {}, base: "main" });
    expect(brief(split.findings, "widgets/")).toEqual(["widgets/lists-use-widget-view warn src/Part.tsx:1 DataTable"]);
  });

  it("keeps every level in a changed file when the base counts are unknown (git can't read the base)", () => {
    const f: Finding = { rule: "r", level: "warn", file: "src/a.tsx", line: 1, message: "m" };
    const config: DoctorConfig = { ratchet: true };
    const opts = { config, newOnly: new Set<string>(), changed: new Set(["src/a.tsx"]), base: "main", isAppPath: () => true };
    expect(applyRatchet([f], opts)[0]!.level).toBe("warn");
    expect(applyRatchet([f], { ...opts, baseCounts: new Map([["src/a.tsx\0r", 1]]), existedAtBase: () => true })[0]!.level).toBe("info");
    expect(applyRatchet([f], { ...opts, baseCounts: new Map(), existedAtBase: () => false })[0]!.level).toBe("warn");
  });
});
