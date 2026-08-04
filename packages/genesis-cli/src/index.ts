/**
 * @marktiderman/genesis-cli — programmatic API.
 *
 * Most users hit the CLI directly via `npx @marktiderman/genesis-cli init`,
 * but the scaffolder is also exposed as a library so other tools (a
 * monorepo bootstrap script, a higher-level CLI in a downstream org)
 * can drive it programmatically.
 */

export {
  runScaffold,
  planScaffold,
  validateConsumerName,
  type FileSystem,
  type ScaffoldOptions,
  type ScaffoldResult,
  type ScaffoldLogger,
} from "./scaffolder.js";
