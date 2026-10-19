// The one schema model. React-free: safe to import on a server, in an edge
// function, or from the switchboard.
export type {
  StorageType,
  WidgetHint,
  DataRow,
  FieldPermissions,
  FieldReference,
  FieldSchema,
  ResourceContract,
  ResourceAccess,
  ResourceRelation,
  VersionField,
  ResourceSchema,
  ResourceSummary,
  FilterOperator,
  ProviderCapabilities,
  AuditEntry,
} from "./types";
export { keyFields, encodeRecordKey, decodeRecordKey } from "./keys";
export {
  DataWriteError,
  isDataWriteError,
  type WriteOutcome,
  type DataWriteErrorOptions,
} from "./write-outcome";
