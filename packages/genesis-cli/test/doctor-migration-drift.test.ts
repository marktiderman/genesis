// @feat:doctor-fixes
import { cpSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { runMigrate } from "../src/blocks/migrate.js";
import { sqlSignature } from "../src/blocks/migrations.js";
import { BUILTIN_RULES, runDoctor } from "../src/doctor/index.js";
import { runFixCommand } from "../src/fix/command.js";
import { expoApp, fixturePackage, linkWorkspacePackage, NOW, read } from "./blocks-helpers.js";
import { cleanupApps, makeApp as doctorApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

async function appWithBlock(firstOnly = false) {
  const root = expoApp();
  linkWorkspacePackage(root, "@marktiderman/genesis-config", "features");
  fixturePackage(root, firstOnly ? { migrations: [{ file: "migrations/0001_fixture_notes.sql" }] } : {});
  await runAdd({ root, block: "fixture-notes", yes: true, install: false, featuresBuild: false, now: NOW });
  // The doctor reads the design system: the fake one the doctor tests install.
  const fake = doctorApp(null);
  for (const name of ["genesis-ui", "genesis-design-system"]) cpSync(path.join(fake, "node_modules/@marktiderman", name), path.join(root, "node_modules/@marktiderman", name), { recursive: true });
  return root;
}

const of = async (root: string, rule: string) => (await runDoctor({ root, config: {} })).findings.filter((f) => f.rule === rule);
const quiet = { out: () => {}, err: () => {} };

describe("migration-pending and migration-drift", () => {
  it("are built-in rules", () => {
    expect(BUILTIN_RULES).toContain("migration-pending");
    expect(BUILTIN_RULES).toContain("migration-drift");
  });

  it("say nothing right after add", async () => {
    const root = await appWithBlock();
    expect([...(await of(root, "migration-pending")), ...(await of(root, "migration-drift"))]).toEqual([]);
  });

  it("migration-pending: a package migration not copied in yet; migrate.copy copies it", async () => {
    const root = await appWithBlock(true);
    fixturePackage(root); // the package now also ships 0002
    const found = await of(root, "migration-pending");
    expect(found.map((f) => [f.level, f.subject, f.fix?.id])).toEqual([["warn", "@marktiderman/genesis-fixture:migrations/0002_fixture_notes_body.sql", "migrate.copy"]]);
    expect(await runFixCommand({ root, target: "migrate.copy", yes: true, network: false }, quiet)).toBe(0);
    expect(await of(root, "migration-pending")).toEqual([]);
  });

  it("migration-drift: a copy with an older CLI's one-line header doesn't drift, though its text starts with a comment; an edit still does", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const [first, note, ...body] = read(root, copy).split("\n");
    expect(note).toMatch(/^-- Copied by the Genesis CLI\./);
    expect(body[0]).toMatch(/^-- fixture notes/);
    writeFileSync(path.join(root, copy), [first, ...body].join("\n"));
    expect(await of(root, "migration-drift")).toEqual([]);
    writeFileSync(path.join(root, copy), [first, ...body].join("\n").replace("primary key", "primary key, extra int"));
    expect((await of(root, "migration-drift")).map((f) => f.file)).toEqual([copy]);
  });

  it("migration-drift: the app's own earlier draft under the same name doesn't drift beside the tracked copy; no header or two headers still do", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const draft = "supabase/migrations/20261001120000_fixture_notes.sql";
    const published = read(root, copy);
    writeFileSync(path.join(root, draft), "-- the app's draft, before the package shipped\ncreate table if not exists notes (id uuid primary key);\n");
    expect(await of(root, "migration-drift")).toEqual([]);
    // The copy is current, and its row names the draft as the app's own.
    const row = (await runMigrate({ root, dryRun: true, now: NOW })).plan.rows.find((r) => r.file === "migrations/0001_fixture_notes.sql");
    expect([row?.state, row?.copy, row?.detail]).toEqual(["current", copy, "20261001120000_fixture_notes.sql also holds it (its name): the app's own, left alone"]);
    // A file that holds it by its text alone, under another name, is named the same way.
    const byText = "supabase/migrations/20261002120000_notes_by_hand.sql";
    writeFileSync(path.join(root, byText), read(root, "node_modules/@marktiderman/genesis-fixture/migrations/0001_fixture_notes.sql"));
    const both = (await runMigrate({ root, dryRun: true, now: NOW })).plan.rows.find((r) => r.file === "migrations/0001_fixture_notes.sql");
    expect([both?.state, both?.detail]).toEqual(["current", "20261001120000_fixture_notes.sql, 20261002120000_notes_by_hand.sql also hold it (its name or its text): the app's own, left alone"]);
    rmSync(path.join(root, byText));
    // The tracked copy edited: it drifts, and the draft beside it still doesn't.
    writeFileSync(path.join(root, copy), published.replace("primary key", "primary key, extra int"));
    expect((await of(root, "migration-drift")).map((f) => f.file)).toEqual([copy]);
    // Without a header to tell them apart, it's left alone and reported.
    writeFileSync(path.join(root, copy), "create table if not exists notes (id uuid primary key, other int);\n");
    const none = await of(root, "migration-drift");
    expect(none.map((f) => f.file)).toEqual([draft]);
    expect(none[0]!.message).toMatch(/2 files hold it/);
    // Two files with its header: which is the copy can't be told either.
    writeFileSync(path.join(root, copy), published);
    writeFileSync(path.join(root, draft), published);
    const two = await of(root, "migration-drift");
    expect(two.map((f) => f.file)).toEqual([draft]);
    expect(two[0]!.message).toMatch(/2 files hold it/);
  });

  it("migration-drift: a difference only in comments and whitespace isn't drift, the app's or the package's; a real SQL change still is", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const published = read(root, copy);
    // The app's comment and blank lines in its copy.
    writeFileSync(path.join(root, copy), published.replace("primary key", "primary key /* the app's note */").replace(/\n/g, "\n\n") + "-- reviewed\n");
    expect(await of(root, "migration-drift")).toEqual([]);
    const row = (await runMigrate({ root, dryRun: true, now: NOW })).plan.rows.find((r) => r.file === "migrations/0001_fixture_notes.sql");
    expect([row?.state, row?.detail]).toEqual(["current", "differs from the package only in comments and whitespace"]);
    // The package's comment changed since the copy.
    writeFileSync(path.join(root, copy), published);
    const source = path.join(root, "node_modules/@marktiderman/genesis-fixture/migrations/0001_fixture_notes.sql");
    writeFileSync(source, `-- reworded by the package\n${read(root, "node_modules/@marktiderman/genesis-fixture/migrations/0001_fixture_notes.sql")}`);
    expect(await of(root, "migration-drift")).toEqual([]);
    // A change to the SQL itself still drifts.
    writeFileSync(path.join(root, copy), published.replace("primary key", "primary key, extra int"));
    expect((await of(root, "migration-drift")).map((f) => f.file)).toEqual([copy]);
  });

  it("migration-drift: an edited copy, with the guided forward-migration fix", async () => {
    const root = await appWithBlock();
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    writeFileSync(path.join(root, copy), read(root, copy).replace("primary key", "primary key, extra int"));
    const found = await of(root, "migration-drift");
    expect(found.map((f) => [f.file, f.fix?.id, f.fix?.kind])).toEqual([[copy, "migrate.forward", "guided"]]);
    const out: string[] = [];
    expect(await runFixCommand({ root, target: "migration-drift", yes: true, network: false }, { out: (l) => out.push(l), err: () => {} })).toBe(0);
    expect(out.join("\n")).toMatch(/Fill in each forward migration/);
    expect(await of(root, "migration-drift")).toEqual([]);
  });
});

