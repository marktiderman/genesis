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
import { existsSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig } from "../doctor/config.js";
import { readLock } from "./lock.js";
import type { BlockManifest } from "./manifest.js";

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
  const dir = path.resolve(root, setting.app);
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
 * Of these blocks, the ones the owning app's genesis.lock.json doesn't list, so their database
 * files may not be there yet. Read only; null when the owning app's lock can't be read.
 */
export function blocksMissingThere(home: DatabaseElsewhere, ids: readonly string[]): string[] | null {
  if (!home.dir) return null;
  try {
    const there = readLock(home.dir).blocks;
    return ids.filter((id) => !there[id]);
  } catch {
    return null;
  }
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

/** `In ../app (it holds the database), run: genesis add a && genesis add b` for the blocks the owning app lacks, or null. */
export function addThereLine(home: DatabaseElsewhere, ids: readonly string[]): string | null {
  if (!home.app || !ids.length) return null;
  return `In ${home.app} (it holds this app's database), run: ${ids.map((id) => `genesis add ${id}`).join(" && ")}`;
}
