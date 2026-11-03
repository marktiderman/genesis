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
  /**
   * The row as last read whole (a list or a record read without `select`). A
   * newer read replaces it, so a field the server stops returning is gone; an
   * older one never does.
   */
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
  /** Deletes a stored read; with `before`, only if it was fetched before then (a newer save stays). */
  | { readonly kind: "forget"; readonly key: string; readonly before?: number }
  /** Deletes one stored row (the record came back empty: deleted, or no longer readable). */
  | { readonly kind: "drop"; readonly resource: string; readonly id: string }
  /**
   * Deletes every stored row of `resource` that isn't in `keep` and was fetched before `before`:
   * the rows no kept read refers to, never one saved since the sweep started.
   */
  | { readonly kind: "prune"; readonly resource: string; readonly keep: readonly string[]; readonly before: number };

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
  /**
   * Applies `ops` in order, in one transaction. A row op replaces the stored row unless the
   * stored one was fetched later (an older read never overwrites a newer one).
   */
  write(scope: CacheScope, ops: readonly CacheOp[]): Promise<void>;
  /**
   * Deletes one scope's bucket, every bucket of one person, every bucket except one person's
   * (`except`: a device is one person's), or everything.
   */
  clear(target?: { readonly scope: CacheScope } | { readonly user: string } | { readonly except: string }): Promise<void>;
}

/**
 * Loads saved reads into a QueryClient and saves new ones: what
 * `GenesisNativeApp`'s and `GenesisProvider`'s `persist` take.
 *
 * @stability Beta
 */
export interface QueryPersistence {
  /**
   * Load the saved reads for `scope` into the client. Once `signal` aborts (the
   * person signed out, or the scope changed), nothing more is loaded.
   */
  restore(scope: string, signal?: AbortSignal): Promise<void>;
  /**
   * Saves settled reads for `scope` as they arrive; returns the unsubscribe.
   * `restore("")` (nobody signed in) deletes every saved read on the device.
   */
  subscribe(scope: string, options?: SubscribeOptions): () => void;
  /** Delete the saved reads of every person this persistence restored or saved for (else everything). */
  clear(): Promise<void>;
}

/** Options for `QueryPersistence.subscribe`. */
export interface SubscribeOptions {
  /**
   * The reads already made are this scope's: save what each kept query last fetched (never a
   * value the client set since), and the reads still on their way. Only where the client can
   * hold nothing of anyone else's: `GenesisNativeApp`, which empties it whenever the person
   * changes and starts saving only once the session is known.
   *
   * @internal For `GenesisNativeApp`. Elsewhere, use `refresh`: a client that outlived another
   * person's session would have their reads adopted.
   */
  adopt?: boolean;
  /**
   * Nothing already in the client, or on its way, is trusted to be this scope's (the session was
   * still loading, or the client outlived another person's session): every kept read in flight is
   * called off, and the kept queries are fetched again, so everything saved was read once the
   * scope was known. What `GenesisProvider` does when a scope arrives after `undefined`.
   */
  refresh?: boolean;
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