describe("sqlSignature: what a migration does, without its comments and spacing", () => {
  const same = (a: string, b: string) => expect(sqlSignature(a)).toBe(sqlSignature(b));
  const differ = (a: string, b: string) => expect(sqlSignature(a)).not.toBe(sqlSignature(b));

  it("drops line and block comments (nested too) and collapses whitespace", () => {
    same("-- notes\ncreate table t (id int);\n", "create table t (id int);");
    same("create /* a /* nested */ note */ table t\n\n  (id int);", "create table t (id int);");
    same("select 1;\r\n-- end", "select 1;");
    same("create table t ( id int /* note */ )", "create table t(id int)");
    differ("select a - -1", "select a--1");
    differ("create table t (id int);", "create table t (id bigint);");
  });

  it("keeps strings, quoted identifiers and dollar-quoted bodies exactly", () => {
    differ("select '-- not a comment';", "select '';");
    differ("select 'a  b';", "select 'a b';");
    differ('select 1 as "a /* b */";', 'select 1 as "a";');
    differ("select E'it\\'s -- here';", "select E'it\\'s';");
    same("select 'it''s'; -- note", "select 'it''s';");
    const fn = (body: string) => `create function f() returns int language sql as $fn$ ${body} $fn$;`;
    differ(fn("select 1 -- inside the body"), fn("select 1"));
    differ("do $$ begin /* kept */ end $$;", "do $$ begin end $$;");
    same(`-- header\n${fn("select 1")}`, fn("select 1"));
    // A positional parameter is not a dollar quote.
    same("select $1 -- the id", "select $1");
  });
});
