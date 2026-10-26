// ---------------------------------------------------------------------------
// Write helpers (README "One-off writes")
//
// The writes a resource page doesn't cover: a database function (RPC) with
// plain error words, and "one live row per key" (create, or adopt the row
// that's already there). Both fail with a DataWriteError, like the provider.
// ---------------------------------------------------------------------------

import { DataWriteError, isDataWriteError } from "../schema/write-outcome";
import { toDataWriteError } from "./postgrest-errors";
import type { BaseRecord, DataProvider, FilterParam } from "./types";

/** Anything with Supabase's `rpc`. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** The words shown for a code when the caller gives none. A guard's own `raise exception` (P0001) keeps its words. */
export const DEFAULT_RPC_MESSAGES: Readonly<Record<string, string>> = {
  "42501": "You can't do that.",
  "22023": "That request isn't valid.",
  "23505": "That already exists.",
  "28000": "Sign in to continue.",
  PGRST202: "That action isn't available.",
  PGRST301: "Sign in to continue.",
};

export const RPC_FAILED = "That didn't work. Try again.";

export interface CallRpcOptions {
  /** Words per error code, e.g. `{ "55000": "This course has already started." }`; these win over the defaults. */
  messages?: Record<string, string>;
}

/**
 * Calls a database function and returns its result. A failure throws a
 * DataWriteError with the usual outcome and code, and words a person can
 * read: yours for the code, a guard's own message (P0001), the defaults
 * above, or a generic sentence. The raw error stays on `cause`.
 */
export async function callRpc<T = unknown>(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown> = {},
  options: CallRpcOptions = {},
): Promise<T> {
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc(fn, args);
  } catch (error) {
    throw new DataWriteError("error", RPC_FAILED, { cause: error });
  }
  if (!result || typeof result !== "object") {
    throw new DataWriteError("error", RPC_FAILED, { cause: new Error(`rpc ${fn} returned ${String(result)}`) });
  }
  if (!result.error) return result.data as T;
  const mapped = toDataWriteError(result.error);
  const code = mapped.code;
  const custom = code !== undefined ? options.messages?.[code] : undefined;
  const raw = (result.error as { message?: unknown }).message;
  const guardWords = typeof raw === "string" && raw.trim() ? raw : undefined;
  const message =
    custom ??
    (code === "P0001" ? guardWords : undefined) ??
    (mapped.fields ? mapped.message : undefined) ??
    (code !== undefined ? DEFAULT_RPC_MESSAGES[code] : undefined) ??
    RPC_FAILED;
  throw new DataWriteError(mapped.outcome, message, { code, fields: mapped.fields, cause: result.error });
}

export interface CreateOrAdoptOptions<T extends BaseRecord> {
  /** The fields that make a row unique (its unique index), read from `data`. */
  key: readonly (keyof T & string)[];
  /**
   * Changes to write over a row that was already there; return null to keep it
   * as it is. It runs on the row as read just now, and the update isn't
   * conditional: two callers merging into one row at once can each overwrite
   * the other. Where that matters, merge in a database function instead.
   */
  merge?: (existing: T) => Partial<T> | null;
}

/**
 * "One live row per key": creates the row, or, when one with the same key is
 * already there (a `duplicate`), adopts it, optionally merging changes in.
 * `adopted` says which. A duplicate you can't see is still an error.
 */
export async function createOrAdopt<T extends BaseRecord>(
  provider: DataProvider,
  resource: string,
  data: Partial<T>,
  options: CreateOrAdoptOptions<T>,
): Promise<{ row: T; adopted: boolean }> {
  if (options.key.length === 0) throw new Error(`[genesis-core] createOrAdopt("${resource}") needs a key`);
  try {
    return { row: (await provider.create<T>(resource, { data })).data, adopted: false };
  } catch (error) {
    if (!isDataWriteError(error) || error.outcome !== "duplicate") throw error;
    // A clash on some other unique index isn't this key's row.
    if (error.fields && Object.keys(error.fields).some((field) => !options.key.includes(field as keyof T & string))) throw error;
    const filters: FilterParam[] = options.key.map((field) => {
      const value = (data as Record<string, unknown>)[field];
      if (value === null || value === undefined) return { field, operator: "is_null" };
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error(`[genesis-core] createOrAdopt("${resource}") key field ${field} must be a string, number or boolean`);
      }
      return { field, operator: "eq", value };
    });
    const { data: rows } = await provider.getList<T>(resource, { filters, pagination: { page: 1, perPage: 2 } });
    if (rows.length !== 1) throw error;
    const existing = rows[0]!;
    const changes = options.merge?.(existing);
    if (!changes || Object.keys(changes).length === 0) return { row: existing, adopted: true };
    return { row: (await provider.update<T>(resource, { id: existing.id, data: changes })).data, adopted: true };
  }
}
