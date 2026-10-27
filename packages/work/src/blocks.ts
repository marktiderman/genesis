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
    migrations: [
      { package: PACKAGE, file: "migrations/0004_genesis_work_sessions.sql", test: "migrations/tests/0004_genesis_work_sessions.test.sql" },
      { package: PACKAGE, file: "migrations/0007_genesis_work_bookings.sql", test: "migrations/tests/0007_genesis_work_bookings.test.sql" },
    ],
    privacy: {
      notes: [
        "Stores sessions, who attended and each attendee's rating and note; a closed account's attendance goes with it.",
        "Stores bookings, RSVPs and check-in times for an attendee's login or the app's person record.",
      ],
    },
  },
});

/**
 * A tenant's own fields on goals, projects, tasks, issues, metrics and
 * sessions, with no code or migration: genesis-forms field types, values in a
 * `custom` jsonb checked by shape, and app or content-pack fields that only
 * server code writes.
 *
 * @stability Experimental
 */
export const customFieldsBlock = defineBlock({
  id: "custom-fields",
  requires: ["pursuits", "metrics", "sessions"],
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0005_genesis_work_fields.sql", test: "migrations/tests/0005_genesis_work_fields.test.sql" }],
    privacy: { notes: ["Stores the extra fields a tenant defines and their values on its rows."] },
  },
});

/**
 * Content packs: install a pack (session types, metric templates, custom
 * fields, labels) into a tenant's own editable rows. Updates are additive and
 * keep what the tenant changed; uninstalling removes only untouched, unused
 * items. Installed by server code.
 *
 * @stability Experimental
 */
export const contentPackInstallBlock = defineBlock({
  id: "content-pack-install",
  requires: ["sessions", "metrics", "custom-fields"],
  platforms: ["web", "native", "server"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0006_genesis_work_packs.sql", test: "migrations/tests/0006_genesis_work_packs.test.sql" }],
    privacy: { notes: ["Stores which packs a tenant installed, by whom, and the starting content they added."] },
  },
});
