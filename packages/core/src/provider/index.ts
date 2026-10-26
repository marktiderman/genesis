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
} from "./types";

// Write outcomes — also exported from `@marktiderman/genesis-core/schema`.
export {
  DataWriteError,
  isDataWriteError,
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
