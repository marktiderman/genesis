// @feat:local-packages
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { runDoctor, validateConfig, type DoctorConfig, type Finding } from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);
beforeEach(() => clearLocalPackagesCache());

const PACKAGES: DoctorConfig = { packs: ["packages"] };
const brief = (findings: Finding[], prefix = "package-") =>
  findings.filter((f) => f.rule.startsWith(prefix) && f.level !== "info").map((f) => `${f.rule} ${f.file}${f.subject ? ` ${f.subject}` : ""}`);

const PKG = {
  name: "@acme/os",
  version: "0.1.0",
  peerDependencies: { react: "^19" },
  genesis: { blocks: { "team-scorecard": { migrations: [{ file: "migrations/0001_acme_scorecard.sql", test: "migrations/tests/0001_acme_scorecard.test.sql" }] } } },
};
const CLEAN = {
  "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }),
  "features.json": JSON.stringify({ features: [{ id: "team-scorecard", links: { code: ["packages/os"] } }] }),
  "packages/os/package.json": JSON.stringify(PKG),
  "packages/os/src/index.ts": 'import { useState } from "react";\nimport { read } from "./read";\nimport { join } from "node:path";\nexport { useState, read, join };\n',
  "packages/os/src/read.ts": "export const read = () => 1;\n",
  "packages/os/migrations/0001_acme_scorecard.sql": "create table x (id int);\n",
  "packages/os/migrations/tests/0001_acme_scorecard.test.sql": "select 1;\n",
};

describe("packages pack", () => {
  it("accepts the pack and its base setting", () => {
    expect(validateConfig({ packs: ["packages"], packages: { base: "origin/staging" } }).packages).toEqual({ base: "origin/staging" });
    expect(() => validateConfig({ packs: ["packages"], packages: { since: "x" } })).toThrow();
  });

  it("is quiet for a clean package", async () => {
    const result = await runDoctor({ root: makeApp(null, CLEAN), config: PACKAGES });
    expect(brief(result.findings)).toEqual([]);
  });

  it("finds app imports, undeclared dependencies, missing tests, duplicate numbers and unregistered packages", async () => {
    const pkg = { ...PKG, genesis: { blocks: { "team-scorecard": { migrations: [{ file: "migrations/0001_acme_scorecard.sql" }] } } } };
    const result = await runDoctor({
      root: makeApp(null, {
        ...CLEAN,
        "features.json": JSON.stringify({ features: [] }),
        "packages/os/package.json": JSON.stringify(pkg),
        "packages/os/src/index.ts": 'import { db } from "@/lib/db";\nimport { x } from "../../../src/x";\nimport dayjs from "dayjs";\nimport { z } from "zod/v4";\nexport { db, x, dayjs, z };\n',
        "packages/os/migrations/0001_acme_other.sql": "select 1;\n",
      }),
      config: PACKAGES,
    });
    expect(brief(result.findings).sort()).toEqual(
      [
        "package-app-import packages/os/src/index.ts @/lib/db",
        "package-app-import packages/os/src/index.ts ../../../src/x",
        "package-undeclared-dependency packages/os/src/index.ts dayjs",
        "package-undeclared-dependency packages/os/src/index.ts zod",
        "package-migration-test packages/os/package.json migrations/0001_acme_scorecard.sql",
        "package-migration-test packages/os/migrations/0001_acme_other.sql 0001_acme_other.sql",
        "package-migration-number packages/os/migrations/0001_acme_scorecard.sql 0001",
        "package-unregistered packages/os",
      ].sort(),
    );
    expect(result.findings.find((f) => f.rule === "package-unregistered")?.level).toBe("warn");
  });

  it("fails a change that bumps neither the version nor a changeset, and an edited migration", async () => {
    const root = makeApp(null, CLEAN);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    git("checkout", "-qb", "work");
    writeFileSync(path.join(root, "packages/os/src/read.ts"), "export const read = () => 2;\n");
    writeFileSync(path.join(root, "packages/os/migrations/0001_acme_scorecard.sql"), "create table x (id int, y int);\n");
    const config: DoctorConfig = { packs: ["packages"] };
    let result = await runDoctor({ root, config, base: "main" });
    expect(brief(result.findings)).toEqual([
      "package-migration-edited packages/os/migrations/0001_acme_scorecard.sql",
      "package-unversioned-change packages/os/package.json",
    ]);
    // A changeset naming the package satisfies the gate.
    execFileSync("mkdir", ["-p", path.join(root, ".changeset")]);
    writeFileSync(path.join(root, ".changeset/scorecard.md"), '---\n"@acme/os": patch\n---\n\nScorecard reads twice as fast.\n\nFeatures: team-scorecard\n');
    clearLocalPackagesCache();
    result = await runDoctor({ root, config, base: "main" });
    expect(brief(result.findings)).toEqual(["package-migration-edited packages/os/migrations/0001_acme_scorecard.sql"]);
    // So does a version bump.
    writeFileSync(path.join(root, ".changeset/scorecard.md"), "");
    writeFileSync(path.join(root, "packages/os/package.json"), JSON.stringify({ ...PKG, version: "0.1.1" }));
    result = await runDoctor({ root, config, base: "main" });
    // A bump passes the gate, but asks for a changeset to record the features.
    expect(result.findings.filter((f) => f.rule === "package-unversioned-change").map((f) => f.message)).toEqual([
      expect.stringMatching(/version went up without a changeset/),
    ]);
  });
});

