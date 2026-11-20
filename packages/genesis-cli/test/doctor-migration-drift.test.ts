// @feat:doctor-fixes
import { cpSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { runMigrate } from "../src/blocks/migrate.js";
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
    expect([row?.state, row?.copy, row?.detail]).toEqual(["current", copy, "20261001120000_fixture_notes.sql shares its name: the app's own, left alone"]);
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
