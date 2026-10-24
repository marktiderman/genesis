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

export {
  introspectPostgres,
  introspectOpenApi,
  emitContracts,
  parseTableComment,
  parseColumnComment,
  CommentSettingsError,
  type OpenApiDocument,
  type EmitOptions,
  type IntrospectedTable,
  type IntrospectedColumn,
  type FieldSettings,
  type TableSettings,
  type StorageType,
} from "./introspect/index.js";

export {
  planStudioInit,
  detectHost,
  type StudioHost,
  type ProjectFacts,
  type InitOptions,
  type InitPlan,
  type PlannedFile,
} from "./studio/init.js";

export {
  runDoctor,
  formatReport,
  defineDoctorPlugin,
  DoctorConfigError,
  GenesisConfigError,
  readGenesisConfig,
  validateLinks,
  type GenesisConfigFile,
  type GenesisLinks,
  type RunDoctorOptions,
  type DoctorConfig,
  type DoctorPlugin,
  type DoctorContext,
  type DoctorResult,
  type Finding,
} from "./doctor/index.js";