describe("app rules on local packages", () => {
  it("scan a local package's source like the app's", async () => {
    const result = await runDoctor({
      root: makeApp(null, { ...CLEAN, "packages/os/src/badge.tsx": 'export const Badge = () => <span style={{ color: "#ff0000" }}>x</span>;\n' }),
      config: {},
    });
    expect(result.findings.some((f) => f.file === "packages/os/src/badge.tsx")).toBe(true);
  });
});

describe("packages pack invariants", () => {
  it("without a base ref the change gate reports one info finding, which never fails, even strict", async () => {
    const result = await runDoctor({ root: makeApp(null, CLEAN), config: PACKAGES, strict: true });
    const gate = result.findings.filter((f) => f.rule === "package-unversioned-change");
    expect(gate.map((f) => [f.level, f.message])).toEqual([["info", expect.stringMatching(/^change gate skipped: no base ref/)]]);
    expect(result.ok).toBe(true);
  });

  it("a base ref that was asked for but can't be compared is a warning, so --strict fails", async () => {
    const result = await runDoctor({ root: makeApp(null, CLEAN), config: PACKAGES, base: "origin/nope", strict: true });
    expect(result.findings.filter((f) => f.rule.startsWith("package-")).map((f) => f.level)).toEqual(["warn"]);
    expect(result.ok).toBe(false);
  });

  it("reads imports the way the import trail does: comments, strings and type-only imports aren't dependencies", async () => {
    const result = await runDoctor({
      root: makeApp(null, {
        ...CLEAN,
        "packages/os/src/index.ts": '// import x from "dayjs";\nconst s = "import y from \'lodash\'";\nimport type { Z } from "zod";\nexport type { Z };\nexport { s };\n',
      }),
      config: PACKAGES,
    });
    expect(brief(result.findings)).toEqual([]);
  });

  it("honours rules off and allow entries", async () => {
    const files = { ...CLEAN, "packages/os/src/index.ts": 'import dayjs from "dayjs";\nexport { dayjs };\n' };
    const off = await runDoctor({ root: makeApp(null, files), config: { ...PACKAGES, rules: { "package-undeclared-dependency": "off" } } });
    expect(brief(off.findings)).toEqual([]);
    const allowed = await runDoctor({
      root: makeApp(null, files),
      config: { ...PACKAGES, allow: [{ rule: "package-undeclared-dependency", match: "dayjs", reason: "hoisted by the app on purpose" }] },
    });
    expect(brief(allowed.findings)).toEqual([]);
  });

  it("does nothing without local packages", async () => {
    const result = await runDoctor({ root: makeApp(null, {}), config: PACKAGES });
    expect(result.findings.filter((f) => f.rule.startsWith("package-"))).toEqual([]);
  });
});

