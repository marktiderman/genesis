// @feat:cli-migrate
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { applyMigrationPlan, formatMigrationRows, nextTimestamps, planMigrations } from "../src/blocks/migrations.js";
import { expoApp, fixturePackage, linkWorkspacePackage, makeApp, NOW, read, snapshot, SQL_A, SQL_B } from "./blocks-helpers.js";

const migrations = (root: string) => readdirSync(path.join(root, "supabase/migrations")).sort();

async function appWithBlock(firstOnly = false) {
  const root = expoApp();
  linkWorkspacePackage(root, "@marktiderman/genesis-features", "features");
  fixturePackage(root, firstOnly ? { migrations: [{ file: "migrations/0001_fixture_notes.sql" }] } : {});
  await runAdd({ root, block: "fixture-notes", yes: true, install: false, featuresBuild: false, now: NOW });
  return root;
}

describe("genesis migrate", () => {
  it("reports every copy current, and writes nothing, right after add", async () => {
    const root = await appWithBlock();
    const before = snapshot(root);
    const report = await runMigrate({ root, now: new Date("2026-12-01T00:00:00Z") });
    expect(report.plan.rows.map((r) => r.state)).toEqual(["current", "current"]);
    expect(report.written).toEqual([]);
    expect(report.attention).toBe(false);
    expect(snapshot(root)).toEqual(before);
  });

  it("copies a migration a newer package added, after every existing one", async () => {
    const root = await appWithBlock(true);
    fixturePackage(root); // the package now also ships 0002
    const report = await runMigrate({ root, now: new Date("2026-01-01T00:00:00Z") });
    // "now" is before the copies already there: the new file still sorts after them.
    // 0001's test isn't copied now: a test only comes with its migration.
    expect(report.written).toEqual(["supabase/migrations/20261101120001_fixture_notes_body.sql"]);
    expect(migrations(root).at(-1)).toBe("20261101120001_fixture_notes_body.sql");
    expect(read(root, "supabase/migrations/20261101120001_fixture_notes_body.sql").endsWith(SQL_B)).toBe(true);
    // Run again: nothing new.
    expect((await runMigrate({ root })).written).toEqual([]);
  });

  it("refuses to rewrite a copy edited in the app; --forward adds a forward migration and leaves the copy", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const edited = read(root, copy).replace("primary key", "primary key, extra int");
    writeFileSync(path.join(root, copy), edited);
    const report = await runMigrate({ root });
    expect(report.plan.rows[0]).toMatchObject({ state: "edited", copy });
    expect(report.attention).toBe(true);
    expect(report.written).toEqual([]);
    const forward = await runMigrate({ root, forward: true, now: NOW });
    expect(read(root, copy)).toBe(edited);
    expect(forward.written).toEqual(["supabase/migrations/20261101120002_fixture_notes_forward.sql"]);
    expect(read(root, forward.written[0]!)).toMatch(/^-- genesis-forward: [^\n]+\n-- Forward migration for @marktiderman\/genesis-fixture migrations\/0001_fixture_notes\.sql/);
  });

  it("reports a copy deleted in the app, and never copies it again", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    expect(JSON.parse(read(root, "genesis.lock.json")).migrations).toMatchObject({ "@marktiderman/genesis-fixture:migrations/0001_fixture_notes.sql": copy });
    rmSync(path.join(root, copy));
    const report = await runMigrate({ root, now: NOW });
    expect(report.plan.rows[0]).toMatchObject({ state: "deleted", copy });
    expect(formatMigrationRows(report.plan.rows)).toMatch(/^! deleted +@marktiderman\/genesis-fixture migrations\/0001_fixture_notes\.sql/);
    expect(report.written).toEqual([]);
    expect(migrations(root)).not.toContain("20261101120000_fixture_notes.sql");
  });

  it("remembers copies an older lock didn't record, so deleting one later is noticed", async () => {
    const root = await appWithBlock();
    const lock = JSON.parse(read(root, "genesis.lock.json"));
    delete lock.migrations;
    writeFileSync(path.join(root, "genesis.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    await runMigrate({ root });
    expect(Object.keys(JSON.parse(read(root, "genesis.lock.json")).migrations)).toHaveLength(2);
  });

  it("refuses to rewrite a copy whose package migration changed upstream", async () => {
    const root = await appWithBlock();
    fixturePackage(root, {}, { "migrations/0001_fixture_notes.sql": `${SQL_A}-- changed upstream\n` });
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const before = read(root, copy);
    const report = await runMigrate({ root });
    expect(report.plan.rows[0]).toMatchObject({ state: "changed-upstream", copy });
    expect(read(root, copy)).toBe(before);
  });

  it("knows copies made before headers by name and text, and treats other text under that name as the app's", async () => {
    const root = makeApp({ "supabase/migrations/20260101000000_fixture_notes.sql": SQL_A, "supabase/migrations/20260101000100_fixture_notes_body.sql": "-- mine\n" });
    fixturePackage(root);
    const report = await runMigrate({ root, blocks: ["fixture-notes"] });
    expect(report.plan.rows.map((r) => [r.file, r.state])).toEqual([
      ["migrations/0001_fixture_notes.sql", "current"],
      ["migrations/0002_fixture_notes_body.sql", "differs"],
    ]);
    expect(read(root, "supabase/migrations/20260101000100_fixture_notes_body.sql")).toBe("-- mine\n");
  });

  it("never overwrites: a planned file that appears before it is written fails loudly", () => {
    const root = makeApp({ "supabase/migrations/20260101000000_init.sql": "select 1;\n" });
    const plan = planMigrations(root, [{ package: "@marktiderman/genesis-fixture", file: "migrations/0001_fixture_notes.sql", source: SQL_A }], { now: NOW });
    writeFileSync(path.join(root, plan.creates[0]!.path), "-- someone else's\n");
    expect(() => applyMigrationPlan(root, plan)).toThrow(/EEXIST/);
    expect(read(root, plan.creates[0]!.path)).toBe("-- someone else's\n");
  });

  it("orders new timestamps after the latest existing one, and refuses names that would sort after them", () => {
    expect(nextTimestamps(["20261231235959_x.sql"], NOW, 2)).toEqual(["20270101000000", "20270101000001"]);
    expect(nextTimestamps([], NOW, 1)).toEqual(["20261101120000"]);
    expect(() => nextTimestamps(["9_late.sql"], NOW, 1)).toThrow(/sort after/);
  });
});
