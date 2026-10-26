/**
 * Genesis work: goals and projects, tasks and issues, metrics, status updates
 * and sessions, in the app's own Supabase (schema `genesis_work`). This entry
 * point names the blocks and the schema; typed clients come next.
 */
export { contentPackInstallBlock, customFieldsBlock, metricsBlock, pursuitsBlock, sessionsBlock, statusUpdatesBlock } from "./blocks";

/** The Postgres schema every genesis-work table lives in. */
export const GENESIS_WORK_SCHEMA = "genesis_work" as const;