describe("what counts as declared", () => {
  it("a peerDependency, a workspace: dependency, and Node built-ins (node: and bare)", async () => {
    const pkg = { ...PKG, peerDependencies: { react: "^19" }, dependencies: { "@acme/ui": "workspace:*" } };
    const result = await runDoctor({
      root: makeApp(null, {
        ...CLEAN,
        "packages/os/package.json": JSON.stringify(pkg),
        "packages/os/src/index.ts":
          'import { useState } from "react";\nimport { Button } from "@acme/ui";\nimport { join } from "node:path";\nimport { readFileSync } from "fs";\nimport { createHash } from "crypto";\nexport { useState, Button, join, readFileSync, createHash };\n',
      }),
      config: PACKAGES,
    });
    expect(brief(result.findings)).toEqual([]);
  });
});

describe("change gate edge cases", () => {
  const commit = (root: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });

  it("works for an app in a subfolder of its repository, with changesets at the repository root", async () => {
    const repo = makeApp(null, {});
    const app = path.join(repo, "apps/web");
    for (const [rel, text] of Object.entries(CLEAN)) {
      execFileSync("mkdir", ["-p", path.dirname(path.join(app, rel))]);
      writeFileSync(path.join(app, rel), text);
    }
    commit(repo, "init", "-q", "-b", "main");
    commit(repo, "add", "-A");
    commit(repo, "commit", "-qm", "base");
    commit(repo, "checkout", "-qb", "work");
    writeFileSync(path.join(app, "packages/os/src/read.ts"), "export const read = () => 3;\n");
    clearLocalPackagesCache();
    let result = await runDoctor({ root: app, config: PACKAGES, base: "main" });
    expect(brief(result.findings)).toEqual(["package-unversioned-change packages/os/package.json"]);
    execFileSync("mkdir", ["-p", path.join(repo, ".changeset")]);
    writeFileSync(path.join(repo, ".changeset/os.md"), "---\n'@acme/os': patch\n---\n\nFaster reads.\n\nFeatures: team-scorecard\n");
    result = await runDoctor({ root: app, config: PACKAGES, base: "main" });
    expect(brief(result.findings)).toEqual([]);
  });

  it("counts only a version that goes up, and only names in the front matter", async () => {
    const root = makeApp(null, CLEAN);
    commit(root, "init", "-q", "-b", "main");
    commit(root, "add", "-A");
    commit(root, "commit", "-qm", "base");
    commit(root, "checkout", "-qb", "work");
    writeFileSync(path.join(root, "packages/os/src/read.ts"), "export const read = () => 4;\n");
    writeFileSync(path.join(root, "packages/os/package.json"), JSON.stringify({ ...PKG, version: "0.0.9" }));
    execFileSync("mkdir", ["-p", path.join(root, ".changeset")]);
    writeFileSync(path.join(root, ".changeset/other.md"), '---\n"@acme/other": patch\n---\n\nAlso touches "@acme/os".\n');
    clearLocalPackagesCache();
    const result = await runDoctor({ root, config: PACKAGES, base: "main" });
    expect(brief(result.findings)).toEqual(["package-unversioned-change packages/os/package.json"]);
  });
});

