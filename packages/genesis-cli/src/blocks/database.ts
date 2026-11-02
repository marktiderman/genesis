/**
 * Where an app's database files live: genesis.config.json's top-level `supabase`
 * setting (doctor/config.ts validates it). A phone app made beside a web app
 * (`genesis init --template native --beside ../app`) has no Supabase project of
 * its own: it uses the web app's database, whose `supabase/` is the only
 * migrations folder.
 *
 * With the setting, `genesis add`, `migrate`, `upgrade` and `init` never write
 * or plan Supabase files (migrations, pgTAP tests, Edge Functions, config.toml)
 * in this app, and say where to run them instead. They never write into the
 * other app either: its lock, its blocks, its installed package versions and
 * its doctor are its own, so the CLI is run there, in that app.
 */
import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { GenesisConfigError, readGenesisConfig } from "../doctor/config.js";
import { migrationKey, readLock } from "./lock.js";
import type { BlockManifest } from "./manifest.js";
import { providingMigrations, readAppMigrations, stemOrNull, type ProvidingMigration } from "./migrations.js";

export interface DatabaseElsewhere {
  /** The owning app's folder as the setting writes it (`../app`), or null for `"supabase": false`. */
  app: string | null;
  /** Its absolute folder, or null. */
  dir: string | null;
  /** The owning app has a `supabase/` folder. */
  hasSupabase: boolean;
}

/** Null when the app keeps its own database files (the default). Throws when genesis.config.json is invalid. */
export function databaseElsewhere(root: string): DatabaseElsewhere | null {
  const setting = readGenesisConfig(root)?.supabase;
  if (setting === undefined) return null;
  if (setting === false) return { app: null, dir: null, hasSupabase: false };
  // Its real folder (a symlink resolved), which can't be this app: then the setting points nowhere else.
  const resolved = path.resolve(root, setting.app);
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
  const dir = real(resolved);
  if (dir === real(path.resolve(root))) throw new GenesisConfigError(`${path.join(root, "genesis.config.json")}: supabase.app "${setting.app}" is this app itself; leave "supabase" out instead`);
  return { app: setting.app, dir, hasSupabase: existsSync(path.join(dir, "supabase")) };
}

/** A Supabase file: anything under the app's `supabase/` folder. */
export function isSupabasePath(rel: string): boolean {
  return rel === "supabase" || rel.startsWith("supabase/");
}

/** One sentence: where this app's database files live, and where to run the command instead. */
export function elsewhereNote(home: DatabaseElsewhere, command = "genesis migrate"): string {
  if (!home.app) return `This app has no database files (genesis.config.json "supabase": false), so no Supabase files are written or planned here.`;
  return `This app's database files live in ${home.app}/supabase (genesis.config.json supabase.app), so no Supabase files are written or planned here: run ${command} in ${home.app}.`;
}

/**
 * Of these blocks, the ones whose database files the owning app lacks: a migration it has no copy
 * of (by header, by name for a copy made before headers, or where its genesis.lock.json says one
 * went) and that nothing there provides, or an Edge Function with no folder there. So a newer
 * migration of a block the app already has counts too. Read only; null when the owning app's lock
 * or migrations can't be read.
 */
export function blocksMissingThere(home: DatabaseElsewhere, ids: readonly string[], manifests: readonly Pick<BlockManifest, "id" | "migrations" | "functions">[]): string[] | null {
  const missing = migrationsMissingThere(home, ids, manifests);
  if (!missing) return null;
  return ids.filter((id) => missing.some((m) => m.block === id));
}

export interface MissingThere {
  block: string;
  /** `<package> <file>` of a migration, or `<package> <dir>` of an Edge Function. */
  what: string;
  kind: "migration" | "function";
}

/** What {@link blocksMissingThere} counts, one row per migration or function. */
export function migrationsMissingThere(home: DatabaseElsewhere, ids: readonly string[], manifests: readonly Pick<BlockManifest, "id" | "migrations" | "functions">[]): MissingThere[] | null {
  if (!home.dir) return null;
  let copied: Record<string, string>;
  let app: ReturnType<typeof readAppMigrations>;
  try {
    copied = readLock(home.dir).migrations ?? {};
    app = readAppMigrations(home.dir);
  } catch {
    return null;
  }
  const has = (pkg: string, file: string): boolean => {
    if (Object.hasOwn(copied, migrationKey(pkg, file))) return true;
    const stem = stemOrNull(file);
    return app.some((m) => !m.forward && (m.tracked ? m.tracked.package === pkg && m.tracked.file === file : stem !== null && m.name.replace(/^\d+_/, "") === `${stem}.sql`));
  };
  const providers: ProvidingMigration[] = providingMigrations(manifests);
  const out: MissingThere[] = [];
  for (const id of ids) {
    const m = manifests.find((b) => b.id === id);
    if (!m) continue;
    const superseded = new Set<string>();
    for (const mig of m.migrations) {
      if (has(mig.package, mig.file)) continue;
      const by = providers.find((p) => has(p.package, p.file) && p.provides.some((x) => x.package === mig.package && x.file === mig.file));
      if (by) {
        for (const dir of by.provides.find((x) => x.package === mig.package && x.file === mig.file)?.functions ?? []) superseded.add(`${mig.package}:${dir}`);
        continue;
      }
      out.push({ block: id, what: `${mig.package} ${mig.file}`, kind: "migration" });
    }
    for (const fn of m.functions) {
      if (superseded.has(`${fn.package}:${fn.dir}`)) continue;
      if (!existsSync(path.join(home.dir, "supabase", "functions", fn.dir.split("/").pop()!))) out.push({ block: id, what: `${fn.package} ${fn.dir}`, kind: "function" });
    }
  }
  return out;
}

/**
 * The order to add blocks in: a block another requires first, and a block whose migration provides
 * another's before that one (notifications before push, so push's superseded migration is never
 * copied). Otherwise as given.
 */
export function orderForAdding(ids: readonly string[], manifests: readonly Pick<BlockManifest, "id" | "requires" | "migrations">[]): string[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const before = (id: string): string[] => {
    const m = byId.get(id);
    if (!m) return [];
    const providers = manifests.filter((p) => p.id !== id && p.migrations.some((pm) => pm.provides?.some((x) => m.migrations.some((mm) => mm.package === x.package && mm.file === x.file))));
    return [...m.requires, ...providers.map((p) => p.id)].filter((x) => ids.includes(x));
  };
  const out: string[] = [];
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (out.includes(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const b of before(id)) visit(b);
    out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
}

/** The command that adds only a block's database files (never its phone parts) in the app that holds them. */
export function addThereCommand(id: string): string {
  return `genesis add ${id} --database-only`;
}

/**
 * `In ../app (it holds the database), run: genesis add a --database-only && …` for the blocks the
 * owning app lacks, or null. Database only: a phone block's install, routes and steps aren't the web app's.
 */
export function addThereLine(home: DatabaseElsewhere, ids: readonly string[]): string | null {
  if (!home.app || !ids.length) return null;
  return `In ${home.app} (it holds this app's database), run: ${ids.map(addThereCommand).join(" && ")}`;
}
