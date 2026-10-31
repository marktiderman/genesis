// @feat:cli-migrate
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { planNotificationTypes } from "../src/blocks/notification-types.js";
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

/** JSON safe to embed in generated source: the characters that could end a string or a script are escaped. */
const UNSAFE: Record<string, string> = { "<": "\\u003C", ">": "\\u003E", "/": "\\u002F", "\u2028": "\\u2028", "\u2029": "\\u2029" };
const toCode = (value: unknown) => JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (c) => UNSAFE[c]!);

describe("genesis migrate: notification types", () => {
  const registry = (types: string[]) =>
    `export const notifications = { toTypeRows: () => ${toCode(types.map((key) => ({ key, category: "messages", channels: { in_app: true }, critical: false, transactional: false, email_delay_seconds: 0, secret_link: false, push_privacy: "default", ios_category: null })))} };\n`;
  const notificationsApp = (types: string[], config?: Record<string, unknown>) => {
    const root = makeApp({
      "genesis.lock.json": JSON.stringify({ version: 1, blocks: { notifications: { package: "@marktiderman/genesis-notifications" } }, files: {} }),
      "src/notifications.ts": registry(types),
      ...(config ? { "genesis.config.json": JSON.stringify(config) } : {}),
    });
    linkWorkspacePackage(root, "@marktiderman/genesis-notifications", "notifications");
    return root;
  };
  const OPT_IN = { notifications: { registry: "src/notifications.ts" } };

  it("mirrors the registry's types in an add-and-update migration after the block's own, and again only when they change", async () => {
    const root = notificationsApp(["chat.message", "billing.receipt"], OPT_IN);
    const first = await runMigrate({ root, now: NOW });
    expect(first.written.filter((p) => p.startsWith("supabase/migrations/"))).toEqual([
      "supabase/migrations/20261101120000_genesis_notifications.sql",
      "supabase/migrations/20261101120001_genesis_notification_types.sql",
    ]);
    const sql = read(root, first.notificationTypes!);
    expect(sql).toMatch(/^-- genesis-notification-types: src\/notifications\.ts\n/);
    expect(sql).toContain("insert into public.notification_types as t");
    expect(sql).toContain("on conflict (key) do update");
    // Rows by key, whatever order the registry lists them in.
    expect(sql.indexOf('"billing.receipt"')).toBeLessThan(sql.indexOf('"chat.message"'));
    expect((await runMigrate({ root, now: NOW })).written).toEqual([]);

    writeFileSync(path.join(root, "src/notifications.ts"), registry(["chat.message", "billing.receipt", "it's.new"]));
    const next = await runMigrate({ root, now: NOW });
    expect(next.written).toEqual(["supabase/migrations/20261101120002_genesis_notification_types.sql"]);
    // A quote in a key is a JSON escape, never raw, so the literal stays one string.
    expect(read(root, next.written[0]!)).toContain(`"it\\u0027s.new"`);
  });

  it("never retires a type, so two branches' migrations merged keep both branches' types", async () => {
    const base = notificationsApp(["chat.message"], OPT_IN);
    await runMigrate({ root: base, now: NOW });
    const branch = (type: string, now: Date) => {
      const root = notificationsApp(["chat.message", type], OPT_IN);
      mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
      for (const name of readdirSync(path.join(base, "supabase/migrations"))) writeFileSync(path.join(root, "supabase/migrations", name), read(base, `supabase/migrations/${name}`));
      return runMigrate({ root, now }).then((r) => ({ root, file: r.notificationTypes! }));
    };
    const a = await branch("billing.receipt", new Date("2026-11-02T00:00:00Z"));
    const b = await branch("team.invite", new Date("2026-11-03T00:00:00Z"));
    // Merged: B's migration runs last. It lists only its own types and retires nothing.
    const later = read(b.root, b.file);
    expect(later).not.toContain("billing.receipt");
    expect(later).not.toMatch(/retired_at\s*=\s*now\(\)|genesis_notifications_sync_types|delete /);
    expect(later).toContain("retired_at = null");
    expect(read(a.root, a.file)).toContain('"billing.receipt"');
  });

  it("compares the payload only: moving the registry file writes nothing new", async () => {
    const root = notificationsApp(["chat.message"], OPT_IN);
    await runMigrate({ root, now: NOW });
    writeFileSync(path.join(root, "src/registry.ts"), registry(["chat.message"]));
    expect((await runMigrate({ root, now: NOW, notifications: "src/registry.ts" })).written).toEqual([]);
  });

  it("loads app code only when asked, never on a dry run, and resolves --notifications against the app's root", async () => {
    // Not named: not loaded, reported as not checked.
    const quiet = notificationsApp(["chat.message"]);
    writeFileSync(path.join(quiet, "src/notifications.ts"), 'throw new Error("must not run");\n');
    const unnamed = await runMigrate({ root: quiet, now: NOW });
    expect(unnamed.notificationTypes).toBeUndefined();
    expect(unnamed.warnings.join("\n")).toMatch(/Notification types: not checked\. Name the defineNotifications registry/);
    // A dry run never loads it, even when named.
    const dry = await runMigrate({ root: quiet, now: NOW, dryRun: true, notifications: "src/notifications.ts" });
    expect(dry.notificationTypes).toBeUndefined();
    expect(dry.warnings.join("\n")).toMatch(/not checked on a dry run/);
    // An absolute path works; a relative one is the app root's.
    const root = notificationsApp(["chat.message"]);
    const absolute = await runMigrate({ root, now: NOW, notifications: path.join(root, "src/notifications.ts") });
    expect(read(root, absolute.notificationTypes!)).toMatch(/^-- genesis-notification-types: src\/notifications\.ts\n/);
    expect((await runMigrate({ root, now: NOW, notifications: "src/missing.ts" })).warnings.join("\n")).toMatch(/resolved against the app's root/);
    writeFileSync(path.join(root, "src/nothing.ts"), "export const nothing = 1;\n");
    expect((await runMigrate({ root, now: NOW, notifications: "src/nothing.ts" })).warnings.join("\n")).toMatch(/exports no defineNotifications registry/);
    // No notifications block: nothing to mirror, nothing said.
    expect((await runMigrate({ root: makeApp(), now: NOW })).warnings.join("\n")).not.toMatch(/Notification types/);
  });

  it("warns instead of failing when no timestamp fits, and keeps newlines out of the header", async () => {
    const root = notificationsApp(["chat.message"]);
    writeFileSync(path.join(root, "src/odd\nname.ts"), registry(["chat.message"]));
    const ok = await runMigrate({ root, now: NOW, notifications: "src/odd\nname.ts" });
    expect(read(root, ok.notificationTypes!).split("\n")[0]).toBe("-- genesis-notification-types: src/odd name.ts");
    // A file that would sort after any new timestamp: a warning, not a crash.
    writeFileSync(path.join(root, "src/notifications.ts"), registry(["chat.message", "team.invite"]));
    const blocked = await planNotificationTypes(root, { registry: "src/notifications.ts", now: NOW, pending: ["9_late.sql"] });
    expect(blocked.create).toBeUndefined();
    expect(blocked.warnings.join("\n")).toMatch(/Notification types: no migration written \(.*sort after/);
  });
});
