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
    expect(() => validateConfig({ extend: [{ ...extension(), match: "x" }] })).toThrow(/unknown key "match"/);
    expect(() => validateConfig({ extend: [extension({ buildsOn: "<FormBuilder>" })] })).toThrow(/buildsOn must name a Genesis export/);
    expect(() => validateConfig({ extend: [{ rule: "raw-tag", file: "src/a.tsx", reason: REASON }] })).toThrow(/needs "buildsOn"/);
    expect(() => validateConfig({ extend: [extension(), extension()] })).toThrow(/twice/);
    expect(() => validateConfig({ rules: { "extension-invalid": "off" } })).toThrow(/can't set extension-invalid/);
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
    const legacy = makeApp(null, { ...widgets(), "src/Board.tsx": 'import { DataGrid } from "@marktiderman/genesis-ui/data";\nexport const B = () => <DataGrid />;\n' });
    const refused = await runDoctor({ root: legacy, config: { extend: [extension({ buildsOn: "DataGrid" })] } });
    expect(refused.findings.find((f) => f.rule === "extension-invalid")!.message).toContain("DataGrid is what widgets/lists-use-widget-view replaces");
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

  it("isn't counted by the ratchet: a new extension is neither allow-grew nor rules-weakened, and is shown as extension-added", async () => {
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
    expect(result.ok).toBe(true);
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

  it("exempts a screen that renders an app component whose own body renders BuilderLayout, one level, as forbid follows wrappers", async () => {
    const root = makeApp(null, {
      ...ui(),
      "src/components/FormBuilderPage.tsx": 'import { BuilderLayout } from "@marktiderman/genesis-ui";\nexport function FormBuilderPage() { return <BuilderLayout />; }\nexport const Plain = () => <div />;\n',
      "src/routes/builder.$id.tsx": 'import { FormBuilderPage } from "@/components/FormBuilderPage";\nexport const B = () => <><DetailPage title="x" /><FormBuilderPage /></>;\n',
      "src/routes/plain.$id.tsx": 'import { Plain } from "@/components/FormBuilderPage";\nexport const P = () => <><DetailPage title="x" /><Plain /></>;\n',
    });
    expect(brief((await runDoctor({ root, config: {} })).findings, "ui-rules/records-use")).toEqual(["ui-rules/records-use-record-view warn src/routes/plain.$id.tsx:2 DetailPage"]);
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

  it("keeps every level in a changed file when the base counts are unknown (git can't read the base)", () => {
    const f: Finding = { rule: "r", level: "warn", file: "src/a.tsx", line: 1, message: "m" };
    const config: DoctorConfig = { ratchet: true };
    const opts = { config, newOnly: new Set<string>(), changed: new Set(["src/a.tsx"]), base: "main", isAppPath: () => true };
    expect(applyRatchet([f], opts)[0]!.level).toBe("warn");
    expect(applyRatchet([f], { ...opts, baseCounts: new Map([["src/a.tsx\0r", 1]]), existedAtBase: () => true })[0]!.level).toBe("info");
    expect(applyRatchet([f], { ...opts, baseCounts: new Map(), existedAtBase: () => false })[0]!.level).toBe("warn");
  });
});
