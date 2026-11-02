// @feat:init-native-template @feat:cli-migrate @feat:cli-add @feat:cli-upgrade
/**
 * A phone app beside a web app: `mobile/` (made with `genesis init --template native --beside
 * ../app`) has no Supabase project of its own and uses `app/`'s database, whose supabase/ is the
 * only migrations folder. And overlapping migrations: notifications 0001 adopts the push tables
 * of supabase 0005, so 0005 is never planned once 0001 is in.
 */
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { databaseElsewhere, orderForAdding } from "../src/blocks/database.js";
import { catalogBlocks } from "../src/blocks/discover.js";
import { sha256 } from "../src/blocks/files.js";
import { besideConfig, runInitNative } from "../src/blocks/init-native.js";
import { readLock, writeLock } from "../src/blocks/lock.js";
import { parseManifest } from "../src/blocks/manifest.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { migrationHeader, planMigrations, type SourceMigration } from "../src/blocks/migrations.js";
import { GenesisConfigError, validateSupabase } from "../src/doctor/config.js";
import { runDoctor } from "../src/doctor/index.js";
import { runUpgrade } from "../src/upgrade/index.js";
import { linkWorkspacePackage, NOW, PACKAGES, snapshot, tempDir, writeTree } from "./blocks-helpers.js";

const SUPABASE = "@marktiderman/genesis-supabase";
const NOTIFICATIONS = "@marktiderman/genesis-notifications";
const shipped = (folder: string, file: string) => readFileSync(path.join(PACKAGES, folder, file), "utf8");

/** `app/`: a web app with supabase/, the notifications migration copied in, and its lock. `mobile/`: the phone app beside it. */
async function twoApps(options: { without?: string[] } = {}) {
  const root = tempDir("genesis-two-apps-");
  const app = path.join(root, "app");
  const notifications = shipped("notifications", "migrations/0001_genesis_notifications.sql");
  writeTree(app, {
    "package.json": JSON.stringify({ name: "sample-web", dependencies: { [NOTIFICATIONS]: "^0.4.0", [SUPABASE]: "^0.11.0" } }, null, 2) + "\n",
    "supabase/config.toml": 'project_id = "sample-web"\n',
    "supabase/functions/genesis-notifications/index.ts": "// the notifications runner\n",
    "supabase/migrations/20261001000000_genesis_notifications.sql": migrationHeader(NOTIFICATIONS, "migrations/0001_genesis_notifications.sql", notifications) + notifications,
  });
  writeLock(app, { version: 1, blocks: { notifications: { package: NOTIFICATIONS } }, files: {}, migrations: { [`${NOTIFICATIONS}:migrations/0001_genesis_notifications.sql`]: "supabase/migrations/20261001000000_genesis_notifications.sql" } });
  for (const [name, folder] of [[NOTIFICATIONS, "notifications"], [SUPABASE, "supabase"], ["@marktiderman/genesis-native", "native"], ["@marktiderman/genesis-features", "features"]] as const) linkWorkspacePackage(app, name, folder);
  const mobile = path.join(root, "mobile");
  const result = await runInitNative({ name: "sample-app", target: mobile, bundleId: "com.acmeco.sampleapp", beside: app, ...(options.without ? { without: options.without } : {}) });
  return { root, app, mobile, result };
}

