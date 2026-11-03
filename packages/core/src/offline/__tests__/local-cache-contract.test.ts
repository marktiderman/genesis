// @feat:data-offline
// One contract suite for the core LocalCache adapters. genesis-native's sqliteLocalCache test
// repeats the cases against real SQLite.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe } from "vitest";
import { indexedDbLocalCache } from "../indexeddb";
import { memoryLocalCache } from "../memory";
import { localCacheContract } from "./contract";

describe("memoryLocalCache", () => localCacheContract(() => memoryLocalCache()));

describe("indexedDbLocalCache", () => {
  let n = 0;
  localCacheContract(() => indexedDbLocalCache({ name: `contract-${n++}`, indexedDB: new IDBFactory(), persist: false }));
});
