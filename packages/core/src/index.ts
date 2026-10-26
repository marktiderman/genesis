// Provider
export * from "./provider";

// Storage
export * from "./storage";

// Hooks
export * from "./hooks";

// Types
export * from "./form-types";

// The one schema model. Its write-outcome exports already arrive through
// "./provider" above, so only the rest is listed here.
export type {
  StorageType,
  WidgetHint,
  DataRow,
  FieldPermissions,
  FieldReference,
  FieldSchema,
  ResourceContract,
  RowOf,
  ResourceAccess,
  ResourceRelation,
  VersionField,
  ResourceSchema,
  ResourceSummary,
  FilterOperator,
  ProviderCapabilities,
  AuditEntry,
  RowAction,
  RecordComment,
} from "./schema/types";
export { keyFields, encodeRecordKey, decodeRecordKey } from "./schema/keys";
export { defineResource } from "./schema/types";

// Query keys
export {
  defineQueryKeys,
  resourceKeys,
  type KeyScope,
  type KeyFilter,
  type QueryKeys,
  type ScopedKey,
} from "./query-keys";

// Utils
export { titleCase } from "./utils";
