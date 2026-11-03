/**
 * The phone's device cache (`queryPersistence`): reads kept in SQLite so lists and records open at
 * once. One database, opened on first use; app.ts hands it to `persistOffline`, and the devtools
 * overlay's "Clear cache" empties it.
 */
import * as SQLite from "expo-sqlite";
import { sqliteLocalCache, type LocalCache } from "@marktiderman/genesis-native/offline";

let cache: LocalCache | undefined;

export function offlineCache(): LocalCache {
  cache ??= sqliteLocalCache({ db: SQLite.openDatabaseSync("genesis-offline.db") });
  return cache;
}
