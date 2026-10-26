// @feat:local-packages
import { readdirSync } from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { allBlocks, packageDir } from "../src/blocks/discover.js";
import { clearLocalPackagesCache, LocalPackagesError, localPackages, validateLocalPackages } from "../src/blocks/local.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { expoApp, linkWorkspacePackage, NOW, read, SQL_A, TEST_A, writeTree } from "./blocks-helpers.js";

const OS = {
  name: "@acme/os",
  version: "0.1.0",
  genesis: {
    blocks: {
      "team-scorecard": {
        feature: { name: "Team scorecard", summary: "Weekly numbers per team." },
        migrations: [{ file: "migrations/0001_acme_scorecard.sql", test: "migrations/tests/0001_acme_scorecard.test.sql" }],
      },
    },
  },
};

function appWithLocalPackage(config: unknown = { localPackages: ["packages/*"] }) {
  const root = expoApp({
    "genesis.config.json": JSON.stringify(config),
    "packages/os/package.json": JSON.stringify(OS),
    "packages/os/migrations/0001_acme_scorecard.sql": SQL_A,
    "packages/os/migrations/tests/0001_acme_scorecard.test.sql": TEST_A,
    "packages/notes/README.md": "not a package\n",
  });
  linkWorkspacePackage(root, "@marktiderman/genesis-features", "features");
  return root;
}

describe("local packages", () => {
  beforeEach(() => clearLocalPackagesCache());

  it("finds the packages genesis.config.json lists, skipping folders without a package.json", () => {
    const root = appWithLocalPackage();
    expect(localPackages(root).map((p) => [p.name, p.rel, p.version])).toEqual([["@acme/os", "packages/os", "0.1.0"]]);
    expect(packageDir(root, "@acme/os")).toBe(path.join(root, "packages/os"));
  });

  it("lists nothing without the setting", () => {
    expect(localPackages(appWithLocalPackage({}))).toEqual([]);
  });

  it("refuses entries that leave the app or use other globs", () => {
    for (const bad of [[".."], ["../.."], ["/abs"], ["packages/**/x"], ["node_modules/x"], "packages/*", [""]]) {
      expect(() => validateLocalPackages(bad)).toThrow(LocalPackagesError);
    }
    expect(validateLocalPackages(["./packages/*", "tools/os/", "../../packages/*"])).toEqual(["packages/*", "tools/os", "../../packages/*"]);
  });

  it("refuses two folders with the same package name", () => {
    const root = appWithLocalPackage();
    writeTree(root, { "packages/os-copy/package.json": JSON.stringify(OS) });
    expect(() => localPackages(root)).toThrow(/both named @acme\/os/);
  });

  it("declares blocks beside Genesis's", async () => {
    const root = appWithLocalPackage();
    const found = (await allBlocks(root)).find((b) => b.manifest.id === "team-scorecard");
    expect(found).toMatchObject({ from: "local", manifest: { package: "@acme/os", version: "0.1.0" } });
  });

  it("adds a local block without installing anything, and migrate keeps its copies current", async () => {
    const root = appWithLocalPackage();
    const report = await runAdd({ root, block: "team-scorecard", yes: true, install: false, featuresBuild: false, now: NOW });
    expect(report.install).toBeNull();
    const copies = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.includes("acme_scorecard"));
    expect(copies).toHaveLength(1);
    expect(read(root, `supabase/migrations/${copies[0]}`)).toMatch(/^-- genesis-migration: @acme\/os migrations\/0001_acme_scorecard\.sql sha256:/);
    expect(read(root, "supabase/tests/database/acme_scorecard.test.sql")).toBe(TEST_A);
    const again = await runMigrate({ root, now: NOW });
    expect(again.plan.rows.map((r) => r.state)).toEqual(["current"]);
    expect(again.warnings).toEqual([]);
  });
});

describe("local packages: lenient discovery", () => {
  beforeEach(() => clearLocalPackagesCache());

  it("skips a folder whose package.json has no name or isn't JSON", () => {
    const root = appWithLocalPackage();
    writeTree(root, { "packages/nameless/package.json": "{}", "packages/broken/package.json": "{ not json" });
    expect(localPackages(root).map((p) => p.name)).toEqual(["@acme/os"]);
  });

  it("lists packages above the app that stay inside its repository", () => {
    const repo = appWithLocalPackage({});
    writeTree(repo, { ".git/HEAD": "ref: refs/heads/main\n", "apps/mobile/genesis.config.json": JSON.stringify({ localPackages: ["../../packages/*"] }) });
    const found = localPackages(path.join(repo, "apps/mobile"));
    expect(found.map((p) => [p.name, p.rel])).toEqual([["@acme/os", "../../packages/os"]]);
  });
});
