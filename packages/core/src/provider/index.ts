// Types
export type {
  Identifier,
  BaseRecord,
  DataProvider,
  ListParams,
  CountMode,
  ListResult,
  PaginationParam,
  SortParam,
  FilterParam,
  ScalarFilter,
  ArrayFilter,
  RangeFilter,
  NullFilter,
  GetOneParams,
  GetOneResult,
  GetManyParams,
  GetManyResult,
  CreateParams,
  CreateResult,
  UpdateParams,
  UpdateResult,
  DeleteParams,
  DeleteResult,
  HistoryParams,
  BulkChange,
  BulkResult,
  RowFailure,
  ImportParams,
  WriteEvent,
  InvalidationKey,
  ResourceChangeEvent,
  SubscribeParams,
  AggregateMetric,
  AggregateParams,
  AggregateResult,
} from "./types";

// Totals over a list: a provider's own `aggregate`, or worked out from its reads (ADR 0023).
export {
  aggregateProblems,
  resolveAggregate,
  toAggregateValues,
  type ResolveAggregateOptions,
} from "./aggregate";

// Write outcomes — also exported from `@marktiderman/genesis-core/schema`.
export {
  DataWriteError,
  isDataWriteError,
  NO_ROWS_MATCHED,
  type WriteOutcome,
  type DataWriteErrorOptions,
} from "../schema/write-outcome";

// Providers
export { createMockProvider, type MockProviderOptions } from "./mock-provider";
export {
  createSupabaseProvider,
  type SupabaseClient,
  type SupabaseClientInput,
  type SupabaseProviderOptions,
  type SupabaseResourceConfig,
  type SupabaseWriteContext,
  type SupabaseUpdateContext,
  type SupabaseRealtimeChannel,
  type SupabaseRealtimePayload,
} from "./supabase-provider";
export {
  writeOutcomeFromCode,
  toDataWriteError,
  readOutcomeFromCode,
  fieldErrorsFromPostgrest,
  type PostgrestFieldErrors,
} from "./postgrest-errors";
export {
  DataReadError,
  isDataReadError,
  readFailureMessage,
  type ReadOutcome,
  type DataReadErrorOptions,
} from "../schema/read-outcome";

// One-off writes
export {
  callRpc,
  createOrAdopt,
  DEFAULT_RPC_MESSAGES,
  RPC_FAILED,
  type RpcClient,
  type CallRpcOptions,
  type CreateOrAdoptOptions,
  type CreateOrAdoptResult,
} from "./write-helpers";

// React context
export {
  DataProviderRoot,
  useDataProvider,
  useStorage,
  GenesisProvider,
  type DataProviderRootProps,
  type GenesisProviderProps,
} from "./context";
