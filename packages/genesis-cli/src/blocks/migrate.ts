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
 */
import * as path from "node:path";
import { findBlock, packageDir } from "./discover.js";
import { readPackageFile } from "./files.js";
import { readLock, writeLock } from "./lock.js";
import { GENESIS_PACKAGE } from "./manifest.js";
import { applyMigrationPlan, needsAttention, planMigrations, readAppMigrations, validHeaderFile, type MigrationPlan, type SourceMigration } from "./migrations.js";
import { recordOwned, sourceMigrations } from "./add.js";

export interface MigrateOptions {
  root: string;
  /** More blocks to check, beyond the lock's. */
  blocks?: string[];
  dryRun?: boolean;
  /** Write a forward migration stub for each edited or changed-upstream copy. */
  forward?: boolean;
  now?: Date;
}

export interface MigrateReport {
  plan: MigrationPlan;
  written: string[];
  warnings: string[];
  /** True when something needs a person: an edited, changed or unreadable migration. */
  attention: boolean;
}

export async function runMigrate(options: MigrateOptions): Promise<MigrateReport> {
  const root = path.resolve(options.root);
  const lock = readLock(root);
  const warnings: string[] = [];
  const ids = [...new Set([...Object.keys(lock.blocks), ...(options.blocks ?? [])])];
  const sources: SourceMigration[] = [];
  for (const id of ids) {
    const pkg = lock.blocks[id]?.package;
    try {
      const { manifest } = await findBlock(root, id, { ...(pkg ? { package: pkg } : {}), warnings });
      sources.push(...sourceMigrations(root, manifest));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  // Header-tracked copies that no listed block names: still checked against their package.
  for (const copy of readAppMigrations(root)) {
    const t = copy.tracked;
    if (!t || sources.some((s) => s.package === t.package && s.file === t.file)) continue;
    if (!GENESIS_PACKAGE.test(t.package) || !validHeaderFile(t.file)) {
      warnings.push(`${copy.path}: its genesis-migration header names ${t.package} ${t.file}, which isn't a Genesis package's NNNN_name.sql; skipped.`);
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

  const plan = planMigrations(root, sources, { now: options.now ?? new Date(), ...(options.forward ? { forward: true } : {}) });
  // An edited or changed copy that a forward migration already carries is handled.
  const attention = plan.rows.some(needsAttention);
  if (options.dryRun) return { plan, written: [], warnings, attention };
  const written = applyMigrationPlan(root, plan);
  for (const c of plan.creates) if (c.kind === "test" && c.source) recordOwned(lock, c.path, `${c.source.package}:${c.source.file}`, c.content, root, c.source.package);
  if (plan.creates.some((c) => c.kind === "test")) writeLock(root, lock);
  return { plan, written, warnings, attention };
}