describe("genesis init --template native --beside <web-app>", () => {
  it("writes no Supabase files, says where the database lives, and records the blocks for the web app", async () => {
    const { mobile, result } = await twoApps();
    const files = snapshot(mobile);
    expect(Object.keys(files).filter((f) => f.startsWith("supabase/"))).toEqual([]);
    // The database CI workflow is the web app's.
    expect(files[".github/workflows/database.yml"]).toBeUndefined();
    const config = JSON.parse(files["genesis.config.json"]!);
    expect(config.supabase).toMatchObject({ app: "../app" });
    expect(config.doctor.packs).toEqual(["native"]);
    expect(config.doctor.supabase).toBeUndefined();
    const lock = readLock(mobile);
    expect(Object.keys(lock.files).filter((f) => f.startsWith("supabase/"))).toEqual([]);
    expect(lock.migrations).toBeUndefined();
    // Every block the starter carries that is on: recorded here, so it can be added there.
    expect(Object.keys(lock.blocks).sort()).toEqual(["account", "app-updates", "chat", "notifications", "push", "support-feedback"]);
    // The web app has notifications' 0001, which provides push's 0005 and supersedes its sender, so
    // push needs nothing there; the rest are what to add there, database only, in one line.
    expect(result.beside).toMatchObject({ app: "../app", shared: true });
    expect([...result.beside!.missing].sort()).toEqual(["account", "app-updates", "chat", "support-feedback"]);
    expect(result.beside!.line).toBe(`In ../app (it holds this app's database), run: ${result.beside!.missing.map((id) => `genesis add ${id} --database-only`).join(" && ")}`);
    expect(result.steps[0]).toBe(result.beside!.line);
    expect(files["README.md"]).toContain("The database is ../app's");
  });

  it("keeps the app's own supabase/ when the web app has none", async () => {
    const root = tempDir("genesis-two-apps-");
    writeTree(path.join(root, "web"), { "package.json": "{}\n" });
    const result = await runInitNative({ name: "sample-app", target: path.join(root, "mobile"), beside: path.join(root, "web") });
    expect(result.beside).toMatchObject({ app: "../web", shared: false, missing: [] });
    expect(existsSync(path.join(root, "mobile", "supabase", "migrations"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(root, "mobile", "genesis.config.json"), "utf8")).supabase).toBeUndefined();
  });

  it("in mobile/, migrate, add and upgrade plan no Supabase writes and point at ../app", async () => {
    const { mobile } = await twoApps();
    const before = snapshot(mobile);

    const migrate = await runMigrate({ root: mobile, now: NOW });
    expect(migrate.plan).toEqual({ rows: [], creates: [] });
    expect(migrate.written).toEqual([]);
    expect(migrate.attention).toBe(false);
    expect(migrate.elsewhere?.note).toMatch(/live in \.\.\/app\/supabase .*run genesis migrate in \.\.\/app/);
    expect(migrate.elsewhere?.missing).toContain("chat");
    expect(migrate.elsewhere?.missing).not.toContain("push");
    expect(migrate.elsewhere?.note).toContain("genesis add chat --database-only");
    expect(snapshot(mobile)).toEqual(before);

    const add = await runAdd({ root: mobile, block: "push", dryRun: true, install: false, featuresBuild: false, now: NOW });
    expect(add.migrations).toEqual({ rows: [], creates: [] });
    expect(add.steps.some((s) => s.includes("../app already has every one of its migrations and Edge Functions"))).toBe(true);
    const chat = await runAdd({ root: mobile, block: "chat", dryRun: true, install: false, featuresBuild: false, now: NOW });
    expect(chat.steps.some((s) => s.includes("genesis add chat --database-only there"))).toBe(true);
    expect(add.steps.some((s) => /supabase (functions deploy|secrets set)/.test(s))).toBe(false);

    const upgrade = await runUpgrade({ root: mobile, lookup: { release: () => ({ version: "9.9.9", packages: {} }), latest: () => null }, dryRun: true, install: false, doctor: false });
    // Still listed, to apply where the database is.
    expect(upgrade.newMigrations).toContain(`@marktiderman/genesis-chat migrations/0001_genesis_chat.sql (apply in ../app: genesis add chat --database-only)`);
    expect(upgrade.newMigrations.some((m) => m.includes("0005_genesis_push"))).toBe(false);
    expect(upgrade.summary).toContain("New package migrations (in ../app, not here):");
    expect([...upgrade.files, ...upgrade.added].filter((f) => f.startsWith("supabase/"))).toEqual([]);
    expect(upgrade.summary).toContain("Database files: This app's database files live in ../app/supabase");
    expect(snapshot(mobile)).toEqual(before);
  });

  it("leaves lock entries under supabase/ alone in upgrade, and the doctor says they can go", async () => {
    const { mobile } = await twoApps();
    const lock = readLock(mobile);
    // An app that had its own supabase/ before the setting: the entries stay, the files are gone.
    lock.files["supabase/functions/genesis-push-send/index.ts"] = { source: `${SUPABASE}:functions/genesis-push-send/index.ts`, sha256: sha256("old") };
    writeLock(mobile, lock);
    const upgrade = await runUpgrade({ root: mobile, lookup: { release: () => ({ version: "9.9.9", packages: {} }), latest: () => null }, install: false, doctor: false });
    expect(upgrade.refreshed.map((r) => r.path)).not.toContain("supabase/functions/genesis-push-send/index.ts");
    expect(existsSync(path.join(mobile, "supabase"))).toBe(false);
    expect(upgrade.summary).toContain("still lists 1 file under supabase/");
    symlinkSync(path.join(PACKAGES, "..", "apps", "genesis-rn-starter", "node_modules"), path.join(mobile, "node_modules"), "dir");
    const doctor = await runDoctor({ root: mobile, contracts: false });
    const lockFindings = doctor.findings.filter((f) => f.rule === "lock-files");
    expect(lockFindings.map((f) => `${f.level} ${f.subject}`)).toEqual(["info supabase/"]);
  });

  it("the doctor is clean in mobile/: no supabase pack, no missing-supabase or lock-files warnings", async () => {
    const { mobile } = await twoApps({ without: ["chat", "support", "updates"] });
    symlinkSync(path.join(PACKAGES, "..", "apps", "genesis-rn-starter", "node_modules"), path.join(mobile, "node_modules"), "dir");
    const doctor = await runDoctor({ root: mobile, contracts: false });
    expect(doctor.errors).toBe(0);
    expect(doctor.ok).toBe(true);
    const warnings = doctor.findings.filter((f) => f.level !== "info");
    expect(warnings.map((f) => f.rule)).toEqual(["eas-placeholder", "eas-placeholder", "eas-placeholder"]);
    expect(doctor.findings.filter((f) => ["lock-files", "database-elsewhere"].includes(f.rule) || f.rule.startsWith("migration-"))).toEqual([]);
  });

  it("the doctor warns when supabase.app holds no supabase folder, and when a second copy is left here", async () => {
    const root = tempDir("genesis-two-apps-");
    writeTree(root, {
      "mobile/package.json": "{}\n",
      "mobile/genesis.config.json": JSON.stringify({ doctor: { packs: ["native", "supabase"] }, supabase: { app: "../web" } }),
      "mobile/supabase/migrations/20260101000000_x.sql": "create table public.x (id int);\n",
      "web/package.json": "{}\n",
    });
    symlinkSync(path.join(PACKAGES, "..", "apps", "genesis-rn-starter", "node_modules"), path.join(root, "mobile", "node_modules"), "dir");
    const doctor = await runDoctor({ root: path.join(root, "mobile"), contracts: false });
    expect(doctor.findings.filter((f) => f.rule === "database-elsewhere").map((f) => `${f.level} ${f.subject}`)).toEqual(["warn ../web", "warn supabase/"]);
    // The supabase pack doesn't run: no RLS finding for the left-over copy.
    expect(doctor.findings.filter((f) => f.rule.startsWith("migration-"))).toEqual([]);
  });
});

