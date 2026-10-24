// @feat:cli-doctor
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  DoctorConfigError,
  globToRegExp,
  loadGenesis,
  parseRulesMarkdown,
  runDoctor,
  validateConfig,
  type DoctorConfig,
  type Finding,
} from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const run = (fixture: string | null, config: DoctorConfig = {}, extra: Record<string, string> = {}) =>
  runDoctor({ root: makeApp(fixture, extra), config });

/** `rule file:line subject` for compact assertions. */
const brief = (findings: Finding[], rule?: string) =>
  findings.filter((f) => !rule || f.rule === rule).map((f) => `${f.rule} ${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);

describe("reading Genesis", () => {
  it("derives components, values, tokens and raw tags from the installed packages", () => {
    const g = loadGenesis(makeApp(null), {});
    expect(g.uiVersion).toBe("9.9.9");
    // Types (ButtonProps, StatusBadgeStatus, re-exported FieldDef) and constants are not components.
    expect(g.components).toEqual(["Button", "Card", "DataTable", "H1", "Input", "Label", "Separator"]);
    expect(g.values.has("cn")).toBe(true);
    expect(g.values.has("StatusBadgeStatus")).toBe(false);
    expect(g.values.has("FieldDef")).toBe(false);
    // Both shipped theme files: genesis.css and the Tailwind v4 bridge.
    expect([...g.tokens].sort()).toEqual(["--background", "--color-border", "--primary"]);
    expect(Object.fromEntries(g.rawTags)).toEqual({ button: "Button", input: "Input", label: "Label", hr: "Separator" });
    expect(g.palette).toContain("red");
  });

  it("takes themeCss as one stylesheet or a list", () => {
    const root = makeApp(null);
    const one = loadGenesis(root, validateConfig({ themeCss: "@marktiderman/genesis-design-system/dist/themes/genesis.css" }));
    expect([...one.tokens].sort()).toEqual(["--background", "--primary"]);
    const both = loadGenesis(
      root,
      validateConfig({
        themeCss: [
          "@marktiderman/genesis-design-system/dist/themes/genesis.css",
          "@marktiderman/genesis-design-system/dist/themes/genesis-tailwind4.css",
        ],
      }),
    );
    expect(both.tokens.has("--color-border")).toBe(true);
  });

  it("applies rawTags overrides from config", () => {
    const g = loadGenesis(makeApp(null), { rawTags: { hr: false, img: "Avatar" } });
    expect(g.rawTags.has("hr")).toBe(false);
    expect(g.rawTags.get("img")).toBe("Avatar");
  });

  it("explains a missing component package", () => {
    expect(() => loadGenesis(makeApp(null), { uiPackage: "@acme/not-installed" })).toThrow(/not installed/);
  });
});

describe("built-in rules", () => {
  it("passes a clean app and lists unused components", async () => {
    const r = await run("clean");
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.unused).toEqual(["H1", "Separator"]);
  });

  it("forbidden-import: Radix, local primitives, the starter's utils", async () => {
    const r = await run("forbidden-import");
    expect(brief(r.findings, "forbidden-import")).toEqual([
      "forbidden-import src/app.tsx:2 @radix-ui/react-dialog",
      "forbidden-import src/app.tsx:3 @/components/ui/card",
      "forbidden-import src/app.tsx:4 @/lib/utils",
      "forbidden-import src/app.tsx:5 ../components/ui/thing",
      "forbidden-import src/app.tsx:7 ~/components/ui/lazy",
    ]);
  });

  it("forbidden-import: extra patterns from config", async () => {
    const r = await run("clean", { forbiddenImports: { "^@marktiderman/genesis-ui/data$": "import data views from the app's RecordTable" } });
    expect(brief(r.findings)).toEqual(["forbidden-import src/page.tsx:2 @marktiderman/genesis-ui/data"]);
    expect(r.findings[0].message).toContain("RecordTable");
  });

  it("raw-tag: JSX only, comments ignored, only tags Genesis replaces", async () => {
    const r = await run("raw-tag");
    expect(brief(r.findings)).toEqual([
      "raw-tag src/form.tsx:6 button",
      "raw-tag src/form.tsx:7 input",
      "raw-tag src/form.tsx:8 label",
      "raw-tag src/form.tsx:9 hr",
    ]);
    expect(r.findings[0].message).toBe("renders a raw <button>; use Genesis Button");
  });

  it("palette-color: literal Tailwind palette utilities", async () => {
    const r = await run("palette-color");
    expect(brief(r.findings)).toEqual([
      "palette-color src/badge.tsx:1 bg-red-500",
      "palette-color src/badge.tsx:2 text-slate-700/50",
      "palette-color src/badge.tsx:4 text-white",
    ]);
  });

  it("arbitrary-color: reported once, not again as raw-color", async () => {
    const r = await run("arbitrary-color");
    expect(brief(r.findings)).toEqual([
      "arbitrary-color src/banner.tsx:1 bg-[#ff0000]",
      "arbitrary-color src/banner.tsx:2 text-[rgb(1,2,3)]",
    ]);
  });

  it("raw-color: hex and color functions via the shared lexer, comments and issue refs ignored", async () => {
    const r = await run("raw-color");
    expect(brief(r.findings)).toEqual([
      "raw-color src/chart.ts:1 rgba(0, 0, 0, 0.5)",
      "raw-color src/styles.css:3 #ff0000",
    ]);
  });

  it("undefined-token: Genesis, Tailwind v4 bridge, app-declared and inline tokens are defined", async () => {
    const r = await run("undefined-token");
    expect(brief(r.findings)).toEqual([
      "undefined-token src/meter.tsx:2 --missing",
      "undefined-token src/styles.css:8 --nope",
    ]);
  });

  it("undefined-token: tokenFiles narrows which app files may declare tokens", async () => {
    const r = await run("undefined-token", { tokenFiles: ["src/brand.css"] });
    expect(brief(r.findings).map((s) => s.split(" ").pop())).toEqual(["--missing", "--brand-accent", "--nope"]);
  });

  it("shadowed-export: values only, not types", async () => {
    const r = await run("shadowed-export");
    expect(brief(r.findings)).toEqual(["shadowed-export src/button.tsx:1 Button", "shadowed-export src/button.tsx:4 Card"]);
  });

  it("local-primitives and starter-leftover", async () => {
    const r = await run("local-primitives");
    expect(brief(r.findings)).toEqual([
      "starter-leftover components.json:0 components.json",
      "local-primitives src/components/ui:0 src/components/ui",
    ]);
    expect(r.findings.find((f) => f.rule === "starter-leftover")?.level).toBe("warn");
    expect(r.ok).toBe(false);
  });
});

describe("config", () => {
  it("rules overrides change levels or turn rules off", async () => {
    const r = await run("palette-color", { rules: { "palette-color": "warn" } });
    expect(r.findings.every((f) => f.level === "warn")).toBe(true);
    expect(r.ok).toBe(true);
    const strict = await runDoctor({ root: makeApp("palette-color"), config: { rules: { "palette-color": "warn" } }, strict: true });
    expect(strict.ok).toBe(false);
    const off = await run("palette-color", { rules: { "palette-color": "off" } });
    expect(off.findings).toEqual([]);
  });

  it("allow entries need a reason, match by rule/file/subject, and go stale", async () => {
    expect(() => validateConfig({ allow: [{ rule: "raw-tag" }] })).toThrow(/needs a "reason"/);
    const r = await run("raw-tag", {
      allow: [
        { rule: "raw-tag", file: "src/form.tsx", match: "hr", reason: "decorative rule" },
        { rule: "raw-tag", file: "src/old/**", reason: "deleted folder" },
      ],
    });
    expect(brief(r.findings, "raw-tag").map((s) => s.split(" ").pop())).toEqual(["button", "input", "label"]);
    expect(brief(r.findings, "stale-exception")).toEqual(["stale-exception src/old/**:0 raw-tag"]);
  });

  it("rules can turn stale-exception off or change its level", async () => {
    const allow = [{ rule: "raw-tag", file: "src/old/**", reason: "deleted folder" }];
    const off = await run("raw-tag", { allow, rules: { "stale-exception": "off" } });
    expect(brief(off.findings, "stale-exception")).toEqual([]);
    const error = await run("raw-tag", { allow, rules: { "stale-exception": "error" } });
    expect(error.findings.filter((f) => f.rule === "stale-exception").map((f) => f.level)).toEqual(["error"]);
  });

  it("ignore globs add to the defaults", async () => {
    const r = await run("raw-tag", { ignore: ["src/form.tsx"] });
    expect(r.findings).toEqual([]);
    const tests = await run(null, {}, { "src/form.test.tsx": "export const t = <button />;" });
    expect(tests.findings).toEqual([]);
  });

  it("rejects unknown settings and bad shapes", () => {
    expect(() => validateConfig({ scr: ["src"] })).toThrow(/unknown setting "scr"/);
    expect(() => validateConfig({ rules: { "raw-tag": "loud" } })).toThrow(/must be "error", "warn" or "off"/);
    expect(() => validateConfig({ forbiddenImports: { "(": "x" } })).toThrow(/not a valid regular expression/);
    expect(() => validateConfig({ themeCss: 3 })).toThrow(/themeCss/);
    expect(() => validateConfig({ rawTags: { "a.b": "X" } })).toThrow(/not an HTML tag name/);
  });

  it("reads genesis.config.json, then package.json genesis.doctor", async () => {
    const fromFile = await runDoctor({
      root: makeApp("palette-color", { "genesis.config.json": JSON.stringify({ doctor: { rules: { "palette-color": "off" } } }) }),
    });
    expect(fromFile.findings).toEqual([]);
    const fromPkg = await runDoctor({
      root: makeApp("palette-color", { "package.json": JSON.stringify({ genesis: { doctor: { rules: { "palette-color": "off" } } } }) }),
    });
    expect(fromPkg.findings).toEqual([]);
    await expect(runDoctor({ root: makeApp(null), configPath: "missing.json" })).rejects.toThrow(DoctorConfigError);
  });
});

describe("app rules", () => {
  it("parses the markdown rules format", () => {
    const rules = parseRulesMarkdown("## Section\n\n### a-rule\n- level: warn\n- files: src/*.tsx, src/**/*.ts\n- forbid: (?i)todo\n\n## Next\n- files: ignored");
    expect(rules).toEqual([{ id: "a-rule", level: "warn", files: ["src/*.tsx", "src/**/*.ts"], forbid: "(?i)todo" }]);
  });

  it("runs rules from rulesDoc; guides are never checked; comments don't satisfy require", async () => {
    const r = await run("patterns", { rulesDoc: "DESIGN_RULES.md" });
    expect(brief(r.findings)).toEqual(["pages-use-layouts src/routes/home.tsx:0"]);
    expect(r.ruleCount).toBe(1);
  });

  it("runs config patterns: forbid reports the line, path checks the file name", async () => {
    const r = await run("patterns", {
      patterns: [
        { id: "no-app-header", files: ["src/**"], forbid: "AppHeader", message: "The shell owns the header." },
        { id: "kebab-files", level: "warn", files: ["src/routes/*"], path: "/[a-z]+\\.tsx$" },
      ],
    });
    expect(brief(r.findings)).toEqual(["no-app-header src/routes/home.tsx:1"]);
    expect(r.findings[0].message).toBe("The shell owns the header.");
  });

  it("rejects broken pattern rules with their id", async () => {
    await expect(run("patterns", { patterns: [{ id: "x", files: ["src/**"], forbid: "(" }] })).rejects.toThrow(/rule "x" has an invalid pattern/);
    await expect(run("patterns", { patterns: [{ id: "y", files: ["src/**"] }] })).rejects.toThrow(/needs forbid, require or path/);
    await expect(run("patterns", { patterns: [{ id: "raw-tag", files: ["src/**"], forbid: "x" }] })).rejects.toThrow(/built-in rule id/);
  });

  it("loads plugin modules with options; their findings take allow and rules settings", async () => {
    const r = await run("plugin", { plugins: [["./rules/no-todo.mjs", { word: "TODO" }]] });
    expect(brief(r.findings)).toEqual(["no-todo src/page.tsx:1 TODO"]);
    expect(r.findings[0].level).toBe("warn");
    const allowed = await run("plugin", {
      plugins: ["./rules/no-todo.mjs"],
      allow: [{ rule: "no-todo", file: "src/page.tsx", reason: "placeholder copy" }],
    });
    expect(allowed.findings).toEqual([]);
  });

  it("reports a missing or malformed plugin clearly", async () => {
    await expect(run("plugin", { plugins: ["./rules/missing.mjs"] })).rejects.toThrow(/cannot find/);
    await expect(run("plugin", { plugins: ["./bad.mjs"] }, { "bad.mjs": "export default 42;" })).rejects.toThrow(/must default-export/);
  });

  it("turns a plugin that throws into a finding instead of crashing", async () => {
    const r = await run("clean", { plugins: ["./boom.mjs"] }, { "boom.mjs": "export default { name: 'boom', check() { throw new Error('kaput'); } };" });
    expect(brief(r.findings)).toEqual(["plugin-error boom:0"]);
    expect(r.findings[0].message).toContain("kaput");
  });
});

describe("globs", () => {
  it("matches * within a folder, ** across folders, and trailing-slash prefixes", () => {
    expect(globToRegExp("src/*.tsx").test("src/a.tsx")).toBe(true);
    expect(globToRegExp("src/*.tsx").test("src/x/a.tsx")).toBe(false);
    expect(globToRegExp("src/**/*.tsx").test("src/a.tsx")).toBe(true);
    expect(globToRegExp("src/**/*.tsx").test("src/x/y/a.tsx")).toBe(true);
    expect(globToRegExp("src/integrations/").test("src/integrations/supabase/client.ts")).toBe(true);
  });
});

describe("--build", () => {
  it("runs configured commands and reports the first failure", async () => {
    const ok = await runDoctor({ root: makeApp("clean"), config: { build: ["node -e \"process.exit(0)\""] }, build: true, quietBuild: true });
    expect(ok.ok).toBe(true);
    const bad = await runDoctor({ root: makeApp("clean"), config: { build: ["node -e \"process.exit(3)\"", "node -e \"\""] }, build: true, quietBuild: true });
    expect(brief(bad.findings)).toEqual(['build node -e "process.exit(3)":0']);
    expect(bad.ok).toBe(false);
  });
});

describe("CLI", () => {
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
  it.skipIf(!existsSync(cli))("exits 0/1/2 and prints JSON", () => {
    const clean = spawnSync(process.execPath, [cli, "doctor", "--dir", makeApp("clean")], { encoding: "utf8" });
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain("PASS");
    const bad = spawnSync(process.execPath, [cli, "doctor", "--json", "--dir", makeApp("raw-tag")], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    const json = JSON.parse(bad.stdout);
    expect(json.ok).toBe(false);
    expect(json.findings[0]).toMatchObject({ rule: "raw-tag", file: "src/form.tsx", line: 6 });
    const broken = spawnSync(process.execPath, [cli, "doctor", "--dir", makeApp(null, { "genesis.config.json": "{ nope" })], { encoding: "utf8" });
    expect(broken.status).toBe(2);
    expect(broken.stderr).toContain("not valid JSON");
  });

  it.skipIf(!existsSync(cli))("exits 2 with a message, not a stack, on a bad shared block or a non-object config", () => {
    const badLinks = makeApp("clean", { "genesis.config.json": JSON.stringify({ links: { hosts: ["https://example.com"] } }) });
    const text = spawnSync(process.execPath, [cli, "doctor", "--dir", badLinks], { encoding: "utf8" });
    expect(text.status).toBe(2);
    expect(text.stderr).toMatch(/^✗ .*links\.hosts: "https:\/\/example\.com" is not a bare/);
    expect(text.stderr).not.toContain("    at ");
    const json = spawnSync(process.execPath, [cli, "doctor", "--json", "--dir", badLinks], { encoding: "utf8" });
    expect(json.status).toBe(2);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: expect.stringContaining("links.hosts") });
    const notObject = spawnSync(process.execPath, [cli, "doctor", "--dir", makeApp("clean", { "genesis.config.json": "[]" })], { encoding: "utf8" });
    expect(notObject.status).toBe(2);
    expect(notObject.stderr).toContain("the config must be a JSON object");
  });
});