describe("Flare's review: false positives and spec", () => {
  const run = (extra: Record<string, string>, config: DoctorConfig = PACKAGES) => runDoctor({ root: makeApp(null, { ...CLEAN, ...extra }), config });

  it("a doctor run survives a nameless or broken package folder", async () => {
    const result = await run({ "packages/nameless/package.json": "{}", "packages/broken/package.json": "{ nope" }, {});
    expect(result.findings.filter((f) => f.rule === "plugin-error")).toEqual([]);
  });

  it("package.json #imports and the package's own tsconfig paths are internal", async () => {
    const pkg = { ...PKG, imports: { "#internal/*": "./src/internal/*.ts" } };
    const result = await run({
      "packages/os/package.json": JSON.stringify(pkg),
      "packages/os/tsconfig.json": '{ // comments are fine\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], "~app/*": ["../../src/*"] } } }',
      "packages/os/src/index.ts": 'import { a } from "#internal/a";\nimport { b } from "@/read";\nimport { c } from "~app/c";\nexport { a, b, c };\n',
    });
    expect(brief(result.findings)).toEqual(["package-app-import packages/os/src/index.ts ~app/c"]);
  });

  it("a multi-line type-only import isn't a dependency", async () => {
    const result = await run({ "packages/os/src/index.ts": 'import type {\n  A,\n  B,\n} from "zod";\nexport type { A, B };\n' });
    expect(brief(result.findings)).toEqual([]);
  });

  it("doesn't follow symlinks, so a loop can't fail the run", async () => {
    const root = makeApp(null, CLEAN);
    mkdirSync(path.join(root, "packages/os/src/deep"), { recursive: true });
    symlinkSync(path.join(root, "packages/os/src"), path.join(root, "packages/os/src/deep/loop"));
    const result = await runDoctor({ root, config: PACKAGES });
    expect(result.findings.filter((f) => f.rule === "plugin-error")).toEqual([]);
  });

  it("flags a missing export, an invalid block, untagged tests and an untested migration outside a block", async () => {
    const pkg = { ...PKG, exports: { ".": "./src/index.ts", "./gone": "./src/gone.ts", "./built": "./dist/x.js" }, genesis: { blocks: { BadId: {} } } };
    const result = await run({
      "packages/os/package.json": JSON.stringify(pkg),
      "packages/os/src/read.test.ts": 'import { read } from "./read";\nexport { read };\n',
      "packages/os/migrations/0002_acme_extra.sql": "select 1;\n",
    });
    expect([...new Set(brief(result.findings))].sort()).toEqual(
      [
        "package-block-invalid packages/os/package.json BadId",
        "package-export-missing packages/os/package.json ./src/gone.ts",
        "package-migration-test packages/os/migrations/0002_acme_extra.sql 0002_acme_extra.sql",
        "package-untagged-tests packages/os",
      ].sort(),
    );
  });

  it("the gate warns (fails only --strict), and wants a Features: line in the changeset", async () => {
    const root = makeApp(null, CLEAN);
    const g = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-qm", "base");
    g("checkout", "-qb", "work");
    writeFileSync(path.join(root, "packages/os/src/read.ts"), "export const read = () => 5;\n");
    let result = await runDoctor({ root, config: PACKAGES, base: "main" });
    expect([result.ok, result.findings.find((f) => f.rule === "package-unversioned-change")?.level]).toEqual([true, "warn"]);
    expect((await runDoctor({ root, config: PACKAGES, base: "main", strict: true })).ok).toBe(false);
    mkdirSync(path.join(root, ".changeset"));
    writeFileSync(path.join(root, ".changeset/os.md"), '---\n"@acme/os": patch\n---\n\nFaster.\n');
    result = await runDoctor({ root, config: PACKAGES, base: "main" });
    expect(result.findings.filter((f) => f.rule === "package-unversioned-change").map((f) => f.message)).toEqual([expect.stringMatching(/no "Features:" line/)]);
    writeFileSync(path.join(root, ".changeset/os.md"), '---\n"@acme/os": patch\n---\n\nFaster.\n\nFeatures: team-scorecard\n');
    result = await runDoctor({ root, config: PACKAGES, base: "main" });
    expect(brief(result.findings)).toEqual([]);
  });
});