describe("the supabase setting", () => {
  it("takes false or a relative app folder, and refuses the rest", () => {
    expect(validateSupabase(false)).toBe(false);
    expect(validateSupabase(true)).toBe(true);
    expect(validateSupabase({ app: "../app/" })).toEqual({ app: "../app" });
    const root = tempDir("genesis-self-");
    writeTree(root, { "mobile/genesis.config.json": JSON.stringify({ supabase: { app: "../link" } }) });
    symlinkSync(path.join(root, "mobile"), path.join(root, "link"), "dir");
    expect(() => databaseElsewhere(path.join(root, "mobile"))).toThrow(/is this app itself/);
    for (const bad of [{ app: "/abs/app" }, { app: "." }, { app: "" }, { root: "../app" }, "../app", { app: "..\\app" }]) expect(() => validateSupabase(bad, "genesis.config.json")).toThrow(GenesisConfigError);
  });

  it("init's config edit drops the doctor's supabase pack and settings", () => {
    const text = JSON.stringify({ doctor: { packs: ["native", "supabase"], supabase: { migrations: "supabase/migrations" }, src: ["src"] }, links: { hosts: ["example.com"] } });
    const out = JSON.parse(besideConfig(text, "../app"));
    expect(out.doctor).toEqual({ packs: ["native"], src: ["src"] });
    expect(out.supabase.app).toBe("../app");
    expect(Object.keys(out)).toEqual(["doctor", "supabase", "links"]);
  });
});

