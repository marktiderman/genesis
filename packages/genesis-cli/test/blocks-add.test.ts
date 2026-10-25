// @feat:cli-add
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { readLock } from "../src/blocks/lock.js";
import { addFeatureEntry, registryInsertionPoint } from "../src/blocks/registry-edit.js";
import { expoApp, fixturePackage, linkWorkspacePackage, NOW, read, snapshot, SQL_A, SQL_B, TEST_A } from "./blocks-helpers.js";

const add = (root: string, extra: Partial<Parameters<typeof runAdd>[0]> = {}) =>
  runAdd({ root, block: "fixture-notes", yes: true, install: false, featuresBuild: false, now: NOW, ...extra });

function app() {
  const root = expoApp();
  linkWorkspacePackage(root, "@marktiderman/genesis-features", "features");
  fixturePackage(root);
  return root;
}

describe("genesis add", () => {
  it("--dry-run plans everything and writes nothing", async () => {
    const root = app();
    const before = snapshot(root);
    const report = await add(root, { dryRun: true, yes: false });
    expect(snapshot(root)).toEqual(before);
    expect(report.migrations.creates.map((c) => c.path)).toEqual([
      "supabase/migrations/20261101120000_fixture_notes.sql",
      "supabase/migrations/20261101120001_fixture_notes_body.sql",
      "supabase/tests/database/fixture_notes.test.sql",
    ]);
  });

  it("refuses to write without --yes when nobody can answer", async () => {
    const root = app();
    const before = snapshot(root);
    await expect(add(root, { yes: false })).rejects.toThrow(/Pass --yes/);
    expect(snapshot(root)).toEqual(before);
  });

  it("copies migrations as new timestamped files with a header, plus tests, functions, skill, fragment, route stub and registry entry", async () => {
    const root = app();
    const report = await add(root);
    const first = read(root, "supabase/migrations/20261101120000_fixture_notes.sql");
    expect(first).toMatch(/^-- genesis-migration: @marktiderman\/genesis-fixture migrations\/0001_fixture_notes\.sql sha256:[0-9a-f]{64}\n-- Copied/);
    expect(first.endsWith(SQL_A)).toBe(true);
    expect(read(root, "supabase/migrations/20261101120001_fixture_notes_body.sql").endsWith(SQL_B)).toBe(true);
    expect(read(root, "supabase/tests/database/fixture_notes.test.sql")).toBe(TEST_A);
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toContain("Deno.serve");
    expect(read(root, "supabase/config.toml")).toMatch(/\[functions\.fixture-send\]\nverify_jwt = false/);
    expect(read(root, ".claude/skills/fixture-notes/SKILL.md")).toContain("# Notes");
    expect(read(root, "AGENTS.md")).toContain("<!-- genesis-block:fixture-notes:start -->");
    // Signed in: inside the app's one group.
    expect(read(root, "src/app/(app)/notes.tsx")).toContain("ScreenContainer");
    expect(read(root, "features.ts")).toContain('"fixture-notes": {');
    const lock = readLock(root);
    expect(lock.blocks["fixture-notes"]).toEqual({ package: "@marktiderman/genesis-fixture", version: "1.0.0" });
    expect(Object.keys(lock.files).sort()).toEqual([
      ".claude/skills/fixture-notes/SKILL.md",
      "supabase/functions/fixture-send/handler.ts",
      "supabase/functions/fixture-send/index.ts",
      "supabase/tests/database/fixture_notes.test.sql",
    ]);
    expect(report.steps.join("\n")).toMatch(/supabase secrets set FIXTURE_SECRET=…/);
    expect(report.steps.join("\n")).toMatch(/Turn the notes on/);
  });

  it("is idempotent: a second run creates nothing and changes nothing", async () => {
    const root = app();
    await add(root);
    const before = snapshot(root);
    const report = await add(root, { now: new Date("2027-01-01T00:00:00Z") });
    expect(report.created).toEqual([]);
    expect(report.edited).toEqual([]);
    expect(snapshot(root)).toEqual(before);
  });

  it("never overwrites a file the app already has with other text", async () => {
    const root = app();
    writeFileSync(path.join(root, "supabase/config.toml"), 'project_id = "fixture"\n');
    const mine = "// my own fixture-send\n";
    const file = path.join(root, "supabase/functions/fixture-send/index.ts");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, mine);
    const report = await add(root);
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(mine);
    expect(report.kept.map((k) => k.path)).toContain("supabase/functions/fixture-send/index.ts");
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]).toBeUndefined();
  });

  it("refuses to copy a migration whose app copy was edited, and leaves it alone", async () => {
    const root = app();
    await add(root);
    const copy = "supabase/migrations/20261101120000_fixture_notes.sql";
    const edited = `${read(root, copy)}-- my edit\n`;
    writeFileSync(path.join(root, copy), edited);
    const report = await add(root);
    expect(read(root, copy)).toBe(edited);
    expect(report.kept.map((k) => k.path)).toContain(copy);
    expect(readdirSync(path.join(root, "supabase/migrations"))).toHaveLength(3);
  });

  it("refuses a package whose manifest points outside it", async () => {
    const root = expoApp();
    fixturePackage(root, { migrations: [{ file: "../../../../etc/0001_passwd.sql" }] });
    await expect(add(root)).rejects.toThrow(/No Genesis package declares a block "fixture-notes"/);
    expect(existsSync(path.join(root, "genesis.lock.json"))).toBe(false);
  });

  it("names an unknown block and the known ones", async () => {
    await expect(runAdd({ root: app(), block: "nope", yes: true, install: false })).rejects.toThrow(/No Genesis package declares a block "nope".*fixture-notes/);
  });
});

describe("registry edits", () => {
  it("adds an entry inside the one defineFeatures object, keeping the rest", () => {
    const text = 'export const features = defineFeatures({\n  a: { name: "a }", summary: `x` }, // a } brace\n  /* } */\n});\n';
    const at = registryInsertionPoint(text)!;
    expect(text.slice(at, at + 3)).toBe("});");
    expect(addFeatureEntry(text, '  "b": {},\n')).toBe('export const features = defineFeatures({\n  a: { name: "a }", summary: `x` }, // a } brace\n  /* } */\n  "b": {},\n});\n');
    // The last entry without a comma gets one, after it and not after a comment.
    expect(addFeatureEntry("defineFeatures({\n  a: {} // last\n});", '  "b": {},\n')).toBe('defineFeatures({\n  a: {}, // last\n  "b": {},\n});');
  });

  it("gives up rather than guess", () => {
    expect(registryInsertionPoint("const a = defineFeatures({ x: `${y}` });")).toBeNull();
    expect(registryInsertionPoint("defineFeatures({}); defineFeatures({});")).toBeNull();
    expect(registryInsertionPoint("export const features = {};")).toBeNull();
  });
});
