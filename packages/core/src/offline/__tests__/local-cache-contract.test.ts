// @feat:data-offline
// One contract suite for every LocalCache adapter. genesis-native runs the same cases against
// sqliteLocalCache (its own test imports `localCacheContract`).
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
