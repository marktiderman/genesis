// Types
export type {
  Identifier,
  BaseRecord,
  DataProvider,
  ListParams,
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
} from "./supabase-provider";
export { writeOutcomeFromCode, toDataWriteError } from "./postgrest-errors";

// React context
export {
  DataProviderRoot,
  useDataProvider,
  useStorage,
  GenesisProvider,
  type DataProviderRootProps,
  type GenesisProviderProps,
} from "./context";