describe("Flare's second follow-ups", () => {
  const commit = (root: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });

  it("a nested app's gate sees a package at the repository root", async () => {
    const repo = makeApp(null, {});
    for (const [rel, text] of Object.entries(CLEAN)) {
      const target = rel.startsWith("packages/") ? path.join(repo, rel) : path.join(repo, "apps/mobile", rel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, rel === "genesis.config.json" ? JSON.stringify({ localPackages: ["../../packages/*"] }) : text);
    }
    commit(repo, "init", "-q", "-b", "main");
    commit(repo, "add", "-A");
    commit(repo, "commit", "-qm", "base");
    commit(repo, "checkout", "-qb", "work");
    writeFileSync(path.join(repo, "packages/os/src/read.ts"), "export const read = () => 9;\n");
    clearLocalPackagesCache();
    const result = await runDoctor({ root: path.join(repo, "apps/mobile"), config: PACKAGES, base: "main" });
    expect(brief(result.findings)).toEqual(["package-unversioned-change ../../packages/os/package.json"]);
  });

  it("an export type without a semicolon doesn't hide the import after it", async () => {
    const result = await runDoctor({
      root: makeApp(null, { ...CLEAN, "packages/os/src/index.ts": 'export type A = string\nimport dayjs from "dayjs";\nexport { dayjs };\n' }),
      config: PACKAGES,
    });
    expect(brief(result.findings)).toEqual(["package-undeclared-dependency packages/os/src/index.ts dayjs"]);
  });

  it("leaves .js and declaration-file export targets alone (unbuilt output)", async () => {
    const pkg = { ...PKG, exports: { ".": { types: "./dist/index.d.ts", default: "./src/index.ts" }, "./lib": "./lib/index.js", "./m": { types: "./dist/m.d.mts" } } };
    const result = await runDoctor({ root: makeApp(null, { ...CLEAN, "packages/os/package.json": JSON.stringify(pkg) }), config: PACKAGES });
    expect(brief(result.findings)).toEqual([]);
  });

  it("refuses a localPackages entry that leaves the repository", async () => {
    const outer = makeApp(null, {});
    const repo = path.join(outer, "repo");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(outer, "elsewhere/pkg"), { recursive: true });
    writeFileSync(path.join(outer, "elsewhere/pkg/package.json"), JSON.stringify({ name: "@acme/elsewhere" }));
    writeFileSync(path.join(repo, "genesis.config.json"), JSON.stringify({ localPackages: ["../elsewhere/*"] }));
    clearLocalPackagesCache();
    const result = await runDoctor({ root: repo, config: PACKAGES });
    expect(result.findings.filter((f) => f.rule === "package-block-invalid").map((f) => f.message)).toEqual([expect.stringMatching(/outside the repository/)]);
  });
});

describe("registry changes from a nested app", () => {
  it("counts a change to the repository root's features.ts", async () => {
    const repo = makeApp(null, {});
    const g = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, stdio: "pipe" });
    for (const [rel, text] of Object.entries(CLEAN)) {
      const target = rel.startsWith("packages/") ? path.join(repo, rel) : path.join(repo, "apps/mobile", rel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, rel === "genesis.config.json" ? JSON.stringify({ localPackages: ["../../packages/*"] }) : text);
    }
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src/features.ts"), "export const features = {};\n");
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-qm", "base");
    g("checkout", "-qb", "work");
    writeFileSync(path.join(repo, "packages/os/package.json"), JSON.stringify({ ...PKG, version: "0.2.0", exports: { ".": "./src/index.ts" } }));
    mkdirSync(path.join(repo, ".changeset"), { recursive: true });
    writeFileSync(path.join(repo, ".changeset/os.md"), '---\n"@acme/os": minor\n---\n\nExports.\n\nFeatures: team-scorecard\n');
    writeFileSync(path.join(repo, "src/features.ts"), "export const features = { changed: true };\n");
    clearLocalPackagesCache();
    const result = await runDoctor({ root: path.join(repo, "apps/mobile"), config: PACKAGES, base: "main" });
    expect(result.findings.filter((f) => /features\.ts didn't/.test(f.message))).toEqual([]);
  });
});