describe("overlapping migrations (provides)", () => {
  it("in app/, supabase 0005 isn't new once notifications 0001 (which adopts the push tables) is in", async () => {
    const { app } = await twoApps();
    const lock = readLock(app);
    lock.blocks["push"] = { package: "@marktiderman/genesis-native" };
    writeLock(app, lock);
    const report = await runMigrate({ root: app, dryRun: true, now: NOW });
    const push = report.plan.rows.find((r) => r.file === "migrations/0005_genesis_push.sql");
    expect(push).toMatchObject({ package: SUPABASE, state: "provided" });
    expect(push!.detail).toContain(`${NOTIFICATIONS} migrations/0001_genesis_notifications.sql provides its objects`);
    expect(report.plan.creates.map((c) => c.path).filter((p) => p.includes("genesis_push"))).toEqual([]);
    expect(report.attention).toBe(false);

    // genesis add push there, as the phone app's line says: 0005 isn't copied either.
    const add = await runAdd({ root: app, block: "push", dryRun: true, install: false, featuresBuild: false, now: NOW });
    expect(add.migrations.rows.map((r) => `${r.file} ${r.state}`)).toEqual(["migrations/0005_genesis_push.sql provided"]);
    expect(add.migrations.creates).toEqual([]);
    // 0001 doesn't create the sender's RPCs (genesis_push_targets, …): genesis-push-send is superseded,
    // neither copied nor deployed, and the steps point at the notifications runner.
    expect(add.created).toEqual([]);
    expect(add.steps.some((s) => /genesis-push-send|GENESIS_PUSH_SECRET/.test(s) && /supabase (functions deploy|secrets set)/.test(s))).toBe(false);
    expect(add.steps.some((s) => s.startsWith("genesis-push-send isn't copied or deployed") && s.includes("genesis-notifications (the notifications block's Edge Function)"))).toBe(true);
    const written = await runAdd({ root: app, block: "push", yes: true, install: false, featuresBuild: false, now: NOW });
    expect(written.created.filter((f) => f.startsWith("supabase/"))).toEqual([]);
    expect(existsSync(path.join(app, "supabase", "functions", "genesis-push-send"))).toBe(false);
  });

  it("add --database-only copies a phone block's migration and function, and nothing of the phone's", async () => {
    const root = tempDir("genesis-web-");
    writeTree(root, {
      "package.json": JSON.stringify({ name: "sample-web", dependencies: { [SUPABASE]: "^0.11.0" } }, null, 2) + "\n",
      "supabase/config.toml": 'project_id = "sample-web"\n',
    });
    for (const [name, folder] of [[SUPABASE, "supabase"], ["@marktiderman/genesis-native", "native"]] as const) linkWorkspacePackage(root, name, folder);
    const dry = await runAdd({ root, block: "push", databaseOnly: true, dryRun: true, install: false, featuresBuild: false, now: NOW });
    // Only the package its files come from: genesis-supabase is there, so nothing to install.
    expect(dry.install).toBeNull();
    expect(dry.migrations.rows.map((r) => `${r.file} ${r.state}`)).toEqual(["migrations/0005_genesis_push.sql new"]);
    expect(dry.featureSnippet).toBeUndefined();
    expect(dry.steps.some((s) => /expo-notifications|createPush|eas init|screen/.test(s))).toBe(false);
    expect(dry.steps.some((s) => s.includes("supabase secrets set GENESIS_PUSH_SECRET"))).toBe(true);
    const run = await runAdd({ root, block: "push", databaseOnly: true, yes: true, install: false, featuresBuild: false, now: NOW });
    expect(run.created.some((f) => f.startsWith("supabase/functions/genesis-push-send/"))).toBe(true);
    expect(run.created.some((f) => /^supabase\/migrations\/\d+_genesis_push\.sql$/.test(f))).toBe(true);
    expect(run.created.some((f) => f.startsWith(".claude/") || f.startsWith("src/"))).toBe(false);
    const lock = readLock(root);
    expect(lock.blocks["push"]).toBeUndefined();
    expect(Object.keys(lock.migrations ?? {})).toEqual([`${SUPABASE}:migrations/0005_genesis_push.sql`]);
    // And a phone app's lines are never this in an app whose database is elsewhere.
    writeTree(root, { "genesis.config.json": JSON.stringify({ supabase: { app: "../elsewhere" } }) });
    await expect(runAdd({ root, block: "push", databaseOnly: true, dryRun: true, install: false })).rejects.toThrow(/--database-only/);
  });

  it("counts a newer migration of a block the web app has as missing there, and an unreadable lock as everything", async () => {
    const { app, mobile } = await twoApps();
    const lock = readLock(app);
    // The web app has the chat block in its lock, but none of its migrations.
    lock.blocks["chat"] = { package: "@marktiderman/genesis-chat" };
    writeLock(app, lock);
    expect((await runMigrate({ root: mobile, now: NOW })).elsewhere?.missing).toContain("chat");
    writeTree(app, { "genesis.lock.json": "{ not json" });
    const unreadable = await runMigrate({ root: mobile, now: NOW });
    expect(unreadable.warnings.some((w) => w.includes("Can't read ../app's genesis.lock.json"))).toBe(true);
    expect(unreadable.elsewhere?.missing).toEqual(expect.arrayContaining(["push", "chat", "notifications"]));
  });

  it("leaves a locked block whose switch is off out of the line for the web app, unless --block asks for it", async () => {
    const { mobile } = await twoApps();
    expect(readLock(mobile).blocks["chat"]).toBeDefined();
    const config = path.join(mobile, "starter.config.ts");
    writeFileSync(config, readFileSync(config, "utf8").replace(/\bchat: true\b/, "chat: false"));
    const off = await runMigrate({ root: mobile, now: NOW });
    expect(off.elsewhere?.missing).not.toContain("chat");
    expect(off.switchedOff.some((s) => s.startsWith("chat:"))).toBe(true);
    expect((await runMigrate({ root: mobile, now: NOW, blocks: ["chat"] })).elsewhere?.missing).toContain("chat");
  });

  it("orders the blocks to add there: required ones first, and notifications before push", () => {
    const blocks = catalogBlocks();
    expect(orderForAdding(["push", "chat", "notifications", "support-feedback", "account"], blocks)).toEqual(["notifications", "push", "chat", "account", "support-feedback"]);
    expect(orderForAdding(["support-feedback", "account"], blocks)).toEqual(["account", "support-feedback"]);
  });

  it("counts a provider copied in the same run, or deleted after it was copied, and never one that can't be read", () => {
    const root = tempDir();
    const push: SourceMigration = { package: SUPABASE, file: "migrations/0005_genesis_push.sql", source: "create table public.push_devices ();\n" };
    const notif: SourceMigration = { package: NOTIFICATIONS, file: "migrations/0001_genesis_notifications.sql", source: "-- adopts\n", provides: [{ package: SUPABASE, file: "migrations/0005_genesis_push.sql" }] };
    const both = planMigrations(root, [push, notif], { now: NOW });
    expect(both.rows.map((r) => r.state)).toEqual(["provided", "new"]);
    expect(both.creates.map((c) => c.path)).toEqual(["supabase/migrations/20261101120000_genesis_notifications.sql"]);
    const providers = [{ package: NOTIFICATIONS, file: notif.file, provides: notif.provides! }];
    // Where the lock says it went counts only while that file is there.
    const copied = { [`${NOTIFICATIONS}:${notif.file}`]: "supabase/migrations/1_x.sql" };
    expect(planMigrations(root, [push], { now: NOW, copied, providers }).rows[0]!.state).toBe("new");
    // Its source in the same run doesn't count either: a deleted copy isn't copied again.
    expect(planMigrations(root, [push, notif], { now: NOW, copied }).rows.map((r) => r.state)).toEqual(["new", "deleted"]);
    writeTree(root, { "supabase/migrations/1_x.sql": "-- adopts\n" });
    expect(planMigrations(root, [push], { now: NOW, copied, providers }).rows[0]).toMatchObject({ state: "provided", providedBy: { package: NOTIFICATIONS, file: notif.file } });
    // A copy of the same name whose header names another package's migration isn't it.
    const other = tempDir();
    writeTree(other, { "supabase/migrations/20260101000000_genesis_notifications.sql": migrationHeader("@marktiderman/genesis-chat", "migrations/0001_genesis_notifications.sql", "x\n") + "x\n" });
    expect(planMigrations(other, [push], { now: NOW, providers }).rows[0]!.state).toBe("new");
    const unreadable = planMigrations(root, [push, { ...notif, source: null }], { now: NOW });
    expect(unreadable.rows[0]!.state).toBe("new");
  });

  it("the shipped manifests say it: notifications 0001 provides supabase 0005", () => {
    const pkg = JSON.parse(shipped("notifications", "package.json"));
    const manifest = parseManifest(NOTIFICATIONS, "notifications", pkg.genesis.blocks.notifications, pkg.version);
    expect(manifest.migrations[0]!.provides).toEqual([{ package: SUPABASE, file: "migrations/0005_genesis_push.sql", functions: ["functions/genesis-push-send"] }]);
    expect(() => parseManifest(NOTIFICATIONS, "x", { migrations: [{ file: "migrations/0001_x.sql", provides: [{ file: "migrations/0001_x.sql" }] }] })).toThrow(/can't provide itself/);
    expect(() => parseManifest(NOTIFICATIONS, "x", { migrations: [{ file: "migrations/0001_x.sql", provides: [{ package: "left-pad", file: "migrations/0002_y.sql" }] }] })).toThrow(/Genesis package/);
  });
});
