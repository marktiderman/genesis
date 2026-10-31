// @feat:cli-migrate
import { readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { applyMigrationPlan, nextTimestamps, planMigrations } from "../src/blocks/migrations.js";
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

describe("genesis migrate: notification types", () => {
  const registry = (types: string[]) =>
    `export const notifications = { toTypeRows: () => ${JSON.stringify(types.map((key) => ({ key, category: "messages", channels: { in_app: true }, critical: false, transactional: false, email_delay_seconds: 0, secret_link: false, push_privacy: "default", ios_category: null })))} };\n`;
  const notificationsApp = (types: string[]) => {
    const root = makeApp({
      "genesis.lock.json": JSON.stringify({ version: 1, blocks: { notifications: { package: "@marktiderman/genesis-notifications" } }, files: {} }),
      "src/notifications.ts": registry(types),
    });
    linkWorkspacePackage(root, "@marktiderman/genesis-notifications", "notifications");
    return root;
  };

  it("mirrors the registry's types in a migration after the block's own, and again only when they change", async () => {
    const root = notificationsApp(["chat.message", "billing.receipt"]);
    const first = await runMigrate({ root, now: NOW });
    expect(first.written).toEqual([
      "supabase/migrations/20261101120000_genesis_notifications.sql",
      "supabase/tests/database/genesis_notifications.test.sql",
      "supabase/migrations/20261101120001_genesis_notification_types.sql",
    ]);
    const sql = read(root, first.notificationTypes!);
    expect(sql).toMatch(/^-- genesis-notification-types: src\/notifications\.ts\n/);
    expect(sql).toContain("select public.genesis_notifications_sync_types('[");
    // Rows by key, whatever order the registry lists them in.
    expect(sql.indexOf('"billing.receipt"')).toBeLessThan(sql.indexOf('"chat.message"'));
    expect((await runMigrate({ root, now: NOW })).written).toEqual([]);

    writeFileSync(path.join(root, "src/notifications.ts"), registry(["chat.message", "billing.receipt", "it's.new"]));
    const dry = await runMigrate({ root, now: NOW, dryRun: true });
    expect(dry).toMatchObject({ written: [], notificationTypes: "supabase/migrations/20261101120002_genesis_notification_types.sql" });
    const next = await runMigrate({ root, now: NOW });
    expect(next.written).toEqual(["supabase/migrations/20261101120002_genesis_notification_types.sql"]);
    // A quote in a key is doubled, so the literal stays one string.
    expect(read(root, next.written[0]!)).toContain(`"it''s.new"`);
  });

  it("warns, and writes no types migration, when it can't find the registry; --notifications names it", async () => {
    const root = notificationsApp(["chat.message"]);
    writeFileSync(path.join(root, "src/notifications.ts"), "export const nothing = 1;\n");
    const report = await runMigrate({ root, now: NOW, dryRun: true });
    expect(report.notificationTypes).toBeUndefined();
    expect(report.warnings.join("\n")).toMatch(/exports no defineNotifications registry/);
    writeFileSync(path.join(root, "src/registry.ts"), registry(["chat.message"]));
    expect((await runMigrate({ root, now: NOW, dryRun: true, notifications: "src/registry.ts" })).notificationTypes).toMatch(/_genesis_notification_types\.sql$/);
    // No notifications block: nothing to mirror.
    expect((await runMigrate({ root: makeApp(), now: NOW, dryRun: true })).notificationTypes).toBeUndefined();
  });
});
