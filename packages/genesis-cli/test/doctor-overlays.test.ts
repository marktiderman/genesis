// @feat:app-overlays
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { clearPackageRulesCache, readPackageExports, runDoctor, type DoctorConfig, type Finding } from "../src/doctor/index.js";
import { overlayAgeDays } from "../src/doctor/overlays.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);
beforeEach(() => {
  clearLocalPackagesCache();
  clearPackageRulesCache();
});

const SUPPORT = "@marktiderman/genesis-support";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const marker = (name: string, version: string, since = daysAgo(0)) => ({ upstream: `${name}@${version}`, since, owner: "web team", reason: "inbox filters, to promote upstream" });
const overlayJson = (extra: Record<string, unknown> = {}, overlay: unknown = marker(SUPPORT, "0.2.6")) =>
  JSON.stringify({ name: SUPPORT, version: "0.2.6-local.1", genesis: { doctor: { enforce: false, reason: "a sample" }, overlay }, ...extra });
const APP = { "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }) };
const rules = (findings: Finding[], prefix: string) => findings.filter((f) => f.rule.startsWith(prefix) && f.level !== "info").map((f) => `${f.level} ${f.rule} ${f.subject ?? ""}`.trim());

describe("overlay marker rules", () => {
  it("is quiet for a fresh, marked overlay versioned <upstream>-local.N", async () => {
    const result = await runDoctor({ root: makeApp(null, { ...APP, "packages/support/package.json": overlayJson() }), config: {}, strict: true });
    expect(rules(result.findings, "overlay-")).toEqual([]);
  });

  it("overlay-unmarked: a local package with a Genesis name and no marker is an error; other names are left alone", async () => {
    const result = await runDoctor({
      root: makeApp(null, {
        ...APP,
        "packages/support/package.json": JSON.stringify({ name: SUPPORT, version: "0.2.6", genesis: { doctor: { enforce: false, reason: "x" } } }),
        "packages/os/package.json": JSON.stringify({ name: "@acme/os", version: "0.1.0" }),
      }),
      config: {},
    });
    expect(rules(result.findings, "overlay-")).toEqual([`error overlay-unmarked ${SUPPORT}`]);
    expect(result.findings.find((f) => f.rule === "overlay-unmarked")?.file).toBe("packages/support/package.json");
  });

  it("overlay-invalid: names each problem with the marker", async () => {
    const bad = { upstream: `${SUPPORT}@^0.2.6`, since: "last week", owner: "web team", reason: "x" };
    const result = await runDoctor({ root: makeApp(null, { ...APP, "packages/support/package.json": overlayJson({}, bad) }), config: {} });
    expect(result.findings.filter((f) => f.rule === "overlay-invalid").map((f) => f.message)).toEqual([
      expect.stringMatching(/genesis\.overlay\.upstream: must be/),
      expect.stringMatching(/genesis\.overlay\.since: must be/),
    ]);
  });

  it("overlay-age: warns after 14 days, and after 30 days is an error under --strict only", async () => {
    const at = (days: number) => ({ ...APP, "packages/support/package.json": overlayJson({}, marker(SUPPORT, "0.2.6", daysAgo(days))) });
    expect(rules((await runDoctor({ root: makeApp(null, at(14)), config: {} })).findings, "overlay-age")).toEqual([]);
    expect(rules((await runDoctor({ root: makeApp(null, at(20)), config: {}, strict: true })).findings, "overlay-age")).toEqual([`warn overlay-age ${SUPPORT}`]);
    expect(rules((await runDoctor({ root: makeApp(null, at(40)), config: {} })).findings, "overlay-age")).toEqual([`warn overlay-age ${SUPPORT}`]);
    const strict = await runDoctor({ root: makeApp(null, at(40)), config: {}, strict: true });
    expect(rules(strict.findings, "overlay-age")).toEqual([`error overlay-age ${SUPPORT}`]);
    expect(strict.ok).toBe(false);
    expect(overlayAgeDays("2026-10-01", new Date("2026-10-31T23:00:00Z"))).toBe(30);
  });

  it("overlay-version: warns when the version isn't <upstream>-local.N", async () => {
    for (const version of ["0.2.6", "0.2.7-local.1", "0.2.6-local"]) {
      const result = await runDoctor({ root: makeApp(null, { ...APP, "packages/support/package.json": overlayJson({ version }) }), config: {} });
      expect(rules(result.findings, "overlay-")).toEqual([`warn overlay-version ${version}`]);
    }
  });
});

describe("overlays and the packages pack", () => {
  const PACKAGES: DoctorConfig = { packs: ["packages"] };
  const MIGRATION = { package: "@marktiderman/genesis-supabase", file: "migrations/0006_support_inbox.sql", test: "migrations/tests/0006_support_inbox.test.sql" };
  const withBlock = (migration: Record<string, string>) =>
    overlayJson({ genesis: { doctor: { enforce: false, reason: "a sample" }, overlay: marker(SUPPORT, "0.2.6"), blocks: { support: { migrations: [migration] } } } });
  const SUPABASE = {
    "node_modules/@marktiderman/genesis-supabase/package.json": JSON.stringify({ name: "@marktiderman/genesis-supabase", version: "1.0.0" }),
    "node_modules/@marktiderman/genesis-supabase/migrations/0006_support_inbox.sql": "select 1;\n",
    "node_modules/@marktiderman/genesis-supabase/migrations/tests/0006_support_inbox.test.sql": "select 1;\n",
  };
  const migrationFindings = (findings: Finding[]) => findings.filter((f) => f.rule === "package-migration-test").map((f) => f.message);

  it("package-migration-test looks a block migration's test up in the package it names", async () => {
    const result = await runDoctor({ root: makeApp(null, { ...APP, ...SUPABASE, "packages/support/package.json": withBlock(MIGRATION) }), config: PACKAGES });
    expect(migrationFindings(result.findings)).toEqual([]);
  });

  it("and reports one missing there, naming that package", async () => {
    const result = await runDoctor({
      root: makeApp(null, { ...APP, ...SUPABASE, "packages/support/package.json": withBlock({ ...MIGRATION, test: "migrations/tests/0007_missing.test.sql" }) }),
      config: PACKAGES,
    });
    expect(migrationFindings(result.findings)).toEqual([expect.stringMatching(/0007_missing\.test\.sql \(in @marktiderman\/genesis-supabase\) doesn't exist/)]);
  });

  it("package-unversioned-change skips a marked overlay, but not an unmarked package", async () => {
    const root = makeApp(null, {
      ...APP,
      "features.json": JSON.stringify({ features: [{ id: "x", links: { code: ["packages"] } }] }),
      "packages/support/package.json": overlayJson(),
      "packages/support/src/index.ts": "export const a = 1;\n",
      "packages/os/package.json": JSON.stringify({ name: "@acme/os", version: "0.1.0" }),
      "packages/os/src/index.ts": "export const b = 1;\n",
    });
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "work");
    writeFileSync(path.join(root, "packages/support/src/index.ts"), "export const a = 2;\n");
    writeFileSync(path.join(root, "packages/os/src/index.ts"), "export const b = 2;\n");
    const result = await runDoctor({ root, config: PACKAGES, base: "main" });
    expect(result.findings.filter((f) => f.rule === "package-unversioned-change").map((f) => f.file)).toEqual(["packages/os/package.json"]);
  });
});

describe("version-skew", () => {
  it("skips a marked overlay, and still warns for an unmarked copy", async () => {
    const umbrella = {
      "node_modules/@marktiderman/genesis/package.json": JSON.stringify({ name: "@marktiderman/genesis", version: "1.0.0" }),
      "node_modules/@marktiderman/genesis/dist/versions.json": JSON.stringify({ version: "1.0.0", packages: { [SUPPORT]: "0.2.6" } }),
    };
    const skew = async (json: string) =>
      (await runDoctor({ root: makeApp(null, { ...umbrella, [`node_modules/${SUPPORT}/package.json`]: json }), config: {} })).findings.filter((f) => f.rule === "version-skew");
    expect(await skew(overlayJson())).toEqual([]);
    expect(await skew(JSON.stringify({ name: SUPPORT, version: "0.2.7" }))).toHaveLength(1);
  });
});

describe("an overlay of the component package", () => {
  const UI = "@marktiderman/genesis-ui";
  const BUTTON = 'import { forwardRef } from "react";\nexport interface ButtonProps { variant?: string }\nexport const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <button ref={ref} {...props} />);\n';
  /** An app whose genesis-ui is its own overlay, exports pointing at TypeScript source with no `types` condition. */
  const uiOverlay = (markIt: boolean, extra: Record<string, string> = {}) => {
    const root = makeApp(null, {
      ...APP,
      "packages/ui/package.json": JSON.stringify({
        name: UI,
        version: "9.9.9-local.1",
        exports: { ".": "./src/index.ts", "./data": { import: "./src/data/index.ts" } },
        genesis: { doctor: { enforce: false, reason: "a sample" }, ...(markIt ? { overlay: marker(UI, "9.9.9") } : {}) },
      }),
      "packages/ui/src/index.ts": '// export { Ghost } from "./ghost";\nexport * from "./button";\nexport { Card } from "./card";\nexport type { CardProps } from "./card";\n',
      "packages/ui/src/button.tsx": BUTTON,
      "packages/ui/src/card.tsx": "export interface CardProps { title: string }\nexport function Card(props: CardProps) { return <div>{props.title}</div>; }\n",
      "packages/ui/src/data/index.ts": 'export { ResourceView } from "./resource-view";\n',
      "packages/ui/src/data/resource-view.tsx": "export const ResourceView = () => <div />;\n",
      ...extra,
    });
    const installed = path.join(root, "node_modules", UI);
    rmSync(installed, { recursive: true, force: true });
    mkdirSync(path.dirname(installed), { recursive: true });
    symlinkSync(path.join(root, "packages/ui"), installed, "dir");
    return root;
  };

  it("reads component exports from the TypeScript source the exports point at", () => {
    const pkg = readPackageExports(uiOverlay(true), UI)!;
    expect(pkg.components).toEqual(["Button", "Card", "ResourceView"]);
    expect(pkg.values.has("ButtonProps")).toBe(false);
    expect(pkg.exports.has("Ghost")).toBe(false);
  });

  it("skips shadowed-export, raw-tag and local-genesis-copy inside a marked overlay of that package", async () => {
    const copy = { "src/components/button.tsx": BUTTON };
    const shadows = (findings: Finding[]) =>
      findings.filter((f) => ["shadowed-export", "raw-tag", "local-genesis-copy"].includes(f.rule)).map((f) => `${f.rule} ${f.file}`).sort();
    const marked = await runDoctor({ root: uiOverlay(true, copy), config: {} });
    expect(shadows(marked.findings)).toEqual(["raw-tag src/components/button.tsx", "shadowed-export src/components/button.tsx"]);
    const unmarked = await runDoctor({ root: uiOverlay(false, copy), config: {} });
    expect(shadows(unmarked.findings)).toEqual(
      ["raw-tag packages/ui/src/button.tsx", "raw-tag src/components/button.tsx", "shadowed-export packages/ui/src/button.tsx", "shadowed-export packages/ui/src/card.tsx", "shadowed-export packages/ui/src/data/resource-view.tsx", "shadowed-export src/components/button.tsx"].sort(),
    );
  });

  it("an overlay of another package still may not shadow the component package", async () => {
    const result = await runDoctor({
      root: makeApp(null, { ...APP, "packages/support/package.json": overlayJson(), "packages/support/src/button.tsx": BUTTON }),
      config: {},
    });
    expect(result.findings.filter((f) => f.rule === "shadowed-export").map((f) => f.file)).toEqual(["packages/support/src/button.tsx"]);
  });
});
