/**
 * The blocks this package carries: what each needs in the database, and what
 * it means for the stores' privacy forms. Each is installed on its own with
 * `genesis add <block>`; all need genesis-supabase's owner-access block.
 */
import { defineBlock } from "@marktiderman/genesis-features/blocks";

const PACKAGE = "@marktiderman/genesis-work";

/**
 * Goals and projects (one table, either or both) with their tasks, issues and milestones, owned by a person, a team or the tenant.
 *
 * @stability Experimental
 */
export const pursuitsBlock = defineBlock({
  id: "pursuits",
  requires: ["owner-access"],
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0001_genesis_work_pursuits.sql", test: "migrations/tests/0001_genesis_work_pursuits.test.sql" }],
    privacy: { notes: ["Stores the goals, projects, tasks and issues people and teams write; a deleted person's rows keep no link to their login."] },
  },
});

/**
 * Numbers tracked over time, one value per period, with goals that change over time and a view of each value against the goal of its period.
 *
 * @stability Experimental
 */
export const metricsBlock = defineBlock({
  id: "metrics",
  requires: ["pursuits"],
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0002_genesis_work_metrics.sql", test: "migrations/tests/0002_genesis_work_metrics.test.sql" }],
    privacy: { notes: ["Stores the numbers people and teams track; a source's settings hold ids only, never secrets."] },
  },
});

/**
 * Dated updates (health and a note) on a pursuit, work item or metric, and requests to one person for an update by a due time.
 *
 * @stability Experimental
 */
export const statusUpdatesBlock = defineBlock({
  id: "status-updates",
  requires: ["pursuits", "metrics"],
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0003_genesis_work_updates.sql", test: "migrations/tests/0003_genesis_work_updates.test.sql" }],
    privacy: { notes: ["Stores the updates people write and who asked whom for one; a closed account's requests to it are deleted."] },
  },
});

/**
 * Sessions of any kind (a meeting, workshop, presentation, coaching call, one-on-one, class or planning day), with types and agendas, attendees, ratings and links.
 *
 * @stability Experimental
 */
export const sessionsBlock = defineBlock({
  id: "sessions",
  requires: ["pursuits"],
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0004_genesis_work_sessions.sql", test: "migrations/tests/0004_genesis_work_sessions.test.sql" }],
    privacy: { notes: ["Stores sessions, who attended and each attendee's rating and note; a closed account's attendance goes with it."] },
  },
});
