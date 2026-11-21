/**
 * The app's copies of its blocks' package migrations, against the installed packages: what
 * `genesis migrate --dry-run` reports, as findings.
 *
 * - `migration-pending` (warn): a package migration of one of the app's blocks (genesis.lock.json)
 *   isn't in the app yet, so the database the app deploys lacks what the installed package needs.
 *   Fix: `migrate.copy` (`genesis migrate`, which copies it in as a new timestamped file).
 * - `migration-drift` (warn): a copy the app edited, or one whose package text changed since it was
 *   copied, or a same-named file with other text (a difference only in SQL comments and whitespace
 *   isn't one: it makes the same database). When several files share the name and exactly one
 *   carries the migration's header, that one is the copy and the others are the app's own drafts.
 *   An applied migration is never rewritten. Fix:
 *   `migrate.forward` (`genesis migrate --forward` writes a forward migration to fill in). When
 *   several files hold the migration and their headers can't tell which is the copy, a forward
 *   migration doesn't settle it: giving exactly one of them the migration's genesis-migration
 *   header does.
 *
 * Only an app whose genesis.lock.json lists blocks is checked; an app whose database files live in
 * another app (genesis.config.json `supabase`) is checked there. A lock that can't be read is
 * `lock-files`'s to report.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { LOCK_FILE, readLock } from "../blocks/lock.js";
import type { MigrateReport } from "../blocks/migrate.js";
import type { DoctorContext } from "./types.js";

export const PENDING_RULE = "migration-pending";
export const DRIFT_RULE = "migration-drift";
const DRIFT_STATES = new Set(["edited", "changed-upstream", "differs"]);

/** `genesis migrate --dry-run`'s report, or null when the app has no blocks or it can't run. */
export async function migrateDryRun(root: string): Promise<MigrateReport | null> {
  if (!existsSync(path.join(root, LOCK_FILE))) return null;
  try {
    if (!Object.keys(readLock(root).blocks).length) return null;
    const { runMigrate } = await import("../blocks/migrate.js");
    const report = await runMigrate({ root, dryRun: true });
    return report.elsewhere ? null : report;
  } catch {
    return null;
  }
}

export async function checkMigrationDrift(ctx: DoctorContext): Promise<void> {
  const report = await migrateDryRun(ctx.root);
  if (!report) return;
  for (const row of report.plan.rows) {
    const subject = `${row.package}:${row.file}`;
    if (row.state === "new") {
      ctx.report({
        rule: PENDING_RULE,
        level: "warn",
        file: LOCK_FILE,
        subject,
        message: `${row.package} ships the migration ${row.file}${row.block ? ` (the ${row.block} block)` : ""}, which isn't in the app yet; genesis migrate copies it in (genesis fix migrate.copy)`,
      });
    } else if (DRIFT_STATES.has(row.state) && !row.forward) {
      // Several files hold it and their headers can't tell which is the copy: a forward migration
      // doesn't settle that, giving exactly one of them the migration's header does.
      const several = row.state === "differs" && row.detail?.includes("files hold it");
      const what = row.state === "edited" ? "was edited in the app after it was copied" : row.state === "changed-upstream" ? `changed in ${row.package} since it was copied` : several ? `holds ${row.package}'s ${row.file} with other files: ${row.detail}` : `has the same name as ${row.package}'s ${row.file} but other text`;
      ctx.report({
        rule: DRIFT_RULE,
        level: "warn",
        file: row.copy ?? LOCK_FILE,
        subject,
        message: several
          ? `${row.copy ?? row.file} ${what}. Which one is the copy can't be told: exactly one of them should carry the migration's genesis-migration header`
          : `${row.copy ?? row.file} ${what}; an applied migration is never rewritten. genesis migrate --forward writes a forward migration to carry the change (genesis fix migrate.forward)`,
      });
    }
  }
}
