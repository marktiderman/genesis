/**
 * @feat:sites-store
 * The migration as text: the rules a pgTAP run can't see on its own. A host
 * replaces the hooks (can_edit, can_view, reserved_paths) in its own
 * migration, so no genesis-sites migration, now or later, may create them
 * with a plain statement: only `ensure_hook_stubs()` does, and only over a
 * missing hook or the untouched stub (the pgTAP test proves that half).
 * Every function is revoked from public by name, and nothing is granted in
 * bulk. The block declaration and package.json name the same files.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sitesBlock } from "../blocks";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = join(pkgDir, "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({ file, text: readFileSync(join(migrationsDir, file), "utf8") }));

/** The SQL with `--` comments removed (no string in these files holds `--`). */
const code = (text: string) => text.replace(/--[^\n]*/g, "");

const HOOKS = ["can_edit", "can_view", "reserved_paths"];

describe("the genesis-sites migrations", () => {
  it("are numbered NNNN_genesis_sites*.sql, starting at 0001", () => {
    expect(migrations.map((m) => m.file)[0]).toBe("0001_genesis_sites.sql");
    for (const m of migrations) expect(m.file).toMatch(/^\d{4}_genesis_sites[a-z0-9_]*\.sql$/);
  });

  it("never create a hook with a statement of their own, so a host's version survives every later migration", () => {
    for (const { file, text } of migrations) {
      for (const hook of HOOKS) {
        const statement = new RegExp(`^\\s*create\\s+(or\\s+replace\\s+)?function\\s+genesis_sites\\.${hook}\\s*\\(`, "im");
        expect(statement.test(code(text)), `${file} creates genesis_sites.${hook} directly`).toBe(false);
        expect(new RegExp(`drop\\s+function[^;]*genesis_sites\\.${hook}\\b`, "i").test(code(text)), `${file} drops ${hook}`).toBe(false);
      }
      // A later migration that needs a hook calls the stub step again instead.
      if (file !== "0001_genesis_sites.sql" && /genesis_sites\.(can_edit|can_view)/.test(code(text))) {
        expect(code(text)).toContain("genesis_sites.ensure_hook_stubs()");
      }
    }
  });

  it("revoke every function they create from public, by name, and grant nothing in bulk", () => {
    const sql = migrations.map((m) => code(m.text)).join("\n");
    const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+genesis_sites\.([a-z_]+)\s*\(/gi)].map((m) => m[1]!);
    expect(created.length).toBeGreaterThan(10);
    for (const name of new Set(created)) {
      expect(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+genesis_sites\\.${name}\\s*\\([^)]*\\)\\s+from\\s+public`, "i").test(sql), `${name} is not revoked from public by name`).toBe(true);
    }
    for (const hook of HOOKS) expect(sql).toMatch(new RegExp(`revoke execute on function genesis_sites\\.${hook}\\(`));
    expect(sql).not.toMatch(/on\s+all\s+(functions|tables|routines)\s+in\s+schema/i);
    expect(sql).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("grant anon only the schema (to reach a function) and the public read", () => {
    const sql = migrations.map((m) => code(m.text)).join("\n");
    const toAnon = [...sql.matchAll(/grant\s+[^;]*?\s+to\s+([^;]*\banon\b[^;]*);/gi)].map((m) => m[0].replace(/\s+/g, " "));
    expect(toAnon).toEqual([
      "grant usage on schema genesis_sites to anon, authenticated, service_role;",
      "grant execute on function genesis_sites.live_release(uuid) to anon, authenticated, service_role;",
    ]);
  });

  it("pin search_path on every security definer function", () => {
    for (const { file, text } of migrations) {
      const fns = code(text).split(/create\s+or\s+replace\s+function/i).slice(1);
      for (const fn of fns) {
        const head = fn.slice(0, fn.search(/\bas\s+\$/i));
        if (/security\s+definer/i.test(head)) expect(head, `${file}: ${fn.slice(0, 60)}`).toMatch(/set\s+search_path\s*=\s*''/i);
      }
    }
  });
});

describe("the sites block", () => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
    files: string[];
    genesis: { blocks: Record<string, { migrations: { file: string; test: string }[] }> };
  };

  it("names the same migration and test in defineBlock and package.json, and both exist and ship", () => {
    const declared = pkg.genesis.blocks.sites!.migrations;
    const fromBlock = (sitesBlock.contributes?.migrations ?? []).map((m) => ({ file: m.file, test: m.test }));
    expect(fromBlock).toEqual(declared);
    for (const m of declared) {
      expect(existsSync(join(pkgDir, m.file)), m.file).toBe(true);
      expect(existsSync(join(pkgDir, m.test)), m.test).toBe(true);
    }
    expect(pkg.files).toContain("migrations");
    expect(declared.map((m) => m.file.split("/").pop())).toEqual(migrations.map((m) => m.file));
  });
});
