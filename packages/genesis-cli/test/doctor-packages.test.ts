// @feat:local-packages
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
    writeFileSync(path.join(root, ".changeset/scorecard.md"), '---\n"@acme/os": patch\n---\n\nScorecard reads twice as fast.\n');
    clearLocalPackagesCache();
    result = await runDoctor({ root, config, base: "main" });
    expect(brief(result.findings)).toEqual(["package-migration-edited packages/os/migrations/0001_acme_scorecard.sql"]);
    // So does a version bump.
    writeFileSync(path.join(root, ".changeset/scorecard.md"), "");
    writeFileSync(path.join(root, "packages/os/package.json"), JSON.stringify({ ...PKG, version: "0.1.1" }));
    result = await runDoctor({ root, config, base: "main" });
    expect(brief(result.findings, "package-unversioned")).toEqual([]);
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

  it("an unavailable base ref is info too, not a guess", async () => {
    const result = await runDoctor({ root: makeApp(null, CLEAN), config: PACKAGES, base: "origin/nope" });
    expect(result.findings.filter((f) => f.rule.startsWith("package-")).map((f) => f.level)).toEqual(["info"]);
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
