// `@marktiderman/genesis-core/offline`: lists and records open instantly from
// the device (ADR 0010, slice 1). The contract and the web adapter are here;
// genesis-native ships the phone's (`sqliteLocalCache`).
export {
  cacheScope,
  type CacheOp,
  type CacheScope,
  type LocalCache,
  type QueryPersistence,
  type StoredQuery,
  type StoredRow,
} from "./types";
export { memoryLocalCache } from "./memory";
export { indexedDbLocalCache, type IndexedDbLocalCacheOptions } from "./indexeddb";
export { persistOffline, type PersistOfflineOptions } from "./persist";
