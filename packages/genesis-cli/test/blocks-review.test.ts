// @feat:cli-migrate @feat:cli-upgrade
// Regressions for the adversarial review of the block commands: each case is one way an
// applied migration, a file the app owns or the repository itself could have been damaged.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { sha256 } from "../src/blocks/files.js";
import { writeLock } from "../src/blocks/lock.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { nextStamp, nextTimestamps } from "../src/blocks/migrations.js";
import { bumpPackageJson } from "../src/upgrade/bump-core.mjs";
import { runUpgrade } from "../src/upgrade/index.js";
import { expoApp, fakePackage, fixturePackage, linkWorkspacePackage, makeApp, NOW, read, snapshot, SQL_A } from "./blocks-helpers.js";

const migrations = (root: string) => readdirSync(path.join(root, "supabase/migrations")).sort();

async function added() {
  const root = expoApp();
  linkWorkspacePackage(root, "@marktiderman/genesis-features", "features");
  fixturePackage(root);
  await runAdd({ root, block: "fixture-notes", yes: true, install: false, featuresBuild: false, now: NOW });
  return root;
}

describe("migrations after review", () => {
  it("doesn't copy a migration again when the package renumbered or moved it", async () => {
    const root = await added();
    const before = migrations(root);
    fixturePackage(root, { migrations: [{ file: "migrations/0007_fixture_notes.sql" }, { file: "migrations/0002_fixture_notes_body.sql" }] }, { "migrations/0007_fixture_notes.sql": SQL_A });
    const report = await runMigrate({ root });
    expect(report.written).toEqual([]);
    expect(migrations(root)).toEqual(before);
    expect(report.plan.rows[0]).toMatchObject({ file: "migrations/0007_fixture_notes.sql", state: "current" });
    expect(report.plan.rows[0]!.detail).toMatch(/renamed or moved upstream/);
  });

  it("treats CRLF line endings as the same text", async () => {
    const root = await added();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    writeFileSync(path.join(root, copy), read(root, copy).replace(/\n/g, "\r\n"));
    const report = await runMigrate({ root });
    expect(report.plan.rows[0]).toMatchObject({ state: "current" });
    expect(report.attention).toBe(false);
  });

  it("never picks a timestamp before an existing one, even when the latest isn't a real date", () => {
    expect(nextStamp("20990100000000")).toBe("20990100000001");
    expect(nextStamp("20991000000000")).toBe("20991000000001");
    expect(nextStamp("20261231235959")).toBe("20270101000000");
    expect(() => nextStamp("99999999999999")).toThrow(/No 14-digit timestamp/);
    expect(nextTimestamps(["20990100000000_future.sql"], NOW, 2)).toEqual(["20990100000001", "20990100000002"]);
  });

  it("writes one forward migration, then counts the copy as handled", async () => {
    const root = await added();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    writeFileSync(path.join(root, copy), `${read(root, copy)}-- mine\n`);
    expect((await runMigrate({ root, forward: true, now: NOW })).written).toHaveLength(1);
    const again = await runMigrate({ root, forward: true, now: NOW });
    expect(again.written).toEqual([]);
    expect(again.attention).toBe(false);
    expect(again.plan.rows[0]!.forward).toMatch(/_fixture_notes_forward\.sql$/);
  });

  it("doesn't bring back a pgTAP test the app deleted", async () => {
    const root = await added();
    rmSync(path.join(root, "supabase/tests/database/fixture_notes.test.sql"));
    const report = await runMigrate({ root });
    expect(report.written).toEqual([]);
  });

  it("refuses a symlink in the migrations folder rather than guess where it sorts", async () => {
    const root = await added();
    symlinkSync(path.join(root, "features.ts"), path.join(root, "supabase/migrations/29990101000000_link.sql"));
    await expect(runMigrate({ root })).rejects.toThrow(/symlink/);
  });
});

describe("genesis.lock.json is checked like a manifest", () => {
  const lookup = { release: () => ({ version: "2.0.0", packages: {} }), latest: () => null };

  it("never writes .git or an applied migration, whatever the lock says", async () => {
    const root = makeApp({ ".git/description": "Unnamed repository\n", "supabase/migrations/20260101000000_init.sql": "create table t (id int);\n" });
    fakePackage(root, "@marktiderman/genesis-fixture", {}, { "functions/x/index.ts": "-- PWNED\n", "migrations/tests/0001_x.test.sql": "-- PWNED\n" });
    writeLock(root, {
      version: 1,
      blocks: {},
      files: {
        ".git/description": { source: "@marktiderman/genesis-fixture:functions/x/index.ts", sha256: sha256("Unnamed repository\n") },
        "supabase/migrations/20260101000000_init.sql": { source: "@marktiderman/genesis-fixture:migrations/tests/0001_x.test.sql", sha256: sha256("create table t (id int);\n") },
        "README.md": { source: "@marktiderman/genesis-fixture:functions/x/index.ts", sha256: sha256("") },
      },
    });
    const before = snapshot(root);
    const report = await runUpgrade({ root, lookup, install: false, doctor: false });
    expect(report.refreshed.map((r) => r.outcome)).toEqual(["refused", "refused", "refused"]);
    expect(snapshot(root)).toEqual({ ...before, "genesis.lock.json": before["genesis.lock.json"] });
  });

  it("refuses substitutions that aren't the starter's names", async () => {
    const root = makeApp();
    writeLock(root, { version: 1, substitutions: { create: "PWNED" }, blocks: {}, files: {} });
    await expect(runUpgrade({ root, lookup, install: false, doctor: false })).rejects.toThrow(/substitution "create"/);
  });

  it("--pr refuses a dirty tree before writing anything", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "x", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0" } }) });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
    const before = snapshot(root);
    await expect(runUpgrade({ root, lookup: { release: () => ({ version: "2.0.0", packages: { "@marktiderman/genesis-fixture": "1.2.0" } }), latest: () => null }, install: false, doctor: false, pr: true })).rejects.toThrow(/clean working tree/);
    expect(read(root, "package.json")).toBe(before["package.json"]);
  });
});

describe("the bump after review", () => {
  it("never writes a release's non-version (a range or a tag)", () => {
    const text = JSON.stringify({ dependencies: { "@marktiderman/genesis-ui": "1.2.0", "@marktiderman/genesis-core": "^1.0.0" } });
    const result = bumpPackageJson("package.json", text, (n) => (n === "@marktiderman/genesis-ui" ? "v1.0.0" : "^1.3.0"));
    expect(result.text).toBeNull();
    expect(result.skipped.map((s) => s.why)).toEqual(['the release names "v1.0.0", not a version', 'the release names "^1.3.0", not a version']);
  });
});
