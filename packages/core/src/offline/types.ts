// ---------------------------------------------------------------------------
// The device cache's contract (ADR 0010, slice 1: "lists open instantly")
//
// A local cache keeps the reads a person already made, per record and per
// query, so a list or a record opens from the device before the network
// answers and is then refreshed. It can always be rebuilt from the server:
// a wipe loses nothing but speed. Every row in it came from a normal read by
// this person, through the provider and so through RLS.
// ---------------------------------------------------------------------------

/**
 * Whose cache a write belongs to: always a person's. `u:<userId>|<workspace>`,
 * from `cacheScope`. An adapter refuses a scope without the `u:` prefix, so
 * `clear({ user })` reaches every bucket a person has.
 */
export type CacheScope = string;

/** One record as it was read: stored once, whatever lists hold it. */
export interface StoredRow {
  readonly resource: string;
  /** `String(row.id)`. */
  readonly id: string;
  /** The fields read so far. A narrower read merges into it; it never drops a field. */
  readonly row: Readonly<Record<string, unknown>>;
  readonly fetchedAt: number;
}

/**
 * One cached read (a list, an infinite list or a record), its rows replaced by
 * references (`{ $row: id }`) into the row store.
 */
export interface StoredQuery {
  /** The query key as text, the query's identity in the store. */
  readonly key: string;
  readonly queryKey: readonly unknown[];
  readonly resource: string;
  readonly data: unknown;
  readonly fetchedAt: number;
}

/** One change to the store. A `write` applies all of its ops together, or none. */
export type CacheOp =
  | { readonly kind: "row"; readonly row: StoredRow }
  | { readonly kind: "query"; readonly query: StoredQuery }
  | { readonly kind: "forget"; readonly key: string };

/**
 * The device cache. `memoryLocalCache` (tests), `indexedDbLocalCache` (the
 * web) and genesis-native's `sqliteLocalCache` (the phone) implement it; one
 * contract suite tests every adapter.
 *
 * @stability Beta
 */
export interface LocalCache {
  /** Every stored read for `scope`. */
  readQueries(scope: CacheScope): Promise<StoredQuery[]>;
  /** The stored rows of `resource` with these ids; missing ones are left out. */
  readRows(scope: CacheScope, resource: string, ids: readonly string[]): Promise<StoredRow[]>;
  /** Applies `ops` in one transaction. A row op merges into the stored row's fields. */
  write(scope: CacheScope, ops: readonly CacheOp[]): Promise<void>;
  /** Deletes one scope's bucket, every bucket of one person, or everything. */
  clear(target?: { readonly scope: CacheScope } | { readonly user: string }): Promise<void>;
}

/**
 * Loads saved reads into a QueryClient and saves new ones: what
 * `GenesisNativeApp`'s and `GenesisProvider`'s `persist` take.
 *
 * @stability Beta
 */
export interface QueryPersistence {
  /** Load the saved reads for `scope` into the client. */
  restore(scope: string): Promise<void>;
  /** Save settled reads for `scope` as they arrive; returns the unsubscribe. */
  subscribe(scope: string): () => void;
  /** Delete the saved reads (of the last person restored, else everything). */
  clear(): Promise<void>;
}

/** The scope prefix every bucket of `user` starts with. */
export const userPrefix = (user: string) => `u:${user}|`;

/** Refuses a scope that doesn't belong to a person. */
export function assertScope(scope: CacheScope): void {
  if (!/^u:[^|]+\|/.test(scope)) {
    throw new Error(`[genesis offline] "${scope}" isn't a person's cache scope: build it with cacheScope(userId, workspace).`);
  }
}

/**
 * A person's cache scope: their user id plus the workspace they're in
 * (`WorkspaceScope`'s `<kind>:<id>`), `all` for a roll-up, or `none` outside
 * any workspace.
 *
 *   cacheScope(user.id)                    // "u:<id>|none"
 *   cacheScope(user.id, "org:acme")        // "u:<id>|org:acme"
 *
 * @stability Beta
 */
export function cacheScope(userId: string, workspace = "none"): CacheScope {
  if (!userId) throw new Error("[genesis offline] cacheScope needs the signed-in user's id.");
  return `${userPrefix(userId)}${workspace}`;
}
