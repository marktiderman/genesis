/**
 * Platform-agnostic storage adapter interface.
 *
 * Web: backed by localStorage
 * Native: backed by MMKV or AsyncStorage
 * Test/SSR: backed by in-memory map
 *
 * All methods are synchronous — async storage backends (AsyncStorage)
 * should pre-hydrate and provide sync access.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
