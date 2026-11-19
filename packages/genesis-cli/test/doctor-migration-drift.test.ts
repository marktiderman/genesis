// @feat:doctor-fixes
import { cpSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
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
