/**
 * `genesis migrate`: compare the migrations the app's blocks ship (in the
 * installed packages) with the app's copies, copy new ones in as new
 * timestamped files, and report the rest. It never writes to a migration that
 * is already in the folder: an edited copy, or a package migration whose text
 * changed after it was copied, is reported, and `--forward` writes a new
 * forward migration to carry the change instead.
 *
 * The blocks are the app's genesis.lock.json blocks, plus `--block` ones; any
 * copy with a genesis-migration header is checked against its package too.
 *
 * An app whose database files live elsewhere (genesis.config.json `supabase`)
 * plans nothing: it says where to run migrate instead, and which of its blocks
 * that app's lock doesn't list yet.
 */
import * as path from "node:path";
import { catalogBlocks, findBlock, packageDir } from "./discover.js";
import { appBlocksSwitchedOff, switchedOffNote } from "./starter-features.js";
import { localPackageNames } from "./local.js";
import { readPackageFile } from "./files.js";
import { readLock, writeLock } from "./lock.js";
import { GENESIS_PACKAGE } from "./manifest.js";
import { applyMigrationPlan, needsAttention, planMigrations, providingMigrations, readAppMigrations, rememberMigrationCopies, validHeaderFile, type MigrationPlan, type SourceMigration } from "./migrations.js";
import { addThereLine, blocksMissingThere, databaseElsewhere, elsewhereNote, orderForAdding } from "./database.js";
import type { BlockManifest } from "./manifest.js";
import { recordOwned, sourceMigrations } from "./add.js";
import { createApp } from "./files.js";
import { NOTIFICATIONS_PACKAGE, planNotificationTypes } from "./notification-types.js";

export interface MigrateOptions {
  root: string;
  /** More blocks to check, beyond the lock's. */
  blocks?: string[];
  dryRun?: boolean;
  /** Write a forward migration stub for each edited or changed-upstream copy. */
  forward?: boolean;
  now?: Date;
  /** The app's defineNotifications registry (default: genesis.config.json notifications.registry). Loading it runs app code; never on a dry run. */
  notifications?: string;
}

export interface MigrateReport {
  plan: MigrationPlan;
  written: string[];
  warnings: string[];
  /** Locked blocks left out because their starter.config.ts switch is off, with why. */
  switchedOff: string[];
  /** True when something needs a person: an edited, changed or unreadable migration. */
  attention: boolean;
  /** The notification types migration created (or, in a dry run, that would be). */
  notificationTypes?: string;
  /** Set when the app's database files live elsewhere: where, and what to run there. Nothing is planned. */
  elsewhere?: { app: string | null; note: string; missing: string[] };
}

export async function runMigrate(options: MigrateOptions): Promise<MigrateReport> {
  const root = path.resolve(options.root);
  const lock = readLock(root);
  const warnings: string[] = [];
  const home = databaseElsewhere(root);
  // A locked block whose starter.config.ts switch is off is left out (one asked for with --block isn't).
  const catalog = catalogBlocks();
  const off = appBlocksSwitchedOff(root, catalog, Object.keys(lock.blocks));
  const switchedOff = Object.keys(lock.blocks).filter((id) => off.has(id) && !options.blocks?.includes(id));
  if (home) {
    const ids = [...new Set([...Object.keys(lock.blocks).filter((id) => !switchedOff.includes(id)), ...(options.blocks ?? [])])];
    const there = blocksMissingThere(home, ids, catalog);
    // Unreadable there: every block may be missing, as init and add say.
    if (home.app && !there) warnings.push(`Can't read ${home.app}'s genesis.lock.json or migrations, so every block is listed.`);
    const missing = orderForAdding(there ?? ids, catalog);
    if (home.app && !home.hasSupabase) warnings.push(`${home.app} has no supabase folder: genesis.config.json supabase.app should name the app that holds it.`);
    const line = addThereLine(home, missing);
    const note = [elsewhereNote(home), ...(line ? [line] : [])].join(" ");
    return { plan: { rows: [], creates: [] }, written: [], warnings, switchedOff: switchedOff.map((id) => switchedOffNote(id, off.get(id)!)), attention: false, elsewhere: { app: home.app, note, missing } };
  }
  const ids = [...new Set([...Object.keys(lock.blocks).filter((id) => !switchedOff.includes(id)), ...(options.blocks ?? [])])];
  const sources: SourceMigration[] = [];
  const local = localPackageNames(root);
  const manifests: BlockManifest[] = [];
  for (const id of ids) {
    const pkg = lock.blocks[id]?.package;
    try {
      const { manifest } = await findBlock(root, id, { ...(pkg ? { package: pkg } : {}), warnings });
      manifests.push(manifest);
      sources.push(...sourceMigrations(root, manifest));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  // Header-tracked copies that no listed block names: still checked against their package.
  for (const copy of readAppMigrations(root)) {
    const t = copy.tracked;
    if (!t || sources.some((s) => s.package === t.package && s.file === t.file)) continue;
    if (!(GENESIS_PACKAGE.test(t.package) || local.has(t.package)) || !validHeaderFile(t.file)) {
      warnings.push(`${copy.path}: its genesis-migration header names ${t.package} ${t.file}, which isn't a Genesis or local package's NNNN_name.sql; skipped.`);
      continue;
    }
    const dir = packageDir(root, t.package);
    let source: string | null = null;
    try {
      source = dir ? readPackageFile(dir, t.file) : null;
    } catch (err) {
      warnings.push(`${copy.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    sources.push({ package: t.package, file: t.file, source });
  }
  if (!ids.length && !sources.length) warnings.push("No blocks in genesis.lock.json and no copied package migrations: nothing to compare. Add a block (genesis add <block>), or pass --block.");

  const plan = planMigrations(root, sources, { now: options.now ?? new Date(), ...(options.forward ? { forward: true } : {}), ...(lock.migrations ? { copied: lock.migrations } : {}), providers: providingMigrations([...manifests, ...catalog]) });
  // An edited or changed copy that a forward migration already carries is handled.
  const attention = plan.rows.some(needsAttention);
  // The notifications block: mirror the registry's types in a migration of their own, after this run's.
  const notifies = ids.some((id) => (lock.blocks[id]?.package ?? (id === "notifications" ? NOTIFICATIONS_PACKAGE : "")) === NOTIFICATIONS_PACKAGE);
  const types = notifies
    ? await planNotificationTypes(root, {
        ...(options.notifications ? { registry: options.notifications } : {}),
        now: options.now ?? new Date(),
        pending: plan.creates.filter((c) => c.kind !== "test").map((c) => c.path.split("/").pop()!),
        ...(options.dryRun ? { dryRun: true } : {}),
      })
    : undefined;
  warnings.push(...(types?.warnings ?? []));
  const notificationTypes = types?.create ? { notificationTypes: types.create.path } : {};
  if (options.dryRun) return { plan, written: [], warnings, switchedOff: switchedOff.map((id) => switchedOffNote(id, off.get(id)!)), attention, ...notificationTypes };
  const written = applyMigrationPlan(root, plan);
  if (types?.create) {
    createApp(root, types.create.path, types.create.content);
    written.push(types.create.path);
  }
  for (const c of plan.creates) if (c.kind === "test" && c.source) recordOwned(lock, c.path, `${c.source.package}:${c.source.file}`, c.content, root, c.source.package);
  const remembered = rememberMigrationCopies(lock, plan);
  if (remembered || plan.creates.some((c) => c.kind === "test")) writeLock(root, lock);
  return { plan, written, warnings, switchedOff: switchedOff.map((id) => switchedOffNote(id, off.get(id)!)), attention, ...notificationTypes };
}
